// Synthetic JPEG structure for tests (markers only; the server never decodes pixels).
const enc = (s) => [...new TextEncoder().encode(s)];
const seg = (marker, payload) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload];

export const EXIF_SEGMENT = seg(0xe1, [...enc('Exif\0\0'), ...enc('GPS 60.17N 24.94E')]);
export const COMMENT_SEGMENT = seg(0xfe, enc('Canon EOS'));
const jfif = seg(0xe0, [...enc('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0]);
const sof = (w, h) => seg(0xc0, [8, h >> 8, h & 0xff, w >> 8, w & 0xff, 1, 1, 0x11, 0]);
export const SCAN = [...seg(0xda, [1, 1, 0, 0, 0x3f, 0]), 0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd9];
export const JFIF_SEGMENT = jfif;

export const makeJpeg = ({ w = 1600, h = 1200, withExif = true } = {}) =>
  new Uint8Array([0xff, 0xd8, ...jfif, ...(withExif ? EXIF_SEGMENT : []), ...COMMENT_SEGMENT, ...sof(w, h), ...SCAN]);
