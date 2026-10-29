import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { loadEnvironment } from './environment.mjs';
import { migrationArgs, runMigration } from './migrate.mjs';
import { managedPostgresPaths, pgCtlPath } from './local.mjs';

const run = promisify(execFile);
const launcher = fileURLToPath(new URL('./local.mjs', import.meta.url));
const managedLifecycleTest = process.platform === 'win32' ? test.skip : test;

async function fixture(overrides, exercise) {
  const root = await mkdtemp(join(tmpdir(), 'chm-launcher-'));
  const bin = join(root, 'bin');
  const log = join(root, 'pg-requests.jsonl');
  await mkdir(bin);
  await mkdir(join(root, 'data'));
  await writeFile(join(root, 'empty.env'), '');
  await writeFile(join(bin, 'pg_ctl'), `#!/usr/bin/env node
import {appendFileSync} from 'node:fs';
const args=process.argv.slice(2);
appendFileSync(process.env.CHM_LAUNCHER_TEST_LOG, JSON.stringify(args)+'\\n');
if(args.includes('status'))process.exit(process.env.CHM_LAUNCHER_PG_RUNNING==='1'?0:3);
if(process.env.CHM_LAUNCHER_PG_FAIL==='1'){console.error('Fixture PostgreSQL start failure');process.exit(1);}
`, { mode: 0o755 });
  const env = {
    ...process.env,
    DOTENV_CONFIG_PATH: join(root, 'empty.env'),
    LOCAL_PG_BIN: bin,
    LOCAL_PG_DATA: join(root, 'data'),
    DATABASE_URL: 'postgres://fixture@127.0.0.1:5435/chm_launcher_test',
    CHM_LAUNCHER_TEST_LOG: log,
    CHM_LAUNCHER_PG_RUNNING: '',
    CHM_LAUNCHER_PG_FAIL: '',
    AUTH_MODE: 'required', WEB_HOST: '127.0.0.1', WEB_PORT: '5173', API_PORT: '3001', PYTHON_ENGINE_URL: 'http://127.0.0.1:8000',
    ...overrides,
  };
  const requests = async () => {
    try { return (await readFile(log, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line)); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  };
  try { await exercise(() => run(process.execPath, [launcher, 'database'], { env }), requests, root); }
  finally { await rm(root, { recursive: true, force: true }); }
}

managedLifecycleTest('migration preparation starts only the configured database without requiring app schema or Python', async () => {
  await fixture({}, async (start, requests, root) => {
    const result = await start();
    assert.match(result.stdout, /PostgreSQL is running/);
    const calls = await requests();
    assert.equal(calls.length, 2);
    assert.ok(calls[0].includes('status'));
    assert.ok(calls[1].includes('start'));
    assert.equal(calls[1][calls[1].indexOf('-D') + 1], join(root, 'data'));
    assert.equal(calls[1][calls[1].indexOf('-o') + 1], '-h 127.0.0.1 -p 5435');
  });
});

managedLifecycleTest('migration preparation reuses an already running managed database', async () => {
  await fixture({ CHM_LAUNCHER_PG_RUNNING: '1' }, async (start, requests) => {
    await start();
    const calls = await requests();
    assert.equal(calls.length, 1);
    assert.ok(calls[0].includes('status'));
  });
});

managedLifecycleTest('migration preparation reports a database start failure with a nonzero exit', async () => {
  await fixture({ CHM_LAUNCHER_PG_FAIL: '1' }, async start => {
    await assert.rejects(start, error => error.code === 1 && /Local PostgreSQL start failed/.test(error.stderr));
  });
});

test('migration preparation leaves externally managed PostgreSQL alone', async () => {
  await fixture({ LOCAL_PG_BIN: '' }, async (start, requests) => {
    await start();
    assert.deepEqual(await requests(), []);
  });
});

test('environment files resolve .env.local over .env and preserve external values', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chm-env-'));
  try {
    await writeFile(join(root, '.env'), 'DATABASE_URL=base\nSHARED=base\nONLY_BASE=yes\n');
    await writeFile(join(root, '.env.local'), 'DATABASE_URL=local\nSHARED=local\n');
    const env = loadEnvironment(root, { DATABASE_URL: 'external', EXTERNAL_ONLY: 'yes' });
    assert.equal(env.DATABASE_URL, 'external');
    assert.equal(env.SHARED, 'local');
    assert.equal(env.ONLY_BASE, 'yes');
    assert.equal(env.EXTERNAL_ONLY, 'yes');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('migration launcher passes resolved database settings to node-pg-migrate', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chm-migrate-'));
  try {
    const capture = join(root, 'received.json');
    const cli = join(root, 'fake-cli.mjs');
    await writeFile(join(root, '.env'), 'DATABASE_URL=base-url\nPGSSLMODE=disable\n');
    await writeFile(join(root, '.env.local'), 'DATABASE_URL=local-url\n');
    await writeFile(cli, "import {writeFileSync} from 'node:fs'; writeFileSync(process.env.CAPTURE, JSON.stringify({url:process.env.DATABASE_URL, ssl:process.env.PGSSLMODE, args:process.argv.slice(2)}));\n");
    const env = { ...process.env, CAPTURE: capture };
    delete env.DATABASE_URL;
    assert.equal(await runMigration({ cli, cwd: root, env }), 0);
    const received = JSON.parse(await readFile(capture, 'utf8'));
    assert.equal(received.url, 'local-url');
    assert.equal(received.ssl, 'disable');
    assert.deepEqual(received.args, migrationArgs());
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Windows managed PostgreSQL resolves pg_ctl.exe, avoids macOS paths, and validates configuration', async () => {
  assert.match(pgCtlPath('C:/PostgreSQL/bin', 'win32'), /pg_ctl\.exe$/);
  assert.doesNotMatch(pgCtlPath('C:/PostgreSQL/bin', 'win32'), /Postgres\.app/);
  const root = await mkdtemp(join(tmpdir(), 'chm-paths-'));
  try {
    assert.throws(() => managedPostgresPaths(join(root, 'missing-bin'), join(root, 'missing-data'), root, 'win32'), /LOCAL_PG_BIN does not exist/);
    const bin = join(root, 'bin');
    const data = join(root, 'data');
    await mkdir(bin); await mkdir(data); await writeFile(join(bin, 'pg_ctl.exe'), '');
    assert.equal(managedPostgresPaths(bin, data, root, 'win32').data, data);
    await rm(join(bin, 'pg_ctl.exe'));
    assert.throws(() => managedPostgresPaths(bin, data, root, 'win32'), /control executable does not exist:.*pg_ctl\.exe/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
