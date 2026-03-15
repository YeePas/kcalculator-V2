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

describe('supabase auth persistence', () => {
  beforeEach(async () => {
    localStorageMock.clear();
    sessionStorageMock.clear();
    vi.restoreAllMocks();

    const state = await import('../../src/state.js');
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

  it('stores auth session in localStorage so login survives app restarts', async () => {
    const { setAuthUser } = await import('../../src/supabase/auth.js');

    setAuthUser({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      user: { id: 'user-1', email: 'test@example.com' },
    });

    expect(JSON.parse(localStorage.getItem('eetdagboek_auth_v1'))).toEqual({
      id: 'user-1',
      email: 'test@example.com',
      display_name: '',
      access_token: 'access-token',
      refresh_token: 'refresh-token',
    });
    expect(sessionStorage.getItem('eetdagboek_auth_v1')).toBe(null);
  });

  it('migrates older sessionStorage auth into localStorage during restore', async () => {
    sessionStorage.setItem('eetdagboek_auth_v1', JSON.stringify({
      id: 'user-1',
      email: 'test@example.com',
      access_token: 'old-access-token',
      refresh_token: 'old-refresh-token',
    }));

    const auth = await import('../../src/supabase/auth.js');
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        user: { id: 'user-1', email: 'test@example.com' },
      }),
    });

    await auth.restoreAuth();

    expect(JSON.parse(localStorage.getItem('eetdagboek_auth_v1'))).toEqual({
      id: 'user-1',
      email: 'test@example.com',
      display_name: '',
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
    });
    expect(sessionStorage.getItem('eetdagboek_auth_v1')).toBe(null);
  });
});
