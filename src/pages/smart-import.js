/* ── Smart Import Page ───────────────────────────────────── */

import { cfg, localData, currentDate, selMeal } from '../state.js';
import { esc, emptyDay } from '../utils.js';
import { saveCfg, loadFavs, saveFavs } from '../storage.js';
import { saveDay } from '../supabase/data.js';
import { syncFavoritesToSupabase } from '../supabase/sync.js';
import { _renderDayUI } from '../ui/render.js';
import { switchMobileView, renderQuickFavs } from '../ui/misc.js';
import { PROVIDER_MODELS, MEAL_NAMES, MEAL_LABELS } from '../constants.js';
import {
  analyzeDishNameWithAI,
  createFoodFromManualNutrition,
  parseManualNutritionPaste,
  mapAiResultToFoodItem,
  saveImportedFood,
} from '../ai/dish-import-service.js';
import { hasAiProxyConfig } from '../ai/providers.js';
import { handleUrlImport } from './smart-import-url.js';
import { renderManageList, openEditProduct, deleteProduct, deleteFavoriteFromManage } from './smart-import-manage.js';
import { openEditFavModal } from '../modals/favourites.js';

let activeTab = 'dish_name';

function getApplyButtonLabel() {
  const meal = getTargetMeal();
  return 'Voeg toe aan ' + (MEAL_LABELS[meal] || meal);
}

function updateVisibleApplyButtons() {
  document.querySelectorAll('button[data-action="apply"]').forEach(btn => {
    btn.textContent = getApplyButtonLabel();
  });
}

/* ── Inline feedback ─────────────────────────────────────── */

function feedbackNear(btn, message, tone = 'ok') {
  const container = btn.closest('.smart-actions') || btn.parentElement;
  let fb = container.querySelector('.smart-inline-fb');
  if (!fb) { fb = document.createElement('div'); container.appendChild(fb); }
  fb.textContent = message;
  fb.className = 'smart-inline-fb ' + tone;
  clearTimeout(fb._timer);
  fb._timer = setTimeout(() => fb.remove(), tone === 'danger' ? 5500 : 3200);
}

/* ── Proposal card ───────────────────────────────────────── */

function renderManualProposalCard(targetId, proposal) {
  const el = document.getElementById(targetId);
  if (!el) return;
  const assumptions = (proposal.assumptions || []).filter(a => !/AI-respons was onvolledig/i.test(a));
  const assumes = assumptions.length
    ? '<details class="smart-assumptions-details"><summary>Aannames</summary><ul class="smart-assumptions">' + assumptions.map(a => '<li>' + esc(a) + '</li>').join('') + '</ul></details>' : '';
  el.innerHTML = '<div class="smart-card smart-card-compact">'
    + '<div class="smart-card-inline-head"><strong>' + esc(proposal.title) + '</strong><span class="smart-card-inline-meta">' + proposal.calories + ' kcal · ' + proposal.carbs_g + 'g kh · ' + proposal.protein_g + 'g eiwit</span></div>'
    + assumes
    + '<div class="smart-actions">'
    + '<button class="btn-primary" data-action="apply" data-target="' + targetId + '">' + getApplyButtonLabel() + '</button>'
    + '<button class="btn-secondary" data-action="favorite" data-target="' + targetId + '">⭐ Favoriet</button>'
    + '<button class="btn-secondary" data-action="cancel" data-target="' + targetId + '">✗</button>'
    + '</div></div>';
  el.dataset.proposal = JSON.stringify(proposal);
}

function renderProposalCard(targetId, proposal) {
  if (proposal?.sourceType === 'manual_nutrition' && targetId === 'smart-manual-result') {
    renderManualProposalCard(targetId, proposal);
    return;
  }
  const el = document.getElementById(targetId);
  if (!el) return;
  const cls = proposal.confidence === 'high' ? 'smart-conf-high'
    : proposal.confidence === 'medium' ? 'smart-conf-medium' : 'smart-conf-low';
  const assumptions = (proposal.assumptions || []).filter(a => !/AI-respons was onvolledig/i.test(a));
  const assumes = assumptions.length
    ? '<details class="smart-assumptions-details"><summary>Aannames</summary><ul class="smart-assumptions">' + assumptions.map(a => '<li>' + esc(a) + '</li>').join('') + '</ul></details>' : '';
  el.innerHTML = '<div class="smart-card">'
    + '<div class="smart-card-head"><h4>' + esc(proposal.title) + '</h4><span class="smart-confidence ' + cls + '">' + esc(proposal.confidence) + '</span></div>'
    + '<div class="smart-macro-grid">'
    + '<div><span>Portie</span><strong>' + esc(proposal.portionLabel) + ' (' + proposal.portionGrams + 'g)</strong></div>'
    + '<div><span>kcal</span><strong>' + proposal.calories + '</strong></div>'
    + '<div><span>Eiwit</span><strong>' + proposal.protein_g + 'g</strong></div>'
    + '<div><span>Koolh.</span><strong>' + proposal.carbs_g + 'g</strong></div>'
    + '<div><span>Vet</span><strong>' + proposal.fat_g + 'g</strong></div>'
    + '<div><span>Vezel</span><strong>' + proposal.fiber_g + 'g</strong></div></div>'
    + assumes
    + '<div class="smart-actions">'
    + '<button class="btn-primary" data-action="apply" data-target="' + targetId + '">' + getApplyButtonLabel() + '</button>'
    + '<button class="btn-secondary" data-action="favorite" data-target="' + targetId + '">⭐ Favoriet</button>'
    + '<button class="btn-secondary" data-action="edit" data-target="' + targetId + '">✏️</button>'
    + '<button class="btn-secondary" data-action="cancel" data-target="' + targetId + '">✗</button>'
    + '</div></div>';
  el.dataset.proposal = JSON.stringify(proposal);
}

/* ── Helpers ──────────────────────────────────────────────── */

function getTargetMeal() {
  return document.querySelector('.smart-import-meal-btn.active')?.dataset.meal || selMeal;
}

function syncSmartImportMealButtons() {
  const targetMeal = getTargetMeal() || selMeal;
  document.querySelectorAll('.smart-import-meal-btn').forEach(btn => {
    const isActive = btn.dataset.meal === targetMeal;
    btn.classList.toggle('active', isActive);
  });
  updateVisibleApplyButtons();
}

function applyProposalToDay(proposal, btn) {
  const item = mapAiResultToFoodItem(proposal);
  const day = localData[currentDate] || emptyDay();
  const meal = getTargetMeal();
  if (!day[meal]) day[meal] = [];
  day[meal].push(item);
  localData[currentDate] = day;
  saveDay(currentDate, day);
  saveImportedFood(proposal);
  _renderDayUI(day);
  feedbackNear(btn, '\u2713 ' + proposal.title + ' \u2192 ' + (MEAL_LABELS[meal] || meal), 'ok');
}

function saveProposalAsFavorite(proposal, btn) {
  const favs = loadFavs();
  favs.push({ naam: proposal.title, tekst: proposal.rawSourceInput || proposal.title, maaltijd: getTargetMeal(), item: mapAiResultToFoodItem(proposal) });
  saveFavs(favs);
  syncFavoritesToSupabase();
  saveImportedFood(proposal);
  renderQuickFavs();
  feedbackNear(btn, '\u2B50 Favoriet opgeslagen: ' + proposal.title, 'ok');
}

/* ── Provider / meal selects ─────────────────────────────── */

function syncProviderSelects() {
  const pSel = document.getElementById('smart-import-provider-select');
  const mSel = document.getElementById('smart-import-model-select');
  if (!pSel || !mSel) return;
  const cur = pSel.value || cfg.importProvider || cfg.provider || 'gemini';
  const provs = hasAiProxyConfig() ? ['gemini', 'openai', 'claude'] : [];
  pSel.innerHTML = provs.map(p => '<option value="' + p + '">' + p.toUpperCase() + '</option>').join('');
  pSel.disabled = provs.length === 0;
  pSel.value = provs.includes(cur) ? cur : (provs[0] || '');
  const models = PROVIDER_MODELS[pSel.value] || [];
  const curM = mSel.value || cfg.importModel || cfg.model || '';
  mSel.innerHTML = models.map(m => '<option value="' + m.id + '">' + m.label + '</option>').join('');
  mSel.disabled = models.length === 0;
  mSel.value = models.some(m => m.id === curM) ? curM : (models[0]?.id || '');
  cfg.importProvider = pSel.value;
  cfg.importModel = mSel.value;
  saveCfg(cfg);
  syncSmartImportMealButtons();
}

function buildManualProposalFromFields() {
  const title = document.getElementById('smart-manual-title')?.value.trim();
  if (!title) return null;
  return createFoodFromManualNutrition({
    title,
    calories: document.getElementById('smart-manual-kcal')?.value,
    protein_g: document.getElementById('smart-manual-protein')?.value,
    carbs_g: document.getElementById('smart-manual-carbs')?.value,
    fat_g: document.getElementById('smart-manual-fat')?.value,
    fiber_g: document.getElementById('smart-manual-fiber')?.value,
    portionGrams: document.getElementById('smart-manual-portion')?.value || 100,
    portionLabel: 'Handmatige portie',
  });
}

function refreshManualProposal() {
  const result = document.getElementById('smart-manual-result');
  if (!result) return;
  const proposal = buildManualProposalFromFields();
  if (!proposal) {
    result.innerHTML = '';
    return;
  }
  renderProposalCard('smart-manual-result', proposal);
}

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.smart-import-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('#smart-import-body > .smart-section').forEach(s => s.style.display = s.dataset.section === tab ? '' : 'none');
  const mealSelector = document.getElementById('smart-import-meal-selector');
  if (mealSelector) mealSelector.style.display = tab === 'manage' ? 'none' : '';
  if (tab === 'manage') renderManageList();
}

/* ── Open / Close ────────────────────────────────────────── */

export function openSmartImportPage(prefillName) {
  const safePrefill = typeof prefillName === 'string' ? prefillName : '';
  syncProviderSelects();
  syncSmartImportMealButtons();
  const layout = document.querySelector('.layout');
  if (!layout) return;
  layout.classList.remove('show-data', 'show-advies');
  if (window.innerWidth >= 781) layout.classList.add('show-import');
  else {
    layout.classList.remove('mobile-view-invoer', 'mobile-view-overzicht', 'mobile-view-data', 'mobile-view-advies');
    layout.classList.add('mobile-view-import');
    document.querySelectorAll('.mobile-tab').forEach((t, i) => t.classList.toggle('active', i === 4));
  }
  if (safePrefill) {
    switchTab('dish_name');
    const input = document.getElementById('smart-dish-input');
    if (input) input.value = safePrefill;
  }
}

export function closeSmartImportPage() {
  const layout = document.querySelector('.layout');
  if (!layout) return;
  layout.classList.remove('show-import');
  if (window.innerWidth < 781) {
    switchMobileView('invoer');
    document.querySelectorAll('.mobile-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
  }
}

/* ── Listeners ───────────────────────────────────────────── */

export function initSmartImportListeners() {
  async function runDishAnalysis() {
    const t = document.getElementById('smart-dish-result');
    const v = document.getElementById('smart-dish-input').value.trim();
    if (!v) return;
    t.innerHTML = '<div class="advies-loading"><span class="spin">\u23F3</span> Analyseren\u2026</div>';
    try { renderProposalCard('smart-dish-result', await analyzeDishNameWithAI(v)); }
    catch (e) { t.innerHTML = '<p class="smart-error">' + esc(e?.message || 'Onbekende fout') + '</p>'; }
  }

  document.querySelectorAll('.smart-import-tab').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  document.getElementById('smart-import-provider-select')?.addEventListener('change', syncProviderSelects);
  document.querySelectorAll('.smart-import-meal-btn').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.smart-import-meal-btn').forEach(b => b.classList.toggle('active', b === btn));
    updateVisibleApplyButtons();
  }));
  document.getElementById('smart-import-model-select')?.addEventListener('change', () => {
    cfg.importProvider = document.getElementById('smart-import-provider-select')?.value;
    cfg.importModel = document.getElementById('smart-import-model-select')?.value;
    saveCfg(cfg);
  });

  document.getElementById('smart-dish-analyze-btn')?.addEventListener('click', runDishAnalysis);
  document.getElementById('smart-dish-input')?.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || (!e.metaKey && !e.ctrlKey)) return;
    e.preventDefault();
    runDishAnalysis();
  });

  document.getElementById('smart-manual-parse-btn')?.addEventListener('click', () => {
    const raw = document.getElementById('smart-manual-paste').value.trim();
    if (!raw) return;
    const p = parseManualNutritionPaste(raw, document.getElementById('smart-manual-title').value.trim() || 'Geplakt gerecht', parseFloat(document.getElementById('smart-manual-portion').value) || 100);
    document.getElementById('smart-manual-kcal').value = p.calories;
    document.getElementById('smart-manual-protein').value = p.protein_g;
    document.getElementById('smart-manual-carbs').value = p.carbs_g;
    document.getElementById('smart-manual-fat').value = p.fat_g;
    document.getElementById('smart-manual-fiber').value = p.fiber_g;
    if (!document.getElementById('smart-manual-title').value.trim()) {
      document.getElementById('smart-manual-title').value = p.title;
    }
    refreshManualProposal();
  });

  [
    'smart-manual-title',
    'smart-manual-kcal',
    'smart-manual-protein',
    'smart-manual-carbs',
    'smart-manual-fat',
    'smart-manual-fiber',
    'smart-manual-portion',
  ].forEach(id => {
    document.getElementById(id)?.addEventListener('input', refreshManualProposal);
  });

  document.getElementById('smart-url-import-btn')?.addEventListener('click', function () { handleUrlImport(this, renderProposalCard, feedbackNear); });

  document.getElementById('smart-manage-search')?.addEventListener('input', e => renderManageList(e.target.value));
  document.getElementById('smart-manage-list')?.addEventListener('click', e => {
    const eb = e.target.closest('.smart-manage-edit');
    if (eb) return openEditProduct(Number(eb.dataset.idx), switchTab);
    const db = e.target.closest('.smart-manage-delete');
    if (db) return deleteProduct(Number(db.dataset.idx));
    const feb = e.target.closest('.smart-manage-fav-edit');
    if (feb) return openEditFavModal(Number(feb.dataset.favIdx));
    const fdb = e.target.closest('.smart-manage-fav-delete');
    if (fdb) return deleteFavoriteFromManage(Number(fdb.dataset.favIdx));
  });

  document.getElementById('smart-import-body')?.addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const rEl = document.getElementById(btn.dataset.target);
    if (!rEl?.dataset.proposal) return;
    const proposal = JSON.parse(rEl.dataset.proposal);
    if (btn.dataset.action === 'apply') applyProposalToDay(proposal, btn);
    if (btn.dataset.action === 'favorite') saveProposalAsFavorite(proposal, btn);
    if (btn.dataset.action === 'edit') {
      switchTab('manual_nutrition');
      document.getElementById('smart-manual-title').value = proposal.title;
      document.getElementById('smart-manual-kcal').value = proposal.calories;
      document.getElementById('smart-manual-protein').value = proposal.protein_g;
      document.getElementById('smart-manual-carbs').value = proposal.carbs_g;
      document.getElementById('smart-manual-fat').value = proposal.fat_g;
      document.getElementById('smart-manual-fiber').value = proposal.fiber_g;
      document.getElementById('smart-manual-portion').value = proposal.portionGrams;
    }
    if (btn.dataset.action === 'cancel') rEl.innerHTML = '';
  });
}
