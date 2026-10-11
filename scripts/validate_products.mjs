// Validate and normalise public/products.json.
//
//   node scripts/validate_products.mjs           fix in place: kJ-in-kcal corrected, doubtful
//                                                items flagged (w: 1), version stamped
//   node scripts/validate_products.mjs --check   CI mode: change nothing, exit 1 when the file
//                                                is not normalised or has broken items
//
// The version is a hash of the items; the app compares it with its cached copy and
// downloads the database again when it changed.
//
// NEVO items (src "rivm") are passed through untouched: the NEVO conditions of use only allow
// the data in unchanged form. Checks, corrections and removals apply to the other sources.
//
// Hand corrections live in data/product-corrections.json and are applied on every run, so
// they survive rebuilding the database. Each entry matches on name (and brand if given):
//   { "n": "Product", "b": "Merk", "set": { "k": 250, "e": 9 }, "note": "verpakking" }
//   { "n": "Product", "verified": true, "note": "kcal klopt, ondanks afwijking" }
//   { "n": "Product", "remove": true, "note": "dubbel / onzin" }

import fs from 'node:fs';
import crypto from 'node:crypto';
import { applyEnergyCheck, checkEnergy, macroEnergy } from '../src/products/nutrition-check.js';

const checkOnly = process.argv.includes('--check');
const filePath = process.argv.find(arg => arg.endsWith('.json')) || 'public/products.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const CORRECTIONS_PATH = 'data/product-corrections.json';
const corrections = fs.existsSync(CORRECTIONS_PATH) ? JSON.parse(fs.readFileSync(CORRECTIONS_PATH, 'utf8')) : [];

if (!Array.isArray(data.items) || !Array.isArray(data.groups)) {
  console.error('Expected { groups: [], items: [] }');
  process.exit(1);
}

const METRICS = ['k', 'kh', 'v', 'e', 'vz'];
const isBroken = item =>
  !String(item.n || '').trim()
  || !METRICS.every(key => Number.isFinite(item[key]) && item[key] >= 0)
  || item.k > 900 || ['kh', 'v', 'e', 'vz'].some(key => item[key] > 100);

// Rounding noise like -0.1 g becomes 0 before anything else.
const clampNoise = item => {
  const next = { ...item };
  for (const key of METRICS) if (next[key] < 0 && next[key] >= -1) next[key] = 0;
  return next;
};

const norm = value => String(value || '').trim().toLowerCase();
const correctionFor = item => corrections.find(c =>
  norm(c.n) === norm(item.n) && (c.b === undefined || norm(c.b) === norm(item.b)));
const usedCorrections = new Set();

const stats = { total: data.items.length, kjFixed: 0, flagged: 0, removed: 0, corrected: 0 };
const removed = [];
const items = [];
const isNevo = item => item.src === 'rivm';
const restoredNevo = [];
for (const original of data.items) {
  if (isNevo(original)) {
    // Undo an earlier run that still flagged NEVO items.
    if (original.w) {
      const { w, ...rest } = original;
      items.push(rest);
      restoredNevo.push(original.n);
    } else {
      items.push(original);
    }
    if (correctionFor(original)) console.warn(`  ! correction ignored, NEVO data may not be changed: ${original.n}`);
    continue;
  }
  const correction = correctionFor(original);
  if (correction) usedCorrections.add(correction);
  if (correction?.remove) {
    removed.push(original);
    continue;
  }
  const corrected = correction?.set ? { ...original, ...correction.set } : original;
  if (correction?.set && JSON.stringify(corrected) !== JSON.stringify(original)) stats.corrected += 1;
  const clamped = clampNoise(corrected);
  if (checkEnergy(clamped).status === 'kj') stats.kjFixed += 1;
  let item = applyEnergyCheck(clamped);
  // Still kJ-like (or above 900) after one conversion, with sane macros: the stated value is
  // unusable, so derive kcal from the macros. Keeps the next run from converting again.
  if (checkEnergy(item).status === 'kj' && !isBroken({ ...item, k: 0 })) {
    const { w, ...rest } = item;
    item = { ...rest, k: Math.round(macroEnergy(item)) };
    stats.fromMacros = (stats.fromMacros || 0) + 1;
  }
  if (correction?.verified && item.w) {
    const { w, ...rest } = item;
    item = rest;
  }
  if (isBroken(item)) {
    removed.push(original);
    continue;
  }
  if (item.w) stats.flagged += 1;
  items.push(item);
}
stats.removed = removed.length;

const version = crypto.createHash('sha1').update(JSON.stringify(items)).digest('hex').slice(0, 12);
const normalised = { version, groups: data.groups, items };
const changed = JSON.stringify(normalised) !== JSON.stringify(data);

console.log(`${filePath}: ${stats.total} items -> ${items.length}, version ${version}`);
console.log(`  kJ-in-kcal corrected: ${stats.kjFixed}`);
console.log(`  kcal derived from macros (unusable kcal): ${stats.fromMacros || 0}`);
console.log(`  flagged as doubtful (kcal vs macros): ${stats.flagged}`);
console.log(`  removed: ${stats.removed}`);
console.log(`  hand corrections applied: ${usedCorrections.size} of ${corrections.length}`);
corrections.filter(c => !usedCorrections.has(c)).forEach(c => console.warn(`  ! correction matches no product: ${c.n}${c.b ? ` (${c.b})` : ''}`));
removed.slice(0, 10).forEach(item => console.log(`    - ${JSON.stringify(item).slice(0, 120)}`));

if (checkOnly) {
  if (changed) console.error('products.json is not normalised; run: node scripts/validate_products.mjs');
  process.exit(changed ? 1 : 0);
}

fs.writeFileSync(filePath, JSON.stringify(normalised));
console.log(changed ? 'Written.' : 'Already up to date.');
