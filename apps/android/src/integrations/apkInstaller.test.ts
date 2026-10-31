const mockDownload = jest.fn();
const mockStartActivity = jest.fn();

jest.mock('expo-file-system', () => {
  class File {
    exists = false;
    uri: string;
    constructor(...parts: string[]) {
      this.uri = parts.join('/');
    }
    delete() {}
    static downloadFileAsync = (...args: unknown[]) => mockDownload(...args);
  }
  return { File, Paths: { cache: 'cache' } };
});
jest.mock('expo-intent-launcher', () => ({ startActivityAsync: (...args: unknown[]) => mockStartActivity(...args) }));

import { Linking } from 'react-native';

import { downloadAndInstall } from './apkInstaller';

const mockOpenURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

const URL = 'https://github.com/theartur44/Stocky/releases/download/v0.2.3/stocky-0.2.3.apk';

describe('instalar una versión nueva', () => {
  beforeEach(() => {
    mockDownload.mockReset();
    mockStartActivity.mockReset();
    mockOpenURL.mockClear();
  });

  it('descarga el APK y abre el instalador con un enlace de solo lectura', async () => {
    mockDownload.mockImplementation(async (_url, _file, opts: { onProgress: (p: { bytesWritten: number; totalBytes: number }) => void }) => {
      opts.onProgress({ bytesWritten: 50, totalBytes: 100 });
      return { contentUri: 'content://app/cache/stocky-update.apk' };
    });
    const progress: (number | null)[] = [];
    expect(await downloadAndInstall(URL, (p) => progress.push(p))).toBe('installer');
    expect(mockDownload.mock.calls[0]![0]).toBe(URL);
    expect(progress).toEqual([0.5, 1]);
    expect(mockStartActivity).toHaveBeenCalledWith('android.intent.action.VIEW', {
      data: 'content://app/cache/stocky-update.apk',
      type: 'application/vnd.android.package-archive',
      flags: 1,
    });
    expect(mockOpenURL).not.toHaveBeenCalled();
  });

  it('si la descarga o el instalador fallan, abre el navegador como antes', async () => {
    mockDownload.mockRejectedValue(new Error('sin conexión'));
    expect(await downloadAndInstall(URL, () => undefined)).toBe('browser');
    expect(mockOpenURL).toHaveBeenCalledWith(URL);
  });
});
