/**
 * Copied from SamppaFIN/BandRock@7098a01 (worker/src/code.js), without the public
 * master codes 00000/99999 and without slugify (decision 2026-10-05, CLAUDE.md §13).
 *
 * Edit code: 5 characters with no confusable letters (no 0/O, 1/I/L).
 * The code never reaches R2 as such; only its HMAC-SHA256 hash is stored.
 * The code must never appear in a listing id, URL or any later response.
 */

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateCode() {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

async function hmac(text, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashCode(code, secret) {
  return hmac(code.toUpperCase(), secret);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyCode(code, storedHash, secret) {
  if (typeof code !== 'string' || !code) return false;
  const hash = await hashCode(code, secret);
  return timingSafeEqual(hash, storedHash);
}

/** Admin password check (env.ADMIN_SECRET). Constant-time for equal lengths. */
export function verifyAdmin(given, secret) {
  if (typeof given !== 'string' || !given || typeof secret !== 'string' || !secret) return false;
  return timingSafeEqual(given, secret);
}
