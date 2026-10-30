/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const app = JSON.parse(readFileSync(join(__dirname, '..', 'app.json'), 'utf8')) as {
  expo: { android: { blockedPermissions: string[] } };
};

describe('configuración de Android', () => {
  it('no bloquea permisos que los módulos nativos necesitan al arrancar', () => {
    // expo-screen-capture registra en Android 14+ un aviso de capturas al iniciarse y Android exige
    // este permiso (normal, sin diálogo): si se bloquea, la app se cierra nada más abrirla (0.2.0).
    expect(app.expo.android.blockedPermissions).not.toContain('android.permission.DETECT_SCREEN_CAPTURE');
  });
});
