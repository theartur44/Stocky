import { useLastNotificationResponse } from 'expo-notifications';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { t } from '../i18n';
import { AppProvider } from '../state/AppProvider';
import { useTheme } from '../ui/theme';

/** Rutas a las que puede llevar una notificación (lista cerrada). */
const NOTIFICATION_ROUTES = new Set(['/expiring']);

function NotificationNavigation() {
  const response = useLastNotificationResponse();
  useEffect(() => {
    const route = response?.notification.request.content.data?.route;
    if (typeof route === 'string' && NOTIFICATION_ROUTES.has(route)) router.push('/expiring');
  }, [response]);
  return null;
}

export default function RootLayout() {
  const { colors, dark } = useTheme();
  const base = dark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
    },
  };
  return (
    <SafeAreaProvider>
      <ThemeProvider value={navTheme}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <AppProvider>
          <NotificationNavigation />
          <Stack screenOptions={{ headerTintColor: colors.primary, headerTitleStyle: { color: colors.text } }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="scan" options={{ title: t('scan.title') }} />
            <Stack.Screen name="expiring" options={{ title: t('expiring.title') }} />
            <Stack.Screen name="settings" options={{ title: t('settings.title') }} />
            <Stack.Screen name="product/new" options={{ title: t('product.newTitle') }} />
            <Stack.Screen name="product/[id]" options={{ title: '' }} />
            <Stack.Screen name="product/edit/[id]" options={{ title: t('product.editTitle') }} />
            <Stack.Screen name="lot/edit" options={{ title: t('lot.newTitle') }} />
            <Stack.Screen name="recipe/[id]" options={{ title: '' }} />
          </Stack>
        </AppProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
