import { describe, it, expect } from 'vitest';
import { buildAmountUnits, defaultCount, amountGrams, amountLabel, stepCount } from '../../src/products/portion-amount.js';

const bread = [{ t: 'snee', g: 35, l: 'snee' }, { t: 'dik', g: 45, l: 'dikke snee' }, { t: 'gram', g: 100 }];

describe('portion amount picker', () => {
  it('lists household portions first and plain grams last', () => {
    expect(buildAmountUnits(bread, false)).toEqual([
      { label: 'snee', g: 35 },
      { label: 'dikke snee', g: 45 },
      { label: 'gram', g: 1, isBase: true },
    ]);
    expect(buildAmountUnits([{ t: 'gram', g: 100 }], true)).toEqual([{ label: 'ml', g: 1, isBase: true }]);
  });

  it('starts at one portion or 100 g', () => {
    const [snee, , gram] = buildAmountUnits(bread, false);
    expect(defaultCount(snee)).toBe(1);
    expect(defaultCount(gram)).toBe(100);
  });

  it('multiplies count by the unit weight and labels it', () => {
    const [snee, , gram] = buildAmountUnits(bread, false);
    expect(amountGrams(3, snee)).toBe(105);
    expect(amountLabel(1, snee, false)).toBe('snee (35g)');
    expect(amountLabel(2, snee, false)).toBe('2× snee (70g)');
    expect(amountLabel(1.5, snee, false)).toBe('1,5× snee (52.5g)');
    expect(amountLabel(150, gram, false)).toBe('150g');
  });

  it('steps whole portions, a half below one, and 10 g for grams', () => {
    const [snee, , gram] = buildAmountUnits(bread, false);
    expect(stepCount(1, snee, 1)).toBe(2);
    expect(stepCount(1, snee, -1)).toBe(0.5);
    expect(stepCount(0.5, snee, 1)).toBe(1);
    expect(stepCount(2.5, snee, -1)).toBe(2);
    expect(stepCount(100, gram, 1)).toBe(110);
    expect(stepCount(10, gram, -1)).toBe(10);
  });
});
