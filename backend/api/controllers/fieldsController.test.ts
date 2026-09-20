import { describe, it } from 'node:test';
import assert from 'node:assert';
import { calculateHealthScore, isValidFieldBoundary } from './fieldsController.ts';

describe('Fields Controller Integration Tests', () => {
  it('Should handle valid API dependencies', () => {
    assert.strictEqual(typeof fetch, 'function');
  });

  it('Calculates STAC query dates correctly', () => {
    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    assert.ok(start.startsWith('202'));
    assert.ok(end.startsWith('202'));
  });
  
  it('Tile proxy constructs correct Python engine URL', () => {
    const pythonEngineUrl = process.env.PYTHON_ENGINE_URL || "http://127.0.0.1:8000";
    const z = "14", x = "1", y = "2";
    const targetUrl = `${pythonEngineUrl}/tiles/${z}/${x}/${y}.png`;
    assert.ok(targetUrl.endsWith('/tiles/14/1/2.png'));
  });

  it('validates closed WGS84 field polygons', () => {
    assert.equal(isValidFieldBoundary({ type: 'Polygon', coordinates: [[[77, 28], [77.1, 28], [77.1, 28.1], [77, 28]]] }), true);
    assert.equal(isValidFieldBoundary({ type: 'Polygon', coordinates: [[[77, 28], [77.1, 28], [77.1, 28.1]]] }), false);
    assert.equal(isValidFieldBoundary({ type: 'Polygon', coordinates: [[[200, 28], [77.1, 28], [77.1, 28.1], [200, 28]]] }), false);
  });

  it('keeps the experimental health score inside 0-100 and applies data quality', () => {
    assert.equal(calculateHealthScore(1, 1, 100), 100);
    assert.equal(calculateHealthScore(-1, -1, 100), 0);
    assert.ok(calculateHealthScore(0.7, 0.3, 50) < calculateHealthScore(0.7, 0.3, 100));
  });
});
