// Direct HiPS URLs avoid the CDS identifier lookup.
const surveys = {
  dss2: [
    'https://cdn.skies.esac.esa.int/DSSColor',
    'https://casda.csiro.au/hips/DSS2/color',
  ],
  '2mass': ['https://cdn.skies.esac.esa.int/2MASSColor'],
};

export async function findSurvey(name, signal) {
  for (const url of surveys[name]) {
    try {
      const probe = { signal: AbortSignal.any([signal, AbortSignal.timeout(4500)]) };
      const [manifest, image] = await Promise.all([
        fetch(url + '/properties', probe),
        fetch(url + '/Norder3/Allsky.jpg', probe),
      ]);
      if (manifest.ok && image.ok && image.headers.get('content-type')?.startsWith('image/')) {
        const [properties, imageBytes] = await Promise.all([manifest.text(), image.arrayBuffer()]);
        if (properties.includes('hips_order') && imageBytes.byteLength > 0) return url;
      }
    } catch {
      if (signal.aborted) break;
    }
  }
  return null;
}
