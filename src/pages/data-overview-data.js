/* ── Data-Overzicht: Data Loading & Aggregation ─────────── */

import { cfg, authUser } from '../state.js';
import { ENERGY_LOCAL_KEY, ENERGY_META_KEY } from '../constants.js';
import { r1, dateKey } from '../utils.js';
import { safeParse } from '../storage.js';
import { sbHeaders } from '../supabase/config.js';

function normalizeEnergyMetaEntry(value) {
  return {
    dirty: value?.dirty === true,
    updatedAt: Number(value?.updatedAt || 0),
    lastSyncedAt: Number(value?.lastSyncedAt || 0),
    lastRemoteAt: Number(value?.lastRemoteAt || 0),
  };
}

export function loadEnergyLocal() {
  return safeParse(ENERGY_LOCAL_KEY, safeParse('eetdagboek_energy_v1', {}));
}

export function saveEnergyLocal(data) {
  try {
    localStorage.setItem(ENERGY_LOCAL_KEY, JSON.stringify(data));
    localStorage.setItem('eetdagboek_energy_v1', JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export function loadEnergyMeta() {
  const meta = safeParse(ENERGY_META_KEY, {});
  const local = loadEnergyLocal();
  let changed = false;

  for (const date of Object.keys(local)) {
    if (!meta[date] || typeof meta[date] !== 'object') {
      meta[date] = normalizeEnergyMetaEntry(null);
      changed = true;
    } else {
      const normalized = normalizeEnergyMetaEntry(meta[date]);
      if (JSON.stringify(normalized) !== JSON.stringify(meta[date])) {
        meta[date] = normalized;
        changed = true;
      }
    }
  }

  if (changed) saveEnergyMeta(meta);
  return meta;
}

export function saveEnergyMeta(meta) {
  try { localStorage.setItem(ENERGY_META_KEY, JSON.stringify(meta)); }
  catch { /* ignore */ }
}

function getEnergyMeta(dateStr) {
  const meta = loadEnergyMeta();
  return { meta, entry: normalizeEnergyMetaEntry(meta[dateStr]) };
}

function buildEnergyRowMap(rows) {
  const rowMap = {};
  (rows || []).forEach(row => {
    if (!rowMap[row.date]) {
      rowMap[row.date] = {
        date: row.date,
        active_kcal: 0,
        resting_kcal: 0,
        tdee_kcal: 0,
        source: row.source || '',
      };
    }
    rowMap[row.date].active_kcal += row.active_kcal || 0;
    rowMap[row.date].resting_kcal += row.resting_kcal || 0;
    rowMap[row.date].tdee_kcal += row.tdee_kcal || 0;
    if (row.source) rowMap[row.date].source = row.source;
  });
  return rowMap;
}

export function filterEnergyRange(map, dateFrom, dateTo) {
  const result = {};
  for (const [key, value] of Object.entries(map || {})) {
    if (key >= dateFrom && key <= dateTo) result[key] = value;
  }
  return result;
}

export function getCachedEnergyStatsRange(dateFrom, dateTo) {
  return filterEnergyRange(loadEnergyLocal(), dateFrom, dateTo);
}

export function cacheEnergyRecord(dateStr, record, { dirty = false, synced = false } = {}) {
  const local = loadEnergyLocal();
  const meta = loadEnergyMeta();
  const now = Date.now();

  if (record) local[dateStr] = { ...record, date: dateStr };
  else delete local[dateStr];
  saveEnergyLocal(local);

  meta[dateStr] = {
    ...normalizeEnergyMetaEntry(meta[dateStr]),
    dirty,
    updatedAt: now,
    lastSyncedAt: synced ? now : Number(meta[dateStr]?.lastSyncedAt || 0),
    lastRemoteAt: synced ? now : Number(meta[dateStr]?.lastRemoteAt || 0),
  };
  saveEnergyMeta(meta);

  return local[dateStr] || null;
}

export function markEnergyRecordSynced(dateStr) {
  const { meta, entry } = getEnergyMeta(dateStr);
  const now = Date.now();
  meta[dateStr] = {
    ...entry,
    dirty: false,
    lastSyncedAt: now,
    lastRemoteAt: now,
  };
  saveEnergyMeta(meta);
}

export function applyRemoteEnergyRange(dateFrom, dateTo, rows) {
  const local = loadEnergyLocal();
  const meta = loadEnergyMeta();
  const result = {};
  const rowMap = buildEnergyRowMap(rows);
  const now = Date.now();
  let changed = false;

  const allDates = new Set([
    ...Object.keys(filterEnergyRange(local, dateFrom, dateTo)),
    ...Object.keys(rowMap),
  ]);

  for (const date of allDates) {
    const entry = normalizeEnergyMetaEntry(meta[date]);
    if (entry.dirty) {
      if (local[date]) result[date] = local[date];
      continue;
    }

    const remote = rowMap[date] || null;
    if (!remote) {
      if (local[date]) {
        delete local[date];
        changed = true;
      }
      meta[date] = {
        ...entry,
        dirty: false,
        lastSyncedAt: now,
        lastRemoteAt: now,
      };
      continue;
    }

    const before = local[date] ? JSON.stringify(local[date]) : '';
    const after = JSON.stringify(remote);
    if (before !== after) changed = true;
    local[date] = remote;
    meta[date] = {
      ...entry,
      dirty: false,
      lastSyncedAt: now,
      lastRemoteAt: now,
    };
    result[date] = remote;
  }

  saveEnergyLocal(local);
  saveEnergyMeta(meta);
  return { changed, result: filterEnergyRange(local, dateFrom, dateTo) };
}

export function applyRemoteEnergySnapshot(rows) {
  const local = loadEnergyLocal();
  const meta = loadEnergyMeta();
  const rowMap = buildEnergyRowMap(rows);
  const now = Date.now();
  let changed = false;

  const allDates = new Set([
    ...Object.keys(local),
    ...Object.keys(rowMap),
  ]);

  for (const date of allDates) {
    const entry = normalizeEnergyMetaEntry(meta[date]);
    if (entry.dirty) continue;

    const remote = rowMap[date] || null;
    if (!remote) {
      if (local[date]) {
        delete local[date];
        changed = true;
      }
      meta[date] = {
        ...entry,
        dirty: false,
        lastSyncedAt: now,
        lastRemoteAt: now,
      };
      continue;
    }

    const before = local[date] ? JSON.stringify(local[date]) : '';
    const after = JSON.stringify(remote);
    if (before !== after) changed = true;
    local[date] = remote;
    meta[date] = {
      ...entry,
      dirty: false,
      lastSyncedAt: now,
      lastRemoteAt: now,
    };
  }

  saveEnergyLocal(local);
  saveEnergyMeta(meta);
  return { changed, result: local };
}

export async function refreshEnergyStatsRange(dateFrom, dateTo) {
  const cached = getCachedEnergyStatsRange(dateFrom, dateTo);
  if (!cfg.sbUrl || !cfg.sbKey || !authUser?.id) {
    return { changed: false, result: cached };
  }

  try {
    const r = await fetch(
      cfg.sbUrl + '/rest/v1/daily_energy_stats?user_id=eq.' + authUser.id + '&date=gte.' + dateFrom + '&date=lte.' + dateTo +
      '&select=date,active_kcal,resting_kcal,tdee_kcal,source&order=date.asc',
      { headers: sbHeaders(), cache: 'no-store' }
    );
    if (!r.ok) return { changed: false, result: cached };
    const rows = await r.json();
    return applyRemoteEnergyRange(dateFrom, dateTo, rows);
  } catch {
    return { changed: false, result: cached };
  }
}

export async function refreshAllEnergyStats() {
  const cached = loadEnergyLocal();
  if (!cfg.sbUrl || !cfg.sbKey || !authUser?.id) {
    return { changed: false, result: cached };
  }

  try {
    const r = await fetch(
      cfg.sbUrl + '/rest/v1/daily_energy_stats?user_id=eq.' + authUser.id +
      '&select=date,active_kcal,resting_kcal,tdee_kcal,source&order=date.asc',
      { headers: sbHeaders(), cache: 'no-store' }
    );
    if (!r.ok) return { changed: false, result: cached };
    const rows = await r.json();
    return applyRemoteEnergySnapshot(rows);
  } catch {
    return { changed: false, result: cached };
  }
}

export async function syncDirtyEnergyRecords() {
  if (!cfg.sbUrl || !cfg.sbKey || !authUser?.id) return 0;

  const meta = loadEnergyMeta();
  const local = loadEnergyLocal();
  const dirtyDates = Object.entries(meta)
    .filter(([date, entry]) => entry?.dirty && date)
    .map(([date]) => date)
    .sort();

  for (const date of dirtyDates) {
    const record = local[date] || null;

    const clearResponse = await fetch(
      `${cfg.sbUrl}/rest/v1/daily_energy_stats?user_id=eq.${authUser.id}&date=eq.${date}`,
      { method: 'DELETE', headers: sbHeaders(true) }
    );
    if (!clearResponse.ok) throw new Error(`Energy sync mislukt voor ${date}`);

    if (record) {
      const response = await fetch(`${cfg.sbUrl}/rest/v1/daily_energy_stats`, {
        method: 'POST',
        headers: { ...sbHeaders(true), Prefer: 'return=minimal' },
        body: JSON.stringify([{
          user_id: authUser.id,
          date,
          active_kcal: Math.round(record.active_kcal || 0),
          resting_kcal: Math.round(record.resting_kcal || 0),
          source: record.source || 'apple_health',
        }]),
      });
      if (!response.ok) throw new Error(`Energy sync mislukt voor ${date}`);
    }

    markEnergyRecordSynced(date);
  }

  return dirtyDates.length;
}

export async function loadEnergyStatsRange(dateFrom, dateTo, options = {}) {
  const cached = getCachedEnergyStatsRange(dateFrom, dateTo);
  if (options.preferCache) return cached;
  const { result } = await refreshEnergyStatsRange(dateFrom, dateTo);
  return result;
}

export function aggregatePeriod(entries, goalsObj, dayTotalsFn, energyMap) {
  const days = [];
  let totalKcal = 0, totalCarbs = 0, totalFat = 0, totalProt = 0, totalFiber = 0;
  let totalKcalWithEnergy = 0;
  let totalActive = 0, totalResting = 0, totalTDEE = 0;
  let activeDays = 0, daysWithEnergy = 0, daysOnTarget = 0;
  const todayKey = dateKey(new Date());

  for (const { key, day } of entries) {
    const t = day ? dayTotalsFn(day) : { cals: 0, carbs: 0, fat: 0, prot: 0, fiber: 0 };
    const energy = energyMap[key] || null;
    const intake = Math.round(t.cals);
    const tdee = energy ? Math.round(energy.tdee_kcal || 0) : 0;

    days.push({
      date: key, intake,
      carbs: r1(t.carbs), fat: r1(t.fat), prot: r1(t.prot), fiber: r1(t.fiber),
      tdee_kcal: tdee,
      active_kcal: energy ? Math.round(energy.active_kcal || 0) : 0,
      resting_kcal: energy ? Math.round(energy.resting_kcal || 0) : 0,
    });

    if (intake > 0) {
      activeDays++;
      totalKcal += intake; totalCarbs += t.carbs; totalFat += t.fat; totalProt += t.prot; totalFiber += t.fiber;
      if (goalsObj.kcal && Math.abs(intake - goalsObj.kcal) <= goalsObj.kcal * 0.1) daysOnTarget++;
    }
    if (tdee > 0 && key !== todayKey) {
      daysWithEnergy++;
      totalKcalWithEnergy += intake;
      totalActive += energy.active_kcal || 0; totalResting += energy.resting_kcal || 0; totalTDEE += tdee;
    }
  }

  const totalDays = entries.length;
  const div = d => activeDays ? Math.round(d / activeDays) : 0;
  const divE = d => daysWithEnergy ? Math.round(d / daysWithEnergy) : 0;
  const avgIntake = div(totalKcal);
  const avgIntakeWithEnergy = divE(totalKcalWithEnergy);
  const avgTDEE = divE(totalTDEE);
  const avgBalance = daysWithEnergy ? Math.round((totalKcalWithEnergy - totalTDEE) / daysWithEnergy) : null;

  return {
    days, totalDays, activeDays, daysWithEnergy, daysOnTarget,
    avgIntake, avgCarbs: div(totalCarbs), avgFat: div(totalFat), avgProt: div(totalProt), avgFiber: div(totalFiber),
    avgIntakeWithEnergy,
    avgTDEE, avgActive: divE(totalActive), avgResting: divE(totalResting),
    avgBalance, cumulativeBalance: daysWithEnergy ? Math.round(totalKcalWithEnergy - totalTDEE) : null,
  };
}
