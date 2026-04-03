import { describe, it, expect } from 'vitest';
import { parseQuantity, parsePortionTextPart } from '../../src/products/quantity-parser.js';
import { parseTextToItems } from '../../src/products/matcher.js';

describe('quantity-parser', () => {
  it('parses explicit ml correctly', () => {
    const parsed = parsePortionTextPart('250 ml melk');
    expect(parsed.foodName).toBe('melk');
    expect(parsed.ml).toBe(250);
    expect(parsed.gram).toBe(250);
    expect(parsed.quantitySource).toBe('explicit-unit');
  });

  it('converts cl/dl/l to ml', () => {
    expect(parsePortionTextPart('2 cl siroop').ml).toBe(20);
    expect(parsePortionTextPart('1.5 dl yoghurt').ml).toBe(150);
    expect(parsePortionTextPart('1,5 l water').ml).toBe(1500);
  });

  it('supports additional logical units', () => {
    expect(parsePortionTextPart('1 kommetje soep').gram).toBe(250);
    expect(parsePortionTextPart('1 schaaltje yoghurt').gram).toBe(200);
    expect(parsePortionTextPart('1 pakje chocomel').gram).toBe(250);
    expect(parsePortionTextPart('1 blikje cola').gram).toBe(330);
  });

  it('keeps count when no explicit unit is present', () => {
    const parsed = parsePortionTextPart('2 bananen');
    expect(parsed.foodName).toBe('bananen');
    expect(parsed.count).toBe(2);
    expect(parsed.gram).toBe(null);
  });

  it('parses query quantity for database search', () => {
    const parsed = parseQuantity('halve avocado');
    expect(parsed.count).toBe(0.5);
    expect(parsed.query).toBe('avocado');
  });
});

describe('parseTextToItems integration', () => {
  it('preserves ml for drink-like inputs', () => {
    const [item] = parseTextToItems('330 ml cola');
    expect(item.foodName).toBe('cola');
    expect(item.ml).toBe(330);
    expect(item.gram).toBe(330);
  });

  it('parses multiple items with robust units', () => {
    const items = parseTextToItems('2 eetlepels yoghurt met 1 kommetje soep');
    expect(items).toHaveLength(2);
    expect(items[0].foodName).toBe('yoghurt');
    expect(items[0].gram).toBe(30);
    expect(items[1].foodName).toBe('soep');
    expect(items[1].gram).toBe(250);
  });

  it('keeps comma descriptors inside recipe lines together', () => {
    const items = parseTextToItems('bloem, gezeefd\nboter, koude blokjes');
    expect(items).toHaveLength(2);
    expect(items[0].foodName).toBe('bloem');
    expect(items[1].foodName).toBe('boter');
  });
});
