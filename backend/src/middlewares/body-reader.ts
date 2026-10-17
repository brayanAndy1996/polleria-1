import express from 'express';
import type { RequestHandler } from 'express';
import { BodyReaderError } from '../errors/body-reader-error.ts';

/** Límite del cuerpo JSON, medido después de descomprimir (spec 001, 9.2). */
const JSON_BODY_LIMIT = '100kb';

/** Opciones del lector: `strict: false` admite un JSON válido que no sea objeto ni array. */
export interface BodyReaderOptions {
  strict?: boolean;
}

/**
 * Lector del cuerpo JSON (express.json). Los errores que entrega se envuelven en BodyReaderError
 * para que el errorHandler los distinga de cualquier otro error con propiedad `status`.
 *
 * Por defecto es estricto —solo objeto o array en la raíz (un escalar válido responde
 * INVALID_JSON). Con `strict: false` acepta también escalares: quien lo monta debe decidir
 * qué hacer con ellos —PUT .../items lo usa junto a requireJsonObject para responder
 * INVALID_BODY cuando el JSON válido no es un objeto (spec 007, AC-15).
 */
export function createBodyReader({ strict = true }: BodyReaderOptions = {}): RequestHandler {
  const readJson = express.json({ limit: JSON_BODY_LIMIT, strict });

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
