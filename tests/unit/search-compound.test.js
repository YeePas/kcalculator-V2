import { describe, it, expect } from 'vitest';
import { compoundSearchVariants } from '../../src/products/database.js';

describe('compoundSearchVariants', () => {
  it('joins separate words into the compound', () => {
    expect(compoundSearchVariants(['volkoren', 'brood'])).toEqual(['volkorenbrood']);
  });

  it('splits a known head off a compound word', () => {
    expect(compoundSearchVariants(['volkorenbrood'])).toEqual(['volkoren brood']);
    expect(compoundSearchVariants(['halfvollemelk'])).toEqual(['halfvolle melk']);
  });

  it('leaves short or unrelated words alone', () => {
    expect(compoundSearchVariants(['brood'])).toEqual([]);
    expect(compoundSearchVariants(['banaan'])).toEqual([]);
  });
});
