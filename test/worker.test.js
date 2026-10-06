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

const fakeBucket = () => {
  const store = new Map();
  return {
    store,
    head: async (k) => (store.has(k) ? {} : null),
    put: async (k, v) => { store.set(k, v); },
    get: async (k) => (store.has(k) ? { json: async () => JSON.parse(store.get(k)) } : null),
  };
};
const createBody = JSON.stringify({ offer: 'a', want: 'b', city: 'Espoo', phone: '0401234567', pledge: true });
const create = (env) => worker.fetch(new Request('http://localhost:8797/api/listings', { method: 'POST', body: createBody }), env);

test('create refuses to run without CODE_SECRET instead of hashing with "undefined"', async () => {
  const bucket = fakeBucket();
  const res = await create({ BUCKET: bucket });
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: 'server_misconfigured' });
  assert.equal(bucket.store.size, 0);
});

test('create answers 429 when the rate limiter says no, and stores nothing', async () => {
  const bucket = fakeBucket();
  const res = await create({ BUCKET: bucket, CODE_SECRET: 's', RATE_LIMITER: { limit: async () => ({ success: false }) } });
  assert.equal(res.status, 429);
  assert.equal(bucket.store.size, 0);
});

test('stored listing holds the code hash, never the code itself', async () => {
  const bucket = fakeBucket();
  const res = await create({ BUCKET: bucket, CODE_SECRET: 's' });
  const { id, code } = await res.json();
  const stored = bucket.store.get(`listings/${id}.json`);
  assert.equal(stored.includes(code), false);
  assert.match(JSON.parse(stored).codeHash, /^[0-9a-f]{64}$/);
});

test('OPTIONS preflight answers 204', async () => {
  const res = await call('/api', { method: 'OPTIONS', headers: { origin: 'https://samppafin.github.io' } });
  assert.equal(res.status, 204);
});
