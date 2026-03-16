/* ── Data-Overzicht Page ──────────────────────────────────── */

import {
  localData, cfg, goals, authUser,
  _doCurrentDays, setDoCurrentDays,
} from '../state.js';
import { MEAL_NAMES, LOCAL_KEY } from '../constants.js';
import { dateKey, emptyDay, normalizeDayData, esc, formatDate, dayTotals } from '../utils.js';
import { safeParse } from '../storage.js';
import { sbHeaders } from '../supabase/config.js';
import { switchMobileView } from '../ui/misc.js';
import { loadEnergyStatsRange, aggregatePeriod } from './data-overview-data.js';
import { generateInsights } from './data-overview-insights.js';
import { kpiCard, doInsight, renderDOChart, renderDOMacroChart, renderMacroDonutChart } from './data-overview-charts.js';
import { exportPeriodCSV, exportWeekrapportPrint } from './export.js';
import { renderWeightChart } from './weight.js';
import { loadWeight } from '../storage.js';

function balanceColor(balance, hasData) {
  if (!hasData || balance === null || balance === undefined) return 'var(--muted)';
  if (balance < -300) return 'var(--green)';
  if (balance < -100) return '#5cb85c';
  if (balance < 100) return 'var(--text)';
  if (balance < 300) return '#e67e22';
  return 'var(--danger)';
}

function formatBalance(balance, hasData) {
  if (!hasData || balance === null || balance === undefined) return '—';
  return (balance > 0 ? '+' : '') + balance + ' kcal';
}

/* ── Navigation ──────────────────────────────────────────── */
export function openWeekModal() {
  const layout = document.querySelector('.layout');
  if (!layout) return;
  layout.classList.remove('show-import', 'show-admin');
  if (window.innerWidth >= 781) {
    layout.classList.toggle('show-data');
    if (layout.classList.contains('show-data')) renderDataOverzicht(_doCurrentDays);
  } else {
    switchMobileView('data');
    document.querySelectorAll('.mobile-tab').forEach((t, i) => t.classList.toggle('active', i === 2));
    renderDataOverzicht(_doCurrentDays);
  }
}

export function closeDataOverzicht() {
  const layout = document.querySelector('.layout');
  if (!layout) return;
  layout.classList.remove('show-data');
  if (window.innerWidth < 781) {
    switchMobileView('invoer');
    document.querySelectorAll('.mobile-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
  }
}

export function switchDOPeriod(days, btn) {
  setDoCurrentDays(days);
  document.querySelectorAll('.do-period-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderDataOverzicht(days);
}

/* ── Main Render ─────────────────────────────────────────── */
export async function renderDataOverzicht(numDays) {
  const contentEl = document.getElementById('do-content');
  if (!contentEl) return;
  contentEl.innerHTML = '<div class="do-empty">Laden…</div>';

  try {
    const dateKeys = [];
    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      dateKeys.push(dateKey(d));
    }
    const dateFrom = dateKeys[0], dateTo = dateKeys[dateKeys.length - 1];

    let dbData = null;
    if (cfg.sbUrl && cfg.sbKey && authUser?.id) {
      try {
        const r = await fetch(cfg.sbUrl + '/rest/v1/eetdagboek?date=gte.' + dateFrom + '&date=lte.' + dateTo + '&select=date,data', { headers: sbHeaders() });
        if (r.ok) { const rows = await r.json(); dbData = {}; rows.forEach(row => { dbData[row.date] = { ...emptyDay(), ...row.data }; }); }
      } catch (e) { /* ignore */ }
    }

    const allLocal = safeParse(LOCAL_KEY, {});
    const entries = dateKeys.map(key => {
      const raw = (dbData && dbData[key]) || localData[key] || allLocal[key];
      const day = raw ? normalizeDayData(raw) : null;
      return { key, day };
    });

    // Enrich entries with per-meal kcal for insights
    entries.forEach(({ key, day }) => {
      if (!day) return;
      const d = entries.find(e => e.key === key);
      if (d) {
        const items = [];
        MEAL_NAMES.forEach(m => {
          const mKcal = (day[m] || []).reduce((s, i) => s + (i.kcal || 0), 0);
          if (d.day) d.day['_meal_' + m] = mKcal;
          (day[m] || []).forEach(i => items.push({ ...i, maaltijd: m }));
        });
        if (d.day) d.day._items = items;
      }
    });

    const energyMap = await loadEnergyStatsRange(dateFrom, dateTo);
    const a = aggregatePeriod(entries, goals, dayTotals, energyMap);

    a.days.forEach(dayObj => {
      const entry = entries.find(e => e.key === dayObj.date);
      if (entry?.day) {
        MEAL_NAMES.forEach(m => { dayObj['_meal_' + m] = entry.day['_meal_' + m] || 0; });
        dayObj._items = entry.day._items || [];
      }
    });

    const { insights, consistency, weekdayWeekend, mealAnalysis, topFoods, extremes } = generateInsights(a, goals);
    const periodLabel = numDays === 7 ? 'deze week' : numDays === 30 ? 'deze maand' : numDays === 365 ? 'dit jaar' : a.totalDays + ' dagen';

    if (a.activeDays === 0) {
      contentEl.innerHTML = '<div class="do-empty">Geen data gevonden voor deze periode.<br>Voeg eerst maaltijden toe!</div>';
      return;
    }

    let html = '';

    // Smart insights
    if (insights.length > 0) {
      html += '<div class="do-section do-insights-section"><h3>🧠 Smart Insights</h3>';
      html += '<div class="do-section-sub">Automatische analyse van ' + periodLabel + '</div>';
      html += '<div class="do-insights-list">';
      for (const ins of insights) {
        const border = ins.priority === 'high' ? 'var(--accent)' : ins.priority === 'medium' ? 'var(--blue)' : 'var(--border)';
        html += '<div class="do-insight-item" style="border-left:3px solid ' + border + '"><span class="do-insight-emoji">' + ins.emoji + '</span><span>' + esc(ins.message) + '</span></div>';
      }
      html += '</div></div>';
    }

    // KPIs
    html += '<div class="do-kpi-grid">';
    html += kpiCard(a.avgIntake, 'kcal/dag', 'var(--accent)');
    html += kpiCard(a.activeDays + '/' + a.totalDays, 'actieve dagen', 'var(--text)');
    html += kpiCard(consistency.score + '%', 'consistentie', consistency.score >= 70 ? 'var(--green)' : consistency.score >= 40 ? '#e67e22' : 'var(--danger)');
    if (a.daysWithEnergy > 0) html += kpiCard((a.avgBalance > 0 ? '+' : '') + a.avgBalance, 'gem. balans/dag', balanceColor(a.avgBalance, true));
    if (goals.kcal) html += kpiCard(a.daysOnTarget, 'dagen op doel', 'var(--green)');
    html += kpiCard(a.avgFiber + 'g', 'vezels/dag', 'var(--fiber)');
    html += '</div>';

    // Energy chart
    html += '<div class="do-section"><h3>📈 Dagelijkse intake' + (a.daysWithEnergy > 0 ? ' vs verbruik' : '') + '</h3>';
    html += '<div class="do-chart" id="do-energy-chart"></div>';
    html += '<div class="do-legend"><span><span class="do-legend-dot" style="background:var(--accent)"></span>Intake</span>';
    if (a.daysWithEnergy > 0) html += '<span><span class="do-legend-dot" style="background:var(--tdee-line)"></span>TDEE</span>';
    if (goals.kcal) html += '<span><span class="do-legend-dot" style="background:var(--muted)"></span>Doel (' + goals.kcal + ')</span>';
    html += '</div></div>';

    // Macro chart
    html += '<div class="do-section"><h3>🥗 Macro-verdeling</h3>';
    html += '<div class="do-section-sub">Dagelijkse verdeling in gram — ' + periodLabel + ' (' + a.activeDays + ' dagen met invoer)</div>';
    html += '<div class="do-chart" id="do-macro-chart"></div>';
    html += '<div class="do-legend" style="margin-bottom:1rem"><span><span class="do-legend-dot" style="background:var(--blue)"></span>Koolhydraten</span><span><span class="do-legend-dot" style="background:var(--danger)"></span>Vetten</span><span><span class="do-legend-dot" style="background:var(--green)"></span>Eiwitten</span></div>';
    html += '<h4 style="font-family:var(--font-display);font-size:0.92rem;margin:0 0 0.5rem">Macroverdeling ' + periodLabel + ' (%)</h4>';
    html += '<div class="do-chart" id="do-macro-donut"></div></div>';

    // Meal analysis
    const mealEntries = Object.entries(mealAnalysis.meals).filter(([_, m]) => m.daysWithMeal > 0);
    if (mealEntries.length > 0) {
      html += '<div class="do-section"><h3>🍽️ Maaltijdanalyse</h3>';
      html += '<div class="do-section-sub">Bijdrage per maaltijdtype in ' + periodLabel + '</div>';
      html += '<div class="do-meal-grid">';
      for (const [key, m] of mealEntries.sort((a, b) => b[1].contributionPct - a[1].contributionPct)) {
        html += '<div class="do-meal-card"><div class="do-meal-title">' + esc(m.label) + '</div><div class="do-meal-pct">' + m.contributionPct + '%</div><div class="do-meal-detail">' + m.avgKcal + ' kcal/dag</div>';
        if (m.excessDays > 0) html += '<div class="do-meal-warn">⚠️ ' + m.excessDays + '× >50% dagintake</div>';
        html += '</div>';
      }
      html += '</div></div>';
    }

    // Energy balance
    if (a.daysWithEnergy > 0) {
      const cumColor = balanceColor(a.cumulativeBalance, true);
      html += '<div class="do-section"><h3>⚡ Energiebalans</h3>';
      html += '<div class="do-section-sub">Op basis van ' + a.daysWithEnergy + ' dagen met verbruiksdata in ' + periodLabel + '</div>';
      html += '<div class="do-insight-grid">';
      html += doInsight('Gem. intake', a.avgIntake + ' kcal/dag');
      html += doInsight('Gem. TDEE', a.avgTDEE + ' kcal/dag');
      html += doInsight('Gem. actief', a.avgActive + ' kcal/dag');
      html += doInsight('Gem. rust', a.avgResting + ' kcal/dag');
      html += doInsight('Netto ' + periodLabel, '<span style="color:' + cumColor + '">' + (a.cumulativeBalance > 0 ? '+' : '') + a.cumulativeBalance + ' kcal</span>');
      html += '</div></div>';
    }

    // Weight chart
    const weightData = loadWeight();
    const weightEntries = Object.keys(weightData).filter(d => d >= dateKeys[0] && d <= dateKeys[dateKeys.length - 1]);
    if (weightEntries.length >= 2) {
      html += '<div class="do-section"><h3>Gewicht</h3>';
      html += '<div class="do-chart" id="do-weight-chart"></div></div>';
    }

    // Weekday vs weekend
    const ww = weekdayWeekend;
    if (ww.weekday.days > 0 && ww.weekend.days > 0) {
      html += '<div class="do-section"><h3>📅 Weekdag vs Weekend</h3><div class="do-insight-grid">';
      html += doInsight('Weekdag (' + ww.weekday.days + ' dagen)', ww.weekday.avgIntake + ' kcal/dag');
      html += doInsight('Weekend (' + ww.weekend.days + ' dagen)', ww.weekend.avgIntake + ' kcal/dag');
      const diff = ww.differences.intakeDiff;
      html += doInsight('Verschil', '<span style="color:' + (Math.abs(diff) > 200 ? 'var(--danger)' : 'var(--green)') + '">' + (diff > 0 ? '+' : '') + diff + ' kcal/dag</span>');
      html += '</div></div>';
    }

    // Consistency
    html += '<div class="do-section"><h3>🎯 Consistentie</h3><div class="do-insight-grid">';
    const cs = consistency;
    html += doInsight('Score', '<span style="font-size:1.3rem;font-weight:700;color:' + (cs.score >= 70 ? 'var(--green)' : cs.score >= 40 ? '#e67e22' : 'var(--danger)') + '">' + cs.score + '%</span>');
    html += doInsight('Standaarddeviatie', cs.intakeStdDev + ' kcal');
    html += doInsight('Afwijkdagen (>300 kcal)', cs.deviationDays + ' van ' + a.activeDays + ' dagen');
    html += doInsight('Datacompleetheid', cs.completeness + '%');
    html += '</div></div>';

    // Extremes
    const ex = extremes;
    if (ex.highestIntake || ex.lowestIntake || ex.biggestSurplus || ex.biggestDeficit || ex.highestActivity) {
      html += '<div class="do-section"><h3>📊 Schommelingen & extremen</h3><div class="do-insight-grid">';
      if (ex.highestIntake) html += doInsight('Hoogste intake', ex.highestIntake.value + ' kcal<br><small style="color:var(--muted)">' + formatDate(ex.highestIntake.date) + '</small>');
      if (ex.lowestIntake) html += doInsight('Laagste intake', ex.lowestIntake.value + ' kcal<br><small style="color:var(--muted)">' + formatDate(ex.lowestIntake.date) + '</small>');
      if (ex.biggestSurplus) html += doInsight('Grootste overschot', '<span style="color:var(--danger)">+' + ex.biggestSurplus.value + ' kcal</span><br><small style="color:var(--muted)">' + formatDate(ex.biggestSurplus.date) + '</small>');
      if (ex.biggestDeficit) html += doInsight('Grootste tekort', '<span style="color:var(--green)">' + ex.biggestDeficit.value + ' kcal</span><br><small style="color:var(--muted)">' + formatDate(ex.biggestDeficit.date) + '</small>');
      if (ex.highestActivity) html += doInsight('Actiefste dag', ex.highestActivity.value + ' kcal actief<br><small style="color:var(--muted)">' + formatDate(ex.highestActivity.date) + '</small>');
      html += '</div></div>';
    }

    // Top calorie sources
    if (topFoods.topCalories.length > 0) {
      html += '<div class="do-section"><h3>🔥 Top caloriebronnen</h3>';
      if (topFoods.dominanceRatio > 30) html += '<div class="do-section-sub">' + topFoods.dominanceRatio + '% van je intake komt uit de top 3 producten</div>';
      html += '<ul class="do-top-list">';
      topFoods.topCalories.forEach(s => { html += '<li><span>' + esc(s.naam) + ' <small style="color:var(--muted)">×' + s.count + '</small></span><span>' + s.totalKcal + ' kcal</span></li>'; });
      html += '</ul></div>';
    }

    if (topFoods.mostUsed.length > 0) {
      html += '<div class="do-section"><h3>📋 Meest gebruikt</h3>';
      html += '<div class="do-section-sub">' + topFoods.uniqueProducts + ' unieke producten in ' + periodLabel + '</div>';
      html += '<ul class="do-top-list">';
      topFoods.mostUsed.forEach(s => { html += '<li><span>' + esc(s.naam) + '</span><span>' + s.count + '×</span></li>'; });
      html += '</ul></div>';
    }

    if (topFoods.topProtein.length > 0) {
      html += '<div class="do-section"><h3>💪 Top eiwitbronnen</h3>';
      html += '<ul class="do-top-list">';
      topFoods.topProtein.forEach(s => { html += '<li><span>' + esc(s.naam) + '</span><span>' + s.totalProt + 'g</span></li>'; });
      html += '</ul></div>';
    }

    // Export buttons (bottom, subtle)
    html += '<div style="display:flex;gap:0.5rem;justify-content:center;padding:1.5rem 0 0.5rem;border-top:1px solid var(--border);margin-top:1rem">';
    html += '<button class="btn-secondary" id="do-export-csv" style="font-size:0.72rem;padding:0.3rem 0.7rem;opacity:0.7">📄 CSV export</button>';
    html += '<button class="btn-secondary" id="do-export-print" style="font-size:0.72rem;padding:0.3rem 0.7rem;opacity:0.7">🖨️ Weekrapport printen</button>';
    html += '</div>';

    contentEl.innerHTML = html;
    renderDOChart(a, document.getElementById('do-energy-chart'));
    renderDOMacroChart(a, document.getElementById('do-macro-chart'));
    renderMacroDonutChart(a, document.getElementById('do-macro-donut'));

    document.getElementById('do-export-csv')?.addEventListener('click', () => exportPeriodCSV(numDays));
    document.getElementById('do-export-print')?.addEventListener('click', () => exportWeekrapportPrint());
    renderWeightChart(document.getElementById('do-weight-chart'), numDays);
  } catch (err) {
    console.error('[renderDataOverzicht]', err);
    contentEl.innerHTML = '<div class="do-empty">Data-overzicht kon niet laden.<br><small style="color:var(--danger)">' + esc(err?.message || 'Onbekende fout') + '</small></div>';
  }
}
