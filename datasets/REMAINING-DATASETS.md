# Remaining dataset access and verification

All six requested connectors now have a shared Python extraction/persistence/API/UI path. The scripts do not replace missing measurements with fabricated values. See [STATUS.md](STATUS.md) for verification evidence and exact completion limits.

## Roadmap review (30 October 2026)

- **Ground truth:** `ground-truth/observation-template.csv` is intentionally blank. Genuine crop-health labels require consented field visits and independently recorded observations; satellite indices do not establish the cause of stress. The Telangana Crop Health source is documented for review, but its linked ADeX explorer is unavailable and the separate Zindi challenge has its own terms. Do not import a copy until provenance, privacy and reuse terms are confirmed.
- **Official yield:** the dynamic [DES APY portal](https://data.desagri.gov.in/website/crops-apy-report-web) did not yield a static report, so two DES-sourced datasets were downloaded from the India Data Portal mirror into ignored `.local/datasets/yield/raw/`. The UPAg version covers 2013–14 through 2024–25; a filtered file contains 702 Uttar Pradesh wheat/rice district-year rows for 2021–22 through 2024–25. Checksums and provenance are in the local manifest. District statistics are regional comparisons, not field yield. The supplied PDF contains 2004–2007 district data and is not a current source.
- **Crop calendar:** the [UPAg domestic calendar](https://upag.gov.in/national-calendar) identifies its source as ICAR and Indian Horticulture Database (2014), but returned no usable rows. A state-calendar technical appendix host could not be resolved. As a practical interim alternative, the official [ICAR 2025 Kharif advisory](https://icar.gov.in/sites/default/files/2025-10/ICAR-En-Kharif-Agro-Advisories-for-Farmers-2025.pdf) is saved in `.local/datasets/calendar/raw/`; it is agronomic guidance, not a structured calendar, and its redistribution terms need review. No FAO calendar rows were imported.
- **Boundaries:** the supplied `boundaries_india_2016.parquet` matches the already included Fields of the World sample by checksum. No duplicate was added. These historical public polygons are research boundaries, not current farmer-owned fields.
- **CropHarvest:** the verified local cache already contains 87,464 feature samples. Do not download it again. Training remains blocked on source-specific constituent terms and a valid held-out evaluation; no model or accuracy score is claimed.
- **Crop-health ground truth:** no validated, reusable public field-observation file was available to download. The FAIR Forward Telangana catalogue's linked ADeX data endpoint was unavailable and the separate Zindi copy has not had its provenance/terms checked. Use the blank consent-based field template until that is resolved; disease-photo sets are not substitutes for satellite-matched field health labels.

## Provider-specific acquisition

- **ESA WorldCover 2021:** Download the official FlatGeobuf index once, select intersecting tiles for the submitted polygon, and retrieve only clipped raster blocks using validated HTTP byte ranges. The engine applies source CRS transforms, nodata masks, equal-area fractional clipping, coverage accounting and land-cover class aggregation. Cropland share is historical map context, not crop identity.
- **CHIRPS v3:** Advertised official daily files are looked up from the provider's year directories. Final `rnl` is preferred; preliminary `sat` is used when final is absent or returns 404. Each daily estimate includes source URL, revision, spatial coverage and missing status. Monthly totals distinguish requested, available, final, preliminary and unavailable days; missing is never converted to zero. Preliminary data is eligible for refresh on a later sync.
- **ISRIC SoilGrids:** Uses the provider's official WCS `GetCoverage` endpoint, rather than the unavailable REST endpoint. Requests are bounded to the submitted field bbox and native 250 m-scale dimensions for 0–5 cm pH, SOC, nitrogen, sand, silt and clay, including mean, Q0.05, Q0.95 and uncertainty. Native integer scale factors are converted to pH, g/kg or percent. Results are model predictions and cannot replace laboratory tests.
- **ESA WorldCereal:** When Earth Engine is configured, the app queries the official `ESA/WorldCereal/2021/MODELS/v100` collection and computes the annual 2021 `temporarycrops` summary for the submitted field polygon. The field-scoped result is persisted with mapped coverage and confidence and is labeled historical, not current crop identity. Installations without Earth Engine can use the checksum-validated AOI-raster import; a global archive is not downloaded.
- **NASA Harvest CropHarvest:** Fetches `labels.geojson` from pinned Zenodo record 10251170 after size, record license, and provider MD5 checks; the verified label cache also reports SHA-256. The official processed `features.tar.gz` archive is only 82,479,907 bytes and is now downloaded/verified with 87,464 HDF5 samples; the 26.7 GB raw `eo_data.tar.gz` is not needed or downloaded. Training needs actual official feature HDF5 samples and each constituent dataset's license/citation. It blocks sample/label mismatch, missing attribution, duplicate data, incompatible shapes, checksum failure, source-dataset leakage and invalid held-out partitions. No score is emitted until real held-out evaluation runs.
- **FAO Crop Calendar:** No verified permission for automated bulk extraction or redistribution was found. The direct-fetcher reports that blocker. Its opt-in manual CSV import validates field-scoped regional recommendations, month/date ranges, FAO HTTPS source, license and per-row permission reference. These records remain clearly labeled regional guidance, not actual farm dates.

## Cache, sync and API

Local source files and reports are ignored under `.local/datasets/reference/`. The sync command needs existing, actual PostgreSQL field IDs:

```bash
npm run data:sync:references -- --fields <owned-field-uuid>[,<owned-field-uuid>] \
  --providers worldcover,chirps,soilgrids --start YYYY-MM-DD --end YYYY-MM-DD
```

Supported providers: `worldcover`, `chirps`, `soilgrids`, `worldcereal`, `cropharvest`, `fao-calendar`. The date interval is optional, but `--start` and `--end` must be supplied together. The command requires explicit real UUIDs, refuses more than 50 IDs, reads current PostGIS field polygons and records a JSON summary at `.local/datasets/reference/sync-report.json`. One provider failure does not stop other providers. Missing fields, extraction failures and persistence errors are reported; the process exits non-zero when a requested field cannot be synchronized.

`reference_dataset_runs` stores provider, license, source URL, fetch timestamp, status, period, coverage, diagnostics and JSON statistics against `field_id` and `boundary_version`. A boundary edit during acquisition prevents insertion. Authenticated `GET /api/fields/:fieldId/datasets` validates field ownership, paginates, and hides results for prior boundary versions. The field overview exposes provider status and source caveats in Hindi/English.

District yield is a regional benchmark and uses a separate `district_crop_apy` table. The DES and UPAg CSVs are imported idempotently with `npm run data:sync:apy`; authenticated `/api/datasets/apy` routes power the `/datasets` explorer. Do not attach these district aggregates to individual field yield records.

## Known non-completions

This implementation does not automatically obtain CDSE credentials, certify FAO permissions, download very large global archives, invent CropHarvest constituent licenses, or claim crop identity from 2021 rasters. Development field results are local and boundary-scoped; each deployment must run its own sync. FAO calendar rows are not present, and CropHarvest has not been trained. See [STATUS.md](STATUS.md) and [catalog.json](catalog.json) for the latest per-provider evidence.

## Processed CropHarvest acquisition

Run `npm run data:acquire:cropharvest` to acquire the pinned official `features.tar.gz` (about 82 MB), verify its provider MD5, reject unsafe archive paths/links, preserve existing matching samples and write per-file SHA-256 receipts. The command selects the project's virtual-environment Python on Windows and Unix-like systems. Samples stay in ignored `.local/datasets/reference/cropharvest/features/`. The acquisition completed with 87,464 samples; all feature IDs matched pinned labels. The label audit found one record with invalid geometry, so review the raw benchmark labels before using them for training. This command does not download the 26.7 GB raw EO archive, modify field crop dates, or train a model.

The existing `data:sync:references` CropHarvest provider now validates the receipt and actual sample checksums, then persists feature counts/source metadata alongside its label status. The field reference panel shows these counts explicitly. Source-specific training terms and held-out metrics remain separate from acquisition.
