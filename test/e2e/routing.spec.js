import { test, expect } from '@playwright/test';

function collectErrors(page) {
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

test('front page opens on the sub-path without console errors', async ({ page }, info) => {
  const errors = collectErrors(page);
  await page.goto('');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveText('Vaihtokaupat');
  // The deep-link test below opens 404.html on purpose; here nothing may fail.
  expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath('front.png'), fullPage: true });
});

test('deep link restores the clean URL without ?p= and shows the route', async ({ page }, info) => {
  const errors = collectErrors(page);
  await page.goto('0142?x=1#yhteys');
  await expect(page.locator('#route')).toHaveText('Ilmoitus 0142');
  const url = new URL(page.url());
  expect(url.pathname).toBe('/Vaihtokaupat/0142');
  expect(url.search).toBe('?x=1');
  expect(url.hash).toBe('#yhteys');
  await expect(page.locator('h1')).toHaveCount(1);
  // The only expected error is the browser logging the 404 status of the first response.
  expect(errors.filter((e) => !/404/.test(e))).toEqual([]);
  await page.screenshot({ path: info.outputPath('deep-link.png'), fullPage: true });
});

test('route id from the URL is shown as text, never as HTML', async ({ page }) => {
  await page.goto('%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E');
  await expect(page.locator('#route')).toHaveText('Ilmoitus <img src=x onerror=alert(1)>');
  await expect(page.locator('#route img')).toHaveCount(0);
});
