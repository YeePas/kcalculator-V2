/* ── Smart Dish Import Service ───────────────────────────── */

import { cfg } from '../state.js';
import { aiCall } from './providers.js';
import { loadCustomProducts, saveCustomProducts } from '../storage.js';
import { syncCustomProductsToSupabase } from '../supabase/sync.js';
import { createDishProposal, mapProposalToFoodItem } from './dish-import-models.js';
import { parsePastedNutrition, fetchUrlContentForImport } from './dish-import-parsing.js';
import { parsePortionTextPart } from '../products/quantity-parser.js';
import { findPortie } from '../products/portions.js';
import { matchItemToNevo, resolveGram } from '../products/matcher.js';

const TYPO_MAP = {
  ertesoep: 'erwtensoep',
  'erte soep': 'erwtensoep',
  linssoep: 'linzensoep',
  cesar: 'caesar salad',
  ceasar: 'caesar salad',
  'thaise curry': 'thaise gele curry',
};

const GENERIC_DISH_TITLES = new Set([
  'voedingswaarden per portie',
  'voedingswaarden',
  'macro\'s per portie',
  'macros per portie',
  'macro overzicht',
  'macro-overzicht',
]);

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function extractJsonObject(text) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end < 0 || end <= start) throw new Error('Geen JSON gevonden in AI output');
  const objectText = candidate.slice(start, end + 1);
  try {
    return JSON.parse(objectText);
  } catch {
    const repaired = objectText
      .replace(/[\u2018\u2019]/g, '\'')
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3')
      .replace(/:\s*'([^']*)'/g, ': "$1"')
      .replace(/([\[{,]\s*)'([^']+?)'(\s*[:,}\]])/g, '$1"$2"$3');
    return JSON.parse(repaired);
  }
}

function parseAiMacroText(text) {
  const parsed = parsePastedNutrition(text);
  const hasEnergy = parsed.calories > 0;
  const macroCount = [parsed.carbs_g, parsed.protein_g, parsed.fat_g, parsed.fiber_g].filter(v => v > 0).length;
  if (!hasEnergy && macroCount < 2) return null;
  return parsed;
}

export function normalizeImportUrl(urlInput) {
  const raw = String(urlInput || '').trim();
  if (!raw) throw new Error('Vul een URL in');
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/|$)/i.test(raw)) return 'https://' + raw;
  throw new Error('Ongeldige URL');
}

async function callImportAI(systemPrompt, userPrompt) {
  const provider = cfg.importProvider || cfg.provider || 'gemini';
  const origModel = cfg.model;
  if (cfg.importModel) cfg.model = cfg.importModel;
  try {
    const text = await aiCall(provider, systemPrompt, userPrompt, 1100, true);
    return { provider, text };
  } finally {
    cfg.model = origModel;
  }
}

function squeezeSpaces(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function avgFromRange(raw) {
  const m = String(raw || '').match(/(\d+(?:[.,]\d+)?)\s*[–-]\s*(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const a = parseFloat(m[1].replace(',', '.'));
  const b = parseFloat(m[2].replace(',', '.'));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return (a + b) / 2;
}

function numberNearLabel(text, labels) {
  for (const label of labels) {
    const rx = new RegExp(label + String.raw`[^\d]{0,32}(\d+(?:[.,]\d+)?(?:\s*[–-]\s*\d+(?:[.,]\d+)?)?)`, 'i');
    const m = text.match(rx);
    if (!m) continue;
    const ranged = avgFromRange(m[1]);
    if (ranged !== null) return ranged;
    const n = parseFloat(m[1].replace(',', '.'));
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function titleFromSlug(pathname) {
  const slug = pathname.split('/').filter(Boolean).pop() || '';
  const cleaned = slug
    .replace(/^wi\d+\//i, '')
    .replace(/^wi\d+/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  if (!cleaned) return 'Product';
  return cleaned.replace(/\b\w/g, ch => ch.toUpperCase());
}

function parseRetailNutritionFromText(url, text) {
  const compact = squeezeSpaces(text);
  if (!compact) return null;

  const calories = Math.round(numberNearLabel(compact, ['calorie[eë]n', 'energie', 'kcal']));
  const carbs = Number(numberNearLabel(compact, ['koolhydraten', 'waarvan suikers', '\\bkh\\b']).toFixed(1));
  const fat = Number(numberNearLabel(compact, ['vet(?:ten)?', 'waarvan verzadigd']).toFixed(1));
  const protein = Number(numberNearLabel(compact, ['eiwit(?:ten)?', 'prote[iï]ne']).toFixed(1));
  const fiber = Number(numberNearLabel(compact, ['vezels?', 'fiber']).toFixed(1));
  const macroHits = [calories > 0, carbs > 0, fat > 0, protein > 0, fiber > 0].filter(Boolean).length;
  if (macroHits < 3) return null;

  const portionLabelMatch = compact.match(/per\s+100\s*(g|gram|gr|ml)\b/i);
  const portionUnit = portionLabelMatch?.[1]?.toLowerCase() || 'g';
  const portionLabel = portionUnit === 'ml' ? '100ml' : '100g';

  return createDishProposal({
    sourceType: 'url_import',
    title: titleFromSlug(url.pathname),
    recognizedAs: 'Productpagina uitgelezen',
    confidence: 'high',
    portionLabel,
    portionGrams: 100,
    calories,
    protein_g: protein,
    carbs_g: carbs,
    fat_g: fat,
    fiber_g: fiber,
    assumptions: ['Voedingswaarden rechtstreeks uit de productpagina gehaald. Controleer portie-eenheid als de bron per 100 ml rekent.'],
    alternatives: [],
    rawSourceInput: url.href,
    providerUsed: 'retail-parse',
    editable: true,
  });
}

function cleanupDishCandidate(value) {
  return squeezeSpaces(String(value || '')
    .replace(/^["'“”‘’([{]+/, '')
    .replace(/["'“”‘’)\]}.,;:!?]+$/, '')
    .replace(/\b(?:met|incl(?:usief)?|inclusief)\s+alle\s+macro'?s?.*$/i, '')
    .replace(/\b(?:met|incl(?:usief)?|inclusief)\s+(?:de\s+)?macro'?s?.*$/i, '')
    .replace(/\b(?:per|voor)\s+portie.*$/i, '')
    .replace(/\b(?:calorie(?:e|ë)?n?|kcal|macro'?s?|voedingswaarden?)\b.*$/i, ''));
}

function looksGenericDishTitle(value) {
  const normalized = normalizeDishName(value);
  return !normalized || GENERIC_DISH_TITLES.has(normalized);
}

export function extractDishNameFromFreeText(input) {
  const raw = squeezeSpaces(input);
  if (!raw) return '';
  if (raw.length <= 80 && !/\b(?:calorie(?:e|ë)?n?|kcal|macro'?s?|voedingswaarden?)\b/i.test(raw)) {
    return cleanupDishCandidate(raw);
  }

  const patterns = [
    /\b(?:voor|van)\s+(.+?)(?:\s+met\s+alle\s+macro'?s?.*|\s+met\s+macro'?s?.*|\s+qua\s+macro'?s?.*|\s+en\s+alle\s+macro'?s?.*|\s+per\s+portie.*|\?*$|$)/i,
    /\b(?:calorie(?:e|ë)?n?|kcal|macro'?s?|voedingswaarden?)\s+(?:voor|van)\s+(.+?)(?:\s+met.*|\s+per\s+portie.*|\?*$|$)/i,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    const candidate = cleanupDishCandidate(match?.[1] || '');
    if (candidate) return candidate;
  }

  const stripped = cleanupDishCandidate(raw
    .replace(/\b(?:mag ik|kun je|kan je|geef(?: mij)?|laat(?: zien)?|wat zijn|hoeveel|graag)\b/ig, ' ')
    .replace(/\b(?:de|het|een)\b/ig, ' '));
  return stripped || raw;
}

function extractTitleFromNutritionText(input) {
  const lines = String(input || '')
    .split(/\r?\n/)
    .map(line => squeezeSpaces(line.replace(/^[^\p{L}\p{N}]+/u, '')))
    .filter(Boolean);

  for (const line of lines) {
    if (/\b(?:calorie(?:e|ë)?n?|kcal|koolhydraten|eiwit(?:ten)?|prote[iï]ne|vet(?:ten)?|vezels?|fiber|hoeveelheid|nutrient)\b/i.test(line)) continue;
    const candidate = cleanupDishCandidate(line);
    if (candidate && !looksGenericDishTitle(candidate)) return candidate;
  }

  const fromQuestion = extractDishNameFromFreeText(input);
  if (fromQuestion && !looksGenericDishTitle(fromQuestion)) return fromQuestion;
  return 'Geplakt gerecht';
}

export function buildAiTextFallbackProposal(aiText, input, provider) {
  const parsed = parseAiMacroText(aiText);
  if (!parsed) throw new Error('Geen bruikbare JSON of macrotekst gevonden in AI output');

  const titleFromText = extractTitleFromNutritionText(aiText);
  const titleFromInput = extractDishNameFromFreeText(input);
  const title = !looksGenericDishTitle(titleFromInput)
    ? titleFromInput
    : (!looksGenericDishTitle(titleFromText) ? titleFromText : 'AI schatting');

  return createDishProposal({
    sourceType: 'dish_name',
    title: title.charAt(0).toUpperCase() + title.slice(1),
    recognizedAs: 'AI-antwoord verwerkt uit vrije tekst',
    confidence: 'medium',
    portionLabel: '1 portie',
    portionGrams: 100,
    calories: parsed.calories,
    protein_g: parsed.protein_g,
    carbs_g: parsed.carbs_g,
    fat_g: parsed.fat_g,
    fiber_g: parsed.fiber_g,
    assumptions: ['AI gaf geen geldige JSON terug; voedingswaarden zijn uit het tekstuele antwoord gehaald. Controleer de portie en broninterpretatie.'],
    alternatives: [],
    rawSourceInput: input,
    providerUsed: provider,
    editable: true,
  });
}

export function createProposalFromNutritionText(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  if (!/\b(?:calorie(?:e|ë)?n?|kcal|koolhydraten|eiwit(?:ten)?|prote[iï]ne|vet(?:ten)?|vezels?|fiber)\b/i.test(raw)) return null;

  const parsed = parsePastedNutrition(raw);
  const hasEnergy = parsed.calories > 0;
  const macroCount = [parsed.carbs_g, parsed.protein_g, parsed.fat_g, parsed.fiber_g].filter(v => v > 0).length;
  if (!hasEnergy && macroCount < 2) return null;

  return createDishProposal({
    sourceType: 'dish_name',
    title: extractTitleFromNutritionText(raw),
    recognizedAs: 'Overgenomen uit geplakte voedingssamenvatting',
    confidence: 'high',
    portionLabel: '1 portie',
    portionGrams: 100,
    calories: parsed.calories,
    protein_g: parsed.protein_g,
    carbs_g: parsed.carbs_g,
    fat_g: parsed.fat_g,
    fiber_g: parsed.fiber_g,
    assumptions: ['Voedingswaarden direct uit geplakte tekst gehaald. Controleer de portie als de bron niet per portie was.'],
    alternatives: [],
    rawSourceInput: raw,
    providerUsed: 'manual-parse',
    editable: true,
  });
}

export function normalizeDishName(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  const normalized = raw.toLowerCase().replace(/\s+/g, ' ').replace(/[.,;:!?]/g, '');
  return TYPO_MAP[normalized] || normalized;
}

export function estimateDishFromAIResponse(aiJson, input, provider) {
  const portion = aiJson?.portionSuggestion || {};
  const nutrition = aiJson?.nutrition || {};
  return createDishProposal({
    sourceType: 'dish_name',
    title: aiJson?.recognizedDishName || aiJson?.title || input,
    recognizedAs: aiJson?.recognizedAs || '',
    confidence: aiJson?.confidence || 'low',
    portionLabel: portion.label || '1 portie',
    portionGrams: portion.grams || 100,
    calories: nutrition.calories,
    protein_g: nutrition.protein_g,
    carbs_g: nutrition.carbs_g,
    fat_g: nutrition.fat_g,
    fiber_g: nutrition.fiber_g,
    assumptions: aiJson?.assumptions || ['Schatting gemaakt op basis van gangbare receptvarianten.'],
    alternatives: aiJson?.alternatives || [],
    rawSourceInput: input,
    providerUsed: provider,
    editable: true,
  });
}

function createUnparsedAiFallbackProposal(input, provider) {
  const extractedDish = extractDishNameFromFreeText(input);
  const title = extractedDish || String(input || '').trim() || 'AI schatting';
  return createDishProposal({
    sourceType: 'dish_name',
    title: title.charAt(0).toUpperCase() + title.slice(1),
    recognizedAs: 'AI-output niet volledig parsebaar',
    confidence: 'low',
    portionLabel: '1 portie',
    portionGrams: 100,
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: 0,
    assumptions: ['AI gaf geen bruikbare JSON of macrotekst terug. Controleer dit gerecht handmatig en vul de waarden aan.'],
    alternatives: [],
    rawSourceInput: input,
    providerUsed: provider,
    editable: true,
  });
}

function isRecipeLikeInput(input) {
  const raw = String(input || '').trim();
  if (!raw) return false;
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length >= 3) return true;
  const quantityHits = (raw.match(/\b\d+(?:[.,]\d+)?\s*(?:g|gr|gram|kg|ml|l|el|tl|theelepel|eetlepel|stuks?|blik(?:ken)?|aubergines?|eieren?)\b/gi) || []).length;
  return quantityHits >= 2;
}

function sanitizeRecipeIngredient(raw, idx) {
  const grams = Math.max(0, estimateRecipeIngredientGrams(raw));
  const calories = Math.max(0, toNum(raw?.calories, 0));
  const protein_g = Math.max(0, toNum(raw?.protein_g, 0));
  const carbs_g = Math.max(0, toNum(raw?.carbs_g, 0));
  const fat_g = Math.max(0, toNum(raw?.fat_g, 0));
  const fiber_g = Math.max(0, toNum(raw?.fiber_g, 0));
  const amount = cleanNumber(raw?.amount);
  const unit = squeezeSpaces(raw?.unit || '');
  const displayAmount = amount && unit ? `${amount} ${unit}` : amount || unit || (grams > 0 ? `${Math.round(grams)} g` : '');

  return {
    id: `ri-${idx}-${Date.now()}`,
    name: squeezeSpaces(raw?.name || raw?.ingredient || `Ingrediënt ${idx + 1}`),
    amount,
    unit,
    displayAmount,
    grams,
    calories,
    protein_g,
    carbs_g,
    fat_g,
    fiber_g,
    assumptions: Array.isArray(raw?.assumptions)
      ? raw.assumptions.map(a => squeezeSpaces(a)).filter(Boolean)
      : [],
  };
}

function normalizePortionType(unit) {
  const normalized = squeezeSpaces(String(unit || '').toLowerCase())
    .replace(/[.'’]/g, '')
    .replace(/en$/, '');
  const map = {
    stuks: 'stuk',
    st: 'stuk',
    blikken: 'blik',
    blikjes: 'blik',
    theelepels: 'theelepel',
    tl: 'theelepel',
    eetlepels: 'eetlepel',
    el: 'eetlepel',
    handen: 'hand',
    handje: 'handje',
    handjes: 'handje',
    handvol: 'handje',
    tenen: 'teen',
    teentje: 'teen',
    snufje: 'snuf',
    scheutje: 'scheut',
  };
  return map[normalized] || normalized;
}

function estimateRecipeIngredientGrams(raw) {
  const explicit = Math.max(0, toNum(raw?.grams ?? raw?.estimatedGrams, 0));
  if (explicit > 0) return explicit;

  const amount = cleanNumber(raw?.amount);
  const unit = squeezeSpaces(raw?.unit || '');
  const name = squeezeSpaces(raw?.name || raw?.ingredient || '');
  const portionText = [amount, unit, name].filter(Boolean).join(' ').trim() || name;
  const parsed = parsePortionTextPart(portionText);

  if (parsed?.gram) return Math.max(0, parsed.gram);
  if (parsed?.ml) return Math.max(0, parsed.ml);

  const match = matchItemToNevo({ foodName: name, gram: null, count: parsed?.count || 1, unit: parsed?.unit || null });
  const portionType = normalizePortionType(parsed?.unit || unit);
  const count = Math.max(0, Number(parsed?.count || toNum(amount, 1) || 1));

  if (portionType) {
    const options = findPortie(match?.n || name, match?.g, 0);
    const option = options.find(item => normalizePortionType(item.t) === portionType);
    if (option?.g) return Math.max(0, option.g * count);
  }

  const resolved = resolveGram(parsed, match);
  return Math.max(0, resolved || 0);
}

function cleanNumber(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const n = Number(raw.replace(',', '.'));
  if (!Number.isFinite(n)) return raw;
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

function sumRecipeIngredients(ingredients) {
  return ingredients.reduce((acc, ingredient) => {
    acc.totalWeightGrams += ingredient.grams || 0;
    acc.calories += ingredient.calories || 0;
    acc.protein_g += ingredient.protein_g || 0;
    acc.carbs_g += ingredient.carbs_g || 0;
    acc.fat_g += ingredient.fat_g || 0;
    acc.fiber_g += ingredient.fiber_g || 0;
    return acc;
  }, {
    totalWeightGrams: 0,
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: 0,
  });
}

function buildRecipeProposalFromAi(aiJson, input, provider) {
  const ingredientsRaw = Array.isArray(aiJson?.ingredients) ? aiJson.ingredients : [];
  const ingredients = ingredientsRaw.map(sanitizeRecipeIngredient).filter(ingredient => ingredient.name);
  if (ingredients.length === 0) return null;

  const totals = sumRecipeIngredients(ingredients);
  const servings = Math.max(1, Math.round(toNum(aiJson?.servings, 1)));
  const totalWeightGrams = Math.max(
    Math.round(toNum(aiJson?.totalWeightGrams, 0)),
    Math.round(totals.totalWeightGrams || 0),
    1
  );
  const portionGrams = Math.max(1, Math.round(totalWeightGrams / servings));

  const proposal = createDishProposal({
    sourceType: 'dish_name',
    title: aiJson?.recipeName || aiJson?.recognizedDishName || extractDishNameFromFreeText(input) || 'Recept',
    recognizedAs: aiJson?.recognizedAs || 'Ingrediëntenlijst / recept',
    confidence: aiJson?.confidence || 'medium',
    portionLabel: servings === 1 ? '1 portie' : `1 van ${servings} porties`,
    portionGrams,
    calories: Math.round(totals.calories / servings),
    protein_g: Number((totals.protein_g / servings).toFixed(1)),
    carbs_g: Number((totals.carbs_g / servings).toFixed(1)),
    fat_g: Number((totals.fat_g / servings).toFixed(1)),
    fiber_g: Number((totals.fiber_g / servings).toFixed(1)),
    assumptions: Array.isArray(aiJson?.assumptions)
      ? aiJson.assumptions
      : ['Ingrediënten en hoeveelheden door AI gestructureerd; controleer aannames zoals olie, snufjes en stuksgewichten.'],
    alternatives: aiJson?.alternatives || [],
    rawSourceInput: input,
    providerUsed: provider,
    editable: true,
  });

  proposal.recipe = {
    servings,
    totalWeightGrams,
    ingredients,
    totals: {
      calories: Math.round(totals.calories),
      protein_g: Number(totals.protein_g.toFixed(1)),
      carbs_g: Number(totals.carbs_g.toFixed(1)),
      fat_g: Number(totals.fat_g.toFixed(1)),
      fiber_g: Number(totals.fiber_g.toFixed(1)),
    },
  };
  return proposal;
}

export async function analyzeDishNameWithAI(input) {
  const directProposal = createProposalFromNutritionText(input);
  if (directProposal) return directProposal;

  const extractedDish = extractDishNameFromFreeText(input);
  const normalized = normalizeDishName(extractedDish || input);
  if (!normalized) throw new Error('Vul een gerechtnaam in');
  const recipeLike = isRecipeLikeInput(input);
  const systemPrompt = recipeLike
    ? `Je bent een Nederlandse voedingsanalist voor een eetdagboek.\nDe gebruiker geeft waarschijnlijk een ingrediëntenlijst of recept.\nGeef ALLEEN geldige JSON terug.\nGebruik exact deze structuur:\n{ "mode":"recipe", "recipeName":"...", "recognizedAs":"...", "confidence":"high|medium|low", "servings":1, "totalWeightGrams":0, "ingredients":[{"name":"...", "amount":"2", "unit":"stuks", "grams":0, "calories":0, "protein_g":0, "carbs_g":0, "fat_g":0, "fiber_g":0, "assumptions":["..."]}], "assumptions":["..."], "alternatives":[] }\nRegels:\n- Neem ALLE ingrediënten over.\n- Behoud expliciete hoeveelheden exact.\n- Schat grams waar nodig voor stuks, snuf, scheut, tl/el.\n- Geef voedingswaarden PER ingrediënt voor de gebruikte hoeveelheid, niet per 100g.\n- totalWeightGrams is het totale receptgewicht.\n- Gebruik altijd dubbele quotes voor alle JSON keys en stringwaarden.\n- Geen markdown, geen uitleg, geen code fences, geen tekst buiten het JSON object.`
    : `Je bent een Nederlandse voedingsanalist voor een eetdagboek.\nDoel: verwerk vrije gebruikersinvoer robuust, ook als dat een losse gerechtnaam, een vraag in gewone taal, een halve omschrijving of een combinatie daarvan is.\nGeef ALLEEN geldige JSON terug met exact deze velden:\ninput, recognizedDishName, recognizedAs, confidence(high|medium|low), portionSuggestion{label,grams}, nutrition{calories,protein_g,carbs_g,fat_g,fiber_g}, assumptions[], alternatives[].\nBelangrijke regels:\n- Kies altijd een concreet gerecht of product als recognizedDishName.\n- Geef altijd een bruikbare schatting per portie, ook als de invoer vaag is.\n- Voor simpele invoer zoals "pasta pesto" of "havermout met banaan" moet je alsnog een volledige voedingsinschatting geven.\n- Als details ontbreken, maak redelijke aannames en noem die expliciet.\n- Antwoord zonder markdown, zonder tabel, zonder extra tekst buiten JSON.`;
  const userPrompt = recipeLike
    ? `Originele invoer:\n${String(input || '').trim()}\n\nInterpreteer dit als recept of ingrediëntenlijst en geef gestructureerde ingrediënten met hoeveelheden, gebruikte gram/ml-schatting per ingrediënt, voedingswaarden per gebruikte hoeveelheid en totaalgewicht van het recept.`
    : `Originele invoer: "${String(input || '').trim()}".\nHerkende kern: "${normalized}".\n\nVoorbeelden van gewenst gedrag:\n- "ertesoep" -> erwtensoep\n- "mag ik de calorieen voor pasta alla norma met alle macro's" -> pasta alla norma\n- "pasta pesto" -> herken als pasta pesto en geef een normale portie met macro's\n- "caesar" -> caesar salad\nGeef een plausibele Nederlandse portie en voedingsinschatting voor direct gebruik in een eetdagboek.`;

  try {
    const { provider, text } = await callImportAI(systemPrompt, userPrompt);
    try {
      const aiJson = extractJsonObject(text);
      if (recipeLike || aiJson?.mode === 'recipe' || Array.isArray(aiJson?.ingredients)) {
        const recipeProposal = buildRecipeProposalFromAi(aiJson, input, provider);
        if (recipeProposal) return recipeProposal;
      }
      return estimateDishFromAIResponse(aiJson, input, provider);
    } catch {
      try {
        return buildAiTextFallbackProposal(text, input, provider);
      } catch {
        return createUnparsedAiFallbackProposal(input, provider);
      }
    }
  } catch (e) {
    throw new Error(e?.message || 'AI-analyse mislukt. Controleer je provider, model en API-key.');
  }
}

export function parseManualNutritionInput(input) {
  const portionGrams = Math.max(1, Math.round(toNum(input.portionGrams, 100)));
  const factor = portionGrams / 100;

  const caloriesPer100 = Math.max(0, Math.round(toNum(input.calories, 0)));
  const proteinPer100 = Math.max(0, toNum(input.protein_g, 0));
  const carbsPer100 = Math.max(0, toNum(input.carbs_g, 0));
  const fatPer100 = Math.max(0, toNum(input.fat_g, 0));
  const fiberPer100 = Math.max(0, toNum(input.fiber_g, 0));

  return createDishProposal({
    sourceType: 'manual_nutrition',
    title: input.title,
    recognizedAs: 'Handmatig ingevoerd per 100 gram',
    confidence: 'high',
    portionLabel: input.portionLabel || 'Standaard portie',
    portionGrams,
    calories: Math.round(caloriesPer100 * factor),
    protein_g: Number((proteinPer100 * factor).toFixed(1)),
    carbs_g: Number((carbsPer100 * factor).toFixed(1)),
    fat_g: Number((fatPer100 * factor).toFixed(1)),
    fiber_g: Number((fiberPer100 * factor).toFixed(1)),
    assumptions: [`Invoer was per 100g; omgerekend naar ${portionGrams}g portie.`],
    alternatives: [],
    rawSourceInput: input.rawSourceInput || input.title,
    providerUsed: 'manual',
    editable: true,
  });
}

export function parseManualNutritionPaste(rawText, title, portionGrams = 100) {
  const parsed = parsePastedNutrition(rawText);
  return parseManualNutritionInput({
    title: title || 'Geplakte voedingswaarden',
    calories: parsed.calories,
    protein_g: parsed.protein_g,
    carbs_g: parsed.carbs_g,
    fat_g: parsed.fat_g,
    fiber_g: parsed.fiber_g,
    portionGrams,
    portionLabel: 'Standaard portie',
    rawSourceInput: rawText,
  });
}

export function createFoodFromManualNutrition(input) {
  return parseManualNutritionInput(input);
}

export async function importFoodFromUrl(urlInput) {
  const raw = normalizeImportUrl(urlInput);
  let url;
  try { url = new URL(raw); } catch { throw new Error('Ongeldige URL'); }

  const slugGuess = url.pathname.split('/').filter(Boolean).pop()?.replace(/[-_]/g, ' ') || 'onbekend gerecht';
  const scraped = await fetchUrlContentForImport(url.href);
  const isRetailerUrl = /(?:^|\.)ah\.nl$|(?:^|\.)jumbo\.com$/i.test(url.hostname);
  const directRetailProposal = /(?:^|\.)ah\.nl$|(?:^|\.)jumbo\.com$/i.test(url.hostname)
    ? parseRetailNutritionFromText(url, scraped.text)
    : null;
  if (directRetailProposal) return directRetailProposal;
  const scrapedContext = scraped.text
    ? `\n\nGescraapte content (${scraped.source}, ingekort):\n${scraped.text}`
    : '\n\nGeen scrape-content beschikbaar; gebruik URL + slug + kennis voor best-effort voorstel.';
  const systemPrompt = `Je krijgt een URL van een recept- of productpagina.\nGeef ALLEEN JSON met dezelfde structuur als dish-analyse.\nVoor recepten: probeer eerst receptnaam, aantal porties en voedingswaarden per portie te bepalen uit tekst (ingrediënten, bereidingswijze, schema's).\nAls exacte voedingsdata ontbreekt: maak een realistische schatting op basis van type gerecht en ingrediënten, met duidelijke assumptions en confidence medium of low.`;
  const userPrompt = `URL: ${url.href}\nSlug guess: ${slugGuess}\nBelangrijk: geef een importvoorstel dat bruikbaar is als 1 portie voor het eetdagboek.${scrapedContext}`;
  try {
    const { provider, text } = await callImportAI(systemPrompt, userPrompt);
    const aiJson = extractJsonObject(text);
    return createDishProposal({
      ...estimateDishFromAIResponse(aiJson, slugGuess, provider),
      sourceType: 'url_import',
      rawSourceInput: url.href,
    });
  } catch {
    return createDishProposal({
      sourceType: 'url_import',
      title: slugGuess.charAt(0).toUpperCase() + slugGuess.slice(1),
      recognizedAs: 'URL geïnterpreteerd via slug-fallback',
      confidence: 'low',
      portionLabel: '1 portie',
      portionGrams: 300,
      calories: 350,
      protein_g: 12,
      carbs_g: 32,
      fat_g: 16,
      fiber_g: 5,
      assumptions: isRetailerUrl
        ? [
            'Retailerpagina kon niet betrouwbaar worden uitgelezen vanuit de browser of proxy.',
            'Fallback-schatting gebruikt. Voor exacte waarden: deploy de Supabase Edge Function "url-import-proxy" of gebruik handmatige invoer.',
          ]
        : ['Exacte voedingswaarden niet gevonden op URL.', 'Fallback-schatting gebruikt op basis van recepttitel en type gerecht.'],
      alternatives: [],
      rawSourceInput: url.href,
      providerUsed: 'url-fallback',
      editable: true,
    });
  }
}

export const importNutritionFromUrl = importFoodFromUrl;

export function mapAiResultToFoodItem(proposal) {
  return mapProposalToFoodItem(proposal);
}

export function saveImportedFood(proposal) {
  const p = createDishProposal(proposal);
  const custom = loadCustomProducts();
  const entry = {
    n: p.title,
    g: -1,
    k: Number((p.calories / Math.max(p.portionGrams, 1) * 100).toFixed(1)),
    kh: Number((p.carbs_g / Math.max(p.portionGrams, 1) * 100).toFixed(1)),
    vz: Number((p.fiber_g / Math.max(p.portionGrams, 1) * 100).toFixed(1)),
    v: Number((p.fat_g / Math.max(p.portionGrams, 1) * 100).toFixed(1)),
    e: Number((p.protein_g / Math.max(p.portionGrams, 1) * 100).toFixed(1)),
  };
  const idx = custom.findIndex(c => String(c.n || '').toLowerCase() === p.title.toLowerCase());
  if (idx >= 0) custom[idx] = entry;
  else custom.push(entry);
  saveCustomProducts(custom);
  syncCustomProductsToSupabase(true);
}
