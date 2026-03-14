/* ── AI Provider Routing ───────────────────────────────────── */
/* Faithful port of the original aiCall / claudeCall from index.html */

import { cfg } from '../state.js';
import { saveCfg } from '../storage.js';

/**
 * Universal AI call — routes to the correct provider API.
 * Original signature: aiCall(provider, system, user, maxTokens, useWebSearch)
 */
export async function aiCall(provider, system, user, maxTokens = 1400, useWebSearch = false) {
  const key = (cfg.keys && cfg.keys[provider]) || cfg.claudeKey;
  if (!key) throw new Error('Geen API key ingesteld voor ' + provider);
  const fullPrompt = system ? system + '\n\n' + user : user;

  if (provider === 'gemini') {
    const model = cfg.model || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const r = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.2 },
      }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message || 'Gemini fout (' + r.status + ')');
    return d.candidates?.[0]?.content?.parts?.[0]?.text || '';

  } else if (provider === 'openai') {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({
        model: cfg.model || 'gpt-4o-mini', max_tokens: maxTokens, temperature: 0.2,
        messages: system
          ? [{ role: 'system', content: system }, { role: 'user', content: user }]
          : [{ role: 'user', content: user }],
      }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message || 'OpenAI fout (' + r.status + ')');
    return d.choices?.[0]?.message?.content || '';

  } else {
    // Claude (default) — met web search tool voor parseFood
    const body = {
      model: cfg.model || 'claude-haiku-4-5-20251001', max_tokens: maxTokens,
      messages: [{ role: 'user', content: user }],
    };
    if (system) body.system = system;
    if (useWebSearch) body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3,
      allowed_domains: ['voedingscentrum.nl', 'nevo-online.rivm.nl', 'ah.nl', 'jumbo.com'] }];
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key,
        'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message || 'Claude fout (' + r.status + ')');
    const blocks = d.content.filter(b => b.type === 'text');
    if (!blocks.length) throw new Error('Geen antwoord ontvangen');
    return blocks[blocks.length - 1].text;
  }
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
