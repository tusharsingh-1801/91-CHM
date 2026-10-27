import { describe, it } from 'node:test';
import assert from 'node:assert';
import { calculateHealthScore, getPythonEngineUrl, isValidFieldBoundary } from './fieldsController.ts';

describe('Fields Controller Integration Tests', () => {
  it('Should handle valid API dependencies', () => {
    assert.strictEqual(typeof fetch, 'function');
  });

  it('Calculates UTC satellite search dates correctly', () => {
    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    assert.ok(start.startsWith('202'));
    assert.ok(end.startsWith('202'));
  });
  
  it('Tile proxy constructs correct Python engine URL', () => {
    const original = process.env.PYTHON_ENGINE_URL;
    process.env.PYTHON_ENGINE_URL = 'http://127.0.0.1:8000/';
    const pythonEngineUrl = getPythonEngineUrl();
    const z = '14', x = '1', y = '2';
    const targetUrl = `${pythonEngineUrl}/tiles/${z}/${x}/${y}.png`;
    assert.equal(pythonEngineUrl, 'http://127.0.0.1:8000');
    assert.ok(targetUrl.endsWith('/tiles/14/1/2.png'));
    if (original === undefined) delete process.env.PYTHON_ENGINE_URL; else process.env.PYTHON_ENGINE_URL = original;
  });

  it('validates closed WGS84 field polygons', () => {
    assert.equal(isValidFieldBoundary({ type: 'Polygon', coordinates: [[[77, 28], [77.1, 28], [77.1, 28.1], [77, 28]]] }), true);
    assert.equal(isValidFieldBoundary({ type: 'Polygon', coordinates: [[[77, 28], [77.1, 28], [77.1, 28.1]]] }), false);
    assert.equal(isValidFieldBoundary({ type: 'Polygon', coordinates: [[[200, 28], [77.1, 28], [77.1, 28.1], [200, 28]]] }), false);
  });

  it('keeps crop measurements independent of image coverage', () => {
    assert.equal(calculateHealthScore(1, 1, 100), 100);
    assert.equal(calculateHealthScore(-1, -1, 100), 0);
    assert.equal(calculateHealthScore(0.7, 0.3, 20), 81);
    assert.equal(calculateHealthScore(0.7, 0.3, 100), 81);
  });
});

it('weather sync accepts the empty POST body sent by the browser and valid zero coordinates', async () => {
  const { ingestWeather } = await import('./fieldsController.ts');
  const { pool } = await import('../db/pool.ts');
  const originalQuery = pool.query;
  const originalFetch = globalThis.fetch;
  let result: unknown;
  pool.query = (async (sql: string) => ({ rows: sql.startsWith('select') ? [{ latitude: 0, longitude: 0 }] : [], rowCount: 1 })) as typeof pool.query;
  globalThis.fetch = (async (url: string | URL | Request) => {
    assert.ok(String(url).includes('latitude=0'));
    return new Response(JSON.stringify({ properties: { parameter: { T2M: { '20261001': 25 }, RH2M: { '20261001': 60 }, PRECTOTCORR: { '20261001': 2 } } } }), { status: 200 });
  }) as typeof fetch;
  try {
    await ingestWeather({ params: { fieldId: 'test' } } as unknown as import('express').Request, {
      json(value: unknown) { result = value; },
      status() { throw new Error('Weather sync must not reject an empty body or zero coordinates'); },
    } as unknown as import('express').Response);
    assert.equal((result as { imported: number }).imported, 1);
  } finally { pool.query = originalQuery; globalThis.fetch = originalFetch; }
});

it('weather sync excludes missing sentinel values without dropping valid zero rainfall', async () => {
  const { ingestWeather } = await import('./fieldsController.ts');
  const { pool } = await import('../db/pool.ts');
  const originalQuery = pool.query;
  const originalFetch = globalThis.fetch;
  const writes: unknown[][] = [];
  let result: unknown;
  pool.query = (async (sql: string, values: unknown[]) => {
    if (sql.startsWith('select')) return { rows: [{ latitude: 28, longitude: 77 }], rowCount: 1 };
    writes.push(values); return { rows: [], rowCount: 1 };
  }) as typeof pool.query;
  globalThis.fetch = (async () => new Response(JSON.stringify({ header: { fill_value: -999 }, properties: { parameter: {
    T2M: { '20261001': 25, '20261002': -999, '20261003': -999 },
    RH2M: { '20261001': 60, '20261002': -999, '20261003': 50 },
    PRECTOTCORR: { '20261001': 0, '20261002': -999, '20261003': -999 },
  } } }))) as typeof fetch;
  try {
    await ingestWeather({ params: { fieldId: 'test' } } as unknown as import('express').Request, {
      json(value: unknown) { result = value; }, status() { throw new Error('Unexpected failure'); },
    } as unknown as import('express').Response);
    assert.equal((result as { imported: number }).imported, 2);
    assert.equal(writes.length, 2);
    assert.equal(writes[0][2], 0);
    assert.equal(writes[1][2], null);
    assert.equal(writes[1][3], null);
    assert.equal(writes[1][4], 50);
    assert.ok(writes.every(values => !values.includes(-999)));
  } finally { pool.query = originalQuery; globalThis.fetch = originalFetch; }
});

it('satellite ingestion searches the dated Sentinel-2 collection through Earth Engine', async () => {
  const { ingestEarthEngineScenes } = await import('./fieldsController.ts');
  const { pool } = await import('../db/pool.ts');
  const originalQuery = pool.query, originalFetch = globalThis.fetch;
  let imported: unknown;
  const writes: unknown[][] = [];
  pool.query = (async (sql: string, values: unknown[]) => {
    if (sql.startsWith('select')) return { rows: [{ latitude: 28, longitude: 77, boundary_geojson: { type: 'Polygon', coordinates: [[[76.99,27.99],[77.01,27.99],[77.01,28.01],[76.99,28.01],[76.99,27.99]]] } }], rowCount: 1 };
    writes.push(values); return { rows: [], rowCount: 1 };
  }) as typeof pool.query;
  globalThis.fetch = (async (url: unknown, init: RequestInit) => {
    assert.ok(String(url).endsWith('/earth-engine/scenes'));
    const body = JSON.parse(init.body as string);
    assert.deepEqual(body.polygonGeojson.type, 'Polygon');
    assert.match(body.start, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(body.end, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(body.limit <= 20);
    return new Response(JSON.stringify({ scenes: [{ id: '20261001T000000_T43QAB', image_id: 'COPERNICUS/S2_SR_HARMONIZED/20261001T000000_T43QAB', observed_at: '2026-10-01T00:00:00Z', cloud_cover: 5 }] }));
  }) as typeof fetch;
  try {
    await ingestEarthEngineScenes({ params: { fieldId: 'test' }, query: {} } as unknown as import('express').Request, {
      json(value: unknown) { imported = value; }, status() { throw new Error('Unexpected failure'); },
    } as unknown as import('express').Response);
    assert.equal((imported as { imported: number }).imported, 1);
    assert.equal(writes.length, 1);
    assert.equal(writes[0][1], 'gee-20261001T000000_T43QAB');
    assert.equal(writes[0][5], 'Copernicus Sentinel-2 via Google Earth Engine');
    assert.equal(JSON.parse(writes[0][7] as string).earth_engine.image_id, 'COPERNICUS/S2_SR_HARMONIZED/20261001T000000_T43QAB');
  } finally { pool.query = originalQuery; globalThis.fetch = originalFetch; }
});

it('does not silently fall back to Earth Search when Earth Engine authentication is unavailable', async () => {
  const { ingestEarthEngineScenes } = await import('./fieldsController.ts');
  const { pool } = await import('../db/pool.ts');
  const originalQuery = pool.query, originalFetch = globalThis.fetch;
  let statusCode = 200, message = '';
  pool.query = (async (sql: string) => ({ rows: sql.startsWith('select') ? [{ latitude: 28, longitude: 77, boundary_geojson: { type: 'Polygon', coordinates: [[[76.99,27.99],[77.01,27.99],[77.01,28.01],[76.99,28.01],[76.99,27.99]]] } }] : [], rowCount: 1 })) as typeof pool.query;
  globalThis.fetch = (async () => new Response('{}', { status: 503 })) as typeof fetch;
  try {
    await ingestEarthEngineScenes({ params: { fieldId: 'test' }, query: {} } as unknown as import('express').Request, {
      json(value: { error: string }) { message = value.error; },
      status(code: number) { statusCode = code; return this; },
    } as unknown as import('express').Response);
    assert.equal(statusCode, 503);
    assert.match(message, /EARTH_ENGINE_PROJECT_ID/);
  } finally { pool.query = originalQuery; globalThis.fetch = originalFetch; }
});

it('rejects unsupported rings, nonfinite/extra coordinates and oversized polygons',()=>{
 const outer=[[77,28],[77.1,28],[77.1,28.1],[77,28]];
 assert.equal(isValidFieldBoundary({type:'MultiPolygon',coordinates:[[outer]]}),false);
 assert.equal(isValidFieldBoundary({type:'Polygon',coordinates:[outer,[[77,28],[77.01,28],[77.01,28.01]]]}),false);
 assert.equal(isValidFieldBoundary({type:'Polygon',coordinates:[[[77,28,0],[77.1,28,0],[77.1,28.1,0],[77,28,0]]]}),false);
 assert.equal(isValidFieldBoundary({type:'Polygon',coordinates:[[[NaN,28],[77.1,28],[77.1,28.1],[NaN,28]]]}),false);
 assert.equal(isValidFieldBoundary({type:'Polygon',coordinates:[Array.from({length:5001},()=>[77,28])]}),false);
});
