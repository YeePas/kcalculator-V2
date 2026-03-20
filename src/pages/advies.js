/* ── Advies Page (AI tabs: avond / dag / week) ───────────── */

import {
  localData, currentDate, goals, cfg,
  activeAdviesTab, setActiveAdviesTab,
} from '../state.js';
import { MEAL_NAMES, MEAL_LABELS } from '../constants.js';
import { dateKey, emptyDay, r1, formatDate, dayTotals } from '../utils.js';
import { saveCfg } from '../storage.js';
import { loadDay } from '../supabase/data.js';
import { aiCall, hasAiAvailable, hasAiProxyConfig, hasLocalSessionAi } from '../ai/providers.js';
import { renderSchijfAnalyse, schijfDagScore, SCHIJF_CATEGORY_META } from './schijf.js';
import { getMicroAdvies } from './micronutrients.js';
import { switchMobileView } from '../ui/misc.js';

const LOCAL_ADVIES_TABS = new Set(['schijf']);
const AI_ADVIES_TABS = new Set(['avond', 'dag', 'week', 'micro']);

function getSafeAdviesTab(tab) {
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

  if (LOCAL_ADVIES_TABS.has(safeTab)) {
    if (safeTab === 'schijf') renderSchijfAnalyse();
  } else {
    showAdviesPrompt();
  }
}

function showAdviesPrompt() {
  const tabLabels = { avond: '🍽️ Avondeten-suggestie', dag: '📋 Daganalyse', week: '📈 AI Weekanalyse' };
  document.getElementById('advies-body').innerHTML = `
    <div style="text-align:center;padding:2rem 1rem">
      <div style="font-size:2rem;margin-bottom:0.5rem">💡</div>
      <p style="color:var(--muted);margin-bottom:1rem;font-size:0.88rem">${tabLabels[activeAdviesTab] || 'Advies'} — klik op Genereren om een AI-analyse te starten.</p>
      <button class="btn-primary" onclick="runAdvies('${activeAdviesTab}')" style="max-width:200px">🔍 Genereren</button>
    </div>`;
}

export function updateAdviesModelSelect() {
  const sel = document.getElementById('advies-model-select');
  if (!sel) return;
  const opts = [
    {value:'claude|claude-haiku-4-5-20251001', label:'Claude Haiku'},
    {value:'claude|claude-sonnet-4-5-20250929', label:'Claude Sonnet'},
    {value:'gemini|gemini-2.5-flash',           label:'Gemini Flash (gratis)'},
    {value:'gemini|gemini-2.5-pro',             label:'Gemini Pro'},
    {value:'openai|gpt-4o-mini',                label:'GPT-4o mini'},
    {value:'openai|gpt-4o',                     label:'GPT-4o'},
  ];
  const available = opts.filter(o => {
    if (hasAiProxyConfig()) return true;
    return hasLocalSessionAi('gemini') && o.value.startsWith('gemini|');
  });
  sel.innerHTML = available.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
  const saved = cfg.adviesProvider && cfg.adviesModel ? cfg.adviesProvider + '|' + cfg.adviesModel : null;
  if (saved && available.some(o => o.value === saved)) sel.value = saved;
  else {
    const def = (cfg.provider || 'claude') + '|' + (cfg.model || 'claude-haiku-4-5-20251001');
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
    if (safeTab === 'avond') await getAvondAdvies();
    else if (safeTab === 'dag') await getDagAdvies();
    else if (safeTab === 'micro') await getMicroAdvies();
    else await getWeekAdvies();
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

async function getDagAdvies() {
  if (!hasAiAvailable()) throw new Error('AI niet beschikbaar');
  const day = localData[currentDate] || emptyDay();
  const tot = dayTotals(day);
  const alleItems = MEAL_NAMES.flatMap(m => (day[m] || []).map(i => ({ ...i, maaltijd: m })));
  if (!alleItems.length) { setAdviesHTML('<p style="color:var(--muted);font-style:italic">Nog geen items vandaag — voeg eerst wat toe.</p>'); return; }

  const itemLijst = alleItems.map(i => `- ${i.naam}${i.portie ? ' (' + i.portie + ')' : ''}: ${i.kcal}kcal, ${i.koolhydraten_g}g koolh, ${i.vezels_g || 0}g vezel, ${i.vetten_g}g vet, ${i.eiwitten_g}g eiwit (${MEAL_LABELS[i.maaltijd]})`).join('\n');

  const schijf = buildSchijfContext(day);

  const macroAnalyse = [
    tot.cals > goals.kcal * 1.1 ? `Calorie-overschot: ${Math.round(tot.cals - goals.kcal)} kcal boven doel` : tot.cals < goals.kcal * 0.8 ? `Calorietekort: ${Math.round(goals.kcal - tot.cals)} kcal onder doel` : `Calorieën op schema (${Math.round(tot.cals)}/${goals.kcal})`,
    tot.prot < goals.prot * 0.8 ? `Eiwitten te laag: ${r1(tot.prot)}g van ${goals.prot}g doel (${Math.round(tot.prot / goals.prot * 100)}%)` : null,
    tot.fiber < goals.fiber * 0.8 ? `Vezels te laag: ${r1(tot.fiber)}g van ${goals.fiber}g doel (${Math.round(tot.fiber / goals.fiber * 100)}%)` : null,
    tot.fat > goals.fat * 1.2 ? `Vetten te hoog: ${r1(tot.fat)}g vs ${goals.fat}g doel` : null,
  ].filter(Boolean).join('\n');

  const r = await claudeCall(`VOLLEDIGE VOEDINGSDATA VOOR ${formatDate(currentDate)}:

Alle gegeten items (per product, met maaltijdtype):
${itemLijst}

MACRO-TOTALEN:
- Calorieën: ${Math.round(tot.cals)} kcal (doel: ${goals.kcal} kcal) → ${Math.round(tot.cals / goals.kcal * 100)}% van doel
- Eiwitten: ${r1(tot.prot)}g (doel: ${goals.prot}g) → ${Math.round(tot.prot / goals.prot * 100)}%
- Koolhydraten: ${r1(tot.carbs)}g (doel: ${goals.carbs}g) → ${Math.round(tot.carbs / goals.carbs * 100)}%
- Vetten: ${r1(tot.fat)}g (doel: ${goals.fat}g) → ${Math.round(tot.fat / goals.fat * 100)}%
- Vezels: ${r1(tot.fiber)}g (doel: ${goals.fiber}g) → ${Math.round(tot.fiber / goals.fiber * 100)}%

KERNPUNTEN:
${macroAnalyse}

SCHIJF VAN VIJF ANALYSE:
${schijf.text}

OPDRACHT — Schrijf een uitgebreide daganalyse van minimaal 500 woorden:

<h4>📊 Voedingskwaliteit (Schijf van Vijf)</h4>
Analyseer ELKE Schijf van Vijf categorie apart. Noem per categorie: welke producten eraan bijdragen (bij naam!), hoeveel gram er gegeten is vs het doel, en of het voldoende is. Benoem producten die buiten de Schijf vallen en wat hun impact is op de totale score. Leg uit wat de totaalscore van ${schijf.result.score}% concreet betekent.

<h4>✅ Sterke punten vandaag</h4>
Noem minstens 3 concrete positieve punten. Benoem specifieke producten en waarom ze goed zijn. Vergelijk macro's met doelen en benoem wat op schema ligt. Benoem gezonde keuzes en patronen.

<h4>⚠️ Aandachtspunten</h4>
Benoem specifieke tekorten met getallen. Noem producten die buiten de Schijf vallen en leg uit waarom. Benoem gezondheidsimpact van de tekorten (bijv. te weinig vezels → spijsvertering, te weinig eiwit → spierherstel). Vergelijk met de ADH.

<h4>💡 Concrete verbeterpunten</h4>
Geef minstens 3 specifieke, haalbare tips:
- Noem EXACTE producten met hoeveelheden (bijv. "150g broccoli toevoegen bij avondeten")
- Bereken hoeveel dat bijdraagt aan de ontbrekende macro's/categorieën
- Geef alternatieven voor buiten-Schijf producten

Wees persoonlijk, motiverend en datagedreven. Verwijs naar ALLE bovenstaande data.`, 4000);

  if (!r.ok) throw new Error('API fout');
  const res = await r.json();
  setAdviesHTML(res.content[0].text.trim());
}

async function getWeekAdvies() {
  if (!hasAiAvailable()) throw new Error('AI niet beschikbaar');
  const last7 = [];
  for (let i = 0; i < 7; i++) { const d = new Date(); d.setDate(d.getDate() - i); last7.push(dateKey(d)); }
  for (const d of last7) if (!localData[d]) localData[d] = await loadDay(d);

  const dagenMetData = last7.filter(d => dayTotals(localData[d] || emptyDay()).cals > 0);
  if (dagenMetData.length < 2) { setAdviesHTML('<p style="color:var(--muted);font-style:italic">Te weinig data — vul minimaal 2 dagen in.</p>'); return; }

  const weekData = last7.map(d => {
    const day = localData[d] || emptyDay();
    const tot = dayTotals(day);
    if (tot.cals === 0) return null;
    const lbl = d === dateKey(new Date()) ? 'Vandaag' : new Date(d + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'long' });
    const s = schijfDagScore(day);
    return `${lbl}: ${Math.round(tot.cals)} kcal, ${r1(tot.prot)}g eiwit, ${r1(tot.fiber)}g vezel, ${r1(tot.fat)}g vet, ${r1(tot.carbs)}g koolh | Schijf: ${s.score}% (${s.coveredCount}/6)`;
  }).filter(Boolean).join('\n');

  const n = dagenMetData.length;
  const gem = dagenMetData.reduce((s, d) => { const t = dayTotals(localData[d]); return { cals: s.cals + t.cals, prot: s.prot + t.prot, fiber: s.fiber + t.fiber, fat: s.fat + t.fat, carbs: s.carbs + t.carbs }; }, { cals: 0, prot: 0, fiber: 0, fat: 0, carbs: 0 });

  const schijfScores = dagenMetData.map(d => schijfDagScore(localData[d] || emptyDay()));
  const avgSchijf = Math.round(schijfScores.reduce((s, x) => s + x.score, 0) / n);
  const missingCats = {};
  for (const s of schijfScores) {
    for (const [key, meta] of Object.entries(SCHIJF_CATEGORY_META)) {
      if ((s.scores[key] || 0) < 0.6) missingCats[meta.naam] = (missingCats[meta.naam] || 0) + 1;
    }
  }
  const consistentMissing = Object.entries(missingCats).filter(([, count]) => count >= Math.ceil(n / 2)).map(([name]) => name);

  // Also gather top foods across the week
  const foodCounts = {};
  for (const d of dagenMetData) {
    const day = localData[d] || emptyDay();
    MEAL_NAMES.forEach(m => (day[m] || []).forEach(i => {
      foodCounts[i.naam] = (foodCounts[i.naam] || 0) + 1;
    }));
  }
  const topFoods = Object.entries(foodCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([naam, count]) => `${naam} (${count}×)`).join(', ');

  const r = await claudeCall(`WEEKOVERZICHT — Volledige voedingsdata van ${n} dagen:

DAGELIJKSE OVERZICHTEN (inclusief Schijf van Vijf scores):
${weekData}

WEEKGEMIDDELDEN:
- Calorieën: ${Math.round(gem.cals / n)} kcal/dag (doel: ${goals.kcal}) → ${Math.round(gem.cals / n / goals.kcal * 100)}% van doel
- Eiwitten: ${r1(gem.prot / n)}g/dag (doel: ${goals.prot}g) → ${Math.round(gem.prot / n / goals.prot * 100)}%
- Koolhydraten: ${r1(gem.carbs / n)}g/dag (doel: ${goals.carbs}g) → ${Math.round(gem.carbs / n / goals.carbs * 100)}%
- Vetten: ${r1(gem.fat / n)}g/dag (doel: ${goals.fat}g) → ${Math.round(gem.fat / n / goals.fat * 100)}%
- Vezels: ${r1(gem.fiber / n)}g/dag (doel: ${goals.fiber}g) → ${Math.round(gem.fiber / n / goals.fiber * 100)}%

VOEDINGSKWALITEIT:
- Gemiddelde Schijf van Vijf score: ${avgSchijf}%
- Categorieën die consequent missen (>50% van de dagen): ${consistentMissing.length ? consistentMissing.join(', ') : 'geen'}
- Laagste dagscore: ${Math.min(...schijfScores.map(s => s.score))}%
- Hoogste dagscore: ${Math.max(...schijfScores.map(s => s.score))}%

MEEST GEGETEN PRODUCTEN DEZE WEEK:
${topFoods}

OPDRACHT — Schrijf een uitgebreide weekanalyse van minimaal 600 woorden:

<h4>📈 Weektrends & patronen</h4>
Analyseer de schommelingen in calorieën en Schijf-scores per dag. Benoem de beste en slechtste dag bij naam met hun scores. Is er een opwaartse of neerwaartse trend? Zijn weekenddagen anders dan doordeweeks? Hoeveel variatie zit er in de intake (${Math.round(Math.max(...dagenMetData.map(d => dayTotals(localData[d]).cals)) - Math.min(...dagenMetData.map(d => dayTotals(localData[d]).cals)))} kcal verschil tussen hoogste en laagste dag)?

<h4>✅ Sterke punten deze week</h4>
Welke macro's worden consequent gehaald? Welke Schijf-categorieën scoren structureel goed? Benoem gezonde producten die vaak terugkomen. Vergelijk het weekgemiddelde met de doelen en benoem successen.

<h4>⚠️ Structurele verbeterpunten</h4>
Welke categorieën worden structureel gemist en op hoeveel dagen? Bereken het concrete tekort (bijv. "gemiddeld ${r1(Math.max(0, goals.fiber - gem.fiber / n))}g vezels per dag te weinig"). Benoem producten die vaak terugkomen maar buiten de Schijf vallen. Wat is het effect van deze tekorten op lange termijn?

<h4>🎯 Actieplan voor volgende week</h4>
Geef een concreet actieplan met:
<ul>
<li>3 specifieke producten om toe te voegen (met hoeveelheden en welke categorie ze verbeteren)</li>
<li>1-2 producten om te vervangen of verminderen</li>
<li>Een voorbeeld-dagmenu dat alle verbeterpunten combineert</li>
</ul>

<h4>🏆 Weekcijfer</h4>
Geef een cijfer van 1-10 voor deze week met korte onderbouwing.

Wees concreet, persoonlijk en verwijs naar ALLE bovenstaande data. Noem producten bij naam.`, 4500);

  if (!r.ok) throw new Error('API fout');
  const res = await r.json();
  setAdviesHTML(res.content[0].text.trim());
}

export function initAdviesListeners() {
  document.getElementById('advies-model-select')?.addEventListener('change', function () {
    _syncAdviesModel();
    saveCfg(cfg);
  });
}
