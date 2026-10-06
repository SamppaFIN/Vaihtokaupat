/**
 * JPEG segment walk on the server (CLAUDE.md §12 rule 3: the browser's resize is only a
 * convenience). Removes every APP1–APP15 and COM segment, so EXIF and GPS can never be
 * stored even when the API is called around the form, and reads the real pixel size.
 * The entropy-coded data after SOS is copied as-is; nothing is decoded.
 */

const SOI = 0xd8, SOS = 0xda, EOI = 0xd9, COM = 0xfe;
const isSof = (m) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
const isStrippable = (m) => (m >= 0xe1 && m <= 0xef) || m === COM; // APP1..APP15, COM; APP0 (JFIF) stays

/** @returns {{ bytes: Uint8Array, width: number, height: number } | null} null when malformed */
export function cleanJpeg(input) {
  const b = input;
  if (b.length < 4 || b[0] !== 0xff || b[1] !== SOI) return null;
  const parts = [b.subarray(0, 2)];
  let width = 0, height = 0;
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) return null;
    let m = b[i + 1];
    while (m === 0xff) { i++; m = b[i + 1]; } // fill bytes
    if (m === undefined) return null;
    if (m === EOI) { parts.push(b.subarray(i, i + 2)); break; }
    if (m >= 0xd0 && m <= 0xd7) return null; // restart markers before SOS: malformed
    if (i + 4 > b.length) return null;
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2 || i + 2 + len > b.length) return null;
    if (isSof(m)) {
      if (len < 7) return null;
      height = (b[i + 5] << 8) | b[i + 6];
      width = (b[i + 7] << 8) | b[i + 8];
    }
    if (m === SOS) { parts.push(b.subarray(i)); break; } // header + scan data + EOI as-is
    if (!isStrippable(m)) parts.push(b.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  if (!width || !height) return null;
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return { bytes: out, width, height };
}

/** True when the bytes still contain an APP1 (EXIF/XMP) marker before the scan data. */
export function hasApp1(b) {
  for (let i = 2; i + 3 < b.length;) {
    if (b[i] !== 0xff) return false;
    const m = b[i + 1];
    if (m === 0xe1) return true;
    if (m === SOS || m === EOI) return false;
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  return false;
}
