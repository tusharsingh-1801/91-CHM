# TerraScope public data package

This is a curated source catalog and a static, attributable Indian public-boundary research sample. It covers the project's weather, imagery, boundary, vegetation, crop-map, soil and agronomy-reference needs. It is not an exhaustive list of every internet dataset.

## What is actually included

- `catalog.json`: ten reviewed sources, their use, access links, integration status and limitations.
- `demo/ftw-india-sample.geojson`: three genuine public parcel polygons, extracted from the 10,013-row FTW India benchmark.
- `demo/manifest.json`: source checksum, file size and reproducible selection rules.
- `ATTRIBUTION.md`: authors, source publication, redistribution license and changes.
- The original 7.47 MB GeoParquet is not bundled or currently stored in the workspace; the three-polygon extract and its source manifest are included.
- `requirements.txt`: optional GeoParquet tooling. The regular app does not require PyArrow.

The app does not import these sample polygons. They represent 2016 reference boundaries and may have changed; they are not user farms, current crop records, or evidence of current ownership.

## Reproduce the research extract

To re-download and regenerate the static sample from the full source:

```bash
npm run data:download
.venv/bin/python -m pip install -r datasets/requirements.txt
.venv/bin/python scripts/prepare-public-demo.py
```

These commands only regenerate the local research files; no app fields or observations are created.

## Which app values each source can fill

| App value | Suitable source | What remains unknown |
|---|---|---|
| Coordinates and polygon | User-drawn field boundary | Research sample polygons are not user's farms |
| Area | PostGIS geodesic calculation on that polygon | Exact surveyed/legal area |
| Temperature, rain, humidity | NASA POWER daily API | Actual irrigation, on-site sensor readings |
| Observation dates and cloud cover | Sentinel-2 Harmonized collection via the Google Earth Engine API | Whether every field pixel is cloud-free |
| NDVI/NDRE/NDMI/SAVI/EVI | Earth Engine processing of dated scenes and field polygon | Farm yield or disease diagnosis |
| Health score and stress zones | Existing experimental formulas from valid scene pixels | Agronomic calibration and uncertainty |
| Current crop type | Farmer record or independently validated current labels | FTW boundary data supplies no crop identity |
| Planting/harvest dates | Actual farm records | Regional FAO windows are reference information only |
| Yield and field events | Actual farm measurements/management records | Cannot be inferred merely by populating UI inputs |
| Soil properties | ISRIC SoilGrids WCS integration | A local user-reported field result is persisted with 17.68% spatial coverage; modeled estimates are not soil-test results |
| Crop classification training | Optional CropHarvest benchmark | Training labels are not current labels for saved fields |
| Crop/land-cover context | ESA WorldCereal and ESA WorldCover | Historical field-clipped map results are integrated; they do not identify an individual current crop |

## Official sources

The UI at `/datasets` and `catalog.json` link to the relevant official pages. NASA POWER, Sentinel-2 through Google Earth Engine, and Open-Meteo forecasts are connected services. Earth Engine also supplies an AOI-scoped historical WorldCereal summary; local raster import remains supported. Local reference-data runs persist WorldCover, CHIRPS and SoilGrids extractions. CropHarvest is a research-label/feature acquisition and evaluation workflow, not farm inference. FTW is retained only as a static research sample and is not imported as a farm boundary. FAO calendar rows require reviewed, permission-documented records; regional windows are never treated as actual field dates.

References: [FTW India](https://source.coop/kerner-lab/fields-of-the-world-india/boundaries_india_2016.parquet), [FTW source licenses](https://github.com/fieldsoftheworld/ftw-datasets-list), [NASA POWER](https://power.larc.nasa.gov/docs/services/api/temporal/daily/), [Sentinel-2 Harmonized on Earth Engine](https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S2_SR_HARMONIZED), [Earth Engine service authentication](https://developers.google.com/earth-engine/guides/service_account), [CropHarvest](https://github.com/nasaharvest/cropharvest), [WorldCereal](https://esa-worldcereal.org/en/products/global-maps), [WorldCover](https://esa-worldcover.org/en/data-access), [SoilGrids](https://isric.org/explore/soilgrids), [CHIRPS v3](https://chc.ucsb.edu/data/chirps3), [FAO calendar](https://cropcalendar.apps.fao.org/).

See [STATUS.md](STATUS.md) for verified local import counts and data limitations.
