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

describe('Schijf van Vijf 2026', () => {
  let collectDay;
  beforeAll(async () => {
    setCfg({ supermarketExclusions: [] });
    setNevoData(products);
    setNevoReady(true);
    ({ collectDay } = await import('../../src/pages/schijf-2026.js'));
  });

  afterAll(() => {
    setNevoData(null);
    setNevoReady(false);
    setCfg({});
  });

  function bucketOf(naam) {
    const { items } = collectDay({ ontbijt: [{ naam, kcal: 100, _gram: 100 }] });
    return Object.entries(items).find(([, list]) => list.some(item => item.naam === naam))?.[0];
  }

  it.each([
    ['Havermout', 'volkoren_brood'],
    ['Volkorenbrood', 'volkoren_brood'],
    ['Aardappelen gekookt', 'graan_aardappel'],
    ['Augurk zoetzuur', 'groente'],
    ['Banaan', 'fruit'],
    ['Halfvolle melk', 'zuivel_alt'],
    ['Kaas 45+', 'kaas'],
    ['Walnoten', 'noten'],
    ['Chiazaad', 'noten'],
    ['Olijfolie', 'vetten_olie'],
    ['Tonijn in Olijfolie', 'vis'],
    ['Linzen gekookt', 'plant_eiwit'],
  ])('%s counts as %s', (naam, bucket) => {
    expect(bucketOf(naam)).toBe(bucket);
  });

  it.each(['Broodje kroket', 'Suiker kristal-', "Tony's Chocolonely", 'Mueslireep hazelnoot', 'Cola', 'Roomboter'])(
    '%s is outside the Schijf', (naam) => {
      expect(bucketOf(naam)).toBe('outside');
    });

  it('does not count white bread as wholegrain', () => {
    expect(bucketOf('Tarwemaisbrood wit')).not.toBe('volkoren_brood');
  });
});

describe('Schijf van Vijf 2026 upper bounds', () => {
  it('flags cheese, fats and nuts well above the advice', async () => {
    const { isAboveAdvice } = await import('../../src/pages/schijf-2026.js');
    expect(isAboveAdvice({ key: 'kaas', boven: 40 }, { kaas: 30 })).toBe(false);
    expect(isAboveAdvice({ key: 'kaas', boven: 40 }, { kaas: 60 })).toBe(true);
    expect(isAboveAdvice({ key: 'groente' }, { groente: 900 })).toBe(false);
  });
});
