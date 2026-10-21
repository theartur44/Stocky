/**
 * Dirección del servidor de sincronización.
 *
 * El usuario puede escribir un dominio («stocky.midominio.com») o una IP de su
 * red («192.168.1.50»), con o sin `http(s)://` y puerto.
 *
 * Reglas:
 *  - Dominios y direcciones públicas: solo `https://` (cifrado obligatorio).
 *  - `http://` únicamente hacia la red local (localhost, 10.x, 172.16-31.x,
 *    192.168.x, *.local): el tráfico no sale de casa, pero la app avisa de que
 *    va sin cifrar.
 *  - Sin usuario/contraseña en la URL, sin parámetros ni fragmentos.
 * Se usa un análisis propio y estricto porque la implementación de `URL` en
 * React Native es parcial.
 */
export type ServerUrlError = 'empty' | 'malformed' | 'insecure' | 'credentials' | 'query';

export type ServerUrlResult =
  | { ok: true; url: string; /** Conexión sin cifrar dentro de la red local. */ lan: boolean }
  | { ok: false; error: ServerUrlError };

const URL_RE = /^(https?):\/\/([^/?#]*)(\/[^?#]*)?([?#].*)?$/i;
const HOST_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i;
const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function isPrivateHost(host: string): boolean {
  if (host === 'localhost' || host.endsWith('.local')) return true;
  const m = IPV4_RE.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

export function validateServerUrl(input: string): ServerUrlResult {
  const raw = input.trim();
  if (!raw) return { ok: false, error: 'empty' };
  const m = URL_RE.exec(raw);
  if (!m) return { ok: false, error: 'malformed' };
  const scheme = m[1]!.toLowerCase();
  const authority = m[2]!;
  const path = (m[3] ?? '').replace(/\/+$/, '');
  if (m[4]) return { ok: false, error: 'query' };
  if (authority.includes('@')) return { ok: false, error: 'credentials' };

  const hm = /^([^:]+)(?::(\d{1,5}))?$/.exec(authority);
  if (!hm) return { ok: false, error: 'malformed' };
  const host = hm[1]!.toLowerCase();
  const port = hm[2] ? Number(hm[2]) : null;
  if (port !== null && (port < 1 || port > 65535)) return { ok: false, error: 'malformed' };
  const ipv4 = IPV4_RE.exec(host);
  if (ipv4 ? ipv4.slice(1).some((o) => Number(o) > 255) : !HOST_RE.test(host)) {
    return { ok: false, error: 'malformed' };
  }

  if (scheme === 'http' && !isPrivateHost(host)) return { ok: false, error: 'insecure' };

  return { ok: true, url: `${scheme}://${host}${port !== null ? `:${port}` : ''}${path}`, lan: scheme === 'http' };
}

/**
 * Acepta lo que escribe el usuario: si falta el esquema, usa `http://` para
 * direcciones de la red local y `https://` para todo lo demás.
 */
export function normalizeServerAddress(input: string): ServerUrlResult {
  const raw = input.trim();
  if (!raw) return { ok: false, error: 'empty' };
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return validateServerUrl(raw);
  const host = raw.split(/[:/]/)[0]!.toLowerCase();
  return validateServerUrl(`${isPrivateHost(host) ? 'http' : 'https'}://${raw}`);
}
