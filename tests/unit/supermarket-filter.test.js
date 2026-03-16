import { describe, it, expect } from 'vitest';
import {
  getSupermarketChainForBrand,
  normalizeSupermarketFilters,
  shouldIncludeProductForSupermarketFilters,
} from '../../src/products/supermarket-filter.js';

describe('normalizeSupermarketFilters', () => {
  it('keeps only known supermarket ids', () => {
    expect(normalizeSupermarketFilters(['ah', 'jumbo', 'unknown'])).toEqual(['ah', 'jumbo']);
  });

  it('deduplicates values', () => {
    expect(normalizeSupermarketFilters(['ah', 'ah', 'jumbo'])).toEqual(['ah', 'jumbo']);
  });
});

describe('getSupermarketChainForBrand', () => {
  it('recognizes Albert Heijn aliases', () => {
    expect(getSupermarketChainForBrand('Albert Heijn')).toBe('ah');
    expect(getSupermarketChainForBrand('AH Bio')).toBe('ah');
    expect(getSupermarketChainForBrand('Ah Terra')).toBe('ah');
  });

  it('recognizes Jumbo aliases', () => {
    expect(getSupermarketChainForBrand('Jumbo')).toBe('jumbo');
    expect(getSupermarketChainForBrand("JUMBO'S")).toBe('jumbo');
    expect(getSupermarketChainForBrand('1de Beste')).toBe('jumbo');
  });

  it('returns null for regular A-brands', () => {
    expect(getSupermarketChainForBrand('Coca-Cola')).toBe(null);
    expect(getSupermarketChainForBrand('Calve')).toBe(null);
  });
});

describe('shouldIncludeProductForSupermarketFilters', () => {
  it('keeps everything when no exclusions are set', () => {
    expect(shouldIncludeProductForSupermarketFilters({ src: 'off', b: 'Lidl' }, [])).toBe(true);
  });

  it('keeps supermarkets that are NOT excluded', () => {
    expect(shouldIncludeProductForSupermarketFilters({ src: 'off', b: 'Albert Heijn' }, ['lidl', 'aldi'])).toBe(true);
    expect(shouldIncludeProductForSupermarketFilters({ src: 'off', b: 'Jumbo' }, ['lidl', 'aldi'])).toBe(true);
  });

  it('hides products from excluded supermarkets', () => {
    expect(shouldIncludeProductForSupermarketFilters({ src: 'off', b: 'Lidl' }, ['lidl', 'aldi'])).toBe(false);
    expect(shouldIncludeProductForSupermarketFilters({ src: 'off', b: 'Aldi' }, ['lidl', 'aldi'])).toBe(false);
    expect(shouldIncludeProductForSupermarketFilters({ src: 'off', b: 'Picnic' }, ['picnic'])).toBe(false);
  });

  it('keeps rivm and custom products regardless of exclusions', () => {
    expect(shouldIncludeProductForSupermarketFilters({ src: 'rivm', b: '' }, ['ah'])).toBe(true);
    expect(shouldIncludeProductForSupermarketFilters({ _custom: true, b: 'Lidl' }, ['lidl'])).toBe(true);
  });

  it('keeps non-supermarket A-brands regardless of exclusions', () => {
    expect(shouldIncludeProductForSupermarketFilters({ src: 'off', b: 'Coca-Cola' }, ['ah'])).toBe(true);
  });
});
