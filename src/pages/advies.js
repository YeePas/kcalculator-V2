/* ── Advies Page (Schijf van 5, Micro, AI avondeten) ──────── */

import {
  localData, currentDate, goals, cfg,
  activeAdviesTab, setActiveAdviesTab,
} from '../state.js';
import { MEAL_NAMES, MEAL_LABELS, AI_MODEL_OPTIONS, DEFAULT_PROVIDER_MODELS } from '../constants.js';
import { emptyDay, r1, dayTotals, esc } from '../utils.js';
import { saveCfg } from '../storage.js';
import { aiCall, hasAiAvailable, hasAiProxyConfig, hasLocalSessionAi } from '../ai/providers.js';
import { schijfDagScore, SCHIJF_CATEGORY_META } from './schijf.js';
import { renderSchijf2026Analyse } from './schijf-2026.js';
import { renderMicroAnalyse } from './micronutrients.js';
import { switchMobileView } from '../ui/misc.js';

const LOCAL_ADVIES_TABS = new Set(['schijf', 'micro']);
const AI_ADVIES_TABS = new Set(['avond']);

function getSafeAdviesTab(tab) {
  if (tab === 'schijf2026' || tab === 'dag' || tab === 'week') return 'schijf'; // removed tabs
  return LOCAL_ADVIES_TABS.has(tab) || AI_ADVIES_TABS.has(tab) ? tab : 'schijf';
}

export function openAdviesModal() {
  setActiveAdviesTab(getSafeAdviesTab(activeAdviesTab));
  updateAdviesModelSelect();
  const layout = document.querySelector('.layout');
  if (!layout) return;
  layout.classList.remove('show-data', 'show-import', 'show-admin');
  if (window.innerWidth >= 781) {
    layout.classList.add('show-advies');
  } else {
    switchMobileView('advies');
    document.querySelectorAll('.mobile-tab').forEach((t, i) => t.classList.toggle('active', i === 3));
  }
  showAdviesContent();
}

export function closeAdviesPage() {
  const layout = document.querySelector('.layout');
  if (!layout) return;
  layout.classList.remove('show-advies');
  if (window.innerWidth < 781) {
    switchMobileView('invoer');
    document.querySelectorAll('.mobile-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
  }
}

export function showAdviesContent() {
  const safeTab = getSafeAdviesTab(activeAdviesTab);
  if (safeTab !== activeAdviesTab) setActiveAdviesTab(safeTab);
  // Model choice and refresh only matter for the AI tab
  const toolbar = document.querySelector('.advies-page-toolbar');
  if (toolbar) toolbar.hidden = !AI_ADVIES_TABS.has(safeTab);

  if (LOCAL_ADVIES_TABS.has(safeTab)) {
    if (safeTab === 'micro') renderMicroAnalyse();
    else renderSchijf2026Analyse();
  } else {
    showAdviesPrompt();
  }
}

function showAdviesPrompt() {
  const tabLabels = { avond: '🍽️ Avondeten-suggestie' };
  document.getElementById('advies-body').innerHTML = `
    <div style="text-align:center;padding:2rem 1rem">
      <div style="font-size:2rem;margin-bottom:0.5rem">💡</div>
      <p style="color:var(--muted);margin-bottom:1rem;font-size:0.88rem">${tabLabels[activeAdviesTab] || 'Advies'} — klik op Genereren om een AI-analyse te starten.</p>
      <button class="btn-primary" data-action="run-advies" data-tab="${esc(activeAdviesTab)}" style="max-width:200px">🔍 Genereren</button>
    </div>`;
}

export function updateAdviesModelSelect() {
  const sel = document.getElementById('advies-model-select');
  if (!sel) return;
  const opts = AI_MODEL_OPTIONS;
  const available = opts.filter(o => {
    if (hasAiProxyConfig()) return true;
    return hasLocalSessionAi('gemini') && o.value.startsWith('gemini|');
  });
  sel.innerHTML = available.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
  const saved = cfg.adviesProvider && cfg.adviesModel ? cfg.adviesProvider + '|' + cfg.adviesModel : null;
  if (saved && available.some(o => o.value === saved)) sel.value = saved;
  else {
    const def = (cfg.provider || 'claude') + '|' + (cfg.model || DEFAULT_PROVIDER_MODELS.claude);
    if (available.some(o => o.value === def)) sel.value = def;
    else if (available[0]) sel.value = available[0].value;
  }
  _syncAdviesModel();
}

function _syncAdviesModel() {
  const sel = document.getElementById('advies-model-select');
  if (!sel || !sel.value) return;
  const [prov, model] = sel.value.split('|');
  cfg.adviesProvider = prov;
  cfg.adviesModel = model;
}

const ALLOWED_ADVIES_TAGS = new Set(['h4', 'h3', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'br', 'hr']);

/** Convert markdown to basic HTML before sanitizing */
function markdownToHtml(text) {
  if (!text) return '';
  // If already contains HTML block tags, assume it's HTML
  if (/<(h[34]|ul|ol|p)\b/i.test(text)) return text;
  let html = text;
  // Headers: ### or #### → h4
  html = html.replace(/^#{3,4}\s+(.+)$/gm, '<h4>$1</h4>');
  // Bold: **text** → <strong>
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic: *text* → <em>
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  // Unordered list items: - item or * item
  html = html.replace(/^[\-\*]\s+(.+)$/gm, '<li>$1</li>');
  // Numbered list items: 1. item
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');
  // Wrap consecutive <li> in <ul>
  html = html.replace(/((?:<li>.*?<\/li>\n?)+)/g, '<ul>$1</ul>');
  // Paragraphs: wrap remaining non-tag lines
  html = html.replace(/^(?!<[hupol])((?!<).+)$/gm, '<p>$1</p>');
  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');
  return html;
}

function sanitizeAdviesHTML(unsafeHtml) {
  const converted = markdownToHtml(unsafeHtml);
  const template = document.createElement('template');
  template.innerHTML = String(converted || '');

  const sanitizeNode = (node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = node.tagName.toLowerCase();
      if (!ALLOWED_ADVIES_TAGS.has(tag)) {
        node.replaceWith(document.createTextNode(node.textContent || ''));
        return;
      }
      Array.from(node.attributes).forEach(attr => node.removeAttribute(attr.name));
    }
    Array.from(node.childNodes).forEach(sanitizeNode);
  };

  Array.from(template.content.childNodes).forEach(sanitizeNode);
  return template.innerHTML;
}

export async function runAdvies(tab) {
  const safeTab = getSafeAdviesTab(tab);
  setActiveAdviesTab(safeTab);
  document.querySelectorAll('.advies-page-tabs .advies-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === safeTab));
  if (LOCAL_ADVIES_TABS.has(safeTab)) {
    showAdviesContent();
    return;
  }
  document.getElementById('advies-body').innerHTML = '<div class="advies-loading"><span class="spin">⏳</span> Genereren…</div>';
  try {
    await getAvondAdvies();
  } catch (e) {
    const body = document.getElementById('advies-body');
    if (!body) return;
    body.innerHTML = '';
    const p = document.createElement('p');
    p.style.color = 'var(--danger)';
    p.textContent = 'Fout: ' + (e?.message || 'Onbekende fout');
    body.appendChild(p);
  }
}

const ADVIES_SYSTEM = `Je bent een deskundige, enthousiaste Nederlandse voedingscoach gespecialiseerd in de Schijf van Vijf.
Je schrijft uitgebreide, gedetailleerde analyses. Elk onderdeel bevat minstens 3-4 alinea's.
Je noemt ALTIJD specifieke producten bij naam en geeft concrete hoeveelheden.
Je analyseert zowel macronutriënten als voedingskwaliteit (Schijf van Vijf).
Schrijf in HTML met <h4>, <p>, <ul>/<li>, <strong>, <em> tags. Geen markdown.
Wees datagedreven: noem getallen, percentages en vergelijk met doelen.`;

async function claudeCall(prompt, maxTokens = 3000) {
  const provider = cfg.adviesProvider || cfg.provider || 'claude';
  const origModel = cfg.model;
  if (cfg.adviesModel) cfg.model = cfg.adviesModel;
  try {
    const text = await aiCall(provider, ADVIES_SYSTEM, prompt, maxTokens, false);
    return { ok: true, json: async () => ({ content: [{ text }] }) };
  } finally {
    cfg.model = origModel;
  }
}

function setAdviesHTML(html) {
  document.getElementById('advies-body').innerHTML = `<div class="advies-content">${sanitizeAdviesHTML(html)}</div>`;
}

function buildSchijfContext(day) {
  const s = schijfDagScore(day);
  const catLines = Object.entries(SCHIJF_CATEGORY_META).map(([key, meta]) => {
    const pct = Math.round((s.scores[key] || 0) * 100);
    const gram = Math.round(s.totalen[key] || 0);
    return `  ${meta.naam}: ${gram}g / ${meta.doel}g (${pct}%)`;
  }).join('\n');
  const missing = Object.entries(SCHIJF_CATEGORY_META)
    .filter(([key]) => (s.scores[key] || 0) < 0.6)
    .map(([, meta]) => meta.naam);
  const outsideNames = s.outsideItems.slice(0, 5).map(i => i.naam).join(', ');
  return {
    result: s,
    text: `Schijf van Vijf score: ${s.score}% (${s.coveredCount}/6 categorieën voldoende)
Analyse-dekking: ${s.confidencePct}% van calorieën geanalyseerd
Buiten-Schijf: ${Math.round(s.totalCalories ? s.outsideCalories / s.totalCalories * 100 : 0)}% van calorieën
Categorieën:
${catLines}
Ontbrekend (< 60%): ${missing.length ? missing.join(', ') : 'geen'}${outsideNames ? '\nBuiten-Schijf producten: ' + outsideNames : ''}`,
    missing,
  };
}

async function getAvondAdvies() {
  if (!hasAiAvailable()) throw new Error('AI niet beschikbaar');
  const day = localData[currentDate] || emptyDay();
  const tot = dayTotals(day);
  const rKcal = Math.max(0, (goals.kcal || 2000) - tot.cals);
  const rCarbs = Math.max(0, (goals.carbs || 250) - tot.carbs);
  const rFat = Math.max(0, (goals.fat || 70) - tot.fat);
  const rProt = Math.max(0, (goals.prot || 80) - tot.prot);
  const rFiber = Math.max(0, (goals.fiber || 30) - tot.fiber);

  document.getElementById('advies-body').innerHTML = `
    <div class="advies-macro-bar">
      <div class="advies-macro-item"><span class="advies-macro-val" style="color:var(--accent)">${rKcal}</span><span class="advies-macro-lbl">kcal over</span></div>
      <div class="advies-macro-item"><span class="advies-macro-val" style="color:var(--blue)">${r1(rCarbs)}g</span><span class="advies-macro-lbl">koolh. over</span></div>
      <div class="advies-macro-item"><span class="advies-macro-val" style="color:var(--danger)">${r1(rFat)}g</span><span class="advies-macro-lbl">vet over</span></div>
      <div class="advies-macro-item"><span class="advies-macro-val" style="color:var(--green)">${r1(rProt)}g</span><span class="advies-macro-lbl">eiwit over</span></div>
      <div class="advies-macro-item"><span class="advies-macro-val" style="color:var(--fiber)">${r1(rFiber)}g</span><span class="advies-macro-lbl">vezel over</span></div>
    </div>
    <div class="advies-loading"><span class="spin">⏳</span> Advies genereren…</div>`;

  const gegeten = MEAL_NAMES.filter(m => m !== 'avondeten' && m !== 'drinken').map(m => {
    const items = (day[m] || []);
    return items.length ? `${MEAL_LABELS[m]}: ${items.map(i => i.naam + (i.portie ? ' (' + i.portie + ')' : '')).join(', ')}` : null;
  }).filter(Boolean).join('\n');

  const schijf = buildSchijfContext(day);

  const alleItemsLijst = MEAL_NAMES.filter(m => m !== 'avondeten' && m !== 'drinken').flatMap(m =>
    (day[m] || []).map(i => `  - ${i.naam}${i.portie ? ' (' + i.portie + ')' : ''}: ${i.kcal} kcal, ${i.koolhydraten_g}g kh, ${i.vetten_g}g vet, ${i.eiwitten_g}g eiwit, ${i.vezels_g || 0}g vezel`)
  ).join('\n');

  const r = await claudeCall(`CONTEXT — Voedingsdata van vandaag:

Gegeten vandaag (per item):
${alleItemsLijst || '(Nog niets ingevoerd)'}

Samenvatting gegeten: ${gegeten || 'Nog niets'}

Macro-totalen tot nu toe: ${Math.round(tot.cals)} kcal | ${r1(tot.carbs)}g koolhydraten | ${r1(tot.fat)}g vet | ${r1(tot.prot)}g eiwit | ${r1(tot.fiber)}g vezels
Dagdoelen: ${goals.kcal} kcal | ${goals.carbs}g koolhydraten | ${goals.fat}g vet | ${goals.prot}g eiwit | ${goals.fiber}g vezels
Nog over voor avondeten: ${rKcal} kcal | ${r1(rCarbs)}g koolhydraten | ${r1(rFat)}g vet | ${r1(rProt)}g eiwit | ${r1(rFiber)}g vezels

VOEDINGSKWALITEIT (Schijf van Vijf):
${schijf.text}

OPDRACHT:
Geef 2-3 concrete, gedetailleerde Nederlandse avondmaaltijden die:
1. Precies passen bij de resterende macro's (${rKcal} kcal, ${r1(rProt)}g eiwit, ${r1(rFiber)}g vezel over)
2. ${schijf.missing.length ? 'De ontbrekende Schijf van Vijf categorieën aanvullen: ' + schijf.missing.join(', ') : 'De goede Schijf van Vijf score behouden'}
3. Rekening houden met wat al gegeten is (niet herhalen)

Schrijf per gerecht:
<h4>[Gerechtnaam + emoji]</h4>
<p>Korte beschrijving waarom dit gerecht goed past bij de resterende macro's en Schijf-gaten.</p>
<p><strong>Ingrediënten:</strong></p>
<ul><li>ingredient + hoeveelheid in grammen</li>... (minimaal 5 ingrediënten)</ul>
<p><strong>Bereiding:</strong></p>
<ol><li>stap</li>... (3-5 stappen)</ol>
<p><strong>Voedingswaarden:</strong> ~X kcal | Xg eiwit | Xg koolhydraten | Xg vet | Xg vezels</p>
<p><strong>Schijf van Vijf:</strong> dekt categorieën X, Y, Z</p>

Eindig met een korte <h4>💡 Tip</h4> over welke optie het beste aansluit bij de dag.
Schrijf UITGEBREID — minimaal 400 woorden totaal.`, 3500);

  if (!r.ok) throw new Error('API fout');
  const res = await r.json();
  const macroBar = document.getElementById('advies-body').querySelector('.advies-macro-bar').outerHTML;
  document.getElementById('advies-body').innerHTML = macroBar + `<div class="advies-content">${sanitizeAdviesHTML(res.content[0].text.trim())}</div>`;
}

export function initAdviesListeners() {
  document.getElementById('advies-body')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-action="run-advies"]');
    if (btn) runAdvies(btn.dataset.tab);
  });
  document.getElementById('advies-model-select')?.addEventListener('change', function () {
    _syncAdviesModel();
    saveCfg(cfg);
  });
}
