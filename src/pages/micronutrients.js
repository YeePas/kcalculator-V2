/* ── Micronutrient Dashboard (AI-estimated) ──────────────── */

import { localData, currentDate, goals, cfg } from '../state.js';
import { MEAL_NAMES, MEAL_LABELS } from '../constants.js';
import { emptyDay, dayTotals } from '../utils.js';
import { aiCall, hasAiAvailable } from '../ai/providers.js';

const RDA = {
  vitamine_d_ug: { naam: 'Vitamine D', doel: 10, unit: '\u00b5g' },
  ijzer_mg: { naam: 'IJzer', doel: 13, unit: 'mg' },
  calcium_mg: { naam: 'Calcium', doel: 950, unit: 'mg' },
  vitamine_b12_ug: { naam: 'Vitamine B12', doel: 2.8, unit: '\u00b5g' },
  vitamine_c_mg: { naam: 'Vitamine C', doel: 75, unit: 'mg' },
  zink_mg: { naam: 'Zink', doel: 9, unit: 'mg' },
  magnesium_mg: { naam: 'Magnesium', doel: 350, unit: 'mg' },
  foliumzuur_ug: { naam: 'Foliumzuur', doel: 300, unit: '\u00b5g' },
};

const CACHE_PREFIX = 'kcalc_micro_';

function getCached(dateStr) {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + dateStr);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function setCache(dateStr, data) {
  try { sessionStorage.setItem(CACHE_PREFIX + dateStr, JSON.stringify(data)); } catch {}
}

export async function getMicroAdvies() {
  const body = document.getElementById('advies-body');
  if (!body) return;

  if (!hasAiAvailable()) throw new Error('AI niet beschikbaar');

  const day = localData[currentDate] || emptyDay();
  const tot = dayTotals(day);
  const allItems = MEAL_NAMES.flatMap(m => (day[m] || []).map(i => ({ ...i, maaltijd: m })));

  if (!allItems.length) {
    body.innerHTML = '<div class="advies-content"><p style="color:var(--muted);font-style:italic">Nog geen items vandaag \u2014 voeg eerst wat toe.</p></div>';
    return;
  }

  // Check cache
  const cached = getCached(currentDate);
  if (cached) {
    renderMicroDashboard(body, cached);
    return;
  }

  body.innerHTML = '<div class="advies-loading"><span class="spin">\u23f3</span> Micronutri\u00ebnten schatten\u2026</div>';

  const itemList = allItems.map(i =>
    `${i.naam}${i.portie ? ' (' + i.portie + ')' : ''}`
  ).join('\n');

  const provider = cfg.adviesProvider || cfg.provider || 'claude';
  const origModel = cfg.model;
  if (cfg.adviesModel) cfg.model = cfg.adviesModel;

  try {
    const text = await aiCall(provider, null, `Schat de totale micronutri\u00ebnten voor deze voedingsmiddelen die vandaag gegeten zijn.

Gegeten:
${itemList}

Schat per micronutri\u00ebnt het TOTAAL voor de hele dag en antwoord ALLEEN met valide JSON (geen extra tekst):
{"vitamine_d_ug":X,"ijzer_mg":X,"calcium_mg":X,"vitamine_b12_ug":X,"vitamine_c_mg":X,"zink_mg":X,"magnesium_mg":X,"foliumzuur_ug":X}

Gebruik realistische waarden gebaseerd op bekende voedingswaarden van deze producten. Geef getallen, geen ranges.`, 500, false);

    const data = parseAiMicroResponse(text);
    if (!data) throw new Error('Kon geen micronutri\u00ebnten uit AI-antwoord halen');
    setCache(currentDate, data);
    renderMicroDashboard(body, data);
  } finally {
    cfg.model = origModel;
  }
}

function parseAiMicroResponse(text) {
  try {
    // Try extracting JSON from response
    const jsonMatch = text.match(/\{[^{}]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    // Validate structure
    const result = {};
    for (const key of Object.keys(RDA)) {
      const val = Number(parsed[key]);
      result[key] = Number.isFinite(val) && val >= 0 ? Math.round(val * 10) / 10 : 0;
    }
    return result;
  } catch {
    return null;
  }
}

function renderMicroDashboard(container, data) {
  let html = '<div class="advies-content">';
  html += '<div style="display:grid;gap:0.6rem">';

  for (const [key, meta] of Object.entries(RDA)) {
    const val = data[key] || 0;
    const pct = Math.min(Math.round((val / meta.doel) * 100), 200);
    const barPct = Math.min(pct, 100);
    const color = pct >= 80 ? 'var(--green)' : pct >= 40 ? 'var(--warning, #e6b94f)' : 'var(--danger)';

    html += `<div style="display:flex;align-items:center;gap:0.6rem">
      <div style="width:90px;font-size:0.78rem;font-weight:500;flex-shrink:0">${meta.naam}</div>
      <div style="flex:1;height:14px;background:var(--border);border-radius:7px;overflow:hidden;position:relative">
        <div style="height:100%;width:${barPct}%;background:${color};border-radius:7px;transition:width 0.3s"></div>
      </div>
      <div style="width:80px;text-align:right;font-size:0.72rem;color:var(--muted);flex-shrink:0">${val}${meta.unit} / ${meta.doel}${meta.unit}</div>
      <div style="width:36px;text-align:right;font-size:0.72rem;font-weight:600;color:${color};flex-shrink:0">${pct}%</div>
    </div>`;
  }

  html += '</div>';
  html += '<div style="margin-top:1rem;padding:0.6rem;background:var(--bg);border-radius:8px;border:1px solid var(--border);font-size:0.72rem;color:var(--muted)">AI-schatting op basis van voedingsmiddelen \u2014 geen medisch advies. Werkelijke waarden kunnen afwijken.</div>';
  html += '</div>';
  container.innerHTML = html;
}
