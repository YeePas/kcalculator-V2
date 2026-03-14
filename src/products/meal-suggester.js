/* ── Meal Suggestion Engine (MVP) ───────────────────────────
   Vrije tekst/URL -> gerechtvoorstel met portie, macros, aannames.
   Ontworpen als uitbreidbare laag voor latere echte recipe parsers.
*/

const CUISINE_KEYWORDS = {
  thais: ['thai', 'thaise', 'thais', 'curry', 'lemak'],
  italiaans: ['caesar', 'pasta', 'risotto', 'italiaans'],
  indonesisch: ['nasi', 'lemak', 'gado', 'rendang', 'saté', 'sate'],
  mediterraans: ['ottolenghi', 'mediterraan', 'hummus', 'linzen'],
};

const SIZE_FACTORS = { klein: 0.8, normaal: 1, groot: 1.25 };

const GENERIC_PORTIONS = {
  soup: { label: '1 kom', grams: 350 },
  salad: { label: '1 normale schaal', grams: 250 },
  curry: { label: '1 kom', grams: 350 },
  pie: { label: '1 punt', grams: 180 },
  pasta: { label: '1 bord', grams: 350 },
  rice: { label: '1 bord', grams: 350 },
  generic: { label: '1 portie', grams: 300 },
};

const GENERIC_NUTRITION_PER100 = {
  soup: { calories: 75, protein_g: 4.2, carbs_g: 10.5, fat_g: 1.8, fiber_g: 2.8 },
  salad: { calories: 145, protein_g: 6, carbs_g: 8, fat_g: 9, fiber_g: 3 },
  curry: { calories: 160, protein_g: 8, carbs_g: 11, fat_g: 9, fiber_g: 2.2 },
  pie: { calories: 190, protein_g: 7, carbs_g: 16, fat_g: 10, fiber_g: 2.6 },
  pasta: { calories: 165, protein_g: 7, carbs_g: 24, fat_g: 4.8, fiber_g: 2.2 },
  rice: { calories: 150, protein_g: 5.5, carbs_g: 24, fat_g: 3.8, fiber_g: 2.1 },
  generic: { calories: 150, protein_g: 6, carbs_g: 16, fat_g: 6, fiber_g: 2.5 },
};

// Seeddata / voorbeeldprofielen
export const KNOWN_DISH_SEEDS = [
  {
    id: 'pasta_pesto',
    aliases: ['pasta pesto', 'pesto pasta', 'pasta met pesto'],
    displayName: 'Pasta pesto',
    cuisine: 'Italiaans',
    category: 'pasta',
    sourceType: 'known_dish',
    confidenceBase: 0.87,
    per100: { calories: 198, protein_g: 6.4, carbs_g: 25.5, fat_g: 7.9, fiber_g: 2.3 },
    assumptions: [
      'Standaard pasta pesto met groene pesto en harde kaas aangenomen',
      'Geen extra kip of roomsaus meegenomen in de basisschatting',
    ],
  },
  {
    id: 'caesar_salad',
    aliases: ['caesar salad', 'caesar', 'ceasar salad'],
    displayName: 'Caesar salad',
    cuisine: 'Italiaans/Amerikaans',
    category: 'salad',
    sourceType: 'known_dish',
    confidenceBase: 0.86,
    per100: { calories: 175, protein_g: 8.8, carbs_g: 8.5, fat_g: 11.2, fiber_g: 2.1 },
    assumptions: [
      'Caesar met dressing, croutons en Parmezaan aangenomen',
      'Standaard huissalade-variant gebruikt',
    ],
  },
  {
    id: 'nasi_lemak',
    aliases: ['nasi lemak'],
    displayName: 'Nasi lemak',
    cuisine: 'Indonesisch/Maleis',
    category: 'rice',
    sourceType: 'known_dish',
    confidenceBase: 0.84,
    per100: { calories: 185, protein_g: 7.1, carbs_g: 20.1, fat_g: 8.2, fiber_g: 1.9 },
    assumptions: [
      'Standaard nasi lemak met kokosrijst en basisside aangenomen',
      'Restaurant-portie niet exact bekend, gemiddelde gebruikt',
    ],
  },
  {
    id: 'yellow_curry',
    aliases: ['thaise gele curry', 'thai yellow curry', 'gele curry'],
    displayName: 'Thaise gele curry',
    cuisine: 'Thais',
    category: 'curry',
    sourceType: 'known_dish',
    confidenceBase: 0.83,
    per100: { calories: 165, protein_g: 8.9, carbs_g: 10.8, fat_g: 9.4, fiber_g: 2.2 },
    assumptions: [
      'Curry met kokosmelk als basis aangenomen',
      'Variant met kip als default gehanteerd',
    ],
  },
  {
    id: 'linzen_soep',
    aliases: ['linzensoep', 'linzen soep', 'lentil soup'],
    displayName: 'Linzensoep',
    cuisine: 'Mediterraans/Midden-Oosters',
    category: 'soup',
    sourceType: 'generic_dish',
    confidenceBase: 0.76,
    per100: { calories: 82, protein_g: 4.9, carbs_g: 11.7, fat_g: 1.6, fiber_g: 3.6 },
    assumptions: [
      'Standaard linzensoep zonder room gebruikt',
      'Normale kom-portie aangehouden',
    ],
  },
  {
    id: 'cauliflower_pie_ottolenghi',
    aliases: ['bloemkooltaart van ottolenghi', 'ottolenghi bloemkooltaart'],
    displayName: 'Bloemkooltaart (Ottolenghi-stijl)',
    cuisine: 'Mediterraans',
    category: 'pie',
    sourceType: 'exact_recipe',
    confidenceBase: 0.9,
    per100: { calories: 210, protein_g: 8.1, carbs_g: 14.2, fat_g: 12.5, fiber_g: 2.8 },
    assumptions: [
      'Exacte Ottolenghi-variant geïnterpreteerd op basis van titel',
      'Gemiddelde puntgrootte gebruikt',
    ],
  },
];

function round1(v) {
  return Math.round((v || 0) * 10) / 10;
}

function parseUrlToDish(urlString) {
  try {
    const u = new URL(urlString);
    const host = (u.hostname || '').replace('www.', '');
    const slug = (u.pathname || '')
      .split('/')
      .filter(Boolean)
      .pop() || '';
    const dish = slug
      .replace(/[-_]+/g, ' ')
      .replace(/\b(recept|recipe|gerecht|klaarmaken|maken|met)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return {
      dishName: dish || host,
      host,
    };
  } catch {
    return { dishName: '', host: '' };
  }
}

function detectCuisine(text) {
  const t = (text || '').toLowerCase();
  for (const [cuisine, words] of Object.entries(CUISINE_KEYWORDS)) {
    if (words.some(w => t.includes(w))) return cuisine;
  }
  return 'onbekend';
}

function detectModifiers(text) {
  const t = (text || '').toLowerCase();
  const mods = [];
  if (/\bkip\b/.test(t)) mods.push('kip');
  if (/\bvegetar|vega\b/.test(t)) mods.push('vegetarisch');
  if (/\bvegan\b/.test(t)) mods.push('vegan');
  if (/\brijst\b/.test(t)) mods.push('met_rijst');
  if (/\bklein\b/.test(t)) mods.push('klein');
  if (/\bgroot\b/.test(t)) mods.push('groot');
  if (/\brestaurant\b/.test(t)) mods.push('restaurant');
  if (/\bthuis|huisgemaakt\b/.test(t)) mods.push('huisgemaakt');
  return mods;
}

function findKnownDish(query) {
  const q = (query || '').toLowerCase();
  let best = null;
  let bestScore = 0;

  for (const seed of KNOWN_DISH_SEEDS) {
    for (const alias of seed.aliases) {
      const a = alias.toLowerCase();
      let score = 0;
      if (q === a) score = 1;
      else if (q.includes(a)) score = 0.9;
      else if (a.split(' ').every(part => q.includes(part))) score = 0.75;
      if (score > bestScore) {
        best = seed;
        bestScore = score;
      }
    }
  }

  return { profile: best, score: bestScore };
}

function detectCategory(text) {
  const t = (text || '').toLowerCase();
  if (/soep|soup/.test(t)) return 'soup';
  if (/salad|salade/.test(t)) return 'salad';
  if (/curry/.test(t)) return 'curry';
  if (/taart|pie|quiche/.test(t)) return 'pie';
  if (/pasta/.test(t)) return 'pasta';
  if (/rijst|nasi/.test(t)) return 'rice';
  return 'generic';
}

export function parseMealInput(rawInput) {
  const raw = (rawInput || '').trim();
  const inputType = /^https?:\/\//i.test(raw) ? 'url' : 'text';
  const urlInfo = inputType === 'url' ? parseUrlToDish(raw) : { dishName: '', host: '' };
  const detectedDishName = inputType === 'url' ? (urlInfo.dishName || raw) : raw;
  const modifiers = detectModifiers(raw + ' ' + detectedDishName);
  const cuisine = detectCuisine(raw + ' ' + detectedDishName);

  const isLikelyExactRecipe = inputType === 'url' || /\bvan\s+ottolenghi\b|\bottt?olenghi\b|\brecept\b/i.test(raw);
  const known = findKnownDish(detectedDishName || raw);

  let sourceType = 'generic_dish';
  let confidenceScore = 0.56;
  if (isLikelyExactRecipe) {
    sourceType = 'exact_recipe';
    confidenceScore = 0.78;
  } else if (known.profile) {
    sourceType = known.profile.sourceType || 'known_dish';
    confidenceScore = Math.max(0.68, known.profile.confidenceBase * known.score);
  }

  const missingContext = [];
  if (!modifiers.includes('klein') && !modifiers.includes('groot')) missingContext.push('portiegrootte');
  if (!modifiers.includes('kip') && !modifiers.includes('vegetarisch') && /curry|nasi|salad|salade/i.test(detectedDishName)) {
    missingContext.push('eiwitvariant (kip/vega/vis)');
  }

  return {
    rawInput: raw,
    inputType,
    detectedDishName,
    cuisine,
    modifiers,
    sourceType,
    confidenceScore: round1(confidenceScore * 100) / 100,
    missingContext,
    urlHost: urlInfo.host || '',
  };
}

export function detectDishType(parsed) {
  if (!parsed) return { sourceType: 'generic_dish', confidenceScore: 0.5 };
  return { sourceType: parsed.sourceType, confidenceScore: parsed.confidenceScore };
}

export function estimatePortion(parsed, dishProfile) {
  const category = dishProfile?.category || detectCategory(parsed?.detectedDishName || parsed?.rawInput || '');
  const base = GENERIC_PORTIONS[category] || GENERIC_PORTIONS.generic;

  let size = 'normaal';
  if (parsed?.modifiers?.includes('klein')) size = 'klein';
  if (parsed?.modifiers?.includes('groot')) size = 'groot';

  const grams = Math.round(base.grams * (SIZE_FACTORS[size] || 1));

  const quickChoices = ['klein', 'normaal', 'groot'].map(s => ({
    size: s,
    grams: Math.round(base.grams * SIZE_FACTORS[s]),
    label: s === 'klein' ? 'Klein' : s === 'groot' ? 'Groot' : 'Normaal',
  }));

  return {
    label: size === 'klein' ? `${base.label} (klein)` : size === 'groot' ? `${base.label} (groot)` : base.label,
    grams,
    size,
    quickChoices,
    category,
  };
}

export function estimateNutrition(parsed, dishProfile, portionSuggestion) {
  const category = portionSuggestion?.category || dishProfile?.category || 'generic';
  const per100Base = dishProfile?.per100 || GENERIC_NUTRITION_PER100[category] || GENERIC_NUTRITION_PER100.generic;
  const per100 = { ...per100Base };

  if (parsed?.modifiers?.includes('vegetarisch') || parsed?.modifiers?.includes('vegan')) {
    per100.protein_g = Math.max(2, per100.protein_g - 1.2);
    per100.fat_g = round1(per100.fat_g - 0.5);
    per100.fiber_g = round1(per100.fiber_g + 0.6);
  }
  if (parsed?.modifiers?.includes('met_rijst')) {
    per100.carbs_g = round1(per100.carbs_g + 3.5);
    per100.calories = Math.round(per100.calories + 16);
  }
  if (parsed?.modifiers?.includes('restaurant')) {
    per100.calories = Math.round(per100.calories * 1.08);
    per100.fat_g = round1(per100.fat_g * 1.08);
  }

  const factor = (portionSuggestion?.grams || 300) / 100;
  return {
    calories: Math.round(per100.calories * factor),
    protein_g: round1(per100.protein_g * factor),
    carbs_g: round1(per100.carbs_g * factor),
    fat_g: round1(per100.fat_g * factor),
    fiber_g: round1(per100.fiber_g * factor),
    per100,
  };
}

export function buildAssumptions(parsed, dishProfile, portionSuggestion, nutrition) {
  const assumptions = [];

  if (parsed.inputType === 'url') {
    assumptions.push('Receptlink behandeld als receptbron; paginacontent is in MVP niet volledig geparsed.');
    if (parsed.urlHost) assumptions.push(`Titel geïnterpreteerd op basis van URL op ${parsed.urlHost}.`);
  }

  if (dishProfile?.assumptions?.length) assumptions.push(...dishProfile.assumptions);

  if (!dishProfile) {
    assumptions.push('Geen exact receptprofiel gevonden; standaard gerechtprofiel gebruikt.');
  }

  assumptions.push(`Portie geschat als ${portionSuggestion.label} (${portionSuggestion.grams} g).`);
  assumptions.push(`Voedingswaarden berekend via profielwaarden per 100 g en opgeschaald naar de gekozen portie.`);

  if (parsed.modifiers?.includes('vegetarisch')) assumptions.push('Vegetarische variant aangenomen.');
  if (parsed.modifiers?.includes('met_rijst')) assumptions.push('Rijstcomponent meegenomen in schatting.');
  if (parsed.missingContext?.length) assumptions.push(`Ontbrekende context: ${parsed.missingContext.join(', ')}.`);

  return assumptions;
}

function confidenceLabel(score) {
  if (score >= 0.8) return 'high';
  if (score >= 0.62) return 'medium';
  return 'low';
}

export function buildMealSuggestion(rawInput) {
  const input = parseMealInput(rawInput);
  const known = findKnownDish(input.detectedDishName || input.rawInput);
  const dishProfile = known.profile || null;
  const type = detectDishType(input);

  const portionSuggestion = estimatePortion(input, dishProfile);
  const nutrition = estimateNutrition(input, dishProfile, portionSuggestion);
  const assumptions = buildAssumptions(input, dishProfile, portionSuggestion, nutrition);

  const normalizedDishName = dishProfile?.displayName ||
    (input.detectedDishName ? input.detectedDishName.replace(/\s+/g, ' ').trim() : 'Onbekend gerecht');

  const alternatives = [
    { id: 'klein', label: 'Kleinere portie', type: 'portion' },
    { id: 'normaal', label: 'Normale portie', type: 'portion' },
    { id: 'groot', label: 'Grotere portie', type: 'portion' },
    { id: 'veg', label: 'Vegetarische variant', type: 'variant' },
  ];

  return {
    input,
    normalizedDishName,
    sourceType: type.sourceType,
    confidence: confidenceLabel(type.confidenceScore),
    confidenceScore: type.confidenceScore,
    portionSuggestion,
    nutrition,
    assumptions,
    editableFields: ['naam', 'portie', 'kcal', 'eiwitten', 'koolhydraten', 'vetten', 'vezels', 'aannames'],
    alternatives,
  };
}

export function buildMealSuggestionFromExisting(baseSuggestion, overrides = {}) {
  const next = JSON.parse(JSON.stringify(baseSuggestion || {}));
  if (!next || !next.input) return null;

  const quick = next.portionSuggestion?.quickChoices || [];
  if (overrides.size) {
    const q = quick.find(x => x.size === overrides.size);
    if (q) {
      next.portionSuggestion.size = q.size;
      next.portionSuggestion.grams = q.grams;
      next.portionSuggestion.label = q.size === 'klein'
        ? `${next.portionSuggestion.label.replace(/\s*\(.*\)$/, '')} (klein)`
        : q.size === 'groot'
          ? `${next.portionSuggestion.label.replace(/\s*\(.*\)$/, '')} (groot)`
          : next.portionSuggestion.label.replace(/\s*\(.*\)$/, '');
    }
  }

  if (overrides.vegetarian) {
    if (!next.input.modifiers.includes('vegetarisch')) next.input.modifiers.push('vegetarisch');
  }

  const dishProfile = findKnownDish(next.normalizedDishName).profile || null;
  next.nutrition = estimateNutrition(next.input, dishProfile, next.portionSuggestion);
  next.assumptions = buildAssumptions(next.input, dishProfile, next.portionSuggestion, next.nutrition);
  next.confidence = confidenceLabel(next.confidenceScore || 0.55);
  return next;
}
