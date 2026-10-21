# Phase III - Implementation, testing and validation (20 marks)

**Project:** TerraScope Crop Health Monitor (CHM). **Updated:** 19 October 2026. **Rubric period:** 21 September-24 October 2026. Student-requested immediate demo target: 17 October.

## Implementation

The implemented system combines a bilingual React/Vite interface, Express ownership checks and durable jobs, PostgreSQL/PostGIS field/evidence storage, and a FastAPI raster/photo-inspection engine. Core screens cover field creation/editing, next actions, exact-image maps, measured greenness changes, visits, photo notes and reports. Photos do not produce automatic disease diagnoses. NASA POWER remains historical modeled weather.

This revision simplifies the first useful path: select a field -> read its next action -> visit/check pictures/record a note. Measurements, experimental scores and detailed image identifiers are optional. The [design document](DESIGN_AND_TRACEABILITY.md) maps requirements to implementation and tests.

### Structured field inspections

Scouting submissions can record an observation category, the grower-reported growth stage and severity alongside the photo and notes. The database records `owner_reported` provenance, `unverified` status and reporter/reviewer identity fields; the API always creates new submissions as owner-reported and unverified, regardless of client input. The diary labels those records as unverified, retains the metadata in its retry draft, and the field assistant receives recent records with instructions to describe them as reports, not confirmed labels or diagnoses. The upload and PostGIS integration tests cover accepted metadata, ownership attribution, status/provenance and omission of internal reviewer IDs from the diary response.

Research participation is separately optional for each scouting note. An owner can grant or withdraw consent for a field visit; current consent gates an authenticated reviewer queue and the `/research/review` page. A reviewer role is assigned only by a trusted database operator. The queue omits photos, free-text notes, account identity and the grower's reported labels, and reviewer labels are stored as separate, append-only ground-visit records rather than changing the farmer's report. This is a provenance and consent foundation, not proof that a physical visit occurred, a research export, a verified dataset, or evidence of model accuracy.

This is a structured reporting foundation, not an expert-review workflow or a research dataset: there is no reviewer-role API, correction history, expert adjudication, image-diagnosis provider or model evaluation. Do not use these owner reports as verified ground truth or claim diagnostic performance.

## Current executable evidence

| Check | Result | Scope |
|---|---|---|
| `npm run build` | Passed locally | Production assets built as part of the focused Playwright run. |
| `npm run lint` | Passed locally with warnings | Existing React hook/ref warnings remain; no lint errors. |
| `npm test` | 75 passed, 4 skipped | Controller/unit/export/policy checks; database-dependent cases are separate. |
| `npm run test:ui` | 88 passed at baseline; focused scouting test passed after this change | Browser UI/Leaflet, fixture HTTP responses and the structured inspection submission flow. |
| `npm run test:integration` | 5 passed locally | Isolated PostGIS, migration-backed schema, ownership, metadata attribution and durable jobs/visits. |
| Python engine pytest | 19 passed at baseline | Controlled raster/date/photo tests; engine unchanged in this implementation. |
| `npm run test:smoke` | Passed at baseline | Earlier local check against the configured application stack. |
| Live accepted satellite result | Not demonstrated here | Requires eligible live imagery, actual field boundary and running services. |

GitHub workflow: https://github.com/tusharsingh-1801/91-CHM/actions . Keep the exact submitted commit SHA with its successful workflow result. A green fixture/browser test does not prove a live provider result or agronomic validity.

## Test-case register

| ID | Scenario | Actual evidence | Status |
|---|---|---|---|
| T01 | Launch all local services | README preflight/status available; student-machine full-stack run outstanding | Local demo check pending |
| T02 | Create field without planting date | Browser exercises real form and mocked save/queue requests; duplicate retries covered | UI passed; live persistence check pending |
| T03 | Reject malformed polygon/UUID | Ordinary API validation checks passed | Passed within unit/controller scope |
| T04 | Omitted optional update values remain unchanged | Added actual HTTP/PostGIS regression to the owned-field integration case | See submitted CI result |
| T05 | Explicit null clears an optional value | The same database integration verifies all three optional values clear to null | See submitted CI result |
| T06 | Missing/cloudy/stale picture is unknown | Evidence policy tests and new plain-language regression passed | Passed |
| T07 | Same-day scenes select exact evidence | Browser checks scene identity, accepted/rejected/unprocessed and boundary alignment | Passed with fixture APIs |
| T08 | Controlled raster NDVI/masks | Python CI gate | See submitted CI result |
| T09 | Missing weather sentinels preserve valid zero rain | Controller tests passed | Passed |
| T10 | Hindi/English and mobile/landscape layout | Browser workflows at 320-1440 widths, Hindi font and persistent acre preference | Passed |
| T11 | Cross-owner field isolation | Dedicated database-backed API test in CI; sign-in gate browser test | See integration CI result |
| T12 | Provider/API errors and retry preserve entries | Browser tests for field queue, diary/photo, weather and assistant failures | Passed with controlled failures |
| T13 | Visit retry identity and due-task shortcut | Browser action and targeted plain-language test; DB idempotency CI gate | UI passed; see DB CI |
| T14 | CSV/GeoJSON date range, source and identity | Unit export tests and browser downloads passed | Passed |
| T15 | All fields missing imagery / demo-only account | No false reassurance; useful first-field/sample action | Passed |

## Controlled performance result

Ten browser navigations to all 20 fixture field cards rendered at 1440x900: median **942 ms**, nearest-rank p95 **1042 ms**. Linux x64, AMD EPYC 9V74, Node 24.19.0, Chromium 153.0.8010.0, Vite development server; API responses mocked and external fonts blocked. [Raw samples and environment](evidence/browser-performance-2026-10-16.json).

This is a frontend rendering benchmark, not backend API p50/p95, external provider latency, a production guarantee or satellite processing speed. Measure those separately on the actual demo environment and record scene dimensions, boundary area, repetition count and errors.

## Method and limitations

NDVI is `(NIR - red) / (NIR + red)` with valid reflectance, geometry/cloud/nodata masks and nonzero denominator. Measurements are tied to acquisition, scene, boundary revision and calculation method. Image coverage controls usability independently of the experimental vegetation score. One picture does not establish a trend; stale data does not establish today's crop condition. Resolving a notice records an action, not recovery.

The current thresholds are product heuristics, not crop/season calibration. No disease accuracy, yield prediction, user-study score or live service reliability statistic is claimed. Forecasting, automatic diagnosis, offline synchronization and public-release hardening remain separate work.

## Evidence to attach before presenting

- Submitted Git SHA and successful Actions link; local commands/results above.
- A screenshot/report of the actual configured demo field, with its source/date/quality.
- Controlled raster test result with expected versus measured value.
- Actual guide review/feedback and team identifiers.
- Short presentation/poster/final report in faculty format.
- A known-limitations slide and a rehearsed failure/unknown-data explanation.

For start/pull commands, the six-minute demonstration, viva answers and gap-closing instructions, use [Submission readiness](SUBMISSION_READINESS.md).
