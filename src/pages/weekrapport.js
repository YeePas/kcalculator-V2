/* ── Weekrapport Page ─────────────────────────────────────── */

import { localData, currentDate, goals } from '../state.js';
import { dateKey, r1, dayTotals } from '../utils.js';
import { loadDay } from '../supabase/data.js';
import { MEAL_NAMES } from '../constants.js';
import { schijfDagScore, getAdviesTeksten } from './schijf.js';

export async function renderWeekrapport() {
  const body = document.getElementById('advies-body');
  body.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--muted)">Weekrapport genereren...</div>';

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = dateKey(d);
    if (!localData[key]) localData[key] = await loadDay(key);
    days.push({ key, day: localData[key], label: i === 0 ? 'Vandaag' : new Date(d).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric' }) });
  }

  const dagStats = days.map(d => {
    const tot = dayTotals(d.day);
    const schijf = schijfDagScore(d.day);
    return { ...d, tot, schijf };
  });

  const activeDays = dagStats.filter(d => d.tot.cals > 0);
  if (activeDays.length === 0) {
    body.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--muted)">Geen data gevonden voor afgelopen 7 dagen.</div>';
    return;
  }

  const avg = (arr, fn) => arr.reduce((s, x) => s + fn(x), 0) / arr.length;
  const avgKcal = Math.round(avg(activeDays, d => d.tot.cals));
  const avgSchijf = Math.round(avg(activeDays, d => d.schijf.score));
  const avgCarbs = r1(avg(activeDays, d => d.tot.carbs));
  const avgFat = r1(avg(activeDays, d => d.tot.fat));
  const avgProt = r1(avg(activeDays, d => d.tot.prot));
  const avgFiber = r1(avg(activeDays, d => d.tot.fiber));

  const totalMacroG = avgCarbs + avgFat + avgProt;
  const pctCarbs = totalMacroG ? Math.round(avgCarbs / totalMacroG * 100) : 0;
  const pctFat = totalMacroG ? Math.round(avgFat / totalMacroG * 100) : 0;
  const pctProt = 100 - pctCarbs - pctFat;

  const catNames = { groente:'Groente', fruit:'Fruit', volkoren:'Volkoren', zuivel:'Zuivel', eiwit:'Eiwitbronnen', onverzadigd_vet:'Gezonde vetten', beperken:'Beperking ongezond' };
  const avgCatScores = {};
  for (const cat of Object.keys(catNames)) {
    avgCatScores[cat] = Math.round(avg(activeDays, d => d.schijf.scores[cat]) * 100);
  }
  const sortedCats = Object.entries(avgCatScores).sort((a, b) => b[1] - a[1]);
  const beste = sortedCats[0];
  const slechtste = sortedCats[sortedCats.length - 1];

  const sparkDots = dagStats.reverse().map(d => {
    const score = d.tot.cals > 0 ? d.schijf.score : -1;
    const color = score >= 70 ? 'var(--green)' : score >= 40 ? '#e8a020' : score >= 0 ? 'var(--danger)' : 'var(--border)';
    return `<div style="display:flex;flex-direction:column;align-items:center;flex:1;min-width:0">
      <div style="width:24px;height:24px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:0.6rem;color:white;font-weight:600">${score >= 0 ? score : ''}</div>
      <div style="font-size:0.6rem;color:var(--tertiary);margin-top:0.15rem">${d.label.substring(0, 2)}</div>
    </div>`;
  }).join('');

  const afwijkingen = [];
  if (goals.kcal && Math.abs(avgKcal - goals.kcal) > 200) {
    afwijkingen.push(avgKcal > goals.kcal
      ? `Gemiddeld ${avgKcal - goals.kcal} kcal boven je doel`
      : `Gemiddeld ${goals.kcal - avgKcal} kcal onder je doel`);
  }
  if (goals.prot && avgProt < goals.prot * 0.8) {
    afwijkingen.push(`Eiwitinname (${avgProt}g) is lager dan je doel (${goals.prot}g)`);
  }
  if (goals.fiber && avgFiber < goals.fiber * 0.8) {
    afwijkingen.push(`Vezelinname (${avgFiber}g) is lager dan je doel (${goals.fiber}g)`);
  }

  const verbeterpunten = [];
  if (slechtste[1] < 50) verbeterpunten.push(`Focus op meer <strong>${catNames[slechtste[0]]}</strong> — dit is je zwakste categorie (${slechtste[1]}%).`);
  const lastDayTips = getAdviesTeksten(dagStats[dagStats.length - 1].schijf, dagStats[dagStats.length - 1].tot);
  verbeterpunten.push(...lastDayTips);
  const verbeterHtml = verbeterpunten.slice(0, 3).map(v => '<div style="font-size:0.8rem;margin-bottom:0.3rem">→ ' + v + '</div>').join('');

  const schijfColor = avgSchijf >= 70 ? 'var(--green)' : avgSchijf >= 40 ? '#e8a020' : 'var(--danger)';

  body.innerHTML = `
    <div style="text-align:center;margin-bottom:1rem">
      <div style="font-size:0.75rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em">Weekrapport</div>
      <div style="font-size:0.7rem;color:var(--tertiary)">${activeDays.length} dagen met data</div>
    </div>

    <div style="display:flex;gap:0.5rem;margin-bottom:1rem">
      <div style="flex:1;text-align:center;padding:0.7rem;background:var(--bg);border-radius:10px;border:1px solid var(--border)">
        <div style="font-size:1.6rem;font-weight:700;font-family:var(--font-display);color:${schijfColor}">${avgSchijf}%</div>
        <div style="font-size:0.65rem;color:var(--muted)">Schijf van 5</div>
      </div>
      <div style="flex:1;text-align:center;padding:0.7rem;background:var(--bg);border-radius:10px;border:1px solid var(--border)">
        <div style="font-size:1.6rem;font-weight:700;font-family:var(--font-display)">${avgKcal}</div>
        <div style="font-size:0.65rem;color:var(--muted)">gem. kcal/dag</div>
      </div>
    </div>

    <div style="display:flex;gap:0.3rem;margin-bottom:1rem;padding:0.5rem;background:var(--bg);border-radius:8px;border:1px solid var(--border)">${sparkDots}</div>

    <div style="margin-bottom:1rem;padding:0.8rem;background:var(--bg);border-radius:10px;border:1px solid var(--border)">
      <div style="font-weight:500;font-size:0.82rem;margin-bottom:0.5rem">Macroverdeling (gemiddeld)</div>
      <div style="display:flex;height:16px;border-radius:8px;overflow:hidden;margin-bottom:0.4rem">
        <div style="width:${pctCarbs}%;background:var(--carb-color, #4a90d9)"></div>
        <div style="width:${pctFat}%;background:var(--fat-color, #e8a020)"></div>
        <div style="width:${pctProt}%;background:var(--prot-color, #50b060)"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:0.72rem;color:var(--muted)">
        <span>🟦 Koolh ${pctCarbs}% (${avgCarbs}g)</span>
        <span>🟨 Vet ${pctFat}% (${avgFat}g)</span>
        <span>🟩 Eiwit ${pctProt}% (${avgProt}g)</span>
      </div>
    </div>

    <div style="display:flex;gap:0.5rem;margin-bottom:1rem">
      <div style="flex:1;padding:0.6rem;background:var(--bg);border-radius:10px;border:1px solid var(--border)">
        <div style="font-size:0.7rem;color:var(--green)">✓ Beste categorie</div>
        <div style="font-size:0.88rem;font-weight:500">${catNames[beste[0]]}</div>
        <div style="font-size:0.7rem;color:var(--muted)">${beste[1]}% score</div>
      </div>
      <div style="flex:1;padding:0.6rem;background:var(--bg);border-radius:10px;border:1px solid var(--border)">
        <div style="font-size:0.7rem;color:var(--danger)">⚠ Aandachtspunt</div>
        <div style="font-size:0.88rem;font-weight:500">${catNames[slechtste[0]]}</div>
        <div style="font-size:0.7rem;color:var(--muted)">${slechtste[1]}% score</div>
      </div>
    </div>

    ${afwijkingen.length ? '<div style="margin-bottom:0.8rem;font-size:0.78rem;color:var(--muted)">' + afwijkingen.map(a => '📌 ' + a).join('<br>') + '</div>' : ''}

    <div style="padding:0.8rem;background:var(--bg);border-radius:10px;border:1px solid var(--border)">
      <div style="font-weight:500;font-size:0.82rem;margin-bottom:0.4rem">💡 Verbeterpunten</div>
      ${verbeterHtml || '<div style="font-size:0.8rem;color:var(--muted)">Goed bezig! Blijf variëren.</div>'}
    </div>
  `;
}
