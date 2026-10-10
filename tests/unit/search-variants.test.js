import { describe, it, expect } from 'vitest';
import { toLongVowelSearchTerm } from '../../src/products/database.js';

describe('toLongVowelSearchTerm', () => {
  it('restores the long vowel of Dutch plural stems', () => {
    expect(toLongVowelSearchTerm('banan')).toBe('banaan');
    expect(toLongVowelSearchTerm('tomat')).toBe('tomaat');
    expect(toLongVowelSearchTerm('bon')).toBe('boon');
    expect(toLongVowelSearchTerm('per')).toBe('peer');
  });

  it('devoices v and z', () => {
    expect(toLongVowelSearchTerm('kaz')).toBe('kaas');
    expect(toLongVowelSearchTerm('druiv')).toBe('druif');
  });

  it('leaves stems with a diphthong or double vowel alone', () => {
    expect(toLongVowelSearchTerm('friet')).toBe('friet');
    expect(toLongVowelSearchTerm('banaan')).toBe('banaan');
  });
});
