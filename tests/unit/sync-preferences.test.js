/* ── Unit tests: sync preference resolution ───────────────── */

import { describe, it, expect } from 'vitest';
import { resolvePrefsArray, resolvePrefsObject } from '../../src/supabase/sync.js';

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

describe('resolvePrefsObject', () => {
  it('prefers the prefs row when it already has object data', () => {
    expect(resolvePrefsObject({ openai: 'prefs-key' }, { openai: 'local-key' })).toEqual({
      value: { openai: 'prefs-key' },
      source: 'prefs',
    });
  });

  it('falls back to local object data when prefs are empty', () => {
    expect(resolvePrefsObject({}, { openai: 'local-key' })).toEqual({
      value: { openai: 'local-key' },
      source: 'local',
    });
  });

  it('returns the empty prefs object when neither source has data', () => {
    expect(resolvePrefsObject({}, {})).toEqual({
      value: {},
      source: 'prefs',
    });
  });
});
