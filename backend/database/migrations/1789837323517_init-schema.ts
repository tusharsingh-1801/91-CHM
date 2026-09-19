import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createExtension('pgcrypto', { ifNotExists: true });

  pgm.createTable('fields', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'text', notNull: true },
    crop: { type: 'text', notNull: true },
    area_hectares: { type: 'numeric(10,2)', notNull: true, default: 0 },
    health_score: { type: 'integer', notNull: true, default: 0, check: 'health_score between 0 and 100' },
    ndvi_average: { type: 'numeric(4,3)', notNull: true, default: 0 },
    canopy_coverage: { type: 'integer', notNull: true, default: 0, check: 'canopy_coverage between 0 and 100' },
    health_delta: { type: 'numeric(5,2)', notNull: true, default: 0 },
    last_observation: { type: 'date' },
    latitude: { type: 'numeric(9,6)' },
    longitude: { type: 'numeric(9,6)' },
    boundary_geojson: { type: 'jsonb' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  }, { ifNotExists: true });

  pgm.createTable('alerts', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    field_id: { type: 'uuid', notNull: true, references: 'fields(id)', onDelete: 'cascade' },
    title: { type: 'text', notNull: true },
    severity: { type: 'text', notNull: true, check: "severity in ('high', 'positive', 'neutral')" },
    observed_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    resolved: { type: 'boolean', notNull: true, default: false },
  }, { ifNotExists: true });

  pgm.createTable('ndvi_observations', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    field_id: { type: 'uuid', notNull: true, references: 'fields(id)', onDelete: 'cascade' },
    observed_on: { type: 'date', notNull: true },
    ndvi_value: { type: 'numeric(4,3)', notNull: true, check: 'ndvi_value between -1 and 1' },
    cloud_cover: { type: 'integer', notNull: true, default: 0, check: 'cloud_cover between 0 and 100' },
    source: { type: 'text', notNull: true, default: 'Sentinel-2' },
    scene_id: { type: 'text' },
  }, { ifNotExists: true });

  pgm.createTable('weather_observations', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    field_id: { type: 'uuid', notNull: true, references: 'fields(id)', onDelete: 'cascade' },
    observed_on: { type: 'date', notNull: true },
    precipitation_mm: { type: 'numeric(8,2)' },
    temperature_c: { type: 'numeric(6,2)' },
    humidity_percent: { type: 'numeric(6,2)' },
    source: { type: 'text', notNull: true, default: 'NASA POWER' },
    source_url: { type: 'text', notNull: true },
  }, { ifNotExists: true });
  
  // Create unique constraints separately to avoid failing if they already exist
  pgm.sql(`
    do $$ 
    begin 
      if not exists (select 1 from pg_constraint where conname = 'weather_observations_field_id_observed_on_source_key') then 
        alter table public.weather_observations add constraint weather_observations_field_id_observed_on_source_key unique (field_id, observed_on, source); 
      end if; 
    end $$;
  `);

  pgm.createTable('satellite_scenes', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    field_id: { type: 'uuid', notNull: true, references: 'fields(id)', onDelete: 'cascade' },
    scene_id: { type: 'text', notNull: true },
    collection: { type: 'text', notNull: true },
    observed_at: { type: 'timestamptz', notNull: true },
    cloud_cover: { type: 'numeric(5,2)' },
    source: { type: 'text', notNull: true },
    catalog_url: { type: 'text', notNull: true },
    assets: { type: 'jsonb', notNull: true, default: '{}' },
  }, { ifNotExists: true });
  
  pgm.sql(`
    do $$ 
    begin 
      if not exists (select 1 from pg_constraint where conname = 'satellite_scenes_field_id_scene_id_key') then 
        alter table public.satellite_scenes add constraint satellite_scenes_field_id_scene_id_key unique (field_id, scene_id); 
      end if; 
    end $$;
  `);

  // Insert seed data
  pgm.sql(`
    insert into public.fields (name, crop, area_hectares, health_score, ndvi_average, canopy_coverage, health_delta, last_observation, latitude, longitude)
    select * from (values
      ('North block', 'Winter wheat', 42.8, 82, 0.740, 78, 4.2, '2026-08-24'::date, 28.613865, 77.209175),
      ('River bend', 'Soybean', 31.4, 68, 0.610, 69, -6.8, '2026-08-24'::date, null, null),
      ('East orchard', 'Apple', 18.6, 91, 0.810, 88, 1.4, '2026-08-24'::date, null, null)
    ) as seed(name, crop, area_hectares, health_score, ndvi_average, canopy_coverage, health_delta, last_observation, latitude, longitude)
    where not exists (select 1 from public.fields);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('satellite_scenes');
  pgm.dropTable('weather_observations');
  pgm.dropTable('ndvi_observations');
  pgm.dropTable('alerts');
  pgm.dropTable('fields');
}
