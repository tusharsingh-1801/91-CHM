# Tracked Dataset Inventory — CHM

Audit date: 2026-11-27
Repository: https://github.com/tusharsingh-1801/91-CHM
Audited default-branch tree SHA: dc081ba2420b13e651954a4b103f03a207367c00

## Scope and counts

This inventory counts Git-tracked blobs under `datasets/` in the inspected repository tree. It does not count ignored local files under `.local/datasets/` and does not inspect the contents of every CSV.

| Item | Count |
|---|---:|
| Tracked files under `datasets/` | 1,693 |
| CSV files | 1,682 |
| Markdown files | 8 |
| JSON files | 2 |
| TXT files | 1 |
| CSV files under `datasets/TimeSen2Crop/` | 1,677 |
| Other CSV files | 5 |

## Identified dataset-bearing paths

* `datasets/TimeSen2Crop/` — 1,677 tracked CSV files, nested by year/tile/sequence. The training register records TimeSen2Crop (Zenodo record 4715631; DOI 10.1109/JSTARS.2021.3073965) as CC BY 4.0 and licence-wise allowed, but says it is not useful for CHM's crop-stress task (crop-type labels, region not stated in inspected record) and that the on-disk copy was not hashed against Zenodo. **Action:** verify the exact downloaded files against Zenodo checksums and retain attribution. Do not claim geographic suitability or model relevance from the licence alone.
* `datasets/ground-truth/observation-template.csv` — field-observation template, not an external third-party dataset.
* `datasets/reference/india-crop-calendar-ggcmi.csv` — reference calendar data; exact source/version/licence must be checked against the relevant register entry before public reuse.
* `datasets/reference/india-field-calendar-import-DRAFT.csv` — draft import file; do not treat the filename as evidence of licence clearance.
* `datasets/fao-calendar-template.csv` and `datasets/fao-calendar-template.original.csv` — calendar template files. Confirm that the actual content is only a blank template or independently authored structure and does not reproduce protected FAO text/data beyond permitted terms.

## Important distinction

The register also describes datasets stored under the ignored `.local/datasets/` directory (including PLDD-UP, AgriFieldNet, DES statistics, Telangana challenge data, UAV maize and other reference material). Those local files are **not part of this Git-tracked count**. A full inventory of those local files requires running a local filesystem scan on the owner's machine; the Git tree cannot reveal ignored files.

## Release implications

1. The 1,677 TimeSen2Crop CSVs are already tracked in the public repository tree inspected at the SHA above. This is not a newly uploaded dataset in this audit.
2. The current path-based release gate does not verify all CSV content or prove that the exact TimeSen2Crop files match the licensed Zenodo version.
3. Do not use this inventory as proof that every tracked file has a verified licence.
4. Keep the dataset register, third-party notices, source licence files and checksums synchronized with each exact dataset version.
5. A separate local scan and checksum comparison is required for ignored `.local/datasets/` content.

## CI research-test integration

The missing `npm run test:research` step has been replaced with a dedicated Python 3.11 setup, a lightweight test dependency file (`scripts/ml/requirements-ci.txt`), and the repository-documented command `python -m unittest test_ml_pipeline -v` from `scripts/ml/`. The updated GitHub Actions run is pending/subject to the linked run result; do not treat the configuration change as a passing test until that run completes.
