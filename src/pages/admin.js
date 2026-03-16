/* ── Admin Page ─────────────────────────────────────────── */

import { authUser } from '../state.js';
import { cfg } from '../state.js';
import { sbHeaders } from '../supabase/config.js';
import { esc } from '../utils.js';
import { switchMobileView } from '../ui/misc.js';

function getAdminEmails() {
  return String(import.meta.env.VITE_ADMIN_EMAILS || '')
    .split(',')
    .map(v => v.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminUser() {
  const email = String(authUser?.email || '').toLowerCase();
  const allowlist = getAdminEmails();
  if (!email) return false;
  if (allowlist.length === 0) return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  return allowlist.includes(email);
}

function renderUnauthorized(message = 'Je hebt geen adminrechten voor deze pagina.') {
  const body = document.getElementById('admin-body');
  if (!body) return;
  body.innerHTML = `<div class="do-empty">${esc(message)}</div>`;
}

function severityColor(severity) {
  if (severity === 'critical') return 'var(--danger)';
  if (severity === 'high') return '#e67e22';
  if (severity === 'medium') return 'var(--accent)';
  return 'var(--muted)';
}

function statusColor(status) {
  if (status === 'resolved') return 'var(--green)';
  if (status === 'triaged') return '#2f8cc8';
  return 'var(--danger)';
}

function formatWhen(dateIso) {
  if (!dateIso) return 'onbekend';
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return 'onbekend';
  return d.toLocaleString('nl-NL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

async function fetchAdminIssues({ status = 'all' } = {}) {
  const query = new URLSearchParams();
  if (status && status !== 'all') query.set('status', status);

  const response = await fetch(`${cfg.sbUrl}/functions/v1/admin-issues?${query.toString()}`, {
    headers: sbHeaders(true),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || 'Kon issues niet laden');
  return payload?.issues || [];
}

async function updateIssueStatus(id, status) {
  const response = await fetch(`${cfg.sbUrl}/functions/v1/admin-issues`, {
    method: 'POST',
    headers: sbHeaders(true),
    body: JSON.stringify({ id, status }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || 'Kon status niet wijzigen');
}

function renderIssueStats(issues) {
  const open = issues.filter(i => i.status === 'open').length;
  const triaged = issues.filter(i => i.status === 'triaged').length;
  const resolved = issues.filter(i => i.status === 'resolved').length;
  const critical = issues.filter(i => i.severity === 'critical' && i.status !== 'resolved').length;

  return `
    <div class="admin-kpi-grid">
      <div class="do-kpi"><div class="do-kpi-val">${open}</div><div class="do-kpi-label">Open</div></div>
      <div class="do-kpi"><div class="do-kpi-val">${triaged}</div><div class="do-kpi-label">Triaged</div></div>
      <div class="do-kpi"><div class="do-kpi-val">${resolved}</div><div class="do-kpi-label">Resolved</div></div>
      <div class="do-kpi"><div class="do-kpi-val" style="color:var(--danger)">${critical}</div><div class="do-kpi-label">Critical open</div></div>
    </div>
  `;
}

function renderIssuesList(issues) {
  if (!issues.length) return '<div class="do-empty">Geen issues gevonden voor dit filter.</div>';

  return `<div class="admin-issue-list">${issues.map(issue => {
    const details = issue.details && typeof issue.details === 'object'
      ? JSON.stringify(issue.details, null, 2)
      : '';
    const nextAction = issue.status === 'resolved' ? 'open' : 'resolved';
    const actionLabel = issue.status === 'resolved' ? 'Heropen' : 'Markeer opgelost';

    return `
      <article class="admin-issue-card">
        <div class="admin-issue-head">
          <div class="admin-issue-tags">
            <span class="admin-chip" style="border-color:${severityColor(issue.severity)};color:${severityColor(issue.severity)}">${esc(issue.severity || 'unknown')}</span>
            <span class="admin-chip" style="border-color:${statusColor(issue.status)};color:${statusColor(issue.status)}">${esc(issue.status || 'open')}</span>
            <span class="admin-chip">${esc(issue.context || 'unknown')}</span>
          </div>
          <button class="btn-secondary admin-issue-action" data-id="${issue.id}" data-status="${nextAction}">${actionLabel}</button>
        </div>
        <div class="admin-issue-message">${esc(issue.message || '')}</div>
        <div class="admin-issue-meta">
          <span>${esc(issue.user_email_hint || issue.user_id || 'onbekende gebruiker')}</span>
          <span>${formatWhen(issue.created_at)}</span>
        </div>
        ${details ? `<details class="admin-issue-details"><summary>Details</summary><pre>${esc(details)}</pre></details>` : ''}
      </article>
    `;
  }).join('')}</div>`;
}

export async function renderAdminPage() {
  const body = document.getElementById('admin-body');
  if (!body) return;

  if (!cfg.sbUrl || !cfg.sbKey) {
    renderUnauthorized('Admin vereist Supabase-configuratie.');
    return;
  }
  if (!authUser?.access_token) {
    renderUnauthorized('Log eerst in om Admin te gebruiken.');
    return;
  }
  if (!isAdminUser()) {
    renderUnauthorized();
    return;
  }

  body.innerHTML = '<div class="do-empty">Issues laden…</div>';
  try {
    const statusFilter = document.getElementById('admin-status-filter')?.value || 'all';
    const issues = await fetchAdminIssues({ status: statusFilter });
    body.innerHTML = `${renderIssueStats(issues)}${renderIssuesList(issues)}`;
  } catch (error) {
    body.innerHTML = `<div class="do-empty">${esc(error?.message || 'Onbekende fout')}</div>`;
  }
}

export function openAdminPage() {
  const layout = document.querySelector('.layout');
  if (!layout) return;
  layout.classList.remove('show-data', 'show-advies', 'show-import');
  if (window.innerWidth >= 781) {
    layout.classList.add('show-admin');
  } else {
    layout.classList.remove('mobile-view-invoer', 'mobile-view-overzicht', 'mobile-view-data', 'mobile-view-advies', 'mobile-view-import');
    layout.classList.add('mobile-view-admin');
  }
  renderAdminPage();
}

export function closeAdminPage() {
  const layout = document.querySelector('.layout');
  if (!layout) return;
  layout.classList.remove('show-admin');
  if (window.innerWidth < 781) {
    switchMobileView('invoer');
    document.querySelectorAll('.mobile-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
  }
}

export function initAdminListeners() {
  document.getElementById('admin-back-btn')?.addEventListener('click', closeAdminPage);
  document.getElementById('admin-refresh-btn')?.addEventListener('click', () => renderAdminPage());
  document.getElementById('admin-status-filter')?.addEventListener('change', () => renderAdminPage());

  document.getElementById('admin-body')?.addEventListener('click', async e => {
    const btn = e.target.closest('.admin-issue-action');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const status = String(btn.dataset.status || 'open');
    if (!Number.isFinite(id)) return;

    btn.disabled = true;
    try {
      await updateIssueStatus(id, status);
      await renderAdminPage();
    } catch (error) {
      btn.disabled = false;
      alert(error?.message || 'Status bijwerken mislukt');
    }
  });
}
