/* ── Autocomplete UI ──────────────────────────────────────── */

import { selMeal, acSelectedItem, acSelectedIdx, acResults, setAcSelectedItem, setAcSelectedIdx, setAcResults } from '../state.js';
import { MEAL_NAMES } from '../constants.js';
import { esc, highlightMatches, emptyDay } from '../utils.js';
import { searchNevo, searchNevoHybrid, recordProductSearchChoice } from '../products/database.js';
import { findPortie } from '../products/portions.js';
import { buildMealItem } from '../products/matcher.js';
import { isLiquidLike } from '../products/density.js';
import { buildBugReportButton } from './bug-report.js';
import { localData, currentDate, cfg } from '../state.js';
import { loadCustomProducts, saveCustomProducts, loadFavs, saveFavs } from '../storage.js';
import { syncCustomProductsToSupabase, syncFavoritesToSupabase } from '../supabase/sync.js';
import { saveDay } from '../supabase/data.js';
import { _renderDayUI } from './render.js';

function getFavouriteSearchResults(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);

  return loadFavs()
    .map((fav, idx) => {
      const item = fav.item || {};
      const isRecipe = Boolean(fav.isRecipe && fav.items && fav.items.length);
      const naam = String(fav.naam || item.naam || fav.tekst || '').trim();
      const haystack = [naam, fav.tekst || '', item.naam || ''].join(' ').toLowerCase();
      if (!naam || !terms.every(term => haystack.includes(term))) return null;
      return {
        n: naam,
        k: Number(item.kcal || 0),
        kh: Number(item.koolhydraten_g || 0),
        vz: Number(item.vezels_g || 0),
        v: Number(item.vetten_g || 0),
        e: Number(item.eiwitten_g || 0),
        b: '',
        _group: isRecipe ? 'Favoriet gerecht' : 'Favoriet',
        _favorite: true,
        _favoriteRecipe: isRecipe,
        _favIdx: idx,
        _score: 80 + (Number(fav.uses) || 0),
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b._score || 0) - (a._score || 0));
}

function mergeAutocompleteResults(primary, extra, limit = 8) {
  const merged = [];
  const seen = new Set();
  for (const item of [...primary, ...extra]) {
    const key = String(item?.n || '').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= limit) break;
  }
  return merged;
}

export function renderAcDropdown(results, query, isLoading = false) {
  const dd = document.getElementById('ac-dropdown');
  setAcResults(results);
  setAcSelectedIdx(-1);
  setAcSelectedItem(null);

  const terms = query.toLowerCase().trim().split(/\s+/);
  const loadingRow = isLoading
    ? '<div class="ac-loading-row"><span class="ac-loading-spinner" aria-hidden="true"></span><span>Zoeken in OpenFoodFacts.org…</span></div>'
    : '';

  const safeQuery = encodeURIComponent(query);
  const manualBtn = `<button class="ac-manual-btn" onmousedown="openSmartImportPage(decodeURIComponent('${safeQuery}'))">➕ Eigen product toevoegen… (BETA)</button>`;

  if (!results.length) {
    dd.innerHTML = `
      <div class="ac-hint"><span class="ac-hint-badge">Database + OpenFoodFacts.org</span> Geen resultaten — druk Enter voor AI-analyse</div>
      ${loadingRow}
      ${manualBtn}
    `;
    dd.classList.add('open');
    return;
  }

  dd.innerHTML = `
    <div class="ac-hint"><span class="ac-hint-badge">Database + OpenFoodFacts.org</span> Selecteer product of druk Enter voor AI-analyse</div>
    ${results.map((r, i) => `
      <div class="ac-item" data-idx="${i}" onmousedown="selectAcItem(${i})">
        <div style="min-width:0;flex:1">
          <div class="ac-item-name">${highlightMatches(r.n, terms)}${r._custom ? ' <span style="font-size:0.65rem;color:var(--accent)">eigen</span>' : ''}${r._favorite ? ` <span style="font-size:0.65rem;color:${r._favoriteRecipe ? 'var(--green)' : 'var(--accent)'}">${r._favoriteRecipe ? 'gerecht' : 'favoriet'}</span>` : ''}${r.src === 'off-api' ? ' <span style="font-size:0.65rem;color:var(--green)">live</span>' : ''}</div>
          <div class="ac-item-group">${esc(r._group || '')}</div>
        </div>
        <div class="ac-item-macros">
          <span class="ac-item-kcal">${r.k} kcal</span>
          <span>E${r.e}g</span>
          <span>V${r.v}g</span>
          <span>K${r.kh}g</span>
        </div>
      </div>
    `).join('')}
    ${loadingRow}
    ${manualBtn}
  `;
  dd.classList.add('open');
}

export function selectAcItem(idx) {
  const item = acResults[idx];
  if (!item) return;
  const query = document.getElementById('food-input')?.value?.trim() || item.n || '';
  if (!item._favorite) recordProductSearchChoice(item, query);
  setAcSelectedItem(item);
  if (item._favorite) {
    const dd = document.getElementById('ac-dropdown');
    dd.innerHTML = `
      <div class="ac-hint"><span class="ac-hint-badge">${item._favoriteRecipe ? 'Favoriet gerecht' : 'Favoriet'}</span> ${esc(item.n)}</div>
      <div style="padding:0.3rem 0.9rem;font-size:0.72rem;color:var(--muted)">
        ${item.k} kcal · ${item.kh}g koolh · ${item.vz}g vezel · ${item.v}g vet · ${item.e}g eiwit
      </div>
      <div class="ac-portie-quicks">
        <button class="ac-portie-quick" onclick="addNevoItem()">Toevoegen aan ${esc(selMeal)}</button>
      </div>
    `;
    dd.classList.add('open');
    return;
  }
  const useMl = isLiquidLike(item.n, selMeal === 'drinken');

  const dd = document.getElementById('ac-dropdown');
  const porties = findPortie(item.n, item.g, item.sg);
  const badge = item._custom ? 'Eigen' : (item.b ? item.b : 'Database');
  const defaultGram = porties[0]?.g || 100;
  const bugBtn = buildBugReportButton('autocomplete-product', {
    product: item.n,
    group: item._group || null,
    brand: item.b || null,
    meal: selMeal,
    suggestedAmount: defaultGram,
    portions: porties.slice(0, 6),
  });
  const importBtn = item.src === 'off-api'
    ? '<button class="ac-portie-quick" onclick="importAcItemToCustom()">💾 Opslaan in eigen producten</button>'
    : '';

  let portieButtons = '';
  for (const p of porties) {
    const label = p.l || p.t;
    const encodedLabel = encodeURIComponent(label);
    if (p.t === 'gram' || p.t === 'ml') {
      const unitLabel = useMl || p.t === 'ml' ? 'ml' : 'g';
      portieButtons += `<button class="ac-portie-quick" onclick="setPortie(${p.g},decodeURIComponent('${encodeURIComponent(`${p.g}${unitLabel}`)}'))">${p.g}${unitLabel}</button>`;
    } else {
      const amountLabel = `${p.g}${useMl ? 'ml' : 'g'}`;
      portieButtons += `<button class="ac-portie-quick" onclick="setPortie(${p.g},decodeURIComponent('${encodedLabel}'))">${esc(label)} (${amountLabel})</button>`;
      if (['stuk', 'snee', 'plak', 'ei'].includes(p.t)) {
        const doubleLabel = encodeURIComponent(`2x ${label}`);
        portieButtons += `<button class="ac-portie-quick" onclick="setPortie(${p.g * 2},decodeURIComponent('${doubleLabel}'))">2x (${p.g * 2}${useMl ? 'ml' : 'g'})</button>`;
      }
    }
  }

  dd.innerHTML = `
    <div class="ac-hint"><span class="ac-hint-badge">${esc(badge)}</span> ${esc(item.n)} ${bugBtn}</div>
    <div class="ac-portie-quicks">${portieButtons}</div>
    ${importBtn ? `<div class="ac-portie-quicks" style="padding-top:0">${importBtn}</div>` : ''}
    <div class="ac-portie-manual">
      <input type="number" inputmode="numeric" pattern="[0-9]*" class="ac-portie-input" id="ac-portie-gram" value="${defaultGram}" min="1" step="10" onkeydown="if(event.key==='Enter'){event.preventDefault();addNevoItem();}">
      <span class="ac-portie-unit">${useMl ? 'ml' : 'gram'}</span>
      <button class="ac-portie-add" onclick="addNevoItem()">+</button>
    </div>
    <div style="padding:0.3rem 0.9rem;font-size:0.72rem;color:var(--muted)">
      <strong>Per 100g:</strong> ${item.k} kcal · ${item.kh}g koolh · ${item.vz}g vezel · ${item.v}g vet · ${item.e}g eiwit
    </div>
  `;
  dd.classList.add('open');
  setTimeout(() => {
    const inp = document.getElementById('ac-portie-gram');
    if (!inp) return;
    // On desktop: focus + select for quick editing
    // On mobile (touch): don't auto-focus to avoid keyboard jumping up unexpectedly;
    // the user can tap the field to open the numeric keyboard
    if (window.matchMedia('(hover: hover)').matches) {
      inp.focus();
      inp.select();
    }
  }, 50);
}

export function setPortie(gram, label) {
  document.getElementById('ac-portie-gram').value = gram;
  addNevoItem(label);
}

export function addNevoItem(portieLabel) {
  if (!acSelectedItem) return;

  if (acSelectedItem._favorite) {
    const favs = loadFavs();
    const fav = favs[acSelectedItem._favIdx];
    if (!fav) return;

    fav.uses = Number(fav.uses || 0) + 1;
    if (!fav.createdAt) fav.createdAt = Date.now();
    saveFavs(favs);
    syncFavoritesToSupabase();

    const day = localData[currentDate] || emptyDay();
    MEAL_NAMES.forEach(m => { if (!day[m]) day[m] = []; });

    if (fav.isRecipe && fav.items && fav.items.length > 0) {
      const groupId = fav.naam + '_' + Date.now();
      for (const subItem of fav.items) {
        day[selMeal].push({ ...subItem, _recipeGroup: groupId, _recipeName: fav.naam });
      }
      document.getElementById('status').textContent = `✓ ${fav.naam} (${fav.items.length} items) toegevoegd`;
    } else if (fav.item) {
      day[selMeal].push({ ...fav.item });
      document.getElementById('status').textContent = `✓ ${fav.naam} toegevoegd`;
    } else {
      document.getElementById('food-input').value = fav.tekst || fav.naam || '';
      closeAcDropdown();
      return;
    }

    document.getElementById('status').className = 'status-msg';
    localData[currentDate] = day;
    saveDay(currentDate, day);
    document.getElementById('food-input').value = '';
    closeAcDropdown();
    _renderDayUI(day);
    return;
  }

  const gramInput = document.getElementById('ac-portie-gram');
  const gram = parseFloat(gramInput?.value) || 100;

  const useMl = isLiquidLike(acSelectedItem.n, selMeal === 'drinken');
  const item = buildMealItem(acSelectedItem.n, acSelectedItem, gram, useMl);
  item.portie = portieLabel || (gram === 100 ? (useMl ? '100ml' : '100g') : `${gram}${useMl ? 'ml' : 'g'}`);
  item._gram = gram;

  const day = localData[currentDate] || emptyDay();
  MEAL_NAMES.forEach(m => { if (!day[m]) day[m] = []; });
  day[selMeal].push(item);
  localData[currentDate] = day;
  saveDay(currentDate, day);

  document.getElementById('food-input').value = '';
  closeAcDropdown();

  document.getElementById('status').textContent = `✓ ${item.naam} (${item.portie}) toegevoegd`;
  document.getElementById('status').className = 'status-msg';
  _renderDayUI(day);
}

export function importAcItemToCustom() {
  if (!acSelectedItem || acSelectedItem.src !== 'off-api') return;
  const name = String(acSelectedItem.n || '').trim();
  if (!name) return;

  const custom = loadCustomProducts();
  const existing = custom.find(p => String(p.n || '').toLowerCase() === name.toLowerCase());
  if (existing) {
    const status = document.getElementById('status');
    if (status) {
      status.textContent = `ℹ️ "${name}" staat al bij je eigen producten`;
      status.className = 'status-msg';
    }
    return;
  }

  const newCustom = {
    n: name,
    k: Number(acSelectedItem.k || 0),
    kh: Number(acSelectedItem.kh || 0),
    v: Number(acSelectedItem.v || 0),
    vz: Number(acSelectedItem.vz || 0),
    e: Number(acSelectedItem.e || 0),
    p: acSelectedItem.s || '100g',
  };
  custom.push(newCustom);
  saveCustomProducts(custom);
  syncCustomProductsToSupabase(true);

  const status = document.getElementById('status');
  if (status) {
    status.textContent = `💾 "${name}" opgeslagen bij eigen producten`;
    status.className = 'status-msg';
  }
}

export function closeAcDropdown() {
  document.getElementById('ac-dropdown').classList.remove('open');
  setAcResults([]);
  setAcSelectedIdx(-1);
  setAcSelectedItem(null);
}

export function initAutocomplete() {
  const input = document.getElementById('food-input');
  let acTimeout = null;
  let searchSeq = 0;

  input.addEventListener('input', () => {
    clearTimeout(acTimeout);
    const val = input.value.trim();
    if (val.length < 2) { closeAcDropdown(); return; }

    const shouldSearchLive = val.length >= 3 && cfg.openFoodFactsLiveSearch !== false;

    // Show local results immediately to keep typing responsive.
    const localResults = mergeAutocompleteResults(searchNevo(val), getFavouriteSearchResults(val));
    if (localResults.length > 0) {
      renderAcDropdown(localResults, val, shouldSearchLive);
    } else if (val.length >= 3) {
      renderAcDropdown([], val, shouldSearchLive);
    } else {
      closeAcDropdown();
    }

    const seq = ++searchSeq;
    if (!shouldSearchLive) return;

    acTimeout = setTimeout(async () => {
      const results = mergeAutocompleteResults(
        await searchNevoHybrid(val, 8),
        getFavouriteSearchResults(val),
      );
      if (seq !== searchSeq) return;
      if (input.value.trim() !== val) return;
      if (results.length > 0) {
        renderAcDropdown(results, val);
      } else if (val.length >= 3) {
        renderAcDropdown([], val);
      } else {
        closeAcDropdown();
      }
    }, 150);
  });

  input.addEventListener('keydown', (e) => {
    const dd = document.getElementById('ac-dropdown');
    if (!dd.classList.contains('open')) return;

    if (acSelectedItem && e.key === 'Enter') return;

    const items = dd.querySelectorAll('.ac-item');
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIdx = Math.min(acSelectedIdx + 1, items.length - 1);
      setAcSelectedIdx(nextIdx);
      items.forEach((it, i) => it.classList.toggle('selected', i === nextIdx));
      items[nextIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const nextIdx = Math.max(acSelectedIdx - 1, -1);
      setAcSelectedIdx(nextIdx);
      items.forEach((it, i) => it.classList.toggle('selected', i === nextIdx));
      if (nextIdx >= 0) items[nextIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && acSelectedIdx >= 0) {
      e.preventDefault();
      selectAcItem(acSelectedIdx);
    } else if (e.key === 'Escape') {
      closeAcDropdown();
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.input-with-ac')) {
      closeAcDropdown();
    }
  });
}
