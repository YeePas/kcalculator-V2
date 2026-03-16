/* ── Density Helpers (ml -> gram-equivalent) ─────────────── */

const LIQUID_LIKE_PATTERN = /water|thee|koffie|espresso|cappuccino|latte|cola|pepsi|fanta|sprite|frisdrank|energy|red\s*bull|monster|sap|smoothie|limonade|ranja|melk|karnemelk|chocomel|fristi|drinkyoghurt|yoghurtdrank|zuiveldrank|kwarkdrank|sojadrink|havermelk|amandelmelk|rijstdrink|wijn|bier|bubbels|cocktail|vla|pudding|custard|pap\b|olie\b|olijfolie|zonnebloemolie|bouillon|soep|saus|jus\b|siroop|stroop/i;

const DENSITY_RULES = [
  { pattern: /olijfolie|zonnebloemolie|koolzaadolie|lijnzaadolie|olie\b|bak en braad|vloeibare margarine/i, density: 0.92 },
  { pattern: /honing|stroop|siroop/i, density: 1.35 },
  { pattern: /vla|pudding|custard|pap\b/i, density: 1.08 },
  { pattern: /yoghurt|kwark|skyr|drinkyoghurt|yoghurtdrank/i, density: 1.04 },
  { pattern: /melk|karnemelk|chocomel|fristi|sojadrink|havermelk|amandelmelk|rijstdrink/i, density: 1.03 },
  { pattern: /sap|smoothie|limonade|ranja/i, density: 1.05 },
  { pattern: /wijn/i, density: 0.99 },
  { pattern: /bier/i, density: 1.01 },
  { pattern: /water|thee|koffie|cola|pepsi|fanta|sprite|frisdrank|energy|bouillon/i, density: 1.0 },
];

export function isLiquidLike(name, fallbackToDrinkMeal = false) {
  const productName = String(name || '');
  if (fallbackToDrinkMeal) return true;
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
