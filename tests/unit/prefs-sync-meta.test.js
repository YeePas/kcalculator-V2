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

describe('prefs sync metadata', () => {
  beforeEach(async () => {
    localStorageMock.clear();
    sessionStorageMock.clear();
    vi.restoreAllMocks();

    const state = await import('../../src/state.js');
    state.setAuthUser({
      id: 'user-1',
      email: 'test@example.com',
      access_token: 'token',
      refresh_token: 'refresh',
    });
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
      openFoodFactsLiveSearch: true,
      supermarketExclusions: [],
    });
    state.setVis({ carbs: true, fat: true, prot: true, fiber: true, water: true });
  });

  it('keeps dirty local favorites when loadUserPrefs sees older remote prefs', async () => {
    const storage = await import('../../src/storage.js');
    const sync = await import('../../src/supabase/sync.js');

    storage.saveFavs([{ naam: 'Lokale favoriet', maaltijd: 'ontbijt' }]);

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ([{
          data: {
            favs: [{ naam: 'Remote favoriet', maaltijd: 'lunch' }],
            _meta: { favs: { updatedAt: 1 } },
          },
        }]),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });

    await sync.loadUserPrefs();

    expect(storage.loadFavs()).toEqual([{ naam: 'Lokale favoriet', maaltijd: 'ontbijt' }]);
    expect(storage.getPrefSyncMetaEntry('favs').dirty).toBe(true);
  });

  it('applies newer remote goals to clean local prefs and clears the dirty flag after sync', async () => {
    const storage = await import('../../src/storage.js');
    const sync = await import('../../src/supabase/sync.js');

    storage.saveGoals({ kcal: 1800, carbs: 180, fat: 60, prot: 100, fiber: 30, water: 2000 }, { skipSyncMeta: true });

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ([{
          data: {
            goals: { kcal: 2200, carbs: 250, fat: 70, prot: 140, fiber: 35, water: 2500 },
            _meta: { goals: { updatedAt: 123456 } },
          },
        }]),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });

    await sync.loadUserPrefs();

    expect(storage.loadGoals()).toEqual({
      kcal: 2200,
      carbs: 250,
      fat: 70,
      prot: 140,
      fiber: 35,
      water: 2500,
    });
    expect(storage.getPrefSyncMetaEntry('goals').dirty).toBe(false);
    expect(storage.getPrefSyncMetaEntry('goals').updatedAt).toBe(123456);
  });

  it('includes sync metadata in syncUserPrefs payload and marks categories synced on success', async () => {
    const storage = await import('../../src/storage.js');
    const sync = await import('../../src/supabase/sync.js');

    storage.saveFavs([{ naam: 'Banaan', maaltijd: 'lunch' }]);
    storage.saveGoals({ kcal: 2100, carbs: 240, fat: 65, prot: 120, fiber: 32, water: 2200 });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });
    globalThis.fetch = fetchMock;

    await sync.syncUserPrefs(true);

    const [, request] = fetchMock.mock.calls[1];
    const body = JSON.parse(request.body);
    expect(body.data._meta.favs.updatedAt).toBeGreaterThan(0);
    expect(body.data._meta.goals.updatedAt).toBeGreaterThan(0);
    expect(storage.getPrefSyncMetaEntry('favs').dirty).toBe(false);
    expect(storage.getPrefSyncMetaEntry('goals').dirty).toBe(false);
  });

  it('merges newer remote clean prefs into sync payload without dropping local dirty favorites', async () => {
    const storage = await import('../../src/storage.js');
    const sync = await import('../../src/supabase/sync.js');

    storage.saveFavs([{ naam: 'Lokale favoriet', maaltijd: 'ontbijt' }]);
    storage.saveGoals({ kcal: 1800, carbs: 180, fat: 60, prot: 100, fiber: 30, water: 2000 }, { skipSyncMeta: true });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ([{
          data: {
            goals: { kcal: 2400, carbs: 260, fat: 75, prot: 145, fiber: 38, water: 2600 },
            _meta: { goals: { updatedAt: 999 } },
          },
        }]),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });
    globalThis.fetch = fetchMock;

    await sync.syncUserPrefs(true);

    const [, request] = fetchMock.mock.calls[1];
    const body = JSON.parse(request.body);
    expect(body.data.favs).toEqual([{ naam: 'Lokale favoriet', maaltijd: 'ontbijt' }]);
    expect(body.data.goals).toEqual({
      kcal: 2400,
      carbs: 260,
      fat: 75,
      prot: 145,
      fiber: 38,
      water: 2600,
    });
    expect(storage.loadGoals()).toEqual({
      kcal: 2400,
      carbs: 260,
      fat: 75,
      prot: 145,
      fiber: 38,
      water: 2600,
    });
    expect(storage.getPrefSyncMetaEntry('goals').updatedAt).toBe(999);
    expect(storage.getPrefSyncMetaEntry('favs').dirty).toBe(false);
  });
});
