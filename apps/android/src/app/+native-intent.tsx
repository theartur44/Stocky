/**
 * Enlaces que abren la app desde fuera (stocky://…, otra app o una web).
 *
 * Solo se admiten Inicio y «Caduca pronto», y siempre sin parámetros: una web
 * no puede rellenar formularios (nombre, imagen, código…), abrir la cámara bajo
 * el bloqueo con huella ni hacer que la app procese parámetros manipulados. La
 * navegación dentro de la app no pasa por aquí.
 */
const ALLOWED = new Set(['', 'expiring']);

export function externalPath(path: string): string {
  const withoutScheme = path.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const route = withoutScheme.split(/[?#]/)[0]!.replace(/^\/+|\/+$/g, '').toLowerCase();
  return ALLOWED.has(route) ? `/${route}` : '/';
}

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string | null {
  try {
    // En desarrollo, el cliente de Expo usa sus propios enlaces.
    if (__DEV__) return path;
    return externalPath(path);
  } catch {
    return '/';
  }
}
