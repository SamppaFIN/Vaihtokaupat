import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, BASE } from './pages-sim.mjs';

let server, origin;
before(async () => {
  server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  origin = `http://localhost:${server.address().port}`;
});
after(() => server.close());

const get = (path) => fetch(origin + path, { redirect: 'manual' });

test('site answers under the sub-path /Vaihtokaupat/', async () => {
  const res = await get(BASE);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /<h1[^>]*>Vaihtokaupat<\/h1>/);
});

test('"/" and the sub-path without slash redirect to the sub-path', async () => {
  for (const p of ['/', '/Vaihtokaupat']) {
    const res = await get(p);
    assert.equal(res.status, 301, p);
    assert.equal(res.headers.get('location'), BASE);
  }
});

test('existing file is served with its type', async () => {
  const res = await get(BASE + 'assets/router.js');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /javascript/);
});

test('deep link that is not a file answers 404.html with status 404, like GitHub Pages', async () => {
  const res = await get(BASE + '0142?x=1#yhteys');
  assert.equal(res.status, 404);
  assert.match(await res.text(), /index\.html\?p=/);
});

test('path outside the sub-path or escaping public/ answers 404', async () => {
  assert.equal((await get('/other/')).status, 404);
  assert.equal((await get(BASE + '%2e%2e/package.json')).status, 404);
});
