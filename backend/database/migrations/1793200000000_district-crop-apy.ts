import type {MigrationBuilder} from 'node-pg-migrate';

export async function up(pgm:MigrationBuilder):Promise<void>{
 pgm.sql(`
  create table district_crop_apy (
   source_id text not null check(source_id in ('des','upag')),
   source_row_id text not null,
   crop_year text not null,
   state_name text not null,
   state_code text,
   district_name text not null,
   district_code text,
   season text,
   crop_name text not null,
   crop_code text,
   crop_category text,
   area_value numeric,
   area_unit text,
   production_value numeric,
   production_unit text,
   yield_value numeric,
   yield_unit text,
   source_url text not null,
   license text not null,
   source_record jsonb not null,
   imported_at timestamptz not null default now(),
   primary key(source_id,source_row_id)
  );
  create index district_crop_apy_lookup on district_crop_apy(state_name,crop_name,crop_year,source_id,district_name);
  create index district_crop_apy_district on district_crop_apy(state_name,district_name,crop_year);
 `);
}

export async function down(pgm:MigrationBuilder):Promise<void>{pgm.dropTable('district_crop_apy');}
