// Image resize in the browser (STORY-008): at most 1600 px on the longer side, re-encoded
// as JPEG through a canvas. Re-encoding writes only pixels, so EXIF/GPS cannot survive.
// createImageBitmap applies the EXIF orientation before it is dropped. The server checks
// all of this again (worker/src/jpeg.js).
'use strict';

export const MAX_SIDE = 1600;

/** Resolves to a JPEG Blob; rejects when the file is not an image the browser can read. */
export async function resizeToJpeg(file, max = MAX_SIDE, quality = 0.85) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode_failed'))), 'image/jpeg', quality);
  });
}
