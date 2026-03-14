/* ── Supabase Mapping Helpers ─────────────────────────────── */

export function mapFavoriteRowToLocal(row) {
  return {
    naam: row.name || '',
    tekst: row.text_value || '',
    maaltijd: row.meal || 'ontbijt',
    isRecipe: !!row.is_recipe,
    items: Array.isArray(row.items) ? row.items : undefined,
    item: row.item && typeof row.item === 'object' ? row.item : undefined,
  };
}

export function mapLocalFavoriteToRow(fav, userId) {
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

export function mapCustomRowToLocal(row) {
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

export function mapLocalCustomToRow(item, userId) {
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
