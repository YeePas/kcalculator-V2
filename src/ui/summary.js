/* ── Summary Rendering ─────────────────────────────────────── */

import { renderSchijfMini } from './schijf-mini.js';
import { goals } from '../state.js';
import { pct, dayTotals } from '../utils.js';

function getCalorieOverageTone(goal, calories) {
  if (!goal || calories <= goal) return null;
  const overBy = calories - goal;
  if (overBy < 250) return { className: 'warning', colorVar: 'var(--warning)' };
  if (overBy < 500) return { className: 'warning-strong', colorVar: 'var(--warning-strong)' };
  return { className: 'red', colorVar: 'var(--danger)' };
}

const SUMMARY_STYLE_KEY = 'kcalculator_summary_style';
// Kcal gets its own colour so it is not confused with protein (green)
const KCAL_COLOR = 'var(--fiber)';
const MACROS = [
  { key: 'carbs', goal: 'carbs', label: 'Koolhydraten', color: 'var(--blue)' },
  { key: 'prot', goal: 'prot', label: 'Eiwit', color: 'var(--green)' },
  { key: 'fat', goal: 'fat', label: 'Vet', color: 'var(--danger)' },
];

export function getSummaryStyle() {
  try { return localStorage.getItem(SUMMARY_STYLE_KEY) === 'rings' ? 'rings' : 'bars'; } catch { return 'bars'; }
}

export function setSummaryStyle(style) {
  try { localStorage.setItem(SUMMARY_STYLE_KEY, style); } catch {}
}

// Ring arc for value/goal; well over the goal the ring turns red
function ringArc(r, value, goal, color, width) {
  const circumference = 2 * Math.PI * r;
  const ratio = goal ? Math.min(value / goal, 1) : 0;
  const stroke = goal && value > goal * 1.1 ? 'var(--danger)' : color;
  return `<circle cx="65" cy="65" r="${r}" fill="none" stroke="var(--border)" stroke-width="${width}" opacity="0.7"/>`
    + `<circle cx="65" cy="65" r="${r}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round"`
    + ` stroke-dasharray="${circumference}" stroke-dashoffset="${circumference * (1 - ratio)}" class="summary-ring-arc"/>`;
}

function macroShare(totals) {
  const sum = totals.carbs + totals.fat + totals.prot;
  return key => (sum > 0 ? Math.round((totals[key] / sum) * 100) : 0);
}

function amount(value, goal, unit) {
  return `<strong>${Math.round(value)}<small>${goal ? ' / ' + goal : ''}${unit}</small></strong>`;
}

// Rings: kcal outside, then carbs, protein and fat, each filling up to its goal
function renderRings(totals, overageTone) {
  const share = macroShare(totals);
  const kcalColor = overageTone?.colorVar || KCAL_COLOR;
  return `<div class="summary-rings">
      <svg viewBox="0 0 130 130" aria-hidden="true">
        ${ringArc(58, totals.cals, goals.kcal, kcalColor, 10)}
        ${MACROS.map((macro, idx) => ringArc(45 - idx * 11, totals[macro.key], goals[macro.goal], macro.color, 7)).join('')}
      </svg>
    </div>
    <div class="summary-legend">
      <div class="summary-legend-row is-kcal"><i style="background:${kcalColor}"></i><span>Kcal</span>${amount(totals.cals, goals.kcal, '')}<em></em></div>
      ${MACROS.map(macro => `<div class="summary-legend-row"><i style="background:${macro.color}"></i><span>${macro.label}</span>${amount(totals[macro.key], goals[macro.goal], 'g')}<em>${share(macro.key)}%</em></div>`).join('')}
    </div>`;
}

// Ring and bars: the kcal ring with the number inside, and a bar per macro
function renderBars(totals, overageTone) {
  const share = macroShare(totals);
  const kcalColor = overageTone?.colorVar || KCAL_COLOR;
  const label = goals.kcal ? `van ${goals.kcal}` : 'kcal';
  return `<div class="summary-rings is-single">
      <svg viewBox="0 0 130 130" aria-hidden="true">${ringArc(56, totals.cals, goals.kcal, kcalColor, 11)}</svg>
      <div class="summary-ring-center"><strong${overageTone ? ` style="color:${overageTone.colorVar}"` : ''}>${Math.round(totals.cals)}</strong><small>${label}</small></div>
    </div>
    <div class="summary-bars">
      ${MACROS.map(macro => {
        const goal = goals[macro.goal];
        const value = totals[macro.key];
        const over = goal && value > goal * 1.1;
        return `<div class="summary-bar">
          <div class="summary-bar-head"><span>${macro.label}</span>${amount(value, goal, 'g')}<em>${share(macro.key)}%</em></div>
          <div class="summary-bar-track"><span style="width:${pct(value, goal || Math.max(value, 1))}%;background:${over ? 'var(--danger)' : macro.color}"></span></div>
        </div>`;
      }).join('')}
    </div>`;
}

export function renderSummary(day) {
  const totals = dayTotals(day);
  renderSchijfMini(day).catch(() => {});

  const overageTone = getCalorieOverageTone(goals.kcal, totals.cals);
  const restKcal = goals.kcal ? goals.kcal - Math.round(totals.cals) : null;
  renderDayProgress(totals.cals, totals.prot, restKcal, overageTone);

  const style = getSummaryStyle();
  const wrap = document.getElementById('day-summary');
  if (wrap) {
    wrap.dataset.style = style;
    wrap.innerHTML = style === 'bars' ? renderBars(totals, overageTone) : renderRings(totals, overageTone);
  }
  document.querySelectorAll('[data-summary-style]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.summaryStyle === style);
    btn.setAttribute('aria-pressed', String(btn.dataset.summaryStyle === style));
  });
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
