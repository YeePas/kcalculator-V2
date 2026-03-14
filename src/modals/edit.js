/* ── Edit Item Modal ──────────────────────────────────────── */

import { localData, currentDate } from '../state.js';
import { emptyDay, r1 } from '../utils.js';
import { loadFavs, saveFavs } from '../storage.js';
import { saveDay } from '../supabase/data.js';
import { syncFavoritesToSupabase } from '../supabase/sync.js';
import { _renderDayUI } from '../ui/render.js';
import { renderQuickFavs } from '../ui/misc.js';
import { MEAL_NAMES, MEAL_LABELS } from '../constants.js';
import { trapFocus, releaseFocus } from '../ui/focus.js';

let editMeal = null, editIdx = null;
let editBasePer100 = null;
let editBaseGram = null;

export function openEditModal(meal, idx) {
  editMeal = meal;
  editIdx = idx;
  const item = (localData[currentDate] || emptyDay())[meal][idx];
  if (!item) return;
  const isDrink = meal === 'drinken';

  const portieStr = (item.portie || '').toLowerCase();
  let origGram = item._gram || parseFloat(portieStr) || 100;
  if (/ml/.test(portieStr) && item.ml) origGram = item.ml;

  editBaseGram = origGram;

  const factor = origGram / 100;
  editBasePer100 = {
    kcal:  factor > 0 ? (item.kcal || 0) / factor : 0,
    carbs: factor > 0 ? (item.koolhydraten_g || 0) / factor : 0,
    fiber: factor > 0 ? (item.vezels_g || 0) / factor : 0,
    fat:   factor > 0 ? (item.vetten_g || 0) / factor : 0,
    prot:  factor > 0 ? (item.eiwitten_g || 0) / factor : 0,
    ml:    factor > 0 ? (item.ml || 0) / factor : 0,
  };

  document.getElementById('edit-item-name').textContent = item.naam;
  document.getElementById('edit-naam').value = item.naam || '';
  document.getElementById('edit-gram').value = Math.round(origGram);
  document.getElementById('edit-kcal').value = item.kcal || 0;
  document.getElementById('edit-carbs').value = item.koolhydraten_g || 0;
  document.getElementById('edit-fiber').value = item.vezels_g || 0;
  document.getElementById('edit-fat').value = item.vetten_g || 0;
  document.getElementById('edit-prot').value = item.eiwitten_g || 0;
  document.getElementById('edit-ml').value = item.ml || 0;
  document.getElementById('edit-ml-field').style.display = isDrink ? '' : 'none';
  document.getElementById('edit-recalc-hint').textContent =
    `Per 100g: ${Math.round(editBasePer100.kcal)} kcal · ${r1(editBasePer100.carbs)}g kh · ${r1(editBasePer100.fat)}g vet · ${r1(editBasePer100.prot)}g eiwit`;
  // Populate move-meal dropdown (all meals except current)
  const moveSelect = document.getElementById('edit-move-meal');
  if (moveSelect) {
    moveSelect.innerHTML = MEAL_NAMES
      .filter(m => m !== meal)
      .map(m => `<option value="${m}">${MEAL_LABELS[m] || m}</option>`)
      .join('');
  }

  document.getElementById('edit-modal').classList.add('open');
  trapFocus(document.getElementById('edit-modal'));
}

export function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('open');
  releaseFocus();
  editMeal = null;
  editIdx = null;
  editBasePer100 = null;
  editBaseGram = null;
}

export function initEditModalListeners() {
  // Live recalculation when gram changes
  document.getElementById('edit-gram').addEventListener('input', () => {
    if (!editBasePer100) return;
    const newGram = parseFloat(document.getElementById('edit-gram').value) || 0;
    const factor = newGram / 100;
    document.getElementById('edit-kcal').value = Math.round(editBasePer100.kcal * factor);
    document.getElementById('edit-carbs').value = Math.round(editBasePer100.carbs * factor * 10) / 10;
    document.getElementById('edit-fiber').value = Math.round(editBasePer100.fiber * factor * 10) / 10;
    document.getElementById('edit-fat').value = Math.round(editBasePer100.fat * factor * 10) / 10;
    document.getElementById('edit-prot').value = Math.round(editBasePer100.prot * factor * 10) / 10;
    if (document.getElementById('edit-ml-field').style.display !== 'none') {
      document.getElementById('edit-ml').value = Math.round(editBasePer100.ml * factor);
    }
  });

  // Save as favourite
  document.getElementById('edit-fav-btn').addEventListener('click', () => {
    if (editMeal === null || editIdx === null) return;
    const item = (localData[currentDate] || emptyDay())[editMeal]?.[editIdx];
    if (!item) return;
    const gram = parseFloat(document.getElementById('edit-gram').value) || 100;
    const snapItem = {
      naam: document.getElementById('edit-naam').value.trim() || item.naam,
      portie: `${Math.round(gram)}g`,
      kcal: parseFloat(document.getElementById('edit-kcal').value) || 0,
      koolhydraten_g: parseFloat(document.getElementById('edit-carbs').value) || 0,
      vezels_g: parseFloat(document.getElementById('edit-fiber').value) || 0,
      vetten_g: parseFloat(document.getElementById('edit-fat').value) || 0,
      eiwitten_g: parseFloat(document.getElementById('edit-prot').value) || 0,
      ml: parseInt(document.getElementById('edit-ml').value) || 0,
    };
    const naam = prompt('Naam voor dit favoriet:', snapItem.naam);
    if (!naam) return;
    const favs = loadFavs();
    favs.push({ naam, tekst: snapItem.naam + ' (' + snapItem.portie + ')', maaltijd: editMeal, item: snapItem });
    saveFavs(favs);
    syncFavoritesToSupabase();
    renderQuickFavs();
    closeEditModal();
    document.getElementById('status').textContent = `⭐ "${naam}" opgeslagen als favoriet!`;
  });

  // Save edited values
  document.getElementById('edit-save-btn').addEventListener('click', async () => {
    if (editMeal === null || editIdx === null) return;
    const day = localData[currentDate] || emptyDay();
    const item = day[editMeal][editIdx];
    if (!item) return;
    const gram = parseFloat(document.getElementById('edit-gram').value) || 100;
    item.naam = document.getElementById('edit-naam').value.trim() || item.naam;
    item.portie = `${Math.round(gram)}g`;
    item.kcal = parseFloat(document.getElementById('edit-kcal').value) || 0;
    item.koolhydraten_g = parseFloat(document.getElementById('edit-carbs').value) || 0;
    item.vezels_g = parseFloat(document.getElementById('edit-fiber').value) || 0;
    item.vetten_g = parseFloat(document.getElementById('edit-fat').value) || 0;
    item.eiwitten_g = parseFloat(document.getElementById('edit-prot').value) || 0;
    item.ml = parseInt(document.getElementById('edit-ml').value) || 0;
    localData[currentDate] = day;
    saveDay(currentDate, day);
    closeEditModal();
    _renderDayUI(day);
  });

  // Move item to different meal
  document.getElementById('edit-move-btn').addEventListener('click', () => {
    if (editMeal === null || editIdx === null) return;
    const targetMeal = document.getElementById('edit-move-meal').value;
    if (!targetMeal || targetMeal === editMeal) return;
    moveItemToMeal(editMeal, editIdx, targetMeal);
  });

  // Close on backdrop click
  document.getElementById('edit-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('edit-modal')) closeEditModal();
  });
}

/* ── Move item to a different meal ───────────────────────── */
export function moveItemToMeal(fromMeal, idx, toMeal) {
  const day = localData[currentDate] || emptyDay();
  const items = day[fromMeal] || [];
  if (idx < 0 || idx >= items.length) return;

  // Remove from source meal
  const [item] = items.splice(idx, 1);

  // Add to target meal
  if (!day[toMeal]) day[toMeal] = [];
  day[toMeal].push(item);

  // Save & re-render
  localData[currentDate] = day;
  saveDay(currentDate, day);
  closeEditModal();
  _renderDayUI(day);

  const label = MEAL_LABELS[toMeal] || toMeal;
  const status = document.getElementById('status');
  if (status) status.textContent = `↗️ "${item.naam}" verplaatst naar ${label}`;
}
