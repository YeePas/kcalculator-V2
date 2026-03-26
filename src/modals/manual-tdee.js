/* ── Manual TDEE Entry Modal ───────────────────────────────── */

import { cfg, authUser, currentDate, _doCurrentDays } from '../state.js';
import { sbHeaders } from '../supabase/config.js';
import { renderDataOverzicht } from '../pages/data-overview.js';
import {
  loadEnergyLocal,
  cacheEnergyRecord,
  markEnergyRecordSynced,
} from '../pages/data-overview-data.js';

function openManualTdeeModal() {
  const modal = document.getElementById('manual-tdee-modal');
  const dateInput = document.getElementById('manual-tdee-date');
  const kcalInput = document.getElementById('manual-tdee-kcal');
  const status = document.getElementById('manual-tdee-status');
  if (!modal || !dateInput || !kcalInput || !status) return;

  dateInput.value = currentDate;
  kcalInput.value = '';
  status.textContent = '';
  status.className = 'setup-status';
  modal.classList.add('open');
}

function closeManualTdeeModal() {
  document.getElementById('manual-tdee-modal')?.classList.remove('open');
}

async function saveManualTdee() {
  const dateInput = document.getElementById('manual-tdee-date');
  const kcalInput = document.getElementById('manual-tdee-kcal');
  const status = document.getElementById('manual-tdee-status');
  if (!dateInput || !kcalInput || !status) return;

  const date = String(dateInput.value || '').trim();
  const tdee = Math.round(parseFloat(kcalInput.value) || 0);
  if (!date) {
    status.textContent = 'Kies eerst een datum.';
    status.className = 'setup-status err';
    return;
  }
  if (tdee <= 0) {
    status.textContent = 'Vul een geldige TDEE in.';
    status.className = 'setup-status err';
    return;
  }

  const localEnergy = loadEnergyLocal();
  const existing = localEnergy[date];
  if (existing?.tdee_kcal > 0 && !window.confirm(`Er staat al verbruiksdata op ${date}. Wil je die vervangen door deze handmatige TDEE?`)) {
    status.textContent = 'Opslaan geannuleerd.';
    status.className = 'setup-status';
    return;
  }

  const record = {
    date,
    active_kcal: 0,
    resting_kcal: tdee,
    tdee_kcal: tdee,
    source: 'apple_health',
  };

  const shouldSync = Boolean(cfg.sbUrl && cfg.sbKey && authUser?.id);
  cacheEnergyRecord(date, record, { dirty: shouldSync, synced: !shouldSync });

  status.textContent = 'Opslaan…';
  status.className = 'setup-status';

  try {
    if (shouldSync) {
      await fetch(
        `${cfg.sbUrl}/rest/v1/daily_energy_stats?user_id=eq.${authUser.id}&date=eq.${date}`,
        { method: 'DELETE', headers: sbHeaders(true) }
      );
      const response = await fetch(`${cfg.sbUrl}/rest/v1/daily_energy_stats`, {
        method: 'POST',
        headers: { ...sbHeaders(true), Prefer: 'return=minimal' },
        body: JSON.stringify([{
          user_id: authUser.id,
          date,
          active_kcal: 0,
          resting_kcal: tdee,
          // Reuse the currently allowed source value in the existing DB constraint.
          source: 'apple_health',
        }]),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || `HTTP ${response.status}`);
      }
      markEnergyRecordSynced(date);
    }

    status.textContent = 'TDEE opgeslagen.';
    status.className = 'setup-status ok';

    if (document.getElementById('do-content')) {
      renderDataOverzicht(_doCurrentDays);
    }

    setTimeout(() => closeManualTdeeModal(), 250);
  } catch (error) {
    if (document.getElementById('do-content')) {
      renderDataOverzicht(_doCurrentDays);
    }
    status.textContent = shouldSync
      ? `Lokaal opgeslagen, sync mislukt: ${error instanceof Error ? error.message : 'onbekende fout'}`
      : 'TDEE lokaal opgeslagen.';
    status.className = 'setup-status err';
  }
}

export function initManualTdeeEntry() {
  document.getElementById('settings-manual-tdee-btn')?.addEventListener('click', openManualTdeeModal);
  document.getElementById('manual-tdee-cancel-btn')?.addEventListener('click', closeManualTdeeModal);
  document.getElementById('manual-tdee-save-btn')?.addEventListener('click', saveManualTdee);
  document.getElementById('manual-tdee-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('manual-tdee-modal')) closeManualTdeeModal();
  });
  document.getElementById('data-overzicht')?.addEventListener('click', e => {
    if (e.target.closest('[data-action="open-manual-tdee"]')) openManualTdeeModal();
  });
}
