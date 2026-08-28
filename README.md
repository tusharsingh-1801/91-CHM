# TerraScope Crop Health Monitor

NDVI and satellite-imagery dashboard for monitoring crop health.

## Project structure

- `frontend/` contains the React + Vite dashboard.
- `backend/` contains the Express + PostgreSQL API.
- `backend/database/schema.sql` contains the PostgreSQL schema and seed data.
- `.env` contains the private database connection string.

## Run locally

1. Install PostgreSQL and create a database named `terrascope`.
2. Set `DATABASE_URL` in `.env`.
3. Run `npm install`.
4. Run `npm run dev`.

For NDVI trend analysis, create the local Python environment and install its dependency:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/analysis/requirements.txt
```

Use `.venv/bin/python` when running the analysis module from the backend.

The backend automatically creates the tables and seed fields on startup. The frontend runs on the Vite URL shown in the terminal, normally `http://localhost:5173`.

## Useful commands

```bash
npm run dev          # frontend and backend together
npm run dev:client   # frontend only
npm run dev:server   # backend only
npm run build        # production frontend build
npm run lint         # lint frontend and backend
```

See [backend/README.md](backend/README.md) for database and API details.

## Google satellite map

Copy `.env.example` to `.env` and set `VITE_GOOGLE_MAPS_API_KEY` and `VITE_GOOGLE_MAPS_MAP_ID`. In Google Cloud Console, enable **Maps JavaScript API**, enable billing, restrict the browser key by HTTP referrer, and create a map ID. The dashboard then shows Google satellite imagery for fields with coordinates. Google imagery is only the basemap; NDVI values must come from an authenticated multispectral source such as Sentinel-2.
# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
