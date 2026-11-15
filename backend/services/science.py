"""Read SPHEREx cutouts and calculate display and investigation products."""

import base64
import io

import numpy as np
from astropy.coordinates import SkyCoord
from astropy.io import fits
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
    finite = np.isfinite(data)
    background = data[finite]
    if not background.size:
        return []
    for _ in range(5):
        median, std = np.median(background), np.std(background)
        if std <= 0:
            return []
        clipped = background[np.abs(background - median) <= 3 * std]
        if not clipped.size or clipped.size == background.size:
            break
        background = clipped

    median, std = np.median(background), np.std(background)
    if std <= 0:
        return []
    values = np.where(finite, data, -np.inf)
    padded = np.pad(values, 2, constant_values=-np.inf)
    windows = np.lib.stride_tricks.sliding_window_view(padded, (5, 5))
    peaks = finite & (data > median + 5 * std) & (values == windows.max(axis=(-2, -1)))
    ys, xs = np.nonzero(peaks)
    strongest = np.argsort(-data[ys, xs], kind='stable')[:30]
    if not strongest.size:
        return []
    y, x = ys[strongest], xs[strongest]
    coords = wcs.pixel_to_world(x, y).icrs
    return [
        {'id': index + 1, 'x': int(px), 'y': int(py),
         'ra': float(ra), 'dec': float(dec), 'brightness': float(data[py, px])}
        for index, (px, py, ra, dec) in enumerate(zip(x, y, coords.ra.deg, coords.dec.deg))
    ]


def compare(first, second):
    a, wcs_a, band_a = first
    b, wcs_b, band_b = second
    y, x = np.indices(a.shape)
    bx, by = wcs_b.world_to_pixel(wcs_a.pixel_to_world(x, y))
    height, width = b.shape
    inside = (np.isfinite(bx) & np.isfinite(by)
              & (bx >= 0) & (bx <= width - 1)
              & (by >= 0) & (by <= height - 1))
    bx, by = np.where(inside, bx, 0), np.where(inside, by, 0)
    left, top = bx.astype(int), by.astype(int)
    right, bottom = np.minimum(left + 1, width - 1), np.minimum(top + 1, height - 1)
    dx, dy = bx - left, by - top

    # Use only pixels whose contributing neighbors are all usable.
    aligned = np.zeros(a.shape)
    for values, weight in (
        (b[top, left], (1 - dx) * (1 - dy)), (b[top, right], dx * (1 - dy)),
        (b[bottom, left], (1 - dx) * dy), (b[bottom, right], dx * dy),
    ):
        inside &= (weight == 0) | np.isfinite(values)
        aligned += np.where(weight == 0, 0, values) * weight

    valid = np.isfinite(a) & inside
    a, b = np.where(valid, a, np.nan), np.where(valid, aligned, np.nan)
    low, high = display_limits(np.stack([a, b]))
    return {'first': png(a, low, high), 'second': png(b, low, high),
            'overlap_pixels': int(valid.sum()), 'bands': [band_a, band_b]}
