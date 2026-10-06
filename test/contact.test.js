import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contactLinks, displayPhone } from '../worker/src/contact.js';
import { validateCreate } from '../worker/src/schema.js';

test('the CLAUDE.md §12 rule 4 example: "040 123 4567" → +358401234567 → https://wa.me/358401234567', () => {
  const { value } = validateCreate({ offer: 'a', want: 'b', city: 'c', phone: '040 123 4567', whatsapp: '040 123 4567', pledge: true });
  assert.deepEqual(contactLinks(value.contact), [
    { type: 'phone', label: '0401234567', href: 'tel:+358401234567' },
    { type: 'whatsapp', label: 'WhatsApp 0401234567', href: 'https://wa.me/358401234567' },
  ]);
});

test('email becomes a mailto: link', () => {
  assert.deepEqual(contactLinks({ email: 'hanna@example.fi' }), [{ type: 'email', label: 'hanna@example.fi', href: 'mailto:hanna@example.fi' }]);
});

test('values that are not normalised are never turned into links', () => {
  assert.deepEqual(contactLinks({ email: 'javascript:alert(1)', phone: '040 123 4567', whatsapp: 'https://evil.example' }), []);
  assert.deepEqual(contactLinks({ email: 'a b@x.fi" onclick="x' }), []);
  assert.deepEqual(contactLinks(null), []);
  assert.deepEqual(contactLinks({}), []);
});

test('displayPhone: Finnish numbers in national form, others international', () => {
  assert.equal(displayPhone('+35891234567'), '091234567');
  assert.equal(displayPhone('+46701234567'), '+46701234567');
});
