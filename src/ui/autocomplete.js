/* ── Autocomplete UI ──────────────────────────────────────── */

import { selMeal, acSelectedItem, acSelectedIdx, acResults, setAcSelectedItem, setAcSelectedIdx, setAcResults } from '../state.js';
import { MEAL_NAMES } from '../constants.js';
import { esc, highlightMatches, emptyDay } from '../utils.js';
import { searchNevo } from '../products/database.js';
import { findPortie } from '../products/portions.js';
import { buildMealItem } from '../products/matcher.js';
import { isLiquidLike } from '../products/density.js';
import { buildBugReportButton } from './bug-report.js';
import { localData, currentDate } from '../state.js';
import { saveDay } from '../supabase/data.js';
import { _renderDayUI } from './render.js';

export function renderAcDropdown(results, query) {
  const dd = document.getElementById('ac-dropdown');
  setAcResults(results);
  setAcSelectedIdx(-1);
  setAcSelectedItem(null);

  const terms = query.toLowerCase().trim().split(/\s+/);

  const safeQuery = encodeURIComponent(query);
  const manualBtn = `<button class="ac-manual-btn" onmousedown="openSmartImportPage(decodeURIComponent('${safeQuery}'))">➕ Eigen product toevoegen… (BETA)</button>`;

  if (!results.length) {
    dd.innerHTML = `
      <div class="ac-hint"><span class="ac-hint-badge">Database</span> Geen resultaten — druk Enter voor AI-analyse</div>
      ${manualBtn}
    `;
    dd.classList.add('open');
    return;
  }

  dd.innerHTML = `
    <div class="ac-hint"><span class="ac-hint-badge">Database</span> Selecteer product of druk Enter voor AI-analyse</div>
    ${results.map((r, i) => `
      <div class="ac-item" data-idx="${i}" onmousedown="selectAcItem(${i})">
        <div style="min-width:0;flex:1">
          <div class="ac-item-name">${highlightMatches(r.n, terms)}${r._custom ? ' <span style="font-size:0.65rem;color:var(--accent)">eigen</span>' : ''}</div>
          <div class="ac-item-group">${esc(r._group || '')}</div>
        </div>
        <div class="ac-item-macros">
          <span class="ac-item-kcal">${r.k} kcal</span>
          <span>E${r.e}g</span>
          <span>V${r.v}g</span>
          <span>K${r.kh}g</span>
        </div>
      </div>
    `).join('')}
    ${manualBtn}
  `;
  dd.classList.add('open');
}

export function selectAcItem(idx) {
  const item = acResults[idx];
  if (!item) return;
  setAcSelectedItem(item);
  const useMl = isLiquidLike(item.n, selMeal === 'drinken');

  const dd = document.getElementById('ac-dropdown');
  const porties = findPortie(item.n, item.g, item.sg);
  const badge = item._custom ? 'Eigen' : (item.b ? item.b : 'Database');
  const defaultGram = porties[0]?.g || 100;
  const bugBtn = buildBugReportButton('autocomplete-product', {
    product: item.n,
    group: item._group || null,
    brand: item.b || null,
    meal: selMeal,
    suggestedAmount: defaultGram,
    portions: porties.slice(0, 6),
  });

  let portieButtons = '';
  for (const p of porties) {
    const label = p.l || p.t;
    const encodedLabel = encodeURIComponent(label);
    if (p.t === 'gram' || p.t === 'ml') {
      const unitLabel = useMl || p.t === 'ml' ? 'ml' : 'g';
      portieButtons += `<button class="ac-portie-quick" onclick="setPortie(${p.g},decodeURIComponent('${encodeURIComponent(`${p.g}${unitLabel}`)}'))">${p.g}${unitLabel}</button>`;
    } else {
      const amountLabel = `${p.g}${useMl ? 'ml' : 'g'}`;
      portieButtons += `<button class="ac-portie-quick" onclick="setPortie(${p.g},decodeURIComponent('${encodedLabel}'))">${esc(label)} (${amountLabel})</button>`;
      if (['stuk', 'snee', 'plak', 'ei'].includes(p.t)) {
        const doubleLabel = encodeURIComponent(`2x ${label}`);
        portieButtons += `<button class="ac-portie-quick" onclick="setPortie(${p.g * 2},decodeURIComponent('${doubleLabel}'))">2x (${p.g * 2}${useMl ? 'ml' : 'g'})</button>`;
      }
    }
  }

  dd.innerHTML = `
    <div class="ac-hint"><span class="ac-hint-badge">${esc(badge)}</span> ${esc(item.n)} ${bugBtn}</div>
    <div class="ac-portie-quicks">${portieButtons}</div>
    <div class="ac-portie-manual">
      <input type="number" class="ac-portie-input" id="ac-portie-gram" value="${defaultGram}" min="1" step="10" onkeydown="if(event.key==='Enter'){event.preventDefault();addNevoItem();}">
      <span class="ac-portie-unit">${useMl ? 'ml' : 'gram'}</span>
      <button class="ac-portie-add" onclick="addNevoItem()">+</button>
    </div>
    <div style="padding:0.3rem 0.9rem;font-size:0.72rem;color:var(--muted)">
      <strong>Per 100g:</strong> ${item.k} kcal · ${item.kh}g koolh · ${item.vz}g vezel · ${item.v}g vet · ${item.e}g eiwit
    </div>
  `;
  dd.classList.add('open');
  setTimeout(() => {
    const inp = document.getElementById('ac-portie-gram');
    if (inp) { inp.focus(); inp.select(); }
  }, 50);
}

export function setPortie(gram, label) {
  document.getElementById('ac-portie-gram').value = gram;
  addNevoItem(label);
}

export function addNevoItem(portieLabel) {
  if (!acSelectedItem) return;
  const gramInput = document.getElementById('ac-portie-gram');
  const gram = parseFloat(gramInput?.value) || 100;

  const useMl = isLiquidLike(acSelectedItem.n, selMeal === 'drinken');
  const item = buildMealItem(acSelectedItem.n, acSelectedItem, gram, useMl);
  item.portie = portieLabel || (gram === 100 ? (useMl ? '100ml' : '100g') : `${gram}${useMl ? 'ml' : 'g'}`);
  item._gram = gram;

  const day = localData[currentDate] || emptyDay();
  MEAL_NAMES.forEach(m => { if (!day[m]) day[m] = []; });
  day[selMeal].push(item);
  localData[currentDate] = day;
  saveDay(currentDate, day);

  document.getElementById('food-input').value = '';
  closeAcDropdown();

  document.getElementById('status').textContent = `✓ ${item.naam} (${item.portie}) toegevoegd`;
  document.getElementById('status').className = 'status-msg';
  _renderDayUI(day);
}

export function closeAcDropdown() {
  document.getElementById('ac-dropdown').classList.remove('open');
  setAcResults([]);
  setAcSelectedIdx(-1);
  setAcSelectedItem(null);
}

export function initAutocomplete() {
  const input = document.getElementById('food-input');
  let acTimeout = null;

  input.addEventListener('input', () => {
    clearTimeout(acTimeout);
    const val = input.value.trim();
    if (val.length < 2) { closeAcDropdown(); return; }

    acTimeout = setTimeout(() => {
      const results = searchNevo(val);
      if (results.length > 0) {
        renderAcDropdown(results, val);
      } else if (val.length >= 3) {
        renderAcDropdown([], val);
      } else {
        closeAcDropdown();
      }
    }, 150);
  });

  input.addEventListener('keydown', (e) => {
    const dd = document.getElementById('ac-dropdown');
    if (!dd.classList.contains('open')) return;

    if (acSelectedItem && e.key === 'Enter') return;

    const items = dd.querySelectorAll('.ac-item');
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIdx = Math.min(acSelectedIdx + 1, items.length - 1);
      setAcSelectedIdx(nextIdx);
      items.forEach((it, i) => it.classList.toggle('selected', i === nextIdx));
      items[nextIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const nextIdx = Math.max(acSelectedIdx - 1, -1);
      setAcSelectedIdx(nextIdx);
      items.forEach((it, i) => it.classList.toggle('selected', i === nextIdx));
      if (nextIdx >= 0) items[nextIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && acSelectedIdx >= 0) {
      e.preventDefault();
      selectAcItem(acSelectedIdx);
    } else if (e.key === 'Escape') {
      closeAcDropdown();
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.input-with-ac')) {
      closeAcDropdown();
    }
  });
}
