/* ── Smart Import: URL Import (Open Food Facts only) ─────── */

import { esc, r1 } from '../utils.js';
import {
  createFoodFromManualNutrition,
  normalizeImportUrl,
} from '../ai/dish-import-service.js';

export async function handleUrlImport(btn, renderCard, feedbackNear) {
  const target = document.getElementById('smart-url-result');
  const input = document.getElementById('smart-url-input').value.trim();
  if (!input) { feedbackNear(btn, 'Vul een URL in', 'danger'); return; }

  target.innerHTML = '<div class="advies-loading"><span class="spin">⏳</span> Importeren…</div>';

  try {
    const normalizedInput = normalizeImportUrl(input);
    if (!normalizedInput.includes('openfoodfacts.org')) {
      throw new Error('Gebruik hier alleen een Open Food Facts URL.');
    }

    // Direct OpenFoodFacts barcode lookup
    const barcodeMatch = normalizedInput.match(/product\/(\d+)/);
    if (!barcodeMatch) throw new Error('Geen geldige Open Food Facts product-URL.');
    const r = await fetch('https://world.openfoodfacts.org/api/v2/product/' + encodeURIComponent(barcodeMatch[1]) + '.json?fields=product_name,nutriments,brands,serving_size,serving_quantity,product_quantity,quantity');
    if (!r.ok) throw new Error('Product niet gevonden op Open Food Facts.');
    const data = await r.json();
    const p = data.product;
    if (!p) throw new Error('Geen productdata gevonden op Open Food Facts.');
    const n = p.nutriments || {};
    return renderCard('smart-url-result', offToProposal(p.product_name, n, p));
  } catch (e) {
    target.innerHTML = '<p class="smart-error">' + esc(e?.message || 'Onbekende fout') + '</p>';
  }
}

function parseServingInfo(product) {
  const servingLabel = String(product?.serving_size || '').trim();
  const servingQty = Number(product?.serving_quantity);

  if (servingLabel && Number.isFinite(servingQty) && servingQty > 0) {
    return { portionLabel: servingLabel, portionGrams: servingQty };
  }

  const match = servingLabel.match(/(\d+(?:[.,]\d+)?)\s*(g|gr|gram|ml)\b/i);
  if (match) {
    return {
      portionLabel: servingLabel,
      portionGrams: Math.round(parseFloat(match[1].replace(',', '.'))),
    };
  }

  return { portionLabel: '100g', portionGrams: 100 };
}

function offToProposal(name, n, product) {
  const serving = parseServingInfo(product);
  const factor = Math.max(serving.portionGrams, 1) / 100;
  const calories = n['energy-kcal_serving'] || n['energy-kcal_value'] || Math.round((n['energy-kcal_100g'] || n['energy-kcal'] || 0) * factor);
  const protein = n.proteins_serving || (n.proteins_100g || 0) * factor;
  const carbs = n.carbohydrates_serving || (n.carbohydrates_100g || 0) * factor;
  const fat = n.fat_serving || (n.fat_100g || 0) * factor;
  const fiber = n.fiber_serving || (n.fiber_100g || 0) * factor;

  return createFoodFromManualNutrition({
    title: name || 'Product',
    calories: Math.round(calories || 0),
    protein_g: r1(protein || 0),
    carbs_g: r1(carbs || 0),
    fat_g: r1(fat || 0),
    fiber_g: r1(fiber || 0),
    portionGrams: serving.portionGrams,
    portionLabel: serving.portionLabel,
  });
}
