import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TextInput, View } from 'react-native';

import { formatLocalDate, parseUserDate, toLocalDate } from '../../domain/dates';
import { EXPIRY_SHORTCUTS, lineQuantity, shortcutDate, type ScanLine, type SessionAction } from '../../domain/scanSession';
import { formatQuantity } from '../../domain/units';
import { t } from '../../i18n';
import { CategoryAvatar, ChipGroup, IconButton, PressableScale, Stepper } from '../components';
import { PlacePicker } from '../places';
import { font, radius, spacing, useTheme } from '../theme';

/** Tarjeta de una línea de la sesión de escaneo, con edición rápida al desplegarla. */
export const ScanLineCard = memo(function ScanLineCard({
  line,
  expanded,
  onToggle,
  dispatch,
  onRetry,
  placeName,
}: {
  line: ScanLine;
  /** Nombre del sitio de la línea (lo resuelve la pantalla, una vez para todas). */
  placeName: string;
  expanded: boolean;
  onToggle: () => void;
  dispatch: (a: SessionAction) => void;
  onRetry: (code: string) => void;
}) {
  const { colors } = useTheme();
  const [dateText, setDateText] = useState(line.expiryDate && !line.expiryEstimated ? formatLocalDate(line.expiryDate) : '');
  const today = toLocalDate(new Date());
  const needsName = line.status !== 'ready' && line.status !== 'loading' && !line.nameEdited;
  const q = lineQuantity(line);

  const statusInfo = (() => {
    switch (line.status) {
      case 'loading':
        return { text: t('quickScan.status.loading'), color: colors.textMuted };
      case 'ready':
        return { text: line.brand ?? t(`categories.${line.category}`), color: colors.textMuted };
      case 'unknown':
        return { text: t('quickScan.status.unknown'), color: colors.warning };
      case 'error':
        return { text: t('quickScan.status.error'), color: colors.danger };
      case 'manual':
        return { text: t('quickScan.status.manual'), color: colors.warning };
    }
  })();

  const expiryLabel = line.expiryDate
    ? `${line.expiryEstimated ? '≈ ' : ''}${formatLocalDate(line.expiryDate)}`
    : t('quickScan.noDate');

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: needsName ? colors.accent : colors.glassBorder }]}>
      <PressableScale
        onPress={onToggle}
        scaleTo={0.98}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${line.name}, ${line.count} ${t('units.unit')}. ${statusInfo.text}`}
        accessibilityHint={t('quickScan.editHint')}
        style={styles.head}
      >
        {line.imageUrl ? (
          <Image source={{ uri: line.imageUrl }} style={styles.image} accessible={false} resizeMode="cover" />
        ) : (
          <CategoryAvatar category={line.category} size={46} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: font.body }} numberOfLines={1}>
            {line.name}
          </Text>
          <View style={styles.metaRow}>
            {line.status === 'loading' ? <ActivityIndicator size="small" color={colors.primary} /> : null}
            <Text style={{ color: statusInfo.color, fontSize: font.small }} numberOfLines={1}>
              {statusInfo.text}
            </Text>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: font.small }} numberOfLines={1}>
            {formatQuantity(q.quantityMilli, q.unit)} · {placeName} · {expiryLabel}
          </Text>
        </View>
        <Stepper
          label={line.name}
          value={`×${line.count}`}
          onDecrement={() => dispatch({ type: 'setCount', code: line.code, count: line.count - 1 })}
          onIncrement={() => dispatch({ type: 'setCount', code: line.code, count: line.count + 1 })}
        />
      </PressableScale>

      {needsName || expanded ? (
        <View style={[styles.nameRow, { backgroundColor: colors.surfaceAlt }]}>
          <Ionicons name="create-outline" size={18} color={colors.textMuted} />
          <TextInput
            key={line.status}
            accessibilityLabel={t('quickScan.nameLabel')}
            placeholder={t('quickScan.namePlaceholder')}
            placeholderTextColor={colors.textMuted}
            defaultValue={line.nameEdited || line.status === 'ready' ? line.name : ''}
            onEndEditing={(e) => dispatch({ type: 'setName', code: line.code, name: e.nativeEvent.text })}
            style={{ flex: 1, color: colors.text, fontSize: font.body, minHeight: 44 }}
            maxLength={120}
            returnKeyType="done"
          />
          {line.status === 'error' ? (
            <IconButton icon="refresh" label={t('common.retry')} onPress={() => onRetry(line.code)} />
          ) : null}
        </View>
      ) : null}

      {expanded ? (
        <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
          <ChipGroup
            label={t('quickScan.expiry')}
            scroll
            value={line.expiryDate === null ? 'none' : null}
            onChange={(k) => {
              if (k === 'none') {
                setDateText('');
                dispatch({ type: 'setExpiry', code: line.code, expiryDate: null });
                return;
              }
              const sc = EXPIRY_SHORTCUTS.find((x) => x.key === k)!;
              setDateText('');
              dispatch({ type: 'setExpiry', code: line.code, expiryDate: shortcutDate(today, sc.days), estimated: true });
            }}
            options={[
              { value: 'none', label: t('quickScan.noDate') },
              ...EXPIRY_SHORTCUTS.map((s) => ({ value: s.key, label: t(`quickScan.shortcut.${s.key}`) })),
            ]}
          />
          <View style={[styles.nameRow, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
            <TextInput
              accessibilityLabel={t('quickScan.exactDate')}
              placeholder={t('quickScan.exactDate')}
              placeholderTextColor={colors.textMuted}
              value={dateText}
              onChangeText={setDateText}
              onEndEditing={() => {
                const d = parseUserDate(dateText);
                if (d) dispatch({ type: 'setExpiry', code: line.code, expiryDate: d, estimated: false });
              }}
              keyboardType="numbers-and-punctuation"
              maxLength={10}
              style={{ flex: 1, color: colors.text, fontSize: font.body, minHeight: 44 }}
            />
          </View>
          <ChipGroup
            scroll
            value={line.expiryKind}
            onChange={(k) => dispatch({ type: 'setExpiryKind', code: line.code, kind: k })}
            options={[
              { value: 'use_by', label: t('expiryKinds.use_by') },
              { value: 'best_before', label: t('expiryKinds.best_before') },
            ]}
          />
          <PlacePicker
            label={t('lot.location')}
            placeId={line.placeId}
            kind={line.location}
            manage={false}
            onChange={(p) => dispatch({ type: 'setLocation', code: line.code, location: p.kind, placeId: p.id })}
          />
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={`${t('common.delete')} ${line.name}`}
            onPress={() => dispatch({ type: 'remove', code: line.code })}
            style={styles.remove}
          >
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
            <Text style={{ color: colors.danger, fontWeight: '600' }}>{t('quickScan.remove')}</Text>
          </PressableScale>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1.5, padding: spacing.md, gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  image: { width: 46, height: 46, borderRadius: 14, backgroundColor: '#fff' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.md, paddingHorizontal: spacing.md },
  remove: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 44 },
});
