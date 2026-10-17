import { z } from 'zod';

/**
 * Códigos de error estables definidos hasta la spec 001 (con su enmienda 1: UNSUPPORTED_MEDIA_TYPE
 * e INVALID_BODY, errores al leer el cuerpo de la solicitud). Las specs siguientes agregan los
 * suyos; los clientes deben tolerar códigos desconocidos.
 */
export const ERROR_CODES = {
  BILL_CHANGED: 'BILL_CHANGED',
  PENDING_VOIDS: 'PENDING_VOIDS',
  ORDER_NOT_PAYABLE: 'ORDER_NOT_PAYABLE',
  INSUFFICIENT_CASH: 'INSUFFICIENT_CASH',
  PAYMENT_NOT_FOUND: 'PAYMENT_NOT_FOUND',
  KITCHEN_TICKET_NOT_FOUND: 'KITCHEN_TICKET_NOT_FOUND',
  PRINT_IN_PROGRESS: 'PRINT_IN_PROGRESS',
  PRINT_SNAPSHOT_UNAVAILABLE: 'PRINT_SNAPSHOT_UNAVAILABLE',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_JSON: 'INVALID_JSON',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  INVALID_BODY: 'INVALID_BODY',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  TOO_MANY_ATTEMPTS: 'TOO_MANY_ATTEMPTS',
  USERNAME_TAKEN: 'USERNAME_TAKEN',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  LAST_ADMIN_REQUIRED: 'LAST_ADMIN_REQUIRED',
  PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',
  PRODUCT_NAME_TAKEN: 'PRODUCT_NAME_TAKEN',
  PORTIONS_NOT_ALLOWED: 'PORTIONS_NOT_ALLOWED',
  PRODUCT_HAS_PORTIONS: 'PRODUCT_HAS_PORTIONS',
  COMBO_ITEMS_NOT_ALLOWED: 'COMBO_ITEMS_NOT_ALLOWED',
  PRODUCT_HAS_ITEMS: 'PRODUCT_HAS_ITEMS',
  PRODUCT_IS_COMPONENT: 'PRODUCT_IS_COMPONENT',
  /** RF-02/RF-03 (spec 009): la mesa de la ruta no existe. */
  TABLE_NOT_FOUND: 'TABLE_NOT_FOUND',
  /** RF-03: el pedido de la ruta no existe. */
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
  /** RF-02: ya hay una mesa con ese nombre (la comparación no distingue mayúsculas). */
  TABLE_NAME_TAKEN: 'TABLE_NAME_TAKEN',
  /** RF-03: la mesa ya tiene un pedido abierto al abrir cuenta o moverse a ella. */
  TABLE_OCCUPIED: 'TABLE_OCCUPIED',
  /** RF-02/RF-03: la mesa está desactivada y no admite operaciones de salón. */
  TABLE_INACTIVE: 'TABLE_INACTIVE',
  /** RF-02: no se puede desactivar una mesa mientras tenga un pedido abierto. */
  TABLE_HAS_OPEN_ORDER: 'TABLE_HAS_OPEN_ORDER',
  /** RF-03: la mesa no tiene pedido abierto donde la operación lo exige. */
  TABLE_HAS_NO_ORDER: 'TABLE_HAS_NO_ORDER',
  /** RF-03: el pedido ya está cerrado (closed, cancelled o merged). */
  ORDER_NOT_OPEN: 'ORDER_NOT_OPEN',
  /** RF-03: quitar la última mesa dejaría el pedido sin mesa; hay que cerrarlo. */
  ORDER_NEEDS_TABLE: 'ORDER_NEEDS_TABLE',
  /** RF-04: el ítem de la ruta no existe en el pedido indicado. */
  ORDER_ITEM_NOT_FOUND: 'ORDER_ITEM_NOT_FOUND',
  /** RF-04: el ítem ya está anulado; no admite solicitar, aprobar ni rechazar. */
  ORDER_ITEM_ALREADY_VOIDED: 'ORDER_ITEM_ALREADY_VOIDED',
  /** RF-04: el ítem ya tiene una anulación solicitada pendiente de autorización. */
  ORDER_ITEM_VOID_REQUESTED: 'ORDER_ITEM_VOID_REQUESTED',
  /** RF-04: se intentó rechazar una anulación sobre un ítem que no la tenía pedida. */
  ORDER_ITEM_NOT_REQUESTED: 'ORDER_ITEM_NOT_REQUESTED',
  /** RF-04: el pedido tiene ítems activos y no puede cancelarse ni cerrarse. */
  ORDER_HAS_ACTIVE_ITEMS: 'ORDER_HAS_ACTIVE_ITEMS',
  /** RF-04: el envío supera el límite de ítems activos del pedido. */
  ORDER_ITEMS_LIMIT: 'ORDER_ITEMS_LIMIT',
  /** RF-04: la clave Idempotency-Key ya se usó con otro cuerpo u otro pedido. */
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
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
