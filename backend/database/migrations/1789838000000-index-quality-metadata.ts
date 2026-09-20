import { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('vegetation_indices', {
    valid_pixel_count: { type: 'integer' },
    valid_coverage_percent: { type: 'numeric(5,2)' },
    ndvi_min: { type: 'numeric(6,4)' },
    ndvi_max: { type: 'numeric(6,4)' },
    ndvi_median: { type: 'numeric(6,4)' },
    ndvi_stddev: { type: 'numeric(6,4)' },
  });

  pgm.createIndex('fields', 'location', { method: 'gist', ifNotExists: true });
  pgm.createIndex('fields', 'boundary_geom', { method: 'gist', ifNotExists: true });
  pgm.createIndex('alerts', 'stress_geom', { method: 'gist', ifNotExists: true });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('alerts', 'stress_geom', { ifExists: true });
  pgm.dropIndex('fields', 'boundary_geom', { ifExists: true });
  pgm.dropIndex('fields', 'location', { ifExists: true });
  pgm.dropColumns('vegetation_indices', [
    'valid_pixel_count', 'valid_coverage_percent', 'ndvi_min', 'ndvi_max',
    'ndvi_median', 'ndvi_stddev'
  ]);
}
