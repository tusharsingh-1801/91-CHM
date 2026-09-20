import { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Add unique constraint for field_id, scene_id, and observed_on
  // Coalesce scene_id to a dummy value if it's null, or just rely on a partial index.
  // Actually, standard unique constraint:
  pgm.sql(`
    do $$ 
    begin 
      if not exists (select 1 from pg_constraint where conname = 'vegetation_indices_field_id_scene_id_observed_on_key') then 
        alter table public.vegetation_indices add constraint vegetation_indices_field_id_scene_id_observed_on_key unique (field_id, scene_id, observed_on); 
      end if; 
    end $$;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`alter table public.vegetation_indices drop constraint if exists vegetation_indices_field_id_scene_id_observed_on_key;`);
}
