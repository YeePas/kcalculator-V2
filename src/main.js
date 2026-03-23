/* ── Main Entry Point ─────────────────────────────────────── */
import './styles/index.css';

// ── State & Constants ────────────────────────────────────────
import {
  cfg, goals, localData, currentDate, selMeal, vis, authUser,
  activeAdviesTab, setActiveAdviesTab, showDrinks,
  nevoData, nevoReady, setNevoReady,
  acSelectedIdx, acSelectedItem, setAcResults,
  setLocalData, setGoals, setSelMeal, setCfg,
  setCurrentDate, setAuthUser as setAuthUserState,
  setNevoData, setOffReady,
} from './state.js';
import {
  CFG_KEY, GOALS_KEY, LOCAL_KEY, VIS_KEY, FAV_KEY, DARK_KEY, CUSTOM_KEY,
  DEFAULT_GOALS, MEAL_NAMES, MEAL_LABELS, PROVIDER_MODELS,
  ENERGY_LOCAL_KEY,
} from './constants.js';
import {
  dateKey, formatDate, emptyDay, normalizeDayData,
  esc, r1, dayTotals, getMealByTime,
} from './utils.js';
import {
  safeParse, loadCfg, saveCfg, loadGoals, saveGoals,
  loadFavs, saveFavs, loadVis, loadCustomProducts, saveCustomProducts,
  isLocalDevHost, loadSessionAiKeys, saveSessionAiKey,
} from './storage.js';

// ── Supabase ─────────────────────────────────────────────────
import { sbHeaders } from './supabase/config.js';
import {
  sbAuthRegister, sbAuthLogin, sbAuthRefresh,
  setAuthUser, updateAccountUI, restoreAuth, updateAuthProfile,
} from './supabase/auth.js';
import { initSupabase, loadDay, saveDay } from './supabase/data.js';
import {
  syncFavoritesToSupabase,
  syncCustomProductsToSupabase,
  syncUserPrefs,
  loadUserPrefs,
} from './supabase/sync.js';
import { fetchUserAiKeyStatuses, saveUserAiKey } from './supabase/user-ai-keys.js';

// ── Products ─────────────────────────────────────────────────
import { clearProductCache, loadNevo, searchNevo } from './products/database.js';
import { buildMealItem } from './products/matcher.js';
import { isLiquidLike } from './products/density.js';
import { SUPERMARKET_OPTIONS, normalizeSupermarketFilters } from './products/supermarket-filter.js';
import {
  openCustomModal, closeCustomModal, updatePhotoModelSelect,
  parseNutritionText, importFromOFF, aiFilLCustomProduct,
  handleCustomPhoto, saveCustomProduct,
  analyzeCustomDishInput, applyCustomDishSuggestion,
  quickSaveCustomDishSuggestion, setCustomDishPortionSize,
  applyCustomDishAlternative,
} from './products/custom.js';

// ── AI ───────────────────────────────────────────────────────
import { updateInlineModelSelect } from './ai/providers.js';
import { hasAiProxyConfig } from './ai/providers.js';
import { parseFood } from './ai/parser.js';
import { submit } from './input/submit.js';

// ── UI ───────────────────────────────────────────────────────
import { renderMeals, _renderDayUI, toggleMealSection, toggleAllMealSections, renderMealItems, renderItem } from './ui/render.js';
import { renderSummary } from './ui/summary.js';
import { renderDashboard, renderWeekSpark, renderMacroDonut } from './ui/charts.js';
import { setSyncStatus } from './ui/sync-status.js';
import {
  renderHistory, renderQuickFavs,
  applyDark, applyVis, deleteItem, deleteRecipeGroup,
  goToDay, switchMobileView,
} from './ui/misc.js';
import {
  initAutocomplete, closeAcDropdown, renderAcDropdown,
  selectAcItem, setPortie, addNevoItem, importAcItemToCustom,
} from './ui/autocomplete.js';
import {
  openBugReportModal, closeBugReportModal, submitBugReport, openGeneralFeedback,
} from './ui/bug-report.js';

const ALLOW_REGISTRATION = ['true', '1', 'yes', 'on'].includes(String(import.meta.env.VITE_ALLOW_REGISTRATION || '').toLowerCase());
const AI_PROVIDER_DEFAULT_MODELS = {
  claude: 'claude-haiku-4-5-20251001',
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
};

// ── Modals ───────────────────────────────────────────────────
import {
  openFavModal, renderFavList, saveFavorite,
  saveItemAsFavorite, deleteFav, saveMealAsRecipe,
  toggleFavExpand, addFavToMeal,
  openEditFavModal, initEditFavModalListeners, recalcEditFavTotals,
} from './modals/favourites.js';
import {
  openMatchModal, closeMatchModal, renderMatchList,
  updateMatchNevo, updateMatchGram, toggleManualMode,
  addMatchToFavs, aiLookupMatch, initMatchModalListeners,
} from './modals/match.js';
import {
  openEditModal, openEditRecipeGroupModal, closeEditModal, initEditModalListeners, moveItemToMeal,
} from './modals/edit.js';
import { initDataManagement } from './modals/data-management.js';
import { initManualDayEntry } from './modals/manual-day.js';
import { initManualTdeeEntry } from './modals/manual-tdee.js';
import { initWeightListeners } from './pages/weight.js';
import { initBarcodeScanner } from './products/barcode-scanner.js';

// ── Pages ────────────────────────────────────────────────────
import {
  openWeekModal, closeDataOverzicht, switchDOPeriod,
  renderDataOverzicht,
} from './pages/data-overview.js';
import {
  openAdviesModal, closeAdviesPage, showAdviesContent,
  updateAdviesModelSelect, runAdvies, initAdviesListeners,
} from './pages/advies.js';
import {
  openSmartImportPage, closeSmartImportPage, initSmartImportListeners,
  switchSmartImportTab, selectSmartImportMeal,
  runSmartImportDishAnalysis, parseSmartImportManual, runSmartImportUrlImport,
  refreshSmartImportManualProposal, syncSmartImportProviderSelects,
} from './pages/smart-import.js';
import { renderManageList } from './pages/smart-import-manage.js';
import {
  openAdminPage, initAdminListeners,
} from './pages/admin.js';

// ══════════════════════════════════════════════════════════════
// Expose functions needed by inline onclick handlers
// ══════════════════════════════════════════════════════════════
Object.assign(window, {
  toggleMealSection, toggleAllMealSections, saveMealAsRecipe, deleteRecipeGroup,
  saveItemAsFavorite, openEditModal, deleteItem,
  addFavToMeal, toggleFavExpand, deleteFav, openEditFavModal, recalcEditFavTotals,
  selectAcItem, setPortie, addNevoItem, importAcItemToCustom, openSmartImportPage, closeCustomModal,
  goToDay,
  updateMatchNevo, updateMatchGram, toggleManualMode,
  addMatchToFavs, aiLookupMatch,
  openBugReportModal, closeBugReportModal, submitBugReport, openGeneralFeedback,
  runAdvies, switchMobileView,
  closeEditModal, closeMatchModal, moveItemToMeal, openEditRecipeGroupModal,
  parseNutritionText, importFromOFF, aiFilLCustomProduct,
  analyzeCustomDishInput, applyCustomDishSuggestion,
  quickSaveCustomDishSuggestion, setCustomDishPortionSize,
  applyCustomDishAlternative,
  switchSmartImportTab, selectSmartImportMeal,
  runSmartImportDishAnalysis, parseSmartImportManual, runSmartImportUrlImport,
  refreshSmartImportManualProposal, syncSmartImportProviderSelects,
});

// switchDashPeriod for week modal dash-tab buttons
window.switchDashPeriod = function(numDays, btn) {
  document.querySelectorAll('.dash-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderDashboard(numDays);
};

// ══════════════════════════════════════════════════════════════
// Export/Import
// ══════════════════════════════════════════════════════════════
function exportAllData() {
  const allLocal = safeParse(LOCAL_KEY, {});
  const favs = loadFavs();
  const customs = safeParse('eetdagboek_custom_v1', []);
  const exportObj = {
    exportDatum: new Date().toISOString(),
    versie: 'eetdagboek-v2',
    doelen: goals,
    dagen: allLocal,
    favorieten: favs,
    eigenProducten: customs,
  };
  const csvRows = ['Datum,Maaltijd,Naam,Portie,Kcal,Koolhydraten_g,Vezels_g,Vetten_g,Eiwitten_g,ML'];
  for (const [date, day] of Object.entries(allLocal).sort()) {
    for (const meal of MEAL_NAMES) {
      for (const item of (day[meal] || [])) {
        csvRows.push([
          date, meal, `"${(item.naam || '').replace(/"/g, '""')}"`,
          `"${item.portie || ''}"`, item.kcal || 0, item.koolhydraten_g || 0,
          item.vezels_g || 0, item.vetten_g || 0, item.eiwitten_g || 0, item.ml || 0
        ].join(','));
      }
    }
  }
  const jsonBlob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
  const csvBlob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const today = dateKey(new Date());
  const a1 = document.createElement('a');
  a1.href = URL.createObjectURL(jsonBlob);
  a1.download = `eetdagboek-export-${today}.json`;
  a1.click();
  setTimeout(() => {
    const a2 = document.createElement('a');
    a2.href = URL.createObjectURL(csvBlob);
    a2.download = `eetdagboek-export-${today}.csv`;
    a2.click();
  }, 500);
}

function importData() {
  if (!cfg.sbUrl || !cfg.sbKey || !authUser?.id) {
    alert('Je moet ingelogd zijn en Supabase gekoppeld hebben om te importeren.');
    return;
  }
  const modal = document.getElementById('import-modal');
  const fileInput = document.getElementById('import-file-input');
  const fileLabel = document.getElementById('import-file-label');
  const fileText = document.getElementById('import-file-text');
  const dateInput = document.getElementById('import-from-date');
  const startBtn = document.getElementById('import-start-btn');
  const cancelBtn = document.getElementById('import-cancel-btn');
  const progressEl = document.getElementById('import-progress');
  const progressFill = document.getElementById('import-progress-fill');
  const statusText = document.getElementById('import-status-text');
  const btnsEl = document.getElementById('import-modal-btns');

  fileInput.value = ''; dateInput.value = '';
  fileInput.disabled = false; dateInput.disabled = false;
  fileLabel.classList.remove('has-file');
  fileText.textContent = '📄 Kies een XML- of CSV-bestand…';
  startBtn.disabled = true; startBtn.textContent = '🚀 Importeren';
  startBtn.style.display = '';
  cancelBtn.textContent = 'Annuleren';
  progressEl.classList.remove('active'); progressFill.style.width = '0%';
  statusText.textContent = ''; statusText.className = 'import-status-text';
  btnsEl.style.display = '';
  modal.classList.add('open');

  function parseCsvLine(line) {
    const cells = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        cells.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    cells.push(current);
    return cells.map(cell => cell.trim());
  }

  function normalizeImportHeader(header) {
    return String(header || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function readNumericFromRow(row, candidates) {
    for (const key of candidates) {
      const raw = row[key];
      if (raw === undefined || raw === null || raw === '') continue;
      const normalized = String(raw).replace(/\./g, '').replace(',', '.').trim();
      const value = parseFloat(normalized);
      if (!isNaN(value)) return value;
    }
    return null;
  }

  function kjToKcal(kj) {
    return kj === null || kj === undefined ? null : kj / 4.184;
  }

  function processCsvText(text, fromDate, dailyActive, dailyBasal) {
    const lines = String(text || '')
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .filter(Boolean);
    if (lines.length < 2) return { skippedRecords: 0 };

    const headers = parseCsvLine(lines[0]).map(normalizeImportHeader);
    let skippedRecords = 0;

    for (let i = 1; i < lines.length; i++) {
      const cells = parseCsvLine(lines[i]);
      if (!cells.length) continue;
      const row = {};
      headers.forEach((header, idx) => { row[header] = cells[idx] || ''; });

      const rawDate = String(row['datum/tijd'] || '').trim();
      const date = rawDate.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      if (fromDate && date < fromDate) { skippedRecords++; continue; }

      const activeKj = readNumericFromRow(row, [
        'actieve energie (kj)',
        'active energy (kj)',
        'actieve energie (kcal)',
        'active energy (kcal)',
      ]);
      const restingKj = readNumericFromRow(row, [
        'rustenergie (kj)',
        'resting energy (kj)',
        'basal energy burned (kj)',
        'rustenergie (kcal)',
        'resting energy (kcal)',
      ]);

      const activeValue = row['actieve energie (kcal)'] !== undefined || row['active energy (kcal)'] !== undefined
        ? activeKj
        : kjToKcal(activeKj);
      const restingValue = row['rustenergie (kcal)'] !== undefined || row['resting energy (kcal)'] !== undefined
        ? restingKj
        : kjToKcal(restingKj);

      if (activeValue !== null && !isNaN(activeValue)) dailyActive[date] = (dailyActive[date] || 0) + activeValue;
      if (restingValue !== null && !isNaN(restingValue)) dailyBasal[date] = (dailyBasal[date] || 0) + restingValue;
    }

    return { skippedRecords };
  }

  fileInput.onchange = () => {
    const file = fileInput.files[0];
    const isSupported = file && /\.(xml|csv)$/i.test(file.name);
    if (isSupported) {
      fileLabel.classList.add('has-file');
      fileText.textContent = `✓ ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`;
      startBtn.disabled = false;
    } else {
      fileLabel.classList.remove('has-file');
      fileText.textContent = '📄 Kies een XML- of CSV-bestand…';
      startBtn.disabled = true;
    }
  };

  cancelBtn.onclick = () => modal.classList.remove('open');
  modal.onclick = (e) => { if (e.target === modal) modal.classList.remove('open'); };

  startBtn.onclick = () => {
    const file = fileInput.files[0];
    if (!file) return;
    const isXml = file.name.toLowerCase().endsWith('.xml');
    const isCsv = file.name.toLowerCase().endsWith('.csv');
    if (!isXml && !isCsv) return;
    const fromDate = dateInput.value || null;
    startBtn.disabled = true; startBtn.textContent = '⏳ Bezig…';
    fileInput.disabled = true; dateInput.disabled = true;
    progressEl.classList.add('active');
    statusText.textContent = 'Bestand verwerken…'; statusText.className = 'import-status-text';

    const CHUNK = 8 * 1024 * 1024;
    let offset = 0, remainder = '';
    const dailyActive = {}, dailyBasal = {};
    let skippedRecords = 0;

    function processRecordPart(part) {
      if (part.includes('ActiveEnergyBurned')) {
        const val = part.match(/value="([^"]+)/), date = part.match(/startDate="(\d{4}-\d{2}-\d{2})/);
        if (val && date) {
          const d = date[1];
          if (fromDate && d < fromDate) { skippedRecords++; return; }
          const v = parseFloat(val[1]);
          if (!isNaN(v)) dailyActive[d] = (dailyActive[d] || 0) + v;
        }
      }
      if (part.includes('BasalEnergyBurned')) {
        const val = part.match(/value="([^"]+)/), date = part.match(/startDate="(\d{4}-\d{2}-\d{2})/);
        if (val && date) {
          const d = date[1];
          if (fromDate && d < fromDate) { skippedRecords++; return; }
          const v = parseFloat(val[1]);
          if (!isNaN(v)) dailyBasal[d] = (dailyBasal[d] || 0) + v;
        }
      }
    }

    function processXmlChunk() {
      const slice = file.slice(offset, offset + CHUNK);
      const reader = new FileReader();
      reader.onload = function (e) {
        let text = remainder + e.target.result;
        const parts = text.split('<Record'); remainder = parts.pop();
        for (const part of parts) processRecordPart(part);
        offset += CHUNK;
        progressFill.style.width = Math.min(100, Math.round(offset / file.size * 100)) + '%';
        statusText.textContent = `Bestand verwerken… ${Math.min(100, Math.round(offset / file.size * 100))}%`;
        if (offset < file.size) {
          setTimeout(processXmlChunk, 0);
        } else {
          if (remainder) processRecordPart(remainder);
          finishImport();
        }
      };
      reader.onerror = function () {
        statusText.textContent = '✗ Fout bij lezen bestand'; statusText.className = 'import-status-text error';
        startBtn.textContent = '🚀 Importeren'; startBtn.disabled = false; fileInput.disabled = false; dateInput.disabled = false;
      };
      reader.readAsText(slice);
    }

    function processCsvFile() {
      const reader = new FileReader();
      reader.onload = function (e) {
        try {
          const result = processCsvText(e.target.result, fromDate, dailyActive, dailyBasal);
          skippedRecords += result.skippedRecords || 0;
          progressFill.style.width = '100%';
          statusText.textContent = 'CSV verwerkt, opslaan…';
          finishImport();
        } catch (err) {
          statusText.textContent = '✗ CSV kon niet verwerkt worden';
          statusText.className = 'import-status-text error';
          startBtn.textContent = '🚀 Importeren';
          startBtn.disabled = false;
          fileInput.disabled = false;
          dateInput.disabled = false;
        }
      };
      reader.onerror = function () {
        statusText.textContent = '✗ Fout bij lezen bestand'; statusText.className = 'import-status-text error';
        startBtn.textContent = '🚀 Importeren'; startBtn.disabled = false; fileInput.disabled = false; dateInput.disabled = false;
      };
      reader.readAsText(file);
    }

    async function finishImport() {
      const allDates = new Set([...Object.keys(dailyActive), ...Object.keys(dailyBasal)]);
      if (allDates.size === 0) {
        statusText.textContent = fromDate ? `ℹ Geen energy-data gevonden vanaf ${fromDate}` : 'ℹ Geen energy-data gevonden in dit bestand';
        statusText.className = 'import-status-text error';
        startBtn.textContent = '🚀 Importeren'; startBtn.disabled = false; fileInput.disabled = false; dateInput.disabled = false;
        return;
      }
      progressFill.style.width = '100%';
      statusText.textContent = `Opslaan naar database… (${allDates.size} dagen)`;
      const datesSorted = [...allDates].sort();
      const clearFrom = fromDate || datesSorted[0];
      const clearTo = datesSorted[datesSorted.length - 1];
      const records = [];
      for (const date of allDates) {
        const active = Math.round(dailyActive[date] || 0), resting = Math.round(dailyBasal[date] || 0);
        // tdee_kcal is een generated column in Supabase, dus niet meesturen in writes.
        records.push({ user_id: authUser.id, date, active_kcal: active, resting_kcal: resting, source: 'apple_health' });
      }
      // Maak eerst het relevante bereik leeg, zodat handmatige fallback-data
      // of oude imports nooit kunnen blijven hangen als Apple Health leidend is.
      try {
        await fetch(
          `${cfg.sbUrl}/rest/v1/daily_energy_stats?user_id=eq.${authUser.id}&date=gte.${clearFrom}&date=lte.${clearTo}`,
          { method: 'DELETE', headers: sbHeaders(true) }
        );
      } catch (e) { /* ignore; batch writes below surface failures */ }

      const localEnergy = safeParse(ENERGY_LOCAL_KEY, safeParse('eetdagboek_energy_v1', {}));
      for (const key of Object.keys(localEnergy)) {
        if (key >= clearFrom && key <= clearTo) delete localEnergy[key];
      }

      const BATCH = 100; let saved = 0, errors = 0;
      let firstErrorMsg = '';
      for (let i = 0; i < records.length; i += BATCH) {
        const batch = records.slice(i, i + BATCH);
        try {
          // Voeg nieuwe rijen in nadat het bereik al is opgeschoond.
          const r = await fetch(`${cfg.sbUrl}/rest/v1/daily_energy_stats`, {
            method: 'POST',
            headers: { ...sbHeaders(true), 'Prefer': 'return=minimal' },
            body: JSON.stringify(batch),
          });
          if (r.ok) {
            saved += batch.length;
          } else {
            errors += batch.length;
            if (!firstErrorMsg) {
              const body = await r.text();
              firstErrorMsg = body || `HTTP ${r.status}`;
            }
          }
        } catch (e) {
          errors += batch.length;
          if (!firstErrorMsg) firstErrorMsg = e?.message || 'Netwerkfout';
        }
        statusText.textContent = `Opslaan… ${saved}/${records.length} dagen`;
      }

      // Update local energy cache with the imported rows only after stale rows were removed.
      records.forEach(rec => {
        localEnergy[rec.date] = {
          active_kcal: rec.active_kcal,
          resting_kcal: rec.resting_kcal,
          tdee_kcal: Math.round((rec.active_kcal || 0) + (rec.resting_kcal || 0)),
          date: rec.date,
        };
      });
      try {
        localStorage.setItem(ENERGY_LOCAL_KEY, JSON.stringify(localEnergy));
        // Legacy key voor backward compatibility
        localStorage.setItem('eetdagboek_energy_v1', JSON.stringify(localEnergy));
      } catch (e) { /* ignore */ }
      let msg = `✓ ${saved} dagen geïmporteerd (${datesSorted[0]} t/m ${datesSorted[datesSorted.length - 1]})`;
      if (skippedRecords > 0) msg += ` · ${skippedRecords} records overgeslagen`;
      if (errors > 0) msg += ` · ${errors} dagen mislukt`;
      if (firstErrorMsg) msg += ` · fout: ${String(firstErrorMsg).slice(0, 180)}`;
      statusText.textContent = msg; statusText.className = 'import-status-text done';
      cancelBtn.textContent = 'Sluiten'; startBtn.style.display = 'none';
      if (document.getElementById('do-content')) {
        renderDataOverzicht(_doCurrentDays);
      }
    }

    if (isXml) processXmlChunk();
    else processCsvFile();
  };
}

function cloneDayData(day) {
  return normalizeDayData(JSON.parse(JSON.stringify(day || emptyDay())));
}

function openCopyDayModal() {
  const modal = document.getElementById('copy-day-modal');
  const input = document.getElementById('copy-day-source-input');
  const targetLabel = document.getElementById('copy-day-target-label');
  const status = document.getElementById('copy-day-status');
  if (!modal || !input || !targetLabel || !status) return;
  targetLabel.textContent = formatDate(currentDate);
  input.value = '';
  input.max = currentDate;
  status.textContent = '';
  status.className = 'setup-status';
  modal.classList.add('open');
}

function closeCopyDayModal() {
  document.getElementById('copy-day-modal')?.classList.remove('open');
}

async function copyMealsFromDay() {
  const input = document.getElementById('copy-day-source-input');
  const status = document.getElementById('copy-day-status');
  if (!input || !status) return;

  const sourceDate = input.value;
  if (!sourceDate) {
    status.textContent = 'Kies eerst een datum.';
    status.className = 'setup-status err';
    return;
  }
  if (sourceDate === currentDate) {
    status.textContent = 'Kies een andere dag dan de huidige dag.';
    status.className = 'setup-status err';
    return;
  }

  status.textContent = 'Bezig met kopiëren…';
  status.className = 'setup-status';

  const sourceDay = cloneDayData(await loadDay(sourceDate));
  const hasMeals = Object.values(sourceDay).some(items => Array.isArray(items) && items.length > 0);
  if (!hasMeals) {
    status.textContent = 'Op die datum zijn geen maaltijden gevonden.';
    status.className = 'setup-status err';
    return;
  }

  const currentDayData = localData[currentDate] || emptyDay();
  const currentHasMeals = Object.values(currentDayData).some(items => Array.isArray(items) && items.length > 0);
  if (currentHasMeals && !window.confirm(`De maaltijden van ${formatDate(currentDate)} worden vervangen door ${formatDate(sourceDate)}. Doorgaan?`)) {
    status.textContent = 'Kopiëren geannuleerd.';
    status.className = 'setup-status';
    return;
  }

  saveDay(currentDate, sourceDay);
  setLocalData(currentDate, sourceDay);
  await renderMeals();
  closeCopyDayModal();
}

// ══════════════════════════════════════════════════════════════
// Auth Redirect Handler
// ══════════════════════════════════════════════════════════════
function handleAuthRedirect() {
  const hash = window.location.hash;
  if (!hash || !hash.includes('access_token=')) return false;
  const params = new URLSearchParams(hash.substring(1));
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const type = params.get('type');
  if (!accessToken) return false;
  try {
    const payload = JSON.parse(atob(accessToken.split('.')[1]));
    setAuthUser({ access_token: accessToken, refresh_token: refreshToken, user: { id: payload.sub, email: payload.email } });
    history.replaceState(null, '', window.location.pathname + window.location.search);
    if (type === 'recovery') {
      setTimeout(() => {
        const newPass = prompt('Kies een nieuw wachtwoord (minimaal 6 tekens):');
        if (newPass && newPass.length >= 6) {
          fetch(`${cfg.sbUrl}/auth/v1/user`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'apikey': cfg.sbKey, 'Authorization': 'Bearer ' + accessToken },
            body: JSON.stringify({ password: newPass }),
          }).then(r => { if (r.ok) alert('✓ Wachtwoord gewijzigd!'); else alert('Fout bij wijzigen wachtwoord.'); });
        }
      }, 500);
    }
    return true;
  } catch (e) { console.error('Auth redirect parse error:', e); return false; }
}

function getSelectedAiProvider(groupName, fallback = 'claude') {
  return document.querySelector(`input[name="${groupName}"]:checked`)?.value || fallback;
}

function setAiProviderStatus(provider, text, tone = '') {
  const statusEl = document.getElementById(`setup-key-status-${provider}`);
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = `setup-hint${tone ? ` ${tone}` : ''}`;
}

function syncAiProviderCardSelection() {
  const defaultProvider = getSelectedAiProvider('default-ai-provider', cfg.provider || 'claude');
  const adviesProvider = getSelectedAiProvider('advies-ai-provider', cfg.adviesProvider || defaultProvider);
  const importProvider = getSelectedAiProvider('smart-import-provider', cfg.importProvider || defaultProvider);
  document.querySelectorAll('.ai-provider-row').forEach(row => {
    const provider = row.dataset.provider;
    row.classList.toggle('is-default-provider', provider === defaultProvider);
    row.classList.toggle('is-advies-provider', provider === adviesProvider);
    row.classList.toggle('is-import-provider', provider === importProvider);
  });
}

async function runAiProxyKeyTest(provider) {
  const response = await fetch(`${cfg.sbUrl}/functions/v1/ai-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': cfg.sbKey,
      'Authorization': 'Bearer ' + (authUser?.access_token || cfg.sbKey),
    },
    body: JSON.stringify({
      provider,
      model: AI_PROVIDER_DEFAULT_MODELS[provider] || AI_PROVIDER_DEFAULT_MODELS.claude,
      user: 'Antwoord alleen met OK.',
      maxTokens: 12,
      useWebSearch: false,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || `Test mislukt (${response.status})`);
  return payload?.text || '';
}

async function runDirectGeminiKeyTest(apiKey) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(AI_PROVIDER_DEFAULT_MODELS.gemini)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: 'Antwoord alleen met OK.' }] }],
      generationConfig: {
        maxOutputTokens: 12,
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `Gemini test mislukt (${response.status})`);
  const text = (payload?.candidates || [])
    .flatMap(candidate => candidate?.content?.parts || [])
    .map(part => part?.text || '')
    .join('')
    .trim();
  if (!text) throw new Error('Gemini gaf geen bruikbare tekst terug.');
  return text;
}

async function testSetupAiProvider(provider) {
  const input = document.getElementById(`setup-key-${provider}`);
  const button = document.getElementById(`setup-test-key-${provider}`);
  const rawValue = input?.value?.trim() || '';
  const canUseProxy = Boolean(cfg.sbUrl && cfg.sbKey && authUser?.access_token);
  const canUseLocalGemini = provider === 'gemini' && isLocalDevHost();

  if (button) button.disabled = true;
  setAiProviderStatus(provider, 'Bezig met testen…');

  try {
    if (rawValue) {
      if (canUseProxy) {
        await saveUserAiKey(provider, rawValue);
        if (input) input.value = '';
      } else if (canUseLocalGemini) {
        saveSessionAiKey('gemini', rawValue);
        const nextCfg = { ...cfg, keys: loadSessionAiKeys() };
        setCfg(nextCfg);
        saveCfg(nextCfg);
      } else {
        throw new Error('Log in om deze sleutel veilig te testen en op te slaan.');
      }
    }

    if (provider === 'gemini' && canUseLocalGemini && (!canUseProxy || rawValue || cfg.keys?.gemini)) {
      await runDirectGeminiKeyTest(rawValue || cfg.keys?.gemini || '');
      setAiProviderStatus(provider, canUseProxy ? 'Key getest en veilig opgeslagen' : 'Key getest en lokaal opgeslagen', 'ok');
      return;
    }

    if (!canUseProxy) {
      throw new Error('Log in om deze provider via de beveiligde serverproxy te testen.');
    }

    await runAiProxyKeyTest(provider);
    setAiProviderStatus(provider, 'Key getest en veilig opgeslagen', 'ok');
  } catch (error) {
    setAiProviderStatus(provider, error instanceof Error ? error.message : 'Test mislukt.', 'err');
  } finally {
    if (button) button.disabled = false;
  }
}

// ══════════════════════════════════════════════════════════════
// Setup Screen
// ══════════════════════════════════════════════════════════════
function showSetup(panel) {
  const screen = document.getElementById('setup-screen');
  screen.style.display = 'flex';
  const closeBtn = document.getElementById('setup-close-btn');
  if (closeBtn) closeBtn.style.display = authUser ? '' : 'none';
  const authEl = document.getElementById('setup-auth');
  const userEl = document.getElementById('setup-user');
  if (authEl) authEl.style.display = 'none';
  if (userEl) userEl.style.display = 'none';

  if (panel === 'user' || authUser) {
    const sessionAiKeys = loadSessionAiKeys();
    const hasLocalGeminiKey = isLocalDevHost() && Boolean(sessionAiKeys.gemini);
    document.getElementById('setup-display-name').value = authUser?.display_name || '';
    ['claude', 'gemini', 'openai'].forEach(provider => {
      const input = document.getElementById(`setup-key-${provider}`);
      if (input) {
        input.value = '';
        input.placeholder = provider === 'gemini' && hasLocalGeminiKey
          ? 'Lokaal in deze sessie opgeslagen'
          : (provider === 'gemini' ? 'AIza…' : 'sk-…');
      }
      setAiProviderStatus(
        provider,
        provider === 'gemini' && hasLocalGeminiKey
          ? 'Alleen lokaal in deze browsersessie'
          : (authUser ? 'Laden…' : 'Log in om veilig op te slaan'),
      );
    });
    document.getElementById('setup-status').textContent = '';
    setProviderUI(cfg.provider || 'claude');
    setAdviesProviderUI(cfg.adviesProvider || cfg.provider || 'claude');
    setSmartImportProviderUI(cfg.importProvider || cfg.provider || 'claude');
    syncSupermarketFilterUI(cfg.supermarketExclusions || []);
    const offToggle = document.getElementById('settings-off-live-toggle');
    if (offToggle) offToggle.checked = cfg.openFoodFactsLiveSearch !== false;
    const greeting = document.getElementById('setup-user-greeting');
    if (greeting) {
      if (authUser) {
        greeting.textContent = 'Ingelogd als ' + authUser.email;
        const lb = document.getElementById('logout-settings-btn'); if (lb) lb.style.display = '';
      } else {
        greeting.textContent = 'Lokale modus (geen sync).';
        const lb2 = document.getElementById('logout-settings-btn'); if (lb2) lb2.style.display = 'none';
      }
    }
    if (userEl) userEl.style.display = '';
    activateSettingsTab('profiel');
    if (authUser?.access_token && cfg.sbUrl && cfg.sbKey) {
      fetchUserAiKeyStatuses().then(statuses => {
        ['claude', 'gemini', 'openai'].forEach(provider => {
          const input = document.getElementById(`setup-key-${provider}`);
          const isLocalGemini = provider === 'gemini' && hasLocalGeminiKey;
          if (input) {
            input.placeholder = isLocalGemini
              ? 'Lokaal in deze sessie opgeslagen'
              : (statuses[provider] ? 'Veilig opgeslagen in Supabase' : (provider === 'gemini' ? 'AIza…' : 'sk-…'));
          }
          setAiProviderStatus(
            provider,
            isLocalGemini
              ? 'Alleen lokaal in deze browsersessie'
              : (statuses[provider] ? 'Veilig opgeslagen' : 'Nog geen sleutel opgeslagen'),
            statuses[provider] ? 'ok' : '',
          );
        });
      }).catch(() => {
        ['claude', 'gemini', 'openai'].forEach(provider => {
          setAiProviderStatus(
            provider,
            provider === 'gemini' && hasLocalGeminiKey
              ? 'Alleen lokaal in deze browsersessie'
              : 'Kon status niet laden',
            provider === 'gemini' && hasLocalGeminiKey ? 'ok' : 'err',
          );
        });
      });
    }
  } else {
    const authSt = document.getElementById('auth-status'); if (authSt) authSt.textContent = '';
    const ae = document.getElementById('auth-email'); if (ae) ae.value = '';
    const ap = document.getElementById('auth-pass'); if (ap) ap.value = '';
    const registerBtn = document.getElementById('auth-register-btn');
    const registerNote = document.getElementById('auth-register-note');
    if (registerBtn) {
      registerBtn.hidden = !ALLOW_REGISTRATION;
      registerBtn.disabled = !ALLOW_REGISTRATION;
    }
    if (registerNote) registerNote.hidden = ALLOW_REGISTRATION;
    if (!cfg.sbUrl || !cfg.sbKey) {
      authSt.textContent = 'Inloggen is nu niet beschikbaar. Je kunt wel lokaal verder zonder account.';
      authSt.className = 'setup-status';
    }
    if (authEl) authEl.style.display = '';
  }
}

function setProviderUI(provider) {
  const radio = document.querySelector(`input[name="default-ai-provider"][value="${provider}"]`);
  if (radio) radio.checked = true;
  syncAiProviderCardSelection();
  updateInlineModelSelect(provider);
}

function setSmartImportProviderUI(provider) {
  const radio = document.querySelector(`input[name="smart-import-provider"][value="${provider}"]`);
  if (radio) radio.checked = true;
  syncAiProviderCardSelection();
}

function setAdviesProviderUI(provider) {
  const radio = document.querySelector(`input[name="advies-ai-provider"][value="${provider}"]`);
  if (radio) radio.checked = true;
  syncAiProviderCardSelection();
}

function syncSupermarketFilterUI(excludedFilters = []) {
  const excluded = new Set(normalizeSupermarketFilters(excludedFilters));
  SUPERMARKET_OPTIONS.forEach(option => {
    const input = document.getElementById(`supermarket-filter-${option.id}`);
    if (input) input.checked = !excluded.has(option.id); // checked = NIET uitgesloten
  });
}

function activateSettingsTab(tabId) {
  document.querySelectorAll('.settings-nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
  document.querySelectorAll('.settings-tab').forEach(t => t.classList.toggle('active', t.id === `settings-tab-${tabId}`));
}

function hideSetup() { document.getElementById('setup-screen').style.display = 'none'; }

function openGoalsModal() {
  hideSetup();
  document.getElementById('goal-kcal').value = goals.kcal || '';
  document.getElementById('goal-carbs').value = goals.carbs || '';
  document.getElementById('goal-fat').value = goals.fat || '';
  document.getElementById('goal-prot').value = goals.prot || '';
  document.getElementById('goal-fiber').value = goals.fiber || '';
  document.getElementById('goal-water').value = goals.water || '';
  document.getElementById('modal-overlay').classList.add('open');
}

function isAdminRoute() {
  const normalized = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
  return normalized === '/admin';
}

function openAdminIfRoute() {
  if (!isAdminRoute()) return;
  if (!authUser?.access_token) {
    showSetup('auth');
    return;
  }
  openAdminPage();
}

// ══════════════════════════════════════════════════════════════
// Manual Sync
// ══════════════════════════════════════════════════════════════
async function manualSync() {
  if (!authUser?.id || !cfg.sbUrl) {
    alert('Niet ingelogd. Log eerst in om te synchroniseren.');
    return;
  }
  setSyncStatus('syncing', 'synchroniseren…');
  try {
    const test = await fetch(cfg.sbUrl + '/rest/v1/eetdagboek?limit=1', { headers: sbHeaders() });
    if (!test.ok) {
      const session = await sbAuthRefresh(authUser.refresh_token);
      if (session && session.access_token) { setAuthUser(session); }
      else { setSyncStatus('error', 'sessie verlopen'); alert('Sessie verlopen. Log opnieuw in.'); return; }
    }
    const day = localData[currentDate] || emptyDay();
    await fetch(cfg.sbUrl + '/rest/v1/eetdagboek?on_conflict=user_id,date', {
      method: 'POST', headers: { ...sbHeaders(true), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ user_id: authUser.id, date: currentDate, data: day }),
    });
    const prefsRecord = {
      user_id: authUser.id, date: '9999-01-01',
      data: {
        favs: loadFavs(),
        goals: loadGoals(),
        custom: loadCustomProducts(),
        provider: cfg.provider || '',
        adviesProvider: cfg.adviesProvider || '',
        adviesModel: cfg.adviesModel || '',
        importProvider: cfg.importProvider || '',
        importModel: cfg.importModel || '',
        openFoodFactsLiveSearch: cfg.openFoodFactsLiveSearch !== false,
        supermarketExclusions: cfg.supermarketExclusions || [],
        vis,
        showDrinks,
      },
    };
    await fetch(cfg.sbUrl + '/rest/v1/eetdagboek?on_conflict=user_id,date', {
      method: 'POST', headers: { ...sbHeaders(true), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(prefsRecord),
    });
    await loadUserPrefs();
    setGoals(loadGoals());
    renderQuickFavs();
    const fresh = await loadDay(currentDate);
    setLocalData(currentDate, fresh);
    _renderDayUI(fresh);
    setSyncStatus('synced', 'gesynchroniseerd ✓');
  } catch (e) {
    console.error('[ManualSync] Error:', e);
    setSyncStatus('error', 'sync mislukt');
    alert('Sync mislukt: ' + e.message);
  }
}

function refreshProductDB() {
  const btn = document.getElementById('refresh-db-btn');
  btn.textContent = '⏳ Laden...'; btn.disabled = true;
  clearProductCache();
  localStorage.removeItem('eetdagboek_nevo_v1');
  localStorage.removeItem('kcalculator_off_v1');
  loadNevo().then(() => {
    btn.textContent = '✓ Producten geladen'; btn.style.color = 'var(--green)'; btn.disabled = false;
    setTimeout(() => { btn.textContent = '🔄 Vernieuw cache'; btn.style.color = ''; }, 3000);
  });
}

// ══════════════════════════════════════════════════════════════
// Submit (main input handler)
// ══════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
// Event Listeners
// ══════════════════════════════════════════════════════════════
function initEventListeners() {
  document.addEventListener('click', e => {
    const smartTab = e.target.closest('.smart-import-tab[data-tab]');
    if (smartTab) {
      switchSmartImportTab(smartTab.dataset.tab);
      return;
    }

    const smartMeal = e.target.closest('.smart-import-meal-btn[data-meal]');
    if (smartMeal) {
      selectSmartImportMeal(smartMeal.dataset.meal);
      return;
    }

    if (e.target.closest('#smart-dish-analyze-btn')) {
      runSmartImportDishAnalysis();
      return;
    }

    if (e.target.closest('#smart-manual-parse-btn')) {
      parseSmartImportManual();
      return;
    }

    if (e.target.closest('#smart-url-import-btn')) {
      runSmartImportUrlImport();
    }
  });

  document.addEventListener('input', e => {
    const manualField = e.target.closest('#smart-manual-title, #smart-manual-kcal, #smart-manual-protein, #smart-manual-carbs, #smart-manual-fat, #smart-manual-fiber, #smart-manual-portion');
    if (manualField) {
      refreshSmartImportManualProposal();
      return;
    }

    const manageSearch = e.target.closest('#smart-manage-search');
    if (manageSearch) {
      const term = manageSearch.value || '';
      renderManageList(term);
    }
  });

  document.addEventListener('change', e => {
    if (e.target.closest('#smart-import-provider-select')) {
      syncSmartImportProviderSelects();
      return;
    }

    if (e.target.closest('#smart-import-model-select')) {
      cfg.importProvider = document.getElementById('smart-import-provider-select')?.value;
      cfg.importModel = document.getElementById('smart-import-model-select')?.value;
      saveCfg(cfg);
    }
  });

  // Setup close
  document.getElementById('setup-close-btn')?.addEventListener('click', hideSetup);

  // Goals modal
  document.getElementById('summary-goals-btn')?.addEventListener('click', openGoalsModal);
  document.getElementById('settings-goals-btn')?.addEventListener('click', openGoalsModal);
  document.getElementById('settings-import-btn')?.addEventListener('click', () => {
    hideSetup();
    importData();
  });
  document.getElementById('data-overzicht')?.addEventListener('click', e => {
    if (e.target.closest('[data-action="open-energy-import"]')) {
      importData();
    }
  });
  document.getElementById('settings-export-btn')?.addEventListener('click', () => {
    hideSetup();
    exportAllData();
  });
  document.getElementById('settings-feedback-btn')?.addEventListener('click', () => {
    openGeneralFeedback('settings', {
      section: 'settings',
      current_path: window.location.pathname,
    });
  });
  document.getElementById('cancel-settings')?.addEventListener('click', () => document.getElementById('modal-overlay').classList.remove('open'));
  document.getElementById('modal-overlay')?.addEventListener('click', e => { if (e.target === document.getElementById('modal-overlay')) document.getElementById('modal-overlay').classList.remove('open'); });
  document.getElementById('save-settings')?.addEventListener('click', () => {
    const newGoals = {
      kcal: parseInt(document.getElementById('goal-kcal').value) || 0,
      carbs: parseInt(document.getElementById('goal-carbs').value) || 0,
      fat: parseInt(document.getElementById('goal-fat').value) || 0,
      prot: parseInt(document.getElementById('goal-prot').value) || 0,
      fiber: parseInt(document.getElementById('goal-fiber').value) || 0,
      water: parseInt(document.getElementById('goal-water').value) || 0,
    };
    setGoals(newGoals);
    saveGoals(newGoals);
    document.getElementById('modal-overlay').classList.remove('open');
    if (localData[currentDate]) renderSummary(localData[currentDate]);
  });

  // Meal selector
  document.querySelectorAll('.meal-btn').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.meal-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    setSelMeal(btn.dataset.meal);
  }));

  // Submit & input
  document.getElementById('send-btn')?.addEventListener('click', submit);
  document.getElementById('food-input')?.addEventListener('keydown', e => {
    const dd = document.getElementById('ac-dropdown');
    if (dd && dd.classList.contains('open') && ['ArrowDown', 'ArrowUp'].includes(e.key)) return;
    if (dd && dd.classList.contains('open') && e.key === 'Escape') return;
    if (dd && dd.classList.contains('open') && e.key === 'Enter' && acSelectedIdx >= 0) return;
    if (acSelectedItem && e.key === 'Enter') return;
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); closeAcDropdown(); submit(); }
  });

  // Day navigation
  document.getElementById('prev-day')?.addEventListener('click', () => {
    const d = new Date(currentDate + 'T12:00:00'); d.setDate(d.getDate() - 1);
    setCurrentDate(dateKey(d)); renderMeals();
  });
  document.getElementById('next-day')?.addEventListener('click', () => {
    const d = new Date(currentDate + 'T12:00:00'); d.setDate(d.getDate() + 1);
    setCurrentDate(dateKey(d)); renderMeals();
  });
  document.getElementById('today-btn')?.addEventListener('click', () => {
    setCurrentDate(dateKey(new Date())); renderMeals();
  });
  document.getElementById('copy-day-btn')?.addEventListener('click', openCopyDayModal);
  document.getElementById('copy-day-cancel-btn')?.addEventListener('click', closeCopyDayModal);
  document.getElementById('copy-day-confirm-btn')?.addEventListener('click', copyMealsFromDay);
  document.getElementById('copy-day-modal')?.addEventListener('click', (e) => {
    if (e.target?.id === 'copy-day-modal') closeCopyDayModal();
  });

  // Brand mark + title (home)
  document.getElementById('brand-home-btn')?.addEventListener('click', () => {
    const layout = document.querySelector('.layout');
    if (!layout) return;
    layout.classList.remove('show-data', 'show-advies', 'show-import', 'show-admin');
    if (window.innerWidth < 781) {
      layout.classList.remove('mobile-view-overzicht', 'mobile-view-data', 'mobile-view-advies', 'mobile-view-import', 'mobile-view-admin');
      layout.classList.add('mobile-view-invoer');
      document.querySelectorAll('.mobile-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
    }
  });

  // Advies
  document.getElementById('advies-btn')?.addEventListener('click', openAdviesModal);
  document.getElementById('advies-header-btn')?.addEventListener('click', openAdviesModal);
  document.querySelectorAll('.advies-page-tabs .advies-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      setActiveAdviesTab(tab.dataset.tab);
      document.querySelectorAll('.advies-page-tabs .advies-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === activeAdviesTab));
      showAdviesContent();
    });
  });
  document.getElementById('advies-refresh-btn')?.addEventListener('click', () => {
    if (activeAdviesTab === 'schijf') showAdviesContent();
    else runAdvies(activeAdviesTab);
  });
  document.getElementById('advies-back-btn')?.addEventListener('click', closeAdviesPage);
  initAdviesListeners();

  // Smart import
  document.getElementById('smart-import-header-btn')?.addEventListener('click', () => openSmartImportPage());
  document.getElementById('smart-import-back-btn')?.addEventListener('click', closeSmartImportPage);
  initSmartImportListeners();

  // Admin
  initAdminListeners();

  // Week / Data overview
  document.getElementById('week-btn')?.addEventListener('click', openWeekModal);
  document.getElementById('week-modal')?.addEventListener('click', e => { if (e.target === document.getElementById('week-modal')) document.getElementById('week-modal').classList.remove('open'); });
  document.getElementById('do-back-btn')?.addEventListener('click', closeDataOverzicht);
  document.querySelectorAll('.do-period-tab').forEach(btn => {
    btn.addEventListener('click', () => switchDOPeriod(parseInt(btn.dataset.days), btn));
  });

  document.getElementById('fav-modal')?.addEventListener('click', e => { if (e.target === document.getElementById('fav-modal')) document.getElementById('fav-modal').classList.remove('open'); });

  // Dark mode
  document.getElementById('dark-toggle')?.addEventListener('click', () => applyDark(!document.body.classList.contains('dark')));

  // AI settings provider radios
  document.querySelectorAll('input[name="default-ai-provider"]').forEach(input => {
    input.addEventListener('change', () => setProviderUI(input.value));
  });
  document.querySelectorAll('input[name="smart-import-provider"]').forEach(input => {
    input.addEventListener('change', () => setSmartImportProviderUI(input.value));
  });
  document.querySelectorAll('input[name="advies-ai-provider"]').forEach(input => {
    input.addEventListener('change', () => setAdviesProviderUI(input.value));
  });
  document.querySelectorAll('.ai-provider-test-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const provider = btn.id.replace('setup-test-key-', '');
      if (provider) testSetupAiProvider(provider);
    });
  });

  // Settings sidebar tab switching
  document.querySelectorAll('.settings-nav-item').forEach(btn => {
    btn.addEventListener('click', () => activateSettingsTab(btn.dataset.tab));
  });

  // Eigen producten tab → open smart import manage
  document.getElementById('settings-open-custom-btn')?.addEventListener('click', () => {
    hideSetup();
    openSmartImportPage();
    setTimeout(() => document.querySelector('.smart-import-tab[data-tab="manage"]')?.click(), 50);
  });

  // Setup save
  document.getElementById('setup-save-btn')?.addEventListener('click', async () => {
    const saveBtn = document.getElementById('setup-save-btn');
    const provider = getSelectedAiProvider('default-ai-provider', cfg.provider || 'claude');
    const adviesProvider = getSelectedAiProvider('advies-ai-provider', cfg.adviesProvider || provider);
    const importProvider = getSelectedAiProvider('smart-import-provider', cfg.importProvider || provider);
    const displayName = document.getElementById('setup-display-name').value.trim();
    const statusEl = document.getElementById('setup-status');
    if (statusEl) {
      statusEl.textContent = 'Opslaan…';
      statusEl.className = 'setup-status';
    }
    if (saveBtn) saveBtn.disabled = true;

    try {
      let savedLocalGemini = false;
      if (isLocalDevHost()) {
        const geminiInput = document.getElementById('setup-key-gemini');
        const geminiValue = geminiInput?.value?.trim() || '';
        if (geminiValue) {
          saveSessionAiKey('gemini', geminiValue);
          savedLocalGemini = true;
          if (geminiInput) geminiInput.value = '';
          setAiProviderStatus('gemini', 'Alleen lokaal in deze browsersessie', 'ok');
        }
      }

      const uncheckedSupermarkets = SUPERMARKET_OPTIONS
        .filter(option => !document.getElementById(`supermarket-filter-${option.id}`)?.checked)
        .map(option => option.id);
      const supermarketExclusions = normalizeSupermarketFilters(uncheckedSupermarkets);
      const openFoodFactsLiveSearch = document.getElementById('settings-off-live-toggle')?.checked !== false;

      const nextCfg = {
        ...cfg,
        claudeKey: '',
        keys: loadSessionAiKeys(),
        provider,
        adviesProvider,
        importProvider,
        model: cfg.model,
        adviesModel: cfg.adviesModel,
        importModel: cfg.importModel,
        openFoodFactsLiveSearch,
        supermarketExclusions,
      };
      setCfg(nextCfg);
      saveCfg(nextCfg);

      if (cfg.sbUrl && cfg.sbKey && authUser?.access_token) {
        for (const providerName of ['claude', 'gemini', 'openai']) {
          const input = document.getElementById(`setup-key-${providerName}`);
          const rawValue = input?.value?.trim() || '';
          if (input && rawValue) {
            await saveUserAiKey(providerName, rawValue);
            input.value = '';
            setAiProviderStatus(providerName, 'Veilig opgeslagen in Supabase', 'ok');
          }
        }
      }

      if (cfg.sbUrl && cfg.sbKey && authUser?.id) await updateAuthProfile({ displayName });
      if (cfg.sbUrl && cfg.sbKey && authUser?.id) await syncUserPrefs(true);
      if (cfg.sbUrl && cfg.sbKey && authUser) setSyncStatus('synced', 'verbonden');
      else if (!cfg.sbUrl) setSyncStatus('offline', 'lokaal');
      syncSmartImportProviderSelects();

      statusEl.textContent = savedLocalGemini
        ? '✓ Opgeslagen. Gemini draait lokaal in deze browsersessie.'
        : (hasAiProxyConfig()
          ? (authUser?.id ? '✓ Opgeslagen. AI loopt nu via de beveiligde serverproxy.' : '✓ Opgeslagen. AI loopt via de beveiligde serverproxy.')
          : '✓ Opgeslagen. Koppel Supabase om de beveiligde AI-proxy te gebruiken.');
      statusEl.className = 'setup-status ok';
      setTimeout(() => { hideSetup(); renderMeals(); }, 600);
    } catch (error) {
      console.error('[SetupSave] Error:', error);
      statusEl.textContent = error instanceof Error ? error.message : 'Opslaan mislukt.';
      statusEl.className = 'setup-status err';
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  });

  // Open config
  document.getElementById('open-config')?.addEventListener('click', () => showSetup('user'));

  // Skip login
  document.getElementById('skip-login-btn')?.addEventListener('click', () => showSetup('user'));

  // Auth buttons
  document.getElementById('auth-login-btn')?.addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value.trim();
    const pass = document.getElementById('auth-pass').value;
    const statusEl = document.getElementById('auth-status');
    if (!email || !pass) { statusEl.textContent = 'Vul email en wachtwoord in.'; statusEl.style.color = 'var(--danger)'; return; }
    statusEl.textContent = 'Inloggen…'; statusEl.style.color = '';
    try {
      const session = await sbAuthLogin(email, pass);
      localStorage.removeItem(LOCAL_KEY); localStorage.removeItem(FAV_KEY);
      localStorage.removeItem(GOALS_KEY); localStorage.removeItem(CUSTOM_KEY); localStorage.removeItem(VIS_KEY);
      setLocalData(null); setGoals({ ...DEFAULT_GOALS });
      setAuthUser(session);
      setSyncStatus('synced', 'verbonden');
      statusEl.textContent = '✓ Ingelogd!'; statusEl.style.color = 'var(--green)';
      setTimeout(async () => {
        hideSetup();
        if (cfg.sbUrl && cfg.sbKey) await initSupabase();
        await loadUserPrefs(); setGoals(loadGoals()); syncUserPrefs();
        renderQuickFavs(); await renderMeals();
        openAdminIfRoute();
      }, 400);
    } catch (e) { statusEl.textContent = '✗ ' + e.message; statusEl.style.color = 'var(--danger)'; }
  });

  document.getElementById('auth-register-btn')?.addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value.trim();
    const pass = document.getElementById('auth-pass').value;
    const statusEl = document.getElementById('auth-status');
    if (!ALLOW_REGISTRATION) {
      statusEl.textContent = 'Registreren staat nu uit. Vraag een account aan bij de beheerder.';
      statusEl.style.color = 'var(--danger)';
      statusEl.className = 'setup-status err';
      return;
    }
    if (!email || !pass) { statusEl.textContent = 'Vul email en wachtwoord in.'; statusEl.style.color = 'var(--danger)'; return; }
    if (pass.length < 6) { statusEl.textContent = 'Wachtwoord moet minimaal 6 tekens zijn.'; statusEl.style.color = 'var(--danger)'; return; }
    statusEl.textContent = 'Registreren…'; statusEl.style.color = '';
    try {
      const result = await sbAuthRegister(email, pass);
      if (result.access_token) {
        localStorage.removeItem(LOCAL_KEY); localStorage.removeItem(FAV_KEY);
        localStorage.removeItem(GOALS_KEY); localStorage.removeItem(CUSTOM_KEY); localStorage.removeItem(VIS_KEY);
        setLocalData(null); setGoals({ ...DEFAULT_GOALS });
        setAuthUser(result); setSyncStatus('synced', 'verbonden');
        statusEl.textContent = '✓ Account aangemaakt!'; statusEl.style.color = 'var(--green)';
        setTimeout(async () => {
          hideSetup();
          if (cfg.sbUrl && cfg.sbKey) await initSupabase();
          await loadUserPrefs();
          renderQuickFavs();
          await renderMeals();
          openAdminIfRoute();
        }, 400);
      } else {
        statusEl.textContent = '✓ Bevestigingsmail verzonden — check je inbox.'; statusEl.style.color = 'var(--green)';
      }
    } catch (e) { statusEl.textContent = '✗ ' + e.message; statusEl.style.color = 'var(--danger)'; }
  });

  document.getElementById('auth-magic-btn')?.addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value.trim();
    const statusEl = document.getElementById('auth-status');
    if (!email) { statusEl.textContent = 'Vul je email in.'; statusEl.style.color = 'var(--danger)'; return; }
    if (!cfg.sbUrl || !cfg.sbKey) { statusEl.textContent = 'Supabase niet geconfigureerd.'; statusEl.style.color = 'var(--danger)'; return; }
    statusEl.textContent = 'Magic link verzenden…'; statusEl.style.color = '';
    try {
      const siteUrl = window.location.origin + window.location.pathname;
      const r = await fetch(`${cfg.sbUrl}/auth/v1/magiclink`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': cfg.sbKey },
        body: JSON.stringify({ email, redirect_to: siteUrl }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error_description || d.msg || 'Fout bij verzenden'); }
      statusEl.textContent = '✓ Magic link verzonden — check je inbox!'; statusEl.style.color = 'var(--green)';
    } catch (e) { statusEl.textContent = '✗ ' + e.message; statusEl.style.color = 'var(--danger)'; }
  });

  document.getElementById('auth-forgot-btn')?.addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value.trim();
    const statusEl = document.getElementById('auth-status');
    if (!email) { statusEl.textContent = 'Vul je email in.'; statusEl.style.color = 'var(--danger)'; return; }
    statusEl.textContent = 'Reset-link verzenden…'; statusEl.style.color = '';
    try {
      const siteUrl = window.location.origin + window.location.pathname;
      const r = await fetch(`${cfg.sbUrl}/auth/v1/recover`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': cfg.sbKey }, body: JSON.stringify({ email, redirect_to: siteUrl }) });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error_description || d.msg || 'Fout bij verzenden'); }
      statusEl.textContent = '✓ Reset-link verzonden — check je inbox!'; statusEl.style.color = 'var(--green)';
    } catch (e) { statusEl.textContent = '✗ ' + e.message; statusEl.style.color = 'var(--danger)'; }
  });

  document.getElementById('logout-settings-btn')?.addEventListener('click', () => {
    setAuthUser(null);
    localStorage.removeItem(LOCAL_KEY); localStorage.removeItem(FAV_KEY);
    localStorage.removeItem(GOALS_KEY); localStorage.removeItem(CUSTOM_KEY); localStorage.removeItem(VIS_KEY);
    setLocalData(null); setGoals({ ...DEFAULT_GOALS });
    setSyncStatus('offline', 'uitgelogd');
    showSetup('auth');
  });

  document.getElementById('account-btn')?.addEventListener('click', () => {
    if (authUser) {
      if (confirm('Ingelogd als ' + authUser.email + '\n\nWil je uitloggen?')) {
        setAuthUser(null); setSyncStatus('offline', 'uitgelogd'); showSetup('auth');
      }
    } else { showSetup('auth'); }
  });

  // Sync button
  document.getElementById('sync-btn')?.addEventListener('click', manualSync);
  document.getElementById('refresh-db-btn')?.addEventListener('click', refreshProductDB);

  // Mobile tabs
  document.querySelectorAll('.mobile-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const view = tab.dataset.view;
      switchMobileView(view, tab);
    });
  });

  // Custom product modal
  document.getElementById('custom-photo-input')?.addEventListener('change', e => {
    if (e.target.files[0]) handleCustomPhoto(e.target.files[0]);
  });
  document.getElementById('custom-product-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('custom-product-modal')) closeCustomModal();
  });
  document.getElementById('custom-dish-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      analyzeCustomDishInput();
    }
  });
  document.getElementById('custom-add-btn')?.addEventListener('click', () => {
    const naam = document.getElementById('custom-naam').value.trim();
    if (!naam) { document.getElementById('custom-naam').focus(); return; }

    const per100 = {
      k:  parseFloat(document.getElementById('custom-kcal').value) || 0,
      kh: parseFloat(document.getElementById('custom-kh').value) || 0,
      vz: parseFloat(document.getElementById('custom-vz').value) || 0,
      v:  parseFloat(document.getElementById('custom-v').value) || 0,
      e:  parseFloat(document.getElementById('custom-e').value) || 0,
    };
    const gram = parseFloat(document.getElementById('custom-portie').value) || 100;
    const factor = gram / 100;

    // Save to custom products list if checked
    if (document.getElementById('custom-save-to-db').checked) {
      const customs = loadCustomProducts();
      const existing = customs.findIndex(c => c.n.toLowerCase() === naam.toLowerCase());
      const entry = { n: naam, g: -1, k: per100.k, kh: per100.kh, vz: per100.vz, v: per100.v, e: per100.e };
      if (existing >= 0) customs[existing] = entry;
      else customs.push(entry);
      saveCustomProducts(customs);
      syncCustomProductsToSupabase(true);
    }

    // Save to favourites if checked
    if (document.getElementById('custom-save-to-fav')?.checked) {
      const favItem = {
        naam,
        tekst: `${naam} (${gram}g)`,
        maaltijd: selMeal,
        item: {
          naam,
          portie: gram === 100 ? '100g' : `${gram}g`,
          kcal: Math.round(per100.k * factor),
          koolhydraten_g: r1(per100.kh * factor),
          vezels_g: r1(per100.vz * factor),
          vetten_g: r1(per100.v * factor),
          eiwitten_g: r1(per100.e * factor),
          ml: 0,
        },
      };
      const favs = loadFavs();
      favs.push(favItem);
      saveFavs(favs);
      syncFavoritesToSupabase();
      renderQuickFavs();
    }

    // Add to current meal
    const useMl = isLiquidLike(naam, selMeal === 'drinken');
    const item = buildMealItem(naam, per100, gram, useMl);

    const day = localData[currentDate] || emptyDay();
    MEAL_NAMES.forEach(m => { if (!day[m]) day[m] = []; });
    day[selMeal].push(item);
    setLocalData(currentDate, day);
    saveDay(currentDate, day);

    document.getElementById('food-input').value = '';
    closeCustomModal();

    const savedDb = document.getElementById('custom-save-to-db').checked;
    const savedFav = document.getElementById('custom-save-to-fav')?.checked;
    let savedText = '';
    if (savedDb && savedFav) savedText = ' + opgeslagen als product & favoriet';
    else if (savedDb) savedText = ' + opgeslagen in productenlijst';
    else if (savedFav) savedText = ' + opgeslagen als favoriet';
    document.getElementById('status').textContent = `✓ ${item.naam} (${item.portie}) toegevoegd${savedText}`;
    document.getElementById('status').className = 'status-msg';
    _renderDayUI(day);
  });

  // Match & Edit modal listeners
  initMatchModalListeners();
  initEditModalListeners();
  initEditFavModalListeners();
  initDataManagement();
  initManualDayEntry();
  initManualTdeeEntry();
  initWeightListeners();
  initBarcodeScanner((product) => {
    setAcResults([product]);
    renderAcDropdown([product], product.n);
    selectAcItem(0);
  });

  // Autocomplete
  initAutocomplete();
}

function inferNumericInputMode(input) {
  const step = input.getAttribute('step');
  return step && (step === 'any' || step.includes('.')) ? 'decimal' : 'numeric';
}

function applyNumericInputModes(root = document) {
  root.querySelectorAll?.('input[type="number"]').forEach(input => {
    input.setAttribute('inputmode', inferNumericInputMode(input));
    input.setAttribute('enterkeyhint', 'done');
  });
}

function initNumericInputModes() {
  applyNumericInputModes();

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach(node => {
        if (!(node instanceof HTMLElement)) return;
        if (node.matches?.('input[type="number"]')) applyNumericInputModes(node.parentElement || document);
        else applyNumericInputModes(node);
      });
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function autoSelectMealByTime() {
  const mealByTime = getMealByTime();
  const btn = document.querySelector(`.meal-btn[data-meal="${mealByTime}"]`);
  if (btn) {
    document.querySelectorAll('.meal-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    setSelMeal(mealByTime);
  }
}

// ══════════════════════════════════════════════════════════════
// Boot Sequence
// ══════════════════════════════════════════════════════════════
(async () => {
  try {
    console.log('[Boot] Starting...');
    applyDark(localStorage.getItem(DARK_KEY) === '1');
    applyVis();
    setCfg(loadCfg());
    initNumericInputModes();
    initEventListeners();
    autoSelectMealByTime();

    await loadNevo();

    const handledRedirect = handleAuthRedirect();

    if (!handledRedirect && cfg.sbUrl && cfg.sbKey) {
      try { await restoreAuth(); } catch (e) { console.error('[Boot] restoreAuth error:', e); }
    }
    updateAccountUI();

    if (handledRedirect || authUser) {
      if (cfg.sbUrl && cfg.sbKey) await initSupabase();
      await loadUserPrefs();
      setGoals(loadGoals());
      syncUserPrefs();
      setSyncStatus(authUser ? 'synced' : 'offline', authUser ? 'verbonden' : 'lokaal');
      renderQuickFavs();
      await renderMeals();
      openAdminIfRoute();
    } else {
      showSetup('auth');
      setSyncStatus('offline', 'lokaal');
      renderQuickFavs();
      await renderMeals();
    }
    console.log('[Boot] Done ✓');
  } catch (bootError) {
    console.error('[Boot] Fatal error:', bootError);
    try { setSyncStatus('error', 'opstartfout'); renderQuickFavs(); await renderMeals(); } catch (_) { /* ignore */ }
  }
})();

// ── Visibility change: re-sync on foreground ─────────────────
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible') return;
  if (!authUser?.refresh_token || !cfg.sbUrl) return;
  try {
    const session = await sbAuthRefresh(authUser.refresh_token);
    if (session && session.access_token) {
      setAuthUser(session);
      await loadUserPrefs();
      renderQuickFavs();
      const fresh = await loadDay(currentDate);
      if (fresh) { setLocalData(currentDate, fresh); _renderDayUI(fresh); }
      setSyncStatus('synced', 'gesynchroniseerd');
    } else {
      setAuthUser(null); setSyncStatus('offline', 'sessie verlopen'); showSetup('auth');
    }
  } catch (e) { console.error('Visibility sync error:', e); }
});

// ── Service Worker ───────────────────────────────────────────
if ('serviceWorker' in navigator) {
  // In development kan een oude SW stale CSS/JS serveren.
  // Daarom ruimen we SW + caches op en registreren we alleen in productie.
  if (import.meta.env.DEV) {
    navigator.serviceWorker.getRegistrations()
      .then(regs => Promise.all(regs.map(r => r.unregister())))
      .catch(() => { });
    if ('caches' in window) {
      caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).catch(() => { });
    }
  } else {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(reg => {
      reg.update();
      setInterval(() => reg.update(), 30000);
      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing;
        if (!newSW) return;
        newSW.addEventListener('statechange', () => {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) newSW.postMessage('skipWaiting');
        });
      });
    }).catch(() => { });
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload());
  }
}
