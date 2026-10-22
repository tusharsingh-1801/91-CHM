import type {MigrationBuilder} from 'node-pg-migrate';
export async function up(pgm:MigrationBuilder):Promise<void>{
 pgm.sql(`
 create table reference_dataset_runs (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references fields(id) on delete cascade,
  boundary_version integer not null,
  provider text not null check(provider in ('worldcover','chirps','soilgrids','worldcereal','cropharvest','fao-calendar')),
  status text not null check(status in ('downloaded','integrated','blocked','manual','failed','not_configured')),
  source text not null, version text not null, source_url text not null, license text not null,
  period text not null default '', coverage_percent double precision check(coverage_percent between 0 and 100),
  payload jsonb not null default '{}', error jsonb,
  fetched_at timestamptz not null, created_at timestamptz not null default now()
 );
 create index reference_runs_field_latest on reference_dataset_runs(field_id,boundary_version,provider,created_at desc,id desc);
 `);
}
export async function down(pgm:MigrationBuilder):Promise<void>{pgm.dropTable('reference_dataset_runs');}
