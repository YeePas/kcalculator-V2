/* ── LocalStorage Wrappers ─────────────────────────────────── */

import {
  CFG_KEY, CFG_SESSION_KEY, GOALS_KEY, FAV_KEY, VIS_KEY, CUSTOM_KEY, WEIGHT_KEY,
  DEFAULT_GOALS, SUPABASE_URL, SUPABASE_ANON_KEY, PREFS_SYNC_META_KEY,
} from './constants.js';
import { normalizeSupermarketFilters } from './products/supermarket-filter.js';

const PREF_SYNC_CATEGORIES = ['cfg', 'goals', 'favs', 'custom', 'vis', 'weight'];

function cleanString(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/^['"]+|['"]+$/g, '');
}

function normalizeSupabaseUrl(value) {
  const cleaned = cleanString(value).replace(/\/+$/, '');
  if (!cleaned) return '';
  try {
    const url = new URL(cleaned);
    return url.origin;
  } catch {
    return cleaned;
  }
}

// ── Generic helpers ───────────────────────────────────────
export function getLocalStorage() {
  try { return globalThis.localStorage || null; }
  catch { return null; }
}

export function getSessionStorage() {
  try { return globalThis.sessionStorage || null; }
  catch { return null; }
}

export function safeParseFromStorage(storage, key, fallback) {
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) || fallback;
  } catch {
    return fallback;
  }
}

export function safeParse(key, fallback) {
  return safeParseFromStorage(getLocalStorage(), key, fallback);
}

export function safeSetJson(storage, key, value) {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function safeRemove(storage, key) {
  if (!storage) return;
  try { storage.removeItem(key); }
  catch { /* ignore */ }
}

function normalizeSessionKeys(value) {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([provider, key]) => [String(provider || '').trim().toLowerCase(), cleanString(key)])
      .filter(([provider, key]) => provider && key)
  );
}

export function isLocalDevHost() {
  const hostname = globalThis.location?.hostname || '';
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

export function loadSessionAiKeys() {
  const raw = safeParseFromStorage(getSessionStorage(), CFG_SESSION_KEY, {});
  return normalizeSessionKeys(raw.keys);
}

export function saveSessionAiKey(provider, value) {
  const storage = getSessionStorage();
  if (!storage) return false;
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  if (!normalizedProvider) return false;

  const keys = {
    ...loadSessionAiKeys(),
    [normalizedProvider]: cleanString(value),
  };

  if (!keys[normalizedProvider]) delete keys[normalizedProvider];

  if (Object.keys(keys).length === 0) {
    safeRemove(storage, CFG_SESSION_KEY);
    return true;
  }

  return safeSetJson(storage, CFG_SESSION_KEY, { keys });
}

function normalizeSyncMetaEntry(value) {
  return {
    dirty: value?.dirty === true,
    updatedAt: Number(value?.updatedAt || 0),
    lastSyncedAt: Number(value?.lastSyncedAt || 0),
    lastRemoteAt: Number(value?.lastRemoteAt || 0),
  };
}

export function loadPrefsSyncMeta() {
  const raw = safeParse(PREFS_SYNC_META_KEY, {});
  return Object.fromEntries(
    PREF_SYNC_CATEGORIES.map(category => [category, normalizeSyncMetaEntry(raw[category])])
  );
}

export function savePrefsSyncMeta(meta) {
  const next = Object.fromEntries(
    PREF_SYNC_CATEGORIES.map(category => [category, normalizeSyncMetaEntry(meta?.[category])])
  );
  safeSetJson(getLocalStorage(), PREFS_SYNC_META_KEY, next);
}

export function getPrefSyncMetaEntry(category) {
  return loadPrefsSyncMeta()[category] || normalizeSyncMetaEntry(null);
}

export function markPrefCategoryDirty(category) {
  if (!PREF_SYNC_CATEGORIES.includes(category)) return;
  const meta = loadPrefsSyncMeta();
  meta[category] = {
    ...normalizeSyncMetaEntry(meta[category]),
    dirty: true,
    updatedAt: Date.now(),
  };
  savePrefsSyncMeta(meta);
}

export function markPrefCategoriesSynced(categories) {
  const now = Date.now();
  const meta = loadPrefsSyncMeta();
  categories.forEach(category => {
    if (!PREF_SYNC_CATEGORIES.includes(category)) return;
    meta[category] = {
      ...normalizeSyncMetaEntry(meta[category]),
      dirty: false,
      lastSyncedAt: now,
      lastRemoteAt: now,
    };
  });
  savePrefsSyncMeta(meta);
}

export function applyRemotePrefsSyncMeta(remoteMeta = {}) {
  const now = Date.now();
  const meta = loadPrefsSyncMeta();
  PREF_SYNC_CATEGORIES.forEach(category => {
    const remoteUpdatedAt = Number(remoteMeta?.[category]?.updatedAt || 0);
    if (!remoteUpdatedAt) return;
    meta[category] = {
      ...normalizeSyncMetaEntry(meta[category]),
      dirty: false,
      updatedAt: Math.max(Number(meta[category]?.updatedAt || 0), remoteUpdatedAt),
      lastSyncedAt: now,
      lastRemoteAt: now,
    };
  });
  savePrefsSyncMeta(meta);
}

export function buildPrefsSyncMetaPayload(categories = PREF_SYNC_CATEGORIES) {
  const meta = loadPrefsSyncMeta();
  const now = Date.now();
  return Object.fromEntries(
    categories
      .filter(category => PREF_SYNC_CATEGORIES.includes(category))
      .map(category => [category, {
        updatedAt: Number(meta[category]?.updatedAt || now),
      }])
  );
}

// ── Config ────────────────────────────────────────────────
export function normalizeStoredAiModel(model) {
  const value = cleanString(model);
  if (!value) return '';
  const legacyMap = {
    'claude-haiku-4-5-20250514': 'claude-haiku-4-5-20251001',
    'claude-sonnet-4-5-20250514': 'claude-sonnet-4-5-20250929',
    'claude-sonnet-4-5': 'claude-sonnet-4-5-20250929',
  };
  return legacyMap[value] || value;
}

export function loadCfg() {
  const raw = safeParse(CFG_KEY, {});
  const sessionKeys = loadSessionAiKeys();
  if (raw.claudeKey || raw.keys) {
    const migrated = { ...raw };
    delete migrated.claudeKey;
    delete migrated.keys;
    safeSetJson(getLocalStorage(), CFG_KEY, migrated);
  }

  return {
    sbUrl: normalizeSupabaseUrl(raw.sbUrl || SUPABASE_URL),
    sbKey: cleanString(raw.sbKey || SUPABASE_ANON_KEY),
    claudeKey: '',
    keys: sessionKeys,
    openFoodFactsLiveSearch: raw.openFoodFactsLiveSearch !== false,
    supermarketExclusions: normalizeSupermarketFilters(raw.supermarketExclusions),
    provider: raw.provider || 'claude',
    model: normalizeStoredAiModel(raw.model),
    adviesProvider: raw.adviesProvider || '',
    adviesModel: normalizeStoredAiModel(raw.adviesModel),
    importProvider: raw.importProvider || '',
    importModel: normalizeStoredAiModel(raw.importModel),
  };
}

export function saveCfg(cfg, options = {}) {
  const persisted = { ...cfg };
  delete persisted.claudeKey;
  delete persisted.keys;
  safeSetJson(getLocalStorage(), CFG_KEY, persisted);
  if (!options.skipSyncMeta) markPrefCategoryDirty('cfg');
}

// ── Goals ─────────────────────────────────────────────────
export function loadGoals() {
  return safeParse(GOALS_KEY, { ...DEFAULT_GOALS });
}

export function saveGoals(g, options = {}) {
  safeSetJson(getLocalStorage(), GOALS_KEY, g);
  if (!options.skipSyncMeta) markPrefCategoryDirty('goals');
}

// ── Favourites ────────────────────────────────────────────
export function loadFavs() {
  return safeParse(FAV_KEY, []);
}

export function saveFavs(favs, options = {}) {
  safeSetJson(getLocalStorage(), FAV_KEY, favs);
  if (!options.skipSyncMeta) markPrefCategoryDirty('favs');
}

// ── Visibility prefs ──────────────────────────────────────
export function loadVis() {
  return safeParse(VIS_KEY, { carbs: true, fat: true, prot: true, fiber: true, water: true });
}

export function saveVis(vis, options = {}) {
  safeSetJson(getLocalStorage(), VIS_KEY, vis);
  if (!options.skipSyncMeta) markPrefCategoryDirty('vis');
}

// ── Custom Products ───────────────────────────────────────
export function loadCustomProducts() {
  return safeParse(CUSTOM_KEY, []);
}

export function saveCustomProducts(products, options = {}) {
  safeSetJson(getLocalStorage(), CUSTOM_KEY, products);
  if (!options.skipSyncMeta) markPrefCategoryDirty('custom');
}

// ── Body Weight ──────────────────────────────────────────
export function loadWeight() {
  return safeParse(WEIGHT_KEY, {});
}

export function saveWeight(data, options = {}) {
  safeSetJson(getLocalStorage(), WEIGHT_KEY, data);
  if (!options.skipSyncMeta) markPrefCategoryDirty('weight');
}
