/* ── Miscellaneous UI helpers ─────────────────────────────── */

import {
  localData, currentDate, goals, authUser, cfg,
  vis, showDrinks, setCurrentDate,
} from '../state.js';
import {
  MEAL_NAMES, MEAL_LABELS, LOCAL_KEY, DARK_KEY, VIS_KEY,
} from '../constants.js';
import {
  dateKey, formatDate, emptyDay, normalizeDayData, esc, dayTotals, r1,
} from '../utils.js';
import { safeParse, loadFavs, loadGoals, loadCustomProducts } from '../storage.js';
import { loadDay, saveDay, loadAllDates } from '../supabase/data.js';
import { renderMeals, _renderDayUI } from './render.js';

/* ── History list ─────────────────────────────────────────── */
export async function renderHistory() {
  const list = document.getElementById('history-list');
  if (!list) return;
  const dates = await loadAllDates();
  const days = dates.sort().reverse().slice(0, 7);
  if (!days.length) {
    list.innerHTML = '<div style="font-size:0.78rem;color:var(--muted);font-style:italic">Nog geen history</div>';
    return;
  }
  list.innerHTML = days.map(day => {
    const cached = localData[day];
    const cals = cached ? Math.round(dayTotals(cached).cals) : null;
    return `<div class="history-day" onclick="goToDay('${day}')">
      <span>${formatDate(day)}</span>
      <span class="history-day-cals">${cals !== null && cals > 0 ? cals + ' kcal' : '—'}</span>
    </div>`;
  }).join('');
}

/* ── Quick favourites (chips) ────────────────────────────── */
export function renderQuickFavs() {
  const favs = loadFavs();
  const el = document.getElementById('quick-favs');
  if (!favs.length) { el.innerHTML = ''; return; }
  el.innerHTML = favs.map((f, i) => {
    const it = f.item;
    const isRecipe = f.isRecipe && f.items;
    const icon = isRecipe ? '🍽️ ' : '';
    const naam = f.naam || (it && it.naam) || f.tekst || '?';
    const tip = it
      ? `${naam} — ${it.kcal || 0}kcal · ${it.koolhydraten_g || 0}g kh · ${it.vetten_g || 0}g vet · ${it.eiwitten_g || 0}g eiwit${isRecipe ? ' (' + f.items.length + ' items)' : (it.portie ? ' (' + it.portie + ')' : '')}`
      : (f.tekst || naam);
    return `<button class="quick-fav-chip" onclick="addFavToMeal(${i})" title="${esc(tip)}">${icon}${esc(naam)}</button>`;
  }).join('');
}

/* ── Streak ───────────────────────────────────────────────── */
export function updateStreak() {
  const allLocal = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
  let streak = 0;
  for (let i = 0; i < 60; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = dateKey(d);
    const day = allLocal[key];
    if (!day) break;
    const totCals = MEAL_NAMES.reduce((s, m) => s + (day[m] || []).reduce((ss, ii) => ss + (ii.kcal || 0), 0), 0);
    if (totCals === 0) break;
    streak++;
  }
  const el = document.getElementById('streak-display');
  if (streak >= 2) el.innerHTML = `<span class="streak-badge" title="${streak} dagen op rij bijgehouden!">🔥 ${streak} dagen</span>`;
  else el.innerHTML = '';
}

/* ── Dark mode ────────────────────────────────────────────── */
export function applyDark(on) {
  document.body.classList.toggle('dark', on);
  document.getElementById('dark-toggle').textContent = on ? '☀️' : '🌙';
  localStorage.setItem(DARK_KEY, on ? '1' : '0');
}

/* ── Macro visibility toggles ────────────────────────────── */
export function applyVis() {
  ['row-carbs', 'row-fat', 'row-prot', 'row-water', 'row-fiber'].forEach(id => {
    const row = document.getElementById(id);
    if (row) row.style.display = '';
  });
  localStorage.setItem(VIS_KEY, JSON.stringify(vis));
}

/* ── Delete item / recipe group ──────────────────────────── */
export async function deleteItem(meal, idx) {
  const day = localData[currentDate] || emptyDay();
  day[meal].splice(idx, 1);
  localData[currentDate] = day;
  saveDay(currentDate, day);
  _renderDayUI(day);
}

export function deleteRecipeGroup(meal, groupId) {
  const day = localData[currentDate] || emptyDay();
  const items = day[meal] || [];
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i]._recipeGroup === groupId) items.splice(i, 1);
  }
  localData[currentDate] = day;
  saveDay(currentDate, day);
  _renderDayUI(day);
}

export function moveRecipeGroupToMeal(fromMeal, groupId, toMeal) {
  if (!toMeal || toMeal === fromMeal) return;
  const day = localData[currentDate] || emptyDay();
  const items = day[fromMeal] || [];
  const groupItems = [];
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i]._recipeGroup === groupId) groupItems.unshift(items.splice(i, 1)[0]);
  }
  if (!day[toMeal]) day[toMeal] = [];
  day[toMeal].push(...groupItems);
  localData[currentDate] = day;
  saveDay(currentDate, day);
  _renderDayUI(day);
  const label = MEAL_LABELS[toMeal] || toMeal;
  const status = document.getElementById('status');
  const name = groupItems[0]?._recipeName || 'Gerecht';
  if (status) status.textContent = `↗️ "${name}" verplaatst naar ${label}`;
}

/* ── Day navigation ──────────────────────────────────────── */
export async function goToDay(key) {
  setCurrentDate(key);
  await renderMeals();
}

/* ── Mobile view switching ───────────────────────────────── */
export function switchMobileView(view, btn) {
  const layout = document.querySelector('.layout');
  if (!layout) return;
  layout.classList.remove('mobile-view-invoer', 'mobile-view-overzicht', 'mobile-view-data', 'mobile-view-advies', 'mobile-view-import', 'show-advies', 'show-import');
  layout.classList.add('mobile-view-' + view);
  document.querySelectorAll('.mobile-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  // Lazy-load page-specific renderers
  if (view === 'data') {
    Promise.all([import('../pages/data-overview.js'), import('../state.js')]).then(([m, s]) => m.renderDataOverzicht(s._doCurrentDays || 7));
  }
  if (view === 'advies') {
    import('../pages/advies.js').then(m => { m.updateAdviesModelSelect(); m.showAdviesContent(); });
  }
  if (view === 'import') {
    import('../pages/smart-import.js').then(m => m.openSmartImportPage());
  }
}
