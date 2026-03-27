import { describe, it, expect } from 'vitest';
import { resolveDensityForName, toMacroGram, isLiquidLike } from '../../src/products/density.js';
import { buildMealItem } from '../../src/products/matcher.js';

describe('density helpers', () => {
  it('returns product-specific densities for key liquids', () => {
    expect(resolveDensityForName('olijfolie')).toBeCloseTo(0.92, 2);
    expect(resolveDensityForName('halfvolle melk')).toBeCloseTo(1.03, 2);
    expect(resolveDensityForName('water')).toBeCloseTo(1.0, 2);
  });

  it('converts ml to gram-equivalent for drink-like amounts', () => {
    expect(toMacroGram(200, true, 'olijfolie')).toBeCloseTo(184, 1);
    expect(toMacroGram(200, true, 'water')).toBeCloseTo(200, 1);
    expect(toMacroGram(200, false, 'water')).toBeCloseTo(200, 1);
  });

  it('keeps solid products with liquid words in gram mode', () => {
    expect(isLiquidLike('tonijn op water')).toBe(false);
    expect(isLiquidLike('stroopwafel')).toBe(false);
    expect(isLiquidLike('ananas op sap')).toBe(false);
    expect(isLiquidLike('perziken op siroop')).toBe(false);
    expect(isLiquidLike('augurken in zoetzuur')).toBe(false);
  });
});

describe('buildMealItem drink behavior', () => {
  it('stores ml labels for drinks and applies density to macros', () => {
    const src = { k: 884, kh: 0, vz: 0, v: 100, e: 0 };
    const drinkOil = buildMealItem('olijfolie', src, 100, true);
    expect(drinkOil.portie).toBe('100ml');
    expect(drinkOil.ml).toBe(100);
    expect(drinkOil.kcal).toBe(813);

    const waterLike = buildMealItem('water', { k: 0, kh: 0, vz: 0, v: 0, e: 0 }, 250, true);
    expect(waterLike.portie).toBe('250ml');
    expect(waterLike.ml).toBe(250);
  });

  it('stores gram labels for solid foods with words like water or stroop', () => {
    const src = { k: 116, kh: 0, vz: 0, v: 1, e: 26 };

    const tunaInWater = buildMealItem('tonijn op water', src, 100, false);
    expect(tunaInWater.portie).toBe('100g');
    expect(tunaInWater.ml).toBe(0);

    const stroopwafel = buildMealItem('stroopwafel', { k: 441, kh: 69, vz: 1, v: 21, e: 5 }, 30, false);
    expect(stroopwafel.portie).toBe('30g');
    expect(stroopwafel.ml).toBe(0);

    const pineappleInJuice = buildMealItem('ananas op sap', { k: 57, kh: 13, vz: 1, v: 0, e: 0.5 }, 140, false);
    expect(pineappleInJuice.portie).toBe('140g');
    expect(pineappleInJuice.ml).toBe(0);

    const peachesInSyrup = buildMealItem('perziken op siroop', { k: 84, kh: 20, vz: 1, v: 0, e: 0.6 }, 120, false);
    expect(peachesInSyrup.portie).toBe('120g');
    expect(peachesInSyrup.ml).toBe(0);

    const pickles = buildMealItem('augurken in zoetzuur', { k: 19, kh: 3, vz: 1, v: 0, e: 0.8 }, 80, false);
    expect(pickles.portie).toBe('80g');
    expect(pickles.ml).toBe(0);
  });
});
