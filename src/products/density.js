/* ── Density Helpers (ml -> gram-equivalent) ─────────────── */

const SOLID_OVERRIDE_PATTERNS = [
  /\bstroopwafel/i,
  /\b(?:op|in)\s+(?:water|olie|sap|siroop|zoetzuur)\b/i,
  /\bein\s+eigen\s+sap\b/i,
  /\bwaterijs\b/i,
];

const LIQUID_LIKE_PATTERN = /\bwater\b|\bthee\b|\bkoffie\b|\bespresso\b|\bcappuccino\b|\blatte\b|\bcola\b|\bpepsi\b|\bfanta\b|\bsprite\b|\bfrisdrank\b|\benergy\b|red\s*bull|\bmonster\b|\bsap\b|\bsmoothie\b|\blimonade\b|\branja\b|\bmelk\b|\bkarnemelk\b|\bchocomel\b|\bfristi\b|\bdrinkyoghurt\b|\byoghurtdrank\b|\bzuiveldrank\b|\bkwarkdrank\b|\bsojadrink\b|\bhavermelk\b|\bamandelmelk\b|\brijstdrink\b|\bwijn\b|\bbier\b|\bbubbels\b|\bcocktail\b|\bvla\b|\bpudding\b|\bcustard\b|pap\b|olie\b|\bolijfolie\b|\bzonnebloemolie\b|\bbouillon\b|\bsoep\b|\bsaus\b|jus\b|\bsiroop\b|\bstroop\b/i;

const DENSITY_RULES = [
  { pattern: /olijfolie|zonnebloemolie|koolzaadolie|lijnzaadolie|olie\b|bak en braad|vloeibare margarine/i, density: 0.92 },
  { pattern: /honing|\bstroop\b|\bsiroop\b/i, density: 1.35 },
  { pattern: /vla|pudding|custard|pap\b/i, density: 1.08 },
  { pattern: /yoghurt|kwark|skyr|drinkyoghurt|yoghurtdrank/i, density: 1.04 },
  { pattern: /melk|karnemelk|chocomel|fristi|sojadrink|havermelk|amandelmelk|rijstdrink/i, density: 1.03 },
  { pattern: /sap|smoothie|limonade|ranja/i, density: 1.05 },
  { pattern: /wijn/i, density: 0.99 },
  { pattern: /bier/i, density: 1.01 },
  { pattern: /\bwater\b|\bthee\b|\bkoffie\b|\bcola\b|\bpepsi\b|\bfanta\b|\bsprite\b|\bfrisdrank\b|\benergy\b|\bbouillon\b/i, density: 1.0 },
];

export function isLiquidLike(name, fallbackToDrinkMeal = false) {
  const productName = String(name || '');
  if (fallbackToDrinkMeal) return true;
  if (SOLID_OVERRIDE_PATTERNS.some(pattern => pattern.test(productName))) return false;
  return LIQUID_LIKE_PATTERN.test(productName);
}

export function resolveDensityForName(name) {
  const productName = String(name || '');
  for (const rule of DENSITY_RULES) {
    if (rule.pattern.test(productName)) return rule.density;
  }
  return 1.0;
}

export function toMacroGram(amount, isDrinkLike, name) {
  const numericAmount = Number(amount) || 0;
  if (!isDrinkLike || numericAmount <= 0) return numericAmount;
  return numericAmount * resolveDensityForName(name);
}
