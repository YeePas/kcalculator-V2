/* ── Product Database (NEVO + Custom) ─────────────────────── */

import {
  nevoData, nevoReady, offData, offReady,
  setNevoData, setNevoReady, setOffData, setOffReady,
  cfg,
} from '../state.js';
import { loadCustomProducts } from '../storage.js';
import { parseQuantity } from './portions.js';
import { shouldIncludeProductForSupermarketFilters } from './supermarket-filter.js';

const PRODUCTS_CACHE_KEY = 'kcalculator_products_v5';
const LEGACY_PRODUCTS_CACHE_KEYS = ['kcalculator_products_v4', 'kcalculator_products_v3', 'kcalculator_products_v2', 'kcalculator_products_v1'];
const OFF_SEARCH_CACHE_KEY = 'kcalculator_off_search_v1';
const OFF_SEARCH_TTL_MS = 1000 * 60 * 60 * 12;

function round1(v) {
  return Math.round((Number(v) || 0) * 10) / 10;
}

function offKcalPer100(nutriments = {}) {
  const fromKcal = Number(
    nutriments['energy-kcal_100g']
    ?? nutriments.energy_kcal_100g
    ?? nutriments['energy-kcal']
    ?? nutriments.energy_kcal
    ?? 0
  );
  if (Number.isFinite(fromKcal) && fromKcal > 0) return Math.round(fromKcal);
  const kj = Number(
    nutriments.energy_100g
    ?? nutriments['energy-kj_100g']
    ?? nutriments.energy_kj_100g
    ?? 0
  );
  if (Number.isFinite(kj) && kj > 0) return Math.round(kj / 4.184);
  return 0;
}

function mapOffApiProduct(product) {
  const n = String(product.product_name_nl || product.product_name || '').trim();
  if (!n) return null;
  const nutriments = product.nutriments || {};
  return {
    n,
    b: String(product.brands || '').trim(),
    k: offKcalPer100(nutriments),
    kh: round1(nutriments.carbohydrates_100g),
    vz: round1(nutriments.fiber_100g),
    v: round1(nutriments.fat_100g),
    e: round1(nutriments.proteins_100g),
    s: String(product.quantity || '').trim(),
    src: 'off-api',
    _group: 'Open Food Facts (live)',
    _offCode: String(product.code || '').trim(),
  };
}

function readOffSearchCache() {
  try {
    const raw = localStorage.getItem(OFF_SEARCH_CACHE_KEY);
    const data = raw ? JSON.parse(raw) : {};
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function writeOffSearchCache(cache) {
  try { localStorage.setItem(OFF_SEARCH_CACHE_KEY, JSON.stringify(cache)); } catch {}
}

async function searchOffLive(query, terms, limit = 10) {
  const normalized = String(query || '').toLowerCase().trim();
  if (!normalized || normalized.length < 3) return [];

  const cache = readOffSearchCache();
  const cached = cache[normalized];
  if (cached && cached.ts && (Date.now() - cached.ts) < OFF_SEARCH_TTL_MS && Array.isArray(cached.items)) {
    return cached.items;
  }

  try {
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(normalized)}&search_simple=1&action=process&json=1&page_size=25&fields=code,product_name,product_name_nl,brands,quantity,nutriments`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const payload = await response.json();
    const products = Array.isArray(payload.products) ? payload.products : [];

    const mapped = products
      .map(mapOffApiProduct)
      .filter(Boolean)
      .filter(item => shouldIncludeProductForSupermarketFilters(item, cfg.supermarketExclusions))
      .filter(item => {
        const text = `${item.n} ${item.b || ''} ${item.s || ''}`.toLowerCase();
        return terms.every(t => text.includes(t));
      })
      .slice(0, limit);

    cache[normalized] = { ts: Date.now(), items: mapped };
    writeOffSearchCache(cache);
    return mapped;
  } catch {
    return [];
  }
}

export function clearProductCache() {
  try { localStorage.removeItem(PRODUCTS_CACHE_KEY); } catch {}
  try { localStorage.removeItem(OFF_SEARCH_CACHE_KEY); } catch {}
  for (const legacyKey of LEGACY_PRODUCTS_CACHE_KEYS) {
    try { localStorage.removeItem(legacyKey); } catch {}
  }
}

export async function loadNevo() {
  for (const legacyKey of LEGACY_PRODUCTS_CACHE_KEYS) {
    try { localStorage.removeItem(legacyKey); } catch {}
  }

  // Try cache first
  try {
    const cached = localStorage.getItem(PRODUCTS_CACHE_KEY);
    if (cached) {
      const data = JSON.parse(cached);
      if (data && data.items && data.items.length > 5000) {
        setNevoData(data);
        setNevoReady(true);
        setOffReady(true);
        console.log('[DB] Geladen uit cache:', data.items.length, 'producten');
        return;
      }
    }
  } catch {}

  // Fetch fresh
  try {
    console.log('[DB] Laden van products.json...');
    const r = await fetch('products.json', { cache: 'no-store' });
    if (r.ok) {
      const data = await r.json();
      setNevoData(data);
      setNevoReady(true);
      setOffReady(true);
      try { localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(data)); } catch(e) { console.warn('[DB] Cache te groot:', e); }
      console.log('[DB] Geladen:', data.items.length, 'producten');
    } else {
      console.error('[DB] Fetch mislukt:', r.status);
      // Fallback: try old nevo.json
      const r2 = await fetch('nevo.json', { cache: 'no-store' });
      if (r2.ok) {
        const data = await r2.json();
        setNevoData(data);
        setNevoReady(true);
        console.log('[DB] Fallback nevo.json geladen:', data.items.length);
      }
    }
  } catch (e) {
    console.error('[DB] Kon niet laden:', e);
  }
}

export function searchNevo(query) {
  // Parse quantity: "2 bananen" -> count=2, query="bananen"
  const parsed = parseQuantity(query);
  let searchQ = parsed.query || query;
  // Also strip leftover quantity words
  searchQ = searchQ.replace(/\b\d+\s*(gram|gr|g|ml|liter|l|cl|dl|kg|stuks?|st)\b/gi, '').trim();
  if (!searchQ) searchQ = query;
  const normalizedQuery = searchQ.toLowerCase().trim();
  const terms = normalizedQuery.split(/\s+/).filter(t => t.length >= 2);
  if (!terms.length) return [];

  const results = [];

  // 1) Search custom products first (higher priority)
  const customs = loadCustomProducts();
  for (const item of customs) {
    const searchText = item.n.toLowerCase();
    if (!terms.every(t => searchText.includes(t))) continue;
    results.push({
      ...item,
      _score: 50 + (searchText.startsWith(terms[0]) ? 10 : 0),
      _group: 'Eigen producten',
      _custom: true,
    });
  }

  // 2) Search product database (RIVM + OFF merged)
  if (nevoReady && nevoData) {
    for (const item of nevoData.items) {
      if (!shouldIncludeProductForSupermarketFilters(item, cfg.supermarketExclusions)) continue;
      const searchText = (item.n + ' ' + (item.s || '') + ' ' + (item.b || '')).toLowerCase();
      if (!terms.every(t => searchText.includes(t))) continue;

      let score = item.src === 'rivm' ? 5 : 0; // RIVM gets priority
      const nameLower = item.n.toLowerCase();
      const brandLower = String(item.b || '').toLowerCase();
      // Word-boundary matching: "appel" should NOT match "aardappel"
      const firstTermRegex = new RegExp('\\b' + terms[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      if (firstTermRegex.test(nameLower)) score += 10;
      else score -= 5; // substring-only match penalized
      if (nameLower.startsWith(terms[0])) score += 5;
      if (terms.length === 1 && nameLower === terms[0]) score += 20;
      if (nameLower === normalizedQuery) score += 40;
      if (nameLower.startsWith(normalizedQuery)) score += 18;
      if (nameLower.includes(normalizedQuery)) score += 10;
      if (brandLower && normalizedQuery.includes(brandLower)) score += 8;
      if (item.b) score += 2;
      score -= item.n.length * 0.04;

      const group = item.g !== undefined ? nevoData.groups[item.g] : (item.b || 'Open Food Facts');
      results.push({ ...item, _score: score, _group: group });
    }
  }

  results.sort((a, b) => b._score - a._score);
  return results.slice(0, 8);
}

export async function searchNevoHybrid(query, limit = 8) {
  const localResults = searchNevo(query);
  if (cfg.openFoodFactsLiveSearch === false) return localResults.slice(0, limit);
  if (String(query || '').trim().length < 3) return localResults.slice(0, limit);

  const normalizedQuery = String(query || '').toLowerCase().trim();
  const terms = normalizedQuery.split(/\s+/).filter(t => t.length >= 2);
  if (!terms.length) return localResults.slice(0, limit);

  const liveOff = await searchOffLive(query, terms, limit * 2);
  if (!liveOff.length) return localResults.slice(0, limit);

  // Keep local results leading, but reserve a few slots so live OFF matches are visible.
  const localPrimaryCount = Math.max(4, limit - 2);
  const primaryLocal = localResults.slice(0, localPrimaryCount);
  const overflowLocal = localResults.slice(localPrimaryCount);

  const seen = new Set();
  const merged = [];
  for (const item of [...primaryLocal, ...liveOff, ...overflowLocal]) {
    const key = `${String(item.n || '').toLowerCase()}|${String(item.b || '').toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= limit) break;
  }
  return merged;
}
