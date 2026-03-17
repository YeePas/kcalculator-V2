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
import { kpiCard, renderDOChart, renderDOMacroChart, renderMacroDonutChart } from './data-overview-charts.js';
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

function sectionHead(title, sub, meta) {
  return (
    '<div class="do-section-head">' +
      '<div>' +
        '<h3>' + title + '</h3>' +
        (sub ? '<div class="do-section-sub">' + sub + '</div>' : '') +
      '</div>' +
      (meta ? '<div class="do-section-meta">' + meta + '</div>' : '') +
    '</div>'
  );
}

/* ── Navigation ──────────────────────────────────────────── */
export function openWeekModal() {
  const layout = document.querySelector('.layout');
  if (!layout) return;
  layout.classList.remove('show-import', 'show-admin', 'show-advies',
    'mobile-view-invoer', 'mobile-view-overzicht', 'mobile-view-advies', 'mobile-view-import', 'mobile-view-admin');
  if (window.innerWidth >= 781) {
    layout.classList.toggle('show-data');
    if (layout.classList.contains('show-data')) renderDataOverzicht(_doCurrentDays);
  } else {
    layout.classList.remove('show-data');
    layout.classList.add('mobile-view-data');
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

    let html = '<div class="do-shell">';

    // Smart insights
    if (insights.length > 0) {
      html += '<section class="do-section do-insights-section">';
      html += sectionHead('🧠 Highlights', periodLabel, insights.length + ' signalen');
      html += '<div class="do-insights-list">';
      for (const ins of insights) {
        const color = ins.priority === 'high' ? 'var(--accent)' : ins.priority === 'medium' ? 'var(--blue)' : 'var(--muted)';
        html += '<span class="do-insight-pill"><span class="do-insight-pill-emoji">' + ins.emoji + '</span><span style="color:' + color + '">' + esc(ins.message) + '</span></span>';
      }
      html += '</div></section>';
    }

    // KPIs
    html += '<section class="do-overview-hero">';
    html += '<div class="do-overview-copy">';
    html += '<span class="do-eyebrow">Data dashboard</span>';
    html += '<h3>' + (numDays === 7 ? 'Weekoverzicht' : numDays === 30 ? 'Maandoverzicht' : numDays === 365 ? 'Jaaroverzicht' : 'Overzicht') + '</h3>';
    html += '<p>' + a.activeDays + ' actieve dagen binnen ' + periodLabel + '. Focus op intake, ritme en producten die je patroon bepalen.</p>';
    html += '</div>';
    html += '<div class="do-kpi-grid">';
    html += kpiCard(a.avgIntake, 'kcal/dag', 'var(--accent)');
    html += kpiCard(a.activeDays + '/' + a.totalDays, 'actieve dagen', 'var(--text)');
    html += kpiCard(consistency.score + '%', 'consistentie', consistency.score >= 70 ? 'var(--green)' : consistency.score >= 40 ? '#e67e22' : 'var(--danger)');
    if (a.daysWithEnergy > 0) html += kpiCard((a.avgBalance > 0 ? '+' : '') + a.avgBalance, 'gem. balans', balanceColor(a.avgBalance, true));
    if (goals.kcal) html += kpiCard(a.daysOnTarget, 'op doel', 'var(--green)');
    html += kpiCard(a.avgFiber + 'g', 'vezels/dag', 'var(--fiber)');
    html += '</div></section>';

    html += '<div class="do-main-grid">';

    // Energy chart
    html += '<section class="do-section do-feature-card">';
    html += sectionHead(
      '📈 Intake' + (a.daysWithEnergy > 0 ? ' vs verbruik' : ''),
      'Dagelijks verloop over ' + periodLabel,
      goals.kcal ? 'Doel ' + goals.kcal + ' kcal' : ''
    );
    html += '<div class="do-chart" id="do-energy-chart"></div>';
    html += '<div class="do-legend"><span><span class="do-legend-dot" style="background:var(--accent)"></span>Intake</span>';
    if (a.daysWithEnergy > 0) html += '<span><span class="do-legend-dot" style="background:var(--tdee-line)"></span>TDEE</span>';
    if (goals.kcal) html += '<span><span class="do-legend-dot" style="background:var(--muted)"></span>Doel (' + goals.kcal + ')</span>';
    html += '</div></section>';

    // Macro chart + donut
    html += '<section class="do-section">';
    html += sectionHead('🥗 Macro-verdeling', 'Per dag gestapeld en als totale verhouding', Math.round(a.avgCarbs + a.avgFat + a.avgProt) + 'g gemiddeld');
    html += '<div class="do-split-card do-split-card-macros">';
    html += '<div class="do-split-pane do-split-pane-wide"><div class="do-chart" id="do-macro-chart"></div>';
    html += '<div class="do-legend"><span><span class="do-legend-dot" style="background:var(--blue)"></span>Kh</span><span><span class="do-legend-dot" style="background:var(--danger)"></span>Vet</span><span><span class="do-legend-dot" style="background:var(--green)"></span>Eiwit</span></div></div>';
    html += '<div class="do-split-pane do-split-pane-compact"><div class="do-chart" id="do-macro-donut"></div></div>';
    html += '</div></section>';

    // Meal analysis + Micronutrients
    const mealEntries = Object.entries(mealAnalysis.meals).filter(([_, m]) => m.daysWithMeal > 0);
    const allPeriodItemsForMicro = entries.flatMap(({ day }) => {
      if (!day) return [];
      return MEAL_NAMES.flatMap(m => (day[m] || []));
    });
    const hasMeals = mealEntries.length > 0;
    const hasMicro = allPeriodItemsForMicro.length > 0;

    if (hasMeals || hasMicro) {
      html += '<div class="do-grid-2">';

      if (hasMeals) {
        html += '<section class="do-section">';
        html += sectionHead('🍽️ Maaltijdanalyse', 'Hoeveel elke maaltijd bijdraagt aan je totale intake', mealEntries.length + ' eetmomenten');
        html += '<div class="do-meal-grid">';
        for (const [key, m] of mealEntries.sort((a, b) => b[1].contributionPct - a[1].contributionPct)) {
          html += '<div class="do-meal-card"><div class="do-meal-card-top"><div class="do-meal-title">' + esc(m.label) + '</div><span class="do-meal-pct">' + m.contributionPct + '%</span></div><div class="do-meal-detail">' + m.avgKcal + ' kcal/dag</div>';
          if (m.excessDays > 0) html += '<div class="do-meal-warn">⚠️ ' + m.excessDays + '× >50%</div>';
          html += '</div>';
        }
        html += '</div></section>';
      }

      if (hasMicro) {
        html += '<section class="do-section">';
        html += sectionHead('💊 Micronutriënten', 'Gem./dag · ' + a.activeDays + ' dagen · 💡 = bronnen bij tekort', '(schatting)');
        html += '<div id="do-micro-chart"></div></section>';
      }

      html += '</div>';
    }

    // Energy balance
    if (a.daysWithEnergy > 0) {
      const cumColor = balanceColor(a.cumulativeBalance, true);
      html += '<section class="do-section">';
      html += sectionHead('⚡ Energiebalans', 'Relatie tussen intake, verbruik en activiteit', formatBalance(a.cumulativeBalance, true));
      html += '<div class="do-stat-grid">';
      html += '<div class="do-stat"><span class="do-stat-label">Gem. intake</span><span class="do-stat-val">' + a.avgIntake + ' kcal</span></div>';
      html += '<div class="do-stat"><span class="do-stat-label">Gem. TDEE</span><span class="do-stat-val">' + a.avgTDEE + ' kcal</span></div>';
      html += '<div class="do-stat"><span class="do-stat-label">Gem. actief</span><span class="do-stat-val">' + a.avgActive + ' kcal</span></div>';
      html += '<div class="do-stat"><span class="do-stat-label">Netto</span><span class="do-stat-val" style="color:' + cumColor + '">' + (a.cumulativeBalance > 0 ? '+' : '') + a.cumulativeBalance + ' kcal</span></div>';
      html += '</div></section>';
    }

    // Weight chart
    const weightData = loadWeight();
    const weightEntries = Object.keys(weightData).filter(d => d >= dateKeys[0] && d <= dateKeys[dateKeys.length - 1]);
    if (weightEntries.length >= 2) {
      html += '<section class="do-section">';
      html += sectionHead('⚖️ Gewicht', 'Verloop binnen dezelfde periode', weightEntries.length + ' meetpunten');
      html += '<div class="do-chart" id="do-weight-chart"></div></section>';
    }

    // Statistieken + Producten
    const ww = weekdayWeekend;
    const cs = consistency;
    const ex = extremes;
    const hasTopData = topFoods.topCalories.length > 0 || topFoods.mostUsed.length > 0 || topFoods.topProtein.length > 0;

    html += '<div class="do-grid-2">';

    // Statistieken
    html += '<section class="do-section">';
    html += sectionHead('📊 Statistieken', 'Variatie, ritme en uitschieters', a.totalDays + ' dagen');
    html += '<div class="do-stat-grid">';
    html += '<div class="do-stat"><span class="do-stat-label">Consistentie</span><span class="do-stat-val" style="color:' + (cs.score >= 70 ? 'var(--green)' : cs.score >= 40 ? '#e67e22' : 'var(--danger)') + '">' + cs.score + '%</span></div>';
    html += '<div class="do-stat"><span class="do-stat-label">Spreiding</span><span class="do-stat-val">' + cs.intakeStdDev + ' kcal σ</span></div>';
    if (ww.weekday.days > 0 && ww.weekend.days > 0) {
      const diff = ww.differences.intakeDiff;
      html += '<div class="do-stat"><span class="do-stat-label">Weekdag</span><span class="do-stat-val">' + ww.weekday.avgIntake + ' kcal</span></div>';
      html += '<div class="do-stat"><span class="do-stat-label">Weekend</span><span class="do-stat-val">' + ww.weekend.avgIntake + ' kcal <small style="color:' + (Math.abs(diff) > 200 ? 'var(--danger)' : 'var(--muted)') + '">(' + (diff > 0 ? '+' : '') + diff + ')</small></span></div>';
    }
    if (ex.highestIntake) html += '<div class="do-stat"><span class="do-stat-label">Hoogste</span><span class="do-stat-val">' + ex.highestIntake.value + ' kcal <small>' + formatDate(ex.highestIntake.date) + '</small></span></div>';
    if (ex.lowestIntake) html += '<div class="do-stat"><span class="do-stat-label">Laagste</span><span class="do-stat-val">' + ex.lowestIntake.value + ' kcal <small>' + formatDate(ex.lowestIntake.date) + '</small></span></div>';
    html += '</div></section>';

    // Producten
    if (hasTopData) {
      html += '<section class="do-section">';
      html += sectionHead('🍽️ Producten', 'Meest bepalende items binnen deze periode', '');
      html += '<div class="do-products-3col">';
      if (topFoods.topCalories.length > 0) {
        html += '<div class="do-product-panel"><h4>🔥 Kcal</h4>';
        topFoods.topCalories.forEach(s => { html += '<div class="do-product-row"><span>' + esc(s.naam) + '</span><span>' + s.totalKcal + '</span></div>'; });
        html += '</div>';
      }
      if (topFoods.mostUsed.length > 0) {
        html += '<div class="do-product-panel"><h4>📋 Gebruik</h4>';
        topFoods.mostUsed.forEach(s => { html += '<div class="do-product-row"><span>' + esc(s.naam) + '</span><span>' + s.count + '×</span></div>'; });
        html += '</div>';
      }
      if (topFoods.topProtein.length > 0) {
        html += '<div class="do-product-panel"><h4>💪 Eiwit</h4>';
        topFoods.topProtein.forEach(s => { html += '<div class="do-product-row"><span>' + esc(s.naam) + '</span><span>' + s.totalProt + 'g</span></div>'; });
        html += '</div>';
      }
      html += '</div></section>';
    }

    html += '</div>'; // close stats+products grid
    html += '</div>'; // close main grid

    // Export
    html += '<div class="do-export-bar">';
    html += '<button class="btn-secondary" id="do-export-csv">CSV</button>';
    html += '<button class="btn-secondary" id="do-export-print">Print weekrapport</button>';
    html += '</div>';
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
