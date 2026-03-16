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
import { renderSchijfAnalyse } from './schijf.js';
import { switchMobileView } from '../ui/misc.js';

const LOCAL_ADVIES_TABS = new Set(['schijf']);
const AI_ADVIES_TABS = new Set(['avond', 'dag', 'week']);

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

async function claudeCall(prompt, maxTokens = 1400) {
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

  const r = await claudeCall(`Je bent een enthousiaste Nederlandse voedingscoach.

Vandaag gegeten: ${gegeten || 'Nog niets'}
Totalen: ${Math.round(tot.cals)} kcal, ${r1(tot.carbs)}g koolh, ${r1(tot.fat)}g vet, ${r1(tot.prot)}g eiwit, ${r1(tot.fiber)}g vezel
Doelen: ${goals.kcal} kcal, ${goals.carbs}g koolh, ${goals.fat}g vet, ${goals.prot}g eiwit, ${goals.fiber}g vezel
Nog over voor avondeten: ${rKcal} kcal, ${r1(rCarbs)}g koolh, ${r1(rFat)}g vet, ${r1(rProt)}g eiwit, ${r1(rFiber)}g vezel

Geef 2 concrete Nederlandse avondeten-opties die passen bij de resterende ruimte. Noem ingrediënten, bereiding, en waarom het past. HTML: <h4> voor namen, <p> voor tekst.`);

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

  const r = await claudeCall(`Je bent een deskundige Nederlandse voedingscoach. Analyseer deze dag.

Datum: ${formatDate(currentDate)}
Gegeten:
${itemLijst}

Totalen: ${Math.round(tot.cals)} kcal, ${r1(tot.prot)}g eiwit, ${r1(tot.fiber)}g vezel, ${r1(tot.fat)}g vet, ${r1(tot.carbs)}g koolh
Doelen: ${goals.kcal} kcal, ${goals.prot}g eiwit, ${goals.fiber}g vezel, ${goals.fat}g vet, ${goals.carbs}g koolh, ${goals.water}ml water

Geef een persoonlijke daganalyse:
<h4>✅ Wat goed gaat</h4>
<h4>⚠️ Aandachtspunten</h4>
<h4>💡 Concrete tip voor morgen</h4>
Vriendelijk, motiverend, specifiek. Gebruik <p> voor tekst.`);

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
    const tot = dayTotals(localData[d] || emptyDay());
    if (tot.cals === 0) return null;
    const lbl = d === dateKey(new Date()) ? 'Vandaag' : new Date(d + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'long' });
    return `${lbl}: ${Math.round(tot.cals)} kcal, ${r1(tot.prot)}g eiwit, ${r1(tot.fiber)}g vezel, ${r1(tot.fat)}g vet, ${r1(tot.carbs)}g koolh`;
  }).filter(Boolean).join('\n');

  const n = dagenMetData.length;
  const gem = dagenMetData.reduce((s, d) => { const t = dayTotals(localData[d]); return { cals: s.cals + t.cals, prot: s.prot + t.prot, fiber: s.fiber + t.fiber, fat: s.fat + t.fat, carbs: s.carbs + t.carbs }; }, { cals: 0, prot: 0, fiber: 0, fat: 0, carbs: 0 });

  const r = await claudeCall(`Je bent een deskundige Nederlandse voedingscoach. Analyseer deze week.

Weekdata (${n} van 7 dagen ingevuld):
${weekData}

Gemiddeld: ${Math.round(gem.cals / n)} kcal, ${r1(gem.prot / n)}g eiwit, ${r1(gem.fiber / n)}g vezel
Doelen per dag: ${goals.kcal} kcal, ${goals.prot}g eiwit, ${goals.fiber}g vezel, ${goals.fat}g vet, ${goals.carbs}g koolh

Geef een persoonlijke weekanalyse:
<h4>📈 Trends die opvallen</h4>
<h4>✅ Sterke punten</h4>
<h4>⚠️ Verbeterpunten</h4>
<h4>🎯 Focus voor volgende week</h4>
Vriendelijk, concreet, motiverend. Gebruik <p> voor tekst.`, 1500);

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
