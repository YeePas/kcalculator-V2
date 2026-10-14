/* ── Schijf van Vijf highlights on the main page ──────────── */

import { esc } from '../utils.js';

// Loaded on demand: the Schijf analysis pulls in the product matcher and micronutrients
export async function renderSchijfMini(day) {
  const card = document.getElementById('schijf-mini');
  if (!card) return;
  const { schijfDaySnapshot } = await import('../pages/schijf-2026.js');
  const snap = schijfDaySnapshot(day);
  const scoreEl = document.getElementById('schijf-mini-score');
  scoreEl.textContent = snap.hasItems ? `${snap.score}%` : '–';
  scoreEl.dataset.tone = !snap.hasItems ? '' : snap.score >= 70 ? 'ok' : snap.score >= 40 ? 'warn' : 'bad';
  document.getElementById('schijf-mini-groups').innerHTML = snap.groups.map(group => `
    <div class="schijf-mini-group${group.above ? ' is-over' : ''}" title="${esc(group.naam)}${group.above ? ' (boven advies)' : ''}">
      <span class="schijf-mini-icon">${esc(group.icon)}</span>
      <span class="schijf-mini-name">${esc(group.naam)}</span>
      <span class="schijf-mini-track"><span style="width:${group.pct}%;background:${group.color}"></span></span>
      <span class="schijf-mini-pct">${group.pct}%</span>
    </div>`).join('');
  document.getElementById('schijf-mini-next').textContent = snap.hasItems
    ? (snap.next ? `Volgende stap: ${snap.next}` : 'Alle vakken van vandaag zijn goed gevuld.')
    : 'Voeg iets toe om je Schijf van vandaag te zien.';
}
