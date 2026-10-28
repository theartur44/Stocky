import { router } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import type { Location } from '../domain/models';
import { DEFAULT_PLACES, firstPlaceOfKind, type Place } from '../domain/places';
import { t } from '../i18n';
import { useApp } from '../state/AppProvider';
import { useServiceQuery } from '../state/hooks';
import { Button, ChipGroup, type IconName } from './components';

export const PLACE_ICONS: Record<Location, IconName> = {
  fridge: 'thermometer-outline',
  freezer: 'snow-outline',
  pantry: 'file-tray-outline',
  other: 'cube-outline',
};

/**
 * Nombre visible de un sitio. Los cuatro iniciales, mientras el usuario no los
 * renombre, se muestran en el idioma de la app.
 */
export function placeLabel(place: Pick<Place, 'id' | 'name' | 'kind'>): string {
  const original = DEFAULT_PLACES.find((d) => d.id === place.id);
  return original && original.name === place.name ? t(`locations.${place.kind}`) : place.name;
}

/** Sitios del usuario (se recargan al cambiar el inventario). */
export function usePlaces() {
  const { services } = useApp();
  const q = useServiceQuery(() => services.places.list(), [services], ['inventory']);
  return useMemo(() => {
    const places = q.data ?? [];
    const byId = new Map(places.map((p) => [p.id, p]));
    return {
      places,
      loading: q.loading,
      /** Nombre del sitio de un lote (o del tipo, si el sitio ya no existe). */
      nameOf: (item: { placeId: string | null; location: Location }) => {
        const p = item.placeId ? byId.get(item.placeId) : undefined;
        return p ? placeLabel(p) : t(`locations.${item.location}`);
      },
      resolve: (placeId: string | null, kind: Location): Place | null =>
        (placeId ? byId.get(placeId) : undefined) ?? firstPlaceOfKind(places, kind),
    };
  }, [q.data, q.loading]);
}

/** Elegir sitio: una fila de chips con los sitios del usuario y un acceso para gestionarlos. */
export function PlacePicker({
  label,
  placeId,
  kind,
  onChange,
  manage = true,
}: {
  label: string;
  placeId: string | null;
  kind: Location;
  onChange: (place: Place) => void;
  manage?: boolean;
}) {
  const { places, resolve } = usePlaces();
  const selected = resolve(placeId, kind);
  return (
    <View>
      <ChipGroup
        scroll
        label={label}
        options={places.map((p) => ({ value: p.id, label: placeLabel(p), icon: PLACE_ICONS[p.kind] }))}
        value={selected?.id ?? null}
        onChange={(id) => {
          const p = places.find((x) => x.id === id);
          if (p) onChange(p);
        }}
      />
      {manage ? <Button compact variant="ghost" icon="create-outline" label={t('places.manage')} onPress={() => router.push('/places')} /> : null}
    </View>
  );
}
