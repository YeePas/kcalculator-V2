/* ── Data Management Modal ──────────────────────────────────── */

import { cfg, authUser, localData } from '../state.js';
import { LOCAL_KEY, ENERGY_LOCAL_KEY } from '../constants.js';
import { sbHeaders } from '../supabase/config.js';
import { renderMeals } from '../ui/render.js';
import { safeParse } from '../storage.js';

/* ── Status helper ──────────────────────────────────────────── */
function setStatus(msg, isError = false) {
  const el = document.getElementById('data-mgmt-status');
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? 'var(--danger)' : 'var(--green)';
}

/* ── Supabase delete helpers ────────────────────────────────── */
async function deleteFoodSupabase(dateStr) {
  if (!cfg.sbUrl || !cfg.sbKey || !authUser?.id) return;
  const filter = dateStr ? `&date=eq.${dateStr}` : '';
  try {
    await fetch(
      `${cfg.sbUrl}/rest/v1/eetdagboek?user_id=eq.${authUser.id}${filter}`,
      { method: 'DELETE', headers: sbHeaders(true) }
    );
  } catch { /* silent */ }
}

async function deleteEnergySupabase(dateStr) {
  if (!cfg.sbUrl || !cfg.sbKey || !authUser?.id) return { ok: true, deleted: 0, skipped: true };
  const filter = dateStr ? `&date=eq.${dateStr}` : '';
  try {
    const response = await fetch(
      `${cfg.sbUrl}/rest/v1/daily_energy_stats?user_id=eq.${authUser.id}${filter}`,
      {
        method: 'DELETE',
        headers: { ...sbHeaders(true), Prefer: 'return=representation' },
      }
    );
    if (!response.ok) {
      const body = await response.text();
      return { ok: false, deleted: 0, error: body || `HTTP ${response.status}` };
    }
    let deleted = 0;
    try {
      const rows = await response.json();
      deleted = Array.isArray(rows) ? rows.length : 0;
    } catch {
      deleted = 0;
    }
    return { ok: true, deleted };
  } catch (error) {
    return { ok: false, deleted: 0, error: error?.message || 'Netwerkfout' };
  }
}

/* ── Local delete helpers ───────────────────────────────────── */
function deleteFoodLocal(dateStr) {
  if (dateStr) {
    const all = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
    delete all[dateStr];
    localStorage.setItem(LOCAL_KEY, JSON.stringify(all));
    delete localData[dateStr];
  } else {
    localStorage.setItem(LOCAL_KEY, '{}');
    for (const key of Object.keys(localData)) delete localData[key];
  }
}

function deleteEnergyLocal(dateStr) {
  const keys = [ENERGY_LOCAL_KEY, 'eetdagboek_energy_v1'];
  for (const key of keys) {
    if (dateStr) {
      const data = safeParse(key, {});
      delete data[dateStr];
      try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* */ }
    } else {
      try { localStorage.setItem(key, '{}'); } catch { /* */ }
    }
  }
}

/* ── Format date for display ────────────────────────────────── */
function fmtDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('nl-NL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

/* ── Typed confirmation state ───────────────────────────────── */
let pendingDeleteAction = null;

function showConfirmArea(message, action) {
  const area = document.getElementById('delete-confirm-area');
  const msg = document.getElementById('delete-confirm-msg');
  const input = document.getElementById('delete-confirm-input');
  const btn = document.getElementById('delete-confirm-exec');
  if (!area) return;
  msg.innerHTML = message;
  input.value = '';
  btn.disabled = true;
  btn.style.opacity = '0.5';
  pendingDeleteAction = action;
  area.style.display = 'block';
  input.focus();
}

function hideConfirmArea() {
  const area = document.getElementById('delete-confirm-area');
  if (area) area.style.display = 'none';
  pendingDeleteAction = null;
}

/* ── Init ───────────────────────────────────────────────────── */
export function initDataManagement() {
  // Open modal
  document.getElementById('open-data-mgmt-btn')?.addEventListener('click', () => {
    setStatus('');
    hideConfirmArea();
    document.getElementById('delete-date-input').value = '';
    document.getElementById('data-mgmt-modal').classList.add('open');
  });

  // ── Per-date: delete food ──
  document.getElementById('delete-date-food-btn')?.addEventListener('click', async () => {
    const dateStr = document.getElementById('delete-date-input').value;
    if (!dateStr) { setStatus('Kies eerst een datum.', true); return; }
    if (!confirm(`Voedingsdata van ${fmtDate(dateStr)} verwijderen?`)) return;
    deleteFoodLocal(dateStr);
    await deleteFoodSupabase(dateStr);
    setStatus(`✓ Voedingsdata van ${fmtDate(dateStr)} verwijderd.`);
    renderMeals();
  });

  // ── Per-date: delete energy ──
  document.getElementById('delete-date-energy-btn')?.addEventListener('click', async () => {
    const dateStr = document.getElementById('delete-date-input').value;
    if (!dateStr) { setStatus('Kies eerst een datum.', true); return; }
    if (!confirm(`Activiteitsdata van ${fmtDate(dateStr)} verwijderen?`)) return;
    deleteEnergyLocal(dateStr);
    const result = await deleteEnergySupabase(dateStr);
    if (!result.ok) {
      setStatus(`Activiteitsdata lokaal verwijderd, maar server verwijderen mislukte: ${result.error}`, true);
      return;
    }
    const extra = result.skipped ? ' (alleen lokaal)' : ` (${result.deleted} serverrij${result.deleted === 1 ? '' : 'en'})`;
    setStatus(`✓ Activiteitsdata van ${fmtDate(dateStr)} verwijderd${extra}.`);
  });

  // ── Per-date: delete both ──
  document.getElementById('delete-date-both-btn')?.addEventListener('click', async () => {
    const dateStr = document.getElementById('delete-date-input').value;
    if (!dateStr) { setStatus('Kies eerst een datum.', true); return; }
    if (!confirm(`Alle data van ${fmtDate(dateStr)} verwijderen (voeding + activiteit)?`)) return;
    deleteFoodLocal(dateStr);
    deleteEnergyLocal(dateStr);
    await deleteFoodSupabase(dateStr);
    const result = await deleteEnergySupabase(dateStr);
    if (!result.ok) {
      setStatus(`Voedingsdata verwijderd, maar activity op server verwijderen mislukte: ${result.error}`, true);
      return;
    }
    const extra = result.skipped ? ' (activiteit alleen lokaal)' : ` (${result.deleted} activity-rij${result.deleted === 1 ? '' : 'en'} op server)`;
    setStatus(`✓ Alle data van ${fmtDate(dateStr)} verwijderd${extra}.`);
    renderMeals();
  });

  // ── Delete ALL food (typed confirmation) ──
  document.getElementById('delete-all-food-btn')?.addEventListener('click', () => {
    showConfirmArea(
      'Je staat op het punt <strong>alle voedingsdata</strong> te verwijderen.<br>Type <strong>VERWIJDER</strong> om te bevestigen:',
      async () => {
        deleteFoodLocal(null);
        await deleteFoodSupabase(null);
        setStatus('✓ Alle voedingsdata verwijderd.');
        renderMeals();
      }
    );
  });

  // ── Delete ALL energy (typed confirmation) ──
  document.getElementById('delete-all-energy-btn')?.addEventListener('click', () => {
    showConfirmArea(
      'Je staat op het punt <strong>alle activiteitsdata</strong> (Apple Health calorieën) te verwijderen.<br>Type <strong>VERWIJDER</strong> om te bevestigen:',
      async () => {
        deleteEnergyLocal(null);
        await deleteEnergySupabase(null);
        setStatus('✓ Alle activiteitsdata verwijderd.');
      }
    );
  });

  // ── Typed confirmation: input handler ──
  document.getElementById('delete-confirm-input')?.addEventListener('input', function () {
    const ok = this.value.trim().toUpperCase() === 'VERWIJDER';
    const btn = document.getElementById('delete-confirm-exec');
    btn.disabled = !ok;
    btn.style.opacity = ok ? '1' : '0.5';
  });

  // ── Typed confirmation: execute ──
  document.getElementById('delete-confirm-exec')?.addEventListener('click', async () => {
    if (pendingDeleteAction) {
      await pendingDeleteAction();
      hideConfirmArea();
    }
  });

  // ── Typed confirmation: cancel ──
  document.getElementById('delete-confirm-cancel')?.addEventListener('click', hideConfirmArea);

  // ── Close on backdrop ──
  document.getElementById('data-mgmt-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('data-mgmt-modal')) {
      document.getElementById('data-mgmt-modal').classList.remove('open');
    }
  });
}
