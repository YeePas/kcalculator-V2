/* ── Data Export (CSV + Print) ────────────────────────────── */

import { localData, goals } from '../state.js';
import { MEAL_NAMES, MEAL_LABELS } from '../constants.js';
import { dateKey, dayTotals, r1 } from '../utils.js';
import { loadDay } from '../supabase/data.js';
import { generateWeekrapportHTML } from './weekrapport.js';

export async function exportPeriodCSV(numDays) {
  const rows = [['Datum', 'Maaltijd', 'Product', 'Portie', 'Kcal', 'Koolhydraten_g', 'Vezels_g', 'Vetten_g', 'Eiwitten_g'].join(';')];

  for (let i = numDays - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = dateKey(d);
    if (!localData[key]) localData[key] = await loadDay(key);
    const day = localData[key];
    if (!day) continue;

    for (const meal of MEAL_NAMES) {
      for (const item of (day[meal] || [])) {
        const csvVal = v => String(v ?? '').replace(/;/g, ',').replace(/"/g, '""');
        rows.push([
          key,
          csvVal(MEAL_LABELS[meal] || meal),
          csvVal(item.naam),
          csvVal(item.portie || ''),
          Math.round(item.kcal || 0),
          r1(item.koolhydraten_g || 0),
          r1(item.vezels_g || 0),
          r1(item.vetten_g || 0),
          r1(item.eiwitten_g || 0),
        ].join(';'));
      }
    }
  }

  const periodLabel = numDays <= 7 ? 'week' : numDays <= 31 ? 'maand' : 'jaar';
  const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kcalculator-${periodLabel}-${dateKey(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportWeekrapportPrint() {
  const html = await generateWeekrapportHTML();
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  printWindow.document.write(`<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8">
<title>Kcalculator Weekrapport</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 2rem; color: #101914; max-width: 700px; margin: 0 auto; }
  @media print {
    body { padding: 1rem; }
    @page { margin: 1.5cm; }
  }
</style>
</head>
<body>
<h1 style="font-size:1.2rem;margin-bottom:1.5rem;text-align:center">Kcalculator Weekrapport</h1>
${html}
<div style="text-align:center;margin-top:2rem;font-size:0.7rem;color:#999">Gegenereerd op ${new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} — kcalculator.eu</div>
</body>
</html>`);
  printWindow.document.close();
  setTimeout(() => printWindow.print(), 500);
}
