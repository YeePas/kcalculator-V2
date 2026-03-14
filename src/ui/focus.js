/* ── Focus Trap (Accessibility) ───────────────────────────── */

import {
  _focusTrapEl,
  _focusTrapPrevious,
  setFocusTrapEl,
  setFocusTrapPrevious,
} from '../state.js';

function _handleFocusTrap(e) {
  if (e.key !== 'Tab' || !_focusTrapEl) return;

  const focusable = _focusTrapEl.querySelectorAll(
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
  );
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (e.shiftKey) {
    if (document.activeElement === first) {
      e.preventDefault();
      last.focus();
    }
  } else if (document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

export function trapFocus(el) {
  setFocusTrapPrevious(document.activeElement);
  setFocusTrapEl(el);
  document.addEventListener('keydown', _handleFocusTrap);

  const first = el.querySelector(
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
  );
  if (first) first.focus();
}

export function releaseFocus() {
  document.removeEventListener('keydown', _handleFocusTrap);
  if (_focusTrapPrevious && _focusTrapPrevious.focus) _focusTrapPrevious.focus();
  setFocusTrapEl(null);
  setFocusTrapPrevious(null);
}
