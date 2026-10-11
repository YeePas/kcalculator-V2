import { describe, it, expect } from 'vitest';
import { buildRecipeFavourite, updateRecipeFavourite } from '../../src/modals/recipe-amounts.js';

const milk = { naam: 'Halfvolle melk', portie: '170ml', ml: 170, kcal: 84, koolhydraten_g: 8.8, vezels_g: 0, vetten_g: 2.6, eiwitten_g: 6.1 };
const oats = { naam: 'Havermout', portie: '50g', ml: 0, kcal: 196, koolhydraten_g: 31, vezels_g: 5, vetten_g: 3.5, eiwitten_g: 6.8 };

describe('saved dishes', () => {
  it('builds a dish from meal items with summed totals', () => {
    const fav = buildRecipeFavourite('Havermout Ontbijt', 'ontbijt', [milk, oats], 1000);
    expect(fav).toMatchObject({
      naam: 'Havermout Ontbijt',
      tekst: 'Halfvolle melk, Havermout',
      maaltijd: 'ontbijt',
      isRecipe: true,
      uses: 0,
      createdAt: 1000,
      item: { naam: 'Havermout Ontbijt', portie: '2 ingrediënten', kcal: 280, koolhydraten_g: 39.8, eiwitten_g: 12.9, ml: 170 },
    });
  });

  it('copies the items so later edits do not touch the day', () => {
    const items = [milk, oats];
    const fav = buildRecipeFavourite('X', 'ontbijt', items);
    fav.items[0].kcal = 0;
    expect(items[0].kcal).toBe(84);
  });

  it('updates name, ingredients and text, keeping use count', () => {
    const fav = { ...buildRecipeFavourite('Oud', 'ontbijt', [milk, oats]), uses: 7 };
    const moreOats = { ...oats, portie: '75g', kcal: 294 };
    const next = updateRecipeFavourite(fav, { naam: ' Nieuw ', items: [milk, moreOats] });
    expect(next).toMatchObject({ naam: 'Nieuw', uses: 7, tekst: 'Halfvolle melk, Havermout', item: { kcal: 378, naam: 'Nieuw' } });
  });

  it('lets hand-adjusted totals win and keeps the old name when the field is empty', () => {
    const fav = buildRecipeFavourite('Ontbijt', 'ontbijt', [milk, oats]);
    const next = updateRecipeFavourite(fav, { naam: '', items: fav.items, totals: { kcal: 300 } });
    expect(next.naam).toBe('Ontbijt');
    expect(next.item.kcal).toBe(300);
    expect(next.item.eiwitten_g).toBe(12.9);
  });
});
