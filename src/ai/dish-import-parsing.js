/* ── Dish Import Parsing Helpers ─────────────────────────── */

import { cfg } from '../state.js';

function avgFromRange(raw) {
  const m = String(raw || '').match(/(\d+(?:[.,]\d+)?)\s*[–-]\s*(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const a = parseLocalizedNumber(m[1]);
  const b = parseLocalizedNumber(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return (a + b) / 2;
}

function parseLocalizedNumber(raw) {
  const value = String(raw || '').trim();
  if (!value) return NaN;

  if (/,/.test(value) && /\./.test(value)) {
    return parseFloat(value.replace(/\./g, '').replace(',', '.'));
  }
  if (/,/.test(value)) {
    return parseFloat(value.replace(',', '.'));
  }
  if (/^\d{1,3}(?:\.\d{3})+$/.test(value)) {
    return parseFloat(value.replace(/\./g, ''));
  }
  return parseFloat(value);
}

function numberNearLabel(text, labels) {
  for (const label of labels) {
    const rx = new RegExp(label + String.raw`[^\d]{0,24}(\d+(?:[.,]\d+)?(?:\s*[–-]\s*\d+(?:[.,]\d+)?)?)`, 'i');
    const m = text.match(rx);
    if (!m) continue;
    const ranged = avgFromRange(m[1]);
    if (ranged !== null) return ranged;
    const n = parseLocalizedNumber(m[1]);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function extractCalories(text) {
  const kcalAfterNumber = text.match(/(\d+(?:[.,]\d+)?)\s*kcal\b/i);
  if (kcalAfterNumber) {
    const value = parseLocalizedNumber(kcalAfterNumber[1]);
    if (Number.isFinite(value)) return Math.round(value);
  }

  const kcalAfterLabel = text.match(/\bkcal\b[^\d]{0,12}(\d+(?:[.,]\d+)?)/i);
  if (kcalAfterLabel) {
    const value = parseLocalizedNumber(kcalAfterLabel[1]);
    if (Number.isFinite(value)) return Math.round(value);
  }

  return Math.round(numberNearLabel(text, ['calorie[eë]n', 'energie']));
}

export function parsePastedNutrition(rawText) {
  const text = String(rawText || '').replace(/\t/g, ' ').replace(/±/g, '').trim();
  return {
    calories: extractCalories(text),
    carbs_g: Number(numberNearLabel(text, ['koolhydraten', 'kh']).toFixed(1)),
    protein_g: Number(numberNearLabel(text, ['eiwit(?:ten)?', 'prote[iï]ne']).toFixed(1)),
    fat_g: Number(numberNearLabel(text, ['vet(?:ten)?']).toFixed(1)),
    fiber_g: Number(numberNearLabel(text, ['vezels?', 'fiber']).toFixed(1)),
  };
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchViaSupabaseProxy(url) {
  if (!cfg?.sbUrl || !cfg?.sbKey) return { text: '', source: 'none' };
  try {
    const proxyUrl = `${cfg.sbUrl}/functions/v1/url-import-proxy?url=${encodeURIComponent(url)}`;
    const r = await fetch(proxyUrl, {
      headers: {
        apikey: cfg.sbKey,
        Authorization: 'Bearer ' + cfg.sbKey,
      },
    });
    if (!r.ok) return { text: '', source: 'none' };
    const data = await r.json();
    const text = String(data?.text || '').replace(/\s+/g, ' ').trim().slice(0, 16000);
    if (!text) return { text: '', source: 'none' };
    return { text, source: data?.source || 'supabase-proxy' };
  } catch {
    return { text: '', source: 'none' };
  }
}

export async function fetchUrlContentForImport(url) {
  const clean = String(url || '').trim();
  const proxied = await fetchViaSupabaseProxy(clean);
  if (proxied.text) return proxied;

  try {
    const direct = await fetch(clean);
    if (direct.ok) {
      const html = await direct.text();
      const text = stripHtml(html).slice(0, 12000);
      if (text) return { text, source: 'direct' };
    }
  } catch (e) {
    // Try fallback below.
  }

  try {
    const proxyCandidates = [
      'https://r.jina.ai/' + clean,
      'https://r.jina.ai/http://' + clean.replace(/^https?:\/\//i, ''),
      'https://r.jina.ai/https://' + clean.replace(/^https?:\/\//i, ''),
    ];
    for (const proxyUrl of proxyCandidates) {
      const viaProxy = await fetch(proxyUrl);
      if (!viaProxy.ok) continue;
      const text = (await viaProxy.text()).replace(/\s+/g, ' ').trim().slice(0, 16000);
      if (text) return { text, source: 'r.jina.ai' };
    }
  } catch (e) {
    // Ignore and let caller fallback.
  }

  return { text: '', source: 'none' };
}
