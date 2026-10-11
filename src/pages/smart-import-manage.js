/* ── Smart Import: Custom Products & Favorites Management ── */

import { esc, r1 } from '../utils.js';
import { loadCustomProducts, saveCustomProducts, loadFavs, saveFavs } from '../storage.js';
import { syncCustomProductsToSupabase, syncFavoritesToSupabase } from '../supabase/sync.js';
import { renderQuickFavs } from '../ui/misc.js';
import { ICON_EDIT, ICON_DELETE } from '../ui/icons.js';

const COLLAPSED_KEY = 'kcal_manage_collapsed_v1';
const MANAGE_GROUPS = [
  { id: 'products', icon: '🥫', title: 'Eigen producten', hint: 'Voedingswaarden per 100 g', empty: 'Geen eigen producten gevonden.' },
  { id: 'recipes', icon: '🍽️', title: 'Gerechten', hint: 'Samengesteld uit meerdere ingrediënten', empty: 'Geen gerechten gevonden.' },
  { id: 'favorites', icon: '⭐', title: 'Favorieten', hint: 'Snel toevoegen met vaste portie', empty: 'Geen favorieten gevonden.' },
];

function loadCollapsedGroups() {
  try { return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '[]')); } catch { return new Set(); }
}

function saveCollapsedGroups(groups) {
  try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...groups])); } catch {}
}

function renderProductItem(c, origIdx) {
  return '<div class="smart-manage-item" data-idx="' + origIdx + '">'
    + '<div class="smart-manage-info">'
    + '<strong>' + esc(c.n || 'Onbekend') + '</strong>'
    + '<span>' + Math.round(c.k || 0) + ' kcal · ' + r1(c.e || 0) + 'e · ' + r1(c.kh || 0) + 'kh · ' + r1(c.v || 0) + 'v · ' + r1(c.vz || 0) + 'vz /100g</span>'
    + '</div>'
    + '<div class="smart-manage-actions">'
    + '<button class="icon-action smart-manage-edit" data-idx="' + origIdx + '" title="Bewerken" aria-label="Bewerken">' + ICON_EDIT + '</button>'
    + '<button class="icon-action is-danger smart-manage-delete" data-idx="' + origIdx + '" title="Verwijderen" aria-label="Verwijderen">' + ICON_DELETE + '</button>'
    + '</div></div>';
}

function renderFavItem(f, origIdx, isRecipe) {
  const item = f.item || {};
  const macroLabel = isRecipe
    ? `${Math.round(item.kcal || 0)} kcal · ${f.items.length} ingrediënten`
    : `${Math.round(item.kcal || 0)} kcal · ${r1(item.eiwitten_g || 0)}e · ${r1(item.koolhydraten_g || 0)}kh · ${r1(item.vetten_g || 0)}v`;
  return '<div class="smart-manage-item" data-fav-idx="' + origIdx + '">'
    + '<div class="smart-manage-info">'
    + '<strong>' + esc(f.naam || item.naam || f.tekst || 'Onbekend favoriet') + '</strong>'
    + '<span>' + esc(macroLabel) + '</span>'
    + '</div>'
    + '<div class="smart-manage-actions">'
    + '<button class="icon-action smart-manage-fav-edit" data-fav-idx="' + origIdx + '" title="Bewerken" aria-label="Bewerken">' + ICON_EDIT + '</button>'
    + '<button class="icon-action is-danger smart-manage-fav-delete" data-fav-idx="' + origIdx + '" title="Verwijderen" aria-label="Verwijderen">' + ICON_DELETE + '</button>'
    + '</div></div>';
}

export function renderManageList(filter) {
  const list = document.getElementById('smart-manage-list');
  if (!list) return;
  const customs = loadCustomProducts();
  const favs = loadFavs();
  const q = (filter || '').toLowerCase().trim();
  const matchesFav = f => !q || `${f.naam || ''} ${f.tekst || ''} ${f.item?.naam || ''}`.toLowerCase().includes(q);
  const isRecipeFav = f => Boolean(f.isRecipe && f.items && f.items.length > 1);

  const groups = {
    products: customs.map((c, i) => ({ c, i })).filter(({ c }) => !q || (c.n || '').toLowerCase().includes(q))
      .map(({ c, i }) => renderProductItem(c, i)),
    recipes: favs.map((f, i) => ({ f, i })).filter(({ f }) => isRecipeFav(f) && matchesFav(f))
      .map(({ f, i }) => renderFavItem(f, i, true)),
    favorites: favs.map((f, i) => ({ f, i })).filter(({ f }) => !isRecipeFav(f) && matchesFav(f))
      .map(({ f, i }) => renderFavItem(f, i, false)),
  };

  if (!groups.products.length && !groups.recipes.length && !groups.favorites.length) {
    list.innerHTML = '<div class="do-empty">' + (q ? 'Niets gevonden voor deze zoekterm.' : 'Nog geen eigen producten, gerechten of favorieten.') + '</div>';
    refreshManageFoldButton();
    return;
  }

  const collapsed = loadCollapsedGroups();
  list.innerHTML = MANAGE_GROUPS.map(group => {
    const items = groups[group.id];
    // While searching, open every group that has a hit and hide the empty ones.
    if (q && !items.length) return '';
    const open = q ? true : !collapsed.has(group.id);
    return '<details class="smart-manage-section smart-manage-' + group.id + '" data-group="' + group.id + '"' + (open ? ' open' : '') + '>'
      + '<summary class="smart-manage-head">'
      + '<span class="smart-manage-head-icon" aria-hidden="true">' + group.icon + '</span>'
      + '<span class="smart-manage-head-text"><span class="smart-manage-head-title">' + group.title + '</span>'
      + '<span class="smart-manage-head-hint">' + group.hint + '</span></span>'
      + '<span class="smart-manage-count">' + items.length + '</span>'
      + '<span class="smart-manage-chevron" aria-hidden="true"></span>'
      + '</summary>'
      + '<div class="smart-manage-items">' + (items.length ? items.join('') : '<div class="do-empty">' + group.empty + '</div>') + '</div>'
      + '</details>';
  }).join('');
  refreshManageFoldButton();
}

function refreshManageFoldButton() {
  const btn = document.getElementById('smart-manage-fold-btn');
  if (!btn) return;
  const sections = [...document.querySelectorAll('#smart-manage-list details.smart-manage-section')];
  btn.style.display = sections.length ? '' : 'none';
  const allCollapsed = sections.length > 0 && sections.every(sec => !sec.open);
  const label = allCollapsed ? 'Alles uitklappen' : 'Alles inklappen';
  btn.classList.toggle('is-collapsed', allCollapsed);
  btn.title = label;
  btn.setAttribute('aria-label', label);
}

// Remember which groups the user folded (not while a search forces them open).
export function onManageSectionToggle(section) {
  if (document.getElementById('smart-manage-search')?.value.trim()) {
    refreshManageFoldButton();
    return;
  }
  const collapsed = loadCollapsedGroups();
  if (section.open) collapsed.delete(section.dataset.group);
  else collapsed.add(section.dataset.group);
  saveCollapsedGroups(collapsed);
  refreshManageFoldButton();
}

export function toggleAllManageSections() {
  const sections = [...document.querySelectorAll('#smart-manage-list details.smart-manage-section')];
  if (!sections.length) return;
  const collapseAll = sections.some(sec => sec.open);
  sections.forEach(sec => { sec.open = !collapseAll; });
  if (!document.getElementById('smart-manage-search')?.value.trim()) {
    saveCollapsedGroups(new Set(collapseAll ? MANAGE_GROUPS.map(g => g.id) : []));
  }
  refreshManageFoldButton();
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
