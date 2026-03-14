/* ── Summary Rendering ─────────────────────────────────────── */

import { goals } from '../state.js';
import { r1, pct, fmtVal, dayTotals } from '../utils.js';

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
  ringEl.style.strokeDashoffset = C * (1 - pctCals);
  ringEl.setAttribute('class', 'ring-fill ' + (pctCals >= 1 ? 'red' : pctCals >= 0.8 ? 'orange' : 'green'));

  const calNumEl = document.getElementById('total-cals');
  calNumEl.textContent = Math.round(cals);
  calNumEl.className = 'cal-ring-number' + (goals.kcal && cals > goals.kcal ? ' over' : '');

  const restKcal = goals.kcal ? goals.kcal - Math.round(cals) : null;
  document.getElementById('cal-ring-label').textContent = goals.kcal ? (restKcal >= 0 ? `van ${goals.kcal}` : 'te veel!') : 'kcal';

  const infoRest = document.getElementById('ring-info-rest');
  infoRest.innerHTML = goals.kcal
    ? (restKcal >= 0 ? `<strong>${restKcal}</strong> kcal over` : `<span style="color:var(--danger)"><strong>${Math.abs(restKcal)}</strong> kcal te veel</span>`)
    : '';
  document.getElementById('ring-info-prot').innerHTML = `<strong>${r1(prot)}g</strong> eiwit`;
  document.getElementById('ring-info-fat').innerHTML = `<strong>${r1(fat)}g</strong> vet`;

  import('../ui/charts.js').then(m => m.renderMacroDonut(carbs, fat, prot));

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
