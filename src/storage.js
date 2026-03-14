/* ── LocalStorage Wrappers ─────────────────────────────────── */

import {
  CFG_KEY, CFG_SESSION_KEY, GOALS_KEY, FAV_KEY, VIS_KEY, CUSTOM_KEY,
  DEFAULT_GOALS, SUPABASE_URL, SUPABASE_ANON_KEY,
} from './constants.js';

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

// ── Config ────────────────────────────────────────────────
export function loadCfg() {
  const raw = safeParse(CFG_KEY, {});
  const sessionSecrets = safeParseFromStorage(getSessionStorage(), CFG_SESSION_KEY, {});
  const secrets = {
    claudeKey: cleanString(sessionSecrets.claudeKey || raw.claudeKey || ''),
    keys: sessionSecrets.keys || raw.keys || {},
  };

  if ((raw.claudeKey || raw.keys) && getSessionStorage()) {
    safeSetJson(getSessionStorage(), CFG_SESSION_KEY, secrets);
    const migrated = { ...raw };
    delete migrated.claudeKey;
    delete migrated.keys;
    safeSetJson(getLocalStorage(), CFG_KEY, migrated);
  }

  return {
    sbUrl: normalizeSupabaseUrl(raw.sbUrl || SUPABASE_URL),
    sbKey: cleanString(raw.sbKey || SUPABASE_ANON_KEY),
    claudeKey: secrets.claudeKey,
    keys: secrets.keys,
    provider: raw.provider || 'claude',
    model: raw.model || '',
    adviesProvider: raw.adviesProvider || '',
    adviesModel: raw.adviesModel || '',
    importProvider: raw.importProvider || '',
    importModel: raw.importModel || '',
  };
}

export function saveCfg(cfg) {
  const persisted = { ...cfg };
  delete persisted.claudeKey;
  delete persisted.keys;
  safeSetJson(getLocalStorage(), CFG_KEY, persisted);

  const secrets = {
    claudeKey: cfg?.claudeKey || '',
    keys: cfg?.keys || {},
  };
  if (secrets.claudeKey || Object.keys(secrets.keys).length > 0) {
    safeSetJson(getSessionStorage(), CFG_SESSION_KEY, secrets);
  } else {
    safeRemove(getSessionStorage(), CFG_SESSION_KEY);
  }
}

// ── Goals ─────────────────────────────────────────────────
export function loadGoals() {
  return safeParse(GOALS_KEY, { ...DEFAULT_GOALS });
}

export function saveGoals(g) {
  safeSetJson(getLocalStorage(), GOALS_KEY, g);
}

// ── Favourites ────────────────────────────────────────────
export function loadFavs() {
  return safeParse(FAV_KEY, []);
}

export function saveFavs(favs) {
  safeSetJson(getLocalStorage(), FAV_KEY, favs);
}

// ── Visibility prefs ──────────────────────────────────────
export function loadVis() {
  return safeParse(VIS_KEY, { carbs: true, fat: true, prot: true, fiber: true, water: true });
}

// ── Custom Products ───────────────────────────────────────
export function loadCustomProducts() {
  return safeParse(CUSTOM_KEY, []);
}

export function saveCustomProducts(products) {
  safeSetJson(getLocalStorage(), CUSTOM_KEY, products);
}
