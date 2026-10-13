import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ChangeScope } from '../services/context';
import { useApp } from './AppProvider';
import { logError } from './errors';

export interface QueryState<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => void;
}

/**
 * Carga datos de un servicio y los recarga al volver a la pantalla y cuando
 * cambian los datos de los ámbitos indicados.
 */
export function useServiceQuery<T>(
  fetcher: () => Promise<T>,
  deps: readonly unknown[],
  scopes: ChangeScope[] = ['all'],
): QueryState<T> {
  const { subscribe } = useApp();
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const run = useCallback(fetcher, deps);

  const reload = useCallback(() => {
    const id = ++seq.current;
    setLoading(true);
    run().then(
      (d) => {
        if (id !== seq.current) return; // respuesta antigua: se descarta
        setData(d);
        setError(null);
        setLoading(false);
      },
      (e) => {
        if (id !== seq.current) return;
        logError('query', e);
        setError(e);
        setLoading(false);
      },
    );
  }, [run]);

  useFocusEffect(reload);

  const scopeKey = scopes.join(',');
  useEffect(
    () =>
      subscribe((scope) => {
        if (scope === 'all' || scopeKey.includes(scope) || scopeKey.includes('all')) reload();
      }),
    [subscribe, reload, scopeKey],
  );

  return { data, error, loading: loading && data === undefined, reload };
}

/** Ejecuta una acción mostrando su estado de carga. */
export function useAction<A extends unknown[], R>(action: (...args: A) => Promise<R>) {
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      setBusy(true);
      try {
        return await action(...args);
      } finally {
        setBusy(false);
      }
    },
    [action],
  );
  return [run, busy] as const;
}
