import { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // 1. Enable PostGIS
  pgm.createExtension('postgis', { ifNotExists: true });

  // 2. Add geospatial columns
  // Location as a Point (longitude, latitude)
  pgm.addColumn('fields', {
    location: { type: 'geometry(Point, 4326)' },
    boundary_geom: { type: 'geometry(Polygon, 4326)' }
  });

  // 3. Migrate existing data
  // Update location Point from latitude/longitude
  pgm.sql(`
    UPDATE fields 
    SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
    WHERE longitude IS NOT NULL AND latitude IS NOT NULL;
  `);

  // Update boundary_geom from boundary_geojson (assuming it's a valid GeoJSON Polygon)
  pgm.sql(`
    UPDATE fields 
    SET boundary_geom = ST_GeomFromGeoJSON(boundary_geojson)
    WHERE boundary_geojson IS NOT NULL;
  `);

  // 4. Drop old columns
  pgm.dropColumn('fields', ['latitude', 'longitude', 'boundary_geojson']);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Revert structural changes
  pgm.addColumn('fields', {
    latitude: { type: 'numeric(9,6)' },
    longitude: { type: 'numeric(9,6)' },
    boundary_geojson: { type: 'jsonb' }
  });

  pgm.sql(`
    UPDATE fields 
    SET 
      latitude = ST_Y(location),
      longitude = ST_X(location),
      boundary_geojson = ST_AsGeoJSON(boundary_geom)::jsonb;
  `);

  pgm.dropColumn('fields', ['location', 'boundary_geom']);
  pgm.dropExtension('postgis', { ifExists: true });
}

