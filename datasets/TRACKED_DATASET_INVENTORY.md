# Tracked Dataset Inventory — CHM

Audit date: 2026-11-27
Repository: https://github.com/tusharsingh-1801/91-CHM
Audited default-branch tree SHA: `a7cfad2e6270cd78666e8f0572bf233e4e408181`

## Scope and counts

This inventory counts Git-tracked blobs under `datasets/` in the inspected repository tree at commit `a7cfad2e6270cd78666e8f0572bf233e4e408181`. It does not count ignored local files under `.local/datasets/` and does not inspect the contents of every CSV.

| Item | Count |
|---|---:|
| Tracked files under `datasets/` | 1,695 |
| CSV files | 1,682 |
| Markdown files | 9 |
| JSON files | 3 |
| TXT files | 1 |
| CSV files under `datasets/TimeSen2Crop/` | 1,677 |
| Other CSV files | 5 |

## Identified dataset-bearing paths

* `datasets/TimeSen2Crop/` — 1,677 tracked CSV files, all under `2019_33UVP/`, with 853 files in class folder `0/`, 823 in `1/`, and one `dates.csv`. This is only the 2019 tile, not the full 15-tile 2017/18 dataset. The register records Zenodo record 4715631 / DOI 10.1109/JSTARS.2021.3073965 as CC BY 4.0. Official dataset documentation describes a 2019 tile as an additional agronomic year; the 2019 tile's files contain 9 spectral bands plus a quality flag. **Licence finding:** CC BY 4.0 is supported by the Zenodo/Hugging Face dataset metadata and original paper. **Provenance finding:** the 1,677 repository CSVs have not been byte- or checksum-matched to the Zenodo archive, so retain as licence-declared but provenance-unverified until that comparison is done. The dataset is Austria crop-type data, not Indian crop-stress labels; do not treat it as Indian field-health ground truth.
* `datasets/ground-truth/observation-template.csv` — field-observation template, not an external third-party dataset.
* `datasets/reference/india-crop-calendar-ggcmi.csv` — 0.5° reference calendar entries attributed in the file to RiceAtlas and IndiaAgStat and described in the register as derived from GGCMI Phase 3 (Zenodo 5062513, CC BY 4.0). Check the source-layer rights and keep the attribution; do not treat this derived CSV as farmer observations.
* `datasets/reference/india-field-calendar-import-DRAFT.csv` — draft import file; do not treat the filename as evidence of licence clearance.
* `datasets/fao-calendar-template.csv` and `datasets/fao-calendar-template.original.csv` — both are header-only blank templates in the inspected GitHub versions; no FAO records are present in these files. The header/schema alone does not establish FAO endorsement or a licence to FAO data.

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


## 2026-11-27 follow-up audit

* Recursive Git tree returned 1,695 blobs under `datasets/`: 1,682 CSV, 9 Markdown, 3 JSON, 1 TXT. This supersedes the earlier count in this file.
* TimeSen2Crop repository subset is exactly `datasets/TimeSen2Crop/2019_33UVP/`; it contains only class folders `0` and `1`, with 853 and 823 sample CSVs respectively, plus one `dates.csv`. Do not describe this as the complete TimeSen2Crop release.
* The five other CSV files are: two blank FAO calendar templates, one blank ground-truth observation template, `india-crop-calendar-ggcmi.csv`, and `india-field-calendar-import-DRAFT.csv`. The latter is explicitly a draft and is not cleared for release. The GGCMI reference CSV cites RiceAtlas and IndiaAgStat; preserve its source attribution, and keep the source-layer rights review separate from the TimeSen2Crop licence decision.
* A Git tree SHA is not a SHA-256 checksum of the original Zenodo archive. No archive-level checksum match was performed in this audit.


## 2026-11-27 TimeSen2Crop follow-up (live main-branch inspection)

* Re-read the live recursive Git tree after the dataset-register update. The inspected main tree SHA is `2abccd7c446dd40fe5e00b246ba8562f61e744d3`; it contains 1,677 Git blobs under `datasets/TimeSen2Crop/`. The paths remain confined to `2019_33UVP/`, class folders `0/` and `1/`, plus `dates.csv`.
* The GitHub tree exposes Git blob object IDs and byte sizes for each tracked file. These are Git object identifiers, **not** SHA-256 hashes from the original Zenodo archive and cannot prove archive identity.
* The official dataset description PDF lists a dedicated 2019 33UVP tile as part of TimeSen2Crop; the Hugging Face dataset documentation cites the original Zenodo record and CC BY 4.0. These sources support the dataset identity and source-level licence statement, but do not establish that this repository's 1,677 individual files are byte-identical to Zenodo.
* No Zenodo archive was downloaded or checksum-compared in this audit. **Provenance remains unverified.** Keep this tracked subset out of any dataset release bundle until an archive-level checksum comparison or reproducible source-file match is completed.
* The Zenodo record describes the wider dataset as Austrian Sentinel-2 crop-type time series. It is not Indian crop-disease or field-stress ground truth; do not present it as such in CHM.
