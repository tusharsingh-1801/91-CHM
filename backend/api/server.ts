import 'dotenv/config';
import { app } from './app.ts';
import { pool } from './db/pool.ts';

const port = Number(process.env.API_PORT ?? 3001);

async function start() {
  try {
    await pool.query('select 1');
    app.listen(port, () => console.log(`PostgreSQL API listening on http://localhost:${port}`));
  } catch (error) {
    console.error('PostgreSQL startup failed. Check DATABASE_URL and ensure PostgreSQL is running.', error);
    process.exitCode = 1;
  }
}

start();

