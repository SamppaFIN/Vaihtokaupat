// Copied from SamppaFIN/BandRock@7098a01 (public/assets/router.js).
// Tiny router for "SITE_BASE/<id>#anchor". Does not depend on the repo name: SITE_BASE is
// derived from this module's own URL (import.meta.url), so the same code works locally
// (http://localhost:8082/Vaihtokaupat/) and on GitHub Pages (https://user.github.io/<repo>/).
'use strict';

export const SITE_BASE = new URL('..', import.meta.url).pathname;

// 404.html stored the original path in ?p=. Restore the clean URL (the user never sees
// the ?p= form) before the route is read.
export function restoreFromRedirect() {
  var params = new URLSearchParams(location.search);
  var p = params.get('p');
  if (p) history.replaceState(null, '', p);
}

// Parses the current URL: { id: null } = front page, { id: '0142' } = listing page.
export function parseRoute() {
  var path = location.pathname;
  if (path.indexOf(SITE_BASE) === 0) path = path.slice(SITE_BASE.length);
  path = path.replace(/^\/+|\/+$/g, '').replace(/^index\.html$/, '');
  return { id: path ? decodeURIComponent(path) : null, hash: location.hash };
}

export function pathFor(id) {
  return SITE_BASE + (id || '');
}
