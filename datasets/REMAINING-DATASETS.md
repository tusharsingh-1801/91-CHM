# Remaining public datasets: acquisition status

This is an **opt-in reference-data fetcher**, not an ML training pipeline or PostgreSQL ingestion. It never fills missing farmer observations with guesses.

Run from repository root:

```bash
python3 scripts/fetch-reference-datasets.py --source all
python3 scripts/fetch-reference-datasets.py --source soilgrids --lat 26.23 --lon 81.24
```

The coordinates above are an example only; use actual field coordinates. SoilGrids point data is a coarse modeled estimate, not a laboratory soil test. Its public REST service may return 429/5xx or be unavailable. WorldCover acquisition fetches the official GeoJSON tile **index only**, not raster pixels. All outputs and the machine-readable failure/status report are stored in ignored `.local/datasets/reference/`.

| Source | Current acquisition scope |
|---|---|
| SoilGrids | Point-query downloader with actual coordinates; no automatic DB import |
| WorldCover | Official FlatGeobuf tile index downloader; 516,760-byte index confirmed by local run on 2026-10-22; raster tiles not fetched |
| CropHarvest | Reference only; no training data downloaded |
| WorldCereal | Reference only; no geospatial extraction implemented |
| CHIRPS v3 | Reference only; no time-series extraction implemented |
| FAO Crop Calendar | Reference only; no crop/region extraction implemented |

No verified crop-disease, crop-yield, or independent expert-labelled ground truth is supplied by these connectors. Do not claim trained-model performance from these reference files.
