/* ── Supabase Authentication ───────────────────────────────── */

import {
  cfg, authUser, setAuthUser as _setAuthUser, setLocalData,
  setGoals, setVis,
} from '../state.js';
import {
  LOCAL_KEY, FAV_KEY, GOALS_KEY, CUSTOM_KEY, VIS_KEY, WEIGHT_KEY, ENERGY_LOCAL_KEY,
  DEFAULT_GOALS, PREFS_SYNC_META_KEY,
} from '../constants.js';
import { getLocalStorage, getSessionStorage, safeParseFromStorage, safeRemove, safeSetJson } from '../storage.js';

const AUTH_KEY = 'eetdagboek_auth_v1';

export function clearUserScopedLocalState() {
  const localStorageRef = getLocalStorage();
  const sessionStorageRef = getSessionStorage();
  [
    LOCAL_KEY,
    FAV_KEY,
    GOALS_KEY,
    CUSTOM_KEY,
    VIS_KEY,
    WEIGHT_KEY,
    ENERGY_LOCAL_KEY,
    PREFS_SYNC_META_KEY,
    'eetdagboek_energy_v1',
  ].forEach(key => {
    safeRemove(localStorageRef, key);
    safeRemove(sessionStorageRef, key);
  });
  setLocalData({});
  setGoals({ ...DEFAULT_GOALS });
  setVis({ carbs: true, fat: true, prot: true, fiber: true, water: true });
}

function getDisplayInitials(name) {
  if (!name || typeof name !== 'string') return '';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  return parts.slice(0, 2).map(part => part[0]?.toUpperCase() || '').join('');
}

function getAccountLabel() {
  if (!authUser) return 'Login';
  const initials = getDisplayInitials(authUser.display_name);
  if (initials) return initials;
  const emailPrefix = authUser.email?.split('@')[0] || '';
  return emailPrefix ? emailPrefix.slice(0, 4) : 'Account';
}

export async function updateAuthProfile({ displayName }) {
  if (!cfg.sbUrl || !cfg.sbKey || !authUser?.access_token) {
    throw new Error('Je moet ingelogd zijn om je profiel aan te passen.');
  }

  const normalizedName = typeof displayName === 'string' ? displayName.trim() : '';
  const response = await fetch(`${cfg.sbUrl}/auth/v1/user`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'apikey': cfg.sbKey,
      'Authorization': 'Bearer ' + authUser.access_token,
    },
    body: JSON.stringify({
      data: {
        full_name: normalizedName,
      },
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error_description || payload?.msg || 'Profiel opslaan mislukt');
  }

  const updatedUser = payload?.user || payload || {};
  _setAuthUser({
    ...authUser,
    display_name: updatedUser.user_metadata?.full_name || updatedUser.user_metadata?.name || normalizedName,
  });
  safeSetJson(getLocalStorage() || getSessionStorage(), AUTH_KEY, authUser);
  updateAccountUI();
  return authUser;
}

function assertAuthConfig() {
  if (!cfg.sbUrl || !cfg.sbKey) {
    throw new Error('Supabase is niet goed ingesteld.');
  }
  try {
    new URL(cfg.sbUrl);
  } catch {
    throw new Error('Supabase URL is ongeldig.');
  }
}

function readStoredAuth() {
  const sessionStorageRef = getSessionStorage();
  const localStorageRef = getLocalStorage();
  const sessionRaw = sessionStorageRef?.getItem(AUTH_KEY) || null;
  const localRaw = localStorageRef?.getItem(AUTH_KEY) || null;

  // Migrate older session-only auth to persistent storage so login survives app relaunches.
  if (!localRaw && sessionRaw && localStorageRef) {
    safeSetJson(localStorageRef, AUTH_KEY, safeParseFromStorage(sessionStorageRef, AUTH_KEY, null));
  }
  if (sessionRaw) safeRemove(sessionStorageRef, AUTH_KEY);

  return localRaw || sessionRaw;
}

export async function sbAuthRegister(email, password) {
  assertAuthConfig();
  const r = await fetch(`${cfg.sbUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': cfg.sbKey },
    body: JSON.stringify({ email, password }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error_description || d.msg || 'Registratie mislukt');
  return d;
}

export async function sbAuthLogin(email, password) {
  assertAuthConfig();
  const r = await fetch(`${cfg.sbUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': cfg.sbKey },
    body: JSON.stringify({ email, password }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error_description || d.msg || 'Login mislukt');
  return d;
}

export async function sbAuthRefresh(refreshToken) {
  assertAuthConfig();
  try {
    const r = await fetch(`${cfg.sbUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': cfg.sbKey },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

export function setAuthUser(session) {
  if (session && session.access_token) {
    const prevUserId = authUser?.id;
    const user = session.user || {};
    _setAuthUser({
      id: user.id || session.user?.id,
      email: user.email || session.user?.email,
      display_name: user.user_metadata?.full_name || user.user_metadata?.name || session.user?.user_metadata?.full_name || session.user?.user_metadata?.name || '',
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    // Clear local cache when switching users
    if (prevUserId && prevUserId !== authUser.id) {
      clearUserScopedLocalState();
    }

    safeSetJson(getLocalStorage() || getSessionStorage(), AUTH_KEY, authUser);
    safeRemove(getSessionStorage(), AUTH_KEY);
  } else {
    _setAuthUser(null);
    safeRemove(getLocalStorage(), AUTH_KEY);
    safeRemove(getSessionStorage(), AUTH_KEY);
    clearUserScopedLocalState();
  }
}

export function updateAccountUI() {
  const el = document.getElementById('account-btn');
  if (!el) return;
  if (authUser) {
    el.dataset.accountState = 'user';
    el.textContent = '👤 ' + getAccountLabel();
    el.title = authUser.email || '';
    el.style.display = '';
  } else {
    el.dataset.accountState = 'guest';
    el.textContent = '👤 Login';
    el.title = 'Niet ingelogd';
    el.style.display = cfg.sbUrl ? '' : 'none';
  }
}

export async function restoreAuth() {
  try {
    const raw = readStoredAuth();
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!saved?.refresh_token) return;
    const session = await sbAuthRefresh(saved.refresh_token);
    if (session && session.access_token) {
      setAuthUser(session);
    } else {
      safeRemove(getSessionStorage(), AUTH_KEY);
      safeRemove(getLocalStorage(), AUTH_KEY);
    }
  } catch {
    safeRemove(getSessionStorage(), AUTH_KEY);
    safeRemove(getLocalStorage(), AUTH_KEY);
  }
}

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
    setAuthUser({
      access_token: accessToken,
      refresh_token: refreshToken,
      user: { id: payload.sub, email: payload.email },
    });

    history.replaceState(null, '', window.location.pathname + window.location.search);

    if (type === 'recovery') {
      setTimeout(() => {
        const newPass = prompt('Kies een nieuw wachtwoord (minimaal 6 tekens):');
        if (newPass && newPass.length >= 6) {
          fetch(`${cfg.sbUrl}/auth/v1/user`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'apikey': cfg.sbKey, 'Authorization': 'Bearer ' + accessToken },
            body: JSON.stringify({ password: newPass }),
          }).then(r => {
            if (r.ok) alert('✓ Wachtwoord gewijzigd!');
            else alert('Fout bij wijzigen wachtwoord.');
          });
        }
      }, 500);
    }

    return true;
  } catch (e) {
    console.error('Auth redirect parse error:', e);
    return false;
  }
}
