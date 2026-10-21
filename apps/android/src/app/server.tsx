import { useState } from 'react';
import { Alert, Share, StyleSheet, Text, View } from 'react-native';

import { normalizeServerAddress } from '../domain/serverUrl';
import { t } from '../i18n';
import { es } from '../i18n/es';
import { ConnectError, useSync } from '../state/SyncProvider';
import { Body, Button, Card, ChipGroup, Notice, Screen, TextField, Title } from '../ui/components';
import { font, spacing, useTheme } from '../ui/theme';

type ErrorKey = keyof typeof es.server.errors;

function errorText(e: unknown): string {
  const code = e instanceof ConnectError ? e.code : 'internal';
  return t(`server.errors.${(code in es.server.errors ? code : 'internal') as ErrorKey}`);
}

function formatTime(iso: string | null): string {
  if (!iso) return t('server.never');
  return new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function ServerScreen() {
  const sync = useSync();
  if (sync.status.enabled) return <Connected />;
  if (sync.session) return <ChooseHousehold />;
  return <ConnectForm />;
}

/** Paso 1: dirección del servidor y cuenta. */
function ConnectForm() {
  const sync = useSync();
  const [address, setAddress] = useState('');
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = address.trim() ? normalizeServerAddress(address) : null;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await sync.connect({ address, email, password, register, registrationCode: code });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card>
        <Body muted>{t('server.intro')}</Body>
      </Card>
      <Card>
        <TextField
          label={t('server.address')}
          hint={t('server.addressHint')}
          placeholder="192.168.1.50"
          value={address}
          onChangeText={setAddress}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          icon="server-outline"
          maxLength={200}
        />
        {parsed?.ok && parsed.lan ? <Notice tone="warning" message={t('server.lanWarning')} /> : null}
        <ChipGroup
          options={[
            { value: 'login', label: t('server.modeLogin') },
            { value: 'register', label: t('server.modeRegister') },
          ]}
          value={register ? 'register' : 'login'}
          onChange={(v) => setRegister(v === 'register')}
        />
        <TextField
          label={t('server.email')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          maxLength={254}
        />
        <TextField
          label={t('server.password')}
          hint={register ? t('server.passwordHint') : undefined}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete={register ? 'new-password' : 'current-password'}
          maxLength={128}
        />
        {register ? (
          <TextField
            label={t('server.registrationCode')}
            hint={t('server.registrationCodeHint')}
            value={code}
            onChangeText={setCode}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={64}
          />
        ) : null}
        {error ? <Notice tone="danger" message={error} /> : null}
        <Button
          label={t('server.connect')}
          icon="link-outline"
          onPress={() => void submit()}
          loading={busy}
          disabled={!address.trim() || !email.trim() || !password}
        />
      </Card>
    </Screen>
  );
}

/** Paso 2: crear un hogar o unirse a uno con un código. */
function ChooseHousehold() {
  const sync = useSync();
  const [name, setName] = useState('Casa');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: 'create' | 'join') => {
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'create') await sync.createHousehold(name.trim());
      else await sync.joinHousehold(code);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <Card>
        <Title>{t('server.householdTitle')}</Title>
        <Body muted>{t('server.householdIntro')}</Body>
        <Body muted small>
          {t('server.mergeNote')}
        </Body>
      </Card>
      <Card>
        <TextField label={t('server.householdName')} value={name} onChangeText={setName} maxLength={60} icon="home-outline" />
        <Button
          label={t('server.createHousehold')}
          icon="add"
          onPress={() => void run('create')}
          loading={busy === 'create'}
          disabled={!name.trim() || busy !== null}
        />
      </Card>
      <Card>
        <TextField
          label={t('server.joinCode')}
          placeholder="ABCD-EFGH-IJKL"
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={32}
          icon="key-outline"
        />
        <Button
          label={t('server.joinHousehold')}
          icon="people-outline"
          variant="secondary"
          onPress={() => void run('join')}
          loading={busy === 'join'}
          disabled={code.trim().length < 6 || busy !== null}
        />
      </Card>
      {error ? <Notice tone="danger" message={error} /> : null}
      <Button label={t('server.cancel')} variant="ghost" onPress={() => void sync.cancelSession()} />
    </Screen>
  );
}

/** Conectado: estado, invitar, sincronizar y desconectar. */
function Connected() {
  const sync = useSync();
  const { colors } = useTheme();
  const { status } = sync;
  const [invite, setInvite] = useState<{ code: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const role = status.role === 'owner' || status.role === 'member' || status.role === 'viewer' ? status.role : 'member';

  const createInvite = async () => {
    setError(null);
    try {
      setInvite(await sync.invite());
    } catch (e) {
      setError(errorText(e));
    }
  };

  const disconnect = () =>
    Alert.alert(t('server.disconnectTitle'), t('server.disconnectMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('server.disconnect'), style: 'destructive', onPress: () => void sync.disconnect() },
    ]);

  const row = (label: string, value: string) => (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[styles.rowLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: colors.text }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );

  return (
    <Screen>
      <Card>
        <Title>{t('server.connectedTitle')}</Title>
        {row(t('server.rowServer'), status.serverUrl ?? '—')}
        {row(t('server.rowAccount'), status.email ?? '—')}
        {row(t('server.rowHousehold'), `${status.householdName ?? '—'} (${t(`server.roles.${role}`)})`)}
        {row(t('server.rowLastSync'), status.syncing ? t('server.syncing') : formatTime(status.lastSyncAt))}
        {row(t('server.rowPending'), String(status.pending))}
        {status.lan ? <Notice tone="warning" message={t('server.lanWarning')} /> : null}
        {status.lastError ? <Notice tone="danger" message={errorText(new ConnectError(status.lastError as never))} /> : null}
        <Button label={t('server.syncNow')} icon="sync" onPress={() => void sync.syncNow()} loading={status.syncing} />
        <Body muted small>
          {t('server.autoSync')}
        </Body>
      </Card>

      {status.role === 'owner' ? (
        <Card>
          <Button label={t('server.invite')} icon="person-add-outline" variant="secondary" onPress={() => void createInvite()} />
          {invite ? (
            <>
              <Text selectable style={[styles.code, { color: colors.primary }]}>
                {invite.code}
              </Text>
              <Body muted small>
                {t('server.inviteHelp')}
              </Body>
              <Button
                label={t('server.share')}
                icon="share-social-outline"
                variant="tonal"
                onPress={() =>
                  void Share.share({ message: t('server.shareMessage', { server: status.serverUrl ?? '', code: invite.code }) })
                }
              />
            </>
          ) : null}
        </Card>
      ) : null}

      {error ? <Notice tone="danger" message={error} /> : null}
      <Button label={t('server.disconnect')} icon="log-out-outline" variant="danger" onPress={disconnect} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 4 },
  rowLabel: { fontSize: font.small, fontWeight: '600', flexShrink: 0 },
  rowValue: { fontSize: font.small, fontWeight: '600', flex: 1, textAlign: 'right' },
  code: { fontSize: font.heading, fontWeight: '800', letterSpacing: 2, textAlign: 'center', paddingVertical: spacing.sm },
});
