/* ── Shared Quantity Parser ─────────────────────────────── */

export const PORTION_ALIASES = {
  snee: 35, sneetje: 35, sneetjes: 35, boterham: 35,
  plak: 20, plakje: 15, plakjes: 15, plakken: 20,
  glas: 200, glazen: 200, beker: 250, bekers: 250,
  kopje: 150, kopjes: 150, kop: 150, mok: 250, mokken: 250,
  kom: 250, kommen: 250, kommetje: 250, schaaltje: 200,
  fles: 500, flesje: 330, flesjes: 330,
  blik: 330, blikje: 330, blikjes: 330,
  pak: 250, pakje: 250,
  bord: 250, portie: 150,
  opscheplepel: 50, opscheplepels: 50, schep: 50, schepjes: 50,
  lepel: 15, eetlepel: 15, eetlepels: 15, el: 15,
  theelepel: 5, theelepels: 5, tl: 5,
  stuk: 100, stuks: 100,
  hand: 50, handje: 50, handjes: 50, handvol: 50,
  ei: 60, eitje: 60, eieren: 60,
  teen: 3, teentje: 3,
  takje: 2,
  scheut: 30, scheutje: 15,
  snuf: 1, snufje: 1, mespuntje: 1,
  ml: 1, gram: 1, gr: 1, g: 1, cl: 10, dl: 100, liter: 1000, l: 1000, kg: 1000,
};

const NUMBER_WORDS = {
  een: 1,
  eene: 1,
  twee: 2,
  drie: 3,
  vier: 4,
  vijf: 5,
  zes: 6,
  zeven: 7,
  acht: 8,
  negen: 9,
  tien: 10,
  half: 0.5,
  halve: 0.5,
  anderhalf: 1.5,
  anderhalve: 1.5,
};

const MASS_UNITS = new Set(['kg', 'gram', 'gr', 'g']);
const VOLUME_UNITS = new Set(['ml', 'cl', 'dl', 'l', 'liter']);
const FRACTION_CHARS = {
  '¼': '1/4',
  '½': '1/2',
  '¾': '3/4',
  '⅓': '1/3',
  '⅔': '2/3',
  '⅛': '1/8',
  '⅜': '3/8',
  '⅝': '5/8',
  '⅞': '7/8',
};
const SIZE_WORDS = '(?:klein(?:e)?|groot(?:e)?|middelgroot(?:e)?|middel(?:grote)?|vers(?:e|geraspte)?|geraspte)';
const AMOUNT_TOKEN = '(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:[.,]\\d+)?)';

function toNumber(value) {
  return parseFloat(String(value).replace(',', '.'));
}

function normalizeFractionText(value) {
  let text = String(value || '').trim();
  Object.entries(FRACTION_CHARS).forEach(([char, replacement]) => {
    text = text.replaceAll(char, ` ${replacement} `);
  });
  return text.replace(/\s+/g, ' ').trim();
}

function parseFlexibleNumber(value) {
  const raw = normalizeFractionText(value);
  if (!raw) return NaN;

  const mixed = raw.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const numerator = Number(mixed[2]);
    const denominator = Number(mixed[3]);
    if (denominator) return whole + (numerator / denominator);
  }

  const fraction = raw.match(/^(\d+)\/(\d+)$/);
  if (fraction) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    if (denominator) return numerator / denominator;
  }

  return toNumber(raw);
}

function normalizeUnit(unit) {
  const normalized = String(unit || '')
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .trim();
  if (!normalized) return normalized;
  if (PORTION_ALIASES[normalized]) return normalized;
  if (normalized.endsWith('en')) {
    const singular = normalized.slice(0, -2);
    if (PORTION_ALIASES[singular]) return singular;
  }
  return normalized;
}

function cleanFoodName(name) {
  return String(name || '')
    .replace(/^optioneel\s*:\s*/i, '')
    .replace(/\((?:of|optioneel)[^)]+\)/gi, ' ')
    .replace(/[+]+$/g, ' ')
    .replace(/[\[(]+$/g, ' ')
    .replace(/^[^0-9\p{L}]+/gu, '')
    .replace(/[^0-9\p{L})\]]+$/gu, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^(een|het|de|wat|enkele)\s+/i, '')
    .replace(/^(?:klein(?:e)?|groot(?:e)?|middelgroot(?:e)?|middel(?:grote)?|vers(?:e|geraspte)?|geraspte)\s+/i, '')
    .trim();
}

export function parseQuantity(query) {
  const q = normalizeFractionText(
    String(query || '')
      .toLowerCase()
      .replace(/^optioneel\s*:\s*/i, '')
      .trim()
  );
  let count = 1;
  let unit = null;
  let rest = q;

  const numericPrefix = q.match(new RegExp(`^(${AMOUNT_TOKEN})\\s*(kg|gram|gr|g|ml|cl|dl|l|liter)\\b\\s+(.+)`, 'i'));
  if (numericPrefix) {
    count = parseFlexibleNumber(numericPrefix[1]);
    unit = normalizeUnit(numericPrefix[2]);
    rest = numericPrefix[3];
  } else {
    const numAndUnit = q.match(new RegExp(`^(${AMOUNT_TOKEN})\\s*x?\\s*(?:${SIZE_WORDS}\\s+)?([a-zA-Z]+)\\s+(.+)`, 'i'));
    if (numAndUnit) {
      count = parseFlexibleNumber(numAndUnit[1]);
      unit = normalizeUnit(numAndUnit[2]);
      rest = numAndUnit[3];
    } else {
      const wordAndUnit = q.match(new RegExp(`^([a-zA-Zé]+)\\s+(?:${SIZE_WORDS}\\s+)?([a-zA-Z]+)\\s+(.+)`, 'i'));
      if (wordAndUnit && NUMBER_WORDS[wordAndUnit[1]]) {
        count = NUMBER_WORDS[wordAndUnit[1]];
        unit = normalizeUnit(wordAndUnit[2]);
        rest = wordAndUnit[3];
      } else {
        const wordOnly = q.match(/^([a-zA-Zé]+)\s+(.+)/i);
        if (wordOnly && NUMBER_WORDS[wordOnly[1]]) {
          count = NUMBER_WORDS[wordOnly[1]];
          rest = wordOnly[2];
        } else if (wordOnly) {
          const maybeUnit = normalizeUnit(wordOnly[1]);
          if (PORTION_ALIASES[maybeUnit]) {
            unit = maybeUnit;
            rest = wordOnly[2];
          }
        }
      }
    }
  }

  const stuksEnd = rest.match(/(.+?)\s+(\d+(?:[.,]\d+)?)\s*(?:stuks?|st)$/i);
  if (stuksEnd) {
    rest = stuksEnd[1];
    count = toNumber(stuksEnd[2]);
    unit = 'stuk';
  }

  rest = rest.replace(/\s+(?:stuks?|st)$/i, '').trim();
  return { count, unit, query: rest };
}

export function parsePortionTextPart(part) {
  const raw = String(part || '').trim();
  const q = raw.toLowerCase();
  const parsedQuery = parseQuantity(q);

  let gram = null;
  let ml = null;
  let count = parsedQuery.count || 1;
  let unit = parsedQuery.unit;
  let foodName = parsedQuery.query || q;
  let quantitySource = 'inferred';

  if (unit && PORTION_ALIASES[unit]) {
    const base = PORTION_ALIASES[unit] * count;
    gram = base;
    if (VOLUME_UNITS.has(unit)) ml = base;
    quantitySource = MASS_UNITS.has(unit) || VOLUME_UNITS.has(unit) ? 'explicit-unit' : 'portion-alias';
  }

  if (!gram) {
    const numberOnly = q.match(new RegExp(`^(${AMOUNT_TOKEN})\\s+(.+)`, 'i'));
    if (numberOnly) {
      const num = parseFlexibleNumber(numberOnly[1]);
      foodName = numberOnly[2].trim();
      if (num >= 20) {
        gram = num;
        quantitySource = 'numeric-guess-gram';
      } else {
        count = num;
      }
    }
  }

  const cleanName = cleanFoodName(foodName);
  return {
    original: raw,
    foodName: cleanName,
    gram,
    ml,
    count,
    unit,
    quantitySource,
  };
}
