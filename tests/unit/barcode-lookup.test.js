import { describe, it, expect } from 'vitest';
import { findLocalProductByBarcode } from '../../src/products/barcode-scanner.js';

const items = [
  { n: 'Halfvolle melk', c: '8710000000001', k: 46 },
  { n: 'Pindakaas', c: '08710000000002', k: 630 },
  { n: 'NEVO zonder code', k: 100, src: 'rivm' },
];

describe('findLocalProductByBarcode', () => {
  it('finds a product by its barcode', () => {
    expect(findLocalProductByBarcode('8710000000001', items)?.n).toBe('Halfvolle melk');
  });

  it('ignores leading zeros (EAN-13 vs UPC-A)', () => {
    expect(findLocalProductByBarcode('8710000000002', items)?.n).toBe('Pindakaas');
  });

  it('returns null when the barcode is unknown or empty', () => {
    expect(findLocalProductByBarcode('123', items)).toBeNull();
    expect(findLocalProductByBarcode('', items)).toBeNull();
  });
});
