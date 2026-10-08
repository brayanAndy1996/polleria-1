import { ERROR_CODES } from '@polleria/shared';
import type { ErrorRequestHandler, Request, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/app-error.ts';
import { BodyReaderError } from '../errors/body-reader-error.ts';

/** Lee una propiedad de un error de body-parser / raw-body / http-errors sin asumir su forma. */
function readErrorProperty(error: unknown, property: 'type' | 'status'): unknown {
  if (typeof error === 'object' && error !== null && property in error) {
    return error[property];
  }
  return undefined;
}

/**
 * Clasifica un error que entregó el lector del cuerpo (spec 001, 9.2 y D-11). Devuelve undefined
 * si es un error de programación o inesperado (estado 5xx o sin estado): ese se responde como 500
 * y se registra. Los mensajes no incluyen el valor recibido.
 */
function classifyBodyReaderError(cause: unknown): AppError | undefined {
  switch (readErrorProperty(cause, 'type')) {
    case 'entity.parse.failed':
      return new AppError({
        code: ERROR_CODES.INVALID_JSON,
        message: 'El cuerpo de la solicitud no es un JSON válido.',
        httpStatus: 400,
      });
    case 'entity.too.large':
      return new AppError({
        code: ERROR_CODES.PAYLOAD_TOO_LARGE,
        message: 'La solicitud es demasiado grande.',
        httpStatus: 413,
      });
    case 'encoding.unsupported':
    case 'charset.unsupported':
      return new AppError({
        code: ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
        message: 'La codificación del cuerpo de la solicitud no es compatible.',
        httpStatus: 415,
      });
    default:
      break;
  }

  // Cualquier otro 4xx del lector: compresión corrupta, truncada o vacía, solicitud cortada.
  const status = readErrorProperty(cause, 'status');
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return new AppError({
      code: ERROR_CODES.INVALID_BODY,
      message: 'No se pudo leer el cuerpo de la solicitud.',
      httpStatus: 400,
    });
  }

  return undefined;
}

/** Convierte los errores conocidos en AppError. Devuelve undefined si el error es inesperado. */
function toAppError(error: unknown): AppError | undefined {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new AppError({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'Los datos enviados no son válidos.',
      httpStatus: 400,
      details: {
        issues: error.issues.map((issue) => ({
          path: issue.path.map(String).join('.'),
          message: issue.message,
        })),
      },
    });
  }

  // Solo los errores del lector del cuerpo: un Error cualquiera con `status` 4xx sigue siendo
  // inesperado (AC-37).
  if (error instanceof BodyReaderError) {
    return classifyBodyReaderError(error.cause);
  }

  return undefined;
}

/**
 * Registra un error inesperado con su traza. No incluye el cuerpo de la solicitud ni la query
 * (RN-001-01): solo el método y la ruta. De un error del lector del cuerpo registra el original.
 */
function logUnexpectedError(req: Request, error: unknown): void {
  const original = error instanceof BodyReaderError ? error.cause : error;
  const detail = original instanceof Error ? (original.stack ?? original.message) : String(original);
  console.error(`Error inesperado en ${req.method} ${req.path}:`, detail);
}

/** Ruta que ningún router atendió: responde 404 con el formato común. */
export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(
    new AppError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'La ruta solicitada no existe.',
      httpStatus: 404,
    }),
  );
};

/** Único punto que responde errores: { error: { code, message, details } }. */
export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  let appError = toAppError(error);

  if (appError === undefined) {
    logUnexpectedError(req, error);
    appError = new AppError({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Ocurrió un error inesperado. Intenta nuevamente.',
      httpStatus: 500,
    });
  }

  res.status(appError.httpStatus).json({
    error: { code: appError.code, message: appError.message, details: appError.details },
  });
};
