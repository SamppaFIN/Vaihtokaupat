/**
 * Contact links are built here, on the server, from values that schema.js already
 * normalised (CLAUDE.md §12 rule 4). A user-typed address is never used as an href as such.
 */

/** "+358401234567" → "0401234567" (area code lengths vary, so no grouping); others stay international. */
export function displayPhone(e164) {
  return e164.startsWith('+358') ? '0' + e164.slice(4) : e164;
}

/** Stored contact object → list of { type, label, href }, in a fixed order. */
export function contactLinks(contact) {
  const c = contact || {};
  const links = [];
  if (typeof c.email === 'string' && /^[^\s@<>"'`]+@[^\s@<>"'`]+$/.test(c.email)) {
    links.push({ type: 'email', label: c.email, href: 'mailto:' + c.email });
  }
  if (typeof c.phone === 'string' && /^\+\d{7,15}$/.test(c.phone)) {
    links.push({ type: 'phone', label: displayPhone(c.phone), href: 'tel:' + c.phone });
  }
  if (typeof c.whatsapp === 'string' && /^\+\d{7,15}$/.test(c.whatsapp)) {
    links.push({ type: 'whatsapp', label: 'WhatsApp ' + displayPhone(c.whatsapp), href: 'https://wa.me/' + c.whatsapp.slice(1) });
  }
  return links;
}
