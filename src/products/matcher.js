/* ── Local Database Matcher ────────────────────────────────── */

import { nevoReady, nevoData } from '../state.js';
import { r1 } from '../utils.js';
import { loadCustomProducts } from '../storage.js';
import { searchNevo } from './database.js';

// ── Portion Aliases ───────────────────────────────────────
export const PORTION_ALIASES = {
  'snee':35,'sneetje':35,'boterham':35,'plak':20,'plakje':15,'plakken':20,
  'glas':200,'beker':250,'kopje':150,'kop':150,'mok':250,'fles':500,'flesje':330,'blikje':330,'blik':330,
  'bord':250,'portie':150,'opscheplepel':50,'schep':50,'lepel':15,
  'eetlepel':15,'el':15,'theelepel':5,'tl':5,
  'stuk':100,'stuks':100,
  'hand':50,'handje':50,'handvol':50,'handjes':50,
  'ei':60,'eitje':60,'eieren':60,
  'teen':3,'teentje':3,
  'takje':2,
  'scheutje':15,'scheut':30,
  'snuf':1,'snufje':1,'mespuntje':1,
  'eetlepels':15,'theelepels':5,
  'opscheplepels':50,'schepjes':50,
  'glazen':200,'kopjes':150,'mokken':250,
  'plakjes':15,'sneetjes':35,
  'kommen':250,
  'blikjes':330,'flesjes':330,
  'ml':1,'gram':1,'gr':1,'g':1,'cl':10,'dl':100,'liter':1000,'l':1000,'kg':1000,
};

// ── Food Synonyms ─────────────────────────────────────────
export const FOOD_SYNONYMS = {
  'kipfilet':['kipfilet'],'kip':['kip','kipfilet'],'kippenbouten':['kip bout'],
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
  const parts = text
    .replace(/\ben\b/gi, ',')
    .replace(/\bmet\b/gi, ',')
    .replace(/\+/g, ',')
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  return parts.map(part => {
    let gram = null;
    let count = 1;
    let foodName = part.toLowerCase();

    const numWords = {'een':1,'één':1,'twee':2,'drie':3,'vier':4,'vijf':5,'zes':6,'zeven':7,'acht':8,'negen':9,'tien':10,'half':0.5,'halve':0.5};

    // Pattern: "<number> gram/g <food>"
    let m = foodName.match(/^(\d+(?:[.,]\d+)?)\s*(?:gram|gr|g|ml|cl|dl|l|kg)\s+(.+)/i);
    if (m) { gram = parseFloat(m[1].replace(',','.')); foodName = m[2].trim(); }

    // Pattern: "<number> <portion_word> <food>"
    if (!gram) {
      m = foodName.match(/^(\d+(?:[.,]\d+)?)\s+(\w+)\s+(.+)/i);
      if (m) {
        const num = parseFloat(m[1].replace(',','.'));
        const unit = m[2].toLowerCase();
        if (PORTION_ALIASES[unit]) {
          gram = num * PORTION_ALIASES[unit];
          foodName = m[3].trim();
        } else {
          count = num;
          foodName = (m[2] + ' ' + m[3]).trim();
        }
      }
    }

    // Pattern: "<word_number> <portion_word> <food>"
    if (!gram) {
      for (const [word, num] of Object.entries(numWords)) {
        const regex = new RegExp(`^${word}\\s+(\\w+)\\s+(.+)`, 'i');
        m = foodName.match(regex);
        if (m) {
          const unit = m[1].toLowerCase();
          if (PORTION_ALIASES[unit]) {
            gram = num * PORTION_ALIASES[unit];
            foodName = m[2].trim();
          } else {
            count = num;
            foodName = (m[1] + ' ' + m[2]).trim();
          }
          break;
        }
      }
    }

    // Pattern: "<number> <food>" (assume grams if ≥20, else count)
    if (!gram) {
      m = foodName.match(/^(\d+(?:[.,]\d+)?)\s+(.+)/i);
      if (m) {
        const num = parseFloat(m[1].replace(',','.'));
        foodName = m[2].trim();
        if (num >= 20) gram = num;
        else count = num;
      }
    }

    // Pattern: "<word_number> <food>"
    if (!gram) {
      for (const [word, num] of Object.entries(numWords)) {
        const regex = new RegExp(`^${word}\\s+(.+)`, 'i');
        m = foodName.match(regex);
        if (m) { count = num; foodName = m[1].trim(); break; }
      }
    }

    const cleanName = foodName
      .replace(/\s+/g, ' ')
      .replace(/^(een|het|de|wat|enkele)\s+/i, '')
      .trim();

    return { original: part.trim(), foodName: cleanName, gram, count };
  });
}

// ── Match item to NEVO database ───────────────────────────
let _customCache = null;
let _customCacheTime = 0;

export function matchItemToNevo(parsedItem) {
  const name = parsedItem.foodName.toLowerCase().trim();
  const cleanName = name
    .replace(/\b\d+\s*(gram|gr|g|ml|liter|l|cl|dl|kg|stuks?|st)\b/gi, '')
    .replace(/\b(een|twee|drie|vier|vijf|halve?|half)\b/gi, '')
    .trim();

  if (!cleanName || cleanName.length < 2) return null;

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

  let bestMatch = null;
  let bestScore = -999;

  if (!_customCache || _customCacheTime < Date.now() - 2000) {
    _customCache = loadCustomProducts().map(c => ({...c, _custom: true}));
    _customCacheTime = Date.now();
  }
  const allItems = [...(nevoReady && nevoData ? nevoData.items : []), ..._customCache];

  for (const term of searchTerms) {
    const termWords = term.toLowerCase().split(/\s+/).filter(w => w.length >= 2);
    if (!termWords.length) continue;

    for (const item of allItems) {
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

      if (score > bestScore) { bestScore = score; bestMatch = item; }
    }
  }

  return bestMatch;
}

// ── Resolve gram amount ───────────────────────────────────
export function resolveGram(parsedItem, nevoMatch) {
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
  const factor = gram / 100;
  return {
    naam,
    kcal: Math.round((src.k || 0) * factor),
    koolhydraten_g: r1((src.kh || 0) * factor),
    vezels_g: r1((src.vz || 0) * factor),
    vetten_g: r1((src.v || 0) * factor),
    eiwitten_g: r1((src.e || 0) * factor),
    portie: Math.round(gram) + 'g',
    ml: isDrink ? Math.round(gram) : 0,
  };
}
