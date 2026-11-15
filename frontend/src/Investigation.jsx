import React, { useEffect, useState } from 'react';
import TermHelp from './TermHelp.jsx';
import { fetchJson, observationDate } from './sky-api.js';

export function SourceImage({ image, shape, sources, active, onSelect }) {
  return <div className="source-image">
    <img src={image} alt="SPHEREx infrared cutout" />
    {sources.map(source => <button key={source.id} className="source-marker"
      aria-label={`Inspect source ${source.id}`}
      aria-pressed={active?.id === source.id}
      style={{ left: (source.x + .5) / shape[1] * 100 + '%',
               top: (source.y + .5) / shape[0] * 100 + '%' }}
      onClick={() => onSelect(source)}>{source.id}</button>)}
  </div>;
}

export function Comparison({ observations, region }) {
  const products = observations.filter(o => o.access_url);
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [result, setResult] = useState(null);
  const [mode, setMode] = useState('side');
  const [frame, setFrame] = useState(0);
  const [opacity, setOpacity] = useState(.5);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (mode !== 'blink' || !result) return;
    const timer = setInterval(() => setFrame(current => 1 - current), 900);
    return () => clearInterval(timer);
  }, [mode, result]);

  const a = products.find(o => o.access_url === first);
  const b = products.find(o => o.access_url === second);
  async function run() {
    setBusy(true);
    setStatus('Loading and aligning both FITS cutouts…');
    setResult(null);
    try {
      const data = await fetchJson('/api/compare?' + new URLSearchParams({
        first, second, ra: region.ra, dec: region.dec, size: .05,
      }));
      setFrame(0);
      setResult(data);
      setStatus(`${data.overlap_pixels} common usable pixels`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }
  return <section className="panel feature-panel">
    <h2>Compare observations <TermHelp term="alignment" /></h2>
    <p className="hint">Choose different observation dates with the same detector for a visual preview. Wavelength can vary across that detector. <TermHelp term="detector" /> <TermHelp term="wavelength" /></p>
    <div className="controls">
      {[[first, setFirst, 'First observation'], [second, setSecond, 'Second observation']].map(([value, setValue, label]) =>
        <label key={label}>{label}<select disabled={busy} value={value} onChange={event => {
          setValue(event.target.value); setResult(null); setStatus('');
        }}><option value="">Select an observation</option>{products.map(o =>
          <option value={o.access_url} key={o.product_id}>{observationDate(o)} · {o.energy_bandpassname}</option>)}
        </select></label>)}
      <button className="primary" disabled={busy || !a || !b || a.t_min === b.t_min ||
        !a.energy_bandpassname || a.energy_bandpassname !== b.energy_bandpassname} onClick={run}>Align and compare</button>
    </div>
    <p role="status">{status}</p>
    {result && <>
      <p className="hint">Center wavelength: {result.bands.map(band => band ? `${band.wavelength_um.toFixed(3)} µm` : 'Unavailable').join(' / ')}. Use this view for visual inspection.</p>
      <div className="controls">
        {[['side','Side by side'], ['blink','Blink'], ['overlay','Overlay']].map(([id,label]) =>
          <div className="help-action" key={id}>
            <button aria-pressed={mode === id} onClick={() => setMode(id)}>{label}</button>
            {id !== 'side' && <TermHelp term={id} />}
          </div>)}
        {mode === 'overlay' && <label>Second image opacity<input type="range" min="0" max="1"
          step=".05" value={opacity} onChange={event => setOpacity(Number(event.target.value))} /></label>}
      </div>
      <div className={mode === 'side' ? 'comparison-pair' : 'comparison-single'}>
        {mode === 'side' ? [result.first, result.second].map((src, index) =>
          <figure key={index}><img src={src} alt={index ? 'Aligned second cutout' : 'First cutout'} />
            <figcaption>{observationDate(index ? b : a)}</figcaption></figure>)
        : mode === 'blink' ? <figure><img src={frame ? result.second : result.first} alt="Blink comparison frame" />
          <figcaption>{observationDate(frame ? b : a)}</figcaption></figure>
        : <div className="overlay"><img src={result.first} alt="First cutout" />
          <img src={result.second} alt="Aligned second cutout" style={{ opacity }} /></div>}
      </div>
    </>}
  </section>;
}

export function SpectralSamples({ region, active }) {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const target = active ?? region;
    setBusy(true);
    setRows([]);
    setStatus('Sampling calibrated FITS pixels…');
    try {
      const products = region.observations.filter(o => o.access_url).slice(0, 4);
      const results = await Promise.allSettled(products.map(async observation => {
        const params = new URLSearchParams({ url: observation.access_url, ra: region.ra,
          dec: region.dec, sample_ra: target.ra, sample_dec: target.dec, size: .05 });
        const { sample } = await fetchJson('/api/spectrum-point?' + params);
        return { ...sample, observation };
      }));
      const usable = results.filter(r => r.status === 'fulfilled' &&
        Number.isFinite(r.value.brightness_mjysr)).map(r => r.value);
      setRows(usable.sort((a, b) => a.wavelength_um - b.wavelength_um));
      setStatus(`${usable.length} usable samples from ${products.length} products`);
    } finally {
      setBusy(false);
    }
  }

  return <section>
    <h2>Quick-look spectral samples <TermHelp term="sample" /></h2>
    <p>Sample the nearest unmasked pixel at {active ? `source ${active.id}` : 'the search center'} in up to four observations. Values include the local sky background.</p>
    <button disabled={busy || !region.count} onClick={load}>Measure spectral samples</button>
    <p role="status">{status}</p>
    {rows.length > 0 && <div className="spectral-table-scroll"><table className="spectral-table">
      <thead><tr>
        <th scope="col">Wavelength (µm) <TermHelp term="wavelength" /></th>
        <th scope="col">Bandwidth (µm) <TermHelp term="bandwidth" /></th>
        <th scope="col">Brightness (MJy/sr) <TermHelp term="brightness" /></th>
        <th scope="col">UTC <TermHelp term="utc" /></th>
      </tr></thead>
      <tbody>{rows.map(row => <tr key={row.observation.product_id}>
        <td>{row.wavelength_um.toFixed(3)}</td><td>{row.bandwidth_um.toFixed(3)}</td>
        <td>{row.brightness_mjysr.toFixed(4)}</td><td>{observationDate(row.observation)}</td>
      </tr>)}</tbody>
    </table></div>}
  </section>;
}
