# TerraScope reference dataset status

Verified against the local PostgreSQL database and dataset cache on **23 October 2026**. Earlier test-only evidence below has been superseded: the existing public-boundary parcel `15728878-9cb6-41af-bd0c-f2660426198b` already has persisted WorldCover, SoilGrids, CHIRPS and WorldCereal results. The database contains no farmer-owned boundary, so these are real source extractions for a benchmark polygon, not verified farm observations. Existing snapshots and files are preserved.

## Integration status

| Dataset | Downloader / actual data | Processing | PostgreSQL/API/UI | Current blocker or limitation |
|---|---|---|---|---|
| ESA WorldCover 2021 v200 | Official FlatGeobuf tile index and only the intersecting 10 m S3 raster tile downloaded by bounded HTTP range requests. | Rasterio 1.4.3 smoke test produced equal-area, nodata-aware, polygon-clipped class areas and cropland share for a test AOI. Historical land cover only. | Provider result persists as a boundary-versioned dataset run; authenticated field API and Hindi/English display are wired. | No owned farm field was available to run or persist actual-farm results. |
| CHIRPS v3 | Official daily final-rnl GeoTIFFs downloaded for 1–2 September 2026 during a test-AOI run. | Daily area-weighted mm, separate preliminary-sat fallback, missing-day state, spatial/temporal coverage and month totals with final/preliminary/unavailable counts. | Daily and monthly summaries persist as JSON in a boundary-versioned, field-specific run and display in the authenticated field view. | The two-day smoke test was not a full month or farmer-field ingestion. |
| ISRIC SoilGrids 2.0 | Official WCS capabilities and all 24 bounded native-grid coverages (six properties × mean, Q0.05, Q0.95 and uncertainty) downloaded for a test AOI. | Mean, Q0.05, Q0.95 and uncertainty; field-area clipping/weighting; 0–5 cm depth and source units/scaling. WCS nodata sentinels are excluded. Modeled estimates, not soil tests. | Persistence and Hindi/English field UI wired. | Test AOI only; no owned farm field was available. |
| ESA WorldCereal 2021 v100 | Official Zenodo metadata is reachable. No global archive was downloaded. Import accepts a locally exported AOI raster and checksum manifest. | SHA-256 and source/license checks, field-polygon intersection, class areas/coverage; explicitly historical temporary-crop classification. | Persistence and historical-map UI wired. | A checksum-registered official raster is now cached and two integrated snapshots exist for the benchmark parcel. It is not current crop identity. |
| NASA Harvest CropHarvest v14 | Downloaded 113,893 licensed benchmark label features from pinned Zenodo record 10251170; verified provider MD5 and stored content SHA-256. | Reproducible local HDF5 feature-manifest baseline validates checksums, label IDs, source licenses, official test flags, source-held-out partitions and real held-out metrics. | Dataset acquisition status persists; no farm inference or deployed model. | 87,464 official processed HDF5 samples are now acquired from the 82,479,907-byte features archive (provider MD5 verified). A per-file SHA-256 receipt is cached. Source-level training attribution and evaluation remain separate; no model or performance claim is made. |
| FAO Crop Calendar | No bulk/direct download: public redistribution permission is not established. A bounded manual CSV import is available. | Validates selected field ID, regional windows, months, source URL, license, access date and per-record permission reference. Shows regional recommendations, never actual field dates. | Imported recommendations and provenance persist and display in the authenticated field view. | No reviewed FAO rows are present; the persisted manual status is not imported calendar data. The Telangana horticulture seasonal reference is separate and is not relabeled as FAO. |

## Verified behavior

- `npm run data:sync:references -- --fields UUID[,UUID]` requires explicit existing UUIDs, selects geometry/boundary revision from PostgreSQL and isolates provider failures. Providers and date range can be selected; a missing field is reported and causes a non-zero exit.
- HTTP range responses are validated, global-raster fallback is refused, byte/pixel bounds are enforced, and temporary downloads are atomically cached under ignored `.local/datasets/reference/`.
- Persistence rechecks the field boundary version at insert time. Historical snapshots are retained; boundary edits cannot attach an old extraction to a new boundary.
- API reads require account authentication and field ownership. Old-boundary runs are filtered out.
- `npm run migrate` successfully applied `1792600000000_reference-datasets` to the local loopback PostgreSQL/PostGIS database. No actual farmer-field records were written.
- Public source access probes returned HTTP 200 for WorldCover, CHIRPS, SoilGrids WCS capabilities, WorldCereal metadata, CropHarvest metadata and FAO site. A metadata response is not evidence that the corresponding full dataset was downloaded.

## Reproduction and local-only input formats

Use Node 24, Python 3.11 where available, PostGIS and the repository Python environment:

```bash
npm ci
.venv/bin/python -m pip install -r backend/engine/requirements.txt
.venv/bin/python -m pip install -r datasets/requirements.txt
cp .env.example .env  # only for a new local setup; preserve an existing .env
npm run migrate
npm start
npm run data:sync:references -- --fields <existing-owned-field-uuid> --providers worldcover,chirps,soilgrids --start 2026-09-01 --end 2026-09-30
```

The WorldCereal manual export belongs in `.local/datasets/reference/worldcereal/` with a `manifest.json` containing `product: "temporarycrops"`, `version: "2021 v100"`, `license: "CC BY 4.0"`, and `rasters: [{"file":"<relative GeoTIFF>","source_url":"<official ESA/Zenodo HTTPS URL>","sha256":"<64 lowercase hex>"}]`. Never use a global archive or an unverified checksum.

CropHarvest labels are cached by the downloader. Training requires actual official `{index}_{dataset}.h5` feature samples under `.local/datasets/reference/cropharvest/`, each with a SHA-256 in `training-manifest.json`, a source-specific HTTPS URL/license in `constituent_licenses`, and source dataset names in `held_out_datasets`. Run:

```bash
.venv/bin/python scripts/train-cropharvest.py
```

The script writes `held-out-evaluation.json` only after held-out evaluation passes its checks. The official archive is now locally available: `npm run data:acquire:cropharvest` verifies the pinned archive, safely extracts bounded HDF5 files and records their checksums. `feature-acquisition.json` and `feature-label-audit.json` are under the CropHarvest cache. Acquisition is not training; there is no trained model or reported accuracy.

For FAO, copy `datasets/fao-calendar-template.csv` and add only reviewed rows with an exact `field_id`, source citation and permission reference. Import it using:

```bash
npm run data:sync:references -- --fields <existing-owned-field-uuid> --providers fao-calendar --fao-calendar-csv /absolute/path/to/reviewed-calendar.csv
```

Do not enter placeholder field IDs, actual planting dates inferred from regional windows, synthetic observations, or unlicensed labels/features.

## 23 October acquisition/persistence evidence

- CropHarvest `features.tar.gz`: 82,479,907 bytes, official MD5 `d757e6c32cb6d65aa517f003607f6f81`; 87,464 HDF5 samples extracted without replacing prior inputs.
- All 87,464 sample IDs matched pinned labels; no unmatched IDs. Research split and source-term checks remain separate from acquiring samples.
- `data:sync:references` rechecked all sample hashes and saved `feature_sample_count: 87464`, `feature_status: downloaded_verified`, `training_status: not_trained` for the existing public-boundary parcel. Previous snapshots remain in PostgreSQL.
- Existing WorldCereal raster SHA-256 matched its manifest and its GeoTIFF metadata was readable. WorldCover, CHIRPS and SoilGrids integrated snapshots were confirmed in PostgreSQL. These pre-existing records were not relabeled as farmer observations.
- Verification: 26 reference/acquisition/training Python tests passed (1 skipped), 85 API tests passed (5 skipped), 6 dataset-panel browser tests passed, production build passed.
- FAO is still pending actual reviewed calendar rows; a manual-status snapshot and the separate Telangana seasonal reference do not count as FAO calendar imports.

## Completed training and calendar fallback — 23 October 2026

CropHarvest training has completed using the existing verified acquisition. Of 87,464 inputs, 3,143 byte-identical feature files were excluded before fitting. The model fit 79,220 samples; 5,101 samples from China, Togo-eval, Kenya and LEM-Brazil sources were held out. No official test labels entered fitting and the test set was not used for tuning.

The saved model is `backend/engine/models/cropharvest-rf.joblib`; full measured results, split policy and artifact checksum are in `docs/reports/cropharvest-heldout.json`. Held-out accuracy is 75.1813%, balanced accuracy 75.2578%, F1 0.763718 and ROC-AUC 0.793186. The persisted model was reloaded and reproduced its evaluation predictions. This is a crop/non-crop research baseline, not a validated crop-health or disease model. Earlier acquisition-only notes are historical. Database publication is a separate step via `scripts/publish-cropharvest-training.mjs`; `--report-only` writes the artifact report without database access.

The official FAO API returned a country list without India, and the India calendar endpoint returned HTTP 204. The explicitly synthetic Indian fallback (rice, wheat and maize) is stored in PostgreSQL for the three existing public-boundary parcels and exposed by both dataset and calendar APIs. Every layer labels it DEMO, not FAO data. Reviewed calendar records take priority. No farm planting or harvest date is changed.

The existing WorldCereal AOI is integrated for parcel 3178 with 99.2768% coverage and source/checksum/bounds provenance. The other two public parcels have explicit `aoi_export_required` status. Additional AOI exports remain unavailable without matching official exports or configured CDSE/openEO access. Registration now appends immutable AOI rasters rather than replacing existing files.

Targeted checks completed: 29 reference/training/acquisition Python tests passed (1 skipped), 2 AOI-registration tests passed, 7 calendar/reference API tests passed, and 9 dataset-panel browser tests passed. No other datasets were reacquired and no entire regression suite was run for this continuation.


## Pending integration completion — 23 October 2026

The existing trained CropHarvest model and held-out metrics are now published in PostgreSQL for all 29 existing boundary fields. These are explicitly global research-model references, with `field_inference: false`; attaching them does not claim a prediction for a field. The authenticated API and frontend expose the actual metrics and this scope.

The Indian rice/wheat/maize DEMO calendar fallback is also persisted for all 29 fields and accessible through the authenticated calendar API and frontend. Official Indian FAO records remain unavailable (India absent from country list; calendar request HTTP 204). Reviewed records take priority over fallback records.

WorldCereal acquisition now obtains only relevant official ZIP members using validated, resumable byte ranges, verifies member CRC/size and SHA-256, crops bounded immutable field AOIs, and preserves earlier exports. All 29 existing boundaries now have usable matching official AEZ AOIs. The final cache-only acquisition pass reused 28 and registered the remaining large AOI with zero raster-download bytes. The large field is covered by official AEZ 25147; neighboring AEZ data is not substituted. Large WorldCereal AOIs use bounded equal-area aggregation with fractional boundary clipping.

Use `npm run data:publish:cropharvest` to publish an already trained artifact, `npm run data:acquire:worldcereal` for missing field AOIs, and `npm run data:integrate:pending` to link just CropHarvest, calendar and WorldCereal references. Existing current references are preserved. These commands do not reacquire other providers or retrain CropHarvest.

Earlier blocked/acquisition-only notes above describe prior checkpoints. Current persistence totals and verification are recorded in `docs/reports/pending-dataset-integration.json`.
