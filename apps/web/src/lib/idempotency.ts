/**
 * Clave de idempotencia del salón (spec 011, D-011-02): una por INTENTO de envío
 * — el reintento del mismo intento reusa la clave y un intento nuevo genera otra.
 * crypto.randomUUID() ya cumple idempotencyKeySchema (ASCII visible, 36 chars).
 */
export function createIdempotencyKey(): string {
  return crypto.randomUUID();
}
