import { joinNames, LOCALE_LIST, LOCALES, setLocale, t } from './index';

function flatten(node: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (typeof v === 'string') out[prefix + k] = v;
    else flatten(v, `${prefix}${k}.`, out);
  }
  return out;
}

const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('idiomas', () => {
  afterEach(() => setLocale('es'));

  it('todos tienen las mismas claves, sin textos vacíos y con las mismas variables', () => {
    const es = flatten(LOCALES.es);
    for (const l of LOCALE_LIST) {
      const other = flatten(LOCALES[l]);
      expect(Object.keys(other).sort()).toEqual(Object.keys(es).sort());
      for (const [key, text] of Object.entries(other)) {
        expect([l, key, text.trim().length > 0]).toEqual([l, key, true]);
        expect([l, key, vars(text)]).toEqual([l, key, vars(es[key]!)]);
      }
    }
  });

  it('plurales y listas según el idioma', () => {
    setLocale('fr');
    expect(t('places.lots', { count: 0 })).toBe('0 lot');
    expect(joinNames(['a', 'b', 'c'])).toBe('a, b et c');
    setLocale('en');
    expect(t('places.lots', { count: 0 })).toBe('0 batches');
    expect(t('places.lots', { count: 1 })).toBe('1 batch');
    setLocale('es');
    expect(joinNames(['a', 'b'])).toBe('a y b');
  });
});
