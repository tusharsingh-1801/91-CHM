import { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('alerts', {
    stress_geom: { type: 'geometry(MultiPolygon, 4326)' },
    scene_id: { type: 'text' },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns('alerts', ['stress_geom', 'scene_id']);
}

