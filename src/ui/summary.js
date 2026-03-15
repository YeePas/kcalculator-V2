/* ── Summary Rendering ─────────────────────────────────────── */

import { goals } from '../state.js';
import { MEAL_NAMES, MEAL_LABELS } from '../constants.js';
import { r1, pct, fmtVal, dayTotals } from '../utils.js';

function getCalorieOverageTone(goal, calories) {
  if (!goal || calories <= goal) return null;
  const overBy = calories - goal;
  if (overBy < 250) return { className: 'warning', colorVar: 'var(--warning)' };
  if (overBy < 500) return { className: 'warning-strong', colorVar: 'var(--warning-strong)' };
  return { className: 'red', colorVar: 'var(--danger)' };
}

function setBar(id, val, goal, cls) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.width = pct(val, goal || Math.max(val, 1)) + '%';
  el.className = 'bar-fill ' + (goal && val > goal ? 'bar-over' : cls);
}

export function renderSummary(day) {
  const { cals, carbs, fat, prot, fiber, water } = dayTotals(day);

  const C = 295.3;
  const ringEl = document.getElementById('cal-ring-fill');
  const pctCals = goals.kcal ? Math.min(cals / goals.kcal, 1) : 0;
  const overageTone = getCalorieOverageTone(goals.kcal, cals);
  ringEl.style.strokeDashoffset = C * (1 - pctCals);
  ringEl.setAttribute('class', 'ring-fill ' + (overageTone?.className || (pctCals >= 0.8 ? 'orange' : 'green')));

  const calNumEl = document.getElementById('total-cals');
  calNumEl.textContent = Math.round(cals);
  calNumEl.className = 'cal-ring-number' + (overageTone ? ' over' : '');
  calNumEl.style.color = overageTone ? overageTone.colorVar : '';

  const restKcal = goals.kcal ? goals.kcal - Math.round(cals) : null;
  document.getElementById('cal-ring-label').textContent = goals.kcal ? (restKcal >= 0 ? `van ${goals.kcal}` : 'te veel!') : 'kcal';

  const infoRest = document.getElementById('ring-info-rest');
  infoRest.innerHTML = goals.kcal
    ? (restKcal >= 0 ? `<strong>${restKcal}</strong> kcal over` : `<span style="color:${overageTone?.colorVar || 'var(--danger)'}"><strong>${Math.abs(restKcal)}</strong> kcal te veel</span>`)
    : '';
  document.getElementById('ring-info-prot').innerHTML = `<strong>${r1(prot)}g</strong> eiwit`;
  document.getElementById('ring-info-fat').innerHTML = `<strong>${r1(fat)}g</strong> vet`;

  import('../ui/charts.js').then(m => m.renderMacroDonut(carbs, fat, prot));
  renderMealShare(day, cals);

  document.getElementById('total-carbs').innerHTML = fmtVal(carbs, goals.carbs, 'g');
  document.getElementById('total-fat').innerHTML = fmtVal(fat, goals.fat, 'g');
  document.getElementById('total-prot').innerHTML = fmtVal(prot, goals.prot, 'g');
  document.getElementById('total-fiber').innerHTML = fmtVal(fiber, goals.fiber, 'g');
  document.getElementById('total-water').innerHTML = fmtVal(water, goals.water, 'ml');

  setBar('bar-c', carbs, goals.carbs, 'bar-c');
  setBar('bar-v', fat, goals.fat, 'bar-v');
  setBar('bar-e', prot, goals.prot, 'bar-e');
  setBar('bar-f', fiber, goals.fiber, 'bar-f');
  setBar('bar-w', water, goals.water, 'bar-w');
}

function renderMealShare(day, totalCals) {
  const wrapEl = document.getElementById('meal-share-wrap');
  const listEl = document.getElementById('meal-share-list');
  const totalEl = document.getElementById('meal-share-total');
  if (!wrapEl || !listEl || !totalEl) return;

  totalEl.textContent = `${Math.round(totalCals)} kcal`;

  const meals = MEAL_NAMES
    .map(meal => {
      const mealCals = (day[meal] || []).reduce((sum, item) => sum + (item.kcal || 0), 0);
      const pctOfDay = totalCals > 0 ? Math.round((mealCals / totalCals) * 100) : 0;
      return { meal, label: (MEAL_LABELS[meal] || meal).replace(/^[^\s]+\s/, ''), mealCals, pctOfDay };
    })
    .filter(entry => entry.mealCals > 0)
    .sort((a, b) => b.mealCals - a.mealCals);

  if (!meals.length) {
    wrapEl.style.display = 'none';
    listEl.innerHTML = '';
    return;
  }

  wrapEl.style.display = '';
  listEl.innerHTML = meals.map(entry => `
    <div class="meal-share-item">
      <div class="meal-share-row">
        <span class="meal-share-name">${entry.label}</span>
        <span class="meal-share-values">${entry.pctOfDay}% · ${Math.round(entry.mealCals)} kcal</span>
      </div>
      <div class="meal-share-track">
        <div class="meal-share-fill" style="width:${entry.pctOfDay}%"></div>
      </div>
    </div>
  `).join('');
}
