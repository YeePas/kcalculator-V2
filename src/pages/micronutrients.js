/* ── Micronutrient Dashboard (NEVO data + heuristic estimate) ── */

import { nevoData } from '../state.js';
import { MEAL_NAMES } from '../constants.js';
import { matchNameToNevo, scaleMicros } from '../products/matcher.js';

export const RDA = {
  vitamine_d_ug: { naam: 'Vitamine D', doel: 10, unit: '\u00b5g', bronnen: 'Vette vis (zalm, makreel), eieren, verrijkte zuivel' },
  ijzer_mg: { naam: 'IJzer', doel: 13, unit: 'mg', bronnen: 'Rood vlees, spinazie, peulvruchten, noten' },
  calcium_mg: { naam: 'Calcium', doel: 950, unit: 'mg', bronnen: 'Zuivel (kaas, yoghurt, melk), noten, groene groenten' },
  vitamine_b12_ug: { naam: 'Vitamine B12', doel: 2.8, unit: '\u00b5g', bronnen: 'Vlees, vis, eieren, zuivel' },
  vitamine_c_mg: { naam: 'Vitamine C', doel: 75, unit: 'mg', bronnen: 'Paprika, citrusfruit, aardbeien, broccoli, kiwi' },
  zink_mg: { naam: 'Zink', doel: 9, unit: 'mg', bronnen: 'Rood vlees, kaas, noten, peulvruchten, volkoren brood' },
  magnesium_mg: { naam: 'Magnesium', doel: 350, unit: 'mg', bronnen: 'Noten, zaden, peulvruchten, havermout, donkere groenten' },
  foliumzuur_ug: { naam: 'Foliumzuur', doel: 300, unit: '\u00b5g', bronnen: 'Bladgroenten, peulvruchten, broccoli, ei, volkoren' },
  // EPA + DHA; the advice (about 450 mg a day) is met by one portion of oily fish a week, so read it as a week average
  omega3_mg: { naam: 'Omega-3 (vis)', doel: 450, unit: 'mg', weekly: true, bronnen: 'Vette vis zoals zalm, makreel, haring of sardines, 1\u00d7 per week' },
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
    // Measured NEVO values (stored on the item when it was added) beat the estimate below.
    if (item._micro) {
      for (const [key, val] of Object.entries(item._micro)) {
        if (key in totals) totals[key] += val;
      }
      continue;
    }
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

function microWords(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/).filter(word => word.length > 1);
}

// The NEVO product whose name or synonym holds every word of the logged name (in any order, also
// as part of a compound), shortest first: "Halfvolle melk" -> "Melk halfvolle", "Havermout" ->
// "Vlokken haver-" (synonym Havermout). Without a match, trailing words are dropped one by one
// ("Tonijn in olijfolie" -> "Tonijn in olie blik").
let nevoMicroIndex = null;
const nevoMicroMatches = new Map();
function findNevoWithMicros(name) {
  const key = String(name || '').toLowerCase().trim();
  if (nevoMicroIndex?.source === nevoData && nevoMicroMatches.has(key)) return nevoMicroMatches.get(key);
  const found = findNevoWithMicrosUncached(name);
  nevoMicroMatches.set(key, found);
  return found;
}

function findNevoWithMicrosUncached(name) {
  const words = microWords(name).map(word => word.replace(/(en|s)$/, '')).filter(word => word.length > 1);
  if (!words.length || !Array.isArray(nevoData?.items)) return null;
  if (!nevoMicroIndex || nevoMicroIndex.source !== nevoData) {
    nevoMicroMatches.clear();
    nevoMicroIndex = {
      source: nevoData,
      texts: nevoData.items.filter(item => item.src === 'rivm' && item.m)
        .flatMap(item => [item.n, ...String(item.s || '').split('/')].filter(Boolean)
          .map(text => ({ item, length: text.length, words: microWords(text) })))
        .sort((a, b) => a.length - b.length),
    };
  }
  for (let count = words.length; count >= 1; count--) {
    const wanted = words.slice(0, count);
    const hit = nevoMicroIndex.texts.find(entry =>
      wanted.every(word => entry.words.some(candidate => candidate.startsWith(word) || candidate.endsWith(word))));
    if (hit) return hit.item;
  }
  return null;
}

/**
 * Micronutrients for a day from the data: NEVO values stored on the item, else those of the
 * NEVO product the item matches, else the category estimate above.
 */
const microDayCache = new Map();
export function microFromDay(day) {
  const items = MEAL_NAMES.flatMap(meal => day?.[meal] || []);
  const signature = items.map(item => [item.naam, item._gram, item.ml, item.portie, item.kcal, item._micro ? Object.keys(item._micro).length : 0].join('|')).join(';');
  if (microDayCache.has(signature) && microDayCache.get(signature).source === nevoData) return microDayCache.get(signature).result;
  const result = microFromDayUncached(day);
  if (microDayCache.size > 200) microDayCache.clear();
  microDayCache.set(signature, { source: nevoData, result });
  return result;
}

function microFromDayUncached(day) {
  const items = MEAL_NAMES.flatMap(meal => day?.[meal] || []);
  const measured = [];
  const estimated = [];
  const nevoMicros = item => {
    // A brand product (Open Food Facts) has no micronutrients: then take the closest NEVO product
    const matched = matchNameToNevo(item.naam);
    const product = matched?.m ? matched : findNevoWithMicros(item.naam);
    return product ? scaleMicros(product.m, estimateGram(item) / 100) : null;
  };
  const perItem = items.map(item => {
    if (item._micro) {
      measured.push(item.naam);
      // Logged before omega-3 was added to the data: look that one up
      if (!('omega3_mg' in item._micro)) {
        const omega3 = nevoMicros(item)?.omega3_mg;
        if (omega3 !== undefined) return { ...item, _micro: { ...item._micro, omega3_mg: omega3 } };
      }
      return item;
    }
    const micros = nevoMicros(item);
    if (micros) {
      measured.push(item.naam);
      return { ...item, _micro: micros };
    }
    estimated.push(item.naam);
    return item;
  });
  return { totals: estimateMicroHeuristic(perItem), measured, estimated };
}

export function renderMicroDashboard(container, data, label = 'Schatting', showSources = false) {
  container.innerHTML = microDashboardHTML(data, label, showSources);
}

export function microDashboardHTML(data, label = 'Schatting', showSources = false, weeklyLabel = '') {
  let html = '<div class="micro-grid">';

  for (const [key, meta] of Object.entries(RDA)) {
    const val = data[key] || 0;
    const pct = Math.min(Math.round((val / meta.doel) * 100), 200);
    const barPct = Math.min(pct, 100);
    const color = pct >= 80 ? 'var(--green)' : pct >= 40 ? 'var(--warning, #e6b94f)' : 'var(--danger)';
    const lowSource = (meta.weekly && weeklyLabel ? `<div class="micro-source">📅 ${weeklyLabel}</div>` : '')
      + (showSources && pct < 60 ? `<div class="micro-source">💡 ${meta.bronnen}</div>` : '');

    html += `<div>
      <div class="micro-row">
        <div class="micro-name">${meta.naam}</div>
        <div class="micro-bar"><div class="micro-bar-fill" style="width:${barPct}%;background:${color}"></div></div>
        <div class="micro-val">${val >= 100 ? Math.round(val) : val}${meta.unit}/${meta.doel}</div>
        <div class="micro-pct" style="color:${color}">${pct}%</div>
      </div>${lowSource}
    </div>`;
  }

  html += '</div>';
  html += `<div class="micro-disclaimer">${label} \u2014 geen medisch advies.</div>`;
  return html;
}
