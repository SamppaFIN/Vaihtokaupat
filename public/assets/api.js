// Worker API address. Local development (pages simulator on localhost) talks to
// `npm run dev:worker` on port 8797; everything else to the production Worker.
'use strict';

export const API_URL = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  ? 'http://localhost:8797/api'
  : 'https://vaihtokaupat.es3-world-worker.workers.dev/api';

/** POST JSON; resolves to { status, body } and never throws on HTTP errors. */
export async function postJson(path, data) {
  const res = await fetch(API_URL + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  });
  let body = null;
  try { body = await res.json(); } catch {}
  return { status: res.status, body };
}
