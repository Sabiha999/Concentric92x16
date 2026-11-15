"""Resolve object names through the CDS Sesame mirrors."""

from urllib.parse import quote
from xml.etree import ElementTree

import requests

MIRRORS = (
    'https://vizier.idia.ac.za/viz-bin/nph-sesame/-oxp/SNV',
    'https://vizier.cfa.harvard.edu/viz-bin/nph-sesame/-oxp/SNV',
)


def resolve(name):
    for mirror in MIRRORS:
        try:
            response = requests.get(f'{mirror}?{quote(name, safe="")}', timeout=(4, 8))
            response.raise_for_status()
            target = ElementTree.fromstring(response.content).find('Target')
            if target is None:
                raise ValueError('Unexpected Sesame response')
            for entry in target.findall('Resolver'):
                ra, dec = entry.findtext('jradeg'), entry.findtext('jdedeg')
                if ra is not None and dec is not None:
                    return {'name': entry.findtext('oname') or name,
                            'ra': float(ra), 'dec': float(dec)}
            return None
        except (requests.RequestException, ElementTree.ParseError, ValueError):
            continue
    raise RuntimeError('Object name lookup is unavailable. Enter RA and Dec to search by coordinates.')
