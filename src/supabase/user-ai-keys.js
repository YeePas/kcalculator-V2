import { cfg, authUser } from '../state.js';
import { sbHeaders } from './config.js';

const PROVIDERS = ['claude', 'gemini', 'openai'];

function ensureSupabase() {
  if (!cfg.sbUrl || !cfg.sbKey) throw new Error('Supabase is niet geconfigureerd.');
}

function ensureLoggedIn() {
  if (!authUser?.access_token) throw new Error('Je moet ingelogd zijn om AI-sleutels op te slaan.');
}

export async function fetchUserAiKeyStatuses() {
  ensureSupabase();
  ensureLoggedIn();
  const response = await fetch(`${cfg.sbUrl}/rest/v1/user_ai_keys?select=provider`, {
    headers: sbHeaders(true),
  });
  if (!response.ok) throw new Error('Kon AI-sleutels niet laden.');
  const rows = await response.json().catch(() => []);
  const set = new Set(Array.isArray(rows) ? rows.map(row => row.provider).filter(Boolean) : []);
  return Object.fromEntries(PROVIDERS.map(provider => [provider, set.has(provider)]));
}

export async function saveUserAiKey(provider, value) {
  ensureSupabase();
  ensureLoggedIn();
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  if (!PROVIDERS.includes(normalizedProvider)) throw new Error('Ongeldige provider.');
  const response = await fetch(`${cfg.sbUrl}/functions/v1/save-user-ai-key`, {
    method: 'POST',
    headers: sbHeaders(true),
    body: JSON.stringify({
      provider: normalizedProvider,
      key: String(value || ''),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || 'Opslaan van AI-sleutel mislukt.');
  return payload;
}
