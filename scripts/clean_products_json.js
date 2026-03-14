import fs from 'node:fs';

const filePath = process.argv[2] || 'public/products.json';
const raw = fs.readFileSync(filePath, 'utf8');
const data = JSON.parse(raw);

if (!Array.isArray(data.items) || !Array.isArray(data.groups)) {
  throw new Error('Expected a products.json object with groups[] and items[]');
}

const suspiciousNamePatterns = [
  /\bingred/i,
  /\bserveertip\b/i,
  /\bprijs per kg\b/i,
  /\bgewicht\b/i,
  /\bgekoeld serveren\b/i,
  /\bnutri-?score\b/i,
  /\b\d+(?:[.,]\d+)?€\b/,
  /\b\d{1,4}\s*(?:g|kg|ml|cl|l)\b/i,
];

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasInvalidNutrition(item) {
  const metrics = ['k', 'kh', 'v', 'e', 'vz'];
  if (!metrics.every((key) => isFiniteNumber(item[key]))) return true;
  if (item.k < 0 || item.k > 900) return true;
  if (item.kh < 0 || item.kh > 100) return true;
  if (item.v < 0 || item.v > 100) return true;
  if (item.e < 0 || item.e > 100) return true;
  if (item.vz < 0 || item.vz > 100) return true;
  return false;
}

function hasBadName(item) {
  const name = String(item.n || '').trim();
  if (!name) return true;
  if (/^\d{4}$/.test(name)) return true;
  if (name.length > 80) return true;
  if (suspiciousNamePatterns.some((pattern) => pattern.test(name))) return true;
  return false;
}

function duplicateKey(item) {
  return [
    String(item.n || '').trim().toLowerCase(),
    String(item.b || '').trim().toLowerCase(),
    item.k,
    item.kh,
    item.v,
    item.e,
    item.vz,
    String(item.src || '').trim().toLowerCase(),
  ].join('|');
}

const seen = new Set();
const cleanedItems = [];
const stats = {
  removedDuplicates: 0,
  removedInvalidNutrition: 0,
  removedBadNames: 0,
  removedTotal: 0,
};

for (const item of data.items) {
  const key = duplicateKey(item);
  if (seen.has(key)) {
    stats.removedDuplicates += 1;
    continue;
  }
  seen.add(key);

  if (hasInvalidNutrition(item)) {
    stats.removedInvalidNutrition += 1;
    continue;
  }

  // Only remove suspicious text-heavy names from OFF imports.
  if (item.src === 'off' && hasBadName(item)) {
    stats.removedBadNames += 1;
    continue;
  }

  cleanedItems.push(item);
}

stats.removedTotal =
  stats.removedDuplicates +
  stats.removedInvalidNutrition +
  stats.removedBadNames;

const cleaned = {
  groups: data.groups,
  items: cleanedItems,
};

fs.writeFileSync(filePath, JSON.stringify(cleaned));

console.log(JSON.stringify({
  filePath,
  before: data.items.length,
  after: cleanedItems.length,
  removed: stats,
}, null, 2));
