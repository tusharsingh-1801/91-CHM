import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: ['.env.local', '.env'] });

// Calendar dates have no timezone; preserve them instead of serializing local midnight as UTC.
pg.types.setTypeParser(1082, (value: string) => value);

const { Pool } = pg;
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
