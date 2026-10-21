/**
 * Cliente del servidor de Stocky (`/api/v1`).
 *
 * - Sin cookies (`credentials: 'omit'`) y con tiempo máximo por petición.
 * - El token de acceso dura 15 min: ante un 401 se renueva una vez con el
 *   token de refresco (rotatorio) y se repite la petición.
 * - Los tokens solo pasan por `TokenStore` (almacén seguro del sistema en la
 *   app); nunca se escriben en SQLite ni en registros.
 */
export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export interface TokenStore {
  get(): Promise<Tokens | null>;
  set(tokens: Tokens): Promise<void>;
  clear(): Promise<void>;
}

export type ApiErrorCode =
  | 'network' // sin conexión, servidor apagado o dirección incorrecta
  | 'timeout'
  | 'not_stocky' // responde, pero no es un servidor de Stocky
  | 'unauthorized' // sesión caducada o revocada: hay que volver a entrar
  | 'invalid_credentials'
  | 'registration_closed'
  | 'invalid_registration_code'
  | 'registration_failed'
  | 'weak_password'
  | 'invalid_email'
  | 'invalid_invitation'
  | 'already_in_household'
  | 'no_household'
  | 'forbidden'
  | 'rate_limited'
  | 'full_resync_required'
  | 'server';

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    readonly status = 0,
  ) {
    super(`api_error:${code}`);
  }
}

export interface HouseholdInfo {
  id: string;
  name: string;
  role: 'owner' | 'member' | 'viewer';
  members: number;
}

export interface Me {
  userId: string;
  email: string;
  householdId: string | null;
  role: string | null;
}

export interface SyncOpIn {
  op_id: string;
  entity: string;
  entity_id: string;
  kind: 'upsert' | 'delete' | 'adjust_quantity';
  data?: Record<string, unknown> | null;
  delta_milli?: number | null;
}

export interface OpResult {
  op_id: string;
  status: 'applied' | 'duplicate' | 'conflict' | 'rejected';
  rev: number;
  reason?: string | null;
}

export interface RemoteChange {
  entity: string;
  entity_id: string;
  rev: number;
  deleted: boolean;
  data: Record<string, unknown> | null;
}

export interface PullPage {
  changes: RemoteChange[];
  next: number;
  has_more: boolean;
}

/** Lo que el motor de sincronización necesita del servidor. */
export interface SyncTransport {
  push(ops: SyncOpIn[]): Promise<OpResult[]>;
  pull(since: number, limit?: number): Promise<PullPage>;
}

type FetchFn = (input: string, init: RequestInit) => Promise<Response>;

const DETAIL_CODES: Partial<Record<string, ApiErrorCode>> = {
  registration_closed: 'registration_closed',
  invalid_registration_code: 'invalid_registration_code',
  registration_failed: 'registration_failed',
  invalid_invitation: 'invalid_invitation',
  already_in_household: 'already_in_household',
  no_household: 'no_household',
  forbidden: 'forbidden',
  full_resync_required: 'full_resync_required',
};

export function createApiClient(opts: {
  baseUrl: string;
  tokens: TokenStore;
  fetch?: FetchFn;
  timeoutMs?: number;
  deviceName?: string;
}) {
  const doFetch: FetchFn = opts.fetch ?? ((i, init) => fetch(i, init));
  const base = `${opts.baseUrl.replace(/\/+$/, '')}/api/v1`;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const deviceName = opts.deviceName ?? 'Android';

  async function raw(path: string, init: { method?: string; body?: unknown; token?: string | null }): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await doFetch(base + path, {
        method: init.method ?? 'GET',
        credentials: 'omit',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      });
    } catch (e) {
      throw new ApiError(controller.signal.aborted ? 'timeout' : 'network');
    } finally {
      clearTimeout(timer);
    }
  }

  async function errorFor(res: Response): Promise<ApiError> {
    let detail: unknown = null;
    try {
      detail = ((await res.json()) as { detail?: unknown }).detail;
    } catch {
      // Sin JSON: se clasifica solo por el código HTTP.
    }
    if (typeof detail === 'string' && DETAIL_CODES[detail]) return new ApiError(DETAIL_CODES[detail]!, res.status);
    if (res.status === 401) return new ApiError('unauthorized', 401);
    if (res.status === 403) return new ApiError('forbidden', 403);
    if (res.status === 410) return new ApiError('full_resync_required', 410);
    if (res.status === 429) return new ApiError('rate_limited', 429);
    if (res.status === 422) {
      const text = JSON.stringify(detail ?? '');
      if (text.includes('password')) return new ApiError('weak_password', 422);
      if (text.includes('email')) return new ApiError('invalid_email', 422);
    }
    return new ApiError(res.status === 404 ? 'not_stocky' : 'server', res.status);
  }

  async function json<T>(res: Response): Promise<T> {
    try {
      return (await res.json()) as T;
    } catch {
      throw new ApiError('not_stocky', res.status);
    }
  }

  /** Petición anónima. */
  async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const res = await raw(path, init);
    if (!res.ok) throw await errorFor(res);
    return res.status === 204 ? (undefined as T) : json<T>(res);
  }

  let refreshing: Promise<boolean> | null = null;

  async function refresh(): Promise<boolean> {
    const current = await opts.tokens.get();
    if (!current) return false;
    const res = await raw('/auth/refresh', { method: 'POST', body: { refresh_token: current.refreshToken } });
    if (!res.ok) {
      if (res.status === 401) await opts.tokens.clear();
      if (res.status === 401) return false;
      throw await errorFor(res);
    }
    const t = await json<{ access_token: string; refresh_token: string }>(res);
    await opts.tokens.set({ accessToken: t.access_token, refreshToken: t.refresh_token });
    return true;
  }

  /** Petición autenticada, con una renovación automática del token si ha caducado. */
  async function authed<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const tokens = await opts.tokens.get();
    if (!tokens) throw new ApiError('unauthorized');
    let res = await raw(path, { ...init, token: tokens.accessToken });
    if (res.status === 401) {
      // Varias peticiones a la vez comparten una sola renovación (el token de refresco es de un solo uso).
      refreshing ??= refresh().finally(() => {
        refreshing = null;
      });
      if (!(await refreshing)) throw new ApiError('unauthorized', 401);
      const renewed = await opts.tokens.get();
      res = await raw(path, { ...init, token: renewed?.accessToken });
    }
    if (!res.ok) throw await errorFor(res);
    return res.status === 204 ? (undefined as T) : json<T>(res);
  }

  const saveTokens = async (t: { access_token: string; refresh_token: string }) =>
    opts.tokens.set({ accessToken: t.access_token, refreshToken: t.refresh_token });

  const toHousehold = (h: { id: string; name: string; role: string; members: number }): HouseholdInfo => ({
    id: h.id,
    name: h.name,
    role: h.role === 'owner' || h.role === 'viewer' ? h.role : 'member',
    members: h.members,
  });

  return {
    baseUrl: opts.baseUrl,

    /** Comprueba que la dirección corresponde a un servidor de Stocky que funciona. */
    async health(): Promise<void> {
      const body = await call<{ status?: unknown }>('/health');
      if (body?.status !== 'ok') throw new ApiError('not_stocky');
    },

    async register(email: string, password: string, registrationCode: string | null): Promise<void> {
      await saveTokens(
        await call('/auth/register', {
          method: 'POST',
          body: { email, password, device_name: deviceName, registration_code: registrationCode || null },
        }),
      );
    },

    async login(email: string, password: string): Promise<void> {
      try {
        await saveTokens(await call('/auth/login', { method: 'POST', body: { email, password, device_name: deviceName } }));
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 422)) throw new ApiError('invalid_credentials', e.status);
        throw e;
      }
    },

    /** Cierra la sesión en el servidor (si se puede) y borra los tokens del móvil. */
    async logout(): Promise<void> {
      try {
        await authed('/auth/logout', { method: 'POST' });
      } catch {
        // Aunque el servidor no responda, los tokens se borran del móvil.
      }
      await opts.tokens.clear();
    },

    async me(): Promise<Me> {
      const m = await authed<{ user_id: string; email: string; household_id: string | null; role: string | null }>('/me');
      return { userId: m.user_id, email: m.email, householdId: m.household_id, role: m.role };
    },

    async createHousehold(name: string): Promise<HouseholdInfo> {
      return toHousehold(await authed('/households', { method: 'POST', body: { name } }));
    },

    async joinHousehold(code: string): Promise<HouseholdInfo> {
      return toHousehold(await authed('/households/join', { method: 'POST', body: { code: code.trim() } }));
    },

    async currentHousehold(): Promise<HouseholdInfo> {
      return toHousehold(await authed('/households/current'));
    },

    async invite(): Promise<{ code: string; expiresAt: string }> {
      const r = await authed<{ code: string; expires_at: string }>('/households/current/invitations', {
        method: 'POST',
        body: { role: 'member' },
      });
      return { code: r.code, expiresAt: r.expires_at };
    },

    async push(ops: SyncOpIn[]): Promise<OpResult[]> {
      return (await authed<{ results: OpResult[] }>('/sync/push', { method: 'POST', body: { ops } })).results;
    },

    async pull(since: number, limit = 500): Promise<PullPage> {
      return authed<PullPage>(`/sync/pull?since=${Math.max(0, Math.trunc(since))}&limit=${limit}`);
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
