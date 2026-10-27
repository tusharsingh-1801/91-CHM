# Telangana field-survey crop-health dataset — acquisition

Source research project: https://fair-forward.github.io/datasets/projects/ui_29-predicting_crop_health_using_opensource_geospatial/

Public research copy: https://github.com/pranavmyname/zindi_crop_health/blob/main/train.csv

The FAIR Forward catalog describes >12,000 observations collected through field visits and farmer surveys in Telangana (2022–2024), CC BY 4.0, with crop health, type, yield and irrigation variables. The **public research training copy** is a subset: 7,888 CSV records observed during inspection, with `category` labels, farm geometry, and agronomic columns. It has not been independently verified as identical to the original ADeX dataset or checked against challenge redistribution conditions.

## Acquire locally (not committed)
```bash
CHM_ACCEPT_TELANGANA_TERMS=1 python3 scripts/acquire-telangana-ground-truth.py
```
The downloader checks size, CSV schema, Telangana geography and required labels, then writes `.local/datasets/ground-truth/telangana/train.csv` and a SHA-256 receipt. Review source terms and privacy before opting in. **Never commit raw field geometries, FarmID or identifiable farmer records**. The `.local/` directory is ignored.

This dataset is **not** automatically inserted into `fields`, `expert_inspection_reviews`, or model training. Before using it as evaluation ground truth: validate label definitions and collection method; prevent field, spatial, temporal and crop leakage; match Sentinel-2 dates to observation windows; document missing values and independent verification limitations. A survey label is not automatically a laboratory-confirmed diagnosis.

Zindi competition: https://zindi.world/competitions/telangana-crop-health-challenge/data

ADeX dataset link listed by FAIR Forward currently returns 404; source-copy identity, permissions and full original dataset access remain unverified. Do not claim the complete >12,000-row ADeX dataset was acquired.
