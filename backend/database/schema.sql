create extension if not exists "pgcrypto";

create table if not exists public.fields (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  crop text not null,
  area_hectares numeric(10,2) not null default 0,
  health_score integer not null default 0 check (health_score between 0 and 100),
  ndvi_average numeric(4,3) not null default 0,
  canopy_coverage integer not null default 0 check (canopy_coverage between 0 and 100),
  health_delta numeric(5,2) not null default 0,
  last_observation date,
  latitude numeric(9,6),
  longitude numeric(9,6),
  boundary_geojson jsonb,
  created_at timestamptz not null default now()
);

alter table public.fields
  add column if not exists latitude numeric(9,6),
  add column if not exists longitude numeric(9,6),
  add column if not exists boundary_geojson jsonb;

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references public.fields(id) on delete cascade,
  title text not null,
  severity text not null check (severity in ('high', 'positive', 'neutral')),
  observed_at timestamptz not null default now(),
  resolved boolean not null default false
);

create table if not exists public.ndvi_observations (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references public.fields(id) on delete cascade,
  observed_on date not null,
  ndvi_value numeric(4,3) not null check (ndvi_value between -1 and 1),
  cloud_cover integer not null default 0 check (cloud_cover between 0 and 100),
  source text not null default 'Sentinel-2'
);

alter table public.ndvi_observations add column if not exists scene_id text;

create table if not exists public.weather_observations (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references public.fields(id) on delete cascade,
  observed_on date not null,
  precipitation_mm numeric(8,2),
  temperature_c numeric(6,2),
  humidity_percent numeric(6,2),
  source text not null default 'NASA POWER',
  source_url text not null,
  unique (field_id, observed_on, source)
);

create table if not exists public.satellite_scenes (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references public.fields(id) on delete cascade,
  scene_id text not null,
  collection text not null,
  observed_at timestamptz not null,
  cloud_cover numeric(5,2),
  source text not null,
  catalog_url text not null,
  assets jsonb not null default '{}'::jsonb,
  unique (field_id, scene_id)
);

insert into public.fields (name, crop, area_hectares, health_score, ndvi_average, canopy_coverage, health_delta, last_observation)
select * from (values
  ('North block', 'Winter wheat', 42.8, 82, 0.740, 78, 4.2, '2026-08-24'::date),
  ('River bend', 'Soybean', 31.4, 68, 0.610, 69, -6.8, '2026-08-24'::date),
  ('East orchard', 'Apple', 18.6, 91, 0.810, 88, 1.4, '2026-08-24'::date)
) as seed(name, crop, area_hectares, health_score, ndvi_average, canopy_coverage, health_delta, last_observation)
where not exists (select 1 from public.fields);
