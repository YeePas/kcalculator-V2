/* ── Custom Product Modal UI ──────────────────────────────── */

import { cfg } from '../state.js';
import { loadCustomProducts } from '../storage.js';
import { r1 } from '../utils.js';
import { hasAiProxyConfig } from '../ai/providers.js';
import { trapFocus, releaseFocus } from '../ui/focus.js';
import { clearCustomDishSuggestionState } from './custom-suggestion.js';

export function openCustomModal(prefillName) {
  const dd = document.getElementById('ac-dropdown');
  if (dd) dd.classList.remove('open');

  const modal = document.getElementById('custom-product-modal');
  document.getElementById('custom-naam').value = prefillName || '';
  document.getElementById('custom-kcal').value = '';
  document.getElementById('custom-kh').value = '';
  document.getElementById('custom-vz').value = '';
  document.getElementById('custom-v').value = '';
  document.getElementById('custom-e').value = '';
  document.getElementById('custom-portie').value = '100';
  document.getElementById('custom-save-to-db').checked = true;

  const favCheck = document.getElementById('custom-save-to-fav');
  if (favCheck) favCheck.checked = false;

  const pasteEl = document.getElementById('custom-paste');
  if (pasteEl) pasteEl.value = '';

  const dishInputEl = document.getElementById('custom-dish-input');
  if (dishInputEl) dishInputEl.value = prefillName || '';

  const suggCard = document.getElementById('custom-dish-result');
  if (suggCard) suggCard.style.display = 'none';

  const suggAssumptions = document.getElementById('custom-assumptions-edit');
  if (suggAssumptions) suggAssumptions.value = '';
  clearCustomDishSuggestionState();

  const photoPreview = document.getElementById('custom-photo-preview');
  if (photoPreview) {
    photoPreview.src = '';
    photoPreview.style.display = 'none';
  }

  const photoInput = document.getElementById('custom-photo-input');
  if (photoInput) photoInput.value = '';

  updatePhotoModelSelect();

  const customs = loadCustomProducts();
  document.getElementById('custom-count').textContent = customs.length > 0
    ? `${customs.length} eigen product${customs.length !== 1 ? 'en' : ''} opgeslagen`
    : '';

  modal.classList.add('open');
  trapFocus(modal);

  setTimeout(() => {
    const target = prefillName ? document.getElementById('custom-kcal') : document.getElementById('custom-naam');
    target?.focus();
  }, 100);
}

export function closeCustomModal() {
  document.getElementById('custom-product-modal').classList.remove('open');
  releaseFocus();
}

export function updatePhotoModelSelect() {
  const sel = document.getElementById('custom-photo-model');
  if (!sel) return;

  const opts = [
    { value: 'claude|claude-haiku-4-5-20251001', label: 'Claude Haiku' },
    { value: 'claude|claude-sonnet-4-5', label: 'Claude Sonnet' },
    { value: 'gemini|gemini-2.5-flash', label: 'Gemini Flash' },
    { value: 'gemini|gemini-2.5-pro', label: 'Gemini Pro' },
    { value: 'openai|gpt-4o-mini', label: 'GPT-4o mini' },
    { value: 'openai|gpt-4o', label: 'GPT-4o' },
  ];

  const available = opts.filter(o => {
    return hasAiProxyConfig();
  });

  sel.innerHTML = available.map(o => `<option value="${o.value}">${o.label}</option>`).join('');

  const def = (cfg.provider || 'claude') + '|' + (cfg.model || 'claude-haiku-4-5-20251001');
  if (available.some(o => o.value === def)) sel.value = def;
}

export function fillCustomFields(naam, kcal, kh, vz, v, e, portie) {
  if (naam) document.getElementById('custom-naam').value = naam;
  document.getElementById('custom-kcal').value = Math.round(kcal || 0);
  document.getElementById('custom-kh').value = r1(kh || 0);
  document.getElementById('custom-vz').value = r1(vz || 0);
  document.getElementById('custom-v').value = r1(v || 0);
  document.getElementById('custom-e').value = r1(e || 0);
  if (portie) document.getElementById('custom-portie').value = Math.round(portie);
}
