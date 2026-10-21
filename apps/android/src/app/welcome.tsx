import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '../i18n';
import { useApp } from '../state/AppProvider';
import { Backdrop, Button, FadeIn, Glass } from '../ui/components';
import { font, spacing, useTheme } from '../ui/theme';

const LOGO = require('../../assets/splash-icon.png') as number;

/**
 * Primera pantalla al instalar la app: entrar como invitado (todo local) o
 * iniciar sesión en el servidor de casa para compartir el inventario.
 */
export default function WelcomeScreen() {
  const { services } = useApp();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const guest = async () => {
    await services.settings.update({ welcomeDone: true });
    router.replace('/');
  };

  return (
    <View style={styles.fill}>
      <Backdrop />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}
      >
        <FadeIn style={styles.hero}>
          <Image source={LOGO} style={styles.logo} accessibilityIgnoresInvertColors accessible={false} />
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
            {t('welcome.title')}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>{t('welcome.subtitle')}</Text>
        </FadeIn>

        <FadeIn delay={120}>
          <Glass style={styles.card}>
            <View style={styles.optionHead}>
              <Ionicons name="people-circle-outline" size={26} color={colors.primary} />
              <Text style={[styles.optionText, { color: colors.textMuted }]}>{t('welcome.loginHint')}</Text>
            </View>
            <Button
              label={t('welcome.login')}
              icon="log-in-outline"
              onPress={() => router.push({ pathname: '/server', params: { welcome: '1' } })}
            />
            <Button
              label={t('welcome.register')}
              icon="person-add-outline"
              variant="ghost"
              onPress={() => router.push({ pathname: '/server', params: { welcome: '1', mode: 'register' } })}
            />
          </Glass>
        </FadeIn>

        <FadeIn delay={220}>
          <Glass style={styles.card}>
            <View style={styles.optionHead}>
              <Ionicons name="phone-portrait-outline" size={24} color={colors.primary} />
              <Text style={[styles.optionText, { color: colors.textMuted }]}>{t('welcome.guestHint')}</Text>
            </View>
            <Button label={t('welcome.guest')} icon="arrow-forward" variant="secondary" onPress={() => void guest()} />
          </Glass>
        </FadeIn>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.lg, gap: spacing.lg },
  hero: { alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  logo: { width: 200, height: 200, marginBottom: -spacing.lg },
  title: { fontSize: font.display - 4, fontWeight: '800', letterSpacing: -0.5, textAlign: 'center' },
  subtitle: { fontSize: font.body, textAlign: 'center', lineHeight: 22, maxWidth: 320 },
  card: { padding: spacing.lg, gap: spacing.md },
  optionHead: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  optionText: { flex: 1, fontSize: font.small + 1, lineHeight: 19 },
});
