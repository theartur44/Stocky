import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { preventScreenCaptureAsync, allowScreenCaptureAsync } from 'expo-screen-capture';
import { AppState, Image, StyleSheet, Text, View } from 'react-native';

import { t } from '../i18n';
import { authenticate, canLock } from '../integrations/biometrics';
import { useApp } from '../state/AppProvider';
import { Backdrop, Button } from './components';
import { font, spacing, useTheme } from './theme';

const LOGO = require('../../assets/splash-icon.png') as number;
/** Tras este tiempo en segundo plano se vuelve a pedir la huella. */
const RELOCK_MS = 60_000;

/**
 * Bloqueo de la app con huella (opcional, Ajustes → Seguridad). Mientras está
 * bloqueada, el contenido no se muestra ni lo lee TalkBack.
 */
export function LockGate({ children }: { children: ReactNode }) {
  const { settings } = useApp();
  const { colors } = useTheme();
  const enabled = settings.biometricLock;
  const [locked, setLocked] = useState(enabled);
  const backgroundAt = useRef<number | null>(null);
  const prompting = useRef(false);

  const unlock = useCallback(async () => {
    if (prompting.current) return;
    prompting.current = true;
    try {
      // Si el móvil ya no tiene ningún bloqueo configurado, no se deja a nadie fuera de su propia app.
      if (!(await canLock()) || (await authenticate())) setLocked(false);
    } finally {
      prompting.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) setLocked(false);
  }, [enabled]);

  // Con el bloqueo activado, Android no muestra el contenido en «Recientes» ni permite capturas.
  useEffect(() => {
    if (!enabled) return;
    preventScreenCaptureAsync('lock').catch(() => undefined);
    return () => {
      allowScreenCaptureAsync('lock').catch(() => undefined);
    };
  }, [enabled]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') backgroundAt.current = Date.now();
      if (state === 'active' && enabled && backgroundAt.current !== null && Date.now() - backgroundAt.current > RELOCK_MS) {
        setLocked(true);
      }
      if (state === 'active') backgroundAt.current = null;
    });
    return () => sub.remove();
  }, [enabled]);

  // Al bloquearse se pide la huella directamente.
  useEffect(() => {
    if (locked && AppState.currentState === 'active') void unlock();
  }, [locked, unlock]);

  return (
    <View style={styles.fill}>
      <View style={styles.fill} importantForAccessibility={locked ? 'no-hide-descendants' : 'auto'}>
        {children}
      </View>
      {locked ? (
        <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
          <Backdrop />
          <View style={styles.center}>
            <Image source={LOGO} style={styles.logo} accessible={false} />
            <Ionicons name="lock-closed" size={28} color={colors.primary} />
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
              {t('security.lockedTitle')}
            </Text>
            <Button label={t('security.unlock')} icon="finger-print" onPress={() => void unlock()} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xl },
  logo: { width: 160, height: 160 },
  title: { fontSize: font.title, fontWeight: '800' },
});
