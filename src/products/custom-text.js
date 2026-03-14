/* ── Custom Nutrition Text Parsing ─────────────────────────── */

import { r1 } from '../utils.js';
import { fillCustomFields } from './custom-ui.js';

export function parseNutritionText() {
  const txt = (document.getElementById('custom-paste')?.value || '').trim();
  if (!txt) {
    alert('Plak eerst voedingswaarden in het tekstveld');
    return;
  }

  const isPer100 = /per\s*100\s*g/i.test(txt);
  const servingMatch = txt.match(/per\s+portie[:\s]*(\d+)\s*g/i) || txt.match(/(\d+)\s*g\s*per\s+portie/i);
  const servingG = servingMatch ? parseFloat(servingMatch[1]) : null;
  const yieldMatch = txt.match(/(\d+)\s*(?:personen|porties|servings)/i);
  const yieldCount = yieldMatch ? parseInt(yieldMatch[1]) : null;

  function extractVal(patterns) {
    for (const p of patterns) {
      const m = txt.match(p);
      if (m) return parseFloat(m[1].replace(',', '.'));
    }
    return 0;
  }

  let kcal = extractVal([
    /calorie[\ëe]n[:\s~]*([\d,.]+)\s*kcal/i,
    /energie[:\s~]*([\d,.]+)\s*kcal/i,
    /kcal[:\s~]*([\d,.]+)/i,
    /([\d,.]+)\s*kcal/i,
    /energie[:\s~]*([\d,.]+)\s*kj/i,
  ]);
  if (kcal > 500 && /kj/i.test(txt) && !/kcal/i.test(txt)) kcal = Math.round(kcal / 4.184);

  let kh = extractVal([/koolhydra[a-z]*[:\s~]*([\d,.]+)\s*g/i, /carbs?[:\s~]*([\d,.]+)\s*g/i, /kh[:\s~]*([\d,.]+)\s*g/i]);
  let vz = extractVal([/vezel[s]?[:\s~]*([\d,.]+)\s*g/i, /fibre?[:\s~]*([\d,.]+)\s*g/i, /fiber[:\s~]*([\d,.]+)\s*g/i]);
  let v = extractVal([/vet(?:ten)?[:\s~]*([\d,.]+)\s*g/i, /fat[:\s~]*([\d,.]+)\s*g/i]);
  let e = extractVal([/eiwit(?:ten)?[:\s~]*([\d,.]+)\s*g/i, /prote[\ïi]ne?[:\s~]*([\d,.]+)\s*g/i, /protein[:\s~]*([\d,.]+)\s*g/i]);

  if (kcal === 0 && kh === 0 && v === 0 && e === 0) {
    alert('Kon geen voedingswaarden herkennen. Probeer een ander formaat.');
    return;
  }

  if (!isPer100 && servingG && servingG !== 100) {
    const factor = 100 / servingG;
    kcal = Math.round(kcal * factor);
    kh = r1(kh * factor);
    vz = r1(vz * factor);
    v = r1(v * factor);
    e = r1(e * factor);
  }

  let suggestedPortion = 100;
  if (servingG) suggestedPortion = servingG;
  else if (yieldCount && yieldCount > 1) suggestedPortion = 150;
  else if (kcal > 0) {
    if (kcal < 100) suggestedPortion = 300;
    else if (kcal < 200) suggestedPortion = 200;
    else if (kcal < 350) suggestedPortion = 150;
  }

  fillCustomFields('', kcal, kh, vz, v, e, suggestedPortion);
  const btn = document.getElementById('custom-parse-btn');
  btn.textContent = '✓ Ingevuld!';
  btn.style.color = 'var(--green)';
  btn.style.borderColor = 'var(--green)';

  setTimeout(() => {
    btn.textContent = '📋 Herken';
    btn.style.color = '';
    btn.style.borderColor = '';
  }, 3000);
}
