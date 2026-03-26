/* ── Chart Rendering ──────────────────────────────────────── */

import {
  localData, currentDate, goals, authUser, cfg, vis,
} from '../state.js';
import { MEAL_NAMES, LOCAL_KEY } from '../constants.js';
import {
  dateKey, emptyDay, normalizeDayData, dayTotals, r1,
} from '../utils.js';
import { safeParse } from '../storage.js';
import { refreshDayRange } from '../supabase/data.js';

/* ── Macro Donut ──────────────────────────────────────────── */
export function renderMacroDonut(carbs, fat, prot) {
  carbs = Number(carbs) || 0;
  fat   = Number(fat)   || 0;
  prot  = Number(prot)  || 0;
  const svg = document.getElementById('macro-donut-svg');
  const legend = document.getElementById('donut-legend');
  const totalEl = document.getElementById('donut-total');
  if (!svg || !legend || !totalEl) return;
  const total = Math.round(carbs + fat + prot);
  totalEl.textContent = total + 'g';

  const data = [
    { name: 'Koolhydraten', val: carbs, color: 'var(--blue)', hex: getComputedStyle(document.documentElement).getPropertyValue('--blue').trim() },
    { name: 'Vetten', val: fat, color: 'var(--danger)', hex: getComputedStyle(document.documentElement).getPropertyValue('--danger').trim() },
    { name: 'Eiwitten', val: prot, color: 'var(--green)', hex: getComputedStyle(document.documentElement).getPropertyValue('--green').trim() },
  ];

  const r = 32, cx = 40, cy = 40;
  const circumference = 2 * Math.PI * r;

  if (total === 0) {
    svg.innerHTML = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--border)" stroke-width="10"/>`;
    legend.innerHTML = data.map(d =>
      `<div class="macro-legend-item"><div class="macro-legend-dot" style="background:${d.color}"></div><span class="macro-legend-name">${d.name}</span><span class="macro-legend-val">0g</span><span class="macro-legend-pct">—</span></div>`
    ).join('');
    return;
  }

  let offset = 0;
  const arcs = data.map(d => {
    const pctVal = d.val / total;
    const dashLen = pctVal * circumference;
    const gap = circumference - dashLen;
    const arc = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${d.color}" stroke-width="10" stroke-dasharray="${dashLen} ${gap}" stroke-dashoffset="${-offset}" stroke-linecap="butt"/>`;
    offset += dashLen;
    return arc;
  });

  svg.innerHTML = arcs.join('');

  legend.innerHTML = data.map(d => {
    const pctVal = total > 0 ? Math.round(d.val / total * 100) : 0;
    return `<div class="macro-legend-item"><div class="macro-legend-dot" style="background:${d.color}"></div><span class="macro-legend-name">${d.name}</span><span class="macro-legend-val">${r1(d.val)}g</span><span class="macro-legend-pct">${pctVal}%</span></div>`;
  }).join('');
}

/* ── Week Sparkline ──────────────────────────────────────── */
export async function renderWeekSpark(options = {}) {
  const { backgroundRefresh = true } = options;
  const container = document.getElementById('week-spark');
  if (!container) return;

  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    last7.push(dateKey(d));
  }

  const labels = last7.map((d, i) => {
    if (i === 6) return 'Vandaag';
    return new Date(d + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'short' });
  });

  const dateFrom = last7[0];
  const dateTo = last7[last7.length - 1];

  const getLocalValues = () => {
    const allLocal = safeParse(LOCAL_KEY, {});
    return last7.map(d => {
      const raw = localData[d] || allLocal[d];
      const day = raw ? normalizeDayData(raw) : null;
      return day ? dayTotals(day).cals : 0;
    });
  };

  const values = getLocalValues();

  const hasData = values.some(v => v > 0);
  const maxVal = Math.max(...values, goals.kcal || 2000, 100);
  const goalLine = goals.kcal || 2000;

  const W = 280, H = 80, padX = 4, padY = 8;
  const plotW = W - padX * 2, plotH = H - padY * 2;

  const points = values.map((v, i) => {
    const x = padX + (i / 6) * plotW;
    const y = padY + plotH - (v / maxVal) * plotH;
    return { x, y, v };
  });

  const goalY = padY + plotH - (goalLine / maxVal) * plotH;

  let areaPath = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1], curr = points[i];
    const cpx = (prev.x + curr.x) / 2;
    areaPath += ` C ${cpx} ${prev.y}, ${cpx} ${curr.y}, ${curr.x} ${curr.y}`;
  }
  areaPath += ` L ${points[6].x} ${H - padY} L ${points[0].x} ${H - padY} Z`;

  let linePath = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1], curr = points[i];
    const cpx = (prev.x + curr.x) / 2;
    linePath += ` C ${cpx} ${prev.y}, ${cpx} ${curr.y}, ${curr.x} ${curr.y}`;
  }

  const dots = points.map(p => {
    if (p.v === 0) return '';
    const over = goals.kcal && p.v > goals.kcal;
    return `<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="${over ? 'var(--danger)' : 'var(--accent)'}" stroke="var(--surface)" stroke-width="1.5"/>`;
  }).join('');

  const valLabels = points.map(p => {
    if (p.v === 0) return '';
    return `<text x="${p.x}" y="${p.y - 8}" text-anchor="middle" font-size="7.5" font-family="var(--font-body)" font-weight="600" fill="var(--text)">${Math.round(p.v)}</text>`;
  }).join('');

  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.15"/>
          <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      ${hasData ? `<path d="${areaPath}" fill="url(#sparkGrad)"/>` : ''}
      <line x1="${padX}" y1="${goalY}" x2="${W - padX}" y2="${goalY}" stroke="var(--border)" stroke-width="1" stroke-dasharray="4 3"/>
      <text x="${W - padX}" y="${goalY - 3}" text-anchor="end" font-size="6.5" fill="var(--tertiary)" font-family="var(--font-body)">doel ${goalLine}</text>
      ${hasData ? `<path d="${linePath}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"/>` : ''}
      ${dots}
      ${valLabels}
    </svg>
    <div class="week-spark-labels">${labels.map(l => `<span>${l}</span>`).join('')}</div>
    ${hasData ? `<div class="week-spark-avg">Gemiddeld: <strong>${Math.round(values.filter(v => v > 0).reduce((a, b) => a + b, 0) / Math.max(values.filter(v => v > 0).length, 1))} kcal/dag</strong></div>` : '<div class="week-spark-avg" style="color:var(--tertiary);font-style:italic">Nog geen data deze week</div>'}
  `;

  if (backgroundRefresh && cfg.sbUrl && cfg.sbKey && authUser?.id) {
    try {
      const { changed } = await refreshDayRange(dateFrom, dateTo);
      if (changed) await renderWeekSpark({ backgroundRefresh: false });
    } catch {
      /* ignore background refresh errors */
    }
  }
}

/* ── Dashboard (Week modal chart) ────────────────────────── */
export function renderDashboard(numDays) {
  const bodyEl = document.getElementById('week-body');
  const activeMacros = {};
  document.querySelectorAll('.dash-toggle').forEach(el => {
    activeMacros[el.dataset.macro] = el.classList.contains('active');
  });

  const days = [];
  const allLocal = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
  for (let i = numDays - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = dateKey(d);
    const day = localData[key] || allLocal[key] || emptyDay();
    const t = dayTotals(day);
    days.push({
      date: key,
      label: d.toLocaleDateString('nl', { weekday: 'short', day: 'numeric' }),
      shortLabel: d.toLocaleDateString('nl', { day: 'numeric' }),
      kcal: Math.round(t.cals),
      carbs: r1(t.carbs),
      fat: r1(t.fat),
      prot: r1(t.prot),
    });
  }

  const W = 500, H = 220, padL = 35, padR = 10, padT = 10, padB = 30;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const barW = Math.min(chartW / days.length * 0.7, 30);
  const gap = chartW / days.length;

  let maxVal = 0;
  days.forEach(d => {
    if (activeMacros.kcal) maxVal = Math.max(maxVal, d.kcal);
    else {
      let stack = 0;
      if (activeMacros.carbs) stack += d.carbs;
      if (activeMacros.fat) stack += d.fat;
      if (activeMacros.prot) stack += d.prot;
      maxVal = Math.max(maxVal, stack);
    }
  });
  if (maxVal === 0) maxVal = 100;

  const scale = chartH / maxVal;
  const colors = { kcal: 'var(--accent)', carbs: 'var(--blue)', fat: 'var(--danger)', prot: 'var(--green)' };

  let bars = '';
  days.forEach((d, i) => {
    const x = padL + i * gap + (gap - barW) / 2;
    if (activeMacros.kcal) {
      const h = d.kcal * scale;
      const y = padT + chartH - h;
      bars += `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="3" fill="${colors.kcal}" opacity="0.85"><title>${d.label}: ${d.kcal} kcal</title></rect>`;
      if (goals.kcal) {
        const goalY = padT + chartH - goals.kcal * scale;
        if (goalY > padT) bars += `<line x1="${padL}" y1="${goalY}" x2="${W - padR}" y2="${goalY}" stroke="var(--accent)" stroke-width="1" stroke-dasharray="4 3" opacity="0.4"/>`;
      }
    } else {
      let yOffset = padT + chartH;
      for (const macro of ['prot', 'fat', 'carbs']) {
        if (!activeMacros[macro]) continue;
        const val = d[macro];
        const h = val * scale;
        yOffset -= h;
        bars += `<rect x="${x}" y="${yOffset}" width="${barW}" height="${h}" rx="2" fill="${colors[macro]}" opacity="0.85"><title>${d.label}: ${val}g ${macro}</title></rect>`;
      }
    }
    const labelText = numDays <= 14 ? d.label : d.shortLabel;
    bars += `<text x="${x + barW / 2}" y="${H - 5}" text-anchor="middle" fill="var(--muted)" font-size="9" font-family="var(--font-body)">${labelText}</text>`;
  });

  const steps = 4;
  let yLabels = '';
  for (let i = 0; i <= steps; i++) {
    const val = Math.round(maxVal / steps * i);
    const y = padT + chartH - (chartH / steps * i);
    yLabels += `<text x="${padL - 4}" y="${y + 3}" text-anchor="end" fill="var(--tertiary)" font-size="8" font-family="var(--font-body)">${val}</text>`;
    yLabels += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--border)" stroke-width="0.5"/>`;
  }

  const svg = `<svg viewBox="0 0 ${W} ${H}" class="dash-chart">${yLabels}${bars}</svg>`;

  const activeDays = days.filter(d => d.kcal > 0);
  const n = activeDays.length || 1;
  const avgKcal = Math.round(activeDays.reduce((s, d) => s + d.kcal, 0) / n);
  const avgCarbs = r1(activeDays.reduce((s, d) => s + d.carbs, 0) / n);
  const avgFat = r1(activeDays.reduce((s, d) => s + d.fat, 0) / n);
  const avgProt = r1(activeDays.reduce((s, d) => s + d.prot, 0) / n);

  const avgHtml = `<div class="dash-avg-row">
    <div class="dash-avg-item"><span class="dash-avg-val" style="color:var(--accent)">${avgKcal}</span><span class="dash-avg-label">kcal/dag</span></div>
    <div class="dash-avg-item"><span class="dash-avg-val" style="color:var(--blue)">${avgCarbs}g</span><span class="dash-avg-label">koolh</span></div>
    <div class="dash-avg-item"><span class="dash-avg-val" style="color:var(--danger)">${avgFat}g</span><span class="dash-avg-label">vet</span></div>
    <div class="dash-avg-item"><span class="dash-avg-val" style="color:var(--green)">${avgProt}g</span><span class="dash-avg-label">eiwit</span></div>
  </div>`;

  bodyEl.innerHTML = svg + avgHtml;
}
