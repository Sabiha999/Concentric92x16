from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from astropy.time import Time
from urllib.parse import urlsplit
from time import sleep
from functools import lru_cache
from astroquery.simbad import Simbad
import requests, io, numpy as np, sqlite3, os
from pathlib import Path
import json
from services import science

app=FastAPI(title='SPHEREx Explorer')
app.add_middleware(CORSMiddleware,allow_origins=['http://localhost:5173', 'http://127.0.0.1:5173', os.getenv('FRONTEND_ORIGIN', 'http://localhost:5173')],allow_methods=['*'],allow_headers=['*'])
DB=os.path.join(os.path.dirname(__file__),'discoveries.db')
with sqlite3.connect(DB) as db:
 db.execute('CREATE TABLE IF NOT EXISTS bookmarks (id INTEGER PRIMARY KEY, label TEXT, ra REAL, dec REAL)')

class Bookmark(BaseModel):
 label:str
 ra:float
 dec:float

@app.get('/api/health')
def health(): return {'status':'ok'}

DEMO_DIR = Path(__file__).parent / 'demo_data'
DEMO_RA, DEMO_DEC = 133.795129, -7.245147


def demo_records():
 return json.loads((DEMO_DIR / 'observations.json').read_text(encoding='utf-8'))


@app.get('/api/demo')
def demo():
 rows = demo_records()
 return {'ra': DEMO_RA, 'dec': DEMO_DEC, 'collection': 'spherex_dr1',
         'count': len(rows), 'observations': rows, 'cached': True}


def irsa_get(url, params):
 for attempt in range(3):
  try:
   resp = requests.get(url, params=params, timeout=(10, 30), allow_redirects=False)
   if resp.status_code not in (502, 503, 504) or attempt == 2:
    break
  except (requests.ConnectionError, requests.Timeout, requests.exceptions.ChunkedEncodingError):
   if attempt == 2:
    raise
  sleep(2 ** attempt)
 return resp


@app.get('/api/observations')
def observations(ra:float,dec:float,radius:float=0.01,collection:str='spherex_dr1'):
 if not (0<=ra<360 and -90<=dec<=90 and 0<radius<=0.2): raise HTTPException(400,'Invalid coordinates or radius')
 if collection not in ('spherex_dr1','spherex_qr3','spherex_dr1_deep','spherex_qr3_deep','spherex_dr1_cube'): raise HTTPException(400,'Invalid collection')
 try:
  from astropy.io.votable import parse_single_table
  resp=irsa_get('https://irsa.ipac.caltech.edu/SIA', {'COLLECTION':collection,'POS':f'CIRCLE {ra} {dec} {radius}','RESPONSEFORMAT':'VOTABLE','MAXREC':25})
  if not resp.ok or resp.is_redirect:
   raise ValueError(f'IRSA returned HTTP {resp.status_code}')
  rows=parse_single_table(io.BytesIO(resp.content)).to_table(use_names_over_ids=True)
  out=[]
  for row in rows:
   d={}
   for key in ('obs_id','t_min','t_max','em_min','em_max','access_url','s_fov','instrument_name','energy_bandpassname','obs_collection','obs_publisher_did'):
    if key in rows.colnames:
     val=row[key]
     d[key]=None if np.ma.is_masked(val) else str(val)
   d['product_id'] = d.get('obs_publisher_did') or d.get('access_url')
   d['date_utc'] = Time(float(d['t_min']), format='mjd', scale='utc').isot if d.get('t_min') else None
   out.append(d)
  out.sort(key=lambda observation: observation['date_utc'] or '9999')
  return {'collection':collection,'count':len(rows),'observations':out,'possibly_truncated':len(rows) >= 25}
 except Exception as e: raise HTTPException(502,f'IRSA archive query failed: {e}')

@lru_cache(maxsize=12)
def cutout_bytes(url: str, ra: float, dec: float, size: float):
 parts = urlsplit(url)
 if (parts.scheme != 'https' or parts.netloc != 'irsa.ipac.caltech.edu'
     or not parts.path.startswith('/ibe/data/spherex/') or not parts.path.endswith('.fits')
     or parts.query or parts.fragment or '%' in parts.path or '..' in parts.path
     or not (0 <= ra < 360 and -90 <= dec <= 90 and 0 < size <= 0.2)):
  raise HTTPException(400, 'Invalid IRSA cutout request')
 if abs(ra - DEMO_RA) < 1e-7 and abs(dec - DEMO_DEC) < 1e-7 and size == 0.05:
  for record in demo_records():
   if url == record['access_url']:
    return (DEMO_DIR / record['file']).read_bytes()
 try:
  params = {'center': f'{ra},{dec}', 'size': size}
  resp = irsa_get(url, params)
  if resp.is_redirect:
   raise ValueError('Unexpected archive redirect')
  resp.raise_for_status()
  return resp.content
 except (requests.RequestException, OSError, ValueError) as error:
  raise HTTPException(502, f'Unable to load IRSA cutout: {error}') from error


def load_cutout(url, ra, dec, size, sample_ra=None, sample_dec=None):
 return science.read_image(cutout_bytes(url, ra, dec, size),
                           ra if sample_ra is None else sample_ra,
                           dec if sample_dec is None else sample_dec)


@app.get('/api/spectrum-point')
def spectrum_point(url: str, ra: float, dec: float, sample_ra: float,
                   sample_dec: float, size: float = 0.05):
 try:
  _, _, sample = load_cutout(url, ra, dec, size, sample_ra, sample_dec)
  return {'sample': sample}
 except ValueError as error:
  raise HTTPException(422, str(error)) from error


@app.get('/api/cutout')
def cutout(url: str, ra: float, dec: float, size: float = 0.05):
 try:
  data, _, spectral = load_cutout(url, ra, dec, size)
  low, high = science.display_limits(data)
  return {'image': science.png(data, low, high), 'shape': list(data.shape),
          'min': low, 'max': high, 'spectral': spectral, 'note': 'Display stretch only'}
 except ValueError as error:
  raise HTTPException(422, str(error)) from error


@app.get('/api/sources')
def sources(url: str, ra: float, dec: float, size: float = 0.05):
 data, wcs, _ = load_cutout(url, ra, dec, size)
 return {'sources': science.detect_sources(data, wcs)}


@app.get('/api/compare')
def compare(first: str, second: str, ra: float, dec: float, size: float = 0.05):
 if first == second:
  raise HTTPException(400, 'Select two distinct observations.')
 try:
  return science.compare(load_cutout(first, ra, dec, size),
                         load_cutout(second, ra, dec, size))
 except ValueError as error:
  raise HTTPException(422, str(error)) from error


@app.get('/api/resolve')
def resolve_object(name: str):
 name = name.strip()
 if not 1 <= len(name) <= 100:
  raise HTTPException(400, 'Enter an object name between 1 and 100 characters.')
 try:
  catalog = Simbad()
  catalog.TIMEOUT = 12
  result = catalog.query_object(name.replace('’', chr(39)))
 except Exception as error:
  raise HTTPException(502, 'SIMBAD is unavailable. Try searching by coordinates.') from error
 if result is None or len(result) == 0:
  raise HTTPException(404, 'SIMBAD could not find this object.')
 row = result[0]
 return {'name': str(row['main_id']), 'ra': float(row['ra']), 'dec': float(row['dec'])}

@app.get('/api/objects')
def objects(ra:float,dec:float,radius_arcmin:float=2):
 try:
  from astropy.coordinates import SkyCoord
  import astropy.units as u
  target = SkyCoord(ra, dec, unit='deg')
  catalog = Simbad()
  catalog.TIMEOUT = 12
  catalog.add_votable_fields('otype')
  table = catalog.query_region(target, radius=min(radius_arcmin, 10)*u.arcmin)
  if table is None:return {'objects':[]}
  out=[]
  for row in table:
   if np.ma.is_masked(row['ra']) or np.ma.is_masked(row['dec']):
    continue
   distance = target.separation(SkyCoord(row['ra'], row['dec'], unit='deg')).arcsec
   out.append({'main_id': str(row['main_id']), 'ra': float(row['ra']),
               'dec': float(row['dec']), 'otype': str(row['otype']),
               'separation_arcsec': float(distance)})
  out.sort(key=lambda item: item['separation_arcsec'])
  out = out[:30]
  return {'objects':out,'source':'SIMBAD'}
 except Exception as e:raise HTTPException(502,f'SIMBAD lookup failed: {e}')

@app.get('/api/bookmarks')
def bookmarks():
 with sqlite3.connect(DB) as db:
  return {'items':[dict(id=r[0],label=r[1],ra=r[2],dec=r[3]) for r in db.execute('SELECT * FROM bookmarks ORDER BY id DESC')]}
@app.post('/api/bookmarks')
def add_bookmark(item:Bookmark):
 with sqlite3.connect(DB) as db:
  db.execute('INSERT INTO bookmarks(label,ra,dec) VALUES(?,?,?)',(item.label,item.ra,item.dec))
 return {'saved':True}
