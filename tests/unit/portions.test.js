import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { findPortie, GROEP_PORTIES } from '../../src/products/portions.js';
import { isLiquidLike } from '../../src/products/density.js';

const sizes = (name, group) => findPortie(name, group).map(p => `${p.l || p.t} ${p.g}`);

describe('findPortie', () => {
  it('uses the rule that matches earliest in the name', () => {
    expect(sizes('Watermeloen & aardbei')[0]).toBe('partje 250');
    expect(sizes('Chocolademelk')[0]).toBe('glas 200');
  });

  it('gives small fruit realistic piece weights', () => {
    expect(sizes('Kers')).toContain('kers 8');
    expect(sizes('Dadels vers')).toContain('dadel 8');
    expect(sizes('Lychee')).toContain('lychee 10');
    expect(sizes('Bessen rode')[0]).toBe('handje 60');
    expect(sizes('Ananas')).toContain('ring (blik) 40');
  });

  it('treats dried fruit as a handful', () => {
    expect(sizes('Mango gedroogd')[0]).toBe('handje 25');
    expect(sizes('Rozijnen')[0]).toBe('handje 25');
  });

  it('keeps apples ordered small -> normal -> large', () => {
    expect(sizes('Appel m schil gem').slice(0, 3)).toEqual(['kleine 110', 'appel 140', 'grote 190']);
  });

  it('falls back to a fruit portion instead of a generic piece', () => {
    expect(sizes('Onbekende vrucht', 6)[0]).toBe('portie 125');
  });

  it('does not mistake compound words for the fruit', () => {
    expect(sizes('Granaatappel')).toContain('granaatappel 150');
    expect(sizes('Olijfolie')[0]).toBe('eetlepel 10');
  });
});

describe('findPortie bars and package servings', () => {
  it('treats muesli and nut bars as bars, not muesli', () => {
    expect(findPortie('AH Mueslireep hazelnoot').map(p => p.l || p.t)).toEqual(['reep', 'gram']);
  });

  it('labels the Open Food Facts serving as a portion from the package', () => {
    expect(findPortie('AH Mueslireep hazelnoot', undefined, 25)[0]).toEqual({ t: 'portie', g: 25, l: 'portie (verpakking)' });
  });

  it('gives pickles and canned fish their own portions', () => {
    expect(sizes('Augurk zoetzuur')[0]).toBe('augurk 40');
    expect(sizes('Zoetzure cocktail augurken')[0]).toBe('augurkje 8');
    expect(sizes('Tonijn In Olijfolie')[0]).toBe('blikje (uitgelekt) 110');
    expect(sizes('Olijfolie extra vierge')[0]).toBe('eetlepel 10');
    expect(sizes('Zonnebloemolie')[0]).toBe('eetlepel 10');
  });
});

describe('product groups', () => {
  // GROEP_PORTIES is keyed by index into products.json "groups"; a reordered list would give
  // vegetables bread portions.
  const { groups } = JSON.parse(readFileSync(new URL('../../public/products.json', import.meta.url), 'utf8'));

  it('keeps the group order the portion table expects', () => {
    expect(groups.length).toBe(Object.keys(GROEP_PORTIES).length);
    expect(groups[2]).toBe('Brood');
    expect(groups[6]).toBe('Fruit');
    expect(groups[9]).toBe('Groente');
    expect(groups[22]).toBe('Vetten en oliën');
    expect(groups[23]).toBe('Vis, schaal- en schelpdieren');
  });
});

describe('isLiquidLike', () => {
  it('treats food packed in oil or brine as solid', () => {
    expect(isLiquidLike('Tonijn In Olijfolie')).toBe(false);
    expect(isLiquidLike('Zoetzure cocktail augurken')).toBe(false);
    expect(isLiquidLike('Olijfolie')).toBe(true);
  });
});
