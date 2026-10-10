import { ERROR_CODES } from '@polleria/shared';
import { AppError } from '../errors/app-error.ts';

/** Máximo del tipo INTEGER de PostgreSQL: todos los id de ruta comparten esta cota. */
const ID_PARAM_MAX = 2147483647;

/**
 * Convierte un parámetro de ruta en un entero positivo: ^[0-9]+$ y entre 1 y
 * ID_PARAM_MAX. Cualquier otra cosa ('abc', '0', '1.5', '-3', números enormes o un
 * parámetro repetido) es un VALIDATION_ERROR con el issue en la clave del parámetro.
 * Es la regla que estrenó parseProductIdParam (spec 005, D-005-09), generalizada
 * para todos los identificadores de la API (spec 009, D-009-13): '0009' vale por 9.
 */
export function parseIdParam(
  raw: string | string[] | undefined,
  path: string,
  message: string,
): number {
  const id = typeof raw === 'string' && /^[0-9]+$/.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isSafeInteger(id) || id < 1 || id > ID_PARAM_MAX)
    throw new AppError({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'Los datos enviados no son válidos.',
      httpStatus: 400,
      details: { issues: [{ path, message }] },
    });
  return id;
}
