/* ── Energy plausibility check ─────────────────────────────── */
/* Compares stated kcal with the energy the macros imply (Atwater: 4 kcal/g carbs and
   protein, 9 fat, 2 fibre). Shared by the product-DB build script and live OpenFoodFacts
   results. Values are per 100 g/ml with the short keys used in products.json. */

// Alcohol adds 7 kcal/g that is not in the macros, so these legitimately exceed them.
const ALCOHOL = /\b(bier|wijn|wodka|vodka|whisk(e)?y|rum|gin|likeur|liqueur|advocaat|campari|aperol|port|sherry|jenever|cognac|brandy|cider|champagne|prosecco|cava|martini|baileys|tequila|amaretto|vermout|sake|radler|alcohol)\b/i;
// Sugar alcohols (polyols) count as carbs but give ~2.4 kcal/g, so kcal sits below the macros.
const POLYOL = /\b(zero|suikervrij|sugar[\s-]?free|zonder\s+suiker|light)\b/i;

const KJ_FACTOR = 4.184;

export function macroEnergy(item = {}) {
  return 4 * (Number(item.kh) || 0) + 4 * (Number(item.e) || 0) + 9 * (Number(item.v) || 0) + 2 * (Number(item.vz) || 0);
}

// status: 'ok' | 'kj' (kcal field holds kJ; kcal is the corrected value) | 'suspect' | 'unknown'
export function checkEnergy(item = {}) {
  const kcal = Number(item.k) || 0;
  const macros = macroEnergy(item);
  if (kcal > 900 && !ALCOHOL.test(String(item.n || ''))) return { status: 'kj', kcal: Math.round(kcal / KJ_FACTOR), ratio: null };
  if (macros < 20 || kcal <= 0 || ALCOHOL.test(String(item.n || ''))) return { status: 'unknown' };

  const ratio = kcal / macros;
  // Above 900 kcal/100 g is impossible (pure fat is 900), so that is kJ; otherwise kJ shows as
  // a ratio of about 4.18 to the macros.
  if (kcal > 900 || (ratio >= 3.4 && ratio <= 4.9)) return { status: 'kj', kcal: Math.round(kcal / KJ_FACTOR), ratio };
  if (ratio > 1.5) return { status: 'suspect', ratio };
  if (ratio < 0.6 && !POLYOL.test(String(item.n || ''))) return { status: 'suspect', ratio };
  return { status: 'ok', ratio };
}

// Fix kJ-in-kcal and flag doubtful items with w: 1 (shown as a warning in the portion picker).
export function applyEnergyCheck(item, { converted = false } = {}) {
  const result = checkEnergy(item);
  // Convert kJ once, then re-check the converted value: it can still disagree with the macros.
  if (result.status === 'kj' && !converted) return applyEnergyCheck({ ...item, k: result.kcal }, { converted: true });
  if (result.status === 'kj') return { ...item, w: 1 };
  if (result.status === 'suspect') return { ...item, w: 1 };
  if (item.w) {
    const { w, ...rest } = item;
    return rest;
  }
  return item;
}
