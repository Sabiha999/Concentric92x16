"""Gaia DR3 cone searches through CDS VizieR."""

import csv
import math

import requests

CATALOG = 'I/355/gaiadr3'
VIZIER = 'https://vizier.cfa.harvard.edu/viz-bin/asu-tsv'
LIMIT = 100


def parse_sources(text):
    lines = text.splitlines()
    header = 'Source\tRA_ICRS\tDE_ICRS\tGmag'
    if header not in lines:
        if '#INFO' in text and 'no data found' in text.lower():
            return []
        raise ValueError('Unexpected VizieR response.')
    rows = csv.reader(lines[lines.index(header) + 3:], delimiter='\t')
    sources = []
    for row in rows:
        if not row or row[0].startswith('#'):
            continue
        source_id, ra, dec, magnitude = map(str.strip, row)
        if not source_id.isdecimal():
            raise ValueError('Invalid Gaia source ID returned by VizieR.')
        sources.append({
            'source_id': source_id,
            'ra': float(ra), 'dec': float(dec),
            'g_mag': float(magnitude) if magnitude else None,
        })
    return sources


def search(ra, dec, radius):
    response = requests.get(VIZIER, params={
        '-source': CATALOG,
        '-c': f'{ra:.9f} {dec:+.9f}',
        '-c.rd': f'{radius:.9f}',
        '-out.max': LIMIT + 1,
        '-out': 'Source,RA_ICRS,DE_ICRS,Gmag',
        '-sort': 'Gmag',
    }, timeout=(4, 9))
    response.raise_for_status()
    return parse_sources(response.text)


def within_cone(sources, ra, dec, radius):
    ra, dec, radius = map(math.radians, (ra, dec, radius))
    limit = math.sin(radius / 2) ** 2
    result = []
    for source in sources:
        x, y = math.radians(source['ra']), math.radians(source['dec'])
        distance = math.sin((y - dec) / 2) ** 2 + math.cos(y) * math.cos(dec) * math.sin((x - ra) / 2) ** 2
        if distance <= limit:
            result.append(source)
    return result
