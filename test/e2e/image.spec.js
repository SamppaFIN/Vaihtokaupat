import { test, expect } from '@playwright/test';
import { EXIF_SEGMENT } from '../fixtures.js';
import { hasApp1, cleanJpeg } from '../../worker/src/jpeg.js';

// STORY-008: image upload through the real form, against the local Worker.

const WORKER = 'http://localhost:8797';

// A real 3000 × 2000 JPEG drawn by the browser, with an EXIF (APP1) segment carrying
// "GPS …" inserted right after SOI, like a phone photo.
async function photoWithExif(page) {
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 3000; c.height = 2000;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 3000, 2000);
    g.addColorStop(0, '#d4af37'); g.addColorStop(1, '#111216');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 3000, 2000);
    return c.toDataURL('image/jpeg', 0.9).split(',')[1];
  });
  const jpeg = Buffer.from(b64, 'base64');
  const withExif = Buffer.concat([jpeg.subarray(0, 2), Buffer.from(EXIF_SEGMENT), jpeg.subarray(2)]);
  expect(hasApp1(withExif)).toBe(true);
  return withExif;
}

async function fillForm(page) {
  await page.goto('uusi');
  await page.getByLabel('Tarjoan pakollinen').fill('Talvihaalari koko 104');
  await page.getByLabel('Toivon tilalle pakollinen').fill('Koko 116');
  await page.getByLabel('Paikkakunta pakollinen').fill('Tampere');
  await page.getByLabel('Puhelin', { exact: true }).fill('040 123 4567');
  await page.getByLabel(/Lupaan, että en myy/).check();
}

test('a phone photo is resized to 1600 px and stored without EXIF (no APP1 marker)', async ({ page, request }) => {
  const photo = await photoWithExif(page);
  await fillForm(page);
  await page.getByLabel('Kuva tavarasta').setInputFiles({ name: 'IMG_0001.jpg', mimeType: 'image/jpeg', buffer: photo });
  await page.getByRole('button', { name: 'Julkaise ilmoitus' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tallenna muokkauskoodi');
  await expect(page.locator('.image-warning')).toBeHidden();

  const id = (await page.getByRole('link', { name: /Avaa ilmoitus #\d{5}/ }).textContent()).match(/\d{5}/)[0];
  const listing = await (await request.get(`${WORKER}/api/listings/${id}`)).json();
  expect([listing.image.width, listing.image.height]).toEqual([1600, 1067]);

  const stored = new Uint8Array(await (await request.get(`${WORKER}/${listing.image.src}`)).body());
  expect(hasApp1(stored)).toBe(false);
  expect(Buffer.from(stored).includes('GPS')).toBe(false);
  expect(stored.length).toBeLessThan(photo.length);
  const { width, height } = cleanJpeg(stored);
  expect(Math.max(width, height)).toBeLessThanOrEqual(1600);

  // Shown on the listing page with text alternative.
  await page.goto(id);
  const img = page.getByRole('img', { name: /^Kuva: / });
  await expect(img).toBeVisible();
  expect(await img.evaluate((i) => i.naturalWidth)).toBe(1600);
});

test('HTML disguised as .jpg is rejected before anything is published', async ({ page }) => {
  const posts = [];
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().startsWith(WORKER)) posts.push(r.url()); });
  await fillForm(page);
  await page.getByLabel('Kuva tavarasta').setInputFiles({ name: 'kuva.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('<html><script>alert(1)</script></html>') });
  await page.getByRole('button', { name: 'Julkaise ilmoitus' }).click();
  await expect(page.getByText(/Virhe: Tiedosto ei ole kuva, jota voisi käyttää/)).toBeVisible();
  await expect(page.getByLabel('Kuva tavarasta')).toHaveAttribute('aria-invalid', 'true');
  expect(posts).toEqual([]);
});

test('a failed image upload is told to the user, not swallowed', async ({ page }) => {
  const photo = await photoWithExif(page);
  await fillForm(page);
  await page.route(/\/image$/, (r) => r.fulfill({ status: 400, json: { error: 'invalid', fields: { image: 'Tiedosto ei ole tunnistettu kuva.' } } }));
  await page.getByLabel('Kuva tavarasta').setInputFiles({ name: 'IMG_0002.jpg', mimeType: 'image/jpeg', buffer: photo });
  await page.getByRole('button', { name: 'Julkaise ilmoitus' }).click();
  await expect(page.locator('.image-warning')).toHaveText(/kuvan lataus epäonnistui: Tiedosto ei ole tunnistettu kuva\./);
  await expect(page.locator('.code')).toBeVisible();
});
