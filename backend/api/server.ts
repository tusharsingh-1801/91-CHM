import dotenv from 'dotenv';
import { pathToFileURL } from 'node:url';
import { app } from './app.ts';
import {startWorkers} from './services/jobs.ts';
import { pool } from './db/pool.ts';

dotenv.config({ path: ['.env.local', '.env'] });

const port = Number(process.env.API_PORT ?? 3001);

export async function start() {
  try {
    await pool.query('select 1');
    const server = app.listen(port, '127.0.0.1', () => console.log(`PostgreSQL API listening on http://localhost:${port}`));
    server.on('error', async (error) => {
      console.error('API could not start:', error.message);
      await pool.end();
      process.exitCode = 1;
    });
    const stopWorkers=startWorkers();
    const shutdown = () => {
      void stopWorkers();
      server.close(async () => { await pool.end(); });
    };
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
  } catch {
    console.error('PostgreSQL startup failed. Check DATABASE_URL and ensure PostgreSQL is running.');
    await pool.end();
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  start();
}
