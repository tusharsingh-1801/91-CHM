import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvironment } from './environment.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
export function migrationArgs() {
  return ['up', '-j', 'ts', '-m', 'backend/database/migrations'];
}
export function runMigration({ cli = resolve(root, 'node_modules/node-pg-migrate/bin/node-pg-migrate.js'), env = process.env, cwd = root } = {}) {
  loadEnvironment(cwd, env);
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required. Set it in .env.local or .env, or export it in your shell.');
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [cli, ...migrationArgs()], { cwd, env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolveRun(code ?? (signal ? 1 : 0)));
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMigration().then(code => { process.exitCode = code; }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
