/**
 * Vaihtokaupat Worker: listings in R2 as JSON, no database.
 * Structure copied from SamppaFIN/BandRock@7098a01 (worker/src/index.js); the
 * listing routes are added story by story (STORY-007 onwards).
 *
 *   GET /api   health check
 *
 * No personal data or IP addresses are written to logs (CLAUDE.md §9 rule 6).
 */

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

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    try {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

      const parts = new URL(request.url).pathname.split('/').filter(Boolean);

      if (parts[0] === 'api' && parts.length === 1) {
        if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, cors);
        return json({ ok: true }, 200, cors);
      }

      return json({ error: 'not_found' }, 404, cors);
    } catch (err) {
      // Error name only: the message or the request could carry user data.
      console.error('server_error', err && err.name);
      return json({ error: 'server_error' }, 500, cors);
    }
  },
};
