import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    delete from public.fields
    where provenance in ('demo', 'public_boundary');
  `);
}

export async function down(): Promise<void> {
  throw new Error('Demo field deletion is irreversible. Restore a backup to recover deleted records.');
}
