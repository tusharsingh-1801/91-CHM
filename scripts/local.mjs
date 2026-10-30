import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import pg from 'pg';
import { loadEnvironment } from './environment.mjs';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
loadEnvironment();
const runtime = resolve('.local');
const pidFile = resolve(runtime, 'server.pid');
const logFile = resolve(runtime, 'server.log');
const configuredPython = process.env.PYTHON_BIN;
const windowsVenvPython = '.venv/Scripts/python.exe';
const configuredUnixVenvPath = configuredPython?.replaceAll('\\', '/').startsWith('.venv/bin/') && process.platform === 'win32';
const python = configuredUnixVenvPath && existsSync(windowsVenvPython)
  ? windowsVenvPython
  : configuredPython || (existsSync(windowsVenvPython) ? windowsVenvPython : existsSync('.venv/bin/python') ? '.venv/bin/python' : 'python3');
const apiPort = Number(process.env.API_PORT || 3001);
if(process.env.AUTH_MODE==='local'&&process.env.WEB_HOST&&!['127.0.0.1','localhost'].includes(process.env.WEB_HOST))throw new Error('Shared network access requires AUTH_MODE=required.');
const webPort = Number(process.env.WEB_PORT || 5173);
const engine = new URL(process.env.PYTHON_ENGINE_URL || 'http://127.0.0.1:8000');
const enginePort = Number(engine.port || 8000);
const ports = [webPort, apiPort, enginePort];
if (ports.some(p => !Number.isInteger(p) || p < 1 || p > 65535) || new Set(ports).size !== 3) {
  throw new Error('WEB_PORT, API_PORT and Python engine port must be distinct valid ports.');
}
if (!['127.0.0.1', 'localhost'].includes(engine.hostname)) throw new Error('Local launcher requires a localhost PYTHON_ENGINE_URL.');
const delay = ms => new Promise(r => setTimeout(r, ms));
function runningPid() {
  try { const pid = Number(readFileSync(pidFile, 'utf8')); if (!Number.isInteger(pid) || pid < 2) return null; process.kill(pid, 0); return pid; }
  catch { return null; }
}
export function pgCtlPath(bin, platform = process.platform) {
  return resolve(bin, platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl');
}
export function managedPostgresPaths(binValue, dataValue, cwd = process.cwd(), platform = process.platform) {
  const bin = resolve(cwd, binValue);
  const data = resolve(cwd, dataValue || '.local/postgres-data');
  const ctl = pgCtlPath(bin, platform);
  for (const [label, path] of [['LOCAL_PG_BIN', bin], ['PostgreSQL control executable', ctl], ['LOCAL_PG_DATA', data]]) {
    if (!existsSync(path)) throw new Error(`${label} does not exist: ${path}`);
  }
  if (!statSync(bin).isDirectory()) throw new Error(`LOCAL_PG_BIN must be a directory: ${bin}`);
  if (!statSync(data).isDirectory()) throw new Error(`LOCAL_PG_DATA must be an existing initialized data directory: ${data}`);
  return { bin, data, ctl };
}
function localDatabase(action) {
  if (!process.env.LOCAL_PG_BIN) return;
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL before starting the project-managed database.');
  let databaseUrl;
  try { databaseUrl = new URL(process.env.DATABASE_URL); }
  catch { throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.'); }
  const { data, ctl } = managedPostgresPaths(process.env.LOCAL_PG_BIN, process.env.LOCAL_PG_DATA);
  const dbPort = databaseUrl.port || '5432';
  const status = spawnSync(ctl, ['-D', data, 'status'], { stdio: 'ignore' });
  if (action === 'start' && status.status === 0) return;
  if (action === 'stop' && status.status !== 0) return;
  const args = ['-D', data, '-w', '-t', '15'];
  if (action === 'start') args.push('-l', resolve(runtime, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${dbPort}`);
  else args.push('-m', 'fast');
  const result = spawnSync(ctl, [...args, action], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Local PostgreSQL ${action} failed: ${result.stderr || result.stdout || result.error}`);
}
async function checkDatabase() {
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL in .env first.');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 4000 });
  try {
    await client.connect();
    await client.query('select PostGIS_Version()');
    await client.query('select valid_coverage_percent from vegetation_indices limit 0');
    await client.query('select stress_geom from alerts limit 0');
    await client.query('select boundary_geom, planting_date, boundary_version, provenance from fields limit 0');
    await client.query('select accepted, inspection_geom, calculation_version from vegetation_indices limit 0');
    await client.query('select id, status, boundary_version from ingestion_jobs limit 0');
    await client.query('select client_key, reason, scene_id, boundary_version from field_tasks limit 0');
  } catch (error) { throw new Error(`Database not ready: ${error.message}. Check local PostgreSQL/PostGIS, DATABASE_URL and run npm run migrate.`); }
  finally { await client.end(); }
}
async function available(port) {
  return new Promise((resolveCheck, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new Error(`Port ${port} is occupied. Stop its existing service first.`)));
    server.listen(port, '127.0.0.1', () => server.close(() => resolveCheck()));
  });
}
async function preflight() {
  if (!existsSync('node_modules/.bin/vite')) throw new Error('Run npm install first.');
  const check = spawnSync(python, ['-c', 'import uvicorn; import backend.engine.main'], { encoding: 'utf8', env: { ...process.env, MPLBACKEND: 'Agg' } });
  if (check.status !== 0) throw new Error(`Python engine dependencies unavailable. Install backend/engine/requirements.txt in .venv.\n${check.stderr || check.error || ''}`);
  await checkDatabase();
  await Promise.all(ports.map(available));
}
async function ready() {
  for (const url of [`http://127.0.0.1:${webPort}`, `http://127.0.0.1:${apiPort}/api/health`, `${engine.href.replace(/\/$/, '')}/health`]) {
    try { if (!(await fetch(url, { signal: AbortSignal.timeout(1500) })).ok) return false; }
    catch { return false; }
  }
  return true;
}
async function stop() {
  const pid = runningPid();
  if (!pid) { rmSync(pidFile, { force: true }); console.log('Local stack is already stopped.'); return; }
  if (process.platform === 'win32') {
    const result = spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { encoding: 'utf8' });
    if (result.status !== 0 && runningPid()) {
      throw new Error(`Could not stop local stack process ${pid}: ${result.stderr || result.stdout || result.error}`);
    }
  } else {
    process.kill(-pid, 'SIGTERM');
  }
  for (let i = 0; i < 100 && runningPid(); i++) await delay(100);
  if (runningPid()) throw new Error('Stack is still shutting down. Check .local/server.log.');
  rmSync(pidFile, { force: true });
  console.log('Local frontend, API and Python engine stopped. Application ports released.');
}
async function main() {
  const action = process.argv[2] || 'start';
  if (action === 'stop') { await stop(); localDatabase('stop'); return; }
  if (action === 'status') {
    console.log(`Managed stack: ${runningPid() ? 'running' : 'stopped'}`);
    console.log(`Services: ${await ready() ? 'healthy' : 'not all ready'}`);
    console.log(`Frontend: http://localhost:${webPort}\nAPI: http://localhost:${apiPort}/api/health\nEngine: ${engine.href}health\nLogs: ${logFile}`);
    return;
  }
  if (action === 'database') {
    if (process.env.LOCAL_PG_BIN) {
      if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL in .env before starting the project-managed database.');
      mkdirSync(runtime, { recursive: true });
      localDatabase('start');
      console.log('Project-managed PostgreSQL is running.');
    }
    return;
  }
  if (action === 'engine') {
    const child = spawn(python, ['-m', 'uvicorn', 'backend.engine.main:app', '--host', '127.0.0.1', '--port', String(enginePort)], { stdio: 'inherit', env: { ...process.env, MPLBACKEND: 'Agg' } });
    child.on('error', error => { console.error(error.message); process.exitCode = 1; });
    child.on('exit', code => { process.exitCode = code ?? 1; });
    return;
  }
  if (action !== 'start') throw new Error('Use start, stop, status, database or engine.');
  if (runningPid()) { console.log('Local stack already running. Use npm run status.'); return; }
  mkdirSync(runtime, { recursive: true });
  localDatabase('start');
  await preflight();
  const log = openSync(logFile, 'a');
  const child = spawn(process.execPath, ['node_modules/concurrently/dist/bin/index.js', '--kill-others', '--names', 'web,api,engine', 'npm run dev:client', 'npm run dev:server', 'npm run dev:engine'], { detached: true, stdio: ['ignore', log, log], env: process.env });
  closeSync(log);
  await new Promise((resolveSpawn, reject) => { child.once('spawn', resolveSpawn); child.once('error', reject); });
  writeFileSync(pidFile, String(child.pid));
  child.unref();
  for (let i = 0; i < 180; i++) {
    if (!runningPid()) break;
    if (await ready()) { console.log(`TerraScope ready: http://localhost:${webPort}\nStop: npm stop\nLogs: ${logFile}`); return; }
    await delay(500);
  }
  await stop();
  throw new Error(`Startup failed; see ${logFile}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
