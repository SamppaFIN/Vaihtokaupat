/**
 * Server-side validation for listings (CLAUDE.md §12 rule 3). The browser check is only a
 * convenience: the API is public and can be called around the form. Every field is
 * trimmed, stripped of control characters and length-checked; contacts are normalised
 * here so that links are later built from clean values only (§12 rule 4).
 */

export const LIMITS = { title: 80, name: 40, offer: 600, want: 600, city: 60, area: 60, email: 254 };

// C0/C1 control characters except tab and newline, and bidi overrides that can disguise text.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F‪-‮⁦-⁩]/g;

/** Returns the cleaned string ('' when missing). Newlines survive only when `multiline`. */
export function sanitizeText(value, { multiline = false } = {}) {
  if (typeof value !== 'string') return '';
  let s = value.replace(CONTROL, '').replace(/\r\n?/g, '\n');
  s = multiline ? s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n') : s.replace(/\s+/g, ' ');
  return s.trim();
}

/**
 * Finnish and international phone numbers to E.164: "040 123 4567" → "+358401234567".
 * Returns null when the value cannot be a phone number.
 */
export function normalizePhone(value) {
  if (typeof value !== 'string') return null;
  let s = value.replace(/\(0\)/g, '').replace(/[\s\-(). ]/g, ''); // "+358 (0)40…"
  if (s.startsWith('00')) s = '+' + s.slice(2);
  else if (s.startsWith('0')) s = '+358' + s.slice(1);
  else if (/^358\d/.test(s)) s = '+' + s;
  return /^\+[1-9]\d{6,14}$/.test(s) ? s : null;
}

/**
 * WhatsApp accepts a phone number or a wa.me / api.whatsapp.com link. A link without a
 * number is rejected (BandRock bug 1.10.2026). Returns { value } or { error }.
 */
export function normalizeWhatsapp(value) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (/^(https?:\/\/)?(wa\.me|(api|web)\.whatsapp\.com|whatsapp\.com)\b/i.test(s)) {
    let digits = '';
    try {
      const url = new URL(/^https?:/i.test(s) ? s : 'https://' + s);
      digits = url.hostname.toLowerCase() === 'wa.me' ? url.pathname.replace(/^\/+|\/+$/g, '') : url.searchParams.get('phone') || '';
    } catch {}
    if (!/^\+?\d+$/.test(digits)) return { error: 'WhatsApp-linkistä puuttuu puhelinnumero.' };
    const phone = normalizePhone(digits.startsWith('+') ? digits : '+' + digits);
    return phone ? { value: phone } : { error: 'WhatsApp-linkin numero ei ole kelvollinen.' };
  }
  const phone = normalizePhone(s);
  return phone ? { value: phone } : { error: 'Anna WhatsApp-numero, esim. 040 123 4567.' };
}

/** Lower-cases and checks the shape; returns null when it is not an address. */
export function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const s = value.trim().toLowerCase();
  if (s.length > LIMITS.email) return null;
  return /^[^\s@<>"'`]+@[^\s@<>"'`]+\.[a-z]{2,}$/.test(s) ? s : null;
}

const REQUIRED_TEXT = {
  offer: 'Kerro mitä tarjoat.',
  want: 'Kerro mitä toivot tilalle.',
  city: 'Anna paikkakunta.',
};

/** Validates a create request. Returns { ok: true, value } or { ok: false, errors }. */
export function validateCreate(input) {
  const src = input && typeof input === 'object' ? input : {};
  const errors = {};
  const value = {};

  for (const field of ['title', 'name', 'offer', 'want', 'city', 'area']) {
    const text = sanitizeText(src[field], { multiline: field === 'offer' || field === 'want' });
    if (!text && REQUIRED_TEXT[field]) errors[field] = REQUIRED_TEXT[field];
    else if (text.length > LIMITS[field]) errors[field] = `Enintään ${LIMITS[field]} merkkiä.`;
    value[field] = text;
  }

  const contact = {};
  if (sanitizeText(src.email)) {
    const email = normalizeEmail(sanitizeText(src.email));
    if (email) contact.email = email;
    else errors.email = 'Sähköpostiosoite ei ole kelvollinen.';
  }
  if (sanitizeText(src.phone)) {
    const phone = normalizePhone(sanitizeText(src.phone));
    if (phone) contact.phone = phone;
    else errors.phone = 'Puhelinnumero ei ole kelvollinen, esim. 040 123 4567.';
  }
  if (sanitizeText(src.whatsapp)) {
    const wa = normalizeWhatsapp(sanitizeText(src.whatsapp));
    if (wa.value) contact.whatsapp = wa.value;
    else errors.whatsapp = wa.error;
  }
  if (!Object.keys(contact).length && !errors.email && !errors.phone && !errors.whatsapp) {
    errors.contact = 'Anna vähintään yksi yhteystieto.';
  }
  value.contact = contact;

  if (src.pledge !== true) errors.pledge = 'Liittymislupaus on pakollinen.';

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}
