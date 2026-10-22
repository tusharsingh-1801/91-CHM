# Remaining dataset access and verification

All six requested connectors now have a shared Python extraction/persistence/API/UI path. The scripts do not replace missing measurements with fabricated values. See [STATUS.md](STATUS.md) for verification evidence and exact completion limits.

## Provider-specific acquisition

- **ESA WorldCover 2021:** Download the official FlatGeobuf index once, select intersecting tiles for the submitted polygon, and retrieve only clipped raster blocks using validated HTTP byte ranges. The engine applies source CRS transforms, nodata masks, equal-area fractional clipping, coverage accounting and land-cover class aggregation. Cropland share is historical map context, not crop identity.
- **CHIRPS v3:** Advertised official daily files are looked up from the provider's year directories. Final `rnl` is preferred; preliminary `sat` is used when final is absent or returns 404. Each daily estimate includes source URL, revision, spatial coverage and missing status. Monthly totals distinguish requested, available, final, preliminary and unavailable days; missing is never converted to zero. Preliminary data is eligible for refresh on a later sync.
- **ISRIC SoilGrids:** Uses the provider's official WCS `GetCoverage` endpoint, rather than the unavailable REST endpoint. Requests are bounded to the submitted field bbox and native 250 m-scale dimensions for 0–5 cm pH, SOC, nitrogen, sand, silt and clay, including mean, Q0.05, Q0.95 and uncertainty. Native integer scale factors are converted to pH, g/kg or percent. Results are model predictions and cannot replace laboratory tests.
- **ESA WorldCereal:** Zenodo metadata is checked, but its large global archive is not downloaded automatically. Use the authenticated WorldCereal/CDSE workflow to export a 2021 v100 `temporarycrops` map for the AOI, then provide the relative raster filename, official HTTPS source URL, declared product/license and SHA-256 in the local manifest. The importer rejects path escapes and changed checksums, intersects the actual field polygon, and reports coverage/classes as a historical map.
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

## Known non-completions

This implementation does not automatically obtain CDSE credentials, certify FAO permissions, download very large global archives, invent CropHarvest constituent licenses, or claim crop identity from 2021 rasters. No farmer-owned field was available in the verified local database; no real farmer dataset run was persisted. See [STATUS.md](STATUS.md) and [catalog.json](catalog.json) for the latest per-provider evidence.

## Processed CropHarvest acquisition

Run `npm run data:acquire:cropharvest` to acquire the pinned official `features.tar.gz` (about 82 MB), verify its provider MD5, reject unsafe archive paths/links, preserve existing matching samples and write per-file SHA-256 receipts. Samples stay in ignored `.local/datasets/reference/cropharvest/features/`. The acquisition completed with 87,464 samples; all IDs matched the pinned labels in the local audit. This command does not download the 26.7 GB raw EO archive, modify field crop dates, or train a model.

The existing `data:sync:references` CropHarvest provider now validates the receipt and actual sample checksums, then persists feature counts/source metadata alongside its label status. The field reference panel shows these counts explicitly. Source-specific training terms and held-out metrics remain separate from acquisition.
