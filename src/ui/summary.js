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
  document.getElementById('ring-info-carbs').innerHTML = `<strong>${r1(carbs)}g</strong> koolhydraten`;
  document.getElementById('ring-info-prot').innerHTML = `<strong>${r1(prot)}g</strong> eiwit`;
  document.getElementById('ring-info-fat').innerHTML = `<strong>${r1(fat)}g</strong> vet`;

  const mealShareTotalEl = document.getElementById('meal-share-total');
  const mealShareListEl = document.getElementById('meal-share-list');
  const mealShares = MEAL_NAMES
    .map(meal => {
      const mealCalories = Math.round((day?.[meal] || []).reduce((sum, item) => sum + (Number(item?.kcal) || 0), 0));
      return {
        meal,
        label: MEAL_LABELS[meal] || meal,
        kcal: mealCalories,
        pct: cals > 0 ? Math.round((mealCalories / cals) * 100) : 0,
      };
    })
    .filter(item => item.kcal > 0)
    .sort((a, b) => b.kcal - a.kcal);

  if (mealShareTotalEl) mealShareTotalEl.textContent = `${Math.round(cals)} kcal`;
  if (mealShareListEl) {
    mealShareListEl.innerHTML = mealShares.length
      ? mealShares.map(item => `
          <div class="meal-share-row">
            <div class="meal-share-row-head">
              <span class="meal-share-row-name">${item.label}</span>
              <span class="meal-share-row-meta">${item.pct}% · ${item.kcal} kcal</span>
            </div>
            <div class="bar-track meal-share-track">
              <div class="bar-fill bar-e" style="width:${item.pct}%"></div>
            </div>
          </div>
        `).join('')
      : '<div class="meal-share-empty">Nog geen eetmomenten ingevuld.</div>';
  }

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
