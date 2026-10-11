import { describe, it, expect } from 'vitest';
import { parseIngredientAmount, nutritionPerUnit, scaleIngredient, sumIngredients } from '../../src/modals/recipe-amounts.js';

const oats = { naam: 'Havermout', portie: '50g', kcal: 196, koolhydraten_g: 31, vezels_g: 5, vetten_g: 3.5, eiwitten_g: 6.8, ml: 0 };

describe('recipe ingredient amounts', () => {
  it('reads grams and millilitres from the saved portion', () => {
    expect(parseIngredientAmount(oats)).toEqual({ amount: 50, unit: 'g' });
    expect(parseIngredientAmount({ portie: '170ml', ml: 170 })).toEqual({ amount: 170, unit: 'ml' });
    expect(parseIngredientAmount({ portie: '1 stuk (120g)' })).toEqual({ amount: 120, unit: 'g' });
    expect(parseIngredientAmount({ portie: '' })).toEqual({ amount: null, unit: 'g' });
  });

  it('scales nutrition proportionally (50 g -> 75 g havermout)', () => {
    const scaled = scaleIngredient(oats, nutritionPerUnit(oats, 50), 75, 'g');
    expect(scaled).toMatchObject({ portie: '75g', kcal: 294, koolhydraten_g: 46.5, vezels_g: 7.5, vetten_g: 5.3, eiwitten_g: 10.2, _gram: 75, ml: 0 });
  });

  it('keeps ml in step for liquids', () => {
    const milk = { naam: 'Halfvolle melk', portie: '170ml', ml: 170, kcal: 84, koolhydraten_g: 8.8, vezels_g: 0, vetten_g: 2.6, eiwitten_g: 6.1 };
    const scaled = scaleIngredient(milk, nutritionPerUnit(milk, 170), 250, 'ml');
    expect(scaled).toMatchObject({ portie: '250ml', ml: 250, kcal: 124 });
  });

  it('cannot derive per-unit values from a zero amount', () => {
    expect(nutritionPerUnit(oats, 0)).toBeNull();
  });

  it('sums ingredients into rounded totals', () => {
    expect(sumIngredients([oats, oats])).toMatchObject({ kcal: 392, koolhydraten_g: 62, eiwitten_g: 13.6 });
  });
});
