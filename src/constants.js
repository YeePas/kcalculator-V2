/* ── Constants & Configuration ─────────────────────────────── */

// Storage keys
export const CFG_KEY = 'eetdagboek_cfg_v1';
export const CFG_SESSION_KEY = 'eetdagboek_cfg_session_v1';
export const GOALS_KEY = 'eetdagboek_goals_v1';
export const LOCAL_KEY = 'eetdagboek_local_v1';
export const LOCAL_META_KEY = 'eetdagboek_local_meta_v1';
export const VIS_KEY = 'eetdagboek_vis_v1';
export const FAV_KEY = 'eetdagboek_fav_v1';
export const DARK_KEY = 'eetdagboek_dark_v1';
export const DRINKS_KEY = 'eetdagboek_drinks_v1';
export const CUSTOM_KEY = 'eetdagboek_custom_v1';
export const ENERGY_LOCAL_KEY = 'eetdagboek_energy_local_v1';
export const ENERGY_META_KEY = 'eetdagboek_energy_meta_v1';
export const WEIGHT_KEY = 'eetdagboek_weight_v1';
export const PREFS_SYNC_META_KEY = 'eetdagboek_prefs_sync_meta_v1';
export const ENABLE_BETA_BUG_REPORT = false;
// Hardcoded Supabase fallback (from .env at build time)
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Default goals
export const DEFAULT_GOALS = { kcal: 2000, carbs: 250, fat: 70, prot: 80, fiber: 30, water: 2000 };

// Meal definitions
export const MEAL_NAMES = ['ontbijt', 'ochtendsnack', 'lunch', 'middagsnack', 'avondeten', 'avondsnack', 'drinken'];
export const MEAL_LABELS = {
  ontbijt: '🌅 Ontbijt',
  ochtendsnack: '🍎 Ochtendsnack',
  lunch: '☀️ Lunch',
  middagsnack: '🍪 Middagsnack',
  avondeten: '🌙 Avondeten',
  avondsnack: '🌜 Avondsnack',
  drinken: '💧 Drinken',
};

// AI provider models
// The first model per provider is its default. label: short select label, name: model pickers
// that list every provider, hint: the settings dropdown.
export const PROVIDER_MODELS = {
  claude: [
    { id: 'claude-haiku-5-5', label: 'Haiku 5.5 (snel)', name: 'Claude Haiku', hint: 'Haiku 5.5 — snel & goedkoop' },
    { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5 (slim)', name: 'Claude Sonnet', hint: 'Sonnet 5.5 — slimmer, ~20× duurder' },
  ],
  gemini: [
    { id: 'gemini-2.5-flash', label: '2.5 Flash (snel)', name: 'Gemini Flash (gratis)', hint: 'Gemini 2.5 Flash — gratis' },
    { id: 'gemini-2.5-pro', label: '2.5 Pro (slim)', name: 'Gemini Pro', hint: 'Gemini 2.5 Pro — betaald, slimmer' },
  ],
  openai: [
    { id: 'gpt-4o-mini', label: 'GPT-4o mini (snel)', name: 'GPT-4o mini', hint: 'GPT-4o mini — goedkoop' },
    { id: 'gpt-4o', label: 'GPT-4o (slim)', name: 'GPT-4o', hint: 'GPT-4o — slimmer, ~6× duurder' },
  ],
};

export const DEFAULT_PROVIDER_MODELS = Object.fromEntries(
  Object.entries(PROVIDER_MODELS).map(([provider, models]) => [provider, models[0].id])
);

export const AI_MODEL_OPTIONS = Object.entries(PROVIDER_MODELS).flatMap(([provider, models]) =>
  models.map(model => ({ value: `${provider}|${model.id}`, label: model.name }))
);
