/* ── Micronutrient Dashboard (AI + heuristic estimation) ──── */

import { localData, currentDate, goals, cfg } from '../state.js';
import { MEAL_NAMES, MEAL_LABELS } from '../constants.js';
import { emptyDay, dayTotals } from '../utils.js';
import { aiCall, hasAiAvailable } from '../ai/providers.js';

export const RDA = {
  vitamine_d_ug: { naam: 'Vitamine D', doel: 10, unit: '\u00b5g', bronnen: 'Vette vis (zalm, makreel), eieren, verrijkte zuivel' },
  ijzer_mg: { naam: 'IJzer', doel: 13, unit: 'mg', bronnen: 'Rood vlees, spinazie, peulvruchten, noten' },
  calcium_mg: { naam: 'Calcium', doel: 950, unit: 'mg', bronnen: 'Zuivel (kaas, yoghurt, melk), noten, groene groenten' },
  vitamine_b12_ug: { naam: 'Vitamine B12', doel: 2.8, unit: '\u00b5g', bronnen: 'Vlees, vis, eieren, zuivel' },
  vitamine_c_mg: { naam: 'Vitamine C', doel: 75, unit: 'mg', bronnen: 'Paprika, citrusfruit, aardbeien, broccoli, kiwi' },
  zink_mg: { naam: 'Zink', doel: 9, unit: 'mg', bronnen: 'Rood vlees, kaas, noten, peulvruchten, volkoren brood' },
  magnesium_mg: { naam: 'Magnesium', doel: 350, unit: 'mg', bronnen: 'Noten, zaden, peulvruchten, havermout, donkere groenten' },
  foliumzuur_ug: { naam: 'Foliumzuur', doel: 300, unit: '\u00b5g', bronnen: 'Bladgroenten, peulvruchten, broccoli, ei, volkoren' },
};

/* ── Heuristic micro estimation per 100g of food category ── */
// Values based on average Dutch food composition (NEVO/Voedingscentrum)
const MICRO_PER_100G = [
  // Dairy
  { pattern: /\b(melk|halfvolle melk|volle melk|magere melk|karnemelk)\b/i,
    values: { calcium_mg: 120, vitamine_b12_ug: 0.4, vitamine_d_ug: 0.02, zink_mg: 0.4, magnesium_mg: 11, ijzer_mg: 0.03, vitamine_c_mg: 1, foliumzuur_ug: 5 } },
  { pattern: /\b(yoghurt|kwark|skyr)\b/i,
    values: { calcium_mg: 130, vitamine_b12_ug: 0.4, vitamine_d_ug: 0, zink_mg: 0.5, magnesium_mg: 12, ijzer_mg: 0.1, vitamine_c_mg: 1, foliumzuur_ug: 10 } },
  { pattern: /\b(kaas|gouda|edammer|cheddar|mozzarella|brie|camembert|emmentaler|parmezaan)\b/i,
    values: { calcium_mg: 750, vitamine_b12_ug: 1.5, vitamine_d_ug: 0.2, zink_mg: 3.5, magnesium_mg: 30, ijzer_mg: 0.3, vitamine_c_mg: 0, foliumzuur_ug: 20 } },
  { pattern: /\b(cottage cheese|huttenkase|ricotta)\b/i,
    values: { calcium_mg: 80, vitamine_b12_ug: 0.5, vitamine_d_ug: 0, zink_mg: 0.4, magnesium_mg: 8, ijzer_mg: 0.1, vitamine_c_mg: 0, foliumzuur_ug: 12 } },
  // Eggs
  { pattern: /\b(ei|eieren|roerei|omelet|gebakken ei|gekookt ei)\b/i,
    values: { calcium_mg: 50, vitamine_b12_ug: 1.1, vitamine_d_ug: 1.75, zink_mg: 1.3, magnesium_mg: 12, ijzer_mg: 1.8, vitamine_c_mg: 0, foliumzuur_ug: 47 } },
  // Fish
  { pattern: /\b(zalm|zalmfilet)\b/i,
    values: { calcium_mg: 12, vitamine_b12_ug: 3.2, vitamine_d_ug: 11, zink_mg: 0.6, magnesium_mg: 27, ijzer_mg: 0.3, vitamine_c_mg: 0, foliumzuur_ug: 26 } },
  { pattern: /\b(makreel)\b/i,
    values: { calcium_mg: 12, vitamine_b12_ug: 8.7, vitamine_d_ug: 8.5, zink_mg: 0.6, magnesium_mg: 76, ijzer_mg: 1.6, vitamine_c_mg: 0, foliumzuur_ug: 1 } },
  { pattern: /\b(tonijn)\b/i,
    values: { calcium_mg: 16, vitamine_b12_ug: 2.2, vitamine_d_ug: 4.5, zink_mg: 0.6, magnesium_mg: 50, ijzer_mg: 1.0, vitamine_c_mg: 0, foliumzuur_ug: 2 } },
  { pattern: /\b(vis|kabeljauw|schol|tilapia|forel|garnalen|pangasius|schelvis|heek)\b/i,
    values: { calcium_mg: 20, vitamine_b12_ug: 1.0, vitamine_d_ug: 1.5, zink_mg: 0.5, magnesium_mg: 25, ijzer_mg: 0.5, vitamine_c_mg: 0, foliumzuur_ug: 10 } },
  // Meat - poultry
  { pattern: /\b(kip|kipfilet|kippenborst|kalkoen|kalkoenfilet)\b/i,
    values: { calcium_mg: 12, vitamine_b12_ug: 0.3, vitamine_d_ug: 0.2, zink_mg: 1.0, magnesium_mg: 25, ijzer_mg: 0.7, vitamine_c_mg: 0, foliumzuur_ug: 10 } },
  // Meat - red
  { pattern: /\b(rund|biefstuk|gehakt|hamburger|tartaar|lam|varken|varkens)\b/i,
    values: { calcium_mg: 10, vitamine_b12_ug: 2.5, vitamine_d_ug: 0.1, zink_mg: 4.5, magnesium_mg: 22, ijzer_mg: 2.5, vitamine_c_mg: 0, foliumzuur_ug: 8 } },
  // Vegetables - leafy green (high in folate, vit C, iron, magnesium)
  { pattern: /\b(spinazie|boerenkool|andijvie|snijbiet|rucola)\b/i,
    values: { calcium_mg: 100, vitamine_b12_ug: 0, vitamine_d_ug: 0, zink_mg: 0.5, magnesium_mg: 50, ijzer_mg: 2.7, vitamine_c_mg: 30, foliumzuur_ug: 150 } },
  { pattern: /\b(broccoli|bloemkool)\b/i,
    values: { calcium_mg: 47, vitamine_b12_ug: 0, vitamine_d_ug: 0, zink_mg: 0.4, magnesium_mg: 21, ijzer_mg: 0.7, vitamine_c_mg: 65, foliumzuur_ug: 63 } },
  { pattern: /\b(paprika|rode paprika|groene paprika|gele paprika)\b/i,
    values: { calcium_mg: 10, vitamine_b12_ug: 0, vitamine_d_ug: 0, zink_mg: 0.2, magnesium_mg: 10, ijzer_mg: 0.4, vitamine_c_mg: 120, foliumzuur_ug: 26 } },
  { pattern: /\b(tomaat|tomat|tomatensaus)\b/i,
    values: { calcium_mg: 10, vitamine_b12_ug: 0, vitamine_d_ug: 0, zink_mg: 0.2, magnesium_mg: 11, ijzer_mg: 0.3, vitamine_c_mg: 14, foliumzuur_ug: 15 } },
  { pattern: /\b(wortel|peen)\b/i,
    values: { calcium_mg: 33, vitamine_b12_ug: 0, vitamine_d_ug: 0, zink_mg: 0.2, magnesium_mg: 12, ijzer_mg: 0.3, vitamine_c_mg: 6, foliumzuur_ug: 19 } },
  // Generic vegetables
  { pattern: /\b(groente|sla|komkommer|courgette|prei|sperziebonen|snijbonen|aubergine|venkel|selderij)\b/i,
    values: { calcium_mg: 30, vitamine_b12_ug: 0, vitamine_d_ug: 0, zink_mg: 0.3, magnesium_mg: 15, ijzer_mg: 0.5, vitamine_c_mg: 15, foliumzuur_ug: 30 } },
  // Fruits
  { pattern: /\b(sinaasappel|mandarijn|grapefruit|citrus|clementine)\b/i,
    values: { calcium_mg: 40, vitamine_b12_ug: 0, vitamine_d_ug: 0, zink_mg: 0.1, magnesium_mg: 10, ijzer_mg: 0.1, vitamine_c_mg: 50, foliumzuur_ug: 30 } },
  { pattern: /\b(kiwi)\b/i,
    values: { calcium_mg: 34, vitamine_b12_ug: 0, vitamine_d_ug: 0, zink_mg: 0.1, magnesium_mg: 17, ijzer_mg: 0.3, vitamine_c_mg: 93, foliumzuur_ug: 25 } },
  { pattern: /\b(aardbei|aardbeien|blauwe bes|framboz|bessen)\b/i,
    values: { calcium_mg: 16, vitamine_b12_ug: 0, vitamine_d_ug: 0, zink_mg: 0.1, magnesium_mg: 13, ijzer_mg: 0.4, vitamine_c_mg: 60, foliumzuur_ug: 24 } },
  { pattern: /\b(banaan)\b/i,
    values: { calcium_mg: 5, vitamine_b12_ug: 0, vitamine_d_ug: 0, zink_mg: 0.2, magnesium_mg: 27, ijzer_mg: 0.3, vitamine_c_mg: 9, foliumzuur_ug: 20 } },
  { pattern: /\b(appel|peer)\b/i,
    values: { calcium_mg: 6, vitamine_b12_ug: 0, vitamine_d_ug: 0, zink_mg: 0.04, magnesium_mg: 5, ijzer_mg: 0.1, vitamine_c_mg: 5, foliumzuur_ug: 3 } },
  // Generic fruit
  { pattern: /\b(fruit|mango|ananas|druif|pruim|perzik|nectarine|meloen)\b/i,
    values: { calcium_mg: 12, vitamine_b12_ug: 0, vitamine_d_ug: 0, zink_mg: 0.1, magnesium_mg: 10, ijzer_mg: 0.3, vitamine_c_mg: 20, foliumzuur_ug: 15 } },
  // Grains
  { pattern: /\b(havermout|haver|oatmeal|porridge)\b/i,
    values: { calcium_mg: 54, vitamine_b12_ug: 0, vitamine_d_ug: 0, zink_mg: 3.6, magnesium_mg: 130, ijzer_mg: 3.6, vitamine_c_mg: 0, foliumzuur_ug: 32 } },
  { pattern: /\b(brood|volkoren|rogge|bruinbrood|tarwebrood|baguette|pistolet|bolletje|stokbrood)\b/i,
    values: { calcium_mg: 30, vitamine_b12_ug: 0, vitamine_d_ug: 0, zink_mg: 1.5, magnesium_mg: 50, ijzer_mg: 2.0, vitamine_c_mg: 0, foliumzuur_ug: 25 } },
  { pattern: /\b(rijst|pasta|noodle|couscous|bulgur|quinoa)\b/i,
    values: { calcium_mg: 10, vitamine_b12_ug: 0, vitamine_d_ug: 0, zink_mg: 0.6, magnesium_mg: 25, ijzer_mg: 0.4, vitamine_c_mg: 0, foliumzuur_ug: 5 } },
  // Legumes
  { pattern: /\b(linzen|bonen|kikkererwt|kapucijners|peulvrucht|kidney|zwarte bonen)\b/i,
    values: { calcium_mg: 50, vitamine_b12_ug: 0, vitamine_d_ug: 0, zink_mg: 1.5, magnesium_mg: 40, ijzer_mg: 3.3, vitamine_c_mg: 2, foliumzuur_ug: 180 } },
  // Nuts & seeds
  { pattern: /\b(noten|amandel|walnoot|cashew|pistache|hazelnoot|pinda|pindakaas|pompoenpit|zonnebloempit)\b/i,
    values: { calcium_mg: 80, vitamine_b12_ug: 0, vitamine_d_ug: 0, zink_mg: 3.0, magnesium_mg: 160, ijzer_mg: 3.0, vitamine_c_mg: 0, foliumzuur_ug: 50 } },
  // Tofu/tempeh
  { pattern: /\b(tofu|tempeh|tempe)\b/i,
    values: { calcium_mg: 350, vitamine_b12_ug: 0, vitamine_d_ug: 0, zink_mg: 1.0, magnesium_mg: 30, ijzer_mg: 5.4, vitamine_c_mg: 0, foliumzuur_ug: 15 } },
  // Potatoes
  { pattern: /\b(aardappel|pieper|krieltje|puree|stamp)\b/i,
    values: { calcium_mg: 12, vitamine_b12_ug: 0, vitamine_d_ug: 0, zink_mg: 0.3, magnesium_mg: 23, ijzer_mg: 0.8, vitamine_c_mg: 20, foliumzuur_ug: 16 } },
];

/**
 * Estimate micronutrients from food items using heuristic pattern matching.
 * Returns { vitamine_d_ug, ijzer_mg, ... } totals for all items.
 */
export function estimateMicroHeuristic(items) {
  const totals = {};
  for (const key of Object.keys(RDA)) totals[key] = 0;

  for (const item of items) {
    const name = (item.naam || '').toLowerCase();
    const gram = estimateGram(item);
    const factor = gram / 100;

    let matched = false;
    for (const { pattern, values } of MICRO_PER_100G) {
      if (pattern.test(name)) {
        for (const [key, val] of Object.entries(values)) {
          totals[key] += val * factor;
        }
        matched = true;
        break; // first match wins
      }
    }

    // If no pattern matched, add a small baseline from calories (trace minerals)
    if (!matched && item.kcal > 0) {
      totals.ijzer_mg += 0.3 * factor;
      totals.magnesium_mg += 5 * factor;
      totals.zink_mg += 0.2 * factor;
    }
  }

  // Round all values
  for (const key of Object.keys(totals)) {
    totals[key] = Math.round(totals[key] * 10) / 10;
  }
  return totals;
}

function estimateGram(item) {
  if (Number.isFinite(item._gram) && item._gram > 0) return item._gram;
  if (Number.isFinite(item.ml) && item.ml > 0) return item.ml;
  // Estimate from portie string
  const portie = String(item.portie || '').toLowerCase();
  const numMatch = portie.match(/(\d+)\s*(?:gr?|gram|ml)/);
  if (numMatch) return parseInt(numMatch[1], 10);
  // Common Dutch portion sizes
  if (/snee|boterham|plak brood/i.test(portie)) return 35;
  if (/plak(?:je)?/i.test(portie)) return 20;
  if (/glas|beker/i.test(portie)) return 200;
  if (/kopje|kop/i.test(portie)) return 150;
  if (/eetlepel/i.test(portie)) return 15;
  if (/theelepel/i.test(portie)) return 5;
  if (/stuk|stuks/i.test(portie)) return 100;
  if (/portie/i.test(portie)) return 150;
  // Fallback: estimate from kcal if macros are present (rough 100g-based calculation)
  if (item.kcal > 0) {
    const macroKcal = (item.koolhydraten_g || 0) * 4 + (item.vetten_g || 0) * 9 + (item.eiwitten_g || 0) * 4;
    if (macroKcal > 0) return 100; // likely already portion-adjusted
  }
  return 100; // default fallback
}

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
    `${i.naam}${i.portie ? ' (' + i.portie + ')' : ''}: ${i.kcal} kcal, ${i.koolhydraten_g || 0}g kh, ${i.vetten_g || 0}g vet, ${i.eiwitten_g || 0}g eiwit`
  ).join('\n');

  const provider = cfg.adviesProvider || cfg.provider || 'claude';
  const origModel = cfg.model;
  if (cfg.adviesModel) cfg.model = cfg.adviesModel;

  try {
    const text = await aiCall(provider, 'Je bent een Nederlandse voedingsdeskundige. Antwoord ALLEEN met valide JSON, geen tekst eromheen.', `Schat de totale micronutri\u00ebnten voor deze voedingsmiddelen die vandaag gegeten zijn. Gebruik de hoeveelheden/porties om een realistische inschatting te maken.

Gegeten vandaag:
${itemList}

Schat per micronutri\u00ebnt het TOTAAL voor de hele dag. Antwoord ALLEEN met valide JSON:
{"vitamine_d_ug":X,"ijzer_mg":X,"calcium_mg":X,"vitamine_b12_ug":X,"vitamine_c_mg":X,"zink_mg":X,"magnesium_mg":X,"foliumzuur_ug":X}

Richtlijnen: Vitamine D ADH=10\u00b5g, IJzer ADH=13mg, Calcium ADH=950mg, B12 ADH=2.8\u00b5g, Vit C ADH=75mg, Zink ADH=9mg, Magnesium ADH=350mg, Foliumzuur ADH=300\u00b5g.
Geef realistische getallen (niet te laag, niet te hoog). Geen ranges, alleen getallen.`, 500, false);

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
    const jsonMatch = text.match(/\{[^{}]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
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

export function renderMicroDashboard(container, data, label = 'AI-schatting', showSources = false) {
  let html = '<div class="micro-grid">';

  for (const [key, meta] of Object.entries(RDA)) {
    const val = data[key] || 0;
    const pct = Math.min(Math.round((val / meta.doel) * 100), 200);
    const barPct = Math.min(pct, 100);
    const color = pct >= 80 ? 'var(--green)' : pct >= 40 ? 'var(--warning, #e6b94f)' : 'var(--danger)';
    const lowSource = showSources && pct < 60 ? `<div class="micro-source">💡 ${meta.bronnen}</div>` : '';

    html += `<div>
      <div class="micro-row">
        <div class="micro-name">${meta.naam}</div>
        <div class="micro-bar"><div class="micro-bar-fill" style="width:${barPct}%;background:${color}"></div></div>
        <div class="micro-val">${val}${meta.unit}/${meta.doel}</div>
        <div class="micro-pct" style="color:${color}">${pct}%</div>
      </div>${lowSource}
    </div>`;
  }

  html += '</div>';
  html += `<div class="micro-disclaimer">${label} op basis van productcategorie \u2014 geen medisch advies.</div>`;
  container.innerHTML = html;
}
