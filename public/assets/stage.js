// Arena spotlight backdrop: stars, swaying beams, lamps and smoke. Ported from the React
// buildFx() in "Design system/Vaihtokaupat Arena.dc.html" to plain DOM. Purely decorative:
// aria-hidden, no pointer events, colours come from tokens (assets/arena.css).
'use strict';

const BEAMS = [
  { x: 10, a: 30, w: 20, c: '--c-accent-hi', o: 34, d: 13 },
  { x: 27, a: 14, w: 16, c: '--c-text', o: 26, d: 16 },
  { x: 42, a: -18, w: 12, c: '--c-live', o: 20, d: 18 },
  { x: 50, a: 4, w: 24, c: '--c-accent-hi', o: 30, d: 11 },
  { x: 73, a: -12, w: 16, c: '--c-spark', o: 26, d: 15 },
  { x: 90, a: -30, w: 20, c: '--c-accent-hi', o: 34, d: 12 },
];

const SMOKE = [
  { l: '-10%', b: '-8%', w: '70%', h: '45%', d: 26 },
  { l: '35%', b: '-12%', w: '75%', h: '50%', d: 32 },
  { l: '10%', b: '10%', w: '55%', h: '30%', d: 38 },
];

function part(className, style) {
  const el = document.createElement('span');
  el.className = className;
  for (const [k, v] of Object.entries(style)) el.style.setProperty(k, v);
  return el;
}

/** Adds the backdrop as the first child of `host` (which gets the .stage class). */
export function mountStage(host) {
  let seed = 7; // same seeded sequence as the design, so the sky looks the same
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  const fx = document.createElement('div');
  fx.className = 'stage-fx';
  fx.setAttribute('aria-hidden', 'true');

  for (const [count, near] of [[90, false], [26, true]]) {
    for (let i = 0; i < count; i++) {
      const s = near ? 2 + rnd() * 2 : 1 + rnd() * 1.2;
      const tint = rnd();
      const c = tint > 0.86 ? '--c-spark' : tint > 0.74 ? '--c-accent-hi' : '--c-text';
      fx.append(part('star', {
        left: rnd() * 100 + '%', top: rnd() * 72 + '%', width: s + 'px', height: s + 'px',
        '--s': s + 'px', '--c': `var(${c})`,
        '--d': 2.4 + rnd() * 4 + 's', '--delay': -rnd() * 6 + 's',
      }));
    }
  }
  BEAMS.forEach((b, i) => {
    fx.append(part('beam', {
      left: b.x + '%', width: b.w + 'cqi', 'margin-left': -b.w / 2 + 'cqi',
      '--a': b.a + 'deg', '--c': `var(${b.c})`, '--o': b.o + '%',
      '--d': b.d + 's', '--delay': -i * 2.3 + 's',
    }));
    fx.append(part('lamp', { left: b.x + '%', '--c': `var(${b.c})`, '--d': 3 + i * 0.4 + 's' }));
  });
  SMOKE.forEach((s, i) => {
    fx.append(part('smoke', { left: s.l, bottom: s.b, width: s.w, height: s.h, '--d': s.d + 's', '--delay': -i * 7 + 's' }));
  });
  fx.append(part('floor', {}), part('fade', {}));

  host.classList.add('stage');
  host.prepend(fx);
  return fx;
}
