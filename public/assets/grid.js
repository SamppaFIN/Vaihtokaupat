// Listing grid with filters (STORY-005). Cards are built with createElement and
// textContent only: every value comes from a stranger (CLAUDE.md §12 rule 2).
// The list API never contains contacts, so they cannot end up in this HTML either.
'use strict';

import { API_URL } from './api.js';
import { pathFor } from './router.js';
import { filterListings, citiesOf } from './filter.js';

const STATUS_TEXT = { open: 'Avoin', traded: 'Vaihdettu' };

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

function card(l) {
  const li = el('li', 'ticket');
  const inner = el('article', 'ticket-inner');
  const head = el('div', 'ticket-head');
  const meta = el('p', 'ticket-meta');
  meta.append(el('span', null, [l.name, l.city].filter(Boolean).join(' · ')), el('span', null, '#' + l.id));
  const h3 = el('h3');
  const link = el('a', null, l.title || l.offer);
  link.href = pathFor(l.id);
  h3.append(link);
  head.append(meta, h3);

  const dl = el('dl');
  for (const [term, value] of [['Tarjoan', l.offer], ['Toivon tilalle', l.want], ['Noutopaikka', [l.city, l.area].filter(Boolean).join(', ')]]) {
    const row = el('div');
    row.append(el('dt', null, term), el('dd', null, value));
    dl.append(row);
  }
  const foot = el('div', 'ticket-foot');
  foot.append(el('span', 'status ' + l.status, STATUS_TEXT[l.status] || l.status));

  const perf = el('div', 'perf'); // ticket perforation, decoration only
  perf.setAttribute('aria-hidden', 'true');
  inner.append(head, dl, perf, foot);
  li.append(inner);
  return li;
}

export async function mountGrid(section) {
  const form = section.querySelector('.filters');
  const list = section.querySelector('.tickets');
  const count = section.querySelector('.result-count');
  const empty = section.querySelector('.empty');
  const error = section.querySelector('.load-error');

  list.setAttribute('aria-busy', 'true');
  list.replaceChildren(...[0, 1, 2].map(() => { const s = el('li', 'ticket skeleton'); s.setAttribute('aria-hidden', 'true'); return s; }));
  count.textContent = 'Ladataan ilmoituksia…';
  error.hidden = true;
  empty.hidden = true;

  let all;
  try {
    const res = await fetch(API_URL + '/listings', { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    all = (await res.json()).listings;
  } catch {
    list.replaceChildren();
    list.removeAttribute('aria-busy');
    count.textContent = '';
    error.hidden = false;
    error.querySelector('button').onclick = () => mountGrid(section);
    return;
  }

  const select = form.elements.city;
  select.replaceChildren(el('option', null, 'Kaikki paikkakunnat'));
  select.firstChild.value = '';
  for (const city of citiesOf(all)) {
    const o = el('option', null, city);
    o.value = city;
    select.append(o);
  }

  const render = () => {
    const shown = filterListings(all, { q: form.elements.q.value, city: select.value, status: form.elements.status.value });
    list.replaceChildren(...shown.map(card));
    list.removeAttribute('aria-busy');
    count.textContent = shown.length === 1 ? '1 ilmoitus' : `${shown.length} ilmoitusta`;
    empty.hidden = shown.length > 0;
    empty.querySelector('.empty-text').textContent = all.length
      ? 'Ei ilmoituksia näillä hakuehdoilla.'
      : 'Vielä ei ilmoituksia. Jätä ensimmäinen!';
    empty.querySelector('.clear').hidden = !all.length;
  };

  form.oninput = render;
  form.onsubmit = (e) => { e.preventDefault(); render(); };
  empty.querySelector('.clear').onclick = () => { form.reset(); render(); form.elements.q.focus(); };
  render();
}
