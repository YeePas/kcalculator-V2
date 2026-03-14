/* ── Match Review Modal Actions ───────────────────────────── */

import { localData, currentDate, selMeal, cfg, matchState } from '../state.js';
import { MEAL_NAMES } from '../constants.js';
import { emptyDay } from '../utils.js';
import { loadFavs, saveFavs } from '../storage.js';
import { saveDay } from '../supabase/data.js';
import { syncFavoritesToSupabase } from '../supabase/sync.js';
import { buildMealItem } from '../products/matcher.js';
import { parseFood } from '../ai/parser.js';
import { _renderDayUI } from '../ui/render.js';
import { renderQuickFavs } from '../ui/misc.js';
import { closeMatchModal, renderMatchList, addMatchedItemsToDay } from './match-core.js';

export async function aiLookupMatch(idx) {
  const ms = matchState[idx];
  const statusEl = document.getElementById(`match-ai-status-${idx}`);
  if (!statusEl) return;

  if (!cfg.claudeKey && !cfg.keys?.[cfg.provider]) {
    statusEl.textContent = '⚠️ Geen API key ingesteld — ga naar ⚙️ Instellingen';
    statusEl.style.color = 'var(--danger)';
    return;
  }

  statusEl.textContent = '🔍 AI zoekt…';
  statusEl.style.color = '';

  try {
    const items = await parseFood(ms.parsed.original, selMeal);
    if (items && items.length > 0) {
      const item = items[0];
      ms.nevoMatch = {
        n: item.naam,
        k: item.kcal || 0,
        kh: item.koolhydraten_g || 0,
        vz: item.vezels_g || 0,
        v: item.vetten_g || 0,
        e: item.eiwitten_g || 0,
        _aiResult: true,
      };
      ms.gram = 100;
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
      items.push(buildMealItem(ms.parsed.foodName, src, ms.gram, isDrink));
    } else if (ms.nevoMatch) {
      items.push(buildMealItem(ms.nevoMatch.n, ms.nevoMatch, ms.gram, isDrink));
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
