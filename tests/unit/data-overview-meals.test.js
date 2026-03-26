import { describe, expect, it } from 'vitest';
import { analyzeMealMoments } from '../../src/pages/data-overview-meals.js';

function item({ kcal, carbs, fat, prot }) {
  return {
    kcal,
    koolhydraten_g: carbs,
    vetten_g: fat,
    eiwitten_g: prot,
  };
}

function emptyDay() {
  return {
    ontbijt: [],
    ochtendsnack: [],
    lunch: [],
    middagsnack: [],
    avondeten: [],
    avondsnack: [],
    drinken: [],
  };
}

describe('analyzeMealMoments', () => {
  it('calculates macro composition for each meal moment over a period', () => {
    const day1 = emptyDay();
    day1.ontbijt = [item({ kcal: 400, carbs: 40, fat: 10, prot: 20 })];
    day1.lunch = [item({ kcal: 600, carbs: 50, fat: 20, prot: 30 })];

    const day2 = emptyDay();
    day2.ontbijt = [item({ kcal: 300, carbs: 30, fat: 10, prot: 15 })];

    const analysis = analyzeMealMoments([
      { key: '2026-03-25', day: day1 },
      { key: '2026-03-26', day: day2 },
    ]);

    expect(analysis.meals.ontbijt.daysWithMeal).toBe(2);
    expect(analysis.meals.ontbijt.avgKcal).toBe(350);
    expect(analysis.meals.ontbijt.avgCarbs).toBe(35);
    expect(analysis.meals.ontbijt.macroSplit).toEqual({ carbs: 56, fat: 16, prot: 28 });
    expect(analysis.meals.lunch.contributionPct).toBe(46);
  });

  it('keeps single-day analysis as exact totals for the selected day', () => {
    const day = emptyDay();
    day.avondeten = [item({ kcal: 750, carbs: 60, fat: 25, prot: 45 })];

    const analysis = analyzeMealMoments([{ key: '2026-03-26', day }]);

    expect(analysis.sortedMeals).toHaveLength(1);
    expect(analysis.meals.avondeten.totalKcal).toBe(750);
    expect(analysis.meals.avondeten.daysWithMeal).toBe(1);
    expect(analysis.meals.avondeten.macroSplit).toEqual({ carbs: 46, fat: 19, prot: 35 });
  });
});
