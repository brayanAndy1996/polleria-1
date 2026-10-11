// AC-01 y AC-02. Spec 010 — archivo nuevo: va EN ROJO hasta que T-07 cree
// packages/shared/src/order-items.ts y amplíe orders.ts y errors.ts.
import { describe, expect, it } from 'vitest';
import {
  ERROR_CODES,
  IDEMPOTENCY_KEY_MAX,
  KITCHEN_TICKET_KINDS,
  ORDER_ACTIVE_ITEMS_MAX,
  ORDER_ITEM_NOTES_MAX,
  ORDER_ITEM_QUANTITY_MAX,
  ORDER_ITEM_SAUCES_MAX,
  ORDER_ITEM_STATUSES,
  ORDER_ITEMS_PER_SEND_MAX,
  PORTION_CUT_MESSAGE,
  errorResponseSchema,
  idempotencyKeySchema,
  kitchenTicketSchema,
  kitchenTicketsResponseSchema,
  menuProductSchema,
  menuResponseSchema,
  orderItemInputSchema,
  orderItemSchema,
  orderResponseSchema,
  orderSchema,
  sendOrderItemsRequestSchema,
  sendOrderItemsResponseSchema,
  voidOrderItemRequestSchema,
} from '@polleria/shared';
import type { Order, OrderItem } from '@polleria/shared';

const PRODUCT_ID_MESSAGE = 'El identificador del producto no es v\u00E1lido.';
const QUANTITY_MESSAGE = 'Indica cu\u00E1ntas unidades lleva el \u00EDtem.';
const NOTES_MESSAGE = 'La observaci\u00F3n admite hasta 200 caracteres en una sola l\u00EDnea.';
const CUT_WITHOUT_PORTION_MESSAGE = 'Sin presentaci\u00F3n no se puede indicar la parte.';
const SAUCES_MAX_MESSAGE = 'Un \u00EDtem admite hasta 6 cremas.';
const COMPONENTS_MAX_MESSAGE = 'Un \u00EDtem admite hasta 10 componentes.';
const ITEMS_MIN_MESSAGE = 'Indica al menos un \u00EDtem.';
const ITEMS_MAX_MESSAGE = 'Un env\u00EDo admite hasta 20 \u00EDtems.';
const REASON_MESSAGE = 'Escribe el motivo de la anulaci\u00F3n (hasta 200 caracteres).';
const IDEMPOTENCY_KEY_MESSAGE = 'El env\u00EDo necesita la cabecera Idempotency-Key.';

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

/** Comprueba que el esquema rechaza la entrada y que algún issue trae el mensaje. */
function expectRejectedWith(
  schema: { safeParse: (input: unknown) => unknown },
  input: unknown,
  message: string,
) {
  const issues = issuesOf(schema, input);
  expect(issues.map((issue) => issue.message)).toContain(message);
}

/** Un ítem 'sent' mínimo y válido de la respuesta (forma de AC-02). */
const SENT_ITEM = {
  id: 31,
  productId: 5,
  productName: 'Pollo a la brasa',
  productCategory: 'chicken',
  quantity: 1,
  priceCents: 1400,
  portion: 'quarter',
  cut: 'leg',
  breastEighths: 0,
  legEighths: 2,
  notes: null,
  sauces: [],
  components: [],
  status: 'sent',
  kitchenTicketId: 8,
  voidTicketId: null,
  voidedBy: null,
  voidedAt: null,
  voidReason: null,
  voidRequestedBy: null,
  voidRequestedAt: null,
  voidRequestReason: null,
  orderedAtTable: { id: 3, name: 'Mesa 3' },
  createdBy: { id: 2, displayName: 'Juan' },
  createdAt: '2026-10-11T18:35:00.000Z',
} satisfies OrderItem;

/** Pedido abierto válido con las trece claves de D-010-14. */
const OPEN_ORDER = {
  id: 12,
  status: 'open',
  tables: [{ id: 3, name: 'Mesa 3' }],
  openedBy: { id: 2, displayName: 'Juan' },
  openedAt: '2026-10-11T18:30:00.000Z',
  readyAt: null,
  billRequestedAt: null,
  closedAt: null,
  closedBy: null,
  cancelReason: null,
  mergedIntoOrderId: null,
  items: [SENT_ITEM],
  totalCents: 1400,
} satisfies Order;

const SENT_TICKET = {
  id: 8,
  orderId: 12,
  kind: 'initial',
  items: [SENT_ITEM],
  createdBy: { id: 2, displayName: 'Juan' },
  createdAt: '2026-10-11T18:35:00.000Z',
};

describe('010: esquemas de ítems del pedido, comandas, menú y Order ampliado', () => {
  it('AC-01: orderItemInputSchema acepta el ítem mínimo y el completo', () => {
    expect(orderItemInputSchema.parse({ productId: 5 })).toEqual({ productId: 5, quantity: 1 });
    expect(
      orderItemInputSchema.parse({
        productId: 5,
        quantity: 2,
        portion: 'quarter',
        cut: 'leg',
        notes: 'sin ensalada',
        sauces: [{ productId: 9 }, { productId: 10, quantity: 2 }],
      }),
    ).toMatchObject({ productId: 5, quantity: 2, portion: 'quarter', cut: 'leg' });
    expect(
      orderItemInputSchema.parse({
        productId: 7,
        components: [{ productId: 5, quantity: 1, portion: 'quarter', cut: 'leg' }],
      }),
    ).toMatchObject({ productId: 7 });
  });
  it.each([
    { productId: 0 },
    { productId: -2 },
    { productId: 'x' },
    { productId: 1.5 },
    { productId: 2147483648 },
    { productId: null },
    {},
  ])('AC-01: orderItemInputSchema rechaza %s con issue en productId', (input) => {
    expect(issuesOf(orderItemInputSchema, input)).toContainEqual({
      path: 'productId',
      message: PRODUCT_ID_MESSAGE,
    });
  });
  it.each([
    { productId: 5, quantity: 0 },
    { productId: 5, quantity: 100 },
    { productId: 5, quantity: 1.5 },
    { productId: 5, quantity: '2' },
  ])('AC-01: orderItemInputSchema rechaza %s con issue en quantity', (input) => {
    expect(issuesOf(orderItemInputSchema, input)).toContainEqual({
      path: 'quantity',
      message: QUANTITY_MESSAGE,
    });
  });
  it('AC-01: una clave de más en el ítem, la crema o el componente falla', () => {
    expect(orderItemInputSchema.safeParse({ productId: 5, extra: 1 }).success).toBe(false);
    expect(
      orderItemInputSchema.safeParse({ productId: 5, sauces: [{ productId: 9, extra: 1 }] })
        .success,
    ).toBe(false);
    expect(
      orderItemInputSchema.safeParse({
        productId: 7,
        components: [{ productId: 5, quantity: 1, extra: 1 }],
      }).success,
    ).toBe(false);
  });

  it('AC-01: la correspondencia presentación-parte es la de la 006', () => {
    expect(
      orderItemInputSchema.parse({ productId: 5, portion: 'quarter', cut: 'leg' }),
    ).toMatchObject({ portion: 'quarter', cut: 'leg' });
    for (const portion of ['eighth', 'quarter'])
      for (const cut of ['breast', 'leg'])
        expect(orderItemInputSchema.parse({ productId: 5, portion, cut })).toMatchObject({
          portion,
          cut,
        });
    for (const portion of ['half', 'whole'])
      expect(orderItemInputSchema.parse({ productId: 5, portion })).toMatchObject({ portion });
  });
  it.each([
    { productId: 5, portion: 'cuarto', cut: 'leg' },
    { productId: 5, portion: 'medio' },
    { productId: 5, portion: 'quarter' },
    { productId: 5, portion: 'eighth' },
    { productId: 5, portion: 'half', cut: 'leg' },
    { productId: 5, portion: 'whole', cut: 'breast' },
    { productId: 5, portion: 'quarter', cut: 'ala' },
    { productId: 5, cut: 'leg' },
  ])('AC-01: orderItemInputSchema rechaza %s por presentación-parte', (input) => {
    const issues = issuesOf(orderItemInputSchema, input);
    expect(issues.length).toBeGreaterThan(0);
  });
  it.each([
    { productId: 5, portion: 'quarter' },
    { productId: 5, portion: 'eighth' },
    { productId: 5, portion: 'half', cut: 'leg' },
    { productId: 5, portion: 'whole', cut: 'breast' },
  ])('AC-01: %s cae con PORTION_CUT_MESSAGE', (input) => {
    expect(issuesOf(orderItemInputSchema, input)).toContainEqual(
      expect.objectContaining({ message: PORTION_CUT_MESSAGE }),
    );
  });
  it('AC-01: cut sin portion cae con su mensaje, también dentro de un componente', () => {
    expect(issuesOf(orderItemInputSchema, { productId: 5, cut: 'leg' })).toContainEqual(
      expect.objectContaining({ message: CUT_WITHOUT_PORTION_MESSAGE }),
    );
    expect(
      issuesOf(orderItemInputSchema, {
        productId: 7,
        components: [{ productId: 5, quantity: 1, cut: 'leg' }],
      }),
    ).toContainEqual(expect.objectContaining({ message: CUT_WITHOUT_PORTION_MESSAGE }));
  });

  it('AC-01: notes recorta, normaliza vacío a null y rechaza saltos y exceso', () => {
    expect(orderItemInputSchema.parse({ productId: 5, notes: '  sin ensalada  ' }).notes).toBe(
      'sin ensalada',
    );
    for (const notes of ['', '   '])
      expect(orderItemInputSchema.parse({ productId: 5, notes }).notes).toBeNull();
    expect(orderItemInputSchema.parse({ productId: 5, notes: 'x'.repeat(200) }).notes).toBe(
      'x'.repeat(200),
    );
    for (const notes of ['x'.repeat(201), 'l\u00EDnea1\nl\u00EDnea2', '\t', 'a\u0007b']) {
      const issues = issuesOf(orderItemInputSchema, { productId: 5, notes });
      expect(issues).toContainEqual(expect.objectContaining({ message: NOTES_MESSAGE }));
    }
    expect(ORDER_ITEM_NOTES_MAX).toBe(200);
  });

  it('AC-01: breastEighths/legEighths admiten 0-8 enteros y rechazan lo demás', () => {
    expect(
      orderItemInputSchema.parse({
        productId: 5,
        portion: 'half',
        breastEighths: 1,
        legEighths: 3,
      }),
    ).toMatchObject({ breastEighths: 1, legEighths: 3 });
    for (const eighths of [-1, 9, 1.5, '2', null])
      for (const field of ['breastEighths', 'legEighths']) {
        const issues = issuesOf(orderItemInputSchema, {
          productId: 5,
          portion: 'half',
          [field]: eighths,
        });
        expect(issues.length).toBeGreaterThan(0);
      }
  });

  it('AC-01: sauces admite hasta 6 con quantity 1-99 y forma estricta', () => {
    expect(
      orderItemInputSchema.parse({ productId: 5, sauces: [{ productId: 9, quantity: 2 }] }),
    ).toMatchObject({ sauces: [{ productId: 9, quantity: 2 }] });
    const six = Array.from({ length: ORDER_ITEM_SAUCES_MAX }, (_, i) => ({ productId: i + 1 }));
    expect(orderItemInputSchema.parse({ productId: 5, sauces: six }).sauces).toHaveLength(
      ORDER_ITEM_SAUCES_MAX,
    );
    expect(ORDER_ITEM_SAUCES_MAX).toBe(6);
    const seven = Array.from({ length: 7 }, (_, i) => ({ productId: i + 1 }));
    expect(issuesOf(orderItemInputSchema, { productId: 5, sauces: seven })).toContainEqual(
      expect.objectContaining({ message: SAUCES_MAX_MESSAGE }),
    );
    for (const sauce of [{ productId: 0 }, { productId: 'x' }, { productId: 9, quantity: 0 }])
      expect(orderItemInputSchema.safeParse({ productId: 5, sauces: [sauce] }).success).toBe(false);
  });

  it('AC-01: components admite hasta 10 con la misma forma que su padre', () => {
    expect(
      orderItemInputSchema.parse({
        productId: 7,
        components: [{ productId: 5, quantity: 1, portion: 'quarter', cut: 'leg' }],
      }),
    ).toMatchObject({
      components: [{ productId: 5, quantity: 1, portion: 'quarter', cut: 'leg' }],
    });
    const eleven = Array.from({ length: 11 }, (_, i) => ({ productId: i + 1, quantity: 1 }));
    expect(issuesOf(orderItemInputSchema, { productId: 7, components: eleven })).toContainEqual(
      expect.objectContaining({ message: COMPONENTS_MAX_MESSAGE }),
    );
  });

  it('AC-01: sendOrderItemsRequestSchema exige 1 a 20 ítems y forma estricta', () => {
    expect(sendOrderItemsRequestSchema.parse({ items: [{ productId: 5 }] }).items).toHaveLength(1);
    expect(issuesOf(sendOrderItemsRequestSchema, { items: [] })).toContainEqual(
      expect.objectContaining({ message: ITEMS_MIN_MESSAGE }),
    );
    const twentyOne = Array.from({ length: 21 }, () => ({ productId: 5 }));
    expect(issuesOf(sendOrderItemsRequestSchema, { items: twentyOne })).toContainEqual(
      expect.objectContaining({ message: ITEMS_MAX_MESSAGE }),
    );
    expect(
      sendOrderItemsRequestSchema.safeParse({ items: [{ productId: 5 }], extra: 1 }).success,
    ).toBe(false);
    expect(ORDER_ITEMS_PER_SEND_MAX).toBe(20);
    expect(ORDER_ITEM_QUANTITY_MAX).toBe(99);
    expect(ORDER_ACTIVE_ITEMS_MAX).toBe(99);
  });

  it('AC-01: voidOrderItemRequestSchema recorta el motivo y exige 1-200', () => {
    expect(voidOrderItemRequestSchema.parse({ reason: 'Se equivoc\u00F3 el cliente' })).toEqual({
      reason: 'Se equivoc\u00F3 el cliente',
    });
    expect(voidOrderItemRequestSchema.parse({ reason: '  ok  ' })).toEqual({ reason: 'ok' });
    for (const input of [
      {},
      { reason: '' },
      { reason: '  ' },
      { reason: 'x'.repeat(201) },
      { reason: 5 },
      { reason: 'ok', extra: 1 },
      'un texto',
      null,
    ])
      expectRejectedWith(voidOrderItemRequestSchema, input, REASON_MESSAGE);
  });

  it('AC-01: idempotencyKeySchema admite 1-128 ASCII visibles y rechaza lo demás', () => {
    expect(idempotencyKeySchema.parse('abc-123')).toBe('abc-123');
    expect(idempotencyKeySchema.parse('k'.repeat(IDEMPOTENCY_KEY_MAX))).toHaveLength(
      IDEMPOTENCY_KEY_MAX,
    );
    expect(IDEMPOTENCY_KEY_MAX).toBe(128);
    for (const key of ['', 'k'.repeat(129), 'con espacio', 'tild\u00E9', 'l\u00EDnea\n2'])
      expectRejectedWith(idempotencyKeySchema, key, IDEMPOTENCY_KEY_MESSAGE);
    expectRejectedWith(idempotencyKeySchema, undefined, IDEMPOTENCY_KEY_MESSAGE);
  });

  it('AC-02: los enums son exactamente las listas de la spec', () => {
    expect(ORDER_ITEM_STATUSES).toEqual(['sent', 'void_requested', 'voided']);
    expect(KITCHEN_TICKET_KINDS).toEqual(['initial', 'additional', 'void']);
  });

  it('AC-02: orderItemSchema es estricto con los nulables de la spec', () => {
    expect(orderItemSchema.parse(SENT_ITEM)).toEqual(SENT_ITEM);
    const voided = {
      ...SENT_ITEM,
      status: 'voided',
      voidTicketId: 9,
      voidedBy: { id: 1, displayName: 'Do\u00F1a Luz' },
      voidedAt: '2026-10-11T19:00:00.000Z',
      voidReason: 'Confirmado',
    };
    expect(orderItemSchema.parse(voided)).toEqual(voided);
    const requested = {
      ...SENT_ITEM,
      status: 'void_requested',
      voidRequestedBy: { id: 2, displayName: 'Juan' },
      voidRequestedAt: '2026-10-11T18:45:00.000Z',
      voidRequestReason: 'Se equivoc\u00F3 el cliente',
    };
    expect(orderItemSchema.parse(requested)).toEqual(requested);
    const full = {
      ...SENT_ITEM,
      notes: 'sin ensalada',
      sauces: [{ productId: 9, productName: 'Aj\u00ED', quantity: 2, priceCents: 0 }],
      components: [
        {
          productId: 5,
          productName: 'Pollo a la brasa',
          quantity: 1,
          portion: 'quarter',
          cut: 'leg',
          breastEighths: 0,
          legEighths: 2,
        },
      ],
      orderedAtTable: null,
    };
    expect(orderItemSchema.parse(full)).toEqual(full);
  });
  it.each([
    { ...SENT_ITEM, extra: 1 },
    { ...SENT_ITEM, status: 'anulado' },
    { ...SENT_ITEM, status: 'SENT' },
    { ...SENT_ITEM, notes: 5 },
    { ...SENT_ITEM, voidedAt: 'ayer' },
    { ...SENT_ITEM, sauces: [{ productId: 9 }] },
    { ...SENT_ITEM, components: [{ productId: 5, productName: 'X', quantity: 1 }] },
  ])('AC-02: orderItemSchema rechaza %s', (input) => {
    expect(orderItemSchema.safeParse(input).success).toBe(false);
  });

  it('AC-02: kitchenTicketSchema y sus respuestas son estrictos', () => {
    expect(kitchenTicketSchema.parse(SENT_TICKET)).toEqual(SENT_TICKET);
    for (const kind of ['initial', 'additional', 'void'])
      expect(kitchenTicketSchema.parse({ ...SENT_TICKET, kind }).kind).toBe(kind);
    expect(kitchenTicketSchema.safeParse({ ...SENT_TICKET, kind: 'comanda' }).success).toBe(false);
    expect(kitchenTicketSchema.safeParse({ ...SENT_TICKET, extra: 1 }).success).toBe(false);
    expect(kitchenTicketsResponseSchema.parse({ tickets: [SENT_TICKET] })).toEqual({
      tickets: [SENT_TICKET],
    });
    expect(kitchenTicketsResponseSchema.parse({ tickets: [] })).toEqual({ tickets: [] });
    expect(kitchenTicketsResponseSchema.safeParse({ tickets: [], extra: 1 }).success).toBe(false);
    expect(sendOrderItemsResponseSchema.parse({ order: OPEN_ORDER, ticket: SENT_TICKET })).toEqual({
      order: OPEN_ORDER,
      ticket: SENT_TICKET,
    });
    expect(
      sendOrderItemsResponseSchema.safeParse({ order: OPEN_ORDER, ticket: SENT_TICKET, extra: 1 })
        .success,
    ).toBe(false);
    expect(orderResponseSchema.parse({ order: OPEN_ORDER })).toEqual({ order: OPEN_ORDER });
    expect(orderResponseSchema.safeParse({ order: OPEN_ORDER, extra: 1 }).success).toBe(false);
  });

  it('AC-02: orderSchema exige items (lista) y totalCents (entero >= 0)', () => {
    expect(orderSchema.parse(OPEN_ORDER)).toEqual(OPEN_ORDER);
    expect(orderSchema.parse({ ...OPEN_ORDER, items: [], totalCents: 0 })).toMatchObject({
      items: [],
      totalCents: 0,
    });
    const elevenKeys = Object.fromEntries(
      Object.entries(OPEN_ORDER).filter(([key]) => !['items', 'totalCents'].includes(key)),
    );
    expect(orderSchema.safeParse(elevenKeys).success).toBe(false);
    for (const bad of [
      { ...OPEN_ORDER, items: 'nada' },
      { ...OPEN_ORDER, items: [{ id: 1 }] },
      { ...OPEN_ORDER, totalCents: -1 },
      { ...OPEN_ORDER, totalCents: 1.5 },
      { ...OPEN_ORDER, totalCents: '1600' },
    ])
      expect(orderSchema.safeParse(bad).success).toBe(false);
  });

  it('AC-02: menuProductSchema y menuResponseSchema son estrictos', () => {
    const chicken = {
      id: 5,
      name: 'Pollo a la brasa',
      category: 'chicken',
      priceCents: 4800,
      portions: [
        { portion: 'quarter', cut: 'breast', priceCents: 1500 },
        { portion: 'quarter', cut: 'leg', priceCents: 1400 },
        { portion: 'half', cut: null, priceCents: 2600 },
        { portion: 'whole', cut: null, priceCents: 4800 },
      ],
      items: [],
    };
    const component = {
      id: 7,
      name: 'Inca Kola 1L',
      category: 'drink',
      priceCents: 800,
      isActive: true,
    };
    const combo = {
      id: 20,
      name: 'Mostrito',
      category: 'combo',
      priceCents: 2200,
      portions: [],
      items: [{ product: component, quantity: 1, portion: null, cut: null }],
    };
    expect(menuProductSchema.parse(chicken)).toEqual(chicken);
    expect(menuProductSchema.parse(combo)).toEqual(combo);
    expect(menuResponseSchema.parse({ products: [chicken, combo] })).toEqual({
      products: [chicken, combo],
    });
    for (const bad of [
      { ...chicken, extra: 1 },
      { ...chicken, portions: [{ portion: 'quarter', cut: 'leg' }] },
      { ...combo, items: [{ product: component, quantity: 1 }] },
      { ...chicken, priceCents: '1400' },
    ])
      expect(menuProductSchema.safeParse(bad).success).toBe(false);
    expect(menuResponseSchema.safeParse({ products: [], extra: 1 }).success).toBe(false);
  });

  it('AC-02: ERROR_CODES suma los siete códigos y errorResponseSchema acepta sus cuerpos', () => {
    for (const code of [
      'ORDER_ITEM_NOT_FOUND',
      'ORDER_ITEM_ALREADY_VOIDED',
      'ORDER_ITEM_VOID_REQUESTED',
      'ORDER_ITEM_NOT_REQUESTED',
      'ORDER_HAS_ACTIVE_ITEMS',
      'ORDER_ITEMS_LIMIT',
      'IDEMPOTENCY_CONFLICT',
    ])
      expect(ERROR_CODES).toHaveProperty(code, code);
    expect(
      errorResponseSchema.safeParse({
        error: {
          code: 'IDEMPOTENCY_CONFLICT',
          message: 'Esa clave de env\u00EDo ya se us\u00F3 con otros datos.',
          details: null,
        },
      }).success,
    ).toBe(true);
    expect(
      errorResponseSchema.safeParse({
        error: {
          code: 'ORDER_HAS_ACTIVE_ITEMS',
          message:
            'El pedido tiene \u00EDtems sin anular; un administrador debe anularlos primero.',
          details: null,
        },
      }).success,
    ).toBe(true);
  });
});
