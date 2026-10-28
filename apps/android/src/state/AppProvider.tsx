import { randomUUID } from 'expo-crypto';
import * as SplashScreen from 'expo-splash-screen';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { openAppDatabase } from '../data/expoConnection';
import { migrate } from '../data/migrations';
import type { SqlDatabase } from '../data/sql';
import { toLocalDate } from '../domain/dates';
import { planExpiryNotifications } from '../domain/notificationPlan';
import { deviceLocale, setLocale, t } from '../i18n';
import * as notifications from '../integrations/notifications';
import type { ChangeScope, ServiceContext } from '../services/context';
import { createInventoryService, type InventoryService } from '../services/inventoryService';
import { createPlacesService, type PlacesService } from '../services/placesService';
import { createPrivacyService, type PrivacyService } from '../services/privacyService';
import { createRecipeService, type RecipeService } from '../services/recipeService';
import { createScanService, type ScanService } from '../services/scanService';
import { createSettingsService, DEFAULT_SETTINGS, type Settings, type SettingsService } from '../services/settingsService';
import { createShoppingService, type ShoppingService } from '../services/shoppingService';
import { ErrorView } from '../ui/components';
import { logError } from './errors';

export interface Services {
  inventory: InventoryService;
  places: PlacesService;
  shopping: ShoppingService;
  settings: SettingsService;
  recipes: RecipeService;
  privacy: PrivacyService;
  scan: ScanService;
}

type Listener = (scope: ChangeScope) => void;

interface AppContextValue {
  services: Services;
  settings: Settings;
  db: SqlDatabase;
  /** Avisa a las pantallas de un cambio hecho fuera de los servicios (p. ej. datos recibidos del servidor). */
  notify: (scope: ChangeScope) => void;
  /** Suscripción a cambios de datos (para refrescar pantallas). */
  subscribe: (fn: Listener) => () => void;
  /** Reprograma los avisos de caducidad según el inventario y los ajustes. */
  syncNotifications: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

function buildServices(ctx: ServiceContext): Services {
  const inventory = createInventoryService(ctx);
  return {
    inventory,
    places: createPlacesService(ctx),
    shopping: createShoppingService(ctx),
    settings: createSettingsService(ctx),
    recipes: createRecipeService(ctx, inventory),
    privacy: createPrivacyService(ctx),
    scan: createScanService(ctx),
  };
}

// La pantalla de carga (logo) se mantiene hasta que la base de datos está lista.
SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions({ fade: true, duration: 350 });
// Hasta leer los ajustes (o si fallan), el idioma del móvil.
setLocale(deviceLocale());

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'error' } | { status: 'ready'; services: Services; db: SqlDatabase }
  >({ status: 'loading' });
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const listeners = useRef(new Set<Listener>());
  const servicesRef = useRef<Services | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef<((scope: ChangeScope) => void) | null>(null);
  const notify = useCallback((scope: ChangeScope) => onChangeRef.current?.(scope), []);
  const [attempt, setAttempt] = useState(0);
  // El idioma se cambia antes de volver a dibujar con los ajustes nuevos.
  const applySettings = useCallback((s: Settings) => {
    setLocale(s.language ?? deviceLocale());
    setSettings(s);
  }, []);

  const syncNotifications = useCallback(async () => {
    const services = servicesRef.current;
    if (!services) return;
    try {
      const s = await services.settings.get();
      if (!s.notificationsEnabled || !(await notifications.hasPermission())) {
        await notifications.cancelAll();
        return;
      }
      const now = new Date();
      const lots = await services.inventory.listExpiring(toLocalDate(now), 60);
      const plan = planExpiryNotifications(
        lots.map((l) => ({ productName: l.product.name, expiryDate: l.expiryDate, expiryKind: l.expiryKind })),
        now,
        { warnDays: s.warnDays, notifyHour: s.notifyHour },
      );
      await notifications.ensureChannel();
      await notifications.replaceScheduled(plan, s.notificationShowNames);
    } catch (e) {
      logError('notifications.sync', e);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let opened: SqlDatabase | null = null;
    (async () => {
      try {
        const db = await openAppDatabase();
        opened = db;
        await migrate(db);
        const ctx: ServiceContext = {
          db,
          newId: randomUUID,
          clock: () => new Date(),
          onChange: (scope) => {
            for (const fn of listeners.current) fn(scope);
            if (scope === 'settings' || scope === 'all') {
              servicesRef.current?.settings.get().then(applySettings, (e) => logError('settings.reload', e));
            }
            if (scope !== 'shopping') {
              // Agrupa cambios seguidos en una sola reprogramación.
              if (syncTimer.current) clearTimeout(syncTimer.current);
              syncTimer.current = setTimeout(() => void syncNotifications(), 800);
            }
          },
        };
        onChangeRef.current = ctx.onChange ?? null;
        const services = buildServices(ctx);
        servicesRef.current = services;
        const loaded = await services.settings.get();
        await services.shopping.ensureDefaultList();
        if (cancelled) return;
        notifications.configureNotificationHandler();
        applySettings(loaded);
        setState({ status: 'ready', services, db });
        void syncNotifications();
      } catch (e) {
        logError('app.init', e);
        if (!cancelled) setState({ status: 'error' });
      }
    })();
    return () => {
      cancelled = true;
      if (syncTimer.current) clearTimeout(syncTimer.current);
      void opened?.close().catch(() => undefined);
    };
  }, [attempt, syncNotifications, applySettings]);

  useEffect(() => {
    if (state.status !== 'loading') SplashScreen.hideAsync().catch(() => undefined);
  }, [state.status]);

  const subscribe = useCallback((fn: Listener) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  const value = useMemo<AppContextValue | null>(
    () =>
      state.status === 'ready' ? { services: state.services, settings, db: state.db, notify, subscribe, syncNotifications } : null,
    [state, settings, notify, subscribe, syncNotifications],
  );

  // Mientras carga se ve la pantalla de inicio nativa con el logo.
  if (state.status === 'loading') return null;
  if (state.status === 'error' || !value) {
    return <ErrorView message={t('errors.storage')} onRetry={() => {
      setState({ status: 'loading' });
      setAttempt((n) => n + 1);
    }} />;
  }
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
