import { randomUUID } from 'expo-crypto';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { normalizeServerAddress, type ServerUrlError } from '../domain/serverUrl';
import { secureTokenStore } from '../integrations/secureTokens';
import { ApiError, createApiClient, type ApiClient, type ApiErrorCode, type HouseholdInfo } from '../sync/api';
import { createSyncEngine, type SyncEngine } from '../sync/engine';
import { useApp } from './AppProvider';
import { logError } from './errors';

/** Estado de la conexión con el servidor, tal como lo muestra Ajustes. */
export interface SyncStatus {
  enabled: boolean;
  serverUrl: string | null;
  lan: boolean;
  email: string | null;
  householdName: string | null;
  role: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  pending: number;
  syncing: boolean;
}

/** Sesión iniciada pero aún sin hogar (paso intermedio del asistente). */
export interface PendingSession {
  serverUrl: string;
  lan: boolean;
  email: string;
}

export class ConnectError extends Error {
  constructor(readonly code: ApiErrorCode | ServerUrlError) {
    super(`connect_error:${code}`);
  }
}

interface SyncContextValue {
  status: SyncStatus;
  session: PendingSession | null;
  /** Comprueba la dirección, inicia sesión (o crea la cuenta) y, si ya hay hogar, empieza a sincronizar. */
  connect(input: { address: string; email: string; password: string; register: boolean; registrationCode: string }): Promise<'connected' | 'needs_household'>;
  createHousehold(name: string): Promise<void>;
  joinHousehold(code: string): Promise<void>;
  invite(): Promise<{ code: string; expiresAt: string }>;
  syncNow(): Promise<void>;
  disconnect(): Promise<void>;
  cancelSession(): Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used inside SyncProvider');
  return ctx;
}

const EMPTY: SyncStatus = {
  enabled: false,
  serverUrl: null,
  lan: false,
  email: null,
  householdName: null,
  role: null,
  lastSyncAt: null,
  lastError: null,
  pending: 0,
  syncing: false,
};

/** Cada cuánto se buscan cambios de otros móviles mientras la app está abierta. */
const POLL_MS = 60_000;
/** Espera tras un cambio local antes de enviarlo (agrupa cambios seguidos). */
const DEBOUNCE_MS = 2_000;

export function SyncProvider({ children }: { children: ReactNode }) {
  const { db, notify, subscribe } = useApp();
  const [status, setStatus] = useState<SyncStatus>(EMPTY);
  const [session, setSession] = useState<PendingSession | null>(null);
  const clientRef = useRef<{ url: string; api: ApiClient; engine: SyncEngine } | null>(null);
  const selfNotify = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clientFor = useCallback(
    (url: string) => {
      if (clientRef.current?.url !== url) {
        const api = createApiClient({ baseUrl: url, tokens: secureTokenStore });
        clientRef.current = { url, api, engine: createSyncEngine({ db, transport: api, newId: randomUUID }) };
      }
      return clientRef.current;
    },
    [db],
  );

  const refreshStatus = useCallback(
    async (syncing = false) => {
      const row = await db.get<{
        enabled: number;
        server_url: string | null;
        account_email: string | null;
        household_name: string | null;
        role: string | null;
        last_sync_at: string | null;
        last_error: string | null;
      }>('SELECT enabled, server_url, account_email, household_name, role, last_sync_at, last_error FROM sync_state WHERE id = 1');
      const pending = row?.enabled && row.server_url ? await clientFor(row.server_url).engine.pendingCount() : 0;
      setStatus({
        enabled: !!row?.enabled,
        serverUrl: row?.server_url ?? null,
        lan: !!row?.server_url?.startsWith('http://'),
        email: row?.account_email ?? null,
        householdName: row?.household_name ?? null,
        role: row?.role ?? null,
        lastSyncAt: row?.last_sync_at ?? null,
        lastError: row?.last_error ?? null,
        pending,
        syncing,
      });
      return row;
    },
    [db, clientFor],
  );

  const runSync = useCallback(
    async (initial = false) => {
      const row = await db.get<{ enabled: number; server_url: string | null }>('SELECT enabled, server_url FROM sync_state WHERE id = 1');
      if (!row?.enabled || !row.server_url) return;
      setStatus((s) => ({ ...s, syncing: true }));
      try {
        const r = await clientFor(row.server_url).engine.sync({ initial });
        if (r.pulled > 0) {
          // Datos nuevos de otros móviles: se refrescan las pantallas sin provocar otra sincronización.
          selfNotify.current = true;
          try {
            notify('all');
          } finally {
            selfNotify.current = false;
          }
        }
      } catch (e) {
        if (!(e instanceof ApiError) || (e.code !== 'network' && e.code !== 'timeout')) logError('sync', e);
        if (e instanceof ApiError && e.code === 'unauthorized') {
          // Sesión caducada o revocada desde otro móvil: los datos se quedan, hay que volver a entrar.
          await db.run("UPDATE sync_state SET last_error = 'unauthorized' WHERE id = 1");
        }
      } finally {
        await refreshStatus(false).catch(() => undefined);
      }
    },
    [db, clientFor, notify, refreshStatus],
  );

  // Estado inicial, sincronización al abrir y cada minuto mientras la app está en primer plano.
  useEffect(() => {
    void refreshStatus().then(() => runSync());
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') void runSync();
    }, POLL_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void runSync();
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [refreshStatus, runSync]);

  // Cambios locales: se envían a los pocos segundos.
  useEffect(
    () =>
      subscribe(() => {
        if (selfNotify.current) return;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void runSync(), DEBOUNCE_MS);
      }),
    [subscribe, runSync],
  );

  const startSyncing = useCallback(
    async (url: string, email: string, h: HouseholdInfo) => {
      const { engine } = clientFor(url);
      await engine.enable({ serverUrl: url, email, householdId: h.id, householdName: h.name, role: h.role });
      setSession(null);
      await refreshStatus();
      await runSync(true);
    },
    [clientFor, refreshStatus, runSync],
  );

  const value = useMemo<SyncContextValue>(
    () => ({
      status,
      session,

      async connect({ address, email, password, register, registrationCode }) {
        const parsed = normalizeServerAddress(address);
        if (!parsed.ok) throw new ConnectError(parsed.error);
        const { api } = clientFor(parsed.url);
        try {
          await api.health();
          if (register) await api.register(email.trim(), password, registrationCode.trim() || null);
          else await api.login(email.trim(), password);
          const me = await api.me();
          if (me.householdId) {
            await startSyncing(parsed.url, me.email, await api.currentHousehold());
            return 'connected';
          }
          setSession({ serverUrl: parsed.url, lan: parsed.lan, email: me.email });
          return 'needs_household';
        } catch (e) {
          throw new ConnectError(e instanceof ApiError ? e.code : 'network');
        }
      },

      async createHousehold(name) {
        if (!session) throw new ConnectError('unauthorized');
        try {
          await startSyncing(session.serverUrl, session.email, await clientFor(session.serverUrl).api.createHousehold(name));
        } catch (e) {
          throw new ConnectError(e instanceof ApiError ? e.code : 'network');
        }
      },

      async joinHousehold(code) {
        if (!session) throw new ConnectError('unauthorized');
        try {
          await startSyncing(session.serverUrl, session.email, await clientFor(session.serverUrl).api.joinHousehold(code));
        } catch (e) {
          throw new ConnectError(e instanceof ApiError ? e.code : 'network');
        }
      },

      async invite() {
        if (!status.serverUrl) throw new ConnectError('unauthorized');
        try {
          return await clientFor(status.serverUrl).api.invite();
        } catch (e) {
          throw new ConnectError(e instanceof ApiError ? e.code : 'network');
        }
      },

      syncNow: () => runSync(),

      async disconnect() {
        const url = status.serverUrl ?? session?.serverUrl;
        if (url) await clientFor(url).api.logout();
        else await secureTokenStore.clear();
        await clientFor(url ?? 'https://localhost').engine.disable();
        setSession(null);
        await refreshStatus();
      },

      async cancelSession() {
        if (session) await clientFor(session.serverUrl).api.logout();
        setSession(null);
      },
    }),
    [status, session, clientFor, startSyncing, runSync, refreshStatus],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
