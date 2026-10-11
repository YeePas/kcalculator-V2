/* ── Recipe ingredient amounts ─────────────────────────────── */
/* Pure helpers for editing ingredient amounts in a saved dish. */

import { r1 } from '../utils.js';

const NUTRIENT_KEYS = ['kcal', 'koolhydraten_g', 'vezels_g', 'vetten_g', 'eiwitten_g'];

// Read "50g" / "170ml" (or _gram / ml) from a saved ingredient. amount is null when unknown.
export function parseIngredientAmount(item = {}) {
  const matches = [...String(item.portie || '').matchAll(/(\d+(?:[.,]\d+)?)\s*(ml|g)\b/gi)];
  const last = matches[matches.length - 1];
  if (last) {
    return { amount: parseFloat(last[1].replace(',', '.')), unit: last[2].toLowerCase() };
  }
  if (Number(item.ml) > 0) return { amount: Number(item.ml), unit: 'ml' };
  if (Number(item._gram) > 0) return { amount: Number(item._gram), unit: 'g' };
  return { amount: null, unit: 'g' };
}

// Nutrition per 1 g/ml, derived from the saved values; null when the amount is unknown or zero.
export function nutritionPerUnit(item = {}, amount) {
  if (!(amount > 0)) return null;
  const base = {};
  for (const key of NUTRIENT_KEYS) base[key] = (Number(item[key]) || 0) / amount;
  return base;
}

// Scale an ingredient to a new amount, keeping its other fields.
export function scaleIngredient(item, perUnit, amount, unit) {
  const next = { ...item, portie: `${Math.round(amount * 10) / 10}${unit}` };
  if (perUnit) {
    next.kcal = Math.round(perUnit.kcal * amount);
    for (const key of NUTRIENT_KEYS.slice(1)) next[key] = r1(perUnit[key] * amount);
  }
  if (unit === 'ml') {
    next.ml = amount;
    delete next._gram;
  } else {
    next.ml = 0;
    next._gram = amount;
  }
  return next;
}

export function sumIngredients(items) {
  const totals = { kcal: 0, koolhydraten_g: 0, vezels_g: 0, vetten_g: 0, eiwitten_g: 0, ml: 0 };
  for (const it of items) {
    for (const key of Object.keys(totals)) totals[key] += Number(it[key]) || 0;
  }
  totals.kcal = Math.round(totals.kcal);
  for (const key of ['koolhydraten_g', 'vezels_g', 'vetten_g', 'eiwitten_g']) totals[key] = r1(totals[key]);
  return totals;
}
