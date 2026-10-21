import { createContext, useContext } from 'react';
import { Platform, useColorScheme, type ViewStyle } from 'react-native';

import type { ThemeColor, ThemeMode } from '../domain/appearance';
import type { Category } from '../domain/models';

/**
 * Paleta de Stocky en estilo «cristal» (glassmorphism): superficies
 * translúcidas con borde claro sobre un fondo con manchas de color suaves.
 * El color principal lo elige el usuario (Ajustes → Apariencia). Los
 * contrastes de texto se comprueban en `theme.test.ts` (WCAG AA ≥ 4.5:1).
 */
export interface Palette {
  background: string;
  /** Superficie de cristal (tarjetas, barras). Translúcida. */
  surface: string;
  /** Campos y controles dentro del cristal. Translúcida. */
  surfaceAlt: string;
  /** Superficie opaca para lo que flota sobre contenido variable (avisos, hoja del escáner). */
  surfaceSolid: string;
  /** Opaca: barras que pasan por encima del texto (barra de pestañas) deben leerse siempre. */
  surfaceBar: string;
  /** Velo translúcido sobre el desenfoque de la barra de pestañas. */
  surfaceVeil: string;
  /** Brillo de la esquina superior del cristal (inicio del degradado). */
  glassHighlight: string;
  /** Borde claro del cristal. */
  glassBorder: string;
  /** Manchas de color del fondo. */
  blobs: readonly [string, string, string];
  blobOpacity: number;
  text: string;
  textMuted: string;
  /** Líneas y bordes de controles (oscuros sobre el cristal claro). */
  border: string;
  primary: string;
  primaryStrong: string;
  onPrimary: string;
  primarySoft: string;
  accent: string;
  danger: string;
  onDanger: string;
  warning: string;
  warningSoft: string;
  dangerSoft: string;
  success: string;
  successSoft: string;
  /** Degradado de la marca (cabeceras, botón de escanear). */
  gradient: readonly [string, string];
  shadow: string;
}

interface AccentSpec {
  primary: string;
  primaryStrong: string;
  onPrimary: string;
  gradient: readonly [string, string];
  blobs: readonly [string, string, string];
}

/** Colores principales disponibles, en versión clara y oscura. */
export const ACCENTS: Record<ThemeColor, { swatch: string; light: AccentSpec; dark: AccentSpec }> = {
  green: {
    swatch: '#2E9E5B',
    light: { primary: '#17663A', primaryStrong: '#104D2B', onPrimary: '#FFFFFF', gradient: ['#3FBF73', '#14592F'], blobs: ['#7FD9A0', '#F7CF84', '#8ACFEF'] },
    dark: { primary: '#6FD497', primaryStrong: '#3FBF73', onPrimary: '#06210F', gradient: ['#2E9E5B', '#0F4024'], blobs: ['#1A7341', '#7A5E1A', '#1F5F8A'] },
  },
  blue: {
    swatch: '#2F74D8',
    light: { primary: '#1C5BBA', primaryStrong: '#14448C', onPrimary: '#FFFFFF', gradient: ['#4A90F0', '#1A3F8F'], blobs: ['#93C2FF', '#C2B2FF', '#86E3D6'] },
    dark: { primary: '#8AB8FF', primaryStrong: '#5C9BFF', onPrimary: '#0A1E3D', gradient: ['#3A78D8', '#122C66'], blobs: ['#2456A8', '#4B3A9E', '#1F7A74'] },
  },
  violet: {
    swatch: '#7E52E0',
    light: { primary: '#643BBA', primaryStrong: '#4A2A8C', onPrimary: '#FFFFFF', gradient: ['#9B6BFF', '#4A2499'], blobs: ['#C6AAFF', '#FFB0D8', '#A3C8FF'] },
    dark: { primary: '#C2A6FF', primaryStrong: '#9B6BFF', onPrimary: '#22104A', gradient: ['#7A4FE0', '#2E1666'], blobs: ['#5532A8', '#8E2A63', '#2F4FA8'] },
  },
  pink: {
    swatch: '#D6457F',
    light: { primary: '#A8285D', primaryStrong: '#7F1E46', onPrimary: '#FFFFFF', gradient: ['#F2679E', '#8A1E4C'], blobs: ['#FFADCB', '#FFCDA3', '#CDAEFF'] },
    dark: { primary: '#FF9CC2', primaryStrong: '#F2679E', onPrimary: '#45081F', gradient: ['#D0477F', '#5C1031'], blobs: ['#9E2F5C', '#94501F', '#5532A8'] },
  },
  orange: {
    swatch: '#E5762A',
    light: { primary: '#9C4410', primaryStrong: '#76330C', onPrimary: '#FFFFFF', gradient: ['#FF9A4D', '#A3420F'], blobs: ['#FFC593', '#FFE18F', '#FFAFAF'] },
    dark: { primary: '#FFB37A', primaryStrong: '#FF9A4D', onPrimary: '#3D1A03', gradient: ['#D9732E', '#6B2C08'], blobs: ['#A8561F', '#80701C', '#94303A'] },
  },
  teal: {
    swatch: '#1FA398',
    light: { primary: '#0A6764', primaryStrong: '#074D4A', onPrimary: '#FFFFFF', gradient: ['#2EC4B6', '#0B5552'], blobs: ['#8BE4DA', '#AAD9FF', '#CCF2A3'] },
    dark: { primary: '#5FD9CF', primaryStrong: '#2EC4B6', onPrimary: '#03302D', gradient: ['#1FA398', '#063E3B'], blobs: ['#137A72', '#1F5F8A', '#4A7F1C'] },
  },
};

const lightBase = {
  background: '#EEF2EF',
  surface: 'rgba(255,255,255,0.62)',
  surfaceAlt: 'rgba(255,255,255,0.72)',
  surfaceSolid: '#FFFFFF',
  surfaceBar: '#F8FAF8',
  surfaceVeil: 'rgba(250,252,250,0.55)',
  glassHighlight: 'rgba(255,255,255,0.9)',
  glassBorder: 'rgba(255,255,255,0.85)',
  blobOpacity: 0.45,
  text: '#141C17',
  textMuted: '#4A564D',
  border: 'rgba(20,40,28,0.14)',
  accent: '#F4A340',
  danger: '#B3261E',
  onDanger: '#FFFFFF',
  warning: '#7F4C00',
  warningSoft: 'rgba(253,226,180,0.85)',
  dangerSoft: 'rgba(251,214,210,0.85)',
  success: '#19703F',
  successSoft: 'rgba(196,236,210,0.85)',
  shadow: '#0B2A17',
};

const darkBase = {
  background: '#090D0B',
  surface: 'rgba(255,255,255,0.07)',
  surfaceAlt: 'rgba(255,255,255,0.1)',
  surfaceSolid: '#161D19',
  surfaceBar: '#161D19',
  surfaceVeil: 'rgba(18,24,21,0.55)',
  glassHighlight: 'rgba(255,255,255,0.13)',
  glassBorder: 'rgba(255,255,255,0.14)',
  blobOpacity: 0.42,
  text: '#ECF2EE',
  textMuted: '#B2BEB5',
  border: 'rgba(255,255,255,0.16)',
  accent: '#F7B866',
  danger: '#FFB4AB',
  onDanger: '#4A0E0A',
  warning: '#F5C26B',
  warningSoft: 'rgba(245,194,107,0.16)',
  dangerSoft: 'rgba(255,180,171,0.16)',
  success: '#6FD497',
  successSoft: 'rgba(111,212,151,0.16)',
  shadow: '#000000',
};

/** `#RRGGBB` → `rgba(r,g,b,a)`. */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

const cache = new Map<string, Palette>();

export function getPalette(color: ThemeColor, dark: boolean): Palette {
  const key = `${color}:${dark ? 'd' : 'l'}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const a = ACCENTS[color][dark ? 'dark' : 'light'];
  const palette: Palette = {
    ...(dark ? darkBase : lightBase),
    ...a,
    primarySoft: withAlpha(a.primary, dark ? 0.2 : 0.14),
  };
  cache.set(key, palette);
  return palette;
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 } as const;
export const font = { small: 13, body: 16, large: 18, title: 20, heading: 26, display: 34 } as const;
/** Barra de pestañas flotante: alto y separación del borde inferior (sobre el margen seguro). */
export const TAB_BAR = { height: 66, gap: 10 } as const;

export interface Appearance {
  color: ThemeColor;
  mode: ThemeMode;
}

const AppearanceContext = createContext<Appearance>({ color: 'green', mode: 'system' });
/** Lo coloca la raíz de la app con los valores de los ajustes. */
export const AppearanceProvider = AppearanceContext.Provider;

export function useTheme(): { colors: Palette; dark: boolean } {
  const { color, mode } = useContext(AppearanceContext);
  const scheme = useColorScheme();
  const isDark = mode === 'system' ? scheme === 'dark' : mode === 'dark';
  return { colors: getPalette(color, isDark), dark: isDark };
}

/**
 * Sombra suave. En Android no se usa `elevation`: sobre superficies
 * translúcidas la sombra se vería a través del cristal y lo ensuciaría.
 */
export function elevation(colors: Palette, level: 1 | 2 | 3 = 1): ViewStyle {
  return Platform.select<ViewStyle>({
    android: {},
    default: {
      shadowColor: colors.shadow,
      shadowOpacity: 0.06 + level * 0.03,
      shadowRadius: 6 + level * 5,
      shadowOffset: { width: 0, height: level * 3 },
    },
  })!;
}

/** Icono y color de cada categoría (avatares de productos). */
export const CATEGORY_STYLE: Record<Category, { icon: string; color: string }> = {
  fruit_veg: { icon: 'nutrition', color: '#3FAE5F' },
  meat_fish: { icon: 'fish', color: '#D9534F' },
  dairy_eggs: { icon: 'egg', color: '#4A90D9' },
  bakery: { icon: 'pizza', color: '#C98A3A' },
  grains_pasta: { icon: 'leaf', color: '#B8962E' },
  canned: { icon: 'cube', color: '#8D6E63' },
  frozen: { icon: 'snow', color: '#3BA7C9' },
  drinks: { icon: 'wine', color: '#8E5CC9' },
  snacks: { icon: 'ice-cream', color: '#E0679A' },
  condiments: { icon: 'flask', color: '#E08A2E' },
  other: { icon: 'basket', color: '#6B7A70' },
};
