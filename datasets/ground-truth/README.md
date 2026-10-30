# Field crop-health observations

This directory contains a blank template, not ground-truth records. Only add observations collected by a person who visited the field and has the required consent. Do not infer these labels from satellite indices or from a model prediction.

## Collection rules

- Record the visit date, crop, growth stage, observed symptoms and observer role.
- Keep an observed condition separate from a suspected cause. Use `disease_status` values such as `not_assessed`, `suspected` or `confirmed`; record how a diagnosis was confirmed.
- Store severity only when the survey protocol defines its scale. Write that scale into the survey data dictionary.
- Obtain field-owner consent for research use and separate consent for public release. Keep the signed consent record outside this repository.
- Use a project field ID or a random observation ID. Do not include farmer names, phone numbers, account IDs or exact household addresses.
- Store geotagged photos and raw records under ignored `.local/datasets/ground-truth/` unless a privacy and redistribution review explicitly approves a small public extract.
- Keep each observation tied to the correct field boundary version and date. Never rewrite an observation as an official farm yield or a confirmed disease label without evidence.

## Template fields

`condition_label` should use the survey's documented categories (for example, `healthy`, `stressed`, `symptomatic`, `unknown`). `stress_type` may record `water`, `nutrient`, `pest`, `disease_suspected`, `other` or `unknown`. These are field observations, not a medical or agronomic diagnosis.

`consent_status` should be `granted`, `not_granted` or `withdrawn`; keep the actual consent document private and put only its internal reference in `consent_reference`. Do not use a row unless consent covers the intended research use.

The project has no validated real crop-health labels yet. The Telangana challenge copy and the spectral-proxy benchmark are not silently imported as farmer-field truth. See [the Telangana source review](../external/TELANGANA-GROUND-TRUTH.md) before considering any external survey copy.
