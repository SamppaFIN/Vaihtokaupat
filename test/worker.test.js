import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';

const env = { ALLOWED_ORIGINS: 'https://samppafin.github.io' };
const call = (path, init) => worker.fetch(new Request('http://localhost:8797' + path, init), env);

test('GET /api answers ok', async () => {
  const res = await call('/api');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test('unknown path answers 404 and wrong method 405', async () => {
  assert.equal((await call('/api/nothing')).status, 404);
  assert.equal((await call('/')).status, 404);
  assert.equal((await call('/api', { method: 'POST' })).status, 405);
});

test('CORS: only allowed origins get access-control-allow-origin', async () => {
  const ok = await call('/api', { headers: { origin: 'https://samppafin.github.io' } });
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://samppafin.github.io');
  const other = await call('/api', { headers: { origin: 'https://evil.example' } });
  assert.equal(other.headers.get('access-control-allow-origin'), null);
});

test('OPTIONS preflight answers 204', async () => {
  const res = await call('/api', { method: 'OPTIONS', headers: { origin: 'https://samppafin.github.io' } });
  assert.equal(res.status, 204);
});
