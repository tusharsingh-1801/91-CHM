# CHSM Google Earth Engine Code Editor workflow

## Script
- `earth-engine/CHSM_Code_Editor.js` is a standalone Code Editor workflow for a live demonstration and Drive exports.
- The production Earth Engine API integration remains `backend/engine/earth_engine.py`; do not replace it with the Code Editor script.

## Run
1. Open https://code.earthengine.google.com/ with an Earth Engine-enabled account.
2. Draw/import the actual farm boundary as a valid polygon. Name the import `geometry`.
3. Open `earth-engine/CHSM_Code_Editor.js`, paste its contents into the Code Editor, and click Run.
4. Review Console scene count, date, valid pixels, coverage, indices and evidence status.
5. Toggle the NDVI/NDRE/NDMI/SAVI/EVI layers and review the accepted-scene chart.
6. Open Tasks and start the generated CSV and GeoTIFF exports. They are written to Google Drive folder `CHSM_GEE`.

## Rules aligned to the repository
The script uses Sentinel-2 SR Harmonized, a 90-day search, cloud metadata below 40%, a candidate pool up to 100 scenes, and quality-tests the newest six. It applies the SCL exclusions and accepts imagery only when valid field coverage is at least 70% and there are at least 10 valid pixels. It calculates NDVI, NDRE, NDMI, SAVI and EVI; reports freshness against the 14-day policy; and flags a decline of at least 0.10 in mean NDVI as a reason to inspect, not as a disease diagnosis. ESA WorldCereal is a separate historical 2021 reference and must not be presented as current crop identity.

## Application integration boundary
The live CHSM application calls the Python engine using the registered Earth Engine Cloud project and Application Default Credentials. The Node API applies shared evidence rules and persists boundary-versioned observations. The Code Editor script does not authenticate as a CHSM user, call the private API, write to PostgreSQL, enqueue jobs, or update the dashboard. Exports are research/demo artifacts and are not automatically CHSM observations.

## Submission checklist
- Use the real field polygon; do not submit a test point or sample parcel as the user's farm.
- Capture the Console showing acquisition date, quality acceptance, coverage, pixel count and indices.
- Capture the map with field boundary and NDVI visible.
- If no scene passes quality checks, report it honestly; do not lower thresholds just to get a result.
- Run the repository's `npm run submission:check`, Python engine tests, and the documented live full-stack smoke check separately. A successful Code Editor run does not prove database integration, hosted credentials, or app behavior.
