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
import { searchNevo } from '../products/database.js';
import { buildMealItem } from '../products/matcher.js';
import { submit } from '../input/submit.js';

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
    uses: 0,
    createdAt: Date.now(),
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

function setEditFavRowNutrition(row, item) {
  if (!row || !item) return;
  row.dataset.kcal = item.kcal || 0;
  row.dataset.carbs = item.koolhydraten_g || 0;
  row.dataset.fiber = item.vezels_g || 0;
  row.dataset.fat = item.vetten_g || 0;
  row.dataset.prot = item.eiwitten_g || 0;
  row.dataset.ml = item.ml || 0;
  row.dataset.portie = item.portie || '';
  row.dataset.gram = item._gram || '';
  const kcalInput = row.querySelector('.editfav-si-kcal');
  if (kcalInput) kcalInput.value = Math.round(item.kcal || 0);
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

  const currentGram = parseFloat(row.dataset.gram) || 100;
  const currentPortie = row.dataset.portie || (currentGram === 100 ? '100g' : `${currentGram}g`);
  const mapped = buildMealItem(result.n, result, currentGram, false);
  mapped.portie = currentPortie;
  mapped._gram = currentGram;

  const nameInput = row.querySelector('.editfav-si-naam');
  if (nameInput) nameInput.value = mapped.naam;
  setEditFavRowNutrition(row, mapped);
  row.querySelector('.editfav-si-dropdown')?.classList.remove('open');
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
    container.innerHTML = `<label style="display:block;font-size:0.72rem;font-weight:500;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:0.4rem;margin-top:0.5rem">Ingrediënten</label>` +
      f.items.map((si, i) => `<div class="editfav-subitem" data-si="${i}" data-kcal="${si.kcal || 0}" data-carbs="${si.koolhydraten_g || 0}" data-fiber="${si.vezels_g || 0}" data-fat="${si.vetten_g || 0}" data-prot="${si.eiwitten_g || 0}" data-ml="${si.ml || 0}" data-portie="${esc(si.portie || '')}" data-gram="${si._gram || ''}">
        <div style="display:flex;gap:0.4rem;align-items:flex-start;margin-bottom:0.3rem">
          <div class="editfav-si-search">
            <input type="text" class="editfav-si-naam" value="${esc(si.naam || '')}" autocomplete="off" style="width:100%;border:1.5px solid var(--border);border-radius:6px;padding:0.35rem 0.5rem;font-size:0.82rem;font-family:var(--font-body);background:var(--bg);color:var(--text)">
            <div class="editfav-si-dropdown"></div>
          </div>
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
  let totalKcal = 0, totalCarbs = 0, totalFiber = 0, totalFat = 0, totalProt = 0;
  items.forEach(el => {
    const kcalVal = parseFloat(el.querySelector('.editfav-si-kcal')?.value);
    totalKcal += Number.isFinite(kcalVal) ? kcalVal : (parseFloat(el.dataset.kcal) || 0);
    totalCarbs += parseFloat(el.dataset.carbs) || 0;
    totalFiber += parseFloat(el.dataset.fiber) || 0;
    totalFat += parseFloat(el.dataset.fat) || 0;
    totalProt += parseFloat(el.dataset.prot) || 0;
  });
  document.getElementById('editfav-kcal').value = Math.round(totalKcal);
  document.getElementById('editfav-carbs').value = r1(totalCarbs);
  document.getElementById('editfav-fiber').value = r1(totalFiber);
  document.getElementById('editfav-fat').value = r1(totalFat);
  document.getElementById('editfav-prot').value = r1(totalProt);
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
          koolhydraten_g: parseFloat(el.dataset.carbs) || 0,
          vezels_g: parseFloat(el.dataset.fiber) || 0,
          vetten_g: parseFloat(el.dataset.fat) || 0,
          eiwitten_g: parseFloat(el.dataset.prot) || 0,
          ml: parseFloat(el.dataset.ml) || 0,
          portie: el.dataset.portie || origItem.portie,
          _gram: parseFloat(el.dataset.gram) || origItem._gram,
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

  document.getElementById('editfav-items-container')?.addEventListener('input', e => {
    const row = e.target.closest('.editfav-subitem');
    if (!row) return;
    if (e.target.classList.contains('editfav-si-naam')) {
      renderEditFavSearchResults(row, e.target.value);
    }
    if (e.target.classList.contains('editfav-si-kcal')) {
      row.dataset.kcal = e.target.value || '0';
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
