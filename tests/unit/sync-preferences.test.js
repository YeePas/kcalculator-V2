/* ── Unit tests: sync preference resolution ───────────────── */

import { describe, it, expect } from 'vitest';
import { resolvePrefsArray } from '../../src/supabase/sync.js';

describe('resolvePrefsArray', () => {
  it('prefers the prefs row when it already has data', () => {
    expect(resolvePrefsArray([{ id: 'prefs' }], [{ id: 'legacy' }], [{ id: 'local' }])).toEqual({
      value: [{ id: 'prefs' }],
      source: 'prefs',
    });
  });

  it('falls back to legacy table data when prefs are empty', () => {
    expect(resolvePrefsArray([], [{ id: 'legacy' }], [{ id: 'local' }])).toEqual({
      value: [{ id: 'legacy' }],
      source: 'legacy',
    });
  });

  it('keeps local data when both remote sources are empty', () => {
    expect(resolvePrefsArray([], [], [{ id: 'local' }])).toEqual({
      value: [{ id: 'local' }],
      source: 'local',
    });
  });

  it('returns the empty prefs array when no source has data', () => {
    expect(resolvePrefsArray([], null, [])).toEqual({
      value: [],
      source: 'prefs',
    });
  });
});
