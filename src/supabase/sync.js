/* ── Supabase Sync (Favourites, Custom Products, Prefs) ───── */

import {
  cfg, authUser, goals, vis, showDrinks, localData,
  setCfg, setVis,
  favoritesSyncTimer, setFavoritesSyncTimer,
  customProductsSyncTimer, setCustomProductsSyncTimer,
  prefsSyncTimer, setPrefsSyncTimer,
} from '../state.js';
import { VIS_KEY } from '../constants.js';
import {
  getLocalStorage,
  loadFavs,
  saveFavs,
  loadGoals,
  saveGoals,
  loadCustomProducts,
  saveCustomProducts,
  saveCfg,
  safeSetJson,
} from '../storage.js';
import { sbHeaders } from './config.js';
import {
  mapFavoriteRowToLocal,
  mapCustomRowToLocal,
} from './mappers.js';

// ── Fetch & Push functions ────────────────────────────────

export async function fetchFavoritesFromSupabase() {
  if (!cfg.sbUrl || !cfg.sbKey || !authUser?.id) return null;
  try {
    const r = await fetch(
      `${cfg.sbUrl}/rest/v1/favorites?user_id=eq.${authUser.id}&select=name,meal,is_recipe,text_value,item,items,created_at,updated_at&order=updated_at.asc`,
      { headers: sbHeaders() }
    );
    if (!r.ok) {
      if (r.status !== 404) console.error('[favorites] load error:', r.status);
      return null;
    }
    const rows = await r.json();
    return rows.map(mapFavoriteRowToLocal);
  } catch { return null; }
}

export async function fetchCustomProductsFromSupabase() {
  if (!cfg.sbUrl || !cfg.sbKey || !authUser?.id) return null;
  try {
    const r = await fetch(
      `${cfg.sbUrl}/rest/v1/custom_products?user_id=eq.${authUser.id}&select=name,kcal,carbs_g,fiber_g,fat_g,protein_g,portion,updated_at&order=updated_at.asc`,
      { headers: sbHeaders() }
    );
    if (!r.ok) {
      if (r.status !== 404) console.error('[customProducts] load error:', r.status);
      return null;
    }
    const rows = await r.json();
    return rows.map(mapCustomRowToLocal);
  } catch { return null; }
}

export async function syncFavoritesToSupabase() {
  if (!cfg.sbUrl || !cfg.sbKey || !authUser?.id) return;
  clearTimeout(favoritesSyncTimer);
  setFavoritesSyncTimer(setTimeout(() => {
    syncUserPrefs(true).catch(e => console.error('[SyncFavs]', e));
  }, 600));
}

export async function syncCustomProductsToSupabase(immediate = false) {
  if (!cfg.sbUrl || !cfg.sbKey || !authUser?.id) return;
  if (immediate) {
    clearTimeout(customProductsSyncTimer);
    try { await syncUserPrefs(true); }
    catch (e) { console.error('[SyncCustom]', e); }
    return;
  }
  clearTimeout(customProductsSyncTimer);
  setCustomProductsSyncTimer(setTimeout(() => {
    syncUserPrefs(true).catch(e => console.error('[SyncCustom]', e));
  }, 600));
}

// ── User Preferences Sync ─────────────────────────────────

export async function syncUserPrefs(immediate = false) {
  if (!cfg.sbUrl || !cfg.sbKey || !authUser?.id) return;
  clearTimeout(prefsSyncTimer);
  const pushPrefs = async () => {
    try {
      const prefsRecord = {
        user_id: authUser.id,
        date: '9999-01-01',
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
        method: 'POST',
        headers: { ...sbHeaders(true), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(prefsRecord),
      });
    } catch (e) { console.error('[SyncPrefs]', e); }
  };

  if (immediate) {
    await pushPrefs();
    return;
  }

  setPrefsSyncTimer(setTimeout(pushPrefs, 2500));
}

export function resolvePrefsArray(prefsValue, legacyValue, localValue) {
  const prefsArray = Array.isArray(prefsValue) ? prefsValue : null;
  const legacyArray = Array.isArray(legacyValue) ? legacyValue : null;
  const localArray = Array.isArray(localValue) ? localValue : [];

  if (prefsArray?.length) return { value: prefsArray, source: 'prefs' };
  if (legacyArray?.length) return { value: legacyArray, source: 'legacy' };
  if (localArray.length) return { value: localArray, source: 'local' };
  if (prefsArray) return { value: prefsArray, source: 'prefs' };
  if (legacyArray) return { value: legacyArray, source: 'legacy' };
  return { value: null, source: 'none' };
}

export function resolvePrefsObject(prefsValue, localValue) {
  const prefsObject = prefsValue && typeof prefsValue === 'object' && !Array.isArray(prefsValue) ? prefsValue : null;
  const localObject = localValue && typeof localValue === 'object' && !Array.isArray(localValue) ? localValue : null;

  if (prefsObject && Object.keys(prefsObject).length > 0) return { value: prefsObject, source: 'prefs' };
  if (localObject && Object.keys(localObject).length > 0) return { value: localObject, source: 'local' };
  if (prefsObject) return { value: prefsObject, source: 'prefs' };
  if (localObject) return { value: localObject, source: 'local' };
  return { value: null, source: 'none' };
}

export async function loadUserPrefs() {
  if (!cfg.sbUrl || !cfg.sbKey || !authUser?.id) return;
  try {
    const localFavs = loadFavs();
    const localCustom = loadCustomProducts();

    // Try dedicated tables first to migrate older installs.
    const sbFavs = await fetchFavoritesFromSupabase();
    const sbCustom = await fetchCustomProductsFromSupabase();

    // The prefs row is the authoritative source for settings/favorites/customs.
    const r = await fetch(
      `${cfg.sbUrl}/rest/v1/eetdagboek?user_id=eq.${authUser.id}&date=eq.9999-01-01&select=data`,
      { headers: sbHeaders() }
    );
    if (!r.ok) return;
    const rows = await r.json();
    const prefs = rows[0]?.data || {};
    let shouldBackfillPrefs = false;

    const favsChoice = resolvePrefsArray(prefs.favs, sbFavs, localFavs);
    if (favsChoice.value) saveFavs(favsChoice.value);
    if (favsChoice.source === 'legacy' || favsChoice.source === 'local') shouldBackfillPrefs = true;

    if (prefs.goals) saveGoals(prefs.goals);

    const customChoice = resolvePrefsArray(prefs.custom, sbCustom, localCustom);
    if (customChoice.value) saveCustomProducts(customChoice.value);
    if (customChoice.source === 'legacy' || customChoice.source === 'local') shouldBackfillPrefs = true;

    if (prefs.vis) {
      setVis(prefs.vis);
      safeSetJson(getLocalStorage(), VIS_KEY, prefs.vis);
    }

    const nextCfg = {
      ...cfg,
      provider: prefs.provider || cfg.provider || '',
      adviesProvider: prefs.adviesProvider || cfg.adviesProvider || '',
      adviesModel: prefs.adviesModel || cfg.adviesModel || '',
      importProvider: prefs.importProvider || cfg.importProvider || '',
      importModel: prefs.importModel || cfg.importModel || '',
      openFoodFactsLiveSearch: prefs.openFoodFactsLiveSearch !== false,
      supermarketExclusions: Array.isArray(prefs.supermarketExclusions) ? prefs.supermarketExclusions : (cfg.supermarketExclusions || []),
    };
    setCfg(nextCfg);
    saveCfg(nextCfg);

    if (shouldBackfillPrefs) await syncUserPrefs(true);
  } catch (e) { console.error('[LoadPrefs]', e); }
}
