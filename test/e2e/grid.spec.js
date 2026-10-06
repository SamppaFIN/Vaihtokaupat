import { test, expect } from '@playwright/test';

// STORY-005: listing grid and filters, against the local Worker.

const API = 'http://localhost:8797/api/listings';
const token = () => 'T' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function seed(request, tag) {
  const base = { want: 'Avoimet ehdotukset', email: `${tag.toLowerCase()}@example.fi`, phone: '040 765 4321', pledge: true };
  const rows = [
    { title: `Talvihaalari ${tag}`, offer: 'Talvihaalari koko 104', city: `Testilä${tag}`, area: 'Hervanta' },
    { title: `Kurahousut ${tag}`, offer: 'Kurahousut koko 92', city: `Testilä${tag}`, area: 'Keskusta' },
    { title: `Pulkka ${tag}`, offer: 'Punainen pulkka', city: `Koelä${tag}`, area: '' },
  ];
  for (const r of rows) expect((await request.post(API, { data: { ...base, ...r } })).status()).toBe(201);
}

test('city, status and text search work together', async ({ page, request }) => {
  const tag = token();
  await seed(request, tag);
  await page.goto('');
  const grid = page.getByRole('region', { name: 'Ilmoitukset' });
  const cards = grid.locator('.tickets > li');

  await grid.getByLabel('Hae').fill(tag);
  await expect(cards).toHaveCount(3);
  await expect(grid.getByRole('status')).toHaveText('3 ilmoitusta');

  await grid.getByLabel('Paikkakunta').selectOption(`Testilä${tag}`);
  await expect(cards).toHaveCount(2);

  await grid.getByLabel('Hae').fill(`${tag} haalari`);
  await expect(cards).toHaveCount(1);
  await expect(cards.getByRole('heading', { level: 3 })).toHaveText(`Talvihaalari ${tag}`);
  await expect(cards.first()).toContainText('Avoin');

  await grid.getByLabel('Tila').selectOption('Vaihdetut');
  await expect(cards).toHaveCount(0);
});

test('an empty result is shown as an empty state that can be cleared', async ({ page, request }) => {
  const tag = token();
  await seed(request, tag);
  await page.goto('');
  const grid = page.getByRole('region', { name: 'Ilmoitukset' });
  await grid.getByLabel('Hae').fill('ei-tällaista-' + tag);
  await expect(grid.getByText('Ei ilmoituksia näillä hakuehdoilla.')).toBeVisible();
  await expect(grid.getByRole('status')).toHaveText('0 ilmoitusta');
  await grid.getByRole('button', { name: 'Tyhjennä suodattimet' }).click();
  await expect(grid.getByLabel('Hae')).toHaveValue('');
  await expect(grid.getByText('Ei ilmoituksia näillä hakuehdoilla.')).toBeHidden();
});

test('no listings at all and a failed load have their own states', async ({ page }) => {
  await page.route(API, (r) => r.fulfill({ json: { listings: [] } }));
  await page.goto('');
  const grid = page.getByRole('region', { name: 'Ilmoitukset' });
  await expect(grid.getByText('Vielä ei ilmoituksia. Jätä ensimmäinen!')).toBeVisible();
  await expect(grid.getByRole('button', { name: 'Tyhjennä suodattimet' })).toBeHidden();

  await page.unroute(API);
  await page.route(API, (r) => r.abort());
  await page.reload();
  await expect(grid.getByRole('alert')).toContainText('ilmoituksia ei voitu ladata');
  await page.unroute(API);
  await grid.getByRole('button', { name: 'Yritä uudelleen' }).click();
  await expect(grid.getByRole('alert')).toBeHidden();
});

test('contacts are not in the list response nor anywhere in the page HTML', async ({ page, request }) => {
  const tag = token();
  await seed(request, tag);
  const list = await request.get(API);
  const text = await list.text();
  expect(text).not.toContain(`${tag.toLowerCase()}@example.fi`);
  expect(text).not.toContain('407654321');
  await page.goto('');
  await page.getByRole('region', { name: 'Ilmoitukset' }).getByLabel('Hae').fill(tag);
  await expect(page.locator('.tickets > li')).toHaveCount(3);
  const html = await page.content();
  expect(html).not.toContain(`${tag.toLowerCase()}@example.fi`);
  expect(html).not.toContain('407654321');
});

test('a card opens its listing page', async ({ page, request }) => {
  const tag = token();
  await seed(request, tag);
  await page.goto('');
  await page.getByRole('region', { name: 'Ilmoitukset' }).getByLabel('Hae').fill(`Pulkka ${tag}`);
  const link = page.getByRole('link', { name: `Pulkka ${tag}` });
  const id = (await link.getAttribute('href')).match(/\d{5}$/)[0];
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/Vaihtokaupat/${id}$`));
});

test('screenshot of the grid', async ({ page, request }, info) => {
  await seed(request, token());
  await page.goto('');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.tickets > li:not(.skeleton)').first()).toBeVisible();
  await page.locator('#ilmoitukset').screenshot({ path: info.outputPath('grid.png') });
});
