// Integration: the real Worker under wrangler (local mode, `env.local`) with its own
// temporary local R2, so runs never share data (CLAUDE.md §10: API round trip).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { unstable_dev } from 'wrangler';
import { makeJpeg } from './fixtures.js';
import { hasApp1 } from '../worker/src/jpeg.js';

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

test('list returns the new listing as a card without contacts', async () => {
  const { id } = await (await post(valid())).json();
  const res = await worker.fetch('/api/listings');
  assert.equal(res.status, 200);
  const text = await res.text();
  const card = JSON.parse(text).listings.find((l) => l.id === id);
  assert.equal(card.title, 'Vauvanvaatteet 74–80');
  assert.equal(card.status, 'open');
  for (const secret of ['testi@example.fi', '401234567', 'codeHash', 'contact']) assert.equal(text.includes(secret), false, secret);
});

test('contact links come from their own POST endpoint, built by the server', async () => {
  const { id } = await (await post({ ...valid(), whatsapp: 'https://wa.me/358401112222' })).json();
  const res = await worker.fetch(`/api/listings/${id}/contact`, { method: 'POST' });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await res.json()).links, [
    { type: 'email', label: 'testi@example.fi', href: 'mailto:testi@example.fi' },
    { type: 'phone', label: '0401234567', href: 'tel:+358401234567' },
    { type: 'whatsapp', label: 'WhatsApp 0401112222', href: 'https://wa.me/358401112222' },
  ]);
  assert.equal((await worker.fetch(`/api/listings/${id}/contact`)).status, 405, 'GET is not allowed');
  assert.equal((await worker.fetch('/api/listings/99999/contact', { method: 'POST' })).status, 404);
});

// unstable_dev's fetch does not serialise a FormData body (the boundary is lost), so the
// multipart body is built with Request first, as a browser would send it.
const upload = async (id, code, bytes, name = 'kuva.jpg', type = 'image/jpeg') => {
  const form = new FormData();
  form.set('code', code);
  form.set('image', new File([bytes], name, { type }));
  const req = new Request('http://localhost/', { method: 'POST', body: form });
  return worker.fetch(`/api/listings/${id}/image`, {
    method: 'POST',
    headers: { 'content-type': req.headers.get('content-type') },
    body: await req.arrayBuffer(),
  });
};

test('image upload: needs the right code, and EXIF never reaches R2 even around the form', async () => {
  const { id, code } = await (await post(valid())).json();
  assert.equal((await upload(id, 'WRONG', makeJpeg())).status, 403);
  assert.equal((await upload('99999', code, makeJpeg())).status, 404);

  const res = await upload(id, code, makeJpeg({ w: 1200, h: 900 }));
  assert.equal(res.status, 201);
  const { image } = await res.json();
  assert.match(image.src, new RegExp(`^img/${id}/\\d+\\.jpg$`));
  assert.deepEqual([image.width, image.height], [1200, 900]);

  const served = await worker.fetch('/' + image.src);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('content-type'), 'image/jpeg');
  assert.equal(served.headers.get('x-content-type-options'), 'nosniff');
  const bytes = new Uint8Array(await served.arrayBuffer());
  assert.equal(hasApp1(bytes), false, 'no APP1 marker');
  assert.equal(new TextDecoder('latin1').decode(bytes).includes('GPS'), false);

  const pub = await (await worker.fetch(`/api/listings/${id}`)).json();
  assert.deepEqual(pub.image, image);
});

test('image upload: HTML named .jpg, PNG and too large images are rejected', async () => {
  const { id, code } = await (await post(valid())).json();
  const html = new TextEncoder().encode('<html><script>alert(1)</script></html>');
  const fake = await upload(id, code, html, 'kuva.jpg', 'image/jpeg');
  assert.equal(fake.status, 400);
  assert.ok((await fake.json()).fields.image);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  assert.equal((await upload(id, code, png, 'kuva.png', 'image/png')).status, 400);
  assert.equal((await upload(id, code, makeJpeg({ w: 4000, h: 3000 }))).status, 400);
});

test('image upload: the old image is removed from R2 when a new one is saved', async () => {
  const { id, code } = await (await post(valid())).json();
  const first = (await (await upload(id, code, makeJpeg())).json()).image.src;
  await new Promise((r) => setTimeout(r, 5)); // distinct timestamp in the key
  const second = (await (await upload(id, code, makeJpeg())).json()).image.src;
  assert.notEqual(first, second);
  assert.equal((await worker.fetch('/' + first)).status, 404);
  assert.equal((await worker.fetch('/' + second)).status, 200);
});

test('image route only serves image keys', async () => {
  assert.equal((await worker.fetch('/img/12345/../../listings/12345.json')).status, 404);
  assert.equal((await worker.fetch('/img/listings/12345.json')).status, 404);
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
