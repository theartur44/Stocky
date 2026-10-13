import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs, router } from 'expo-router';
import type { ColorValue } from 'react-native';

import { t } from '../../i18n';
import { IconButton, type IconName } from '../../ui/components';
import { useTheme } from '../../ui/theme';

function tabIcon(name: IconName) {
  return ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} size={size} color={color} />;
}

export default function TabsLayout() {
  const { colors } = useTheme();
  const settingsButton = () => (
    <IconButton icon="settings-outline" label={t('settings.title')} onPress={() => router.push('/settings')} />
  );
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, minHeight: 60 },
        tabBarLabelStyle: { fontSize: 13 },
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { color: colors.text },
        headerRight: settingsButton,
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.home'), tabBarIcon: tabIcon('home-outline') }} />
      <Tabs.Screen name="inventory" options={{ title: t('tabs.inventory'), tabBarIcon: tabIcon('file-tray-stacked-outline') }} />
      <Tabs.Screen name="shopping" options={{ title: t('tabs.shopping'), tabBarIcon: tabIcon('cart-outline') }} />
      <Tabs.Screen name="recipes" options={{ title: t('tabs.recipes'), tabBarIcon: tabIcon('restaurant-outline') }} />
    </Tabs>
  );
}
