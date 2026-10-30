# Project review

## Fixed in this review

- Added one-command native frontend/API/Python startup, health readiness checks, port conflict checks, background logs and process-group stop.
- Frontend now loads the repository root `.env`; previously Maps keys there were ignored by Vite's frontend root.
- Frontend API proxy follows `API_PORT`; frontend refuses to silently change ports.
- API binds to localhost, closes its database pool on shutdown, and limits initial database connection waits.
- PATCH field edits retain dates/yield when those properties are omitted; explicit null still clears a value.
- PostgreSQL DATE values remain calendar strings, preventing a one-day shift during JSON serialization in IST.
- Invalid field/alert/event UUIDs return 400 before querying PostgreSQL.
- Forecast views preserve provider attribution and retrieval time, distinguish forecasts from historical records, enforce bounded requests, and expose provider-safe errors with retry controls.
- Imagery progress checks use bounded requests and offer a separate retry when polling fails; the persisted background job remains intact.
- Empty field-reference results are labeled as not yet checked rather than implying provider configuration was verified. Research-only and manual-only sources remain explicitly identified.
- The assistant UI now identifies its configured backend as Gemini rather than Sarvam AI.

## Still missing / recommended implementation order

1. **Meaningful database integration tests.** Existing Node tests mostly cover helpers and mocks. Add a disposable PostGIS test database covering migrations, field CRUD, cascades, scene ingestion and vegetation upserts. Python tests use synthetic rasters; add a controlled Sentinel end-to-end fixture.
2. **API validation.** Validate JSON types, all polygon rings, real calendar dates, update date ordering against saved dates, event types and request size. Map constraint/input errors to 400/409 instead of the generic 503 database error.
3. **Atomic processing.** NDVI insertion, field summary updates and stress alert creation should share a database transaction. Make repeated processing and concurrent ingestion idempotent.
4. **Background jobs and caching.** Raster calculations currently run inside HTTP requests. Persist job state/retries and cache tiles/overlays; surface progress and failures in the UI.
5. **Trend correctness.** Python regression uses observation position when planting date is missing, so irregular time gaps are ignored. Require distinct observation dates, fit elapsed days, bound NDVI predictions to [-1, 1], and distinguish daily slope from per-observation slope. Crop stages/health scores need crop-specific validation and uncertainty.
6. **External service resilience.** Apply timeouts consistently to STAC, NASA POWER, Sentinel Hub and Python calls. Add bounded retry/backoff for transient failures and a readiness view showing optional key configuration without exposing credentials.
7. **Access control before hosting.** There is no user authentication or field ownership boundary. Add those plus request rate limits before exposing this application publicly. The local launcher binds services to loopback.
8. **UI verification.** Seven browser workflow tests now cover boundary controls, wizard recovery, field management, history, analysis, weather, assistant, alerts and map retry with external API/SDK fixtures. Extend race-condition/mobile coverage and verify live Google Maps/Gemini/Sentinel integrations. See [BUTTON_AUDIT.md](BUTTON_AUDIT.md).
9. **Data provenance.** Identify seeded records clearly, retain ingestion/source timestamps, and avoid presenting heuristic scores or predicted crop stages as calibrated agronomic measurements.

## Verified on this machine

- Native PostgreSQL 18.6 / PostGIS 3.6 on 127.0.0.1:5435; the existing system PostgreSQL 16 remains untouched.
- Restored 3 fields. Alerts, scenes, vegetation indices, weather observations and field events were empty in the source and remain empty in the native copy.
- All migrations already applied after restore.
- Full stop/start released and reopened ports 5173, 3001, 8000 and 5435.
- Live smoke test passed frontend/proxy/engine health, invalid IDs, field creation, partial edits retaining dates/yield, explicit null clearing and deletion of the temporary field.
- Project Docker containers stopped; original database volume preserved.
- Build, lint, 9 Node tests, 7 browser workflows and 6 Python tests pass. Python dependencies emit deprecation warnings.

## Data preservation

The original Docker database was exported to `.local-database-backup.dump` (ignored by Git). Do not delete its Docker volume until the native copy has been verified. Local database files and downloaded runtimes are ignored under `.local/`.
