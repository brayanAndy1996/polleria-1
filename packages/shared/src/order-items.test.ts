// AC-01 y AC-02. Spec 010 — archivo nuevo: va EN ROJO hasta que T-07 cree
<<<<<<< HEAD
// packages/shared/src/order-items.ts, amplíe orders.ts/errors.ts y lo exporte.
=======
// packages/shared/src/order-items.ts y amplíe orders.ts y errors.ts.
>>>>>>> 9437dd019bbb348a611c696fde669a6c95f5996a
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
<<<<<<< HEAD
  orderItemNotesSchema,
  orderItemSchema,
  orderResponseSchema,
=======
  orderItemSchema,
  orderResponseSchema,
  orderSchema,
>>>>>>> 9437dd019bbb348a611c696fde669a6c95f5996a
  sendOrderItemsRequestSchema,
  sendOrderItemsResponseSchema,
  voidOrderItemRequestSchema,
} from '@polleria/shared';
<<<<<<< HEAD
import type { Order } from '@polleria/shared';
=======
import type { Order, OrderItem } from '@polleria/shared';
>>>>>>> 9437dd019bbb348a611c696fde669a6c95f5996a

const PRODUCT_ID_MESSAGE = 'El identificador del producto no es v\u00E1lido.';
const QUANTITY_MESSAGE = 'Indica cu\u00E1ntas unidades lleva el \u00EDtem.';
const NOTES_MESSAGE = 'La observaci\u00F3n admite hasta 200 caracteres en una sola l\u00EDnea.';
const CUT_WITHOUT_PORTION_MESSAGE = 'Sin presentaci\u00F3n no se puede indicar la parte.';
<<<<<<< HEAD
const ITEMS_MIN_MESSAGE = 'Indica al menos un \u00EDtem.';
const ITEMS_MAX_MESSAGE = 'Un env\u00EDo admite hasta 20 \u00EDtems.';
const SAUCES_MAX_MESSAGE = 'Un \u00EDtem admite hasta 6 cremas.';
const COMPONENTS_MAX_MESSAGE = 'Un \u00EDtem admite hasta 10 componentes.';
const VOID_REASON_MESSAGE = 'Escribe el motivo de la anulaci\u00F3n (hasta 200 caracteres).';
const IDEMPOTENCY_KEY_MESSAGE = 'El env\u00EDo necesita la cabecera Idempotency-Key.';

/** Issues { path, message } de una entrada rechazada por un esquema Zod. */
=======
const SAUCES_MAX_MESSAGE = 'Un \u00EDtem admite hasta 6 cremas.';
const COMPONENTS_MAX_MESSAGE = 'Un \u00EDtem admite hasta 10 componentes.';
const ITEMS_MIN_MESSAGE = 'Indica al menos un \u00EDtem.';
const ITEMS_MAX_MESSAGE = 'Un env\u00EDo admite hasta 20 \u00EDtems.';
const REASON_MESSAGE = 'Escribe el motivo de la anulaci\u00F3n (hasta 200 caracteres).';
const IDEMPOTENCY_KEY_MESSAGE = 'El env\u00EDo necesita la cabecera Idempotency-Key.';

/** Issues de una entrada rechazada, reducidos a { path, message }. */
>>>>>>> 9437dd019bbb348a611c696fde669a6c95f5996a
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

<<<<<<< HEAD
/** Comprueba el rechazo y que al menos un issue trae el mensaje exacto. */
=======
/** Comprueba que el esquema rechaza la entrada y que algún issue trae el mensaje. */
>>>>>>> 9437dd019bbb348a611c696fde669a6c95f5996a
function expectRejectedWith(
  schema: { safeParse: (input: unknown) => unknown },
  input: unknown,
  message: string,
) {
  const issues = issuesOf(schema, input);
  expect(issues.map((issue) => issue.message)).toContain(message);
}

<<<<<<< HEAD
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
=======
/** Un ítem 'sent' mínimo y válido de la respuesta (forma de AC-02). */
const SENT_ITEM = {
>>>>>>> 9437dd019bbb348a611c696fde669a6c95f5996a
  id: 31,
  productId: 5,
  productName: 'Pollo a la brasa',
  productCategory: 'chicken',
<<<<<<< HEAD
  quantity: 2,
=======
  quantity: 1,
>>>>>>> 9437dd019bbb348a611c696fde669a6c95f5996a
  priceCents: 1400,
  portion: 'quarter',
  cut: 'leg',
  breastEighths: 0,
<<<<<<< HEAD
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
=======
  legEighths: 2,
  notes: null,
  sauces: [],
  components: [],
>>>>>>> 9437dd019bbb348a611c696fde669a6c95f5996a
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
<<<<<<< HEAD
};

/** Una comanda válida: las seis claves de kitchenTicketSchema con sus ítems. */
const VALID_TICKET = {
  id: 8,
  orderId: 12,
  kind: 'initial',
  items: [VALID_ITEM],
=======
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
>>>>>>> 9437dd019bbb348a611c696fde669a6c95f5996a
  createdBy: { id: 2, displayName: 'Juan' },
  createdAt: '2026-10-11T18:35:00.000Z',
};

<<<<<<< HEAD
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
=======
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
>>>>>>> 9437dd019bbb348a611c696fde669a6c95f5996a
  });
  it.each([
    { productId: 0 },
    { productId: -2 },
    { productId: 'x' },
    { productId: 1.5 },
    { productId: 2147483648 },
    { productId: null },
    {},
<<<<<<< HEAD
  ])('AC-01: orderItemInputSchema rechaza el productId %s con su mensaje', (input) => {
=======
  ])('AC-01: orderItemInputSchema rechaza %s con issue en productId', (input) => {
>>>>>>> 9437dd019bbb348a611c696fde669a6c95f5996a
    expect(issuesOf(orderItemInputSchema, input)).toContainEqual({
      path: 'productId',
      message: PRODUCT_ID_MESSAGE,
    });
  });
<<<<<<< HEAD
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
=======
  it.each([
    { productId: 5, quantity: 0 },
    { productId: 5, quantity: 100 },
    { productId: 5, quantity: 1.5 },
    { productId: 5, quantity: '2' },
  ])('AC-01: orderItemInputSchema rechaza %s con issue en quantity', (input) => {
    expect(issuesOf(orderItemInputSchema, input)).toContainEqual({
>>>>>>> 9437dd019bbb348a611c696fde669a6c95f5996a
      path: 'quantity',
      message: QUANTITY_MESSAGE,
    });
  });
<<<<<<< HEAD
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
    expect(
      issuesOf(orderItemInputSchema, { productId: 5, portion: null, cut: 'breast' }),
    ).toContainEqual({ path: 'cut', message: CUT_WITHOUT_PORTION_MESSAGE });
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
=======
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
>>>>>>> 9437dd019bbb348a611c696fde669a6c95f5996a
    expect(
      orderItemInputSchema.parse({
        productId: 5,
        portion: 'half',
        breastEighths: 1,
        legEighths: 3,
      }),
    ).toMatchObject({ breastEighths: 1, legEighths: 3 });
<<<<<<< HEAD
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
  it.each([
    { ...VALID_ITEM, extra: 1 },
    { ...VALID_ITEM, status: 'anulado' },
    { ...VALID_ITEM, status: 'SENT' },
    { ...VALID_ITEM, status: '' },
    { ...VALID_ITEM, quantity: 0 },
    { ...VALID_ITEM, priceCents: -1 },
    { ...VALID_ITEM, productName: '' },
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
=======
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
>>>>>>> 9437dd019bbb348a611c696fde669a6c95f5996a
      id: 7,
      name: 'Inca Kola 1L',
      category: 'drink',
      priceCents: 800,
      isActive: true,
    };
<<<<<<< HEAD
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
=======
    const combo = {
>>>>>>> 9437dd019bbb348a611c696fde669a6c95f5996a
      id: 20,
      name: 'Mostrito',
      category: 'combo',
      priceCents: 2200,
      portions: [],
<<<<<<< HEAD
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
=======
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
>>>>>>> 9437dd019bbb348a611c696fde669a6c95f5996a
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
<<<<<<< HEAD
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
=======
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
>>>>>>> 9437dd019bbb348a611c696fde669a6c95f5996a
  });
});
