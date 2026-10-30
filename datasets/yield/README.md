# District crop-yield references

The DES Area, Production & Yield portal can produce state/district reports by crop, season and agricultural year. It is an official regional reference; a district average is not an observed yield for an individual farm. The DES form did not expose a static report during this review, so an India Data Portal mirror of the DES and UPAg district records was downloaded as an alternative. The mirror package lists the Open Data Commons Attribution License and documents its government sources.

1. The two source CSVs are saved under `.local/datasets/yield/raw/`: `crop-wise-area-production-yield.csv` (DES, 1997–2023) and `cropwise-area-production-yield-upag.csv` (DES via UPAg, 2013–14 to 2024–25).
2. `up-wheat-rice-apy-2021-22-onward.csv` is a convenience subset of the UPAg file: Uttar Pradesh, all 75 listed districts, wheat/rice and crop years 2021–22 through 2024–25 (702 rows).
3. `manifest.json` records source URLs, retrieval date, byte sizes and SHA-256 checksums. Keep the source CSVs unchanged and preserve crop codes when comparing rows.
4. The DES mirror exposes units in the DES file; the UPAg file describes yield in kg/ha. Verify units and missing-value conventions before analysis. Leave missing values blank; do not convert them to zero.
5. The datasets are local and ignored by Git. Do not commit or redistribute them until their attribution and license terms have been reviewed for the intended use.

The supplied `dataset1.pdf` is an older district crop-production report (the extracted entries shown are from 2004-2007). It does not meet the 2021-onward request and must not be presented as current yield or as field-level ground truth. Its original source and reuse terms should be verified before redistribution.

The existing [FAO calendar CSV template](../fao-calendar-template.csv) is separate from APY. Regional crop calendars must remain seasonal guidance, never actual farm planting dates.
