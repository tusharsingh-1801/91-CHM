import test from 'node:test';
import assert from 'node:assert';
import { app } from '../app.ts';

test('API root explains where to find health status', async () => {
  const server = app.listen(0);
  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const response = await fetch(`http://127.0.0.1:${address.port}/`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { service: 'TerraScope API', health: '/api/health' });
  } finally {
    server.close();
  }
});
