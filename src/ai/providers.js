/* ── AI Provider Routing ───────────────────────────────────── */
/* Faithful port of the original aiCall / claudeCall from index.html */

import { cfg } from '../state.js';
import { saveCfg } from '../storage.js';

export function hasAiProxyConfig() {
  return Boolean(cfg.sbUrl && cfg.sbKey);
}

export function assertAiAvailable() {
  if (!hasAiProxyConfig()) {
    throw new Error('AI is niet beschikbaar: koppel eerst Supabase zodat de beveiligde AI-proxy gebruikt kan worden.');
  }
}

/**
 * Universal AI call — routes to the correct provider API.
 * Original signature: aiCall(provider, system, user, maxTokens, useWebSearch)
 */
export async function aiCall(provider, system, user, maxTokens = 1400, useWebSearch = false) {
  assertAiAvailable();
  const resolvedProvider = provider || cfg.provider || 'claude';
  const resolvedModel = cfg.model || (resolvedProvider === 'openai'
    ? 'gpt-4o-mini'
    : resolvedProvider === 'gemini'
      ? 'gemini-2.5-flash'
      : 'claude-haiku-4-5-20250514');
  const response = await fetch(`${cfg.sbUrl}/functions/v1/ai-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': cfg.sbKey,
      'Authorization': 'Bearer ' + cfg.sbKey,
    },
    body: JSON.stringify({
      provider: resolvedProvider,
      model: resolvedModel,
      system,
      user,
      maxTokens,
      useWebSearch,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || 'AI-proxy fout (' + response.status + ')');
  return payload?.text || '';
}

/**
 * Wrapper for advies functions — uses adviesProvider/adviesModel when set.
 */
export async function claudeCall(prompt, maxTokens = 1400) {
  const provider = cfg.adviesProvider || cfg.provider || 'claude';
  const origModel = cfg.model;
  if (cfg.adviesModel) cfg.model = cfg.adviesModel;
  try {
    const text = await aiCall(provider, null, prompt, maxTokens, false);
    return { ok: true, json: async () => ({ content: [{ text }] }) };
  } finally {
    cfg.model = origModel;
  }
}

/**
 * Update the inline model select dropdown.
 */
export function updateInlineModelSelect(provider) {
  const PROVIDER_MODELS = {
    claude: [{ value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 — snel & goedkoop' }, { value: 'claude-sonnet-4-5', label: 'Sonnet 4.5 — slimmer, ~8× duurder' }],
    gemini: [{ value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash — gratis' }, { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro — betaald, slimmer' }],
    openai: [{ value: 'gpt-4o-mini', label: 'GPT-4o mini — goedkoop' }, { value: 'gpt-4o', label: 'GPT-4o — slimmer, ~6× duurder' }],
  };
  const sel = document.getElementById('inline-model-select');
  if (!sel) return;
  const models = PROVIDER_MODELS[provider] || [];
  sel.innerHTML = models.map(m => `<option value="${m.value}">${m.label}</option>`).join('');
  if (cfg.model && models.some(m => m.value === cfg.model)) sel.value = cfg.model;
}
