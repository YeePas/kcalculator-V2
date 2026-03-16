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

export function clearProductCache() {
  try { localStorage.removeItem(PRODUCTS_CACHE_KEY); } catch {}
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
      if (!shouldIncludeProductForSupermarketFilters(item, cfg.supermarketFilters)) continue;
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
