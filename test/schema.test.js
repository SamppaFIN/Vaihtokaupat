import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeText, normalizePhone, normalizeWhatsapp, normalizeEmail, validateCreate, LIMITS } from '../worker/src/schema.js';

const valid = () => ({
  offer: 'Kassillinen bodyja, koot 74–80.',
  want: 'Vaatteita koossa 92–98.',
  city: 'Espoo',
  area: 'Leppävaara',
  phone: '040 123 4567',
  pledge: true,
});

test('normalizePhone: Finnish formats become +358', () => {
  assert.equal(normalizePhone('040 123 4567'), '+358401234567');
  assert.equal(normalizePhone('040-1234567'), '+358401234567');
  assert.equal(normalizePhone('+358 40 123 4567'), '+358401234567');
  assert.equal(normalizePhone('+358 (0)40 123 4567'), '+358401234567');
  assert.equal(normalizePhone('00358401234567'), '+358401234567');
  assert.equal(normalizePhone('358401234567'), '+358401234567');
  assert.equal(normalizePhone('09 123 4567'), '+35891234567');
});

test('normalizePhone: other countries keep their code, nonsense is rejected', () => {
  assert.equal(normalizePhone('+46 70 123 45 67'), '+46701234567');
  for (const bad of ['', 'abc', '123', '401234567', '+0123456789', '+35840123456789012', 'javascript:alert(1)', null, 42]) {
    assert.equal(normalizePhone(bad), null, String(bad));
  }
});

test('normalizeWhatsapp: number or wa.me link with a number', () => {
  assert.deepEqual(normalizeWhatsapp('040 123 4567'), { value: '+358401234567' });
  assert.deepEqual(normalizeWhatsapp('https://wa.me/358401234567'), { value: '+358401234567' });
  assert.deepEqual(normalizeWhatsapp('wa.me/358401234567'), { value: '+358401234567' });
  assert.deepEqual(normalizeWhatsapp('https://api.whatsapp.com/send?phone=358401234567'), { value: '+358401234567' });
});

test('normalizeWhatsapp: a link without a number is rejected (BandRock bug 1.10.2026)', () => {
  for (const link of ['https://wa.me/', 'wa.me', 'https://wa.me/message/ABC123', 'https://api.whatsapp.com/send', 'https://whatsapp.com']) {
    assert.ok(normalizeWhatsapp(link).error, link);
  }
  assert.ok(normalizeWhatsapp('https://evil.example/358401234567').error, 'other hosts are not WhatsApp links');
});

test('normalizeEmail: lower-cases and rejects what is not an address', () => {
  assert.equal(normalizeEmail('  Hanna@Example.FI '), 'hanna@example.fi');
  for (const bad of ['', 'hanna', 'hanna@', '@example.fi', 'a b@example.fi', 'javascript:alert(1)@x.fi"', 'x@y', null]) {
    assert.equal(normalizeEmail(bad), null, String(bad));
  }
});

test('sanitizeText: strips control and bidi characters, keeps newlines only when asked', () => {
  assert.equal(sanitizeText('  a\u0000b‮c  '), 'abc');
  assert.equal(sanitizeText('rivi 1\r\nrivi 2'), 'rivi 1 rivi 2');
  assert.equal(sanitizeText('rivi 1\r\n\n\n\nrivi 2', { multiline: true }), 'rivi 1\n\nrivi 2');
  assert.equal(sanitizeText(undefined), '');
  assert.equal(sanitizeText({ toString: () => 'x' }), '');
});

test('validateCreate: a valid listing passes with normalised contacts', () => {
  const r = validateCreate(valid());
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.contact, { phone: '+358401234567' });
  assert.equal(r.value.area, 'Leppävaara');
});

test('validateCreate: offer, want, city, a contact and the pledge are required', () => {
  for (const field of ['offer', 'want', 'city']) {
    const input = { ...valid(), [field]: '   ' };
    assert.ok(validateCreate(input).errors[field], field);
  }
  assert.ok(validateCreate({ ...valid(), phone: '' }).errors.contact);
  for (const pledge of [false, 'true', 1, undefined]) {
    assert.ok(validateCreate({ ...valid(), pledge }).errors.pledge, String(pledge));
  }
  assert.equal(validateCreate(null).ok, false);
});

test('validateCreate: invalid contact gets its own error, not the "missing contact" one', () => {
  const r = validateCreate({ ...valid(), phone: '', whatsapp: 'https://wa.me/' });
  assert.ok(r.errors.whatsapp);
  assert.equal(r.errors.contact, undefined);
});

test('validateCreate: too long text is rejected, not silently cut', () => {
  const r = validateCreate({ ...valid(), offer: 'x'.repeat(LIMITS.offer + 1) });
  assert.ok(r.errors.offer);
});

test('validateCreate: unknown fields are not copied into the listing', () => {
  const r = validateCreate({ ...valid(), codeHash: 'x', status: 'hidden', id: '00000' });
  assert.equal(r.ok, true);
  assert.equal('codeHash' in r.value, false);
  assert.equal('status' in r.value, false);
  assert.equal('id' in r.value, false);
});
