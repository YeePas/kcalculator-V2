export const SUPERMARKET_OPTIONS = [
  { id: 'ah', label: 'Albert Heijn' },
  { id: 'jumbo', label: 'Jumbo' },
  { id: 'picnic', label: 'Picnic' },
  { id: 'plus', label: 'PLUS' },
  { id: 'lidl', label: 'Lidl' },
  { id: 'aldi', label: 'Aldi' },
  { id: 'hoogvliet', label: 'Hoogvliet' },
  { id: 'coop', label: 'Coop' },
  { id: 'etos', label: 'Etos' },
  { id: 'kruidvat', label: 'Kruidvat' },
  { id: 'boni', label: 'Boni' },
];

const SUPERMARKET_PATTERNS = [
  { id: 'ah', pattern: /albert\s*heijn|\bah\b|ah\s*bio|ah\s*terra|alberthein|albert\s*heinj/i },
  { id: 'jumbo', pattern: /\bjumbo\b|jumbos|1de\s*beste/i },
  { id: 'picnic', pattern: /\bpicnic\b/i },
  { id: 'plus', pattern: /\bplus\b/i },
  { id: 'lidl', pattern: /\blidl\b|milbona|mcennedy|vitasia|chef\s*select|crownfield|pilos|dulano|nixe|j\.d\.\s*gross|combino|italiamo|snack\s*day/i },
  { id: 'aldi', pattern: /\baldi\b|milsani|milsa|gwoon|everyday\s*essentials/i },
  { id: 'hoogvliet', pattern: /\bhoogvliet\b/i },
  { id: 'coop', pattern: /\bcoop\b|naturaplan/i },
  { id: 'etos', pattern: /\betos\b/i },
  { id: 'kruidvat', pattern: /\bkruidvat\b/i },
  { id: 'boni', pattern: /\bboni\b/i },
];

const SUPERMARKET_IDS = new Set(SUPERMARKET_OPTIONS.map(option => option.id));

export function normalizeSupermarketFilters(filters) {
  if (!Array.isArray(filters)) return [];
  const normalized = filters
    .map(value => String(value || '').trim().toLowerCase())
    .filter(value => SUPERMARKET_IDS.has(value));
  return [...new Set(normalized)];
}

export function getSupermarketChainForBrand(brand) {
  const brandName = String(brand || '').trim();
  if (!brandName) return null;
  for (const entry of SUPERMARKET_PATTERNS) {
    if (entry.pattern.test(brandName)) return entry.id;
  }
  return null;
}

export function shouldIncludeProductForSupermarketFilters(item, excludedChains) {
  const exclusions = normalizeSupermarketFilters(excludedChains);
  if (exclusions.length === 0) return true;      // niets uitgesloten → alles zichtbaar
  if (!item || item._custom) return true;        // eigen producten altijd zichtbaar
  if (item.src === 'rivm') return true;          // RIVM altijd zichtbaar

  const chain = getSupermarketChainForBrand(item.b);
  if (!chain) return true;                       // geen huismerk → altijd zichtbaar
  return !exclusions.includes(chain);            // verberg als keten is uitgesloten
}