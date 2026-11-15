"""Read SPHEREx cutouts and calculate display and investigation products."""

import base64
import io

import numpy as np
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.stats import sigma_clipped_stats
from astropy.wcs import WCS
from PIL import Image


def read_image(content, ra=None, dec=None):
    with fits.open(io.BytesIO(content), memmap=False) as hdus:
        image = hdus['IMAGE']
        data = np.array(image.data, dtype=float)
        if data.ndim != 2:
            raise ValueError('Select an individual 2D spectral image.')
        flags = np.asarray(hdus['FLAGS'].data) if 'FLAGS' in hdus else None
        if flags is not None:
            # SOURCE marks known sources and is not itself a quality defect.
            data[(flags & ~(1 << 21)) != 0] = np.nan
        wcs = WCS(image.header, fobj=hdus).celestial
        spectral = None
        if ra is not None and 'WCS-WAVE' in hdus:
            x, y = wcs.world_to_pixel(SkyCoord(ra, dec, unit='deg'))
            if np.isfinite([x, y]).all() and 0 <= x < data.shape[1] - .5 and 0 <= y < data.shape[0] - .5:
                header = image.header.copy()
                for key in ('A_ORDER', 'B_ORDER', 'AP_ORDER', 'BP_ORDER'):
                    header.remove(key, ignore_missing=True)
                wavelength, bandwidth = WCS(header, fobj=hdus, key='W').pixel_to_world_values(x, y)
                brightness = data[round(float(y)), round(float(x))]
                if np.isfinite([wavelength, bandwidth]).all() and bandwidth > 0:
                    spectral = {'wavelength_um': float(wavelength), 'bandwidth_um': float(bandwidth),
                                'brightness_mjysr': float(brightness) if np.isfinite(brightness) else None}
        return data, wcs, spectral


def display_limits(data):
    finite = data[np.isfinite(data)]
    if not finite.size:
        raise ValueError('No usable pixels in this cutout.')
    low, high = np.percentile(finite, [2, 99.5])
    return float(low), float(high)


def png(data, low, high):
    scaled = np.clip((data - low) / max(high - low, 1e-9), 0, 1)
    scaled[~np.isfinite(scaled)] = 0
    buffer = io.BytesIO()
    Image.fromarray((scaled * 255).astype('uint8')).save(buffer, format='PNG')
    return 'data:image/png;base64,' + base64.b64encode(buffer.getvalue()).decode()


def detect_sources(data, wcs):
    from photutils.detection import find_peaks

    mask = ~np.isfinite(data)
    _, median, std = sigma_clipped_stats(data, mask=mask)
    if not np.isfinite(std) or std <= 0:
        return []
    peaks = find_peaks(data, median + 5 * std, box_size=5, mask=mask, n_peaks=30)
    if peaks is None:
        return []
    sources = []
    for index, peak in enumerate(peaks):
        x, y = int(peak['x_peak']), int(peak['y_peak'])
        coord = wcs.pixel_to_world(x, y).icrs
        sources.append({'id': index + 1, 'x': x, 'y': y,
                        'ra': float(coord.ra.deg), 'dec': float(coord.dec.deg),
                        'brightness': float(peak['peak_value'])})
    return sources


def compare(first, second):
    from reproject import reproject_interp

    a, wcs_a, band_a = first
    b, wcs_b, band_b = second
    aligned, footprint = reproject_interp((b, wcs_b), wcs_a, shape_out=a.shape)
    valid = np.isfinite(a) & np.isfinite(aligned) & (footprint > 0)
    a, b = np.where(valid, a, np.nan), np.where(valid, aligned, np.nan)
    low, high = display_limits(np.stack([a, b]))
    return {'first': png(a, low, high), 'second': png(b, low, high),
            'overlap_pixels': int(valid.sum()), 'bands': [band_a, band_b]}
