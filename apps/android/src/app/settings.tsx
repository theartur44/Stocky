import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';

import { THEME_COLORS, THEME_MODES, type ThemeColor } from '../domain/appearance';
import { isNewerVersion } from '../domain/version';
import { deviceLocale, LOCALE_LIST, LOCALE_NAMES, t } from '../i18n';
import { authenticate, canLock } from '../integrations/biometrics';
import * as notifications from '../integrations/notifications';
import { useApp } from '../state/AppProvider';
import { useSync } from '../state/SyncProvider';
import { CURRENT_VERSION, REPO_URL, useUpdates } from '../state/UpdateProvider';
import { useToast } from '../ui/toast';
import { errorMessage } from '../state/errors';
import type { Settings } from '../services/settingsService';
import { Body, Button, Card, ChipGroup, Notice, PressableScale, Screen, SwitchRow, Title } from '../ui/components';
import { ACCENTS, font, spacing, useTheme } from '../ui/theme';

const WARN_OPTIONS = [0, 1, 2, 3, 5, 7].map((d) => ({ value: String(d), label: String(d) }));
const HOUR_OPTIONS = [8, 9, 12, 18, 20].map((h) => ({ value: String(h), label: `${h}:00` }));


/** Muestras de color: círculos con el degradado de cada tema; el elegido lleva un aro y una marca. */
function ColorPicker({ value, onChange }: { value: ThemeColor; onChange: (c: ThemeColor) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6 }} accessibilityRole="radiogroup" accessibilityLabel={t('settings.themeColor')}>
      <Text style={[pickerStyles.label, { color: colors.textMuted }]}>{t('settings.themeColor')}</Text>
      <View style={pickerStyles.row}>
        {THEME_COLORS.map((c) => {
          const selected = c === value;
          return (
            <PressableScale
              key={c}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={t(`settings.themeColors.${c}`)}
              onPress={() => onChange(c)}
              scaleTo={0.85}
              style={pickerStyles.item}
            >
              <View style={[pickerStyles.ring, { borderColor: selected ? ACCENTS[c].swatch : 'transparent' }]}>
                <View style={[pickerStyles.swatch, { backgroundColor: ACCENTS[c].swatch }]}>
                  {selected ? <Ionicons name="checkmark" size={22} color="#FFFFFF" /> : null}
                </View>
              </View>
              <Text
                style={{ color: selected ? colors.text : colors.textMuted, fontSize: 11, fontWeight: selected ? '700' : '500' }}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                {t(`settings.themeColors.${c}`)}
              </Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

const pickerStyles = StyleSheet.create({
  label: { fontSize: font.small, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.md },
  item: { alignItems: 'center', gap: 4, width: 52 },
  ring: { width: 48, height: 48, borderRadius: 24, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});

const MINUTES_OPTIONS = [0, 20, 30, 45, 60].map((m) => ({
  value: String(m),
  label: m === 0 ? '∞' : `${m}`,
}));

export default function SettingsScreen() {
  const { services, settings, syncNotifications } = useApp();
  const sync = useSync();
  const updates = useUpdates();
  const toast = useToast();

  const checkUpdates = async () => {
    const latest = await updates.checkNow();
    if (!latest) toast(t('updates.unavailable'), { tone: 'warning' });
    else if (isNewerVersion(latest.version, CURRENT_VERSION)) toast(t('updates.found', { version: latest.version }), { icon: 'arrow-down-circle' });
    else toast(t('updates.upToDate'), { icon: 'checkmark-circle' });
  };
  const [lockAvailable, setLockAvailable] = useState(true);
  useEffect(() => {
    void canLock().then(setLockAvailable);
  }, []);

  const toggleBiometric = async (on: boolean) => {
    // Antes de activarlo se comprueba que funciona, para no quedarse fuera.
    if (on && !(await authenticate(t('security.confirmEnable')))) return;
    await update({ biometricLock: on });
  };
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
            // Antes de borrar, este móvil se desconecta del hogar (los datos del servidor no se tocan)
            // y se borran las credenciales guardadas, aunque no haya una sesión visible.
            await sync.disconnect().catch(() => undefined);
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
        <Title>{t('language.title')}</Title>
        <ChipGroup
          scroll
          options={LOCALE_LIST.map((l) => ({ value: l, label: LOCALE_NAMES[l] }))}
          value={settings.language ?? deviceLocale()}
          onChange={(language) => void update({ language })}
        />
      </Card>

      <Card>
        <Title>{t('settings.appearance')}</Title>
        <ColorPicker value={settings.themeColor} onChange={(c) => void update({ themeColor: c })} />
        <ChipGroup
          label={t('settings.themeMode')}
          options={THEME_MODES.map((m) => ({ value: m, label: t(`settings.themeModes.${m}`) }))}
          value={settings.themeMode}
          onChange={(m) => void update({ themeMode: m })}
        />
      </Card>

      <Card>
        <Title>{t('places.title')}</Title>
        <Body muted>{t('places.settingsHint')}</Body>
        <Button label={t('places.manage')} icon="file-tray-stacked-outline" variant="secondary" onPress={() => router.push('/places')} />
      </Card>

      <Card>
        <Title>{t('server.settingsCard')}</Title>
        <Body muted>
          {sync.status.enabled ? t('server.settingsOn', { household: sync.status.householdName ?? '' }) : t('server.settingsOff')}
        </Body>
        <Button
          label={sync.status.enabled ? t('server.manage') : t('server.configure')}
          icon="server-outline"
          variant="secondary"
          onPress={() => router.push('/server')}
        />
      </Card>

      <Card>
        <Title>{t('security.title')}</Title>
        <SwitchRow
          label={t('security.biometric')}
          help={lockAvailable ? t('security.biometricHelp') : t('security.biometricUnavailable')}
          value={settings.biometricLock}
          disabled={!lockAvailable && !settings.biometricLock}
          onChange={(v) => void toggleBiometric(v)}
        />
      </Card>

      <Card>
        <Title>{t('settings.notifications')}</Title>
        <SwitchRow
          label={t('settings.notificationsEnabled')}
          value={settings.notificationsEnabled}
          onChange={(v) => void toggleNotifications(v)}
        />
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
        <SwitchRow
          label={t('settings.vegetarian')}
          value={settings.recipeVegetarian}
          onChange={(v) => void update({ recipeVegetarian: v })}
        />
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
        {updates.available ? (
          <Button
            label={t('updates.bannerTitle', { version: updates.available.version })}
            icon="download-outline"
            onPress={() => void Linking.openURL(updates.available!.apkUrl)}
          />
        ) : null}
        <SwitchRow
          label={t('updates.setting')}
          help={t('updates.settingHelp')}
          value={settings.updateCheck}
          onChange={(v) => void update({ updateCheck: v })}
        />
        <Button
          label={t('updates.checkNow')}
          icon="refresh"
          variant="secondary"
          compact
          onPress={() => void checkUpdates()}
          loading={updates.checking}
        />
        <Body muted small>
          {t('settings.license')}
        </Body>
        {REPO_URL ? (
          <Button
            label={t('settings.github')}
            icon="logo-github"
            variant="secondary"
            compact
            accessibilityHint={t('settings.githubHint')}
            onPress={() => void Linking.openURL(REPO_URL!)}
          />
        ) : null}
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
