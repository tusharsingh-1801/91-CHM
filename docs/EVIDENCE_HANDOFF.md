# CHM farmer workspace handoff — 16 October 2026

Baseline: `main` at `03a908fc57b55736fab33e59c13256be44f9eec4` in `tusharsingh-1801/91-CHM`. This revision completes the farmer workspace on top of the evidence/provenance work. PostgreSQL/PostGIS and the existing raster engine remain the sources of truth. No MADHWAI services or data are involved.

## What the farmer can do

1. Choose Hindi or English and hectares or acres. The choice persists on the device, including navigation, forms, errors and date formatting. Hindi glyphs are bundled under SIL OFL so external font access is unnecessary. Saved user/provider text stays in its original language.
2. Read separate dashboard lists for crop inspection and image/data problems. Demo/public parcels are hidden by default and excluded from real-farm totals. Use working summary filters, search and a clear-filter action.
3. Open a field's Overview to see a plain summary, image age/date, usable field area and next steps. Plan an actual visit with a date, reason and available scene/boundary context; review/update its task later. Duplicate retries preserve the same task.
4. Open the map, select an exact image and toggle vegetation colours. Scene IDs, pixels and boundary versions are collapsed under technical details. The basemap is distinct from the analysed image; colours are shown only for accepted usable observations on the current boundary. Alert actions distinguish seen/action taken/closed; closing a notice does not verify recovery.
5. Save a field independently of satellite work. Image checks use PostgreSQL jobs, remain visible after reload, reuse active work and recover expired worker leases. Retry failures without duplicating fields. Old-boundary jobs no longer block new checks. The API worker and database must remain running.
6. Add a photo and note directly from Overview. Preview the photo before saving, retry with preserved entries and identity, or delete a saved photo note. Automatic crop diagnosis is still unavailable.
7. View dated vegetation trends and optional detailed comparisons/raw readings. Historical NASA POWER weather stays explicitly historical; weather updates also use jobs. The field assistant uses the selected app language and reports service unavailability honestly.
8. Print/save a report as PDF through the browser, export date-filtered readings as CSV, and download the current boundary as GeoJSON. Quality, source, provenance, calculation version and boundary identity remain in CSV. Formula-like user text is neutralized for spreadsheets. The latest summary is labelled separately from date-filtered report data.

## Database / pull instructions

Stop CHM and back up the local CHM database before applying `npm run migrate`. The new additive `1792100000000_field-visit-actions.ts` adds nullable `client_key`, `reason`, `scene_id` and `boundary_version` columns to `field_tasks`, with a per-field retry-key index. Existing fields, accounts, observations and tasks are preserved. The launcher checks the required schema before starting.

No Node/Python package versions or environment keys changed. Keep the existing `.env`. Normal update commands are `npm stop`, `git pull --ff-only origin main`, `npm run migrate`, and `npm start`. For shared access, keep `AUTH_MODE=required` and ownership enforcement; legacy field claims remain explicit. This revision does not authorize or perform public deployment.

## Validation

Local checks: TypeScript/production build and lint pass; 20 ordinary API/unit checks pass (three database cases are intentionally skipped by `npm test`); all 14 Python engine tests pass; the complete browser suite passes 29 cases at phone/tablet/desktop widths. Browser tests use mocked API responses, imagery and tiles. Mobile/desktop overview and print layouts are inspected visually. Dedicated Hindi screenshot verification loads the bundled font.

The database CI uses disposable PostGIS, applies all migrations, and runs the separate opt-in integration suite. It now creates an explicit fixture account instead of assuming unauthenticated field-list access. Additional checks cover concurrent job deduplication, expired-worker recovery, retry exhaustion, boundary changes, visit retry identity, invalid dates and cross-owner access. The latest run result is authoritative on the repository's Actions page; ordinary API success alone does not establish these checks.

## Remaining dependencies and limits

- No new successful live external satellite observation is claimed by this revision. Existing quality, recency, reflectance scaling/masking and observation versioning rules are preserved; agronomic calibration remains separate from software validation.
- No validated/licensed photo diagnosis provider, forecast weather adapter or offline/PWA synchronization is implemented.
- Gemini still needs configured credentials. In-app visits do not send phone notifications. Device preferences are local, not account-synced.
- Public/shared production hardening remains a separate release task. Authentication is not disabled to make tests pass.

## Plain-language submission revision

Based on main `8e5cb67d7149f3dfb9abcabc781c24463704dcca`. The dashboard now presents a short next-step queue, compact filter counts and field cards with one action. The missing-imagery empty state no longer claims no vegetation decrease. Sample-only accounts offer add-field/sample actions. Overview shows the recommended action before optional measurement detail; maps use picture labels instead of UTC jargon; an in-app bilingual Help page explains the complete workflow and limitations. The trend page provides a dated plain-language change statement; exact measurements remain under advanced details and in reports.

Verification: final UI production build/typecheck and lint pass; 20 ordinary API/unit checks pass (3 DB-dependent cases skipped by that command); 34 browser cases pass locally, including five new regressions. Browser screenshots at mobile/desktop and Hindi layouts were inspected. PostgreSQL/Python gates are run by the existing GitHub workflow; use the submitted revision's Actions result for their outcome. No live accepted scene or configured-machine smoke run is claimed by this environment.

Academic additions: `docs/academic/SUBMISSION_READINESS.md`, `DESIGN_AND_TRACEABILITY.md`, updated Phase III evidence and the raw ten-sample controlled browser performance JSON. The controlled 20-card rendering median is 942 ms, nearest-rank p95 1042 ms; API responses were mocked. This is not live backend or satellite throughput.

No dependencies, migrations, credentials, auth behavior or scientific thresholds were changed. The remaining diagnosis, forecast, offline, field-truth and release-hardening limitations still apply. Guide/team details and real demo-machine validation must come from the student and faculty.

## Managed database migration recovery

A local update exposed a launcher ordering problem: `npm stop` also stops the configured PostgreSQL cluster, while migration previously expected it to already be running. `npm start` brought PostgreSQL up but then correctly refused the missing `field_tasks.client_key` schema. A new `premigrate` hook starts only the configured managed cluster before migration, without app-schema or Python preflight. Already-running clusters are reused, startup errors stop the migration, and external PostgreSQL is untouched. Four isolated launcher regressions cover these cases, and the existing CI applies real PostGIS migrations. Existing schema migrations/data are unchanged.
