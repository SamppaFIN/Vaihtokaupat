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
    meta: new Map(),
    put: async function (k, v, opts) { store.set(k, v); this.meta.set(k, opts && opts.customMetadata); },
    get: async (k) => (store.has(k) ? { json: async () => JSON.parse(store.get(k)) } : null),
    list: async function ({ prefix }) {
      const objects = [...store.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key, customMetadata: this.meta.get(key) }));
      return { objects, truncated: false };
    },
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

const list = (env) => worker.fetch(new Request('http://localhost:8797/api/listings'), env);
const stored = (over) => ({
  id: '11111', title: 'Talvihaalari 104', name: 'Jenni', offer: 'Talvihaalari koko 104.', want: 'Koko 116.',
  city: 'Tampere', area: 'Hervanta', contact: { email: 'jenni@example.fi', phone: '+358401234567' },
  status: 'open', reports: 3, created: 1000, updated: 1000, codeHash: 'f'.repeat(64), ...over,
});

test('list: a listing saved before metadata v1 is read from the object itself (§12 rule 6)', async () => {
  const bucket = fakeBucket();
  // Old shape: customMetadata without v, offer, want or name.
  bucket.store.set('listings/11111.json', JSON.stringify(stored()));
  bucket.meta.set('listings/11111.json', { id: '11111', title: 'Talvihaalari 104', city: 'Tampere', area: 'Hervanta', status: 'open' });
  const { listings } = await (await list({ BUCKET: bucket })).json();
  assert.deepEqual(listings, [{
    id: '11111', title: 'Talvihaalari 104', name: 'Jenni', city: 'Tampere', area: 'Hervanta',
    offer: 'Talvihaalari koko 104.', want: 'Koko 116.', status: 'open', created: '1000',
  }]);
});

test('list: hidden listings are left out, newest first, never contacts, hash or reports', async () => {
  const bucket = fakeBucket();
  for (const l of [stored(), stored({ id: '22222', created: 3000 }), stored({ id: '33333', status: 'hidden', created: 2000 })]) {
    bucket.store.set(`listings/${l.id}.json`, JSON.stringify(l));
  }
  const res = await list({ BUCKET: bucket });
  const text = await res.text();
  assert.deepEqual(JSON.parse(text).listings.map((l) => l.id), ['22222', '11111']);
  for (const secret of ['jenni@example.fi', '401234567', 'codeHash', 'contact', 'reports', 'fff']) {
    assert.equal(text.includes(secret), false, secret);
  }
});

test('list: long texts are cut to a 140-character summary', async () => {
  const bucket = fakeBucket();
  bucket.store.set('listings/11111.json', JSON.stringify(stored({ offer: 'x'.repeat(600) })));
  const { listings } = await (await list({ BUCKET: bucket })).json();
  assert.equal(listings[0].offer.length, 140);
  assert.ok(listings[0].offer.endsWith('…'));
});

test('create writes v1 metadata with the card fields and no contacts', async () => {
  const bucket = fakeBucket();
  const { id } = await (await create({ BUCKET: bucket, CODE_SECRET: 's' })).json();
  const meta = bucket.meta.get(`listings/${id}.json`);
  assert.equal(meta.v, '1');
  assert.equal(meta.offer, 'a');
  assert.equal(JSON.stringify(meta).includes('401234567'), false);
  assert.ok(new TextEncoder().encode(JSON.stringify(meta)).length < 2048);
});

test('OPTIONS preflight answers 204', async () => {
  const res = await call('/api', { method: 'OPTIONS', headers: { origin: 'https://samppafin.github.io' } });
  assert.equal(res.status, 204);
});
