/* ── Schijf van Vijf highlights on the main page ──────────── */

// Loaded on demand: the Schijf analysis pulls in the product matcher and micronutrients
export async function renderSchijfMini(day) {
  const card = document.getElementById('schijf-mini');
  if (!card) return;
  const { schijfDaySnapshot, prewarmSchijfWeek } = await import('../pages/schijf-2026.js');
  const snap = schijfDaySnapshot(day);
  // The same pie as on the Schijf page: one slice per part, grouped per box
  document.getElementById('schijf-mini-groups').innerHTML = snap.visual;
  document.getElementById('schijf-mini-next').textContent = snap.hasItems
    ? (snap.next ? `Volgende stap: ${snap.next}` : 'Alle vakken van vandaag zijn goed gevuld.')
    : 'Voeg iets toe om je Schijf van vandaag te zien.';
  prewarmSchijfWeek();
}
