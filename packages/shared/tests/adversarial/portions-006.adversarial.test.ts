import { describe, expect, it } from 'vitest';
import {
  MIXED_PORTIONS,
  PORTIONS,
  PORTION_EIGHTHS,
  PRODUCT_PORTIONS_MAX,
  SINGLE_CUT_PORTIONS,
  chickenConsumption,
  cutSchema,
  portionSchema,
  productPortionInputSchema,
  productPortionSchema,
  productPortionsResponseSchema,
  replaceProductPortionsRequestSchema,
} from '../../src/index.ts';
import type { Cut, Portion } from '../../src/index.ts';

const PORTIONS_DUPLICATED_TEXT = 'Hay presentaciones repetidas en la lista.';

/** Etiqueta legible de un valor hostil para el mensaje del expect (cubre bigint, NaN e indefinidos). */
const shown = (value: unknown): string => {
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'number' && Number.isNaN(value)) return 'NaN';
  return JSON.stringify(value) ?? 'undefined';
};

/** Las seis combinaciones válidas de (portion, cut) con sus precios. */
const FULL_SET = [
  { portion: 'eighth', cut: 'breast', priceCents: 700 },
  { portion: 'eighth', cut: 'leg', priceCents: 650 },
  { portion: 'quarter', cut: 'breast', priceCents: 1850 },
  { portion: 'quarter', cut: 'leg', priceCents: 1700 },
  { portion: 'half', priceCents: 3200 },
  { portion: 'whole', priceCents: 6000 },
];

/** Atajo: safeParse debe rechazar y al menos un issue debe traer el mensaje indicado. */
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
 * Ataques a los esquemas y a la función pura de la spec 006 que las pruebas de AC no
 * cubren: combinaciones forzadas fuera del tipo en chickenConsumption, duplicados con
 * el orden de claves cambiado o con cut null/ausente, priceCents en formas numéricas
 * hostiles, claves de prototipo, entradas con getters que lanzan y mutabilidad de las
 * constantes compartidas.
 *
 * Regla de la spec para estas pruebas: los caracteres especiales van siempre con
 * escapes, nunca literales.
 */
describe('006-adversarial: esquemas de presentaciones y consumo en octavos', () => {
  it('ADV-006-01: chickenConsumption lanza con cualquier valor fuera del dominio, aunque se fuerce el tipo', () => {
    // La firma promete (Portion, Cut | null | undefined), pero la función es pública y
    // la usarán la API, la web y la Fase 5: cualquier valor colado debe lanzar, nunca
    // devolver un consumo inventado (regla de dominio 1).
    for (const portion of [
      'octavo',
      'EIGHTH',
      'Half',
      '1/4',
      '',
      ' eighth',
      'eighth ',
      'HALF',
      'media',
      '1/2',
      null,
      undefined,
      0,
      8,
      true,
      ['half'],
      { value: 'half' },
      Number.NaN,
    ] as unknown as Portion[])
      expect(() => chickenConsumption(portion, 'breast')).toThrow();
    // eighth/quarter sin parte válida: null, undefined y todo lo que no sea breast/leg.
    for (const cut of [
      null,
      undefined,
      '',
      ' breast',
      'breast ',
      'BREAST',
      'pecho',
      'pierna',
      'wing',
      0,
      1,
      false,
      [],
      {},
      Number.NaN,
    ] as unknown as Cut[])
      for (const portion of ['eighth', 'quarter'] as const)
        expect(() => chickenConsumption(portion, cut)).toThrow();
    // half/whole con cualquier parte presente (incluida una cadena vacía: no es "ausente").
    for (const cut of ['', 'breast', 'leg', 'x', 0, false, []] as unknown as Cut[])
      for (const portion of ['half', 'whole'] as const)
        expect(() => chickenConsumption(portion, cut)).toThrow();
  });

  it('ADV-006-02: chickenConsumption devuelve objetos frescos y la suma siempre cierra en octavos', () => {
    // Invariante de la regla 1 para TODA combinación válida: pecho + pierna = octavos
    // de la presentación, y mutar un resultado no contamina otra llamada.
    const combos: [Portion, Cut | null | undefined][] = [
      ['eighth', 'breast'],
      ['eighth', 'leg'],
      ['quarter', 'breast'],
      ['quarter', 'leg'],
      ['half', null],
      ['half', undefined],
      ['whole', null],
      ['whole', undefined],
    ];
    for (const [portion, cut] of combos) {
      const consumption = chickenConsumption(portion, cut);
      expect(consumption.breastEighths + consumption.legEighths).toBe(PORTION_EIGHTHS[portion]);
      expect(Number.isInteger(consumption.breastEighths)).toBe(true);
      expect(Number.isInteger(consumption.legEighths)).toBe(true);
    }
    const first = chickenConsumption('whole', null);
    first.breastEighths = 999;
    expect(chickenConsumption('whole', null)).toEqual({ breastEighths: 4, legEighths: 4 });
  });

  it('ADV-006-03: las listas del dominio no admiten variantes (espacios, mayúsculas, unicode, sin coercion)', () => {
    // Ni portionSchema ni cutSchema recortan ni normalizan: ' eighth', 'EIGHTH' y un
    // NBSP alrededor se rechazan; igual que las categorías de la 005.
    for (const input of [
      ' eighth',
      'eighth ',
      'eigh\u00A0th',
      'Eighth',
      'EIGHTH',
      'half\u0000',
      'half\n',
      'quarter.',
      '1/4',
      0,
      false,
      BigInt(1),
      Symbol('half'),
    ])
      expect(portionSchema.safeParse(input).success, String(input)).toBe(false);
    for (const input of [
      ' breast',
      'breast ',
      'BREAST',
      'Breast',
      'pecho',
      // 'lеg' con la e cirílica U+0435: se ve igual que 'leg' pero no lo es.
      'l\u0435g',
      'leg\u0000',
      'leg\n',
      0,
      true,
    ])
      expect(cutSchema.safeParse(input).success, String(input)).toBe(false);
    // Los grupos SINGLE_CUT/MIXED cubren PORTIONS sin repetir ni omitir.
    expect([...SINGLE_CUT_PORTIONS, ...MIXED_PORTIONS].sort()).toEqual([...PORTIONS].sort());
  });

  it('ADV-006-04: las repetidas se detectan con claves en otro orden y con cut null vs ausente', () => {
    // El orden de las claves del JSON no cambia la fila: el Set del refine compara
    // (portion, cut) normalizados, no la forma textual.
    const reordered = {
      portions: [
        { portion: 'quarter', cut: 'breast', priceCents: 1850 },
        { priceCents: 1900, cut: 'breast', portion: 'quarter' },
      ],
    };
    expectRejectedWith(replaceProductPortionsRequestSchema, reordered, PORTIONS_DUPLICATED_TEXT);
    // En half/whole el cut ausente y el null explícito son la misma fila (en la base,
    // NULLS NOT DISTINCT igual): mezclar ambas formas también es duplicado.
    const nullVsAbsent = {
      portions: [
        { portion: 'half', priceCents: 3200 },
        { portion: 'half', cut: null, priceCents: 3400 },
      ],
    };
    expectRejectedWith(replaceProductPortionsRequestSchema, nullVsAbsent, PORTIONS_DUPLICATED_TEXT);
    const wholeTwice = {
      portions: [
        { portion: 'whole', cut: null, priceCents: 6000 },
        { portion: 'whole', priceCents: 6100 },
      ],
    };
    expectRejectedWith(replaceProductPortionsRequestSchema, wholeTwice, PORTIONS_DUPLICATED_TEXT);
    // Y no hay falso positivo: las seis combinaciones válidas pasan juntas.
    expect(replaceProductPortionsRequestSchema.parse({ portions: FULL_SET }).portions).toHaveLength(
      PRODUCT_PORTIONS_MAX,
    );
  });

  it('ADV-006-05: priceCents no admite atajos numéricos (float, notación, strings, NaN, Infinity, booleanos)', () => {
    // Regla de dominio 2: solo enteros 0..99999. z.number().int() rechaza 18.5, 1e5
    // (100000 excede el tope), NaN e Infinity; -0 entra y vale 0 (documentado en la 005).
    for (const priceCents of [
      18.5,
      -1,
      100000,
      1e5,
      99999.5,
      Number.NaN,
      Infinity,
      -Infinity,
      '1850',
      '0',
      true,
      null,
      undefined,
      [],
      {},
      BigInt(500),
    ])
      expect(
        productPortionInputSchema.safeParse({ portion: 'quarter', cut: 'breast', priceCents })
          .success,
        shown(priceCents),
      ).toBe(false);
    // Frontera que sí pasa: 0, -0 (queda como 0 en la base), 99999 y 5e4 (=50000 entero).
    for (const [priceCents, expected] of [
      [0, 0],
      [-0, 0],
      [99999, 99999],
      [5e4, 50000],
    ] as [number, number][])
      // `===` y no toBe: Object.is distingue -0 de +0 y aquí solo importa el valor.
      expect(
        productPortionInputSchema.parse({ portion: 'quarter', cut: 'breast', priceCents })
          .priceCents === expected,
      ).toBe(true);
  });

  it('ADV-006-06: el cuerpo no admite elementos ni claves hostiles (null, arrays, __proto__, constructor)', () => {
    for (const portions of [
      [null],
      [undefined],
      [0],
      ['quarter'],
      [['quarter', 'breast', 1850]],
      [[]],
      [{ portion: 'quarter', cut: 'breast', priceCents: 1850, __proto__: { x: 1 } }],
      [{ portion: 'quarter', cut: 'breast', priceCents: 1850, constructor: {} }],
      [{ portion: 'quarter', cut: 'breast', priceCents: 1850, hasOwnProperty: 1 }],
    ])
      expect(
        replaceProductPortionsRequestSchema.safeParse({ portions }).success,
        JSON.stringify(portions),
      ).toBe(false);
    // Claves de prototipo en la raíz tampoco pasan (objeto estricto).
    for (const body of [
      { portions: [], __proto__: { injected: true } },
      { portions: [], constructor: {} },
      { portions: [], toString: 1 },
    ])
      expect(replaceProductPortionsRequestSchema.safeParse(body).success).toBe(false);
    // El prototipo de Object queda intacto tras los parseos.
    expect(Reflect.has({}, 'injected')).toBe(false);
    // portions debe ser un arreglo: objetos con forma de arreglo no engañan.
    for (const portions of [
      'quarter',
      0,
      true,
      null,
      { 0: { portion: 'quarter', cut: 'breast', priceCents: 1850 }, length: 1 },
      { length: 0 },
    ])
      expect(replaceProductPortionsRequestSchema.safeParse({ portions }).success).toBe(false);
  });

  it('ADV-006-07: un getter que lanza dentro del cuerpo se propaga como excepción, no como ZodError', () => {
    // Documentado como observación (Bajo, defensa en profundidad): safeParse evalúa las
    // claves del objeto y un getter hostil lanza una excepción genérica — un llamador
    // interno que reciba un objeto así (no alcanzable por HTTP: JSON.parse jamás crea
    // getters) produciría un 500 en vez de 400. Igual que en los esquemas de la 005.
    const hostile = {
      get portions(): unknown {
        throw new Error('getter hostil');
      },
    };
    expect(() => replaceProductPortionsRequestSchema.safeParse(hostile)).toThrow('getter hostil');
  });

  it('ADV-006-08: las constantes compartidas no están congeladas y una mutación altera el consumo', () => {
    // Documentado como observación (Bajo, deuda de robustez): PORTION_EIGHTHS, PORTIONS
    // y CUTS son `as const` solo en tipos — el objeto en ejecución se puede mutar. Si
    // algún módulo lo hiciera por accidente, chickenConsumption devolvería octavos
    // corrompidos para toda la app. Se restaura el valor al final de la prueba.
    const original = PORTION_EIGHTHS.half;
    try {
      (PORTION_EIGHTHS as { half: number }).half = 3;
      expect(chickenConsumption('half', null)).toEqual({ breastEighths: 1.5, legEighths: 1.5 });
    } finally {
      (PORTION_EIGHTHS as { half: number }).half = original;
    }
    expect(chickenConsumption('half', null)).toEqual({ breastEighths: 2, legEighths: 2 });
    // PORTIONS/CUTS también admiten push en ejecución (los esquemas Zod ya capturaron
    // sus valores al definirse, así que no cambian la validación).
    expect(Array.isArray(PORTIONS)).toBe(true);
  });

  it('ADV-006-09: la respuesta estricta no perdona filas ni claves de más', () => {
    const validRow = { id: 2, productId: 5, portion: 'quarter', cut: 'breast', priceCents: 1850 };
    // Cualquier desviación en la fila o en la raíz invalida la respuesta: es el
    // contrato que consumirán la web y la carta del mozo.
    for (const row of [
      { ...validRow, priceCents: 18.5 },
      { ...validRow, cut: undefined },
      { ...validRow, breastEighths: 2 },
      { ...validRow, createdAt: '2026-10-09T15:00:00.000Z' },
      { ...validRow, product_id: 5 },
      { portion: 'quarter', cut: 'breast', priceCents: 1850 },
      null,
      'quarter',
    ])
      expect(
        productPortionsResponseSchema.safeParse({ portions: [row] }).success,
        JSON.stringify(row),
      ).toBe(false);
    // cut ausente (undefined) en la fila de respuesta es inválido: la API siempre
    // devuelve null explícito para half/whole.
    expect(
      productPortionSchema.safeParse({
        id: 1,
        productId: 5,
        portion: 'half',
        priceCents: 3200,
      }).success,
    ).toBe(false);
    // Id 0, negativos y frontera del INTEGER se rechazan igual que en productSchema.
    for (const id of [0, -1, 1.5, '1', null])
      expect(productPortionSchema.safeParse({ ...validRow, id: id as number }).success).toBe(false);
  });
});
