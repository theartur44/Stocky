import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { formatLocalDate, toLocalDate } from '../domain/dates';
import { t } from '../i18n';
import { useServiceQuery } from '../state/hooks';
import { useSync } from '../state/SyncProvider';
import { errorText } from '../state/syncErrors';
import type { HouseholdRole, Member } from '../sync/api';
import { Badge, Body, Button, Card, ChipGroup, ErrorView, ListRow, LoadingView, Notice, Screen, TextField, Title } from '../ui/components';
import { spacing } from '../ui/theme';
import { useToast } from '../ui/toast';

const ROLES: HouseholdRole[] = ['owner', 'member', 'viewer'];

/** Hogar compartido: nombre, miembros y sus permisos, salir o borrarlo. */
export default function HouseholdScreen() {
  const sync = useSync();
  const toast = useToast();
  const { status, api } = sync;
  const owner = status.role === 'owner';
  const q = useServiceQuery(async () => (api ? api.members() : []), [api], []);
  const [name, setName] = useState(status.householdName ?? '');
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!status.enabled || !api) return <ErrorView message={t('household.notConnected')} />;
  if (q.loading) return <LoadingView />;
  if (q.error) return <ErrorView message={errorText(q.error)} onRetry={q.reload} />;
  const members = q.data ?? [];

  const run = async (fn: () => Promise<void>, done?: string) => {
    setError(null);
    try {
      await fn();
      if (done) toast(done);
    } catch (e) {
      setError(errorText(e));
    }
  };

  const label = (m: Member) => (m.me ? t('household.you') : (m.email ?? t('household.member')));

  const remove = (m: Member) =>
    Alert.alert(t('household.removeTitle', { name: label(m) }), t('household.removeMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('household.remove'),
        style: 'destructive',
        onPress: () =>
          void run(async () => {
            await api.removeMember(m.userId);
            setEditing(null);
            q.reload();
          }, t('household.removed')),
      },
    ]);

  const leave = () =>
    Alert.alert(t('household.leaveTitle'), t('household.leaveMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('household.leave'),
        style: 'destructive',
        onPress: () =>
          void run(async () => {
            await sync.leaveHousehold();
            router.dismissTo('/settings');
          }, t('household.left')),
      },
    ]);

  const destroy = () =>
    Alert.alert(t('household.deleteTitle', { name: status.householdName ?? '' }), t('household.deleteMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('household.delete'),
        style: 'destructive',
        onPress: () =>
          void run(async () => {
            await sync.deleteHousehold();
            router.dismissTo('/settings');
          }, t('household.deleted')),
      },
    ]);

  return (
    <Screen>
      {error ? <Notice tone="danger" message={error} /> : null}

      <Card>
        <Title>{t('household.name')}</Title>
        {owner ? (
          <>
            <TextField label={t('household.name')} value={name} onChangeText={setName} maxLength={60} />
            <Button
              compact
              variant="secondary"
              icon="checkmark"
              label={t('common.save')}
              disabled={!name.trim() || name.trim() === status.householdName}
              onPress={() => void run(() => sync.renameHousehold(name.trim()), t('household.renamed'))}
            />
          </>
        ) : (
          <Body>{status.householdName}</Body>
        )}
      </Card>

      <Card>
        <Title>{t('household.members', { count: members.length })}</Title>
        {members.map((m) => (
          <View key={m.userId} style={{ gap: spacing.sm }}>
            <ListRow
              icon={m.role === 'owner' ? 'star-outline' : m.role === 'viewer' ? 'eye-outline' : 'person-outline'}
              title={label(m)}
              subtitle={t('household.since', { date: formatLocalDate(toLocalDate(new Date(m.joinedAt))) })}
              right={<Badge label={t(`server.roles.${m.role}`)} tone={m.role === 'owner' ? 'success' : 'neutral'} />}
              onPress={owner && !m.me ? () => setEditing(editing === m.userId ? null : m.userId) : undefined}
            />
            {editing === m.userId ? (
              <View style={{ gap: spacing.sm }}>
                <ChipGroup
                  label={t('household.role')}
                  value={m.role}
                  onChange={(role) =>
                    void run(async () => {
                      await api.setMemberRole(m.userId, role);
                      q.reload();
                    }, t('household.roleChanged'))
                  }
                  options={ROLES.map((r) => ({ value: r, label: t(`server.roles.${r}`) }))}
                />
                <Body muted small>
                  {t(`household.roleHelp.${m.role}`)}
                </Body>
                <Button compact variant="danger" icon="person-remove-outline" label={t('household.remove')} onPress={() => remove(m)} />
              </View>
            ) : null}
          </View>
        ))}
        {owner ? (
          <Body muted small>
            {t('household.ownerHint')}
          </Body>
        ) : null}
      </Card>

      <Card>
        <Body muted small>
          {t('household.leaveHint')}
        </Body>
        <Button variant="secondary" icon="exit-outline" label={t('household.leave')} onPress={leave} />
        {owner ? <Button variant="danger" icon="trash-outline" label={t('household.delete')} onPress={destroy} /> : null}
      </Card>
    </Screen>
  );
}
