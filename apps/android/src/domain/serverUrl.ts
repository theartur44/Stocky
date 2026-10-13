/**
 * Validación de la dirección del servidor de sincronización (fase futura).
 *
 * Reglas:
 *  - Solo `https://` en producción.
 *  - `http://` solo en desarrollo y hacia `localhost` o direcciones privadas.
 *  - Sin usuario/contraseña en la URL, sin parámetros ni fragmentos.
 * Se usa un análisis propio y estricto porque la implementación de `URL` en
 * React Native es parcial.
 */
export type ServerUrlError = 'empty' | 'malformed' | 'insecure' | 'credentials' | 'query';

export type ServerUrlResult = { ok: true; url: string } | { ok: false; error: ServerUrlError };

const URL_RE = /^(https?):\/\/([^/?#]*)(\/[^?#]*)?([?#].*)?$/i;
const HOST_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i;
const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function isPrivateHost(host: string): boolean {
  if (host === 'localhost' || host.endsWith('.local')) return true;
  const m = IPV4_RE.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

export function validateServerUrl(input: string, opts: { production: boolean }): ServerUrlResult {
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

  if (scheme === 'http' && (opts.production || !isPrivateHost(host))) return { ok: false, error: 'insecure' };

  return { ok: true, url: `${scheme}://${host}${port !== null ? `:${port}` : ''}${path}` };
}
