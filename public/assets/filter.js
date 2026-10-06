// Grid filters (STORY-005), kept free of the DOM so node:test can check them directly.
// City, status and text search work together: a listing must pass all three.
'use strict';

const norm = (s) => String(s || '').toLocaleLowerCase('fi');

/** status: 'open' (default), 'traded', or '' for all. Every search word must match. */
export function filterListings(listings, { q = '', city = '', status = 'open' } = {}) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  return listings.filter((l) => {
    if (status && l.status !== status) return false;
    if (city && norm(l.city) !== norm(city)) return false;
    const haystack = norm([l.title, l.name, l.offer, l.want, l.city, l.area].join(' '));
    return words.every((w) => haystack.includes(w));
  });
}

/** Unique cities (case-insensitive, first spelling wins), sorted the Finnish way. */
export function citiesOf(listings) {
  const seen = new Map();
  for (const l of listings) if (l.city && !seen.has(norm(l.city))) seen.set(norm(l.city), l.city);
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'fi'));
}
