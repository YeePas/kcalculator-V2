/* ── Supabase Data Operations ──────────────────────────────── */

import { cfg, authUser, localData, syncTimer, setSyncTimer } from '../state.js';
import { LOCAL_KEY, MEAL_NAMES } from '../constants.js';
import { emptyDay, normalizeDayData } from '../utils.js';
import { sbHeaders } from './config.js';
import { setSyncStatus } from '../ui/sync-status.js';

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
  if (!cfg.sbUrl || !cfg.sbKey || !authUser?.id) {
    const all = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
    return normalizeDayData(all[dateStr] || null);
  }
  try {
    const r = await fetch(
      `${cfg.sbUrl}/rest/v1/eetdagboek?user_id=eq.${authUser.id}&date=eq.${dateStr}&select=data`,
      { headers: sbHeaders() }
    );
    if (!r.ok) throw new Error('Fetch failed');
    const rows = await r.json();
    if (rows.length > 0 && rows[0].data) {
      const day = normalizeDayData(rows[0].data);
      // Cache locally
      const all = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
      all[dateStr] = day;
      localStorage.setItem(LOCAL_KEY, JSON.stringify(all));
      return day;
    }
    return emptyDay();
  } catch {
    const all = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
    return normalizeDayData(all[dateStr] || null);
  }
}

export function saveDay(dateStr, day) {
  // Always save locally first
  const all = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
  all[dateStr] = day;
  localStorage.setItem(LOCAL_KEY, JSON.stringify(all));
  localData[dateStr] = day;

  // Debounced upsert to Supabase
  if (!cfg.sbUrl || !cfg.sbKey || !authUser?.id) return;
  clearTimeout(syncTimer);
  setSyncTimer(setTimeout(async () => {
    setSyncStatus('syncing', 'opslaan…');
    try {
      const record = { user_id: authUser.id, date: dateStr, data: day };
      const r = await fetch(cfg.sbUrl + '/rest/v1/eetdagboek?on_conflict=user_id,date', {
        method: 'POST',
        headers: { ...sbHeaders(true), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(record),
      });
      setSyncStatus(r.ok ? 'synced' : 'error', r.ok ? 'opgeslagen' : 'fout');
    } catch {
      setSyncStatus('error', 'sync mislukt');
    }
  }, 1200));
}

export async function loadAllDates() {
  if (cfg.sbUrl && cfg.sbKey && authUser?.id) {
    try {
      const r = await fetch(
        `${cfg.sbUrl}/rest/v1/eetdagboek?user_id=eq.${authUser.id}&date=neq.9999-01-01&select=date,data&order=date.desc&limit=60`,
        { headers: sbHeaders() }
      );
      if (r.ok) {
        const rows = await r.json();
        const dates = [];
        for (const row of rows) {
          localData[row.date] = normalizeDayData(row.data);
          dates.push(row.date);
        }
        return dates;
      }
    } catch {}
  }
  // Fallback: local storage
  const all = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
  return Object.keys(all).filter(k => k !== '9999-01-01');
}
