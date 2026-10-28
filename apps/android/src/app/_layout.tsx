import { useLastNotificationResponse } from 'expo-notifications';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { deviceLocale, t } from '../i18n';
import { AppProvider, useApp } from '../state/AppProvider';
import { SyncProvider } from '../state/SyncProvider';
import { UpdateProvider } from '../state/UpdateProvider';
import { AppearanceProvider, useTheme } from '../ui/theme';
import { LockGate } from '../ui/LockGate';
import { ToastProvider } from '../ui/toast';

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

/**
 * Si una pantalla falla al dibujarse, se muestra este aviso en lugar de cerrar
 * la app (sin él, un dato inesperado podía dejarla cerrándose en cada arranque).
 * Va fuera de los proveedores de tema, así que usa colores fijos.
 */
export function ErrorBoundary({ retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <View style={fallback.wrap} accessibilityRole="alert">
      <Text style={fallback.title}>{t('errors.title')}</Text>
      <Text style={fallback.body}>{t('errors.generic')}</Text>
      <Pressable accessibilityRole="button" onPress={() => void retry()} style={fallback.button}>
        <Text style={fallback.buttonLabel}>{t('common.retry')}</Text>
      </Pressable>
    </View>
  );
}

const fallback = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, backgroundColor: '#F4F7F5' },
  title: { fontSize: 22, fontWeight: '800', color: '#14231B' },
  body: { fontSize: 16, color: '#4A5A51', textAlign: 'center' },
  button: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14, backgroundColor: '#1F8A5B' },
  buttonLabel: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
});

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <SyncProvider>
          <UpdateProvider>
            <ThemedApp />
          </UpdateProvider>
        </SyncProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
}

/** Aplica el color y el modo elegidos en Ajustes a toda la app. */
function ThemedApp() {
  const { settings } = useApp();
  const appearance = useMemo(() => ({ color: settings.themeColor, mode: settings.themeMode }), [settings.themeColor, settings.themeMode]);
  // Al cambiar de idioma se vuelve a montar todo para que cada texto se traduzca de nuevo.
  const locale = settings.language ?? deviceLocale();
  return (
    <AppearanceProvider value={appearance}>
      <Navigation key={locale} />
    </AppearanceProvider>
  );
}

function Navigation() {
  const { colors, dark } = useTheme();
  const base = dark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.background,
      text: colors.text,
      border: colors.border,
    },
  };
  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <ToastProvider>
        <LockGate>
          <NotificationNavigation />
          <Stack
            screenOptions={{
              headerTintColor: colors.primary,
              headerTitleStyle: { color: colors.text, fontWeight: '700' },
              headerStyle: { backgroundColor: colors.background },
              headerShadowVisible: false,
              contentStyle: { backgroundColor: colors.background },
              // Transición tipo iOS en Android: la pantalla nueva entra deslizando y la anterior
              // se desplaza un poco (parallax), más suave que el deslizamiento estándar.
              animation: 'ios_from_right',
              gestureEnabled: true,
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="scan" options={{ headerShown: false, animation: 'slide_from_bottom' }} />
            <Stack.Screen name="expiring" options={{ title: t('expiring.title') }} />
            <Stack.Screen name="settings" options={{ title: t('settings.title') }} />
            <Stack.Screen name="history" options={{ title: t('history.title') }} />
            <Stack.Screen name="places" options={{ title: t('places.title') }} />
            <Stack.Screen name="server" options={{ title: t('server.title') }} />
            <Stack.Screen name="account" options={{ title: t('account.title') }} />
            <Stack.Screen name="language" options={{ headerShown: false, animation: 'fade', gestureEnabled: false }} />
            <Stack.Screen name="welcome" options={{ headerShown: false, animation: 'fade', gestureEnabled: false }} />
            <Stack.Screen name="product/new" options={{ title: t('product.newTitle') }} />
            <Stack.Screen name="product/[id]" options={{ title: '' }} />
            <Stack.Screen name="product/edit/[id]" options={{ title: t('product.editTitle') }} />
            <Stack.Screen name="lot/edit" options={{ title: t('lot.newTitle') }} />
            <Stack.Screen name="recipe/[id]" options={{ title: '' }} />
          </Stack>
        </LockGate>
      </ToastProvider>
    </ThemeProvider>
  );
}
