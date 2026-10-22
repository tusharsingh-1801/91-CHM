# Complete-platform audit — 18 October 2026

Baseline: `6618b16`, fetched from `origin/main`; working branch `feat/terrascope-complete-platform`.

Implemented: authenticated accounts and editable profiles; field ownership and boundary versions; Sentinel discovery and clipped NDVI/NDMI/NDRE/SAVI/EVI engine; quality checks and durable jobs; eight additive dashboard panels; Hindi/English; historical NASA POWER records; manual photo scouting; visits; CSV/GeoJSON and browser PDF reports. Demo mode has 24 fictional parcels and local reference photos.

Partial: dashboard comparison currently illustrates NDVI averages rather than rendering each selected scene's pixels; Gemini lacks task/alert context, persistent conversations and application rate limiting; notification read state is browser-local and covers only a subset of events; reports omit weather/scouting/tasks. A separate remote `feat/advanced-monitoring-addons` branch contains reusable preliminary comparison/forecast components but has no complete server forecast integration or demo fixtures.

Missing: genuine seven-day forecast module; persistent notification history and preferences; opt-in browser notifications; installable PWA, safe offline shell and recoverable offline note drafts; complete deployment/operational runbook.

Scientific/external blockers: no locally available, licensed and evaluated disease-classification artifact or held-out field labels. Existing manual photo capture remains functional. No ground-truth agronomic accuracy can be reported. Current database initially contained six legacy/unverified readings and no accepted measured imagery; live processing is being verified against an existing labelled public benchmark boundary. Existing records must not be relabelled as measured or erased.

Baseline verification:

- `npm ci --cache /tmp/chm-npm-cache --no-audit` succeeded.
- `npm run submission:check -- --skip-ui`: build, lint, Node and Python checks all passed; logs are ignored under `.local/submission-evidence/2026-10-18T18-06-47-592Z`.
- Python raster suite: 14 passed; dependency deprecation warnings remain.
- Separate loopback `chm_integration` database: all migrations applied; four integration tests passed, covering evidence transactions, owner isolation and durable jobs.
- Full baseline browser suite running; final outcome will be recorded before feature wiring.
- Gemini direct and authenticated application English/Hindi requests previously returned HTTP 200 with nonempty real `gemini-2.5-flash-lite` replies on 18 October.

Implementation order follows the supplied master prompt: finish baseline and live pipeline checks, comparison, Gemini, forecast, notifications, supported photo-analysis scope, PWA/offline drafts, reports, hardening, final regression, PR/CI and merge. No public deployment or paid service is authorized.

Live satellite check: catalog ingestion succeeded (15 candidate scenes). Two recent overlapping/cloudy scenes produced only 2 usable pixels / 1.38% field coverage and were correctly rejected; two other scenes had no usable pixels. Low-cloud public benchmark scenes `S2B_43REM_20261005_0_L2A` and `S2C_43REM_20261003_0_L2A` were subsequently accepted with 125 valid pixels and 100% coverage each. NDVI values were 0.3355 and 0.3951, respectively; NDMI/NDRE/SAVI/EVI were also calculated. Full source/version results are kept under ignored `.local/complete-platform-evidence/`. Existing legacy observations remain unchanged. These are measurements of a historical public boundary, not validation of current crop identity or disease accuracy.

Full baseline browser run completed: 59 passed / 5 failed. The five failures showed cold-route/loading waits or the 30-second whole-workflow limit on two phone cases, rather than assertion mismatches in the rendered content. They are being rerun unchanged with one worker before wiring the new UI; failures are retained in `.local`/`test-results` and are not skipped. Resource contention and heavy chart imports will be addressed in the performance pass as appropriate.

All five baseline failures passed unchanged in the single-worker rerun (5/5, 1.6 minutes). This establishes coverage of all 64 baseline workflows across the full and focused runs. Final verification will additionally run the complete post-change suite with one worker. No baseline test assertion was removed or skipped.
