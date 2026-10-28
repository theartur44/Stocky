import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { deviceLocale, LOCALE_LIST, LOCALE_NAMES, LOCALES, type Locale } from '../i18n';
import { useApp } from '../state/AppProvider';
import { Backdrop, Button, FadeIn, Glass, PressableScale } from '../ui/components';
import { font, radius, spacing, useTheme } from '../ui/theme';

const LOGO = require('../../assets/splash-icon.png') as number;

/**
 * Lo primero al abrir la app: elegir el idioma. Los textos de esta pantalla se
 * muestran en el idioma marcado, para que se entiendan antes de confirmar.
 */
export default function LanguageScreen() {
  const { services, settings } = useApp();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<Locale>(settings.language ?? deviceLocale());
  const [saving, setSaving] = useState(false);
  const text = LOCALES[selected].language;

  const confirm = async () => {
    setSaving(true);
    try {
      await services.settings.update({ language: selected });
      router.replace('/');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.fill}>
      <Backdrop />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}>
        <FadeIn style={styles.hero}>
          <Image source={LOGO} style={styles.logo} accessibilityIgnoresInvertColors accessible={false} />
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
            {text.choose}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>{text.hint}</Text>
        </FadeIn>
        <FadeIn delay={120}>
          <Glass style={styles.card}>
            <View accessibilityRole="radiogroup" style={{ gap: spacing.sm }}>
              {LOCALE_LIST.map((l) => {
                const on = l === selected;
                return (
                  <PressableScale
                    key={l}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={LOCALE_NAMES[l]}
                    accessibilityLanguage={l}
                    onPress={() => setSelected(l)}
                    style={[
                      styles.option,
                      { borderColor: on ? colors.primary : colors.glassBorder, backgroundColor: on ? colors.primarySoft : colors.surfaceAlt },
                    ]}
                  >
                    <Text style={[styles.optionLabel, { color: colors.text }]}>{LOCALE_NAMES[l]}</Text>
                    <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? colors.primary : colors.textMuted} />
                  </PressableScale>
                );
              })}
            </View>
            <Button label={text.continue} icon="arrow-forward" loading={saving} onPress={() => void confirm()} />
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
  logo: { width: 160, height: 160, marginBottom: -spacing.lg },
  title: { fontSize: font.title + 2, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: font.body, textAlign: 'center', lineHeight: 22, maxWidth: 320 },
  card: { padding: spacing.lg, gap: spacing.lg },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  optionLabel: { fontSize: font.body + 1, fontWeight: '600' },
});
