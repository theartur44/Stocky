import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { LOCATIONS, type Location } from '../domain/models';
import { PLACE_NAME_MAX, type Place } from '../domain/places';
import { t } from '../i18n';
import { useApp } from '../state/AppProvider';
import { errorMessage, fieldErrors } from '../state/errors';
import { useServiceQuery } from '../state/hooks';
import { Body, Button, Card, ChipGroup, IconButton, ListRow, LoadingView, Screen, TextField, Title } from '../ui/components';
import { PLACE_ICONS, placeLabel, usePlaces } from '../ui/places';
import { spacing } from '../ui/theme';
import { useToast } from '../ui/toast';

interface Draft {
  /** null = sitio nuevo. */
  id: string | null;
  name: string;
  kind: Location;
  moveTo: string | null;
}

/** Sitios de la casa: varias neveras, la despensa del garaje, el trastero… */
export default function PlacesScreen() {
  const { services } = useApp();
  const toast = useToast();
  const { places, loading } = usePlaces();
  const counts = useServiceQuery(() => services.places.lotCounts(), [services], ['inventory']);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  if (loading && places.length === 0) return <LoadingView />;

  const lotsIn = (id: string) => counts.data?.[id] ?? 0;
  const lotsLabel = (id: string) => (lotsIn(id) > 0 ? t('places.lots', { count: lotsIn(id) }) : t('places.empty'));

  const open = (p: Place | null) => {
    setErrors({});
    setDraft(
      p
        ? { id: p.id, name: placeLabel(p), kind: p.kind, moveTo: places.find((x) => x.id !== p.id)?.id ?? null }
        : { id: null, name: '', kind: 'fridge', moveTo: null },
    );
  };

  const run = async (action: () => Promise<void>, done: string) => {
    setBusy(true);
    try {
      await action();
      setDraft(null);
      toast(t(done), { icon: 'checkmark-circle' });
    } catch (e) {
      setErrors(fieldErrors(e));
      if (Object.keys(fieldErrors(e)).length === 0) toast(errorMessage(e), { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const save = (d: Draft) => {
    const original = d.id ? places.find((p) => p.id === d.id) : undefined;
    // Un sitio inicial sin renombrar conserva su nombre original (se traduce al idioma de la app).
    const name = original && placeLabel(original) === d.name ? original.name : d.name;
    void run(
      () => (d.id ? services.places.update(d.id, { name, kind: d.kind }) : services.places.create({ name, kind: d.kind }).then(() => undefined)),
      d.id ? 'places.saved' : 'places.created',
    );
  };

  const remove = (d: Draft) => {
    const place = places.find((p) => p.id === d.id);
    const target = places.find((p) => p.id === d.moveTo);
    if (!place) return;
    if (!target) {
      toast(t('places.lastOne'), { tone: 'danger' });
      return;
    }
    const message =
      lotsIn(place.id) > 0
        ? t('places.deleteMessage', { lots: t('places.lots', { count: lotsIn(place.id) }), target: placeLabel(target) })
        : t('places.deleteEmpty');
    Alert.alert(t('places.deleteTitle', { name: placeLabel(place) }), message, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => void run(() => services.places.remove(place.id, target.id), 'places.deleted') },
    ]);
  };

  return (
    <Screen>
      <Body muted>{t('places.intro')}</Body>

      <Card>
        {places.map((p, i) => (
          <ListRow
            key={p.id}
            icon={PLACE_ICONS[p.kind]}
            title={placeLabel(p)}
            subtitle={`${t(`locations.${p.kind}`)} · ${lotsLabel(p.id)}`}
            onPress={() => open(p)}
            right={
              <View style={styles.order}>
                {i > 0 ? (
                  <IconButton
                    icon="chevron-up"
                    size={20}
                    label={t('places.moveUp', { name: placeLabel(p) })}
                    onPress={() => void services.places.move(p.id, -1).catch((e) => toast(errorMessage(e), { tone: 'danger' }))}
                  />
                ) : null}
                {i < places.length - 1 ? (
                  <IconButton
                    icon="chevron-down"
                    size={20}
                    label={t('places.moveDown', { name: placeLabel(p) })}
                    onPress={() => void services.places.move(p.id, 1).catch((e) => toast(errorMessage(e), { tone: 'danger' }))}
                  />
                ) : null}
              </View>
            }
          />
        ))}
        {draft === null ? <Button label={t('places.add')} icon="add" variant="tonal" onPress={() => open(null)} /> : null}
      </Card>

      {draft ? (
        <Card>
          <Title>{draft.id ? t('places.editTitle') : t('places.newTitle')}</Title>
          <TextField
            label={t('places.name')}
            placeholder={t('places.namePlaceholder')}
            value={draft.name}
            maxLength={PLACE_NAME_MAX}
            onChangeText={(name) => setDraft({ ...draft, name })}
            error={errors.name}
          />
          <ChipGroup
            label={t('places.kind')}
            scroll
            value={draft.kind}
            onChange={(kind) => setDraft({ ...draft, kind })}
            options={LOCATIONS.map((l) => ({ value: l, label: t(`locations.${l}`), icon: PLACE_ICONS[l] }))}
          />
          {draft.id && places.length > 1 ? (
            <ChipGroup
              label={t('places.moveTo')}
              scroll
              value={draft.moveTo}
              onChange={(moveTo) => setDraft({ ...draft, moveTo })}
              options={places.filter((p) => p.id !== draft.id).map((p) => ({ value: p.id, label: placeLabel(p), icon: PLACE_ICONS[p.kind] }))}
            />
          ) : null}
          <View style={styles.actions}>
            <Button label={t('common.save')} icon="checkmark" loading={busy} onPress={() => save(draft)} />
            <Button label={t('common.cancel')} variant="secondary" disabled={busy} onPress={() => setDraft(null)} />
            {draft.id && places.length > 1 ? (
              <Button label={t('common.delete')} icon="trash-outline" variant="danger" disabled={busy} onPress={() => remove(draft)} />
            ) : null}
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  order: { flexDirection: 'row', gap: spacing.xs },
  actions: { gap: spacing.sm },
});
