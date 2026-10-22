# Telangana crop-calendar provenance (2026-10-22)

**Status:** Crop-specific sowing + harvesting month pairs for the selected Telangana test field are **not yet verified**. Do not import invented dates or historical Andhra Pradesh records as Telangana data.

## Inspected local reference sources

- JRC ASAP `crop_calendar_gaul0.zip`: 287 rows, India 0.
- JRC ASAP `crop_calendar_gaul1.zip`: 3068 rows, India 0.
- India Directorate of Economics & Statistics, `page256-319.pdf`: 64 pages, Appendix IV crop-calendar tables on PDF pages 46–61. Historical Andhra Pradesh entries; no Telangana entry found in extracted tables. Original: https://desagri.gov.in/wp-content/uploads/2021/04/page256-319.pdf

These sources must **not** be transformed into Telangana-specific planting/harvest rows.

## Relevant Telangana sources for manual extraction and verification

- Telangana Department of Agriculture official publications and Padi Pantalu: https://www.agri.telangana.gov.in/content_padi.php?U=20 — monthly agriculture publications, not automatically a structured crop calendar.
- Telangana Department of Agriculture agricultural operations report: https://agri.telangana.gov.in/open_record.php?ID=145 — describes paddy nurseries and rainfed sowing activity; does not establish complete crop-specific start/end month windows.
- Professor Jayashankar Telangana State Agricultural University, maize sowing-date experiment: https://pjtsau.edu.in/files/publications/2021/Journal-of-Research-PJTSAU-49-3-1.pdf — experimental 2016 dates; **not** a general crop calendar.
- FAO Crop Calendar: https://cropcalendar.apps.fao.org/#/home — check explicit Telangana/regional applicability and use permissions before import.

## Implementation policy

1. Keep the reference-calendar API status as `not_imported` / unavailable until vetted rows exist.
2. Do not replace actual farmer-entered crop dates with reference months.
3. Require explicit crop, geography, planting and harvest windows, original source URL, publication title, reviewed date, and checked usage permission for every row.
4. Validate with `scripts/validate-fao-calendar.py`; run `scripts/import-fao-calendar.mjs` without `--apply` first; only then import reviewed rows.
5. Run `python3 scripts/audit-india-crop-calendar.py` to reproduce local-source coverage audit.

This documentation is a source audit, **not** evidence of a successful Telangana calendar import.
