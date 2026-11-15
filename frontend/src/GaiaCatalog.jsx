import React, { useEffect, useRef, useState } from 'react';
import TermHelp, { FieldLabel } from './TermHelp.jsx';
import { fetchJson } from './sky-api.js';

export default function GaiaCatalog({ ra, dec, map, library, mapVisible, validCenter }) {
  const [radius, setRadius] = useState('0.05');
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(true);
  const catalog = useRef(null);

  useEffect(() => {
    if (!map || !library || !catalog.current && !result?.sources.length) return;
    if (!catalog.current) {
      catalog.current = library.catalog({ name: 'Gaia DR3 · search results', color: '#56f5c8',
        sourceSize: 9, shape: 'circle', onClick: 'showPopup' });
      map.addCatalog(catalog.current);
    }
    catalog.current.removeAll();
    if (visible && result?.sources.length) {
      catalog.current.addSources(result.sources.map(source => library.source(source.ra, source.dec, {
        'Gaia DR3 source ID': source.source_id,
        'RA (°)': source.ra.toFixed(6),
        'Dec (°)': source.dec.toFixed(6),
        'G magnitude': source.g_mag?.toFixed(2) ?? 'Unavailable',
        'Position epoch': 'J2016.0',
      })));
    }
  }, [map, library, result, visible]);

  async function load() {
    setLoading(true);
    setVisible(true);
    setResult(null);
    setStatus('Searching Gaia DR3 via VizieR…');
    try {
      const area = { ra, dec, radius };
      const data = await fetchJson('/api/gaia?' + new URLSearchParams(area));
      setResult({ ...data, ...area });
      setStatus(data.sources.length
        ? `${data.sources.length}${data.truncated ? '+' : ''} Gaia DR3 sources${data.cached ? ' · saved WISE 0855 catalog' : ' · live VizieR'}`
        : 'No Gaia DR3 sources in this search circle.');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  return <section className="catalog-controls" aria-label="Gaia DR3 catalog">
    <h2>Gaia DR3 catalog overlay <TermHelp term="gaia" /></h2>
    <div className="controls">
      <div className="help-field">
        <FieldLabel id="gaia-radius" term="radius">Gaia radius (°)</FieldLabel>
        <input id="gaia-radius" type="number" min=".001" max=".2" step=".001" value={radius}
        disabled={loading} onChange={event => setRadius(event.target.value)} />
      </div>
      <button disabled={loading || !validCenter || !(+radius > 0 && +radius <= .2)}
        onClick={load}>Load Gaia DR3</button>
      {result?.sources.length > 0 && <>
        {mapVisible && <>
          <button onClick={() => {
            map.gotoRaDec(Number(result.ra), Number(result.dec));
            map.setFoV(Math.max(0.02, Number(result.radius) * 3));
            setVisible(true);
          }}>Zoom to Gaia field</button>
          <button aria-pressed={visible} onClick={() => setVisible(!visible)}>
            {visible ? 'Hide Gaia markers' : 'Show Gaia markers'}
          </button>
        </>}
        <button onClick={() => { setResult(null); setStatus(''); }}>Clear Gaia results</button>
      </>}
    </div>
    <p className="hint">Uses the RA/Dec fields above. Pan the map and choose Use map center to query a different field.</p>
    {status && <p role="status">{status}</p>}
    {result?.sources.length > 0 && <details>
      <summary>Gaia DR3 source list</summary>
      <p className="hint">Center RA {result.ra}° · Dec {result.dec}° · radius {result.radius}°. Positions are at J2016.0. <TermHelp term="epoch" /></p>
      <p className="hint">G magnitude <TermHelp term="magnitude" /></p>
      <div className="scroll">{result.sources.map(source => <div className="object" key={source.source_id}>
        <b>{source.source_id}</b><small> · RA {source.ra.toFixed(6)}° · Dec {source.dec.toFixed(6)}°
          {source.g_mag != null && ` · G ${source.g_mag.toFixed(2)} mag`}</small>
      </div>)}</div>
    </details>}
  </section>;
}
