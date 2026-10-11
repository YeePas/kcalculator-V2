/* ── Portion amount picker ─────────────────────────────────── */
/* Count × unit (snee, handje, stuk, …) or plain grams/ml, as used by the autocomplete. */

// Units from findPortie(): household portions first, plain grams/ml last.
export function buildAmountUnits(porties, useMl) {
  const units = [];
  const seen = new Set();
  for (const p of porties || []) {
    if (p.t === 'gram' || p.t === 'ml' || !(p.g > 0)) continue;
    const label = p.l || p.t;
    const key = `${label}|${p.g}`;
    if (seen.has(key)) continue;
    seen.add(key);
    units.push({ label, g: p.g });
  }
  units.push({ label: useMl ? 'ml' : 'gram', g: 1, isBase: true });
  return units;
}

export function defaultCount(unit) {
  return unit?.isBase ? 100 : 1;
}

export function amountGrams(count, unit) {
  return Math.round((Number(count) || 0) * (unit?.g || 1) * 10) / 10;
}

function formatCount(count) {
  return String(Math.round(count * 100) / 100).replace('.', ',');
}

// Portion text stored on the meal item, e.g. "2× snee (70g)" or "150g".
export function amountLabel(count, unit, useMl) {
  const grams = amountGrams(count, unit);
  const suffix = useMl ? 'ml' : 'g';
  if (!unit || unit.isBase) return `${grams}${suffix}`;
  const prefix = Number(count) === 1 ? '' : `${formatCount(Number(count))}× `;
  return `${prefix}${unit.label} (${grams}${suffix})`;
}

// +/- steps: 10 g/ml for plain amounts, whole portions otherwise with a half step below one.
export function stepCount(count, unit, direction) {
  const value = Number(count) || 0;
  if (unit?.isBase) return Math.max(10, Math.round((value + direction * 10) / 10) * 10);
  if (direction < 0) return value > 1 ? Math.max(1, Math.ceil(value) - 1) : 0.5;
  return value < 1 ? 1 : Math.floor(value) + 1;
}
