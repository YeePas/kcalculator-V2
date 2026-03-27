/* ── Data-Overzicht Page ──────────────────────────────────── */

import {
  localData, cfg, goals, authUser,
  _doCurrentDays, setDoCurrentDays,
} from '../state.js';
import { MEAL_NAMES, LOCAL_KEY } from '../constants.js';
import { dateKey, normalizeDayData, esc, formatDate, dayTotals } from '../utils.js';
import { safeParse } from '../storage.js';
import { refreshDayRange } from '../supabase/data.js';
import { switchMobileView } from '../ui/misc.js';
import { loadEnergyStatsRange, refreshEnergyStatsRange, aggregatePeriod } from './data-overview-data.js';
import { generateInsights } from './data-overview-insights.js';
import { analyzeMealMoments } from './data-overview-meals.js';
import { kpiCard, renderDOChart, renderDOMacroChart, renderMacroDonutChart } from './data-overview-charts.js';
import { exportPeriodCSV, exportWeekrapportPrint } from './export.js';
import { renderWeightChart } from './weight.js';
import { loadWeight } from '../storage.js';

const DATA_OVERVIEW_BLOCKS_KEY = 'kcalculator_data_overview_blocks_v1';
const DATA_OVERVIEW_BLOCKS = [
  { id: 'highlights', label: 'Highlights' },
  { id: 'kpis', label: 'KPI\'s' },
  { id: 'intake', label: 'Intake' },
  { id: 'macros', label: 'Macro\'s' },
  { id: 'meals', label: 'Maaltijden' },
  { id: 'balance', label: 'Energiebalans' },
  { id: 'weight', label: 'Gewicht' },
  { id: 'stats', label: 'Statistieken' },
  { id: 'products', label: 'Producten' },
];

function getDefaultBlockVisibility() {
  return Object.fromEntries(DATA_OVERVIEW_BLOCKS.map(block => [block.id, true]));
}

function loadDataOverviewBlocks() {
  try {
    const raw = JSON.parse(localStorage.getItem(DATA_OVERVIEW_BLOCKS_KEY) || '{}');
    return { ...getDefaultBlockVisibility(), ...raw };
  } catch {
    return getDefaultBlockVisibility();
  }
}

function saveDataOverviewBlocks(visibility) {
  localStorage.setItem(DATA_OVERVIEW_BLOCKS_KEY, JSON.stringify(visibility));
}

function renderBlockToggles(visibility) {
  return (
    '<div class="do-block-toggles">' +
      DATA_OVERVIEW_BLOCKS.map(block => (
        '<button class="do-block-toggle' + (visibility[block.id] !== false ? ' active' : '') + '" type="button" data-do-toggle="' + block.id + '">' +
          (visibility[block.id] !== false ? '✓ ' : '') + block.label +
        '</button>'
      )).join('') +
    '</div>'
  );
}

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
function buildDateKeys(numDays) {
  const dateKeys = [];
  const anchorKey = numDays === 1 ? currentDate : dateKey(new Date());
  const anchorDate = new Date(anchorKey + 'T12:00:00');
  for (let i = numDays - 1; i >= 0; i--) {
    const d = new Date(anchorDate);
    d.setDate(d.getDate() - i);
    dateKeys.push(dateKey(d));
  }
  return dateKeys;
}

function getPeriodLabel(numDays, dateKeys) {
  if (numDays === 1) return formatDate(dateKeys[0]);
  if (numDays === 7) return 'deze week';
  if (numDays === 30) return 'deze maand';
  if (numDays === 365) return 'dit jaar';
  return dateKeys.length + ' dagen';
}

function getOverviewTitle(numDays) {
  if (numDays === 1) return 'Dagoverzicht';
  if (numDays === 7) return 'Weekoverzicht';
  if (numDays === 30) return 'Maandoverzicht';
  if (numDays === 365) return 'Jaaroverzicht';
  return 'Overzicht';
}

function renderMealMacroBar(meal) {
  const split = meal.macroSplit || { carbs: 0, fat: 0, prot: 0 };
  if ((split.carbs + split.fat + split.prot) <= 0) {
    return '<div class="do-meal-macros">Geen macroverdeling beschikbaar</div>';
  }

  return (
    '<div class="do-meal-macro-stack" aria-hidden="true">' +
      (split.carbs > 0 ? '<span class="do-meal-macro-segment carbs" style="width:' + split.carbs + '%"></span>' : '') +
      (split.fat > 0 ? '<span class="do-meal-macro-segment fat" style="width:' + split.fat + '%"></span>' : '') +
      (split.prot > 0 ? '<span class="do-meal-macro-segment prot" style="width:' + split.prot + '%"></span>' : '') +
    '</div>' +
    '<div class="do-meal-macro-split">' +
      '<span>Kh ' + split.carbs + '%</span>' +
      '<span>Vet ' + split.fat + '%</span>' +
      '<span>Eiwit ' + split.prot + '%</span>' +
    '</div>'
  );
}

function buildEntries(dateKeys) {
  const allLocal = safeParse(LOCAL_KEY, {});
  const entries = dateKeys.map(key => {
    const raw = localData[key] || allLocal[key];
    const day = raw ? normalizeDayData(raw) : null;
    return { key, day };
  });

  entries.forEach(entry => {
    if (!entry.day) return;
    const items = [];
    MEAL_NAMES.forEach(meal => {
      const mealKcal = (entry.day[meal] || []).reduce((sum, item) => sum + (item.kcal || 0), 0);
      entry.day['_meal_' + meal] = mealKcal;
      (entry.day[meal] || []).forEach(item => items.push({ ...item, maaltijd: meal }));
    });
    entry.day._items = items;
  });

  return entries;
}

function renderDataOverviewContent(contentEl, numDays, dateKeys, entries, energyMap) {
  const a = aggregatePeriod(entries, goals, dayTotals, energyMap);

  a.days.forEach(dayObj => {
    const entry = entries.find(e => e.key === dayObj.date);
    if (entry?.day) {
      MEAL_NAMES.forEach(meal => { dayObj['_meal_' + meal] = entry.day['_meal_' + meal] || 0; });
      dayObj._items = entry.day._items || [];
    }
  });

  const { insights, consistency, weekdayWeekend, topFoods, extremes } = generateInsights(a, goals);
  const periodLabel = getPeriodLabel(numDays, dateKeys);
  const visibleBlocks = loadDataOverviewBlocks();
  const mealMomentAnalysis = analyzeMealMoments(entries);

  if (a.activeDays === 0) {
    contentEl.innerHTML = '<div class="do-empty">Geen data gevonden voor deze periode.<br>Voeg eerst maaltijden toe!</div>';
    return false;
  }

  let html = renderBlockToggles(visibleBlocks) + '<div class="do-shell">';

  if (visibleBlocks.highlights !== false && insights.length > 0) {
    html += '<section class="do-section do-insights-section">';
    html += sectionHead('🧠 Highlights', periodLabel, insights.length + ' signalen');
    html += '<div class="do-insights-list">';
    for (const ins of insights) {
      const color = ins.priority === 'high' ? 'var(--accent)' : ins.priority === 'medium' ? 'var(--blue)' : 'var(--muted)';
      html += '<span class="do-insight-pill"><span class="do-insight-pill-emoji">' + ins.emoji + '</span><span style="color:' + color + '">' + esc(ins.message) + '</span></span>';
    }
    html += '</div></section>';
  }

  if (visibleBlocks.kpis !== false) {
    html += '<section class="do-overview-hero">';
    html += '<div class="do-overview-copy">';
    html += '<span class="do-eyebrow">Data dashboard</span>';
    html += '<h3>' + getOverviewTitle(numDays) + '</h3>';
    html += '<p>' + (numDays === 1
      ? 'Detailweergave van ' + periodLabel + '. Focus op intake, macroverdeling en maaltijdopbouw van deze dag.'
      : a.activeDays + ' actieve dagen binnen ' + periodLabel + '. Focus op intake, ritme en producten die je patroon bepalen.') + '</p>';
    html += '</div>';
    html += '<div class="do-kpi-grid">';
    html += kpiCard(a.avgIntake, 'kcal/dag', 'var(--accent)');
    html += kpiCard(a.activeDays + '/' + a.totalDays, 'actieve dagen', 'var(--text)');
    html += kpiCard(consistency.score + '%', 'consistentie', consistency.score >= 70 ? 'var(--green)' : consistency.score >= 40 ? '#e67e22' : 'var(--danger)');
    if (a.daysWithEnergy > 0) html += kpiCard((a.avgBalance > 0 ? '+' : '') + a.avgBalance, 'gem. balans', balanceColor(a.avgBalance, true));
    if (goals.kcal) html += kpiCard(a.daysOnTarget, 'op doel', 'var(--green)');
    html += kpiCard(a.avgFiber + 'g', 'vezels/dag', 'var(--fiber)');
    html += '</div></section>';
  }

  html += '<div class="do-main-grid">';

  if (visibleBlocks.intake !== false) {
    html += '<section class="do-section do-feature-card">';
    html += sectionHead(
      '📈 Intake' + (a.daysWithEnergy > 0 ? ' vs verbruik' : ''),
      numDays === 1 ? 'Intake en verbruik op ' + periodLabel : 'Dagelijks verloop over ' + periodLabel,
      goals.kcal ? 'Doel ' + goals.kcal + ' kcal' : ''
    );
    html += '<div class="do-chart" id="do-energy-chart"></div>';
    html += '<div class="do-legend"><span><span class="do-legend-dot" style="background:var(--accent)"></span>Intake</span>';
    if (a.daysWithEnergy > 0) html += '<span><span class="do-legend-dot" style="background:var(--tdee-line)"></span>TDEE</span>';
    if (goals.kcal) html += '<span><span class="do-legend-dot" style="background:var(--muted)"></span>Doel (' + goals.kcal + ')</span>';
    html += '</div>';
    html += '<div style="margin-top:0.8rem;display:flex;justify-content:flex-start;gap:0.55rem;flex-wrap:wrap">'
      + '<button class="btn-secondary" type="button" onclick="document.getElementById(\'settings-import-btn\')?.click()" style="flex:0 0 auto">🍎 Import</button>'
      + '<button class="btn-secondary" type="button" data-action="open-manual-tdee" style="flex:0 0 auto">✏️ TDEE</button>'
      + '</div>';
    html += '</section>';
  }

  if (visibleBlocks.macros !== false) {
    html += '<section class="do-section">';
    html += sectionHead(
      '🥗 Macro-verdeling',
      numDays === 1 ? 'Macroverdeling van deze dag' : 'Per dag gestapeld en als totale verhouding',
      Math.round(a.avgCarbs + a.avgFat + a.avgProt) + 'g gemiddeld'
    );
    html += '<div class="do-split-card do-split-card-macros">';
    html += '<div class="do-split-pane do-split-pane-wide"><div class="do-chart" id="do-macro-chart"></div>';
    html += '<div class="do-legend"><span><span class="do-legend-dot" style="background:var(--blue)"></span>Kh</span><span><span class="do-legend-dot" style="background:var(--danger)"></span>Vet</span><span><span class="do-legend-dot" style="background:var(--green)"></span>Eiwit</span></div></div>';
    html += '<div class="do-split-pane do-split-pane-compact"><div class="do-chart" id="do-macro-donut"></div></div>';
    html += '</div></section>';
  }

  const mealEntries = mealMomentAnalysis.sortedMeals;
  const hasMeals = mealEntries.length > 0;

  if (visibleBlocks.meals !== false && hasMeals) {
    html += '<div class="do-grid-2">';

    html += '<section class="do-section">';
    html += sectionHead(
      '🍽️ Maaltijdanalyse',
      numDays === 1
        ? 'Macroverdeling per eetmoment op ' + periodLabel
        : 'Macroverdeling en bijdrage per eetmoment over ' + periodLabel,
      mealEntries.length + ' eetmomenten'
    );
    html += '<div class="do-meal-grid">';
    for (const [key, meal] of mealEntries.sort((aLeft, bLeft) => bLeft[1].contributionPct - aLeft[1].contributionPct)) {
      const macroLine = numDays === 1
        ? `${r1(meal.totalCarbs)}g kh · ${r1(meal.totalFat)}g vet · ${r1(meal.totalProt)}g eiwit`
        : `${meal.avgCarbs}g kh · ${meal.avgFat}g vet · ${meal.avgProt}g eiwit gemiddeld`;
      const kcalLine = numDays === 1
        ? Math.round(meal.totalKcal) + ' kcal'
        : meal.avgKcal + ' kcal per eetmoment';
      const warnText = numDays === 1
        ? 'neemt >50% van je intake in'
        : meal.excessDays + '× >50% van dagintake';
      html += '<div class="do-meal-card"><div class="do-meal-card-top"><div class="do-meal-title">' + esc(meal.label) + '</div><span class="do-meal-pct">' + meal.contributionPct + '%</span></div><div class="do-meal-detail">' + kcalLine + '</div>';
      html += '<div class="do-meal-macros">' + esc(macroLine) + '</div>';
      html += renderMealMacroBar(meal);
      if (numDays > 1) html += '<div class="do-meal-note">' + meal.daysWithMeal + ' dagen met dit eetmoment</div>';
      if (meal.excessDays > 0) html += '<div class="do-meal-warn">⚠️ ' + warnText + '</div>';
      html += '</div>';
    }
    html += '</div>';
    html += '<div class="do-legend do-legend-tight"><span><span class="do-legend-dot" style="background:var(--blue)"></span>Koolhydraten</span><span><span class="do-legend-dot" style="background:var(--danger)"></span>Vet</span><span><span class="do-legend-dot" style="background:var(--green)"></span>Eiwit</span></div>';
    html += '</section>';

    html += '</div>';
  }

  if (visibleBlocks.balance !== false && a.daysWithEnergy > 0) {
    const cumColor = balanceColor(a.cumulativeBalance, true);
    const totalBalanceLabel = a.cumulativeBalance >= 0 ? 'Totaal overschot' : 'Totaal tekort';
    html += '<section class="do-section">';
    html += sectionHead('⚡ Energiebalans', 'Totaal kcal-tekort of -overschot ten opzichte van je TDEE over ' + periodLabel, formatBalance(a.cumulativeBalance, true));
    html += '<div class="do-stat-grid">';
    html += '<div class="do-stat"><span class="do-stat-label">Gem. intake (met TDEE)</span><span class="do-stat-val">' + a.avgIntakeWithEnergy + ' kcal</span></div>';
    html += '<div class="do-stat"><span class="do-stat-label">Gem. TDEE</span><span class="do-stat-val">' + a.avgTDEE + ' kcal</span></div>';
    html += '<div class="do-stat"><span class="do-stat-label">Gem. rustverbranding</span><span class="do-stat-val">' + a.avgResting + ' kcal</span></div>';
    html += '<div class="do-stat"><span class="do-stat-label">Gem. actief</span><span class="do-stat-val">' + a.avgActive + ' kcal</span></div>';
    html += '<div class="do-stat"><span class="do-stat-label">' + totalBalanceLabel + '</span><span class="do-stat-val" style="color:' + cumColor + '">' + (a.cumulativeBalance > 0 ? '+' : '') + Math.abs(a.cumulativeBalance) + ' kcal</span></div>';
    html += '</div>';
    html += '</section>';
  }

  const weightData = loadWeight();
  const weightEntries = Object.keys(weightData).filter(date => date >= dateKeys[0] && date <= dateKeys[dateKeys.length - 1]);
  if (visibleBlocks.weight !== false && weightEntries.length >= 2) {
    html += '<section class="do-section">';
    html += sectionHead('⚖️ Gewicht', 'Verloop binnen dezelfde periode', weightEntries.length + ' meetpunten');
    html += '<div class="do-chart" id="do-weight-chart"></div></section>';
  }

  const ww = weekdayWeekend;
  const cs = consistency;
  const ex = extremes;
  const hasTopData = topFoods.topCalories.length > 0 || topFoods.mostUsed.length > 0 || topFoods.topProtein.length > 0;

  html += '<div class="do-grid-2">';

  if (visibleBlocks.stats !== false) {
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
  }

  if (visibleBlocks.products !== false && hasTopData) {
    html += '<section class="do-section">';
    html += sectionHead('🍽️ Producten', 'Meest bepalende items binnen deze periode', '');
    html += '<div class="do-products-3col">';
    if (topFoods.topCalories.length > 0) {
      html += '<div class="do-product-panel"><h4>🔥 Kcal</h4>';
      topFoods.topCalories.forEach(product => { html += '<div class="do-product-row"><span>' + esc(product.naam) + '</span><span>' + product.totalKcal + '</span></div>'; });
      html += '</div>';
    }
    if (topFoods.mostUsed.length > 0) {
      html += '<div class="do-product-panel"><h4>📋 Gebruik</h4>';
      topFoods.mostUsed.forEach(product => { html += '<div class="do-product-row"><span>' + esc(product.naam) + '</span><span>' + product.count + '×</span></div>'; });
      html += '</div>';
    }
    if (topFoods.topProtein.length > 0) {
      html += '<div class="do-product-panel"><h4>💪 Eiwit</h4>';
      topFoods.topProtein.forEach(product => { html += '<div class="do-product-row"><span>' + esc(product.naam) + '</span><span>' + product.totalProt + 'g</span></div>'; });
      html += '</div>';
    }
    html += '</div></section>';
  }

  html += '</div>';
  html += '</div>';
  html += '<div class="do-export-bar">';
  html += '<button class="btn-secondary" id="do-export-csv">CSV</button>';
  html += '<button class="btn-secondary" id="do-export-print">Print weekrapport</button>';
  html += '</div>';
  html += '</div>';

  contentEl.innerHTML = html;
  renderDOChart(a, document.getElementById('do-energy-chart'));
  renderDOMacroChart(a, document.getElementById('do-macro-chart'));
  renderMacroDonutChart(a, document.getElementById('do-macro-donut'));

  contentEl.querySelectorAll('[data-do-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const nextVisibility = loadDataOverviewBlocks();
      const id = btn.dataset.doToggle;
      nextVisibility[id] = nextVisibility[id] === false;
      saveDataOverviewBlocks(nextVisibility);
      renderDataOverzicht(numDays);
    });
  });

  document.getElementById('do-export-csv')?.addEventListener('click', () => exportPeriodCSV(numDays));
  document.getElementById('do-export-print')?.addEventListener('click', () => exportWeekrapportPrint());
  renderWeightChart(document.getElementById('do-weight-chart'), numDays);

  return true;
}

export async function renderDataOverzicht(numDays, options = {}) {
  const { backgroundRefresh = true } = options;
  const contentEl = document.getElementById('do-content');
  if (!contentEl) return;

  const dateKeys = buildDateKeys(numDays);
  const dateFrom = dateKeys[0];
  const dateTo = dateKeys[dateKeys.length - 1];

  try {
    const entries = buildEntries(dateKeys);
    const energyMap = await loadEnergyStatsRange(dateFrom, dateTo, { preferCache: true });
    const hasCachedData = entries.some(entry => !!entry.day) || Object.keys(energyMap).length > 0;

    if (hasCachedData || !backgroundRefresh || !cfg.sbUrl || !cfg.sbKey || !authUser?.id) {
      renderDataOverviewContent(contentEl, numDays, dateKeys, entries, energyMap);
    } else {
      contentEl.innerHTML = '<div class="do-empty">Laden…</div>';
    }

    if (backgroundRefresh && cfg.sbUrl && cfg.sbKey && authUser?.id) {
      const [dayRefresh, energyRefresh] = await Promise.all([
        refreshDayRange(dateFrom, dateTo),
        refreshEnergyStatsRange(dateFrom, dateTo),
      ]);
      if (dayRefresh.changed || energyRefresh.changed || !hasCachedData) {
        await renderDataOverzicht(numDays, { backgroundRefresh: false });
      }
      return;
    }

    if (!hasCachedData) {
      contentEl.innerHTML = '<div class="do-empty">Geen data gevonden voor deze periode.<br>Voeg eerst maaltijden toe!</div>';
    }
  } catch (err) {
    console.error('[renderDataOverzicht]', err);
    contentEl.innerHTML = '<div class="do-empty">Data-overzicht kon niet laden.<br><small style="color:var(--danger)">' + esc(err?.message || 'Onbekende fout') + '</small></div>';
  }
}
