from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from astropy.io import fits
from astropy.wcs import WCS
from astroquery.simbad import Simbad
import requests, io, numpy as np, base64, sqlite3, os
from PIL import Image

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

@app.get('/api/observations')
def observations(ra:float,dec:float,radius:float=0.01,collection:str='spherex_dr1'):
 if not (0<=ra<360 and -90<=dec<=90 and 0<radius<=0.2): raise HTTPException(400,'Invalid coordinates or radius')
 if collection not in ('spherex_dr1','spherex_qr3','spherex_dr1_deep','spherex_qr3_deep','spherex_dr1_cube'): raise HTTPException(400,'Invalid collection')
 try:
  from astropy.io.votable import parse_single_table
  resp=requests.get('https://irsa.ipac.caltech.edu/SIA',params={'COLLECTION':collection,'POS':f'CIRCLE {ra} {dec} {radius}','RESPONSEFORMAT':'VOTABLE'},timeout=40)
  resp.raise_for_status()
  rows=parse_single_table(io.BytesIO(resp.content)).to_table()
  out=[]
  for row in rows[:35]:
   d={}
   for key in ('obs_id','t_min','t_max','em_min','em_max','access_url','s_fov','instrument_name'):
    if key in rows.colnames:
     val=row[key]
     d[key]=None if np.ma.is_masked(val) else str(val)
   out.append(d)
  return {'collection':collection,'count':len(rows),'observations':out}
 except Exception as e: raise HTTPException(502,f'IRSA archive query failed: {e}')

@app.get('/api/cutout')
def cutout(url:str,ra:float,dec:float,size:float=0.05):
 if not url.startswith('https://irsa.ipac.caltech.edu/ibe/data/spherex/') or not 0<size<=0.2: raise HTTPException(400,'Invalid IRSA cutout request')
 try:
  resp=requests.get(url,params={'center':f'{ra},{dec}','size':size},timeout=75)
  resp.raise_for_status()
  with fits.open(io.BytesIO(resp.content),memmap=False) as hdul:
   hdu=next((h for h in hdul if h.name=='IMAGE' and h.data is not None),None)
   if hdu is None: raise ValueError('IMAGE extension missing')
   a=np.asarray(hdu.data,dtype=float)
   while a.ndim>2:a=a[0]
   finite=np.isfinite(a)
   if not finite.any():raise ValueError('No finite image pixels')
   lo,hi=np.nanpercentile(a[finite],[2,99.5]); scaled=np.clip((a-lo)/max(hi-lo,1e-9),0,1)
   scaled[~finite]=0
   im=Image.fromarray(np.uint8(scaled*255),'L')
   buf=io.BytesIO();im.save(buf,format='PNG')
   return {'image':'data:image/png;base64,'+base64.b64encode(buf.getvalue()).decode(),'shape':list(a.shape),'min':float(lo),'max':float(hi),'note':'Display stretch only; not photometrically calibrated for subtraction'}
 except Exception as e:raise HTTPException(502,f'Cutout processing failed: {e}')

@app.get('/api/objects')
def objects(ra:float,dec:float,radius_arcmin:float=2):
 try:
  from astropy.coordinates import SkyCoord
  import astropy.units as u
  table=Simbad.query_region(SkyCoord(ra,dec,unit='deg'),radius=min(radius_arcmin,10)*u.arcmin)
  if table is None:return {'objects':[]}
  out=[]
  for row in table[:30]:
   out.append({k:str(row[k]) for k in ('main_id','ra','dec') if k in table.colnames})
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
