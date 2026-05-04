/* ── Schijf van Vijf 2026 Beta Analysis ───────────────────── */

import { currentDate, localData } from '../state.js';
import { MEAL_LABELS, MEAL_NAMES } from '../constants.js';
import { dateKey, dayTotals, esc, r1 } from '../utils.js';
import { loadDay } from '../supabase/data.js';
import { PORTION_ALIASES, matchItemToNevo } from '../products/matcher.js';

const DAY_TARGETS_2026 = {
  groente_fruit: { icon: '🥬', naam: 'Groente & fruit', doel: 450, unit: 'g', color: '#1f9e4b', parts: [{ key: 'groente', doel: 250, icon: '🥬', naam: 'Groente' }, { key: 'fruit', doel: 200, icon: '🍎', naam: 'Fruit' }] },
  graan_aardappel: { icon: '🌾', naam: 'Volkoren & aardappel', doel: 400, unit: 'g', color: '#b38a46', parts: [{ key: 'volkoren_brood', doel: 175, icon: '🌾', naam: 'Volkoren' }, { key: 'graan_aardappel', doel: 225, icon: '🥔', naam: 'Aardappel/graan' }] },
  eiwit_zuivel: { icon: '🥛', naam: 'Zuivel & eiwit', doel: 420, unit: 'g/ml', color: '#4fb58a', parts: [{ key: 'zuivel_alt', doel: 400, icon: '🥛', naam: 'Zuivel' }, { key: 'kaas', doel: 20, icon: '🧀', naam: 'Kaas' }] },
  vetten_noten: { icon: '🥑', naam: 'Gezonde vetten', doel: 80, unit: 'g', color: '#7fae4d', parts: [{ key: 'vetten_olie', doel: 50, icon: '🥑', naam: 'Vetten/olie' }, { key: 'noten', doel: 30, icon: '🥜', naam: 'Noten' }] },
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
const NUT_PATTERN = /\b(noot|noten|amandel|walnoot|cashew|pistache|hazelnoot|pinda|pompoenpit|zonnebloempit|chia|lijnzaad)\b/i;
const FAT_PATTERN = /\b(olijfolie|zonnebloemolie|koolzaadolie|lijnzaadolie|margarine|halvarine|olie)\b/i;
const WHOLEGRAIN_PATTERN = /\b(volkoren|wholegrain|whole grain|havermout|muesli|rogge|spelt)\b/i;
const GRAIN_POTATO_PATTERN = /\b(aardappel|aardappelen|krieltje|zilvervlies|bruine rijst|quinoa|bulgur|boekweit|pasta|rijst)\b/i;
const FRUIT_PATTERN = /\b(appel|peer|banaan|kiwi|aardbei|blauwe bes|druif|druiven|mandarijn|sinaasappel|mango|perzik|pruim|nectarine|ananas|meloen|fruit)\b/i;
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

function matchedGroup(product) {
  return String(product?._group || '').trim();
}

function classifyItem(item) {
  const match = matchItemToNevo({ foodName: item.naam, gram: null, count: 1, unit: null });
  const group = matchedGroup(match);
  const name = normalizeName(`${item.naam} ${match?.n || ''}`);
  const amount = parseLoggedItemAmount(item, match);
  const entry = {
    naam: item.naam,
    amount: amount ? Math.round(amount) : null,
    kcal: Math.round(item.kcal || 0),
    matchedName: match?.n || '',
    group,
  };

  if (SUGAR_DRINK_PATTERN.test(name)) return { ...entry, bucket: 'outside', reason: 'Drank met suiker/alcohol telt niet mee.' };
  if (WATER_DRINK_PATTERN.test(name) || group === 'Niet-alcoholische dranken') return { ...entry, bucket: 'dranken' };
  if (group === 'Groente' || VEG_PATTERN.test(name)) return { ...entry, bucket: 'groente' };
  if (group === 'Fruit' || FRUIT_PATTERN.test(name)) return { ...entry, bucket: 'fruit' };
  if (CHEESE_PATTERN.test(name) || group === 'Kaas') return { ...entry, bucket: 'kaas' };
  if (DAIRY_PATTERN.test(name) || group === 'Melk en melkproducten') return { ...entry, bucket: 'zuivel_alt' };
  if (NUT_PATTERN.test(name) || group === 'Noten en zaden') return { ...entry, bucket: 'noten' };
  if (FAT_PATTERN.test(name) || group === 'Vetten en oliën') return { ...entry, bucket: 'vetten_olie' };
  if (PLANT_PROTEIN_PATTERN.test(name) || group === 'Peulvruchten') return { ...entry, bucket: 'plant_eiwit' };
  if (FISH_PATTERN.test(name) || group === 'Vis, schaal- en schelpdieren') return { ...entry, bucket: 'vis' };
  if (EGG_PATTERN.test(name) || group === 'Eieren') return { ...entry, bucket: 'eieren', amount: Math.max(1, Math.round((amount || 60) / 60)) };
  if (RED_MEAT_PATTERN.test(name)) return { ...entry, bucket: 'rood_vlees' };
  if (MEAT_PATTERN.test(name) || group === 'Vlees en gevogelte') return { ...entry, bucket: 'vlees' };
  if (WHOLEGRAIN_PATTERN.test(name)) return { ...entry, bucket: 'volkoren_brood' };
  if (group === 'Brood' || group === 'Graanproducten en meelsoorten' || group === 'Aardappelen en knolgewassen' || GRAIN_POTATO_PATTERN.test(name)) return { ...entry, bucket: 'graan_aardappel' };
  return { ...entry, bucket: 'ignored', reason: match ? 'Niet scherp genoeg te plaatsen in Schijf 2026.' : 'Geen betrouwbare productmatch.' };
}

function emptyTotals(keys) {
  return Object.fromEntries(keys.map(key => [key, 0]));
}

function collectDay(day) {
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
        items.ignored.push(classified);
      }
    }
  }
  return { totals, items, analysedCalories, outsideCalories, totalCalories: Math.round(dayTotals(day).cals || 0) };
}

function ratioForMeta(meta, totals) {
  if (meta.parts) {
    return meta.parts.reduce((sum, part) => sum + Math.min((totals[part.key] || 0) / part.doel, 1), 0) / meta.parts.length;
  }
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
      <text x="110" y="126" text-anchor="middle" class="schijf2026-score-label">beta</text>
    </svg>
  </div>`;
}

function rowValue(meta, totals, key) {
  if (meta.parts) {
    return meta.parts.map(part => `${part.icon || ''} ${Math.round(totals[part.key] || 0)}/${part.doel}`).join(' · ');
  }
  return `${Math.round(totals[key] || 0)}/${meta.doel}`;
}

function renderRows(metas, totals) {
  return Object.entries(metas).map(([key, meta]) => {
    const ratio = Math.round(ratioForMeta({ ...meta, key }, totals) * 100);
    const tone = ratio >= 80 ? 'ok' : ratio >= 45 ? 'warn' : 'bad';
    return `<div class="schijf2026-row ${tone}">
      <span><i style="background:${meta.color}"></i>${esc(meta.icon || '')} ${esc(meta.naam)}</span>
      <strong>${rowValue(meta, totals, key)} ${esc(meta.unit)}</strong>
    </div>`;
  }).join('');
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

function portionSuggestions(dayCollected, weekCollected) {
  const suggestions = [];
  const groenteLeft = Math.max(0, 250 - (dayCollected.totals.groente || 0));
  const fruitLeft = Math.max(0, 200 - (dayCollected.totals.fruit || 0));
  const drinkLeft = Math.max(0, 1600 - (dayCollected.totals.dranken || 0));
  const plantLeft = Math.max(0, 250 - (weekCollected.totals.plant_eiwit || 0));
  const visLeft = Math.max(0, 100 - (weekCollected.totals.vis || 0));
  if (groenteLeft > 0) suggestions.push(`+${Math.round(groenteLeft)}g groente: extra rauwkost, roerbakgroente of soep.`);
  if (fruitLeft > 0) suggestions.push(`+${Math.round(fruitLeft)}g fruit: meestal 1-2 stuks.`);
  if (drinkLeft > 0) suggestions.push(`+${Math.round(drinkLeft)}ml water, thee of koffie zonder suiker.`);
  if (plantLeft > 0) suggestions.push(`Deze week nog +${Math.round(plantLeft)}g peulvruchten, tofu of tempé.`);
  if (visLeft > 0) suggestions.push(`Deze week nog ongeveer +${Math.round(visLeft)}g vis.`);
  if ((weekCollected.totals.vlees || 0) > 300) suggestions.push('Vlees zit boven de weekrichtlijn: kies een plantaardige maaltijd als ruil.');
  return suggestions.slice(0, 5);
}

function swapSuggestions(dayCollected, weekCollected) {
  const swaps = [];
  if ((dayCollected.totals.volkoren_brood || 0) + (dayCollected.totals.graan_aardappel || 0) < 250) swaps.push('Kies volkorenbrood, havermout, zilvervliesrijst of volkoren pasta in plaats van witte varianten.');
  if ((weekCollected.totals.plant_eiwit || 0) < 250) swaps.push('Ruil een vleesmoment voor linzen, kikkererwten, tofu of tempeh.');
  if ((dayCollected.totals.noten || 0) < 30) swaps.push('Ruil een zoete snack voor een klein handje ongezouten noten.');
  if (dayCollected.items.outside.length) swaps.push(`Bekijk buiten-Schijf producten zoals ${esc(uniqueNames(dayCollected.items.outside).slice(0, 2).join(', '))} en kies waar mogelijk een Schijf-alternatief.`);
  return swaps.slice(0, 4);
}

function renderSuggestionList(items, emptyText) {
  if (!items.length) return `<div class="schijf2026-empty">${esc(emptyText)}</div>`;
  return items.map(item => `<div class="schijf2026-suggestion">${esc(item)}</div>`).join('');
}

function renderInsights(dayCollected, weekCollected, dayOutsideShare, weekOutsideShare) {
  const dayVariety = countVariety(dayCollected.items, ['groente', 'fruit', 'volkoren_brood', 'graan_aardappel', 'zuivel_alt', 'kaas', 'vetten_olie', 'noten']);
  const weekVariety = countVariety(weekCollected.items, ['plant_eiwit', 'vis', 'eieren', 'vlees']);
  const dayCoverage = dayCollected.totalCalories ? Math.round((dayCollected.analysedCalories / dayCollected.totalCalories) * 100) : 0;
  const weekLimitNotes = [];
  if ((weekCollected.totals.vlees || 0) > 300) weekLimitNotes.push(`Vlees totaal: ${Math.round(weekCollected.totals.vlees)}g / max. 300g.`);
  if ((weekCollected.totals.rood_vlees || 0) > 100) weekLimitNotes.push(`Rood vlees: ${Math.round(weekCollected.totals.rood_vlees)}g / max. 100g.`);

  return `
    <div class="schijf2026-insight-grid">
      <section class="schijf2026-card">
        <h3>Wat mist nog?</h3>
        ${renderSuggestionList(portionSuggestions(dayCollected, weekCollected), 'Voor deze beta zijn er geen duidelijke tekorten gevonden.')}
      </section>
      <section class="schijf2026-card">
        <h3>Ruilsuggesties</h3>
        ${renderSuggestionList(swapSuggestions(dayCollected, weekCollected), 'Geen logische ruilsuggesties gevonden op basis van de huidige invoer.')}
      </section>
      <section class="schijf2026-card">
        <h3>Variatie</h3>
        <div class="schijf2026-suggestion">Vandaag ${dayVariety} verschillende Schijf-producten herkend.</div>
        <div class="schijf2026-suggestion">Deze week ${weekVariety} verschillende week-eiwitbronnen herkend.</div>
      </section>
      <section class="schijf2026-card">
        <h3>Betrouwbaarheid</h3>
        <div class="schijf2026-suggestion">${dayCoverage}% van dagens calorieën kon worden meegenomen.</div>
        <div class="schijf2026-suggestion">Buiten-Schijf aandeel: vandaag ${Math.round(dayOutsideShare * 100)}%, week ${Math.round(weekOutsideShare * 100)}%.</div>
        ${weekLimitNotes.length ? renderSuggestionList(weekLimitNotes, '') : '<div class="schijf2026-suggestion">Weeklimieten voor vlees/rood vlees zijn nog niet overschreden.</div>'}
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
  days.forEach(day => {
    const collected = collectDay(day);
    Object.keys(totals).forEach(key => { totals[key] += collected.totals[key] || 0; });
    Object.keys(items).forEach(key => { items[key].push(...(collected.items[key] || [])); });
    analysedCalories += collected.analysedCalories;
    outsideCalories += collected.outsideCalories;
  });
  return { keys, totals, items, analysedCalories, outsideCalories };
}

function bestNextStep(dayCollected, weekCollected) {
  if ((dayCollected.totals.groente || 0) < 250) return `Nog ${Math.round(250 - (dayCollected.totals.groente || 0))}g groente vandaag.`;
  if ((dayCollected.totals.fruit || 0) < 200) return `Nog ${Math.round(200 - (dayCollected.totals.fruit || 0))}g fruit vandaag.`;
  if ((weekCollected.totals.plant_eiwit || 0) < 250) return `Deze week nog ${Math.round(250 - (weekCollected.totals.plant_eiwit || 0))}g peulvruchten, tofu of tempé.`;
  if ((weekCollected.totals.vlees || 0) > 300) return 'Vlees zit deze week boven de 2026-richtlijn; kies de rest van de week plantaardig of vis.';
  return 'Blijf variëren binnen de vakken; vooral volkoren, groente en plantaardige eiwitten zijn goede ankers.';
}

export async function renderSchijf2026Analyse() {
  const body = document.getElementById('advies-body');
  if (!body) return;
  body.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--muted)">Schijf 2026 beta analyseren...</div>';

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
      Beta op basis van de vernieuwde Schijf van Vijf 2026. Eerste profiel: volwassenen 18-50 met vlees en vis. Weekadviezen worden over maandag t/m zondag berekend.
    </div>
    <div class="schijf2026-grid">
      <section class="schijf2026-card">
        <div class="schijf2026-head"><h3>Vandaag</h3><span>${esc(currentDate)}</span></div>
        ${renderSchijfVisual(DAY_TARGETS_2026, dayCollected.totals, dayScore)}
        ${renderRows(DAY_TARGETS_2026, dayCollected.totals)}
      </section>
      <section class="schijf2026-card">
        <div class="schijf2026-head"><h3>Deze week</h3><span>${esc(weekCollected.keys[0])} t/m ${esc(weekCollected.keys[6])}</span></div>
        ${renderSchijfVisual(WEEK_TARGETS_2026, weekCollected.totals, weekScore)}
        ${renderRows(WEEK_TARGETS_2026, weekCollected.totals)}
      </section>
    </div>
    <section class="schijf2026-card schijf2026-focus">
      <h3>Beste volgende stap</h3>
      <p>${esc(bestNextStep(dayCollected, weekCollected))}</p>
      <div class="schijf2026-note">Buiten-Schijf aandeel: vandaag ${Math.round(dayOutsideShare * 100)}%, deze week ${Math.round(weekOutsideShare * 100)}% van de herkende calorieën.</div>
      <a class="schijf2026-source-link" href="https://www.voedingscentrum.nl/nl/gezond-eten-met-de-schijf-van-vijf.aspx" target="_blank" rel="noopener noreferrer">Bekijk de Schijf van Vijf bij het Voedingscentrum</a>
    </section>
    ${renderInsights(dayCollected, weekCollected, dayOutsideShare, weekOutsideShare)}
  `;
}
