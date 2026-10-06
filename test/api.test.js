// Integration: the real Worker under wrangler (local mode, `env.local`) with its own
// temporary local R2, so runs never share data (CLAUDE.md §10: API round trip).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { unstable_dev } from 'wrangler';

let worker, persistTo;
before(async () => {
  persistTo = mkdtempSync(path.join(tmpdir(), 'vk-api-'));
  worker = await unstable_dev('worker/src/index.js', {
    config: 'wrangler.toml',
    env: 'local',
    persistTo,
    logLevel: 'error',
    experimental: { disableExperimentalWarning: true },
  });
});
after(async () => {
  await worker.stop();
  rmSync(persistTo, { recursive: true, force: true });
});

const valid = () => ({
  title: 'Vauvanvaatteet 74–80',
  name: 'Testi',
  offer: 'Kassillinen bodyja, koot 74–80.',
  want: 'Vaatteita koossa 92–98.',
  city: 'Espoo',
  area: 'Leppävaara',
  email: 'testi@example.fi',
  phone: '040 123 4567',
  pledge: true,
});
const post = (body) => worker.fetch('/api/listings', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

test('create returns 201 with an id and a 5-character code', async () => {
  const res = await post(valid());
  assert.equal(res.status, 201);
  const { id, code } = await res.json();
  assert.match(id, /^\d{5}$/);
  assert.match(code, /^[A-HJ-NP-Z2-9]{5}$/);
  assert.equal(id.includes(code), false);
});

test('the code never appears again: not in the id, the public view or its headers', async () => {
  const { id, code } = await (await post(valid())).json();
  const res = await worker.fetch(`/api/listings/${id}`);
  assert.equal(res.status, 200);
  const text = await res.text();
  const headers = JSON.stringify([...res.headers]);
  assert.equal(text.includes(code), false);
  assert.equal(headers.includes(code), false);
  const pub = JSON.parse(text);
  assert.equal(pub.id, id);
  assert.equal(pub.offer, 'Kassillinen bodyja, koot 74–80.');
  assert.equal(pub.status, 'open');
  for (const secret of ['codeHash', 'code', 'contact', 'email', 'phone', 'whatsapp']) assert.equal(secret in pub, false, secret);
  assert.equal(text.includes('testi@example.fi'), false);
  assert.equal(text.includes('401234567'), false);
});

test('missing offer, want, city, contact or pledge answers 400 with the field', async () => {
  for (const [field, patch] of [['offer', { offer: '' }], ['want', { want: ' ' }], ['city', { city: '' }],
    ['contact', { email: '', phone: '' }], ['pledge', { pledge: false }]]) {
    const res = await post({ ...valid(), ...patch });
    assert.equal(res.status, 400, field);
    assert.ok((await res.json()).fields[field], field);
  }
});

test('a WhatsApp link without a number answers 400', async () => {
  const res = await post({ ...valid(), whatsapp: 'https://wa.me/' });
  assert.equal(res.status, 400);
  assert.ok((await res.json()).fields.whatsapp);
});

test('bad JSON answers 400 and a too large body 413', async () => {
  assert.equal((await post('{nope')).status, 400);
  assert.equal((await post({ ...valid(), offer: 'x'.repeat(9000) })).status, 413);
});

test('honeypot: looks like success to a bot, nothing is stored', async () => {
  const res = await post({ ...valid(), website: 'http://spam.example' });
  assert.equal(res.status, 201);
  const { id } = await res.json();
  assert.equal((await worker.fetch(`/api/listings/${id}`)).status, 404);
});

test('unknown or malformed id answers 404', async () => {
  assert.equal((await worker.fetch('/api/listings/99999x')).status, 404);
  assert.equal((await worker.fetch('/api/listings/..%2F..%2Fsecret')).status, 404);
});

test('CORS: the local site may call the API, other origins may not', async () => {
  const ok = await worker.fetch('/api', { headers: { origin: 'http://localhost:8082' } });
  assert.equal(ok.headers.get('access-control-allow-origin'), 'http://localhost:8082');
  const other = await worker.fetch('/api', { headers: { origin: 'https://evil.example' } });
  assert.equal(other.headers.get('access-control-allow-origin'), null);
});
