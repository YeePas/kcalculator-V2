import { beforeEach, describe, expect, it, vi } from 'vitest';

function createStorageMock() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

const localStorageMock = createStorageMock();
const sessionStorageMock = createStorageMock();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });
Object.defineProperty(globalThis, 'sessionStorage', { value: sessionStorageMock, writable: true });

function makeDay(name, kcal) {
  return {
    ontbijt: [{ naam: name, kcal }],
    ochtendsnack: [],
    lunch: [],
    middagsnack: [],
    avondeten: [],
    avondsnack: [],
    drinken: [],
  };
}

describe('cache-first sync guards', () => {
  beforeEach(async () => {
    localStorageMock.clear();
    sessionStorageMock.clear();

    const state = await import('../../src/state.js');
    state.setLocalData({});
    state.setAuthUser(null);
    state.setCfg({
      sbUrl: 'https://example.supabase.co',
      sbKey: 'anon-key',
      claudeKey: '',
      keys: {},
      provider: 'claude',
      model: '',
      adviesProvider: '',
      adviesModel: '',
      importProvider: '',
      importModel: '',
    });
  });

  it('keeps dirty local day data when a stale remote copy arrives', async () => {
    const {
      cacheDayLocally,
      applyRemoteDayToLocalCache,
      getCachedDay,
      loadLocalDayMeta,
    } = await import('../../src/supabase/data.js');

    cacheDayLocally('2026-03-25', makeDay('Lokale havermout', 450), { dirty: true });

    const result = applyRemoteDayToLocalCache('2026-03-25', makeDay('Server ontbijt', 300));

    expect(result.applied).toBe(false);
    expect(result.skipped).toBe('dirty');
    expect(getCachedDay('2026-03-25')?.ontbijt?.[0]?.naam).toBe('Lokale havermout');
    expect(loadLocalDayMeta()['2026-03-25'].dirty).toBe(true);
  });

  it('replaces clean local day data and removes stale deleted server days', async () => {
    const {
      cacheDayLocally,
      applyRemoteDayToLocalCache,
      getCachedDay,
      loadLocalDayMeta,
    } = await import('../../src/supabase/data.js');

    cacheDayLocally('2026-03-24', makeDay('Oude lokale dag', 200), { dirty: false, synced: true });

    const replaced = applyRemoteDayToLocalCache('2026-03-24', makeDay('Nieuwe serverdag', 520));
    expect(replaced.applied).toBe(true);
    expect(getCachedDay('2026-03-24')?.ontbijt?.[0]?.naam).toBe('Nieuwe serverdag');
    expect(loadLocalDayMeta()['2026-03-24'].dirty).toBe(false);

    const removed = applyRemoteDayToLocalCache('2026-03-24', null, { allowDelete: true });
    expect(removed.applied).toBe(true);
    expect(getCachedDay('2026-03-24')).toBe(null);
  });

  it('preserves dirty local energy data while removing clean stale energy entries', async () => {
    const {
      cacheEnergyRecord,
      applyRemoteEnergyRange,
      getCachedEnergyStatsRange,
      loadEnergyMeta,
    } = await import('../../src/pages/data-overview-data.js');

    cacheEnergyRecord('2026-03-23', {
      date: '2026-03-23',
      active_kcal: 100,
      resting_kcal: 1800,
      tdee_kcal: 1900,
      source: 'manual',
    }, { dirty: true });

    cacheEnergyRecord('2026-03-24', {
      date: '2026-03-24',
      active_kcal: 200,
      resting_kcal: 1700,
      tdee_kcal: 1900,
      source: 'apple_health',
    }, { dirty: false, synced: true });

    const merge = applyRemoteEnergyRange('2026-03-23', '2026-03-24', []);
    const range = getCachedEnergyStatsRange('2026-03-23', '2026-03-24');

    expect(merge.changed).toBe(true);
    expect(range['2026-03-23']?.tdee_kcal).toBe(1900);
    expect(range['2026-03-24']).toBeUndefined();
    expect(loadEnergyMeta()['2026-03-23'].dirty).toBe(true);
    expect(loadEnergyMeta()['2026-03-24'].dirty).toBe(false);
  });

  it('syncs all dirty local day entries during a manual full sync', async () => {
    const state = await import('../../src/state.js');
    state.setAuthUser({ id: 'user-1', access_token: 'token', refresh_token: 'refresh' });

    const {
      cacheDayLocally,
      syncDirtyDays,
      loadLocalDayMeta,
    } = await import('../../src/supabase/data.js');

    cacheDayLocally('2026-03-22', makeDay('Lokale syncdag', 610), { dirty: true });

    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = fetchMock;

    const count = await syncDirtyDays();

    expect(count).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(loadLocalDayMeta()['2026-03-22'].dirty).toBe(false);
  });

  it('syncs dirty local energy entries and marks them clean afterwards', async () => {
    const state = await import('../../src/state.js');
    state.setAuthUser({ id: 'user-1', access_token: 'token', refresh_token: 'refresh' });

    const {
      cacheEnergyRecord,
      syncDirtyEnergyRecords,
      loadEnergyMeta,
    } = await import('../../src/pages/data-overview-data.js');

    cacheEnergyRecord('2026-03-21', {
      date: '2026-03-21',
      active_kcal: 120,
      resting_kcal: 1750,
      tdee_kcal: 1870,
      source: 'apple_health',
    }, { dirty: true });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true });
    globalThis.fetch = fetchMock;

    const count = await syncDirtyEnergyRecords();

    expect(count).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(loadEnergyMeta()['2026-03-21'].dirty).toBe(false);
  });
});
