import { AppError } from './errors';
import { isLocation, type Location } from './models';
import { cleanText } from './text';

/**
 * Sitios de la casa donde se guardan las cosas («Nevera cocina», «Congelador
 * del garaje», «Trastero»…). Cada uno tiene un tipo (nevera, congelador,
 * despensa u otro) que decide su icono y las sugerencias del escáner.
 */
export interface Place {
  id: string;
  name: string;
  kind: Location;
  position: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Los cuatro sitios iniciales tienen el mismo identificador en todos los
 * móviles: así, al compartir el hogar, no se duplican.
 */
export const DEFAULT_PLACES: readonly { id: string; name: string; kind: Location }[] = [
  { id: '5a7c0000-0000-4000-8000-000000000001', name: 'Nevera', kind: 'fridge' },
  { id: '5a7c0000-0000-4000-8000-000000000002', name: 'Congelador', kind: 'freezer' },
  { id: '5a7c0000-0000-4000-8000-000000000003', name: 'Despensa', kind: 'pantry' },
  { id: '5a7c0000-0000-4000-8000-000000000004', name: 'Otro sitio', kind: 'other' },
];

export const PLACE_NAME_MAX = 40;

export function validatePlaceInput(input: { name: string; kind: Location }): { name: string; kind: Location } {
  const name = cleanText(input.name ?? '');
  const errors: Record<string, string> = {};
  if (!name) errors.name = 'errors.required';
  else if (name.length > PLACE_NAME_MAX) errors.name = 'errors.tooLong';
  if (!isLocation(input.kind)) errors.kind = 'errors.invalidValue';
  if (Object.keys(errors).length) throw new AppError('validation', 'Invalid place input', errors);
  return { name, kind: input.kind };
}

/** El primer sitio (según el orden del usuario) de un tipo, o el primero de todos. */
export function firstPlaceOfKind(places: readonly Place[], kind: Location): Place | null {
  return places.find((p) => p.kind === kind) ?? places[0] ?? null;
}
