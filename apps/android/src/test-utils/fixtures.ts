/// <reference types="node" />
import { randomUUID } from 'node:crypto';

import { migrate } from '../data/migrations';
import type { SerializedDatabase } from '../data/sql';
import { openTestDatabase } from '../data/testing/nodeConnection';
import type { ChangeScope, ServiceContext } from '../services/context';
import { createInventoryService } from '../services/inventoryService';
import { createPlacesService } from '../services/placesService';
import { createBackupService } from '../services/backupService';
import { createHistoryService } from '../services/historyService';
import { createPrivacyService } from '../services/privacyService';
import { createSettingsService } from '../services/settingsService';
import { createShoppingService } from '../services/shoppingService';

/** Reloj controlable para pruebas. */
export function fixedClock(iso: string) {
  let current = new Date(iso);
  return {
    now: () => current,
    set: (next: string) => {
      current = new Date(next);
    },
  };
}

export async function setupServices(nowIso = '2026-10-13T10:00:00') {
  const db: SerializedDatabase = openTestDatabase();
  await migrate(db);
  const clock = fixedClock(nowIso);
  const changes: ChangeScope[] = [];
  const ctx: ServiceContext = {
    db,
    newId: () => randomUUID(),
    clock: clock.now,
    onChange: (s) => changes.push(s),
  };
  return {
    db,
    clock,
    changes,
    inventory: createInventoryService(ctx),
    places: createPlacesService(ctx),
    history: createHistoryService(ctx),
    backup: createBackupService(ctx),
    shopping: createShoppingService(ctx),
    settings: createSettingsService(ctx),
    privacy: createPrivacyService(ctx),
  };
}

export const milk = {
  name: 'Leche entera',
  category: 'dairy_eggs' as const,
  defaultUnit: 'l' as const,
  defaultLocation: 'fridge' as const,
};

export function lot(overrides: Partial<Parameters<ReturnType<typeof createInventoryService>['updateLot']>[1]> = {}) {
  return {
    quantityMilli: 1000,
    unit: 'l' as const,
    location: 'fridge' as const,
    addedOn: '2026-10-13',
    expiryDate: '2026-10-20' as string | null,
    expiryKind: 'use_by' as const,
    ...overrides,
  };
}
