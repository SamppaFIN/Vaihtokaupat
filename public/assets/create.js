// Create-listing form (STORY-007). The markup is the static <template id="create-form">
// in index.html; user text is only ever set with textContent / value (CLAUDE.md §12 rule 2).
// The server validates everything again; this check is only a convenience.
'use strict';

import { postJson, postForm } from './api.js';
import { resizeToJpeg } from './resize.js';
import { pathFor } from './router.js';

const FIELDS = ['title', 'name', 'offer', 'want', 'city', 'area', 'image', 'email', 'phone', 'whatsapp', 'pledge', 'contact'];

function setError(form, field, message) {
  const slot = form.querySelector(`[data-error="${field}"]`);
  const input = form.elements[field];
  if (slot) {
    slot.textContent = message ? 'Virhe: ' + message : '';
    slot.hidden = !message;
  }
  if (input && input.setAttribute) {
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
}

function clientErrors(form) {
  const v = (n) => form.elements[n].value.trim();
  const errors = {};
  if (!v('offer')) errors.offer = 'Kerro mitä tarjoat.';
  if (!v('want')) errors.want = 'Kerro mitä toivot tilalle.';
  if (!v('city')) errors.city = 'Anna paikkakunta.';
  if (!v('email') && !v('phone') && !v('whatsapp')) errors.contact = 'Anna vähintään yksi yhteystieto.';
  if (!form.elements.pledge.checked) errors.pledge = 'Liittymislupaus on pakollinen.';
  return errors;
}

function showErrors(form, errors) {
  for (const f of FIELDS) setError(form, f, errors[f]);
  const summary = form.querySelector('.form-summary');
  const count = Object.keys(errors).length;
  summary.textContent = count ? `Tarkista lomake: ${count} ${count === 1 ? 'kohta vaatii' : 'kohtaa vaativat'} korjausta.` : '';
  summary.hidden = !count;
  if (count) {
    const first = FIELDS.find((f) => errors[f]);
    const target = first === 'contact' ? form.elements.email : form.elements[first];
    (target || summary).focus();
  }
}

function showSuccess(app, id, code, imageError) {
  const view = document.getElementById('create-success').content.cloneNode(true);
  view.querySelector('.code').textContent = code;
  const link = view.querySelector('.listing-link');
  link.href = pathFor(id);
  link.textContent = 'Avaa ilmoitus #' + id;
  const copy = view.querySelector('.copy');
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code);
      copy.textContent = 'Kopioitu';
    } catch {
      copy.textContent = 'Kopioi käsin';
    }
  });
  const warning = view.querySelector('.image-warning');
  warning.textContent = imageError ? 'Ilmoitus julkaistiin, mutta kuvan lataus epäonnistui: ' + imageError + ' Voit lisätä kuvan myöhemmin muokkaamalla ilmoitusta.' : '';
  warning.hidden = !imageError;
  app.replaceChildren(view);
  app.querySelector('h1').focus();
  window.scrollTo(0, 0);
}

export function mountCreate(app) {
  app.replaceChildren(document.getElementById('create-form').content.cloneNode(true));
  const form = app.querySelector('form');
  const submit = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errors = clientErrors(form);
    showErrors(form, errors);
    if (Object.keys(errors).length) return;

    const data = {};
    for (const f of ['title', 'name', 'offer', 'want', 'city', 'area', 'email', 'phone', 'whatsapp', 'website']) data[f] = form.elements[f].value;
    data.pledge = form.elements.pledge.checked;

    // Resize before publishing, so an unreadable file stops here and not after the listing exists.
    let image = null;
    const file = form.elements.image.files[0];
    if (file) {
      try {
        image = await resizeToJpeg(file);
      } catch {
        return showErrors(form, { image: 'Tiedosto ei ole kuva, jota voisi käyttää. Valitse JPEG-, PNG- tai WebP-kuva.' });
      }
    }

    submit.disabled = true;
    submit.textContent = 'Julkaistaan…';
    let res;
    try {
      res = await postJson('/listings', data);
    } catch {
      res = { status: 0, body: null };
    }
    submit.disabled = false;
    submit.textContent = 'Julkaise ilmoitus';

    if (res.status === 201) {
      const { id, code } = res.body;
      let imageError = null;
      if (image) {
        submit.disabled = true;
        submit.textContent = 'Ladataan kuvaa…';
        const fd = new FormData();
        fd.set('code', code);
        fd.set('image', image, 'kuva.jpg');
        let up;
        try { up = await postForm(`/listings/${id}/image`, fd); } catch { up = { status: 0, body: null }; }
        // Never swallowed silently (BandRock lesson): the user is told the image is missing.
        if (up.status !== 201) imageError = (up.body && up.body.fields && up.body.fields.image) || 'tarkista verkkoyhteys.';
      }
      return showSuccess(app, id, code, imageError);
    }
    if (res.status === 400 && res.body && res.body.fields) return showErrors(form, res.body.fields);
    const summary = form.querySelector('.form-summary');
    summary.textContent = res.status === 429
      ? 'Virhe: liian monta ilmoitusta lyhyessä ajassa. Odota hetki ja yritä uudelleen.'
      : 'Virhe: ilmoitusta ei voitu tallentaa. Tarkista verkkoyhteys ja yritä uudelleen. Lomakkeen tiedot ovat tallessa.';
    summary.hidden = false;
    summary.focus();
  });
}
