import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking } from 'react-native';

import { t } from '../i18n';
import * as notifications from '../integrations/notifications';
import { useApp } from '../state/AppProvider';
import { errorMessage } from '../state/errors';
import type { Settings } from '../services/settingsService';
import { Body, Button, Card, ChipGroup, Notice, Screen, SwitchRow, Title } from '../ui/components';

const WARN_OPTIONS = [0, 1, 2, 3, 5, 7].map((d) => ({ value: String(d), label: String(d) }));
const HOUR_OPTIONS = [8, 9, 12, 18, 20].map((h) => ({ value: String(h), label: `${h}:00` }));
const MINUTES_OPTIONS = [0, 20, 30, 45, 60].map((m) => ({
  value: String(m),
  label: m === 0 ? '∞' : `${m}`,
}));

export default function SettingsScreen() {
  const { services, settings, syncNotifications } = useApp();
  const [message, setMessage] = useState<{ text: string; tone: 'neutral' | 'warning' | 'danger' } | null>(null);

  const update = async (patch: Partial<Settings>) => {
    try {
      await services.settings.update(patch);
    } catch (e) {
      setMessage({ text: errorMessage(e), tone: 'danger' });
    }
  };

  const toggleNotifications = async (enabled: boolean) => {
    if (enabled) {
      const granted = await notifications.requestPermission().catch(() => false);
      if (!granted) {
        setMessage({ text: t('settings.notificationsDenied'), tone: 'warning' });
        return;
      }
    }
    setMessage(null);
    await update({ notificationsEnabled: enabled });
    await syncNotifications();
  };

  const deleteAll = () =>
    Alert.alert(t('settings.deleteAllTitle'), t('settings.deleteAllMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.deleteAllConfirm'),
        style: 'destructive',
        onPress: async () => {
          try {
            await notifications.cancelAll().catch(() => undefined);
            await services.privacy.deleteAllData();
            await services.shopping.ensureDefaultList();
            setMessage({ text: t('settings.deleteAllDone'), tone: 'neutral' });
            router.dismissAll();
          } catch (e) {
            setMessage({ text: errorMessage(e), tone: 'danger' });
          }
        },
      },
    ]);

  return (
    <Screen>
      {message ? <Notice message={message.text} tone={message.tone} /> : null}

      <Card>
        <Title>{t('settings.notifications')}</Title>
        <SwitchRow label={t('settings.notificationsEnabled')} value={settings.notificationsEnabled} onChange={(v) => void toggleNotifications(v)} />
        <ChipGroup
          label={t('settings.warnDays')}
          options={WARN_OPTIONS}
          value={String(settings.warnDays)}
          onChange={(v) => void update({ warnDays: Number(v) })}
        />
        <ChipGroup
          label={t('settings.notifyHour')}
          options={HOUR_OPTIONS}
          value={String(settings.notifyHour)}
          onChange={(v) => void update({ notifyHour: Number(v) })}
        />
        <SwitchRow
          label={t('settings.showNames')}
          help={t('settings.showNamesHelp')}
          value={settings.notificationShowNames}
          onChange={(v) => void update({ notificationShowNames: v })}
        />
        {message?.tone === 'warning' ? (
          <Button label={t('scan.openSettings')} variant="secondary" onPress={() => void Linking.openSettings()} />
        ) : null}
      </Card>

      <Card>
        <Title>{t('settings.privacy')}</Title>
        <SwitchRow
          label={t('settings.lookupConsent')}
          help={t('settings.lookupConsentHelp')}
          value={settings.productLookupConsent === 'granted'}
          onChange={(v) => void services.settings.setLookupConsent(v)}
        />
      </Card>

      <Card>
        <Title>{t('settings.recipes')}</Title>
        <SwitchRow label={t('settings.vegetarian')} value={settings.recipeVegetarian} onChange={(v) => void update({ recipeVegetarian: v })} />
        <ChipGroup
          label={t('settings.maxMinutes')}
          options={MINUTES_OPTIONS}
          value={String(settings.recipeMaxMinutes)}
          onChange={(v) => void update({ recipeMaxMinutes: Number(v) })}
        />
      </Card>

      <Card>
        <Title>{t('settings.data')}</Title>
        <Body muted>{t('settings.dataInfo')}</Body>
        <Button label={t('settings.deleteAll')} icon="trash-outline" variant="danger" onPress={deleteAll} />
      </Card>

      <Card>
        <Title>{t('settings.about')}</Title>
        <Body>{t('settings.version', { version: Constants.expoConfig?.version ?? '—' })}</Body>
        <Body muted small>
          {t('settings.offData')}
        </Body>
        <Body muted small>
          {t('settings.legal')}
        </Body>
      </Card>
    </Screen>
  );
}
