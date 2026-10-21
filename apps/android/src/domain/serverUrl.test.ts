import { normalizeServerAddress, validateServerUrl } from './serverUrl';

describe('validateServerUrl', () => {
  it('acepta https y normaliza', () => {
    expect(validateServerUrl(' https://Stocky.Example.org/api/ ')).toEqual({
      ok: true,
      url: 'https://stocky.example.org/api',
      lan: false,
    });
    expect(validateServerUrl('https://10.0.0.5:8443')).toEqual({ ok: true, url: 'https://10.0.0.5:8443', lan: false });
  });

  it('solo permite http dentro de la red local y lo marca', () => {
    expect(validateServerUrl('http://stocky.example.org')).toEqual({ ok: false, error: 'insecure' });
    expect(validateServerUrl('http://8.8.8.8')).toEqual({ ok: false, error: 'insecure' });
    expect(validateServerUrl('http://172.32.0.1')).toEqual({ ok: false, error: 'insecure' });
    expect(validateServerUrl('http://localhost:8000')).toEqual({ ok: true, url: 'http://localhost:8000', lan: true });
    expect(validateServerUrl('http://192.168.1.20:8000')).toEqual({ ok: true, url: 'http://192.168.1.20:8000', lan: true });
    expect(validateServerUrl('http://nas.local').ok).toBe(true);
  });

  it('rechaza credenciales, parámetros y direcciones mal formadas', () => {
    expect(validateServerUrl('https://user:pass@example.org')).toEqual({ ok: false, error: 'credentials' });
    expect(validateServerUrl('https://example.org/?x=1')).toEqual({ ok: false, error: 'query' });
    expect(validateServerUrl('ftp://example.org')).toEqual({ ok: false, error: 'malformed' });
    expect(validateServerUrl('https://exa mple.org')).toEqual({ ok: false, error: 'malformed' });
    expect(validateServerUrl('https://999.1.1.1')).toEqual({ ok: false, error: 'malformed' });
    expect(validateServerUrl('https://example.org:70000')).toEqual({ ok: false, error: 'malformed' });
    expect(validateServerUrl('')).toEqual({ ok: false, error: 'empty' });
  });
});

describe('normalizeServerAddress', () => {
  it('añade el esquema según el tipo de dirección', () => {
    expect(normalizeServerAddress('stocky.midominio.com')).toEqual({ ok: true, url: 'https://stocky.midominio.com', lan: false });
    expect(normalizeServerAddress('192.168.1.50')).toEqual({ ok: true, url: 'http://192.168.1.50', lan: true });
    expect(normalizeServerAddress('192.168.1.50:8080')).toEqual({ ok: true, url: 'http://192.168.1.50:8080', lan: true });
    expect(normalizeServerAddress('https://192.168.1.50')).toEqual({ ok: true, url: 'https://192.168.1.50', lan: false });
    expect(normalizeServerAddress('8.8.8.8')).toEqual({ ok: true, url: 'https://8.8.8.8', lan: false });
  });

  it('no permite forzar http hacia Internet', () => {
    expect(normalizeServerAddress('http://stocky.midominio.com')).toEqual({ ok: false, error: 'insecure' });
  });
});
