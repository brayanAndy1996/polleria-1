import { z } from 'zod';

/** Estado de un componente: ok si responde; error si no. */
const healthStatusSchema = z.enum(['ok', 'error']);

/** Respuesta de GET /api/health (HealthResponse en docs/api/openapi.yaml). */
export const healthResponseSchema = z.strictObject({
  status: healthStatusSchema,
  database: healthStatusSchema,
  /** Hora del servidor en ISO 8601 UTC, siempre con el sufijo Z. */
  timestamp: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
