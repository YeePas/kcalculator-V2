import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { setCfg, setNevoData, setNevoReady } from '../../src/state.js';
import { microFromDay } from '../../src/pages/micronutrients.js';

Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} },
  writable: true,
});

const products = JSON.parse(readFileSync(new URL('../../public/products.json', import.meta.url), 'utf8'));

describe('microFromDay', () => {
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

  it('uses NEVO values stored on the item', () => {
    const { totals, measured } = microFromDay({ ontbijt: [{ naam: 'Iets', kcal: 100, _gram: 100, _micro: { calcium_mg: 120 } }] });
    expect(totals.calcium_mg).toBe(120);
    expect(measured).toEqual(['Iets']);
  });

  it('looks up NEVO values for items logged without them, scaled to the amount', () => {
    const nevo = products.items.find(item => item.src === 'rivm' && item.n === 'Melk halfvolle' && item.m?.ca);
    expect(nevo).toBeTruthy();
    const { totals, measured, estimated } = microFromDay({ ontbijt: [{ naam: 'Melk halfvolle', kcal: 92, _gram: 200 }] });
    expect(measured).toEqual(['Melk halfvolle']);
    expect(estimated).toEqual([]);
    expect(totals.calcium_mg).toBeCloseTo(nevo.m.ca * 2, 0);
  });

  it('estimates products without NEVO data and reports them', () => {
    const { estimated } = microFromDay({ avondsnack: [{ naam: 'Zelfgemaakte fantasiesnack xyz', kcal: 200, _gram: 50 }] });
    expect(estimated).toEqual(['Zelfgemaakte fantasiesnack xyz']);
  });
});

describe('microFromDay with everyday names', () => {
  beforeAll(() => {
    setCfg({ supermarketExclusions: [] });
    setNevoData(products);
    setNevoReady(true);
  });

  it('finds NEVO values when the name matches a brand product first', () => {
    const { measured } = microFromDay({ ontbijt: [
      { naam: 'Halfvolle melk', kcal: 92, _gram: 200 },
      { naam: 'Havermout', kcal: 280, _gram: 75 },
      { naam: 'Banaan', kcal: 110, _gram: 120 },
    ] });
    expect(measured).toEqual(['Halfvolle melk', 'Havermout', 'Banaan']);
  });
});
