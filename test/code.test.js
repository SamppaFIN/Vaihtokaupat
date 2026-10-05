// Copied from SamppaFIN/BandRock@7098a01 (test/code.test.js), master-code and slugify tests
// replaced by a test that the master codes are gone (decision 2026-10-05).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as code from '../worker/src/code.js';
import { generateCode, hashCode, verifyCode, verifyAdmin } from '../worker/src/code.js';

test('generateCode: 5 characters, no confusable letters (0/O, 1/I/L)', () => {
  for (let i = 0; i < 200; i++) {
    const c = generateCode();
    assert.equal(c.length, 5);
    assert.match(c, /^[A-HJ-NP-Z2-9]{5}$/);
  }
});

test('generateCode: random (not always the same)', () => {
  const codes = new Set(Array.from({ length: 50 }, generateCode));
  assert.ok(codes.size > 40, 'expected most of 50 codes to be unique');
});

test('hashCode + verifyCode: right code accepted, wrong one rejected', async () => {
  const secret = 'test-secret';
  const c = 'K7M2P';
  const hash = await hashCode(c, secret);
  assert.equal(typeof hash, 'string');
  assert.ok(hash.length >= 32);
  assert.equal(await verifyCode(c, hash, secret), true);
  assert.equal(await verifyCode('k7m2p', hash, secret), true); // case-insensitive
  assert.equal(await verifyCode('WRONG', hash, secret), false);
  assert.equal(await verifyCode(c, hash, 'other-secret'), false);
});

test('verifyCode: empty or missing code never matches', async () => {
  const hash = await hashCode('K7M2P', 's');
  assert.equal(await verifyCode('', hash, 's'), false);
  assert.equal(await verifyCode(undefined, hash, 's'), false);
  assert.equal(await verifyCode(null, hash, 's'), false);
});

test('hashCode: same code and secret always give the same hash', async () => {
  const a = await hashCode('K7M2P', 'x');
  const b = await hashCode('K7M2P', 'x');
  assert.equal(a, b);
});

test('verifyAdmin: right password accepted, wrong rejected, missing never', () => {
  assert.equal(verifyAdmin('password123', 'password123'), true);
  assert.equal(verifyAdmin('wrong', 'password123'), false);
  assert.equal(verifyAdmin('', 'password123'), false);
  assert.equal(verifyAdmin('password123', ''), false);
  assert.equal(verifyAdmin(undefined, 'password123'), false);
  assert.equal(verifyAdmin('password123', undefined), false);
  // strings of different length never match (no crash on the length check)
  assert.equal(verifyAdmin('short', 'a-much-longer-password'), false);
});

test('no public master codes: 00000 and 99999 are not special', async () => {
  assert.equal('isMasterCode' in code, false);
  assert.equal('MASTER_EDIT_CODE' in code, false);
  assert.equal('MASTER_DELETE_CODE' in code, false);
  const hash = await hashCode('K7M2P', 's');
  assert.equal(await verifyCode('00000', hash, 's'), false);
  assert.equal(await verifyCode('99999', hash, 's'), false);
});
