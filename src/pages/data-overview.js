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
import { estimateMicroHeuristic, renderMicroDashboard, RDA } from './micronutrients.js';

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
  layout.classList.remove('show-import', 'show-admin', 'show-advies');
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

    // Smart insights (compact 2-col)
    if (insights.length > 0) {
      html += '<div class="do-section do-insights-section" style="padding:0.75rem">';
      html += '<h3 style="margin:0 0 0.3rem;font-size:0.88rem">🧠 Smart Insights <span style="font-weight:400;font-size:0.75rem;color:var(--muted)">— ' + periodLabel + '</span></h3>';
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.3rem">';
      for (const ins of insights) {
        const border = ins.priority === 'high' ? 'var(--accent)' : ins.priority === 'medium' ? 'var(--blue)' : 'var(--border)';
        html += '<div style="display:flex;gap:0.3rem;align-items:flex-start;border-left:2px solid ' + border + ';padding:0.2rem 0.4rem;font-size:0.73rem;line-height:1.3"><span style="flex-shrink:0">' + ins.emoji + '</span><span style="color:var(--text)">' + esc(ins.message) + '</span></div>';
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

    // Micronutrient estimate (heuristic) — right after meal analysis, half-width
    const allPeriodItemsForMicro = entries.flatMap(({ day }) => {
      if (!day) return [];
      return MEAL_NAMES.flatMap(m => (day[m] || []));
    });
    if (allPeriodItemsForMicro.length > 0) {
      html += '<div class="do-section" style="max-width:520px"><h3>💊 Micronutriënten <span style="font-weight:400;font-size:0.78rem;color:var(--muted)">(schatting)</span></h3>';
      html += '<div class="do-section-sub">Gem. per dag · ' + a.activeDays + ' dagen · o.b.v. productcategorie · 💡 = goede bronnen</div>';
      html += '<div id="do-micro-chart"></div></div>';
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

    // Weekday vs weekend + Consistentie + Extremen — compact in één sectie
    const ww = weekdayWeekend;
    const cs = consistency;
    const ex = extremes;
    html += '<div class="do-section"><h3>📊 Statistieken</h3><div class="do-insight-grid">';
    html += doInsight('Consistentie', '<span style="font-weight:700;color:' + (cs.score >= 70 ? 'var(--green)' : cs.score >= 40 ? '#e67e22' : 'var(--danger)') + '">' + cs.score + '%</span>');
    html += doInsight('Spreiding intake', cs.intakeStdDev + ' kcal σ');
    html += doInsight('Datacompleetheid', cs.completeness + '%');
    if (ww.weekday.days > 0 && ww.weekend.days > 0) {
      const diff = ww.differences.intakeDiff;
      html += doInsight('Weekdag', ww.weekday.avgIntake + ' kcal/dag');
      html += doInsight('Weekend', ww.weekend.avgIntake + ' kcal/dag <small style="color:' + (Math.abs(diff) > 200 ? 'var(--danger)' : 'var(--muted)') + '">(' + (diff > 0 ? '+' : '') + diff + ')</small>');
    }
    if (ex.highestIntake) html += doInsight('Hoogste dag', ex.highestIntake.value + ' kcal <small style="color:var(--muted)">' + formatDate(ex.highestIntake.date) + '</small>');
    if (ex.lowestIntake) html += doInsight('Laagste dag', ex.lowestIntake.value + ' kcal <small style="color:var(--muted)">' + formatDate(ex.lowestIntake.date) + '</small>');
    if (ex.biggestSurplus) html += doInsight('Grootste surplus', '<span style="color:var(--danger)">+' + ex.biggestSurplus.value + ' kcal</span> <small style="color:var(--muted)">' + formatDate(ex.biggestSurplus.date) + '</small>');
    if (ex.biggestDeficit) html += doInsight('Grootste tekort', '<span style="color:var(--green)">' + ex.biggestDeficit.value + ' kcal</span> <small style="color:var(--muted)">' + formatDate(ex.biggestDeficit.date) + '</small>');
    html += '</div></div>';

    // Top foods — drie kolommen naast elkaar
    const hasTopData = topFoods.topCalories.length > 0 || topFoods.mostUsed.length > 0 || topFoods.topProtein.length > 0;
    if (hasTopData) {
      html += '<div class="do-section"><h3>🍽️ Producten</h3>';
      html += '<div class="do-section-sub">' + topFoods.uniqueProducts + ' unieke producten in ' + periodLabel + (topFoods.dominanceRatio > 30 ? ' · top 3 = ' + topFoods.dominanceRatio + '% van intake' : '') + '</div>';
      html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.75rem;margin-top:0.5rem">';
      if (topFoods.topCalories.length > 0) {
        html += '<div><div style="font-size:0.72rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.3rem">🔥 Kcal</div>';
        topFoods.topCalories.forEach(s => { html += '<div style="display:flex;justify-content:space-between;font-size:0.73rem;padding:0.1rem 0;border-bottom:1px solid var(--border)"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:65%">' + esc(s.naam) + '</span><span style="color:var(--muted);flex-shrink:0">' + s.totalKcal + '</span></div>'; });
        html += '</div>';
      }
      if (topFoods.mostUsed.length > 0) {
        html += '<div><div style="font-size:0.72rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.3rem">📋 Gebruik</div>';
        topFoods.mostUsed.forEach(s => { html += '<div style="display:flex;justify-content:space-between;font-size:0.73rem;padding:0.1rem 0;border-bottom:1px solid var(--border)"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:65%">' + esc(s.naam) + '</span><span style="color:var(--muted);flex-shrink:0">' + s.count + '×</span></div>'; });
        html += '</div>';
      }
      if (topFoods.topProtein.length > 0) {
        html += '<div><div style="font-size:0.72rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.3rem">💪 Eiwit</div>';
        topFoods.topProtein.forEach(s => { html += '<div style="display:flex;justify-content:space-between;font-size:0.73rem;padding:0.1rem 0;border-bottom:1px solid var(--border)"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:65%">' + esc(s.naam) + '</span><span style="color:var(--muted);flex-shrink:0">' + s.totalProt + 'g</span></div>'; });
        html += '</div>';
      }
      html += '</div></div>';
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

    // Render micronutrient heuristic chart (with food sources for low items)
    const microEl = document.getElementById('do-micro-chart');
    if (microEl && allPeriodItemsForMicro.length > 0) {
      const microTotals = estimateMicroHeuristic(allPeriodItemsForMicro);
      const microAvg = {};
      for (const key of Object.keys(RDA)) {
        microAvg[key] = Math.round((microTotals[key] / Math.max(a.activeDays, 1)) * 10) / 10;
      }
      renderMicroDashboard(microEl, microAvg, 'Schatting gem./dag', true);
    }
  } catch (err) {
    console.error('[renderDataOverzicht]', err);
    contentEl.innerHTML = '<div class="do-empty">Data-overzicht kon niet laden.<br><small style="color:var(--danger)">' + esc(err?.message || 'Onbekende fout') + '</small></div>';
  }
}
