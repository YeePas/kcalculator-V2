import { describe, it, expect } from 'vitest';
import { buildCorrectionEntry } from '../../src/products/corrections.js';

describe('buildCorrectionEntry', () => {
  it('turns a product report into a correction entry', () => {
    const entry = buildCorrectionEntry({
      id: 42,
      message: 'Verpakking  zegt 615 kcal',
      details: { product: 'Cashewnoten', brand: 'AH Biologisch', per100: { k: 27, kh: 22.6, v: 50, e: 16.7, vz: 5.5 } },
    });
    expect(entry).toEqual({
      n: 'Cashewnoten',
      b: 'AH Biologisch',
      set: { k: 27, kh: 22.6, v: 50, e: 16.7, vz: 5.5 },
      note: 'melding #42: Verpakking zegt 615 kcal',
    });
  });

  it('leaves out the brand when unknown and ignores reports without a product', () => {
    expect(buildCorrectionEntry({ details: { product: 'Kers', per100: { k: 50 } } })).toEqual({ n: 'Kers', set: { k: 50 }, note: 'melding' });
    expect(buildCorrectionEntry({ details: {} })).toBeNull();
  });
});
