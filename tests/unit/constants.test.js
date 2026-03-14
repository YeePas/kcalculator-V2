/* ── Unit tests: constants.js ──────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { MEAL_NAMES, MEAL_LABELS, DEFAULT_GOALS } from '../../src/constants.js';

describe('MEAL_NAMES', () => {
  it('contains all expected meal types', () => {
    expect(MEAL_NAMES).toContain('ontbijt');
    expect(MEAL_NAMES).toContain('lunch');
    expect(MEAL_NAMES).toContain('avondeten');
    expect(MEAL_NAMES).toContain('drinken');
  });

  it('has at least 5 meal types', () => {
    expect(MEAL_NAMES.length).toBeGreaterThanOrEqual(5);
  });

  it('contains no duplicates', () => {
    const unique = new Set(MEAL_NAMES);
    expect(unique.size).toBe(MEAL_NAMES.length);
  });
});

describe('MEAL_LABELS', () => {
  it('has a label for every meal name', () => {
    for (const meal of MEAL_NAMES) {
      expect(MEAL_LABELS).toHaveProperty(meal);
      expect(typeof MEAL_LABELS[meal]).toBe('string');
      expect(MEAL_LABELS[meal].length).toBeGreaterThan(0);
    }
  });

  it('labels contain emoji', () => {
    for (const meal of MEAL_NAMES) {
      // Each label should have a non-ASCII character (emoji)
      expect(MEAL_LABELS[meal]).toMatch(/[^\x00-\x7F]/);
    }
  });
});

describe('DEFAULT_GOALS', () => {
  it('has all required macro fields', () => {
    expect(DEFAULT_GOALS).toHaveProperty('kcal');
    expect(DEFAULT_GOALS).toHaveProperty('carbs');
    expect(DEFAULT_GOALS).toHaveProperty('fat');
    expect(DEFAULT_GOALS).toHaveProperty('prot');
    expect(DEFAULT_GOALS).toHaveProperty('fiber');
    expect(DEFAULT_GOALS).toHaveProperty('water');
  });

  it('has reasonable default values', () => {
    expect(DEFAULT_GOALS.kcal).toBeGreaterThan(1000);
    expect(DEFAULT_GOALS.kcal).toBeLessThan(5000);
    expect(DEFAULT_GOALS.water).toBeGreaterThanOrEqual(1500);
  });

  it('all values are positive numbers', () => {
    for (const [key, val] of Object.entries(DEFAULT_GOALS)) {
      expect(typeof val).toBe('number');
      expect(val).toBeGreaterThan(0);
    }
  });
});
