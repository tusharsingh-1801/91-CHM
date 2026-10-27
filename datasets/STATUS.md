# TerraScope reference dataset status

The benchmark-dataset evidence below was checked against the local PostgreSQL database and ignored dataset cache on **28 October 2026**. These local development records are not part of a deployment or repository-shared database. Public benchmark extractions and user-reported field results remain separately attributed.

On 27 October 2026, direct HTTP GETs to the ten catalog URLs returned **200 OK**. This confirms endpoint/page reachability only; it does not establish field-specific data coverage or mean every source is downloaded and integrated.

## Integration status

| Dataset | Downloader / actual data | Processing | PostgreSQL/API/UI | Current blocker or limitation |
|---|---|---|---|---|
| Sentinel-2 L2A via Google Earth Engine | Authenticated Earth Engine Python API searches `COPERNICUS/S2_SR_HARMONIZED`. | Earth Engine computes NDVI, NDRE, NDMI, SAVI and EVI with SCL cloud masking; acceptance thresholds are unchanged. Scene-linked map tiles and overlays use the engine. | Field ingestion and processing are integrated; Earth Search snapshots remain historical. | Live search and index calculation both returned HTTP 200 on 28 October 2026. Aggregate local DB counts show 20 GEE scene records and one accepted GEE vegetation measurement for a local field; this is not a claim about all deployments. |
| ESA WorldCover 2021 v200 | Official FlatGeobuf tile index and only intersecting 10 m S3 raster tile downloaded by bounded HTTP range requests. | Nodata-aware equal-area polygon-clipped class areas and cropland share. Historical land cover only. | Field-scoped provider result persists as a boundary-versioned dataset run; authenticated API and bilingual UI are wired. | A local user-reported field result is available; verify the boundary/location before interpreting it. |
| CHIRPS v3 | Official daily final-rnl GeoTIFFs with preliminary-sat fallback. | Daily area-weighted mm, missing-day state, spatial/temporal coverage and month totals with revision counts. | Daily and monthly summaries persist in a boundary-versioned field run and display in the authenticated field view. | Local result covers 1 September–24 October 2026; October is partial, with preliminary and unavailable dates. |
| ISRIC SoilGrids 2.0 | Official WCS capabilities and bounded native-grid coverages (six properties × mean, Q0.05, Q0.95 and uncertainty) downloaded for a test AOI; a local field result is persisted. | Mean, Q0.05, Q0.95 and uncertainty; field-area clipping/weighting; 0–5 cm depth and source units/scaling. WCS nodata sentinels are excluded. Modeled estimates, not soil tests. | Persistence and Hindi/English field UI wired. | One local field result has only 17.68% spatial coverage; do not treat it as representative of the whole field. Other deployments require their own extraction. |
| ESA WorldCereal 2021 v100 | Official ESA 10 m `ESA/WorldCereal/2021/MODELS/v100` collection is queried directly through Earth Engine; optional official AOI GeoTIFF import is retained. | Annual temporary-crop classification, field area coverage and confidence are reduced by polygon; regional AEZs are mosaicked as ESA documents. | New Earth Engine summaries persist as field-scoped reference runs and appear in the bilingual UI. | The active local field now has 99.95% mapped coverage; 2.28% of the whole field was classified as temporary crops in 2021. Historical map, not current crop identity. |
| NASA Harvest CropHarvest v14 | Pinned Zenodo labels and processed features are acquired only after archive/checksum validation. | Reproducible HDF5 feature-manifest, label, source-license and held-out evaluation workflow. | 87,464 feature samples are checksum-verified; acquisition status is persisted as research metadata, not farm inference or a deployed model. | The label audit found one invalid geometry; source-specific terms and a valid held-out evaluation remain required before training or reporting a score. These are research data, not farm measurements. |
| FAO Crop Calendar | No bulk/direct download: public redistribution permission is not established. A bounded manual CSV import is available. | Validates selected field ID, regional windows, months, source URL, license, access date and per-record permission reference. Shows regional recommendations, never actual field dates. | Imported recommendations and provenance persist and display in the authenticated field view. | No reviewed FAO rows are present; the persisted manual status is not imported calendar data. The Telangana horticulture seasonal reference is separate and is not relabeled as FAO. |

## Local user-reported field data (28 October 2026)

These are field-specific results from this development installation only. Provider estimates are not on-farm measurements, and no data was written into the source-control repository.

| Source | Imported data | Remaining limitation |
|---|---|---|
| NASA POWER | 360 historical daily weather records, 27 October 2025–21 October 2026. | Gridded modeled weather, typically delayed 2–3 days; not a station measurement or forecast. |
| CHIRPS v3 | Daily rainfall for 1 September–24 October 2026: 50 of 54 dates available, 100% spatial coverage on available dates; September is complete (30 days), and October has 20 preliminary dates and 4 unavailable dates. | October is partial; preliminary estimates may be revised, and missing dates are not zero rainfall. |
| ESA WorldCover 2021 | Field-clipped historical land-cover result, 100% raster coverage. | The result maps 78.8% built-up and 2.5% cropland; verify the user-reported boundary/location before interpreting it. It does not identify the current crop. |
| ISRIC SoilGrids 2.0 | Official WCS retry integrated modeled surface estimates (0–5 cm) for pH, soil organic carbon, total nitrogen, sand, silt and clay; PostgreSQL reports 17.68% spatial coverage. | Coverage is partial at the 250 m grid resolution, so these estimates are not representative of the whole field and do not replace a lab test. |
| Sentinel-2 via Google Earth Engine | Twenty scene records are stored in the local database; one GEE observation is accepted. A live API check also returned current scene candidates and field indices. | Cloud and coverage policies remain in force. Historical Earth Search observations remain unchanged; adjacent tiles are not independent trend dates. |
| ESA WorldCereal 2021 | Earth Engine reduced the official annual temporary-crop collection over the active field polygon: 99.95% mapped coverage and 2.28% temporary-crop classification of whole-field area. | Historical 2021 classification, not the current crop. |

## Google Earth Engine setup (28 October 2026)

The satellite workflow now uses the official `COPERNICUS/S2_SR_HARMONIZED` image collection through the Earth Engine Python API instead of Earth Search for new acquisitions. The Earth Engine service applies Sentinel-2 SCL masking and calculates the same field-level indices; the existing 70% coverage and minimum-pixel acceptance policy has not been relaxed. Existing Earth Search observations remain preserved with their original provenance and calculation version.

The local developer completed Earth Engine OAuth authorization on 28 October 2026. A live search through `COPERNICUS/S2_SR_HARMONIZED` and NDVI/NDRE/NDMI/SAVI/EVI calculation both returned HTTP 200. WorldCereal summaries now query the official `ESA/WorldCereal/2021/MODELS/v100` collection through the same engine. Hosted deployments still need their own registered project, enabled API and runtime identity; do not put service-account private keys in source control or chat.

Google credentials remain local and are not stored in the repository. Earth Engine authentication is specific to this developer environment and must not be assumed available to other users or deployments. Missing Earth Engine setup returns an explicit error rather than silently falling back to Earth Search.

## Verified behavior

- `npm run data:sync:references -- --fields UUID[,UUID]` requires explicit existing UUIDs, selects geometry/boundary revision from PostgreSQL and isolates provider failures. Providers and date range can be selected; a missing field is reported and causes a non-zero exit.
- On Windows, reference extraction uses `.venv/Scripts/python.exe` when present; other platforms use `.venv/bin/python`, with the platform Python as fallback.
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

WorldCereal uses the official Earth Engine collection when the local Earth Engine project and authentication are available. For installations without Earth Engine, an optional AOI export belongs in `.local/datasets/reference/worldcereal/` with a `manifest.json` containing `product: "temporarycrops"`, `version: "2021 v100"`, `license: "CC BY 4.0"`, and `rasters: [{"file":"<relative GeoTIFF>","source_url":"<official ESA/Zenodo HTTPS URL>","sha256":"<64 lowercase hex>"}]`. Never use a global archive or an unverified checksum.

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
