/* ── Data-Overzicht: Meal Moment Analysis ───────────────── */

import { MEAL_NAMES } from '../constants.js';
import { r1 } from '../utils.js';

const MEAL_SLOT_LABELS = {
  ontbijt: 'Ontbijt',
  ochtendsnack: 'Ochtendsnack',
  lunch: 'Lunch',
  middagsnack: 'Middagsnack',
  avondeten: 'Avondeten',
  avondsnack: 'Avondsnack',
  drinken: 'Drinken',
};

function sumMealItems(items = []) {
  return items.reduce((acc, item) => {
    acc.kcal += Number(item?.kcal || 0);
    acc.carbs += Number(item?.koolhydraten_g || 0);
    acc.fat += Number(item?.vetten_g || 0);
    acc.prot += Number(item?.eiwitten_g || 0);
    return acc;
  }, { kcal: 0, carbs: 0, fat: 0, prot: 0 });
}

function macroSplit(totalCarbs, totalFat, totalProt) {
  const total = totalCarbs + totalFat + totalProt;
  if (!total) return { carbs: 0, fat: 0, prot: 0 };
  return {
    carbs: Math.round((totalCarbs / total) * 100),
    fat: Math.round((totalFat / total) * 100),
    prot: Math.round((totalProt / total) * 100),
  };
}

export function analyzeMealMoments(entries = []) {
  const meals = Object.fromEntries(
    MEAL_NAMES.map(meal => [meal, {
      key: meal,
      label: MEAL_SLOT_LABELS[meal] || meal,
      totalKcal: 0,
      totalCarbs: 0,
      totalFat: 0,
      totalProt: 0,
      daysWithMeal: 0,
      excessDays: 0,
      contributionPct: 0,
      avgKcal: 0,
      avgCarbs: 0,
      avgFat: 0,
      avgProt: 0,
      macroSplit: { carbs: 0, fat: 0, prot: 0 },
    }])
  );

  let totalAllMealsKcal = 0;

  entries.forEach(({ day }) => {
    if (!day) return;

    const dayMeals = Object.fromEntries(
      MEAL_NAMES.map(meal => [meal, sumMealItems(day[meal] || [])])
    );
    const dayTotalKcal = MEAL_NAMES.reduce((sum, meal) => sum + dayMeals[meal].kcal, 0);

    MEAL_NAMES.forEach(meal => {
      const mealTotals = dayMeals[meal];
      const hasMealData = mealTotals.kcal > 0 || mealTotals.carbs > 0 || mealTotals.fat > 0 || mealTotals.prot > 0;
      if (!hasMealData) return;

      const stat = meals[meal];
      stat.totalKcal += mealTotals.kcal;
      stat.totalCarbs += mealTotals.carbs;
      stat.totalFat += mealTotals.fat;
      stat.totalProt += mealTotals.prot;
      stat.daysWithMeal += 1;
      if (dayTotalKcal > 0 && mealTotals.kcal > dayTotalKcal * 0.5) stat.excessDays += 1;
    });

    totalAllMealsKcal += dayTotalKcal;
  });

  MEAL_NAMES.forEach(meal => {
    const stat = meals[meal];
    stat.avgKcal = stat.daysWithMeal > 0 ? Math.round(stat.totalKcal / stat.daysWithMeal) : 0;
    stat.avgCarbs = stat.daysWithMeal > 0 ? r1(stat.totalCarbs / stat.daysWithMeal) : 0;
    stat.avgFat = stat.daysWithMeal > 0 ? r1(stat.totalFat / stat.daysWithMeal) : 0;
    stat.avgProt = stat.daysWithMeal > 0 ? r1(stat.totalProt / stat.daysWithMeal) : 0;
    stat.contributionPct = totalAllMealsKcal > 0 ? Math.round((stat.totalKcal / totalAllMealsKcal) * 100) : 0;
    stat.macroSplit = macroSplit(stat.totalCarbs, stat.totalFat, stat.totalProt);
  });

  const sortedMeals = Object.entries(meals)
    .filter(([, meal]) => meal.daysWithMeal > 0)
    .sort((aLeft, bLeft) => bLeft[1].contributionPct - aLeft[1].contributionPct || bLeft[1].totalKcal - aLeft[1].totalKcal);

  return { meals, sortedMeals };
}
