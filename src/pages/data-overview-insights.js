/* ── Data-Overzicht: Insights Generator ─────────────────── */

import { MEAL_NAMES } from '../constants.js';

export function generateInsights(a, goalsObj) {
  const insights = [];
  const days = a.days || [];

  if (a.avgIntake > 0 && goalsObj.kcal) {
    const diff = a.avgIntake - goalsObj.kcal;
    if (diff > 250) insights.push({ emoji: '⚠️', message: `Je gemiddelde intake (${a.avgIntake} kcal) ligt ${diff} kcal boven je doel.`, priority: 'high' });
    else if (diff < -250) insights.push({ emoji: '📉', message: `Je gemiddelde intake (${a.avgIntake} kcal) ligt ${Math.abs(diff)} kcal onder je doel.`, priority: 'medium' });
    else insights.push({ emoji: '✅', message: `Je zit goed op je dagelijkse doelstelling van ${goalsObj.kcal} kcal.`, priority: 'low' });
  }
  if (a.avgProt > 0 && goalsObj.prot) {
    if (a.avgProt < goalsObj.prot * 0.8) insights.push({ emoji: '💪', message: `Je eiwitinname (${a.avgProt}g/dag) is laag. Doel: ${goalsObj.prot}g/dag.`, priority: 'medium' });
    else if (a.avgProt >= goalsObj.prot) insights.push({ emoji: '💪', message: `Prima eiwitinname: ${a.avgProt}g/dag (doel: ${goalsObj.prot}g).`, priority: 'low' });
  }
  if (a.avgFiber > 0 && goalsObj.fiber) {
    if (a.avgFiber < goalsObj.fiber * 0.7) insights.push({ emoji: '🥦', message: `Je vezelinname (${a.avgFiber}g/dag) is laag. Doel: ${goalsObj.fiber}g. Probeer meer groenten, fruit en volkoren.`, priority: 'medium' });
    else if (a.avgFiber >= goalsObj.fiber) insights.push({ emoji: '🥦', message: `Goede vezelinname: ${a.avgFiber}g/dag (doel: ${goalsObj.fiber}g).`, priority: 'low' });
  }
  if (a.avgFat > 0 && goalsObj.fat) {
    if (a.avgFat > goalsObj.fat * 1.3) insights.push({ emoji: '🧈', message: `Je vetinname (${a.avgFat}g/dag) is ${Math.round(a.avgFat - goalsObj.fat)}g boven je doel van ${goalsObj.fat}g.`, priority: 'medium' });
  }
  if (a.avgCarbs > 0 && goalsObj.carbs) {
    if (a.avgCarbs < goalsObj.carbs * 0.6) insights.push({ emoji: '🍞', message: `Je koolhydraatinname (${a.avgCarbs}g/dag) is vrij laag t.o.v. je doel van ${goalsObj.carbs}g.`, priority: 'low' });
    else if (a.avgCarbs > goalsObj.carbs * 1.3) insights.push({ emoji: '🍞', message: `Je koolhydraatinname (${a.avgCarbs}g/dag) ligt ruim boven je doel van ${goalsObj.carbs}g.`, priority: 'medium' });
  }

  const activePct = a.totalDays > 0 ? Math.round(a.activeDays / a.totalDays * 100) : 0;
  if (activePct < 60 && a.totalDays >= 7) insights.push({ emoji: '📝', message: `Je hebt slechts ${a.activeDays} van de ${a.totalDays} dagen bijgehouden (${activePct}%).`, priority: 'medium' });
  else if (activePct >= 90 && a.totalDays >= 7) insights.push({ emoji: '🌟', message: `Uitstekende discipline! Je hebt ${a.activeDays} van de ${a.totalDays} dagen bijgehouden.`, priority: 'low' });

  // Weekday vs weekend
  const weekdayDays = [], weekendDays = [];
  days.forEach(d => {
    const dow = new Date(d.date + 'T12:00:00').getDay();
    if (dow === 0 || dow === 6) weekendDays.push(d); else weekdayDays.push(d);
  });
  const avgWeekday = weekdayDays.filter(d => d.intake > 0).reduce((s, d) => s + d.intake, 0) / Math.max(1, weekdayDays.filter(d => d.intake > 0).length);
  const avgWeekend = weekendDays.filter(d => d.intake > 0).reduce((s, d) => s + d.intake, 0) / Math.max(1, weekendDays.filter(d => d.intake > 0).length);
  if (avgWeekday > 0 && avgWeekend > 0 && Math.abs(avgWeekend - avgWeekday) > 300) {
    insights.push({ emoji: '📅', message: `In het weekend eet je gemiddeld ${Math.abs(Math.round(avgWeekend - avgWeekday))} kcal ${avgWeekend > avgWeekday ? 'meer' : 'minder'} dan door de week.`, priority: 'low' });
  }

  // Energy balance trend
  if (a.daysWithEnergy >= 7 && a.avgBalance !== null) {
    if (a.avgBalance > 300) insights.push({ emoji: '📈', message: `Je zit gemiddeld ${a.avgBalance} kcal/dag boven je verbruik. Dit kan leiden tot gewichtstoename.`, priority: 'high' });
    else if (a.avgBalance < -400) insights.push({ emoji: '📉', message: `Je zit gemiddeld ${Math.abs(a.avgBalance)} kcal/dag onder je verbruik. Let op voldoende energie-inname.`, priority: 'medium' });
  }

  // Consistency
  const validIntakes = days.filter(d => d.intake > 0).map(d => d.intake);
  const mean = validIntakes.reduce((s, v) => s + v, 0) / Math.max(1, validIntakes.length);
  const stdDev = validIntakes.length > 1 ? Math.round(Math.sqrt(validIntakes.reduce((s, v) => s + (v - mean) ** 2, 0) / validIntakes.length)) : 0;
  const deviationDays = validIntakes.filter(v => Math.abs(v - mean) > 300).length;
  const completeness = a.totalDays > 0 ? Math.round(a.activeDays / a.totalDays * 100) : 0;
  const consistencyScore = Math.max(0, Math.min(100, Math.round(100 - (stdDev / Math.max(mean, 1)) * 100 - (deviationDays / Math.max(a.totalDays, 1)) * 20)));

  if (validIntakes.length >= 5 && stdDev > 400) {
    insights.push({ emoji: '🎢', message: `Grote schommelingen in je intake (σ=${stdDev} kcal). Probeer een regelmatiger eetpatroon aan te houden.`, priority: 'medium' });
  }

  // Top foods
  const foodMap = {};
  days.forEach(d => {
    if (!d._items) return;
    d._items.forEach(item => {
      const key = item.naam;
      if (!foodMap[key]) foodMap[key] = { naam: key, count: 0, totalKcal: 0, totalProt: 0 };
      foodMap[key].count++; foodMap[key].totalKcal += item.kcal || 0; foodMap[key].totalProt += item.eiwitten_g || 0;
    });
  });
  const foods = Object.values(foodMap);
  const topCalories = foods.sort((a, b) => b.totalKcal - a.totalKcal).slice(0, 5).map(f => ({ naam: f.naam, count: f.count, totalKcal: Math.round(f.totalKcal) }));
  const topProtein = foods.sort((a, b) => b.totalProt - a.totalProt).slice(0, 5).map(f => ({ naam: f.naam, count: f.count, totalProt: Math.round(f.totalProt) }));
  const mostUsed = [...foods].sort((a, b) => b.count - a.count).slice(0, 5);
  const totalTop3 = topCalories.slice(0, 3).reduce((s, f) => s + f.totalKcal, 0);
  const totalAll = topCalories.reduce((s, f) => s + f.totalKcal, 0);
  const dominanceRatio = totalAll > 0 ? Math.round(totalTop3 / totalAll * 100) : 0;

  // Meal analysis
  const mealLabels = { ontbijt: 'Ontbijt', ochtendsnack: 'Ochtendsnack', lunch: 'Lunch', middagsnack: 'Middagsnack', avondeten: 'Avondeten', avondsnack: 'Avondsnack', drinken: 'Drinken' };
  const mealTotals = {};
  MEAL_NAMES.forEach(m => { mealTotals[m] = { label: mealLabels[m], totalKcal: 0, daysWithMeal: 0, excessDays: 0 }; });
  let totalAllMealsKcal = 0;
  days.forEach(d => {
    if (d.intake <= 0) return;
    MEAL_NAMES.forEach(m => {
      if (d['_meal_' + m] > 0) {
        mealTotals[m].totalKcal += d['_meal_' + m]; mealTotals[m].daysWithMeal++;
        if (d['_meal_' + m] > d.intake * 0.5) mealTotals[m].excessDays++;
      }
    });
    totalAllMealsKcal += d.intake;
  });
  const mealAnalysis = { meals: {} };
  MEAL_NAMES.forEach(m => {
    const mt = mealTotals[m];
    mealAnalysis.meals[m] = {
      label: mt.label, daysWithMeal: mt.daysWithMeal,
      avgKcal: mt.daysWithMeal > 0 ? Math.round(mt.totalKcal / mt.daysWithMeal) : 0,
      contributionPct: totalAllMealsKcal > 0 ? Math.round(mt.totalKcal / totalAllMealsKcal * 100) : 0,
      excessDays: mt.excessDays,
    };
  });

  // Weekday vs weekend struct
  const wdAvg = weekdayDays.filter(d => d.intake > 0);
  const weAvg = weekendDays.filter(d => d.intake > 0);
  const wdKcal = wdAvg.reduce((s, d) => s + d.intake, 0) / Math.max(1, wdAvg.length);
  const weKcal = weAvg.reduce((s, d) => s + d.intake, 0) / Math.max(1, weAvg.length);
  const macroSplit = (arr) => {
    const tot = arr.reduce((s, d) => s + (parseFloat(d.carbs) || 0) + (parseFloat(d.fat) || 0) + (parseFloat(d.prot) || 0), 0);
    if (!tot) return { carbs: 0, fat: 0, prot: 0 };
    return {
      carbs: Math.round(arr.reduce((s, d) => s + (parseFloat(d.carbs) || 0), 0) / tot * 100),
      fat: Math.round(arr.reduce((s, d) => s + (parseFloat(d.fat) || 0), 0) / tot * 100),
      prot: Math.round(arr.reduce((s, d) => s + (parseFloat(d.prot) || 0), 0) / tot * 100),
    };
  };
  const weekdayWeekend = {
    weekday: { days: wdAvg.length, avgIntake: Math.round(wdKcal), macroSplit: macroSplit(wdAvg) },
    weekend: { days: weAvg.length, avgIntake: Math.round(weKcal), macroSplit: macroSplit(weAvg) },
    differences: { intakeDiff: Math.round(weKcal - wdKcal) },
  };

  // Extremes
  const withIntake = days.filter(d => d.intake > 0);
  const highestIntake = withIntake.length ? withIntake.reduce((best, d) => d.intake > best.intake ? d : best) : null;
  const lowestIntake = withIntake.length ? withIntake.reduce((best, d) => d.intake < best.intake ? d : best) : null;
  const withBalance = days.filter(d => d.intake > 0 && d.tdee_kcal > 0);
  const biggestSurplus = withBalance.length ? (() => { const d = withBalance.reduce((b, x) => (x.intake - x.tdee_kcal) > (b.intake - b.tdee_kcal) ? x : b); return d.intake > d.tdee_kcal ? { date: d.date, value: Math.round(d.intake - d.tdee_kcal) } : null; })() : null;
  const biggestDeficit = withBalance.length ? (() => { const d = withBalance.reduce((b, x) => (x.intake - x.tdee_kcal) < (b.intake - b.tdee_kcal) ? x : b); return d.tdee_kcal > d.intake ? { date: d.date, value: Math.round(d.intake - d.tdee_kcal) } : null; })() : null;
  const withActivity = days.filter(d => d.active_kcal > 0);
  const highestActivity = withActivity.length ? (() => { const d = withActivity.reduce((b, x) => x.active_kcal > b.active_kcal ? x : b); return { date: d.date, value: d.active_kcal }; })() : null;

  return {
    insights,
    consistency: { score: consistencyScore, intakeStdDev: stdDev, deviationDays, completeness },
    weekdayWeekend, mealAnalysis,
    topFoods: { topCalories, topProtein, mostUsed, uniqueProducts: Object.keys(foodMap).length, dominanceRatio },
    extremes: {
      highestIntake: highestIntake ? { date: highestIntake.date, value: highestIntake.intake } : null,
      lowestIntake: lowestIntake ? { date: lowestIntake.date, value: lowestIntake.intake } : null,
      biggestSurplus, biggestDeficit, highestActivity,
    },
  };
}
