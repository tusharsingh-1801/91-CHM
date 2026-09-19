import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  password: process.env.DATABASE_PASSWORD,
});

