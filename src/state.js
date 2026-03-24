/* ── Global Mutable State ──────────────────────────────────
   Centralised state object. Every module imports from here
   so there is a single source of truth.
   ──────────────────────────────────────────────────────────── */

import { DEFAULT_GOALS } from './constants.js';

/** @type {{ sbUrl:string, sbKey:string, claudeKey:string, keys:Record<string,string>, provider:string, model:string, adviesProvider?:string, adviesModel?:string, importProvider?:string, importModel?:string }} */
export let cfg = {};

/** @type {{ kcal:number, carbs:number, fat:number, prot:number, fiber:number, water:number }} */
export let goals = { ...DEFAULT_GOALS };

export let showDrinks = true;

/** Keyed by YYYY-MM-DD → day object */
export let localData = {};

/** Current selected date as YYYY-MM-DD */
export let currentDate = new Date().toISOString().slice(0, 10);

/** Currently selected meal tab */
export let selMeal = 'ontbijt';

/** Macro visibility prefs */
export let vis = { carbs: true, fat: true, prot: true, fiber: true, water: true };

/** Authenticated user session */
export let authUser = null;

/** Active advies tab */
export let activeAdviesTab = 'schijf';

/** Data-overview current period (days) */
export let _doCurrentDays = 7;

// Debounce timers
export let syncTimer = null;
export let favoritesSyncTimer = null;
export let customProductsSyncTimer = null;
export let prefsSyncTimer = null;

// Product DB
export let nevoData = null;
export let nevoReady = false;
export let offData = null;
export let offReady = false;

// Autocomplete UI state
export let acSelectedIdx = -1;
export let acResults = [];
export let acSelectedItem = null;

// Focus trap state
export let _focusTrapEl = null;
export let _focusTrapPrevious = null;

// Edit modal state
export let editMeal = null;
export let editIdx = null;
export let editBasePer100 = null;
export let editBaseGram = null;

// Match modal state
export let matchState = [];

// Temporary meal selection for saving a recipe
export let recipeSelectionMeal = null;
export let recipeSelectionIndices = [];

/* ── Setters ──────────────────────────────────────────────
   Because ES module exports are live bindings but cannot
   be reassigned from outside the declaring module, we
   expose setter helpers.
   ──────────────────────────────────────────────────────────── */

export function setCfg(v) { cfg = v; }
export function setGoals(v) { goals = v; }
export function setShowDrinks(v) { showDrinks = v; }
export function setLocalData(keyOrVal, val) {
  if (arguments.length === 2) { if (!localData) localData = {}; localData[keyOrVal] = val; }
  else if (keyOrVal === null) localData = {};
  else localData = keyOrVal;
}
export function setCurrentDate(v) { currentDate = v; }
export function setSelMeal(v) { selMeal = v; }
export function setVis(v) { vis = v; }
export function setAuthUser(v) { authUser = v; }
export function setActiveAdviesTab(v) { activeAdviesTab = v; }
export function setDoCurrentDays(v) { _doCurrentDays = v; }
export function setSyncTimer(v) { syncTimer = v; }
export function setFavoritesSyncTimer(v) { favoritesSyncTimer = v; }
export function setCustomProductsSyncTimer(v) { customProductsSyncTimer = v; }
export function setPrefsSyncTimer(v) { prefsSyncTimer = v; }
export function setNevoData(v) { nevoData = v; }
export function setNevoReady(v) { nevoReady = v; }
export function setOffData(v) { offData = v; }
export function setOffReady(v) { offReady = v; }
export function setAcSelectedIdx(v) { acSelectedIdx = v; }
export function setAcResults(v) { acResults = v; }
export function setAcSelectedItem(v) { acSelectedItem = v; }
export function setFocusTrapEl(v) { _focusTrapEl = v; }
export function setFocusTrapPrevious(v) { _focusTrapPrevious = v; }
export function setEditMeal(v) { editMeal = v; }
export function setEditIdx(v) { editIdx = v; }
export function setEditBasePer100(v) { editBasePer100 = v; }
export function setEditBaseGram(v) { editBaseGram = v; }
export function setMatchState(v) { matchState = v; }
export function setRecipeSelectionMeal(v) { recipeSelectionMeal = v; }
export function setRecipeSelectionIndices(v) { recipeSelectionIndices = Array.isArray(v) ? v : []; }
