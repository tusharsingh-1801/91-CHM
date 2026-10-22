# TerraScope: Batch implementation of remaining datasets

You are Codex operating in this repository. Implement the remaining public dataset integrations end-to-end in **one coordinated pass**, without destroying existing features.

## Mandatory workflow
1. Inspect repository architecture, migrations, `backend/api`, Python engine, existing ingestion, field geometry, frontend datasets page, `datasets/catalog.json`, and current tests.
2. Reuse existing PostgreSQL/PostGIS, Express/TypeScript, Python services, and frontend conventions. Never use Supabase.
3. First verify official access URLs, formats, licenses, coverage, and rate limits. Avoid speculative endpoints. Log exact HTTP errors and provider attribution.
4. Implement in prioritized order:
   - **ESA WorldCover 2021**: existing `.local/datasets/reference/worldcover-grid.fgb` is only a tile index. Read FlatGeobuf index, find tiles intersecting actual field polygons, download/cache relevant raster(s), compute per-field categorical land-cover area fractions and cropland percentage with correct CRS/nodata/masking; persist source/version/date/coverage in PostgreSQL; add API and understandable UI. Do not present 2021 as live data.
   - **CHIRPS v3**: acquire real precipitation data for field coordinate/geometry and requested time interval using verified public service/files; calculate daily/monthly summaries, mark preliminary/final status where available, cache and persist; show provenance and chart; don't duplicate NASA POWER without labeling source.
   - **ISRIC SoilGrids**: implement reliable retrieval with official alternative to potentially paused REST endpoint, field-point soil variables, depth, uncertainty, units, source resolution; never call modeled estimates lab-tested values. If blocked, emit explicit `unavailable` status.
   - **ESA WorldCereal**: use verified official map download/access methods, select crop-related product and date, intersect with fields, store coverage/class statistics and version.
   - **NASA CropHarvest**: implement a reproducible dataset acquisition and local training/evaluation pipeline only if actual labels and license/access allow it; do not conflate benchmark labels with farm observations or claim accuracy without held-out tests.
   - **FAO Crop Calendar**: ingest legally usable crop/region records if machine-accessible, otherwise provide a manual-import CSV schema with provenance and explicit pending status. Never invent planting/harvest dates.
5. Add database migrations and API endpoints with auth/field ownership checks, pagination and validation; no secrets in client or Git; cache large data only under ignored `.local/` or `data/raw/`; do not commit large raster files.
6. Add a consolidated `npm run data:sync:references` command that processes selected fields and writes a per-provider JSON status report distinguishing `downloaded`, `integrated`, `blocked`, `manual`, `failed`, and `not_configured`. A failure in one provider must not prevent others.
7. Add UI dataset status and land-cover/rainfall/soil/crop summaries in farmer-friendly Hindi/English, including year and source; never display unsupported estimates as ground truth.
8. Add deterministic unit tests for coordinate transforms, polygon clipping, class percentages, missing data, API authorization, and provider failure handling; integration tests opt-in for network.
9. Run `npm test`, `npm run typecheck`, `npm run build`, and relevant Python tests. Fix all failures. If unable to run because local dependencies unavailable, say so explicitly.
10. Update `datasets/STATUS.md`, `datasets/catalog.json`, `datasets/REMAINING-DATASETS.md` with exact verified outcomes and commands. Commit changes to current feature branch; do not merge to main without tests.

## Acceptance criteria
- All accessible providers have working end-to-end ingestion, or documented specific blocking errors.
- Real source data only; no invented measurements, accuracy, crop identity or yield.
- Preserve existing NDVI, NDRE, NDMI, SAVI, EVI, Sentinel-2, NASA POWER, login, demo fields, dashboards, and research consent/privacy logic.
- Do not overwrite user data. Don't fetch all global rasters; clip to field AOI and bound file sizes.
- Produce a final table: provider, download success, PostgreSQL persistence, API, UI, tests, limitation.
