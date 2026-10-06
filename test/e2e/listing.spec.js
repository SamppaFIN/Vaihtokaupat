import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// STORY-006: listing page and contacts behind a button, against the local Worker.

const API = 'http://localhost:8797/api/listings';
const tag = () => 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function create(request, extra = {}) {
  const t = tag();
  const data = {
    title: `Talvihaalari ${t}`, name: 'Jenni', offer: 'Talvihaalari koko 104.\nKäytetty yhden talven.', want: 'Koko 116 tai avoimet ehdotukset',
    city: 'Tampere', area: 'Hervanta', email: `${t.toLowerCase()}@example.fi`, phone: '040 111 2233', whatsapp: 'https://wa.me/358405556677',
    pledge: true, ...extra,
  };
  const res = await request.post(API, { data });
  expect(res.status()).toBe(201);
  return { ...data, id: (await res.json()).id };
}

test('deep link to a listing shows offer, want, pickup place and status', async ({ page, request }) => {
  const l = await create(request);
  await page.goto(l.id);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(l.title);
  await expect(page.getByText(`Ilmoitus #${l.id}`)).toBeVisible();
  await expect(page.locator('.listing-offer')).toHaveText(l.offer);
  await expect(page.locator('.listing-want')).toHaveText(l.want);
  await expect(page.locator('.listing-place')).toHaveText('Tampere, Hervanta');
  await expect(page.locator('.status')).toHaveText('Avoin');
  await expect(page).toHaveTitle(`${l.title} – Vaihtokaupat`);
});

test('contacts are fetched only on the button press and are not in the HTML before it', async ({ page, request }) => {
  const l = await create(request);
  const contactCalls = [];
  page.on('request', (r) => { if (r.url().endsWith('/contact')) contactCalls.push(r.method()); });
  await page.goto(l.id);
  await expect(page.locator('.listing-offer')).toBeVisible();

  const before = await page.content();
  for (const secret of [l.email, '401112233', '405556677']) expect(before).not.toContain(secret);
  expect(contactCalls).toEqual([]);

  await page.getByRole('button', { name: 'Näytä yhteystiedot' }).click();
  await expect(page.getByRole('link', { name: `Sähköposti: ${l.email}` })).toHaveAttribute('href', `mailto:${l.email}`);
  await expect(page.getByRole('link', { name: 'Puhelin: 0401112233' })).toHaveAttribute('href', 'tel:+358401112233');
  await expect(page.getByRole('link', { name: 'WhatsApp 0405556677' })).toHaveAttribute('href', 'https://wa.me/358405556677');
  expect(contactCalls).toEqual(['POST']);
  await expect(page.getByRole('button', { name: 'Näytä yhteystiedot' })).toBeHidden();
});

test('a listing without contacts (traded) says so instead of showing links', async ({ page, request }) => {
  const l = await create(request);
  await page.route(`${API}/${l.id}/contact`, (r) => r.fulfill({ json: { links: [] } }));
  await page.goto(l.id);
  await page.getByRole('button', { name: 'Näytä yhteystiedot' }).click();
  await expect(page.getByText('Yhteystietoja ei ole. Ne poistetaan, kun ilmoitus merkitään vaihdetuksi.')).toBeVisible();
  await expect(page.locator('.contact-links a')).toHaveCount(0);
});

test('a link the browser does not trust is not shown even if the server sent it', async ({ page, request }) => {
  const l = await create(request);
  await page.route(`${API}/${l.id}/contact`, (r) => r.fulfill({ json: { links: [{ type: 'email', label: 'x', href: 'javascript:alert(1)' }] } }));
  await page.goto(l.id);
  await page.getByRole('button', { name: 'Näytä yhteystiedot' }).click();
  await expect(page.locator('a[href^="javascript"]')).toHaveCount(0);
});

test('unknown listing and failed load have their own states', async ({ page }) => {
  await page.route(`${API}/12345`, (r) => r.fulfill({ status: 404, json: { error: 'not_found' } }));
  await page.goto('12345');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ilmoitusta ei löytynyt');
  await expect(page.getByText('Tunnisteella 12345 ei löydy ilmoitusta.')).toBeVisible();

  await page.unroute(`${API}/12345`);
  await page.route(`${API}/12345`, (r) => r.abort());
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ilmoitusta ei voitu ladata');
  await expect(page.getByRole('button', { name: 'Yritä uudelleen' })).toBeVisible();
});

test('listing page: one h1, no horizontal scrolling, axe clean before and after reveal', async ({ page, request }, info) => {
  const l = await create(request, { title: 'Pitkäsanainenotsikkojokaeimahdurivillekokonaan ' + tag() });
  await page.goto(l.id);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.listing-offer')).toBeVisible();
  await expect(page.locator('h1')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
  expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('listing.png'), fullPage: true });
  await page.getByRole('button', { name: 'Näytä yhteystiedot' }).click();
  await expect(page.locator('.contact-links a')).toHaveCount(3);
  expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('listing-revealed.png'), fullPage: true });
});
