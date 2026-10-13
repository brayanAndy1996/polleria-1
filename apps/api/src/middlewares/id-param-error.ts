import { ERROR_CODES } from '@polleria/shared';
import type { ErrorRequestHandler } from 'express';
import { AppError } from '../errors/app-error.ts';

/** Lee `status` de un error del router sin asumir su forma (misma lectura que error-handler). */
function readStatus(error: unknown): unknown {
  return typeof error === 'object' && error !== null ? Reflect.get(error, 'status') : undefined;
}

/**
 * Manejador de errores para los routers cuyas rutas llevan un parámetro de id (spec
 * 009, D-009-13). Un percent-encoding malformado en la dirección ('%', '%E0%A4%A')
 * revienta en path-to-regexp al decodificar el parámetro —antes de llegar al parser—
 * como un URIError con status 400. Como la única pieza variable de estas rutas es el
 * id, se traduce al mismo VALIDATION_ERROR con el issue en el parámetro que habría
 * producido parseIdParam. Cualquier otro error sigue su curso al manejador global.
 */
export function malformedIdParamError(path: string, message: string): ErrorRequestHandler {
  return (error, _req, _res, next) => {
    if (error instanceof URIError && readStatus(error) === 400) {
      next(
        new AppError({
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'Los datos enviados no son válidos.',
          httpStatus: 400,
          details: { issues: [{ path, message }] },
        }),
      );
      return;
    }
    next(error);
  };
}

/**
 * Variante para rutas con MÁS de un parámetro de id (spec 010: orderId + itemId).
 * El URIError no dice qué segmento estaba mal; se intenta decodificar cada
 * segmento candidato de la URL relativa del router y el issue etiqueta el
 * primero que falla. Si ninguno falla, etiqueta el último declarado.
 */
export function malformedIdParamsError(
  params: { index: number; path: string; message: string }[],
): ErrorRequestHandler {
  return (error, req, _res, next) => {
    if (error instanceof URIError && readStatus(error) === 400) {
      const segments = req.path.split('/');
      let issue = params[params.length - 1];
      for (const candidate of params) {
        try {
          decodeURIComponent(segments[candidate.index] ?? '');
        } catch {
          issue = candidate;
          break;
        }
      }
      next(
        new AppError({
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'Los datos enviados no son válidos.',
          httpStatus: 400,
          details: { issues: [{ path: issue?.path ?? '', message: issue?.message ?? '' }] },
        }),
      );
      return;
    }
    next(error);
  };
}
