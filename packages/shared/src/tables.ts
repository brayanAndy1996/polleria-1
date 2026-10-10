import { z } from 'zod';
import { orderSchema } from './orders.ts';

export const TABLE_NAME_MAX = 40;
const TABLE_NAME_TOO_LONG_MESSAGE = 'El nombre de la mesa no puede pasar de 40 caracteres.';
const TABLE_NAME_PATTERN_MESSAGE =
  'El nombre de la mesa solo puede llevar letras, números, espacios, punto, guion o ' +
  'guion bajo.';
/**
 * Clase de caracteres del nombre de mesa (D-009-12): letras con tilde, marcas
 * combinadas, números, espacios, punto, guion y guion bajo. Cubre "Mesa 1", "Barra",
 * "T-2", "MESA_3" y "Depósito"; no admite tabulaciones, emojis ni signos.
 */
export const TABLE_NAME_PATTERN = /^[\p{L}\p{M}\p{N} ._-]+$/u;

/**
 * Nombre de la mesa (D-009-12): se recorta, reduce los espacios seguidos a uno y
 * normaliza a NFC —igual que displayNameSchema más el colapso de espacios— y luego
 * mide hasta 40 caracteres y la clase de caracteres, cada uno con su mensaje.
 * El vacío también es rechazado (la spec no fija su mensaje).
 */
export const tableNameSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/ +/g, ' ').normalize('NFC'))
  .pipe(
    z
      .string()
      .min(1, TABLE_NAME_PATTERN_MESSAGE)
      .max(TABLE_NAME_MAX, TABLE_NAME_TOO_LONG_MESSAGE)
      .regex(TABLE_NAME_PATTERN, TABLE_NAME_PATTERN_MESSAGE),
  );

/** Cuerpo de POST /api/tables: alta de una mesa del salón, que siempre nace activa. */
export const createTableRequestSchema = z.strictObject({ name: tableNameSchema });
export type CreateTableRequest = z.infer<typeof createTableRequestSchema>;

/**
 * Cuerpo de PATCH /api/tables/{tableId}: nombre y estado activo, ambos opcionales
 * pero con al menos una propiedad ('No indicaste ningún cambio.'), igual que
 * updateProductRequestSchema. Una mesa nunca se borra: se desactiva (RN-009-09).
 */
export const updateTableRequestSchema = z
  .strictObject({
    name: tableNameSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (fields) => Object.values(fields).some((value) => value !== undefined),
    'No indicaste ningún cambio.',
  );
export type UpdateTableRequest = z.infer<typeof updateTableRequestSchema>;

/**
 * Estados del tablero (RF-02, D-009-03), en el orden de la spec: free (libre),
 * occupied (ocupada), ready (pedido listo) y bill_requested (cuenta solicitada).
 * Se derivan del pedido que cubre la mesa, nunca se guardan.
 */
export const TABLE_STATES = ['free', 'occupied', 'ready', 'bill_requested'] as const;
export type TableState = (typeof TABLE_STATES)[number];
export const tableStateSchema = z.enum(TABLE_STATES);

/**
 * Una mesa tal como la devuelve la API (D-009-14): exactamente estas cinco claves.
 * `order` embebe el pedido completo que la cubre, o null si está libre.
 */
export const tableSchema = z.strictObject({
  id: z.number().int().positive(),
  name: tableNameSchema,
  isActive: z.boolean(),
  state: tableStateSchema,
  order: orderSchema.nullable(),
});
export type Table = z.infer<typeof tableSchema>;

/**
 * Respuesta de GET /api/tables: todas las mesas —activas e inactivas— ordenadas por
 * nombre con colación natural en español (D-009-12, D-009-14).
 */
export const tablesResponseSchema = z.strictObject({ tables: z.array(tableSchema) });
export type TablesResponse = z.infer<typeof tablesResponseSchema>;
