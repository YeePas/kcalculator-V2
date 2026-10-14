/* ── Data-Overzicht Page ──────────────────────────────────── */

import {
  localData, cfg, goals, authUser, currentDate,
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
import { kpiCard, renderDOChart, renderDOMacroChart } from './data-overview-charts.js';
import { schijfDaySnapshot } from './schijf-2026.js';
import { openAdviesModal } from './advies.js';
import { exportPeriodCSV, exportWeekrapportPrint } from './export.js';
import { renderWeightChart } from './weight.js';
import { loadWeight } from '../storage.js';

const DATA_OVERVIEW_BLOCKS_KEY = 'kcalculator_data_overview_blocks_v2';
const DATA_OVERVIEW_BLOCKS = [
  { id: 'summary', label: 'Samenvatting' },
  { id: 'intake', label: 'Intake & energie' },
  { id: 'schijf', label: 'Schijf van Vijf' },
  { id: 'macros', label: 'Macro\'s' },
  { id: 'meals', label: 'Eetmomenten' },
  { id: 'products', label: 'Producten' },
  { id: 'stats', label: 'Uitschieters' },
  { id: 'weight', label: 'Gewicht' },
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

// Everything that is not data sits in one menu: which blocks to show, export and energy data
function renderMenu(visibility) {
  return (
    '<details class="do-menu">' +
      '<summary aria-label="Opties">⋯</summary>' +
      '<div class="do-menu-panel">' +
        '<div class="do-menu-title">Tonen</div>' +
        DATA_OVERVIEW_BLOCKS.map(block => (
          '<label class="do-menu-check"><input type="checkbox" data-do-toggle="' + block.id + '"' + (visibility[block.id] !== false ? ' checked' : '') + '> ' + esc(block.label) + '</label>'
        )).join('') +
        '<div class="do-menu-title">Exporteren</div>' +
        '<button type="button" class="do-menu-btn" id="do-export-csv">📄 CSV</button>' +
        '<button type="button" class="do-menu-btn" id="do-export-print">🖨️ Print weekrapport</button>' +
        '<div class="do-menu-title">Energie</div>' +
        '<button type="button" class="do-menu-btn" id="do-import-health">🍎 Apple Health importeren</button>' +
        '<button type="button" class="do-menu-btn" data-action="open-manual-tdee">✏️ TDEE invullen</button>' +
      '</div>' +
    '</details>'
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
export function buildDateKeys(numDays) {
  const dateKeys = [];
  const anchorKey = currentDate || dateKey(new Date());
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

function goalStat(value, goal, unit, label, color) {
  const pctOfGoal = goal ? Math.round((value / goal) * 100) : null;
  return '<div class="do-goal-stat">' +
    '<div class="do-goal-head"><span>' + esc(label) + '</span><strong>' + value + (goal ? '<small>/' + goal + unit + '</small>' : unit) + '</strong></div>' +
    (goal ? '<div class="do-goal-track"><span style="width:' + Math.min(100, pctOfGoal) + '%;background:' + color + '"></span></div>' : '') +
  '</div>';
}

function renderSchijfDays(entries) {
  const days = entries.filter(entry => entry.day && MEAL_NAMES.some(meal => (entry.day[meal] || []).length));
  if (!days.length) return '';
  const scores = days.map(entry => ({ key: entry.key, score: schijfDaySnapshot(entry.day).score }));
  const avg = Math.round(scores.reduce((sum, item) => sum + item.score, 0) / scores.length);
  const tone = score => score >= 70 ? 'var(--green)' : score >= 40 ? '#e8a020' : 'var(--danger)';
  let html = '<section class="do-section do-schijf-days" data-action="open-schijf" role="button" tabindex="0">';
  html += sectionHead('🥗 Schijf van Vijf', 'Dagscore per dag; tik om de Schijf te openen', 'gem. ' + avg + '%');
  if (scores.length <= 31) {
    html += '<div class="do-schijf-bars">' + scores.map(item => {
      const d = new Date(item.key + 'T12:00:00');
      return '<div class="do-schijf-bar" title="' + esc(formatDate(item.key)) + ': ' + item.score + '%">' +
        (scores.length <= 14 ? '<span class="do-schijf-bar-pct">' + item.score + '</span>' : '') +
        '<span class="do-schijf-bar-fill" style="height:' + Math.max(4, item.score) + '%;background:' + tone(item.score) + '"></span>' +
        '<small>' + (scores.length <= 7 ? d.toLocaleDateString('nl', { weekday: 'short' }) : d.getDate()) + '</small>' +
      '</div>';
    }).join('') + '</div>';
  }
  html += '</section>';
  return html;
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

  const { insights, weekdayWeekend, topFoods, extremes } = generateInsights(a, goals);
  const periodLabel = getPeriodLabel(numDays, dateKeys);
  const visibleBlocks = loadDataOverviewBlocks();
  const show = id => visibleBlocks[id] !== false;
  const mealMomentAnalysis = analyzeMealMoments(entries);

  if (a.activeDays === 0) {
    contentEl.innerHTML = '<div class="do-empty">Geen data gevonden voor deze periode.<br>Voeg eerst maaltijden toe!</div>';
    return false;
  }

  let html = '<div class="do-toolbar">' + renderMenu(visibleBlocks) + '</div><div class="do-shell">';

  // 1. Summary: four numbers against the goals, and at most three highlights
  if (show('summary')) {
    html += '<section class="do-section do-summary">';
    html += '<div class="do-kpi-grid">';
    html += kpiCard(a.avgIntake + (goals.kcal ? '<small>/' + goals.kcal + '</small>' : ''), 'kcal per dag', 'var(--accent)');
    html += kpiCard(a.avgProt + 'g' + (goals.prot ? '<small>/' + goals.prot + '</small>' : ''), 'eiwit per dag', 'var(--green)');
    html += kpiCard(a.avgFiber + 'g' + (goals.fiber ? '<small>/' + goals.fiber + '</small>' : ''), 'vezels per dag', 'var(--fiber)');
    html += kpiCard(a.activeDays + '<small>/' + a.totalDays + '</small>', 'dagen bijgehouden', 'var(--text)');
    html += '</div>';
    if (insights.length) {
      html += '<div class="do-insights-list">';
      for (const ins of insights.slice(0, 3)) {
        html += '<span class="do-insight-pill"><span class="do-insight-pill-emoji">' + ins.emoji + '</span><span>' + esc(ins.message) + '</span></span>';
      }
      html += '</div>';
    }
    html += '</section>';
  }

  html += '<div class="do-main-grid">';

  // 2. Intake with energy balance in one chart
  if (show('intake')) {
    html += '<section class="do-section do-feature-card">';
    html += sectionHead(
      '📈 Intake' + (a.daysWithEnergy > 0 ? ' en verbruik' : ''),
      numDays === 1 ? periodLabel : 'Per dag, ' + periodLabel,
      a.daysWithEnergy > 0 ? 'Balans ' + formatBalance(a.cumulativeBalance, true) : (goals.kcal ? 'Doel ' + goals.kcal + ' kcal' : '')
    );
    html += '<div class="do-chart" id="do-energy-chart"></div>';
    html += '<div class="do-legend"><span><span class="do-legend-dot" style="background:var(--accent)"></span>Intake</span>';
    if (a.daysWithEnergy > 0) html += '<span><span class="do-legend-dot" style="background:var(--tdee-line)"></span>Verbruik (TDEE)</span>';
    if (goals.kcal) html += '<span><span class="do-legend-dot" style="background:var(--muted)"></span>Doel</span>';
    html += '</div>';
    if (a.daysWithEnergy > 0) {
      html += '<div class="do-energy-line">Gem. verbruik <strong>' + a.avgTDEE + ' kcal</strong> (rust ' + a.avgResting + ' · actief ' + a.avgActive + ') · gem. balans <strong style="color:' + balanceColor(a.avgBalance, true) + '">' + formatBalance(a.avgBalance, true) + '</strong> per dag</div>';
    }
    html += '</section>';
  }

  // 3. Schijf van Vijf per day
  if (show('schijf')) html += renderSchijfDays(entries);

  // 4. Macros: average per day against the goals, and one calm stacked chart
  if (show('macros')) {
    html += '<section class="do-section">';
    html += sectionHead('🧮 Macro\'s', 'Gemiddeld per dag', '');
    html += '<div class="do-goal-stats">';
    html += goalStat(a.avgCarbs, goals.carbs, 'g', 'Koolhydraten', 'var(--blue)');
    html += goalStat(a.avgFat, goals.fat, 'g', 'Vet', 'var(--danger)');
    html += goalStat(a.avgProt, goals.prot, 'g', 'Eiwit', 'var(--green)');
    html += goalStat(a.avgFiber, goals.fiber, 'g', 'Vezels', 'var(--fiber)');
    html += '</div>';
    if (numDays > 1) {
      html += '<div class="do-chart" id="do-macro-chart"></div>';
      html += '<div class="do-legend"><span><span class="do-legend-dot" style="background:var(--blue)"></span>Kh</span><span><span class="do-legend-dot" style="background:var(--danger)"></span>Vet</span><span><span class="do-legend-dot" style="background:var(--green)"></span>Eiwit</span></div>';
    }
    html += '</section>';
  }

  // 5. Meal moments: one bar with each moment's share, details on tap
  const mealEntries = mealMomentAnalysis.sortedMeals.slice().sort((x, y) => y[1].contributionPct - x[1].contributionPct);
  if (show('meals') && mealEntries.length) {
    const palette = ['var(--accent)', 'var(--blue)', '#e8a020', 'var(--fiber)', '#d96a93', '#7fae4d', 'var(--muted)'];
    html += '<section class="do-section">';
    html += sectionHead('🍽️ Eetmomenten', 'Aandeel in je kcal', '');
    html += '<div class="do-share-bar">' + mealEntries.map(([, meal], idx) =>
      '<span style="width:' + meal.contributionPct + '%;background:' + palette[idx % palette.length] + '" title="' + esc(meal.label) + ' ' + meal.contributionPct + '%"></span>').join('') + '</div>';
    html += '<div class="do-share-list">' + mealEntries.map(([, meal], idx) => {
      const split = meal.macroSplit || { carbs: 0, fat: 0, prot: 0 };
      const kcal = numDays === 1 ? Math.round(meal.totalKcal) + ' kcal' : meal.avgKcal + ' kcal gem.';
      return '<details class="do-share-item">' +
        '<summary><i style="background:' + palette[idx % palette.length] + '"></i><span>' + esc(meal.label) + '</span><strong>' + meal.contributionPct + '%</strong><small>' + kcal + '</small></summary>' +
        '<div class="do-share-detail">Kh ' + split.carbs + '% · vet ' + split.fat + '% · eiwit ' + split.prot + '%' +
          (numDays > 1 ? ' · ' + meal.daysWithMeal + ' dagen' : '') +
          (meal.excessDays > 0 ? '<br>⚠️ ' + (numDays === 1 ? 'meer dan de helft van je dag' : meal.excessDays + '× meer dan de helft van je dag') : '') +
        '</div></details>';
    }).join('') + '</div>';
    html += '</section>';
  }

  // 6. Products: one list, three views
  const productViews = [
    { id: 'kcal', label: 'Meeste kcal', rows: topFoods.topCalories.map(p => [p.naam, p.totalKcal + ' kcal']) },
    { id: 'count', label: 'Vaakst', rows: topFoods.mostUsed.map(p => [p.naam, p.count + '×']) },
    { id: 'prot', label: 'Meeste eiwit', rows: topFoods.topProtein.map(p => [p.naam, p.totalProt + 'g']) },
  ].filter(view => view.rows.length);
  if (show('products') && productViews.length) {
    html += '<section class="do-section">';
    html += sectionHead('🛒 Producten', 'Wat je eetpatroon bepaalt', '');
    html += '<div class="do-product-tabs">' + productViews.map((view, idx) =>
      '<button type="button" class="do-product-tab' + (idx === 0 ? ' active' : '') + '" data-product-view="' + view.id + '">' + view.label + '</button>').join('') + '</div>';
    html += productViews.map((view, idx) =>
      '<ol class="do-product-list" data-product-list="' + view.id + '"' + (idx === 0 ? '' : ' hidden') + '>' +
        view.rows.map(([naam, value]) => '<li><span>' + esc(naam) + '</span><strong>' + value + '</strong></li>').join('') +
      '</ol>').join('');
    html += '</section>';
  }

  // 7. Highs and lows
  const ww = weekdayWeekend;
  const ex = extremes;
  if (show('stats') && numDays > 1 && (ex.highestIntake || (ww.weekday.days > 0 && ww.weekend.days > 0))) {
    html += '<section class="do-section">';
    html += sectionHead('📊 Uitschieters', '', '');
    html += '<div class="do-stat-grid">';
    if (ex.highestIntake) html += '<div class="do-stat"><span class="do-stat-label">Hoogste dag</span><span class="do-stat-val">' + ex.highestIntake.value + ' kcal <small>' + formatDate(ex.highestIntake.date) + '</small></span></div>';
    if (ex.lowestIntake) html += '<div class="do-stat"><span class="do-stat-label">Laagste dag</span><span class="do-stat-val">' + ex.lowestIntake.value + ' kcal <small>' + formatDate(ex.lowestIntake.date) + '</small></span></div>';
    if (ww.weekday.days > 0 && ww.weekend.days > 0) {
      const diff = ww.differences.intakeDiff;
      html += '<div class="do-stat"><span class="do-stat-label">Weekdag / weekend</span><span class="do-stat-val">' + ww.weekday.avgIntake + ' / ' + ww.weekend.avgIntake + ' kcal <small style="color:' + (Math.abs(diff) > 200 ? 'var(--danger)' : 'var(--muted)') + '">(' + (diff > 0 ? '+' : '') + diff + ' in weekend)</small></span></div>';
    }
    html += '</div></section>';
  }

  // 8. Weight, only when there is something to show
  const weightData = loadWeight();
  const weightEntries = Object.keys(weightData).filter(date => date >= dateKeys[0] && date <= dateKeys[dateKeys.length - 1]);
  if (show('weight') && weightEntries.length >= 2) {
    html += '<section class="do-section">';
    html += sectionHead('⚖️ Gewicht', 'Verloop in deze periode', weightEntries.length + ' metingen');
    html += '<div class="do-chart" id="do-weight-chart"></div></section>';
  }

  html += '</div></div>';

  contentEl.innerHTML = html;
  renderDOChart(a, document.getElementById('do-energy-chart'));
  renderDOMacroChart(a, document.getElementById('do-macro-chart'));
  renderWeightChart(document.getElementById('do-weight-chart'), numDays);

  contentEl.querySelectorAll('[data-do-toggle]').forEach(input => {
    input.addEventListener('change', () => {
      const nextVisibility = loadDataOverviewBlocks();
      nextVisibility[input.dataset.doToggle] = input.checked;
      saveDataOverviewBlocks(nextVisibility);
      renderDataOverzicht(numDays, { backgroundRefresh: false }).then(() => {
        contentEl.querySelector('.do-menu')?.setAttribute('open', '');
      });
    });
  });

  contentEl.querySelectorAll('[data-product-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      contentEl.querySelectorAll('[data-product-view]').forEach(other => other.classList.toggle('active', other === btn));
      contentEl.querySelectorAll('[data-product-list]').forEach(list => { list.hidden = list.dataset.productList !== btn.dataset.productView; });
    });
  });

  const schijfCard = contentEl.querySelector('[data-action="open-schijf"]');
  schijfCard?.addEventListener('click', () => openAdviesModal());
  schijfCard?.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openAdviesModal(); } });

  document.getElementById('do-import-health')?.addEventListener('click', () => document.getElementById('settings-import-btn')?.click());
  document.getElementById('do-export-csv')?.addEventListener('click', () => exportPeriodCSV(numDays));
  document.getElementById('do-export-print')?.addEventListener('click', () => exportWeekrapportPrint());

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
