/* ── Manual Day Entry Modal ─────────────────────────────────── */

import { localData, currentDate, selMeal } from '../state.js';
import { MEAL_NAMES, MEAL_LABELS, LOCAL_KEY } from '../constants.js';
import { emptyDay, normalizeDayData, r1 } from '../utils.js';
import { renderMeals } from '../ui/render.js';
import { saveDay } from '../supabase/data.js';

function openManualDayModal() {
  const modal = document.getElementById('manual-day-modal');
  if (!modal) return;

  // Reset fields
  document.getElementById('manual-naam').value = 'Handmatige invoer';
  document.getElementById('manual-kcal').value = '';
  document.getElementById('manual-carbs').value = '';
  document.getElementById('manual-fiber').value = '';
  document.getElementById('manual-fat').value = '';
  document.getElementById('manual-prot').value = '';

  // Populate meal selector
  const sel = document.getElementById('manual-meal-select');
  sel.innerHTML = MEAL_NAMES.map((m, i) =>
    `<option value="${m}" ${m === selMeal ? 'selected' : ''}>${MEAL_LABELS[i]}</option>`
  ).join('');

  modal.classList.add('open');
}

function closeManualDayModal() {
  document.getElementById('manual-day-modal')?.classList.remove('open');
}

function saveManualEntry() {
  const naam = (document.getElementById('manual-naam').value || '').trim() || 'Handmatige invoer';
  const kcal = Math.round(parseFloat(document.getElementById('manual-kcal').value) || 0);
  const carbs = r1(parseFloat(document.getElementById('manual-carbs').value) || 0);
  const fiber = r1(parseFloat(document.getElementById('manual-fiber').value) || 0);
  const fat = r1(parseFloat(document.getElementById('manual-fat').value) || 0);
  const prot = r1(parseFloat(document.getElementById('manual-prot').value) || 0);
  const meal = document.getElementById('manual-meal-select').value;

  if (kcal === 0 && carbs === 0 && fat === 0 && prot === 0) {
    alert('Vul minstens één waarde in.');
    return;
  }

  const item = {
    naam,
    kcal,
    koolhydraten_g: carbs,
    vezels_g: fiber,
    vetten_g: fat,
    eiwitten_g: prot,
    portie: 'handmatig',
  };

  const dk = currentDate;
  if (!localData[dk]) localData[dk] = emptyDay();
  normalizeDayData(localData[dk]);
  localData[dk][meal].push(item);

  // Persist locally
  const all = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
  all[dk] = localData[dk];
  localStorage.setItem(LOCAL_KEY, JSON.stringify(all));

  // Sync to Supabase
  saveDay(dk, localData[dk]);

  // Re-render and close
  renderMeals();
  closeManualDayModal();
}

export function initManualDayEntry() {
  // Save
  document.getElementById('manual-save-btn')?.addEventListener('click', saveManualEntry);

  // Cancel
  document.getElementById('manual-cancel-btn')?.addEventListener('click', closeManualDayModal);

  // Close on backdrop
  document.getElementById('manual-day-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('manual-day-modal')) closeManualDayModal();
  });
}
