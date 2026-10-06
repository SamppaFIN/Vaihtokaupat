/**
 * Vaihtokaupat Worker: listings in R2 as JSON, no database.
 * Structure copied from SamppaFIN/BandRock@7098a01 (worker/src/index.js).
 *
 *   GET    /api                  health check
 *   GET    /api/listings         cards for the grid (no contacts, no hidden listings)
 *   POST   /api/listings         new listing; returns the edit code ONCE
 *   GET    /api/listings/:id     public view (never the code hash, never contacts)
 *   POST   /api/listings/:id/contact   contact links, revealed on a button press only
 *   POST   /api/listings/:id/image     image upload with the edit code (multipart: code, image)
 *   GET    /img/<id>/<timestamp>.jpg   uploaded image
 *
 * No personal data or IP addresses are written to logs (CLAUDE.md §9 rule 6).
 */
import { validateCreate } from './schema.js';
import { generateCode, hashCode, verifyCode } from './code.js';
import { contactLinks } from './contact.js';
import { detectImageType, MAX_IMAGE_BYTES } from './image.js';
import { cleanJpeg } from './jpeg.js';

const MAX_IMAGE_SIDE = 1600;

const MAX_BODY = 8192; // two 600-character texts in UTF-8 plus the short fields fit easily

const json = (body, status, headers) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });

function corsHeaders(request, env) {
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = request.headers.get('origin');
  const headers = {
    vary: 'origin',
    'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': 'content-type',
  };
  if (origin && allowed.includes(origin)) headers['access-control-allow-origin'] = origin;
  return headers;
}

async function rateLimited(env, key) {
  if (!env.RATE_LIMITER) return false; // local env without the binding: not limited
  try {
    const { success } = await env.RATE_LIMITER.limit({ key });
    return !success;
  } catch {
    return false; // limiter unavailable: do not block use because of it
  }
}

async function readBody(request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY) return { error: { body: { error: 'too_large' }, status: 413 } };
  try {
    return { value: JSON.parse(raw) };
  } catch {
    return { error: { body: { error: 'bad_json' }, status: 400 } };
  }
}

const keyOf = (id) => `listings/${id}.json`;

// Public fields only: the code hash and the contacts never leave through this view
// (contacts are revealed by their own endpoint, STORY-006).
function publicView(listing) {
  const { codeHash, contact, reports, ...pub } = listing;
  return pub;
}

const SUMMARY = 140;
const summary = (text) => {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > SUMMARY ? s.slice(0, SUMMARY - 1).trimEnd() + '…' : s;
};

// One card in the list. Built field by field (a whitelist), so contacts, the code hash
// or report counts can never slip into the list response (§9 rule 7). Values are strings
// because R2 customMetadata only holds strings.
function cardFor(listing) {
  return {
    id: String(listing.id),
    title: listing.title || '',
    name: listing.name || '',
    city: listing.city || '',
    area: listing.area || '',
    offer: summary(listing.offer),
    want: summary(listing.want),
    status: listing.status || 'open',
    created: String(listing.created || 0),
  };
}

// customMetadata version. Listings saved before v1 (STORY-007) only had id/title/city/
// area/status; listListings reads those from the object itself (§12 rule 6).
const META_VERSION = '1';
function customMetaFor(listing) {
  return { ...cardFor(listing), v: META_VERSION };
}

// Ticket-style number such as 40291. Listings are public, so the id is not a secret,
// and it is never derived from the edit code.
async function uniqueId(env) {
  for (let i = 0; i < 10; i++) {
    const id = String(10000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 90000));
    if (!(await env.BUCKET.head(keyOf(id)))) return id;
  }
  throw new Error('id_space_exhausted');
}

async function createListing(request, env, cors) {
  if (!env.CODE_SECRET) return json({ error: 'server_misconfigured' }, 500, cors);

  const { value: input, error } = await readBody(request);
  if (error) return json(error.body, error.status, cors);

  // Honeypot: a human never sees or fills it. A bot gets an answer that looks like success.
  if (input && input.website) return json({ ok: true, id: 'ok', code: '-----' }, 201, cors);

  if (await rateLimited(env, 'create')) return json({ error: 'busy' }, 429, cors);

  const result = validateCreate(input);
  if (!result.ok) return json({ error: 'invalid', fields: result.errors }, 400, cors);

  const id = await uniqueId(env);
  const code = generateCode();
  const now = Date.now();
  const listing = {
    id,
    ...result.value,
    status: 'open',
    reports: 0,
    created: now,
    updated: now,
    codeHash: await hashCode(code, env.CODE_SECRET),
  };

  await env.BUCKET.put(keyOf(id), JSON.stringify(listing), { customMetadata: customMetaFor(listing) });
  return json({ ok: true, id, code }, 201, cors);
}

async function listListings(env, cors) {
  const listings = [];
  let cursor;
  do {
    const page = await env.BUCKET.list({ prefix: 'listings/', cursor, include: ['customMetadata'] });
    for (const obj of page.objects) {
      let card;
      if (obj.customMetadata && obj.customMetadata.v === META_VERSION) {
        const { v, ...meta } = obj.customMetadata;
        card = cardFor(meta);
      } else {
        const body = await env.BUCKET.get(obj.key);
        if (!body) continue;
        card = cardFor(await body.json());
      }
      if (card.status !== 'hidden') listings.push(card);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  listings.sort((a, b) => Number(b.created) - Number(a.created));
  return json({ listings }, 200, { ...cors, 'cache-control': 'no-store' });
}

// Loads a listing for an owner action. 404 before 403, so a wrong code never tells
// more than an unknown id would.
async function loadWithCode(env, id, code) {
  if (!/^\d{5}$/.test(id)) return { status: 404, error: 'not_found' };
  const obj = await env.BUCKET.get(keyOf(id));
  if (!obj) return { status: 404, error: 'not_found' };
  const listing = await obj.json();
  if (!(await verifyCode(code, listing.codeHash, env.CODE_SECRET))) return { status: 403, error: 'forbidden' };
  return { listing };
}

// Image upload with the edit code. The browser already resized the image to a JPEG
// without EXIF, but the server checks everything again (§12 rule 3): JPEG by its own
// bytes, metadata segments removed, at most 1600 px. Every other file of the listing
// under img/<id>/ is removed, so an old image never stays behind.
async function uploadImage(request, env, id, cors) {
  if (!env.CODE_SECRET) return json({ error: 'server_misconfigured' }, 500, cors);
  if (await rateLimited(env, `edit:${id}`)) return json({ error: 'busy' }, 429, cors);

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'bad_form' }, 400, cors);
  }
  const loaded = await loadWithCode(env, id, String(form.get('code') || ''));
  if (loaded.error) return json({ error: loaded.error }, loaded.status, cors);

  const invalid = (message) => json({ error: 'invalid', fields: { image: message } }, 400, cors);
  const file = form.get('image');
  if (!(file instanceof File) || file.size === 0) return invalid('Valitse kuva.');
  if (file.size > MAX_IMAGE_BYTES) return invalid('Kuva on liian suuri.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectImageType(bytes);
  const clean = type && type.ext === 'jpg' ? cleanJpeg(bytes) : null;
  if (!clean) return invalid('Tiedosto ei ole tunnistettu kuva.');
  if (clean.width > MAX_IMAGE_SIDE || clean.height > MAX_IMAGE_SIDE) return invalid(`Kuva on liian suuri, enintään ${MAX_IMAGE_SIDE} px.`);

  const key = `img/${id}/${Date.now()}.jpg`;
  await env.BUCKET.put(key, clean.bytes, { httpMetadata: { contentType: 'image/jpeg' } });
  const old = await env.BUCKET.list({ prefix: `img/${id}/` });
  for (const o of old.objects) if (o.key !== key) await env.BUCKET.delete(o.key);

  const image = { src: key, width: clean.width, height: clean.height };
  const updated = { ...loaded.listing, image, updated: Date.now() };
  await env.BUCKET.put(keyOf(id), JSON.stringify(updated), { customMetadata: customMetaFor(updated) });
  return json({ ok: true, image }, 201, cors);
}

async function serveImage(env, key) {
  if (!/^img\/\d{5}\/\d+\.jpg$/.test(key)) return json({ error: 'not_found' }, 404);
  const obj = await env.BUCKET.get(key);
  if (!obj) return json({ error: 'not_found' }, 404);
  return new Response(obj.body, {
    headers: {
      'content-type': 'image/jpeg',
      'cache-control': 'public, max-age=31536000, immutable', // timestamp in the name: a key never changes content
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'",
    },
  });
}

// Contacts are revealed only through this POST, never in the list or the public view
// (§9 rule 7). POST keeps them out of caches and crawlers; STORY-015 adds Turnstile here.
async function revealContact(env, id, cors) {
  if (!/^\d{5}$/.test(id)) return json({ error: 'not_found' }, 404, cors);
  if (await rateLimited(env, `contact:${id}`)) return json({ error: 'busy' }, 429, cors);
  const obj = await env.BUCKET.get(keyOf(id));
  if (!obj) return json({ error: 'not_found' }, 404, cors);
  const listing = await obj.json();
  if (listing.status === 'hidden') return json({ error: 'not_found' }, 404, cors);
  return json({ links: contactLinks(listing.contact) }, 200, { ...cors, 'cache-control': 'no-store' });
}

async function getListing(env, id, cors) {
  if (!/^\d{5}$/.test(id)) return json({ error: 'not_found' }, 404, cors);
  const obj = await env.BUCKET.get(keyOf(id));
  if (!obj) return json({ error: 'not_found' }, 404, cors);
  const listing = await obj.json();
  if (listing.status === 'hidden') return json({ error: 'not_found' }, 404, cors);
  return json(publicView(listing), 200, { ...cors, 'cache-control': 'no-store' });
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    try {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

      const parts = new URL(request.url).pathname.split('/').filter(Boolean);

      if (parts[0] === 'img') {
        if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, cors);
        return await serveImage(env, parts.join('/'));
      }

      if (parts[0] === 'api' && parts.length === 1) {
        if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, cors);
        return json({ ok: true }, 200, cors);
      }

      if (parts[0] === 'api' && parts[1] === 'listings') {
        if (parts.length === 2 && request.method === 'GET') return await listListings(env, cors);
        if (parts.length === 2 && request.method === 'POST') return await createListing(request, env, cors);
        if (parts.length === 3 && request.method === 'GET') return await getListing(env, decodeURIComponent(parts[2]), cors);
        if (parts.length === 4 && parts[3] === 'contact' && request.method === 'POST') {
          return await revealContact(env, decodeURIComponent(parts[2]), cors);
        }
        if (parts.length === 4 && parts[3] === 'image' && request.method === 'POST') {
          return await uploadImage(request, env, decodeURIComponent(parts[2]), cors);
        }
        return json({ error: 'method_not_allowed' }, 405, cors);
      }

      return json({ error: 'not_found' }, 404, cors);
    } catch (err) {
      // Error name only: the message or the request could carry user data.
      console.error('server_error', err && err.name);
      return json({ error: 'server_error' }, 500, cors);
    }
  },
};
