import Ionicons from '@expo/vector-icons/Ionicons';
import { BlurTargetView, BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, Tabs, router, useIsFocused } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Animated, Platform, StyleSheet, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '../../i18n';
import { useApp } from '../../state/AppProvider';
import { useSync } from '../../state/SyncProvider';
import { Glass, IconButton, PressableScale, type IconName } from '../../ui/components';
import { TAB_BAR, elevation, radius, useTheme } from '../../ui/theme';

/** Icono de pestaña: al activarse crece con un muelle y aparece una «píldora» detrás. */
function AnimatedTabIcon({ name, color, focused }: { name: IconName; color: ColorValue; focused: boolean }) {
  const { colors } = useTheme();
  const v = useRef(new Animated.Value(focused ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(v, { toValue: focused ? 1 : 0, useNativeDriver: true, speed: 14, bounciness: 9 }).start();
  }, [focused, v]);
  return (
    <View style={styles.iconSlot}>
      <Animated.View
        style={[
          styles.pill,
          {
            backgroundColor: colors.primarySoft,
            opacity: v,
            transform: [{ scaleX: v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
          },
        ]}
      />
      <Animated.View style={{ transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }] }}>
        <Ionicons name={name} size={24} color={color} />
      </Animated.View>
    </View>
  );
}

function tabIcon(active: IconName, inactive: IconName) {
  return ({ color, focused }: { color: ColorValue; size: number; focused: boolean }) => (
    <AnimatedTabIcon name={focused ? active : inactive} color={color} focused={focused} />
  );
}

/**
 * Desenfoque real de lo que pasa por debajo de la barra. En Android el
 * desenfoque necesita saber qué vista copiar: cada pestaña envuelve su
 * contenido en un `BlurTargetView` y, al enfocarse, se lo indica a la barra.
 * Android 12+ lo hace en la GPU; en versiones anteriores sería lento, así que
 * allí la barra es opaca.
 */
const CAN_BLUR = Platform.OS !== 'android' || (typeof Platform.Version === 'number' && Platform.Version >= 31);

type TargetRef = RefObject<View | null>;
const BlurTargetContext = createContext<(ref: TargetRef) => void>(() => undefined);

function TabBlurTarget({ children }: { children: ReactNode }) {
  const ref = useRef<View | null>(null);
  const focused = useIsFocused();
  const register = useContext(BlurTargetContext);
  useEffect(() => {
    if (focused) register(ref);
  }, [focused, register]);
  return (
    <BlurTargetView ref={ref} style={styles.fill}>
      {children}
    </BlurTargetView>
  );
}

function TabBarBackground({ target }: { target: TargetRef | null }) {
  const { colors, dark } = useTheme();
  if (!CAN_BLUR || !target) return <Glass bar style={[StyleSheet.absoluteFill, styles.barShape]} />;
  return (
    <View style={[StyleSheet.absoluteFill, styles.barShape, styles.clip, { borderColor: colors.glassBorder }]}>
      <BlurView
        blurTarget={target}
        blurMethod="dimezisBlurViewSdk31Plus"
        intensity={dark ? 70 : 60}
        tint={dark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      {/* Velo del color de la superficie: mantiene el texto de la barra legible sobre cualquier fondo. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceVeil }]} />
    </View>
  );
}

/** Botón central destacado que abre el escáner rápido. */
function ScanTabButton() {
  const { colors } = useTheme();
  return (
    <View style={styles.scanSlot} pointerEvents="box-none">
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={t('home.scan')}
        accessibilityHint={t('quickScan.tabHint')}
        onPress={() => router.push('/scan')}
        scaleTo={0.9}
        style={[styles.scanButton, elevation(colors, 3), { borderColor: colors.surfaceSolid }]}
      >
        <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.scanInner}>
          <Ionicons name="barcode-outline" size={30} color="#FFFFFF" />
        </LinearGradient>
      </PressableScale>
    </View>
  );
}

export default function TabsLayout() {
  const { settings } = useApp();
  const sync = useSync();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [blurTarget, setBlurTarget] = useState<TargetRef | null>(null);
  const registerTarget = useCallback((ref: TargetRef) => setBlurTarget(ref), []);
  const settingsButton = () => <IconButton icon="settings-outline" label={t('settings.title')} onPress={() => router.push('/settings')} />;
  // Primera apertura: elegir entre invitado o iniciar sesión.
  if (!settings.welcomeDone && !sync.status.enabled) return <Redirect href="/welcome" />;
  return (
    <BlurTargetContext.Provider value={registerTarget}>
      <Tabs
        screenLayout={CAN_BLUR ? ({ children }) => <TabBlurTarget>{children}</TabBlurTarget> : undefined}
        screenListeners={{
          tabPress: () => {
            Haptics.selectionAsync().catch(() => undefined);
          },
        }}
        screenOptions={{
          // Transición suave entre pestañas: desplazamiento corto con fundido.
          animation: 'shift',
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          // Barra flotante de cristal: el contenido se ve pasar por debajo.
          tabBarStyle: {
            position: 'absolute',
            left: 12,
            right: 12,
            bottom: insets.bottom + TAB_BAR.gap,
            height: TAB_BAR.height,
            paddingTop: 8,
            paddingBottom: 6,
            borderRadius: radius.xl + 5,
            borderTopWidth: 0,
            backgroundColor: 'transparent',
            elevation: 0,
            ...elevation(colors, 3),
          },
          tabBarBackground: () => <TabBarBackground target={blurTarget} />,
          tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          headerTitleStyle: { color: colors.text, fontWeight: '800', fontSize: 24 },
          headerRight: settingsButton,
          sceneStyle: { backgroundColor: colors.background },
        }}
      >
        <Tabs.Screen name="index" options={{ title: t('tabs.home'), headerShown: false, tabBarIcon: tabIcon('home', 'home-outline') }} />
        <Tabs.Screen
          name="inventory"
          options={{ title: t('tabs.inventory'), tabBarIcon: tabIcon('file-tray-stacked', 'file-tray-stacked-outline') }}
        />
        <Tabs.Screen
          name="add"
          options={{ title: t('home.scan'), tabBarButton: () => <ScanTabButton />, tabBarAccessibilityLabel: t('home.scan') }}
        />
        <Tabs.Screen name="shopping" options={{ title: t('tabs.shopping'), tabBarIcon: tabIcon('cart', 'cart-outline') }} />
        <Tabs.Screen name="recipes" options={{ title: t('tabs.recipes'), tabBarIcon: tabIcon('restaurant', 'restaurant-outline') }} />
      </Tabs>
    </BlurTargetContext.Provider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  barShape: { borderRadius: radius.xl + 5 },
  clip: { overflow: 'hidden', borderWidth: 1 },
  scanSlot: { flex: 1, alignItems: 'center' },
  iconSlot: { width: 60, height: 30, alignItems: 'center', justifyContent: 'center' },
  pill: { position: 'absolute', width: 60, height: 30, borderRadius: 15 },
  scanButton: { width: 66, height: 66, borderRadius: 33, marginTop: -26, borderWidth: 4 },
  scanInner: { flex: 1, borderRadius: 33, alignItems: 'center', justifyContent: 'center' },
});
