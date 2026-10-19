# TerraScope research validation baseline

## Current scope
The pure TypeScript evaluator in `shared/research/metrics.ts` computes confusion-matrix counts and binary classification metrics from independently verified inspection labels only. Farmer-reported, demo and unverified labels must have `verified:false` and are excluded. Missing denominators produce `null` (not 0, not 100%). The `assertFieldDisjoint` guard prevents a field appearing in both training and evaluation groups.

## Important limitations
* No labelled evaluation dataset, expert verification endpoint, consent-based export or trained predictive model is introduced by this change.
* `verified` is an input assertion; real applications MUST derive it from authenticated expert-verification records rather than trusting arbitrary client JSON.
* F1 and accuracy are uncomputed when the required denominator is absent.
* Field separation alone does not guarantee spatial/temporal independence; experiments must apply additional holdouts.
* Metrics cannot be claimed as measured TerraScope performance until obtained from actual independently verified ground truth.

## How to run
`npm run test:research`

## Next PR scope
Add authenticated reviewer verification with audit history, migration, user-facing verification state, consent-aware scoped dataset export, and group-split research runner. Do not expose farm location or photographs in generic exports.
