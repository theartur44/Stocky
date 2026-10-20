import { validateServerUrl } from './serverUrl';

const prod = { production: true };
const dev = { production: false };

describe('validación de la dirección del servidor', () => {
  it('acepta HTTPS y normaliza', () => {
    expect(validateServerUrl(' https://Stocky.Example.org/api/ ', prod)).toEqual({
      ok: true,
      url: 'https://stocky.example.org/api',
    });
    expect(validateServerUrl('https://10.0.0.5:8443', prod)).toEqual({ ok: true, url: 'https://10.0.0.5:8443' });
  });

  it('rechaza HTTP en producción y hacia Internet', () => {
    expect(validateServerUrl('http://stocky.example.org', prod)).toEqual({ ok: false, error: 'insecure' });
    expect(validateServerUrl('http://localhost:8000', prod)).toEqual({ ok: false, error: 'insecure' });
    expect(validateServerUrl('http://stocky.example.org', dev)).toEqual({ ok: false, error: 'insecure' });
  });

  it('permite HTTP solo a redes locales en desarrollo', () => {
    expect(validateServerUrl('http://localhost:8000', dev).ok).toBe(true);
    expect(validateServerUrl('http://192.168.1.20:8000', dev).ok).toBe(true);
    expect(validateServerUrl('http://172.32.0.1', dev)).toEqual({ ok: false, error: 'insecure' });
  });

  it('rechaza credenciales, parámetros y direcciones mal formadas', () => {
    expect(validateServerUrl('https://user:pass@example.org', prod)).toEqual({ ok: false, error: 'credentials' });
    expect(validateServerUrl('https://example.org/?x=1', prod)).toEqual({ ok: false, error: 'query' });
    expect(validateServerUrl('ftp://example.org', prod)).toEqual({ ok: false, error: 'malformed' });
    expect(validateServerUrl('https://exa mple.org', prod)).toEqual({ ok: false, error: 'malformed' });
    expect(validateServerUrl('https://999.1.1.1', prod)).toEqual({ ok: false, error: 'malformed' });
    expect(validateServerUrl('https://example.org:70000', prod)).toEqual({ ok: false, error: 'malformed' });
    expect(validateServerUrl('', prod)).toEqual({ ok: false, error: 'empty' });
  });
});
