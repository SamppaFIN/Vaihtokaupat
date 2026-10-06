import { test, expect } from '@playwright/test';

// STORY-004: front page. axe-core and contrast for the same page live in arena.spec.js.

test('front page has the hero, "Vaihda, älä myy", three listing parts, six rules and the pledge', async ({ page }) => {
  await page.goto('');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vaihtokaupat');
  await expect(page.locator('.lead')).toHaveText('Tavara vaihtaa omistajaa ilman rahaa. Ei myyntiä, ei ostamista – vain aitoja vaihtoja.');

  const h2 = page.getByRole('heading', { level: 2 });
  await expect(h2).toHaveText(['Vaihda,älä myy', 'Miten ilmoitus tehdään', 'Ryhmän säännöt']);

  const parts = page.getByRole('region', { name: 'Miten ilmoitus tehdään' }).getByRole('listitem');
  await expect(parts).toHaveCount(3);
  await expect(parts.getByRole('heading', { level: 3 })).toHaveText(['Mitä tarjotaan', 'Mitä toivotaan tilalle', 'Paikkakunta / noutopaikka']);

  const rules = page.getByRole('region', { name: 'Ryhmän säännöt' }).getByRole('listitem');
  await expect(rules).toHaveCount(6);
  await expect(rules.first()).toContainText('Ei ostoa eikä myyntiä – vain vaihtoja.');

  await expect(page.getByRole('region', { name: 'Liittymislupaus' }).locator('blockquote'))
    .toHaveText('”Lupaan, että en myy enkä osta tässä ryhmässä – vain vaihdan.”');
});

// background-clip: text only paints inside the element box, so with a tight line-height the
// dots of Ä/Ö above the box vanished ("TEHDAAN"). Compare the ink of each gradient heading
// with the same text painted in a solid colour.
test('gradient text paints every glyph, including the dots of ä and ö', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('');
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: '.stage-fx { display: none; }' });
  const els = await page.locator('.gold-text, .chrome-text').all();
  expect(els.length).toBeGreaterThan(3);

  const ink = async (el) => {
    const b = await el.boundingBox();
    const pad = b.height * 0.3;
    const png = await page.screenshot({ fullPage: true, clip: { x: b.x, y: b.y - pad + (await page.evaluate(() => scrollY)), width: b.width, height: b.height + 2 * pad } });
    // Count bright pixels only outside the element box (the top and bottom pad bands).
    return page.evaluate(async ({ data, padRatio }) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + data;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const band = Math.floor(c.height * padRatio);
      let n = 0;
      for (let y = 0; y < c.height; y++) {
        if (y >= band && y < c.height - band) continue;
        for (let x = 0; x < c.width; x++) {
          const i = (y * c.width + x) * 4;
          if (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2] > 60) n++;
        }
      }
      return n;
    }, { data: png.toString('base64'), padRatio: pad / (b.height + 2 * pad) });
  };

  for (const el of els) {
    const name = (await el.textContent()).trim();
    const gradient = await ink(el);
    await el.evaluate((e) => { e.style.webkitTextFillColor = 'currentColor'; e.style.backgroundImage = 'none'; });
    const solid = await ink(el);
    await el.evaluate((e) => { e.style.webkitTextFillColor = ''; e.style.backgroundImage = ''; });
    expect(gradient, `"${name}": ink outside the box, gradient vs solid (${solid})`).toBeGreaterThanOrEqual(solid * 0.9);
  }
});

test('exactly one h1', async ({ page }) => {
  await page.goto('');
  await expect(page.locator('h1')).toHaveCount(1);
});

test('no horizontal scrolling', async ({ page }) => {
  await page.goto('');
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
});
