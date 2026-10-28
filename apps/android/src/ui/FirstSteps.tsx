import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { t } from '../i18n';
import * as notifications from '../integrations/notifications';
import { useApp } from '../state/AppProvider';
import { logError } from '../state/errors';
import { Button, Card, type IconName } from './components';
import { font, spacing, useTheme } from './theme';

const TIPS: { icon: IconName; key: string }[] = [
  { icon: 'barcode-outline', key: 'scan' },
  { icon: 'time-outline', key: 'fefo' },
  { icon: 'flash-outline', key: 'actions' },
];

/**
 * Primeros pasos en Inicio: unos consejos que se pueden cerrar y, en cuanto
 * hay algo con fecha en casa, la propuesta de activar los avisos de caducidad
 * (vienen desactivados y si no, casi nadie los encuentra).
 */
export function FirstSteps({ hasDatedLots }: { hasDatedLots: boolean }) {
  const { services, settings, syncNotifications } = useApp();
  const { colors } = useTheme();
  const [tip, setTip] = useState(0);
  const asked = useRef(false);

  useEffect(() => {
    if (!hasDatedLots || settings.notificationsEnabled || settings.notifyPromptDone || asked.current) return;
    asked.current = true;
    const done = () => services.settings.update({ notifyPromptDone: true }).catch((e) => logError('settings.notifyPrompt', e));
    Alert.alert(t('firstSteps.notifyTitle'), t('firstSteps.notifyMessage', { days: settings.warnDays }), [
      { text: t('firstSteps.notNow'), style: 'cancel', onPress: () => void done() },
      {
        text: t('firstSteps.enable'),
        onPress: async () => {
          await done();
          if (await notifications.requestPermission().catch(() => false)) {
            await services.settings.update({ notificationsEnabled: true });
            await syncNotifications();
          }
        },
      },
    ]);
  }, [hasDatedLots, settings.notificationsEnabled, settings.notifyPromptDone, settings.warnDays, services, syncNotifications]);

  if (settings.tipsDone) return null;
  const current = TIPS[tip]!;
  const last = tip === TIPS.length - 1;
  const finish = () => void services.settings.update({ tipsDone: true }).catch((e) => logError('settings.tips', e));

  return (
    <Card>
      <View style={styles.head}>
        <Ionicons name={current.icon} size={24} color={colors.primary} />
        <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
          {t(`firstSteps.tips.${current.key}.title`)}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: font.small }}>
          {tip + 1}/{TIPS.length}
        </Text>
      </View>
      <Text style={{ color: colors.textMuted, fontSize: font.body, lineHeight: 22 }}>{t(`firstSteps.tips.${current.key}.body`)}</Text>
      <View style={styles.actions}>
        <Button compact variant="ghost" label={t('firstSteps.dismiss')} onPress={finish} />
        <Button compact variant="tonal" icon={last ? 'checkmark' : 'arrow-forward'} label={last ? t('firstSteps.gotIt') : t('firstSteps.next')} onPress={() => (last ? finish() : setTip(tip + 1))} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1, fontSize: font.large, fontWeight: '800' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
});
