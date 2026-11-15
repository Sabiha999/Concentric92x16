# Concentric92x16 · SPHEREx Explorer

Local development uses Python 3.12 and Node.js 22 or 24. The starter includes sky navigation, live IRSA observation search and FITS previews, SIMBAD lookup, and SQLite bookmarks. Temporal comparison, spectra, and candidate detection have starter screens.

## Install on Windows

In PowerShell at the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

## Install on macOS or Linux

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
npm --prefix frontend ci
```

## Run locally

Start FastAPI in one terminal at the repository root:

```powershell
.\.venv\Scripts\python.exe -m uvicorn main:app --app-dir backend --reload
```

On macOS/Linux, use `.venv/bin/python` in that command. In a second terminal:

```sh
npm --prefix frontend run dev
```

Open [the app](http://localhost:5173), [API health](http://127.0.0.1:8000/api/health), or [API docs](http://127.0.0.1:8000/docs). Vite proxies local `/api` requests to FastAPI.

## Deployment configuration

For a separately hosted frontend, set `VITE_API_BASE_URL` to the public backend origin at build time and set `FRONTEND_ORIGIN` to the exact public frontend origin on the backend. SQLite uses `backend/discoveries.db`. Use persistent storage if deployed bookmarks must survive a restart or redeploy.

## Checks

Run `npm --prefix frontend run build` and run `python -m pip check` with the virtual environment's Python. Live observation and catalog searches require network access to IRSA and SIMBAD.

## Demo walkthrough

1. Start FastAPI and Vite from the repository root in separate terminals.
2. In Sky Explorer, click **Explore WISE 0855 demo** to list four saved IRSA DR1 products. **Search coordinates** runs the live archive query for the selected release.
3. Open the first observation, select **Detect sources**, and click a numbered peak. Object Explorer shows its sky coordinates and attempts a SIMBAD lookup. You can save an investigation even if the catalog is unavailable.
4. Open **Time Comparison** and select the first and third observations. Align them and switch to **Blink**. The demo pair uses different central wavelengths and is a visual comparison.
5. Open **Spectral Explorer**, then **Measure spectral samples**. Samples are nearest usable pixel surface brightness, including local background.

The saved demo uses IRSA cutouts at RA 133.795129°, Dec −7.245147°, with a width of 0.05°. The local FITS files preserve the primary, IMAGE, FLAGS, VARIANCE and WCS-WAVE HDUs. The archive URLs are included with the observation records. IRSA DR1 spectral images DOI: [10.26131/IRSA678](https://doi.org/10.26131/IRSA678).

## Survey and catalog layers

In Sky Explorer, use **Background survey** to switch between DSS2 optical and 2MASS near-infrared imagery. These map layers provide context for the separate SPHEREx FITS cutout.

**Load Gaia DR3** searches around the current RA/Dec fields using the separate Gaia radius. It lists up to 100 sources from CDS VizieR, with positions at the catalog epoch J2016.0. When the map is available, click a teal marker to inspect its Gaia source ID, position and G magnitude. The list is usable in coordinate mode. Results include a saved Gaia subset for the WISE 0855 center within 0.05° when VizieR is unavailable. This is a positional overlay. The coordinates are not propagated to the SPHEREx observing epoch.

The **Find a sky position** panel resolves an object name through CDS Sesame mirrors and fills the coordinates. Run **Search coordinates** in the neighboring SPHEREx panel for observations around that position. Gaia uses its own radius and has a **Zoom to Gaia field** button after a result is loaded. The app's **Gaia DR3 · search results** layer is labeled separately from any catalogs added through the native Aladin Stack.
