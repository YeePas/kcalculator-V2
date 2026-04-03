import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { matchItemToNevo } from '../../src/products/matcher.js';
import { setCfg, setNevoData, setNevoReady } from '../../src/state.js';

function createStorageMock() {
  const store = {};
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, val) => { store[key] = String(val); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { for (const key of Object.keys(store)) delete store[key]; },
  };
}

const localStorageMock = createStorageMock();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

describe('matcher recipe aliases', () => {
  beforeEach(() => {
    setCfg({ supermarketExclusions: [] });
    setNevoData({
      items: [
        { n: 'Tomaat gezeefd pak', k: 30, kh: 5, v: 0, e: 1, vz: 1, src: 'off' },
        { n: 'Bloem tarwe-', s: 'Tarwebloem/patentbloem', k: 364, kh: 76, v: 1, e: 10, vz: 3, src: 'rivm' },
        { n: 'Tofureepjes/-blokjes gekruid onbereid', k: 150, kh: 3, v: 9, e: 15, vz: 2, src: 'rivm' },
        { n: 'boter ongezouten', k: 717, kh: 0.7, v: 81, e: 0.9, vz: 0, src: 'rivm' },
        { n: 'Suiker basterd- bruine', s: 'Basterdsuiker bruine', k: 400, kh: 100, v: 0, e: 0, vz: 0, src: 'rivm' },
      ],
    });
    setNevoReady(true);
    localStorageMock.clear();
  });

  afterEach(() => {
    setNevoData(null);
    setNevoReady(false);
    setCfg({});
    localStorageMock.clear();
  });

  it('prefers flour for bloem recipe ingredients', () => {
    expect(matchItemToNevo({ foodName: 'bloem' })?.n).toBe('Bloem tarwe-');
  });

  it('ignores recipe descriptors after commas for bloem', () => {
    expect(matchItemToNevo({ foodName: '200 gram bloem, gezeefd' })?.n).toBe('Bloem tarwe-');
  });

  it('prefers butter for boter recipe ingredients', () => {
    expect(matchItemToNevo({ foodName: 'boter' })?.n).toBe('boter ongezouten');
  });

  it('ignores recipe descriptors after commas for boter', () => {
    expect(matchItemToNevo({ foodName: 'boter, koude blokjes' })?.n).toBe('boter ongezouten');
  });

  it('recognizes basterdsuiker via recipe-friendly synonym', () => {
    expect(matchItemToNevo({ foodName: 'basterdsuiker' })?.n).toBe('Suiker basterd- bruine');
  });
});
