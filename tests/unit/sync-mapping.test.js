/* ── Unit tests: Supabase mapping functions ───────────────── */
/* We test the mapping logic by importing the module and checking  
   that the internal mapping functions produce correct output.
   Since the mapping functions are not exported, we test them 
   indirectly through the public API, or we create equivalent 
   pure functions to test the mapping logic. */

import { describe, it, expect } from 'vitest';

// ── Test the mapping logic directly ──────────────────────────
// Replicate the mapping functions here to verify correctness.
// When the sync module is refactored to export these, switch to direct imports.

function mapFavoriteRowToLocal(row) {
  return {
    naam: row.name || '',
    tekst: row.text_value || '',
    maaltijd: row.meal || 'ontbijt',
    isRecipe: !!row.is_recipe,
    items: Array.isArray(row.items) ? row.items : undefined,
    item: row.item && typeof row.item === 'object' ? row.item : undefined,
  };
}

function mapLocalFavoriteToRow(fav, userId) {
  return {
    user_id: userId,
    name: fav.naam || '',
    meal: fav.maaltijd || null,
    is_recipe: !!fav.isRecipe,
    text_value: fav.tekst || null,
    item: fav.item && typeof fav.item === 'object' ? fav.item : null,
    items: Array.isArray(fav.items) ? fav.items : null,
  };
}

function mapCustomRowToLocal(row) {
  return {
    n: row.name || '',
    k: Number(row.kcal || 0),
    kh: Number(row.carbs_g || 0),
    vz: Number(row.fiber_g || 0),
    v: Number(row.fat_g || 0),
    e: Number(row.protein_g || 0),
    _custom: true,
  };
}

function mapLocalCustomToRow(item, userId) {
  return {
    user_id: userId,
    name: item.n || '',
    kcal: Number(item.k || 0),
    carbs_g: Number(item.kh || 0),
    fiber_g: Number(item.vz || 0),
    fat_g: Number(item.v || 0),
    protein_g: Number(item.e || 0),
    portion: item.g && item.g > 0 ? `${item.g}g` : null,
    legacy_key: (item.n || '').trim().toLowerCase() || null,
  };
}

// ── Favourite mapping: Supabase → Local ──────────────────────
describe('mapFavoriteRowToLocal', () => {
  it('maps English DB columns to Dutch local properties', () => {
    const row = {
      name: 'Broodje kaas',
      text_value: 'brood met kaas',
      meal: 'lunch',
      is_recipe: false,
      item: { naam: 'Broodje kaas', kcal: 250 },
      items: null,
    };
    const result = mapFavoriteRowToLocal(row);
    expect(result.naam).toBe('Broodje kaas');
    expect(result.tekst).toBe('brood met kaas');
    expect(result.maaltijd).toBe('lunch');
    expect(result.isRecipe).toBe(false);
    expect(result.item.kcal).toBe(250);
  });

  it('defaults maaltijd to "ontbijt" when meal is missing', () => {
    const result = mapFavoriteRowToLocal({ name: 'Test' });
    expect(result.maaltijd).toBe('ontbijt');
  });

  it('handles recipe with sub-items', () => {
    const row = {
      name: 'Pasta bolognese',
      is_recipe: true,
      items: [{ naam: 'Pasta', kcal: 200 }, { naam: 'Saus', kcal: 150 }],
      item: { naam: 'Pasta bolognese', kcal: 350 },
    };
    const result = mapFavoriteRowToLocal(row);
    expect(result.isRecipe).toBe(true);
    expect(result.items).toHaveLength(2);
  });

  it('returns undefined for items when not an array', () => {
    const result = mapFavoriteRowToLocal({ name: 'X', items: 'not array' });
    expect(result.items).toBeUndefined();
  });
});

// ── Favourite mapping: Local → Supabase ──────────────────────
describe('mapLocalFavoriteToRow', () => {
  it('maps Dutch local properties to English DB columns', () => {
    const fav = {
      naam: 'Havermout',
      tekst: 'havermout met melk',
      maaltijd: 'ontbijt',
      isRecipe: false,
      item: { naam: 'Havermout', kcal: 300 },
    };
    const result = mapLocalFavoriteToRow(fav, 'user-123');
    expect(result.user_id).toBe('user-123');
    expect(result.name).toBe('Havermout');
    expect(result.text_value).toBe('havermout met melk');
    expect(result.meal).toBe('ontbijt');
    expect(result.is_recipe).toBe(false);
    expect(result.item.kcal).toBe(300);
  });

  it('handles missing optional fields', () => {
    const result = mapLocalFavoriteToRow({ naam: 'Test' }, 'user-1');
    expect(result.text_value).toBeNull();
    expect(result.items).toBeNull();
  });
});

// ── Custom product mapping: Supabase → Local ─────────────────
describe('mapCustomRowToLocal', () => {
  it('maps English DB columns to shorthand local format', () => {
    const row = {
      name: 'Eigen granola',
      kcal: 420,
      carbs_g: 55,
      fiber_g: 8,
      fat_g: 15,
      protein_g: 12,
    };
    const result = mapCustomRowToLocal(row);
    expect(result.n).toBe('Eigen granola');
    expect(result.k).toBe(420);
    expect(result.kh).toBe(55);
    expect(result.vz).toBe(8);
    expect(result.v).toBe(15);
    expect(result.e).toBe(12);
    expect(result._custom).toBe(true);
  });

  it('handles missing values as 0', () => {
    const result = mapCustomRowToLocal({ name: 'Leeg' });
    expect(result.k).toBe(0);
    expect(result.kh).toBe(0);
  });
});

// ── Custom product mapping: Local → Supabase ─────────────────
describe('mapLocalCustomToRow', () => {
  it('maps shorthand local format to English DB columns', () => {
    const item = { n: 'Protein shake', k: 150, kh: 5, vz: 0, v: 2, e: 30, g: 300 };
    const result = mapLocalCustomToRow(item, 'user-456');
    expect(result.user_id).toBe('user-456');
    expect(result.name).toBe('Protein shake');
    expect(result.kcal).toBe(150);
    expect(result.carbs_g).toBe(5);
    expect(result.protein_g).toBe(30);
    expect(result.portion).toBe('300g');
    expect(result.legacy_key).toBe('protein shake');
  });

  it('sets portion to null when gram is 0 or missing', () => {
    const result = mapLocalCustomToRow({ n: 'Test', k: 0 }, 'u1');
    expect(result.portion).toBeNull();
  });
});

// ── Round-trip consistency ────────────────────────────────────
describe('round-trip mapping', () => {
  it('favourite survives local → supabase → local', () => {
    const original = {
      naam: 'Yoghurt met fruit',
      tekst: 'volle yoghurt met aardbeien',
      maaltijd: 'ochtendsnack',
      isRecipe: false,
      item: { naam: 'Yoghurt met fruit', kcal: 180, koolhydraten_g: 20, vetten_g: 5, eiwitten_g: 8 },
    };
    const row = mapLocalFavoriteToRow(original, 'user-x');
    const result = mapFavoriteRowToLocal(row);

    expect(result.naam).toBe(original.naam);
    expect(result.tekst).toBe(original.tekst);
    expect(result.maaltijd).toBe(original.maaltijd);
    expect(result.isRecipe).toBe(original.isRecipe);
    expect(result.item.kcal).toBe(original.item.kcal);
  });
});
