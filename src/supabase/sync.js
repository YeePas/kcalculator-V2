/* ── Supabase Sync (Favourites, Custom Products, Prefs) ───── */

import {
  cfg, authUser, showDrinks,
  setCfg, setVis,
  favoritesSyncTimer, setFavoritesSyncTimer,
  customProductsSyncTimer, setCustomProductsSyncTimer,
  prefsSyncTimer, setPrefsSyncTimer,
} from '../state.js';
import {
  loadFavs,
  saveFavs,
  loadGoals,
  saveGoals,
  loadVis,
  saveVis,
  loadCustomProducts,
  saveCustomProducts,
  saveCfg,
  loadWeight,
  saveWeight,
  normalizeStoredAiModel,
  getPrefSyncMetaEntry,
  applyRemotePrefsSyncMeta,
  buildPrefsSyncMetaPayload,
} from '../storage.js';
import { sbHeaders } from './config.js';
import {
  mapFavoriteRowToLocal,
  mapCustomRowToLocal,
} from './mappers.js';

const SYNCABLE_PREF_CATEGORIES = ['favs', 'goals', 'custom', 'cfg', 'vis', 'weight'];

function buildCfgPrefsValue(sourceCfg = cfg) {
  return {
    provider: sourceCfg.provider || '',
    model: sourceCfg.model || '',
    adviesProvider: sourceCfg.adviesProvider || '',
    adviesModel: sourceCfg.adviesModel || '',
    importProvider: sourceCfg.importProvider || '',
    importModel: sourceCfg.importModel || '',
    openFoodFactsLiveSearch: sourceCfg.openFoodFactsLiveSearch !== false,
    supermarketExclusions: Array.isArray(sourceCfg.supermarketExclusions) ? sourceCfg.supermarketExclusions : [],
  };
}

function extractRemoteCfgPrefsValue(prefs = {}) {
  if (!prefs || typeof prefs !== 'object') return undefined;
  const hasCfgData = [
    'provider',
    'model',
    'adviesProvider',
    'adviesModel',
    'importProvider',
    'importModel',
    'openFoodFactsLiveSearch',
    'supermarketExclusions',
  ].some(key => Object.prototype.hasOwnProperty.call(prefs, key));
  if (!hasCfgData) return undefined;
  return {
    provider: prefs.provider || '',
    model: normalizeStoredAiModel(prefs.model || ''),
    adviesProvider: prefs.adviesProvider || '',
    adviesModel: normalizeStoredAiModel(prefs.adviesModel || ''),
    importProvider: prefs.importProvider || '',
    importModel: normalizeStoredAiModel(prefs.importModel || ''),
    openFoodFactsLiveSearch: prefs.openFoodFactsLiveSearch !== false,
    supermarketExclusions: Array.isArray(prefs.supermarketExclusions) ? prefs.supermarketExclusions : [],
  };
}

async function fetchPrefsRowFromSupabase() {
  if (!cfg.sbUrl || !cfg.sbKey || !authUser?.id) return {};
  const r = await fetch(
    `${cfg.sbUrl}/rest/v1/eetdagboek?user_id=eq.${authUser.id}&date=eq.9999-01-01&select=data`,
    { headers: sbHeaders() }
  );
  const rows = r.ok ? await r.json() : [];
  return rows[0]?.data || {};
}

function hasMeaningfulArray(value) {
  return Array.isArray(value) && value.length > 0;
}

function hasMeaningfulObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0;
}

function applySyncedCfgValue(cfgValue) {
  if (!cfgValue) return;
  const nextCfg = { ...cfg, ...cfgValue };
  setCfg(nextCfg);
  saveCfg(nextCfg, { skipSyncMeta: true });
}

function applySyncedCategoryValue(category, value) {
  switch (category) {
    case 'favs':
      saveFavs(Array.isArray(value) ? value : [], { skipSyncMeta: true });
      break;
    case 'goals':
      if (value) saveGoals(value, { skipSyncMeta: true });
      break;
    case 'custom':
      saveCustomProducts(Array.isArray(value) ? value : [], { skipSyncMeta: true });
      break;
    case 'cfg':
      applySyncedCfgValue(value);
      break;
    case 'vis':
      if (value) {
        setVis(value);
        saveVis(value, { skipSyncMeta: true });
      }
      break;
    case 'weight':
      if (value) saveWeight(value, { skipSyncMeta: true });
      break;
    default:
      break;
  }
}

function buildMergedPrefsPayload(remotePrefs = {}) {
  const remoteMeta = remotePrefs._meta && typeof remotePrefs._meta === 'object' ? remotePrefs._meta : {};
  const localCfgValue = buildCfgPrefsValue();
  const remoteCfgValue = extractRemoteCfgPrefsValue(remotePrefs);
  const mergedMeta = {};
  const appliedRemoteMeta = {};

  const selectCategoryValue = (category, localValue, remoteValue) => {
    const remoteMetaEntry = remoteMeta[category];
    const useRemote = remoteValue !== undefined && shouldUseRemoteCategory(category, remoteMetaEntry);
    const value = useRemote ? remoteValue : localValue;
    const updatedAt = useRemote
      ? Number(remoteMetaEntry?.updatedAt || getPrefSyncMetaEntry(category).updatedAt || Date.now())
      : Number(getPrefSyncMetaEntry(category).updatedAt || Date.now());
    mergedMeta[category] = { updatedAt };
    if (useRemote && remoteMetaEntry?.updatedAt) {
      appliedRemoteMeta[category] = remoteMetaEntry;
      applySyncedCategoryValue(category, remoteValue);
    }
    return value;
  };

  const favsValue = selectCategoryValue('favs', loadFavs(), Array.isArray(remotePrefs.favs) ? remotePrefs.favs : undefined);
  const goalsValue = selectCategoryValue('goals', loadGoals(), hasMeaningfulObject(remotePrefs.goals) ? remotePrefs.goals : undefined);
  const customValue = selectCategoryValue('custom', loadCustomProducts(), Array.isArray(remotePrefs.custom) ? remotePrefs.custom : undefined);
  const cfgValue = selectCategoryValue('cfg', localCfgValue, remoteCfgValue);
  const visValue = selectCategoryValue('vis', loadVis(), hasMeaningfulObject(remotePrefs.vis) ? remotePrefs.vis : undefined);
  const weightValue = selectCategoryValue('weight', loadWeight(), hasMeaningfulObject(remotePrefs.weight) ? remotePrefs.weight : undefined);

  return {
    data: {
      favs: favsValue,
      goals: goalsValue,
      custom: customValue,
      ...cfgValue,
      vis: visValue,
      showDrinks: typeof remotePrefs.showDrinks === 'boolean' ? remotePrefs.showDrinks : showDrinks,
      weight: weightValue,
      _meta: mergedMeta,
    },
    appliedRemoteMeta,
  };
}

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
      let remotePrefs = {};
      try {
        remotePrefs = await fetchPrefsRowFromSupabase();
      } catch (e) {
        console.warn('[SyncPrefs] remote merge skipped:', e);
      }

      const mergedPrefs = buildMergedPrefsPayload(remotePrefs);
      const prefsRecord = {
        user_id: authUser.id,
        date: '9999-01-01',
        data: mergedPrefs.data,
      };
      const response = await fetch(cfg.sbUrl + '/rest/v1/eetdagboek?on_conflict=user_id,date', {
        method: 'POST',
        headers: { ...sbHeaders(true), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(prefsRecord),
      });
      if (response.ok) {
        applyRemotePrefsSyncMeta({
          ...buildPrefsSyncMetaPayload(SYNCABLE_PREF_CATEGORIES),
          ...mergedPrefs.data._meta,
          ...mergedPrefs.appliedRemoteMeta,
        });
      }
    } catch (e) { console.error('[SyncPrefs]', e); }
  };

  if (immediate) {
    await pushPrefs();
    return;
  }

  setPrefsSyncTimer(setTimeout(pushPrefs, 2500));
}

export function resolvePrefsArray(prefsValue, legacyValue, localValue, options = {}) {
  const { allowLocalFallback = true } = options;
  const prefsArray = Array.isArray(prefsValue) ? prefsValue : null;
  const legacyArray = Array.isArray(legacyValue) ? legacyValue : null;
  const localArray = Array.isArray(localValue) ? localValue : [];

  if (prefsArray?.length) return { value: prefsArray, source: 'prefs' };
  if (legacyArray?.length) return { value: legacyArray, source: 'legacy' };
  if (allowLocalFallback && localArray.length) return { value: localArray, source: 'local' };
  if (prefsArray) return { value: prefsArray, source: 'prefs' };
  if (legacyArray) return { value: legacyArray, source: 'legacy' };
  if (allowLocalFallback && localArray) return { value: localArray, source: 'local' };
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

function getRemoteCategoryUpdatedAt(remoteMetaEntry) {
  return Number(remoteMetaEntry?.updatedAt || 0);
}

function shouldUseRemoteCategory(category, remoteMetaEntry) {
  const localMeta = getPrefSyncMetaEntry(category);
  if (localMeta.dirty) return false;
  const remoteUpdatedAt = getRemoteCategoryUpdatedAt(remoteMetaEntry);
  return remoteUpdatedAt >= localMeta.updatedAt || localMeta.updatedAt === 0;
}

function resolveSyncedPrefsArray(category, prefsValue, legacyValue, localValue, remoteMetaEntry, options = {}) {
  const localMeta = getPrefSyncMetaEntry(category);
  const localArray = Array.isArray(localValue) ? localValue : [];
  if (localMeta.dirty) return { value: localArray, source: 'local-dirty' };

  const base = resolvePrefsArray(prefsValue, legacyValue, localArray, options);
  if (base.source === 'prefs') {
    return shouldUseRemoteCategory(category, remoteMetaEntry)
      ? base
      : { value: localArray, source: 'local' };
  }
  return base;
}

function resolveSyncedPrefsObject(category, prefsValue, localValue, remoteMetaEntry) {
  const localMeta = getPrefSyncMetaEntry(category);
  if (localMeta.dirty) {
    return { value: localValue, source: 'local-dirty' };
  }

  const base = resolvePrefsObject(prefsValue, localValue);
  if (base.source === 'prefs') {
    return shouldUseRemoteCategory(category, remoteMetaEntry)
      ? base
      : { value: localValue, source: 'local' };
  }
  return base;
}

export async function loadUserPrefs() {
  if (!cfg.sbUrl || !cfg.sbKey || !authUser?.id) return;
  try {
    // Try dedicated tables first to migrate older installs.
    const sbFavs = await fetchFavoritesFromSupabase();
    const sbCustom = await fetchCustomProductsFromSupabase();

    // The prefs row is the authoritative source for settings/favorites/customs.
    const prefs = await fetchPrefsRowFromSupabase();
    const remoteMeta = prefs._meta && typeof prefs._meta === 'object' ? prefs._meta : {};
    let shouldBackfillPrefs = false;
    const appliedRemoteMeta = {};

    const localFavs = loadFavs();
    const localGoals = loadGoals();
    const localCustom = loadCustomProducts();
    const localVis = loadVis();
    const localWeight = loadWeight();

    const favsChoice = resolveSyncedPrefsArray('favs', prefs.favs, sbFavs, localFavs, remoteMeta.favs, { allowLocalFallback: false });
    saveFavs(favsChoice.value || [], { skipSyncMeta: true });
    if (favsChoice.source === 'prefs') appliedRemoteMeta.favs = remoteMeta.favs;
    if ((favsChoice.source === 'legacy' || favsChoice.source === 'local') && hasMeaningfulArray(favsChoice.value)) shouldBackfillPrefs = true;

    const goalsChoice = resolveSyncedPrefsObject('goals', prefs.goals, localGoals, remoteMeta.goals);
    if (goalsChoice.value) {
      saveGoals(goalsChoice.value, { skipSyncMeta: true });
      if (goalsChoice.source === 'prefs') appliedRemoteMeta.goals = remoteMeta.goals;
    }

    const customChoice = resolveSyncedPrefsArray('custom', prefs.custom, sbCustom, localCustom, remoteMeta.custom, { allowLocalFallback: false });
    saveCustomProducts(customChoice.value || [], { skipSyncMeta: true });
    if (customChoice.source === 'prefs') appliedRemoteMeta.custom = remoteMeta.custom;
    if ((customChoice.source === 'legacy' || customChoice.source === 'local') && hasMeaningfulArray(customChoice.value)) shouldBackfillPrefs = true;

    const visChoice = resolveSyncedPrefsObject('vis', prefs.vis, localVis, remoteMeta.vis);
    if (visChoice.value) {
      setVis(visChoice.value);
      saveVis(visChoice.value, { skipSyncMeta: true });
      if (visChoice.source === 'prefs') appliedRemoteMeta.vis = remoteMeta.vis;
    }

    const weightChoice = resolveSyncedPrefsObject('weight', prefs.weight, localWeight, remoteMeta.weight);
    if (weightChoice.value) {
      saveWeight(weightChoice.value, { skipSyncMeta: true });
      if (weightChoice.source === 'prefs') appliedRemoteMeta.weight = remoteMeta.weight;
    }

    const useRemoteCfg = shouldUseRemoteCategory('cfg', remoteMeta.cfg);
    const nextCfg = useRemoteCfg ? {
      ...cfg,
      provider: prefs.provider || cfg.provider || '',
      model: normalizeStoredAiModel(prefs.model || cfg.model || ''),
      adviesProvider: prefs.adviesProvider || cfg.adviesProvider || '',
      adviesModel: normalizeStoredAiModel(prefs.adviesModel || cfg.adviesModel || ''),
      importProvider: prefs.importProvider || cfg.importProvider || '',
      importModel: normalizeStoredAiModel(prefs.importModel || cfg.importModel || ''),
      openFoodFactsLiveSearch: prefs.openFoodFactsLiveSearch !== false,
      supermarketExclusions: Array.isArray(prefs.supermarketExclusions) ? prefs.supermarketExclusions : (cfg.supermarketExclusions || []),
    } : cfg;
    setCfg(nextCfg);
    saveCfg(nextCfg, { skipSyncMeta: true });
    if (useRemoteCfg) appliedRemoteMeta.cfg = remoteMeta.cfg;

    applyRemotePrefsSyncMeta(appliedRemoteMeta);

    if (shouldBackfillPrefs) await syncUserPrefs(true);
  } catch (e) { console.error('[LoadPrefs]', e); }
}
