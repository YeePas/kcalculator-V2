/* ── Favourites Modal ─────────────────────────────────────── */

import {
  localData, currentDate, selMeal, authUser, cfg,
  recipeSelectionMeal, recipeSelectionIndices,
  setRecipeSelectionMeal, setRecipeSelectionIndices,
} from '../state.js';
import { MEAL_NAMES, MEAL_LABELS } from '../constants.js';
import { emptyDay, esc, r1 } from '../utils.js';
import { loadFavs, saveFavs } from '../storage.js';
import { saveDay } from '../supabase/data.js';
import { syncFavoritesToSupabase } from '../supabase/sync.js';
import { _renderDayUI } from '../ui/render.js';
import { renderQuickFavs } from '../ui/misc.js';
import { searchNevo } from '../products/database.js';
import { buildMealItem } from '../products/matcher.js';
import { ICON_EDIT, ICON_DELETE, ICON_CLOSE } from '../ui/icons.js';
import { parseIngredientAmount, nutritionPerUnit, scaleIngredient, sumIngredients } from './recipe-amounts.js';
import { submit } from '../input/submit.js';
import { openSmartImportPage } from '../pages/smart-import.js';

function rerenderCurrentDay() {
  _renderDayUI(localData[currentDate] || emptyDay());
}

export function startMealRecipeSelection(meal) {
  const day = localData[currentDate] || emptyDay();
  const items = day[meal] || [];
  if (items.length < 2) return;
  setRecipeSelectionMeal(meal);
  setRecipeSelectionIndices(items.map((_, idx) => idx));
  rerenderCurrentDay();
}

export function cancelMealRecipeSelection() {
  if (!recipeSelectionMeal) return;
  setRecipeSelectionMeal(null);
  setRecipeSelectionIndices([]);
  rerenderCurrentDay();
}

export function toggleMealRecipeSelection(meal, idx) {
  const day = localData[currentDate] || emptyDay();
  const items = day[meal] || [];
  if (!items[idx]) return;

  const next = recipeSelectionMeal === meal ? [...recipeSelectionIndices] : [];
  const existingIdx = next.indexOf(idx);
  if (existingIdx >= 0) next.splice(existingIdx, 1);
  else next.push(idx);

  setRecipeSelectionMeal(meal);
  setRecipeSelectionIndices(next.sort((a, b) => a - b));
  rerenderCurrentDay();
}

export function openFavModal() {
  document.getElementById('fav-modal').classList.add('open');
  renderFavList();
}

export function renderFavList() {
  const favs = loadFavs();
  const el = document.getElementById('fav-list');
  if (!favs.length) {
    el.innerHTML = '<div class="fav-empty">Nog geen favorieten.<br>Voeg er een toe via het formulier hieronder, of sla een maaltijd op met 🍽️.</div>';
    return;
  }
  el.innerHTML = favs.map((f, i) => {
    const item = f.item;
    const naam = f.naam || (item && item.naam) || f.tekst || '?';
    const isRecipe = f.isRecipe && f.items && f.items.length > 1;
    const macros = item
      ? `<div style="font-size:0.7rem;color:var(--tertiary);margin-top:0.15rem">${item.kcal || 0} kcal · ${item.koolhydraten_g || 0}g kh · ${item.vetten_g || 0}g vet · ${item.eiwitten_g || 0}g eiwit${item.portie && !isRecipe ? ' · ' + esc(item.portie) : ''}</div>`
      : '';
    const badge = isRecipe ? `<span class="fav-recipe-badge">🍽️ ${f.items.length} items</span>` : '';
    const expandBtn = isRecipe
      ? `<button class="fav-expand-btn" id="fav-expand-${i}" data-action="expand" data-idx="${i}">▸ Ingrediënten tonen</button>`
      : '';
    const subItems = isRecipe
      ? `<div class="fav-subitems" id="fav-subitems-${i}" style="display:none">${f.items.map(si =>
          `<div class="fav-subitem">
            <span class="fav-subitem-name">${esc(si.naam || '?')}${si.portie ? ' (' + esc(si.portie) + ')' : ''}</span>
            <span class="fav-subitem-macros">${si.kcal || 0} kcal</span>
          </div>`
        ).join('')}</div>`
      : '';

    return `<div class="fav-item" style="flex-wrap:wrap" data-action="add" data-idx="${i}">
      <div style="flex:1;min-width:0"><div class="fav-item-name">${esc(naam)}${badge}</div>${macros}${expandBtn}</div>
      <div style="display:flex;gap:0.2rem;align-items:center;flex-shrink:0">
        <button class="icon-action fav-item-edit" data-action="edit" data-idx="${i}" title="Bewerken" aria-label="Bewerken">${ICON_EDIT}</button>
        <button class="icon-action is-danger fav-item-del" data-action="delete" data-idx="${i}" title="Verwijderen" aria-label="Verwijderen">${ICON_DELETE}</button>
      </div>
      ${subItems}
    </div>`;
  }).join('');
}

export function saveFavorite() {
  const tekst = document.getElementById('food-input').value.trim();
  if (!tekst) { document.getElementById('status').textContent = 'Typ eerst iets in het invoerveld.'; return; }
  const naam = prompt('Naam voor dit favoriet:', tekst.slice(0, 50));
  if (!naam) return;
  const favs = loadFavs();
  favs.push({ naam, tekst, maaltijd: selMeal, uses: 0, createdAt: Date.now() });
  saveFavs(favs);
  syncFavoritesToSupabase();
  renderQuickFavs();
  document.getElementById('status').textContent = '⭐ Opgeslagen als favoriet!';
}

export function saveItemAsFavorite(meal, idx) {
  const item = (localData[currentDate] || emptyDay())[meal]?.[idx];
  if (!item) return;
  const naam = prompt('Naam voor dit favoriet:', item.naam);
  if (!naam) return;
  const tekst = item.naam + (item.portie ? ' (' + item.portie + ')' : '');
  const favs = loadFavs();
  favs.push({ naam, tekst, maaltijd: meal, item: { ...item }, uses: 0, createdAt: Date.now() });
  saveFavs(favs);
  syncFavoritesToSupabase();
  renderQuickFavs();
  document.getElementById('status').textContent = `⭐ "${naam}" opgeslagen als favoriet!`;
}

export function deleteFav(idx) {
  const favs = loadFavs();
  favs.splice(idx, 1);
  saveFavs(favs);
  syncFavoritesToSupabase();
  renderFavList();
  renderQuickFavs();
}

export function saveMealAsRecipe(meal) {
  const day = localData[currentDate] || emptyDay();
  const items = day[meal] || [];
  const selectedItems = recipeSelectionMeal === meal
    ? recipeSelectionIndices.map(idx => items[idx]).filter(Boolean)
    : items;
  if (selectedItems.length < 2) {
    document.getElementById('status').textContent = 'Selecteer minimaal 2 items om als gerecht op te slaan.';
    document.getElementById('status').className = 'status-msg error';
    return;
  }

  const defaultName = MEAL_LABELS[meal] + ' ' + new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  const naam = prompt('Naam voor dit gerecht:', defaultName);
  if (!naam) return;

  const totals = { kcal: 0, koolhydraten_g: 0, vezels_g: 0, vetten_g: 0, eiwitten_g: 0, ml: 0 };
  for (const it of selectedItems) {
    totals.kcal += it.kcal || 0; totals.koolhydraten_g += it.koolhydraten_g || 0;
    totals.vezels_g += it.vezels_g || 0; totals.vetten_g += it.vetten_g || 0;
    totals.eiwitten_g += it.eiwitten_g || 0; totals.ml += it.ml || 0;
  }

  const fav = {
    naam, tekst: selectedItems.map(it => it.naam).join(', '), maaltijd: meal, isRecipe: true,
    items: selectedItems.map(it => ({ ...it })),
    item: { naam, portie: `${selectedItems.length} ingrediënten`, ...totals },
    uses: 0,
    createdAt: Date.now(),
  };

  const favs = loadFavs();
  favs.push(fav);
  saveFavs(favs);
  syncFavoritesToSupabase();
  renderQuickFavs();
  setRecipeSelectionMeal(null);
  setRecipeSelectionIndices([]);
  rerenderCurrentDay();
  document.getElementById('status').textContent = `🍽️ "${naam}" opgeslagen als gerecht (${selectedItems.length} items)`;
  document.getElementById('status').className = 'status-msg';
}

export function toggleFavExpand(idx) {
  const el = document.getElementById(`fav-subitems-${idx}`);
  if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
  const btn = document.getElementById(`fav-expand-${idx}`);
  if (btn) btn.textContent = el.style.display === 'none' ? '▸ Ingrediënten tonen' : '▾ Ingrediënten verbergen';
}

export async function addFavToMeal(idx) {
  document.getElementById('fav-modal').classList.remove('open');
  const favs = loadFavs();
  const fav = favs[idx];
  if (!fav) return;
  fav.uses = Number(fav.uses || 0) + 1;
  if (!fav.createdAt) fav.createdAt = Date.now();
  saveFavs(favs);
  syncFavoritesToSupabase();
  const targetMeal = selMeal;
  const day = localData[currentDate] || emptyDay();
  MEAL_NAMES.forEach(m => { if (!day[m]) day[m] = []; });

  if (fav.isRecipe && fav.items && fav.items.length > 0) {
    const groupId = fav.naam + '_' + Date.now();
    for (const subItem of fav.items) {
      day[targetMeal].push({ ...subItem, _recipeGroup: groupId, _recipeName: fav.naam });
    }
    localData[currentDate] = day;
    saveDay(currentDate, day);
    document.getElementById('status').textContent = `✓ ${fav.naam} (${fav.items.length} items) toegevoegd aan ${MEAL_LABELS[targetMeal]}`;
    document.getElementById('status').className = 'status-msg';
    renderQuickFavs();
    _renderDayUI(day);
  } else if (fav.item) {
    day[targetMeal].push({ ...fav.item });
    localData[currentDate] = day;
    saveDay(currentDate, day);
    document.getElementById('status').textContent = `✓ ${fav.naam} toegevoegd aan ${MEAL_LABELS[targetMeal]}`;
    document.getElementById('status').className = 'status-msg';
    renderQuickFavs();
    _renderDayUI(day);
  } else {
    document.getElementById('food-input').value = fav.tekst;
    renderQuickFavs();
    await submit();
  }
}

/* ── Edit Favourite Modal ─────────────────────────────────── */
let editFavIdx = null;

// Each ingredient row keeps its state on row._ing: { item, perUnit, unit }.
function editFavRowHtml(item, siIdx) {
  const { amount, unit } = parseIngredientAmount(item);
  return `<div class="editfav-subitem" data-si="${siIdx}">
    <div class="editfav-si-search">
      <input type="text" class="editfav-si-naam" value="${esc(item.naam || '')}" placeholder="Zoek product…" autocomplete="off" aria-label="Ingrediënt">
      <div class="editfav-si-dropdown"></div>
    </div>
    <label class="editfav-si-amount">
      <input type="number" class="editfav-si-gram" value="${amount ?? ''}" min="0" step="any" inputmode="decimal" aria-label="Hoeveelheid">
      <span class="editfav-si-unit">${unit}</span>
    </label>
    <span class="editfav-si-kcal">${Math.round(item.kcal || 0)} kcal</span>
    <button type="button" class="icon-action is-danger item-delete" data-action="remove-subitem" title="Verwijder ingrediënt" aria-label="Verwijder ingrediënt">${ICON_CLOSE}</button>
  </div>`;
}

function initEditFavRow(row, item) {
  const { amount, unit } = parseIngredientAmount(item);
  row._ing = { item: { ...item }, perUnit: nutritionPerUnit(item, amount), unit };
}

function updateEditFavRow(row) {
  const ing = row._ing;
  if (!ing) return;
  row.querySelector('.editfav-si-kcal').textContent = `${Math.round(ing.item.kcal || 0)} kcal`;
  row.querySelector('.editfav-si-unit').textContent = ing.unit;
}

function readEditFavRows() {
  return [...document.querySelectorAll('.editfav-subitem')]
    .map(row => row._ing && { ...row._ing.item, naam: row.querySelector('.editfav-si-naam')?.value.trim() || row._ing.item.naam })
    .filter(item => item && (item.naam || item.kcal));
}

function addEditFavIngredient() {
  const container = document.getElementById('editfav-items-list');
  if (!container) return;
  const empty = { naam: '', kcal: 0, koolhydraten_g: 0, vezels_g: 0, vetten_g: 0, eiwitten_g: 0, ml: 0, portie: '100g' };
  container.insertAdjacentHTML('beforeend', editFavRowHtml(empty, 'new'));
  const row = container.lastElementChild;
  initEditFavRow(row, empty);
  row.querySelector('.editfav-si-naam')?.focus();
}

function renderEditFavSearchResults(row, query) {
  const dropdown = row?.querySelector('.editfav-si-dropdown');
  if (!dropdown) return;
  const val = String(query || '').trim();
  if (val.length < 2) {
    dropdown.innerHTML = '';
    dropdown.classList.remove('open');
    return;
  }

  const results = searchNevo(val).slice(0, 6);
  const terms = val.toLowerCase().split(/\s+/).filter(Boolean);
  if (!results.length) {
    dropdown.innerHTML = '<div class="editfav-si-empty">Geen producten gevonden</div>';
    dropdown.classList.add('open');
    return;
  }

  dropdown.innerHTML = results.map((result, idx) => `
    <button type="button" class="editfav-si-option" data-result-idx="${idx}">
      <span class="editfav-si-option-main">
        <span class="editfav-si-option-name">${terms.reduce((name, term) => name.replace(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'), '<mark>$1</mark>'), esc(result.n || ''))}</span>
        <span class="editfav-si-option-group">${esc(result._group || '')}</span>
      </span>
      <span class="editfav-si-option-macros">${Math.round(result.k || 0)} kcal · E${r1(result.e || 0)} · V${r1(result.v || 0)} · K${r1(result.kh || 0)}</span>
    </button>
  `).join('');
  row._editFavSearchResults = results;
  dropdown.classList.add('open');
}

function applyEditFavSearchSelection(row, resultIdx) {
  const results = row?._editFavSearchResults || [];
  const result = results[resultIdx];
  if (!row || !result) return;

  const amount = parseFloat(row.querySelector('.editfav-si-gram')?.value) || 100;
  const mapped = buildMealItem(result.n, result, amount, false);
  const { unit } = parseIngredientAmount(mapped);
  row._ing = { item: scaleIngredient(mapped, nutritionPerUnit(mapped, amount), amount, unit), perUnit: nutritionPerUnit(mapped, amount), unit };

  const nameInput = row.querySelector('.editfav-si-naam');
  if (nameInput) nameInput.value = mapped.naam;
  row.querySelector('.editfav-si-dropdown')?.classList.remove('open');
  updateEditFavRow(row);
  recalcEditFavTotals();
}

export function openEditFavModal(idx) {
  const favs = loadFavs();
  const f = favs[idx];
  if (!f) return;
  editFavIdx = idx;

  document.getElementById('editfav-naam').value = f.naam || '';

  const isRecipe = f.isRecipe && f.items && f.items.length > 1;
  const container = document.getElementById('editfav-items-container');

  if (isRecipe) {
    // Show editable sub-items
    container.innerHTML = '<div class="editfav-items-head"><span>Ingrediënten</span><span>Hoeveelheid</span></div>'
      + '<div id="editfav-items-list">' + f.items.map((si, i) => editFavRowHtml(si, i)).join('') + '</div>'
      + '<button type="button" class="editfav-add-btn" data-action="add-subitem">+ Ingrediënt toevoegen</button>';
    container.querySelectorAll('.editfav-subitem').forEach(row => initEditFavRow(row, f.items[Number(row.dataset.si)]));
    container.style.display = '';
  } else {
    container.innerHTML = '';
    container.style.display = 'none';
  }

  // Fill totals
  const item = f.item || {};
  document.getElementById('editfav-kcal').value = item.kcal || 0;
  document.getElementById('editfav-carbs').value = item.koolhydraten_g || 0;
  document.getElementById('editfav-fiber').value = item.vezels_g || 0;
  document.getElementById('editfav-fat').value = item.vetten_g || 0;
  document.getElementById('editfav-prot').value = item.eiwitten_g || 0;

  document.getElementById('edit-fav-modal').classList.add('open');
}

export function recalcEditFavTotals() {
  const totals = sumIngredients(readEditFavRows());
  document.getElementById('editfav-kcal').value = totals.kcal;
  document.getElementById('editfav-carbs').value = totals.koolhydraten_g;
  document.getElementById('editfav-fiber').value = totals.vezels_g;
  document.getElementById('editfav-fat').value = totals.vetten_g;
  document.getElementById('editfav-prot').value = totals.eiwitten_g;
}

const FAV_MODAL_ACTIONS = {
  add: idx => addFavToMeal(idx),
  expand: idx => toggleFavExpand(idx),
  edit: idx => openEditFavModal(idx),
  delete: idx => deleteFav(idx),
  'add-new': () => {
    document.getElementById('fav-modal').classList.remove('open');
    openSmartImportPage();
  },
  close: () => document.getElementById('fav-modal').classList.remove('open'),
};

export function initFavModalListeners() {
  document.getElementById('fav-modal')?.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (el) FAV_MODAL_ACTIONS[el.dataset.action]?.(Number(el.dataset.idx));
  });
}

export function initEditFavModalListeners() {
  document.getElementById('editfav-items-container')?.addEventListener('click', e => {
    if (e.target.closest('[data-action="add-subitem"]')) {
      addEditFavIngredient();
      return;
    }
    const btn = e.target.closest('[data-action="remove-subitem"]');
    if (!btn) return;
    btn.closest('.editfav-subitem').remove();
    recalcEditFavTotals();
  });

  document.getElementById('editfav-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('edit-fav-modal').classList.remove('open');
    editFavIdx = null;
  });

  document.getElementById('editfav-save-btn')?.addEventListener('click', () => {
    if (editFavIdx === null) return;
    const favs = loadFavs();
    const f = favs[editFavIdx];
    if (!f) return;

    f.naam = document.getElementById('editfav-naam').value.trim() || f.naam;

    // Update sub-items if recipe
    if (f.isRecipe && f.items) {
      f.items = readEditFavRows();
      const totals = sumIngredients(f.items);
      f.item = { naam: f.naam, portie: `${f.items.length} ingrediënten`, ...totals };
    }

    // Update totals from fields (for single items, or manual override for recipes)
    if (!f.item) f.item = {};
    f.item.naam = f.naam;
    f.item.kcal = parseFloat(document.getElementById('editfav-kcal').value) || 0;
    f.item.koolhydraten_g = parseFloat(document.getElementById('editfav-carbs').value) || 0;
    f.item.vezels_g = parseFloat(document.getElementById('editfav-fiber').value) || 0;
    f.item.vetten_g = parseFloat(document.getElementById('editfav-fat').value) || 0;
    f.item.eiwitten_g = parseFloat(document.getElementById('editfav-prot').value) || 0;

    // Update tekst
    if (f.isRecipe && f.items) {
      f.tekst = f.items.map(it => it.naam).join(', ');
    }

    saveFavs(favs);
    syncFavoritesToSupabase();
    renderFavList();
    renderQuickFavs();
    document.getElementById('edit-fav-modal').classList.remove('open');
    editFavIdx = null;
  });

  // Close on backdrop
  document.getElementById('edit-fav-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('edit-fav-modal')) {
      document.getElementById('edit-fav-modal').classList.remove('open');
      editFavIdx = null;
    }
  });

  document.getElementById('editfav-items-container')?.addEventListener('input', e => {
    const row = e.target.closest('.editfav-subitem');
    if (!row) return;
    if (e.target.classList.contains('editfav-si-naam')) {
      renderEditFavSearchResults(row, e.target.value);
    }
    if (e.target.classList.contains('editfav-si-gram') && row._ing) {
      const amount = parseFloat(e.target.value);
      if (!(amount >= 0)) return;
      const ing = row._ing;
      // A row saved with an unknown or zero amount has no per-unit values yet: keep its nutrition.
      ing.item = scaleIngredient(ing.item, ing.perUnit, amount, ing.unit);
      if (!ing.perUnit) ing.perUnit = nutritionPerUnit(ing.item, amount);
      updateEditFavRow(row);
      recalcEditFavTotals();
    }
  });

  document.getElementById('editfav-items-container')?.addEventListener('focusin', e => {
    const row = e.target.closest('.editfav-subitem');
    if (row && e.target.classList.contains('editfav-si-naam')) {
      renderEditFavSearchResults(row, e.target.value);
    }
  });

  document.getElementById('editfav-items-container')?.addEventListener('click', e => {
    const option = e.target.closest('.editfav-si-option');
    if (!option) return;
    const row = option.closest('.editfav-subitem');
    applyEditFavSearchSelection(row, parseInt(option.dataset.resultIdx, 10));
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.editfav-si-search')) {
      document.querySelectorAll('.editfav-si-dropdown.open').forEach(el => el.classList.remove('open'));
    }
  });
}
