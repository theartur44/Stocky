import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { toLocalDate } from '../domain/dates';
import { formatMilli } from '../domain/units';
import { t } from '../i18n';
import { MAX_BACKUP_BYTES, toCsv } from '../services/backupService';
import type { Services } from '../state/AppProvider';
import { placeLabel } from './places';

/**
 * Ficheros de copia y CSV. Se escriben en la caché de la app y se entregan con
 * la hoja de compartir de Android: el usuario elige dónde guardarlos (Drive,
 * descargas, correo…). Stocky no los sube a ningún sitio por su cuenta.
 */
async function shareFile(name: string, content: string, mimeType: string): Promise<void> {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(content);
  try {
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: name });
  } finally {
    // La copia no se queda en el móvil más tiempo del necesario.
    setTimeout(() => {
      try {
        if (file.exists) file.delete();
      } catch {
        // Si ya no existe, nada que hacer.
      }
    }, 60_000);
  }
}

export async function exportBackup(services: Services): Promise<void> {
  const data = await services.backup.exportData();
  await shareFile(`stocky-${toLocalDate(new Date())}.json`, JSON.stringify(data), 'application/json');
}

export async function exportInventoryCsv(services: Services): Promise<void> {
  const [summaries, places] = await Promise.all([services.inventory.listSummaries(), services.places.list()]);
  const placeName = new Map(places.map((p) => [p.id, placeLabel(p)]));
  const rows: (string | number | null)[][] = [
    ['product', 'brand', 'barcode', 'category', 'place', 'quantity', 'unit', 'expiryDate', 'expiryKind', 'openedOn', 'addedOn'].map((k) => t(`backup.csv.${k}`)),
  ];
  for (const s of summaries) {
    for (const l of s.lots) {
      rows.push([
        s.product.name,
        s.product.brand,
        s.product.barcode,
        t(`categories.${s.product.category}`),
        (l.placeId && placeName.get(l.placeId)) || t(`locations.${l.location}`),
        formatMilli(l.quantityMilli),
        t(`units.${l.unit}`),
        l.expiryDate,
        t(`expiryKinds.${l.expiryKind}`),
        l.openedOn,
        l.addedOn,
      ]);
    }
  }
  await shareFile(`stocky-${toLocalDate(new Date())}.csv`, toCsv(rows), 'text/csv');
}

/** Pide un fichero y devuelve su texto (o null si se cancela). */
export async function pickBackupText(): Promise<string | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true, multiple: false });
  if (r.canceled || !r.assets[0]) return null;
  const asset = r.assets[0];
  if (asset.size !== undefined && asset.size > MAX_BACKUP_BYTES) return 'x'.repeat(MAX_BACKUP_BYTES + 1);
  const file = new File(asset.uri);
  try {
    return await file.text();
  } finally {
    try {
      if (file.exists) file.delete();
    } catch {
      // Copia temporal del selector: si no se puede borrar, la limpia el sistema.
    }
  }
}
