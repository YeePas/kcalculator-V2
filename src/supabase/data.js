/* ── Supabase Data Operations ──────────────────────────────── */

import { cfg, authUser, localData, syncTimer, setSyncTimer } from '../state.js';
import { LOCAL_KEY, LOCAL_META_KEY, MEAL_NAMES } from '../constants.js';
import { emptyDay, normalizeDayData } from '../utils.js';
import { sbHeaders } from './config.js';
import { setSyncStatus } from '../ui/sync-status.js';

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { /* ignore */ }
}

function normalizeMetaEntry(value) {
  return {
    dirty: value?.dirty === true,
    updatedAt: Number(value?.updatedAt || 0),
    lastSyncedAt: Number(value?.lastSyncedAt || 0),
    lastRemoteAt: Number(value?.lastRemoteAt || 0),
  };
}

function isEffectivelyEmptyDay(day) {
  const normalized = normalizeDayData(day);
  return MEAL_NAMES.every(meal => !Array.isArray(normalized[meal]) || normalized[meal].length === 0);
}

function loadLocalDaysRaw() {
  return readJson(LOCAL_KEY, {});
}

function saveLocalDaysRaw(all) {
  writeJson(LOCAL_KEY, all);
}

export function loadLocalDayMeta() {
  const meta = readJson(LOCAL_META_KEY, {});
  const all = loadLocalDaysRaw();
  let changed = false;

  for (const date of Object.keys(all)) {
    if (date === '9999-01-01') continue;
    if (!meta[date] || typeof meta[date] !== 'object') {
      meta[date] = normalizeMetaEntry(null);
      changed = true;
    } else {
      const normalized = normalizeMetaEntry(meta[date]);
      if (JSON.stringify(normalized) !== JSON.stringify(meta[date])) {
        meta[date] = normalized;
        changed = true;
      }
    }
  }

  if (changed) writeJson(LOCAL_META_KEY, meta);
  return meta;
}

function saveLocalDayMeta(meta) {
  writeJson(LOCAL_META_KEY, meta);
}

function setInMemoryDay(dateStr, day) {
  if (day) localData[dateStr] = day;
  else delete localData[dateStr];
}

function getDayMeta(dateStr) {
  const meta = loadLocalDayMeta();
  return { meta, entry: normalizeMetaEntry(meta[dateStr]) };
}

export function getCachedDay(dateStr) {
  const fromMemory = localData[dateStr];
  if (fromMemory) return normalizeDayData(fromMemory);
  const all = loadLocalDaysRaw();
  return all[dateStr] ? normalizeDayData(all[dateStr]) : null;
}

export function getCachedDateKeys(limit = Infinity) {
  const all = loadLocalDaysRaw();
  const keys = new Set([
    ...Object.keys(all || {}),
    ...Object.keys(localData || {}),
  ]);
  return Array.from(keys)
    .filter(key => key && key !== '9999-01-01')
    .sort()
    .reverse()
    .slice(0, limit);
}

export function cacheDayLocally(dateStr, day, { dirty = false, synced = false } = {}) {
  const normalized = normalizeDayData(day);
  const all = loadLocalDaysRaw();
  const meta = loadLocalDayMeta();
  const now = Date.now();
  const isEmpty = isEffectivelyEmptyDay(normalized);

  if (isEmpty) {
    delete all[dateStr];
    setInMemoryDay(dateStr, null);
  } else {
    all[dateStr] = normalized;
    setInMemoryDay(dateStr, normalized);
  }
  saveLocalDaysRaw(all);

  meta[dateStr] = {
    ...normalizeMetaEntry(meta[dateStr]),
    dirty,
    updatedAt: now,
    lastSyncedAt: synced ? now : Number(meta[dateStr]?.lastSyncedAt || 0),
    lastRemoteAt: synced ? now : Number(meta[dateStr]?.lastRemoteAt || 0),
  };
  saveLocalDayMeta(meta);
  return normalized;
}

export function markDaySynced(dateStr) {
  const { meta, entry } = getDayMeta(dateStr);
  const now = Date.now();
  meta[dateStr] = {
    ...entry,
    dirty: false,
    lastSyncedAt: now,
    lastRemoteAt: now,
  };
  saveLocalDayMeta(meta);
}

export function applyRemoteDayToLocalCache(dateStr, remoteDay, { allowDelete = true } = {}) {
  const cached = getCachedDay(dateStr);
  const { meta, entry } = getDayMeta(dateStr);

  if (entry.dirty) {
    return { applied: false, skipped: 'dirty', day: cached || emptyDay() };
  }

  const all = loadLocalDaysRaw();
  const now = Date.now();

  if (!remoteDay) {
    if (allowDelete && Object.prototype.hasOwnProperty.call(all, dateStr)) {
      delete all[dateStr];
      saveLocalDaysRaw(all);
      setInMemoryDay(dateStr, null);
      meta[dateStr] = {
        ...entry,
        dirty: false,
        lastRemoteAt: now,
        lastSyncedAt: now,
      };
      saveLocalDayMeta(meta);
      return { applied: true, skipped: null, day: emptyDay() };
    }
    return { applied: false, skipped: 'empty', day: cached || emptyDay() };
  }

  const normalized = normalizeDayData(remoteDay);
  const before = cached ? JSON.stringify(cached) : '';
  const after = JSON.stringify(normalized);

  all[dateStr] = normalized;
  saveLocalDaysRaw(all);
  setInMemoryDay(dateStr, normalized);
  meta[dateStr] = {
    ...entry,
    dirty: false,
    lastRemoteAt: now,
    lastSyncedAt: now,
  };
  saveLocalDayMeta(meta);

  return { applied: before !== after, skipped: null, day: normalized };
}

function buildDateRange(dateFrom, dateTo) {
  const dates = [];
  if (!dateFrom || !dateTo) return dates;
  const cursor = new Date(`${dateFrom}T12:00:00`);
  const end = new Date(`${dateTo}T12:00:00`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

export async function refreshDay(dateStr) {
  if (!cfg.sbUrl || !cfg.sbKey || !authUser?.id) {
    return { changed: false, day: getCachedDay(dateStr) || emptyDay() };
  }

  const r = await fetch(
    `${cfg.sbUrl}/rest/v1/eetdagboek?user_id=eq.${authUser.id}&date=eq.${dateStr}&select=data`,
    { headers: sbHeaders(), cache: 'no-store' }
  );
  if (!r.ok) throw new Error('Fetch failed');
  const rows = await r.json();
  const result = applyRemoteDayToLocalCache(dateStr, rows[0]?.data || null, { allowDelete: true });
  return { changed: result.applied, day: result.day };
}

export async function refreshDayRange(dateFrom, dateTo) {
  const cachedDates = buildDateRange(dateFrom, dateTo);
  if (!cfg.sbUrl || !cfg.sbKey || !authUser?.id) {
    return { changed: false, dates: cachedDates };
  }

  const r = await fetch(
    `${cfg.sbUrl}/rest/v1/eetdagboek?user_id=eq.${authUser.id}&date=gte.${dateFrom}&date=lte.${dateTo}&select=date,data`,
    { headers: sbHeaders(), cache: 'no-store' }
  );
  if (!r.ok) throw new Error('Fetch failed');
  const rows = await r.json();
  const rowMap = Object.fromEntries(rows.map(row => [row.date, row.data || null]));

  let changed = false;
  for (const key of cachedDates) {
    const result = applyRemoteDayToLocalCache(key, rowMap[key] || null, { allowDelete: true });
    if (result.applied) changed = true;
  }

  return { changed, dates: cachedDates };
}

export async function refreshAllDates(limit = 60) {
  const cached = getCachedDateKeys(limit);
  if (!cfg.sbUrl || !cfg.sbKey || !authUser?.id) {
    return { changed: false, dates: cached };
  }

  const r = await fetch(
    `${cfg.sbUrl}/rest/v1/eetdagboek?user_id=eq.${authUser.id}&date=neq.9999-01-01&select=date,data&order=date.desc&limit=${limit}`,
    { headers: sbHeaders(), cache: 'no-store' }
  );
  if (!r.ok) throw new Error('Fetch failed');
  const rows = await r.json();

  let changed = false;
  const dates = [];
  for (const row of rows) {
    const result = applyRemoteDayToLocalCache(row.date, row.data || null, { allowDelete: false });
    if (result.applied) changed = true;
    dates.push(row.date);
  }

  return { changed, dates: Array.from(new Set([...dates, ...cached])).sort().reverse().slice(0, limit) };
}

export async function refreshAllServerDays() {
  const cached = getCachedDateKeys(Infinity);
  if (!cfg.sbUrl || !cfg.sbKey || !authUser?.id) {
    return { changed: false, dates: cached };
  }

  const r = await fetch(
    `${cfg.sbUrl}/rest/v1/eetdagboek?user_id=eq.${authUser.id}&date=neq.9999-01-01&select=date,data&order=date.asc`,
    { headers: sbHeaders(), cache: 'no-store' }
  );
  if (!r.ok) throw new Error('Fetch failed');
  const rows = await r.json();
  const rowMap = Object.fromEntries(rows.map(row => [row.date, row.data || null]));
  const allDates = Array.from(new Set([...cached, ...Object.keys(rowMap)])).sort();

  let changed = false;
  for (const date of allDates) {
    const result = applyRemoteDayToLocalCache(date, rowMap[date] || null, { allowDelete: true });
    if (result.applied) changed = true;
  }

  return {
    changed,
    dates: Array.from(new Set([...Object.keys(rowMap), ...getCachedDateKeys(Infinity)])).sort().reverse(),
  };
}

export async function initSupabase() {
  if (!cfg.sbUrl || !cfg.sbKey) return false;
  try {
    const r = await fetch(cfg.sbUrl + '/rest/v1/eetdagboek?limit=1', { headers: sbHeaders() });
    if (r.ok) {
      setSyncStatus('synced', 'verbonden');
      return true;
    }
    setSyncStatus('error', 'verbinding mislukt');
    return false;
  } catch {
    setSyncStatus('error', 'offline');
    return false;
  }
}

export async function loadDay(dateStr) {
  const cached = getCachedDay(dateStr);
  if (!cfg.sbUrl || !cfg.sbKey || !authUser?.id) {
    return cached || emptyDay();
  }

  try {
    const { day } = await refreshDay(dateStr);
    return normalizeDayData(day || cached || null);
  } catch {
    return normalizeDayData(cached || null);
  }
}

export function saveDay(dateStr, day) {
  const shouldSync = Boolean(cfg.sbUrl && cfg.sbKey && authUser?.id);
  const normalized = cacheDayLocally(dateStr, day, { dirty: shouldSync, synced: !shouldSync });

  if (!shouldSync) return;

  clearTimeout(syncTimer);
  setSyncTimer(setTimeout(async () => {
    setSyncStatus('syncing', 'opslaan…');
    try {
      const record = { user_id: authUser.id, date: dateStr, data: normalized };
      const r = await fetch(cfg.sbUrl + '/rest/v1/eetdagboek?on_conflict=user_id,date', {
        method: 'POST',
        headers: { ...sbHeaders(true), Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(record),
      });
      if (r.ok) markDaySynced(dateStr);
      setSyncStatus(r.ok ? 'synced' : 'error', r.ok ? 'opgeslagen' : 'fout');
    } catch {
      setSyncStatus('error', 'sync mislukt');
    }
  }, 1200));
}

export async function syncDirtyDays() {
  if (!cfg.sbUrl || !cfg.sbKey || !authUser?.id) return 0;

  const meta = loadLocalDayMeta();
  const dirtyDates = Object.entries(meta)
    .filter(([date, entry]) => date !== '9999-01-01' && entry?.dirty)
    .map(([date]) => date)
    .sort();

  for (const date of dirtyDates) {
    const day = normalizeDayData(getCachedDay(date) || emptyDay());
    const r = await fetch(cfg.sbUrl + '/rest/v1/eetdagboek?on_conflict=user_id,date', {
      method: 'POST',
      headers: { ...sbHeaders(true), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ user_id: authUser.id, date, data: day }),
    });
    if (!r.ok) throw new Error(`Dag sync mislukt voor ${date}`);
    markDaySynced(date);
  }

  return dirtyDates.length;
}

export async function loadAllDates() {
  const cached = getCachedDateKeys(60);
  if (!cfg.sbUrl || !cfg.sbKey || !authUser?.id) return cached;
  try {
    const { dates } = await refreshAllDates(60);
    return dates;
  } catch {
    return cached;
  }
}
