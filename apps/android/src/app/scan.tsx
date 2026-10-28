import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions, type BarcodeType } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  Linking,
  PanResponder,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isLookupableBarcode, toCanonicalGtin } from '../domain/barcode';
import {
  emptySession,
  sessionReducer,
  sessionSummary,
  visibleLines,
  type ResolvedInfo,
  type ScanSession,
  type SessionAction,
} from '../domain/scanSession';
import { t } from '../i18n';
import { lookupProduct } from '../integrations/openFoodFacts';
import { useApp } from '../state/AppProvider';
import { errorMessage, logError } from '../state/errors';
import { resolveScan } from '../services/scanService';
import { Button, IconButton, LoadingView, PressableScale } from '../ui/components';
import { usePlaces } from '../ui/places';
import { ScanLineCard } from '../ui/scan/ScanLineCard';
import { elevation, font, radius, spacing, useTheme, withAlpha } from '../ui/theme';
import { useToast } from '../ui/toast';

const BARCODE_TYPES: BarcodeType[] = ['ean13', 'ean8', 'upc_a', 'upc_e', 'itf14', 'code128'];
/** La cámara repite el mismo código muchas veces por segundo. */
const SAME_CODE_COOLDOWN_MS = 2000;
/** Consultas simultáneas a Open Food Facts. */
const MAX_PARALLEL_LOOKUPS = 3;

type Mode = 'inventory' | 'shopping';

const haptic = {
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined),
  light: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined),
  error: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined),
};

/**
 * Escaneo rápido: la cámara queda abierta y cada código se añade al momento a
 * la bandeja inferior. Los datos del producto se buscan en segundo plano, sin
 * bloquear el siguiente escaneo. Al terminar se guarda todo de una vez.
 */
export default function QuickScanScreen() {
  const params = useLocalSearchParams<{ mode?: string; listId?: string }>();
  const { services } = useApp();
  const { colors } = useTheme();
  const { nameOf } = usePlaces();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const navigation = useNavigation();
  const [permission, requestPermission] = useCameraPermissions();

  const [mode, setMode] = useState<Mode>(params.mode === 'shopping' ? 'shopping' : 'inventory');
  const [session, dispatch] = useReducer(sessionReducer, emptySession);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [torch, setTorch] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState('');
  const [saving, setSaving] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const sessionRef = useRef<ScanSession>(session);
  sessionRef.current = session;
  const savedRef = useRef(false);
  const lastScan = useRef<{ code: string; at: number } | null>(null);
  const consentAsked = useRef(false);
  const queue = useRef<string[]>([]);
  const running = useRef(0);
  const flash = useRef(new Animated.Value(0)).current;
  /** Altura animada de la bandeja (se puede arrastrar con el dedo). */
  const sheetAnim = useRef(new Animated.Value(190)).current;
  const sheetTarget = useRef(190);
  const dragStart = useRef(0);
  const scanLine = useRef(new Animated.Value(0)).current;

  // Línea de escaneo animada.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLine, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(scanLine, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scanLine]);

  // Aviso al salir con productos sin guardar.
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (savedRef.current || sessionRef.current.lines.length === 0) return;
        e.preventDefault();
        Alert.alert(t('quickScan.discardTitle'), t('quickScan.discardMessage', { count: sessionRef.current.lines.length }), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('quickScan.discard'), style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
        ]);
      }),
    [navigation],
  );

  const flashOnce = useCallback(() => {
    flash.setValue(1);
    Animated.timing(flash, { toValue: 0, duration: 450, useNativeDriver: true }).start();
  }, [flash]);

  /** Identifica un código en segundo plano y actualiza su línea. */
  const resolveLine = useCallback(
    async (code: string) => {
      const outcome = await resolveScan(code, undefined, {
        inventory: services.inventory,
        settings: services.settings,
        lookup: (c) => lookupProduct(c),
      });
      const act = (a: SessionAction) => dispatch(a);
      switch (outcome.kind) {
        case 'known': {
          const p = outcome.product;
          const info: ResolvedInfo = {
            productId: p.id,
            name: p.name,
            brand: p.brand,
            category: p.category,
            unit: p.defaultUnit,
            packQuantityMilli: p.packQuantityMilli,
            imageUrl: p.imageUrl,
            source: p.source,
            location: p.defaultLocation,
            placeId: p.defaultPlaceId,
          };
          act({ type: 'resolved', code, info });
          return;
        }
        case 'found': {
          const e = outcome.external;
          act({
            type: 'resolved',
            code,
            info: {
              name: e.name,
              brand: e.brand,
              category: e.category,
              unit: e.suggestedUnit,
              packQuantityMilli: e.packQuantityMilli,
              imageUrl: e.imageUrl,
              source: 'openfoodfacts',
            },
          });
          return;
        }
        case 'not_found':
          act({ type: 'failed', code, status: 'unknown' });
          return;
        case 'error':
          act({ type: 'failed', code, status: 'error', errorCode: outcome.error.code });
          return;
        case 'lookup_disabled':
          act({ type: 'failed', code, status: 'manual' });
          return;
        case 'needs_consent':
          act({ type: 'failed', code, status: 'manual' });
          askConsent();
          return;
        default:
          act({ type: 'remove', code });
      }
    },
    // askConsent solo usa refs y servicios, estables durante la pantalla.
    [services],
  );

  const pump = useCallback(() => {
    while (running.current < MAX_PARALLEL_LOOKUPS && queue.current.length > 0) {
      const code = queue.current.shift()!;
      running.current++;
      resolveLine(code)
        .catch((e) => {
          logError('quickScan.resolve', e);
          dispatch({ type: 'failed', code, status: 'error' });
        })
        .finally(() => {
          running.current--;
          pump();
        });
    }
  }, [resolveLine]);

  const enqueue = useCallback(
    (code: string) => {
      queue.current.push(code);
      pump();
    },
    [pump],
  );

  function askConsent() {
    if (consentAsked.current) return;
    consentAsked.current = true;
    Alert.alert(t('scan.consentTitle'), t('scan.consentBody'), [
      {
        text: t('scan.consentDeny'),
        style: 'cancel',
        onPress: () => void services.settings.setLookupConsent(false),
      },
      {
        text: t('scan.consentAccept'),
        onPress: async () => {
          await services.settings.setLookupConsent(true);
          // Se buscan ahora las líneas que esperaban el permiso.
          for (const l of sessionRef.current.lines) {
            if (l.status === 'manual' && !l.nameEdited) {
              dispatch({ type: 'retry', code: l.code });
              enqueue(l.code);
            }
          }
        },
      },
    ]);
  }

  const handleCode = useCallback(
    (raw: string, type?: string) => {
      const code = toCanonicalGtin(raw, type);
      const now = Date.now();
      if (lastScan.current && lastScan.current.code === (code ?? raw) && now - lastScan.current.at < SAME_CODE_COOLDOWN_MS) return;
      lastScan.current = { code: code ?? raw, at: now };

      if (!code) {
        haptic.error();
        toast(t('scan.invalidCode'), { tone: 'warning' });
        return;
      }
      if (!isLookupableBarcode(code) && !sessionRef.current.lines.some((l) => l.code === code)) {
        // Código interno de tienda: puede estar en el catálogo local, si no, se avisa.
        void services.inventory.getProductByBarcode(code).then((p) => {
          if (!p) {
            haptic.error();
            toast(t('scan.internalCode'), { tone: 'warning' });
            return;
          }
          dispatch({ type: 'scanned', code });
          enqueue(code);
          haptic.success();
          flashOnce();
        });
        return;
      }
      const existing = sessionRef.current.lines.find((l) => l.code === code);
      dispatch({ type: 'scanned', code });
      flashOnce();
      if (existing) {
        haptic.light();
        toast(t('quickScan.incremented', { name: existing.name, count: existing.count + 1 }), { tone: 'neutral', icon: 'add-circle' });
      } else {
        haptic.success();
        enqueue(code);
      }
    },
    [enqueue, flashOnce, services, toast],
  );

  const retry = useCallback(
    (code: string) => {
      dispatch({ type: 'retry', code });
      enqueue(code);
    },
    [enqueue],
  );

  const save = async () => {
    const lines = sessionRef.current.lines;
    if (lines.length === 0) return;
    setSaving(true);
    try {
      let n: number;
      if (mode === 'shopping') {
        const listId = params.listId ?? (await services.shopping.ensureDefaultList()).id;
        n = await services.scan.saveToShoppingList(listId, lines);
        toast(t('quickScan.savedShopping', { count: n }));
      } else {
        n = await services.scan.saveToInventory(lines);
        toast(t('quickScan.savedInventory', { count: n }));
      }
      haptic.success();
      savedRef.current = true;
      dispatch({ type: 'clear' });
      router.back();
    } catch (e) {
      haptic.error();
      Alert.alert(t('errors.title'), errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const confirmSave = () => {
    const sum = sessionSummary(sessionRef.current);
    if (sum.loading > 0) {
      Alert.alert(t('quickScan.stillLoadingTitle'), t('quickScan.stillLoading', { count: sum.loading }), [
        { text: t('quickScan.wait'), style: 'cancel' },
        { text: t('quickScan.saveAnyway'), onPress: () => void save() },
      ]);
      return;
    }
    void save();
  };

  const summary = sessionSummary(session);
  const lines = visibleLines(session);
  const manualExtra = manualOpen ? 64 : 0;
  const collapsedHeight =
    lines.length === 0 ? 190 + manualExtra : Math.min(height * 0.5, 230 + manualExtra + lines.length * 84);
  const expandedHeight = height * 0.8;
  const sheetHeight = sheetOpen ? expandedHeight : collapsedHeight;

  // La bandeja se anima hacia su altura objetivo cuando cambia.
  useEffect(() => {
    sheetTarget.current = sheetHeight;
    Animated.spring(sheetAnim, { toValue: sheetHeight, useNativeDriver: false, speed: 16, bounciness: 4 }).start();
  }, [sheetHeight, sheetAnim]);

  // Arrastrar el asa o la cabecera hacia arriba/abajo abre o reduce la bandeja.
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => {
        sheetAnim.stopAnimation((v) => {
          dragStart.current = v;
        });
      },
      onPanResponderMove: (_e, g) => {
        const h = Math.max(150, Math.min(dragStart.current - g.dy, height * 0.9));
        sheetAnim.setValue(h);
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dy < -40 || g.vy < -0.5) setSheetOpen(true);
        else if (g.dy > 40 || g.vy > 0.5) setSheetOpen(false);
        // Si el estado no cambia, vuelve a su altura.
        Animated.spring(sheetAnim, { toValue: sheetTarget.current, useNativeDriver: false, speed: 16, bounciness: 4 }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(sheetAnim, { toValue: sheetTarget.current, useNativeDriver: false }).start();
      },
    }),
  ).current;

  if (!permission) return <LoadingView />;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Stack.Screen options={{ headerShown: false }} />

      {permission.granted ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
          onBarcodeScanned={saving ? undefined : ({ data, type }) => handleCode(data, type)}
        />
      ) : (
        <LinearGradient colors={colors.gradient} style={StyleSheet.absoluteFill} />
      )}

      {/* Destello al leer un código */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#3FBF73', opacity: flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.35] }) }]} />

      {/* Barra superior */}
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <RoundButton icon="close" label={t('common.close')} onPress={() => router.back()} />
        <View style={styles.modeSwitch}>
          {(['inventory', 'shopping'] as const).map((m) => (
            <PressableScale
              key={m}
              accessibilityRole="radio"
              accessibilityState={{ selected: mode === m }}
              accessibilityLabel={t(`quickScan.mode.${m}`)}
              onPress={() => setMode(m)}
              style={[styles.modeBtn, mode === m && { backgroundColor: '#FFFFFF' }]}
            >
              <Ionicons name={m === 'inventory' ? 'home' : 'cart'} size={16} color={mode === m ? colors.primaryStrong : '#FFFFFF'} />
              <Text style={{ color: mode === m ? colors.primaryStrong : '#FFFFFF', fontWeight: '700', fontSize: font.small }}>
                {t(`quickScan.mode.${m}`)}
              </Text>
            </PressableScale>
          ))}
        </View>
        {permission.granted ? (
          <RoundButton icon={torch ? 'flash' : 'flash-off'} label={t('quickScan.torch')} onPress={() => setTorch((v) => !v)} />
        ) : (
          <View style={{ width: 48 }} />
        )}
      </View>

      {/* Visor o permiso */}
      {permission.granted ? (
        <View pointerEvents="none" style={[styles.viewfinderWrap, { top: insets.top + 90, bottom: sheetHeight + 20 }]}>
          <View style={styles.viewfinder}>
            {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
              <View key={c} style={[styles.corner, styles[c]]} />
            ))}
            <Animated.View
              style={[
                styles.laser,
                { transform: [{ translateY: scanLine.interpolate({ inputRange: [0, 1], outputRange: [8, 152] }) }] },
              ]}
            />
          </View>
          <Text style={styles.hint}>{t('quickScan.hint')}</Text>
        </View>
      ) : (
        <View style={[styles.permission, { top: insets.top + 100 }]}>
          <View style={styles.permissionIcon}>
            <Ionicons name="camera" size={42} color="#FFFFFF" />
          </View>
          <Text style={styles.permissionTitle}>{t('scan.permissionTitle')}</Text>
          <Text style={styles.permissionBody}>{t('scan.permissionBody')}</Text>
          {permission.canAskAgain ? (
            <Button label={t('scan.permissionButton')} icon="camera-outline" variant="secondary" onPress={() => void requestPermission()} />
          ) : (
            <Button label={t('scan.openSettings')} variant="secondary" onPress={() => void Linking.openSettings()} />
          )}
        </View>
      )}

      {/* Bandeja inferior */}
      <Animated.View
        style={[
          styles.sheet,
          elevation(colors, 3),
          { height: sheetAnim, backgroundColor: withAlpha(colors.background, 0.94), borderColor: colors.glassBorder, paddingBottom: insets.bottom + spacing.sm },
        ]}
      >
        <View {...pan.panHandlers} style={{ gap: spacing.sm }}>
        <PressableScale
          scaleTo={0.99}
          onPress={() => setSheetOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={sheetOpen ? t('quickScan.collapse') : t('quickScan.expand')}
          style={styles.handleArea}
        >
          <View style={[styles.handle, { backgroundColor: colors.textMuted, opacity: 0.4 }]} />
        </PressableScale>

        <View style={styles.sheetHeader}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: font.large, fontWeight: '800' }}>
              {summary.products === 0 ? t('quickScan.emptyTitle') : t('quickScan.summary', { count: summary.products, units: summary.units })}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: font.small }}>
              {summary.loading > 0
                ? t('quickScan.identifying', { count: summary.loading })
                : summary.needsName > 0
                  ? t('quickScan.needsName', { count: summary.needsName })
                  : summary.products === 0
                    ? t('quickScan.emptyHint')
                    : t('quickScan.tapToEdit')}
            </Text>
          </View>
          <IconButton icon="keypad-outline" label={t('scan.manualEntry')} onPress={() => setManualOpen((v) => !v)} filled />
        </View>
        </View>

        {manualOpen ? (
          <View style={[styles.manualRow, { backgroundColor: colors.surfaceAlt, borderColor: colors.glassBorder }]}>
            <TextInput
              accessibilityLabel={t('scan.manualEntry')}
              placeholder={t('scan.manualPlaceholder')}
              placeholderTextColor={colors.textMuted}
              value={manual}
              onChangeText={setManual}
              keyboardType="number-pad"
              maxLength={20}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => {
                handleCode(manual);
                setManual('');
              }}
              style={{ flex: 1, color: colors.text, fontSize: font.body, minHeight: 48 }}
            />
            <IconButton
              icon="add-circle"
              label={t('common.add')}
              size={30}
              disabled={!manual.trim()}
              onPress={() => {
                handleCode(manual);
                setManual('');
              }}
            />
          </View>
        ) : null}

        <FlatList
          style={{ flex: 1 }}
          data={lines}
          keyExtractor={(l) => l.code}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.md }}
          renderItem={({ item }) => (
            <ScanLineCard
              line={item}
              expanded={expanded === item.code}
              onToggle={() => {
                setExpanded((c) => (c === item.code ? null : item.code));
                if (!sheetOpen) setSheetOpen(true);
              }}
              dispatch={dispatch}
              onRetry={retry}
              placeName={nameOf(item)}
            />
          )}
        />

        {summary.products > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={mode === 'shopping' ? t('quickScan.saveShopping', { count: summary.products }) : t('quickScan.saveInventory', { count: summary.products })}
              accessibilityState={{ busy: saving, disabled: saving }}
              disabled={saving}
              onPress={confirmSave}
            >
              <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.saveBtn}>
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={22} color="#FFFFFF" />
                    <Text style={styles.saveText}>
                      {mode === 'shopping'
                        ? t('quickScan.saveShopping', { count: summary.products })
                        : t('quickScan.saveInventory', { count: summary.products })}
                    </Text>
                  </>
                )}
              </LinearGradient>
            </PressableScale>
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

function RoundButton({ icon, label, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void }) {
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={label} onPress={onPress} scaleTo={0.88} style={styles.round}>
      <Ionicons name={icon} size={24} color="#FFFFFF" />
    </PressableScale>
  );
}

const CORNER = 34;
const styles = StyleSheet.create({
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  round: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeSwitch: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: radius.pill, padding: 4 },
  modeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, minHeight: 40, borderRadius: radius.pill },
  viewfinderWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  viewfinder: { width: 260, height: 170 },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: '#FFFFFF' },
  tl: { top: 0, left: 0, borderTopWidth: 5, borderLeftWidth: 5, borderTopLeftRadius: 18 },
  tr: { top: 0, right: 0, borderTopWidth: 5, borderRightWidth: 5, borderTopRightRadius: 18 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 5, borderLeftWidth: 5, borderBottomLeftRadius: 18 },
  br: { bottom: 0, right: 0, borderBottomWidth: 5, borderRightWidth: 5, borderBottomRightRadius: 18 },
  laser: { position: 'absolute', left: 16, right: 16, height: 3, borderRadius: 2, backgroundColor: '#3FBF73' },
  hint: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: font.body,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  permission: { position: 'absolute', left: spacing.xl, right: spacing.xl, alignItems: 'center', gap: spacing.md },
  permissionIcon: {
    width: 84,
    height: 84,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionTitle: { color: '#FFFFFF', fontSize: font.heading, fontWeight: '800', textAlign: 'center' },
  permissionBody: { color: '#FFFFFF', fontSize: font.body, textAlign: 'center', opacity: 0.92, lineHeight: 22 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  handleArea: { alignItems: 'center', paddingVertical: spacing.sm, minHeight: 28 },
  handle: { width: 44, height: 5, borderRadius: 3 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  manualRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.md, paddingLeft: spacing.md },
  saveBtn: {
    minHeight: 56,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  saveText: { color: '#FFFFFF', fontWeight: '800', fontSize: font.large },
});
