#!/usr/bin/env node
/**
 * Import reviewed crop calendar rows into a separate PostgreSQL reference table.
 * Run: node scripts/import-fao-calendar.mjs reviewed.csv [field-uuid] --apply
 * Without --apply, this is a read-only dry run.
 * Requires DATABASE_URL and a running PostgreSQL server; does not touch farmer crop dates.
 */
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const positional = args.filter(x => x !== '--apply');
if (positional.length < 1 || positional.length > 2) {
  console.error('Usage: node scripts/import-fao-calendar.mjs reviewed.csv [field-uuid] [--apply]');
  process.exit(2);
}
const [file, fieldId] = positional;
let rows;
try {
  const result = execFileSync(process.env.PYTHON_BIN || 'python3', [
    'scripts/export-fao-calendar-json.py', resolve(file), ...(fieldId ? [fieldId] : []),
  ], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  rows = JSON.parse(result);
} catch (error) {
  console.error('CSV validation failed:', error.stderr?.toString() || error.message);
  process.exit(2);
}
console.log(JSON.stringify({ validatedRows: rows.length, mode: apply ? 'apply' : 'dry-run' }));
if (!apply) {
  console.log('No database changes. Add --apply to insert reviewed reference rows.');
  process.exit(0);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required for --apply');
  process.exit(2);
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  await client.query('BEGIN');
  await client.query(`
    CREATE TABLE IF NOT EXISTS fao_crop_calendar_references (
      source_key TEXT PRIMARY KEY,
      field_id UUID NOT NULL,
      country TEXT NOT NULL,
      region TEXT NOT NULL,
      crop TEXT NOT NULL,
      planting_start_month SMALLINT NOT NULL CHECK (planting_start_month BETWEEN 1 AND 12),
      planting_end_month SMALLINT NOT NULL CHECK (planting_end_month BETWEEN 1 AND 12),
      harvest_start_month SMALLINT NOT NULL CHECK (harvest_start_month BETWEEN 1 AND 12),
      harvest_end_month SMALLINT NOT NULL CHECK (harvest_end_month BETWEEN 1 AND 12),
      source_url TEXT NOT NULL,
      source_title TEXT NOT NULL,
      license TEXT NOT NULL,
      permission_note TEXT NOT NULL,
      reviewed_on DATE NOT NULL,
      imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  for (const r of rows) {
    const key = createHash('sha256').update(JSON.stringify([
      r.field_id, r.country, r.region, r.crop, r.source_url, r.source_title,
    ])).digest('hex');
    const values = [
      key, r.field_id, r.country, r.region, r.crop,
      r.planting_start_month, r.planting_end_month,
      r.harvest_start_month, r.harvest_end_month,
      r.source_url, r.source_title, r.license, r.permission_note, r.reviewed_on,
    ];
    await client.query(`
      INSERT INTO fao_crop_calendar_references
      (source_key, field_id, country, region, crop,
       planting_start_month, planting_end_month, harvest_start_month, harvest_end_month,
       source_url, source_title, license, permission_note, reviewed_on)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT (source_key) DO UPDATE SET
        planting_start_month = EXCLUDED.planting_start_month,
        planting_end_month = EXCLUDED.planting_end_month,
        harvest_start_month = EXCLUDED.harvest_start_month,
        harvest_end_month = EXCLUDED.harvest_end_month,
        license = EXCLUDED.license,
        permission_note = EXCLUDED.permission_note,
        reviewed_on = EXCLUDED.reviewed_on
    `, values);
  }
  await client.query('COMMIT');
  console.log(JSON.stringify({ importedRows: rows.length, table: 'fao_crop_calendar_references' }));
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Import rolled back:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
