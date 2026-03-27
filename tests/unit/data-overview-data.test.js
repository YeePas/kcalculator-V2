import { describe, it, expect, vi, afterEach } from 'vitest';
import { aggregatePeriod } from '../../src/pages/data-overview-data.js';

describe('aggregatePeriod energy balance', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('excludes today from energy balance averages and totals', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-27T12:00:00Z'));

    const entries = [
      { key: '2026-03-26', day: { cals: 2000, carbs: 0, fat: 0, prot: 0, fiber: 0 } },
      { key: '2026-03-27', day: { cals: 1000, carbs: 0, fat: 0, prot: 0, fiber: 0 } },
    ];
    const energyMap = {
      '2026-03-26': { tdee_kcal: 2500, active_kcal: 500, resting_kcal: 2000 },
      '2026-03-27': { tdee_kcal: 3000, active_kcal: 900, resting_kcal: 2100 },
    };

    const result = aggregatePeriod(entries, {}, day => day, energyMap);

    expect(result.daysWithEnergy).toBe(1);
    expect(result.avgIntakeWithEnergy).toBe(2000);
    expect(result.avgTDEE).toBe(2500);
    expect(result.avgActive).toBe(500);
    expect(result.avgResting).toBe(2000);
    expect(result.cumulativeBalance).toBe(-500);
  });
});
