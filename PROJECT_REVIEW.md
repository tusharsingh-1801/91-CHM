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
- Assistant submissions are synchronously guarded against duplicate requests; failed optimistic messages are removed so retrying does not duplicate questions.
- The dashboard all-fields map includes point fallbacks when a field polygon cannot be rendered and ignores out-of-range coordinates.
- `.env.example` uses a safe database URL placeholder, no longer includes a sample database password, and documents the optional server-side Google Weather key.
- The submission preflight invokes npm through `cmd.exe` on Windows, and the integration-test launcher sets its opt-in flag portably.

## Still missing / recommended implementation order

1. **Meaningful database integration tests.** Existing Node tests mostly cover helpers and mocks. Add a disposable PostGIS test database covering migrations, field CRUD, cascades, scene ingestion and vegetation upserts. Python tests use synthetic rasters; add a controlled Sentinel end-to-end fixture.
2. **API validation.** Validate JSON types, all polygon rings, real calendar dates, update date ordering against saved dates, event types and request size. Map constraint/input errors to 400/409 instead of the generic 503 database error.
3. **Atomic processing.** NDVI insertion, field summary updates and stress alert creation should share a database transaction. Make repeated processing and concurrent ingestion idempotent.
4. **Caching and throughput.** Imagery processing now has durable job state and retry/failure handling. Add caching for tiles/overlays and measure throughput under concurrent workloads.
5. **Trend correctness.** Python regression uses observation position when planting date is missing, so irregular time gaps are ignored. Require distinct observation dates, fit elapsed days, bound NDVI predictions to [-1, 1], and distinguish daily slope from per-observation slope. Crop stages/health scores need crop-specific validation and uncertainty.
6. **External service resilience.** Apply timeouts consistently to STAC, NASA POWER, Sentinel Hub and Python calls. Add bounded retry/backoff for transient failures and a readiness view showing optional key configuration without exposing credentials.
7. **Access control before hosting.** There is no user authentication or field ownership boundary. Add those plus request rate limits before exposing this application publicly. The local launcher binds services to loopback.
8. **UI verification.** Browser coverage includes boundary controls, wizard recovery, field management, history, analysis, weather, assistant, alerts and map retry with external API/SDK fixtures. The focused changed-surface tests passed; the latest full browser run had timeouts and missing-content failures. Resolve those and extend mobile coverage before claiming a clean full-suite pass. Verify live Google Maps/Gemini/Sentinel integrations separately. See [BUTTON_AUDIT.md](BUTTON_AUDIT.md).
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

## Runtime audit (30 October 2026)

- The shared local application remained running, but `npm run status` reported the managed stack stopped while the frontend, API and engine health endpoints were responding. The API forecast response and Earth Engine job error came from the running processes, not a fresh run of the current checked-in source.
- The visible satellite job had reached the terminal `failed` state after retries; its error reported missing `EARTH_ENGINE_PROJECT_ID`/ADC configuration in the engine process. `.env.local` contains the project-variable name and a local ADC credential file exists, but the live process did not appear to have loaded that configuration. Do not retry until restarting the services with the intended environment.
- The current field returned zero stored rows for all six reference providers. This means no field-scoped reference result is currently stored; no sync was triggered because it would transmit the field boundary to external providers.
- The live forecast endpoint returned HTTP 502 with a legacy generic error. The current source route supports Google Weather when `GOOGLE_WEATHER_API_KEY` is configured, but provider reachability was not tested. No live weather or Gemini request was made.
- The assistant status endpoint reported Gemini configured; this verifies key presence only, not provider access.
- The local PLDD-UP manifest confirms 15,519 verified-source image entries across Healthy (4,600), Early Blight (4,803) and Late Blight (6,116). Dataset preparation and grouped split tooling are integrated; no production classifier was trained.

Restart services only after closing the stale local processes and ensuring the desired `.env.local` values are loaded. Keep provider credentials local; do not submit private field coordinates to external providers without the field owner's approval.

## Additional audit verification (30 October 2026)

- Typecheck and production build passed. Lint exited successfully with warnings.
- Node/API tests: 90 passed, 5 skipped; launcher tests: 4 passed, 3 skipped. Research tests: 10 passed. Python engine tests: 72 passed, 1 skipped.
- Focused browser tests passed (22 tests). The full browser run completed with 82 passed and 15 failed; failures were page-content assertions/timeouts. Vite also logged an uncaught `filters.states` access in the existing uncommitted `frontend/src/pages/datasets/DistrictApyExplorer.tsx`. This review did not modify that file.
- Local smoke test passed, including cleanup of its temporary field. `git diff --check` passed.
- The Windows submission preflight passed build, lint, Node, photo-storage and Python checks (5/6) with UI tests skipped. Integration tests safely rejected the configured `/terrascope` database and require a dedicated loopback `/chm_integration` database; no database integration operations were performed. The intentionally dirty worktree also prevents a clean-checkout submission result.
