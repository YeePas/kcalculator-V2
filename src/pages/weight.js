/* ── Body Weight Tracking ─────────────────────────────────── */

import { dateKey } from '../utils.js';
import { loadWeight, saveWeight } from '../storage.js';
import { syncUserPrefs } from '../supabase/sync.js';

export function openWeightModal() {
  const modal = document.getElementById('weight-modal');
  if (!modal) return;
  const input = document.getElementById('weight-input');
  const dateInput = document.getElementById('weight-date-input');
  const today = dateKey(new Date());
  if (dateInput) dateInput.value = today;
  const data = loadWeight();
  if (input) input.value = data[today] || '';
  modal.classList.add('open');
}

export function saveWeightEntry() {
  const input = document.getElementById('weight-input');
  const dateInput = document.getElementById('weight-date-input');
  if (!input || !dateInput) return;
  const val = parseFloat(String(input.value).replace(',', '.'));
  const date = dateInput.value;
  if (!date || isNaN(val) || val < 20 || val > 300) return;
  const data = loadWeight();
  data[date] = Math.round(val * 10) / 10;
  saveWeight(data);
  syncUserPrefs(false);
  document.getElementById('weight-modal')?.classList.remove('open');
  updateWeightDisplay();
}

export function updateWeightDisplay() {
  const el = document.getElementById('weight-current');
  if (!el) return;
  const data = loadWeight();
  const today = dateKey(new Date());
  const recent = Object.entries(data)
    .filter(([d]) => d <= today)
    .sort((a, b) => b[0].localeCompare(a[0]));
  if (recent.length > 0) {
    el.textContent = recent[0][1] + ' kg';
    el.style.display = '';
  } else {
    el.textContent = '';
    el.style.display = 'none';
  }
}

export function initWeightListeners() {
  document.getElementById('log-weight-btn')?.addEventListener('click', openWeightModal);
  document.getElementById('weight-save-btn')?.addEventListener('click', saveWeightEntry);
  document.getElementById('weight-modal')?.addEventListener('click', e => {
    if (e.target.id === 'weight-modal') document.getElementById('weight-modal').classList.remove('open');
  });
  updateWeightDisplay();
}

/* ── Weight chart for data-overview ─────────────────────────── */
export function renderWeightChart(container, numDays) {
  if (!container) return;
  const data = loadWeight();
  const entries = [];
  for (let i = numDays - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = dateKey(d);
    if (data[key] !== undefined) entries.push({ date: key, weight: data[key] });
  }
  if (entries.length < 2) {
    container.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--muted);font-size:0.8rem">Minimaal 2 metingen nodig voor grafiek</div>';
    return;
  }

  const W = 600, H = 180, padL = 44, padR = 10, padT = 15, padB = 28;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const weights = entries.map(e => e.weight);
  const minW = Math.floor(Math.min(...weights) - 1);
  const maxW = Math.ceil(Math.max(...weights) + 1);
  const range = maxW - minW || 1;
  const toY = v => padT + plotH - ((v - minW) / range) * plotH;
  const toX = i => padL + (i / Math.max(entries.length - 1, 1)) * plotW;

  let svg = '';
  const steps = 4;
  const stepSize = range / steps;
  for (let i = 0; i <= steps; i++) {
    const val = minW + stepSize * i;
    const y = toY(val);
    svg += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--border)" stroke-width="0.5"/>`;
    svg += `<text x="${padL - 4}" y="${y + 3}" text-anchor="end" fill="var(--muted)" font-size="8" font-family="var(--font-body)">${Math.round(val * 10) / 10}</text>`;
  }

  // Line path
  let path = `M ${toX(0)} ${toY(entries[0].weight)}`;
  for (let i = 1; i < entries.length; i++) {
    const cpx = (toX(i - 1) + toX(i)) / 2;
    path += ` C ${cpx} ${toY(entries[i - 1].weight)}, ${cpx} ${toY(entries[i].weight)}, ${toX(i)} ${toY(entries[i].weight)}`;
  }
  svg += `<path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"/>`;

  // Dots
  for (let i = 0; i < entries.length; i++) {
    const x = toX(i), y = toY(entries[i].weight);
    svg += `<circle cx="${x}" cy="${y}" r="3.5" fill="var(--accent)" stroke="white" stroke-width="1.5"><title>${entries[i].date}: ${entries[i].weight} kg</title></circle>`;
  }

  // X-axis labels
  const n = entries.length;
  const labelEvery = n <= 14 ? 1 : n <= 60 ? 7 : 30;
  for (let i = 0; i < n; i++) {
    if (i % labelEvery !== 0 && i !== n - 1) continue;
    const d = new Date(entries[i].date + 'T12:00:00');
    const label = n <= 14 ? d.toLocaleDateString('nl', { day: 'numeric', month: 'short' }) : d.toLocaleDateString('nl', { day: 'numeric', month: 'short' });
    svg += `<text x="${toX(i)}" y="${H - 5}" text-anchor="middle" fill="var(--muted)" font-size="7.5" font-family="var(--font-body)">${label}</text>`;
  }

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${svg}</svg>`;
}
