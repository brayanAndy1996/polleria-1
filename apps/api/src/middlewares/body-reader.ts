import express from 'express';
import type { RequestHandler } from 'express';
import { BodyReaderError } from '../errors/body-reader-error.ts';

/** Límite del cuerpo JSON, medido después de descomprimir (spec 001, 9.2). */
const JSON_BODY_LIMIT = '100kb';

/**
 * Lector del cuerpo JSON (express.json). Los errores que entrega se envuelven en BodyReaderError
 * para que el errorHandler los distinga de cualquier otro error con propiedad `status`.
 */
export function createBodyReader(): RequestHandler {
  const readJson = express.json({ limit: JSON_BODY_LIMIT });

  return (req, res, next) => {
    readJson(req, res, (error?: unknown) => {
      if (error === undefined) {
        next();
        return;
      }
      next(new BodyReaderError(error));
    });
  };
}
