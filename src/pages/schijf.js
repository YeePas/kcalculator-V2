/* ── Schijf van Vijf Analysis ─────────────────────────────── */

import { goals, nevoData, nevoReady } from '../state.js';
import { dayTotals, esc } from '../utils.js';
import { MEAL_NAMES, MEAL_LABELS } from '../constants.js';
import { PORTION_ALIASES, matchItemToNevo } from '../products/matcher.js';

export const SCHIJF_CATEGORY_META = {
  groente: { icon: '🥬', naam: 'Groente', doel: 250, unit: 'g', accent: 'var(--green)' },
  fruit: { icon: '🍎', naam: 'Fruit', doel: 200, unit: 'g', accent: '#67b84f' },
  volkoren: { icon: '🌾', naam: 'Volkoren', doel: 150, unit: 'g', accent: '#b38a46' },
  zuivel: { icon: '🥛', naam: 'Zuivel', doel: 250, unit: 'g', accent: 'var(--blue)' },
  eiwit: { icon: '🍳', naam: 'Eiwitbronnen', doel: 100, unit: 'g', accent: '#4fb58a' },
  onverzadigd_vet: { icon: '🥑', naam: 'Gezonde vetten', doel: 15, unit: 'g', accent: '#7fae4d' },
};

const POSITIVE_GROUP_MATCHERS = [
  { category: 'groente', groups: ['Groente'], names: /.*/ },
  { category: 'fruit', groups: ['Fruit'], names: /^(?!.*sap)(?!.*smoothie)(?!.*kokos)(?!.*kokosnoot).+/ },
  { category: 'volkoren', groups: ['Brood', 'Graanproducten en meelsoorten'], names: /volkoren|wholegrain|whole grain|bruinbrood|tarwebrood volkoren|rogge|haver|havermout|muesli|quinoa|zilvervlies|zilvervliesrijst|bruine rijst|brown rice|brown basmati|wholegrain basmati|whole grain basmati|volkoren basmati|bulgur|boekweit|spelt/ },
  { category: 'volkoren', groups: ['Aardappelen en knolgewassen'], names: /^(?!.*chips)(?!.*frit)(?!.*kroket)(?!.*patat)(?!.*rosti)(?!.*gefrituur)(?!.*aardappelsalade).+/ },
  { category: 'zuivel', groups: ['Melk en melkproducten', 'Kaas'], names: /melk|karnemelk|kwark|skyr|yoghurt|yoghurt naturel|magere yoghurt|halfvolle melk|kaas|cottage cheese|huttenkase|mozzarella|ricotta/ },
  { category: 'zuivel', groups: ['Vleesvervangers en zuivelvervangers'], names: /sojadrink|sojamelk|sojayoghurt|soja drink|soja melk/ },
  { category: 'eiwit', groups: ['Peulvruchten', 'Vis, schaal- en schelpdieren', 'Eieren'], names: /.*/ },
  { category: 'eiwit', groups: ['Vleesvervangers en zuivelvervangers'], names: /tofu|tempeh|tempe|vegetar|vega|soja|edamame|linzen|kikkererwt|bonen/ },
  { category: 'eiwit', groups: ['Vlees en gevogelte'], names: /kip|kipfilet|kippenborst|kalkoen|kalkoenfilet|filet|biefstuk|runderlap|rundertartaar|ossenhaas|varkensfilet|varkenshaas|kalfsvlees|lamsfilet|lamsbout|magere/ },
  { category: 'onverzadigd_vet', groups: ['Noten en zaden'], names: /noten|amandel|walnoot|cashew|pistache|hazelnoot|pinda|pompoenpit|zonnebloempit|chia|lijnzaad/ },
  { category: 'onverzadigd_vet', groups: ['Vetten en oliën'], names: /olijf|zonnebloem|lijnzaad|koolzaad|sojaolie|maisolie|margarine|halvarine|plantaardig|bakken en braden|bak en braad|slaolie/ },
];

const NAME_FALLBACK_MATCHERS = [
  { category: 'zuivel', names: /\b(skyr|kwark|yoghurt|melk|karnemelk|kaas|cottage cheese|huttenkase|mozzarella|ricotta|sojadrink|sojamelk|sojayoghurt)\b/ },
  { category: 'groente', names: /\b(groente|broccoli|spinazie|sla|komkommer|paprika|tomaat|wortel|courgette|bloemkool|boerenkool|andijvie|prei|sperziebonen|snijbonen|aubergine)\b/ },
  { category: 'fruit', names: /\b(fruit|appel|peer|banaan|kiwi|blauwe bes|aardbei|druif|druiven|mandarijn|sinaasappel|mango|perzik|pruim|nectarine|ananas|meloen)\b/ },
  { category: 'volkoren', names: /\b(volkoren|wholegrain|whole grain|havermout|brinta|rogge|muesli|quinoa|zilvervlies|zilvervliesrijst|bruine rijst|brown rice|brown basmati|wholegrain basmati|whole grain basmati|volkoren basmati|aardappel|aardappelen|pieper|krieltje|bulgur|boekweit|spelt)\b/ },
  { category: 'eiwit', names: /\b(ei|eieren|kip|kipfilet|vis|zalm|tonijn|tofu|tempeh|tempe|linzen|bonen|kikkererwten|garnalen|mosselen|forel|sardine|makreel|kabeljauw|schol|tilapia)\b/ },
  { category: 'onverzadigd_vet', names: /\b(olijfolie|noten|walnoten|amandelen|cashewnoten|hazelnoten|amandel|walnoot|cashew|avocado|pinda|halvarine|margarine|zonnebloemolie)\b/ },
];

const OUTSIDE_GROUPS = new Set([
  'Alcoholische dranken',
  'Gebak en koek',
  'Hartig broodbeleg',
  'Hartige sauzen',
  'Hartige snacks en zoutjes',
  'Suiker, snoep, zoet beleg en zoete sauzen',
  'Vleeswaren',
]);

const OUTSIDE_NAME_PATTERN = /chips|koek|cake|taart|gebak|croissant|donut|frisdrank|cola|energy drink|snoep|chocolade|chocolonely|\w*reep\b|\bijs\b|roomijs|waterijs|milkshake|wijn|bier|cocktail|likeur|salami|bacon|spek|frituur|patat|saus|mayonaise|ketchup|dessert|vla|pudding|worst|hamburger|rookvlees|cervelaat|limo|siroop|leverworst|frikandel|knakworst|shoarma/;
const EXCLUDE_NAME_PATTERN = /sap|smoothie|supplement|poeder|vitamine|capsule|pil|saus|bouillon|kruidenmix|kruiden|specerijen/;
const SWEET_DAIRY_PATTERN = /vla|pudding|dessert|choco|vanillevla|room|slagroom|ijs|drinkyoghurt|yoghurtdrink|vruchtenyoghurt|(?<!half)volle melk|volle yoghurt|volle kwark|chocomel|fristi|optimel/;
const SALTED_NUTS_PATTERN = /gezouten|honing|karamel|choco|borrelnoten|gebrand gezouten|gesuikerd|kokos/;
const HARD_FAT_PATTERN = /roomboter|kokosolie|kokosvet|kokosroom|ghee|reuzel|palmvet|palmolie|boter(?!ham)|frituurvet/;
const DIRECT_CATEGORY_OVERRIDES = [
  { category: 'groente', names: /\b(spruiten|spruitjes)\b/ },
  { category: 'groente', names: /\b(aubergine)\b/ },
  { category: 'fruit', names: /\b(druif|druiven)\b/ },
  { category: 'volkoren', names: /\b(wholegrain|whole grain|brown rice|brown basmati|wholegrain basmati|whole grain basmati|volkoren basmati|zilvervliesrijst|zilvervlies rijst|bruine rijst)\b/ },
  { category: 'eiwit', names: /\b(kipdijfilet|kipdij|kipfilet|kippenborst)\b/ },
  { category: 'onverzadigd_vet', names: /\b(chia|chiazaad|chiazaadjes|lijnzaad)\b/ },
];

// What the user logged says it is refined, even when the closest product match is a mixed one
// ("Tarwemaisbrood wit" matching "Tarwebrood gem v bruin en volkoren").
const REFINED_NAME_PATTERN = /\bwit\b|\bwitte\b|witbrood|\bwit brood/;

const matchCache = new Map();
let categoryAliasCache = null;

const CATEGORY_ALIAS_STRIP_PATTERN = /\b(gekookt|rauw|gem|m schil|z schil|met schil|zonder schil|verse?|diepvries|blik|uit blik|pot|glas|gedroogd|gestoomd|gegrild|gebakken|geroosterd|ongeschild|geschild|naturel|ongezoet|ongezouten|mager|magere|halfvol|halfvolle|vol|volle)\b/g;

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getCategoryAliasMatches() {
  if (categoryAliasCache) return categoryAliasCache;

  const aliases = [];
  if (!(nevoReady && nevoData?.items?.length && Array.isArray(nevoData.groups))) {
    categoryAliasCache = aliases;
    return aliases;
  }

  for (const item of nevoData.items) {
    const group = item?.g !== undefined ? nevoData.groups[item.g] : '';
    const baseName = normalizeName(item.n)
      .replace(CATEGORY_ALIAS_STRIP_PATTERN, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!baseName || baseName.length < 3) continue;
    if (EXCLUDE_NAME_PATTERN.test(baseName)) continue;
    if (OUTSIDE_GROUPS.has(group) || OUTSIDE_NAME_PATTERN.test(baseName)) continue;

    let inferredCategory = null;
    for (const matcher of POSITIVE_GROUP_MATCHERS) {
      if (!matcher.groups.includes(group)) continue;
      if (!matcher.names.test(baseName)) continue;
      if (matcher.category === 'zuivel' && SWEET_DAIRY_PATTERN.test(baseName)) continue;
      if (matcher.category === 'onverzadigd_vet' && SALTED_NUTS_PATTERN.test(baseName)) continue;
      if (matcher.category === 'onverzadigd_vet' && HARD_FAT_PATTERN.test(baseName)) continue;
      inferredCategory = matcher.category;
      break;
    }

    if (!inferredCategory) continue;

    aliases.push({
      category: inferredCategory,
      alias: baseName,
    });
  }

  categoryAliasCache = aliases
    .sort((a, b) => b.alias.length - a.alias.length)
    .filter((entry, idx, arr) => arr.findIndex(other => other.category === entry.category && other.alias === entry.alias) === idx);

  return categoryAliasCache;
}

function singularizeUnit(unit) {
  return unit
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/en$/, '')
    .replace(/s$/, '');
}

function parseLoggedItemGram(item, matchedProduct) {
  if (Number.isFinite(item?._gram) && item._gram > 0) return item._gram;
  if (Number.isFinite(item?.ml) && item.ml > 0) return item.ml;

  const portion = String(item?.portie || '').trim().toLowerCase();
  if (portion) {
    let match = portion.match(/([\d.,]+)\s*(kg|gram|gr|g|ml|cl|dl|l)\b/);
    if (match) {
      const value = parseFloat(match[1].replace(',', '.'));
      const unit = match[2];
      if (Number.isFinite(value) && value > 0) {
        if (unit === 'kg') return value * 1000;
        if (unit === 'cl') return value * 10;
        if (unit === 'dl') return value * 100;
        if (unit === 'l') return value * 1000;
        return value;
      }
    }

    match = portion.match(/([\d.,]+)\s*x?\s*([a-zA-Z]+)/);
    if (match) {
      const count = parseFloat(match[1].replace(',', '.'));
      const unit = singularizeUnit(match[2]);
      const unitGram = PORTION_ALIASES[unit];
      if (Number.isFinite(count) && count > 0 && unitGram) {
        return count * unitGram;
      }
    }
  }

  if (matchedProduct?.k > 0 && item?.kcal > 0) {
    const inferredGram = (item.kcal / matchedProduct.k) * 100;
    if (Number.isFinite(inferredGram) && inferredGram > 5 && inferredGram < 1500) {
      return inferredGram;
    }
  }

  return null;
}

function getMatchedProduct(itemName) {
  const normalized = normalizeName(itemName);
  if (!normalized || normalized.length < 2) return null;
  if (matchCache.has(normalized)) return matchCache.get(normalized);

  const match = matchItemToNevo({ foodName: itemName, gram: null, count: 1, unit: null });
  if (!match) {
    matchCache.set(normalized, null);
    return null;
  }
  matchCache.set(normalized, match);
  return match;
}

function classifyDirectOverride(itemName) {
  const name = normalizeName(itemName);
  if (!name || EXCLUDE_NAME_PATTERN.test(name)) return null;
  for (const rule of DIRECT_CATEGORY_OVERRIDES) {
    if (rule.names.test(name)) return { type: 'category', category: rule.category, direct: true };
  }
  return null;
}

function productGroup(product) {
  if (product?.g !== undefined && Array.isArray(nevoData?.groups)) return nevoData.groups[product.g] || '';
  return String(product?._group || '').trim();
}

// Shared with the Schijf 2026 analysis (schijf-2026.js).
// 'outside' for products outside the Schijf van Vijf, else null. kind narrows the
// unhealthy variants: sweet dairy, salted or sweetened nuts, hard fats.
export function schijfOutsideCheck(itemName, product, kind = '') {
  const group = productGroup(product);
  const names = [normalizeName(itemName), normalizeName(product?.n)].filter(Boolean);
  if (names.some(name => EXCLUDE_NAME_PATTERN.test(name))) return null;
  if (OUTSIDE_GROUPS.has(group) || names.some(name => OUTSIDE_NAME_PATTERN.test(name))) return 'outside';
  if (kind === 'zuivel' && names.some(name => SWEET_DAIRY_PATTERN.test(name))) return 'outside';
  if (kind === 'noten' && names.some(name => SALTED_NUTS_PATTERN.test(name))) return 'outside';
  if (kind === 'vet' && names.some(name => HARD_FAT_PATTERN.test(name))) return 'outside';
  return null;
}

export { productGroup as schijfProductGroup, REFINED_NAME_PATTERN, normalizeName as normalizeSchijfName };

function classifyMatchedProduct(product, itemName) {
  const group = productGroup(product);
  const name = normalizeName(product?.n || itemName);

  if (!name || EXCLUDE_NAME_PATTERN.test(name)) return { type: 'ignored' };
  if (/\b(zilvervliesrijst|zilvervlies rijst|bruine rijst|brown rice)\b/.test(name)) {
    return { type: 'category', category: 'volkoren', group };
  }
  if (OUTSIDE_GROUPS.has(group) || OUTSIDE_NAME_PATTERN.test(name)) return { type: 'outside', group };

  for (const matcher of POSITIVE_GROUP_MATCHERS) {
    if (!matcher.groups.includes(group)) continue;
    if (!matcher.names.test(name)) continue;

    if (matcher.category === 'zuivel' && SWEET_DAIRY_PATTERN.test(name)) return { type: 'outside', group };
    if (matcher.category === 'onverzadigd_vet' && SALTED_NUTS_PATTERN.test(name)) return { type: 'outside', group };
    if (matcher.category === 'onverzadigd_vet' && HARD_FAT_PATTERN.test(name)) return { type: 'outside', group };
    if (matcher.category === 'volkoren' && REFINED_NAME_PATTERN.test(normalizeName(itemName))) return { type: 'ignored' };
    return { type: 'category', category: matcher.category, group };
  }

  return { type: 'ignored' };
}

function classifyNameFallback(itemName) {
  const direct = classifyDirectOverride(itemName);
  if (direct) return direct;
  const name = normalizeName(itemName);
  if (!name || EXCLUDE_NAME_PATTERN.test(name)) return { type: 'ignored' };

  // Whole words only: "tarwemaisbrood" is not "mais", and "havermout" is not "pap havermout melk"
  const padded = ` ${name} `;
  const categoryAlias = getCategoryAliasMatches().find(entry =>
    name === entry.alias || padded.includes(` ${entry.alias} `)
  );
  if (categoryAlias) return { type: 'category', category: categoryAlias.category, inferred: 'category-alias' };

  if (/\b(zilvervliesrijst|zilvervlies rijst|bruine rijst|brown rice)\b/.test(name)) {
    return { type: 'category', category: 'volkoren' };
  }
  if (OUTSIDE_NAME_PATTERN.test(name)) return { type: 'outside' };

  for (const matcher of NAME_FALLBACK_MATCHERS) {
    if (!matcher.names.test(name)) continue;
    if (matcher.category === 'zuivel' && SWEET_DAIRY_PATTERN.test(name)) return { type: 'outside' };
    if (matcher.category === 'onverzadigd_vet' && SALTED_NUTS_PATTERN.test(name)) return { type: 'outside' };
    if (matcher.category === 'onverzadigd_vet' && HARD_FAT_PATTERN.test(name)) return { type: 'outside' };
    return { type: 'category', category: matcher.category };
  }

  return { type: 'ignored' };
}

function summarizeItems(items) {
  if (!items.length) return '—';
  const names = [...new Set(items.map(item => item.naam))];
  return names.slice(0, 4).join(', ') + (names.length > 4 ? '…' : '');
}

export function schijfDagScore(day) {
  const totals = dayTotals(day);
  const totalen = Object.fromEntries(Object.keys(SCHIJF_CATEGORY_META).map(key => [key, 0]));
  const categoryItems = Object.fromEntries(Object.keys(SCHIJF_CATEGORY_META).map(key => [key, []]));
  const outsideItems = [];
  const ignoredItems = [];

  for (const meal of MEAL_NAMES) {
    for (const item of (day[meal] || [])) {
      const matchedProduct = getMatchedProduct(item.naam);
      const matchedClassification = matchedProduct ? classifyMatchedProduct(matchedProduct, item.naam) : { type: 'ignored' };
      const classification = matchedClassification.type !== 'ignored' ? matchedClassification : classifyNameFallback(item.naam);
      const gram = parseLoggedItemGram(item, matchedProduct);
      const entry = {
        naam: item.naam,
        maaltijd: meal,
        maaltijdLabel: MEAL_LABELS[meal] || meal,
        gram: gram ? Math.round(gram) : null,
        kcal: Math.round(item.kcal || 0),
        matchedName: matchedProduct?.n || '',
      };

      if (classification.type === 'category' && gram) {
        totalen[classification.category] += gram;
        categoryItems[classification.category].push(entry);
        continue;
      }

      if (classification.type === 'category' && !gram) {
        ignoredItems.push({
          ...entry,
          reason: 'Wel herkend voor de Schijf, maar zonder hoeveelheid niet mee te tellen.',
        });
        continue;
      }

      if (classification.type === 'outside') {
        outsideItems.push(entry);
        continue;
      }

      ignoredItems.push({
        ...entry,
        reason: matchedProduct ? 'Geen duidelijke Schijf-categorie gevonden.' : 'Geen betrouwbare productmatch gevonden.',
      });
    }
  }

  const scores = {};
  for (const [category, meta] of Object.entries(SCHIJF_CATEGORY_META)) {
    scores[category] = Math.min((totalen[category] || 0) / meta.doel, 1);
  }

  const coreCategories = ['groente', 'fruit', 'volkoren', 'zuivel', 'eiwit', 'onverzadigd_vet'];
  const coveredCount = coreCategories.filter(category => scores[category] >= 0.6).length;
  const averageCoverage = coreCategories.reduce((sum, category) => sum + scores[category], 0) / coreCategories.length;
  const analysedCalories = [...Object.values(categoryItems).flat(), ...outsideItems].reduce((sum, item) => sum + (item.kcal || 0), 0);
  const confidence = totals.cals > 0 ? analysedCalories / totals.cals : 0;
  const outsideCalories = outsideItems.reduce((sum, item) => sum + (item.kcal || 0), 0);
  const outsidePenalty = analysedCalories > 0 ? Math.min(outsideCalories / analysedCalories, 0.6) : 0;
  const score = Math.round(averageCoverage * 100 * (1 - outsidePenalty * 0.45));

  return {
    score,
    confidence,
    confidencePct: Math.round(confidence * 100),
    coveredCount,
    totalCategories: coreCategories.length,
    scores,
    totalen,
    catItems: categoryItems,
    outsideItems,
    ignoredItems,
    analysedCalories,
    outsideCalories,
    totalCalories: Math.round(totals.cals || 0),
  };
}

export const ADVIES_TEKSTEN = {
  groente_laag: [
    'Voeg bij lunch of avondeten standaard een extra groentecomponent toe, zoals rauwkost of roerbakgroenten.',
    'Een soep, salade of handgroente is vaak de makkelijkste manier om sneller aan je groente te komen.',
  ],
  fruit_laag: [
    'Plan fruit bewust als tussendoortje of bij het ontbijt in plaats van te wachten tot je er toevallig aan denkt.',
    'Snijd fruit vooraf of leg het zichtbaar neer, dan wordt de drempel veel lager.',
  ],
  volkoren_laag: [
    'Kies brood, wraps, pasta en rijst liever volkoren; daar win je snel veel op.',
    'Havermout, volkorenbrood en zilvervliesrijst zijn makkelijke ankers voor meer vezels en verzadiging.',
  ],
  zuivel_laag: [
    'Magere yoghurt, kwark, skyr of melk kunnen een makkelijke zuivelbasis geven zonder veel gedoe.',
  ],
  eiwit_laag: [
    'Denk aan eieren, peulvruchten, kip, vis, tofu of tempeh om je eiwitbron sterker neer te zetten.',
  ],
  vet_laag: [
    'Een kleine portie ongezouten noten of een scheut olijfolie telt al snel mee als gezonde vetbron.',
  ],
  outside_high: [
    'Er zitten relatief veel producten buiten de Schijf van Vijf in je dag. Kijk vooral naar snacks, zoete producten en bewerkte vleeswaren.',
  ],
};

export function getAdviesTeksten(schijfResult, dayTot) {
  const tips = [];
  if (schijfResult.scores.groente < 0.6) tips.push(ADVIES_TEKSTEN.groente_laag[0]);
  if (schijfResult.scores.fruit < 0.6) tips.push(ADVIES_TEKSTEN.fruit_laag[0]);
  if (schijfResult.scores.volkoren < 0.6) tips.push(ADVIES_TEKSTEN.volkoren_laag[0]);
  if (schijfResult.scores.zuivel < 0.4) tips.push(ADVIES_TEKSTEN.zuivel_laag[0]);
  if (schijfResult.scores.eiwit < 0.5 || dayTot.prot < (goals.prot || 60) * 0.8) tips.push(ADVIES_TEKSTEN.eiwit_laag[0]);
  if (schijfResult.scores.onverzadigd_vet < 0.4) tips.push(ADVIES_TEKSTEN.vet_laag[0]);
  if (schijfResult.outsideCalories > schijfResult.analysedCalories * 0.3) tips.push(ADVIES_TEKSTEN.outside_high[0]);
  if (dayTot.fiber < (goals.fiber || 25) * 0.8) tips.push('Je vezels blijven achter; meer groente, fruit, volkoren en peulvruchten helpt het meest.');
  return tips.slice(0, 3);
}

export function renderItemList(items, emptyText) {
  if (!items.length) {
    return `<div style="font-size:0.78rem;color:var(--muted)">${esc(emptyText)}</div>`;
  }

  return items.map(item => {
    const gramText = item.gram ? `${item.gram}g` : 'portie onbekend';
    return `<div style="display:flex;justify-content:space-between;gap:0.7rem;padding:0.35rem 0;border-bottom:1px solid var(--border-subtle);font-size:0.78rem">
      <span style="min-width:0">${esc(item.naam)} <span style="color:var(--tertiary)">(${esc(item.maaltijdLabel.replace(/^[^\s]+\s/, ''))})</span>${item.reason ? `<br><span style="color:var(--muted);font-size:0.72rem">${esc(item.reason)}</span>` : ''}${item.matchedName ? `<br><span style="color:var(--tertiary);font-size:0.72rem">Match: ${esc(item.matchedName)}</span>` : ''}</span>
      <span style="white-space:nowrap;color:var(--muted)">${gramText}</span>
    </div>`;
  }).join('');
}
