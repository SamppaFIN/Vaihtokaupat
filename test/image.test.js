// Copied from SamppaFIN/BandRock@7098a01 (test/image.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectImageType, MAX_IMAGE_BYTES } from '../worker/src/image.js';

const bytes = (...vals) => new Uint8Array(vals);

test('detectImageType: JPEG is recognised from leading bytes', () => {
  const r = detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0));
  assert.deepEqual(r, { type: 'image/jpeg', ext: 'jpg' });
});

test('detectImageType: PNG is recognised from leading bytes', () => {
  const r = detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0));
  assert.deepEqual(r, { type: 'image/png', ext: 'png' });
});

test('detectImageType: WebP needs both the RIFF and the WEBP marker', () => {
  // RIFF + size (4 bytes, not checked) + "WEBP"
  const riff = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
  const r = detectImageType(bytes(...riff));
  assert.deepEqual(r, { type: 'image/webp', ext: 'webp' });

  // RIFF start without the WEBP marker (another RIFF file such as .wav) is rejected
  const notWebp = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45];
  assert.equal(detectImageType(bytes(...notWebp)), null);
});

test('detectImageType: unknown or disguised file is rejected', () => {
  assert.equal(detectImageType(bytes(0, 0, 0, 0)), null);
  assert.equal(detectImageType(new Uint8Array()), null);
  // GIF signature ("GIF89a"): not a supported type
  assert.equal(detectImageType(new TextEncoder().encode('GIF89a')), null);
  // HTML named .jpg (disguised extension): the leading bytes do not match
  assert.equal(detectImageType(new TextEncoder().encode('<script>alert(1)</script>')), null);
});

test('detectImageType: too short data neither crashes nor matches by accident', () => {
  assert.equal(detectImageType(bytes(0xff, 0xd8)), null);
  assert.equal(detectImageType(bytes(0x89, 0x50)), null);
});

test('MAX_IMAGE_BYTES is a sensible limit for a downscaled image', () => {
  assert.equal(MAX_IMAGE_BYTES, 5 * 1024 * 1024);
});
