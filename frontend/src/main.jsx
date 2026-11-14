import React,{useState,useEffect,useRef} from 'react';import{createRoot}from'react-dom/client';import './style.css';
import { fetchJson, observationDate } from './sky-api.js';
function App(){const [ra,Sra]=useState('83.6331'),[dec,Sdec]=useState('22.0145'),[obs,Sobs]=useState([]),[selected,Sselected]=useState(null),[image,Simage]=useState(''),[objects,Sobjects]=useState([]),[saved,Ssaved]=useState([]),[tab,Stab]=useState('Sky Explorer'),[status,Sstatus]=useState('Ready'),[collection,Scollection]=useState('spherex_dr1');const [name, setName] = useState('');
const [region, setRegion] = useState(null);
const [busy, setBusy] = useState(false);
const viewer = useRef(null);
useEffect(()=>{let alive=true;import('aladin-lite').then(({default:A})=>{if(!alive||viewer.current)return;A.init.then(()=>{if(!alive||viewer.current)return;viewer.current=A.aladin('#aladin',{survey:'P/DSS2/color',fov:2,target:'83.6331 22.0145',showReticle:true});})}).catch(e=>Sstatus('Aladin load error: '+e.message));return()=>{alive=false}},[]);
function useViewCenter() {
  const center = viewer.current?.getRaDec();
  if (!center) return;
  setName('');
  Sra(center[0].toFixed(6));
  Sdec(center[1].toFixed(6));
}

async function search(byName = false, coordinates = { ra, dec }) {
  setBusy(true);
  Sstatus(byName ? 'Resolving name with SIMBAD…' : 'Searching NASA/IPAC IRSA…');
  Sobs([]);
  Sselected(null);
  Simage('');
  setRegion(null);
  try {
    let target = coordinates;
    if (byName) {
      target = await fetchJson('/api/resolve?' + new URLSearchParams({ name }));
      Sra(String(target.ra));
      Sdec(String(target.dec));
    }
    const data = await fetchJson('/api/observations?' + new URLSearchParams({
      ra: target.ra, dec: target.dec, collection,
    }));
    setRegion({ ...target, collection });
    Sobs(data.observations);
    Sstatus(data.count
      ? `${data.count}${data.possibly_truncated ? '+' : ''} image products found`
      : 'No observations found for this region and release.');
    viewer.current?.gotoRaDec(Number(target.ra), Number(target.dec));
  } catch (error) {
    Sstatus(error.message);
  } finally {
    setBusy(false);
  }
}

async function show(observation) {
  if (!region || !observation.access_url) return;
  setBusy(true);
  Sselected(observation);
  Simage('');
  Sstatus('Downloading SPHEREx FITS cutout…');
  try {
    const data = await fetchJson('/api/cutout?' + new URLSearchParams({
      url: observation.access_url, ra: region.ra, dec: region.dec,
    }));
    Simage(data.image);
    Sstatus('SPHEREx infrared cutout loaded');
  } catch (error) {
    Sstatus(error.message);
  } finally {
    setBusy(false);
  }
}
async function lookup(){Sstatus('Querying SIMBAD...');try{const d=await fetchJson(`/api/objects?ra=${ra}&dec=${dec}`);Sobjects(d.objects);Sstatus(`${d.objects.length} catalog objects returned`)}catch(e){Sstatus(e.message)}}
async function save(){try{await fetchJson('/api/bookmarks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({label:`Region ${ra}, ${dec}`,ra:Number(ra),dec:Number(dec)})});await loadSaved();Sstatus('Region saved')}catch(e){Sstatus(e.message)}}
async function loadSaved(){try{Ssaved((await fetchJson('/api/bookmarks')).items)}catch{}}
useEffect(()=>{loadSaved()},[]);
const tabs=['Sky Explorer','Time Comparison','Spectral Explorer','Object Explorer','Candidate Finder','Timeline','Learn','Saved'];return <div className="app"><aside><div className="brand">✦ SPHEREx <small>EXPLORER</small></div><p className="tag">PLANET X · DISCOVERY LAB</p><nav>{tabs.map(t=><button className={tab===t?'active':''} key={t} onClick={()=>Stab(t)}>{t}</button>)}</nav><div className="foot">NASA/IPAC IRSA · Data provenance retained</div></aside><main><header><div><div className="eyebrow">MISSION CONTROL / INTERACTIVE SCIENCE</div><h1>{tab}</h1></div><span className="pill" role="status">● {status}</span></header><section className="controls">
<label>Object name<input value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Barnard's Star" /></label>
<button disabled={busy || !name.trim()} onClick={() => search(true)}>Find object</button>
<button disabled={busy} onClick={() => {
  const target = { ra: '133.795129', dec: '-7.245147' };
  setName('WISE 0855');
  Sra(target.ra);
  Sdec(target.dec);
  search(false, target);
}}>Explore WISE 0855</button>
<label>Right Ascension (°)<input value={ra} onChange={e=>Sra(e.target.value)}/></label><label>Declination (°)<input value={dec} onChange={e=>Sdec(e.target.value)}/></label><label>SPHEREx collection<select value={collection} onChange={e=>Scollection(e.target.value)}><option>spherex_dr1</option><option>spherex_qr3</option><option>spherex_dr1_deep</option><option>spherex_qr3_deep</option></select></label><button className="primary" disabled={busy || !ra.trim() || !dec.trim()} onClick={() => search()}>Search coordinates</button><button onClick={save}>☆ Save region</button></section><div className="layout"><section className="panel viewer"><div className="paneltitle">Celestial sky navigator <span>Aladin Lite · optical context (not SPHEREx)</span></div><div id="aladin" style={{height:420}}></div><button className="hint" onClick={useViewCenter}>Use map center</button></section><section className="panel right"><div className="paneltitle">Observations <span>{obs.length} listed</span></div><div className="scroll">{region && <p className="hint">RA {region.ra}° · Dec {region.dec}°</p>}{obs.length?obs.map((o,i)=><button key={o.product_id ?? i} disabled={busy || !o.access_url} className={'item '+(selected===o?'chosen':'')} onClick={()=>show(o)}><b>{o.obs_id||`Observation ${i+1}`}</b><small>{observationDate(o)} · {o.energy_bandpassname || 'Band unavailable'}</small></button>):<div className="empty">Search a region to retrieve real SPHEREx records.</div>}</div></section></div><div className="layout lower"><section className="panel"><div className="paneltitle">Scientific image / investigation</div>{image?<figure><img className="science" src={image} alt="SPHEREx infrared surface brightness cutout"/><figcaption className="hint">{selected.obs_id} · {observationDate(selected)} · {region.collection} · <a href={selected.access_url}>Source FITS</a></figcaption></figure>:<div className="placeholder">Select an observation to load a calibrated FITS image cutout</div>}{tab==='Time Comparison'&&<p className="hint">Temporal comparison requires two aligned, matched-band observations. This initial version displays a single cutout; difference detection is not yet implemented.</p>}{tab==='Spectral Explorer'&&<p className="hint">Wavelength varies across SPHEREx detectors. Spectral plots require calibrated channel or cube extraction; not yet implemented.</p>}{tab==='Candidate Finder'&&<p className="hint">Candidate detection is not yet implemented. No new-planet claims can be made from image differences alone.</p>}{tab==='Learn'&&<p>SPHEREx maps the infrared sky across 102 spectral channels. RA and Dec locate objects on the celestial sphere.</p>}{tab==='Timeline'&&<div>{obs.map((o,i)=><p key={i}>Observation {i+1}: {observationDate(o)}</p>)}</div>}{tab==='Saved'&&saved.map(s=><button className="item" key={s.id} onClick={()=>{Sra(String(s.ra));Sdec(String(s.dec));Stab('Sky Explorer')}}>{s.label}</button>)}</section><section className="panel"><div className="paneltitle">Astronomical objects <button onClick={lookup}>Query SIMBAD</button></div><div className="scroll">{objects.map((o,i)=><div className="object" key={i}><b>{o.main_id}</b><small>{o.ra} · {o.dec}</small></div>)}{!objects.length&&<div className="empty">Catalog identification is separate from SPHEREx image data.</div>}</div></section></div><footer>SPHEREx observations: NASA/IPAC IRSA · Optical navigation: CDS Aladin · Catalogs: SIMBAD</footer></main></div>};createRoot(document.getElementById('root')).render(<App/>);
