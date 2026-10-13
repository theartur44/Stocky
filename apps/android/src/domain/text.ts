/**
 * Clave normalizada para comparar nombres: minúsculas, sin tildes, sin
 * signos y con espacios simples. «Tomates  Cherry» → «tomates cherry».
 */
export function normalizeKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();
}

/** Palabras significativas, con singularización simple del español. */
export function tokens(text: string): string[] {
  return normalizeKey(text)
    .split(' ')
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    .map(singularize);
}

const STOP_WORDS = new Set(['con', 'sin', 'para', 'del', 'los', 'las', 'una', 'unos', 'unas', 'por']);

function singularize(word: string): string {
  if (word.length > 4 && word.endsWith('es') && /[rnldz]es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s')) return word.slice(0, -1);
  return word;
}

/** Recorta y colapsa espacios internos de un texto introducido por el usuario. */
export function cleanText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
