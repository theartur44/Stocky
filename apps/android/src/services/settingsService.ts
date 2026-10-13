import { settingsRepo } from '../data/repositories';
import { nowIso, type ServiceContext } from './context';

export type ConsentState = 'unknown' | 'granted' | 'denied';

/**
 * Ajustes locales. Los valores por defecto son los más respetuosos con la
 * privacidad: avisos desactivados hasta que el usuario los activa, nombres de
 * productos ocultos en notificaciones y consulta externa sin consentimiento.
 */
export interface Settings {
  /** Días de antelación para avisar de caducidades (0-30). */
  warnDays: number;
  /** Hora local de los avisos (0-23). */
  notifyHour: number;
  notificationsEnabled: boolean;
  /** Mostrar nombres de productos en las notificaciones (pantalla de bloqueo incluida). */
  notificationShowNames: boolean;
  /** Consentimiento para consultar Open Food Facts con el código escaneado. */
  productLookupConsent: ConsentState;
  /** Fecha ISO en la que se dio o retiró el consentimiento. */
  productLookupConsentAt: string | null;
  recipeVegetarian: boolean;
  /** Tiempo máximo de preparación preferido (minutos, 0 = sin límite). */
  recipeMaxMinutes: number;
}

export const DEFAULT_SETTINGS: Settings = {
  warnDays: 2,
  notifyHour: 9,
  notificationsEnabled: false,
  notificationShowNames: false,
  productLookupConsent: 'unknown',
  productLookupConsentAt: null,
  recipeVegetarian: false,
  recipeMaxMinutes: 0,
};

type Validator<K extends keyof Settings> = (v: unknown) => v is Settings[K];

const isInt = (min: number, max: number) => (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

const VALIDATORS: { [K in keyof Settings]: Validator<K> } = {
  warnDays: isInt(0, 30),
  notifyHour: isInt(0, 23),
  notificationsEnabled: isBool,
  notificationShowNames: isBool,
  productLookupConsent: (v): v is ConsentState => v === 'unknown' || v === 'granted' || v === 'denied',
  productLookupConsentAt: (v): v is string | null => v === null || typeof v === 'string',
  recipeVegetarian: isBool,
  recipeMaxMinutes: isInt(0, 600),
};

/** Interpreta los valores guardados; los desconocidos o corruptos vuelven al valor por defecto. */
export function parseSettings(raw: Record<string, string>): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const stored = raw[key];
    if (stored === undefined) continue;
    try {
      const value: unknown = JSON.parse(stored);
      if (VALIDATORS[key](value)) (out as unknown as Record<string, unknown>)[key] = value;
    } catch {
      // Valor corrupto: se mantiene el valor por defecto.
    }
  }
  return out;
}

export function createSettingsService(ctx: ServiceContext) {
  const { db } = ctx;
  const service = {
    async get(): Promise<Settings> {
      return parseSettings(await settingsRepo.getAll(db));
    },

    async update(patch: Partial<Settings>): Promise<Settings> {
      const entries = Object.entries(patch) as [keyof Settings, unknown][];
      for (const [key, value] of entries) {
        if (!(key in VALIDATORS) || !VALIDATORS[key](value)) throw new Error(`Invalid setting: ${key}`);
      }
      await db.transaction(async (tx) => {
        for (const [key, value] of entries) await settingsRepo.set(tx, key, JSON.stringify(value));
      });
      ctx.onChange?.('settings');
      return service.get();
    },

    /** Registra la decisión del usuario sobre la consulta externa de productos. */
    setLookupConsent(granted: boolean): Promise<Settings> {
      return service.update({
        productLookupConsent: granted ? 'granted' : 'denied',
        productLookupConsentAt: nowIso(ctx),
      });
    },
  };
  return service;
}

export type SettingsService = ReturnType<typeof createSettingsService>;
