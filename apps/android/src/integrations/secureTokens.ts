import * as SecureStore from 'expo-secure-store';

import type { TokenStore, Tokens } from '../sync/api';

/**
 * Tokens de la sesión con el servidor en el almacén seguro de Android
 * (cifrado con una clave del Keystore del sistema). Nunca van a SQLite.
 */
const KEY = 'stocky.session.v1';

export const secureTokenStore: TokenStore = {
  async get(): Promise<Tokens | null> {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    try {
      const t = JSON.parse(raw) as Partial<Tokens>;
      return typeof t.accessToken === 'string' && typeof t.refreshToken === 'string'
        ? { accessToken: t.accessToken, refreshToken: t.refreshToken }
        : null;
    } catch {
      return null;
    }
  },
  async set(tokens: Tokens): Promise<void> {
    await SecureStore.setItemAsync(KEY, JSON.stringify(tokens));
  },
  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(KEY);
  },
};
