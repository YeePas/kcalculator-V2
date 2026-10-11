/* ── Product Database (NEVO + Custom) ─────────────────────── */

import {
  nevoData, nevoReady, offData, offReady,
  setNevoData, setNevoReady, setOffData, setOffReady,
  cfg, authUser,
} from '../state.js';
import { loadCustomProducts } from '../storage.js';
import { applyEnergyCheck } from './nutrition-check.js';
import { parseQuantity } from './portions.js';
import { shouldIncludeProductForSupermarketFilters } from './supermarket-filter.js';

const PRODUCTS_CACHE_KEY = 'kcalculator_products_v5';
const LEGACY_PRODUCTS_CACHE_KEYS = ['kcalculator_products_v4', 'kcalculator_products_v3', 'kcalculator_products_v2', 'kcalculator_products_v1'];
const OFF_SEARCH_CACHE_KEY = 'kcalculator_off_search_v1';
const OFF_SEARCH_TTL_MS = 1000 * 60 * 60 * 12;
const PRODUCT_CHOICE_HISTORY_KEY = 'kcalculator_product_choice_history_v1';
const PRODUCT_CHOICE_MAX_PRODUCTS = 500;
const PRODUCT_CHOICE_MAX_TERMS_PER_PRODUCT = 24;
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

function getChoiceHistoryScope() {
  if (authUser?.id) return `user:${authUser.id}`;
  if (authUser?.email) return `email:${String(authUser.email).toLowerCase()}`;
  return 'guest';
}

function getProductChoiceKey(item) {
  return [
    normalizeSearchText(item?.n),
    normalizeSearchText(item?.b),
    normalizeSearchText(item?.src || 'unknown'),
  ].join('|');
}

function readProductChoiceHistory() {
  try {
    const raw = localStorage.getItem(PRODUCT_CHOICE_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeProductChoiceHistory(history) {
  try {
    localStorage.setItem(PRODUCT_CHOICE_HISTORY_KEY, JSON.stringify(history));
  } catch {}
}

function clampMapEntries(map, maxEntries, scoreFn) {
  const entries = Object.entries(map || {});
  if (entries.length <= maxEntries) return Object.fromEntries(entries);
  return Object.fromEntries(
    entries
      .sort((a, b) => scoreFn(b[1], b[0]) - scoreFn(a[1], a[0]))
      .slice(0, maxEntries)
  );
}

function getChoiceStatsForItem(item, query) {
  const history = readProductChoiceHistory();
  const scoped = history[getChoiceHistoryScope()] || {};
  const record = scoped[getProductChoiceKey(item)];
  if (!record) return null;
  const normalizedQuery = normalizeSearchText(query);
  const termCount = normalizedQuery ? Number(record.terms?.[normalizedQuery] || 0) : 0;
  return {
    totalCount: Number(record.totalCount || 0),
    termCount,
    lastSelectedAt: Number(record.lastSelectedAt || 0),
  };
}

function applyProductChoiceBoost(item, query) {
  const stats = getChoiceStatsForItem(item, query);
  if (!stats) return item;

  const ageMs = Math.max(0, Date.now() - stats.lastSelectedAt);
  const recencyDays = ageMs / (1000 * 60 * 60 * 24);
  const recencyBoost = stats.lastSelectedAt
    ? Math.max(0, 26 - Math.min(26, recencyDays * 2.2))
    : 0;
  const exactQueryBoost = Math.min(240, stats.termCount * 48);
  const totalBoost = Math.min(120, stats.totalCount * 12);
  const choiceBoost = exactQueryBoost + totalBoost + recencyBoost;

  return {
    ...item,
    _choiceStats: stats,
    _score: (item._score || 0) + choiceBoost,
  };
}

function applyChoiceRanking(results, query) {
  if (!Array.isArray(results) || !results.length) return results;
  return results
    .map(item => applyProductChoiceBoost(item, query))
    .sort((a, b) => {
      const scoreDiff = (b._score || 0) - (a._score || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return Number(b._choiceStats?.lastSelectedAt || 0) - Number(a._choiceStats?.lastSelectedAt || 0);
    });
}

export function recordProductSearchChoice(item, query) {
  if (!item?.n) return;

  const history = readProductChoiceHistory();
  const scope = getChoiceHistoryScope();
  const scoped = history[scope] && typeof history[scope] === 'object' ? history[scope] : {};
  const key = getProductChoiceKey(item);
  const normalizedQuery = normalizeSearchText(query);
  const current = scoped[key] && typeof scoped[key] === 'object'
    ? scoped[key]
    : { totalCount: 0, lastSelectedAt: 0, terms: {} };

  current.totalCount = Number(current.totalCount || 0) + 1;
  current.lastSelectedAt = Date.now();
  current.lastQuery = normalizedQuery || '';
  if (!current.terms || typeof current.terms !== 'object') current.terms = {};
  if (normalizedQuery) {
    current.terms[normalizedQuery] = Number(current.terms[normalizedQuery] || 0) + 1;
    current.terms = clampMapEntries(
      current.terms,
      PRODUCT_CHOICE_MAX_TERMS_PER_PRODUCT,
      value => Number(value || 0)
    );
  }

  scoped[key] = current;
  history[scope] = clampMapEntries(
    scoped,
    PRODUCT_CHOICE_MAX_PRODUCTS,
    value => Number(value?.lastSelectedAt || 0) + (Number(value?.totalCount || 0) * 1000)
  );
  writeProductChoiceHistory(history);
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

// Dutch plurals shorten the vowel and voice the last consonant: "bananen" ->
// stem "banan" -> "banaan", "kazen" -> "kaas", "bonen" -> "boon".
export function toLongVowelSearchTerm(stem) {
  let value = String(stem || '');
  if (value.length < 3) return value;
  if (value.endsWith('v')) value = value.slice(0, -1) + 'f';
  else if (value.endsWith('z')) value = value.slice(0, -1) + 's';
  return value.replace(/(^|[^aeiou])([aeou])([^aeiouy])$/, '$1$2$2$3');
}

// Dutch compounds are written both ways ("volkorenbrood" / "volkoren brood"); these heads
// are split off a single word so it also matches names like "Brood volkoren".
const COMPOUND_HEADS = [
  'brood', 'broodjes', 'melk', 'kaas', 'yoghurt', 'kwark', 'rijst', 'pasta', 'saus', 'soep',
  'olie', 'boter', 'worst', 'vlees', 'filet', 'koek', 'koekjes', 'taart', 'sap', 'thee', 'koffie',
];

export function compoundSearchVariants(words) {
  const variants = [];
  if (words.length >= 2 && words.length <= 3) variants.push(words.join(''));
  if (words.length === 1) {
    const [word] = words;
    for (const head of COMPOUND_HEADS) {
      if (word.length > head.length + 2 && word.endsWith(head)) {
        variants.push(`${word.slice(0, -head.length)} ${head}`);
        break;
      }
    }
  }
  return variants;
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
  for (const compound of compoundSearchVariants(words)) {
    if (!seen.has(compound)) {
      seen.add(compound);
      variants.push(compound);
    }
  }
  const longVowelWords = words.map((word, i) => (
    singularWords[i] !== word ? toLongVowelSearchTerm(singularWords[i]) : singularWords[i]
  ));
  const longVowelPhrase = longVowelWords.join(' ').trim();
  if (longVowelPhrase && !seen.has(longVowelPhrase)) {
    seen.add(longVowelPhrase);
    variants.push(longVowelPhrase);
  }
  for (const word of [...singularWords, ...longVowelWords]) {
    if (word && !seen.has(word)) {
      seen.add(word);
      variants.push(word);
    }
  }

  for (const variant of [...variants]) {
    // Expand only variants that stand for the whole query, not a single word of a longer one.
    if (variant.split(/\s+/).length < words.length) continue;
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
  return words.some(word => BREAD_PRIORITY_TERMS.includes(word) || word.endsWith('brood'));
}

function applyBreadPriority(results, query) {
  if (!isBreadPriorityQuery(query) || !Array.isArray(results) || !results.length) return results;

  // Only results that match the whole query compete (partial matches carry a -200 penalty).
  const candidates = results.filter(item => (item._score || 0) > -100);
  if (!candidates.length) return results;
  const topScore = Math.max(...candidates.map(item => item._score || 0));

  // Lift the generic breads (volkoren, bruin, wit, zuurdesem) to the top, in rule order;
  // as a score bonus so the later score sort keeps them there.
  const boosted = new Map();
  BREAD_PRIORITY_RULES.forEach((rule, i) => {
    const match = candidates.find(item => item?.n && !boosted.has(item) && rule.test(normalizeSearchText(item.n)));
    if (match) boosted.set(match, topScore + (BREAD_PRIORITY_RULES.length - i));
  });
  if (!boosted.size) return results;
  return results.map(item => (boosted.has(item) ? { ...item, _score: boosted.get(item) } : item));
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
  // Same kJ-in-kcal fix and plausibility flag as the bundled database.
  return applyEnergyCheck({
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
  });
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

// Version of public/products.json this build ships with (see vite.config.js).
const PRODUCTS_VERSION = typeof __PRODUCTS_VERSION__ === 'string' ? __PRODUCTS_VERSION__ : '';

function useProductData(data, label) {
  setNevoData(data);
  setNevoReady(true);
  setOffReady(true);
  console.log(`[DB] ${label}:`, data.items.length, 'producten', data.version || '');
}

export async function loadNevo() {
  for (const legacyKey of LEGACY_PRODUCTS_CACHE_KEYS) {
    try { localStorage.removeItem(legacyKey); } catch {}
  }

  let cached = null;
  try {
    const parsed = JSON.parse(localStorage.getItem(PRODUCTS_CACHE_KEY) || 'null');
    if (parsed?.items?.length > 5000) cached = parsed;
  } catch {}

  // Use the cached copy while it matches the version this build ships with.
  if (cached && (!PRODUCTS_VERSION || cached.version === PRODUCTS_VERSION)) {
    useProductData(cached, 'Geladen uit cache');
    return;
  }

  try {
    const r = await fetch('products.json', { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    useProductData(data, cached ? 'Bijgewerkt' : 'Geladen');
    try { localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(data)); } catch (e) { console.warn('[DB] Cache te groot:', e); }
  } catch (e) {
    // Offline or failed: an outdated copy beats no product database.
    if (cached) useProductData(cached, 'Verouderde cache gebruikt');
    else console.error('[DB] Kon niet laden:', e);
  }
}

export function searchNevo(query, limit = 8) {
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
  // In a multi-word query, a variant that covers only some of the words (e.g. just "brood"
  // for "volkoren brood") ranks after every result that matches the whole query.
  const compoundQuery = primaryTerms.join('');
  const partialPenalty = (variant, terms) => (
    primaryTerms.length > 1 && terms.length < primaryTerms.length && variant !== compoundQuery ? 200 : 0
  );

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
      score -= partialPenalty(variant, terms);
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
        score -= partialPenalty(variant, terms);
        score -= item.n.length * 0.04;
        bestScore = Math.max(bestScore, score);
      }

      if (bestScore === -Infinity) continue;
      const group = item.g !== undefined ? nevoData.groups[item.g] : (item.b || 'Open Food Facts');
      pushResult(item, bestScore, { _group: group });
    }
  }

  const ranked = applyChoiceRanking(
    applyEggPriority(applyBreadPriority(results, query), query),
    query
  );
  return ranked.slice(0, limit);
}

export async function searchNevoHybrid(query, limit = 12) {
  const localResults = searchNevo(query, Math.max(limit, 12));
  if (cfg.openFoodFactsLiveSearch === false) return localResults.slice(0, limit);
  if (String(query || '').trim().length < 3) return localResults.slice(0, limit);

  const normalizedQuery = String(query || '').toLowerCase().trim();
  const terms = normalizedQuery.split(/\s+/).filter(t => t.length >= 2);
  if (!terms.length) return localResults.slice(0, limit);

  // Live products whose name holds the search words come before ones that only match on
  // brand (e.g. fish from the brand "Appel" when searching "appel").
  const nameMatches = item => terms.every(t => normalizeSearchText(item.n).includes(normalizeSearchText(t)));
  const liveRanked = applyChoiceRanking(await searchOffLive(query, terms, limit * 2), query);
  const liveOff = [...liveRanked.filter(nameMatches), ...liveRanked.filter(item => !nameMatches(item))];
  if (!liveOff.length) return localResults.slice(0, limit);

  const reservedLiveCount = Math.min(4, Math.max(3, Math.floor(limit / 3)));
  const localPrimaryCount = Math.max(4, limit - reservedLiveCount);
  const primaryLocal = localResults.slice(0, localPrimaryCount);
  const overflowLocal = localResults.slice(localPrimaryCount);
  // A local result whose name starts with a one-word query scores roughly 45+. For longer
  // queries every result that holds all words counts (partial matches sit far below 0).
  // With too few of those, live results go first.
  const strongScore = terms.length > 1 ? 0 : 40;
  const strongLocalCount = primaryLocal.filter(item => Number(item?._score || 0) >= strongScore).length;
  const prioritizeLive = localResults.length <= reservedLiveCount || strongLocalCount <= 2;
  const mergeOrder = prioritizeLive
    ? [...liveOff, ...primaryLocal, ...overflowLocal]
    : [...primaryLocal, ...liveOff, ...overflowLocal];

  const seen = new Set();
  const merged = [];
  for (const item of mergeOrder) {
    const key = `${String(item.n || '').toLowerCase()}|${String(item.b || '').toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= limit) break;
  }
  return merged;
}
