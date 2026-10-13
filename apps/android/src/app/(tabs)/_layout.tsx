import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs, router } from 'expo-router';
import { StyleSheet, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '../../i18n';
import { IconButton, PressableScale, type IconName } from '../../ui/components';
import { elevation, useTheme } from '../../ui/theme';

function tabIcon(active: IconName, inactive: IconName) {
  return ({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) => (
    <Ionicons name={focused ? active : inactive} size={size} color={color} />
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
        style={[styles.scanButton, elevation(colors, 3), { borderColor: colors.surface }]}
      >
        <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.scanInner}>
          <Ionicons name="barcode-outline" size={30} color="#FFFFFF" />
        </LinearGradient>
      </PressableScale>
    </View>
  );
}

export default function TabsLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const settingsButton = () => (
    <IconButton icon="settings-outline" label={t('settings.title')} onPress={() => router.push('/settings')} />
  );
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 0,
          height: 64 + insets.bottom,
          paddingTop: 6,
          ...elevation(colors, 3),
        },
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
  );
}

const styles = StyleSheet.create({
  scanSlot: { flex: 1, alignItems: 'center' },
  scanButton: { width: 66, height: 66, borderRadius: 33, marginTop: -26, borderWidth: 4 },
  scanInner: { flex: 1, borderRadius: 33, alignItems: 'center', justifyContent: 'center' },
});
