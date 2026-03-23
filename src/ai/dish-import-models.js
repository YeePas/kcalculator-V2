/* ── Dish Import Domain Models ───────────────────────────── */

const CONFIDENCE_VALUES = new Set(['high', 'medium', 'low']);
const SOURCE_TYPES = new Set(['dish_name', 'manual_nutrition', 'url_import']);

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function cleanText(v, fallback = '') {
  const s = String(v || '').trim();
  return s || fallback;
}

export function createDishProposal(partial) {
  const sourceType = SOURCE_TYPES.has(partial?.sourceType) ? partial.sourceType : 'dish_name';
  const confidence = CONFIDENCE_VALUES.has(partial?.confidence) ? partial.confidence : 'low';
  const assumptions = Array.isArray(partial?.assumptions)
    ? partial.assumptions.map(a => cleanText(a)).filter(Boolean)
    : [];
  const feedbackMessage = cleanText(partial?.feedbackMessage, '');

  return {
    sourceType,
    title: cleanText(partial?.title, 'Onbekend gerecht'),
    recognizedAs: cleanText(partial?.recognizedAs, ''),
    confidence,
    portionLabel: cleanText(partial?.portionLabel, '1 portie'),
    portionGrams: Math.max(1, Math.round(toNum(partial?.portionGrams, 100))),
    calories: Math.max(0, Math.round(toNum(partial?.calories, 0))),
    protein_g: Math.max(0, toNum(partial?.protein_g, 0)),
    carbs_g: Math.max(0, toNum(partial?.carbs_g, 0)),
    fat_g: Math.max(0, toNum(partial?.fat_g, 0)),
    fiber_g: Math.max(0, toNum(partial?.fiber_g, 0)),
    assumptions,
    feedbackMessage,
    alternatives: Array.isArray(partial?.alternatives)
      ? partial.alternatives.map(a => cleanText(a)).filter(Boolean).slice(0, 5)
      : [],
    rawSourceInput: cleanText(partial?.rawSourceInput),
    providerUsed: cleanText(partial?.providerUsed, 'unknown'),
    editable: partial?.editable !== false,
  };
}

export function validateDishProposal(proposal) {
  const p = createDishProposal(proposal);
  const errors = [];
  if (!p.title) errors.push('Titel ontbreekt');
  if (!SOURCE_TYPES.has(p.sourceType)) errors.push('Ongeldige sourceType');
  if (!CONFIDENCE_VALUES.has(p.confidence)) errors.push('Ongeldige confidence');
  return { ok: errors.length === 0, errors, proposal: p };
}

export function mapProposalToFoodItem(proposal) {
  const p = createDishProposal(proposal);
  return {
    naam: p.title,
    kcal: Math.round(p.calories),
    koolhydraten_g: Number(p.carbs_g.toFixed(1)),
    vezels_g: Number(p.fiber_g.toFixed(1)),
    vetten_g: Number(p.fat_g.toFixed(1)),
    eiwitten_g: Number(p.protein_g.toFixed(1)),
    portie: `${p.portionLabel} (${p.portionGrams}g)`,
    _smartImportMeta: {
      sourceType: p.sourceType,
      confidence: p.confidence,
      assumptions: p.assumptions,
      feedbackMessage: p.feedbackMessage,
      providerUsed: p.providerUsed,
      rawSourceInput: p.rawSourceInput,
    },
  };
}
