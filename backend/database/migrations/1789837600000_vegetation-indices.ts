import { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.renameTable('ndvi_observations', 'vegetation_indices');
  
  pgm.addColumns('vegetation_indices', {
    ndre_value: { type: 'numeric(4,3)' },
    ndmi_value: { type: 'numeric(4,3)' },
    savi_value: { type: 'numeric(4,3)' },
    evi_value: { type: 'numeric(4,3)' },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns('vegetation_indices', ['ndre_value', 'ndmi_value', 'savi_value', 'evi_value']);
  pgm.renameTable('vegetation_indices', 'ndvi_observations');
}

