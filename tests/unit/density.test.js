import { describe, it, expect } from 'vitest';
import { resolveDensityForName, toMacroGram } from '../../src/products/density.js';
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
});
