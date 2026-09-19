import { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // 1. Add crop context to fields
  pgm.addColumns('fields', {
    planting_date: { type: 'date' },
    harvest_date: { type: 'date' },
    expected_yield_tons: { type: 'numeric(10,2)' },
  });

  // 2. Create field_events table
  pgm.createTable('field_events', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    field_id: { type: 'uuid', notNull: true, references: 'fields(id)', onDelete: 'cascade' },
    event_type: { type: 'text', notNull: true },
    event_date: { type: 'date', notNull: true },
    notes: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  }, { ifNotExists: true });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('field_events', { ifExists: true });
  pgm.dropColumns('fields', ['planting_date', 'harvest_date', 'expected_yield_tons']);
}

