/* ── Summary Rendering ─────────────────────────────────────── */

import { renderSchijfMini } from './schijf-mini.js';
import { goals } from '../state.js';
import { r1, pct, fmtVal, dayTotals } from '../utils.js';
import { renderMacroDonut } from './charts.js';

function getCalorieOverageTone(goal, calories) {
  if (!goal || calories <= goal) return null;
  const overBy = calories - goal;
  if (overBy < 250) return { className: 'warning', colorVar: 'var(--warning)' };
  if (overBy < 500) return { className: 'warning-strong', colorVar: 'var(--warning-strong)' };
  return { className: 'red', colorVar: 'var(--danger)' };
}

function renderGoalDelta(current, goal, unit, label, decimals = 1) {
  if (!goal) {
    const value = decimals === 0 ? Math.round(current) : r1(current);
    return `<strong>${value}${unit}</strong> ${label}`;
  }

  const diff = goal - current;
  if (diff >= 0) {
    const value = decimals === 0 ? Math.round(diff) : r1(diff);
    return `<strong>${value}${unit}</strong> ${label} over`;
  }

  const value = decimals === 0 ? Math.round(Math.abs(diff)) : r1(Math.abs(diff));
  return `<span style="color:var(--danger)"><strong>${value}${unit}</strong> ${label} te veel</span>`;
}

export function renderSummary(day) {
  const { cals, carbs, fat, prot, fiber, water } = dayTotals(day);
  renderSchijfMini(day).catch(() => {});

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
  renderDayProgress(cals, prot, restKcal, overageTone);
  document.getElementById('ring-info-carbs').innerHTML = renderGoalDelta(carbs, goals.carbs, 'g', 'kh');
  document.getElementById('ring-info-prot').innerHTML = renderGoalDelta(prot, goals.prot, 'g', 'eiwit');
  document.getElementById('ring-info-fat').innerHTML = renderGoalDelta(fat, goals.fat, 'g', 'vet');

  document.getElementById('ring-info-fiber').innerHTML = renderGoalDelta(fiber, goals.fiber, 'g', 'vezels');
  // Drinks: amount against the goal with a thin bar, the only place on the main page that shows it
  document.getElementById('ring-info-water').innerHTML = `💧 ${fmtVal(water, goals.water, 'ml')}`
    + (goals.water ? `<span class="ring-info-water-track"><span style="width:${pct(water, goals.water)}%"></span></span>` : '');

  renderMacroDonut(carbs, fat, prot);
}

// Compact remaining-kcal strip above the input on mobile, where the summary lives on another tab.
function renderDayProgress(cals, prot, restKcal, overageTone) {
  const wrap = document.getElementById('day-progress');
  const text = document.getElementById('day-progress-text');
  const fill = document.getElementById('day-progress-fill');
  if (!wrap || !text || !fill) return;
  wrap.classList.toggle('no-goal', !goals.kcal);
  if (!goals.kcal) return;

  const kcalPart = restKcal >= 0
    ? `<strong>${restKcal}</strong> kcal over`
    : `<span style="color:${overageTone?.colorVar || 'var(--danger)'}"><strong>${Math.abs(restKcal)}</strong> kcal te veel</span>`;
  const protRest = goals.prot ? Math.round(goals.prot - prot) : null;
  const protPart = protRest !== null && protRest > 0 ? ` · <strong>${protRest}g</strong> eiwit over` : '';
  text.innerHTML = `${kcalPart}${protPart}<span class="day-progress-total">${Math.round(cals)} / ${goals.kcal}</span>`;
  fill.style.width = pct(cals, goals.kcal) + '%';
  fill.style.background = overageTone ? overageTone.colorVar : '';
}
