/* ── Unit tests: utils.js ──────────────────────────────────── */

import { describe, it, expect } from 'vitest';
import { dateKey, formatDate, emptyDay, normalizeDayData, esc, pct, r1, dayTotals } from '../../src/utils.js';
import { MEAL_NAMES } from '../../src/constants.js';

// ── dateKey ──────────────────────────────────────────────────
describe('dateKey', () => {
  it('formats a date as YYYY-MM-DD', () => {
    const d = new Date('2026-03-12T15:30:00');
    expect(dateKey(d)).toBe('2026-03-12');
  });

  it('handles midnight UTC correctly', () => {
    const d = new Date('2026-01-01T00:00:00Z');
    expect(dateKey(d)).toBe('2026-01-01');
  });

  it('pads single-digit months and days', () => {
    const d = new Date('2026-02-05T12:00:00');
    expect(dateKey(d)).toBe('2026-02-05');
  });
});

// ── formatDate ───────────────────────────────────────────────
describe('formatDate', () => {
  it('returns "Vandaag" for today\'s date', () => {
    const today = dateKey(new Date());
    expect(formatDate(today)).toBe('Vandaag');
  });

  it('returns "Gisteren" for yesterday', () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    expect(formatDate(dateKey(d))).toBe('Gisteren');
  });

  it('returns a Dutch formatted date for older dates', () => {
    const result = formatDate('2026-01-15');
    // Should contain Dutch day/month names
    expect(result).toMatch(/januari/i);
  });
});

// ── emptyDay ─────────────────────────────────────────────────
describe('emptyDay', () => {
  it('returns an object with all meal keys as empty arrays', () => {
    const day = emptyDay();
    for (const meal of MEAL_NAMES) {
      expect(day).toHaveProperty(meal);
      expect(Array.isArray(day[meal])).toBe(true);
      expect(day[meal]).toHaveLength(0);
    }
  });

  it('returns a new object each time (no shared reference)', () => {
    const a = emptyDay();
    const b = emptyDay();
    expect(a).not.toBe(b);
    a.ontbijt.push({ naam: 'test' });
    expect(b.ontbijt).toHaveLength(0);
  });
});

// ── normalizeDayData ─────────────────────────────────────────
describe('normalizeDayData', () => {
  it('returns emptyDay for null input', () => {
    const result = normalizeDayData(null);
    for (const meal of MEAL_NAMES) {
      expect(Array.isArray(result[meal])).toBe(true);
    }
  });

  it('preserves existing meal arrays', () => {
    const input = { ontbijt: [{ naam: 'Brood', kcal: 80 }] };
    const result = normalizeDayData(input);
    expect(result.ontbijt).toHaveLength(1);
    expect(result.ontbijt[0].naam).toBe('Brood');
  });

  it('creates empty arrays for missing meals', () => {
    const input = { ontbijt: [{ naam: 'Ei' }] };
    const result = normalizeDayData(input);
    expect(result.lunch).toEqual([]);
    expect(result.avondeten).toEqual([]);
    expect(result.drinken).toEqual([]);
  });

  it('ignores non-array meal values', () => {
    const input = { ontbijt: 'not an array', lunch: 42 };
    const result = normalizeDayData(input);
    expect(result.ontbijt).toEqual([]);
    expect(result.lunch).toEqual([]);
  });
});

// ── esc (HTML escaping) ──────────────────────────────────────
describe('esc', () => {
  it('escapes HTML special characters', () => {
    expect(esc('<script>')).toBe('&lt;script&gt;');
    expect(esc('"hello"')).toBe('&quot;hello&quot;');
    expect(esc("it's")).toBe("it&#39;s");
    expect(esc('a & b')).toBe('a &amp; b');
  });

  it('handles non-string input', () => {
    expect(esc(123)).toBe('123');
    expect(esc(null)).toBe('null');
    expect(esc(undefined)).toBe('undefined');
  });

  it('returns empty string for empty input', () => {
    expect(esc('')).toBe('');
  });
});

// ── pct (percentage) ─────────────────────────────────────────
describe('pct', () => {
  it('calculates percentage capped at 100', () => {
    expect(pct(50, 100)).toBe(50);
    expect(pct(100, 100)).toBe(100);
    expect(pct(150, 100)).toBe(100); // capped
  });

  it('returns 0 when goal is 0 or falsy', () => {
    expect(pct(50, 0)).toBe(0);
    expect(pct(50, null)).toBe(0);
    expect(pct(50, undefined)).toBe(0);
  });

  it('rounds to nearest integer', () => {
    expect(pct(33, 100)).toBe(33);
    expect(pct(1, 3)).toBe(33); // 33.33 → 33
  });
});

// ── r1 (round to 1 decimal) ─────────────────────────────────
describe('r1', () => {
  it('rounds to 1 decimal place', () => {
    expect(r1(3.14159)).toBe(3.1);
    expect(r1(2.55)).toBe(2.6);
    expect(r1(10)).toBe(10);
    expect(r1(0.04)).toBe(0);
  });
});

// ── dayTotals ────────────────────────────────────────────────
describe('dayTotals', () => {
  it('sums up all macros across all meals', () => {
    const day = emptyDay();
    day.ontbijt = [
      { naam: 'Brood', kcal: 80, koolhydraten_g: 15, vetten_g: 1, eiwitten_g: 3, vezels_g: 2 },
      { naam: 'Kaas', kcal: 100, koolhydraten_g: 0, vetten_g: 8, eiwitten_g: 7, vezels_g: 0 },
    ];
    day.lunch = [
      { naam: 'Salade', kcal: 50, koolhydraten_g: 5, vetten_g: 2, eiwitten_g: 1, vezels_g: 3 },
    ];
    day.drinken = [
      { naam: 'Water', kcal: 0, ml: 500 },
    ];

    const totals = dayTotals(day);
    expect(totals.cals).toBe(230);
    expect(totals.carbs).toBe(20);
    expect(totals.fat).toBe(11);
    expect(totals.prot).toBe(11);
    expect(totals.fiber).toBe(5);
    expect(totals.water).toBe(500);
  });

  it('returns zeros for empty day', () => {
    const totals = dayTotals(emptyDay());
    expect(totals.cals).toBe(0);
    expect(totals.carbs).toBe(0);
    expect(totals.fat).toBe(0);
    expect(totals.prot).toBe(0);
    expect(totals.fiber).toBe(0);
    expect(totals.water).toBe(0);
  });

  it('handles missing/undefined macro values gracefully', () => {
    const day = emptyDay();
    day.ontbijt = [{ naam: 'Mysterieus item' }]; // no macros at all
    const totals = dayTotals(day);
    expect(totals.cals).toBe(0);
    expect(totals.carbs).toBe(0);
  });
});
