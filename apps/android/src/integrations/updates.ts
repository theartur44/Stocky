import { parseVersion } from '../domain/version';

/**
 * Aviso de nuevas versiones: consulta la última release publicada en GitHub.
 *
 * - Solo se pide `releases/latest` del repositorio de Stocky: la petición no
 *   lleva ningún dato del usuario (GitHub ve, como cualquier servidor, la IP).
 * - Sin cookies ni credenciales; tiempo máximo de 8 s.
 * - Solo se aceptan enlaces de ese mismo repositorio en github.com.
 * - Una release sin APK adjunto (aún compilándose) no cuenta.
 */
export interface ReleaseInfo {
  version: string;
  pageUrl: string;
  apkUrl: string;
}

type FetchFn = (input: string, init: RequestInit) => Promise<Response>;

export const UPDATE_REPO_RE = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;

export async function fetchLatestRelease(repo: string, fetchFn: FetchFn = (i, init) => fetch(i, init)): Promise<ReleaseInfo | null> {
  if (!UPDATE_REPO_RE.test(repo)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetchFn(`https://api.github.com/repos/${repo}/releases/latest`, {
      method: 'GET',
      credentials: 'omit',
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    });
    // 404: no hay releases o el repositorio no es público.
    if (!res.ok) return null;
    const body = (await res.json()) as {
      tag_name?: unknown;
      html_url?: unknown;
      draft?: unknown;
      prerelease?: unknown;
      assets?: { name?: unknown; browser_download_url?: unknown }[];
    };
    if (body.draft || body.prerelease || typeof body.tag_name !== 'string' || !parseVersion(body.tag_name)) return null;
    const base = `https://github.com/${repo}/releases/`;
    // Direcciones exactas del propio repositorio: nada de «..» ni otros caminos.
    const safe = (url: unknown, re: RegExp) => typeof url === 'string' && !url.includes('..') && re.test(url.slice(base.length)) && url.startsWith(base);
    const pageUrl = safe(body.html_url, /^tag\/[\w.-]+$/) ? (body.html_url as string) : null;
    const apk = (body.assets ?? []).find(
      (a) => typeof a.name === 'string' && a.name.endsWith('.apk') && typeof a.browser_download_url === 'string',
    );
    const apkUrl = safe(apk?.browser_download_url, /^download\/[\w.-]+\/[\w.-]+\.apk$/) ? (apk!.browser_download_url as string) : null;
    if (!pageUrl || !apkUrl) return null;
    return { version: body.tag_name.replace(/^v/, ''), pageUrl, apkUrl };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
