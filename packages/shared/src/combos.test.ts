import { describe, expect, it } from 'vitest';
import {
  COMBO_ITEMS_MAX,
  COMBO_ITEM_QUANTITY_MAX,
  ERROR_CODES,
  PORTION_CUT_MESSAGE,
  comboChickenConsumption,
  comboItemInputSchema,
  comboItemSchema,
  comboItemsResponseSchema,
  comboItemsUniqueRefinement,
  errorResponseSchema,
  replaceComboItemsRequestSchema,
} from '@polleria/shared';
import type {
  ChickenConsumption,
  ComboItem,
  ComboItemInput,
  ComboItemsResponse,
  Cut,
  Portion,
  ReplaceComboItemsRequest,
} from '@polleria/shared';

/** La forma mínima de ítem que consume comboChickenConsumption (sección 8.3 de la spec). */
type ConsumptionItem = { quantity: number; portion: Portion | null; cut: Cut | null };

const PRODUCT_ID_MESSAGE = 'El identificador del producto no es v\u00E1lido.';
const QUANTITY_MESSAGE = 'Indica cu\u00E1ntas unidades lleva este componente.';
const CUT_WITHOUT_PORTION_MESSAGE = 'Sin presentaci\u00F3n no se puede indicar la parte.';
const ITEMS_MAX_MESSAGE = 'Un combo admite hasta 10 componentes.';
const ITEMS_DUPLICATED_MESSAGE = 'Hay componentes repetidos en la lista.';
const COMBO_ITEMS_NOT_ALLOWED_BODY = {
  error: {
    code: 'COMBO_ITEMS_NOT_ALLOWED',
    message: 'Solo los productos de la categor\u00EDa Combos pueden tener componentes.',
    details: null,
  },
};
const PRODUCT_HAS_ITEMS_BODY = {
  error: {
    code: 'PRODUCT_HAS_ITEMS',
    message:
      'Este producto es un combo con componentes; quita sus componentes antes de ' +
      'cambiar su categor\u00EDa.',
    details: null,
  },
};
const PRODUCT_IS_COMPONENT_BODY = {
  error: {
    code: 'PRODUCT_IS_COMPONENT',
    message:
      'Este producto es componente de un combo; qu\u00EDtalo del combo antes de ' +
      'cambiar su categor\u00EDa.',
    details: null,
  },
};

/** Un ítem válido tal como lo devuelve la API: las seis claves, con el producto embebido. */
const VALID_ITEM = {
  id: 1,
  comboId: 9,
  product: {
    id: 5,
    name: 'Pollo a la brasa',
    category: 'chicken',
    priceCents: 1850,
    isActive: true,
  },
  quantity: 1,
  portion: 'quarter',
  cut: 'leg',
} satisfies ComboItem;

/** safeParse debe rechazar y al menos un issue debe traer el mensaje indicado. */
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

/**
 * Issues de una entrada que debe ser rechazada, reducidos a { path, message }: los
 * issues crudos de Zod traen más campos (code, expected, ...) que harían fallar un
 * toContainEqual incluso con la implementación correcta.
 */
function issuesOf(
  schema: { safeParse: (input: unknown) => unknown },
  input: unknown,
): { path: (string | number | symbol)[]; message: string }[] {
  const result = schema.safeParse(input) as
    | { success: true }
    | {
        success: false;
        error: { issues: { path: (string | number | symbol)[]; message: string }[] };
      };
  expect(result.success).toBe(false);
  if (!result.success)
    return result.error.issues.map((issue) => ({ path: issue.path, message: issue.message }));
  return [];
}

describe('007: esquemas de componentes de combo y consumo en octavos', () => {
  it('AC-02: exporta los topes COMBO_ITEMS_MAX y COMBO_ITEM_QUANTITY_MAX', () => {
    expect(COMBO_ITEMS_MAX).toBe(10);
    expect(COMBO_ITEM_QUANTITY_MAX).toBe(99);
  });
  it('AC-02: comboItemInputSchema acepta la fila mínima y normaliza portion y cut a null', () => {
    // Un componente que no es pollo no declara presentación ni parte: quedan null.
    const minimal = { productId: 8, quantity: 1 };
    expect(comboItemInputSchema.parse(minimal)).toEqual({
      productId: 8,
      quantity: 1,
      portion: null,
      cut: null,
    });
    for (const row of [
      { productId: 8, quantity: 1, portion: null },
      { productId: 8, quantity: 1, cut: null },
      { productId: 8, quantity: 1, portion: null, cut: null },
      { productId: 8, quantity: 1, portion: undefined, cut: undefined },
    ]) {
      const parsed = comboItemInputSchema.parse(row);
      expect(parsed).toEqual({ productId: 8, quantity: 1, portion: null, cut: null });
    }
  });
  it.each([
    { productId: 5, quantity: 1, portion: 'eighth', cut: 'breast' },
    { productId: 5, quantity: 1, portion: 'quarter', cut: 'leg' },
    { productId: 5, quantity: 2, portion: 'half' },
    { productId: 5, quantity: 1, portion: 'whole', cut: null },
    { productId: 2147483647, quantity: 99, portion: 'quarter', cut: 'breast' },
  ])('AC-02: comboItemInputSchema acepta %o', (row) => {
    const parsed = comboItemInputSchema.parse(row);
    expect(parsed.productId).toBe(row.productId);
    expect(parsed.quantity).toBe(row.quantity);
    expect(parsed.portion).toBe(row.portion);
    expect(parsed.cut ?? null).toBe(row.cut ?? null);
  });
  it.each([
    { productId: 0, quantity: 1 },
    { productId: -3, quantity: 1 },
    { productId: 1.5, quantity: 1 },
    { productId: 2147483648, quantity: 1 },
    { productId: '8', quantity: 1 },
    { productId: null, quantity: 1 },
    { productId: Number.NaN, quantity: 1 },
  ])('AC-02: rechaza %o con el mensaje del identificador', (row) => {
    expectRejectedWith(comboItemInputSchema, row, PRODUCT_ID_MESSAGE);
  });
  it.each([
    { productId: 8, quantity: 0 },
    { productId: 8, quantity: -1 },
    { productId: 8, quantity: 100 },
    { productId: 8, quantity: 1.5 },
    { productId: 8, quantity: '2' },
    { productId: 8, quantity: null },
    { productId: 8, quantity: Number.NaN },
    { productId: 8 },
  ])('AC-02: rechaza %o con el mensaje de unidades', (row) => {
    expectRejectedWith(comboItemInputSchema, row, QUANTITY_MESSAGE);
  });
  it.each([
    // eighth y quarter exigen parte; half y whole no la llevan (regla de la 006).
    { productId: 5, quantity: 1, portion: 'eighth' },
    { productId: 5, quantity: 1, portion: 'eighth', cut: null },
    { productId: 5, quantity: 1, portion: 'quarter' },
    { productId: 5, quantity: 1, portion: 'quarter', cut: null },
    { productId: 5, quantity: 1, portion: 'half', cut: 'breast' },
    { productId: 5, quantity: 1, portion: 'whole', cut: 'leg' },
  ])('AC-02: %o falla en cut con el mensaje de correspondencia', (row) => {
    const issues = issuesOf(comboItemInputSchema, row);
    expect(issues).toContainEqual({ path: ['cut'], message: PORTION_CUT_MESSAGE });
  });
  it.each([
    { productId: 8, quantity: 1, cut: 'leg' },
    { productId: 8, quantity: 1, cut: 'breast' },
    { productId: 8, quantity: 1, portion: null, cut: 'leg' },
  ])('AC-02: %o falla en cut porque sin presentación no se puede indicar la parte', (row) => {
    const issues = issuesOf(comboItemInputSchema, row);
    expect(issues).toContainEqual({ path: ['cut'], message: CUT_WITHOUT_PORTION_MESSAGE });
  });
  it.each([
    { productId: 8, quantity: 1, portion: 'octavo', cut: 'breast' },
    { productId: 8, quantity: 1, portion: 'Eighth', cut: 'breast' },
    { productId: 8, quantity: 1, portion: 'quarter', cut: 'pecho' },
    { productId: 8, quantity: 1, portion: 'quarter', cut: 'Breast' },
    { productId: 8, quantity: 1, portion: 5, cut: 'leg' },
    { productId: 8, quantity: 1, extra: 'x' },
    { productId: 8, quantity: 1, id: 3 },
    { quantity: 1 },
    'quarter',
    5,
    null,
    undefined,
    [],
  ])('AC-02: comboItemInputSchema rechaza %o', (input) => {
    expect(comboItemInputSchema.safeParse(input).success).toBe(false);
  });

  it('AC-03: el cuerpo con la lista vacía es válido (un combo puede quedar sin componentes)', () => {
    expect(replaceComboItemsRequestSchema.parse({ items: [] })).toEqual({ items: [] });
  });
  it('AC-03: acepta 10 filas distintas y el mismo producto con distinta (portion, cut)', () => {
    const ten = Array.from({ length: 10 }, (_, index) => ({
      productId: index + 1,
      quantity: 1,
    }));
    const parsed = replaceComboItemsRequestSchema.parse({ items: ten });
    expect(parsed.items).toHaveLength(10);
    // El "dúo": cuarto pecho + cuarto pierna del mismo pollo no cuenta como repetido.
    const duo = {
      items: [
        { productId: 5, quantity: 1, portion: 'quarter', cut: 'breast' },
        { productId: 5, quantity: 1, portion: 'quarter', cut: 'leg' },
      ],
    };
    expect(replaceComboItemsRequestSchema.parse(duo).items).toHaveLength(2);
    // El type del request queda fijado por esta asignación (typecheck).
    const request: ReplaceComboItemsRequest = { items: [] };
    expect(request.items).toEqual([]);
    const input: ComboItemInput = { productId: 8, quantity: 1, portion: null, cut: null };
    expect(input.productId).toBe(8);
  });
  it('AC-03: 11 filas rechaza con el mensaje del tope en items', () => {
    const eleven = {
      items: Array.from({ length: 11 }, (_, index) => ({ productId: index + 1, quantity: 1 })),
    };
    const issues = issuesOf(replaceComboItemsRequestSchema, eleven);
    expect(issues).toContainEqual({ path: ['items'], message: ITEMS_MAX_MESSAGE });
  });
  it.each([
    // Repetidos juntos: el issue cae en el índice de la segunda aparición.
    [
      [
        { productId: 8, quantity: 1 },
        { productId: 8, quantity: 2 },
      ],
      'items.1',
    ],
    // Repetidos separados por otra fila válida.
    [
      [
        { productId: 8, quantity: 1 },
        { productId: 5, quantity: 1, portion: 'quarter', cut: 'leg' },
        { productId: 8, quantity: 3 },
      ],
      'items.2',
    ],
    // Omitido y null explícito cuentan como la misma clave.
    [
      [
        { productId: 8, quantity: 1 },
        { productId: 8, quantity: 1, portion: null, cut: null },
      ],
      'items.1',
    ],
    // La misma (portion, cut) del mismo producto también es repetido.
    [
      [
        { productId: 5, quantity: 1, portion: 'quarter', cut: 'breast' },
        { productId: 5, quantity: 2, portion: 'quarter', cut: 'breast' },
      ],
      'items.1',
    ],
  ])('AC-03: los componentes repetidos de %o fallan en %s', (items, path) => {
    const issues = issuesOf(replaceComboItemsRequestSchema, { items });
    expect(issues).toContainEqual({
      path: path.split('.').map((part) => (/^[0-9]+$/.test(part) ? Number(part) : part)),
      message: ITEMS_DUPLICATED_MESSAGE,
    });
  });
  it.each([
    { items: 'x' },
    { items: [{}] },
    { items: [null] },
    { items: [], extra: 1 },
    {},
    'un texto',
    5,
    null,
    undefined,
    [],
  ])('AC-03: replaceComboItemsRequestSchema rechaza %o', (input) => {
    expect(replaceComboItemsRequestSchema.safeParse(input).success).toBe(false);
  });
  it('AC-03: comboItemsUniqueRefinement se exporta como refinamiento del módulo', () => {
    // La spec lo nombra como refino reutilizable de replaceComboItemsRequestSchema;
    // puede ser una función o un check de Zod: basta que el símbolo exista.
    expect(comboItemsUniqueRefinement).toBeDefined();
  });

  it('AC-04: comboItemSchema acepta el ítem con el producto embebido y las claves exactas', () => {
    const parsed = comboItemSchema.parse(VALID_ITEM);
    expect(parsed).toEqual(VALID_ITEM);
    expect(Object.keys(parsed).sort()).toEqual([
      'comboId',
      'cut',
      'id',
      'portion',
      'product',
      'quantity',
    ]);
    expect(Object.keys(parsed.product).sort()).toEqual([
      'category',
      'id',
      'isActive',
      'name',
      'priceCents',
    ]);
    // Un componente que no es pollo llega con portion y cut en null.
    const chaufa: ComboItem = {
      ...VALID_ITEM,
      id: 2,
      product: {
        ...VALID_ITEM.product,
        id: 8,
        name: 'Chaufa',
        category: 'dish',
        priceCents: 1400,
      },
      quantity: 1,
      portion: null,
      cut: null,
    };
    expect(comboItemSchema.parse(chaufa)).toEqual(chaufa);
  });
  it.each([
    { ...VALID_ITEM, id: 0 },
    { ...VALID_ITEM, id: -1 },
    { ...VALID_ITEM, id: '1' },
    { ...VALID_ITEM, comboId: 0 },
    { ...VALID_ITEM, comboId: '9' },
    { ...VALID_ITEM, quantity: 0 },
    { ...VALID_ITEM, quantity: 100 },
    { ...VALID_ITEM, quantity: 1.5 },
    { ...VALID_ITEM, portion: 'octavo' },
    { ...VALID_ITEM, cut: 'pecho' },
    { ...VALID_ITEM, product: { ...VALID_ITEM.product, stock: 3 } },
    {
      ...VALID_ITEM,
      product: { id: 5, name: 'Pollo', category: 'chicken', priceCents: 1850 },
    },
    { id: 1, product: VALID_ITEM.product, quantity: 1, portion: 'quarter', cut: 'leg' },
    { ...VALID_ITEM, createdAt: '2026-10-09T15:00:00.000Z' },
    'un texto',
    null,
    undefined,
  ])('AC-04: comboItemSchema rechaza %o', (input) => {
    expect(comboItemSchema.safeParse(input).success).toBe(false);
  });
  it('AC-04: comboItemsResponseSchema acepta la lista vacía o con ítems estrictos', () => {
    expect(comboItemsResponseSchema.parse({ items: [] })).toEqual({ items: [] });
    const response: ComboItemsResponse = { items: [VALID_ITEM] };
    expect(comboItemsResponseSchema.parse(response).items).toHaveLength(1);
    expect(
      comboItemsResponseSchema.safeParse({
        items: [{ ...VALID_ITEM, createdAt: '2026-10-09T15:00:00.000Z' }],
      }).success,
    ).toBe(false);
    expect(comboItemsResponseSchema.safeParse({ items: [], total: 0 }).success).toBe(false);
    expect(comboItemsResponseSchema.safeParse({}).success).toBe(false);
  });
  it('AC-04: ERROR_CODES suma los tres códigos nuevos sin perder los anteriores', () => {
    for (const code of [
      'NOT_FOUND',
      'INTERNAL_ERROR',
      'VALIDATION_ERROR',
      'INVALID_JSON',
      'PAYLOAD_TOO_LARGE',
      'UNSUPPORTED_MEDIA_TYPE',
      'INVALID_BODY',
      'INVALID_CREDENTIALS',
      'UNAUTHENTICATED',
      'FORBIDDEN',
      'TOO_MANY_ATTEMPTS',
      'USERNAME_TAKEN',
      'USER_NOT_FOUND',
      'LAST_ADMIN_REQUIRED',
      'PRODUCT_NOT_FOUND',
      'PRODUCT_NAME_TAKEN',
      'PORTIONS_NOT_ALLOWED',
      'PRODUCT_HAS_PORTIONS',
      'COMBO_ITEMS_NOT_ALLOWED',
      'PRODUCT_HAS_ITEMS',
      'PRODUCT_IS_COMPONENT',
    ])
      expect(ERROR_CODES).toHaveProperty(code, code);
    // 'COMBO_HAS_COMPONENTS' no es un código del sistema: la lista cerrada
    // ERROR_CODES no lo contiene (el "rechaza" de la spec, AC-04).
    // Nota: errorResponseSchema acepta por diseño cualquier código en mayúsculas
    // (comentario de errors.ts), así que el filtro es la lista ERROR_CODES.
    expect(Object.values(ERROR_CODES)).not.toContain('COMBO_HAS_COMPONENTS');
    expect(errorResponseSchema.safeParse(COMBO_ITEMS_NOT_ALLOWED_BODY).success).toBe(true);
    expect(errorResponseSchema.safeParse(PRODUCT_HAS_ITEMS_BODY).success).toBe(true);
    expect(errorResponseSchema.safeParse(PRODUCT_IS_COMPONENT_BODY).success).toBe(true);
  });

  it('AC-05: la lista vacía y los componentes sin presentación aportan 0 octavos', () => {
    expect(comboChickenConsumption([])).toEqual({ breastEighths: 0, legEighths: 0 });
    // Un chaufa o una gaseosa no se miden en octavos, aunque quantity sea 99.
    expect(comboChickenConsumption([{ quantity: 99, portion: null, cut: null }])).toEqual({
      breastEighths: 0,
      legEighths: 0,
    });
  });
  it.each<[ConsumptionItem[], ChickenConsumption]>([
    // El mostrito: cuarto pierna + chaufa + gaseosa.
    [
      [
        { quantity: 1, portion: 'quarter', cut: 'leg' },
        { quantity: 1, portion: null, cut: null },
        { quantity: 1, portion: null, cut: null },
      ],
      { breastEighths: 0, legEighths: 2 },
    ],
    // La fila de la spec: mostrito x2 de pierna + octavo de pecho + chaufa.
    [
      [
        { quantity: 2, portion: 'quarter', cut: 'leg' },
        { quantity: 1, portion: 'eighth', cut: 'breast' },
        { quantity: 1, portion: null, cut: null },
      ],
      { breastEighths: 1, legEighths: 4 },
    ],
    [[{ quantity: 1, portion: 'half', cut: null }], { breastEighths: 2, legEighths: 2 }],
    // Combo familiar: entero + chaufa x2 + gaseosa x4.
    [
      [
        { quantity: 1, portion: 'whole', cut: null },
        { quantity: 2, portion: null, cut: null },
        { quantity: 4, portion: null, cut: null },
      ],
      { breastEighths: 4, legEighths: 4 },
    ],
    // Dos pollos enteros son 16 octavos: válido en un combo familiar.
    [[{ quantity: 2, portion: 'whole', cut: null }], { breastEighths: 8, legEighths: 8 }],
  ])('AC-05: comboChickenConsumption(%o) consume %o', (items, expected) => {
    expect(comboChickenConsumption(items)).toEqual(expected);
    // Acepta cualquier iterable, no solo arreglos (spec 007, sección 8.3).
    expect(comboChickenConsumption(new Set(items).values())).toEqual(expected);
  });
  it.each<ConsumptionItem[]>([
    // eighth/quarter sin parte: la combinación inválida la delega a chickenConsumption.
    [{ quantity: 1, portion: 'quarter', cut: null }],
    [{ quantity: 1, portion: 'eighth', cut: null }],
    // cut sin portion: la defensa propia de la función.
    [{ quantity: 1, portion: null, cut: 'leg' }],
    [{ quantity: 99, portion: null, cut: 'breast' }],
    // half/whole con parte.
    [{ quantity: 1, portion: 'half', cut: 'breast' }],
    [{ quantity: 1, portion: 'whole', cut: 'leg' }],
    // Una fila inválida entre válidas invalida el cálculo completo.
    [
      { quantity: 1, portion: 'quarter', cut: 'leg' },
      { quantity: 1, portion: null, cut: 'breast' },
    ],
  ])('AC-05: %o lanza error por combinación inválida', (...items) => {
    // it.each reparte cada fila como argumentos: ...items reconstruye la lista real
    // que comboChickenConsumption itera (firma Iterable puro desde la spec 010, §12).
    expect(() => comboChickenConsumption(items)).toThrow();
  });
  it('AC-05: una presentación fuera de PORTIONS lanza error aunque se fuerce el tipo', () => {
    const octavo = 'octavo' as unknown as Portion;
    expect(() =>
      comboChickenConsumption([{ quantity: 1, portion: octavo, cut: 'breast' }]),
    ).toThrow();
  });
});
