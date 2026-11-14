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
