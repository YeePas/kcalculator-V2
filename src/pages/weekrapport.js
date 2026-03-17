/* ── Weekrapport Page ─────────────────────────────────────── */

import { localData, currentDate, goals } from '../state.js';
import { dateKey, r1, dayTotals } from '../utils.js';
import { loadDay } from '../supabase/data.js';
import { MEAL_NAMES } from '../constants.js';
import { schijfDagScore, getAdviesTeksten, SCHIJF_CATEGORY_META } from './schijf.js';

export async function generateWeekrapportHTML() {
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
    return '<div style="text-align:center;padding:2rem;color:var(--muted)">Geen data gevonden voor afgelopen 7 dagen.</div>';
  }

  const avg = (arr, fn) => arr.reduce((s, x) => s + fn(x), 0) / arr.length;
  const avgKcal = Math.round(avg(activeDays, d => d.tot.cals));
  const avgSchijf = Math.round(avg(activeDays, d => d.schijf.score));
  const avgCoverage = Math.round(avg(activeDays, d => d.schijf.confidencePct));
  const avgCoveredBlocks = r1(avg(activeDays, d => d.schijf.coveredCount));
  const avgCarbs = r1(avg(activeDays, d => d.tot.carbs));
  const avgFat = r1(avg(activeDays, d => d.tot.fat));
  const avgProt = r1(avg(activeDays, d => d.tot.prot));
  const avgFiber = r1(avg(activeDays, d => d.tot.fiber));

  const totalMacroG = avgCarbs + avgFat + avgProt;
  const pctCarbs = totalMacroG ? Math.round(avgCarbs / totalMacroG * 100) : 0;
  const pctFat = totalMacroG ? Math.round(avgFat / totalMacroG * 100) : 0;
  const pctProt = 100 - pctCarbs - pctFat;

  const catNames = Object.fromEntries(Object.entries(SCHIJF_CATEGORY_META).map(([key, meta]) => [key, meta.naam]));
  const avgCatScores = {};
  for (const cat of Object.keys(catNames)) {
    avgCatScores[cat] = Math.round(avg(activeDays, d => d.schijf.scores[cat]) * 100);
  }
  const sortedCats = Object.entries(avgCatScores).sort((a, b) => b[1] - a[1]);
  const beste = sortedCats[0];
  const slechtste = sortedCats[sortedCats.length - 1];

  const sparkDots = dagStats.reverse().map(d => {
    const score = d.tot.cals > 0 ? d.schijf.score : -1;
    const color = score >= 70 ? '#1db954' : score >= 40 ? '#e8a020' : score >= 0 ? '#d44040' : '#ccc';
    return `<div style="display:flex;flex-direction:column;align-items:center;flex:1;min-width:0">
      <div style="width:24px;height:24px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:0.6rem;color:white;font-weight:600">${score >= 0 ? score : ''}</div>
      <div style="font-size:0.6rem;color:#999;margin-top:0.15rem">${d.label.substring(0, 2)}</div>
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
  const verbeterHtml = verbeterpunten.slice(0, 3).map(v => '<div style="font-size:0.8rem;margin-bottom:0.3rem">&rarr; ' + v + '</div>').join('');

  const schijfColor = avgSchijf >= 70 ? '#1db954' : avgSchijf >= 40 ? '#e8a020' : '#d44040';

  return `
    <div style="text-align:center;margin-bottom:1rem">
      <div style="font-size:0.75rem;color:var(--muted,#999);text-transform:uppercase;letter-spacing:0.05em">Weekrapport</div>
      <div style="font-size:0.7rem;color:var(--tertiary,#aaa)">${activeDays.length} dagen met data</div>
    </div>

    <div style="display:flex;gap:0.5rem;margin-bottom:1rem">
      <div style="flex:1;text-align:center;padding:0.7rem;background:var(--bg,#fafafa);border-radius:10px;border:1px solid var(--border,#e0e0e0)">
        <div style="font-size:1.6rem;font-weight:700;font-family:var(--font-display,serif);color:${schijfColor}">${avgSchijf}%</div>
        <div style="font-size:0.65rem;color:var(--muted,#999)">Schijf-check</div>
      </div>
      <div style="flex:1;text-align:center;padding:0.7rem;background:var(--bg,#fafafa);border-radius:10px;border:1px solid var(--border,#e0e0e0)">
        <div style="font-size:1.6rem;font-weight:700;font-family:var(--font-display,serif)">${avgKcal}</div>
        <div style="font-size:0.65rem;color:var(--muted,#999)">gem. kcal/dag</div>
      </div>
    </div>

    <div style="display:flex;gap:0.5rem;margin-bottom:1rem">
      <div style="flex:1;text-align:center;padding:0.7rem;background:var(--bg,#fafafa);border-radius:10px;border:1px solid var(--border,#e0e0e0)">
        <div style="font-size:1.35rem;font-weight:700;font-family:var(--font-display,serif);color:${avgCoverage >= 70 ? '#1db954' : avgCoverage >= 45 ? '#e8a020' : '#d44040'}">${avgCoverage}%</div>
        <div style="font-size:0.65rem;color:var(--muted,#999)">analyse-dekking</div>
      </div>
      <div style="flex:1;text-align:center;padding:0.7rem;background:var(--bg,#fafafa);border-radius:10px;border:1px solid var(--border,#e0e0e0)">
        <div style="font-size:1.35rem;font-weight:700;font-family:var(--font-display,serif)">${avgCoveredBlocks}/6</div>
        <div style="font-size:0.65rem;color:var(--muted,#999)">bouwstenen geraakt</div>
      </div>
    </div>

    <div style="display:flex;gap:0.3rem;margin-bottom:1rem;padding:0.5rem;background:var(--bg,#fafafa);border-radius:8px;border:1px solid var(--border,#e0e0e0)">${sparkDots}</div>

    <div style="margin-bottom:1rem;padding:0.8rem;background:var(--bg,#fafafa);border-radius:10px;border:1px solid var(--border,#e0e0e0)">
      <div style="font-weight:500;font-size:0.82rem;margin-bottom:0.5rem">Macroverdeling (gemiddeld)</div>
      <div style="display:flex;height:16px;border-radius:8px;overflow:hidden;margin-bottom:0.4rem">
        <div style="width:${pctCarbs}%;background:#4a90d9"></div>
        <div style="width:${pctFat}%;background:#e8a020"></div>
        <div style="width:${pctProt}%;background:#50b060"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:0.72rem;color:var(--muted,#999)">
        <span>Koolh ${pctCarbs}% (${avgCarbs}g)</span>
        <span>Vet ${pctFat}% (${avgFat}g)</span>
        <span>Eiwit ${pctProt}% (${avgProt}g)</span>
      </div>
    </div>

    <div style="display:flex;gap:0.5rem;margin-bottom:1rem">
      <div style="flex:1;padding:0.6rem;background:var(--bg,#fafafa);border-radius:10px;border:1px solid var(--border,#e0e0e0)">
        <div style="font-size:0.7rem;color:#1db954">Beste categorie</div>
        <div style="font-size:0.88rem;font-weight:500">${catNames[beste[0]]}</div>
        <div style="font-size:0.7rem;color:var(--muted,#999)">${beste[1]}% score</div>
      </div>
      <div style="flex:1;padding:0.6rem;background:var(--bg,#fafafa);border-radius:10px;border:1px solid var(--border,#e0e0e0)">
        <div style="font-size:0.7rem;color:#d44040">Aandachtspunt</div>
        <div style="font-size:0.88rem;font-weight:500">${catNames[slechtste[0]]}</div>
        <div style="font-size:0.7rem;color:var(--muted,#999)">${slechtste[1]}% score</div>
      </div>
    </div>

    ${afwijkingen.length ? '<div style="margin-bottom:0.8rem;font-size:0.78rem;color:var(--muted,#999)">' + afwijkingen.map(a => a).join('<br>') + '</div>' : ''}

    <div style="padding:0.8rem;background:var(--bg,#fafafa);border-radius:10px;border:1px solid var(--border,#e0e0e0)">
      <div style="font-weight:500;font-size:0.82rem;margin-bottom:0.4rem">Verbeterpunten</div>
      ${verbeterHtml || '<div style="font-size:0.8rem;color:var(--muted,#999)">Goed bezig! Blijf vari\u00ebren.</div>'}
    </div>
  `;
}

export async function renderWeekrapport() {
  const body = document.getElementById('advies-body');
  body.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--muted)">Weekrapport genereren...</div>';
  body.innerHTML = await generateWeekrapportHTML();
}
