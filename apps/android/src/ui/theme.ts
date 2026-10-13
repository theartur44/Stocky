import { Platform, useColorScheme, type ViewStyle } from 'react-native';

import type { Category } from '../domain/models';

/**
 * Paleta de Stoky: verde «despensa fresca» con acento ámbar (el de la marca).
 * Contrastes de texto sobre fondo ≥ 4.5:1 (WCAG AA) en ambos temas.
 */
export interface Palette {
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
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

const light: Palette = {
  background: '#F3F6F2',
  surface: '#FFFFFF',
  surfaceAlt: '#EAF0E8',
  text: '#16201A',
  textMuted: '#4F5C52',
  border: '#D5DED2',
  primary: '#1E7A45',
  primaryStrong: '#14592F',
  onPrimary: '#FFFFFF',
  primarySoft: '#DDF2E4',
  accent: '#F4A340',
  danger: '#B3261E',
  onDanger: '#FFFFFF',
  warning: '#8A5300',
  warningSoft: '#FDEFD9',
  dangerSoft: '#FBE3E1',
  success: '#1E7A45',
  successSoft: '#DDF2E4',
  gradient: ['#3FBF73', '#14592F'],
  shadow: '#0B2A17',
};

const dark: Palette = {
  background: '#0E120F',
  surface: '#182019',
  surfaceAlt: '#212B23',
  text: '#E8EFE9',
  textMuted: '#AEBBB0',
  border: '#2F3B31',
  primary: '#6FD497',
  primaryStrong: '#3FBF73',
  onPrimary: '#06210F',
  primarySoft: '#1E3A27',
  accent: '#F7B866',
  danger: '#FFB4AB',
  onDanger: '#4A0E0A',
  warning: '#F5C26B',
  warningSoft: '#3A2C12',
  dangerSoft: '#46201C',
  success: '#6FD497',
  successSoft: '#1E3A27',
  gradient: ['#2E9E5B', '#0F4024'],
  shadow: '#000000',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 } as const;
export const font = { small: 13, body: 16, large: 18, title: 20, heading: 26, display: 34 } as const;

export function useTheme(): { colors: Palette; dark: boolean } {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  return { colors: isDark ? dark : light, dark: isDark };
}

/** Sombra suave coherente entre plataformas. */
export function elevation(colors: Palette, level: 1 | 2 | 3 = 1): ViewStyle {
  return Platform.select<ViewStyle>({
    android: { elevation: level * 2, shadowColor: colors.shadow },
    default: {
      shadowColor: colors.shadow,
      shadowOpacity: 0.08 + level * 0.03,
      shadowRadius: 4 + level * 4,
      shadowOffset: { width: 0, height: level * 2 },
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
