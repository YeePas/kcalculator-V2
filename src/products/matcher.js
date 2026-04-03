/* ── Local Database Matcher ────────────────────────────────── */

import { nevoReady, nevoData, cfg } from '../state.js';
import { r1 } from '../utils.js';
import { loadCustomProducts } from '../storage.js';
import { searchNevo } from './database.js';
import { PORTION_ALIASES as SHARED_PORTION_ALIASES, parsePortionTextPart } from './quantity-parser.js';
import { toMacroGram, resolveDensityForName, isLiquidLike } from './density.js';
import { shouldIncludeProductForSupermarketFilters } from './supermarket-filter.js';

// ── Portion Aliases ───────────────────────────────────────
export const PORTION_ALIASES = SHARED_PORTION_ALIASES;

// ── Food Synonyms ─────────────────────────────────────────
export const FOOD_SYNONYMS = {
  'kipfilet':['kipfilet'],'kip':['kip','kipfilet'],'kippenbouten':['kip bout'],
  'bloem':['bloem tarwe-','tarwebloem','patentbloem'],
  'bloemkool':['kool bloem'],'broccoli':['kool broccoli'],'boerenkool':['kool boeren'],
  'spruitjes':['kool spruit'],'rode kool':['kool rode'],'witte kool':['kool witte'],
  'sla':['sla krop','sla ijsberg'],'spinazie':['spinazie'],'wortels':['wortel'],
  'wortel':['wortel'],'worteltjes':['wortel'],
  'zilvervliesrijst':['rijst zilvervlies'],'witte rijst':['rijst witte'],
  'rijst':['rijst witte','rijst zilvervlies'],
  'pasta':['pasta witte'],'spaghetti':['pasta witte'],'macaroni':['pasta witte'],
  'volkoren pasta':['pasta volkoren'],
  'aardappelen':['aardappelen'],'aardappels':['aardappelen'],'piepers':['aardappelen'],
  'appel':['appel z schil'],'appels':['appel z schil'],
  'boterham':['tarwebrood volkoren','tarwebrood bruin','tarwebrood'],'boterhammen':['tarwebrood volkoren','tarwebrood bruin'],'brood':['tarwebrood'],'witbrood':['tarwebrood wit'],'bruinbrood':['tarwebrood bruin'],
  'volkorenbrood':['tarwebrood volkoren'],
  'melk':['melk halfvolle','melk volle','melk half'],'volle melk':['melk volle'],'halfvolle melk':['melk halfvolle'],
  'kaas':['kaas goudse 48+'],'pindakaas':['pindakaas'],
  'ei':['ei kippen'],'eieren':['ei kippen'],
  'boter':['boter ongezouten'],'margarine':['margarine'],
  'basterdsuiker':['suiker basterd- bruine','suiker basterd- witte','lichte basterdsuiker'],
  'bruine basterdsuiker':['suiker basterd- bruine'],
  'witte basterdsuiker':['suiker basterd- witte'],
  'lichte basterdsuiker':['lichte basterdsuiker'],
  'banaan':['banaan'],'sinaasappel':['sinaasappel'],
  'tomaat':['tomaat'],'tomaten':['tomaat'],'komkommer':['komkommer'],
  'ui':['ui gewone'],'paprika':['paprika'],
  'zalm':['zalm'],'tonijn':['tonijn'],'garnalen':['garnaal'],
  'gehakt':['gehakt runder-','gehakt half-om-half'],
  'biefstuk':['biefstuk runder-'],'hamburger':['hamburger'],
  'yoghurt':['yoghurt'],'kwark':['kwark'],
  'havermout':['havermout'],
  'olijfolie':['olie olijf'],'zonnebloemolie':['olie zonnebloem'],
};

// ── Parse free text to item list ──────────────────────────
export function parseTextToItems(text) {
  const normalized = String(text || '').replace(/\r\n?/g, '\n').trim();
  if (!normalized) return [];

  const parts = normalized.includes('\n')
    ? normalized
      .split('\n')
      .map(line => line.replace(/^\s*[-*•]+\s*/, '').trim())
      .filter(line => line.length > 0)
    : normalized
      .replace(/\ben\b/gi, ',')
      .replace(/\bmet\b/gi, ',')
      .replace(/\+/g, ',')
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);

  return parts.map(part => parsePortionTextPart(part));
}

function buildSearchTerms(cleanName) {
  let searchTerms = [];
  let hasSynonym = false;
  for (const [synonym, nevoTerms] of Object.entries(FOOD_SYNONYMS)) {
    if (cleanName === synonym || cleanName === synonym + 'men' || cleanName === synonym + 's' || cleanName === synonym + 'en') {
      searchTerms.push(...nevoTerms);
      hasSynonym = true;
    } else if (cleanName.includes(synonym + ' ') || (synonym.length > 4 && synonym.includes(cleanName))) {
      searchTerms.push(...nevoTerms);
      hasSynonym = true;
    }
  }

  if (!hasSynonym) searchTerms.push(cleanName);

  const words = cleanName.split(/\s+/).filter(w => w.length >= 3);
  if (words.length > 1 && !hasSynonym) searchTerms.push(...words);
  return searchTerms;
}

function scoreBestMatchForName(cleanName, allItems) {
  const searchTerms = buildSearchTerms(cleanName);
  let bestMatch = null;
  let bestScore = -999;

  for (const term of searchTerms) {
    const termWords = term.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
    if (!termWords.length) continue;

    for (const item of allItems) {
      if (!shouldIncludeProductForSupermarketFilters(item, cfg.supermarketExclusions)) continue;
      const itemName = item.n.toLowerCase();
      const itemSearch = itemName + ' ' + (item.s || '').toLowerCase() + ' ' + (item.b || '').toLowerCase();

      if (!termWords.every(tw => itemSearch.includes(tw))) continue;

      let score = 0;

      for (const tw of termWords) {
        const regex = new RegExp('\\b' + tw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        if (regex.test(itemName)) score += 8;
        else score -= 3;
      }

      if (itemName === cleanName) score += 30;
      else if (itemName.startsWith(cleanName)) score += 15;
      else if (cleanName.split(' ').length > 1 && itemName.includes(cleanName)) score += 10;

      if (itemName.includes('gekookt') || itemName.includes('bereid') || itemName.includes('gebakken')) score += 3;
      if (itemName.includes('gem')) score += 2;
      if (itemName.includes('rauw')) score -= 1;
      if (itemName.includes('diepvries') && !cleanName.includes('diepvries')) score -= 2;

      if (item.src === 'rivm') score += 3;
      if (item._custom) score += 5;
      score -= itemName.length * 0.05;

      if (cleanName.length <= 5 && !itemName.startsWith(cleanName)) score -= 10;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = item;
      }
    }
  }

  return { bestMatch, bestScore };
}

function normalizeCandidateName(name) {
  return String(name || '').toLowerCase().trim()
    .replace(/\b\d+\s*(gram|gr|g|ml|liter|l|cl|dl|kg|stuks?|st)\b/gi, '')
    .replace(/\b(een|twee|drie|vier|vijf|halve?|half)\b/gi, '')
    .replace(/,\s*.+$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Match item to NEVO database ───────────────────────────
let _customCache = null;
let _customCacheTime = 0;

export function matchItemToNevo(parsedItem) {
  const rawCandidates = [
    parsedItem.foodName,
    ...(Array.isArray(parsedItem.alternatives) ? parsedItem.alternatives : []),
  ];
  const candidates = rawCandidates
    .map(name => normalizeCandidateName(name))
    .filter(name => name && name.length >= 2)
    .filter((name, idx, list) => list.indexOf(name) === idx);

  if (!candidates.length) return null;

  if (!_customCache || _customCacheTime < Date.now() - 2000) {
    _customCache = loadCustomProducts().map(c => ({...c, _custom: true}));
    _customCacheTime = Date.now();
  }
  const allItems = [...(nevoReady && nevoData ? nevoData.items : []), ..._customCache];
  let bestOverall = null;
  let bestOverallScore = -999;

  candidates.forEach((candidate, idx) => {
    const { bestMatch, bestScore } = scoreBestMatchForName(candidate, allItems);
    const adjustedScore = bestScore - (idx * 0.5);
    if (bestMatch && adjustedScore > bestOverallScore) {
      bestOverall = bestMatch;
      bestOverallScore = adjustedScore;
    }
  });

  return bestOverall;
}

// ── Resolve gram amount ───────────────────────────────────
export function resolveGram(parsedItem, nevoMatch) {
  if (parsedItem.ml) return parsedItem.ml;
  if (parsedItem.gram) return parsedItem.gram;
  const name = parsedItem.foodName.toLowerCase();
  const count = parsedItem.count || 1;

  if (/boterham|brood|snee/i.test(name)) return count * 35;
  if (/ei(?:eren)?$/i.test(name)) return count * 60;
  if (/appel|peer|banaan|sinaasappel|kiwi|mandarijn|nectarine|perzik/i.test(name)) return count * 130;
  if (/druif|druiven|bes|bessen|framboz|aardbei/i.test(name)) return count * 75;
  if (/noot|noten|amandel|cashew|walnoot|pistachio/i.test(name)) return count * 30;
  if (/glas|beker/i.test(name)) return count * 200;
  if (/plak/i.test(name)) return count * 20;
  if (/koek|biscuit|cracker/i.test(name)) return count * 30;

  return count * 100;
}

// ── Build meal item from match ────────────────────────────
export function buildMealItem(naam, src, gram, isDrink) {
  const useMl = isLiquidLike(naam, isDrink);
  const macroGram = toMacroGram(gram, useMl, naam);
  const factor = macroGram / 100;
  const roundedAmount = Math.round(gram);
  const density = resolveDensityForName(naam);
  return {
    naam,
    kcal: Math.round((src.k || 0) * factor),
    koolhydraten_g: r1((src.kh || 0) * factor),
    vezels_g: r1((src.vz || 0) * factor),
    vetten_g: r1((src.v || 0) * factor),
    eiwitten_g: r1((src.e || 0) * factor),
    portie: useMl ? (roundedAmount + 'ml') : (roundedAmount + 'g'),
    ml: useMl ? roundedAmount : 0,
    _density: useMl ? density : null,
  };
}
