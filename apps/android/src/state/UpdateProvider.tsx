import Constants from 'expo-constants';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { isNewerVersion } from '../domain/version';
import { downloadAndInstall } from '../integrations/apkInstaller';
import { fetchLatestRelease, UPDATE_REPO_RE, type ReleaseInfo } from '../integrations/updates';
import { useApp } from './AppProvider';

/** Una consulta como mucho cada 12 h (salvo «Buscar actualizaciones» a mano). */
const CHECK_EVERY_MS = 12 * 60 * 60 * 1000;

export const CURRENT_VERSION = Constants.expoConfig?.version ?? '0.0.0';
const REPO = (Constants.expoConfig?.extra as { updates?: { repo?: string } } | undefined)?.updates?.repo ?? '';
/** Página del proyecto en GitHub (null si la app no tiene repositorio configurado). */
export const REPO_URL = UPDATE_REPO_RE.test(REPO) ? `https://github.com/${REPO}` : null;

interface UpdateContextValue {
  /** Versión nueva disponible (aunque se haya cerrado el aviso). */
  available: ReleaseInfo | null;
  /** Mostrar el aviso en Inicio. */
  showBanner: boolean;
  checking: boolean;
  checkNow(): Promise<ReleaseInfo | null>;
  dismiss(): void;
  /** Descarga la versión nueva y abre el instalador (o el navegador si no se puede). */
  install(): Promise<void>;
  /** Progreso de la descarga (0-1), `null` si no se sabe el tamaño; `undefined` si no se está descargando. */
  downloading: number | null | undefined;
}

const UpdateContext = createContext<UpdateContextValue | null>(null);

export function useUpdates(): UpdateContextValue {
  const ctx = useContext(UpdateContext);
  if (!ctx) throw new Error('useUpdates must be used inside UpdateProvider');
  return ctx;
}

export function UpdateProvider({ children }: { children: ReactNode }) {
  const { services, settings } = useApp();
  const [checking, setChecking] = useState(false);
  const running = useRef(false);

  const check = useCallback(
    async (force: boolean): Promise<ReleaseInfo | null> => {
      if (running.current || !REPO) return null;
      const last = settings.updateCheckedAt ? Date.parse(settings.updateCheckedAt) : 0;
      if (!force && (!settings.updateCheck || Date.now() - last < CHECK_EVERY_MS)) return null;
      running.current = true;
      setChecking(true);
      try {
        const latest = await fetchLatestRelease(REPO);
        await services.settings.update({ updateCheckedAt: new Date().toISOString(), updateLatest: latest });
        return latest;
      } finally {
        running.current = false;
        setChecking(false);
      }
    },
    [services, settings.updateCheck, settings.updateCheckedAt],
  );

  useEffect(() => {
    void check(false);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void check(false);
    });
    return () => sub.remove();
  }, [check]);

  const [downloading, setDownloading] = useState<number | null | undefined>(undefined);

  const value = useMemo<UpdateContextValue>(() => {
    const latest = settings.updateLatest;
    const available = latest && isNewerVersion(latest.version, CURRENT_VERSION) ? latest : null;
    return {
      downloading,
      install: async () => {
        if (!available || downloading !== undefined) return;
        setDownloading(null);
        try {
          await downloadAndInstall(available.apkUrl, setDownloading);
        } finally {
          setDownloading(undefined);
        }
      },
      available,
      showBanner: !!available && settings.updateCheck && settings.updateDismissed !== available.version,
      checking,
      checkNow: () => check(true),
      dismiss: () => {
        if (available) void services.settings.update({ updateDismissed: available.version });
      },
    };
  }, [settings.updateLatest, settings.updateCheck, settings.updateDismissed, checking, check, services, downloading]);

  return <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>;
}
