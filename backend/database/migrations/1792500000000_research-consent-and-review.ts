import type {MigrationBuilder} from 'node-pg-migrate';

export async function up(pgm:MigrationBuilder):Promise<void>{
 pgm.sql(`
  create table public.research_role_grants(
   id uuid primary key default gen_random_uuid(),
   user_id uuid not null references public.app_users(id) on delete cascade,
   role text not null check(role='field_reviewer'),
   granted_by uuid references public.app_users(id) on delete set null,
   granted_at timestamptz not null default now(),
   revoked_at timestamptz,
   revoked_by uuid references public.app_users(id) on delete set null
  );
  create unique index research_role_grants_active on public.research_role_grants(user_id,role) where revoked_at is null;
  create table public.scouting_research_consent_events(
   id bigint generated always as identity primary key,
   case_id uuid not null references public.scouting_cases(id) on delete cascade,
   owner_id uuid not null references public.app_users(id) on delete cascade,
   action text not null check(action in ('consent','withdraw')),
   policy_version text not null,
   created_at timestamptz not null default now()
  );
  create index scouting_research_consent_latest on public.scouting_research_consent_events(case_id,id desc);
  create table public.expert_inspection_reviews(
   id uuid primary key default gen_random_uuid(),
   case_id uuid not null references public.scouting_cases(id) on delete cascade,
   field_id uuid not null references public.fields(id) on delete cascade,
   reviewer_id uuid not null references public.app_users(id) on delete restrict,
   observed_on date not null,
   observation_category text not null check(observation_category in ('general_observation','visual_symptom','pest_observed','water_related','growth_stage','other','unknown')),
   growth_stage text not null check(growth_stage in ('emergence','vegetative','flowering','fruiting','maturity','harvested','unknown')),
   severity text not null check(severity in ('mild','moderate','severe','unknown','not_applicable')),
   review_basis text not null check(review_basis='ground_visit'),
   created_at timestamptz not null default now(),
   unique(case_id,reviewer_id,observed_on)
  );
  create index expert_inspection_reviews_field_date on public.expert_inspection_reviews(field_id,observed_on desc);
  create function public.protect_research_audit() returns trigger language plpgsql as $$
  begin
   if pg_trigger_depth()>1 then return old; end if;
   raise exception 'Research consent and review audit rows are append-only' using errcode='55000';
  end $$;
  create trigger scouting_research_consent_append_only before update or delete on public.scouting_research_consent_events for each row execute function public.protect_research_audit();
  create trigger expert_inspection_reviews_append_only before update or delete on public.expert_inspection_reviews for each row execute function public.protect_research_audit();
 `);
}

export async function down():Promise<void>{
 throw new Error('Forward-only: preserve research consent and expert review history');
}
