import * as LocalAuthentication from 'expo-local-authentication';

import { t } from '../i18n';

/** ¿Tiene el móvil huella o, al menos, bloqueo de pantalla (PIN, patrón, contraseña)? */
export async function canLock(): Promise<boolean> {
  try {
    return (await LocalAuthentication.getEnrolledLevelAsync()) !== LocalAuthentication.SecurityLevel.NONE;
  } catch {
    return false;
  }
}

/**
 * Pide la huella (o, si no hay, el bloqueo del móvil). La comprobación la hace
 * Android: la app no ve ni guarda ninguna huella.
 */
export async function authenticate(message = t('security.prompt')): Promise<boolean> {
  try {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: message,
      cancelLabel: t('common.cancel'),
      disableDeviceFallback: false,
      requireConfirmation: false,
    });
    return r.success;
  } catch {
    return false;
  }
}
