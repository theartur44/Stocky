/**
 * Descarga el APK de una versión nueva y abre el instalador de Android.
 *
 * Antes se abría la descarga en el navegador, y en algunos móviles (Xiaomi…)
 * se quedaba al 100 % sin abrir el instalador. Ahora la app lo descarga en su
 * caché y se lo pasa al instalador con un enlace temporal de solo lectura.
 *
 * Seguridad: la dirección ya viene validada (solo descargas de las releases del
 * propio repositorio, ver `updates.ts`), va por HTTPS y Android solo instala la
 * actualización si está firmada con la misma clave que la app instalada.
 * Si algo falla, se recurre al navegador como antes.
 */
import { File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { Linking } from 'react-native';

const FLAG_GRANT_READ_URI_PERMISSION = 1;
const APK_MIME = 'application/vnd.android.package-archive';

export type InstallOutcome = 'installer' | 'browser';

export async function downloadAndInstall(apkUrl: string, onProgress: (fraction: number | null) => void): Promise<InstallOutcome> {
  try {
    const file = new File(Paths.cache, 'stocky-update.apk');
    if (file.exists) file.delete();
    const apk = await File.downloadFileAsync(apkUrl, file, {
      idempotent: true,
      onProgress: ({ bytesWritten, totalBytes }) => onProgress(totalBytes > 0 ? Math.min(1, bytesWritten / totalBytes) : null),
    });
    onProgress(1);
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: apk.contentUri,
      type: APK_MIME,
      flags: FLAG_GRANT_READ_URI_PERMISSION,
    });
    return 'installer';
  } catch {
    await Linking.openURL(apkUrl);
    return 'browser';
  }
}
