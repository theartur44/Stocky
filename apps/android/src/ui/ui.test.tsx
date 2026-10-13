/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { es } from '../i18n/es';
import { t } from '../i18n';
import { Button, ChipGroup, SwitchRow, TextField } from './components';

function render(el: React.ReactElement): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = create(el);
  });
  return r;
}

describe('accesibilidad de componentes', () => {
  it('los botones exponen rol, etiqueta y estado', () => {
    const r = render(<Button label="Guardar" onPress={() => undefined} disabled />);
    const btn = r.root.findAll((n) => n.props.accessibilityRole === 'button')[0]!;
    expect(btn.props.accessibilityLabel).toBe('Guardar');
    expect(btn.props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('los chips se comportan como un grupo de radio con selección anunciada', () => {
    const onChange = jest.fn();
    const r = render(
      <ChipGroup
        label="Unidad"
        options={[
          { value: 'g', label: 'g' },
          { value: 'kg', label: 'kg' },
        ]}
        value="kg"
        onChange={onChange}
      />,
    );
    const radios = r.root.findAll((n) => n.props.accessibilityRole === 'radio' && n.props.onPress);
    expect(radios.map((n) => n.props.accessibilityState.selected)).toEqual([false, true]);
    act(() => radios[0]!.props.onPress());
    expect(onChange).toHaveBeenCalledWith('g');
  });

  it('los campos de texto tienen etiqueta y muestran el error', () => {
    const r = render(<TextField label="Nombre" value="" error="Campo obligatorio" />);
    const input = r.root.findAll((n) => n.props.accessibilityLabel === 'Nombre' && n.props.placeholderTextColor);
    expect(input.length).toBeGreaterThan(0);
    expect(JSON.stringify(r.toJSON())).toContain('Campo obligatorio');
  });

  it('los interruptores tienen etiqueta', () => {
    const r = render(<SwitchRow label="Activar avisos" value={false} onChange={() => undefined} />);
    expect(r.root.findAll((n) => n.props.accessibilityLabel === 'Activar avisos').length).toBeGreaterThan(0);
  });
});

describe('textos', () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) return sourceFiles(p);
      return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
    });
  }

  it('todas las claves literales usadas existen en español', () => {
    const missing: string[] = [];
    let checked = 0;
    for (const file of sourceFiles(join(__dirname, '..'))) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) {
        const key = m[1]!;
        checked++;
        // Una clave puede tener variantes de plural (_one/_other).
        if (t(key) === key && t(key, { count: 2 }) === key) missing.push(`${file}: ${key}`);
      }
    }
    expect(checked).toBeGreaterThan(100); // la búsqueda no está vacía
    expect(missing).toEqual([]);
  });

  it('las claves dinámicas de unidades, ubicaciones y categorías existen', () => {
    for (const group of ['units', 'locations', 'categories', 'expiryKinds'] as const) {
      for (const key of Object.keys(es[group])) expect(t(`${group}.${key}`)).not.toBe(`${group}.${key}`);
    }
    for (const code of ['validation', 'not_found', 'conflict', 'incompatible_units', 'insufficient_quantity', 'already_transferred']) {
      expect(t(`errors.${code}`)).not.toBe(`errors.${code}`);
    }
  });

  it('interpola parámetros y plurales', () => {
    expect(t('home.shoppingSummary', { count: 1 })).toBe('1 artículo pendiente');
    expect(t('home.shoppingSummary', { count: 3 })).toBe('3 artículos pendientes');
    expect(t('clave.inexistente')).toBe('clave.inexistente');
  });
});
