/**
 * Avisos locales de caducidad con expo-notifications.
 *
 * - Solo notificaciones locales: no se usa push ni se registra ningún token.
 * - Canal Android con visibilidad PRIVATE: en una pantalla de bloqueo segura
 *   Android oculta el contenido. Además, por defecto el texto no incluye
 *   nombres de productos (solo el número).
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { PlannedNotification } from '../domain/notificationPlan';
import { joinNames, t } from '../i18n';

export const EXPIRY_CHANNEL_ID = 'expiry';
const MAX_NAMES = 3;

let handlerConfigured = false;

export function configureNotificationHandler(): void {
  if (handlerConfigured) return;
  handlerConfigured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(EXPIRY_CHANNEL_ID, {
    name: t('notifications.channelName'),
    description: t('notifications.channelDescription'),
    importance: Notifications.AndroidImportance.DEFAULT,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    showBadge: false,
  });
}

export async function hasPermission(): Promise<boolean> {
  const status = await Notifications.getPermissionsAsync();
  return status.granted;
}

/** Pide permiso (Android 13+ muestra el diálogo del sistema). */
export async function requestPermission(): Promise<boolean> {
  await ensureChannel(); // en Android el canal debe existir antes de pedir permiso
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const next = await Notifications.requestPermissionsAsync();
  return next.granted;
}

/** Texto de un aviso. Sin nombres salvo que el usuario lo haya permitido. */
export function formatNotification(n: PlannedNotification, showNames: boolean): { title: string; body: string } {
  const title = n.kind === 'day' ? t('notifications.dayTitle') : t('notifications.windowTitle');
  if (!showNames) {
    const key = n.kind === 'day' ? 'notifications.genericDayBody' : 'notifications.genericBody';
    return { title, body: t(key, { count: n.count }) };
  }
  const shown = n.names.slice(0, MAX_NAMES);
  const rest = n.names.length - shown.length;
  const body =
    rest > 0
      ? t('notifications.andMore', { names: shown.join(', '), count: rest })
      : t('notifications.namesBody', { names: joinNames(shown) });
  return { title, body };
}

/**
 * Sustituye todos los avisos programados por los del plan. Se llama al abrir
 * la app y tras cada cambio del inventario o de los ajustes.
 */
export async function replaceScheduled(plan: PlannedNotification[], showNames: boolean): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const n of plan) {
    await Notifications.scheduleNotificationAsync({
      identifier: n.id,
      content: { ...formatNotification(n, showNames), data: { route: '/expiring' } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: n.fireAt,
        channelId: EXPIRY_CHANNEL_ID,
      },
    });
  }
}

export async function cancelAll(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.dismissAllNotificationsAsync();
}
