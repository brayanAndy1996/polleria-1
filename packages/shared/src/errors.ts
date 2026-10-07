import { z } from 'zod';

/**
 * Códigos de error estables definidos hasta la spec 001. Las specs siguientes agregan los suyos;
 * los clientes deben tolerar códigos desconocidos.
 */
export const ERROR_CODES = {
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_JSON: 'INVALID_JSON',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Problema de validación de un campo (ValidationIssue en docs/api/openapi.yaml). */
const validationIssueSchema = z.strictObject({
  /** Partes del campo unidas por punto (por ejemplo items.0.quantity); vacío si es del cuerpo completo. */
  path: z.string(),
  message: z.string().min(1),
});

/** Información adicional del error, o null si no hay. En VALIDATION_ERROR es { issues }. */
const errorDetailsSchema = z.union([
  z.null(),
  z.looseObject({ issues: z.array(validationIssueSchema).optional() }),
]);

/** Formato común de error de la API: { error: { code, message, details } }. */
export const errorResponseSchema = z.strictObject({
  error: z.strictObject({
    /** MAYÚSCULAS_CON_GUION_BAJO. Puede ser un código que aún no está en ERROR_CODES. */
    code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
    /** Mensaje en español de Perú, listo para mostrar al usuario. */
    message: z.string().min(1),
    details: errorDetailsSchema,
  }),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
