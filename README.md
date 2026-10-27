# TerraScope Crop Health Monitor

Crop health dashboard using Sentinel-2 imagery, a Node API, a Python raster engine and PostgreSQL/PostGIS.

## Start / stop locally

```bash
npm start          # starts database (when managed), Python, API and frontend in background
npm run status     # URLs and health checks
npm stop           # stops this project's managed processes
```

On macOS, double-click `Start.command` to start and open the browser, and `Stop.command` to stop.

Open **http://localhost:5173**. API health: `http://localhost:3001/api/health`; Python health: `http://localhost:8000/health`. Closing the browser does not stop the services; use `npm stop`. Logs are in `.local/server.log`.

For development with logs in the terminal:

```bash
npm run dev        # frontend + API + Python; Ctrl+C stops all three
```

`npm run dev` requires the database to already be running. `npm start` checks the database/schema, Python imports and free ports before launching. A failed service stops the other app services. It never kills an unrelated process occupying a port.

## Fresh installation

Use Node.js 24, Python 3.11 and a **native PostgreSQL with PostGIS** installation. Docker is not required. On macOS, [Postgres.app](https://postgresapp.com/downloads.html) includes PostGIS; a plain PostgreSQL installation may need PostGIS installed separately.

```bash
npm ci
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/engine/requirements.txt
cp .env.example .env
```

Configure `DATABASE_URL` for your local database. Create an empty `terrascope` database with your PostgreSQL tools, then run:

```bash
npm run migrate
npm start
```

Migrations install the schema and enable the required extensions; the database user must have permission to create them. Do not rerun seed SQL manually over existing data.

## Configuration

The frontend and backend both load the root `.env`. Restart after changing it. Only variables prefixed `VITE_` are exposed to the browser; never put server secrets under that prefix.

| Variable | Purpose | Default |
|---|---|---|
| `DATABASE_URL` | Native PostgreSQL connection URL | localhost:5432/terrascope |
| `WEB_PORT` | Browser port | 5173 |
| `API_PORT` | API port; Vite proxy follows this | 3001 |
| `PYTHON_BIN` | Python executable | .venv/bin/python |
| `PYTHON_ENGINE_URL` | Local Python engine URL/port | http://127.0.0.1:8000 |
| `LOCAL_PG_BIN` | Optional native PostgreSQL bin directory managed by start/stop | unset |
| `LOCAL_PG_DATA` | Data directory for that managed database | .local/postgres-data |
| `VITE_GOOGLE_MAPS_API_KEY`, `VITE_GOOGLE_MAPS_MAP_ID` | Legacy optional Google map settings; current core maps use Leaflet/OpenStreetMap and do not require these values | unset |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Google AI Studio chat credentials and model | unset / gemini-3.5-flash-lite |
| `SENTINEL_HUB_CLIENT_ID`, `SENTINEL_HUB_CLIENT_SECRET` | Optional Sentinel Hub processing endpoint | unset |
| `AUTH_MODE` | `required` enables accounts; `local` disables ownership checks for isolated development only | required |
| `APP_ORIGIN` | Comma-separated browser origins allowed for write requests | http://localhost:5173 |
| `AUTH_SECURE_COOKIE` | Set to `1` when serving the app over HTTPS | 0 |
| `PHOTO_STORAGE_DIR` | Private server-side storage for scouting photos | .local/scouting-photos |
| `JOB_CONCURRENCY` | Concurrent PostgreSQL-backed worker jobs (clamped to 1–4) | 2 |

This machine is configured with a project-managed native database on port **5435** under `.local/`; the existing system PostgreSQL stays on its own port.

When `LOCAL_PG_BIN` is set, its data directory must already be initialized. The launcher starts/stops only that configured cluster, leaving any system PostgreSQL installation alone. Otherwise PostgreSQL runs independently and `npm stop` stops the three app services only.

Field drawing, boundary editing and satellite-map viewing use Leaflet with OpenStreetMap; no Google Maps key is required. The basemap is not the selected Sentinel acquisition. Gemini is the only chat provider and requires server-side `GEMINI_API_KEY`; the default `GEMINI_MODEL` is `gemini-3.5-flash-lite`. Run `npm run gemini:check` to verify access. `/api/assistant` provides field-aware answers and optional saved history. Public STAC scene ingestion and NASA POWER weather do not require Google credentials. Placeholder credentials will not enable these services. In shared deployments, keep `AUTH_MODE=required`, set `APP_ORIGIN` to the exact HTTPS frontend origin(s), and set `AUTH_SECURE_COOKIE=1`. Do not use `AUTH_MODE=local` on a shared or network-exposed service.

Accounts are created in the app. Migrations preserve legacy fields with `owner_id = NULL`; they are never assigned to the first account automatically. For an explicit local claim, sign in/create the intended account, identify the exact legacy field UUIDs with your database administrator, then run `node scripts/claim-fields.mjs account@example.com <field-uuid> [...]`. The script only operates on a loopback TerraScope database, claims only listed unowned fields, and writes an audit record. Back up the database before migrations or claims.

## Checks and remaining work

```bash
npm run build
npm test
npm run lint
npm run test:ui     # browser workflows; launches its own frontend on port 5174
npm run test:smoke  # requires running local services; creates and deletes one temporary field
.venv/bin/python -m pytest backend/engine -q
```

CI starts a disposable PostGIS service, applies all migrations, and runs the database-backed integration test against the dedicated `chm_integration` database. Ordinary `npm test` intentionally skips that test. To run it locally, create a separate empty `chm_integration` database with PostGIS, set `DATABASE_URL` to that database on loopback (`127.0.0.1` port `5432` or `5435`), run `npm run migrate`, then `npm run test:integration`. The test refuses the normal `terrascope` database and non-loopback hosts; it deletes only its own fixture field.

See [PROJECT_REVIEW.md](PROJECT_REVIEW.md) for the findings and recommended implementation order. Browser tests verify rendered Leaflet workflows with fixture tiles and mocked APIs; they do not prove live external credentials, live satellite acceptance, or agronomic validity.

The original database backup is `.local-database-backup.dump` and is ignored by Git. Keep it until the native database copy is verified.

Browser tests use Chrome on macOS and Playwright Chromium on Linux (`npx playwright install --with-deps chromium`). API responses and OpenStreetMap tiles are fixture-backed; the actual Leaflet map, drawing controls, navigation, forms and HTTP requests run in the browser. These tests do not verify live provider access or a real satellite observation.

## Synthetic farmer demo scenarios (safe, no database writes)

For academic screenshots and regression checks, this repository includes **20 explicitly fictional field scenarios**: five basic dashboard states in `tests/fixtures/demo-scenarios.json` and 15 extra crop/evidence edge cases in `tests/fixtures/extended-farmer-scenarios.json`. They run behind mocked browser API routes. **They are not live Sentinel-2 measurements, and they do not populate existing farm tables.**

```bash
npx playwright test tests/ui/demo-dashboard.spec.ts tests/ui/extended-demo.spec.ts
npm test
```

For the full submission check use `npm run submission:check`. A timestamped report is written to ignored `.local/submission-evidence/`. See [repository gap audit](docs/academic/REPOSITORY_GAP_AUDIT_2026-10-16.md) for unfinished items and the exact verification plan.

## Sync project data

With native services running, run `npm run sync:data` to import 30 available days of NASA POWER weather and search the last 90 days of Sentinel-2 observations for saved field locations. NASA meteorological availability typically trails by 2–3 days; missing-value sentinels are excluded from measurements. Set `SYNC_WEATHER_DAYS` to choose 1–365 days. This sends saved coordinates to NASA POWER and Earth Search.

Fields with no coordinates are skipped. Field-level indices require an actual polygon boundary; a point lookup only supplies scene metadata. Successful observations update vegetation indices and field health, and may generate stress alerts. The local sync report is `.local/data-sync-report.json`. Planting/harvest dates, yield and management events must come from the field manager.

## Dataset catalog and source status

Open **Explore datasets** on the dashboard for ten reviewed sources and their actual integration status. Three sources are connected to product features; the remaining entries are reference-only or a static research sample. See [datasets/README.md](datasets/README.md) for source limitations and attribution. Sample parcel polygons are not imported as farm records.

## Phones, tablets, and other computers

The web interface adapts to phones, tablets, laptops, and desktops, including portrait and landscape screens. Tables scroll within their panel on narrow screens; field navigation, forms, and map controls support touch.

To use the running app from another device on the same trusted Wi-Fi, set `WEB_HOST=0.0.0.0` in `.env`, restart with `npm run stop` then `npm start`, and open `http://<computer-LAN-IP>:5173` on that device (or your configured `WEB_PORT`). Allow the web port through the computer's firewall if needed. Keep the API and Python engine local: the frontend proxies `/api` to them, so devices share the same data. Automatic geolocation requires HTTPS on remote devices; otherwise pan and zoom the OpenStreetMap view to draw a boundary manually. For access outside your Wi-Fi, deploy the services behind HTTPS.

## Reference datasets (opt-in)

TerraScope integrates field-boundary-aware public reference datasets: ESA WorldCover, CHIRPS v3, SoilGrids WCS, ESA WorldCereal AOI exports, NASA Harvest CropHarvest labels, and permission-reviewed FAO crop-calendar CSVs. These sources provide historical maps, modeled estimates or regional guidance; they do not establish current crop identity, laboratory soil results or actual farm dates.

After migrations, synchronize explicit, existing field UUIDs (select only fields you are authorized to manage):

```bash
npm run migrate
npm start
npm run data:sync:references -- --fields <owned-field-uuid> --providers worldcover,chirps,soilgrids --start YYYY-MM-DD --end YYYY-MM-DD
```

The command records source, license, retrieval timestamp, coverage, provider errors and the field boundary version. It never substitutes synthetic values. Review [dataset status and reproduction commands](datasets/STATUS.md) for verified acquisitions, manual WorldCereal/FAO workflows and remaining data requirements.

## Evidence-first monitoring

The overview prioritizes field visits, old images and missing evidence. Universal farm-average health has been removed. Field-level coverage, valid pixels, acquisition date, source, freshness and descriptive change are separate. Demo/public-boundary field records are removed by the latest database migration. Legacy scores are preserved in PostgreSQL but are not verified imagery.

Run `npm run migrate` before starting this version. The evidence migrations preserve existing rows, archive boundary revisions, and attach provenance and quality to observations. The additive field-visit migration adds retry keys and image context to tasks without removing existing records. Take a database backup before migration. Existing unverified observations must be reprocessed to qualify; they are not silently promoted to measured evidence.

`EVIDENCE_MIN_COVERAGE=70`, `EVIDENCE_MIN_PIXELS=10`, `EVIDENCE_FRESH_DAYS=14`, and `EVIDENCE_DECLINE_THRESHOLD=0.10` are initial product heuristics, not validated agricultural thresholds. Restart after changing them. Scene discovery searches `SATELLITE_SEARCH_DAYS=90` days, retrieves up to `SATELLITE_CANDIDATE_LIMIT=100` recent candidates and processes at most `SATELLITE_MAX_ATTEMPTS=6` sequentially. Missing required bands, insufficient field coverage and unusable pixels cause a candidate to be rejected. No accepted candidate leaves the previous evidence in place. `POST /api/fields/:id/ndvi/process-latest` processes discovered candidates; discover first via the existing ingestion endpoint. The app also includes PostgreSQL-backed job records, bounded retries and worker lease recovery; this queue still needs full restart/concurrency validation before shared production use.

Experimental vegetation scores remain under advanced details, independent of image quality. A decrease is a reason to inspect, not disease detection. Trends use elapsed dates, not observation sequence numbers. There is no crop-stage or next-NDVI forecast. Historical weather is modeled NASA POWER data, not a forecast. Manually closing a notice does not establish recovery.

The engine requires red/NIR/SCL bands and trustworthy reflectance scale/offset metadata (STAC `raster:bands`, or raster metadata). It refuses to guess integer-band scaling. Statistics, tiles and overlays share masking and normalization. Boundary updates archive the old geometry, invalidate summaries, and isolate old observations by revision. OpenStreetMap/Leaflet provides the key-free basemap; it is not the selected Sentinel acquisition.

For the opt-in real PostgreSQL regression, use `npm run test:integration` after configuring the isolated database described above. The integration test verifies PostGIS transactions, acquisition recency, duplicate prevention, quality rejection, fallback to an older usable observation, and boundary-version invalidation. Standard `npm test` skips the database-dependent portion but still tests that the safety guard rejects ordinary development and remote databases.

Field records and related API routes have account ownership checks, and the field diary supports photo-backed scouting records with a grower-reported category, growth stage and severity. New submissions remain owner-reported and unverified. Owners can optionally consent per note to a research field visit and can withdraw consent; consent changes are recorded in an append-only event log. A trusted database operator must grant the `field_reviewer` role; assigned reviewers can open `/research/review`, see only consented field locations and dates, then submit separate labels attested as an in-person field visit. Reviewer identities and independent labels are retained in the review record; the farmer's report labels, free-text notes and photos are hidden from the review queue to reduce bias. There is not yet a consent-aware research export, and an API attestation cannot independently prove a visit happened. No licensed diagnosis provider is configured, so the product explicitly reports diagnosis as unavailable and does not infer diseases or treatments. The workspace has persistent Hindi/English and hectare/acre preferences, a dedicated field overview, direct visit planning, durable image checks, date-filtered CSV/GeoJSON exports and browser print/save-PDF reports. Offline synchronization, a forecast provider and full shared-deployment hardening remain incomplete. Do not represent the whole roadmap as complete; see [the implementation handoff](docs/EVIDENCE_HANDOFF.md) for current evidence, validation and blockers.

### Research reviewer access

Apply migrations with `npm run migrate`. Reviewer-role grants are deliberately not self-service: use a trusted database administrator to insert a `field_reviewer` grant in `research_role_grants` for a verified account, and record the administrator's account in `granted_by` when available. Revoke it by setting `revoked_at` and `revoked_by`; do not expose role assignment through a public API. The authenticated endpoints are `GET /api/research/review-queue` and `POST /api/research/cases/:caseId/reviews`. Research consent is optional and case-specific; withdrawing it removes the case from the active review queue. No analysis export is enabled by this feature.

Field onboarding saves the boundary independently of imagery processing, uses newest-first candidate processing and offers retry without creating another field. Optional planting/harvest dates remain unknown when omitted. GeoJSON import supports one valid Polygon (not MultiPolygon); boundary edits are versioned and invalidate current summaries. The analysis page now shows a two-date comparison and timeline from actual accepted observations, with quality and source information.


## Farmer workspace update (16 October 2026)

After pulling this update, stop the CHM stack, back up your CHM database, apply the additive migration, then restart:

```bash
npm stop
git pull --ff-only origin main
npm run migrate
npm start
```

No new Node or Python packages or environment keys are required. Existing `.env` files, accounts and records are preserved. `1792100000000_field-visit-actions.ts` adds nullable retry/context columns and a partial unique index to `field_tasks`. Its `down` removes only those new columns/index; back up before any rollback because that removes their metadata. Never reset the database or edit already-applied migrations.

- The language and area selectors work throughout the workspace and persist on this device. A bundled SIL-OFL Hindi font keeps labels readable without Google Fonts. User-entered crop names/notes and original provider diagnostics are not automatically translated.
- The dashboard separates crop-inspection actions from unclear/old/missing imagery. Demo and public parcels are opt-in and excluded from real-farm totals. Due counts refer to fields with an open task due today or earlier, using the database's calendar date.
- Opening a field lands on **Overview**. **Plan a field visit** opens a form with the field, evidence reason and image context. A retry uses the same key and cannot create duplicate visits. Tasks are in-app records, not phone notifications.
- **Add photo & note** opens the field diary's camera/upload input. Files are previewed before saving; failed saves keep notes and retry identity. The app still has no disease-diagnosis provider.
- Image checks are enqueued in PostgreSQL, processed by the existing API worker, and polled by the overview/map. Closing the page does not stop them; reopening recovers their status. Repeated queue requests reuse active work; editing a boundary prevents old jobs blocking checks for the new outline. Progress and failures are separate from crop condition. The API/worker and database must stay running.
- Maps show the selected image/date before the map; scene IDs, pixels and boundary versions are under **Technical image details**. Selecting historical imagery does not replace the latest summary.
- **Report** uses only the selected field's current boundary and chosen dates. CSV retains source, quality, acceptance, method and boundary identity, and escapes formula-like user text. GeoJSON contains the current boundary and provenance. **Print / save PDF** uses the browser's print dialog; no server PDF service is required. The report labels the latest summary separately because that image can fall outside the requested date range.

The PostGIS integration fixture now supplies an explicit account instead of relying on unauthenticated access. Database-backed checks additionally exercise queue deduplication, expired-worker recovery, retry exhaustion, boundary changes, and visit idempotency. `PLAYWRIGHT_EXECUTABLE_PATH` can select an existing Chromium binary for constrained development environments; CI uses Playwright's normal browser installation.

## Simple field workflow and submission evidence (16 October 2026)

The dashboard now starts with a field visit, due task or picture search. Cards give one next action and keep optional picture measurements collapsed. Missing pictures never generate a reassuring crop message. A sample-only account can add its first real field or explicitly explore a sample. Open **How to use** for the bilingual four-step guide and explanations of colours, missing pictures, photos and reports. Map dates use picture numbers to distinguish same-day scenes; full acquisition timestamps remain in technical details.

This UI revision adds no database migrations, dependencies or environment keys. Preserve the current account, CHM database and .env. Apply any previously unapplied migrations as described above when pulling from an older revision.

For the academic demonstration, use [Submission readiness](docs/academic/SUBMISSION_READINESS.md), [Design and requirement traceability](docs/academic/DESIGN_AND_TRACEABILITY.md), [Phase II](docs/academic/PHASE_II_PLANNING_DESIGN.md) and [Phase III](docs/academic/PHASE_III_IMPLEMENTATION_VALIDATION.md). They distinguish local UI/unit verification, isolated database CI, controlled rendering performance and outstanding live/field validation. They do not claim faculty marks, signatures, publications or agricultural accuracy.

## Updating while the managed database is stopped

`npm run migrate` now runs a `premigrate` step that starts only the PostgreSQL cluster configured by `LOCAL_PG_BIN` / `LOCAL_PG_DATA`. It does not require the app schema or Python engine to be ready. An already running cluster is reused; a start failure stops the migration. Externally managed PostgreSQL still needs to be started with its usual service/tool.

For an existing installation, keep `.env`, back up the CHM database, then:

```bash
npm stop &&
git pull --ff-only origin main &&
npm run migrate &&
npm start &&
npm run status &&
npm run test:smoke
```

If an older launcher first reported `ECONNREFUSED` during migration and then `column "client_key" does not exist` during start, its start attempt has brought the managed database up but the migration is still pending. Run `npm run migrate && npm start && npm run status` directly. There is no need to reset the database or manually add the column. `npm run db:start` also starts only the configured managed cluster. `npm run test:launcher` checks stopped/running/failing/external database startup paths using an isolated fake pg_ctl; CI additionally performs real PostGIS migrations.

### Research fixtures

Fictional scenarios remain under `tests/fixtures/` for automated regression checks only. The FTW public-boundary extract under `datasets/demo/` is retained as a cited research sample; neither is loaded into the running application.
