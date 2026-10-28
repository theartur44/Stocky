import { isNewerVersion, parseVersion } from '../domain/version';
import { fetchLatestRelease } from './updates';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const release = (over: Record<string, unknown> = {}) => ({
  tag_name: 'v0.2.0',
  html_url: 'https://github.com/theartur44/Stocky/releases/tag/v0.2.0',
  draft: false,
  prerelease: false,
  assets: [
    {
      name: 'stocky-0.2.0.apk.sha256',
      browser_download_url: 'https://github.com/theartur44/Stocky/releases/download/v0.2.0/stocky-0.2.0.apk.sha256',
    },
    { name: 'stocky-0.2.0.apk', browser_download_url: 'https://github.com/theartur44/Stocky/releases/download/v0.2.0/stocky-0.2.0.apk' },
  ],
  ...over,
});

describe('versiones', () => {
  it('compara números de versión', () => {
    expect(parseVersion('v1.2.3')).toEqual([1, 2, 3]);
    expect(isNewerVersion('v0.2.0', '0.1.0')).toBe(true);
    expect(isNewerVersion('0.10.0', '0.9.9')).toBe(true);
    expect(isNewerVersion('0.1.0', '0.1.0')).toBe(false);
    expect(isNewerVersion('0.0.9', '0.1.0')).toBe(false);
    expect(isNewerVersion('beta', '0.1.0')).toBe(false);
  });
});

describe('aviso de actualizaciones', () => {
  it('devuelve la versión y el APK de la última release', async () => {
    const fetch = jest.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('https://api.github.com/repos/theartur44/Stocky/releases/latest');
      expect(init.credentials).toBe('omit');
      return json(200, release());
    });
    await expect(fetchLatestRelease('theartur44/Stocky', fetch)).resolves.toEqual({
      version: '0.2.0',
      pageUrl: 'https://github.com/theartur44/Stocky/releases/tag/v0.2.0',
      apkUrl: 'https://github.com/theartur44/Stocky/releases/download/v0.2.0/stocky-0.2.0.apk',
    });
  });

  it('ignora releases sin APK, borradores, enlaces ajenos y errores', async () => {
    const f =
      (body: unknown, status = 200) =>
      async () =>
        json(status, body);
    expect(await fetchLatestRelease('theartur44/Stocky', f(release({ assets: [] })))).toBeNull();
    expect(await fetchLatestRelease('theartur44/Stocky', f(release({ prerelease: true })))).toBeNull();
    expect(
      await fetchLatestRelease(
        'theartur44/Stocky',
        f(release({ assets: [{ name: 'x.apk', browser_download_url: 'https://evil.example/x.apk' }] })),
      ),
    ).toBeNull();
    expect(await fetchLatestRelease('theartur44/Stocky', f({ message: 'Not Found' }, 404))).toBeNull();
    expect(
      await fetchLatestRelease('theartur44/Stocky', async () => {
        throw new TypeError('offline');
      }),
    ).toBeNull();
    expect(await fetchLatestRelease('../../evil', f(release()))).toBeNull();
    // Sin caminos «..» que salgan del repositorio.
    const sneaky = 'https://github.com/theartur44/Stocky/releases/download/../../../../evil/x/releases/download/v1/x.apk';
    expect(await fetchLatestRelease('theartur44/Stocky', f(release({ assets: [{ name: 'x.apk', browser_download_url: sneaky }] })))).toBeNull();
  });
});
