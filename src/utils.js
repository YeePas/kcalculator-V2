/* ── Pure Utility Functions ────────────────────────────────── */

import { MEAL_NAMES } from './constants.js';

// ── Date helpers ──────────────────────────────────────────
export function dateKey(d) {
  return d.toISOString().slice(0, 10);
}

export function formatDate(key) {
  const d = new Date(key + 'T12:00:00');
  const today = new Date();
  if (key === dateKey(today)) return 'Vandaag';
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (key === dateKey(yesterday)) return 'Gisteren';
  return d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
}

// ── Day structure ─────────────────────────────────────────
export function emptyDay() {
  const d = {};
  MEAL_NAMES.forEach(m => { d[m] = []; });
  return d;
}

export function normalizeDayData(raw) {
  if (!raw) return emptyDay();
  const day = {};
  MEAL_NAMES.forEach(m => {
    day[m] = Array.isArray(raw[m]) ? raw[m] : [];
  });
  return day;
}

// ── HTML escaping ─────────────────────────────────────────
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(str) {
  return String(str).replace(/[&<>"']/g, ch => ESC_MAP[ch]);
}

export function highlightMatches(text, terms) {
  const source = String(text || '');
  const needles = Array.from(new Set((terms || [])
    .map(term => String(term || '').trim().toLowerCase())
    .filter(term => term.length >= 2)))
    .sort((a, b) => b.length - a.length);

  if (needles.length === 0) return esc(source);

  let html = '';
  let idx = 0;
  while (idx < source.length) {
    const lowerSlice = source.slice(idx).toLowerCase();
    const match = needles.find(term => lowerSlice.startsWith(term));
    if (match) {
      html += `<mark>${esc(source.slice(idx, idx + match.length))}</mark>`;
      idx += match.length;
      continue;
    }
    html += esc(source[idx]);
    idx += 1;
  }
  return html;
}

// ── Numeric helpers ───────────────────────────────────────
export function pct(val, goal) {
  return goal ? Math.min(Math.round((val / goal) * 100), 100) : 0;
}

export function r1(n) {
  return Math.round(n * 10) / 10;
}

export function fmtVal(val, goal, unit) {
  const rv = r1(val);
  if (!goal) return `<strong>${rv}</strong>${unit}`;
  const over = val > goal;
  return `<strong${over ? ' style="color:var(--danger)"' : ''}>${rv}</strong><span style="color:var(--tertiary)">/${goal}${unit}</span>`;
}

// ── Day totals ────────────────────────────────────────────
export function dayTotals(day) {
  let cals = 0, carbs = 0, fat = 0, prot = 0, fiber = 0, water = 0;
  MEAL_NAMES.forEach(m => {
    for (const item of (day[m] || [])) {
      cals += item.kcal || 0;
      carbs += item.koolhydraten_g || 0;
      fat += item.vetten_g || 0;
      prot += item.eiwitten_g || 0;
      fiber += item.vezels_g || 0;
      water += item.ml || 0;
    }
  });
  return { cals, carbs, fat, prot, fiber, water };
}
