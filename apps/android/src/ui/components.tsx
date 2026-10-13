import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import type { Category } from '../domain/models';
import { t } from '../i18n';
import { CATEGORY_STYLE, elevation, font, radius, spacing, useTheme } from './theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

// ------------------------------------------------------------------ base

/**
 * Pulsable con una ligera animación de escala al tocar. Se usa en todos los
 * elementos interactivos para dar una respuesta táctil moderna.
 */
export function PressableScale({
  style,
  children,
  scaleTo = 0.96,
  ...props
}: Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  scaleTo?: number;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) => Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  return (
    <Pressable
      {...props}
      onPressIn={(e) => {
        to(scaleTo);
        props.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        to(1);
        props.onPressOut?.(e);
      }}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

/** Aparición suave (opacidad y desplazamiento) al montar. */
export function FadeIn({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 260, delay: Math.min(delay, 300), useNativeDriver: true }).start();
  }, [v, delay]);
  return (
    <Animated.View
      style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}
    >
      {children}
    </Animated.View>
  );
}

/** Contenedor con desplazamiento y márgenes coherentes. */
export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const { colors } = useTheme();
  if (!scroll) return <View style={[styles.screen, { backgroundColor: colors.background }]}>{children}</View>;
  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.screenContent}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors, dark } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface },
        dark ? { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border } : elevation(colors, 1),
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Cabecera con el degradado de la marca. */
export function GradientHeader({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, style]}>
      {children}
    </LinearGradient>
  );
}

export function Title({ children, size = 'title' }: { children: ReactNode; size?: 'title' | 'heading' }) {
  const { colors } = useTheme();
  return (
    <Text accessibilityRole="header" style={[styles.title, { color: colors.text, fontSize: font[size] }]}>
      {children}
    </Text>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <Text accessibilityRole="header" style={{ color: colors.text, fontSize: font.large, fontWeight: '700', flex: 1 }}>
        {title}
      </Text>
      {action}
    </View>
  );
}

export function Body({ children, muted, small }: { children: ReactNode; muted?: boolean; small?: boolean }) {
  const { colors } = useTheme();
  return (
    <Text style={{ color: muted ? colors.textMuted : colors.text, fontSize: small ? font.small : font.body, lineHeight: small ? 18 : 22 }}>
      {children}
    </Text>
  );
}

// ------------------------------------------------------------------ botones

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'tonal';

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  accessibilityHint,
  compact,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const palette: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
    primary: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary },
    secondary: { bg: colors.surface, fg: colors.primary, border: colors.border },
    tonal: { bg: colors.primarySoft, fg: colors.primary, border: colors.primarySoft },
    danger: { bg: colors.danger, fg: colors.onDanger, border: colors.danger },
    ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
  };
  const p = palette[variant];
  const isDisabled = disabled || loading;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={[
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor: p.bg, borderColor: p.border, opacity: isDisabled ? 0.5 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={compact ? 18 : 20} color={p.fg} /> : null}
          <Text style={[styles.buttonLabel, { color: p.fg, fontSize: compact ? font.small + 1 : font.body }]}>{label}</Text>
        </>
      )}
    </PressableScale>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  color,
  filled,
  size = 24,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  color?: string;
  filled?: boolean;
  size?: number;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      scaleTo={0.85}
      style={[
        styles.iconButton,
        filled && { backgroundColor: colors.primarySoft, borderRadius: radius.pill },
        disabled && { opacity: 0.4 },
      ]}
    >
      <Ionicons name={icon} size={size} color={color ?? colors.primary} />
    </PressableScale>
  );
}

/** Botón flotante principal. */
export function Fab({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.fabWrap} pointerEvents="box-none">
      <PressableScale accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[styles.fab, elevation(colors, 3)]}>
        <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fabInner}>
          <Ionicons name={icon} size={24} color="#FFFFFF" />
          <Text style={[styles.buttonLabel, { color: '#FFFFFF' }]}>{label}</Text>
        </LinearGradient>
      </PressableScale>
    </View>
  );
}

// ------------------------------------------------------------------ entradas

export function TextField({
  label,
  error,
  hint,
  icon,
  ...props
}: TextInputProps & { label: string; error?: string | null; hint?: string; icon?: IconName }) {
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      <View
        style={[
          styles.inputWrap,
          { backgroundColor: colors.surfaceAlt, borderColor: error ? colors.danger : 'transparent' },
        ]}
      >
        {icon ? <Ionicons name={icon} size={20} color={colors.textMuted} /> : null}
        <TextInput
          accessibilityLabel={label}
          accessibilityHint={hint}
          placeholderTextColor={colors.textMuted}
          style={[styles.input, { color: colors.text }]}
          {...props}
        />
      </View>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={[styles.help, { color: colors.danger }]}>
          {error}
        </Text>
      ) : hint ? (
        <Text style={[styles.help, { color: colors.textMuted }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

/** Campo de búsqueda redondeado. */
export function SearchBar(props: TextInputProps & { label: string }) {
  const { colors } = useTheme();
  const { label, ...rest } = props;
  return (
    <View style={[styles.search, { backgroundColor: colors.surface }, elevation(colors, 1)]}>
      <Ionicons name="search" size={20} color={colors.textMuted} />
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, { color: colors.text }]}
        returnKeyType="search"
        autoCorrect={false}
        {...rest}
      />
    </View>
  );
}

/** Selector de una opción entre varias (chips accesibles como radio). */
export function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  scroll,
}: {
  label?: string;
  options: readonly { value: T; label: string; icon?: IconName }[];
  value: T | null;
  onChange: (v: T) => void;
  /** Una sola fila desplazable en horizontal. */
  scroll?: boolean;
}) {
  const { colors } = useTheme();
  const chips = options.map((o) => {
    const selected = o.value === value;
    return (
      <PressableScale
        key={o.value}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={o.label}
        onPress={() => onChange(o.value)}
        style={[
          styles.chip,
          {
            backgroundColor: selected ? colors.primary : colors.surface,
            borderColor: selected ? colors.primary : colors.border,
          },
        ]}
      >
        {o.icon ? <Ionicons name={o.icon} size={16} color={selected ? colors.onPrimary : colors.textMuted} /> : null}
        <Text style={{ color: selected ? colors.onPrimary : colors.text, fontSize: font.small + 1, fontWeight: selected ? '700' : '500' }}>
          {o.label}
        </Text>
      </PressableScale>
    );
  });
  return (
    <View style={styles.field} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {label ? <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text> : null}
      {scroll ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {chips}
        </ScrollView>
      ) : (
        <View style={styles.chips}>{chips}</View>
      )}
    </View>
  );
}

export function SwitchRow({
  label,
  value,
  onChange,
  help,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  help?: string;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.switchRow}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: font.body }}>{label}</Text>
        {help ? <Text style={[styles.help, { color: colors.textMuted }]}>{help}</Text> : null}
      </View>
      <Switch
        accessibilityLabel={label}
        accessibilityRole="switch"
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: colors.primary, false: colors.border }}
      />
    </View>
  );
}

/** Selector de cantidad −/+ compacto. */
export function Stepper({
  value,
  onDecrement,
  onIncrement,
  label,
  canDecrement = true,
}: {
  value: string;
  onDecrement: () => void;
  onIncrement: () => void;
  label: string;
  canDecrement?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.stepper, { backgroundColor: colors.surfaceAlt }]} accessibilityLabel={`${label}: ${value}`}>
      <IconButton icon="remove" label={`${t('common.less')} ${label}`} onPress={onDecrement} size={20} disabled={!canDecrement} />
      <Text style={{ color: colors.text, fontWeight: '700', minWidth: 44, textAlign: 'center' }}>{value}</Text>
      <IconButton icon="add" label={`${t('common.more')} ${label}`} onPress={onIncrement} size={20} />
    </View>
  );
}

// ------------------------------------------------------------------ listas

/** Círculo de color con el icono de la categoría. */
export function CategoryAvatar({ category, size = 44 }: { category: Category; size?: number }) {
  const s = CATEGORY_STYLE[category];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2.6,
        backgroundColor: `${s.color}22`,
        alignItems: 'center',
        justifyContent: 'center',
      }}
      accessible={false}
    >
      <Ionicons name={s.icon as IconName} size={size * 0.5} color={s.color} />
    </View>
  );
}

export function ListRow({
  title,
  subtitle,
  right,
  left,
  onPress,
  icon,
  accessibilityLabel,
}: {
  title: string;
  subtitle?: string | null;
  right?: ReactNode;
  left?: ReactNode;
  onPress?: () => void;
  icon?: IconName;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const content = (
    <>
      {left}
      {icon ? (
        <View style={[styles.rowIcon, { backgroundColor: colors.primarySoft }]}>
          <Ionicons name={icon} size={20} color={colors.primary} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: font.body, fontWeight: '600' }} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ color: colors.textMuted, fontSize: font.small, marginTop: 2 }} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [title, subtitle].filter(Boolean).join('. ')}
      onPress={onPress}
      scaleTo={0.98}
      style={styles.row}
    >
      {content}
    </PressableScale>
  );
}

export type Tone = 'neutral' | 'warning' | 'danger' | 'success';

export function Badge({ label, tone = 'neutral', icon }: { label: string; tone?: Tone; icon?: IconName }) {
  const { colors } = useTheme();
  const map: Record<Tone, { bg: string; fg: string }> = {
    neutral: { bg: colors.surfaceAlt, fg: colors.textMuted },
    warning: { bg: colors.warningSoft, fg: colors.warning },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
    success: { bg: colors.successSoft, fg: colors.success },
  };
  return (
    <View style={[styles.badge, { backgroundColor: map[tone].bg }]}>
      {icon ? <Ionicons name={icon} size={13} color={map[tone].fg} /> : null}
      <Text style={{ color: map[tone].fg, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

export function EmptyState({ icon = 'leaf-outline', message, action }: { icon?: IconName; message: string; action?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <FadeIn style={styles.center}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.primarySoft }]}>
        <Ionicons name={icon} size={40} color={colors.primary} />
      </View>
      <Text accessibilityRole="text" style={[styles.centerText, { color: colors.textMuted }]}>
        {message}
      </Text>
      {action}
    </FadeIn>
  );
}

export function LoadingView() {
  const { colors } = useTheme();
  return (
    <View style={[styles.center, { backgroundColor: colors.background }]} accessibilityLabel={t('common.loading')}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.center, { backgroundColor: colors.background }]}>
      <Ionicons name="alert-circle-outline" size={48} color={colors.danger} />
      <Text accessibilityRole="alert" style={[styles.centerText, { color: colors.text }]}>
        {message}
      </Text>
      {onRetry ? <Button label={t('common.retry')} onPress={onRetry} variant="secondary" /> : null}
    </View>
  );
}

export function Notice({ message, tone = 'neutral', icon }: { message: string; tone?: Tone; icon?: IconName }) {
  const { colors } = useTheme();
  const bg = tone === 'warning' ? colors.warningSoft : tone === 'danger' ? colors.dangerSoft : tone === 'success' ? colors.successSoft : colors.surfaceAlt;
  const fg = tone === 'warning' ? colors.warning : tone === 'danger' ? colors.danger : tone === 'success' ? colors.success : colors.textMuted;
  return (
    <View style={[styles.notice, { backgroundColor: bg }]} accessibilityRole="text">
      <Ionicons name={icon ?? (tone === 'neutral' ? 'information-circle-outline' : 'alert-circle-outline')} size={18} color={fg} />
      <Text style={{ color: fg, fontSize: font.small, flex: 1, lineHeight: 18 }}>{message}</Text>
    </View>
  );
}

export function Gap({ size = spacing.md }: { size?: number }) {
  return <View style={{ height: size, width: size }} />;
}

export const styles = StyleSheet.create({
  screen: { flex: 1 },
  screenContent: { padding: spacing.lg, paddingBottom: 120, gap: spacing.lg },
  card: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  hero: { borderRadius: radius.xl, padding: spacing.xl, gap: spacing.sm },
  title: { fontWeight: '800', letterSpacing: -0.3 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
  button: {
    minHeight: 52,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  buttonCompact: { minHeight: 44, paddingHorizontal: spacing.md, borderRadius: radius.sm + 2 },
  buttonLabel: { fontSize: font.body, fontWeight: '700' },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  field: { gap: 6 },
  label: { fontSize: font.small, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  input: { flex: 1, minHeight: 48, fontSize: font.body },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
  },
  help: { fontSize: font.small },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chipsRow: { flexDirection: 'row', gap: spacing.sm, paddingRight: spacing.lg },
  chip: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.pill },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 60, paddingVertical: spacing.sm, gap: spacing.md },
  rowIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md, minHeight: 220 },
  centerText: { fontSize: font.body, textAlign: 'center', lineHeight: 22 },
  emptyIcon: { width: 84, height: 84, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  notice: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', padding: spacing.md, borderRadius: radius.md },
  fabWrap: { position: 'absolute', right: spacing.lg, bottom: spacing.lg },
  fab: { borderRadius: radius.pill },
  fabInner: {
    minHeight: 56,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
