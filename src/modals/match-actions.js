/* ── Match Review Modal Actions ───────────────────────────── */

import { localData, currentDate, selMeal, matchState } from '../state.js';
import { MEAL_NAMES } from '../constants.js';
import { emptyDay } from '../utils.js';
import { loadFavs, saveFavs } from '../storage.js';
import { saveDay } from '../supabase/data.js';
import { syncFavoritesToSupabase } from '../supabase/sync.js';
import { buildMealItem } from '../products/matcher.js';
import { isLiquidLike } from '../products/density.js';
import { findPortie, parseQuantity } from '../products/portions.js';
import { parseFood } from '../ai/parser.js';
import { hasAiProxyConfig } from '../ai/providers.js';
import { _renderDayUI } from '../ui/render.js';
import { renderQuickFavs } from '../ui/misc.js';
import { closeMatchModal, renderMatchList, addMatchedItemsToDay } from './match-core.js';

function round1(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

function normalizePortionType(value) {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .trim();
  if (!normalized) return '';
  if (normalized.endsWith('en')) return normalized.slice(0, -2);
  if (normalized.endsWith('s')) return normalized.slice(0, -1);
  return normalized;
}

function parseExplicitPortionAmount(portionText) {
  const match = String(portionText || '').match(/(\d+(?:[.,]\d+)?)\s*(kg|gram|gr|g|ml|cl|dl|l)\b/i);
  if (!match) return null;
  const count = parseFloat(match[1].replace(',', '.'));
  if (!Number.isFinite(count) || count <= 0) return null;
  const unit = String(match[2] || '').toLowerCase();
  if (unit === 'kg') return Math.round(count * 1000);
  if (unit === 'l') return Math.round(count * 1000);
  if (unit === 'dl') return Math.round(count * 100);
  if (unit === 'cl') return Math.round(count * 10);
  return Math.round(count);
}

export function deriveAiSuggestedPortion(item, meal) {
  const explicitAmount = parseExplicitPortionAmount(item?.portie);
  if (explicitAmount) return explicitAmount;

  const explicitMl = Number(item?.ml || 0);
  if (Number.isFinite(explicitMl) && explicitMl > 0) return Math.round(explicitMl);

  const portionText = String(item?.portie || '').trim();
  if (portionText) {
    const parsed = parseQuantity(portionText);
    const count = Number.isFinite(parsed?.count) && parsed.count > 0 ? parsed.count : 1;
    const normalizedUnit = normalizePortionType(parsed?.unit || portionText);
    const options = findPortie(item?.naam || '', undefined, undefined);
    const matchedOption = options.find(option => normalizePortionType(option.t) === normalizedUnit)
      || (/\bportie\b/i.test(portionText) ? options.find(option => normalizePortionType(option.t) === 'portie') : null)
      || (/^half|halve\b/i.test(portionText) ? options.find(option => normalizePortionType(option.t) === 'half') : null);
    if (matchedOption?.g) return Math.max(1, Math.round(matchedOption.g * count));
  }

  const fallback = findPortie(item?.naam || '', undefined, undefined);
  const preferred = fallback.find(option => option.t === 'portie')
    || fallback.find(option => option.t === 'stuk')
    || fallback[0];
  if (preferred?.g) return Math.max(1, Math.round(preferred.g));

  return meal === 'drinken' ? 250 : 100;
}

export async function aiLookupMatch(idx) {
  const ms = matchState[idx];
  const statusEl = document.getElementById(`match-ai-status-${idx}`);
  if (!statusEl) return;

  if (!hasAiProxyConfig()) {
    statusEl.textContent = '⚠️ AI-proxy niet beschikbaar — koppel eerst Supabase';
    statusEl.style.color = 'var(--danger)';
    return;
  }

  statusEl.textContent = '🔍 AI zoekt…';
  statusEl.style.color = '';

  try {
    const items = await parseFood(ms.parsed.original, selMeal);
    if (items && items.length > 0) {
      const item = items[0];
      const suggestedPortion = deriveAiSuggestedPortion(item, selMeal);
      const factor = Math.max(suggestedPortion, 1) / 100;
      ms.nevoMatch = {
        n: item.naam,
        k: round1((item.kcal || 0) / factor),
        kh: round1((item.koolhydraten_g || 0) / factor),
        vz: round1((item.vezels_g || 0) / factor),
        v: round1((item.vetten_g || 0) / factor),
        e: round1((item.eiwitten_g || 0) / factor),
        _aiResult: true,
        _aiPortion: item.portie || '',
      };
      ms.gram = suggestedPortion;
      ms.manualMode = false;
      renderMatchList();
    } else {
      statusEl.textContent = '✗ Geen resultaat — probeer handmatig';
      statusEl.style.color = 'var(--danger)';
    }
  } catch (e) {
    statusEl.textContent = '✗ ' + e.message;
    statusEl.style.color = 'var(--danger)';
  }
}

export function buildItemsFromMatchState(isDrink) {
  const items = [];
  for (let i = 0; i < matchState.length; i++) {
    const ms = matchState[i];
    if (ms.manualMode) {
      const src = {
        k: parseFloat(document.getElementById('mm-kcal-' + i)?.value) || 0,
        kh: parseFloat(document.getElementById('mm-kh-' + i)?.value) || 0,
        vz: parseFloat(document.getElementById('mm-vz-' + i)?.value) || 0,
        v: parseFloat(document.getElementById('mm-v-' + i)?.value) || 0,
        e: parseFloat(document.getElementById('mm-e-' + i)?.value) || 0,
      };
      items.push(buildMealItem(ms.parsed.foodName, src, ms.gram, isLiquidLike(ms.parsed.foodName, isDrink)));
    } else if (ms.nevoMatch) {
      items.push(buildMealItem(ms.nevoMatch.n, ms.nevoMatch, ms.gram, isLiquidLike(ms.nevoMatch.n, isDrink)));
    }
  }
  return items;
}

export function initMatchModalListeners() {
  document.getElementById('match-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('match-modal')) closeMatchModal();
  });

  document.getElementById('match-confirm-btn').addEventListener('click', () => {
    const builtItems = buildItemsFromMatchState(selMeal === 'drinken');
    addMatchedItemsToDay(builtItems, selMeal);
  });

  document.getElementById('match-fav-all-btn')?.addEventListener('click', () => {
    const subItems = buildItemsFromMatchState(false);
    if (subItems.length === 0) return;

    const favs = loadFavs();
    if (subItems.length >= 2) {
      const naam = prompt('Naam voor dit gerecht:', subItems.map(s => s.naam).join(', ').substring(0, 50));
      if (!naam) return;

      const totals = { kcal: 0, koolhydraten_g: 0, vezels_g: 0, vetten_g: 0, eiwitten_g: 0, ml: 0 };
      for (const si of subItems) {
        totals.kcal += si.kcal;
        totals.koolhydraten_g += si.koolhydraten_g;
        totals.vezels_g += si.vezels_g;
        totals.vetten_g += si.vetten_g;
        totals.eiwitten_g += si.eiwitten_g;
      }
      favs.push({ naam, tekst: subItems.map(s => s.naam).join(', '), maaltijd: selMeal, isRecipe: true, items: subItems, item: { naam, portie: `${subItems.length} ingrediënten`, ...totals } });
    } else {
      const si = subItems[0];
      favs.push({ naam: si.naam, tekst: `${si.naam} (${si.portie})`, maaltijd: selMeal, item: si });
    }

    saveFavs(favs);
    syncFavoritesToSupabase();
    const btn = document.getElementById('match-fav-all-btn');
    btn.textContent = `✓ Opgeslagen als ${subItems.length >= 2 ? 'gerecht' : 'favoriet'}`;
    btn.disabled = true;
    renderQuickFavs();
  });

  document.getElementById('match-add-and-save-btn').addEventListener('click', () => {
    const subItems = buildItemsFromMatchState(false);
    if (!subItems.length) return;

    let recipeName = null;
    let groupId = null;
    if (subItems.length >= 2) {
      const dn = subItems.map(s => s.naam).join(', ');
      recipeName = prompt('Naam voor dit gerecht:', dn.length > 50 ? dn.substring(0, 47) + '...' : dn);
      if (recipeName) groupId = recipeName + '_' + Date.now();
    }

    const day = localData[currentDate] || emptyDay();
    MEAL_NAMES.forEach(m => { if (!day[m]) day[m] = []; });
    for (const si of subItems) {
      const added = { ...si };
      if (groupId) {
        added._recipeGroup = groupId;
        added._recipeName = recipeName;
      }
      day[selMeal].push(added);
    }

    localData[currentDate] = day;
    saveDay(currentDate, day);
    closeMatchModal();
    document.getElementById('food-input').value = '';
    _renderDayUI(day);

    if (recipeName && subItems.length >= 2) {
      const totals = { kcal: 0, koolhydraten_g: 0, vezels_g: 0, vetten_g: 0, eiwitten_g: 0, ml: 0 };
      for (const si of subItems) {
        totals.kcal += si.kcal;
        totals.koolhydraten_g += si.koolhydraten_g;
        totals.vezels_g += si.vezels_g;
        totals.vetten_g += si.vetten_g;
        totals.eiwitten_g += si.eiwitten_g;
      }
      const favs = loadFavs();
      favs.push({ naam: recipeName, tekst: subItems.map(s => s.naam).join(', '), maaltijd: selMeal, isRecipe: true, items: subItems, item: { naam: recipeName, portie: subItems.length + ' ingredienten', ...totals } });
      saveFavs(favs);
      syncFavoritesToSupabase();
      renderQuickFavs();
      document.getElementById('status').textContent = subItems.length + ' items toegevoegd + gerecht opgeslagen';
    } else {
      document.getElementById('status').textContent = subItems.length + ' item(s) toegevoegd';
    }
    document.getElementById('status').className = 'status-msg';
  });
}
