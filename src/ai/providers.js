/* ── AI Provider Routing ───────────────────────────────────── */
/* Faithful port of the original aiCall / claudeCall from index.html */

import { cfg, authUser } from '../state.js';
import { isLocalDevHost } from '../storage.js';

const DEFAULT_MODELS = {
  claude: 'claude-haiku-4-5-20251001',
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
};

const PROVIDER_MODELS = {
  claude: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-5-20250929'],
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro'],
  openai: ['gpt-4o-mini', 'gpt-4o'],
};

function resolveModel(provider, preferredModel) {
  const validModels = PROVIDER_MODELS[provider] || [];
  if (preferredModel && validModels.includes(preferredModel)) return preferredModel;
  return DEFAULT_MODELS[provider] || DEFAULT_MODELS.claude;
}

export function hasAiProxyConfig() {
  return Boolean(cfg.sbUrl && cfg.sbKey);
}

export function hasLocalSessionAi(provider = 'gemini') {
  return isLocalDevHost() && Boolean(cfg.keys?.[provider]);
}

export function hasAiAvailable() {
  return hasAiProxyConfig() || hasLocalSessionAi('gemini');
}

export function assertAiAvailable() {
  if (!hasAiAvailable()) {
    throw new Error('AI is niet beschikbaar: koppel Supabase of gebruik lokaal een Gemini testsleutel.');
  }
}

async function callGeminiDirect(model, system, user, maxTokens, useWebSearch) {
  const apiKey = cfg.keys?.gemini;
  if (!apiKey) throw new Error('Geen lokale Gemini testsleutel gevonden.');

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        maxOutputTokens: maxTokens,
      },
      ...(useWebSearch ? { tools: [{ googleSearch: {} }] } : {}),
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `Gemini fout (${response.status})`);

  const text = (payload?.candidates || [])
    .flatMap(candidate => candidate?.content?.parts || [])
    .map(part => part?.text || '')
    .join('')
    .trim();

  if (!text) throw new Error('Gemini gaf geen bruikbare tekst terug.');
  return text;
}

/**
 * Universal AI call — routes to the correct provider API.
 * Original signature: aiCall(provider, system, user, maxTokens, useWebSearch)
 */
export async function aiCall(provider, system, user, maxTokens = 1400, useWebSearch = false) {
  const resolvedProvider = provider || cfg.provider || 'claude';
  const resolvedModel = resolveModel(resolvedProvider, cfg.model);
  if (resolvedProvider === 'gemini' && hasLocalSessionAi('gemini')) {
    return callGeminiDirect(resolvedModel, system, user, maxTokens, useWebSearch);
  }
  assertAiAvailable();
  let response;
  try {
    response = await fetch(`${cfg.sbUrl}/functions/v1/ai-proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': cfg.sbKey,
        'Authorization': 'Bearer ' + (authUser?.access_token || cfg.sbKey),
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
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Onbekende netwerkfout';
    throw new Error(`AI-proxy niet bereikbaar. Controleer of de Supabase functie ai-proxy live staat en of je browser geen oude build cachet. Technische melding: ${message}`);
  }
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
  const providerOptions = {
    claude: [{ value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 — snel & goedkoop' }, { value: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5 — slimmer, ~8× duurder' }],
    gemini: [{ value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash — gratis' }, { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro — betaald, slimmer' }],
    openai: [{ value: 'gpt-4o-mini', label: 'GPT-4o mini — goedkoop' }, { value: 'gpt-4o', label: 'GPT-4o — slimmer, ~6× duurder' }],
  };
  const sel = document.getElementById('inline-model-select');
  if (!sel) return;
  const models = providerOptions[provider] || [];
  sel.innerHTML = models.map(m => `<option value="${m.value}">${m.label}</option>`).join('');
  const resolvedModel = resolveModel(provider, cfg.model);
  if (models.some(m => m.value === resolvedModel)) sel.value = resolvedModel;
}
