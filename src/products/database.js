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
const SEARCH_SYNONYMS = {
  boterham: ['volkoren brood', 'bruin brood', 'wit brood', 'zuurdesem brood', 'tarwebrood volkoren', 'tarwebrood bruin', 'tarwebrood wit'],
  boterhammen: ['volkoren brood', 'bruin brood', 'wit brood', 'zuurdesem brood', 'tarwebrood volkoren', 'tarwebrood bruin', 'tarwebrood wit'],
  brood: ['volkoren brood', 'bruin brood', 'wit brood', 'zuurdesem brood', 'tarwebrood volkoren', 'tarwebrood bruin', 'tarwebrood wit'],
  ei: ['ei kippen gekookt gem', 'ei kippen gebakken', 'ei kippen rauw gem'],
  eieren: ['ei kippen gekookt gem', 'ei kippen gebakken', 'ei kippen rauw gem'],
  eitje: ['ei kippen gekookt gem', 'ei kippen gebakken', 'ei kippen rauw gem'],
  gekookt: ['ei kippen gekookt gem'],
  'gekookt ei': ['ei kippen gekookt gem'],
  'gebakken ei': ['ei kippen gebakken'],
  'rauw ei': ['ei kippen rauw gem'],
  'onbereid ei': ['ei kippen rauw gem'],
};
const BREAD_PRIORITY_TERMS = ['brood', 'boterham', 'boterhammen'];
const BREAD_PRIORITY_RULES = [
  { label: 'Volkoren', test: name => /tarwebrood volkoren/.test(name) },
  { label: 'Bruin', test: name => /^tarwebrood bruin\b|^bruin tarwebrood\b/.test(name) },
  { label: 'Wit', test: name => /^tarwebrood wit\b/.test(name) },
  { label: 'Zuurdesem', test: name => /tarwedesembrood|desembrood/.test(name) && /brood/.test(name) && !/glutenvrij/.test(name) },
];
const EGG_PRIORITY_TERMS = ['ei', 'eieren', 'eitje', 'eitjes'];
const EGG_PRIORITY_RULES = [
  { original: 'ei kippen gekookt gem', alias: 'Ei algemeen - gekookt' },
  { original: 'ei kippen gebakken', alias: 'Ei algemeen - gebakken' },
  { original: 'ei kippen rauw gem', alias: 'Ei algemeen - onbereid' },
];

function round1(v) {
  return Math.round((Number(v) || 0) * 10) / 10;
}

function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toSingularSearchTerm(term) {
  const value = normalizeSearchText(term);
  if (value.length < 4) return value;
  if (value.endsWith('ies') && value.length > 4) return value.slice(0, -3) + 'ie';
  if (value.endsWith('eren') && value.length > 5) return value.slice(0, -2);
  if (value.endsWith('en') && value.length > 4) return value.slice(0, -2);
  if (value.endsWith('s') && value.length > 3) return value.slice(0, -1);
  return value;
}

function buildSearchVariants(query) {
  const normalized = normalizeSearchText(query);
  if (!normalized) return [];
  const seen = new Set([normalized]);
  const variants = [normalized];
  const words = normalized.split(/\s+/).filter(Boolean);
  const singularWords = words.map(toSingularSearchTerm);
  const singularPhrase = singularWords.join(' ').trim();
  if (singularPhrase && !seen.has(singularPhrase)) {
    seen.add(singularPhrase);
    variants.push(singularPhrase);
  }
  for (const word of singularWords) {
    if (word && !seen.has(word)) {
      seen.add(word);
      variants.push(word);
    }
  }

  for (const variant of [...variants]) {
    const synonyms = SEARCH_SYNONYMS[variant] || [];
    for (const synonym of synonyms) {
      const normalizedSynonym = normalizeSearchText(synonym);
      if (!normalizedSynonym || seen.has(normalizedSynonym)) continue;
      seen.add(normalizedSynonym);
      variants.push(normalizedSynonym);
    }
  }
  return variants;
}

function isBreadPriorityQuery(query) {
  const normalized = normalizeSearchText(query);
  if (!normalized) return false;
  const words = normalized.split(/\s+/).filter(Boolean);
  return words.some(word => BREAD_PRIORITY_TERMS.includes(word));
}

function applyBreadPriority(results, query) {
  if (!isBreadPriorityQuery(query) || !Array.isArray(results) || !results.length) return results;

  const promoted = [];
  const used = new Set();
  for (const rule of BREAD_PRIORITY_RULES) {
    const match = results.find(item => {
      if (!item?.n) return false;
      const key = `${String(item.n).toLowerCase()}|${String(item.b || '').toLowerCase()}`;
      if (used.has(key)) return false;
      return rule.test(normalizeSearchText(item.n));
    });
    if (!match) continue;
    const key = `${String(match.n).toLowerCase()}|${String(match.b || '').toLowerCase()}`;
    used.add(key);
    promoted.push(match);
  }

  if (!promoted.length) return results;

  const remainder = results.filter(item => {
    const key = `${String(item?.n || '').toLowerCase()}|${String(item?.b || '').toLowerCase()}`;
    return !used.has(key);
  });
  return [...promoted, ...remainder];
}

function isEggPriorityQuery(query) {
  const normalized = normalizeSearchText(query);
  if (!normalized) return false;
  const words = normalized.split(/\s+/).filter(Boolean);
  return words.some(word => EGG_PRIORITY_TERMS.includes(word))
    || normalized.includes('gekookt ei')
    || normalized.includes('gebakken ei')
    || normalized.includes('rauw ei')
    || normalized.includes('onbereid ei');
}

function applyEggPriority(results, query) {
  if (!isEggPriorityQuery(query) || !Array.isArray(results) || !results.length) return results;

  const aliases = [];
  const hiddenOriginals = new Set();
  for (const rule of EGG_PRIORITY_RULES) {
    const match = results.find(item => normalizeSearchText(item?.n) === rule.original);
    if (!match) continue;
    hiddenOriginals.add(`${String(match.n || '').toLowerCase()}|${String(match.b || '').toLowerCase()}`);
    aliases.push({
      ...match,
      n: rule.alias,
      s: match.n,
      _score: (match._score || 0) + 1000,
      _group: 'Eieren',
    });
  }

  if (!aliases.length) return results;

  const remainder = results.filter(item => {
    const key = `${String(item?.n || '').toLowerCase()}|${String(item?.b || '').toLowerCase()}`;
    return !hiddenOriginals.has(key);
  });
  return [...aliases, ...remainder];
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

export function mapOffApiProduct(product) {
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
  const searchVariants = buildSearchVariants(searchQ);
  const primaryQuery = searchVariants[0] || '';
  const primaryTerms = primaryQuery.split(/\s+/).filter(t => t.length >= 2);
  if (!primaryTerms.length) return [];

  const results = [];
  const seen = new Set();

  const pushResult = (item, score, extra = {}) => {
    const key = `${String(item.n || '').toLowerCase()}|${String(item.b || '').toLowerCase()}`;
    const next = { ...item, ...extra, _score: score };
    const existingIdx = results.findIndex(result => `${String(result.n || '').toLowerCase()}|${String(result.b || '').toLowerCase()}` === key);
    if (existingIdx >= 0) {
      if ((results[existingIdx]._score || 0) < score) results[existingIdx] = next;
      return;
    }
    if (seen.has(key)) return;
    seen.add(key);
    results.push(next);
  };

  // 1) Search custom products first (higher priority)
  const customs = loadCustomProducts();
  for (const item of customs) {
    const searchText = normalizeSearchText(item.n);
    let bestScore = -Infinity;
    for (const variant of searchVariants) {
      const terms = variant.split(/\s+/).filter(t => t.length >= 2);
      if (!terms.length || !terms.every(t => searchText.includes(t))) continue;
      let score = 50 + (searchText.startsWith(terms[0]) ? 10 : 0);
      if (searchText === variant) score += 24;
      if (searchText.startsWith(variant)) score += 10;
      if (variant !== primaryQuery) score -= 6;
      bestScore = Math.max(bestScore, score);
    }
    if (bestScore > -Infinity) {
      pushResult(item, bestScore, { _group: 'Eigen producten', _custom: true });
    }
  }

  // 2) Search product database (RIVM + OFF merged)
  if (nevoReady && nevoData) {
    for (const item of nevoData.items) {
      if (!shouldIncludeProductForSupermarketFilters(item, cfg.supermarketExclusions)) continue;
      const searchText = normalizeSearchText(item.n + ' ' + (item.s || '') + ' ' + (item.b || ''));
      const nameLower = normalizeSearchText(item.n);
      const brandLower = normalizeSearchText(item.b || '');
      let bestScore = -Infinity;

      for (const variant of searchVariants) {
        const terms = variant.split(/\s+/).filter(t => t.length >= 2);
        if (!terms.length || !terms.every(t => searchText.includes(t))) continue;

        let score = item.src === 'rivm' ? 5 : 0;
        const firstTermRegex = new RegExp('\\b' + terms[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        if (firstTermRegex.test(nameLower)) score += 10;
        else score -= 5;
        if (nameLower.startsWith(terms[0])) score += 5;
        if (terms.length === 1 && nameLower === terms[0]) score += 20;
        if (nameLower === variant) score += 40;
        if (nameLower.startsWith(variant)) score += 18;
        if (nameLower.includes(variant)) score += 10;
        if (brandLower && primaryQuery.includes(brandLower)) score += 8;
        if (item.b) score += 2;
        if (variant !== primaryQuery) score -= 6;
        score -= item.n.length * 0.04;
        bestScore = Math.max(bestScore, score);
      }

      if (bestScore === -Infinity) continue;
      const group = item.g !== undefined ? nevoData.groups[item.g] : (item.b || 'Open Food Facts');
      pushResult(item, bestScore, { _group: group });
    }
  }

  results.sort((a, b) => b._score - a._score);
  return applyEggPriority(applyBreadPriority(results, query), query).slice(0, 8);
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
