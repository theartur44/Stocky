import { useColorScheme } from 'react-native';

/**
 * Paleta de Stoky: verde «despensa fresca» y acento cálido.
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
  onPrimary: string;
  primarySoft: string;
  danger: string;
  onDanger: string;
  warning: string;
  warningSoft: string;
  dangerSoft: string;
  success: string;
  successSoft: string;
}

const light: Palette = {
  background: '#F6F7F4',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF1EA',
  text: '#1B1F1A',
  textMuted: '#4E584C',
  border: '#C9D1C5',
  primary: '#1E6B3A',
  onPrimary: '#FFFFFF',
  primarySoft: '#DCEEDF',
  danger: '#B3261E',
  onDanger: '#FFFFFF',
  warning: '#8A5300',
  warningSoft: '#FCEFD6',
  dangerSoft: '#FBE3E1',
  success: '#1E6B3A',
  successSoft: '#DCEEDF',
};

const dark: Palette = {
  background: '#111411',
  surface: '#1A1F1A',
  surfaceAlt: '#232A23',
  text: '#E8EDE6',
  textMuted: '#B2BCAE',
  border: '#3A453A',
  primary: '#7FD69A',
  onPrimary: '#0B2614',
  primarySoft: '#21402B',
  danger: '#FFB4AB',
  onDanger: '#4A0E0A',
  warning: '#F5C26B',
  warningSoft: '#3D2E12',
  dangerSoft: '#4A1C19',
  success: '#7FD69A',
  successSoft: '#21402B',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
export const font = { small: 14, body: 16, title: 20, heading: 24, display: 32 } as const;

export function useTheme(): { colors: Palette; dark: boolean } {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  return { colors: isDark ? dark : light, dark: isDark };
}
