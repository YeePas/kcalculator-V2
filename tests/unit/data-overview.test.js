import { describe, it, expect, beforeEach } from 'vitest';
import { buildDateKeys } from '../../src/pages/data-overview.js';
import { setCurrentDate } from '../../src/state.js';

describe('data-overview date anchoring', () => {
  beforeEach(() => {
    setCurrentDate('2026-04-03');
  });

  it('anchors week ranges to the selected current date', () => {
    setCurrentDate('2026-03-15');
    expect(buildDateKeys(7)).toEqual([
      '2026-03-09',
      '2026-03-10',
      '2026-03-11',
      '2026-03-12',
      '2026-03-13',
      '2026-03-14',
      '2026-03-15',
    ]);
  });
});
