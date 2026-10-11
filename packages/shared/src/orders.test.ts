// AC-01 y AC-02. Spec 009 — archivo nuevo: va EN ROJO hasta que T-06 cree
// packages/shared/src/orders.ts (y su exportación en index.ts).
import { describe, expect, it } from 'vitest';
import {
  CANCEL_REASON_MAX,
  ERROR_CODES,
  ORDER_STATUSES,
  cancelOrderRequestSchema,
  errorResponseSchema,
  joinTableRequestSchema,
  moveOrderRequestSchema,
  orderSchema,
  orderStatusSchema,
  tableRefSchema,
  userRefSchema,
} from '@polleria/shared';
import type {
  CancelOrderRequest,
  JoinTableRequest,
  MoveOrderRequest,
  Order,
  OrderStatus,
} from '@polleria/shared';

const TABLE_ID_MESSAGE = 'El identificador de la mesa no es v\u00E1lido.';
const CANCEL_REASON_MESSAGE = 'Escribe el motivo de la anulaci\u00F3n (hasta 200 caracteres).';
const ORDER_NOT_FOUND_BODY = {
  error: { code: 'ORDER_NOT_FOUND', message: 'Ese pedido no existe.', details: null },
};
const ORDER_NOT_OPEN_BODY = {
  error: { code: 'ORDER_NOT_OPEN', message: 'El pedido ya est\u00E1 cerrado.', details: null },
};
const ORDER_NEEDS_TABLE_BODY = {
  error: {
    code: 'ORDER_NEEDS_TABLE',
    message: 'El pedido necesita al menos una mesa; canc\u00E9lalo o ci\u00E9rralo.',
    details: null,
  },
};

/** Un pedido abierto válido: las trece claves exactas de D-010-14 (la 010 suma items y totalCents). */
const OPEN_ORDER = {
  id: 12,
  status: 'open',
  tables: [{ id: 3, name: 'Mesa 3' }],
  openedBy: { id: 2, displayName: 'Juan' },
  openedAt: '2026-10-10T18:30:00.000Z',
  readyAt: null,
  billRequestedAt: null,
  closedAt: null,
  closedBy: null,
  cancelReason: null,
  mergedIntoOrderId: null,
  items: [],
  totalCents: 0,
} satisfies Order;

/** Comprueba que el esquema rechaza la entrada y que al menos un issue trae el mensaje. */
function expectRejectedWith(
  schema: { safeParse: (input: unknown) => unknown },
  input: unknown,
  message: string,
) {
  const result = schema.safeParse(input) as
    { success: true } | { success: false; error: { issues: { message: string }[] } };
  expect(result.success).toBe(false);
  if (!result.success) expect(result.error.issues.map((issue) => issue.message)).toContain(message);
}

/** Issues de una entrada rechazada, reducidos a { path, message }. */
function issuesOf(
  schema: { safeParse: (input: unknown) => unknown },
  input: unknown,
): { path: string; message: string }[] {
  const result = schema.safeParse(input) as
    | { success: true }
    | {
        success: false;
        error: { issues: { path: (string | number | symbol)[]; message: string }[] };
      };
  expect(result.success).toBe(false);
  if (!result.success)
    return result.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    }));
  return [];
}

describe('009: esquemas del ciclo del pedido', () => {
  it('AC-01: moveOrderRequestSchema acepta un tableId entero válido', () => {
    const request: MoveOrderRequest = { tableId: 3 };
    expect(moveOrderRequestSchema.parse(request)).toEqual({ tableId: 3 });
    expect(moveOrderRequestSchema.parse({ tableId: 1 })).toEqual({ tableId: 1 });
    expect(moveOrderRequestSchema.parse({ tableId: 2147483647 })).toEqual({
      tableId: 2147483647,
    });
  });
  it.each([
    {},
    { tableId: 0 },
    { tableId: -3 },
    { tableId: 1.5 },
    { tableId: '3' },
    { tableId: null },
    { tableId: 2147483648 },
    { tableId: 3, extra: 1 },
    'un texto',
    null,
    undefined,
  ])('AC-01: moveOrderRequestSchema rechaza %s con issue en tableId', (input) => {
    expect(issuesOf(moveOrderRequestSchema, input)).toContainEqual({
      path: 'tableId',
      message: TABLE_ID_MESSAGE,
    });
  });
  it('AC-01: joinTableRequestSchema acepta un intoTableId entero válido', () => {
    const request: JoinTableRequest = { intoTableId: 5 };
    expect(joinTableRequestSchema.parse(request)).toEqual({ intoTableId: 5 });
    expect(joinTableRequestSchema.parse({ intoTableId: 1 })).toEqual({ intoTableId: 1 });
    expect(joinTableRequestSchema.parse({ intoTableId: 2147483647 })).toEqual({
      intoTableId: 2147483647,
    });
  });
  it.each([
    {},
    { intoTableId: 0 },
    { intoTableId: -3 },
    { intoTableId: 1.5 },
    { intoTableId: '5' },
    { intoTableId: null },
    { intoTableId: 2147483648 },
    { intoTableId: 5, extra: 1 },
    'un texto',
    null,
    undefined,
  ])('AC-01: joinTableRequestSchema rechaza %s con issue en intoTableId', (input) => {
    expect(issuesOf(joinTableRequestSchema, input)).toContainEqual({
      path: 'intoTableId',
      message: TABLE_ID_MESSAGE,
    });
  });

  it('AC-01: cancelOrderRequestSchema acepta el motivo y lo devuelve recortado', () => {
    const request: CancelOrderRequest = { reason: 'Mesa abierta por error' };
    expect(cancelOrderRequestSchema.parse(request)).toEqual({
      reason: 'Mesa abierta por error',
    });
    expect(cancelOrderRequestSchema.parse({ reason: '  se fueron  ' })).toEqual({
      reason: 'se fueron',
    });
    // El tope se mide sobre el texto recortado (D-009-11): 202 con bordes quedan en 200.
    expect(
      cancelOrderRequestSchema.parse({ reason: ` ${'x'.repeat(CANCEL_REASON_MAX)} ` }),
    ).toEqual({ reason: 'x'.repeat(CANCEL_REASON_MAX) });
    expect(CANCEL_REASON_MAX).toBe(200);
    expect(cancelOrderRequestSchema.parse({ reason: 'x'.repeat(CANCEL_REASON_MAX) })).toEqual({
      reason: 'x'.repeat(CANCEL_REASON_MAX),
    });
  });
  it.each([
    { reason: '' },
    { reason: '  ' },
    { reason: 'x'.repeat(CANCEL_REASON_MAX + 1) },
    { reason: 5 },
    { reason: null },
    {},
    { reason: 'ok', extra: 1 },
    'un texto',
    null,
    undefined,
  ])('AC-01: cancelOrderRequestSchema rechaza %s con su mensaje', (input) => {
    expectRejectedWith(cancelOrderRequestSchema, input, CANCEL_REASON_MESSAGE);
  });

  it('AC-02: ORDER_STATUSES es exactamente la lista de la spec', () => {
    expect(ORDER_STATUSES).toEqual(['open', 'closed', 'cancelled', 'merged']);
    const status: OrderStatus = 'merged';
    expect(status).toBe('merged');
  });
  it.each(['open', 'closed', 'cancelled', 'merged'])(
    'AC-02: orderStatusSchema acepta %s',
    (status) => {
      expect(orderStatusSchema.parse(status)).toBe(status);
    },
  );
  it.each(['abierto', 'OPEN', 'abierta', '', 'mergedd', 0, null])(
    'AC-02: orderStatusSchema rechaza %s',
    (input) => {
      expect(orderStatusSchema.safeParse(input).success).toBe(false);
    },
  );

  it('AC-02: userRefSchema y tableRefSchema son estrictos', () => {
    expect(userRefSchema.parse({ id: 2, displayName: 'Juan' })).toEqual({
      id: 2,
      displayName: 'Juan',
    });
    expect(tableRefSchema.parse({ id: 3, name: 'Mesa 3' })).toEqual({ id: 3, name: 'Mesa 3' });
    for (const input of [
      { id: 2 },
      { id: 2, displayName: 'Juan', pin: '1234' },
      { id: '2', displayName: 'Juan' },
      { id: 2, displayName: 5 },
    ])
      expect(userRefSchema.safeParse(input).success).toBe(false);
    for (const input of [
      { id: 3 },
      { id: 3, name: 'Mesa 3', extra: true },
      { id: '3', name: 'Mesa 3' },
      { id: 3, name: 5 },
    ])
      expect(tableRefSchema.safeParse(input).success).toBe(false);
  });
  it('AC-02: orderSchema acepta un pedido abierto, uno cancelado y uno fusionado', () => {
    expect(orderSchema.parse(OPEN_ORDER)).toEqual(OPEN_ORDER);
    const withMarks: Order = {
      ...OPEN_ORDER,
      readyAt: '2026-10-10T19:00:00.000Z',
      billRequestedAt: '2026-10-10T19:15:00.000Z',
    };
    expect(orderSchema.parse(withMarks)).toEqual(withMarks);
    const cancelled: Order = {
      ...OPEN_ORDER,
      status: 'cancelled',
      tables: [],
      closedAt: '2026-10-10T20:00:00.000Z',
      closedBy: { id: 1, displayName: 'Do\u00F1a Luz' },
      cancelReason: 'Se sentaron por error',
    };
    expect(orderSchema.parse(cancelled)).toEqual(cancelled);
    const merged: Order = {
      ...OPEN_ORDER,
      status: 'merged',
      tables: [],
      closedAt: '2026-10-10T20:00:00.000Z',
      closedBy: { id: 2, displayName: 'Juan' },
      mergedIntoOrderId: 14,
    };
    expect(orderSchema.parse(merged)).toEqual(merged);
  });
  it.each([
    { ...OPEN_ORDER, extra: 1 },
    { ...OPEN_ORDER, status: 'abierto' },
    { ...OPEN_ORDER, status: 'OPEN' },
    { ...OPEN_ORDER, openedAt: 'ayer' },
    { ...OPEN_ORDER, openedAt: 12345 },
    { ...OPEN_ORDER, closedBy: { id: 2, name: 'Juan' } },
    { ...OPEN_ORDER, closedBy: 'Juan' },
    { ...OPEN_ORDER, openedBy: { id: 2 } },
    { ...OPEN_ORDER, mergedIntoOrderId: '14' },
    { ...OPEN_ORDER, cancelReason: 5 },
    { ...OPEN_ORDER, tables: [{ id: 3, name: 'Mesa 3', extra: 1 }] },
    { ...OPEN_ORDER, tables: 'Mesa 3' },
    { id: 12, status: 'open', tables: [], openedBy: { id: 2, displayName: 'Juan' } },
    'un pedido',
    null,
  ])('AC-02: orderSchema rechaza %s', (input) => {
    expect(orderSchema.safeParse(input).success).toBe(false);
  });

  it('AC-02: ERROR_CODES suma los códigos de pedidos y errorResponseSchema acepta sus cuerpos', () => {
    for (const code of [
      'TABLE_NOT_FOUND',
      'ORDER_NOT_FOUND',
      'TABLE_NAME_TAKEN',
      'TABLE_OCCUPIED',
      'TABLE_INACTIVE',
      'TABLE_HAS_OPEN_ORDER',
      'TABLE_HAS_NO_ORDER',
      'ORDER_NOT_OPEN',
      'ORDER_NEEDS_TABLE',
    ])
      expect(ERROR_CODES).toHaveProperty(code, code);
    // 'ORDER_PAID' no es un código del sistema (el "rechaza" de la spec, AC-02):
    // el filtro es la lista cerrada ERROR_CODES, porque errorResponseSchema
    // acepta por diseño cualquier código en mayúsculas.
    expect(Object.values(ERROR_CODES)).not.toContain('ORDER_PAID');
    expect(errorResponseSchema.safeParse(ORDER_NOT_FOUND_BODY).success).toBe(true);
    expect(errorResponseSchema.safeParse(ORDER_NOT_OPEN_BODY).success).toBe(true);
    expect(errorResponseSchema.safeParse(ORDER_NEEDS_TABLE_BODY).success).toBe(true);
  });
});
