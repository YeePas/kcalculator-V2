/* ── UI Render Pipeline ────────────────────────────────────── */
/* renderMeals, _renderDayUI, renderMealItems, renderItem, renderSummary, etc. */

import {
  localData, currentDate, selMeal,
  authUser, cfg,
  recipeSelectionMeal, recipeSelectionIndices,
} from '../state.js';
import {
  MEAL_NAMES, MEAL_LABELS, LOCAL_KEY,
} from '../constants.js';
import {
  formatDate, emptyDay, normalizeDayData, esc, r1,
} from '../utils.js';
import { loadDay } from '../supabase/data.js';
import { renderSummary } from './summary.js';
import { ICON_EDIT, ICON_DELETE, ICON_STAR } from './icons.js';
import { renderWeekSpark } from './charts.js';
import { renderHistory, deleteItem, deleteRecipeGroup } from './misc.js';
import { openEditModal, openEditRecipeGroupModal } from '../modals/edit.js';
import {
  saveItemAsFavorite, saveMealAsRecipe,
  startMealRecipeSelection, cancelMealRecipeSelection, toggleMealRecipeSelection,
} from '../modals/favourites.js';

/* ── renderMeals: load day data + render ────────────────────── */
export async function renderMeals() {
  document.getElementById('day-label').textContent = formatDate(currentDate);

  if (authUser?.id && cfg.sbUrl && cfg.sbKey) {
    let cached = null;
    const rawCachedDay = localData[currentDate];
    if (rawCachedDay) {
      cached = normalizeDayData(rawCachedDay);
    } else {
      try {
        const all = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
        if (all[currentDate]) cached = normalizeDayData(all[currentDate]);
      } catch { /* ignore */ }
    }
    if (cached) _renderDayUI(cached);

    try {
      const fresh = normalizeDayData(await loadDay(currentDate));
      localData[currentDate] = fresh;
      _renderDayUI(fresh);
    } catch (e) {
      console.error('[renderMeals] Supabase load failed:', e);
      if (!cached) {
        localData[currentDate] = emptyDay();
        _renderDayUI(emptyDay());
      }
    }
  } else {
    let day = localData[currentDate];
    if (!day) {
      try {
        const all = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
        day = normalizeDayData(all[currentDate] || null);
      } catch { /* ignore */ }
    }
    if (!day) day = emptyDay();
    day = normalizeDayData(day);
    localData[currentDate] = day;
    _renderDayUI(day);
  }
}

/* ── _renderDayUI: populate DOM ────────────────────────────── */
export function _renderDayUI(day) {
  const c = document.getElementById('meals-container');
  c.innerHTML = '';

  MEAL_NAMES.forEach(meal => {
    const items = day[meal] || [];
    const isDrink = meal === 'drinken';
    const isRecipeSelectionActive = recipeSelectionMeal === meal;
    const selectedCount = isRecipeSelectionActive
      ? recipeSelectionIndices.filter(idx => items[idx]).length
      : 0;
    const mCals = items.reduce((s, i) => s + (i.kcal || 0), 0);
    const mMl = isDrink ? items.reduce((s, i) => s + (i.ml || 0), 0) : 0;

    const sec = document.createElement('div');
    sec.className = 'meal-section';
    sec.innerHTML = `
      <div class="meal-header" data-action="toggle-meal">
        <div class="meal-header-left">
          <span class="meal-title">${MEAL_LABELS[meal]}</span>
          ${isDrink && (mMl > 0 || mCals > 0) ? `<span class="meal-cals">${mCals > 0 ? `${mCals} kcal · ` : ''}${mMl} ml</span>` : ''}
          ${!isDrink && mCals > 0 ? `<span class="meal-cals">${mCals} kcal</span>` : ''}
        </div>
        <span class="meal-collapse-icon">▾</span>
      </div>
      <div class="meal-items">
        ${items.length === 0 ? `<div class="empty-meal">Nog niets toegevoegd</div>` : ''}
        ${renderMealItems(items, meal)}
        ${items.length >= 2 ? renderMealRecipeActions(meal, selectedCount) : ''}
      </div>`;
    c.appendChild(sec);
  });

  renderSummary(day);
  refreshMealFoldControls();
  // These are called from main.js or other modules, fire them via events
  renderWeekSpark();
  renderHistory();
}

function toggleMealSection(header) {
  header.closest('.meal-section').classList.toggle('collapsed');
  refreshMealFoldControls();
}

const MEAL_ACTIONS = {
  'toggle-meal': el => toggleMealSection(el),
  'toggle-group': el => el.closest('.recipe-group').classList.toggle('collapsed'),
  'edit-group': el => openEditRecipeGroupModal(el.dataset.meal, el.dataset.group),
  'delete-group': el => deleteRecipeGroup(el.dataset.meal, el.dataset.group),
  fav: el => saveItemAsFavorite(el.dataset.meal, Number(el.dataset.idx)),
  edit: el => openEditModal(el.dataset.meal, Number(el.dataset.idx)),
  delete: el => deleteItem(el.dataset.meal, Number(el.dataset.idx)),
  'start-recipe': el => startMealRecipeSelection(el.dataset.meal),
  'save-recipe': el => saveMealAsRecipe(el.dataset.meal),
  'cancel-recipe': () => cancelMealRecipeSelection(),
};

export function initMealListeners() {
  const c = document.getElementById('meals-container');
  c.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (el && c.contains(el)) MEAL_ACTIONS[el.dataset.action]?.(el);
  });
  c.addEventListener('change', e => {
    const el = e.target.closest('[data-action="toggle-recipe-item"]');
    if (el) toggleMealRecipeSelection(el.dataset.meal, Number(el.dataset.idx));
  });
  document.getElementById('toggle-all-meals-btn')?.addEventListener('click', toggleAllMealSections);
}

function refreshMealFoldControls() {
  const btn = document.getElementById('toggle-all-meals-btn');
  if (!btn) return;
  const sections = Array.from(document.querySelectorAll('.meal-section'));
  if (!sections.length) {
    btn.style.display = 'none';
    return;
  }
  btn.style.display = '';
  const allCollapsed = sections.every(sec => sec.classList.contains('collapsed'));
  const label = allCollapsed ? 'Alles uitklappen' : 'Alles inklappen';
  btn.classList.toggle('is-collapsed', allCollapsed);
  btn.title = label;
  btn.setAttribute('aria-label', label);
}

export function toggleAllMealSections() {
  const sections = Array.from(document.querySelectorAll('.meal-section'));
  if (!sections.length) return;
  const allCollapsed = sections.every(sec => sec.classList.contains('collapsed'));
  sections.forEach(sec => sec.classList.toggle('collapsed', !allCollapsed));
  refreshMealFoldControls();
}

/* ── renderMealItems: handle recipe groups ────────────────── */
export function renderMealItems(items, meal) {
  if (!items.length) return '';
  const isRecipeSelectionActive = recipeSelectionMeal === meal;
  const groups = [];
  let currentGroup = null;

  items.forEach((item, idx) => {
    if (item._recipeGroup) {
      if (currentGroup && currentGroup.groupId === item._recipeGroup) {
        currentGroup.items.push({ item, idx });
      } else {
        currentGroup = { groupId: item._recipeGroup, name: item._recipeName || 'Gerecht', items: [{ item, idx }] };
        groups.push(currentGroup);
      }
    } else {
      currentGroup = null;
      groups.push({ single: true, item, idx });
    }
  });

  return groups.map(g => {
    if (g.single) return renderItem(g.item, meal, g.idx);

    const totKcal = g.items.reduce((s, x) => s + (x.item.kcal || 0), 0);
    const totCarbs = g.items.reduce((s, x) => s + (x.item.koolhydraten_g || 0), 0);
    const totFat = g.items.reduce((s, x) => s + (x.item.vetten_g || 0), 0);
    const totProt = g.items.reduce((s, x) => s + (x.item.eiwitten_g || 0), 0);
    const uid = g.groupId.replace(/[^a-zA-Z0-9]/g, '_');

    const totFiber = g.items.reduce((s, x) => s + (x.item.vezels_g || 0), 0);

    // Same layout as a single item: name, macro chips, kcal and actions; ingredients fold out below
    return `<div class="recipe-group${isRecipeSelectionActive ? '' : ' collapsed'}" id="rg-${uid}">
      <div class="meal-item recipe-group-header" data-action="toggle-group" role="button" aria-label="Ingrediënten tonen of verbergen">
        <div style="flex:1;min-width:0">
          <div class="item-name">${esc(g.name)} <span class="recipe-group-count">(gerecht · ${g.items.length} items)</span><span class="recipe-group-toggle" aria-hidden="true"></span></div>
          <div class="item-macros"><span class="macro"><span class="macro-dot dot-c"></span>${r1(totCarbs)}g kh</span><span class="macro"><span class="macro-dot dot-v"></span>${r1(totFat)}g vet</span><span class="macro"><span class="macro-dot dot-e"></span>${r1(totProt)}g eiwit</span>${totFiber > 0 ? `<span class="macro" style="opacity:0.6">${r1(totFiber)}g vezel</span>` : ''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:0.15rem;flex-shrink:0">
          <span class="item-cals">${Math.round(totKcal)} kcal</span>
          <span class="icon-action icon-action-spacer" aria-hidden="true">${ICON_STAR}</span>
          <button class="icon-action item-edit" data-action="edit-group" data-meal="${meal}" data-group="${esc(g.groupId)}" title="Gerecht bewerken" aria-label="Gerecht bewerken">${ICON_EDIT}</button>
          <button class="icon-action is-danger item-delete" data-action="delete-group" data-meal="${meal}" data-group="${esc(g.groupId)}" title="Gerecht verwijderen" aria-label="Gerecht verwijderen">${ICON_DELETE}</button>
        </div>
      </div>
      <div class="recipe-group-items">
        ${g.items.map(x => renderItem(x.item, meal, x.idx)).join('')}
      </div>
    </div>`;
  }).join('');
}

/* ── renderItem ────────────────────────────────────────────── */
export function renderItem(item, meal, idx) {
  const isDrink = meal === 'drinken';
  const isRecipeSelectionActive = recipeSelectionMeal === meal;
  const isSelectedForRecipe = isRecipeSelectionActive && recipeSelectionIndices.includes(idx);
  const macros = isDrink
    ? `<span class="macro"><span class="macro-dot dot-w"></span>${item.ml || 0} ml</span><span class="macro"><span class="macro-dot dot-c"></span>${r1(item.koolhydraten_g || 0)}g kh</span><span class="macro"><span class="macro-dot dot-v"></span>${r1(item.vetten_g || 0)}g vet</span><span class="macro"><span class="macro-dot dot-e"></span>${r1(item.eiwitten_g || 0)}g eiwit</span>`
    : `<span class="macro"><span class="macro-dot dot-c"></span>${r1(item.koolhydraten_g || 0)}g kh</span><span class="macro"><span class="macro-dot dot-v"></span>${r1(item.vetten_g || 0)}g vet</span><span class="macro"><span class="macro-dot dot-e"></span>${r1(item.eiwitten_g || 0)}g eiwit</span>${item.vezels_g > 0 ? `<span class="macro" style="opacity:0.6">${r1(item.vezels_g)}g vezel</span>` : ''}`;
  const right = `${item.kcal || 0} kcal`;
  return `<div class="meal-item${isRecipeSelectionActive ? ' recipe-select-mode' : ''}${isSelectedForRecipe ? ' selected-for-recipe' : ''}">
    <div style="flex:1;min-width:0">
      <div class="item-name">${esc(item.naam)}${item.portie ? ` <span style="font-weight:300;color:var(--muted);font-size:0.8rem">(${esc(item.portie)})</span>` : ''}</div>
      <div class="item-macros">${macros}</div>
    </div>
    <div style="display:flex;align-items:center;gap:0.15rem;flex-shrink:0">
      <span class="item-cals">${right}</span>
      ${isRecipeSelectionActive
        ? `<label class="meal-item-check" title="Meenemen in gerecht">
            <input type="checkbox" ${isSelectedForRecipe ? 'checked' : ''} data-action="toggle-recipe-item" data-meal="${meal}" data-idx="${idx}">
            <span>Opslaan</span>
          </label>`
        : `<button class="icon-action is-fav item-fav" data-action="fav" data-meal="${meal}" data-idx="${idx}" title="Als favoriet opslaan" aria-label="Als favoriet opslaan">${ICON_STAR}</button>
      <button class="icon-action item-edit" data-action="edit" data-meal="${meal}" data-idx="${idx}" title="Bewerken" aria-label="Bewerken">${ICON_EDIT}</button>
      <button class="icon-action is-danger item-delete" data-action="delete" data-meal="${meal}" data-idx="${idx}" title="Verwijderen" aria-label="Verwijderen">${ICON_DELETE}</button>`}
    </div>
  </div>`;
}

function renderMealRecipeActions(meal, selectedCount) {
  const isRecipeSelectionActive = recipeSelectionMeal === meal;
  if (!isRecipeSelectionActive) {
    return `<div class="save-recipe-entry">
      <button class="save-recipe-btn" data-action="start-recipe" data-meal="${meal}">🍽️ Kies items voor gerecht</button>
      <a class="save-recipe-help-link" href="handleiding.html#meal-to-recipe" target="_blank" rel="noopener noreferrer">Handleiding: items als gerecht opslaan</a>
    </div>`;
  }
  return `<div class="save-recipe-actions">
    <div class="save-recipe-meta">${selectedCount >= 2 ? `${selectedCount} items geselecteerd` : 'Selecteer minimaal 2 items'}</div>
    <div class="save-recipe-action-row">
      <button class="save-recipe-btn primary" data-action="save-recipe" data-meal="${meal}" ${selectedCount < 2 ? 'disabled' : ''}>🍽️ Opslaan als gerecht</button>
      <button class="save-recipe-btn cancel" data-action="cancel-recipe">Annuleren</button>
    </div>
  </div>`;
}
