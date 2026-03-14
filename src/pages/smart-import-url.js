/* ── Smart Import: URL Import (OFF/ah.nl/jumbo + AI) ──────── */

import { esc, r1 } from '../utils.js';
import {
  createFoodFromManualNutrition,
  importFoodFromUrl,
  normalizeImportUrl,
} from '../ai/dish-import-service.js';

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(ah|jumbo|huismerk|biologisch)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreOffMatch(productName, candidate) {
  const target = normalizeName(productName);
  const candidateName = normalizeName(candidate?.product_name || '');
  const brand = normalizeName(candidate?.brands || '');
  const combined = `${candidateName} ${brand}`.trim();
  if (!target || !candidateName) return 0;

  if (candidateName === target) return 100;
  if (candidateName.includes(target) || target.includes(candidateName)) return 88;

  const targetTokens = target.split(' ').filter(t => t.length > 2);
  if (!targetTokens.length) return 0;

  let score = 0;
  const matchedTokens = targetTokens.filter(token => combined.includes(token));
  score += (matchedTokens.length / targetTokens.length) * 70;

  if (targetTokens[0] && candidateName.includes(targetTokens[0])) score += 10;
  if ((candidate?.nutriments?.['energy-kcal_100g'] || 0) > 0) score += 8;
  if (brand.includes('albert heijn') || brand.includes('jumbo')) score += 6;

  return Math.round(score);
}

function findBestOffProduct(productName, products) {
  const ranked = (products || [])
    .map(product => ({ product, score: scoreOffMatch(productName, product) }))
    .filter(entry => (entry.product?.nutriments?.['energy-kcal_100g'] || 0) > 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0] || null;
}

export async function handleUrlImport(btn, renderCard, feedbackNear) {
  const target = document.getElementById('smart-url-result');
  const input = document.getElementById('smart-url-input').value.trim();
  if (!input) { feedbackNear(btn, 'Vul een URL in', 'danger'); return; }

  target.innerHTML = '<div class="advies-loading"><span class="spin">⏳</span> Importeren…</div>';

  try {
    const normalizedInput = normalizeImportUrl(input);

    // Direct OpenFoodFacts barcode lookup
    if (normalizedInput.includes('openfoodfacts.org')) {
      const barcodeMatch = normalizedInput.match(/product\/(\d+)/);
      if (!barcodeMatch) throw new Error('Geen geldig OFF URL');
      const r = await fetch('https://world.openfoodfacts.org/api/v2/product/' + encodeURIComponent(barcodeMatch[1]) + '.json?fields=product_name,nutriments,brands');
      if (!r.ok) throw new Error('Product niet gevonden');
      const data = await r.json();
      const p = data.product;
      if (!p) throw new Error('Geen productdata');
      const n = p.nutriments || {};
      return renderCard('smart-url-result', offToProposal(p.product_name, n));
    }

    // ah.nl / jumbo.com → search OFF by product slug
    if (normalizedInput.includes('ah.nl') || normalizedInput.includes('jumbo.com')) {
      const slug = normalizedInput.split('/').filter(s => s.length > 3).pop() || '';
      const productName = slug.replace(/[-_]/g, ' ').replace(/^(wi\d+|\d+)\s*/, '').replace(/^(ah|jumbo)\s*/i, '').trim();
      if (!productName) throw new Error('Kan productnaam niet uit URL halen');

      const offR = await fetch('https://world.openfoodfacts.org/cgi/search.pl?action=process&search_terms=' + encodeURIComponent(productName) + '&countries_tags_contains=netherlands&fields=product_name,nutriments,brands&page_size=5&json=true');
      if (offR.ok) {
        const offData = await offR.json();
        const best = findBestOffProduct(productName, offData.products);
        if (best && best.score >= 55) {
          return renderCard('smart-url-result', offToProposal(best.product.product_name || productName, best.product.nutriments));
        }
      }
      // Fall through to AI scrape if OFF search is weak or fails
    }

    // General URL → AI scrape + estimation
    renderCard('smart-url-result', await importFoodFromUrl(normalizedInput));
  } catch (e) {
    target.innerHTML = '<p class="smart-error">' + esc(e?.message || 'Onbekende fout') + '</p>';
  }
}

function offToProposal(name, n) {
  return createFoodFromManualNutrition({
    title: name || 'Product',
    calories: Math.round(n['energy-kcal_100g'] || n['energy-kcal'] || 0),
    protein_g: r1(n.proteins_100g || 0),
    carbs_g: r1(n.carbohydrates_100g || 0),
    fat_g: r1(n.fat_100g || 0),
    fiber_g: r1(n.fiber_100g || 0),
    portionGrams: 100,
    portionLabel: '100g',
  });
}
