// Listing page (STORY-006). Contacts are not in the page until the button is pressed:
// they come from POST /listings/:id/contact, whose links the server built (§12 rule 4).
// All listing text is set with textContent (§12 rule 2).
'use strict';

import { API_URL, IMAGE_BASE } from './api.js';

const STATUS_TEXT = { open: 'Avoin', traded: 'Vaihdettu' };
const LINK_PREFIX = { email: 'Sähköposti: ', phone: 'Puhelin: ', whatsapp: '' };
const SAFE_HREF = /^(mailto:|tel:\+|https:\/\/wa\.me\/)/; // defence in depth on top of the server

const fill = (root, selector, text) => { root.querySelector(selector).textContent = text; };

function showMissing(app, id) {
  const view = document.getElementById('listing-missing').content.cloneNode(true);
  fill(view, '.missing-text', `Tunnisteella ${id} ei löydy ilmoitusta. Se on voitu poistaa tai piilottaa.`);
  app.replaceChildren(view);
  document.title = 'Ilmoitusta ei löytynyt – Vaihtokaupat';
}

function showLoadError(app, id) {
  const view = document.getElementById('listing-missing').content.cloneNode(true);
  fill(view, 'h1', 'Ilmoitusta ei voitu ladata');
  fill(view, '.missing-text', 'Virhe: tarkista verkkoyhteys ja yritä uudelleen.');
  const retry = document.createElement('button');
  retry.className = 'button ghost';
  retry.type = 'button';
  retry.textContent = 'Yritä uudelleen';
  retry.onclick = () => mountListing(app, id);
  view.querySelector('.missing-text').after(retry);
  app.replaceChildren(view);
}

async function reveal(box, id) {
  const button = box.querySelector('.reveal');
  const msg = box.querySelector('.contact-msg');
  const list = box.querySelector('.contact-links');
  button.disabled = true;
  msg.textContent = 'Haetaan yhteystietoja…';
  let res;
  try {
    res = await fetch(`${API_URL}/listings/${encodeURIComponent(id)}/contact`, { method: 'POST' });
  } catch {
    res = null;
  }
  button.disabled = false;
  if (!res || !res.ok) {
    msg.textContent = res && res.status === 429
      ? 'Virhe: liian monta pyyntöä. Yritä hetken päästä uudelleen.'
      : 'Virhe: yhteystietoja ei voitu hakea. Tarkista verkkoyhteys ja yritä uudelleen.';
    return;
  }
  const links = ((await res.json()).links || []).filter((l) => SAFE_HREF.test(l.href));
  if (!links.length) {
    msg.textContent = 'Yhteystietoja ei ole. Ne poistetaan, kun ilmoitus merkitään vaihdetuksi.';
    button.hidden = true;
    return;
  }
  list.replaceChildren(...links.map((l) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = l.href;
    a.className = 'contact-' + l.type;
    a.textContent = (LINK_PREFIX[l.type] || '') + l.label;
    li.append(a);
    return li;
  }));
  list.hidden = false;
  button.hidden = true;
  msg.textContent = 'Sovi vaihdosta suoraan ilmoittajan kanssa.';
  list.querySelector('a').focus();
}

export async function mountListing(app, id) {
  if (!/^\d{5}$/.test(id)) return showMissing(app, id);
  const loading = document.createElement('p');
  loading.className = 'section';
  loading.setAttribute('role', 'status');
  loading.textContent = 'Ladataan ilmoitusta…';
  app.replaceChildren(loading);

  let res;
  try {
    res = await fetch(`${API_URL}/listings/${id}`, { cache: 'no-store' });
  } catch {
    return showLoadError(app, id);
  }
  if (res.status === 404) return showMissing(app, id);
  if (!res.ok) return showLoadError(app, id);
  const l = await res.json();

  const view = document.getElementById('listing-page').content.cloneNode(true);
  const title = l.title || l.offer;
  fill(view, '.listing-number', 'Ilmoitus #' + l.id);
  fill(view, '.listing-title', title);
  fill(view, '.listing-who', [l.name, l.city].filter(Boolean).join(' · '));
  fill(view, '.listing-offer', l.offer);
  fill(view, '.listing-want', l.want);
  fill(view, '.listing-place', [l.city, l.area].filter(Boolean).join(', '));
  if (l.image && /^img\/\d{5}\/\d+\.jpg$/.test(l.image.src)) {
    const figure = view.querySelector('.listing-image');
    const img = figure.querySelector('img');
    img.src = `${IMAGE_BASE}/${l.image.src}`;
    img.width = l.image.width;
    img.height = l.image.height;
    img.alt = 'Kuva: ' + title;
    figure.hidden = false;
  }
  const status = view.querySelector('.status');
  status.textContent = STATUS_TEXT[l.status] || l.status;
  status.classList.add(l.status);
  const box = view.querySelector('.contact-box');
  box.querySelector('.reveal').addEventListener('click', () => reveal(box, l.id));

  app.replaceChildren(view);
  document.title = `${title} – Vaihtokaupat`;
}
