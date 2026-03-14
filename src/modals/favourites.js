/* ── Favourites Modal ─────────────────────────────────────── */

import {
  localData, currentDate, selMeal, authUser, cfg,
} from '../state.js';
import { MEAL_NAMES, MEAL_LABELS } from '../constants.js';
import { emptyDay, esc, r1 } from '../utils.js';
import { loadFavs, saveFavs } from '../storage.js';
import { saveDay } from '../supabase/data.js';
import { syncFavoritesToSupabase } from '../supabase/sync.js';
import { _renderDayUI } from '../ui/render.js';
import { renderQuickFavs } from '../ui/misc.js';

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
      ? `<button class="fav-expand-btn" id="fav-expand-${i}" onclick="event.stopPropagation();toggleFavExpand(${i})">▸ Ingrediënten tonen</button>`
      : '';
    const subItems = isRecipe
      ? `<div class="fav-subitems" id="fav-subitems-${i}" style="display:none">${f.items.map(si =>
          `<div class="fav-subitem">
            <span class="fav-subitem-name">${esc(si.naam || '?')}${si.portie ? ' (' + esc(si.portie) + ')' : ''}</span>
            <span class="fav-subitem-macros">${si.kcal || 0} kcal</span>
          </div>`
        ).join('')}</div>`
      : '';

    return `<div class="fav-item" style="flex-wrap:wrap" onclick="addFavToMeal(${i})">
      <div style="flex:1;min-width:0"><div class="fav-item-name">${esc(naam)}${badge}</div>${macros}${expandBtn}</div>
      <div style="display:flex;gap:0.2rem;align-items:center;flex-shrink:0">
        <button class="fav-item-edit" onclick="event.stopPropagation();openEditFavModal(${i})" title="Bewerken">✏️</button>
        <button class="fav-item-del" onclick="event.stopPropagation();deleteFav(${i})" title="Verwijder">✕</button>
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
  favs.push({ naam, tekst, maaltijd: selMeal });
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
  favs.push({ naam, tekst, maaltijd: meal, item: { ...item } });
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
  if (items.length < 2) return;

  const defaultName = MEAL_LABELS[meal] + ' ' + new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  const naam = prompt('Naam voor dit gerecht:', defaultName);
  if (!naam) return;

  const totals = { kcal: 0, koolhydraten_g: 0, vezels_g: 0, vetten_g: 0, eiwitten_g: 0, ml: 0 };
  for (const it of items) {
    totals.kcal += it.kcal || 0; totals.koolhydraten_g += it.koolhydraten_g || 0;
    totals.vezels_g += it.vezels_g || 0; totals.vetten_g += it.vetten_g || 0;
    totals.eiwitten_g += it.eiwitten_g || 0; totals.ml += it.ml || 0;
  }

  const fav = {
    naam, tekst: items.map(it => it.naam).join(', '), maaltijd: meal, isRecipe: true,
    items: items.map(it => ({ ...it })),
    item: { naam, portie: `${items.length} ingrediënten`, ...totals },
  };

  const favs = loadFavs();
  favs.push(fav);
  saveFavs(favs);
  syncFavoritesToSupabase();
  renderQuickFavs();
  document.getElementById('status').textContent = `🍽️ "${naam}" opgeslagen als gerecht (${items.length} items)`;
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
  const fav = loadFavs()[idx];
  if (!fav) return;
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
    // Dynamic import to avoid circular dependency
    const { submit } = await import('../main.js');
    await submit();
  }
}

/* ── Edit Favourite Modal ─────────────────────────────────── */
let editFavIdx = null;

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
    container.innerHTML = `<label style="display:block;font-size:0.72rem;font-weight:500;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:0.4rem;margin-top:0.5rem">Ingrediënten</label>` +
      f.items.map((si, i) => `<div class="editfav-subitem" data-si="${i}">
        <div style="display:flex;gap:0.4rem;align-items:center;margin-bottom:0.3rem">
          <input type="text" class="editfav-si-naam" value="${esc(si.naam || '')}" style="flex:1;border:1.5px solid var(--border);border-radius:6px;padding:0.35rem 0.5rem;font-size:0.82rem;font-family:var(--font-body);background:var(--bg);color:var(--text)">
          <input type="number" class="editfav-si-kcal" value="${si.kcal || 0}" min="0" style="width:70px;border:1.5px solid var(--border);border-radius:6px;padding:0.35rem 0.5rem;font-size:0.82rem;text-align:right;font-family:var(--font-body);background:var(--bg);color:var(--text)" title="kcal">
          <span style="font-size:0.7rem;color:var(--muted)">kcal</span>
          <button class="item-delete" onclick="this.closest('.editfav-subitem').remove();recalcEditFavTotals()" title="Verwijder ingrediënt" style="font-size:0.8rem">✕</button>
        </div>
      </div>`).join('');
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
  const items = document.querySelectorAll('.editfav-subitem');
  let totalKcal = 0;
  items.forEach(el => {
    totalKcal += parseFloat(el.querySelector('.editfav-si-kcal')?.value) || 0;
  });
  document.getElementById('editfav-kcal').value = Math.round(totalKcal);
}

export function initEditFavModalListeners() {
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
      const subEls = document.querySelectorAll('.editfav-subitem');
      const newItems = [];
      subEls.forEach((el, i) => {
        const origItem = f.items[parseInt(el.dataset.si)] || {};
        newItems.push({
          ...origItem,
          naam: el.querySelector('.editfav-si-naam')?.value.trim() || origItem.naam,
          kcal: parseFloat(el.querySelector('.editfav-si-kcal')?.value) || 0,
        });
      });
      f.items = newItems;

      // Recalculate totals from sub-items
      const totals = { kcal: 0, koolhydraten_g: 0, vezels_g: 0, vetten_g: 0, eiwitten_g: 0, ml: 0 };
      for (const it of f.items) {
        totals.kcal += it.kcal || 0;
        totals.koolhydraten_g += it.koolhydraten_g || 0;
        totals.vezels_g += it.vezels_g || 0;
        totals.vetten_g += it.vetten_g || 0;
        totals.eiwitten_g += it.eiwitten_g || 0;
        totals.ml += it.ml || 0;
      }
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
}
