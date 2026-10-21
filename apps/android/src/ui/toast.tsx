import Ionicons from '@expo/vector-icons/Ionicons';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { IconName } from './components';
import { elevation, font, radius, spacing, useTheme } from './theme';

type Tone = 'success' | 'neutral' | 'warning' | 'danger';
interface ToastMessage {
  id: number;
  text: string;
  tone: Tone;
  icon?: IconName;
}

const ToastContext = createContext<(text: string, opts?: { tone?: Tone; icon?: IconName }) => void>(() => undefined);

/** Muestra un aviso breve en la parte inferior. */
export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [msg, setMsg] = useState<ToastMessage | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  const show = useCallback(
    (text: string, opts?: { tone?: Tone; icon?: IconName }) => {
      const id = ++seq.current;
      setMsg({ id, text, tone: opts?.tone ?? 'success', icon: opts?.icon });
      AccessibilityInfo.announceForAccessibility(text);
      anim.stopAnimation();
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 8 }).start();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
          setMsg((m) => (m?.id === id ? null : m));
        });
      }, 2200);
    },
    [anim],
  );

  const tone = msg?.tone ?? 'success';
  const accent =
    tone === 'success' ? colors.primary : tone === 'warning' ? colors.accent : tone === 'danger' ? colors.danger : colors.textMuted;
  const icon: IconName =
    msg?.icon ?? (tone === 'success' ? 'checkmark-circle' : tone === 'neutral' ? 'information-circle' : 'alert-circle');

  return (
    <ToastContext.Provider value={useMemo(() => show, [show])}>
      <View style={{ flex: 1 }}>
        {children}
        {msg ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.toast,
              elevation(colors, 3),
              {
                bottom: insets.bottom + 88,
                backgroundColor: colors.surfaceSolid,
                borderColor: colors.glassBorder,
                borderLeftColor: accent,
                opacity: anim,
                transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }],
              },
            ]}
          >
            <Ionicons name={icon} size={22} color={accent} />
            <Text style={{ color: colors.text, fontSize: font.body, fontWeight: '600', flex: 1 }} numberOfLines={2}>
              {msg.text}
            </Text>
          </Animated.View>
        ) : null}
      </View>
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderLeftWidth: 5,
  },
});
