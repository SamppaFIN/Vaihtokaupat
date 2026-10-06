import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterListings, citiesOf } from '../public/assets/filter.js';

const L = [
  { id: '1', title: 'Talvihaalari 104', offer: 'Haalari', want: 'Koko 116', city: 'Tampere', area: 'Hervanta', status: 'open' },
  { id: '2', title: 'Vauvanvaatteet', offer: 'Bodyja 74–80', want: 'Kurahousut', city: 'Espoo', area: 'Leppävaara', status: 'open' },
  { id: '3', title: 'Kurahousut 92', offer: 'Kurahousut', want: 'Bodyja', city: 'espoo', area: 'Tapiola', status: 'traded' },
  { id: '4', title: 'Pulkka', offer: 'Pulkka', want: 'Avoimet ehdotukset', city: 'Vantaa', area: '', status: 'open' },
];
const ids = (r) => r.map((l) => l.id);

test('default shows only open listings', () => {
  assert.deepEqual(ids(filterListings(L)), ['1', '2', '4']);
});

test('status filter: traded only, or all with an empty value', () => {
  assert.deepEqual(ids(filterListings(L, { status: 'traded' })), ['3']);
  assert.deepEqual(ids(filterListings(L, { status: '' })), ['1', '2', '3', '4']);
});

test('city filter ignores case', () => {
  assert.deepEqual(ids(filterListings(L, { city: 'Espoo', status: '' })), ['2', '3']);
});

test('search matches title, offer, want and area; every word must match', () => {
  assert.deepEqual(ids(filterListings(L, { q: 'kurahousut', status: '' })), ['2', '3']);
  assert.deepEqual(ids(filterListings(L, { q: 'KURAHOUSUT tapiola', status: '' })), ['3']);
  assert.deepEqual(ids(filterListings(L, { q: 'leppävaara' })), ['2']);
});

test('all three filters work together', () => {
  assert.deepEqual(ids(filterListings(L, { q: 'kurahousut', city: 'espoo', status: 'open' })), ['2']);
  assert.deepEqual(ids(filterListings(L, { q: 'kurahousut', city: 'Tampere', status: 'open' })), []);
});

test('citiesOf: unique, first spelling, Finnish order', () => {
  assert.deepEqual(citiesOf([...L, { city: 'Åland' }, { city: 'Ähtäri' }, { city: '' }]), ['Espoo', 'Tampere', 'Vantaa', 'Åland', 'Ähtäri']);
});
