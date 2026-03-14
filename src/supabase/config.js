/* ── Supabase Configuration & Headers ─────────────────────── */

import { cfg, authUser } from '../state.js';

export function sbHeaders(withAuth = true) {
  const h = {
    'apikey': cfg.sbKey,
    'Content-Type': 'application/json',
  };
  if (withAuth && authUser?.access_token) {
    h['Authorization'] = 'Bearer ' + authUser.access_token;
  }
  return h;
}

export function sbAuthHeaders() {
  return {
    'apikey': cfg.sbKey,
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + authUser?.access_token,
  };
}
