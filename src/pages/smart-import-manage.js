/* ── Smart Import: Custom Products & Favorites Management ── */

import { esc, r1 } from '../utils.js';
import { loadCustomProducts, saveCustomProducts, loadFavs, saveFavs } from '../storage.js';
import { syncCustomProductsToSupabase, syncFavoritesToSupabase } from '../supabase/sync.js';
import { renderQuickFavs } from '../ui/misc.js';

export function renderManageList(filter) {
  const list = document.getElementById('smart-manage-list');
  if (!list) return;
  const customs = loadCustomProducts();
  const favs = loadFavs();
  const q = (filter || '').toLowerCase();
  const filtered = q ? customs.filter(c => (c.n || '').toLowerCase().includes(q)) : customs;
  const filteredFavs = q
    ? favs.filter(f => `${f.naam || ''} ${f.tekst || ''} ${f.item?.naam || ''}`.toLowerCase().includes(q))
    : favs;

  if (!filtered.length && !filteredFavs.length) {
    list.innerHTML = '<div class="do-empty">Geen eigen producten of favorieten gevonden.</div>';
    return;
  }

  const customHtml = filtered.length ? filtered.map(c => {
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
  }).join('') : '<div class="do-empty">Geen eigen producten gevonden.</div>';

  const favHtml = filteredFavs.length ? filteredFavs.map(f => {
    const origIdx = favs.indexOf(f);
    const item = f.item || {};
    const isRecipe = f.isRecipe && f.items && f.items.length > 1;
    const macroLabel = isRecipe
      ? `${Math.round(item.kcal || 0)} kcal · ${f.items.length} ingrediënten`
      : `${Math.round(item.kcal || 0)} kcal · ${r1(item.eiwitten_g || 0)}e · ${r1(item.koolhydraten_g || 0)}kh · ${r1(item.vetten_g || 0)}v`;
    return '<div class="smart-manage-item" data-fav-idx="' + origIdx + '">'
      + '<div class="smart-manage-info">'
      + '<strong>' + esc(f.naam || item.naam || f.tekst || 'Onbekend favoriet') + (isRecipe ? ' <span style="color:var(--accent)">🍽️</span>' : '') + '</strong>'
      + '<span>' + esc(macroLabel) + '</span>'
      + '</div>'
      + '<div class="smart-manage-actions">'
      + '<button class="btn-secondary smart-manage-fav-edit" data-fav-idx="' + origIdx + '" title="Bewerken">✏️</button>'
      + '<button class="btn-secondary smart-manage-fav-delete" data-fav-idx="' + origIdx + '" title="Verwijderen">🗑️</button>'
      + '</div></div>';
  }).join('') : '<div class="do-empty">Geen favorieten of gerechten gevonden.</div>';

  list.innerHTML = '<div class="smart-manage-section">'
    + '<h3>Eigen producten</h3>'
    + customHtml
    + '</div>'
    + '<div class="smart-manage-section">'
    + '<h3>Favorieten & gerechten</h3>'
    + favHtml
    + '</div>';
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

export function deleteFavoriteFromManage(idx) {
  const favs = loadFavs();
  const fav = favs[idx];
  if (!fav) return;
  if (!confirm('"' + (fav.naam || fav.item?.naam || 'favoriet') + '" verwijderen uit favorieten?')) return;
  favs.splice(idx, 1);
  saveFavs(favs);
  syncFavoritesToSupabase();
  renderQuickFavs();
  renderManageList(document.getElementById('smart-manage-search')?.value || '');
}
