/* ── Admin Page ─────────────────────────────────────────── */

import { authUser } from '../state.js';
import { cfg } from '../state.js';
import { sbHeaders } from '../supabase/config.js';
import { esc } from '../utils.js';
import { switchMobileView } from '../ui/misc.js';
import { openGeneralFeedback } from '../ui/bug-report.js';

const ADMIN_TABS = ['issues', 'testlab', 'products'];
const PRODUCT_FILE_PICKER_TYPES = [{
  description: 'Products JSON',
  accept: { 'application/json': ['.json'] },
}];

let activeAdminTab = 'issues';
let adminProductHandle = null;
let adminProductsDoc = null;
let adminProductsWritable = false;
let adminProductsStatus = { message: '', tone: '' };
let adminProductPreview = '';
let adminIssuesFilter = 'all';
let adminProductFormState = {
  name: '',
  brand: '',
  portion: '',
  group: '',
  source: 'manual',
  kcal: '',
  carbs: '',
  fat: '',
  protein: '',
  fiber: '',
};

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
  const toolbar = document.getElementById('admin-toolbar');
  if (toolbar) toolbar.style.display = 'none';
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

function setAdminProductStatus(message = '', tone = '') {
  adminProductsStatus = { message, tone };
}

function supportsFileSystemAccess() {
  return typeof window.showOpenFilePicker === 'function';
}

function normalizeProductsDoc(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.items) || !Array.isArray(raw.groups)) {
    throw new Error('Ongeldig products.json formaat.');
  }
  return raw;
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

function renderAdminToolbar() {
  const toolbar = document.getElementById('admin-toolbar');
  if (!toolbar) return;
  toolbar.style.display = '';
  if (activeAdminTab === 'issues') {
    toolbar.innerHTML = `
      <select id="admin-status-filter" title="Status filter">
        <option value="all" ${adminIssuesFilter === 'all' ? 'selected' : ''}>Alle statussen</option>
        <option value="open" ${adminIssuesFilter === 'open' ? 'selected' : ''}>Open</option>
        <option value="triaged" ${adminIssuesFilter === 'triaged' ? 'selected' : ''}>Triaged</option>
        <option value="resolved" ${adminIssuesFilter === 'resolved' ? 'selected' : ''}>Resolved</option>
      </select>
      <button class="btn-primary" id="admin-refresh-btn">🔄 Vernieuwen</button>
    `;
    return;
  }
  if (activeAdminTab === 'testlab') {
    toolbar.innerHTML = `
      <button class="btn-primary" id="admin-refresh-btn">🔄 Vernieuwen</button>
    `;
    return;
  }
  toolbar.innerHTML = `
    <button class="btn-secondary" data-admin-action="pick-products-file">📂 Kies products.json</button>
    <button class="btn-secondary" data-admin-action="load-bundled-products">📦 Laad huidige app-data</button>
    <button class="btn-primary" data-admin-action="save-products-file" ${adminProductsWritable ? '' : 'disabled'}>💾 Bewaar products.json</button>
  `;
}

function renderAdminTabs() {
  document.querySelectorAll('.admin-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.adminTab === activeAdminTab);
  });
}

function renderTestlab() {
  return `
    <div class="admin-grid">
      <section class="admin-card">
        <h3>Bug & feedback modal</h3>
        <p>Open hier snel de bestaande feedbackflow met test-contexten, zonder eerst door de hele app te navigeren.</p>
        <div class="admin-card-actions">
          <button class="btn-primary" data-admin-action="test-bug" data-context="admin-test-general">Algemene feedback</button>
          <button class="btn-secondary" data-admin-action="test-bug" data-context="admin-test-input">Test invoer-flow</button>
          <button class="btn-secondary" data-admin-action="test-bug" data-context="admin-test-smart-import">Test Smart Import</button>
        </div>
      </section>
      <section class="admin-card">
        <h3>Admin checks</h3>
        <p>Een snelle controle of je admin-omgeving goed staat voordat je echte aanpassingen of issue-triage doet.</p>
        <div class="admin-meta-list">
          <div class="admin-meta-row"><span>Ingelogd als</span><strong>${esc(authUser?.email || 'niet ingelogd')}</strong></div>
          <div class="admin-meta-row"><span>Admin toegang</span><strong>${isAdminUser() ? 'ja' : 'nee'}</strong></div>
          <div class="admin-meta-row"><span>Supabase</span><strong>${cfg.sbUrl && cfg.sbKey ? 'ingesteld' : 'niet ingesteld'}</strong></div>
          <div class="admin-meta-row"><span>Bugfunctie</span><strong>${import.meta.env.VITE_ENABLE_BETA_BUG_REPORT === 'true' ? 'aan' : 'uit of default'}</strong></div>
        </div>
        <div class="admin-card-actions">
          <button class="btn-secondary" data-admin-action="open-issues-tab">Ga naar issues</button>
        </div>
      </section>
      <section class="admin-card">
        <h3>Uitbreidbaar testhoekje</h3>
        <p>Deze pagina is bedoeld als jouw veilige werkbank. Ik kan hier later eenvoudig nieuwe testknoppen, debug-info of tijdelijke tooling voor je bij zetten.</p>
      </section>
    </div>
  `;
}

function getAvailableGroups() {
  return Array.isArray(adminProductsDoc?.groups) ? adminProductsDoc.groups : [];
}

function renderProductsLab() {
  const groups = getAvailableGroups();
  const fileLabel = adminProductsWritable
    ? 'Gekoppeld bestand: products.json (schrijfbaar)'
    : adminProductsDoc
      ? 'Dataset geladen (alleen preview, nog niet gekoppeld aan bestand)'
      : 'Nog geen dataset geladen';

  return `
    <div class="admin-grid">
      <section class="admin-card">
        <h3>Products.json bewerken</h3>
        <p>Laad eerst de huidige app-data of kies direct jouw lokale <code>public/products.json</code>. Met een gekoppeld bestand kun je nieuwe producten rechtstreeks toevoegen en opslaan.</p>
        <div class="admin-meta-list">
          <div class="admin-meta-row"><span>Status</span><strong>${esc(fileLabel)}</strong></div>
          <div class="admin-meta-row"><span>Browser-bestandsrechten</span><strong>${supportsFileSystemAccess() ? 'ondersteund' : 'niet ondersteund'}</strong></div>
          <div class="admin-meta-row"><span>Producten</span><strong>${adminProductsDoc?.items?.length || 0}</strong></div>
          <div class="admin-meta-row"><span>Groepen</span><strong>${groups.length || 0}</strong></div>
        </div>
        <div class="admin-inline-note">Tip: op localhost in Chrome/Edge werkt direct opslaan het prettigst. Zonder bestandsrechten kun je nog steeds een JSON-entry genereren en kopiëren.</div>
      </section>
      <section class="admin-card" style="grid-column:1 / -1">
        <h3>Nieuw product toevoegen</h3>
        <div class="admin-form-grid">
          <div class="admin-field full">
            <label for="admin-product-name">Naam</label>
            <input id="admin-product-name" type="text" placeholder="Bijv. Skyr aardbei" value="${esc(adminProductFormState.name)}">
          </div>
          <div class="admin-field">
            <label for="admin-product-brand">Merk</label>
            <input id="admin-product-brand" type="text" placeholder="Bijv. Arla" value="${esc(adminProductFormState.brand)}">
          </div>
          <div class="admin-field">
            <label for="admin-product-portion">Portie / omschrijving</label>
            <input id="admin-product-portion" type="text" placeholder="Bijv. beker 450 g" value="${esc(adminProductFormState.portion)}">
          </div>
          <div class="admin-field">
            <label for="admin-product-group">Groep</label>
            <select id="admin-product-group">
              <option value="">Geen groep koppelen</option>
              ${groups.map((group, idx) => `<option value="${idx}" ${String(adminProductFormState.group) === String(idx) ? 'selected' : ''}>${esc(group)}</option>`).join('')}
            </select>
          </div>
          <div class="admin-field">
            <label for="admin-product-source">Bron</label>
            <select id="admin-product-source">
              <option value="manual" ${adminProductFormState.source === 'manual' ? 'selected' : ''}>manual</option>
              <option value="off" ${adminProductFormState.source === 'off' ? 'selected' : ''}>off</option>
              <option value="rivm" ${adminProductFormState.source === 'rivm' ? 'selected' : ''}>rivm</option>
            </select>
          </div>
          <div class="admin-field">
            <label for="admin-product-kcal">kcal</label>
            <input id="admin-product-kcal" type="number" min="0" step="0.1" placeholder="0" value="${esc(adminProductFormState.kcal)}">
          </div>
          <div class="admin-field">
            <label for="admin-product-carbs">Koolh. g</label>
            <input id="admin-product-carbs" type="number" min="0" step="0.1" placeholder="0" value="${esc(adminProductFormState.carbs)}">
          </div>
          <div class="admin-field">
            <label for="admin-product-fat">Vet g</label>
            <input id="admin-product-fat" type="number" min="0" step="0.1" placeholder="0" value="${esc(adminProductFormState.fat)}">
          </div>
          <div class="admin-field">
            <label for="admin-product-protein">Eiwit g</label>
            <input id="admin-product-protein" type="number" min="0" step="0.1" placeholder="0" value="${esc(adminProductFormState.protein)}">
          </div>
          <div class="admin-field">
            <label for="admin-product-fiber">Vezels g</label>
            <input id="admin-product-fiber" type="number" min="0" step="0.1" placeholder="0" value="${esc(adminProductFormState.fiber)}">
          </div>
        </div>
        <div class="admin-card-actions">
          <button class="btn-secondary" data-admin-action="preview-product-entry">👀 Genereer JSON entry</button>
          <button class="btn-secondary" data-admin-action="copy-product-entry">📋 Kopieer JSON entry</button>
          <button class="btn-primary" data-admin-action="append-product-to-doc">➕ Voeg toe aan gekoppelde products.json</button>
        </div>
        <div class="admin-status ${adminProductsStatus.tone ? esc(adminProductsStatus.tone) : ''}">${esc(adminProductsStatus.message || '')}</div>
        ${adminProductPreview ? `<pre class="admin-code-block">${esc(adminProductPreview)}</pre>` : ''}
      </section>
    </div>
  `;
}

async function renderIssuesTab() {
  const body = document.getElementById('admin-body');
  if (!body) return;
  body.innerHTML = '<div class="do-empty">Issues laden…</div>';
  try {
    const issues = await fetchAdminIssues({ status: adminIssuesFilter });
    body.innerHTML = `${renderIssueStats(issues)}${renderIssuesList(issues)}`;
  } catch (error) {
    body.innerHTML = `<div class="do-empty">${esc(error?.message || 'Onbekende fout')}</div>`;
  }
}

async function ensureProductsDocLoaded() {
  if (adminProductsDoc) return;
  const response = await fetch('products.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('Kon products.json uit de app niet laden.');
  adminProductsDoc = normalizeProductsDoc(await response.json());
  adminProductsWritable = false;
}

async function renderActiveAdminTab() {
  renderAdminTabs();
  renderAdminToolbar();

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

  if (activeAdminTab === 'issues') {
    await renderIssuesTab();
    return;
  }

  if (activeAdminTab === 'testlab') {
    body.innerHTML = renderTestlab();
    return;
  }

  body.innerHTML = '<div class="do-empty">Products.json tooling laden…</div>';
  try {
    await ensureProductsDocLoaded();
    body.innerHTML = renderProductsLab();
  } catch (error) {
    setAdminProductStatus(error?.message || 'Kon products.json niet laden.', 'err');
    body.innerHTML = renderProductsLab();
  }
}

function parseNumberInput(value) {
  if (value === '' || value === null || typeof value === 'undefined') return 0;
  const num = Number(String(value).replace(',', '.'));
  return Number.isFinite(num) ? Math.round(num * 10) / 10 : 0;
}

function snapshotProductFormState() {
  adminProductFormState = {
    name: String(document.getElementById('admin-product-name')?.value || '').trim(),
    brand: String(document.getElementById('admin-product-brand')?.value || '').trim(),
    portion: String(document.getElementById('admin-product-portion')?.value || '').trim(),
    group: String(document.getElementById('admin-product-group')?.value || '').trim(),
    source: String(document.getElementById('admin-product-source')?.value || 'manual').trim() || 'manual',
    kcal: String(document.getElementById('admin-product-kcal')?.value || '').trim(),
    carbs: String(document.getElementById('admin-product-carbs')?.value || '').trim(),
    fat: String(document.getElementById('admin-product-fat')?.value || '').trim(),
    protein: String(document.getElementById('admin-product-protein')?.value || '').trim(),
    fiber: String(document.getElementById('admin-product-fiber')?.value || '').trim(),
  };
}

function buildProductEntryFromForm() {
  snapshotProductFormState();
  const name = String(document.getElementById('admin-product-name')?.value || '').trim();
  if (!name) throw new Error('Naam is verplicht.');

  const brand = String(document.getElementById('admin-product-brand')?.value || '').trim();
  const portion = String(document.getElementById('admin-product-portion')?.value || '').trim();
  const groupValue = String(document.getElementById('admin-product-group')?.value || '').trim();
  const source = String(document.getElementById('admin-product-source')?.value || 'manual').trim() || 'manual';

  const entry = {
    n: name,
    k: parseNumberInput(document.getElementById('admin-product-kcal')?.value),
    kh: parseNumberInput(document.getElementById('admin-product-carbs')?.value),
    v: parseNumberInput(document.getElementById('admin-product-fat')?.value),
    e: parseNumberInput(document.getElementById('admin-product-protein')?.value),
    vz: parseNumberInput(document.getElementById('admin-product-fiber')?.value),
    src: source,
  };

  if (brand) entry.b = brand;
  if (portion) entry.s = portion;
  if (groupValue !== '') entry.g = Number(groupValue);
  return entry;
}

async function chooseProductsFile() {
  if (!supportsFileSystemAccess()) {
    throw new Error('Deze browser ondersteunt geen directe bestandskoppeling.');
  }

  const [handle] = await window.showOpenFilePicker({
    multiple: false,
    types: PRODUCT_FILE_PICKER_TYPES,
    excludeAcceptAllOption: false,
  });
  if (!handle) return;
  const file = await handle.getFile();
  const text = await file.text();
  adminProductsDoc = normalizeProductsDoc(JSON.parse(text));
  adminProductsWritable = true;
  adminProductHandle = handle;
  setAdminProductStatus(`Gekoppeld aan ${file.name}. Je kunt nu direct opslaan.`, 'ok');
}

async function saveProductsFile() {
  if (!adminProductHandle || !adminProductsDoc || !adminProductsWritable) {
    throw new Error('Kies eerst een products.json bestand.');
  }
  const writable = await adminProductHandle.createWritable();
  await writable.write(JSON.stringify(adminProductsDoc));
  await writable.close();
  setAdminProductStatus(`products.json opgeslagen (${adminProductsDoc.items.length} producten).`, 'ok');
}

async function appendProductToDoc() {
  const entry = buildProductEntryFromForm();
  adminProductPreview = JSON.stringify(entry, null, 2);
  if (!adminProductsDoc) await ensureProductsDocLoaded();
  adminProductsDoc.items.push(entry);
  setAdminProductStatus(`Product toegevoegd aan geladen dataset. ${adminProductsWritable ? 'Klik eventueel nog op Bewaar products.json.' : 'Koppel een bestand om dit echt weg te schrijven.'}`, 'ok');
  if (adminProductsWritable) await saveProductsFile();
}

async function copyProductEntry() {
  const entry = buildProductEntryFromForm();
  adminProductPreview = JSON.stringify(entry, null, 2);
  if (!navigator.clipboard?.writeText) {
    setAdminProductStatus('Kopieren wordt in deze browser niet ondersteund.', 'err');
    return;
  }
  await navigator.clipboard.writeText(adminProductPreview);
  setAdminProductStatus('JSON entry gekopieerd naar je klembord.', 'ok');
}

function previewProductEntry() {
  const entry = buildProductEntryFromForm();
  adminProductPreview = JSON.stringify(entry, null, 2);
  setAdminProductStatus('Preview bijgewerkt.', 'ok');
}

export async function activateAdminTab(tabId) {
  const nextTab = ADMIN_TABS.includes(tabId) ? tabId : 'issues';
  activeAdminTab = nextTab;
  if (nextTab !== 'products') {
    setAdminProductStatus('', '');
  }
  await renderActiveAdminTab();
}

export async function renderAdminPage() {
  await renderActiveAdminTab();
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

  document.getElementById('admin-tabs')?.addEventListener('click', e => {
    const btn = e.target.closest('.admin-tab');
    if (!btn) return;
    activateAdminTab(btn.dataset.adminTab);
  });

  document.getElementById('admin-toolbar')?.addEventListener('click', async e => {
    const actionEl = e.target.closest('[data-admin-action], #admin-refresh-btn');
    if (!actionEl) return;
    try {
      if (actionEl.id === 'admin-refresh-btn') {
        await renderAdminPage();
        return;
      }
      const action = actionEl.dataset.adminAction;
      if (action === 'pick-products-file') {
        await chooseProductsFile();
        await renderActiveAdminTab();
      } else if (action === 'load-bundled-products') {
        adminProductsDoc = null;
        adminProductHandle = null;
        adminProductsWritable = false;
        await ensureProductsDocLoaded();
        setAdminProductStatus('Huidige app-data geladen. Voor opslaan kies je daarna nog jouw lokale products.json.', 'ok');
        await renderActiveAdminTab();
      } else if (action === 'save-products-file') {
        await saveProductsFile();
        await renderActiveAdminTab();
      }
    } catch (error) {
      setAdminProductStatus(error?.message || 'Actie mislukt.', 'err');
      await renderActiveAdminTab();
    }
  });

  document.getElementById('admin-toolbar')?.addEventListener('change', async e => {
    if (e.target.id === 'admin-status-filter') {
      adminIssuesFilter = String(e.target.value || 'all');
      await renderAdminPage();
    }
  });

  document.getElementById('admin-body')?.addEventListener('click', async e => {
    const issueBtn = e.target.closest('.admin-issue-action');
    if (issueBtn) {
      const id = Number(issueBtn.dataset.id);
      const status = String(issueBtn.dataset.status || 'open');
      if (!Number.isFinite(id)) return;

      issueBtn.disabled = true;
      try {
        await updateIssueStatus(id, status);
        await renderAdminPage();
      } catch (error) {
        issueBtn.disabled = false;
        alert(error?.message || 'Status bijwerken mislukt');
      }
      return;
    }

    const btn = e.target.closest('[data-admin-action]');
    if (!btn) return;

    try {
      const action = btn.dataset.adminAction;
      if (action === 'test-bug') {
        const context = String(btn.dataset.context || 'admin-test');
        openGeneralFeedback(context, {
          source: 'admin-testlab',
          email: authUser?.email || null,
          timestamp: new Date().toISOString(),
        });
      } else if (action === 'open-issues-tab') {
        await activateAdminTab('issues');
      } else if (action === 'preview-product-entry') {
        previewProductEntry();
        await renderActiveAdminTab();
      } else if (action === 'copy-product-entry') {
        await copyProductEntry();
        await renderActiveAdminTab();
      } else if (action === 'append-product-to-doc') {
        await appendProductToDoc();
        await renderActiveAdminTab();
      }
    } catch (error) {
      setAdminProductStatus(error?.message || 'Actie mislukt.', 'err');
      await renderActiveAdminTab();
    }
  });
}
