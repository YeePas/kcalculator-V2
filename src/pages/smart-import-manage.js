/* ── Smart Import: Custom Products Management ────────────── */

import { esc, r1 } from '../utils.js';
import { loadCustomProducts, saveCustomProducts } from '../storage.js';
import { syncCustomProductsToSupabase } from '../supabase/sync.js';

export function renderManageList(filter) {
  const list = document.getElementById('smart-manage-list');
  if (!list) return;
  const customs = loadCustomProducts();
  const q = (filter || '').toLowerCase();
  const filtered = q ? customs.filter(c => (c.n || '').toLowerCase().includes(q)) : customs;

  if (!filtered.length) {
    list.innerHTML = '<div class="do-empty">Geen eigen producten gevonden.</div>';
    return;
  }

  list.innerHTML = filtered.map(c => {
    const origIdx = customs.indexOf(c);
    return '<div class="smart-manage-item" data-idx="' + origIdx + '">'
      + '<div class="smart-manage-info">'
      + '<strong>' + esc(c.n || 'Onbekend') + '</strong>'
      + '<span>' + Math.round(c.k || 0) + ' kcal · ' + r1(c.e || 0) + 'e · ' + r1(c.kh || 0) + 'kh · ' + r1(c.v || 0) + 'v · ' + r1(c.vz || 0) + 'vz /100g</span>'
      + '</div>'
      + '<div class="smart-manage-actions">'
      + '<button class="btn-secondary smart-manage-edit" data-idx="' + origIdx + '" title="Bewerken">✏️</button>'
      + '<button class="btn-secondary smart-manage-delete" data-idx="' + origIdx + '" title="Verwijderen">🗑️</button>'
      + '</div></div>';
  }).join('');
}

export function openEditProduct(idx, switchTabFn) {
  const customs = loadCustomProducts();
  const c = customs[idx];
  if (!c) return;
  switchTabFn('manual_nutrition');
  document.getElementById('smart-manual-title').value = c.n || '';
  document.getElementById('smart-manual-kcal').value = Math.round(c.k || 0);
  document.getElementById('smart-manual-protein').value = r1(c.e || 0);
  document.getElementById('smart-manual-carbs').value = r1(c.kh || 0);
  document.getElementById('smart-manual-fat').value = r1(c.v || 0);
  document.getElementById('smart-manual-fiber').value = r1(c.vz || 0);
  document.getElementById('smart-manual-portion').value = 100;
}

export async function deleteProduct(idx) {
  const customs = loadCustomProducts();
  const c = customs[idx];
  if (!c) return;
  if (!confirm('"' + c.n + '" verwijderen uit eigen producten?')) return;
  customs.splice(idx, 1);
  saveCustomProducts(customs);
  await syncCustomProductsToSupabase(true);
  renderManageList(document.getElementById('smart-manage-search')?.value || '');
}
