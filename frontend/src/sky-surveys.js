// Full-sky DSS2 HiPS mirrors. Use their URLs directly instead of resolving a CDS survey ID.
const surveys = [
  'https://cdn.skies.esac.esa.int/DSSColor',
  'https://casda.csiro.au/hips/DSS2/color',
];

export async function findOpticalSurvey(signal) {
  for (const url of surveys) {
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
