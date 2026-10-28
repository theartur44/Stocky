import { router } from 'expo-router';
import { usePreventScreenCapture } from 'expo-screen-capture';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Share, StyleSheet, Text, View } from 'react-native';

import { dateLocale, t } from '../i18n';
import { useSync } from '../state/SyncProvider';
import type { Device, Me } from '../sync/api';
import { Badge, Body, Button, Card, ErrorView, IconButton, ListRow, LoadingView, Notice, Screen, TextField, Title } from '../ui/components';
import { font, spacing, useTheme } from '../ui/theme';
import { useToast } from '../ui/toast';
import { errorText } from '../state/syncErrors';

/** Gestión de la cuenta del servidor: verificación en dos pasos, contraseña, sesiones y borrado. */
export default function AccountScreen() {
  // Aquí se ven el secreto de la verificación en dos pasos y los códigos de recuperación.
  usePreventScreenCapture('account');
  const { api } = useSync();
  const [me, setMe] = useState<Me | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!api) return;
    try {
      setError(null);
      const [m, d] = await Promise.all([api.me(), api.devices()]);
      setMe(m);
      setDevices(d);
    } catch (e) {
      setError(errorText(e));
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!api) return <ErrorView message={t('server.errors.unauthorized')} />;
  if (error && !me) return <ErrorView message={error} onRetry={() => void load()} />;
  if (!me) return <LoadingView />;

  return (
    <Screen>
      <Card>
        <Title>{t('account.title')}</Title>
        <ListRow icon="mail-outline" title={me.email} subtitle={t('account.email')} />
      </Card>
      <TwoStep me={me} onChange={() => void load()} />
      <ChangePassword />
      <Sessions devices={devices} onChange={() => void load()} />
      <DeleteAccount mfaEnabled={me.mfaEnabled} />
    </Screen>
  );
}

function TwoStep({ me, onChange }: { me: Me; onChange: () => void }) {
  const { api } = useSync();
  const { colors } = useTheme();
  const toast = useToast();
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const start = () => run(async () => setSetup(await api!.mfaSetup()));
  const confirm = () =>
    run(async () => {
      setCodes(await api!.mfaEnable(code));
      setSetup(null);
      setCode('');
    });
  const disable = () =>
    run(async () => {
      await api!.mfaDisable(password, code);
      setPassword('');
      setCode('');
      toast(t('account.mfaDisabledDone'), { icon: 'shield-outline' });
      onChange();
    });

  const openAuthenticator = async () => {
    try {
      // Solo enlaces de app autenticadora: el servidor no puede hacer abrir otra cosa.
      if (!/^otpauth:\/\/totp\//i.test(setup!.uri)) throw new Error('unexpected uri');
      await Linking.openURL(setup!.uri);
    } catch {
      toast(t('account.mfaNoApp'), { tone: 'warning' });
    }
  };

  if (codes) {
    return (
      <Card>
        <Title>{t('account.recoveryTitle')}</Title>
        <Notice tone="warning" message={t('account.recoveryExplain')} />
        <View style={styles.codes}>
          {codes.map((c) => (
            <Text key={c} selectable style={[styles.code, { color: colors.text }]}>
              {c}
            </Text>
          ))}
        </View>
        <Button
          label={t('account.recoveryShare')}
          icon="share-outline"
          variant="secondary"
          onPress={() => void Share.share({ message: `${t('account.recoveryShareMessage', { email: me.email })}\n${codes.join('\n')}` })}
        />
        <Button
          label={t('account.recoveryDone')}
          icon="checkmark"
          onPress={() => {
            setCodes(null);
            toast(t('account.mfaEnabledDone'), { icon: 'shield-checkmark' });
            onChange();
          }}
        />
      </Card>
    );
  }

  return (
    <Card>
      <View style={styles.titleRow}>
        <Title>{t('account.mfa')}</Title>
        <Badge label={me.mfaEnabled ? t('account.mfaOn') : t('account.mfaOff')} tone={me.mfaEnabled ? 'success' : 'neutral'} />
      </View>
      <Body muted small>
        {t('account.mfaExplain')}
      </Body>

      {!me.mfaEnabled && !setup ? (
        <Button label={t('account.mfaStart')} icon="shield-checkmark-outline" onPress={() => void start()} loading={busy} />
      ) : null}

      {setup ? (
        <>
          <Body>{t('account.mfaStep1')}</Body>
          <Text selectable style={[styles.secret, { color: colors.primary }]}>
            {setup.secret.replace(/(.{4})/g, '$1 ').trim()}
          </Text>
          <Button label={t('account.mfaOpenApp')} icon="open-outline" variant="secondary" onPress={() => void openAuthenticator()} />
          <Body>{t('account.mfaStep2')}</Body>
          <TextField
            label={t('account.codeField')}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            maxLength={8}
            placeholder="123456"
          />
          <Button
            label={t('account.mfaConfirm')}
            icon="checkmark"
            onPress={() => void confirm()}
            loading={busy}
            disabled={code.trim().length < 6}
          />
        </>
      ) : null}

      {me.mfaEnabled ? (
        <>
          <Body muted small>
            {t('account.mfaDisableHelp')}
          </Body>
          <TextField
            label={t('server.password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            maxLength={128}
          />
          <TextField label={t('account.codeField')} value={code} onChangeText={setCode} autoCapitalize="characters" maxLength={20} />
          <Button
            label={t('account.mfaDisable')}
            icon="shield-outline"
            variant="secondary"
            onPress={() => void disable()}
            loading={busy}
            disabled={!password || code.trim().length < 6}
          />
        </>
      ) : null}
      {error ? <Notice tone="danger" message={error} /> : null}
    </Card>
  );
}

function ChangePassword() {
  const { api } = useSync();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (next !== repeat) {
      setError(t('account.passwordMismatch'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api!.changePassword(current, next);
      setCurrent('');
      setNext('');
      setRepeat('');
      toast(t('account.passwordChanged'), { icon: 'key' });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Title>{t('account.password')}</Title>
      <TextField
        label={t('account.currentPassword')}
        value={current}
        onChangeText={setCurrent}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        maxLength={128}
      />
      <TextField
        label={t('account.newPassword')}
        hint={t('account.newPasswordHint')}
        value={next}
        onChangeText={setNext}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        maxLength={128}
      />
      <TextField
        label={t('account.repeatPassword')}
        value={repeat}
        onChangeText={setRepeat}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        maxLength={128}
      />
      {error ? <Notice tone="danger" message={error} /> : null}
      <Button
        label={t('account.passwordSave')}
        icon="key-outline"
        variant="secondary"
        onPress={() => void save()}
        loading={busy}
        disabled={!current || next.length < 12}
      />
    </Card>
  );
}

function Sessions({ devices, onChange }: { devices: Device[]; onChange: () => void }) {
  const { api } = useSync();
  const toast = useToast();
  const date = (iso: string) =>
    new Date(iso).toLocaleString(dateLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const revoke = async (d: Device) => {
    try {
      await api!.revokeDevice(d.id);
      toast(t('account.revoked'), { icon: 'log-out' });
      onChange();
    } catch (e) {
      toast(errorText(e), { tone: 'danger' });
    }
  };
  return (
    <Card>
      <Title>{t('account.devices')}</Title>
      <Body muted small>
        {t('account.devicesHelp')}
      </Body>
      {devices.map((d) => (
        <ListRow
          key={d.id}
          icon="phone-portrait-outline"
          title={d.name}
          subtitle={t('account.lastUsed', { date: date(d.lastUsedAt) })}
          right={
            d.current ? (
              <Badge label={t('account.thisDevice')} tone="success" />
            ) : (
              <IconButton icon="log-out-outline" label={t('account.revoke', { name: d.name })} onPress={() => void revoke(d)} />
            )
          }
        />
      ))}
    </Card>
  );
}

function DeleteAccount({ mfaEnabled }: { mfaEnabled: boolean }) {
  const sync = useSync();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const remove = () =>
    Alert.alert(t('account.deleteTitle'), t('account.deleteSure'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('account.deleteConfirm'),
        style: 'destructive',
        onPress: async () => {
          try {
            await sync.api!.deleteAccount(password, mfaEnabled ? code : null);
            await sync.forgetAccount();
            toast(t('account.deleted'), { icon: 'trash' });
            router.dismissTo('/settings');
          } catch (e) {
            setError(errorText(e));
          }
        },
      },
    ]);

  return (
    <Card>
      <Title>{t('account.deleteTitle')}</Title>
      <Body muted small>
        {t('account.deleteHelp')}
      </Body>
      <TextField
        label={t('server.password')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        maxLength={128}
      />
      {mfaEnabled ? (
        <TextField label={t('account.codeField')} value={code} onChangeText={setCode} autoCapitalize="characters" maxLength={20} />
      ) : null}
      {error ? <Notice tone="danger" message={error} /> : null}
      <Button
        label={t('account.deleteConfirm')}
        icon="trash-outline"
        variant="danger"
        onPress={remove}
        disabled={!password || (mfaEnabled && code.trim().length < 6)}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  secret: {
    fontSize: font.large,
    fontWeight: '800',
    letterSpacing: 1.5,
    textAlign: 'center',
    fontFamily: 'monospace',
    paddingVertical: spacing.sm,
  },
  codes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' },
  code: { width: '45%', textAlign: 'center', fontSize: font.body, fontWeight: '700', fontFamily: 'monospace', paddingVertical: 4 },
});
