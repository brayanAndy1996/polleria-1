import { ERROR_CODES } from '@polleria/shared';
import type { RequestHandler } from 'express';
import { AppError } from '../errors/app-error.ts';

/**
 * Guardias del cuerpo JSON para las rutas que lo exigen (spec 007, AC-15). El lector
 * global de app.ts es estricto (INVALID_JSON ante un escalar) y deja pasar los demás
 * Content-Type sin tocar el cuerpo; PUT .../items precisa reglas propias, así que va
 * por delante con un lector laxo (strict: false) y estas dos guardias —ambas antes de
 * la autenticación, igual que el resto de errores del lector.
 */

/**
 * Exige Content-Type: application/json cuando la solicitud trae cuerpo. "Con cuerpo"
 * se detecta igual que body-parser: Content-Length distinto de '0' o Transfer-Encoding
 * presente. Un PUT sin cuerpo sigue su curso y el esquema Zod lo rechaza con
 * VALIDATION_ERROR; uno con cuerpo no JSON responde 415 UNSUPPORTED_MEDIA_TYPE.
 */
export const requireJsonContentType: RequestHandler = (req, _res, next) => {
  const hasBody =
    req.headers['transfer-encoding'] !== undefined ||
    (req.headers['content-length'] ?? '0') !== '0';
  const mediaType = req.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase();
  if (hasBody && mediaType !== 'application/json') {
    next(
      new AppError({
        code: ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
        message: 'La codificación del cuerpo de la solicitud no es compatible.',
        httpStatus: 415,
      }),
    );
    return;
  }
  next();
};

/**
 * Exige que el cuerpo parseado sea un objeto JSON. El lector laxo de .../items admite
 * escalares (5, "texto", null, true) y arreglos —JSON sintácticamente válido que no
 * sirve como cuerpo de la solicitud— y los convierte aquí en 400 INVALID_BODY.
 */
export const requireJsonObject: RequestHandler = (req, _res, next) => {
  const body = req.body as unknown;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    next(
      new AppError({
        code: ERROR_CODES.INVALID_BODY,
        message: 'No se pudo leer el cuerpo de la solicitud.',
        httpStatus: 400,
      }),
    );
    return;
  }
  next();
};
