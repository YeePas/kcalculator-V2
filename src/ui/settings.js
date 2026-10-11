/* ── Settings screen, login redirect and AI key tests ─────── */

import { cfg, goals, authUser, setCfg } from '../state.js';
import { DEFAULT_PROVIDER_MODELS as AI_PROVIDER_DEFAULT_MODELS, PROVIDER_MODELS } from '../constants.js';
import { isLocalDevHost, loadSessionAiKeys, saveCfg, saveSessionAiKey } from '../storage.js';
import { setAuthUser } from '../supabase/auth.js';
import { fetchUserAiKeyStatuses, saveUserAiKey } from '../supabase/user-ai-keys.js';
import { SUPERMARKET_OPTIONS, normalizeSupermarketFilters } from '../products/supermarket-filter.js';
import { openAdminPage } from '../pages/admin.js';

export const ALLOW_REGISTRATION = ['true', '1', 'yes', 'on'].includes(String(import.meta.env.VITE_ALLOW_REGISTRATION || '').toLowerCase());

// ══════════════════════════════════════════════════════════════
// Auth Redirect Handler
// ══════════════════════════════════════════════════════════════
export function handleAuthRedirect() {
  const hash = window.location.hash;
  if (!hash || !hash.includes('access_token=')) return false;
  const params = new URLSearchParams(hash.substring(1));
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const type = params.get('type');
  if (!accessToken) return false;
  try {
    const payload = JSON.parse(atob(accessToken.split('.')[1]));
    setAuthUser({ access_token: accessToken, refresh_token: refreshToken, user: { id: payload.sub, email: payload.email } });
    history.replaceState(null, '', window.location.pathname + window.location.search);
    if (type === 'recovery') {
      setTimeout(() => {
        const newPass = prompt('Kies een nieuw wachtwoord (minimaal 6 tekens):');
        if (newPass && newPass.length >= 6) {
          fetch(`${cfg.sbUrl}/auth/v1/user`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'apikey': cfg.sbKey, 'Authorization': 'Bearer ' + accessToken },
            body: JSON.stringify({ password: newPass }),
          }).then(r => { if (r.ok) alert('✓ Wachtwoord gewijzigd!'); else alert('Fout bij wijzigen wachtwoord.'); });
        }
      }, 500);
    }
    return true;
  } catch (e) { console.error('Auth redirect parse error:', e); return false; }
}

export function getSelectedAiProvider(groupName, fallback = 'claude') {
  return document.querySelector(`input[name="${groupName}"]:checked`)?.value || fallback;
}

export function setAiProviderStatus(provider, text, tone = '') {
  const statusEl = document.getElementById(`setup-key-status-${provider}`);
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = `setup-hint${tone ? ` ${tone}` : ''}`;
}

function syncAiProviderCardSelection() {
  const defaultProvider = getSelectedAiProvider('default-ai-provider', cfg.provider || 'claude');
  const adviesProvider = getSelectedAiProvider('advies-ai-provider', cfg.adviesProvider || defaultProvider);
  const importProvider = getSelectedAiProvider('smart-import-provider', cfg.importProvider || defaultProvider);
  document.querySelectorAll('.ai-provider-row').forEach(row => {
    const provider = row.dataset.provider;
    row.classList.toggle('is-default-provider', provider === defaultProvider);
    row.classList.toggle('is-advies-provider', provider === adviesProvider);
    row.classList.toggle('is-import-provider', provider === importProvider);
  });
}

async function runAiProxyKeyTest(provider) {
  const response = await fetch(`${cfg.sbUrl}/functions/v1/ai-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': cfg.sbKey,
      'Authorization': 'Bearer ' + (authUser?.access_token || cfg.sbKey),
    },
    body: JSON.stringify({
      provider,
      model: AI_PROVIDER_DEFAULT_MODELS[provider] || AI_PROVIDER_DEFAULT_MODELS.claude,
      user: 'Antwoord alleen met OK.',
      maxTokens: 256,
      useWebSearch: false,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || `Test mislukt (${response.status})`);
  return payload?.text || '';
}

async function runDirectGeminiKeyTest(apiKey) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(AI_PROVIDER_DEFAULT_MODELS.gemini)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: 'Antwoord alleen met OK.' }] }],
      generationConfig: {
        maxOutputTokens: 256,
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `Gemini test mislukt (${response.status})`);
  const text = (payload?.candidates || [])
    .flatMap(candidate => candidate?.content?.parts || [])
    .map(part => part?.text || '')
    .join('')
    .trim();
  if (!text) throw new Error('Gemini gaf geen bruikbare tekst terug.');
  return text;
}

export async function testSetupAiProvider(provider) {
  const input = document.getElementById(`setup-key-${provider}`);
  const button = document.getElementById(`setup-test-key-${provider}`);
  const rawValue = input?.value?.trim() || '';
  const canUseProxy = Boolean(cfg.sbUrl && cfg.sbKey && authUser?.access_token);
  const canUseLocalGemini = provider === 'gemini' && isLocalDevHost();

  if (button) button.disabled = true;
  setAiProviderStatus(provider, 'Bezig met testen…');

  try {
    if (rawValue) {
      if (canUseProxy) {
        await saveUserAiKey(provider, rawValue);
        if (input) input.value = '';
      } else if (canUseLocalGemini) {
        saveSessionAiKey('gemini', rawValue);
        const nextCfg = { ...cfg, keys: loadSessionAiKeys() };
        setCfg(nextCfg);
        saveCfg(nextCfg);
      } else {
        throw new Error('Log in om deze sleutel veilig te testen en op te slaan.');
      }
    }

    if (provider === 'gemini' && canUseLocalGemini && (!canUseProxy || rawValue || cfg.keys?.gemini)) {
      await runDirectGeminiKeyTest(rawValue || cfg.keys?.gemini || '');
      setAiProviderStatus(provider, canUseProxy ? 'Key getest en veilig opgeslagen' : 'Key getest en lokaal opgeslagen', 'ok');
      return;
    }

    if (!canUseProxy) {
      throw new Error('Log in om deze provider via de beveiligde serverproxy te testen.');
    }

    await runAiProxyKeyTest(provider);
    setAiProviderStatus(provider, 'Key getest en veilig opgeslagen', 'ok');
  } catch (error) {
    setAiProviderStatus(provider, error instanceof Error ? error.message : 'Test mislukt.', 'err');
  } finally {
    if (button) button.disabled = false;
  }
}

// ══════════════════════════════════════════════════════════════
// Setup Screen
// ══════════════════════════════════════════════════════════════
export function showSetup(panel) {
  const screen = document.getElementById('setup-screen');
  screen.style.display = 'flex';
  const closeBtn = document.getElementById('setup-close-btn');
  if (closeBtn) closeBtn.style.display = (panel === 'user' || authUser) ? '' : 'none';
  const authEl = document.getElementById('setup-auth');
  const userEl = document.getElementById('setup-user');
  if (authEl) authEl.style.display = 'none';
  if (userEl) userEl.style.display = 'none';

  // Model names come from PROVIDER_MODELS, so the table never names a model the app no longer uses
  document.querySelectorAll('[data-models]').forEach(el => {
    el.textContent = (PROVIDER_MODELS[el.dataset.models] || []).map(m => m.label.replace(/\s*\(.*\)$/, '')).join(' · ');
  });

  if (panel === 'user' || authUser) {
    const sessionAiKeys = loadSessionAiKeys();
    const hasLocalGeminiKey = isLocalDevHost() && Boolean(sessionAiKeys.gemini);
    document.getElementById('setup-display-name').value = authUser?.display_name || '';
    document.getElementById('setup-goal-kcal').value = goals.kcal || '';
    document.getElementById('setup-goal-carbs').value = goals.carbs || '';
    document.getElementById('setup-goal-fat').value = goals.fat || '';
    document.getElementById('setup-goal-prot').value = goals.prot || '';
    document.getElementById('setup-goal-fiber').value = goals.fiber || '';
    document.getElementById('setup-goal-water').value = goals.water || '';
    ['claude', 'gemini', 'openai'].forEach(provider => {
      const input = document.getElementById(`setup-key-${provider}`);
      if (input) {
        input.value = '';
        input.placeholder = provider === 'gemini' && hasLocalGeminiKey
          ? 'Lokaal in deze sessie opgeslagen'
          : (provider === 'gemini' ? 'AIza…' : 'sk-…');
      }
      setAiProviderStatus(
        provider,
        provider === 'gemini' && hasLocalGeminiKey
          ? 'Alleen lokaal in deze browsersessie'
          : (authUser ? 'Laden…' : 'Log in om veilig op te slaan'),
      );
    });
    document.getElementById('setup-status').textContent = '';
    setProviderUI(cfg.provider || 'claude');
    setAdviesProviderUI(cfg.adviesProvider || cfg.provider || 'claude');
    setSmartImportProviderUI(cfg.importProvider || cfg.provider || 'claude');
    syncSupermarketFilterUI(cfg.supermarketExclusions || []);
    const offToggle = document.getElementById('settings-off-live-toggle');
    if (offToggle) offToggle.checked = cfg.openFoodFactsLiveSearch !== false;
    const greeting = document.getElementById('setup-user-greeting');
    if (greeting) {
      if (authUser) {
        greeting.textContent = 'Ingelogd als ' + authUser.email;
        const lb = document.getElementById('logout-settings-btn'); if (lb) lb.style.display = '';
      } else {
        greeting.textContent = 'Lokale modus (geen sync).';
        const lb2 = document.getElementById('logout-settings-btn'); if (lb2) lb2.style.display = 'none';
      }
    }
    if (userEl) userEl.style.display = '';
    activateSettingsTab('profiel');
    if (authUser?.access_token && cfg.sbUrl && cfg.sbKey) {
      fetchUserAiKeyStatuses().then(statuses => {
        ['claude', 'gemini', 'openai'].forEach(provider => {
          const input = document.getElementById(`setup-key-${provider}`);
          const isLocalGemini = provider === 'gemini' && hasLocalGeminiKey;
          if (input) {
            input.placeholder = isLocalGemini
              ? 'Lokaal in deze sessie opgeslagen'
              : (statuses[provider] ? 'Veilig opgeslagen in Supabase' : (provider === 'gemini' ? 'AIza…' : 'sk-…'));
          }
          setAiProviderStatus(
            provider,
            isLocalGemini
              ? 'Alleen lokaal in deze browsersessie'
              : (statuses[provider] ? 'Veilig opgeslagen' : 'Nog geen sleutel opgeslagen'),
            statuses[provider] ? 'ok' : '',
          );
        });
      }).catch(() => {
        ['claude', 'gemini', 'openai'].forEach(provider => {
          setAiProviderStatus(
            provider,
            provider === 'gemini' && hasLocalGeminiKey
              ? 'Alleen lokaal in deze browsersessie'
              : 'Kon status niet laden',
            provider === 'gemini' && hasLocalGeminiKey ? 'ok' : 'err',
          );
        });
      });
    }
  } else {
    const authSt = document.getElementById('auth-status'); if (authSt) authSt.textContent = '';
    const ae = document.getElementById('auth-email'); if (ae) ae.value = '';
    const ap = document.getElementById('auth-pass'); if (ap) ap.value = '';
    const registerBtn = document.getElementById('auth-register-btn');
    const registerNote = document.getElementById('auth-register-note');
    if (registerBtn) {
      registerBtn.hidden = !ALLOW_REGISTRATION;
      registerBtn.disabled = !ALLOW_REGISTRATION;
    }
    if (registerNote) registerNote.hidden = ALLOW_REGISTRATION;
    if (!cfg.sbUrl || !cfg.sbKey) {
      authSt.textContent = 'Inloggen is nu niet beschikbaar. Je kunt wel lokaal verder zonder account.';
      authSt.className = 'setup-status';
    }
    if (authEl) authEl.style.display = '';
  }
}

export function setProviderUI(provider) {
  const radio = document.querySelector(`input[name="default-ai-provider"][value="${provider}"]`);
  if (radio) radio.checked = true;
  syncAiProviderCardSelection();
}

export function setSmartImportProviderUI(provider) {
  const radio = document.querySelector(`input[name="smart-import-provider"][value="${provider}"]`);
  if (radio) radio.checked = true;
  syncAiProviderCardSelection();
}

export function setAdviesProviderUI(provider) {
  const radio = document.querySelector(`input[name="advies-ai-provider"][value="${provider}"]`);
  if (radio) radio.checked = true;
  syncAiProviderCardSelection();
}

function syncSupermarketFilterUI(excludedFilters = []) {
  const excluded = new Set(normalizeSupermarketFilters(excludedFilters));
  SUPERMARKET_OPTIONS.forEach(option => {
    const input = document.getElementById(`supermarket-filter-${option.id}`);
    if (input) input.checked = !excluded.has(option.id); // checked = NIET uitgesloten
  });
}

export function activateSettingsTab(tabId) {
  document.querySelectorAll('.settings-nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
  document.querySelectorAll('.settings-tab').forEach(t => t.classList.toggle('active', t.id === `settings-tab-${tabId}`));
}

export function hideSetup() { document.getElementById('setup-screen').style.display = 'none'; }

export function openGoalsModal() {
  hideSetup();
  document.getElementById('goal-kcal').value = goals.kcal || '';
  document.getElementById('goal-carbs').value = goals.carbs || '';
  document.getElementById('goal-fat').value = goals.fat || '';
  document.getElementById('goal-prot').value = goals.prot || '';
  document.getElementById('goal-fiber').value = goals.fiber || '';
  document.getElementById('goal-water').value = goals.water || '';
  document.getElementById('modal-overlay').classList.add('open');
}

function isAdminRoute() {
  const normalized = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
  return normalized === '/admin';
}

export function openAdminIfRoute() {
  if (!isAdminRoute()) return;
  if (!authUser?.access_token) {
    showSetup('auth');
    return;
  }
  openAdminPage();
}
