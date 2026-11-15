import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { fetchJson, observationDate } from './sky-api.js';
import { Comparison, SourceImage, SpectralSamples } from './Investigation.jsx';
import { findSurvey } from './sky-surveys.js';
import GaiaCatalog from './GaiaCatalog.jsx';
import TermHelp, { FieldLabel } from './TermHelp.jsx';
import './style.css';

const tabs = ['Sky Explorer', 'Candidate Finder', 'Object Explorer', 'Timeline', 'Time Comparison', 'Spectral Explorer', 'Saved', 'Learn'];
const releases = ['spherex_dr1', 'spherex_qr3', 'spherex_dr1_deep', 'spherex_qr3_deep'];
const surveyNames = { dss2: 'DSS2 optical', '2mass': '2MASS near-infrared' };
const wise = { ra: '133.795129', dec: '-7.245147' };
const query = (path, params) => fetchJson(path + '?' + new URLSearchParams(params));

function App() {
  const [ra, setRa] = useState('83.6331');
  const [dec, setDec] = useState('22.0145');
  const [radius, setRadius] = useState('0.01');
  const [name, setName] = useState('');
  const [collection, setCollection] = useState('spherex_dr1');
  const [tab, setTab] = useState('Sky Explorer');
  const [status, setStatus] = useState('Ready');
  const [mapStatus, setMapStatus] = useState('loading');
  const [coordinateMode, setCoordinateMode] = useState(false);
  const [surveyChoice, setSurveyChoice] = useState('dss2');
  const [activeSurvey, setActiveSurvey] = useState(null);
  const [surveyStatus, setSurveyStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [listing, setListing] = useState(null);
  const [preview, setPreview] = useState(null);
  const [sources, setSources] = useState([]);
  const [active, setActive] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [saved, setSaved] = useState([]);
  const viewer = useRef(null);
  const aladinLibrary = useRef(null);
  const mapContainer = useRef(null);
  const position = useRef({ ra: 83.6331, dec: 22.0145 });

  useEffect(() => {
    const controller = new AbortController();
    async function init() {
      const label = surveyNames[surveyChoice];
      setSurveyStatus(`Checking ${label} imagery…`);
      try {
        const survey = await findSurvey(surveyChoice, controller.signal);
        if (controller.signal.aborted) return;
        if (!survey) throw new Error('Survey is unavailable');
        if (viewer.current) {
          const layer = viewer.current.setBaseImageLayer(survey);
          await layer?.query;
        } else {
          const { default: A } = await import('aladin-lite');
          await A.init;
          if (controller.signal.aborted) return;
          const { ra, dec } = position.current;
          mapContainer.current.hidden = false;
          viewer.current = A.aladin(mapContainer.current, {
            survey, fov: 2, target: `${ra} ${dec}`, showReticle: true,
          });
          aladinLibrary.current = A;
        }
        if (controller.signal.aborted) return;
        setActiveSurvey(surveyChoice);
        setMapStatus('ready');
        setSurveyStatus('');
      } catch {
        if (controller.signal.aborted) return;
        if (!viewer.current) setMapStatus('offline');
        setSurveyStatus(`${label} could not be loaded. You can switch surveys or use coordinates.`);
      }
    }
    init();
    return () => controller.abort();
  }, [surveyChoice]);

  function moveTo(target) {
    position.current = { ra: Number(target.ra), dec: Number(target.dec) };
    setRa(String(target.ra));
    setDec(String(target.dec));
    viewer.current?.gotoRaDec(position.current.ra, position.current.dec);
  }

  function nudge(deltaRa, deltaDec) {
    const nextRa = Number(ra), nextDec = Number(dec);
    if (!ra.trim() || !dec.trim() || !Number.isFinite(nextRa) || !Number.isFinite(nextDec)) return;
    moveTo({
      ra: (((nextRa + deltaRa) % 360 + 360) % 360).toFixed(6),
      dec: Math.min(90, Math.max(-90, nextDec + deltaDec)).toFixed(6),
    });
  }

  async function run(task) {
    setBusy(true);
    try { await task(); }
    catch (error) { setStatus(error.message); }
    finally { setBusy(false); }
  }

  function clearImage() {
    setPreview(null);
    setSources([]);
    setActive(null);
    setCatalog(null);
  }

  function resolve() {
    return run(async () => {
      setStatus('Resolving object with CDS Sesame…');
      const object = await query('/api/resolve', { name });
      moveTo(object);
      setStatus(`${object.name} located${object.cached ? ' from saved catalog coordinates' : ''}. Choose a radius and search coordinates.`);
    });
  }

  function search(position = { ra, dec }, release = collection, preset = false) {
    return run(async () => {
      setListing(null);
      clearImage();
      setStatus(preset ? 'Opening saved WISE 0855 observations…' : 'Searching NASA/IPAC IRSA…');
      const data = preset
        ? await fetchJson('/api/demo')
        : await query('/api/observations', { ...position, radius, collection: release });
      setListing({ ...data, ...position, collection: release });
      moveTo(position);
      setStatus(data.count
        ? `${data.count}${data.possibly_truncated ? '+' : ''} ${data.cached ? 'saved IRSA' : 'IRSA'} image products`
        : 'No SPHEREx observations available for this region and release.');
    });
  }

  function inspect(observation) {
    return run(async () => {
      clearImage();
      setStatus('Loading calibrated FITS cutout…');
      const params = { url: observation.access_url, ra: listing.ra, dec: listing.dec, size: .05 };
      const data = await query('/api/cutout', params);
      setPreview({ ...data, observation, params });
      setStatus('Infrared cutout ready');
    });
  }

  function detect() {
    return run(async () => {
      setStatus('Detecting peaks in the FITS image…');
      const data = await query('/api/sources', preview.params);
      setSources(data.sources);
      setActive(null);
      setCatalog(null);
      setStatus(data.sources.length ? `${data.sources.length} peaks detected. Select a marker.` : 'No peaks passed the detection threshold.');
    });
  }

  function identify(source) {
    setActive(source);
    setCatalog(null);
    setTab('Object Explorer');
    return run(async () => {
      setStatus('Looking for nearby SIMBAD sources…');
      const data = await query('/api/objects', { ra: source.ra, dec: source.dec, radius_arcmin: .25 });
      setCatalog(data.objects);
      setStatus(data.objects.length ? 'Nearby catalog entries found' : 'No SIMBAD entry within 15 arcseconds');
    });
  }

  function save(position, label) {
    return run(async () => {
      await fetchJson('/api/bookmarks', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, ra: Number(position.ra), dec: Number(position.dec) }) });
      setStatus('Saved to investigations');
    });
  }

  function navigate(next) {
    setTab(next);
    if (next === 'Saved') run(async () => setSaved((await fetchJson('/api/bookmarks')).items));
  }

  const validCenter = ra.trim() && dec.trim() && Number(ra) >= 0 && Number(ra) < 360
    && Number(dec) >= -90 && Number(dec) <= 90;
  const validRadius = Number(radius) >= 0.001 && Number(radius) <= 0.2;
  const inSky = tab === 'Sky Explorer';
  const observing = inSky || tab === 'Timeline';
  return <div className="app">
    <aside><div className="brand">✦ StellarEye</div>
      <nav aria-label="Modules">{tabs.map(item => <button key={item} className={tab === item ? 'active' : ''}
        onClick={() => navigate(item)}>{item}</button>)}</nav></aside>
    <main>
      <header><h1>{tab}</h1><span className="pill" role="status">{status}</span></header>
      {inSky && <div className="sky-search">
        <form className="panel search-panel" onSubmit={event => {
          event.preventDefault();
          if (!busy && name.trim()) resolve();
        }}>
          <h2>Find a sky position <TermHelp term="resolver" /></h2>
          <div className="controls">
            <label>Object name<input value={name} onChange={event => setName(event.target.value)} placeholder="Barnard’s Star" /></label>
            <button disabled={busy || !name.trim()}>Find object</button>
          </div>
          <p className="hint">Find object fills RA and Dec. Then search SPHEREx observations.</p>
        </form>
        <form className="panel search-panel" onSubmit={event => {
          event.preventDefault();
          if (!busy && validCenter && validRadius) search();
        }}>
          <h2>Search SPHEREx observations <TermHelp term="irsa" /></h2>
          <div className="controls">
            <div className="help-field">
              <FieldLabel id="search-ra" term="ra">Right ascension (RA, °)</FieldLabel>
              <input id="search-ra" inputMode="decimal" value={ra} onChange={event => setRa(event.target.value)} />
            </div>
            <div className="help-field">
              <FieldLabel id="search-dec" term="dec">Declination (Dec, °)</FieldLabel>
              <input id="search-dec" inputMode="decimal" value={dec} onChange={event => setDec(event.target.value)} />
            </div>
            <div className="help-field">
              <FieldLabel id="search-radius" term="radius">Search radius (°)</FieldLabel>
              <input id="search-radius" type="number" min=".001" max=".2" step="any" value={radius}
                onChange={event => setRadius(event.target.value)} />
            </div>
            <div className="help-field">
              <FieldLabel id="search-release" term="release">SPHEREx release</FieldLabel>
              <select id="search-release" value={collection} onChange={event => setCollection(event.target.value)}>
                {releases.map(release => <option key={release}>{release}</option>)}
              </select>
            </div>
            <button className="primary" disabled={busy || !validCenter || !validRadius}>Search coordinates</button>
          </div>
          {(!validCenter || !validRadius) && <p className="hint">Use decimal degrees. RA must be 0° to below 360°, Dec −90° to +90°, and radius 0.001° through 0.2°.</p>}
          <div className="controls search-actions">
            <div className="help-action"><button type="button" disabled={busy} onClick={() => {
              setCollection('spherex_dr1'); setName('WISE 0855'); setRadius('0.01'); search(wise, 'spherex_dr1', true);
            }}>Explore WISE 0855 demo</button><TermHelp term="wise" /></div>
            <button type="button" disabled={busy || !validCenter}
              onClick={() => save({ ra, dec }, `Region ${ra}, ${dec}`)}>Save region</button>
          </div>
        </form>
      </div>}
      <div className={inSky ? 'layout' : ''}>
        <section className="panel viewer" hidden={!inSky}>
          <div className="paneltitle"><div>Celestial sky navigator <TermHelp term="navigator" /></div><span>Aladin Lite{activeSurvey && ` · ${surveyNames[activeSurvey]}`}</span></div>
          <div className="controls">
            <div className="help-field">
              <FieldLabel id="background-survey" term="survey">Background survey</FieldLabel>
              <select id="background-survey" value={surveyChoice} disabled={surveyStatus.startsWith('Checking')}
                onChange={event => setSurveyChoice(event.target.value)}>
                {Object.entries(surveyNames).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </div>
          </div>
          {surveyStatus && <p className="hint" role="status">{surveyStatus}</p>}
          <div ref={mapContainer} id="aladin" className="sky-map" hidden={mapStatus !== 'ready' || coordinateMode} />
          {mapStatus === 'offline' || coordinateMode ? <div className="coordinate-navigator">
            <h2>Coordinate navigator</h2>
            {mapStatus === 'offline' && <p>Enter coordinates above or use the controls below.</p>}
            <p>RA {ra || '—'}° · Dec {dec || '—'}°</p>
            <div className="controls" aria-label="Move by one degree">
              <button disabled={busy} onClick={() => nudge(0, 1)}>North 1°</button>
              <button disabled={busy} onClick={() => nudge(0, -1)}>South 1°</button>
              <button disabled={busy} onClick={() => nudge(1, 0)}>RA +1°</button>
              <button disabled={busy} onClick={() => nudge(-1, 0)}>RA −1°</button>
            </div>
            <p className="hint">Select Search coordinates to retrieve SPHEREx observations at this position.</p>
          </div> : null}
          {mapStatus === 'ready' && <div className="controls">
            {!coordinateMode && <div className="help-action">Map coordinates (ICRS) <TermHelp term="icrs" /></div>}
            {!coordinateMode && <button disabled={busy} onClick={() => {
              const center = viewer.current?.getRaDec();
              if (center) moveTo({ ra: center[0].toFixed(6), dec: center[1].toFixed(6) });
            }}>Use map center</button>}
            <button onClick={() => setCoordinateMode(!coordinateMode)}>
              {coordinateMode ? 'Show survey map' : 'Use coordinate navigator'}
            </button>
          </div>}
          <GaiaCatalog ra={ra} dec={dec} map={viewer.current} library={aladinLibrary.current}
            mapVisible={mapStatus === 'ready' && !coordinateMode} validCenter={validCenter} />
        </section>
        {observing && <section className="panel">
          <div className="paneltitle"><div>Observations <TermHelp term="observation" /></div><span>{listing?.count ?? 0} listed</span></div>
          {listing && <p className="hint">{listing.collection} · RA {listing.ra}° · Dec {listing.dec}°{listing.cached && ' · Saved IRSA records'}</p>}
          {!!listing?.count && <p className="hint observation-key">Time (UTC) <TermHelp term="utc" /> · Detector <TermHelp term="detector" /></p>}
          <div className="scroll">
            {listing?.observations.map(o => <button className="item" key={o.product_id}
              disabled={busy || !o.access_url} onClick={() => inspect(o)}>
              {o.obs_id}<small>{observationDate(o)} · {o.energy_bandpassname}</small></button>)}
            {!listing?.count && <p className="empty">{listing ? 'No observations matched these coordinates, radius and release.' : 'Run Search coordinates or open the saved WISE 0855 demo.'}</p>}
          </div>
          {listing?.count > 1 && <button onClick={() => setTab('Time Comparison')}>Compare observations</button>}
        </section>}
      </div>
      {(observing || tab === 'Candidate Finder') && <section className="panel feature-panel">
        <div className="paneltitle"><div>Scientific image / investigation <TermHelp term="cutout" /></div>
          {preview && <div className="help-action"><button disabled={busy} onClick={detect}>Detect sources</button><TermHelp term="peaks" /></div>}</div>
        {preview ? <>
          <SourceImage {...preview} sources={sources} active={active} onSelect={identify} />
          <p className="hint">{observationDate(preview.observation)} · {preview.observation.energy_bandpassname} · <a href={preview.observation.access_url}>Source FITS</a> <TermHelp term="fits" /></p>
          {sources.length > 0 && <p className="hint">Markers are candidate brightness peaks. Select one to check nearby catalog entries.</p>}
        </> : <p className="placeholder">Select an observation to load its infrared cutout.</p>}
      </section>}
      {tab === 'Object Explorer' && <section className="panel feature-panel">
        {active ? <>
          <h2>Source {active.id}</h2>
          <p>RA {active.ra.toFixed(6)}° <TermHelp term="ra" /> · Dec {active.dec.toFixed(6)}° <TermHelp term="dec" /></p>
          <h3>SIMBAD matches <TermHelp term="simbad" />{catalog?.length > 0 && <> <TermHelp term="arcsecond" /></>}</h3>
          {catalog?.length === 0 && <p>Unidentified in this SIMBAD search.</p>}
          {catalog?.map(object => <div key={object.main_id} className="object">
            <b>{object.main_id}</b> · {object.otype} · {object.separation_arcsec.toFixed(2)}″ away
          </div>)}
          {catalog?.length > 0 && <p className="hint">These are possible positional matches. Confirm the identification before drawing conclusions.</p>}
          <div className="controls">
            <button disabled={busy} onClick={() => identify(active)}>Retry SIMBAD</button>
            <button disabled={busy} onClick={() => save(active, `Source ${active.id} · ${preview.observation.obs_id}`)}>Save investigation</button>
            <button onClick={() => setTab('Timeline')}>Observation timeline</button>
            <button onClick={() => setTab('Spectral Explorer')}>Wavelength coverage</button>
          </div>
        </> : <p>Select a detected source on a FITS cutout.</p>}
      </section>}
      {tab === 'Time Comparison' && (listing?.count > 1
        ? <Comparison observations={listing.observations} region={listing} />
        : <p className="panel">Search for a region with at least two observations.</p>)}
      {tab === 'Spectral Explorer' && <section className="panel feature-panel">
        {listing && <SpectralSamples key={`${listing.ra}/${listing.dec}/${active?.id ?? 0}`} region={listing} active={active} />}
        <h2>Detector wavelength coverage <TermHelp term="detector" /> <TermHelp term="wavelength" /></h2>
        <p>These are archive-reported ranges across each product. A source spectrum requires calibrated brightness samples at the selected coordinates.</p>
        {listing?.observations.filter(o => o.em_min && o.em_max).map(o => <div className="object" key={o.product_id}>
          {o.energy_bandpassname} · {(Number(o.em_min) * 1e6).toFixed(2)}–{(Number(o.em_max) * 1e6).toFixed(2)} µm · {observationDate(o)}
        </div>)}
      </section>}
      {tab === 'Saved' && <section className="panel feature-panel">
        {saved.length ? saved.map(item => <button className="item" key={item.id} disabled={busy} onClick={() => {
          setTab('Sky Explorer'); moveTo(item); search({ ra: item.ra, dec: item.dec });
        }}>{item.label}<small>{item.ra}°, {item.dec}°</small></button>) : <p>No saved investigations yet.</p>}
      </section>}
      {tab === 'Learn' && <section className="panel feature-panel">
        <h2>From a sky position to an infrared observation</h2>
        <p>Right ascension and declination locate a region on the sky. IRSA returns the SPHEREx observations intersecting the search circle. FITS stores the calibrated image and the coordinate system used to map image pixels back to the sky.</p>
        <p>A brightness peak can come from an astronomical source or an artifact. Use the catalog result and repeat observations to investigate it.</p>
      </section>}
      <footer>Observations · NASA/IPAC IRSA | Sky navigation · CDS Aladin Lite | Catalog · SIMBAD</footer>
    </main>
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
