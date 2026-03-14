/* ── Custom Dish Suggestion Flow ──────────────────────────── */

import { r1 } from '../utils.js';
import { buildMealSuggestion, buildMealSuggestionFromExisting } from './meal-suggester.js';

let lastMealSuggestion = null;

function confidenceLabelNl(level) {
  if (level === 'high') return 'Hoog';
  if (level === 'medium') return 'Gemiddeld';
  return 'Laag';
}

function sourceTypeNl(sourceType) {
  if (sourceType === 'exact_recipe') return 'Exact recept';
  if (sourceType === 'known_dish') return 'Bekend gerecht';
  return 'Generiek gerecht';
}

function renderMealSuggestion(suggestion) {
  const card = document.getElementById('custom-dish-result');
  if (!card || !suggestion) return;

  card.style.display = '';
  const detectedEl = document.getElementById('custom-dish-detected');
  const metaEl = document.getElementById('custom-dish-meta');
  const confidenceEl = document.getElementById('custom-dish-confidence');
  const portionEl = document.getElementById('custom-dish-portion');
  const kcalEl = document.getElementById('custom-sug-kcal');
  const khEl = document.getElementById('custom-sug-kh');
  const vEl = document.getElementById('custom-sug-v');
  const eEl = document.getElementById('custom-sug-e');
  const vzEl = document.getElementById('custom-sug-vz');
  const assumptionsEl = document.getElementById('custom-assumptions-edit');

  if (detectedEl) detectedEl.textContent = suggestion.normalizedDishName;
  if (metaEl) metaEl.textContent = `${sourceTypeNl(suggestion.sourceType)} · ${suggestion.input.cuisine || 'onbekende keuken'}`;
  if (confidenceEl) {
    confidenceEl.textContent = `Confidence: ${confidenceLabelNl(suggestion.confidence)} (${Math.round((suggestion.confidenceScore || 0) * 100)}%)`;
    confidenceEl.className = `custom-confidence ${suggestion.confidence}`;
  }
  if (portionEl) portionEl.textContent = `${suggestion.portionSuggestion.label} (${suggestion.portionSuggestion.grams} g)`;
  if (kcalEl) kcalEl.textContent = `${suggestion.nutrition.calories} kcal`;
  if (khEl) khEl.textContent = `${suggestion.nutrition.carbs_g} g koolhydraten`;
  if (vEl) vEl.textContent = `${suggestion.nutrition.fat_g} g vetten`;
  if (eEl) eEl.textContent = `${suggestion.nutrition.protein_g} g eiwitten`;
  if (vzEl) vzEl.textContent = `${suggestion.nutrition.fiber_g} g vezels`;

  if (assumptionsEl) assumptionsEl.value = (suggestion.assumptions || []).join('\n• ');
}

function applySuggestionToCustomForm(suggestion) {
  if (!suggestion) return;
  document.getElementById('custom-naam').value = suggestion.normalizedDishName || '';
  document.getElementById('custom-portie').value = Math.round(suggestion.portionSuggestion?.grams || 100);
  document.getElementById('custom-kcal').value = Math.round(suggestion.nutrition?.calories || 0);
  document.getElementById('custom-kh').value = r1(suggestion.nutrition?.carbs_g || 0);
  document.getElementById('custom-v').value = r1(suggestion.nutrition?.fat_g || 0);
  document.getElementById('custom-e').value = r1(suggestion.nutrition?.protein_g || 0);
  document.getElementById('custom-vz').value = r1(suggestion.nutrition?.fiber_g || 0);

  const assumptionsTxt = document.getElementById('custom-assumptions-edit')?.value?.trim();
  if (assumptionsTxt) {
    const pasteEl = document.getElementById('custom-paste');
    if (pasteEl && !pasteEl.value.trim()) pasteEl.value = assumptionsTxt;
  }
}

export function clearCustomDishSuggestionState() {
  lastMealSuggestion = null;
}

export function analyzeCustomDishInput() {
  const input = (document.getElementById('custom-dish-input')?.value || document.getElementById('custom-url')?.value || '').trim();
  if (!input) {
    alert('Vul een gerechtomschrijving of recept-URL in.');
    return;
  }

  const btn = document.getElementById('custom-dish-analyze-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Analyseren…';
  }

  try {
    const suggestion = buildMealSuggestion(input);
    lastMealSuggestion = suggestion;
    renderMealSuggestion(suggestion);
  } catch (e) {
    alert('Kon invoer niet analyseren: ' + (e.message || 'onbekende fout'));
  }

  if (btn) {
    btn.disabled = false;
    btn.textContent = '🔎 Analyseer gerecht';
  }
}

export function applyCustomDishSuggestion() {
  if (!lastMealSuggestion) return;

  const assumptionsTxt = document.getElementById('custom-assumptions-edit')?.value?.trim();
  if (assumptionsTxt) {
    lastMealSuggestion.assumptions = assumptionsTxt
      .split('\n')
      .map(s => s.replace(/^\s*•\s*/, '').trim())
      .filter(Boolean);
  }

  applySuggestionToCustomForm(lastMealSuggestion);
  const status = document.getElementById('status');
  if (status) status.textContent = '✓ Voorstel ingevuld. Je kunt direct opslaan of nog aanpassen.';
}

export function quickSaveCustomDishSuggestion() {
  applyCustomDishSuggestion();
  const btn = document.getElementById('custom-add-btn');
  btn?.click();
}

export function setCustomDishPortionSize(size) {
  if (!lastMealSuggestion) return;
  const updated = buildMealSuggestionFromExisting(lastMealSuggestion, { size });
  if (!updated) return;
  lastMealSuggestion = updated;
  renderMealSuggestion(updated);
}

export function applyCustomDishAlternative(type) {
  if (!lastMealSuggestion) return;
  if (type !== 'veg') return;

  const updated = buildMealSuggestionFromExisting(lastMealSuggestion, { vegetarian: true });
  if (!updated) return;

  lastMealSuggestion = updated;
  renderMealSuggestion(updated);
}
