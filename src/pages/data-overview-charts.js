/* ── Data-Overzicht: Chart Rendering ────────────────────── */

import { goals } from '../state.js';
import { esc, dateKey } from '../utils.js';

export function kpiCard(value, label, color) {
  return '<div class="do-kpi"><div class="do-kpi-val" style="color:' + color + '">' + value + '</div><div class="do-kpi-label">' + esc(label) + '</div></div>';
}

export function doInsight(label, value) {
  return '<div class="do-insight"><strong>' + value + '</strong>' + esc(label) + '</div>';
}

function getRoundedAxis(maxVal, steps) {
  steps = steps || 4;
  const roughStep = Math.max(100, maxVal / steps);
  const stepSize = Math.ceil(roughStep / 100) * 100;
  return { axisMax: stepSize * steps, stepSize };
}

export function getIntakeChartAxisMax(days, goal) {
  const maxIntake = days.reduce((highest, day) => Math.max(highest, day.intake || 0), 0);
  const paddedMax = maxIntake > 0 ? maxIntake + 300 : 100;
  return Math.max(paddedMax, goal || 0, 100);
}

function intakeBarColor(intake, goal) {
  if (!goal || intake <= goal) return 'var(--accent)';
  const surplus = intake - goal;
  if (surplus < 250) return 'var(--warning)';
  if (surplus < 500) return 'var(--warning-strong)';
  return 'var(--danger)';
}

export function renderDOChart(a, container) {
  if (!container) return;
  const days = a.days, n = days.length;
  if (n === 0) { container.innerHTML = ''; return; }
  const todayKey = dateKey(new Date());
  const W = 600, H = 200, padL = 40, padR = 10, padT = 24, padB = 28;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const MIN_SEGMENT_LABEL_H = 16;
  let maxVal = getIntakeChartAxisMax(days, goals.kcal);
  const { axisMax, stepSize } = getRoundedAxis(maxVal, 4);
  maxVal = axisMax;
  const toY = v => padT + plotH - (v / maxVal) * plotH;
  const toX = i => padL + (i / Math.max(n - 1, 1)) * plotW;
  let svg = '';
  for (let i = 0; i <= 4; i++) {
    const val = stepSize * i, y = toY(val);
    svg += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--border)" stroke-width="0.5"/>`;
    svg += `<text x="${padL - 4}" y="${y + 3}" text-anchor="end" fill="var(--muted)" font-size="8" font-family="var(--font-body)">${val}</text>`;
  }
  if (goals.kcal) {
    const gy = toY(goals.kcal);
    svg += `<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" stroke="var(--muted)" stroke-width="1" stroke-dasharray="4 3" opacity="0.5"/>`;
  }
  const barW = Math.min(plotW / n * 0.65, 18), gap = plotW / n;
  for (let i = 0; i < n; i++) {
    const d = days[i], x = padL + i * gap + (gap - barW) / 2;
    if (d.intake > 0) {
      const hasComparableTdee = (d.tdee_kcal || 0) > 0 && d.date !== todayKey;
      const filledIntake = Math.min(d.intake, hasComparableTdee ? d.tdee_kcal : d.intake);
      const h = (filledIntake / maxVal) * plotH, y = padT + plotH - h;
      const fill = intakeBarColor(d.intake, goals.kcal);
      const remainingToTdee = hasComparableTdee ? Math.max((d.tdee_kcal || 0) - d.intake, 0) : 0;
      const intakeLabel = String(Math.round(d.intake));
      const balance = hasComparableTdee ? Math.round(d.intake - d.tdee_kcal) : null;
      if (remainingToTdee > 0) {
        const stackTopY = toY(d.tdee_kcal || 0);
        const stackH = Math.max(y - stackTopY, 0);
        if (stackH > 0) {
          svg += `<rect x="${x}" y="${stackTopY}" width="${barW}" height="${stackH}" rx="2" fill="var(--tdee-line)" opacity="0.22"><title>${d.date}: nog ${Math.round(remainingToTdee)} kcal tot TDEE</title></rect>`;
        }
      }
      svg += `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="2" fill="${fill}" opacity="0.75"><title>${d.date}: ${d.intake} kcal</title></rect>`;
      if (h >= MIN_SEGMENT_LABEL_H) {
        svg += `<text x="${x + barW / 2}" y="${y + h / 2}" text-anchor="middle" dominant-baseline="central" fill="rgba(22,30,25,0.85)" font-size="7.5" font-weight="700" font-family="var(--font-body)">${intakeLabel}</text>`;
      } else {
        const labelY = Math.max(y - 6, padT + 8);
        svg += `<text x="${x + barW / 2}" y="${labelY}" text-anchor="middle" fill="var(--text)" font-size="7.5" font-weight="700" font-family="var(--font-body)">${intakeLabel}</text>`;
      }
      if (balance !== null) {
        const topValue = Math.max(d.intake, d.tdee_kcal || 0);
        const balanceLabelY = Math.max(toY(topValue) - 6, 8);
        const balanceFill = balance > 0 ? 'var(--danger)' : 'var(--text)';
        const balanceLabel = `${balance > 0 ? '+' : ''}${balance}`;
        svg += `<text x="${x + barW / 2}" y="${balanceLabelY}" text-anchor="middle" fill="${balanceFill}" font-size="7.2" font-weight="700" font-family="var(--font-body)">${balanceLabel}</text>`;
      }
    }
  }
  if (a.daysWithEnergy > 0) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      if (days[i].tdee_kcal > 0 && days[i].date !== todayKey) pts.push({ x: toX(i), y: toY(days[i].tdee_kcal) });
    }
    if (pts.length > 1) {
      let path = 'M ' + pts[0].x + ' ' + pts[0].y;
      for (let i = 1; i < pts.length; i++) { const cpx = (pts[i-1].x + pts[i].x) / 2; path += ' C ' + cpx + ' ' + pts[i-1].y + ', ' + cpx + ' ' + pts[i].y + ', ' + pts[i].x + ' ' + pts[i].y; }
      svg += `<path d="${path}" fill="none" stroke="var(--tdee-line)" stroke-width="2" stroke-dasharray="5 3" stroke-linecap="round"/>`;
    }
  }
  const labelEvery = n <= 14 ? 1 : n <= 60 ? 7 : 30;
  for (let i = 0; i < n; i++) {
    if (i % labelEvery !== 0 && i !== n - 1) continue;
    const d = new Date(days[i].date + 'T12:00:00');
    const label = n <= 14 ? d.toLocaleDateString('nl', { weekday: 'short', day: 'numeric' }) : n <= 60 ? d.toLocaleDateString('nl', { day: 'numeric', month: 'short' }) : d.toLocaleDateString('nl', { month: 'short' });
    svg += `<text x="${padL + i * gap + gap / 2}" y="${H - 5}" text-anchor="middle" fill="var(--muted)" font-size="7.5" font-family="var(--font-body)">${label}</text>`;
  }
  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${svg}</svg>`;
}

export function renderDOMacroChart(a, container) {
  if (!container) return;
  const days = a.days, n = days.length;
  if (n === 0) { container.innerHTML = ''; return; }
  const W = 600, H = 230, padL = 40, padR = 10, padT = 15, padB = 28;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const gap = plotW / n, barW = Math.min(plotW / n * 0.65, 20);
  let maxVal = 100;
  for (const d of days) maxVal = Math.max(maxVal, parseFloat(d.carbs) + parseFloat(d.fat) + parseFloat(d.prot));
  const { axisMax, stepSize } = getRoundedAxis(maxVal, 4);
  maxVal = axisMax;
  const toY = v => padT + plotH - (v / maxVal) * plotH;
  let svg = '';
  for (let i = 0; i <= 4; i++) {
    const val = stepSize * i, y = toY(val);
    if (i > 0) svg += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--border)" stroke-width="0.4" opacity="0.5"/>`;
    svg += `<text x="${padL - 4}" y="${y + 3}" text-anchor="end" fill="var(--muted)" font-size="8" font-family="var(--font-body)">${val}g</text>`;
  }
  for (let i = 0; i < n; i++) {
    const d = days[i], x = padL + i * gap + (gap - barW) / 2;
    let yOffset = padT + plotH;
    const parts = [
      { val: parseFloat(d.prot) || 0, color: 'var(--green)', label: 'eiwit' },
      { val: parseFloat(d.fat) || 0, color: 'var(--danger)', label: 'vet' },
      { val: parseFloat(d.carbs) || 0, color: 'var(--blue)', label: 'koolhydraten' },
    ];
    for (const part of parts) {
      if (!part.val) continue;
      const h = (part.val / maxVal) * plotH;
      yOffset -= h;
      svg += `<rect x="${x}" y="${yOffset}" width="${barW}" height="${h}" fill="${part.color}" opacity="0.85" rx="1.5"><title>${d.date}: ${Math.round(part.val)}g ${part.label}</title></rect>`;
    }
  }
  const labelEvery = n <= 14 ? 1 : n <= 60 ? 7 : 30;
  for (let i = 0; i < n; i++) {
    if (i % labelEvery !== 0 && i !== n - 1) continue;
    const d = new Date(days[i].date + 'T12:00:00');
    const label = n <= 14 ? d.toLocaleDateString('nl', { weekday: 'short', day: 'numeric' }) : n <= 60 ? d.toLocaleDateString('nl', { day: 'numeric', month: 'short' }) : d.toLocaleDateString('nl', { month: 'short' });
    svg += `<text x="${padL + i * gap + gap / 2}" y="${H - 5}" text-anchor="middle" fill="var(--muted)" font-size="7.5" font-family="var(--font-body)">${label}</text>`;
  }
  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${svg}</svg>`;
}
