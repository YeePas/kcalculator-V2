/* ── Schijf van Vijf 2026 Analysis ────────────────────────── */

import { currentDate, localData } from '../state.js';
import { MEAL_LABELS, MEAL_NAMES } from '../constants.js';
import { dateKey, dayTotals, esc, r1 } from '../utils.js';
import { loadDay } from '../supabase/data.js';
import { PORTION_ALIASES, matchItemToNevo } from '../products/matcher.js';
import { schijfOutsideCheck, schijfProductGroup, REFINED_NAME_PATTERN, normalizeSchijfName, renderItemList } from './schijf.js';
import { RDA, microFromDay, microDashboardHTML } from './micronutrients.js';

const DAY_TARGETS_2026 = {
  groente_fruit: { icon: '🥬', naam: 'Groente & fruit', doel: 450, unit: 'g', color: '#1f9e4b', parts: [{ key: 'groente', doel: 250, icon: '🥬', naam: 'Groente' }, { key: 'fruit', doel: 200, icon: '🍎', naam: 'Fruit' }] },
  graan_aardappel: { icon: '🌾', naam: 'Volkoren & aardappel', doel: 400, unit: 'g', color: '#b38a46', parts: [{ key: 'volkoren_brood', doel: 175, icon: '🌾', naam: 'Volkoren' }, { key: 'graan_aardappel', doel: 225, icon: '🥔', naam: 'Aardappel/graan' }] },
  eiwit_zuivel: { icon: '🥛', naam: 'Zuivel & eiwit', doel: 420, unit: 'g/ml', color: '#4fb58a', parts: [{ key: 'zuivel_alt', doel: 400, boven: 800, icon: '🥛', naam: 'Zuivel' }, { key: 'kaas', doel: 20, boven: 40, icon: '🧀', naam: 'Kaas' }] },
  vetten_noten: { icon: '🥑', naam: 'Gezonde vetten', doel: 80, unit: 'g', color: '#7fae4d', parts: [{ key: 'vetten_olie', doel: 50, boven: 75, icon: '🥑', naam: 'Vetten/olie' }, { key: 'noten', doel: 30, boven: 60, icon: '🥜', naam: 'Noten' }] },
  dranken: { icon: '💧', naam: 'Dranken', doel: 1600, unit: 'ml', color: 'var(--blue)', parts: [{ key: 'dranken', doel: 1600, icon: '💧', naam: 'Water/thee/koffie' }] },
};

const WEEK_TARGETS_2026 = {
  plant_eiwit: { icon: '🍳', naam: 'Peulvruchten/tofu/tempé', doel: 250, unit: 'g', color: '#4fb58a', max: false },
  vis: { icon: '🐟', naam: 'Vis', doel: 100, unit: 'g', color: 'var(--blue)', max: false },
  eieren: { icon: '🍳', naam: 'Eieren', doel: 3, unit: 'st', color: '#4fb58a', max: false },
  vlees: { icon: '🍳', naam: 'Vlees totaal', doel: 300, unit: 'g', color: '#d96a93', max: true },
  rood_vlees: { icon: '⚠', naam: 'Rood vlees', doel: 100, unit: 'g', color: '#e8a020', max: true },
};

const SUGAR_DRINK_PATTERN = /\b(frisdrank|cola|fanta|sprite|energy|sap|smoothie|limonade|siroop|diksap|chocomel|fristi|milkshake|alcohol|bier|wijn|cocktail)\b/i;
const WATER_DRINK_PATTERN = /\b(water|thee|koffie|espresso|americano)\b/i;
const PLANT_PROTEIN_PATTERN = /\b(peulvrucht|linzen|boon|bonen|kikkererwt|kikkererwten|hummus|falafel|tofu|tempeh|tempe|edamame)\b/i;
const FISH_PATTERN = /\b(vis|zalm|tonijn|makreel|sardine|haring|forel|kabeljauw|schol|tilapia|garnalen|mosselen)\b/i;
const EGG_PATTERN = /\b(ei|eieren|omelet|roerei)\b/i;
const MEAT_PATTERN = /\b(kip|kalkoen|vlees|rund|biefstuk|gehakt|varken|varkens|ham|spek|bacon|salami|worst|rookvlees|lams|kalf)\b/i;
const RED_MEAT_PATTERN = /\b(rund|biefstuk|gehakt|varken|varkens|ham|spek|bacon|salami|worst|rookvlees|lams|kalf)\b/i;
const CHEESE_PATTERN = /\b(kaas|goudse|mozzarella|ricotta|cottage cheese|huttenkase|feta|parmezaan)\b/i;
const DAIRY_PATTERN = /\b(yoghurt|kwark|skyr|melk|karnemelk|sojadrink|sojamelk|sojayoghurt|erwtendrink|plantaardige yoghurt)\b/i;
const NUT_PATTERN = /\b(noot|noten|amandel|amandelen|walnoot|walnoten|cashew|cashewnoten|pistache|pistachenoten|hazelnoot|hazelnoten|pinda|pindas|pompoenpit|pompoenpitten|zonnebloempit|zonnebloempitten|chia|chiazaad|lijnzaad|zaden)\b/i;
// "Tonijn in olijfolie" is fish, not oil
const PACKED_IN_OIL_PATTERN = /\b(?:in|op)\s+\w*olie\b/i;
const FAT_PATTERN = /\b(olijfolie|zonnebloemolie|koolzaadolie|lijnzaadolie|margarine|halvarine|olie)\b/i;
// Bread, grains and potatoes: one Schijf box, split into bread/breakfast ("Volkoren") and the
// warm-meal part ("Aardappel/graan"). Only wholegrain grain products are in the Schijf.
const POTATO_PATTERN = /\baardappel|\bkrieltje|\bbataat|\bpuree\b/i;
const GRAIN_PATTERN = /brood|boterham|bolletje|beschuit|cracker|knackebrod|wrap|tortilla|pita|havermout|muesli|granola|brinta|ontbijtgranen|cornflakes|zilvervlies|(rijst|pasta|spaghetti|macaroni|penne|fusilli|tagliatelle|lasagne|noedels|couscous|quinoa|bulgur|boekweit|gierst|parelgort)\b|\bmie\b/i;
const WHOLEGRAIN_PATTERN = /volkoren|wholegrain|whole grain|havermout|haver|muesli|brinta|rogge|spelt|zilvervlies|bruine rijst|brown rice|\b(quinoa|bulgur|boekweit|gierst|parelgort)\b/i;
const BREAD_BREAKFAST_PATTERN = /brood|boterham|bolletje|beschuit|cracker|knackebrod|wrap|tortilla|pita|havermout|muesli|granola|brinta|ontbijtgranen|cornflakes|\bpap\b/i;
const FRUIT_PATTERN = /\b(appel|peer|banaan|kiwi|aardbei|blauwe bes|druif|druiven|mandarijn|sinaasappel|mango|perzik|pruim|nectarine|ananas|meloen|fruit)\b/i;
// Fresh herbs are unprocessed plant parts: vegetables in the Schijf (in small amounts).
// Dried herbs and spices fit the Schijf too, but count toward no box.
const FRESH_HERB_PATTERN = /\b(basilicum|peterselie|koriander|dille|bieslook|munt|rozemarijn|tijm|oregano|dragon|kervel|salie|citroengras|lavas|selderijblad)\b/i;
const DRIED_HERB_PATTERN = /\b(gedroogd|gedroogde|poeder|gemalen|specerij|specerijen|kruidenmix|peper|kaneel|paprikapoeder|kerrie|komijn|nootmuskaat)\b/i;
const VEG_PATTERN = /\b(groente|broccoli|spinazie|sla|komkommer|paprika|tomaat|wortel|courgette|bloemkool|boerenkool|andijvie|prei|sperziebonen|snijbonen|aubergine|raapstelen|asperges)\b/i;

function normalizeName(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function singularizeUnit(unit) {
  return String(unit || '').toLowerCase().replace(/['’.]/g, '').replace(/en$/, '').replace(/s$/, '');
}

function parseLoggedItemAmount(item, matchedProduct) {
  if (Number.isFinite(item?._gram) && item._gram > 0) return item._gram;
  if (Number.isFinite(item?.ml) && item.ml > 0) return item.ml;
  const portion = String(item?.portie || '').trim().toLowerCase();
  const explicit = portion.match(/([\d.,]+)\s*(kg|gram|gr|g|ml|cl|dl|l)\b/);
  if (explicit) {
    const value = parseFloat(explicit[1].replace(',', '.'));
    if (Number.isFinite(value)) {
      if (explicit[2] === 'kg') return value * 1000;
      if (explicit[2] === 'cl') return value * 10;
      if (explicit[2] === 'dl') return value * 100;
      if (explicit[2] === 'l') return value * 1000;
      return value;
    }
  }
  const counted = portion.match(/([\d.,]+)\s*x?\s*([a-zA-Z]+)/);
  if (counted) {
    const count = parseFloat(counted[1].replace(',', '.'));
    const grams = PORTION_ALIASES[singularizeUnit(counted[2])];
    if (Number.isFinite(count) && grams) return count * grams;
  }
  if (matchedProduct?.k > 0 && item?.kcal > 0) {
    const inferred = (item.kcal / matchedProduct.k) * 100;
    if (Number.isFinite(inferred) && inferred > 5 && inferred < 1800) return inferred;
  }
  return null;
}

function classifyItem(item) {
  const match = matchItemToNevo({ foodName: item.naam, gram: null, count: 1, unit: null });
  const group = schijfProductGroup(match);
  const name = normalizeName(`${item.naam} ${match?.n || ''}`);
  const amount = parseLoggedItemAmount(item, match);
  const entry = {
    naam: item.naam,
    amount: amount ? Math.round(amount) : null,
    kcal: Math.round(item.kcal || 0),
    matchedName: match?.n || '',
    group,
  };

  const outside = { ...entry, bucket: 'outside' };
  if (SUGAR_DRINK_PATTERN.test(name)) return { ...outside, reason: 'Drank met suiker/alcohol telt niet mee.' };
  // Hard fats such as roomboter are outside whichever bucket they would land in
  if (schijfOutsideCheck(item.naam, match) || schijfOutsideCheck(item.naam, match, 'vet')) return outside;
  if (WATER_DRINK_PATTERN.test(name) || group === 'Niet-alcoholische dranken') return { ...entry, bucket: 'dranken' };
  // Potatoes (also sweet potato) before fruit and vegetables: a product match can be off
  if (POTATO_PATTERN.test(normalizeSchijfName(item.naam))) return { ...entry, bucket: 'graan_aardappel' };
  const herbName = normalizeSchijfName(item.naam);
  if (group === 'Kruiden en specerijen' || FRESH_HERB_PATTERN.test(herbName) || DRIED_HERB_PATTERN.test(herbName)) {
    if (FRESH_HERB_PATTERN.test(herbName) && !DRIED_HERB_PATTERN.test(herbName) && !/pesto|saus|olie|dressing|thee|boter|kaas/.test(herbName)) return { ...entry, bucket: 'groente' };
    if (group === 'Kruiden en specerijen' || DRIED_HERB_PATTERN.test(herbName)) {
      return { ...entry, bucket: 'ignored', reason: 'Kruiden en specerijen passen in de Schijf, maar tellen niet mee voor een vak.' };
    }
  }
  if (group === 'Groente' || VEG_PATTERN.test(name)) return { ...entry, bucket: 'groente' };
  if (group === 'Fruit' || FRUIT_PATTERN.test(name)) return { ...entry, bucket: 'fruit' };
  if (CHEESE_PATTERN.test(name) || group === 'Kaas') return { ...entry, bucket: 'kaas' };
  if (DAIRY_PATTERN.test(name) || group === 'Melk en melkproducten') return schijfOutsideCheck(item.naam, match, 'zuivel') ? outside : { ...entry, bucket: 'zuivel_alt' };
  if (NUT_PATTERN.test(name) || group === 'Noten en zaden') return schijfOutsideCheck(item.naam, match, 'noten') ? outside : { ...entry, bucket: 'noten' };
  if ((FAT_PATTERN.test(name) && !PACKED_IN_OIL_PATTERN.test(name)) || group === 'Vetten en oliën') return schijfOutsideCheck(item.naam, match, 'vet') ? outside : { ...entry, bucket: 'vetten_olie' };
  if (PLANT_PROTEIN_PATTERN.test(name) || group === 'Peulvruchten') return { ...entry, bucket: 'plant_eiwit' };
  if (FISH_PATTERN.test(name) || group === 'Vis, schaal- en schelpdieren') return { ...entry, bucket: 'vis' };
  if (EGG_PATTERN.test(name) || group === 'Eieren') return { ...entry, bucket: 'eieren', amount: Math.max(1, Math.round((amount || 60) / 60)) };
  if (RED_MEAT_PATTERN.test(name)) return { ...entry, bucket: 'rood_vlees' };
  if (MEAT_PATTERN.test(name) || group === 'Vlees en gevogelte') return { ...entry, bucket: 'vlees' };
  // Wholegrain or not is decided on what was logged: "Pasta" may match "Macaroni volkoren"
  const loggedName = normalizeSchijfName(item.naam);
  if (group === 'Aardappelen en knolgewassen' && !GRAIN_PATTERN.test(loggedName)) return { ...entry, bucket: 'graan_aardappel' };
  if (GRAIN_PATTERN.test(loggedName) || group === 'Brood' || group === 'Graanproducten en meelsoorten') {
    if (!WHOLEGRAIN_PATTERN.test(loggedName) || REFINED_NAME_PATTERN.test(loggedName)) {
      return { ...outside, reason: 'Geen volkoren: witte varianten van brood, rijst en pasta vallen buiten de Schijf.' };
    }
    return { ...entry, bucket: BREAD_BREAKFAST_PATTERN.test(loggedName) ? 'volkoren_brood' : 'graan_aardappel' };
  }
  return { ...entry, bucket: 'ignored', reason: match ? 'Geen duidelijke Schijf-categorie gevonden.' : 'Geen betrouwbare productmatch.' };
}

function emptyTotals(keys) {
  return Object.fromEntries(keys.map(key => [key, 0]));
}

export function collectDay(day) {
  const dayKeys = ['groente', 'fruit', 'volkoren_brood', 'graan_aardappel', 'zuivel_alt', 'kaas', 'vetten_olie', 'noten', 'dranken'];
  const weekKeys = Object.keys(WEEK_TARGETS_2026);
  const totals = emptyTotals([...dayKeys, ...weekKeys]);
  const items = Object.fromEntries([...dayKeys, ...weekKeys, 'outside', 'ignored'].map(key => [key, []]));
  let analysedCalories = 0;
  let outsideCalories = 0;

  for (const meal of MEAL_NAMES) {
    for (const item of (day?.[meal] || [])) {
      const classified = classifyItem(item);
      classified.maaltijdLabel = MEAL_LABELS[meal] || meal;
      const amount = classified.amount || 0;
      if (classified.bucket === 'rood_vlees') {
        totals.rood_vlees += amount;
        totals.vlees += amount;
        items.rood_vlees.push(classified);
        items.vlees.push(classified);
        analysedCalories += classified.kcal || 0;
      } else if (classified.bucket in totals && amount) {
        totals[classified.bucket] += amount;
        items[classified.bucket].push(classified);
        analysedCalories += classified.kcal || 0;
      } else if (classified.bucket === 'outside') {
        items.outside.push(classified);
        outsideCalories += classified.kcal || 0;
        analysedCalories += classified.kcal || 0;
      } else {
        items.ignored.push(classified.bucket === 'ignored' ? classified
          : { ...classified, reason: 'Wel herkend, maar zonder hoeveelheid niet mee te tellen.' });
      }
    }
  }
  return { totals, items, analysedCalories, outsideCalories, totalCalories: Math.round(dayTotals(day).cals || 0) };
}

// Advised amounts are a target; for cheese, fats, nuts and dairy far more is not better either.
// Above `boven` a part loses up to half its score (at twice that amount).
function partRatio(part, totals) {
  const amount = totals[part.key] || 0;
  const ratio = Math.min(amount / part.doel, 1);
  if (!part.boven || amount <= part.boven) return ratio;
  return ratio * (1 - Math.min(0.5, (amount - part.boven) / part.boven / 2));
}

export function isAboveAdvice(part, totals) {
  return Boolean(part.boven) && (totals[part.key] || 0) > part.boven;
}

function ratioForMeta(meta, totals) {
  if (meta.parts) {
    return meta.parts.reduce((sum, part) => sum + partRatio(part, totals), 0) / meta.parts.length;
  }
  if (meta.boven) return partRatio(meta, totals);
  const ratio = (totals[meta.key] || 0) / meta.doel;
  return meta.max ? (ratio <= 1 ? 1 : Math.max(0, 1 - ((ratio - 1) * 0.7))) : Math.min(ratio, 1);
}

function wedgePath(cx, cy, r, startDeg, endDeg) {
  const start = polar(cx, cy, r, startDeg);
  const end = polar(cx, cy, r, endDeg);
  const largeArc = endDeg - startDeg <= 180 ? 0 : 1;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
}

function polar(cx, cy, r, deg) {
  const rad = (deg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function renderSchijfVisual(metas, totals, score) {
  const entries = Object.entries(metas);
  const slice = 360 / entries.length;
  return `<div class="schijf2026-visual" aria-label="Schijf van Vijf 2026 score ${score}%">
    <svg viewBox="-18 -18 256 256" role="img">
      ${entries.map(([key, meta], idx) => {
        const start = idx * slice;
        const end = start + slice - 1.2;
        const ratio = ratioForMeta({ ...meta, key }, totals);
        const fillRadius = 96 * Math.sqrt(Math.max(0.04, ratio));
        const labelPoint = polar(110, 110, 70, start + slice / 2);
        return `
          <path d="${wedgePath(110, 110, 96, start, end)}" fill="${meta.color}" opacity="0.18"></path>
          <path d="${wedgePath(110, 110, fillRadius, start, end)}" fill="${meta.color}" opacity="${ratio >= 0.8 ? '0.95' : '0.72'}"></path>
          <text x="${labelPoint.x}" y="${labelPoint.y}" text-anchor="middle" dominant-baseline="middle" class="schijf2026-slice-label">${Math.round(ratio * 100)}%</text>`;
      }).join('')}
      <circle cx="110" cy="110" r="45" fill="var(--surface-strong)" stroke="var(--border)" stroke-width="1"></circle>
      <text x="110" y="106" text-anchor="middle" class="schijf2026-score">${score}%</text>
      <text x="110" y="126" text-anchor="middle" class="schijf2026-score-label">score</text>
    </svg>
  </div>`;
}

// One row per part ("Groente" and "Fruit" separately), coloured like their box in the pie
function rowsFor(metas) {
  return Object.entries(metas).flatMap(([key, meta]) => (meta.parts || [{ key }]).map(part => ({
    key: part.key,
    naam: part.naam || meta.naam,
    icon: part.icon || meta.icon,
    doel: part.doel || meta.doel,
    color: meta.color,
    max: Boolean(meta.max),
    boven: part.boven || 0,
    unit: part.key === 'dranken' || part.key === 'zuivel_alt' ? 'ml' : (meta.unit === 'st' ? 'st' : 'g'),
  })));
}

function amountText(amount, unit) {
  return `${Math.round(amount || 0)}${unit === 'st' ? ' st' : unit}`;
}

// What a row is based on: the logged products, with amount, meal and the matched product
function renderRowSources(row, items) {
  const list = items[row.key] || [];
  const rows = list.length
    ? list.map(item => `<li>
        <span>${esc(item.naam)} <small>${esc([item.dag, String(item.maaltijdLabel || '').replace(/^[^\s]+\s/, '')].filter(Boolean).join(' · '))}</small>
        ${item.matchedName && item.matchedName !== item.naam ? `<small class="s26-match">→ ${esc(item.matchedName)}</small>` : ''}</span>
        <strong>${amountText(item.amount, row.unit)}</strong>
      </li>`).join('')
    : '<li class="s26-none">Nog niets</li>';
  return `<div class="s26-row-sources"><ul class="s26-sources">${rows}</ul></div>`;
}

function renderRows(metas, totals, items = {}) {
  return rowsFor(metas).map(row => {
    const ratio = Math.round(ratioForMeta({ key: row.key, doel: row.doel, max: row.max, boven: row.boven }, totals) * 100);
    const above = isAboveAdvice(row, totals);
    const tone = above ? 'over' : ratio >= 80 ? 'ok' : ratio >= 45 ? 'warn' : 'bad';
    const fill = Math.min(100, Math.round(((totals[row.key] || 0) / row.doel) * 100));
    return `<details class="schijf2026-row-details">
      <summary class="schijf2026-row ${tone}">
        <span class="s26-row-label"><i style="background:${row.color}"></i><em>${esc(row.icon || '')} ${esc(row.naam)}</em></span>
        <strong>${above ? '<small class="s26-over">boven advies</small>' : ''}${Math.round(totals[row.key] || 0)}/${amountText(row.doel, row.unit)}${row.max ? ' max' : ''}<b class="s26-chevron" aria-hidden="true"></b></strong>
        <span class="s26-row-bar"><span class="${row.max && fill >= 100 ? 'bad' : tone}" style="width:${fill}%"></span></span>
      </summary>
      ${renderRowSources(row, items)}
    </details>`;
  }).join('') + '<p class="s26-hint">Tik op een regel om te zien welke producten meetellen. Hoort een product niet in een vak? Meld het via "Klopt niet?" bij het product.</p>';
}

function scoreFromMetas(metas, totals, outsideShare = 0) {
  const entries = Object.entries(metas);
  const positiveEntries = entries.filter(([, meta]) => !meta.max);
  const baseEntries = positiveEntries.length ? positiveEntries : entries;
  const avg = baseEntries.reduce((sum, [key, meta]) => sum + ratioForMeta({ ...meta, key }, totals), 0) / baseEntries.length;
  const maxPenalty = entries
    .filter(([, meta]) => meta.max)
    .reduce((penalty, [key, meta]) => {
      const overRatio = Math.max(0, ((totals[key] || 0) - meta.doel) / meta.doel);
      return penalty + Math.min(overRatio * 0.25, 0.25);
    }, 0);
  return Math.max(0, Math.round(avg * 100 * (1 - Math.min(outsideShare, 0.5) * 0.35 - Math.min(maxPenalty, 0.45))));
}

function uniqueNames(items) {
  return [...new Set((items || []).map(item => item.naam).filter(Boolean))];
}

function countVariety(itemsByKey, keys) {
  return uniqueNames(keys.flatMap(key => itemsByKey[key] || [])).length;
}

// Missing amounts: { amount, text, scope } so the amount can be shown as a chip
function portionSuggestions(dayCollected, weekCollected, microNotes = []) {
  const suggestions = [];
  const groenteLeft = Math.max(0, 250 - (dayCollected.totals.groente || 0));
  const fruitLeft = Math.max(0, 200 - (dayCollected.totals.fruit || 0));
  const drinkLeft = Math.max(0, 1600 - (dayCollected.totals.dranken || 0));
  const plantLeft = Math.max(0, 250 - (weekCollected.totals.plant_eiwit || 0));
  const visLeft = Math.max(0, 100 - (weekCollected.totals.vis || 0));
  if (groenteLeft > 0) suggestions.push({ amount: `${Math.round(groenteLeft)}g`, text: 'groente: extra rauwkost, roerbakgroente of soep', scope: 'vandaag' });
  if (fruitLeft > 0) suggestions.push({ amount: `${Math.round(fruitLeft)}g`, text: 'fruit: meestal 1-2 stuks', scope: 'vandaag' });
  if (drinkLeft > 0) suggestions.push({ amount: `${Math.round(drinkLeft)}ml`, text: 'water, thee of koffie zonder suiker', scope: 'vandaag' });
  if (plantLeft > 0) suggestions.push({ amount: `${Math.round(plantLeft)}g`, text: 'peulvruchten, tofu of tempé', scope: 'deze week' });
  if (visLeft > 0) suggestions.push({ amount: `${Math.round(visLeft)}g`, text: 'vis, liefst vette vis: anders krijg je weinig omega-3', scope: 'deze week' });
  if ((weekCollected.totals.vlees || 0) > 300) suggestions.push({ amount: '−', text: 'vlees zit boven de weekrichtlijn: kies een plantaardige maaltijd als ruil', scope: 'deze week' });
  for (const part of DAY_TARGETS_2026.eiwit_zuivel.parts.concat(DAY_TARGETS_2026.vetten_noten.parts)) {
    if (isAboveAdvice(part, dayCollected.totals)) {
      suggestions.unshift({ amount: `${Math.round(dayCollected.totals[part.key])}${part.key === 'zuivel_alt' ? 'ml' : 'g'}`, over: true, text: `${part.naam.toLowerCase()}: ruim boven de ${part.doel}${part.key === 'zuivel_alt' ? 'ml' : 'g'} die de Schijf adviseert`, scope: 'vandaag' });
    }
  }
  return suggestions.slice(0, 5).concat(microNotes.slice(0, 3));
}

function swapSuggestions(dayCollected, weekCollected) {
  const swaps = [];
  const refined = uniqueNames(dayCollected.items.outside.filter(item => /Geen volkoren/.test(item.reason || '')));
  if (refined.length) swaps.push({ from: refined.slice(0, 2).join(', '), to: 'de volkoren variant: volkorenbrood, zilvervliesrijst of volkoren pasta' });
  else if ((dayCollected.totals.volkoren_brood || 0) + (dayCollected.totals.graan_aardappel || 0) < 250) swaps.push({ from: 'Wit brood, witte rijst', to: 'volkorenbrood, havermout, zilvervliesrijst of volkoren pasta' });
  if ((weekCollected.totals.plant_eiwit || 0) < 250) swaps.push({ from: 'Een vleesmoment', to: 'linzen, kikkererwten, tofu of tempeh' });
  if ((dayCollected.totals.noten || 0) < 30) swaps.push({ from: 'Een zoete snack', to: 'een klein handje ongezouten noten' });
  if (isAboveAdvice({ key: 'kaas', boven: 40 }, dayCollected.totals)) swaps.push({ from: 'Een deel van de kaas', to: 'hüttenkäse, hummus of groente op brood' });
  const otherOutside = uniqueNames(dayCollected.items.outside).filter(naam => !refined.includes(naam));
  if (otherOutside.length) swaps.push({ from: otherOutside.slice(0, 2).join(', '), to: 'een Schijf-alternatief waar dat kan' });
  return swaps.slice(0, 4);
}

function emptyNote(text) {
  return `<div class="schijf2026-empty">${esc(text)}</div>`;
}

function statBar(label, pct, tone) {
  const width = Math.max(0, Math.min(100, pct));
  return `<div class="s26-bar">
    <div class="s26-bar-head"><span>${esc(label)}</span><strong>${pct}%</strong></div>
    <div class="s26-bar-track"><div class="s26-bar-fill ${tone}" style="width:${width}%"></div></div>
  </div>`;
}

function renderInsights(dayCollected, weekCollected, dayOutsideShare, weekOutsideShare, microNotes = []) {
  const dayVariety = countVariety(dayCollected.items, ['groente', 'fruit', 'volkoren_brood', 'graan_aardappel', 'zuivel_alt', 'kaas', 'vetten_olie', 'noten']);
  const weekVariety = countVariety(weekCollected.items, ['plant_eiwit', 'vis', 'eieren', 'vlees']);
  const dayCoverage = dayCollected.totalCalories ? Math.round((dayCollected.analysedCalories / dayCollected.totalCalories) * 100) : 0;
  const dayOutside = Math.round(dayOutsideShare * 100);
  const weekOutside = Math.round(weekOutsideShare * 100);
  const weekLimitNotes = [];
  if ((weekCollected.totals.vlees || 0) > 300) weekLimitNotes.push(`Vlees totaal: ${Math.round(weekCollected.totals.vlees)}g / max. 300g.`);
  if ((weekCollected.totals.rood_vlees || 0) > 100) weekLimitNotes.push(`Rood vlees: ${Math.round(weekCollected.totals.rood_vlees)}g / max. 100g.`);
  const missing = portionSuggestions(dayCollected, weekCollected, microNotes);
  const swaps = swapSuggestions(dayCollected, weekCollected);
  const outsideTone = pct => pct >= 30 ? 'bad' : pct >= 15 ? 'warn' : 'ok';

  return `
    <div class="schijf2026-insight-grid">
      <section class="schijf2026-card s26-insight">
        <h3><span class="s26-icon">🎯</span>Wat mist nog?</h3>
        ${missing.length ? `<ul class="s26-list">${missing.map(item => `<li>
          <span class="s26-chip${item.over ? ' is-over' : ''}${item.low ? ' is-low' : ''}">${item.over || item.low ? '' : '+'}${esc(item.amount)}</span>
          <span>${esc(item.text)}<small>${esc(item.scope)}</small></span>
        </li>`).join('')}</ul>` : emptyNote('Geen duidelijke tekorten gevonden.')}
      </section>
      <section class="schijf2026-card s26-insight">
        <h3><span class="s26-icon">🔄</span>Ruilsuggesties</h3>
        ${swaps.length ? `<ul class="s26-list s26-swaps">${swaps.map(swap => `<li>
          <span><span class="s26-from">${esc(swap.from)}</span><span class="s26-arrow" aria-hidden="true">→</span>${esc(swap.to)}</span>
        </li>`).join('')}</ul>` : emptyNote('Geen ruilsuggesties op basis van de huidige invoer.')}
      </section>
      <section class="schijf2026-card s26-insight">
        <h3><span class="s26-icon">🌈</span>Variatie</h3>
        <div class="s26-stats">
          <div class="s26-stat"><strong>${dayVariety}</strong><span>Schijf-producten vandaag</span></div>
          <div class="s26-stat"><strong>${weekVariety}</strong><span>eiwitbronnen deze week</span></div>
        </div>
      </section>
      <section class="schijf2026-card s26-insight">
        <h3><span class="s26-icon">📏</span>Betrouwbaarheid</h3>
        ${statBar('Calorieën meegenomen', dayCoverage, dayCoverage >= 70 ? 'ok' : dayCoverage >= 45 ? 'warn' : 'bad')}
        ${statBar('Buiten Schijf vandaag', dayOutside, outsideTone(dayOutside))}
        ${statBar('Buiten Schijf deze week', weekOutside, outsideTone(weekOutside))}
        <div class="s26-note ${weekLimitNotes.length ? 'bad' : ''}">${weekLimitNotes.length ? weekLimitNotes.map(esc).join('<br>') : '✓ Weeklimieten vlees en rood vlees niet overschreden'}</div>
      </section>
    </div>`;
}

function getWeekKeys(baseKey) {
  const base = new Date(baseKey + 'T12:00:00');
  const day = base.getDay() || 7;
  const monday = new Date(base);
  monday.setDate(base.getDate() - day + 1);
  return Array.from({ length: 7 }, (_, idx) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + idx);
    return dateKey(d);
  });
}

async function loadWeekCollections() {
  const keys = getWeekKeys(currentDate);
  const days = await Promise.all(keys.map(async key => localData[key] || await loadDay(key)));
  const totals = emptyTotals(Object.keys(WEEK_TARGETS_2026));
  const items = Object.fromEntries([...Object.keys(WEEK_TARGETS_2026), 'outside', 'ignored'].map(key => [key, []]));
  let analysedCalories = 0;
  let outsideCalories = 0;
  days.forEach((day, idx) => {
    const collected = collectDay(day);
    const dag = new Date(keys[idx] + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'short' });
    Object.keys(totals).forEach(key => { totals[key] += collected.totals[key] || 0; });
    Object.keys(items).forEach(key => { items[key].push(...(collected.items[key] || []).map(item => ({ ...item, dag }))); });
    analysedCalories += collected.analysedCalories;
    outsideCalories += collected.outsideCalories;
  });
  return { keys, days, totals, items, analysedCalories, outsideCalories };
}

function bestNextStep(dayCollected, weekCollected) {
  if ((dayCollected.totals.groente || 0) < 250) return `Nog ${Math.round(250 - (dayCollected.totals.groente || 0))}g groente vandaag.`;
  if ((dayCollected.totals.fruit || 0) < 200) return `Nog ${Math.round(200 - (dayCollected.totals.fruit || 0))}g fruit vandaag.`;
  if ((weekCollected.totals.plant_eiwit || 0) < 250) return `Deze week nog ${Math.round(250 - (weekCollected.totals.plant_eiwit || 0))}g peulvruchten, tofu of tempé.`;
  if ((weekCollected.totals.vlees || 0) > 300) return 'Vlees zit deze week boven de 2026-richtlijn; kies de rest van de week plantaardig of vis.';
  return 'Blijf variëren binnen de vakken; vooral volkoren, groente en plantaardige eiwitten zijn goede ankers.';
}

// The pie has one slice per row, so slices and rows below always match
function rowMetas(metas) {
  return Object.fromEntries(rowsFor(metas).map(row => [row.key, row]));
}

// Micronutrients today, and a week average over the logged days for "Wat mist nog?"
export function microSummary(day, weekDays = []) {
  const dayMicro = microFromDay(day);
  const logged = weekDays.filter(d => MEAL_NAMES.some(meal => (d?.[meal] || []).length));
  const notes = [];
  if (logged.length >= 2) {
    const sums = Object.fromEntries(Object.keys(RDA).map(key => [key, 0]));
    for (const d of logged) {
      const { totals } = microFromDay(d);
      for (const key of Object.keys(sums)) sums[key] += totals[key] || 0;
    }
    for (const [key, meta] of Object.entries(RDA)) {
      const pct = Math.round((sums[key] / logged.length / meta.doel) * 100);
      if (pct < 50) notes.push({ pct, amount: `${pct}%`, low: true, text: `${meta.naam.toLowerCase()}: gemiddeld te weinig (${meta.bronnen.toLowerCase()})`, scope: `deze week, ${logged.length} dagen` });
    }
    notes.sort((a, b) => a.pct - b.pct);
  }
  return { day: dayMicro, notes };
}

function listEntry(item) {
  return { ...item, gram: item.bucket === 'eieren' ? null : item.amount };
}

export async function renderSchijf2026Analyse() {
  const body = document.getElementById('advies-body');
  if (!body) return;
  body.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--muted)">Schijf van Vijf analyseren...</div>';

  const day = localData[currentDate] || await loadDay(currentDate);
  const dayCollected = collectDay(day);
  const weekCollected = await loadWeekCollections();
  const dayOutsideShare = dayCollected.analysedCalories ? dayCollected.outsideCalories / dayCollected.analysedCalories : 0;
  const weekOutsideShare = weekCollected.analysedCalories ? weekCollected.outsideCalories / weekCollected.analysedCalories : 0;
  const dayScore = scoreFromMetas(DAY_TARGETS_2026, dayCollected.totals, dayOutsideShare);
  const weekScore = scoreFromMetas(WEEK_TARGETS_2026, weekCollected.totals, weekOutsideShare);
  const dayCoverage = dayCollected.totalCalories ? Math.round((dayCollected.analysedCalories / dayCollected.totalCalories) * 100) : 0;
  const dayScoreColor = dayScore >= 70 ? 'var(--green)' : dayScore >= 40 ? '#e8a020' : 'var(--danger)';
  const weekScoreColor = weekScore >= 70 ? 'var(--green)' : weekScore >= 40 ? '#e8a020' : 'var(--danger)';
  const coverageColor = dayCoverage >= 70 ? 'var(--green)' : dayCoverage >= 45 ? '#e8a020' : 'var(--danger)';

  const micro = microSummary(day, weekCollected.days);
  body.innerHTML = `
    <div class="schijf2026-kpis">
      <div class="schijf2026-kpi">
        <div>Vandaag</div>
        <strong style="color:${dayScoreColor}">${dayScore}%</strong>
      </div>
      <div class="schijf2026-kpi">
        <div>Deze week</div>
        <strong style="color:${weekScoreColor}">${weekScore}%</strong>
      </div>
      <div class="schijf2026-kpi">
        <div>Analyse-dekking</div>
        <strong style="color:${coverageColor}">${dayCoverage}%</strong>
      </div>
    </div>
    <div class="setup-hint" style="margin-bottom:1rem">
      Op basis van de vernieuwde Schijf van Vijf (2026), profiel volwassenen 18-50 met vlees en vis. Weekadviezen worden over maandag t/m zondag berekend. Producten die niet betrouwbaar te plaatsen zijn, laten we bewust buiten de analyse.
    </div>
    <section class="schijf2026-info">
      <h3>Waarom dag en week verschillen</h3>
      <p><strong>Vandaag</strong> kijkt naar dagelijkse basisvakken: groente, fruit, volkoren/aardappel, zuivel/kaas, gezonde vetten/noten en dranken zonder suiker.</p>
      <p><strong>Deze week</strong> kijkt naar adviezen die je niet elke dag hoeft te halen: peulvruchten/tofu/tempé, vis, eieren en limieten voor vlees en rood vlees. Een weekscore kan dus laag zijn op maandag, ook als je dag er prima uitziet.</p>
    </section>
    <div class="schijf2026-grid">
      <section class="schijf2026-card">
        <div class="schijf2026-head"><h3>Vandaag</h3><span>${esc(currentDate)}</span></div>
        ${renderSchijfVisual(rowMetas(DAY_TARGETS_2026), dayCollected.totals, dayScore)}
        ${renderRows(DAY_TARGETS_2026, dayCollected.totals, dayCollected.items)}
      </section>
      <section class="schijf2026-card">
        <div class="schijf2026-head"><h3>Deze week</h3><span>${esc(weekCollected.keys[0])} t/m ${esc(weekCollected.keys[6])}</span></div>
        ${renderSchijfVisual(rowMetas(WEEK_TARGETS_2026), weekCollected.totals, weekScore)}
        ${renderRows(WEEK_TARGETS_2026, weekCollected.totals, weekCollected.items)}
      </section>
    </div>
    <section class="schijf2026-card schijf2026-focus">
      <h3>Beste volgende stap</h3>
      <p>${esc(bestNextStep(dayCollected, weekCollected))}</p>
      <div class="schijf2026-note">Buiten-Schijf aandeel: vandaag ${Math.round(dayOutsideShare * 100)}%, deze week ${Math.round(weekOutsideShare * 100)}% van de herkende calorieën.</div>
      <a class="schijf2026-source-link" href="https://www.voedingscentrum.nl/nl/gezond-eten-met-de-schijf-van-vijf.aspx" target="_blank" rel="noopener noreferrer">Bekijk de Schijf van Vijf bij het Voedingscentrum</a>
    </section>
    ${renderInsights(dayCollected, weekCollected, dayOutsideShare, weekOutsideShare, micro.notes)}
    <section class="schijf2026-card schijf2026-list">
      <h3 style="color:${dayCollected.items.outside.length ? 'var(--danger)' : 'var(--green)'}">Buiten Schijf van Vijf</h3>
      ${renderItemList(dayCollected.items.outside.map(listEntry), 'Geen duidelijk buiten-Schijf producten gevonden in de herkende set.')}
    </section>
    <section class="schijf2026-card schijf2026-list">
      <h3>Niet meegenomen in analyse</h3>
      ${renderItemList(dayCollected.items.ignored.map(listEntry), 'Alles wat we herkenden viel in de analyse of buiten-Schijf-set.')}
    </section>
    <section class="schijf2026-card schijf2026-list">
      <h3>Vitamines en mineralen vandaag</h3>
      ${micro.day.measured.length + micro.day.estimated.length ? microDashboardHTML(micro.day.totals, 'Berekend uit je invoer', true) : '<div class="schijf2026-empty">Nog niets ingevoerd vandaag.</div>'}
      ${micro.day.measured.length + micro.day.estimated.length ? `<div class="micro-disclaimer"><strong>${micro.day.measured.length}</strong> van ${micro.day.measured.length + micro.day.estimated.length} producten met waarden uit NEVO.${micro.day.estimated.length ? ` Geschat op productcategorie: ${esc(micro.day.estimated.slice(0, 5).join(', '))}${micro.day.estimated.length > 5 ? '…' : ''}.` : ''}</div>` : ''}
    </section>
  `;
}
