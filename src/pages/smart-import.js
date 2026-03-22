/* ── Smart Import Page ───────────────────────────────────── */

import { cfg, localData, currentDate, selMeal } from '../state.js';
import { esc, emptyDay, getMealByTime, highlightMatches } from '../utils.js';
import { saveCfg, loadFavs, saveFavs } from '../storage.js';
import { saveDay } from '../supabase/data.js';
import { syncFavoritesToSupabase } from '../supabase/sync.js';
import { _renderDayUI } from '../ui/render.js';
import { switchMobileView, renderQuickFavs } from '../ui/misc.js';
import { PROVIDER_MODELS, MEAL_LABELS } from '../constants.js';
import { matchItemToNevo, buildMealItem } from '../products/matcher.js';
import { searchNevo, searchNevoHybrid } from '../products/database.js';
import {
  analyzeDishNameWithAI,
  createFoodFromManualNutrition,
  parseManualNutritionPaste,
  mapAiResultToFoodItem,
  saveImportedFood,
} from '../ai/dish-import-service.js';
import { hasAiProxyConfig, hasLocalSessionAi } from '../ai/providers.js';
import { handleUrlImport } from './smart-import-url.js';
import { handleRecipePhotoUpload } from './smart-import-photo.js';
import { renderManageList, openEditProduct, deleteProduct, deleteFavoriteFromManage } from './smart-import-manage.js';
import { openEditFavModal } from '../modals/favourites.js';

let activeTab = 'dish_name';
const ingredientMatchSearchState = new Map();
const DEFAULT_PROVIDER_MODEL = {
  claude: 'claude-haiku-4-5-20251001',
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
};

function getApplyButtonLabel() {
  const meal = getTargetMeal();
  return 'Voeg toe aan ' + (MEAL_LABELS[meal] || meal);
}

function updateVisibleApplyButtons() {
  document.querySelectorAll('button[data-action="apply"]').forEach(btn => {
    const targetId = btn.dataset.target;
    const resultEl = targetId ? document.getElementById(targetId) : null;
    const proposal = resultEl?.dataset?.proposal ? JSON.parse(resultEl.dataset.proposal) : null;
    btn.textContent = proposal?.recipe?.ingredients?.length ? getRecipeApplyButtonLabel() : getApplyButtonLabel();
  });
}

function getRecipeApplyButtonLabel() {
  const meal = getTargetMeal();
  return 'Voeg als ingrediënten toe aan ' + (MEAL_LABELS[meal] || meal);
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
    + '<div class="smart-card-inline-head"><strong>' + esc(proposal.title) + '</strong><span class="smart-card-inline-meta">Portie ' + proposal.portionGrams + 'g: ' + proposal.calories + ' kcal · ' + proposal.carbs_g + 'g kh · ' + proposal.protein_g + 'g eiwit</span></div>'
    + assumes
    + '<div class="smart-actions">'
    + '<button class="btn-primary" data-action="favorite" data-target="' + targetId + '">⭐ Opslaan bij favoriete gerechten</button>'
    + '</div></div>';
  el.dataset.proposal = JSON.stringify(proposal);
}

function buildRecipePortionProposal(proposal, servings) {
  const parsedServings = Number(String(servings ?? '').replace(',', '.'));
  const safeServings = Math.max(0.5, Number.isFinite(parsedServings) ? parsedServings : 1);
  const totals = proposal.recipe?.totals || {};
  const totalWeight = Math.max(1, Math.round(proposal.recipe?.totalWeightGrams || proposal.portionGrams || 100));
  return {
    ...proposal,
    portionLabel: safeServings === 1 ? '1 portie' : `1 van ${String(safeServings).replace(/\.0$/, '')} porties`,
    portionGrams: Math.max(1, Math.round(totalWeight / safeServings)),
    calories: Math.round((totals.calories || proposal.calories || 0) / safeServings),
    protein_g: Number((((totals.protein_g || proposal.protein_g || 0) / safeServings)).toFixed(1)),
    carbs_g: Number((((totals.carbs_g || proposal.carbs_g || 0) / safeServings)).toFixed(1)),
    fat_g: Number((((totals.fat_g || proposal.fat_g || 0) / safeServings)).toFixed(1)),
    fiber_g: Number((((totals.fiber_g || proposal.fiber_g || 0) / safeServings)).toFixed(1)),
    recipe: {
      ...proposal.recipe,
      servings: safeServings,
    },
  };
}

function getRecipeIngredientResolution(ingredient, servings = 1) {
  const scale = 1 / Math.max(0.5, Number(servings || 1));
  const scaledGrams = Math.max(0, (ingredient.grams || 0) * scale);
  const match = ingredient.manualMatch || matchItemToNevo({ foodName: ingredient.name, gram: scaledGrams });
  const matchedItem = match && scaledGrams > 0 ? buildMealItem(match.n, match, scaledGrams, false) : null;
  return {
    ingredient,
    scaledGrams,
    match,
    matchedItem,
    matchedName: match?.n || '',
    status: match ? 'matched' : 'open',
  };
}

function getRecipeIngredientResolutions(proposal) {
  const servings = proposal?.recipe?.servings || 1;
  return (proposal?.recipe?.ingredients || []).map(ingredient => getRecipeIngredientResolution(ingredient, servings));
}

function normalizeMatchSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toSingularIngredientTerm(term) {
  const value = normalizeMatchSearchText(term);
  if (value.length < 4) return value;
  if (value.endsWith('ies') && value.length > 4) return value.slice(0, -3) + 'ie';
  if (value.endsWith('eren') && value.length > 5) return value.slice(0, -2);
  if (value.endsWith('en') && value.length > 4) return value.slice(0, -2);
  if (value.endsWith('s') && value.length > 3) return value.slice(0, -1);
  return value;
}

function buildIngredientSearchQueries(query, ingredientName) {
  const baseValues = [
    String(query || '').trim(),
    String(ingredientName || '').trim(),
  ].filter(Boolean);
  const seen = new Set();
  const queries = [];

  for (const raw of baseValues) {
    const normalized = normalizeMatchSearchText(raw);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    queries.push(normalized);

    const words = normalized.split(' ').filter(Boolean);
    const singularWords = words.map(toSingularIngredientTerm);
    const singularPhrase = singularWords.join(' ').trim();
    if (singularPhrase && !seen.has(singularPhrase)) {
      seen.add(singularPhrase);
      queries.push(singularPhrase);
    }

    for (const word of singularWords) {
      if (word && !seen.has(word)) {
        seen.add(word);
        queries.push(word);
      }
    }
  }

  return queries;
}

function scoreIngredientMatchResult(result, query, ingredientName) {
  const normalizedName = normalizeMatchSearchText(result?.n);
  const normalizedQuery = normalizeMatchSearchText(query);
  const normalizedIngredient = normalizeMatchSearchText(ingredientName);
  const terms = normalizedQuery.split(' ').filter(Boolean);
  let score = 0;

  if (!normalizedName) return score;
  if (normalizedName === normalizedQuery) score += 120;
  if (normalizedQuery && normalizedName.startsWith(normalizedQuery)) score += 60;
  if (normalizedIngredient && normalizedName === normalizedIngredient) score += 45;
  if (normalizedIngredient && normalizedName.startsWith(normalizedIngredient)) score += 24;
  if (terms.length && terms.every(term => normalizedName.includes(term))) score += 20;

  const wordCount = normalizedName.split(' ').filter(Boolean).length;
  score -= Math.max(0, wordCount - 2) * 6;
  score -= normalizedName.length * 0.08;

  if (result?._custom) score -= 12;
  if (/\b(pasta|saus|schotel|gerecht|mix|maaltijd|burger|pizza|soep|ovenschotel)\b/i.test(result?.n || '')) score -= 42;
  if (/\b(groente|fruit|aardappelen|peulvruchten)\b/i.test(result?._group || '')) score += 12;
  if (/\b(rauw|gekookt|onbereid|vers)\b/i.test(result?.n || '')) score += 8;

  return score;
}

function getIngredientMatchResults(proposal, ingredientIdx) {
  const ingredient = proposal?.recipe?.ingredients?.[ingredientIdx];
  if (!ingredient) return [];
  if (Array.isArray(ingredient.matchResults) && ingredient.matchResults.length) return ingredient.matchResults;
  const query = String(ingredient.matchQuery || ingredient.name || '').trim();
  if (query.length < 2) return [];
  const merged = new Map();
  for (const variant of buildIngredientSearchQueries(query, ingredient.name)) {
    for (const result of searchNevo(variant)) {
      const key = `${String(result.n || '').toLowerCase()}|${String(result.b || '').toLowerCase()}`;
      if (!merged.has(key)) merged.set(key, result);
    }
  }
  return Array.from(merged.values())
    .map(result => ({ result, score: scoreIngredientMatchResult(result, query, ingredient.name) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(entry => entry.result);
}

function getIngredientSearchStateKey(targetId, ingredientIdx) {
  return `${targetId}::${ingredientIdx}`;
}

function clearIngredientSearchState(targetId, ingredientIdx) {
  ingredientMatchSearchState.delete(getIngredientSearchStateKey(targetId, ingredientIdx));
}

function queueIngredientHybridSearch(targetId, ingredientIdx, query) {
  const trimmed = String(query || '').trim();
  const key = getIngredientSearchStateKey(targetId, ingredientIdx);
  const prev = ingredientMatchSearchState.get(key);
  if (prev?.timer) clearTimeout(prev.timer);
  const nextSeq = (prev?.seq || 0) + 1;
  ingredientMatchSearchState.set(key, { seq: nextSeq, query: trimmed, timer: null });
  if (trimmed.length < 3 || cfg.openFoodFactsLiveSearch === false) return;

  const timer = setTimeout(async () => {
    const current = ingredientMatchSearchState.get(key);
    if (!current || current.seq !== nextSeq || current.query !== trimmed) return;
    const hybridResults = await searchNevoHybrid(trimmed, 8);
    const latest = ingredientMatchSearchState.get(key);
    if (!latest || latest.seq !== nextSeq || latest.query !== trimmed) return;
    const resultEl = document.getElementById(targetId);
    if (!resultEl?.dataset?.proposal) return;
    const proposal = mutateRecipeIngredientInDataset(targetId, ingredientIdx, ingredient => ({
      ...ingredient,
      matchQuery: trimmed,
      editingMatch: true,
      matchResults: hybridResults,
      matchLoading: false,
    }));
    const input = resultEl.querySelector(`.smart-recipe-match-input[data-match-query="${ingredientIdx}"]`);
    const resultsEl = input?.closest('.smart-recipe-match-editor')?.querySelector('.smart-recipe-match-results');
    if (resultsEl && proposal) {
      resultsEl.innerHTML = buildIngredientMatchResults(targetId, proposal, ingredientIdx);
    }
  }, 150);

  ingredientMatchSearchState.set(key, { seq: nextSeq, query: trimmed, timer });
}

function renderRecipeProposalCard(targetId, proposal) {
  const el = document.getElementById(targetId);
  if (!el || !proposal?.recipe) return;
  const recipeProposal = buildRecipePortionProposal(proposal, proposal.recipe.servings || 1);
  const totals = recipeProposal.recipe.totals;
  const ingredients = getRecipeIngredientResolutions(recipeProposal);
  const matchedCount = ingredients.filter(item => item.status === 'matched').length;
  const openCount = ingredients.length - matchedCount;
  const assumptions = (recipeProposal.assumptions || []).filter(a => !/AI-respons was onvolledig/i.test(a));
  const assumes = assumptions.length
    ? '<details class="smart-assumptions-details"><summary>Aannames</summary><ul class="smart-assumptions">' + assumptions.map(a => '<li>' + esc(a) + '</li>').join('') + '</ul></details>' : '';

  el.innerHTML = '<div class="smart-card smart-recipe-card">'
    + '<div class="smart-card-head"><h4>' + esc(recipeProposal.title) + '</h4><span class="smart-confidence smart-conf-' + esc(recipeProposal.confidence) + '">' + esc(recipeProposal.confidence) + '</span></div>'
    + '<div class="smart-recipe-meta">'
    + '<div class="smart-recipe-kpi"><span>Totaal recept</span><strong>' + Math.round(totals.calories || 0) + ' kcal</strong></div>'
    + '<div class="smart-recipe-kpi"><span>Totaal gewicht</span><strong>' + Math.round(recipeProposal.recipe.totalWeightGrams || 0) + ' g</strong></div>'
    + '<label class="smart-recipe-servings-wrap"><span>Aantal porties</span><input class="smart-recipe-servings" data-target="' + targetId + '" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" value="' + String(recipeProposal.recipe.servings || 1).replace(/\.0$/, '') + '"></label>'
    + '</div>'
    + '<div class="smart-macro-grid">'
    + '<div><span>Gram per portie</span><strong>' + recipeProposal.portionGrams + 'g</strong></div>'
    + '<div><span>kcal</span><strong>' + recipeProposal.calories + '</strong></div>'
    + '<div><span>Eiwit</span><strong>' + recipeProposal.protein_g + 'g</strong></div>'
    + '<div><span>Koolh.</span><strong>' + recipeProposal.carbs_g + 'g</strong></div>'
    + '<div><span>Vet</span><strong>' + recipeProposal.fat_g + 'g</strong></div>'
    + '<div><span>Vezel</span><strong>' + recipeProposal.fiber_g + 'g</strong></div></div>'
    + '<div class="smart-recipe-ingredients"><div class="smart-recipe-ingredients-title"><div class="smart-recipe-ingredients-title-main">Ingrediënten <span>' + matchedCount + ' gekoppeld · ' + openCount + ' open</span></div></div>'
    + ingredients.map(({ ingredient, scaledGrams, matchedName, status, matchedItem }, idx) =>
      '<div class="smart-recipe-ingredient' + (ingredient.editingMatch ? ' is-editing' : '') + '"><div><div class="smart-recipe-ingredient-top"><strong>' + esc(ingredient.name) + '</strong><span class="smart-recipe-match-dot smart-recipe-match-' + status + '" aria-label="' + (status === 'matched' ? 'Gekoppeld' : 'Open') + '" title="' + (status === 'matched' ? 'Gekoppeld' : 'Open') + '"></span><button class="smart-recipe-match-edit" data-action="toggle-match-edit" data-target="' + targetId + '" data-ingredient-idx="' + idx + '" aria-label="Wijzig match" title="Wijzig match">✏️</button></div>'
      + '<div class="smart-recipe-match-line"><span class="smart-recipe-match-text">' + esc(matchedName || 'Nog geen match in products.json / eigen producten') + '</span></div>'
      + (ingredient.editingMatch
        ? '<div class="smart-recipe-match-editor"><label class="smart-recipe-match-label">Zoek product in database of eigen producten</label><div class="smart-recipe-match-searchbar"><input type="text" class="smart-recipe-match-input" data-target="' + targetId + '" data-match-query="' + idx + '" value="' + esc(ingredient.matchQuery || ingredient.name) + '" placeholder="Zoek op productnaam, zoals aubergine of pecorino"><button type="button" class="smart-recipe-match-search-icon" data-action="search-match" data-target="' + targetId + '" data-ingredient-idx="' + idx + '" aria-label="Kies beste match">→</button></div>'
          + '<div class="smart-recipe-match-results">'
          + buildIngredientMatchResults(targetId, proposal, idx)
          + '</div></div>'
        : '')
      + '</div><span>' + esc(ingredient.displayAmount || (ingredient.grams ? `${ingredient.grams} g` : '')) + '</span><small>'
      + Math.round(matchedItem?.kcal || ingredient.calories || 0) + ' kcal · ' + esc(String(scaledGrams ? Math.round(scaledGrams) + 'g per portie' : '')) + '</small><button type="button" class="smart-recipe-inline-remove" data-action="remove-recipe-ingredient" data-target="' + targetId + '" data-ingredient-idx="' + idx + '" aria-label="Verwijder ingrediënt">✕</button></div>'
    ).join('')
    + '<button type="button" class="btn-secondary smart-recipe-inline-add smart-recipe-inline-add-bottom" data-action="add-recipe-ingredient" data-target="' + targetId + '">+ Ingrediënt</button>'
    + '</div>'
    + assumes
    + '<div class="smart-actions">'
    + '<button class="btn-primary" data-action="apply-and-save-dish" data-target="' + targetId + '">🍽️ Toevoegen en opslaan als gerecht</button>'
    + '<button class="btn-secondary" data-action="save-dish" data-target="' + targetId + '">⭐ Opslaan als gerecht</button>'
    + '</div></div>';
  el.dataset.proposal = JSON.stringify(recipeProposal);
}

function buildIngredientMatchResults(targetId, proposal, ingredientIdx) {
  const ingredient = proposal?.recipe?.ingredients?.[ingredientIdx];
  if (!ingredient) return '';
  const query = String(ingredient.matchQuery || ingredient.name || '').trim();
  const results = getIngredientMatchResults(proposal, ingredientIdx);
  const hint = results.length
    ? '<div class="smart-recipe-match-hint"><span class="smart-recipe-match-hint-badge">Database + eigen producten</span> Kies hieronder een productmatch</div>'
    : '';
  const loadingRow = ingredient.matchLoading
    ? '<div class="smart-recipe-match-loading"><span class="smart-recipe-match-spinner" aria-hidden="true"></span><span>Zoeken in OpenFoodFacts.org…</span></div>'
    : '';
  if (!results.length) {
    return loadingRow || '<div class="smart-recipe-match-empty">Geen lokale matches gevonden. Typ verder of probeer een simpelere naam.</div>';
  }
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return hint + results.map(result =>
    '<button class="smart-recipe-match-option" data-action="select-match" data-target="' + targetId + '" data-ingredient-idx="' + ingredientIdx + '" data-match-name="' + esc(result.n) + '">'
    + '<div><strong>' + highlightMatches(result.n, terms) + (result._custom ? ' <span class="smart-recipe-match-source">eigen</span>' : '') + (result.src === 'off-api' ? ' <span class="smart-recipe-match-live">live</span>' : '') + '</strong><span>' + esc(result._group || result.b || '') + '</span></div><span>' + Math.round(result.k || 0) + ' kcal / 100g</span></button>'
  ).join('') + loadingRow;
}

function rebuildRecipeProposalWithIngredients(proposal, ingredients) {
  const safeIngredients = (ingredients || []).map(ingredient => ({
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: 0,
    grams: 0,
    ...ingredient,
  }));
  const totals = safeIngredients.reduce((acc, ingredient) => {
    acc.totalWeightGrams += Number(ingredient.grams || 0);
    acc.calories += Number(ingredient.calories || 0);
    acc.protein_g += Number(ingredient.protein_g || 0);
    acc.carbs_g += Number(ingredient.carbs_g || 0);
    acc.fat_g += Number(ingredient.fat_g || 0);
    acc.fiber_g += Number(ingredient.fiber_g || 0);
    return acc;
  }, { totalWeightGrams: 0, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 });
  const servings = Math.max(0.5, Number(proposal?.recipe?.servings || 1));

  return {
    ...proposal,
    portionGrams: Math.max(1, Math.round(totals.totalWeightGrams / servings) || proposal.portionGrams || 1),
    calories: Math.round(totals.calories / servings),
    protein_g: Number((totals.protein_g / servings).toFixed(1)),
    carbs_g: Number((totals.carbs_g / servings).toFixed(1)),
    fat_g: Number((totals.fat_g / servings).toFixed(1)),
    fiber_g: Number((totals.fiber_g / servings).toFixed(1)),
    recipe: {
      ...proposal.recipe,
      ingredients: safeIngredients,
      totalWeightGrams: Math.max(1, Math.round(totals.totalWeightGrams) || proposal.recipe?.totalWeightGrams || 1),
      totals: {
        calories: Math.round(totals.calories),
        protein_g: Number(totals.protein_g.toFixed(1)),
        carbs_g: Number(totals.carbs_g.toFixed(1)),
        fat_g: Number(totals.fat_g.toFixed(1)),
        fiber_g: Number(totals.fiber_g.toFixed(1)),
      },
    },
  };
}

function renderInlineProposalEditor(targetId, proposal) {
  const el = document.getElementById(targetId);
  if (!el) return;
  const isRecipe = Boolean(proposal?.recipe?.ingredients?.length);
  const recipeFields = isRecipe
    ? '<div class="smart-edit-recipe-list">'
      + (proposal.recipe.ingredients || []).map((ingredient, idx) =>
        '<div class="smart-edit-recipe-row">'
        + '<input type="text" data-edit-ingredient-name="' + idx + '" value="' + esc(ingredient.name) + '">'
        + '<input type="number" min="0" step="1" data-edit-ingredient-grams="' + idx + '" value="' + Math.round(ingredient.grams || 0) + '">'
        + '<button type="button" class="btn-secondary smart-edit-row-remove" data-action="remove-edit-ingredient" data-target="' + targetId + '" data-ingredient-idx="' + idx + '">✕</button>'
        + '</div>'
      ).join('')
      + '<button type="button" class="btn-secondary smart-edit-row-add" data-action="add-edit-ingredient" data-target="' + targetId + '">+ Ingrediënt</button>'
      + '</div>'
    : '';
  const note = isRecipe
    ? '<div class="smart-edit-note">Porties pas je hierboven aan. Hier kun je naam en grams per ingrediënt bijsturen; de macro’s rekenen daarna opnieuw mee.</div>'
    : '';
  el.innerHTML = '<div class="smart-card smart-card-compact">'
    + '<div class="smart-card-head"><h4>Bewerk voorstel</h4></div>'
    + '<div class="smart-edit-grid">'
    + '<label class="smart-edit-field smart-edit-field-wide"><span>Naam</span><input type="text" data-edit-field="title" value="' + esc(proposal.title) + '"></label>'
    + (!isRecipe
      ? '<label class="smart-edit-field"><span>Portie (g)</span><input type="number" min="1" step="1" data-edit-field="portionGrams" value="' + proposal.portionGrams + '"></label>'
        + '<label class="smart-edit-field"><span>Kcal</span><input type="number" min="0" step="1" data-edit-field="calories" value="' + proposal.calories + '"></label>'
        + '<label class="smart-edit-field"><span>Eiwit</span><input type="number" min="0" step="0.1" data-edit-field="protein_g" value="' + proposal.protein_g + '"></label>'
        + '<label class="smart-edit-field"><span>Koolh.</span><input type="number" min="0" step="0.1" data-edit-field="carbs_g" value="' + proposal.carbs_g + '"></label>'
        + '<label class="smart-edit-field"><span>Vet</span><input type="number" min="0" step="0.1" data-edit-field="fat_g" value="' + proposal.fat_g + '"></label>'
        + '<label class="smart-edit-field"><span>Vezel</span><input type="number" min="0" step="0.1" data-edit-field="fiber_g" value="' + proposal.fiber_g + '"></label>'
      : '')
    + '</div>'
    + recipeFields
    + note
    + '<div class="smart-actions">'
    + '<button class="btn-primary" data-action="save-edit" data-target="' + targetId + '">Opslaan</button>'
    + '<button class="btn-secondary" data-action="cancel-edit" data-target="' + targetId + '">Annuleren</button>'
    + '</div></div>';
  el.dataset.editingProposal = JSON.stringify(proposal);
}

function updateEditingRecipeProposal(targetId, updater) {
  const resultEl = document.getElementById(targetId);
  if (!resultEl?.dataset?.editingProposal) return;
  const proposal = JSON.parse(resultEl.dataset.editingProposal);
  if (!proposal?.recipe?.ingredients) return;
  renderInlineProposalEditor(targetId, updater(proposal));
}

function renderProposalCard(targetId, proposal) {
  if (proposal?.sourceType === 'manual_nutrition' && targetId === 'smart-manual-result') {
    renderManualProposalCard(targetId, proposal);
    return;
  }
  if (proposal?.recipe?.ingredients?.length) {
    renderRecipeProposalCard(targetId, proposal);
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
    + '<button class="btn-primary" data-action="favorite" data-target="' + targetId + '">⭐ Opslaan bij favoriete gerechten</button>'
    + '</div></div>';
  el.dataset.proposal = JSON.stringify(proposal);
}

/* ── Helpers ──────────────────────────────────────────────── */

function getTargetMeal() {
  return document.querySelector('.smart-import-meal-btn.active')?.dataset.meal || selMeal;
}

function syncSmartImportMealButtons() {
  // If no active button, select based on time
  const hasActiveBtn = document.querySelector('.smart-import-meal-btn.active');
  const targetMeal = hasActiveBtn 
    ? getTargetMeal() 
    : getMealByTime();
  
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
  if (proposal?.recipe?.ingredients?.length) {
    const items = buildRecipeItemsForMeal(proposal);
    day[meal].push(...items);
    localData[currentDate] = day;
    saveDay(currentDate, day);
    saveImportedFood(proposal);
    _renderDayUI(day);
    feedbackNear(btn, '\u2713 ' + proposal.title + ' \u2192 ' + (MEAL_LABELS[meal] || meal) + ` (${items.length} ingrediënten)`, 'ok');
    return;
  }
  day[meal].push(item);
  localData[currentDate] = day;
  saveDay(currentDate, day);
  saveImportedFood(proposal);
  _renderDayUI(day);
  feedbackNear(btn, '\u2713 ' + proposal.title + ' \u2192 ' + (MEAL_LABELS[meal] || meal), 'ok');
}

function saveProposalAsFavorite(proposal, btn, options = {}) {
  const { silent = false } = options;
  const favs = loadFavs();
  if (proposal?.recipe?.ingredients?.length) {
    favs.push({
      naam: proposal.title,
      tekst: proposal.rawSourceInput || proposal.title,
      maaltijd: getTargetMeal(),
      isRecipe: true,
      items: buildRecipeItemsForMeal(proposal).map(item => {
        const { _recipeGroup, _recipeName, ...rest } = item;
        return rest;
      }),
      item: mapAiResultToFoodItem(proposal),
    });
  } else {
    favs.push({ naam: proposal.title, tekst: proposal.rawSourceInput || proposal.title, maaltijd: getTargetMeal(), item: mapAiResultToFoodItem(proposal) });
  }
  saveFavs(favs);
  syncFavoritesToSupabase();
  saveImportedFood(proposal);
  renderQuickFavs();
  if (!silent && btn) feedbackNear(btn, '\u2B50 Toegevoegd aan favorieten: ' + proposal.title, 'ok');
}

function buildFallbackIngredientItem(ingredient, scale) {
  const grams = Math.max(1, Math.round((ingredient.grams || 0) * scale || 1));
  return {
    naam: ingredient.name,
    kcal: Math.round((ingredient.calories || 0) * scale),
    koolhydraten_g: Number((((ingredient.carbs_g || 0) * scale)).toFixed(1)),
    vezels_g: Number((((ingredient.fiber_g || 0) * scale)).toFixed(1)),
    vetten_g: Number((((ingredient.fat_g || 0) * scale)).toFixed(1)),
    eiwitten_g: Number((((ingredient.protein_g || 0) * scale)).toFixed(1)),
    portie: ingredient.grams ? `${grams}g` : (ingredient.displayAmount || `${grams}g`),
  };
}

function buildRecipeItemsForMeal(proposal) {
  const ingredients = getRecipeIngredientResolutions(proposal);
  const recipeGroup = `${proposal.title}_${Date.now()}`;

  return ingredients.map(({ ingredient, scaledGrams, match }) => {
    const baseItem = match && scaledGrams > 0
      ? buildMealItem(match.n, match, scaledGrams, false)
      : buildFallbackIngredientItem(ingredient, 1 / Math.max(0.5, Number(proposal?.recipe?.servings || 1)));

    return {
      ...baseItem,
      _recipeGroup: recipeGroup,
      _recipeName: proposal.title,
      _smartImportIngredientMatch: match ? match.n : '',
    };
  });
}

function updateRecipeIngredient(targetId, ingredientIdx, updater) {
  const resultEl = document.getElementById(targetId);
  if (!resultEl?.dataset?.proposal) return;
  const proposal = JSON.parse(resultEl.dataset.proposal);
  if (!proposal?.recipe?.ingredients?.[ingredientIdx]) return;
  const nextIngredients = proposal.recipe.ingredients.map((ingredient, idx) => (
    idx === ingredientIdx ? updater({ ...ingredient }) : ingredient
  ));
  renderProposalCard(targetId, {
    ...proposal,
    recipe: {
      ...proposal.recipe,
      ingredients: nextIngredients,
    },
  });
}

function mutateRecipeIngredientInDataset(targetId, ingredientIdx, updater) {
  const resultEl = document.getElementById(targetId);
  if (!resultEl?.dataset?.proposal) return null;
  const proposal = JSON.parse(resultEl.dataset.proposal);
  if (!proposal?.recipe?.ingredients?.[ingredientIdx]) return null;
  proposal.recipe.ingredients = proposal.recipe.ingredients.map((ingredient, idx) => (
    idx === ingredientIdx ? updater({ ...ingredient }) : ingredient
  ));
  resultEl.dataset.proposal = JSON.stringify(proposal);
  return proposal;
}

function commitRecipeServingsInput(servingsInput) {
  if (!servingsInput) return;
  const resultEl = document.getElementById(servingsInput.dataset.target);
  if (!resultEl?.dataset?.proposal) return;
  const proposal = JSON.parse(resultEl.dataset.proposal);
  if (!proposal?.recipe) return;
  const parsed = Number(String(servingsInput.value || '').replace(',', '.'));
  const safeValue = Math.max(0.5, Number.isFinite(parsed) ? parsed : (proposal.recipe.servings || 1));
  renderProposalCard(servingsInput.dataset.target, buildRecipePortionProposal(proposal, safeValue));
}

function applyProposalAsDishToDay(proposal, btn) {
  const day = localData[currentDate] || emptyDay();
  const meal = getTargetMeal();
  if (!day[meal]) day[meal] = [];
  day[meal].push(mapAiResultToFoodItem(proposal));
  localData[currentDate] = day;
  saveDay(currentDate, day);
  saveImportedFood(proposal);
  _renderDayUI(day);
  feedbackNear(btn, '\u2713 ' + proposal.title + ' als gerecht toegevoegd aan ' + (MEAL_LABELS[meal] || meal), 'ok');
}

function recalcEditedRecipeProposal(originalProposal, title, container) {
  const ingredients = (originalProposal?.recipe?.ingredients || []).map((ingredient, idx) => {
    const nextName = container.querySelector(`[data-edit-ingredient-name="${idx}"]`)?.value?.trim() || ingredient.name;
    const nextGramsRaw = container.querySelector(`[data-edit-ingredient-grams="${idx}"]`)?.value ?? ingredient.grams;
    const nextGrams = Math.max(0, Math.round(Number(String(nextGramsRaw).replace(',', '.')) || 0));
    const scale = ingredient.grams > 0 ? (nextGrams / ingredient.grams) : 1;
    return {
      ...ingredient,
      name: nextName,
      grams: nextGrams,
      calories: Math.round((ingredient.calories || 0) * scale),
      protein_g: Number((((ingredient.protein_g || 0) * scale)).toFixed(1)),
      carbs_g: Number((((ingredient.carbs_g || 0) * scale)).toFixed(1)),
      fat_g: Number((((ingredient.fat_g || 0) * scale)).toFixed(1)),
      fiber_g: Number((((ingredient.fiber_g || 0) * scale)).toFixed(1)),
    };
  });
  return rebuildRecipeProposalWithIngredients({
    ...originalProposal,
    title,
    recipe: {
      ...originalProposal.recipe,
      ingredients,
    },
  }, ingredients);
}

function readEditedProposal(targetId, originalProposal) {
  const container = document.getElementById(targetId);
  if (!container) return originalProposal;
  const readNum = (field, fallback, decimals = 1) => {
    const raw = container.querySelector(`[data-edit-field="${field}"]`)?.value ?? '';
    const parsed = Number(String(raw).replace(',', '.'));
    if (!Number.isFinite(parsed)) return fallback;
    return decimals === 0 ? Math.round(parsed) : Number(parsed.toFixed(decimals));
  };
  const title = container.querySelector('[data-edit-field="title"]')?.value?.trim() || originalProposal.title;
  if (originalProposal?.recipe?.ingredients?.length) {
    return recalcEditedRecipeProposal(originalProposal, title, container);
  }
  return {
    ...originalProposal,
    title,
    portionGrams: Math.max(1, readNum('portionGrams', originalProposal.portionGrams, 0)),
    calories: Math.max(0, readNum('calories', originalProposal.calories, 0)),
    protein_g: Math.max(0, readNum('protein_g', originalProposal.protein_g)),
    carbs_g: Math.max(0, readNum('carbs_g', originalProposal.carbs_g)),
    fat_g: Math.max(0, readNum('fat_g', originalProposal.fat_g)),
    fiber_g: Math.max(0, readNum('fiber_g', originalProposal.fiber_g)),
  };
}

/* ── Provider / meal selects ─────────────────────────────── */

export function syncSmartImportProviderSelects() {
  const pSel = document.getElementById('smart-import-provider-select');
  const mSel = document.getElementById('smart-import-model-select');
  if (!pSel || !mSel) return;
  const provs = hasAiProxyConfig()
    ? ['gemini', 'openai', 'claude']
    : (hasLocalSessionAi('gemini') ? ['gemini'] : []);
  const currentOptions = Array.from(pSel.options).map(opt => opt.value);
  if (currentOptions.join('|') !== provs.join('|')) {
    pSel.innerHTML = provs.map(p => '<option value="' + p + '">' + p.toUpperCase() + '</option>').join('');
  }
  pSel.disabled = provs.length === 0;
  const preferredProvider = cfg.importProvider || cfg.provider || pSel.value || (provs[0] || '');
  pSel.value = provs.includes(preferredProvider) ? preferredProvider : (provs[0] || '');
  const models = PROVIDER_MODELS[pSel.value] || [];
  const providerDefaultModel = DEFAULT_PROVIDER_MODEL[pSel.value] || models[0]?.id || '';
  const currentUiModel = mSel.value;
  const configuredModel = cfg.importProvider === pSel.value
    ? (cfg.importModel || '')
    : '';
  const inheritedModel = cfg.provider === pSel.value
    ? (cfg.model || '')
    : '';
  const curM = configuredModel || currentUiModel || inheritedModel || providerDefaultModel;
  mSel.innerHTML = models.map(m => '<option value="' + m.id + '">' + m.label + '</option>').join('');
  mSel.disabled = models.length === 0;
  mSel.value = models.some(m => m.id === curM) ? curM : (providerDefaultModel || models[0]?.id || '');
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

export function refreshSmartImportManualProposal() {
  refreshManualProposal();
}

export function switchSmartImportTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.smart-import-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('#smart-import-body > .smart-section').forEach(s => s.style.display = s.dataset.section === tab ? '' : 'none');
  const mealSelector = document.getElementById('smart-import-meal-selector');
  if (mealSelector) mealSelector.style.display = tab === 'manage' ? 'none' : '';
  if (tab === 'manage') renderManageList();
}

export function selectSmartImportMeal(meal) {
  document.querySelectorAll('.smart-import-meal-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.meal === meal);
  });
  updateVisibleApplyButtons();
}

export async function runSmartImportDishAnalysis() {
  const target = document.getElementById('smart-dish-result');
  const input = document.getElementById('smart-dish-input');
  const value = input?.value.trim() || '';
  if (!target || !value) return;
  target.innerHTML = '<div class="advies-loading"><span class="spin">\u23F3</span> Analyseren\u2026</div>';
  try {
    renderProposalCard('smart-dish-result', await analyzeDishNameWithAI(value));
  } catch (e) {
    target.innerHTML = '<p class="smart-error">' + esc(e?.message || 'Onbekende fout') + '</p>';
  }
}

export function parseSmartImportManual() {
  const pasteEl = document.getElementById('smart-manual-paste');
  const titleEl = document.getElementById('smart-manual-title');
  const kcalEl = document.getElementById('smart-manual-kcal');
  const proteinEl = document.getElementById('smart-manual-protein');
  const carbsEl = document.getElementById('smart-manual-carbs');
  const fatEl = document.getElementById('smart-manual-fat');
  const fiberEl = document.getElementById('smart-manual-fiber');
  const portionEl = document.getElementById('smart-manual-portion');
  const resultEl = document.getElementById('smart-manual-result');
  if (!resultEl) return;

  const raw = pasteEl?.value.trim() || '';
  if (!raw) {
    const hasManualValues = [
      kcalEl?.value,
      proteinEl?.value,
      carbsEl?.value,
      fatEl?.value,
      fiberEl?.value,
    ].some(v => String(v || '').trim() !== '');

    if (!hasManualValues) return;

    const manualProposal = createFoodFromManualNutrition({
      title: titleEl?.value.trim() || 'Handmatige invoer',
      calories: kcalEl?.value,
      protein_g: proteinEl?.value,
      carbs_g: carbsEl?.value,
      fat_g: fatEl?.value,
      fiber_g: fiberEl?.value,
      portionGrams: portionEl?.value || 100,
      portionLabel: 'Handmatige portie',
      rawSourceInput: titleEl?.value.trim() || 'Handmatige invoer',
    });
    renderProposalCard('smart-manual-result', manualProposal);
    return;
  }
  const parsed = parseManualNutritionPaste(
    raw,
    titleEl?.value.trim() || 'Geplakt gerecht',
    parseFloat(portionEl?.value) || 100
  );
  document.getElementById('smart-manual-kcal').value = parsed.calories;
  document.getElementById('smart-manual-protein').value = parsed.protein_g;
  document.getElementById('smart-manual-carbs').value = parsed.carbs_g;
  document.getElementById('smart-manual-fat').value = parsed.fat_g;
  document.getElementById('smart-manual-fiber').value = parsed.fiber_g;
  if (titleEl && !titleEl.value.trim()) titleEl.value = parsed.title;
  refreshManualProposal();
}

export function runSmartImportUrlImport() {
  const btn = document.getElementById('smart-url-import-btn');
  if (!btn) return;
  handleUrlImport(btn, renderProposalCard, feedbackNear);
}

/* ── Open / Close ────────────────────────────────────────── */

export function openSmartImportPage(prefillName) {
  const safePrefill = typeof prefillName === 'string' ? prefillName : '';
  syncSmartImportProviderSelects();
  syncSmartImportMealButtons();
  const layout = document.querySelector('.layout');
  if (!layout) return;
  layout.classList.remove('show-data', 'show-advies', 'show-admin');
  if (window.innerWidth >= 781) layout.classList.add('show-import');
  else {
    layout.classList.remove('mobile-view-invoer', 'mobile-view-overzicht', 'mobile-view-data', 'mobile-view-advies', 'mobile-view-admin');
    layout.classList.add('mobile-view-import');
    document.querySelectorAll('.mobile-tab').forEach((t, i) => t.classList.toggle('active', i === 4));
  }
  if (safePrefill) {
    switchSmartImportTab('dish_name');
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
  document.getElementById('smart-import-provider-select')?.addEventListener('change', syncSmartImportProviderSelects);
  document.getElementById('smart-import-model-select')?.addEventListener('change', () => {
    cfg.importProvider = document.getElementById('smart-import-provider-select')?.value;
    cfg.importModel = document.getElementById('smart-import-model-select')?.value;
    saveCfg(cfg);
  });

  document.getElementById('smart-dish-input')?.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || (!e.metaKey && !e.ctrlKey)) return;
    e.preventDefault();
    runSmartImportDishAnalysis();
  });

  document.getElementById('smart-photo-input')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleRecipePhotoUpload(file, feedbackNear);
    e.target.value = '';
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

  document.getElementById('smart-manage-search')?.addEventListener('input', e => renderManageList(e.target.value));
  document.getElementById('smart-manage-list')?.addEventListener('click', e => {
    const eb = e.target.closest('.smart-manage-edit');
    if (eb) return openEditProduct(Number(eb.dataset.idx), switchSmartImportTab);
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
    if (btn.dataset.action === 'apply-dish') applyProposalAsDishToDay(proposal, btn);
    if (btn.dataset.action === 'favorite') saveProposalAsFavorite(proposal, btn);
    if (btn.dataset.action === 'save-dish') saveProposalAsFavorite(proposal, btn);
    if (btn.dataset.action === 'apply-and-save-dish') {
      applyProposalAsDishToDay(proposal, btn);
      saveProposalAsFavorite(proposal, btn, { silent: true });
      feedbackNear(btn, '\u2713 ' + proposal.title + ' toegevoegd en opgeslagen als gerecht', 'ok');
    }
    if (btn.dataset.action === 'add-recipe-ingredient') {
      renderProposalCard(btn.dataset.target, rebuildRecipeProposalWithIngredients(proposal, [
        ...(proposal.recipe?.ingredients || []),
        {
          name: 'Nieuw ingrediënt',
          grams: 0,
          calories: 0,
          protein_g: 0,
          carbs_g: 0,
          fat_g: 0,
          fiber_g: 0,
          displayAmount: '',
          editingMatch: true,
          matchQuery: '',
          matchResults: [],
        },
      ]));
    }
    if (btn.dataset.action === 'remove-recipe-ingredient') {
      const ingredientIdx = Number(btn.dataset.ingredientIdx);
      renderProposalCard(
        btn.dataset.target,
        rebuildRecipeProposalWithIngredients(
          proposal,
          (proposal.recipe?.ingredients || []).filter((_, idx) => idx !== ingredientIdx),
        ),
      );
      clearIngredientSearchState(btn.dataset.target, ingredientIdx);
    }
    if (btn.dataset.action === 'toggle-match-edit') {
      const ingredientIdx = Number(btn.dataset.ingredientIdx);
      updateRecipeIngredient(btn.dataset.target, ingredientIdx, ingredient => ({
        ...ingredient,
        editingMatch: !ingredient.editingMatch,
        matchQuery: ingredient.matchQuery || ingredient.name,
        matchResults: ingredient.editingMatch ? ingredient.matchResults : getIngredientMatchResults({ recipe: { ingredients: [ingredient] } }, 0),
        matchLoading: false,
      }));
      if (!btn.closest('.smart-recipe-ingredient')?.querySelector('.smart-recipe-match-input')) {
        clearIngredientSearchState(btn.dataset.target, ingredientIdx);
      }
    }
    if (btn.dataset.action === 'select-match') {
      const ingredientIdx = Number(btn.dataset.ingredientIdx);
      const matchName = btn.dataset.matchName || '';
      clearIngredientSearchState(btn.dataset.target, ingredientIdx);
      updateRecipeIngredient(btn.dataset.target, ingredientIdx, ingredient => {
        const picked = (ingredient.matchResults || []).find(item => item.n === matchName)
          || searchNevo(matchName)[0]
          || matchItemToNevo({ foodName: matchName, gram: ingredient.grams || 0 });
        return {
          ...ingredient,
          manualMatch: picked || null,
          matchQuery: picked?.n || matchName || ingredient.name,
          editingMatch: false,
          matchResults: [],
          matchLoading: false,
        };
      });
    }
    if (btn.dataset.action === 'search-match') {
      const ingredientIdx = Number(btn.dataset.ingredientIdx);
      const results = getIngredientMatchResults(proposal, ingredientIdx);
      const picked = results[0];
      if (!picked) {
        const input = rEl.querySelector(`.smart-recipe-match-input[data-match-query="${ingredientIdx}"]`);
        input?.focus();
        return;
      }
      updateRecipeIngredient(btn.dataset.target, ingredientIdx, ingredient => ({
        ...ingredient,
        manualMatch: picked,
        matchQuery: picked.n || ingredient.matchQuery || ingredient.name,
        editingMatch: false,
        matchResults: [],
        matchLoading: false,
      }));
      clearIngredientSearchState(btn.dataset.target, ingredientIdx);
    }
    if (btn.dataset.action === 'edit') {
      renderInlineProposalEditor(btn.dataset.target, proposal);
    }
    if (btn.dataset.action === 'add-edit-ingredient') {
      updateEditingRecipeProposal(btn.dataset.target, proposal => ({
        ...proposal,
        recipe: {
          ...proposal.recipe,
          ingredients: [
            ...(proposal.recipe.ingredients || []),
            { name: '', grams: 0, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, displayAmount: '' },
          ],
        },
      }));
    }
    if (btn.dataset.action === 'remove-edit-ingredient') {
      const ingredientIdx = Number(btn.dataset.ingredientIdx);
      updateEditingRecipeProposal(btn.dataset.target, proposal => ({
        ...proposal,
        recipe: {
          ...proposal.recipe,
          ingredients: (proposal.recipe.ingredients || []).filter((_, idx) => idx !== ingredientIdx),
        },
      }));
    }
    if (btn.dataset.action === 'save-edit') {
      const originalProposal = JSON.parse(rEl.dataset.editingProposal || '{}');
      renderProposalCard(btn.dataset.target, readEditedProposal(btn.dataset.target, originalProposal));
      delete rEl.dataset.editingProposal;
    }
    if (btn.dataset.action === 'cancel-edit') {
      const originalProposal = JSON.parse(rEl.dataset.editingProposal || '{}');
      renderProposalCard(btn.dataset.target, originalProposal);
      delete rEl.dataset.editingProposal;
    }
    if (btn.dataset.action === 'cancel') rEl.innerHTML = '';
  });

  document.getElementById('smart-import-body')?.addEventListener('input', e => {
    const matchQueryInput = e.target.closest('.smart-recipe-match-input');
    if (matchQueryInput) {
      const ingredientIdx = Number(matchQueryInput.dataset.matchQuery);
      const localResults = getIngredientMatchResults({
        recipe: {
          ingredients: [{
            name: matchQueryInput.defaultValue || matchQueryInput.value,
            matchQuery: matchQueryInput.value,
          }],
        },
      }, 0);
      const nextProposal = mutateRecipeIngredientInDataset(matchQueryInput.dataset.target, ingredientIdx, ingredient => ({
        ...ingredient,
        matchQuery: matchQueryInput.value,
        editingMatch: true,
        matchResults: localResults,
        matchLoading: String(matchQueryInput.value || '').trim().length >= 3 && cfg.openFoodFactsLiveSearch !== false,
      }));
      const resultsEl = matchQueryInput.closest('.smart-recipe-match-editor')?.querySelector('.smart-recipe-match-results');
      if (resultsEl && nextProposal) {
        resultsEl.innerHTML = buildIngredientMatchResults(matchQueryInput.dataset.target, nextProposal, ingredientIdx);
      }
      queueIngredientHybridSearch(matchQueryInput.dataset.target, ingredientIdx, matchQueryInput.value);
      return;
    }
  });

  document.getElementById('smart-import-body')?.addEventListener('change', e => {
    const servingsInput = e.target.closest('.smart-recipe-servings');
    if (!servingsInput) return;
    commitRecipeServingsInput(servingsInput);
  });

  document.getElementById('smart-import-body')?.addEventListener('focusout', e => {
    const servingsInput = e.target.closest('.smart-recipe-servings');
    if (!servingsInput) return;
    commitRecipeServingsInput(servingsInput);
  });

  document.getElementById('smart-import-body')?.addEventListener('keydown', e => {
    const servingsInput = e.target.closest('.smart-recipe-servings');
    if (servingsInput && e.key === 'Enter') {
      e.preventDefault();
      commitRecipeServingsInput(servingsInput);
      servingsInput.blur();
      return;
    }
    const matchQueryInput = e.target.closest('.smart-recipe-match-input');
    if (!matchQueryInput || e.key !== 'Enter') return;
    e.preventDefault();
    const trigger = matchQueryInput.parentElement?.querySelector('.smart-recipe-match-search-icon');
    trigger?.click();
  });
}
