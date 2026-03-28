import { describe, expect, it } from 'vitest';
import { getIntakeChartAxisMax } from '../../src/pages/data-overview-charts.js';

describe('getIntakeChartAxisMax', () => {
  it('bases the intake chart scale on max intake plus 300, not outlier TDEE values', () => {
    const days = [
      { intake: 3034, tdee_kcal: 3121 },
      { intake: 2761, tdee_kcal: 3947 },
      { intake: 3537, tdee_kcal: 13200 },
      { intake: 3179, tdee_kcal: 3572 },
    ];

    expect(getIntakeChartAxisMax(days, 2750)).toBe(3837);
  });

  it('keeps the goal visible when it exceeds max intake plus 300', () => {
    const days = [
      { intake: 1800, tdee_kcal: 2400 },
      { intake: 2100, tdee_kcal: 2500 },
    ];

    expect(getIntakeChartAxisMax(days, 2800)).toBe(2800);
  });
});
