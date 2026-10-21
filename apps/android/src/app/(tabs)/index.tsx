import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { toLocalDate } from '../../domain/dates';
import { defaultShoppingAmount } from '../../domain/inventory';
import type { Product } from '../../domain/models';
import { t } from '../../i18n';
import { useApp } from '../../state/AppProvider';
import { errorMessage } from '../../state/errors';
import { useServiceQuery } from '../../state/hooks';
import {
  Backdrop,
  Badge,
  Body,
  Card,
  CategoryAvatar,
  ErrorView,
  FadeIn,
  Glass,
  GradientHeader,
  IconButton,
  ListRow,
  LoadingView,
  PressableScale,
  SectionHeader,
  type IconName,
} from '../../ui/components';
import { expiryLabel, qty } from '../../ui/format';
import { font, radius, spacing, useTheme, withAlpha } from '../../ui/theme';
import { useToast } from '../../ui/toast';

const MAX_ROWS = 5;

function greeting(now: Date): string {
  const h = now.getHours();
  return h < 13 ? t('home.greetingMorning') : h < 20 ? t('home.greetingAfternoon') : t('home.greetingEvening');
}

export default function HomeScreen() {
  const { services, settings } = useApp();
  const { colors, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const q = useServiceQuery(
    async () => {
      const list = await services.shopping.ensureDefaultList();
      const dashboard = await services.inventory.getDashboard(settings.warnDays);
      const items = await services.shopping.items(list.id);
      return { dashboard, listId: list.id, pending: items.filter((i) => !i.transferredAt && !i.checked).length };
    },
    [services, settings.warnDays],
  );

  if (q.loading) return <LoadingView />;
  if (q.error || !q.data) return <ErrorView message={errorMessage(q.error)} onRetry={q.reload} />;
  const { dashboard, pending, listId } = q.data;
  const now = new Date();
  const today = toLocalDate(now);
  const longDate = now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const dateText = longDate.charAt(0).toUpperCase() + longDate.slice(1);

  const addToList = async (product: Product) => {
    const name = product.name;
    try {
      const r = await services.shopping.addItem(listId, { name, productId: product.id, ...defaultShoppingAmount(product) });
      toast(r.merged ? t('product.mergedInShopping') : t('home.addedToList', { name }), { icon: 'cart' });
    } catch (e) {
      toast(errorMessage(e), { tone: 'danger' });
    }
  };

  return (
    <View style={{ flex: 1 }}>
    <Backdrop />
    <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
      <GradientHeader style={[styles.hero, { paddingTop: insets.top + spacing.lg }]}>
        <View style={styles.heroTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroDate}>{dateText}</Text>
            <Text style={styles.heroTitle} accessibilityRole="header">
              {greeting(now)}
            </Text>
          </View>
          <PressableScale accessibilityRole="button" accessibilityLabel={t('settings.title')} onPress={() => router.push('/settings')} style={styles.heroIcon}>
            <Ionicons name="settings-outline" size={22} color="#FFFFFF" />
          </PressableScale>
        </View>

        <View style={styles.stats}>
          <Stat value={dashboard.productsInStock} label={t('home.statInStock')} icon="file-tray-stacked" onPress={() => router.push('/inventory')} />
          <Stat value={dashboard.attentionLots.length} label={t('home.statExpiring')} icon="time" onPress={() => router.push('/expiring')} warn={dashboard.attentionLots.length > 0} />
          <Stat value={pending} label={t('home.statShopping')} icon="cart" onPress={() => router.push('/shopping')} />
        </View>

        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={t('home.scanCta')}
          accessibilityHint={t('home.scanCtaHint')}
          onPress={() => router.push('/scan')}
          style={[styles.cta, { backgroundColor: withAlpha(colors.surfaceSolid, 0.9) }]}
        >
          <View style={[styles.ctaIcon, { backgroundColor: colors.primarySoft }]}>
            <Ionicons name="barcode-outline" size={26} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: dark ? colors.primary : colors.primaryStrong, fontWeight: '800', fontSize: font.large }}>
              {t('home.scanCta')}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: font.small }}>{t('home.scanCtaHint')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={colors.primary} />
        </PressableScale>
      </GradientHeader>

      <View style={styles.body}>
        <View style={styles.quickGrid}>
          <QuickAction icon="create-outline" label={t('home.addProduct')} onPress={() => router.push('/product/new')} />
          <QuickAction icon="calendar-outline" label={t('home.quickExpiry')} onPress={() => router.push('/expiring')} />
          <QuickAction icon="restaurant-outline" label={t('home.recipes')} onPress={() => router.push('/recipes')} />
          <QuickAction icon="cart-outline" label={t('tabs.shopping')} onPress={() => router.push('/shopping')} />
        </View>

        <SectionHeader
          title={t('home.expiringTitle')}
          action={dashboard.attentionLots.length > MAX_ROWS ? <IconButton icon="arrow-forward" label={t('common.seeAll')} onPress={() => router.push('/expiring')} /> : undefined}
        />
        <Card>
          {dashboard.attentionLots.length === 0 ? (
            <View style={styles.okRow}>
              <Ionicons name="checkmark-circle" size={26} color={colors.success} />
              <Body muted>{t('home.expiringEmpty')}</Body>
            </View>
          ) : (
            dashboard.attentionLots.slice(0, MAX_ROWS).map((lot, i) => {
              const e = expiryLabel(lot, today, settings.warnDays);
              return (
                <FadeIn key={lot.id} delay={i * 50}>
                  <ListRow
                    left={<CategoryAvatar category={lot.product.category} size={40} />}
                    title={lot.product.name}
                    subtitle={`${qty(lot.quantityMilli, lot.unit)} · ${t(`locations.${lot.location}`)}`}
                    right={<Badge label={e.label} tone={e.tone} />}
                    onPress={() => router.push({ pathname: '/product/[id]', params: { id: lot.productId } })}
                  />
                </FadeIn>
              );
            })
          )}
        </Card>

        {dashboard.lowStock.length > 0 ? (
          <>
            <SectionHeader title={t('home.lowStockTitle')} />
            <Card>
              {dashboard.lowStock.slice(0, MAX_ROWS).map((s, i) => (
                <FadeIn key={s.product.id} delay={i * 50}>
                  <ListRow
                    left={<CategoryAvatar category={s.product.category} size={40} />}
                    title={s.product.name}
                    subtitle={s.lots.length === 0 ? t('inventory.noStock') : qty(s.totalMilli, s.product.defaultUnit)}
                    onPress={() => router.push({ pathname: '/product/[id]', params: { id: s.product.id } })}
                    right={
                      <IconButton
                        icon="cart-outline"
                        label={t('product.addToShopping')}
                        filled
                        onPress={() => void addToList(s.product)}
                      />
                    }
                  />
                </FadeIn>
              ))}
            </Card>
          </>
        ) : null}
      </View>
    </ScrollView>
    </View>
  );
}

function Stat({ value, label, icon, onPress, warn }: { value: number; label: string; icon: IconName; onPress: () => void; warn?: boolean }) {
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} onPress={onPress} style={styles.stat}>
      <Ionicons name={icon} size={18} color={warn ? '#FFD166' : 'rgba(255,255,255,0.85)'} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

function QuickAction({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.quickWrap}>
      <Glass style={styles.quick}>
      <View style={[styles.quickIcon, { backgroundColor: colors.primarySoft }]}>
        <Ionicons name={icon} size={22} color={colors.primary} />
      </View>
      <Text
        style={{ color: colors.text, fontSize: 12, fontWeight: '600', textAlign: 'center' }}
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {label}
      </Text>
      </Glass>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  hero: { borderTopLeftRadius: 0, borderTopRightRadius: 0, paddingBottom: spacing.xl, gap: spacing.lg },
  heroTop: { flexDirection: 'row', alignItems: 'center' },
  heroDate: { color: 'rgba(255,255,255,0.85)', fontSize: font.small, fontWeight: '600' },
  heroTitle: { color: '#FFFFFF', fontSize: font.display - 4, fontWeight: '800', letterSpacing: -0.5 },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stats: { flexDirection: 'row', gap: spacing.sm },
  stat: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  statValue: { color: '#FFFFFF', fontSize: font.heading, fontWeight: '800' },
  statLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '600' },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    padding: spacing.md,
  },
  ctaIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  body: { padding: spacing.lg, gap: spacing.md },
  quickGrid: { flexDirection: 'row', gap: spacing.sm },
  quickWrap: { flex: 1 },
  quick: { flexGrow: 1, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: 4, alignItems: 'center', gap: spacing.sm },
  quickIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  okRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48 },
});
