# TerraScope Crop Health Monitor

A research-grade crop-health intelligence platform using Sentinel-2 satellite imagery and NASA POWER weather data.

## Prerequisites
- Node.js (v20+)
- Python (v3.9+)
- PostgreSQL (v15+) with PostGIS extension
- Docker & Docker Compose (optional, for containerized setup)

## Environment Variables
Copy `.env.example` to `.env` and configure the following:
- `DATABASE_URL`: PostgreSQL connection string (e.g., `postgres://postgres:postgres@localhost:5432/terrascope`)
- `API_PORT`: Node.js API port (`3001` locally; Docker overrides it to `3000`)
- `POSTGRES_PORT`: Host port exposed by Docker for PostgreSQL (use `5433` if `5432` is already occupied)
- `PYTHON_ENGINE_URL`: Python FastAPI URL (default: `http://127.0.0.1:8000`)
- `VITE_GOOGLE_MAPS_API_KEY`: Google Maps API Key for the frontend map UI (Requires Maps JavaScript API enabled)
- `VITE_GOOGLE_MAPS_MAP_ID`: Google Maps Map ID

*Note: Google imagery is only the basemap visualization. Sentinel-2 processing does not require Google credentials.*

## Database Setup & Migrations
1. Ensure PostgreSQL is running.
2. Create the database: `createdb terrascope`
3. Enable PostGIS: `psql -d terrascope -c "CREATE EXTENSION postgis;"`
4. Run migrations to initialize schema and seed data:
```bash
npm run migrate
```

## Python Environment Setup
TerraScope uses a FastAPI Python engine with `rasterio` and `scikit-learn` for satellite processing.
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/engine/requirements.txt
```

## Starting Services Locally
Start the Node.js API and Vite frontend:
```bash
npm install
npm run dev
```

Start the Python FastAPI engine (in a separate terminal):
```bash
source .venv/bin/activate
uvicorn backend.engine.main:app --port 8000 --reload
```

## Docker Setup
Run the entire stack (PostGIS, Python Engine, Node API, NGINX Frontend) with Docker:
```bash
docker-compose up --build
```
The frontend will be available at `http://localhost:5173`.
API health is available at `http://localhost:3000/api/health` and the Python engine at `http://localhost:8000/health`.

## Testing
Run the test suites and type checks:
```bash
npm run typecheck
npm run lint
npm run test
python -m pytest backend/engine -q
```

## Common Errors
- `EPERM` on `npm run migrate`: Ensure PostgreSQL is running and `DATABASE_URL` is correct.
- `Python Engine Unavailable`: Ensure Uvicorn is running on port 8000.
- `Map rendering errors`: Verify `VITE_GOOGLE_MAPS_API_KEY` is present and domain-restricted correctly.
