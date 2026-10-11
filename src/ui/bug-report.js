/* ── Beta Bug Reporting ──────────────────────────────────── */

import { cfg, authUser, currentDate, selMeal } from '../state.js';
import { ENABLE_BETA_BUG_REPORT } from '../constants.js';

const LOCAL_ISSUE_KEY = 'kcalculator_issue_reports_local_v1';

// Wrong product values can always be reported; other feedback only in the beta.
const PRODUCT_CONTEXT = 'product-data';
const isReportingEnabled = context => ENABLE_BETA_BUG_REPORT || context === PRODUCT_CONTEXT;

function encodePayload(payload) {
  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  } catch {
    return '';
  }
}

function decodePayload(encoded) {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(encoded))));
  } catch {
    return null;
  }
}

function ensureBugModal() {
  let modal = document.getElementById('bug-report-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'bug-report-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal bug-report-dialog" role="dialog" aria-modal="true" aria-labelledby="bug-report-title">
      <h3 id="bug-report-title">💬 Feedback sturen</h3>
      <div class="bug-report-context" id="bug-report-context"></div>
      <div class="goal-field">
        <label for="bug-report-message">Wat wil je delen?</label>
        <textarea id="bug-report-message" class="bug-report-textarea" placeholder="Bijv: de TDEE-import is onduidelijk, een knop staat niet logisch, of je mist een handige functie."></textarea>
      </div>
      <div class="goal-field">
        <label for="bug-report-severity">Prioriteit</label>
        <select id="bug-report-severity" class="bug-report-select">
          <option value="low">Laag</option>
          <option value="medium" selected>Middel</option>
          <option value="high">Hoog</option>
          <option value="critical">Kritiek</option>
        </select>
      </div>
      <div class="modal-btns">
        <button class="btn-secondary" data-action="close">Sluiten</button>
        <button class="btn-primary" id="bug-report-submit-btn" data-action="submit">Versturen</button>
      </div>
      <div id="bug-report-status" class="setup-status" style="margin-top:0.7rem"></div>
    </div>
  `;

  modal.addEventListener('click', e => {
    if (e.target === modal) closeBugReportModal();
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'close') closeBugReportModal();
    else if (action === 'submit') submitBugReport();
  });

  document.body.appendChild(modal);
  return modal;
}

function saveLocalIssue(report) {
  const existing = JSON.parse(localStorage.getItem(LOCAL_ISSUE_KEY) || '[]');
  existing.push(report);
  localStorage.setItem(LOCAL_ISSUE_KEY, JSON.stringify(existing.slice(-200)));
}

function setStatus(message, cls = '') {
  const status = document.getElementById('bug-report-status');
  if (!status) return;
  status.textContent = message;
  status.className = `setup-status ${cls}`.trim();
}

let activePayload = null;

export function buildBugReportButton(context, details = {}) {
  if (!isReportingEnabled(context)) return '';
  const payload = {
    context,
    details,
    date: currentDate,
    meal: selMeal,
    path: window.location.pathname,
  };
  const encoded = encodePayload(payload);
  if (!encoded) return '';
  return `<button class="beta-bug-btn" data-bug-payload="${encoded}" title="Meld een bug voor dit onderdeel" aria-label="Meld bug">🐞</button>`;
}

// "Klopt niet?" link for a product's nutrition values (portion picker).
export function buildProductReportButton(item) {
  const encoded = encodePayload({
    context: PRODUCT_CONTEXT,
    details: {
      product: item.n,
      brand: item.b || null,
      source: item.src || null,
      offCode: item._offCode || null,
      flagged: Boolean(item.w),
      per100: { k: item.k, kh: item.kh, v: item.v, e: item.e, vz: item.vz },
    },
    date: currentDate,
    meal: selMeal,
    path: window.location.pathname,
  });
  if (!encoded) return '';
  return `<button type="button" class="beta-bug-btn ac-report-link" data-bug-payload="${encoded}">Klopt niet?</button>`;
}

export function openGeneralFeedback(context = 'general-feedback', details = {}) {
  if (!isReportingEnabled(context)) return;
  const payload = encodePayload({
    context,
    details,
    date: currentDate,
    meal: selMeal,
    path: window.location.pathname,
  });
  if (!payload) return;
  openBugReportModal(payload);
}

export function openBugReportModal(encodedPayload) {
  const payload = decodePayload(encodedPayload) || { context: 'unknown', details: {} };
  if (!isReportingEnabled(payload.context)) return;
  const modal = ensureBugModal();
  if (!modal) return;
  activePayload = payload;
  const isProduct = payload.context === PRODUCT_CONTEXT;
  const title = document.getElementById('bug-report-title');
  if (title) title.textContent = isProduct ? 'Productgegevens melden' : '💬 Feedback sturen';

  const contextEl = document.getElementById('bug-report-context');
  const messageEl = document.getElementById('bug-report-message');
  const severityEl = document.getElementById('bug-report-severity');

  if (contextEl) {
    const product = activePayload.details?.product;
    contextEl.textContent = isProduct && product
      ? `${product}${activePayload.details.brand ? ` (${activePayload.details.brand})` : ''}`
      : `Onderdeel: ${activePayload.context || 'onbekend'}`;
  }
  if (messageEl) {
    messageEl.value = '';
    messageEl.placeholder = isProduct
      ? 'Wat klopt er niet? Bijv: op de verpakking staat 250 kcal en 9 g eiwit per 100 g.'
      : 'Bijv: de TDEE-import is onduidelijk, een knop staat niet logisch, of je mist een handige functie.';
  }
  if (severityEl) severityEl.value = 'medium';
  setStatus('');
  modal.classList.add('open');
  setTimeout(() => messageEl?.focus(), 20);
}

export function closeBugReportModal() {
  const modal = document.getElementById('bug-report-modal');
  modal?.classList.remove('open');
  activePayload = null;
}

export async function submitBugReport() {
  if (!activePayload || !isReportingEnabled(activePayload.context)) return;
  const messageEl = document.getElementById('bug-report-message');
  const severityEl = document.getElementById('bug-report-severity');
  const btn = document.getElementById('bug-report-submit-btn');

  const message = String(messageEl?.value || '').trim();
  const severity = String(severityEl?.value || 'medium');
  if (!message) {
    setStatus('Beschrijf kort je feedback.', 'err');
    return;
  }

  const report = {
    context: activePayload.context || 'unknown',
    details: activePayload.details || {},
    message,
    severity,
    page_path: window.location.pathname,
    current_date: currentDate,
    meal: selMeal,
    created_at_client: new Date().toISOString(),
    user_agent: navigator.userAgent,
    user_email_hint: authUser?.email || null,
  };

  try {
    btn && (btn.disabled = true);
    setStatus('Versturen…');

    if (!cfg.sbUrl || !cfg.sbKey) {
      saveLocalIssue({ ...report, channel: 'local-only' });
      setStatus('Lokaal opgeslagen (geen Supabase-config).', 'ok');
      setTimeout(closeBugReportModal, 700);
      return;
    }

    const headers = {
      apikey: cfg.sbKey,
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authUser?.access_token || cfg.sbKey}`,
    };

    const response = await fetch(`${cfg.sbUrl}/functions/v1/report-issue`, {
      method: 'POST',
      headers,
      body: JSON.stringify(report),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || 'Kon feedback niet versturen');

    setStatus('Dankjewel, feedback is opgeslagen.', 'ok');
    setTimeout(closeBugReportModal, 700);
  } catch (error) {
    const errorMessage = String(error?.message || error || 'onbekende fout');
    saveLocalIssue({ ...report, channel: 'local-fallback', error: errorMessage });
    setStatus(`Versturen mislukt (${errorMessage}). Lokaal opgeslagen.`, 'err');
  } finally {
    btn && (btn.disabled = false);
  }
}

// 🐞 buttons are rendered inside several containers (autocomplete, match modal),
// so they share one document-level listener.
export function initBugReportListeners() {
  document.addEventListener('click', e => {
    const btn = e.target.closest('.beta-bug-btn[data-bug-payload]');
    if (btn) openBugReportModal(btn.dataset.bugPayload);
  });
}
