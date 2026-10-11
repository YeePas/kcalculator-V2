import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { setCfg, setNevoData, setNevoReady } from '../../src/state.js';
import { schijfDagScore } from '../../src/pages/schijf.js';

function createStorageMock() {
  const store = {};
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, val) => { store[key] = String(val); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { for (const key of Object.keys(store)) delete store[key]; },
  };
}
Object.defineProperty(globalThis, 'localStorage', { value: createStorageMock(), writable: true });

// The real product database: the bugs these tests guard against came from real NEVO names
// ("Pap havermout halfvolle melk", "Mais") and from the group lookup.
const products = JSON.parse(readFileSync(new URL('../../public/products.json', import.meta.url), 'utf8'));

function categoryOf(naam) {
  const result = schijfDagScore({ ontbijt: [{ naam, kcal: 100, _gram: 100 }] });
  for (const [category, items] of Object.entries(result.catItems)) {
    if (items.some(item => item.naam === naam)) return category;
  }
  if (result.outsideItems.some(item => item.naam === naam)) return 'outside';
  return 'ignored';
}

describe('Schijf van Vijf categories', () => {
  beforeAll(() => {
    setCfg({ supermarketExclusions: [] });
    setNevoData(products);
    setNevoReady(true);
  });

  afterAll(() => {
    setNevoData(null);
    setNevoReady(false);
    setCfg({});
  });

  it.each([
    ['Havermout', 'volkoren'],
    ['Brinta', 'volkoren'],
    ['Muesli', 'volkoren'],
    ['Volkorenbrood', 'volkoren'],
    ['Roggebrood', 'volkoren'],
    ['Zilvervliesrijst', 'volkoren'],
    ['Augurk zoetzuur', 'groente'],
    ['Broccoli', 'groente'],
    ['Banaan', 'fruit'],
    ['Halfvolle melk', 'zuivel'],
    ['Kaas 45+', 'zuivel'],
    ['Tonijn in Olijfolie', 'eiwit'],
    ['Ei algemeen - gekookt', 'eiwit'],
    ['Walnoten', 'onverzadigd_vet'],
    ['Olijfolie', 'onverzadigd_vet'],
  ])('%s counts as %s', (naam, category) => {
    expect(categoryOf(naam)).toBe(category);
  });

  it('does not count oats as dairy or corn bread as vegetables', () => {
    expect(categoryOf('Havermout')).not.toBe('zuivel');
    expect(categoryOf('Tarwemaisbrood wit')).not.toBe('groente');
  });

  it('keeps white bread and white rice out of wholegrain', () => {
    expect(categoryOf('Tarwemaisbrood wit')).not.toBe('volkoren');
    expect(categoryOf('Witte rijst')).not.toBe('volkoren');
    expect(categoryOf('Wit bolletje')).not.toBe('volkoren');
  });
});
