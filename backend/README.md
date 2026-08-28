# PostgreSQL setup

1. Install PostgreSQL locally or use a managed PostgreSQL provider.
2. Create a database named `terrascope`.
3. Run `psql "$DATABASE_URL" -f backend/database/schema.sql` (the API also creates these tables automatically on startup).
4. Create a local `.env` file using `.env.example` as the template.
5. Replace `DATABASE_URL` with your private PostgreSQL connection string.
6. Start both the API and Vite with `npm run dev`.

The dashboard loads the seeded `fields` rows through the Express API. If PostgreSQL is unavailable, it uses the built-in demo data so the UI remains available.

PostgreSQL credentials stay in the server environment and are never bundled into the browser.

## API routes

- `GET /api/health` checks the PostgreSQL connection.
- `POST /api/assistant` asks Sarvam AI for a plain-language answer using the selected field's metrics and recent NDVI observations. Set `SARVAM_API_KEY` and optionally `SARVAM_MODEL` in the server environment.
- `GET /api/fields` returns all monitored fields.
- `POST /api/fields` creates a field from `{ "name": "...", "crop": "..." }`.
- `PATCH /api/fields/:fieldId/location` stores `{ "latitude": 12.97, "longitude": 77.59 }` for authentic source queries.
- `GET /api/fields/:fieldId/alerts` returns field alerts.
- `GET /api/fields/:fieldId/ndvi` returns the NDVI observation history.
- `GET /api/fields/:fieldId/weather` returns NASA POWER observations.
- `POST /api/fields/:fieldId/ingest/weather` imports weather data from the official NASA POWER API.
- `GET /api/fields/:fieldId/scenes` returns stored Sentinel-2 scene metadata.
- `POST /api/fields/:fieldId/ingest/sentinel-scenes` searches Earth Search for low-cloud Sentinel-2 L2A scenes and stores their red/NIR asset URLs.
- `POST /api/fields/:fieldId/ndvi/from-scene/:sceneId` calculates field-window NDVI from the scene Red/NIR GeoTIFF assets and stores the result.

The Sentinel catalog was verified for North block and returned current 2026 scenes with red and NIR assets. It uses the public Earth Search STAC API and stores the catalog URL for traceability. NDVI raster calculation is the next processing stage after scene ingestion.

For production-sized scenes, configure `SENTINEL_HUB_CLIENT_ID` and `SENTINEL_HUB_CLIENT_SECRET` in `.env` and use Sentinel Hub's Process API to request only the field polygon. Do not commit these credentials or expose them as `VITE_` variables.
