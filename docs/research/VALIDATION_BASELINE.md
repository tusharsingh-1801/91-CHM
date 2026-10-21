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

## Expert review adapter (increment 2)
`evaluateReviewedInspections` includes a record only when its provenance is `expert_review`, review status is `expert_verified`, and both a nonempty reviewer identifier and parseable review timestamp are supplied. Owner-reported or synthetic records are excluded, even if their status string says `expert_verified`. The evaluator is intentionally pure; it does **not** authenticate reviewers. No route should accept review metadata from an untrusted client as proof of expertise. The next implementation must add role-authorized server-side verification, immutable audit history and independent label acquisition before collecting performance evidence.

## Privacy-first research projection (increment 3)
`projectVerifiedResearchRows` is a **pure allowlist projection only**, not a user-facing export endpoint. It omits field IDs, GPS, reporter identity, free-text symptoms and notes, photo references, crop name, and exact dates. It emits month-level dates, controlled-category values, and study-scoped aliases supplied by the calling backend. It only selects records already labelled `expert_review` and `expert_verified`.
**Not production-safe by itself:** Before wiring to an API, implement authenticated reviewer role assignment, audit records, independent verification checks, explicit participant consent, server-side filtered queries and cryptographically unpredictable study-scoped alias generation. Review small-group and quasi-identifier re-identification risk; month + rare categorical combinations can still identify a participant. Enforce minimum aggregation sizes/suppression for any public outputs. No actual data is exported by this increment.
