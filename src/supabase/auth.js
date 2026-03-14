/* ── Supabase Authentication ───────────────────────────────── */

import { cfg, authUser, setAuthUser as _setAuthUser, setLocalData } from '../state.js';
import { LOCAL_KEY, FAV_KEY, GOALS_KEY, CUSTOM_KEY } from '../constants.js';
import { getLocalStorage, getSessionStorage, safeParseFromStorage, safeRemove, safeSetJson } from '../storage.js';

const AUTH_KEY = 'eetdagboek_auth_v1';

function readStoredAuth() {
  const sessionStorageRef = getSessionStorage();
  const localStorageRef = getLocalStorage();
  const sessionRaw = sessionStorageRef?.getItem(AUTH_KEY) || null;
  const localRaw = localStorageRef?.getItem(AUTH_KEY) || null;

  if (!sessionRaw && localRaw && sessionStorageRef) {
    safeSetJson(sessionStorageRef, AUTH_KEY, safeParseFromStorage(localStorageRef, AUTH_KEY, null));
  }
  if (localRaw) safeRemove(localStorageRef, AUTH_KEY);

  return sessionRaw || localRaw;
}

export async function sbAuthRegister(email, password) {
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
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    // Clear local cache when switching users
    if (prevUserId && prevUserId !== authUser.id) {
      const localStorageRef = getLocalStorage();
      safeRemove(localStorageRef, LOCAL_KEY);
      safeRemove(localStorageRef, FAV_KEY);
      safeRemove(localStorageRef, GOALS_KEY);
      safeRemove(localStorageRef, CUSTOM_KEY);
      setLocalData({});
    }

    safeSetJson(getSessionStorage() || getLocalStorage(), AUTH_KEY, authUser);
    safeRemove(getLocalStorage(), AUTH_KEY);
  } else {
    _setAuthUser(null);
    safeRemove(getSessionStorage(), AUTH_KEY);
    safeRemove(getLocalStorage(), AUTH_KEY);
  }
}

export function updateAccountUI() {
  const el = document.getElementById('account-btn');
  if (!el) return;
  if (authUser) {
    el.textContent = '👤 ' + (authUser.email?.split('@')[0] || 'Account');
    el.title = authUser.email || '';
    el.style.display = '';
  } else {
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
