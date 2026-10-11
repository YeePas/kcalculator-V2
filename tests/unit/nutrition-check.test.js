import { describe, it, expect } from 'vitest';
import { checkEnergy, applyEnergyCheck, macroEnergy } from '../../src/products/nutrition-check.js';

describe('energy plausibility check', () => {
  it('accepts values that match the macros', () => {
    expect(checkEnergy({ n: 'Halfvolle melk', k: 46, kh: 4.7, v: 1.5, e: 3.5, vz: 0 }).status).toBe('ok');
  });

  it('converts kJ stored as kcal', () => {
    const juice = { n: 'Orange juice', k: 167, kh: 9, v: 0, e: 0.5, vz: 0 };
    expect(checkEnergy(juice)).toMatchObject({ status: 'kj', kcal: 40 });
    expect(applyEnergyCheck(juice).k).toBe(40);
  });

  it('treats anything above 900 kcal as kJ', () => {
    expect(applyEnergyCheck({ n: 'Chocolade', k: 1733, kh: 57, v: 28, e: 7.4, vz: 3.7 }).k).toBe(414);
  });

  it('flags kcal that disagree with the macros', () => {
    const cashews = { n: 'Cashewnoten', k: 27, kh: 20, v: 48, e: 20, vz: 3 };
    expect(checkEnergy(cashews).status).toBe('suspect');
    expect(applyEnergyCheck(cashews).w).toBe(1);
  });

  it('leaves alcoholic drinks and sugar-free products alone', () => {
    expect(checkEnergy({ n: 'Campari', k: 180, kh: 10, v: 0, e: 0, vz: 0 }).status).toBe('unknown');
    expect(checkEnergy({ n: 'Cola zero kauwgom', k: 150, kh: 70, v: 0, e: 0, vz: 0 }).status).toBe('ok');
  });

  it('drops a stale flag once values agree', () => {
    expect(applyEnergyCheck({ n: 'Rijst', k: 350, kh: 78, v: 0.6, e: 7, vz: 1, w: 1 }).w).toBeUndefined();
  });

  it('computes Atwater energy', () => {
    expect(macroEnergy({ kh: 10, e: 10, v: 10, vz: 5 })).toBe(180);
  });
});
