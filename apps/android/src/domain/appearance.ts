/** Preferencias de apariencia que el usuario puede elegir en Ajustes. */
export const THEME_COLORS = ['green', 'blue', 'violet', 'pink', 'orange', 'teal'] as const;
export type ThemeColor = (typeof THEME_COLORS)[number];

export const THEME_MODES = ['system', 'light', 'dark'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export const isThemeColor = (v: unknown): v is ThemeColor =>
  typeof v === 'string' && (THEME_COLORS as readonly string[]).includes(v);
export const isThemeMode = (v: unknown): v is ThemeMode =>
  typeof v === 'string' && (THEME_MODES as readonly string[]).includes(v);
