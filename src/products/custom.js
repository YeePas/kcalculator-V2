/* ── Custom Products API (Barrel) ─────────────────────────── */

export { openCustomModal, closeCustomModal, updatePhotoModelSelect, fillCustomFields } from './custom-ui.js';
export {
  analyzeCustomDishInput,
  applyCustomDishSuggestion,
  quickSaveCustomDishSuggestion,
  setCustomDishPortionSize,
  applyCustomDishAlternative,
  clearCustomDishSuggestionState,
} from './custom-suggestion.js';
export { aiFilLCustomProduct, importFromOFF } from './custom-import.js';
export { parseNutritionText } from './custom-text.js';
export { resizeImage, handleCustomPhoto } from './custom-photo.js';
export { saveCustomProduct } from './custom-save.js';
