# TerraScope research validation baseline

## Current scope
The pure TypeScript evaluator in `shared/research/metrics.ts` computes confusion-matrix counts and binary classification metrics from independently verified inspection labels only. Farmer-reported, demo and unverified labels must have `verified:false` and are excluded. Missing denominators produce `null` (not 0, not 100%). The `assertFieldDisjoint` guard prevents a field appearing in both training and evaluation groups.

## Important limitations
* The owner consent and trusted-reviewer workflow do not provide a labelled evaluation dataset, a consent-aware research export or a trained predictive model.
* Review records are stored separately from grower reports and only an authenticated account with a trusted `field_reviewer` role can create one. The API requires a field-visit attestation; it cannot prove that a physical visit occurred.
* F1 and accuracy are uncomputed when the required denominator is absent.
* Field separation alone does not guarantee spatial/temporal independence; experiments must apply additional holdouts.
* Metrics cannot be claimed as measured TerraScope performance until obtained from actual independently verified ground truth.

## How to run
`npm run test:research`

## Consent and review workflow (increment 4)
Owners can opt in or withdraw per scouting case. The consent ledger is append-only and current eligibility is derived from the latest event for the active policy version. Review queue access requires a manually granted, revocable `field_reviewer` role; role assignment is not available to clients. The queue exposes the field boundary, field name and owner-reported categories only to an authorized reviewer after current consent. It excludes reporter identity, notes and photos. The reviewer supplies independent controlled labels and an in-person field-visit attestation. These records use `expert_inspection_reviews` and never mutate the grower's original `owner_reported` record. Review and consent audit rows reject direct updates/deletes; parent record deletion can still cascade for data removal.

**Still not enabled:** a research export endpoint, independent consent text review, a production role-provisioning workflow, alias generation, aggregation suppression and spatial/temporal experiment runner. No live ground-truth cases or model performance are claimed. Do not expose farm locations or photos in generic exports.

## Expert review adapter (increment 2)
`evaluateReviewedInspections` includes a record only when its provenance is `expert_review`, review status is `expert_verified`, and both a nonempty reviewer identifier and parseable review timestamp are supplied. Owner-reported or synthetic records are excluded, even if their status string says `expert_verified`. The evaluator is intentionally pure; it does **not** authenticate reviewers. No route should accept review metadata from an untrusted client as proof of expertise. The next implementation must add role-authorized server-side verification, immutable audit history and independent label acquisition before collecting performance evidence.

## Privacy-first research projection (increment 3)
`projectVerifiedResearchRows` is a **pure allowlist projection only**, not a user-facing export endpoint. It omits field IDs, GPS, reporter identity, free-text symptoms and notes, photo references, crop name, and exact dates. It emits month-level dates, controlled-category values, and study-scoped aliases supplied by the calling backend. It only selects records already labelled `expert_review` and `expert_verified`.
**Not production-safe by itself:** Before wiring to an API, implement authenticated reviewer role assignment, audit records, independent verification checks, explicit participant consent, server-side filtered queries and cryptographically unpredictable study-scoped alias generation. Review small-group and quasi-identifier re-identification risk; month + rare categorical combinations can still identify a participant. Enforce minimum aggregation sizes/suppression for any public outputs. No actual data is exported by this increment.
