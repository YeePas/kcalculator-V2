/* ── Data-Overzicht: Chart Rendering ────────────────────── */

import { goals } from '../state.js';
import { esc } from '../utils.js';

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
  const W = 600, H = 200, padL = 40, padR = 10, padT = 15, padB = 28;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  let maxVal = 100;
  for (const d of days) maxVal = Math.max(maxVal, d.intake, d.tdee_kcal || 0);
  if (goals.kcal) maxVal = Math.max(maxVal, goals.kcal);
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
      const filledIntake = Math.min(d.intake, d.tdee_kcal || d.intake);
      const h = (filledIntake / maxVal) * plotH, y = padT + plotH - h;
      const fill = intakeBarColor(d.intake, goals.kcal);
      const remainingToTdee = Math.max((d.tdee_kcal || 0) - d.intake, 0);
      if (remainingToTdee > 0) {
        const stackTopY = toY(d.tdee_kcal || 0);
        const stackH = Math.max(y - stackTopY, 0);
        if (stackH > 0) {
          svg += `<rect x="${x}" y="${stackTopY}" width="${barW}" height="${stackH}" rx="2" fill="var(--tdee-line)" opacity="0.22"><title>${d.date}: nog ${Math.round(remainingToTdee)} kcal tot TDEE</title></rect>`;
        }
      }
      svg += `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="2" fill="${fill}" opacity="0.75"><title>${d.date}: ${d.intake} kcal</title></rect>`;
      const labelY = Math.max(y - 6, padT + 8);
      svg += `<text x="${x + barW / 2}" y="${labelY}" text-anchor="middle" fill="var(--text)" font-size="7.5" font-weight="700" font-family="var(--font-body)">${Math.round(d.intake)}</text>`;
    }
  }
  if (a.daysWithEnergy > 0) {
    const pts = [];
    for (let i = 0; i < n; i++) { if (days[i].tdee_kcal > 0) pts.push({ x: toX(i), y: toY(days[i].tdee_kcal) }); }
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
  const MIN_LABEL_H = 14;
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
    const d = days[i], x = padL + i * gap + (gap - barW) / 2, cx = x + barW / 2;
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
      if (h >= MIN_LABEL_H && Math.round(part.val) >= 15) {
        svg += `<text x="${cx}" y="${yOffset + h / 2}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="6.5" font-weight="600" font-family="var(--font-body)" style="pointer-events:none">${Math.round(part.val)}</text>`;
      }
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

export function renderMacroDonutChart(a, container) {
  if (!container) return;
  const totalCarbs = a.avgCarbs * a.activeDays, totalFat = a.avgFat * a.activeDays, totalProt = a.avgProt * a.activeDays;
  const totalG = totalCarbs + totalFat + totalProt;
  if (totalG === 0) { container.innerHTML = ''; return; }
  const slices = [
    { label: 'Koolhydraten', val: totalCarbs, color: 'var(--blue)' },
    { label: 'Vetten', val: totalFat, color: 'var(--danger)' },
    { label: 'Eiwitten', val: totalProt, color: 'var(--green)' },
  ];
  const R = 48, r = 30, cx = 55, cy = 55;
  let svg = '', startAngle = -Math.PI / 2;
  for (const s of slices) {
    const pct = s.val / totalG;
    if (pct < 0.005) continue;
    const angle = pct * Math.PI * 2, endAngle = startAngle + angle, large = angle > Math.PI ? 1 : 0;
    const x1o = cx + R * Math.cos(startAngle), y1o = cy + R * Math.sin(startAngle);
    const x2o = cx + R * Math.cos(endAngle), y2o = cy + R * Math.sin(endAngle);
    const x1i = cx + r * Math.cos(endAngle), y1i = cy + r * Math.sin(endAngle);
    const x2i = cx + r * Math.cos(startAngle), y2i = cy + r * Math.sin(startAngle);
    const d = `M ${x1o} ${y1o} A ${R} ${R} 0 ${large} 1 ${x2o} ${y2o} L ${x1i} ${y1i} A ${r} ${r} 0 ${large} 0 ${x2i} ${y2i} Z`;
    svg += `<path d="${d}" fill="${s.color}" opacity="0.88"><title>${s.label}: ${Math.round(s.val)}g (${Math.round(pct * 100)}%)</title></path>`;
    if (pct >= 0.10) {
      const midAngle = startAngle + angle / 2, labelR = (R + r) / 2;
      svg += `<text x="${cx + labelR * Math.cos(midAngle)}" y="${cy + labelR * Math.sin(midAngle)}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="7.5" font-weight="600" font-family="var(--font-body)">${Math.round(pct * 100)}%</text>`;
    }
    startAngle = endAngle;
  }
  svg += `<text x="${cx}" y="${cy - 3}" text-anchor="middle" fill="var(--text)" font-size="9" font-weight="700" font-family="var(--font-display)">${Math.round(totalG)}g</text>`;
  svg += `<text x="${cx}" y="${cy + 7}" text-anchor="middle" fill="var(--muted)" font-size="6.5" font-family="var(--font-body)">totaal</text>`;
  let legendHtml = '<div class="do-macro-donut-legend">';
  for (const s of slices) {
    const pct = Math.round(s.val / totalG * 100);
    legendHtml += `<div class="do-macro-donut-item"><span class="do-macro-donut-dot" style="background:${s.color}"></span><span>${s.label}</span><span class="do-macro-donut-val">${Math.round(s.val)}g · ${pct}%</span></div>`;
  }
  legendHtml += '</div>';
  container.innerHTML = `<div class="do-macro-donut"><svg viewBox="0 0 110 110" width="70" height="70">${svg}</svg>${legendHtml}</div>`;
}
