/* ── Match Review Modal API (Barrel) ─────────────────────── */

export {
  openMatchModal,
  closeMatchModal,
  renderMatchList,
  updateMatchNevo,
  updateMatchGram,
  toggleManualMode,
  addMatchToFavs,
} from './match-core.js';

export {
  aiLookupMatch,
  buildItemsFromMatchState,
  initMatchModalListeners,
} from './match-actions.js';
