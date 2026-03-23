/* ── Match Review Modal Core ──────────────────────────────── */

import {
  localData, currentDate, cfg, selMeal,
  matchState, setMatchState,
} from '../state.js';
import { MEAL_NAMES, MEAL_LABELS } from '../constants.js';
import { emptyDay, esc, r1 } from '../utils.js';
import { loadFavs, saveFavs } from '../storage.js';
import { saveDay } from '../supabase/data.js';
import { syncFavoritesToSupabase } from '../supabase/sync.js';
import { searchNevo } from '../products/database.js';
import { matchItemToNevo, resolveGram } from '../products/matcher.js';
import { isLiquidLike } from '../products/density.js';
import { buildBugReportButton } from '../ui/bug-report.js';
import { _renderDayUI } from '../ui/render.js';
import { trapFocus, releaseFocus } from '../ui/focus.js';
import { closeAcDropdown } from '../ui/autocomplete.js';

export function openMatchModal(parsedItems) {
  closeAcDropdown();
  document.getElementById('food-input')?.blur();
  setMatchState(parsedItems.map(pi => {
    const nevoMatch = matchItemToNevo(pi);
    const gram = resolveGram(pi, nevoMatch);
    return { parsed: pi, nevoMatch, gram, manualMode: false, manualValues: null };
  }));

  renderMatchList();
  document.getElementById('match-modal').classList.add('open');
  trapFocus(document.getElementById('match-modal'));
}

export function closeMatchModal() {
  document.getElementById('match-modal').classList.remove('open');
  releaseFocus();
  setMatchState([]);
}

export function renderMatchList() {
  const list = document.getElementById('match-list');
  list.innerHTML = matchState.map((ms, i) => {
    const useMl = isLiquidLike(ms.nevoMatch?.n || ms.parsed.foodName, selMeal === 'drinken');
    const matched = ms.nevoMatch !== null && !ms.manualMode;
    const nevo = ms.nevoMatch;
    const factor = ms.gram / 100;

    let altOptions = '';
    if (searchNevo(ms.parsed.foodName).length > 0) {
      const alts = searchNevo(ms.parsed.foodName);
      altOptions = `<select class="match-db-select" onchange="updateMatchNevo(${i}, this.value)">
        ${nevo ? '' : '<option value="">— Kies een product —</option>'}
        ${alts.map((a, j) => {
          const sel = nevo && a.n === nevo.n ? 'selected' : '';
          return `<option value="${j}" ${sel}>${esc(a.n)} (${a.k}kcal/100g) — ${esc(a._group)}${a._custom ? ' ★' : ''}</option>`;
        }).join('')}
      </select>`;
    }

    const macroInfo = matched && nevo
      ? `<div class="match-item-details" id="match-macros-${i}">
          <strong>${Math.round(nevo.k * factor)} kcal</strong> · ${Math.round(nevo.kh * factor)}g koolh · ${r1(nevo.vz * factor)}g vezel · ${Math.round(nevo.v * factor)}g vet · ${Math.round(nevo.e * factor)}g eiwit
        </div>`
      : '';

    const aiLabel = nevo?._aiResult ? ' <span style="font-size:0.6rem;color:var(--blue)">AI</span>' : '';
    const statusLabel = matched ? `✓ ${nevo?._aiResult ? 'AI' : 'Database'}` : ms.manualMode ? '✎ Handmatig' : '? Niet gevonden';
    const bugBtn = buildBugReportButton('match-modal-item', {
      original: ms.parsed.original,
      parsedName: ms.parsed.foodName,
      gram: ms.gram,
      meal: selMeal,
      matchedName: nevo?.n || null,
      matchedGroup: nevo?._group || null,
      isManual: Boolean(ms.manualMode),
    });
    const actionBtns = [];
    if (!ms.manualMode) actionBtns.push(`<button class="match-manual-btn" onclick="toggleManualMode(${i})">✎ Handmatig</button>`);
    actionBtns.push(`<button class="match-manual-btn" onclick="aiLookupMatch(${i})" style="border-color:var(--blue);color:var(--blue)">🤖 AI zoeken</button>`);
    if (matched) actionBtns.push(`<button class="match-manual-btn" id="match-fav-${i}" onclick="addMatchToFavs(${i})" style="border-color:var(--accent);color:var(--accent)">⭐ Favoriet</button>`);
    if (bugBtn) actionBtns.push(bugBtn);

    const manualForm = ms.manualMode
      ? `<div class="match-manual-grid">
          <div><label>kcal</label><input type="number" id="mm-kcal-${i}" value="${ms.manualValues?.k || ''}" min="0" placeholder="0"></div>
          <div><label>koolh (g)</label><input type="number" id="mm-kh-${i}" value="${ms.manualValues?.kh || ''}" min="0" step="0.1" placeholder="0"></div>
          <div><label>vezel (g)</label><input type="number" id="mm-vz-${i}" value="${ms.manualValues?.vz || ''}" min="0" step="0.1" placeholder="0"></div>
          <div><label>vet (g)</label><input type="number" id="mm-v-${i}" value="${ms.manualValues?.v || ''}" min="0" step="0.1" placeholder="0"></div>
          <div><label>eiwit (g)</label><input type="number" id="mm-e-${i}" value="${ms.manualValues?.e || ''}" min="0" step="0.1" placeholder="0"></div>
          <div><label>per 100g</label><span style="font-size:0.7rem;color:var(--tertiary);padding:0.3rem">waarden per 100g</span></div>
        </div>`
      : '';

    return `<div class="match-item ${matched ? 'matched' : 'unmatched'}">
      <div class="match-item-header">
        <span class="match-item-query">${esc(ms.parsed.original)}${aiLabel}</span>
        <span class="match-item-status">${statusLabel}</span>
      </div>
      ${matched && nevo ? `<div style="font-size:0.75rem;color:var(--accent);padding:0 0.9rem;margin-top:-0.1rem">→ ${esc(nevo.n)}${nevo._group ? ` <span style="color:var(--muted)">(${esc(nevo._group)})</span>` : ''}${nevo.b ? ` <span style="color:var(--muted)">· ${esc(nevo.b)}</span>` : ''}</div>` : ''}
      ${altOptions}
      ${macroInfo}
      <div class="match-portie-row">
        <label style="font-size:0.75rem;color:var(--muted)">Portie:</label>
        <input type="number" class="match-portie-input" value="${Math.round(ms.gram)}" min="1" step="10"
          oninput="updateMatchGram(${i}, this.value)">
        <span style="font-size:0.75rem;color:var(--muted)">${useMl ? 'ml' : 'gram'}</span>
      </div>
      <div class="match-item-actions">${actionBtns.join(' ')}</div>
      <div id="match-ai-status-${i}" style="font-size:0.75rem;margin-top:0.3rem"></div>
      ${manualForm}
    </div>`;
  }).join('');
}

export function updateMatchNevo(idx, optionIdx) {
  const alts = searchNevo(matchState[idx].parsed.foodName);
  const selected = alts[parseInt(optionIdx)];
  if (selected) {
    matchState[idx].nevoMatch = selected;
    matchState[idx].manualMode = false;
  }
  renderMatchList();
}

export function updateMatchGram(idx, value) {
  matchState[idx].gram = parseFloat(value) || 100;
  const ms = matchState[idx];
  const infoEl = document.getElementById(`match-macros-${idx}`);
  if (infoEl && ms.nevoMatch && !ms.manualMode) {
    const n = ms.nevoMatch;
    const f = ms.gram / 100;
    infoEl.innerHTML = `<strong>${Math.round(n.k * f)} kcal</strong> · ${r1(n.kh * f)}g koolh · ${r1(n.vz * f)}g vezel · ${r1(n.v * f)}g vet · ${r1(n.e * f)}g eiwit`;
  }
}

export function toggleManualMode(idx) {
  matchState[idx].manualMode = true;
  matchState[idx].manualValues = matchState[idx].manualValues || {};
  renderMatchList();
}

export function addMatchToFavs(idx) {
  const ms = matchState[idx];
  if (!ms.nevoMatch && !ms.manualMode) return;

  const favs = loadFavs();
  const name = ms.nevoMatch ? ms.nevoMatch.n : ms.parsed.foodName;
  const gram = ms.gram;
  const factor = gram / 100;
  const src = ms.nevoMatch || {};

  const favItem = {
    naam: name,
    kcal: Math.round((src.k || 0) * factor),
    koolhydraten_g: r1((src.kh || 0) * factor),
    vezels_g: r1((src.vz || 0) * factor),
    vetten_g: r1((src.v || 0) * factor),
    eiwitten_g: r1((src.e || 0) * factor),
    portie: `${Math.round(gram)}${isLiquidLike(name, selMeal === 'drinken') ? 'ml' : 'g'}`,
  };

  if (!favs.some(f => f.naam === favItem.naam && f.item?.portie === favItem.portie)) {
    favs.push({
      naam: favItem.naam,
      tekst: `${favItem.naam} (${favItem.portie})`,
      maaltijd: selMeal,
      item: favItem,
    });
    saveFavs(favs);
    syncFavoritesToSupabase();
  }

  const btn = document.getElementById(`match-fav-${idx}`);
  if (btn) {
    btn.textContent = '✓ Opgeslagen';
    btn.disabled = true;
  }
}

export function addMatchedItemsToDay(builtItems, meal) {
  const day = localData[currentDate] || emptyDay();
  MEAL_NAMES.forEach(m => { if (!day[m]) day[m] = []; });

  let groupId = null;
  let groupName = null;
  if (builtItems.length >= 2) {
    groupName = builtItems.map(it => it.naam).join(', ');
    if (groupName.length > 50) groupName = groupName.substring(0, 47) + '...';
    groupId = 'auto_' + Date.now();
  }

  for (const item of builtItems) {
    if (groupId) {
      item._recipeGroup = groupId;
      item._recipeName = groupName;
    }
    day[meal].push(item);
  }

  localData[currentDate] = day;
  saveDay(currentDate, day);
  closeMatchModal();
  document.getElementById('food-input').value = '';
  document.getElementById('status').textContent = '✓ ' + builtItems.length + ' item' + (builtItems.length !== 1 ? 's' : '') + ' toegevoegd';
  document.getElementById('status').className = 'status-msg';
  _renderDayUI(day);
}
