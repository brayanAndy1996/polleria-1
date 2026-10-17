/**
 * Error que entregó el lector del cuerpo de la solicitud (express.json). Lo crea solo
 * middlewares/body-reader.ts; el original queda en `cause`.
 *
 * Existe para que el errorHandler reconozca el origen del error sin fiarse de su propiedad `status`
 * (cualquier código puede lanzar un Error con status 400): la clasificación de errores del cuerpo
 * (spec 001, D-11) aplica únicamente a las instancias de esta clase.
 */
export class BodyReaderError extends Error {
  constructor(cause: unknown) {
    super('Falló la lectura del cuerpo de la solicitud.', { cause });
    this.name = 'BodyReaderError';
  }
}
