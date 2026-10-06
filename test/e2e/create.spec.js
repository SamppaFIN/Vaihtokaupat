import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// STORY-007: create a listing. Runs against the local Worker (playwright.config.js).

async function fill(page, overrides = {}) {
  const values = {
    'Otsikko': 'Vauvanvaatteet 74–80',
    'Tarjoan pakollinen': 'Kassillinen bodyja, koot 74–80.',
    'Toivon tilalle pakollinen': 'Vaatteita koossa 92–98.',
    'Paikkakunta pakollinen': 'Espoo',
    'Noutoalue': 'Leppävaara',
    'Puhelin': '040 123 4567',
    ...overrides,
  };
  for (const [label, value] of Object.entries(values)) await page.getByLabel(label, { exact: true }).fill(value);
}

test('front page "Liity vaihtamaan" opens the form', async ({ page }) => {
  await page.goto('');
  await page.locator('.hero-body').getByRole('link', { name: 'Liity vaihtamaan' }).click();
  await expect(page).toHaveURL(/\/Vaihtokaupat\/uusi$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jätä ilmoitus');
});

test('create shows the code once, and it never appears in the URL or later responses', async ({ page, request }) => {
  const responses = [];
  page.on('response', async (r) => { if (r.url().includes('/api/')) responses.push(r); });
  await page.goto('uusi');
  await fill(page);
  await page.getByLabel(/Lupaan, että en myy/).check();
  await page.getByRole('button', { name: 'Julkaise ilmoitus' }).click();

  const code = (await page.locator('.code').textContent()).trim();
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tallenna muokkauskoodi');
  await expect(page.getByText('Koodia ei voi palauttaa.')).toBeVisible();
  expect(page.url()).not.toContain(code);

  const link = page.getByRole('link', { name: /Avaa ilmoitus #\d{5}/ });
  const id = (await link.textContent()).match(/\d{5}/)[0];
  expect(id).not.toContain(code);
  expect(await link.getAttribute('href')).not.toContain(code);

  const later = await request.get(`http://localhost:8797/api/listings/${id}`);
  expect(later.status()).toBe(200);
  expect(await later.text()).not.toContain(code);

  // Nothing kept in the browser either.
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + document.cookie);
  expect(stored).not.toContain(code);
  expect(responses.length).toBe(1);
});

test('missing required fields are shown as errors in text, next to each field', async ({ page }) => {
  await page.goto('uusi');
  await page.getByRole('button', { name: 'Julkaise ilmoitus' }).click();
  await expect(page.locator('.form-summary')).toContainText('Tarkista lomake: 5 kohtaa');
  for (const msg of ['Kerro mitä tarjoat.', 'Kerro mitä toivot tilalle.', 'Anna paikkakunta.', 'Anna vähintään yksi yhteystieto.', 'Liittymislupaus on pakollinen.']) {
    await expect(page.getByText('Virhe: ' + msg)).toBeVisible();
  }
  await expect(page.getByLabel('Tarjoan pakollinen')).toHaveAttribute('aria-invalid', 'true');
});

test('server-side error is shown: WhatsApp link without a number', async ({ page }) => {
  await page.goto('uusi');
  await fill(page, { 'Puhelin': '', 'WhatsApp-numero': 'https://wa.me/' });
  await page.getByLabel(/Lupaan, että en myy/).check();
  await page.getByRole('button', { name: 'Julkaise ilmoitus' }).click();
  await expect(page.getByText('Virhe: WhatsApp-linkistä puuttuu puhelinnumero.')).toBeVisible();
  await expect(page.getByLabel('WhatsApp-numero')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('.code')).toHaveCount(0);
});

test('form tells to give the district, not the street address', async ({ page }) => {
  await page.goto('uusi');
  await expect(page.getByText('Kirjoita kaupunginosa, älä katuosoitetta.')).toBeVisible();
  const describedBy = await page.getByLabel('Noutoalue', { exact: true }).getAttribute('aria-describedby');
  expect(describedBy).toContain('h-area');
});

test('form page: one h1, no horizontal scrolling, axe clean', async ({ page }) => {
  await page.goto('uusi');
  await expect(page.locator('h1')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations).toEqual([]);
});

test('screenshots of the form and the code view', async ({ page }, info) => {
  await page.goto('uusi');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: info.outputPath('form.png'), fullPage: true });
  await fill(page);
  await page.getByLabel(/Lupaan, että en myy/).check();
  await page.getByRole('button', { name: 'Julkaise ilmoitus' }).click();
  await expect(page.locator('.code')).toBeVisible();
  await page.screenshot({ path: info.outputPath('code.png'), fullPage: true });
});
