import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanJpeg, hasApp1 } from '../worker/src/jpeg.js';
import { makeJpeg, COMMENT_SEGMENT, JFIF_SEGMENT, SCAN } from './fixtures.js';

test('EXIF (APP1) and comments are removed; JFIF, frame and scan data stay', () => {
  const input = makeJpeg();
  assert.equal(hasApp1(input), true);
  const out = cleanJpeg(input);
  assert.equal(hasApp1(out.bytes), false);
  const text = new TextDecoder('latin1').decode(out.bytes);
  assert.equal(text.includes('Exif'), false);
  assert.equal(text.includes('GPS'), false);
  assert.equal(text.includes('Canon'), false);
  assert.equal(text.includes('JFIF'), true);
  assert.deepEqual([...out.bytes.slice(-7)], [0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd9]);
  assert.equal(out.width, 1600);
  assert.equal(out.height, 1200);
});

test('a clean JPEG passes through unchanged apart from comments', () => {
  const input = makeJpeg({ withExif: false });
  assert.equal(cleanJpeg(input).bytes.length, input.length - COMMENT_SEGMENT.length);
});

test('malformed or non-JPEG data is rejected', () => {
  assert.equal(cleanJpeg(new TextEncoder().encode('<html><script>alert(1)</script></html>')), null);
  assert.equal(cleanJpeg(new Uint8Array([0xff, 0xd8])), null);
  assert.equal(cleanJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xff])), null, 'length past the end');
  assert.equal(cleanJpeg(new Uint8Array([0xff, 0xd8, ...JFIF_SEGMENT, ...SCAN])), null, 'no SOF means no size');
});
