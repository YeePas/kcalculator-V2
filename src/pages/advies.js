/* ── Schijf van Vijf page and the AI "Wat zal ik eten?" modal (lunch or dinner) ── */

import { localData, currentDate, goals, cfg, setActiveAdviesTab } from '../state.js';
import { MEAL_NAMES, MEAL_LABELS, AI_MODEL_OPTIONS, DEFAULT_PROVIDER_MODELS } from '../constants.js';
import { emptyDay, r1, dayTotals } from '../utils.js';
import { saveCfg } from '../storage.js';
import { aiCall, hasAiAvailable, hasAiProxyConfig, hasLocalSessionAi } from '../ai/providers.js';
import { schijfDagScore, SCHIJF_CATEGORY_META } from './schijf.js';
import { renderSchijf2026Analyse } from './schijf-2026.js';
import { switchMobileView } from '../ui/misc.js';

export function openAdviesModal() {
  setActiveAdviesTab('schijf');
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
  renderSchijf2026Analyse();
}

/* ── Wat zal ik eten? ─────────────────────────────────────── */

// Which meal the suggestion is for: what has been eaten before it, and its share of what is left
const MEAL_PLANS = {
  lunch: { label: 'lunch', title: 'Wat eet ik als lunch?', before: ['ontbijt', 'ochtendsnack'], share: 'De lunch is meestal zo\'n 30-35% van wat er voor de rest van de dag over is; houd ook ruimte voor middagsnack en avondeten.' },
  avondeten: { label: 'avondeten', title: 'Wat eet ik vanavond?', before: ['ontbijt', 'ochtendsnack', 'lunch', 'middagsnack'], share: 'Het avondeten mag het grootste deel van wat er over is gebruiken; houd een kleine marge voor een avondsnack.' },
};
let avondKey = null;
let avondMeal = 'avondeten';

export function defaultIdeaMeal() {
  return new Date().getHours() < 14 ? 'lunch' : 'avondeten';
}

export function openAvondModal(meal = defaultIdeaMeal()) {
  avondMeal = MEAL_PLANS[meal] ? meal : 'avondeten';
  updateAdviesModelSelect();
  const title = document.getElementById('avond-title');
  if (title) title.textContent = `🍽️ ${MEAL_PLANS[avondMeal].title}`;
  const body = document.getElementById('avond-body');
  // Keep a suggestion made earlier today for this meal; otherwise invite to generate one
  if (body && (avondKey !== `${currentDate}|${avondMeal}` || !body.innerHTML.trim())) {
    body.innerHTML = '<p class="avond-empty">Tik op <strong>Bedenk iets</strong> voor 2-3 voorstellen.</p>';
  }
  document.getElementById('avond-modal')?.classList.add('open');
}

export function closeAvondModal() {
  document.getElementById('avond-modal')?.classList.remove('open');
}

export async function runAvond() {
  const body = document.getElementById('avond-body');
  if (!body) return;
  avondKey = `${currentDate}|${avondMeal}`;
  body.innerHTML = '<div class="advies-loading"><span class="spin">⏳</span> Genereren…</div>';
  try {
    await getAvondAdvies();
  } catch (e) {
    body.innerHTML = '';
    const p = document.createElement('p');
    p.style.color = 'var(--danger)';
    p.textContent = 'Fout: ' + (e?.message || 'Onbekende fout');
    body.appendChild(p);
  }
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

  document.getElementById('avond-body').innerHTML = `
    <div class="advies-macro-bar">
      <div class="advies-macro-item"><span class="advies-macro-val" style="color:var(--accent)">${rKcal}</span><span class="advies-macro-lbl">kcal over</span></div>
      <div class="advies-macro-item"><span class="advies-macro-val" style="color:var(--blue)">${r1(rCarbs)}g</span><span class="advies-macro-lbl">koolh. over</span></div>
      <div class="advies-macro-item"><span class="advies-macro-val" style="color:var(--danger)">${r1(rFat)}g</span><span class="advies-macro-lbl">vet over</span></div>
      <div class="advies-macro-item"><span class="advies-macro-val" style="color:var(--green)">${r1(rProt)}g</span><span class="advies-macro-lbl">eiwit over</span></div>
      <div class="advies-macro-item"><span class="advies-macro-val" style="color:var(--fiber)">${r1(rFiber)}g</span><span class="advies-macro-lbl">vezel over</span></div>
    </div>
    <div class="advies-loading"><span class="spin">⏳</span> Advies genereren…</div>`;

  const plan = MEAL_PLANS[avondMeal];
  const gegeten = MEAL_NAMES.filter(m => plan.before.includes(m)).map(m => {
    const items = (day[m] || []);
    return items.length ? `${MEAL_LABELS[m]}: ${items.map(i => i.naam + (i.portie ? ' (' + i.portie + ')' : '')).join(', ')}` : null;
  }).filter(Boolean).join('\n');

  const schijf = buildSchijfContext(day);

  const alleItemsLijst = MEAL_NAMES.filter(m => plan.before.includes(m)).flatMap(m =>
    (day[m] || []).map(i => `  - ${i.naam}${i.portie ? ' (' + i.portie + ')' : ''}: ${i.kcal} kcal, ${i.koolhydraten_g}g kh, ${i.vetten_g}g vet, ${i.eiwitten_g}g eiwit, ${i.vezels_g || 0}g vezel`)
  ).join('\n');

  const r = await claudeCall(`CONTEXT — Voedingsdata van vandaag:

Gegeten vandaag (per item):
${alleItemsLijst || '(Nog niets ingevoerd)'}

Samenvatting gegeten: ${gegeten || 'Nog niets'}

Macro-totalen tot nu toe: ${Math.round(tot.cals)} kcal | ${r1(tot.carbs)}g koolhydraten | ${r1(tot.fat)}g vet | ${r1(tot.prot)}g eiwit | ${r1(tot.fiber)}g vezels
Dagdoelen: ${goals.kcal} kcal | ${goals.carbs}g koolhydraten | ${goals.fat}g vet | ${goals.prot}g eiwit | ${goals.fiber}g vezels
Nog over voor de rest van de dag: ${rKcal} kcal | ${r1(rCarbs)}g koolhydraten | ${r1(rFat)}g vet | ${r1(rProt)}g eiwit | ${r1(rFiber)}g vezels

VOEDINGSKWALITEIT (Schijf van Vijf):
${schijf.text}

OPDRACHT:
${plan.share}

Geef 2-3 concrete, gedetailleerde Nederlandse gerechten voor de ${plan.label} die:
1. Passen bij de resterende macro's van de dag (${rKcal} kcal, ${r1(rProt)}g eiwit, ${r1(rFiber)}g vezel over), naar verhouding voor de ${plan.label}
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
  const avondBody = document.getElementById('avond-body');
  const macroBar = avondBody.querySelector('.advies-macro-bar').outerHTML;
  avondBody.innerHTML = macroBar + `<div class="advies-content">${sanitizeAdviesHTML(res.content[0].text.trim())}</div>`;
}

export function initAdviesListeners() {
  document.querySelectorAll('[data-idea-meal]').forEach(btn => {
    // The meal that comes next is the highlighted button
    btn.classList.toggle('btn-primary', btn.dataset.ideaMeal === defaultIdeaMeal());
    btn.classList.toggle('btn-secondary', btn.dataset.ideaMeal !== defaultIdeaMeal());
    btn.addEventListener('click', () => openAvondModal(btn.dataset.ideaMeal));
  });
  document.getElementById('schijf-mini')?.addEventListener('click', openAdviesModal);
  document.getElementById('avond-run-btn')?.addEventListener('click', runAvond);
  document.getElementById('avond-close-btn')?.addEventListener('click', closeAvondModal);
  document.getElementById('avond-modal')?.addEventListener('click', e => {
    if (e.target?.id === 'avond-modal') closeAvondModal();
  });
  document.getElementById('advies-model-select')?.addEventListener('change', function () {
    _syncAdviesModel();
    saveCfg(cfg);
  });
}
