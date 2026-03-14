/* ── Data-Overzicht: Data Loading & Aggregation ─────────── */

import { cfg, authUser } from '../state.js';
import { ENERGY_LOCAL_KEY } from '../constants.js';
import { r1 } from '../utils.js';
import { safeParse } from '../storage.js';
import { sbHeaders } from '../supabase/config.js';

function loadEnergyLocal() { return safeParse(ENERGY_LOCAL_KEY, {}); }
function saveEnergyLocal(d) { try { localStorage.setItem(ENERGY_LOCAL_KEY, JSON.stringify(d)); } catch (e) { /* ignore */ } }

export async function loadEnergyStatsRange(dateFrom, dateTo) {
  const local = loadEnergyLocal();
  if (!cfg.sbUrl || !cfg.sbKey || !authUser?.id) {
    const result = {};
    for (const [k, v] of Object.entries(local)) {
      if (k >= dateFrom && k <= dateTo) result[k] = v;
    }
    return result;
  }
  try {
    const r = await fetch(
      cfg.sbUrl + '/rest/v1/daily_energy_stats?date=gte.' + dateFrom + '&date=lte.' + dateTo +
      '&select=date,active_kcal,resting_kcal,tdee_kcal,source&order=date.asc',
      { headers: sbHeaders() }
    );
    if (!r.ok) return local;
    const rows = await r.json();
    const result = {};
    rows.forEach(row => {
      if (!result[row.date]) result[row.date] = { active_kcal: 0, resting_kcal: 0, tdee_kcal: 0, date: row.date };
      result[row.date].active_kcal += row.active_kcal || 0;
      result[row.date].resting_kcal += row.resting_kcal || 0;
      result[row.date].tdee_kcal += row.tdee_kcal || 0;
    });
    Object.assign(local, result);
    saveEnergyLocal(local);
    return result;
  } catch (e) { return local; }
}

export function aggregatePeriod(entries, goalsObj, dayTotalsFn, energyMap) {
  const days = [];
  let totalKcal = 0, totalCarbs = 0, totalFat = 0, totalProt = 0, totalFiber = 0;
  let totalActive = 0, totalResting = 0, totalTDEE = 0;
  let activeDays = 0, daysWithEnergy = 0, daysOnTarget = 0;

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
    if (tdee > 0) {
      daysWithEnergy++;
      totalActive += energy.active_kcal || 0; totalResting += energy.resting_kcal || 0; totalTDEE += tdee;
    }
  }

  const totalDays = entries.length;
  const div = d => activeDays ? Math.round(d / activeDays) : 0;
  const divE = d => daysWithEnergy ? Math.round(d / daysWithEnergy) : 0;
  const avgIntake = div(totalKcal);
  const avgTDEE = divE(totalTDEE);
  const avgBalance = daysWithEnergy ? Math.round((totalKcal - totalTDEE) / daysWithEnergy) : null;

  return {
    days, totalDays, activeDays, daysWithEnergy, daysOnTarget,
    avgIntake, avgCarbs: div(totalCarbs), avgFat: div(totalFat), avgProt: div(totalProt), avgFiber: div(totalFiber),
    avgTDEE, avgActive: divE(totalActive), avgResting: divE(totalResting),
    avgBalance, cumulativeBalance: daysWithEnergy ? Math.round(totalKcal - totalTDEE) : null,
  };
}
