/* ── Custom Product Save ──────────────────────────────────── */

import { loadCustomProducts, saveCustomProducts } from '../storage.js';
import { syncCustomProductsToSupabase } from '../supabase/sync.js';

export function saveCustomProduct() {
  const naam = document.getElementById('custom-naam').value.trim();
  if (!naam) return false;

  const product = {
    n: naam,
    k: parseFloat(document.getElementById('custom-kcal').value) || 0,
    kh: parseFloat(document.getElementById('custom-kh').value) || 0,
    vz: parseFloat(document.getElementById('custom-vz').value) || 0,
    v: parseFloat(document.getElementById('custom-vet')?.value || document.getElementById('custom-v')?.value) || 0,
    e: parseFloat(document.getElementById('custom-eiwit')?.value || document.getElementById('custom-e')?.value) || 0,
    s: document.getElementById('custom-portie').value.trim(),
    b: document.getElementById('custom-merk')?.value?.trim() || '',
    _custom: true,
  };

  const products = loadCustomProducts();
  products.push(product);
  saveCustomProducts(products);
  syncCustomProductsToSupabase(true);
  return product;
}
