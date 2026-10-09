import { describe, expect, it } from 'vitest';
import {
  CUTS,
  ERROR_CODES,
  MIXED_PORTIONS,
  PORTIONS,
  PORTIONS_DUPLICATED_MESSAGE,
  PORTION_CUT_MESSAGE,
  PORTION_EIGHTHS,
  PRODUCT_PORTIONS_MAX,
  SINGLE_CUT_PORTIONS,
  chickenConsumption,
  cutSchema,
  errorResponseSchema,
  portionSchema,
  productPortionInputSchema,
  productPortionSchema,
  productPortionsResponseSchema,
  replaceProductPortionsRequestSchema,
} from '@polleria/shared';
import type {
  ChickenConsumption,
  Cut,
  Portion,
  ProductPortion,
  ProductPortionInput,
  ProductPortionsResponse,
  ReplaceProductPortionsRequest,
} from '@polleria/shared';

const PORTION_CUT_TEXT =
  'La parte no corresponde a la presentaci\u00F3n: eighth y quarter llevan breast o leg; ' +
  'half y whole no llevan parte.';
const PORTIONS_DUPLICATED_TEXT = 'Hay presentaciones repetidas en la lista.';
const PORTIONS_MAX_TEXT = 'Un producto de pollo admite hasta 6 presentaciones.';
const PORTIONS_NOT_ALLOWED_BODY = {
  error: {
    code: 'PORTIONS_NOT_ALLOWED',
    message: 'Solo los productos de la categor\u00EDa Pollo pueden tener presentaciones.',
    details: null,
  },
};
const PRODUCT_HAS_PORTIONS_BODY = {
  error: {
    code: 'PRODUCT_HAS_PORTIONS',
    message:
      'Este producto tiene presentaciones de pollo; qu\u00EDtalas antes de cambiar su ' +
      'categor\u00EDa.',
    details: null,
  },
};

/** Las seis combinaciones válidas de (portion, cut) con sus precios. */
const FULL_SET: ProductPortionInput[] = [
  { portion: 'eighth', cut: 'breast', priceCents: 700 },
  { portion: 'eighth', cut: 'leg', priceCents: 650 },
  { portion: 'quarter', cut: 'breast', priceCents: 1850 },
  { portion: 'quarter', cut: 'leg', priceCents: 1700 },
  { portion: 'half', priceCents: 3200 },
  { portion: 'whole', priceCents: 6000 },
];

const VALID_PORTION = {
  id: 2,
  productId: 5,
  portion: 'quarter',
  cut: 'breast',
  priceCents: 1850,
} satisfies ProductPortion;

/** Comprueba que el esquema rechaza la entrada y que al menos un issue trae el mensaje único. */
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

describe('006: presentaciones, partes y consumo en octavos', () => {
  it('AC-01: PORTIONS y CUTS son exactamente las listas fijas en su orden', () => {
    expect(PORTIONS).toEqual(['eighth', 'quarter', 'half', 'whole']);
    expect(CUTS).toEqual(['breast', 'leg']);
    // Los types Portion y Cut quedan fijados por estas asignaciones (typecheck).
    const portion: Portion = 'quarter';
    const cut: Cut = 'breast';
    expect(portion).toBe('quarter');
    expect(cut).toBe('breast');
  });
  it.each(['eighth', 'quarter', 'half', 'whole'])(
    'AC-01: portionSchema acepta %s y devuelve el mismo valor',
    (portion) => {
      expect(portionSchema.parse(portion)).toBe(portion);
    },
  );
  it.each(['octavo', 'Eighth', 'HALF', '1/4', 'media', '', ' eighth', null, 0, ['half']])(
    'AC-01: portionSchema rechaza %s',
    (input) => {
      expect(portionSchema.safeParse(input).success).toBe(false);
    },
  );
  it.each(['breast', 'leg'])('AC-01: cutSchema acepta %s y devuelve el mismo valor', (cut) => {
    expect(cutSchema.parse(cut)).toBe(cut);
  });
  it.each(['pecho', 'Breast', 'pierna', '', null, 0])('AC-01: cutSchema rechaza %s', (input) => {
    expect(cutSchema.safeParse(input).success).toBe(false);
  });

  it('AC-02: PORTION_EIGHTHS y los grupos de presentaciones son los de la regla de dominio 1', () => {
    expect(PORTION_EIGHTHS).toEqual({ eighth: 1, quarter: 2, half: 4, whole: 8 });
    expect(SINGLE_CUT_PORTIONS).toEqual(['eighth', 'quarter']);
    expect(MIXED_PORTIONS).toEqual(['half', 'whole']);
  });
  it.each<[Portion, Cut | null | undefined, ChickenConsumption]>([
    ['eighth', 'breast', { breastEighths: 1, legEighths: 0 }],
    ['eighth', 'leg', { breastEighths: 0, legEighths: 1 }],
    ['quarter', 'breast', { breastEighths: 2, legEighths: 0 }],
    ['quarter', 'leg', { breastEighths: 0, legEighths: 2 }],
    // El medio consume por defecto 2 de pecho + 2 de pierna y el entero 4 + 4.
    ['half', null, { breastEighths: 2, legEighths: 2 }],
    ['half', undefined, { breastEighths: 2, legEighths: 2 }],
    ['whole', null, { breastEighths: 4, legEighths: 4 }],
    ['whole', undefined, { breastEighths: 4, legEighths: 4 }],
  ])('AC-02: chickenConsumption(%s, %s) consume %o', (portion, cut, expected) => {
    const consumption: ChickenConsumption = chickenConsumption(portion, cut);
    expect(consumption).toEqual(expected);
    // Regla de dominio 1: la suma siempre es el total de la presentación.
    expect(consumption.breastEighths + consumption.legEighths).toBe(PORTION_EIGHTHS[portion]);
  });
  it.each<[Portion, Cut | null | undefined]>([
    ['eighth', null],
    ['eighth', undefined],
    ['quarter', null],
    ['quarter', undefined],
    ['half', 'breast'],
    ['half', 'leg'],
    ['whole', 'breast'],
    ['whole', 'leg'],
  ])('AC-02: chickenConsumption(%s, %s) lanza error por combinación inválida', (portion, cut) => {
    expect(() => chickenConsumption(portion, cut)).toThrow();
  });
  it('AC-02: una presentación fuera de PORTIONS lanza error aunque se fuerce el tipo', () => {
    const octavo = 'octavo' as unknown as Portion;
    expect(() => chickenConsumption(octavo, 'breast')).toThrow();
    expect(() => chickenConsumption(octavo, null)).toThrow();
  });

  it('AC-03: exporta el tope de seis presentaciones y los mensajes únicos', () => {
    expect(PRODUCT_PORTIONS_MAX).toBe(6);
    expect(PORTION_CUT_MESSAGE).toBe(PORTION_CUT_TEXT);
    expect(PORTIONS_DUPLICATED_MESSAGE).toBe(PORTIONS_DUPLICATED_TEXT);
  });
  it.each([
    { portion: 'eighth', cut: 'breast', priceCents: 700 },
    { portion: 'quarter', cut: 'leg', priceCents: 1700 },
    { portion: 'half', priceCents: 3200 },
    { portion: 'whole', cut: null, priceCents: 6000 },
    { portion: 'quarter', cut: 'breast', priceCents: 0 },
  ] satisfies ProductPortionInput[])('AC-03: productPortionInputSchema acepta %o', (row) => {
    expect(productPortionInputSchema.parse(row)).toEqual(row);
  });
  it.each([
    { portion: 'eighth', priceCents: 700 },
    { portion: 'eighth', cut: null, priceCents: 700 },
    { portion: 'quarter', priceCents: 1800 },
    { portion: 'quarter', cut: null, priceCents: 1800 },
    { portion: 'half', cut: 'leg', priceCents: 3200 },
    { portion: 'whole', cut: 'breast', priceCents: 6000 },
  ])('AC-03: productPortionInputSchema rechaza %o con el mensaje de correspondencia', (row) => {
    expectRejectedWith(productPortionInputSchema, row, PORTION_CUT_TEXT);
  });
  it.each([
    { portion: 'octavo', cut: 'breast', priceCents: 700 },
    { portion: 'quarter', cut: 'pecho', priceCents: 1800 },
    { portion: 'quarter', cut: 'breast', priceCents: -1 },
    { portion: 'quarter', cut: 'breast', priceCents: 18.5 },
    { portion: 'quarter', cut: 'breast', priceCents: 100000 },
    { portion: 'quarter', cut: 'breast', priceCents: '500' },
    { cut: 'breast', priceCents: 1850 },
    { portion: 'quarter', cut: 'breast' },
    { portion: 'quarter', cut: 'breast', priceCents: 1850, id: 3 },
    { portion: 'quarter', cut: 'breast', priceCents: 1850, productId: 5 },
    { portion: 'half', priceCents: 3200, isActive: true },
    { portion: 'half', priceCents: 3200, breastEighths: 2 },
    'quarter',
    null,
    undefined,
  ])('AC-03: productPortionInputSchema rechaza %o', (input) => {
    expect(productPortionInputSchema.safeParse(input).success).toBe(false);
  });
  it('AC-03: replaceProductPortionsRequestSchema devuelve el mismo conjunto válido', () => {
    const single: ReplaceProductPortionsRequest = {
      portions: [{ portion: 'quarter', cut: 'breast', priceCents: 1850 }],
    };
    expect(replaceProductPortionsRequestSchema.parse(single)).toEqual(single);
    expect(replaceProductPortionsRequestSchema.parse({ portions: [] })).toEqual({ portions: [] });
    const full: ReplaceProductPortionsRequest = { portions: FULL_SET };
    expect(replaceProductPortionsRequestSchema.parse(full)).toEqual(full);
  });
  it.each([
    { portions: [{ portion: 'eighth', priceCents: 700 }] },
    { portions: [{ portion: 'quarter', cut: null, priceCents: 1800 }] },
    { portions: [{ portion: 'half', cut: 'leg', priceCents: 3200 }] },
    { portions: [{ portion: 'whole', cut: 'breast', priceCents: 6000 }] },
    // Una fila inválida entre válidas rechaza todo.
    {
      portions: [
        { portion: 'quarter', cut: 'breast', priceCents: 1850 },
        { portion: 'half', cut: 'leg', priceCents: 3200 },
      ],
    },
  ])('AC-03: el request rechaza %o con el mensaje de correspondencia', (input) => {
    expectRejectedWith(replaceProductPortionsRequestSchema, input, PORTION_CUT_TEXT);
  });
  it.each([
    {
      portions: [
        { portion: 'quarter', cut: 'leg', priceCents: 1700 },
        { portion: 'quarter', cut: 'leg', priceCents: 1750 },
      ],
    },
    {
      portions: [
        { portion: 'half', priceCents: 3200 },
        { portion: 'half', priceCents: 3400 },
      ],
    },
  ])('AC-03: el request rechaza las repetidas en (portion, cut) de %o', (input) => {
    expectRejectedWith(replaceProductPortionsRequestSchema, input, PORTIONS_DUPLICATED_TEXT);
  });
  it('AC-03: un arreglo de 7 filas se rechaza con el mensaje del tope de 6', () => {
    // Solo existen 6 combinaciones válidas: la séptima repite una y supera el tope.
    const seven = {
      portions: [...FULL_SET, { portion: 'quarter', cut: 'breast', priceCents: 1900 }],
    };
    expectRejectedWith(replaceProductPortionsRequestSchema, seven, PORTIONS_MAX_TEXT);
  });
  it.each([
    { portions: [{ portion: 'octavo', priceCents: 700 }] },
    { portions: [{ portion: 'quarter', cut: 'pecho', priceCents: 1800 }] },
    { portions: [{ portion: 'quarter', cut: 'breast', priceCents: -1 }] },
    { portions: [{ portion: 'quarter', cut: 'breast', priceCents: 18.5 }] },
    { portions: [{ portion: 'quarter', cut: 'breast', priceCents: 100000 }] },
    { portions: [{ portion: 'quarter', cut: 'breast', priceCents: '500' }] },
    { portions: [{ portion: 'quarter', cut: 'breast', priceCents: 1850, productId: 5 }] },
    { portions: [{ portion: 'quarter', cut: 'breast', priceCents: 1850 }], total: 1 },
    {},
    { portions: 'x' },
    'un texto',
    null,
    undefined,
  ])('AC-03: replaceProductPortionsRequestSchema rechaza %o', (input) => {
    expect(replaceProductPortionsRequestSchema.safeParse(input).success).toBe(false);
  });

  it('AC-04: productPortionSchema acepta las filas con exactamente las cinco claves', () => {
    for (const row of [
      VALID_PORTION,
      {
        id: 4,
        productId: 5,
        portion: 'half',
        cut: null,
        priceCents: 3200,
      } satisfies ProductPortion,
    ]) {
      const parsed = productPortionSchema.parse(row);
      expect(parsed).toEqual(row);
      expect(Object.keys(parsed).sort()).toEqual([
        'cut',
        'id',
        'portion',
        'priceCents',
        'productId',
      ]);
    }
  });
  it.each([
    { ...VALID_PORTION, id: 0 },
    { ...VALID_PORTION, id: -1 },
    { ...VALID_PORTION, id: '2' },
    { ...VALID_PORTION, productId: 0 },
    { id: 2, portion: 'quarter', cut: 'breast', priceCents: 1850 },
    { ...VALID_PORTION, productId: -5 },
    { ...VALID_PORTION, portion: 'octavo' },
    { ...VALID_PORTION, cut: 'pecho' },
    { ...VALID_PORTION, priceCents: 18.5 },
    { ...VALID_PORTION, priceCents: '1850' },
    { ...VALID_PORTION, priceCents: 100000 },
    { ...VALID_PORTION, createdAt: '2026-10-09T15:00:00.000Z' },
    { ...VALID_PORTION, breastEighths: 2 },
    { ...VALID_PORTION, name: 'Pollo' },
  ])('AC-04: productPortionSchema rechaza %o', (input) => {
    expect(productPortionSchema.safeParse(input).success).toBe(false);
  });
  it('AC-04: productPortionsResponseSchema acepta la lista vacía o con filas estrictas', () => {
    expect(productPortionsResponseSchema.parse({ portions: [] })).toEqual({ portions: [] });
    const response: ProductPortionsResponse = { portions: [VALID_PORTION] };
    expect(productPortionsResponseSchema.parse(response).portions).toHaveLength(1);
    expect(
      productPortionsResponseSchema.safeParse({
        portions: [{ ...VALID_PORTION, createdAt: '2026-10-09T15:00:00.000Z' }],
      }).success,
    ).toBe(false);
    expect(productPortionsResponseSchema.safeParse({ portions: [], total: 0 }).success).toBe(false);
  });
  it('AC-04: ERROR_CODES suma PORTIONS_NOT_ALLOWED y PRODUCT_HAS_PORTIONS sin perder los anteriores', () => {
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
    ])
      expect(ERROR_CODES).toHaveProperty(code, code);
    expect(errorResponseSchema.safeParse(PORTIONS_NOT_ALLOWED_BODY).success).toBe(true);
    expect(errorResponseSchema.safeParse(PRODUCT_HAS_PORTIONS_BODY).success).toBe(true);
  });
});
