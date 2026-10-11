import { z } from 'zod';
import {
  kitchenTicketSchema,
  orderItemSchema,
  tableRefSchema,
  userRefSchema,
} from './order-items.ts';

/**
 * Ciclo de vida del pedido (spec 009, D-009-04): open es la cuenta abierta de una o
 * más mesas; closed lo ejecuta el cobro (Fase 4); cancelled lo hace el administrador
 * con motivo; merged queda cuando la cuenta se fusiona en otra al unir mesas. Los
 * pedidos nunca se borran: son el historial (RN-009-04).
 */
export const ORDER_STATUSES = ['open', 'closed', 'cancelled', 'merged'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const orderStatusSchema = z.enum(ORDER_STATUSES);

/**
 * userRefSchema y tableRefSchema se definieron en order-items.ts (spec 010): los
 * esquemas de ítems y comandas los necesitan y este módulo importa ese para embeber
 * items en orderSchema — la dependencia queda en una sola dirección y los nombres
 * se reexportan desde aquí sin cambiar el contrato de la spec 009.
 */
export { userRefSchema, tableRefSchema } from './order-items.ts';
export type { UserRef, TableRef } from './order-items.ts';

/**
 * Un pedido tal como lo devuelve la API (D-009-14, ampliado en la spec 010): las
 * once claves de la 009 más `items` —los ítems del pedido con su estado y traza—
 * y `totalCents`, la suma de los ítems activos con sus cremas (D-010-03).
 */
export const orderSchema = z.strictObject({
  id: z.number().int().positive(),
  status: orderStatusSchema,
  tables: z.array(tableRefSchema),
  openedBy: userRefSchema,
  openedAt: z.iso.datetime(),
  readyAt: z.iso.datetime().nullable(),
  billRequestedAt: z.iso.datetime().nullable(),
  closedAt: z.iso.datetime().nullable(),
  closedBy: userRefSchema.nullable(),
  cancelReason: z.string().nullable(),
  mergedIntoOrderId: z.number().int().positive().nullable(),
  items: z.array(orderItemSchema),
  totalCents: z.number().int().min(0),
});
export type Order = z.infer<typeof orderSchema>;

/**
 * Respuestas con un solo pedido (POST .../request-void y .../reject-void de la spec
 * 010). Viven aquí y no en order-items.ts porque embeben orderSchema y la
 * importación solo puede ir en un sentido: orders.ts -> order-items.ts.
 */
export const orderResponseSchema = z.strictObject({ order: orderSchema });
export type OrderResponse = z.infer<typeof orderResponseSchema>;

/** Respuesta de POST .../items y POST .../void: el pedido más la comanda emitida. */
export const sendOrderItemsResponseSchema = z.strictObject({
  order: orderSchema,
  ticket: kitchenTicketSchema,
});
export type SendOrderItemsResponse = z.infer<typeof sendOrderItemsResponseSchema>;

const TABLE_ID_MESSAGE = 'El identificador de la mesa no es válido.';
/** Máximo del tipo INTEGER de PostgreSQL (misma regla que los id de ruta, D-009-13). */
const TABLE_ID_MAX = 2147483647;
const tableIdSchema = z
  .number({ error: TABLE_ID_MESSAGE })
  .int(TABLE_ID_MESSAGE)
  .min(1, TABLE_ID_MESSAGE)
  .max(TABLE_ID_MAX, TABLE_ID_MESSAGE);

/**
 * Cuerpo de una sola clave (AC-01): el issue debe salir en la clave con el mensaje del
 * campo aunque la entrada no sea un objeto, sea un arreglo o traiga claves de más —
 * casos en que el esquema objeto reportaría el problema en la raíz. El preprocess
 * convierte toda entrada que no sea exactamente { [key]: valor } en { [key]: null },
 * que el campo rechaza con su mensaje.
 */
function singleFieldBody(input: unknown, key: string): unknown {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return { [key]: null };
  if (Object.keys(input).some((name) => name !== key)) return { [key]: null };
  return input;
}

/** Cuerpo de POST /api/orders/{orderId}/move: la mesa destino del pedido (D-009-07). */
export const moveOrderRequestSchema = z.preprocess(
  (input) => singleFieldBody(input, 'tableId'),
  z.strictObject({ tableId: tableIdSchema }),
);
export type MoveOrderRequest = z.infer<typeof moveOrderRequestSchema>;

/** Cuerpo de POST /api/tables/{tableId}/join: la mesa a cuya cuenta se suma (D-009-08). */
export const joinTableRequestSchema = z.preprocess(
  (input) => singleFieldBody(input, 'intoTableId'),
  z.strictObject({ intoTableId: tableIdSchema }),
);
export type JoinTableRequest = z.infer<typeof joinTableRequestSchema>;

export const CANCEL_REASON_MAX = 200;
const CANCEL_REASON_MESSAGE = 'Escribe el motivo de la anulación (hasta 200 caracteres).';
/**
 * Motivo de la cancelación (D-009-11): texto libre de 1 a 200 caracteres contados
 * después del recorte. Se exporta suelto porque el servicio también lo valida cuando
 * el motivo llega como argumento y no dentro de un cuerpo.
 */
export const cancelReasonSchema = z
  .string({ error: CANCEL_REASON_MESSAGE })
  .trim()
  .min(1, CANCEL_REASON_MESSAGE)
  .max(CANCEL_REASON_MAX, CANCEL_REASON_MESSAGE);

/** Cuerpo de POST /api/orders/{orderId}/cancel: solo el motivo, siempre obligatorio. */
export const cancelOrderRequestSchema = z.preprocess(
  (input) => singleFieldBody(input, 'reason'),
  z.strictObject({ reason: cancelReasonSchema }),
);
export type CancelOrderRequest = z.infer<typeof cancelOrderRequestSchema>;
