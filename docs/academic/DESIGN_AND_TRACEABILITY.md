# CHM design and requirement traceability

Verified against the current React/Express/PostgreSQL/PostGIS/FastAPI implementation on 16 October 2026. These diagrams describe implemented components, not an assertion of external provider uptime or agricultural accuracy.

## Components

```mermaid
flowchart TD
    U[Field manager] --> W[Bilingual React interface]
    W --> A[Express API and ownership checks]
    A --> D[(PostgreSQL and PostGIS)]
    A --> P[FastAPI raster and photo engine]
    A --> J[Job worker inside API process]
    J --> S[Earth Search Sentinel-2]
    J --> N[NASA POWER history]
    J --> P
    J --> D
```

Leaflet/OpenStreetMap supplies the interactive basemap; it is not the Sentinel acquisition. Gemini is the credential-dependent crop assistant. An independent forecast provider and automatic disease classifier are not implemented.

## Ownership and evidence data model

```mermaid
erDiagram
    APP_USERS ||--o{ FIELDS : owns
    APP_USERS ||--o{ APP_SESSIONS : authenticates
    FIELDS ||--o{ FIELD_BOUNDARY_VERSIONS : archives
    FIELDS ||--o{ VEGETATION_INDICES : measures
    FIELDS ||--o{ SATELLITE_SCENES : discovers
    FIELDS {
        uuid id PK
        uuid owner_id FK
        geometry boundary_geom
        integer boundary_version
    }
    VEGETATION_INDICES {
        uuid field_id FK
        text scene_id
        date observed_on
        integer boundary_version
        boolean accepted
        text calculation_version
    }
```

Observation identity includes field, scene, observed date and boundary version. Current assessments use accepted measured imagery for the current boundary. The stored experimental score is separate from image coverage.

## Field work data model

```mermaid
erDiagram
    FIELDS ||--o{ FIELD_TASKS : plans
    FIELDS ||--o{ FIELD_EVENTS : records
    FIELDS ||--o{ SCOUTING_CASES : observes
    SCOUTING_CASES ||--o{ SCOUTING_PHOTOS : contains
    FIELDS ||--o{ INGESTION_JOBS : processes
    FIELDS ||--o{ ALERTS : notices
```

Photos are stored privately and accessed through owned API routes. Jobs have attempts, status, heartbeat and lease token; they run inside the existing API process. Tasks/alerts record user actions; resolving them does not establish biological recovery.

## Requirements and executable evidence

| Requirement | Owning implementation | Verification |
|---|---|---|
| Field save independent of imagery, optional dates | AddFieldWizard, fieldsController | actions.spec.ts; field-workflows.spec.ts |
| Missing/stale evidence is not healthy/unhealthy crop | shared/evidence.ts; fieldCopy.ts; Dashboard | evidence.test.ts; plain-language.spec.ts |
| Same-date images preserve exact selected scene | FieldMap | field-workflows.spec.ts |
| Boundary editing versions evidence | fieldsController; boundary migrations | satellite.integration.test.ts; actions.spec.ts |
| Understandable next step and demo-only recovery | Dashboard; FieldOverview; Help | plain-language.spec.ts |
| Hindi/English, acres/hectares and mobile layouts | preferences; index.css | farmer-workspace.spec.ts; responsive.spec.ts |
| Visit creation/retry identity and status | tasksController; FieldOverview | farmer-workspace.spec.ts; satellite.integration.test.ts |
| Photo upload preserves notes and states no diagnosis | FieldHistory; scoutingController; engine image inspection | scouting.spec.ts; engine tests |
| Owned field/data access | auth middleware and routes | auth.spec.ts; owner integration case |
| Queue deduplication, recovery and stale-boundary handling | services/jobs.ts | jobs integration case |
| Versioned quality-aware raster processing | services/satellite.ts; engine/main.py | satellite.integration.test.ts; engine/test_evidence.py |
| Dated trends and controlled comparison | FieldAnalysis; VegetationChart | evidence.spec.ts; engine tests |
| CSV/GeoJSON and browser print report | FieldReport; shared/exports.ts | exports.test.ts; farmer-workspace.spec.ts |

Frontend test files are under `tests/ui`; backend tests are under `backend/api`; Python tests are under `backend/engine`. Browser APIs/tiles are fixtures. PostGIS CI uses actual database transactions with controlled engine responses. Neither establishes live satellite acceptance or diagnosis accuracy.

The WBS, methodology, risk register and schedule remain in [Phase II planning](PHASE_II_PLANNING_DESIGN.md). Current checks, performance environment, remaining gaps and demo script are in [Submission readiness](SUBMISSION_READINESS.md).
