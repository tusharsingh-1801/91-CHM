# External crop-condition benchmark — research only

## Added data
- `agrosense-crop-stress-proxy.csv`: 1,786 published Sentinel-2-derived seasonal observations from 99 district/city-centroid sampling locations in Pakistan.
- Source: https://github.com/ALI-SHAHMEER/agrosense-pakistan-crop-stress
- Source file: https://github.com/ALI-SHAHMEER/agrosense-pakistan-crop-stress/blob/main/data/agrosense_crop_stress_dataset.csv
- Authors: Ali Shahmeer, Basit Hassan, Kabir Ghoto (2026).
- Upstream repository license: MIT; retain attribution and check upstream LICENSE for reuse.
- Purpose: exploratory spectral-index comparison, pipeline validation, and methodological discussion **only**.

## Critical scientific restrictions
The labels `Healthy`, `Stressed`, and `Diseased` are **spectral proxy labels**, computed from 0.5 × NDVI + 0.3 × NDRE + 0.2 × EVI using tertiles. These same indices appear in model inputs, causing label circularity. The word `Diseased` is **not** a pathology-confirmed diagnosis. Location coordinates represent administrative centroids with 1 km buffers, not surveyed field boundaries; crop types are nominal and weather/soil features include imputed values.

**Do not** import these rows into farmer fields, `expert_inspection_reviews`, ground-truth research tables, or production crop-health predictions. Do not combine them with independently verified labels or report their classification scores as field-validated health accuracy. No automatic application ingestion is enabled.

## Independently verified field-health ground truth — still missing
A more relevant candidate is the Telangana crop-health field-survey dataset (WRMS / FAIR Forward / ADEX), described as 12,000+ field-survey observations with crop health, crop type, yield and irrigation variables, CC BY 4.0:
https://fair-forward.github.io/datasets/projects/ui_29-predicting_crop_health_using_opensource_geospatial/

Before adding those records, verify the **exact** ADEX download, dataset version, redistribution terms, column meanings, consent/privacy and field/date alignment. Do not invent a CSV or assert these records are already downloaded. Put approved original records under `datasets/external/telangana-ground-truth/` (small distributable files) or ignored `.local/datasets/ground-truth/` (large or sensitive files), with a SHA-256 receipt and a data dictionary. Independently validated field/date labels are needed to evaluate NDVI-based health predictions.

Existing CropHarvest benchmark is crop/non-crop or crop-type labels, not independent disease/stress ground truth. 
