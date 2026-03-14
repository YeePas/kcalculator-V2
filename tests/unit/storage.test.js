/* ── Unit tests: storage.js ────────────────────────────────── */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  safeParse,
  loadCfg,
  saveCfg,
  loadFavs,
  saveFavs,
  loadGoals,
  saveGoals,
  loadCustomProducts,
  saveCustomProducts,
} from '../../src/storage.js';
import { CFG_KEY, CFG_SESSION_KEY, FAV_KEY, GOALS_KEY, CUSTOM_KEY, DEFAULT_GOALS } from '../../src/constants.js';

// localStorage mock
function createStorageMock() {
  const store = {};
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, val) => { store[key] = String(val); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  };
}

const localStorageMock = createStorageMock();
const sessionStorageMock = createStorageMock();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });
Object.defineProperty(globalThis, 'sessionStorage', { value: sessionStorageMock, writable: true });

beforeEach(() => {
  localStorageMock.clear();
  sessionStorageMock.clear();
});

// ── safeParse ────────────────────────────────────────────────
describe('safeParse', () => {
  it('returns parsed JSON from localStorage', () => {
    localStorage.setItem('test', JSON.stringify({ a: 1 }));
    expect(safeParse('test', {})).toEqual({ a: 1 });
  });

  it('returns fallback for missing key', () => {
    expect(safeParse('nonexistent', 'fallback')).toBe('fallback');
  });

  it('returns fallback for invalid JSON', () => {
    localStorage.setItem('broken', '{not valid json');
    expect(safeParse('broken', [])).toEqual([]);
  });

  it('returns fallback for null/empty stored value', () => {
    localStorage.setItem('empty', 'null');
    expect(safeParse('empty', 'default')).toBe('default');
  });
});

// ── Config ───────────────────────────────────────────────────
describe('loadCfg / saveCfg', () => {
  it('stores sensitive API keys in sessionStorage only', () => {
    saveCfg({
      sbUrl: 'https://example.supabase.co',
      sbKey: 'anon-key',
      provider: 'openai',
      model: 'gpt-4o-mini',
      keys: { openai: 'secret-openai-key' },
      claudeKey: 'legacy-secret',
    });

    expect(JSON.parse(localStorage.getItem(CFG_KEY))).toEqual({
      sbUrl: 'https://example.supabase.co',
      sbKey: 'anon-key',
      provider: 'openai',
      model: 'gpt-4o-mini',
    });
    expect(JSON.parse(sessionStorage.getItem(CFG_SESSION_KEY))).toEqual({
      claudeKey: 'legacy-secret',
      keys: { openai: 'secret-openai-key' },
    });
  });

  it('loads legacy keys from localStorage once and migrates them to sessionStorage', () => {
    localStorage.setItem(CFG_KEY, JSON.stringify({
      sbUrl: 'https://example.supabase.co',
      provider: 'claude',
      keys: { claude: 'old-secret' },
      claudeKey: 'old-secret',
    }));

    const cfg = loadCfg();

    expect(cfg.keys).toEqual({ claude: 'old-secret' });
    expect(cfg.claudeKey).toBe('old-secret');
    expect(JSON.parse(sessionStorage.getItem(CFG_SESSION_KEY))).toEqual({
      claudeKey: 'old-secret',
      keys: { claude: 'old-secret' },
    });
    expect(JSON.parse(localStorage.getItem(CFG_KEY))).toEqual({
      sbUrl: 'https://example.supabase.co',
      provider: 'claude',
    });
  });
});

// ── Favourites ───────────────────────────────────────────────
describe('loadFavs / saveFavs', () => {
  it('returns empty array when no favourites stored', () => {
    expect(loadFavs()).toEqual([]);
  });

  it('persists and retrieves favourites', () => {
    const favs = [
      { naam: 'Boterham kaas', tekst: 'brood met kaas', maaltijd: 'ontbijt' },
      { naam: 'Salade', tekst: 'groene salade', maaltijd: 'lunch' },
    ];
    saveFavs(favs);
    expect(loadFavs()).toEqual(favs);
  });

  it('overwrites previous favourites', () => {
    saveFavs([{ naam: 'A' }]);
    saveFavs([{ naam: 'B' }, { naam: 'C' }]);
    expect(loadFavs()).toHaveLength(2);
    expect(loadFavs()[0].naam).toBe('B');
  });
});

// ── Goals ────────────────────────────────────────────────────
describe('loadGoals / saveGoals', () => {
  it('returns DEFAULT_GOALS when nothing stored', () => {
    const g = loadGoals();
    expect(g.kcal).toBe(DEFAULT_GOALS.kcal);
    expect(g.carbs).toBe(DEFAULT_GOALS.carbs);
    expect(g.prot).toBe(DEFAULT_GOALS.prot);
  });

  it('persists custom goals', () => {
    const custom = { kcal: 1800, carbs: 200, fat: 60, prot: 90, fiber: 25, water: 2500 };
    saveGoals(custom);
    expect(loadGoals()).toEqual(custom);
  });
});

// ── Custom Products ──────────────────────────────────────────
describe('loadCustomProducts / saveCustomProducts', () => {
  it('returns empty array when nothing stored', () => {
    expect(loadCustomProducts()).toEqual([]);
  });

  it('persists and retrieves custom products', () => {
    const products = [
      { naam: 'Eigen granola', kcal: 400, koolhydraten_g: 60, vetten_g: 12, eiwitten_g: 8 },
    ];
    saveCustomProducts(products);
    expect(loadCustomProducts()).toEqual(products);
  });
});
