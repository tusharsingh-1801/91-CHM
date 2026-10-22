# Deployment and operational plan

No public deployment or service purchase has been performed.

Run React's production build behind an HTTPS reverse proxy; route `/api` to the Node service on a private interface. Keep FastAPI raster processing and PostgreSQL/PostGIS on private networking. Use durable PostgreSQL and a private persistent volume for scouting photographs; never serve the photo directory statically. The existing local launcher stays loopback-only.

Environment: retain `.env` locally, configure server secrets through the host's secret manager, keep `AUTH_MODE=required`, `NODE_ENV=production`, `AUTH_SECURE_COOKIE=1` and an explicit HTTPS `APP_ORIGIN`. Do not place `GEMINI_API_KEY`, database credentials or model credentials in `VITE_*` values. Open-Meteo's free endpoint is for this non-commercial academic prototype; [commercial operation requires an appropriate licence](https://open-meteo.com/en/terms). Field coordinates are transmitted only to the selected weather/satellite providers. Use per-provider API budgets and review their terms before releasing a commercial service.

Apply additive migrations before deploying the new API. Make encrypted database and photo-volume backups first. Store backups outside the web root, restrict access and retention, and rehearse restoring to a separate database. Monitor `/api/health` and `/health` on private services, HTTP error/timeout rates, job age and retries, database/storage growth, forecast age and optional-provider failures. Structured request logs must omit cookies, passwords, prompts, keys, full provider URLs and private coordinates.

Rollback: retain the previous static build and service image. Revert application code without dropping new data tables. Do not automatically run destructive down migrations. If a migration requires restoration, stop writers and restore a verified backup to a separate cluster first; reconcile newly collected records before switching traffic.

The API process owns durable worker leases. Only one successful lease may finalize a job; failed workers are recoverable. Scale CPU-heavy raster workers separately before claiming production throughput. Size memory and processing limits based on reproducible tests, not the synthetic browser demo.

Before release: run all local/CI suites against disposable PostGIS; test real login, ownership, a complete forecast and a public Sentinel boundary; verify HTTPS cookies/origin checks; restore a backup; verify PWA offline caching excludes `/api`, private photos and credentials. Opt-in browser notifications operate while the app is open; remote push requires a reviewed subscription service, credentials and delivery mechanism and is not claimed here.
