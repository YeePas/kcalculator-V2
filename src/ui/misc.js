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

/* ── Dark mode ────────────────────────────────────────────── */
export function applyDark(on) {
  document.body.classList.toggle('dark', on);
  document.getElementById('dark-toggle').textContent = on ? '☀️' : '🌙';
  localStorage.setItem(DARK_KEY, on ? '1' : '0');
}

/* ── Macro visibility toggles ────────────────────────────── */
export function applyVis() {
  const fiberRow = document.getElementById('row-fiber');
  Object.keys(vis).forEach(key => {
    if (key === 'fiber' || key === 'water') return;
    const row = document.getElementById('row-' + key);
    if (row) row.style.display = vis[key] ? '' : 'none';
    const btn = document.querySelector(`.macro-toggle[data-macro="${key}"]`);
    if (btn) btn.classList.toggle('on', vis[key]);
  });
  if (fiberRow) fiberRow.style.display = (vis.fiber && vis.carbs) ? '' : 'none';
  const fiberBtn = document.querySelector('.macro-toggle[data-macro="fiber"]');
  if (fiberBtn) fiberBtn.classList.toggle('on', vis.fiber);
  const waterRow = document.getElementById('row-water');
  if (waterRow) waterRow.style.display = '';
  vis.water = true;
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
function scrollMobileViewToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
  document.querySelectorAll('.layout, .main-col, .sidebar, .data-col, .advies-col, .smart-import-col, .admin-col').forEach(el => {
    if (typeof el.scrollTo === 'function') el.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

export function switchMobileView(view, btn) {
  const layout = document.querySelector('.layout');
  if (!layout) return;
  if (btn?.classList.contains('active')) {
    scrollMobileViewToTop();
    return;
  }
  layout.classList.remove('mobile-view-invoer', 'mobile-view-overzicht', 'mobile-view-data', 'mobile-view-advies', 'mobile-view-import', 'mobile-view-admin', 'show-advies', 'show-import', 'show-admin');
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
  if (view === 'admin') {
    import('../pages/admin.js').then(m => m.renderAdminPage());
  }
}
