import { ApiError, createApiClient, type Tokens, type TokenStore } from './api';

function memoryTokens(initial: Tokens | null = null): TokenStore & { value: Tokens | null } {
  const store = {
    value: initial,
    async get() {
      return store.value;
    },
    async set(t: Tokens) {
      store.value = t;
    },
    async clear() {
      store.value = null;
    },
  };
  return store;
}

const json = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('cliente del servidor', () => {
  it('renueva el token una sola vez y repite la petición', async () => {
    const tokens = memoryTokens({ accessToken: 'viejo', refreshToken: 'r1-xxxxxxxxxxxxxxxxxxxx' }); // secret-scan: ignore (token ficticio de prueba)
    const calls: string[] = [];
    const fetch = jest.fn(async (url: string, init: RequestInit) => {
      const auth = (init.headers as Record<string, string>).Authorization;
      calls.push(`${init.method} ${url.replace('https://s.test/api/v1', '')} ${auth ?? ''}`);
      if (url.endsWith('/auth/refresh')) return json(200, { access_token: 'nuevo', refresh_token: 'r2-yyyyyyyyyyyyyyyyyyyy' }); // secret-scan: ignore (token ficticio de prueba)
      if (auth === 'Bearer viejo') return json(401, { detail: 'invalid_token' });
      return json(200, { user_id: 'u', email: 'a@b.es', household_id: null, role: null });
    });
    const api = createApiClient({ baseUrl: 'https://s.test/', tokens, fetch });
    await expect(api.me()).resolves.toMatchObject({ email: 'a@b.es', householdId: null });
    expect(calls).toEqual(['GET /me Bearer viejo', 'POST /auth/refresh ', 'GET /me Bearer nuevo']);
    expect(tokens.value).toEqual({ accessToken: 'nuevo', refreshToken: 'r2-yyyyyyyyyyyyyyyyyyyy' }); // secret-scan: ignore (token ficticio de prueba)
  });

  it('si el refresco falla, borra los tokens y pide volver a entrar', async () => {
    const tokens = memoryTokens({ accessToken: 'a', refreshToken: 'r1-xxxxxxxxxxxxxxxxxxxx' }); // secret-scan: ignore (token ficticio de prueba)
    const fetch = jest.fn(async () => json(401, { detail: 'invalid_refresh_token' }));
    const api = createApiClient({ baseUrl: 'https://s.test', tokens, fetch });
    await expect(api.me()).rejects.toMatchObject({ code: 'unauthorized' });
    expect(tokens.value).toBeNull();
  });

  it('clasifica los errores y no envía cookies', async () => {
    const tokens = memoryTokens();
    const fetch = jest.fn(async (_url: string, init: RequestInit) => {
      expect(init.credentials).toBe('omit');
      return json(403, { detail: 'invalid_registration_code' });
    });
    const api = createApiClient({ baseUrl: 'https://s.test', tokens, fetch });
    await expect(api.register('a@b.es', 'x'.repeat(12), 'mal')).rejects.toMatchObject({ code: 'invalid_registration_code' });
  });

  it('distingue «sin conexión» de «no es un servidor de Stocky»', async () => {
    const tokens = memoryTokens();
    const offline = createApiClient({
      baseUrl: 'https://s.test',
      tokens,
      fetch: async () => {
        throw new TypeError('Network request failed');
      },
    });
    await expect(offline.health()).rejects.toMatchObject({ code: 'network' });
    const other = createApiClient({ baseUrl: 'https://s.test', tokens, fetch: async () => new Response('<html>', { status: 200 }) });
    await expect(other.health()).rejects.toBeInstanceOf(ApiError);
    await expect(other.health()).rejects.toMatchObject({ code: 'not_stocky' });
  });

  it('un login con credenciales incorrectas da un error claro', async () => {
    const api = createApiClient({ baseUrl: 'https://s.test', tokens: memoryTokens(), fetch: async () => json(401, { detail: 'invalid_credentials' }) });
    await expect(api.login('a@b.es', 'x')).rejects.toMatchObject({ code: 'invalid_credentials' });
  });
});
