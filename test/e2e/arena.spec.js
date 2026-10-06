import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

// STORY-003: Arena design system. Each test maps to one acceptance criterion.

test('fonts load from our own folder and nothing is requested from Google', async ({ page, request }) => {
  const hosts = new Set();
  const fontFiles = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    hosts.add(url.hostname);
    if (url.pathname.endsWith('.woff2')) fontFiles.push(url.pathname);
  });
  await page.goto('');
  const faces = await page.evaluate(async () => {
    await Promise.all([...document.fonts].map((f) => f.load()));
    return [...document.fonts].map((f) => `${f.family} ${f.weight} ${f.status}`);
  });
  expect(faces.sort()).toEqual(['Anton 400 loaded', 'Manrope 400 700 loaded', 'Oswald 400 700 loaded']);
  expect([...hosts]).toEqual(['localhost']);
  expect(fontFiles.every((p) => p.startsWith('/Vaihtokaupat/fonts/'))).toBe(true);
  const ofl = await request.get('fonts/OFL.txt');
  expect(ofl.status()).toBe(200);
  expect(await ofl.text()).toContain('SIL Open Font License, Version 1.1');
});

test('prefers-reduced-motion stops the spotlights and every other animation', async ({ page }) => {
  await page.goto('');
  expect(await page.evaluate(() => document.getAnimations().length)).toBeGreaterThan(0);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('');
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});

test('axe-core finds no WCAG 2.1 AA violations', async ({ page }) => {
  await page.goto('');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations).toEqual([]);
});

// axe cannot measure text over gradients and blended beams (it reports them as
// "incomplete"), so this measures the rendered result: hide the text, sample the backdrop
// under each text element at 8 points of the animation cycle and compare against the
// brightest pixel found. Gradient text counts as its darkest opaque colour stop.
// Stars and lamps are 1–18 px decoration and are left out.
const CONTRAST_TARGETS = [
  '.brand', '.label', '.hero h1', '.lead', '.section h2', '.prose p',
  '.card-body h3', '.card-body p', '.rule-body p', '.pledge blockquote p', '.site-footer p',
  '.filters label', '.result-count', '.ticket-meta span', '.ticket h3', '.ticket dt', '.ticket dd', '.status',
];

test('text keeps at least 4.5:1 contrast over spotlights and gradients', async ({ page, request }, info) => {
  // At least one ticket card on the page (local Worker).
  await request.post('http://localhost:8797/api/listings', { data: { title: 'Kontrastitesti', offer: 'Pulkka', want: 'Sukset', city: 'Espoo', phone: '0401234567', pledge: true } });
  await page.goto('');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.ticket h3').first()).toBeVisible();

  const targets = await page.evaluate((selectors) => {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const rgba = (css) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      return Array.from(ctx.getImageData(0, 0, 1, 1).data);
    };
    const lum = ([r, g, b]) => [r, g, b].reduce((s, c, i) => {
      c /= 255; c = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      return s + [0.2126, 0.7152, 0.0722][i] * c;
    }, 0);
    const out = [];
    for (const el of document.querySelectorAll(selectors.join(','))) {
      const cs = getComputedStyle(el);
      let colors = [rgba(cs.color)];
      if (cs.webkitTextFillColor.endsWith(', 0)') || cs.webkitTextFillColor === 'transparent') {
        const stops = cs.backgroundImage.match(/(?:oklch|oklab|rgba?|color)\([^()]*\)/g) || [];
        colors = stops.map(rgba).filter((c) => c[3] === 255);
      }
      const darkest = colors.sort((a, b) => lum(a) - lum(b))[0].slice(0, 3);
      const r = el.getBoundingClientRect();
      out.push({ name: `${el.tagName.toLowerCase()}.${el.className || ''} "${el.textContent.trim().slice(0, 24)}"`, text: darkest, box: { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height } });
      el.dataset.ct = '';
    }
    return out;
  }, CONTRAST_TARGETS);
  expect(targets.length).toBeGreaterThan(20);

  await page.addStyleTag({ content: '[data-ct] { visibility: hidden !important; } .stage-fx .star, .stage-fx .lamp { display: none; }' });

  const lum = ([r, g, b]) => {
    const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const worst = targets.map(() => [0, 0, 0]);
  for (let k = 0; k < 8; k++) {
    await page.evaluate((k) => {
      for (const a of document.getAnimations()) {
        a.pause();
        a.currentTime = (k / 8) * a.effect.getComputedTiming().duration;
      }
    }, k);
    const png = (await page.screenshot({ fullPage: true })).toString('base64');
    const maxima = await page.evaluate(async ({ png, boxes }) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + png;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const scale = img.width / document.documentElement.clientWidth;
      return boxes.map((b) => {
        const d = ctx.getImageData(Math.floor(b.x * scale), Math.floor(b.y * scale), Math.max(1, Math.ceil(b.w * scale)), Math.max(1, Math.ceil(b.h * scale))).data;
        let best = [0, 0, 0], bestSum = -1;
        for (let i = 0; i < d.length; i += 4) {
          const sum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          if (sum > bestSum) { bestSum = sum; best = [d[i], d[i + 1], d[i + 2]]; }
        }
        return best;
      });
    }, { png, boxes: targets.map((t) => t.box) });
    maxima.forEach((m, i) => { if (lum(m) > lum(worst[i])) worst[i] = m; });
  }

  const report = targets.map((t, i) => {
    const [hi, lo] = [lum(t.text), lum(worst[i])].sort((a, b) => b - a);
    return { target: t.name, text: t.text, brightestBackground: worst[i], ratio: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100 };
  });
  mkdirSync(info.outputDir, { recursive: true });
  writeFileSync(info.outputPath('contrast.json'), JSON.stringify(report, null, 2));
  for (const r of report) expect(r.ratio, `${r.target} over ${r.brightestBackground}`).toBeGreaterThanOrEqual(4.5);
});

test('screenshot of the Arena stage', async ({ page }, info) => {
  await page.goto('');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: info.outputPath('arena.png'), fullPage: true });
});
