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
// brightest pixel found. Stars and lamps are 1–18 px decoration and are left out.
test('text keeps at least 4.5:1 contrast over spotlights and gradients', async ({ page }, info) => {
  await page.goto('');
  await page.evaluate(() => document.fonts.ready);
  const targets = ['.hero .label', '.hero h1', '#route'];

  const colors = await page.evaluate((sels) => {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    return sels.map((s) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = getComputedStyle(document.querySelector(s)).color;
      ctx.fillRect(0, 0, 1, 1);
      return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3));
    });
  }, targets);
  const boxes = [];
  for (const s of targets) boxes.push(await page.locator(s).boundingBox());

  await page.addStyleTag({ content: '.hero :not(.stage-fx, .stage-fx *) { color: transparent !important; } .stage-fx .star, .stage-fx .lamp { display: none; }' });

  const worst = targets.map(() => [0, 0, 0]);
  const lum = ([r, g, b]) => {
    const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  for (let k = 0; k < 8; k++) {
    await page.evaluate((k) => {
      for (const a of document.getAnimations()) {
        a.pause();
        a.currentTime = (k / 8) * a.effect.getComputedTiming().duration;
      }
    }, k);
    const png = (await page.screenshot()).toString('base64');
    const maxima = await page.evaluate(async ({ png, boxes }) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + png;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const scale = img.width / innerWidth;
      return boxes.map((b) => {
        const d = ctx.getImageData(Math.floor(b.x * scale), Math.floor(b.y * scale), Math.ceil(b.width * scale), Math.ceil(b.height * scale)).data;
        let best = [0, 0, 0], bestSum = -1;
        for (let i = 0; i < d.length; i += 4) {
          const sum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          if (sum > bestSum) { bestSum = sum; best = [d[i], d[i + 1], d[i + 2]]; }
        }
        return best;
      });
    }, { png, boxes });
    maxima.forEach((m, i) => { if (lum(m) > lum(worst[i])) worst[i] = m; });
  }

  const report = targets.map((s, i) => {
    const [hi, lo] = [lum(colors[i]), lum(worst[i])].sort((a, b) => b - a);
    return { target: s, text: colors[i], brightestBackground: worst[i], ratio: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100 };
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
