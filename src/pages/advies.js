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
    {value:'claude|claude-haiku-4-5-20250514', label:'Claude Haiku'},
    {value:'claude|claude-sonnet-4-5-20250514', label:'Claude Sonnet'},
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
    const def = (cfg.provider || 'claude') + '|' + (cfg.model || 'claude-haiku-4-5-20250514');
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

const ALLOWED_ADVIES_TAGS = new Set(['h4', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'br']);

function sanitizeAdviesHTML(unsafeHtml) {
  const template = document.createElement('template');
  template.innerHTML = String(unsafeHtml || '');

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

async function claudeCall(prompt, maxTokens = 3000) {
  const provider = cfg.adviesProvider || cfg.provider || 'claude';
  const origModel = cfg.model;
  if (cfg.adviesModel) cfg.model = cfg.adviesModel;
  try {
    const text = await aiCall(provider, null, prompt, maxTokens, false);
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

  const r = await claudeCall(`Je bent een enthousiaste Nederlandse voedingscoach.

Vandaag gegeten: ${gegeten || 'Nog niets'}
Totalen: ${Math.round(tot.cals)} kcal, ${r1(tot.carbs)}g koolh, ${r1(tot.fat)}g vet, ${r1(tot.prot)}g eiwit, ${r1(tot.fiber)}g vezel
Doelen: ${goals.kcal} kcal, ${goals.carbs}g koolh, ${goals.fat}g vet, ${goals.prot}g eiwit, ${goals.fiber}g vezel
Nog over voor avondeten: ${rKcal} kcal, ${r1(rCarbs)}g koolh, ${r1(rFat)}g vet, ${r1(rProt)}g eiwit, ${r1(rFiber)}g vezel

${schijf.text}

Geef 2-3 concrete Nederlandse avondeten-opties die:
1. Passen bij de resterende macro's (${rKcal} kcal, ${r1(rProt)}g eiwit, ${r1(rFiber)}g vezel over)
2. ${schijf.missing.length ? 'De ontbrekende Schijf-categorieën aanvullen: ' + schijf.missing.join(', ') : 'De goede Schijf-score behouden'}

Per optie geef je:
- <h4> met naam van het gerecht
- Ingrediëntenlijst met hoeveelheden
- Korte bereidingswijze (3-5 stappen)
- Geschatte macro's (kcal, eiwit, koolh, vet, vezel)
- Welke Schijf-categorieën het afdekt

Wees uitgebreid en concreet. Gebruik <h4> voor titels, <p> voor tekst, <ul>/<li> voor lijsten.`, 3000);

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

  const r = await claudeCall(`Je bent een deskundige Nederlandse voedingscoach. Analyseer deze dag grondig.

Datum: ${formatDate(currentDate)}
Gegeten:
${itemLijst}

Totalen: ${Math.round(tot.cals)} kcal, ${r1(tot.prot)}g eiwit, ${r1(tot.fiber)}g vezel, ${r1(tot.fat)}g vet, ${r1(tot.carbs)}g koolh
Doelen: ${goals.kcal} kcal, ${goals.prot}g eiwit, ${goals.fiber}g vezel, ${goals.fat}g vet, ${goals.carbs}g koolh, ${goals.water}ml water

${schijf.text}

Geef een uitgebreide, persoonlijke daganalyse gebaseerd op zowel macro's als voedingskwaliteit (Schijf van Vijf). Schrijf minstens 4 alinea's per sectie.

<h4>📊 Voedingskwaliteit</h4>
Analyseer de Schijf van Vijf score in detail. Benoem per categorie hoe het scoort en waarom. Refereer aan specifieke producten die je hebt gegeten — noem ze bij naam. Leg uit wat "buiten de Schijf" producten zijn en welke impact ze hebben.

<h4>✅ Wat goed gaat</h4>
Benoem concrete sterke punten met voorbeelden. Benoem welke producten bijdragen aan goede scores. Vergelijk met de doelen en benoem waar je op schema ligt.

<h4>⚠️ Aandachtspunten</h4>
Benoem specifieke Schijf-gaten en macro-afwijkingen. Noem concrete producten die "buiten de Schijf" vallen en waarom. Benoem tekorten (eiwit, vezel, etc.) en welk effect dit kan hebben.

<h4>💡 Concrete tips voor morgen</h4>
Geef 2-3 haalbare verbeteringen met specifieke productaanbevelingen. Benoem hoeveel gram/porties nodig zijn om een categorie te verbeteren.

Wees vriendelijk, motiverend maar eerlijk, en altijd datagedreven. Gebruik <p> voor tekst, <ul>/<li> voor lijsten.`, 3500);

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

  const r = await claudeCall(`Je bent een deskundige Nederlandse voedingscoach. Analyseer deze week grondig.

Weekdata (${n} van 7 dagen ingevuld):
${weekData}

Gemiddeld: ${Math.round(gem.cals / n)} kcal, ${r1(gem.prot / n)}g eiwit, ${r1(gem.fiber / n)}g vezel
Doelen per dag: ${goals.kcal} kcal, ${goals.prot}g eiwit, ${goals.fiber}g vezel, ${goals.fat}g vet, ${goals.carbs}g koolh

Gemiddelde Schijf van Vijf score: ${avgSchijf}%
Categorieën die consequent missen (>50% van de dagen): ${consistentMissing.length ? consistentMissing.join(', ') : 'geen'}

Geef een uitgebreide, persoonlijke weekanalyse gebaseerd op macro's én voedingskwaliteit. Schrijf minstens 3-4 alinea's per sectie.

<h4>📈 Trends die opvallen</h4>
Analyseer de dagelijkse Schijf-scores en macro-patronen in detail. Is er verbetering of verslechtering over de week? Vergelijk individuele dagen — benoem de beste en slechtste dagen bij naam. Analyseer de caloriefluctuaties.

<h4>✅ Sterke punten</h4>
Wat gaat consequent goed? Welke Schijf-categorieën worden structureel behaald? Benoem patronen die positief zijn (bijv. consistent hoog eiwitgehalte, goede vezels, etc.).

<h4>⚠️ Verbeterpunten</h4>
Welke Schijf-categorieën worden structureel gemist? Zijn er macro-afwijkingen die consequent terugkomen? Benoem concrete producten of gewoontes die bijdragen aan tekorten. Bereken hoeveel er gemist wordt.

<h4>🎯 Focus voor volgende week</h4>
Geef 2-3 concrete, haalbare verbeterpunten met praktische tips. Benoem specifieke producten die je kunt toevoegen en welke categorieën ze verbeteren. Geef een concreet dagmenu-voorbeeld dat alle verbeterpunten adresseert.

Wees vriendelijk, concreet en altijd datagedreven. Gebruik <p> voor tekst, <ul>/<li> voor lijsten.`, 4000);

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
