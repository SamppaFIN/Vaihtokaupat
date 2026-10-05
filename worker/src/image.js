/**
 * Copied from SamppaFIN/BandRock@7098a01 (worker/src/image.js).
 * Detects the image type from its own leading bytes. The Content-Type sent by the
 * browser is never trusted as such: the user controls it and it can lie.
 */

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // well above a JPEG downscaled to 1600 px

const SIGNATURES = [
  { type: 'image/jpeg', ext: 'jpg', bytes: [0xff, 0xd8, 0xff] },
  { type: 'image/png', ext: 'png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  {
    type: 'image/webp',
    ext: 'webp',
    bytes: [0x52, 0x49, 0x46, 0x46], // "RIFF"
    extra: (b) => b.length >= 12 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50, // "WEBP"
  },
];

/** @returns {{type: string, ext: string} | null} */
export function detectImageType(bytes) {
  for (const sig of SIGNATURES) {
    if (bytes.length < sig.bytes.length) continue;
    const match = sig.bytes.every((b, i) => bytes[i] === b) && (!sig.extra || sig.extra(bytes));
    if (match) return { type: sig.type, ext: sig.ext };
  }
  return null;
}
