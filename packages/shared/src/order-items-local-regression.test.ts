// Preserva la variante local de pruebas conciliada sin perder sus casos.
// AC-01 y AC-02. Spec 010 — archivo nuevo: va EN ROJO hasta que T-07 cree
// packages/shared/src/order-items.ts, amplíe orders.ts/errors.ts y lo exporte.
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
  sendOrderItemsRequestSchema,
  sendOrderItemsResponseSchema,
  voidOrderItemRequestSchema,
} from '@polleria/shared';
import type { Order } from '@polleria/shared';

// El contrato de notes se prueba mediante el campo del esquema público.
const orderItemNotesSchema = orderItemInputSchema.shape.notes.unwrap();

const PRODUCT_ID_MESSAGE = 'El identificador del producto no es v\u00E1lido.';
const QUANTITY_MESSAGE = 'Indica cu\u00E1ntas unidades lleva el \u00EDtem.';
const NOTES_MESSAGE = 'La observaci\u00F3n admite hasta 200 caracteres en una sola l\u00EDnea.';
const CUT_WITHOUT_PORTION_MESSAGE = 'Sin presentaci\u00F3n no se puede indicar la parte.';
const ITEMS_MIN_MESSAGE = 'Indica al menos un \u00EDtem.';
const ITEMS_MAX_MESSAGE = 'Un env\u00EDo admite hasta 20 \u00EDtems.';
const SAUCES_MAX_MESSAGE = 'Un \u00EDtem admite hasta 6 cremas.';
const COMPONENTS_MAX_MESSAGE = 'Un \u00EDtem admite hasta 10 componentes.';
const VOID_REASON_MESSAGE = 'Escribe el motivo de la anulaci\u00F3n (hasta 200 caracteres).';
const IDEMPOTENCY_KEY_MESSAGE = 'El env\u00EDo necesita la cabecera Idempotency-Key.';

/** Issues { path, message } de una entrada rechazada por un esquema Zod. */
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

/** Comprueba el rechazo y que al menos un issue trae el mensaje exacto. */
function expectRejectedWith(
  schema: { safeParse: (input: unknown) => unknown },
  input: unknown,
  message: string,
) {
  const issues = issuesOf(schema, input);
  expect(issues.map((issue) => issue.message)).toContain(message);
}

/** El pedido mínimo que usan las respuestas con `order` embebido. */
const ORDER_SHAPE: Order = {
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
  items: [],
  totalCents: 0,
};

/** Un ítem del pedido válido: las 25 claves de orderItemSchema (AC-02). */
const VALID_ITEM = {
  id: 31,
  productId: 5,
  productName: 'Pollo a la brasa',
  productCategory: 'chicken',
  quantity: 2,
  priceCents: 1400,
  portion: 'quarter',
  cut: 'leg',
  breastEighths: 0,
  legEighths: 4,
  notes: 'sin ensalada',
  sauces: [
    { productId: 9, productName: 'Aj\u00ED', quantity: 1, priceCents: 0 },
    { productId: 10, productName: 'Ocopa', quantity: 2, priceCents: 300 },
  ],
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
};

/** Una comanda válida: las seis claves de kitchenTicketSchema con sus ítems. */
const VALID_TICKET = {
  id: 8,
  orderId: 12,
  kind: 'initial',
  items: [VALID_ITEM],
  createdBy: { id: 2, displayName: 'Juan' },
  createdAt: '2026-10-11T18:35:00.000Z',
};

describe('010: esquemas de los ítems del pedido', () => {
  it('AC-01: orderItemInputSchema acepta la forma mínima y pone quantity 1 por defecto', () => {
    expect(orderItemInputSchema.parse({ productId: 5 })).toMatchObject({
      productId: 5,
      quantity: 1,
    });
    expect(
      orderItemInputSchema.parse({ productId: 5, quantity: 2, notes: 'sin ensalada' }),
    ).toMatchObject({ productId: 5, quantity: 2, notes: 'sin ensalada' });
    // Los opcionales pueden ir explícitos con los valores completos.
    const completo = orderItemInputSchema.parse({
      productId: 5,
      quantity: 3,
      portion: 'quarter',
      cut: 'leg',
      sauces: [{ productId: 9 }],
      components: [{ productId: 7, quantity: 1, portion: 'quarter', cut: 'leg' }],
      notes: 'bien dorado',
    });
    expect(completo).toMatchObject({ productId: 5, quantity: 3, portion: 'quarter', cut: 'leg' });
  });
  it.each([
    { productId: 0 },
    { productId: -2 },
    { productId: 'x' },
    { productId: 1.5 },
    { productId: 2147483648 },
    { productId: null },
    {},
  ])('AC-01: orderItemInputSchema rechaza el productId %s con su mensaje', (input) => {
    expect(issuesOf(orderItemInputSchema, input)).toContainEqual({
      path: 'productId',
      message: PRODUCT_ID_MESSAGE,
    });
  });
  it.each(['un texto', null, 5, [1]])(
    'AC-01: orderItemInputSchema rechaza la entrada no-objeto %s',
    (input) => {
      expect(orderItemInputSchema.safeParse(input).success).toBe(false);
    },
  );
  it.each([
    { quantity: 0 },
    { quantity: 100 },
    { quantity: -1 },
    { quantity: 1.5 },
    { quantity: '2' },
  ])('AC-01: orderItemInputSchema rechaza quantity %s con su mensaje', (fields) => {
    expect(issuesOf(orderItemInputSchema, { productId: 5, ...fields })).toContainEqual({
      path: 'quantity',
      message: QUANTITY_MESSAGE,
    });
  });
  it.each([
    { productId: 5, extra: 1 },
    { productId: 5, quantity: 1, precio: 100 },
  ])('AC-01: orderItemInputSchema es estricto y rechaza la clave de más %s', (input) => {
    expect(orderItemInputSchema.safeParse(input).success).toBe(false);
  });

  it('AC-01: orderItemInputSchema valida la correspondencia presentación-parte', () => {
    expect(
      orderItemInputSchema.parse({ productId: 5, portion: 'quarter', cut: 'leg' }),
    ).toMatchObject({ portion: 'quarter', cut: 'leg' });
    expect(orderItemInputSchema.parse({ productId: 5, portion: 'half' })).toMatchObject({
      portion: 'half',
    });
    expect(orderItemInputSchema.parse({ productId: 5, portion: 'whole' })).toMatchObject({
      portion: 'whole',
    });
    expect(
      orderItemInputSchema.parse({ productId: 5, portion: 'eighth', cut: 'breast' }),
    ).toMatchObject({ portion: 'eighth', cut: 'breast' });
  });
  it.each([{ portion: 'cuarto', cut: 'leg' }, { portion: 'mitad' }, { portion: 5, cut: 'leg' }])(
    'AC-01: una presentación fuera de PORTIONS %s falla',
    (fields) => {
      expect(orderItemInputSchema.safeParse({ productId: 5, ...fields }).success).toBe(false);
    },
  );
  it.each([
    // eighth/quarter exigen parte; half/whole la rechazan (PORTION_CUT_MESSAGE).
    { portion: 'quarter' },
    { portion: 'eighth' },
    { portion: 'half', cut: 'breast' },
    { portion: 'whole', cut: 'leg' },
  ])('AC-01: la correspondencia presentación-parte %s lleva PORTION_CUT_MESSAGE', (fields) => {
    expect(issuesOf(orderItemInputSchema, { productId: 5, ...fields })).toContainEqual({
      path: 'cut',
      message: PORTION_CUT_MESSAGE,
    });
  });
  it('AC-01: cut sin portion falla con su propio mensaje', () => {
    expect(issuesOf(orderItemInputSchema, { productId: 5, cut: 'leg' })).toContainEqual({
      path: 'cut',
      message: CUT_WITHOUT_PORTION_MESSAGE,
    });
    // portion explícita en null con cut puesto es el mismo caso.
    const nullPortion = issuesOf(orderItemInputSchema, {
      productId: 5,
      portion: null,
      cut: 'breast',
    });
    expect(nullPortion.length).toBeGreaterThan(0);
    expect(nullPortion.map((issue) => issue.path)).toContain('portion');
  });

  it('AC-01: orderItemNotesSchema recorta, normaliza a NFC y acepta 200 caracteres', () => {
    expect(orderItemNotesSchema.parse('  sin ensalada  ')).toBe('sin ensalada');
    // La eñe compuesta en NFD queda en su forma NFC (regla de la spec).
    expect(orderItemNotesSchema.parse('sin ali\u00F1o extra n\u0323')).toBe(
      'sin ali\u00F1o extra n\u0323'.normalize('NFC'),
    );
    expect(orderItemNotesSchema.parse('x'.repeat(ORDER_ITEM_NOTES_MAX))).toBe(
      'x'.repeat(ORDER_ITEM_NOTES_MAX),
    );
    expect(ORDER_ITEM_NOTES_MAX).toBe(200);
  });
  it.each(['', '   ', '\u00A0'])(
    'AC-01: orderItemNotesSchema normaliza la observación vacía %s a null',
    (input) => {
      expect(orderItemNotesSchema.parse(input)).toBeNull();
    },
  );
  it.each([
    'x'.repeat(201),
    'l\u00EDnea1\nl\u00EDnea2',
    'con\ttabulador',
    'con\rretorno',
    'bell\u0007',
    5,
    null,
  ])('AC-01: orderItemNotesSchema rechaza %s con su mensaje', (input) => {
    expectRejectedWith(orderItemNotesSchema, input, NOTES_MESSAGE);
  });
  it('AC-01: notes dentro del ítem usa la misma normalización y el mismo rechazo', () => {
    expect(orderItemInputSchema.parse({ productId: 5, notes: '  con aj\u00ED  ' })).toMatchObject({
      notes: 'con aj\u00ED',
    });
    expect(orderItemInputSchema.parse({ productId: 5, notes: '' })).toMatchObject({
      notes: null,
    });
    for (const notes of ['x'.repeat(201), 'a\nb'])
      expect(issuesOf(orderItemInputSchema, { productId: 5, notes })).toContainEqual({
        path: 'notes',
        message: NOTES_MESSAGE,
      });
  });

  it('AC-01: breastEighths/legEighths aceptan enteros de 0 a 8 por forma', () => {
    expect(
      orderItemInputSchema.parse({
        productId: 5,
        portion: 'half',
        breastEighths: 1,
        legEighths: 3,
      }),
    ).toMatchObject({ breastEighths: 1, legEighths: 3 });
    expect(
      orderItemInputSchema.parse({
        productId: 5,
        portion: 'half',
        breastEighths: 0,
        legEighths: 4,
      }),
    ).toMatchObject({ breastEighths: 0, legEighths: 4 });
    // También dentro de un componente del combo.
    expect(
      orderItemInputSchema.parse({
        productId: 20,
        components: [
          { productId: 5, quantity: 1, portion: 'half', breastEighths: 4, legEighths: 0 },
        ],
      }).components,
    ).toEqual([
      expect.objectContaining({
        productId: 5,
        quantity: 1,
        portion: 'half',
        breastEighths: 4,
        legEighths: 0,
      }),
    ]);
  });
  it.each([
    { breastEighths: -1 },
    { legEighths: -1 },
    { breastEighths: 9 },
    { legEighths: 9 },
    { breastEighths: 1.5 },
    { legEighths: '2' },
  ])('AC-01: los octavos %s fuera de forma fallan', (fields) => {
    expect(
      orderItemInputSchema.safeParse({ productId: 5, portion: 'half', ...fields }).success,
    ).toBe(false);
  });

  it('AC-01: sauces acepta hasta 6 cremas con quantity por defecto 1', () => {
    expect(orderItemInputSchema.parse({ productId: 5, sauces: [{ productId: 9 }] }).sauces).toEqual(
      [{ productId: 9, quantity: 1 }],
    );
    const seis = Array.from({ length: ORDER_ITEM_SAUCES_MAX }, (_, index) => ({
      productId: index + 1,
      quantity: 2,
    }));
    expect(ORDER_ITEM_SAUCES_MAX).toBe(6);
    expect(orderItemInputSchema.parse({ productId: 5, sauces: seis }).sauces).toHaveLength(6);
  });
  it('AC-01: más de 6 cremas falla con el mensaje del tope', () => {
    const siete = Array.from({ length: 7 }, (_, index) => ({ productId: index + 1 }));
    expectRejectedWith(orderItemInputSchema, { productId: 5, sauces: siete }, SAUCES_MAX_MESSAGE);
  });
  it.each([
    [{ productId: 0 }],
    [{ productId: 'x' }],
    [{ productId: 9, quantity: 0 }],
    [{ productId: 9, quantity: 100 }],
    [{ productId: 9, extra: 1 }],
    [{}],
  ])('AC-01: una crema interna inválida %s falla por forma', (sauces) => {
    expect(orderItemInputSchema.safeParse({ productId: 5, sauces }).success).toBe(false);
  });
  // "Hay cremas repetidas en el ítem." se verifica en el servicio con el path
  // items.N.sauces (tabla D-010-18): no se exige al esquema suelto.

  it('AC-01: components acepta hasta 10 filas con la misma forma interna', () => {
    expect(
      orderItemInputSchema.parse({
        productId: 20,
        components: [{ productId: 7, quantity: 1, portion: 'quarter', cut: 'leg' }],
      }).components,
    ).toEqual([
      expect.objectContaining({ productId: 7, quantity: 1, portion: 'quarter', cut: 'leg' }),
    ]);
    const diez = Array.from({ length: 10 }, (_, index) => ({
      productId: index + 1,
      quantity: 1,
    }));
    expect(orderItemInputSchema.parse({ productId: 20, components: diez }).components).toHaveLength(
      10,
    );
  });
  it.each([[Array.from({ length: 11 }, (_, index) => ({ productId: index + 1, quantity: 1 }))]])(
    'AC-01: más de 10 componentes falla con el mensaje del tope',
    (components) => {
      expectRejectedWith(
        orderItemInputSchema,
        { productId: 20, components },
        COMPONENTS_MAX_MESSAGE,
      );
    },
  );
  it.each([
    [{ productId: 0, quantity: 1 }],
    [{ quantity: 1 }],
    [{ productId: 7 }],
    [{ productId: 7, quantity: 0 }],
    [{ productId: 7, quantity: 1, portion: 'cuarto' }],
    [{ productId: 7, quantity: 1, cut: 'leg' }],
    [{ productId: 7, quantity: 1, portion: 'half', cut: 'breast' }],
    [{ productId: 7, quantity: 1, extra: 1 }],
  ])('AC-01: un componente interno inválido %s falla por forma', (components) => {
    expect(orderItemInputSchema.safeParse({ productId: 20, components }).success).toBe(false);
  });
  it('AC-01: cut sin portion dentro de un componente lleva su mensaje', () => {
    expect(
      issuesOf(orderItemInputSchema, {
        productId: 20,
        components: [{ productId: 7, quantity: 1, cut: 'leg' }],
      }),
    ).toContainEqual({ path: 'components.0.cut', message: CUT_WITHOUT_PORTION_MESSAGE });
    expect(
      issuesOf(orderItemInputSchema, {
        productId: 20,
        components: [{ productId: 7, quantity: 1, portion: 'quarter' }],
      }),
    ).toContainEqual({ path: 'components.0.cut', message: PORTION_CUT_MESSAGE });
  });

  it('AC-01: sendOrderItemsRequestSchema acepta una tanda de 1 a 20 ítems', () => {
    expect(sendOrderItemsRequestSchema.parse({ items: [{ productId: 5 }] }).items).toEqual(
      expect.arrayContaining([expect.objectContaining({ productId: 5, quantity: 1 })]),
    );
    const veinte = Array.from({ length: ORDER_ITEMS_PER_SEND_MAX }, () => ({ productId: 5 }));
    expect(ORDER_ITEMS_PER_SEND_MAX).toBe(20);
    expect(sendOrderItemsRequestSchema.parse({ items: veinte }).items).toHaveLength(20);
  });
  it.each([
    [{ items: [] }, ITEMS_MIN_MESSAGE],
    [{ items: Array.from({ length: 21 }, () => ({ productId: 5 })) }, ITEMS_MAX_MESSAGE],
  ])('AC-01: sendOrderItemsRequestSchema rechaza %s con su mensaje', (input, message) => {
    expectRejectedWith(sendOrderItemsRequestSchema, input, message);
  });
  it.each([{ items: [{ productId: 5 }], extra: 1 }, { items: 'no lista' }, {}, 'un texto', null])(
    'AC-01: sendOrderItemsRequestSchema rechaza la forma %s',
    (input) => {
      expect(sendOrderItemsRequestSchema.safeParse(input).success).toBe(false);
    },
  );
  it('AC-01: los issues internos de la tanda llevan el path del ítem', () => {
    const issues = issuesOf(sendOrderItemsRequestSchema, {
      items: [{ productId: 0 }, { productId: 5, quantity: 0 }],
    });
    expect(issues).toEqual(
      expect.arrayContaining([
        { path: 'items.0.productId', message: PRODUCT_ID_MESSAGE },
        { path: 'items.1.quantity', message: QUANTITY_MESSAGE },
      ]),
    );
  });

  it('AC-01: voidOrderItemRequestSchema acepta el motivo recortado y lo exige', () => {
    expect(voidOrderItemRequestSchema.parse({ reason: 'Se equivoc\u00F3 el cliente' })).toEqual({
      reason: 'Se equivoc\u00F3 el cliente',
    });
    expect(voidOrderItemRequestSchema.parse({ reason: '  con bordes  ' })).toEqual({
      reason: 'con bordes',
    });
    expect(voidOrderItemRequestSchema.parse({ reason: 'x'.repeat(200) })).toEqual({
      reason: 'x'.repeat(200),
    });
  });
  it.each([
    {},
    { reason: '' },
    { reason: '  ' },
    { reason: 'x'.repeat(201) },
    { reason: 5 },
    { reason: 'ok', extra: 1 },
    'un texto',
    null,
  ])('AC-01: voidOrderItemRequestSchema rechaza %s con su mensaje', (input) => {
    expectRejectedWith(voidOrderItemRequestSchema, input, VOID_REASON_MESSAGE);
  });

  it('AC-01: idempotencyKeySchema acepta texto visible ASCII de 1 a 128', () => {
    expect(idempotencyKeySchema.parse('abc-123')).toBe('abc-123');
    expect(idempotencyKeySchema.parse('pedido-m3-001')).toBe('pedido-m3-001');
    expect(idempotencyKeySchema.parse('x'.repeat(IDEMPOTENCY_KEY_MAX))).toBe(
      'x'.repeat(IDEMPOTENCY_KEY_MAX),
    );
    expect(IDEMPOTENCY_KEY_MAX).toBe(128);
  });
  it.each([
    '',
    'x'.repeat(129),
    'con espacio',
    'tab\tulada',
    'cl\u00E1ve',
    'emoji\u{1F354}',
    'l\u00EDnea\nrota',
    5,
    null,
    undefined,
    {},
    [],
  ])('AC-01: idempotencyKeySchema rechaza %s con su mensaje', (input) => {
    expectRejectedWith(idempotencyKeySchema, input, IDEMPOTENCY_KEY_MESSAGE);
  });

  it('AC-02: ORDER_ITEM_STATUSES y KITCHEN_TICKET_KINDS son exactamente los de la spec', () => {
    expect(ORDER_ITEM_STATUSES).toEqual(['sent', 'void_requested', 'voided']);
    expect(KITCHEN_TICKET_KINDS).toEqual(['initial', 'additional', 'void']);
  });
  it('AC-02: las constantes de topes son las de la spec', () => {
    expect(ORDER_ITEM_QUANTITY_MAX).toBe(99);
    expect(ORDER_ITEMS_PER_SEND_MAX).toBe(20);
    expect(ORDER_ACTIVE_ITEMS_MAX).toBe(99);
    expect(ORDER_ITEM_SAUCES_MAX).toBe(6);
    expect(ORDER_ITEM_NOTES_MAX).toBe(200);
    expect(IDEMPOTENCY_KEY_MAX).toBe(128);
  });

  it('AC-02: orderItemSchema acepta el ítem completo con sus 25 claves', () => {
    expect(orderItemSchema.parse(VALID_ITEM)).toEqual(VALID_ITEM);
    // Un ítem 'void_requested' muestra su triple de solicitud con los voided* en null.
    const solicitado = {
      ...VALID_ITEM,
      status: 'void_requested',
      voidRequestedBy: { id: 2, displayName: 'Juan' },
      voidRequestedAt: '2026-10-11T18:50:00.000Z',
      voidRequestReason: 'Se equivoc\u00F3 el cliente',
    };
    expect(orderItemSchema.parse(solicitado)).toEqual(solicitado);
    // Un ítem 'voided' por solicitud conserva el triple y suma la anulación.
    const anulado = {
      ...solicitado,
      status: 'voided',
      voidTicketId: 9,
      voidedBy: { id: 1, displayName: 'Due\u00F1o' },
      voidedAt: '2026-10-11T18:55:00.000Z',
      voidReason: 'Confirmado, error del cliente',
    };
    expect(orderItemSchema.parse(anulado)).toEqual(anulado);
    // orderedAtTable admite null (para llevar, D-010-02) y notes también.
    expect(
      orderItemSchema.parse({ ...VALID_ITEM, orderedAtTable: null, notes: null }),
    ).toMatchObject({ orderedAtTable: null, notes: null });
  });
  it('AC-02: conserva compatibilidad del nombre histórico vacío permitido por OpenAPI', () => {
    // El contrato público usa string sin minLength para el nombre copiado.
    const historical = { ...VALID_ITEM, productName: '' };
    expect(orderItemSchema.parse(historical)).toEqual(historical);
  });
  it.each([
    { ...VALID_ITEM, extra: 1 },
    { ...VALID_ITEM, status: 'anulado' },
    { ...VALID_ITEM, status: 'SENT' },
    { ...VALID_ITEM, status: '' },
    { ...VALID_ITEM, quantity: 0 },
    { ...VALID_ITEM, priceCents: -1 },
    { ...VALID_ITEM, portion: 'cuarto' },
    { ...VALID_ITEM, cut: 'ala' },
    { ...VALID_ITEM, breastEighths: -1 },
    { ...VALID_ITEM, notes: 5 },
    { ...VALID_ITEM, sauces: 'sin cremas' },
    { ...VALID_ITEM, components: 'sin componentes' },
    { ...VALID_ITEM, kitchenTicketId: '8' },
    { ...VALID_ITEM, voidedBy: { id: 1 } },
    { ...VALID_ITEM, voidRequestedBy: { id: 2, name: 'Juan' } },
    { ...VALID_ITEM, orderedAtTable: { id: 3 } },
    { ...VALID_ITEM, createdAt: 'ayer' },
    { id: 31, productId: 5 },
    'un ítem',
    null,
  ])('AC-02: orderItemSchema rechaza %s', (input) => {
    expect(orderItemSchema.safeParse(input).success).toBe(false);
  });
  it('AC-02: la crema y el componente de la respuesta son estrictos', () => {
    const conCremaExtra = {
      ...VALID_ITEM,
      sauces: [{ productId: 9, productName: 'Aj\u00ED', quantity: 1, priceCents: 0, extra: 1 }],
    };
    expect(orderItemSchema.safeParse(conCremaExtra).success).toBe(false);
    const conComponenteExtra = {
      ...VALID_ITEM,
      components: [{ ...VALID_ITEM.components[0], priceCents: 100 }],
    };
    expect(orderItemSchema.safeParse(conComponenteExtra).success).toBe(false);
  });

  it('AC-02: kitchenTicketSchema y kitchenTicketsResponseSchema son estrictos', () => {
    expect(kitchenTicketSchema.parse(VALID_TICKET)).toEqual(VALID_TICKET);
    for (const kind of KITCHEN_TICKET_KINDS)
      expect(kitchenTicketSchema.parse({ ...VALID_TICKET, kind })).toMatchObject({ kind });
    for (const input of [
      { ...VALID_TICKET, extra: 1 },
      { ...VALID_TICKET, kind: 'comanda' },
      { ...VALID_TICKET, items: 'sin ítems' },
      { ...VALID_TICKET, orderId: '12' },
      { ...VALID_TICKET, createdBy: { id: 2 } },
      { ...VALID_TICKET, items: [{ ...VALID_ITEM, extra: 1 }] },
    ])
      expect(kitchenTicketSchema.safeParse(input).success).toBe(false);
    expect(kitchenTicketsResponseSchema.parse({ tickets: [VALID_TICKET] })).toEqual({
      tickets: [VALID_TICKET],
    });
    expect(kitchenTicketsResponseSchema.parse({ tickets: [] })).toEqual({ tickets: [] });
    expect(
      kitchenTicketsResponseSchema.safeParse({ tickets: [VALID_TICKET], extra: 1 }).success,
    ).toBe(false);
  });

  it('AC-02: sendOrderItemsResponseSchema y orderResponseSchema envuelven el pedido', () => {
    const envio = { order: ORDER_SHAPE, ticket: VALID_TICKET };
    expect(sendOrderItemsResponseSchema.parse(envio)).toEqual(envio);
    for (const input of [
      { order: ORDER_SHAPE },
      { ticket: VALID_TICKET },
      { ...envio, extra: 1 },
      { order: 'sin pedido', ticket: VALID_TICKET },
    ])
      expect(sendOrderItemsResponseSchema.safeParse(input).success).toBe(false);
    // request-void y reject-void responden solo { order }.
    expect(orderResponseSchema.parse({ order: ORDER_SHAPE })).toEqual({ order: ORDER_SHAPE });
    for (const input of [{}, { order: ORDER_SHAPE, extra: 1 }, { order: 'sin pedido' }])
      expect(orderResponseSchema.safeParse(input).success).toBe(false);
  });

  it('AC-02: menuProductSchema y menuResponseSchema arman la carta del mozo', () => {
    // El producto embebido del componente lleva sus cinco claves de la spec 005.
    const incaKola = {
      id: 7,
      name: 'Inca Kola 1L',
      category: 'drink',
      priceCents: 800,
      isActive: true,
    };
    const carta = {
      products: [
        {
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
        },
        {
          id: 11,
          name: 'Anticucho de pollo',
          category: 'chicken',
          priceCents: 1200,
          portions: [],
          items: [],
        },
        {
          id: 20,
          name: 'Mostrito',
          category: 'combo',
          priceCents: 2200,
          portions: [],
          items: [
            { product: { ...incaKola }, quantity: 1, portion: null, cut: null },
            {
              product: {
                id: 5,
                name: 'Pollo a la brasa',
                category: 'chicken',
                priceCents: 4800,
                isActive: true,
              },
              quantity: 1,
              portion: 'quarter',
              cut: 'leg',
            },
          ],
        },
      ],
    };
    expect(menuResponseSchema.parse(carta)).toEqual(carta);
    expect(menuResponseSchema.parse({ products: [] })).toEqual({ products: [] });
    expect(menuProductSchema.parse(carta.products[0])).toEqual(carta.products[0]);
  });
  it.each([
    // Un producto del menú con clave de más, sin lista o con forma rota falla.
    {
      id: 5,
      name: 'Pollo',
      category: 'chicken',
      priceCents: 4800,
      portions: [],
      items: [],
      extra: 1,
    },
    { id: 5, name: 'Pollo', category: 'chicken', priceCents: 4800, items: [] },
    { id: 5, name: 'Pollo', category: 'chicken', priceCents: 4800, portions: [] },
    {
      id: 5,
      name: 'Pollo',
      category: 'inventada',
      priceCents: 4800,
      portions: [],
      items: [],
    },
    {
      id: 5,
      name: 'Pollo',
      category: 'chicken',
      priceCents: 4800,
      portions: [{ portion: 'quarter', cut: 'leg', priceCents: 1400, extra: 1 }],
      items: [],
    },
    {
      id: 20,
      name: 'Mostrito',
      category: 'combo',
      priceCents: 2200,
      portions: [],
      items: [
        {
          product: { id: 7, name: 'Inca Kola', category: 'drink', priceCents: 800 },
          quantity: 1,
          portion: null,
          cut: null,
        },
      ],
    },
  ])('AC-02: menuProductSchema rechaza %s', (input) => {
    expect(menuProductSchema.safeParse(input).success).toBe(false);
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
    // Los cuerpos exactos de D-010-17 validan contra el esquema de error común.
    for (const body of [
      { code: 'ORDER_ITEM_NOT_FOUND', message: 'Ese ítem no existe en este pedido.' },
      { code: 'ORDER_ITEM_ALREADY_VOIDED', message: 'Ese ítem ya fue anulado.' },
      {
        code: 'ORDER_ITEM_VOID_REQUESTED',
        message: 'Ese ítem ya tiene una anulación pendiente.',
      },
      {
        code: 'ORDER_ITEM_NOT_REQUESTED',
        message: 'Ese ítem no tiene una anulación pendiente.',
      },
      {
        code: 'ORDER_HAS_ACTIVE_ITEMS',
        message: 'El pedido tiene ítems sin anular; un administrador debe anularlos primero.',
      },
      { code: 'ORDER_ITEMS_LIMIT', message: 'El pedido llegó al límite de ítems.' },
      {
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'Esa clave de envío ya se usó con otros datos.',
      },
    ])
      expect(errorResponseSchema.safeParse({ error: { ...body, details: null } }).success).toBe(
        true,
      );
  });
});
