/* ── Custom Product External Imports ──────────────────────── */

import { r1 } from '../utils.js';
import { parseFood } from '../ai/parser.js';
import { fillCustomFields } from './custom-ui.js';

export async function aiFilLCustomProduct() {
  const naam = document.getElementById('custom-naam').value.trim();
  if (!naam) {
    alert('Vul eerst een productnaam in');
    return;
  }

  const btn = document.getElementById('custom-ai-btn');
  btn.textContent = '🔍 Zoeken…';
  btn.disabled = true;

  try {
    const items = await parseFood(naam + ' 100g', 'ontbijt');
    if (items && items.length > 0) {
      const item = items[0];
      document.getElementById('custom-kcal').value = Math.round(item.kcal || 0);
      document.getElementById('custom-kh').value = r1(item.koolhydraten_g || 0);
      document.getElementById('custom-vz').value = r1(item.vezels_g || 0);
      document.getElementById('custom-v').value = r1(item.vetten_g || 0);
      document.getElementById('custom-e').value = r1(item.eiwitten_g || 0);
      btn.textContent = '✓ Ingevuld!';
      btn.style.borderColor = 'var(--green)';
      btn.style.color = 'var(--green)';
    } else {
      btn.textContent = '✗ Niet gevonden';
      btn.style.color = 'var(--danger)';
    }
  } catch (e) {
    btn.textContent = '✗ ' + (e.message || 'Fout');
    btn.style.color = 'var(--danger)';
  }

  btn.disabled = false;
  setTimeout(() => {
    btn.textContent = '🤖 Vul in met AI';
    btn.style.borderColor = 'var(--blue)';
    btn.style.color = 'var(--blue)';
  }, 3000);
}

export async function importFromOFF() {
  const urlInput = document.getElementById('custom-url');
  const btn = document.getElementById('custom-url-btn');
  const url = urlInput.value.trim();
  if (!url) {
    alert('Plak een product-URL');
    return;
  }

  btn.textContent = 'Laden…';
  btn.disabled = true;

  try {
    if (url.includes('openfoodfacts.org')) {
      const barcodeMatch = url.match(/product\/(\d+)/);
      if (!barcodeMatch) throw new Error('Geen geldig OFF URL');
      const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcodeMatch[1]}.json?fields=product_name,nutriments,brands`);
      if (!r.ok) throw new Error('Product niet gevonden');
      const data = await r.json();
      const p = data.product;
      if (!p) throw new Error('Geen productdata');
      const n = p.nutriments || {};
      fillCustomFields(p.product_name || '', n['energy-kcal_100g'] || n['energy-kcal'] || 0, n.carbohydrates_100g || 0, n.fiber_100g || 0, n.fat_100g || 0, n.proteins_100g || 0);
      btn.textContent = '✓ Geïmporteerd';
      btn.style.color = 'var(--green)';
    } else if (url.includes('ah.nl') || url.includes('jumbo.com')) {
      const slug = url.split('/').filter(s => s.length > 3).pop() || '';
      const productName = slug
        .replace(/[-_]/g, ' ')
        .replace(/^(wi\d+|\d+)\s*/, '')
        .replace(/^(ah|jumbo)\s*/i, '')
        .trim();

      if (!productName) throw new Error('Kan productnaam niet uit URL halen');

      const offR = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?action=process&search_terms=${encodeURIComponent(productName)}&countries_tags_contains=netherlands&fields=product_name,nutriments,brands&page_size=5&json=true`);
      let found = false;
      if (offR.ok) {
        const offData = await offR.json();
        if (offData.products?.length > 0) {
          const p = offData.products[0];
          const n = p.nutriments || {};
          if (n['energy-kcal_100g'] > 0) {
            fillCustomFields(p.product_name || productName, n['energy-kcal_100g'] || 0, n.carbohydrates_100g || 0, n.fiber_100g || 0, n.fat_100g || 0, n.proteins_100g || 0);
            btn.textContent = '✓ Via Open Food Facts';
            btn.style.color = 'var(--green)';
            found = true;
          }
        }
      }

      if (!found) {
        document.getElementById('custom-naam').value = productName;
        btn.textContent = '→ Naam ingevuld, klik AI';
        btn.style.color = 'var(--blue)';
      }
    } else {
      throw new Error('Ondersteund: openfoodfacts.org, ah.nl, jumbo.com');
    }
  } catch (e) {
    btn.textContent = '✗ ' + e.message;
    btn.style.color = 'var(--danger)';
  }

  btn.disabled = false;
  setTimeout(() => {
    btn.textContent = 'Importeer';
    btn.style.color = '';
  }, 4000);
}
