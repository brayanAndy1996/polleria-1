import { z } from 'zod';
import { displayNameSchema } from './auth.ts';
import { CUT_WITHOUT_PORTION_MESSAGE } from './combos.ts';
import {
  PORTIONS,
  PORTION_CUT_MESSAGE,
  SINGLE_CUT_PORTIONS,
  cutSchema,
  portionSchema,
} from './portions.ts';
import { priceCentsSchema, productCategorySchema, productSchema } from './products.ts';

/**
 * Ítems del pedido y comandas de cocina (spec 010): envío de ítems con precio y
 * nombre congelados (regla 4), el ciclo anular/solicitar/rechazar (regla 6) y las
 * comandas (initial, additional, void) que la cocina imprime.
 *
 * userRefSchema y tableRefSchema viven aquí y no en orders.ts porque orderItemSchema
 * y kitchenTicketSchema los necesitan y orders.ts importa este módulo para embeber
 * items en orderSchema — definirlos acá mantiene las importaciones en una sola
 * dirección (orders.ts -> order-items.ts).
 */

/** Estados del ítem (D-010-03): enviado, anulación pedida, anulado. */
export const ORDER_ITEM_STATUSES = ['sent', 'void_requested', 'voided'] as const;
export type OrderItemStatus = (typeof ORDER_ITEM_STATUSES)[number];

/** Tipos de comanda (D-010-12): envío inicial, adición y comanda de anulación. */
export const KITCHEN_TICKET_KINDS = ['initial', 'additional', 'void'] as const;
export type KitchenTicketKind = (typeof KITCHEN_TICKET_KINDS)[number];

/** Unidades máximas por ítem (D-010-06). */
export const ORDER_ITEM_QUANTITY_MAX = 99;
/** Ítems máximos por envío (D-010-06). */
export const ORDER_ITEMS_PER_SEND_MAX = 20;
/** Ítems activos máximos por pedido (D-010-06). */
export const ORDER_ACTIVE_ITEMS_MAX = 99;
/** Cremas máximas por ítem (D-010-05). */
export const ORDER_ITEM_SAUCES_MAX = 6;
/** Componentes máximos por ítem (D-010-05). */
export const ORDER_ITEM_COMPONENTS_MAX = 10;
/** Largo máximo de la observación, ya normalizada (D-010-07). */
export const ORDER_ITEM_NOTES_MAX = 200;
/** Largo máximo de la clave de idempotencia (D-010-09). */
export const IDEMPOTENCY_KEY_MAX = 128;

const ORDER_ITEM_PRODUCT_ID_MESSAGE = 'El identificador del producto no es válido.';
const ORDER_ITEM_QUANTITY_MESSAGE = 'Indica cuántas unidades lleva el ítem.';
const ORDER_ITEM_NOTES_MESSAGE = 'La observación admite hasta 200 caracteres en una sola línea.';
const ORDER_ITEM_EIGHTHS_MESSAGE = 'La distribución se indica en octavos enteros de 0 a 8.';
const ORDER_ITEMS_MIN_MESSAGE = 'Indica al menos un ítem.';
const ORDER_ITEMS_MAX_MESSAGE = 'Un envío admite hasta 20 ítems.';
const ORDER_ITEM_SAUCES_MAX_MESSAGE = 'Un ítem admite hasta 6 cremas.';
const ORDER_ITEM_COMPONENTS_MAX_MESSAGE = 'Un ítem admite hasta 10 componentes.';
const VOID_REASON_MESSAGE = 'Escribe el motivo de la anulación (hasta 200 caracteres).';
const IDEMPOTENCY_KEY_MESSAGE = 'El envío necesita la cabecera Idempotency-Key.';

/** Máximo del tipo INTEGER de PostgreSQL (misma regla que los id de ruta, D-009-13). */
const ORDER_ITEM_ID_PARAM_MAX = 2147483647;

const productIdSchema = z
  .number({ error: ORDER_ITEM_PRODUCT_ID_MESSAGE })
  .int(ORDER_ITEM_PRODUCT_ID_MESSAGE)
  .min(1, ORDER_ITEM_PRODUCT_ID_MESSAGE)
  .max(ORDER_ITEM_ID_PARAM_MAX, ORDER_ITEM_PRODUCT_ID_MESSAGE);

const orderItemQuantitySchema = z
  .number({ error: ORDER_ITEM_QUANTITY_MESSAGE })
  .int(ORDER_ITEM_QUANTITY_MESSAGE)
  .min(1, ORDER_ITEM_QUANTITY_MESSAGE)
  .max(ORDER_ITEM_QUANTITY_MAX, ORDER_ITEM_QUANTITY_MESSAGE);

const orderItemEighthsSchema = z
  .number({ error: ORDER_ITEM_EIGHTHS_MESSAGE })
  .int(ORDER_ITEM_EIGHTHS_MESSAGE)
  .min(0, ORDER_ITEM_EIGHTHS_MESSAGE)
  .max(8, ORDER_ITEM_EIGHTHS_MESSAGE);

/** Caracteres de control, de formato y separadores de línea Unicode: una sola línea (D-010-07). */
const ORDER_ITEM_CONTROL_CHARS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

/**
 * La observación del ítem (D-010-07): se normaliza a NFC y se recorta antes de
 * validar; los caracteres de control se rechazan sobre el texto crudo (un '\t' no
 * puede colarse aunque el recorte lo borre después). Vacía o solo espacios se guarda
 * como null.
 */
const orderItemNotesSchema = z
  .string({ error: ORDER_ITEM_NOTES_MESSAGE })
  .refine((value) => !ORDER_ITEM_CONTROL_CHARS.test(value), ORDER_ITEM_NOTES_MESSAGE)
  .transform((value) => value.normalize('NFC').trim())
  .refine((value) => value.length <= ORDER_ITEM_NOTES_MAX, ORDER_ITEM_NOTES_MESSAGE)
  .transform((value) => (value === '' ? null : value));

/** Referencia a un usuario en la respuesta: solo id y nombre visible (D-009-14). */
export const userRefSchema = z.strictObject({
  id: z.number().int().positive(),
  displayName: displayNameSchema,
});
export type UserRef = z.infer<typeof userRefSchema>;

/**
 * Referencia a una mesa en la respuesta: solo id y nombre (D-009-14). El nombre va
 * como texto simple —usar tableNameSchema aquí crearía un ciclo tables.ts <-> aquí.
 */
export const tableRefSchema = z.strictObject({
  id: z.number().int().positive(),
  name: z.string(),
});
export type TableRef = z.infer<typeof tableRefSchema>;

/**
 * Crema adicionada a un ítem (D-010-05): precio y nombre copiados al enviar, como
 * el ítem mismo. quantity cuenta las unidades de esa crema en el ítem.
 */
export const orderItemSauceSchema = z.strictObject({
  productId: z.number().int().positive(),
  productName: z.string(),
  quantity: z.number().int().min(1).max(ORDER_ITEM_QUANTITY_MAX),
  priceCents: z.number().int().min(0),
});
export type OrderItemSauce = z.infer<typeof orderItemSauceSchema>;

/**
 * Componente resuelto de un ítem combo (D-010-05): lo que realmente se envía a
 * cocina — la fila del combo de la carta con la presentación, la parte y la
 * distribución que eligió el mozo (o la de la carta).
 */
export const orderItemComponentSchema = z.strictObject({
  productId: z.number().int().positive(),
  productName: z.string(),
  quantity: z.number().int().min(1).max(ORDER_ITEM_QUANTITY_MAX),
  portion: portionSchema.nullable(),
  cut: cutSchema.nullable(),
  breastEighths: z.number().int().min(0),
  legEighths: z.number().int().min(0),
});
export type OrderItemComponent = z.infer<typeof orderItemComponentSchema>;

/**
 * Un ítem del pedido tal como lo devuelve la API (D-010-03): exactamente estas
 * claves. Precio, nombre y categoría quedan congelados al envío (regla 4); las
 * partes de pollo van ya resueltas en octavos; la traza de anulación completa la
 * auditoría de la regla 6.
 */
export const orderItemSchema = z.strictObject({
  id: z.number().int().positive(),
  productId: z.number().int().positive(),
  productName: z.string(),
  productCategory: productCategorySchema,
  quantity: z.number().int().min(1).max(ORDER_ITEM_QUANTITY_MAX),
  priceCents: z.number().int().min(0),
  portion: portionSchema.nullable(),
  cut: cutSchema.nullable(),
  breastEighths: z.number().int().min(0),
  legEighths: z.number().int().min(0),
  notes: z.string().nullable(),
  sauces: z.array(orderItemSauceSchema),
  components: z.array(orderItemComponentSchema),
  status: z.enum(ORDER_ITEM_STATUSES),
  kitchenTicketId: z.number().int().positive(),
  voidTicketId: z.number().int().positive().nullable(),
  voidedBy: userRefSchema.nullable(),
  voidedAt: z.iso.datetime().nullable(),
  voidReason: z.string().nullable(),
  voidRequestedBy: userRefSchema.nullable(),
  voidRequestedAt: z.iso.datetime().nullable(),
  voidRequestReason: z.string().nullable(),
  orderedAtTable: tableRefSchema.nullable(),
  createdBy: userRefSchema,
  createdAt: z.iso.datetime(),
});
export type OrderItem = z.infer<typeof orderItemSchema>;

/**
 * Una comanda de cocina (D-010-12): 'initial'/'additional' llevan los ítems de ese
 * envío; 'void' lista los ítems anulados en esa autorización.
 */
export const kitchenTicketSchema = z.strictObject({
  id: z.number().int().positive(),
  orderId: z.number().int().positive(),
  kind: z.enum(KITCHEN_TICKET_KINDS),
  items: z.array(orderItemSchema),
  createdBy: userRefSchema,
  createdAt: z.iso.datetime(),
});
export type KitchenTicket = z.infer<typeof kitchenTicketSchema>;

/** Respuesta de GET /api/orders/{orderId}/tickets: las comandas del pedido en orden. */
export const kitchenTicketsResponseSchema = z.strictObject({
  tickets: z.array(kitchenTicketSchema),
});
export type KitchenTicketsResponse = z.infer<typeof kitchenTicketsResponseSchema>;

/** Presentación ofrecida en la carta con su precio (GET /api/menu, D-010-14). */
export const menuPortionSchema = z.strictObject({
  portion: portionSchema,
  cut: cutSchema.nullable(),
  priceCents: priceCentsSchema,
});
export type MenuPortion = z.infer<typeof menuPortionSchema>;

/** Componente de un combo en la carta: el producto completo más su configuración. */
export const menuComboItemSchema = z.strictObject({
  product: productSchema,
  quantity: z.number().int().min(1).max(ORDER_ITEM_QUANTITY_MAX),
  portion: portionSchema.nullable(),
  cut: cutSchema.nullable(),
});
export type MenuComboItem = z.infer<typeof menuComboItemSchema>;

/**
 * Producto de la carta para armar pedidos (D-010-14): el producto con sus
 * presentaciones (pollos) y sus componentes (combos) resueltos.
 */
export const menuProductSchema = z.strictObject({
  id: z.number().int().positive(),
  name: z.string(),
  category: productCategorySchema,
  priceCents: priceCentsSchema,
  portions: z.array(menuPortionSchema),
  items: z.array(menuComboItemSchema),
});
export type MenuProduct = z.infer<typeof menuProductSchema>;

/** Respuesta de GET /api/menu (D-010-14, AC-14). */
export const menuResponseSchema = z.strictObject({
  products: z.array(menuProductSchema),
});
export type MenuResponse = z.infer<typeof menuResponseSchema>;

/** Una crema en el cuerpo del envío: productId y unidades (1 por defecto). */
export const orderItemSauceInputSchema = z.strictObject({
  productId: productIdSchema,
  quantity: orderItemQuantitySchema.default(1),
});
export type OrderItemSauceInput = z.infer<typeof orderItemSauceInputSchema>;

/**
 * Regla compartida de presentación y parte sobre una fila de entrada: parte sin
 * presentación es su propio mensaje; eighth/quarter exigen parte y half/whole la
 * prohíben (misma correspondencia que la 006/007). Un valor fuera de PORTIONS ya lo
 * rechaza el enum con su propio issue.
 */
function refinePortionAndCut(
  row: { portion?: string | null | undefined; cut?: string | null | undefined },
  addIssue: (path: string[], message: string) => void,
): void {
  const portion = row.portion ?? null;
  const cut = row.cut ?? null;
  if (portion === null && cut !== null) {
    addIssue(['cut'], CUT_WITHOUT_PORTION_MESSAGE);
    return;
  }
  if (portion === null || !(PORTIONS as readonly string[]).includes(portion)) return;
  const singleCut = (SINGLE_CUT_PORTIONS as readonly string[]).includes(portion);
  if (singleCut ? cut === null : cut !== null) addIssue(['cut'], PORTION_CUT_MESSAGE);
}

/**
 * Un componente elegido por el mozo dentro de un ítem combo (D-010-05): la fila del
 * combo con su posible ajuste de parte o distribución. quantity es obligatoria;
 * portion y cut quedan ausentes cuando el componente no es pollo.
 */
export const orderItemComponentInputSchema = z
  .strictObject({
    productId: productIdSchema,
    quantity: orderItemQuantitySchema,
    portion: portionSchema.optional(),
    cut: cutSchema.optional(),
    breastEighths: orderItemEighthsSchema.optional(),
    legEighths: orderItemEighthsSchema.optional(),
  })
  .superRefine((row, ctx) => {
    refinePortionAndCut(row, (path, message) => {
      ctx.addIssue({ code: 'custom', path, message });
    });
  });
export type OrderItemComponentInput = z.infer<typeof orderItemComponentInputSchema>;

/**
 * Un ítem del cuerpo del envío (D-010-05): producto, unidades y opcionalmente
 * presentación/parte/distribución (pollos), observación, cremas y componentes
 * (combos). Las claves opcionales quedan ausentes, no null — el servicio distingue
 * "no se indicó" de "se indicó null".
 */
export const orderItemInputSchema = z
  .strictObject({
    productId: productIdSchema,
    quantity: orderItemQuantitySchema.default(1),
    portion: portionSchema.optional(),
    cut: cutSchema.optional(),
    breastEighths: orderItemEighthsSchema.optional(),
    legEighths: orderItemEighthsSchema.optional(),
    notes: orderItemNotesSchema.optional(),
    sauces: z
      .array(orderItemSauceInputSchema)
      .max(ORDER_ITEM_SAUCES_MAX, ORDER_ITEM_SAUCES_MAX_MESSAGE)
      .optional(),
    components: z
      .array(orderItemComponentInputSchema)
      .max(ORDER_ITEM_COMPONENTS_MAX, ORDER_ITEM_COMPONENTS_MAX_MESSAGE)
      .optional(),
  })
  .superRefine((row, ctx) => {
    refinePortionAndCut(row, (path, message) => {
      ctx.addIssue({ code: 'custom', path, message });
    });
  });
export type OrderItemInput = z.infer<typeof orderItemInputSchema>;

/**
 * Cuerpo de POST /api/orders/{orderId}/items (D-010-05): de 1 a 20 ítems. Objeto
 * estricto — cualquier clave de más es error de quien llama.
 */
export const sendOrderItemsRequestSchema = z.strictObject({
  items: z
    .array(orderItemInputSchema)
    .min(1, ORDER_ITEMS_MIN_MESSAGE)
    .max(ORDER_ITEMS_PER_SEND_MAX, ORDER_ITEMS_MAX_MESSAGE),
});
export type SendOrderItemsRequest = z.infer<typeof sendOrderItemsRequestSchema>;

/**
 * Cuerpo de una sola clave (misma forma que cancelOrderRequestSchema): el issue debe
 * salir en `reason` con el mensaje del campo aunque la entrada no sea un objeto, sea
 * un arreglo o traiga claves de más. Se duplica el preprocess aquí porque este
 * módulo no puede importar orders.ts (orders.ts lo importa a él).
 */
function reasonOnlyBody(input: unknown): unknown {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return { reason: null };
  if (Object.keys(input).some((name) => name !== 'reason')) return { reason: null };
  return input;
}

/**
 * Motivo de la anulación (misma regla que cancelReasonSchema): texto libre de 1 a
 * 200 caracteres contados después del recorte.
 */
const voidReasonSchema = z
  .string({ error: VOID_REASON_MESSAGE })
  .refine((value) => !ORDER_ITEM_CONTROL_CHARS.test(value), VOID_REASON_MESSAGE)
  .trim()
  .min(1, VOID_REASON_MESSAGE)
  .max(200, VOID_REASON_MESSAGE);

/**
 * Cuerpo de POST .../request-void y POST .../void: solo el motivo (D-010-15). La
 * forma es la misma de cancelOrderRequestSchema (spec 010, §9).
 */
export const voidOrderItemRequestSchema = z.preprocess(
  reasonOnlyBody,
  z.strictObject({ reason: voidReasonSchema }),
);
export type VoidOrderItemRequest = z.infer<typeof voidOrderItemRequestSchema>;

/**
 * Cabecera Idempotency-Key (D-010-09): de 1 a 128 caracteres ASCII visibles (sin
 * espacios ni controles). Se valida antes que el parámetro de ruta y el cuerpo.
 */
export const idempotencyKeySchema = z
  .string({ error: IDEMPOTENCY_KEY_MESSAGE })
  .regex(/^[\x21-\x7E]{1,128}$/, IDEMPOTENCY_KEY_MESSAGE);
export type IdempotencyKey = z.infer<typeof idempotencyKeySchema>;
