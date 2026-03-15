type ProxyRequest = {
  provider?: string;
  model?: string;
  system?: string | null;
  user?: string | null;
  maxTokens?: number;
  useWebSearch?: boolean;
  imageData?: string | null;
  imageMimeType?: string | null;
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

function getSecret(name: string) {
  return Deno.env.get(name)?.trim() || '';
}

async function callGemini(model: string, key: string, prompt: string, maxTokens: number) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.2 },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Gemini fout (${response.status})`);
  }
  return payload?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callGeminiVision(model: string, key: string, prompt: string, maxTokens: number, imageData: string, imageMimeType: string) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ inlineData: { mimeType: imageMimeType, data: imageData } }, { text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.2 },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Gemini fout (${response.status})`);
  }
  return payload?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callOpenAI(model: string, key: string, system: string | null, user: string, maxTokens: number) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0.2,
      messages: system
        ? [{ role: 'system', content: system }, { role: 'user', content: user }]
        : [{ role: 'user', content: user }],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `OpenAI fout (${response.status})`);
  }
  return payload?.choices?.[0]?.message?.content || '';
}

async function callOpenAIVision(model: string, key: string, user: string, maxTokens: number, imageData: string, imageMimeType: string) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${imageMimeType};base64,${imageData}` } },
          { type: 'text', text: user },
        ],
      }],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `OpenAI fout (${response.status})`);
  }
  return payload?.choices?.[0]?.message?.content || '';
}

async function callClaude(model: string, key: string, system: string | null, user: string, maxTokens: number, useWebSearch: boolean) {
  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: user }],
  };
  if (system) body.system = system;
  if (useWebSearch) {
    body.tools = [{
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: 3,
      allowed_domains: ['voedingscentrum.nl', 'nevo-online.rivm.nl', 'ah.nl', 'jumbo.com'],
    }];
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Claude fout (${response.status})`);
  }
  const blocks = Array.isArray(payload?.content) ? payload.content.filter((block: { type?: string }) => block?.type === 'text') : [];
  if (!blocks.length) throw new Error('Geen antwoord ontvangen');
  return blocks[blocks.length - 1].text || '';
}

async function callClaudeVision(model: string, key: string, user: string, maxTokens: number, imageData: string, imageMimeType: string) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: imageMimeType, data: imageData } },
          { type: 'text', text: user },
        ],
      }],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Claude fout (${response.status})`);
  }
  const blocks = Array.isArray(payload?.content) ? payload.content.filter((block: { type?: string }) => block?.type === 'text') : [];
  if (!blocks.length) throw new Error('Geen antwoord ontvangen');
  return blocks[blocks.length - 1].text || '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json() as ProxyRequest;
    const provider = String(body.provider || 'claude');
    const user = String(body.user || '').trim();
    const system = body.system ? String(body.system) : null;
    const maxTokens = Math.max(1, Math.min(Number(body.maxTokens) || 1400, 4000));
    const useWebSearch = Boolean(body.useWebSearch);
    const imageData = body.imageData ? String(body.imageData) : '';
    const imageMimeType = body.imageMimeType ? String(body.imageMimeType) : 'image/jpeg';

    if (!user) return json({ error: 'Missing user prompt' }, 400);

    if (provider === 'gemini') {
      const key = getSecret('GEMINI_API_KEY');
      if (!key) return json({ error: 'Supabase secret GEMINI_API_KEY ontbreekt' }, 500);
      const text = imageData
        ? await callGeminiVision(String(body.model || 'gemini-2.5-flash'), key, system ? `${system}\n\n${user}` : user, maxTokens, imageData, imageMimeType)
        : await callGemini(String(body.model || 'gemini-2.5-flash'), key, system ? `${system}\n\n${user}` : user, maxTokens);
      return json({ text });
    }

    if (provider === 'openai') {
      const key = getSecret('OPENAI_API_KEY');
      if (!key) return json({ error: 'Supabase secret OPENAI_API_KEY ontbreekt' }, 500);
      const text = imageData
        ? await callOpenAIVision(String(body.model || 'gpt-4o-mini'), key, user, maxTokens, imageData, imageMimeType)
        : await callOpenAI(String(body.model || 'gpt-4o-mini'), key, system, user, maxTokens);
      return json({ text });
    }

    const key = getSecret('ANTHROPIC_API_KEY');
    if (!key) return json({ error: 'Supabase secret ANTHROPIC_API_KEY ontbreekt' }, 500);
    const text = imageData
      ? await callClaudeVision(String(body.model || 'claude-haiku-4-5-20250514'), key, user, maxTokens, imageData, imageMimeType)
      : await callClaude(String(body.model || 'claude-haiku-4-5-20250514'), key, system, user, maxTokens, useWebSearch);
    return json({ text });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});
