import { ERROR_CODES } from '@polleria/shared';
import type { ErrorRequestHandler, Request, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/app-error.ts';

/** Tipo de los errores del lector de JSON de Express (body-parser), por ejemplo entity.too.large. */
function getBodyParserErrorType(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'type' in error) {
    return typeof error.type === 'string' ? error.type : undefined;
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

  switch (getBodyParserErrorType(error)) {
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
    default:
      return undefined;
  }
}

/**
 * Registra un error inesperado con su traza. No incluye el cuerpo de la solicitud ni la query
 * (RN-001-01): solo el método y la ruta.
 */
function logUnexpectedError(req: Request, error: unknown): void {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
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
