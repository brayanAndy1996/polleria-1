import { describe, expect, it } from 'vitest';
import {
  COMBO_ITEMS_MAX,
  COMBO_ITEM_QUANTITY_MAX,
  ERROR_CODES,
  PORTION_CUT_MESSAGE,
  PRODUCT_CATEGORIES,
  chickenConsumption,
  comboChickenConsumption,
  comboItemInputSchema,
  comboItemSchema,
  comboItemsResponseSchema,
  replaceComboItemsRequestSchema,
} from '../../src/index.ts';
import type { Portion } from '../../src/index.ts';

const PRODUCT_ID_MESSAGE = 'El identificador del producto no es v\u00e1lido.';
const QUANTITY_MESSAGE = 'Indica cu\u00e1ntas unidades lleva este componente.';
const CUT_WITHOUT_PORTION_MESSAGE = 'Sin presentaci\u00f3n no se puede indicar la parte.';
const ITEMS_MAX_MESSAGE = 'Un combo admite hasta 10 componentes.';
const ITEMS_DUPLICATED_MESSAGE = 'Hay componentes repetidos en la lista.';

/** Etiqueta legible de un valor hostil para el mensaje del expect. */
const shown = (value: unknown): string => {
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'number' && Number.isNaN(value)) return 'NaN';
  return JSON.stringify(value) ?? 'undefined';
};

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

/** Los issues de un safeParse fallido (error tipado de Zod). */
const issuesOf = (result: unknown) =>
  (result as { error: { issues: { path: (string | number)[]; message: string }[] } }).error.issues;

const VALID_PRODUCT = {
  id: 5,
  name: 'Pollo a la brasa',
  category: 'chicken',
  priceCents: 1850,
  isActive: true,
};

/**
 * Ataques a los esquemas y a la funcion pura de la spec 007 que las pruebas de AC no
 * cubren: productId/quantity hostiles en cada forma numerica, la correspondencia
 * presentacion-parte por dentro y por fuera del tipo, repetidos con claves reordenadas
 * o null/ausente, elementos y claves de prototipo, la respuesta estricta y
 * comboChickenConsumption frente a iterables raros, items sueltos y cantidades fuera
 * del contrato (la funcion confia en que el servicio ya las filtro).
 *
 * Regla de la spec para estas pruebas: los caracteres especiales van siempre con
 * escapes, nunca literales.
 */
describe('007-adversarial: esquemas de componentes y consumo de combos', () => {
  it('ADV-007-01: productId y quantity no admiten atajos numericos ni de tipo', () => {
    // Frontera valida: 1 y el maximo del INTEGER de PostgreSQL.
    expect(comboItemInputSchema.parse({ productId: 1, quantity: 1 }).productId).toBe(1);
    expect(comboItemInputSchema.parse({ productId: 2147483647, quantity: 99 }).productId).toBe(
      2147483647,
    );
    // Todo lo demas es issue con el mensaje del identificador.
    for (const productId of [
      0,
      -1,
      1.5,
      1.0 - 0.5,
      2147483648,
      Number.NaN,
      Infinity,
      -Infinity,
      '5',
      '0005',
      ' 5',
      '5 ',
      '5e0',
      '0x10',
      true,
      false,
      null,
      undefined,
      [],
      {},
      BigInt(5),
      { valueOf: () => 5 },
    ])
      expectRejectedWith(comboItemInputSchema, { productId, quantity: 1 }, PRODUCT_ID_MESSAGE);
    // quantity 1..99 entero: ni 0, ni 100, ni decimales, ni texto, ni -0 (que
    // Object.is distingue pero vale 0 igual).
    for (const quantity of [
      0,
      -0,
      -1,
      100,
      1.5,
      99.5,
      Number.NaN,
      Infinity,
      '1',
      '99',
      true,
      null,
      undefined,
      [],
      {},
      BigInt(2),
    ])
      expectRejectedWith(comboItemInputSchema, { productId: 5, quantity }, QUANTITY_MESSAGE);
    // La notacion con exponente es JSON valido: 5e1 vale 50 y es un entero legitimo.
    expect(comboItemInputSchema.parse({ productId: 5, quantity: 5e1 }).quantity).toBe(50);
    expect(comboItemInputSchema.parse({ productId: 5, quantity: 99 }).quantity).toBe(99);
  });

  it('ADV-007-02: la correspondencia presentacion-parte se exige con el mensaje y el path correctos', () => {
    // Formas validas que normalizan a null.
    expect(comboItemInputSchema.parse({ productId: 5, quantity: 1 })).toMatchObject({
      portion: null,
      cut: null,
    });
    expect(
      comboItemInputSchema.parse({ productId: 5, quantity: 1, portion: null, cut: null }),
    ).toMatchObject({ portion: null, cut: null });
    // cut sin presentacion: el mensaje propio cae en cut, con portion ausente o null.
    for (const row of [
      { productId: 5, quantity: 1, cut: 'leg' },
      { productId: 5, quantity: 1, portion: null, cut: 'leg' },
      { productId: 5, quantity: 1, portion: undefined, cut: 'breast' },
    ]) {
      const result = comboItemInputSchema.safeParse(row);
      expect(result.success).toBe(false);
      if (!result.success) {
        const issues = issuesOf(result);
        expect(issues).toContainEqual(
          expect.objectContaining({ path: ['cut'], message: CUT_WITHOUT_PORTION_MESSAGE }),
        );
      }
    }
    // eighth/quarter sin parte (ausente o null) y half/whole con parte: PORTION_CUT_MESSAGE.
    for (const row of [
      { productId: 5, quantity: 1, portion: 'eighth' },
      { productId: 5, quantity: 1, portion: 'quarter', cut: null },
      { productId: 5, quantity: 1, portion: 'half', cut: 'breast' },
      { productId: 5, quantity: 1, portion: 'whole', cut: 'leg' },
    ]) {
      const result = comboItemInputSchema.safeParse(row);
      expect(result.success, JSON.stringify(row)).toBe(false);
      if (!result.success) {
        expect(issuesOf(result)).toContainEqual(
          expect.objectContaining({ path: ['cut'], message: PORTION_CUT_MESSAGE }),
        );
      }
    }
    // Los enums no recortan ni normalizan: variantes y metacaracteres se rechazan.
    for (const portion of [
      'EIGHTH',
      'Quarter',
      ' eighth',
      'eighth ',
      'octavo',
      '1/4',
      'half\u0000',
      'half\n',
      'wh\u043e le',
      0,
      true,
      ['half'],
      { value: 'half' },
    ])
      expect(
        comboItemInputSchema.safeParse({ productId: 5, quantity: 1, portion }).success,
        shown(portion),
      ).toBe(false);
    for (const cut of [
      '',
      'BREAST',
      'Leg',
      ' breast',
      'breast ',
      'pecho',
      'pierna',
      'l\u0435g',
      'leg\u0000',
      0,
      false,
      [],
      {},
    ])
      expect(
        comboItemInputSchema.safeParse({
          productId: 5,
          quantity: 1,
          portion: 'quarter',
          cut,
        }).success,
        shown(cut),
      ).toBe(false);
  });

  it('ADV-007-03: el cuerpo del PUT no admite elementos ni claves hostiles ni repetidos encubiertos', () => {
    // La raiz debe ser un objeto con la lista items.
    for (const body of [
      {},
      { items: 'x' },
      { items: 0 },
      { items: true },
      { items: null },
      { items: {} },
      { items: { 0: { productId: 5, quantity: 1 }, length: 1 } },
      { items: [], extra: 1 },
      { items: [], constructor: {} },
      [],
      'items',
      null,
      0,
    ])
      expect(replaceComboItemsRequestSchema.safeParse(body).success, shown(body)).toBe(false);
    // Elementos hostiles dentro de la lista.
    for (const item of [
      null,
      undefined,
      0,
      'quarter',
      [['productId', 5]],
      [],
      {},
      { productId: 5, quantity: 1, __proto__: { x: 1 } },
      { productId: 5, quantity: 1, constructor: {} },
      { productId: 5, quantity: 1, hasOwnProperty: 1 },
      { productId: 5, quantity: 1, id: 3 },
      { productId: 5, quantity: 1, product_id: 5 },
      { productId: 5, quantity: 1, comboId: 9 },
      { productId: 5, quantity: 1, priceCents: 100 },
    ])
      expect(replaceComboItemsRequestSchema.safeParse({ items: [item] }).success, shown(item)).toBe(
        false,
      );
    // Repetidos por (productId, portion, cut): claves reordenadas, quantity distinta y
    // portion/cut omitidos vs null explicitos son la misma fila (igual que NULLS NOT
    // DISTINCT de la base).
    const duplicateCases = [
      [
        { productId: 5, quantity: 1 },
        { quantity: 2, productId: 5 },
      ],
      [
        { productId: 5, quantity: 1 },
        { productId: 5, quantity: 1, portion: null, cut: null },
      ],
      [
        { productId: 5, quantity: 1, portion: 'quarter', cut: 'breast' },
        { cut: 'breast', portion: 'quarter', quantity: 2, productId: 5 },
      ],
      [
        { productId: 5, quantity: 1, portion: 'half' },
        { productId: 5, quantity: 9, portion: 'half', cut: null },
      ],
    ];
    for (const items of duplicateCases) {
      const result = replaceComboItemsRequestSchema.safeParse({ items });
      expect(result.success).toBe(false);
      if (!result.success) {
        // El issue marca la SEGUNDA aparicion (items.1), no la primera.
        expect(issuesOf(result)).toContainEqual(
          expect.objectContaining({ path: ['items', 1], message: ITEMS_DUPLICATED_MESSAGE }),
        );
      }
    }
    // El "duo" es valido: mismo pollo con pecho y pierna son dos filas distintas.
    expect(
      replaceComboItemsRequestSchema.parse({
        items: [
          { productId: 5, quantity: 1, portion: 'quarter', cut: 'breast' },
          { productId: 5, quantity: 1, portion: 'quarter', cut: 'leg' },
        ],
      }).items,
    ).toHaveLength(2);
    // El tope: 10 pasan, 11 fallan con el mensaje en items.
    const ten = Array.from({ length: COMBO_ITEMS_MAX }, (_, index) => ({
      productId: index + 1,
      quantity: 1,
    }));
    expect(replaceComboItemsRequestSchema.parse({ items: ten }).items).toHaveLength(10);
    expectRejectedWith(
      replaceComboItemsRequestSchema,
      { items: [...ten, { productId: 11, quantity: 1 }] },
      ITEMS_MAX_MESSAGE,
    );
    // Prototipo intacto tras la bateria.
    expect(Reflect.has({}, 'injected')).toBe(false);
  });

  it('ADV-007-04: la respuesta es estricta en el item y en el producto embebido, pero no refina la correspondencia', () => {
    const validItem = {
      id: 1,
      comboId: 9,
      product: VALID_PRODUCT,
      quantity: 1,
      portion: 'quarter',
      cut: 'leg',
    };
    expect(comboItemsResponseSchema.parse({ items: [validItem] }).items).toHaveLength(1);
    // Claves de mas o de menos, y tipos erroneos en cada nivel.
    for (const item of [
      { ...validItem, createdAt: '2026-10-09T15:00:00.000Z' },
      { ...validItem, product_id: 5 },
      { ...validItem, combo_id: 9 },
      { ...validItem, product: { ...VALID_PRODUCT, pinHash: 'x' } },
      { ...validItem, product: { ...VALID_PRODUCT, createdAt: 'hoy' } },
      { ...validItem, product: { id: 5, name: 'Pollo', category: 'chicken' } },
      { ...validItem, id: 0 },
      { ...validItem, id: -1 },
      { ...validItem, id: '1' },
      { ...validItem, quantity: 0 },
      { ...validItem, quantity: 100 },
      { ...validItem, quantity: 1.5 },
      { ...validItem, portion: 'octavo' },
      { ...validItem, cut: 'pecho' },
      { product: VALID_PRODUCT, quantity: 1, portion: null, cut: null },
      null,
      'quarter',
    ])
      expect(comboItemsResponseSchema.safeParse({ items: [item] }).success, shown(item)).toBe(
        false,
      );
    // Observacion documentada (Bajo, sin impacto hoy): comboItemSchema NO refina la
    // correspondencia presentacion-parte que si exige comboItemInputSchema — acepta
    // filas que la API jamas emite ({portion:'quarter',cut:null} o cut sin portion).
    // Es un esquema de respuesta y el servicio solo produce filas coherentes, pero si
    // algun caller lo reutilizara para validar entrada, dejaria pasar lo imposible.
    expect(
      comboItemSchema.safeParse({
        ...validItem,
        portion: 'quarter',
        cut: null,
      }).success,
    ).toBe(true);
    expect(comboItemSchema.safeParse({ ...validItem, portion: null, cut: 'leg' }).success).toBe(
      true,
    );
    // Los tres codigos nuevos estan en ERROR_CODES junto a los anteriores.
    expect(ERROR_CODES).toMatchObject({
      COMBO_ITEMS_NOT_ALLOWED: 'COMBO_ITEMS_NOT_ALLOWED',
      PRODUCT_HAS_ITEMS: 'PRODUCT_HAS_ITEMS',
      PRODUCT_IS_COMPONENT: 'PRODUCT_IS_COMPONENT',
      PRODUCT_HAS_PORTIONS: 'PRODUCT_HAS_PORTIONS',
    });
    expect(PRODUCT_CATEGORIES).toEqual([
      'chicken',
      'combo',
      'dish',
      'drink',
      'dessert',
      'sauce',
      'extra',
    ]);
  });

  it('ADV-007-05: comboChickenConsumption suma por cualquier iterable y devuelve objetos frescos', () => {
    const mostrito = [
      { quantity: 1, portion: 'quarter' as const, cut: 'leg' as const },
      { quantity: 1, portion: null, cut: null },
      { quantity: 2, portion: null, cut: null },
    ];
    const expected = { breastEighths: 0, legEighths: 2 };
    // Arreglo, Set, values() de Map y generador: mismo resultado.
    expect(comboChickenConsumption(mostrito)).toEqual(expected);
    expect(comboChickenConsumption(new Set(mostrito))).toEqual(expected);
    expect(comboChickenConsumption(new Map(mostrito.map((i, k) => [k, i])).values())).toEqual(
      expected,
    );
    function* generate() {
      yield* mostrito;
    }
    expect(comboChickenConsumption(generate())).toEqual(expected);
    // Un generador es de un solo uso: la segunda pasada por el mismo iterable da 0.
    const once = generate();
    comboChickenConsumption(once);
    expect(comboChickenConsumption(once)).toEqual({ breastEighths: 0, legEighths: 0 });
    // quantity 0 aporta 0 (la forma la impide el servicio, pero el producto es 0 igual).
    expect(comboChickenConsumption([{ quantity: 0, portion: 'whole', cut: null }])).toEqual({
      breastEighths: 0,
      legEighths: 0,
    });
    // El tope del servicio: 99 enteros = 792 octavos (mas de un pollo; la spec lo permite).
    expect(
      comboChickenConsumption([{ quantity: COMBO_ITEM_QUANTITY_MAX, portion: 'whole', cut: null }]),
    ).toEqual({ breastEighths: 396, legEighths: 396 });
    // Objetos frescos: mutar un resultado no contamina otra llamada.
    const first = comboChickenConsumption([{ quantity: 1, portion: 'whole', cut: null }]);
    first.breastEighths = -50;
    expect(comboChickenConsumption([{ quantity: 1, portion: 'whole', cut: null }])).toEqual({
      breastEighths: 4,
      legEighths: 4,
    });
  });

  it('ADV-007-06: comboChickenConsumption frente a entradas fuera de contrato', () => {
    // La firma declara `Iterable<...> | ComboConsumptionItem`, pero un item suelto no
    // es iterable: compila y revienta con TypeError en ejecucion. Observacion
    // documentada (Bajo): la union de la firma anuncia un uso que siempre falla; la
    // Fase 2 debe pasar siempre una coleccion.
    const single = { quantity: 1, portion: 'quarter' as const, cut: 'leg' as const };
    expect(() => comboChickenConsumption(single)).toThrow(TypeError);
    // No iterables: null, undefined, numero, booleano y objeto plano lanzan TypeError.
    for (const bad of [null, undefined, 5, true, { items: [] }, Symbol('x')])
      expect(() => comboChickenConsumption(bad as never)).toThrow(TypeError);
    // Una cadena SI es iterable: recorre caracteres y el primero ya rompe en
    // chickenConsumption — lanza, no devuelve un consumo inventado.
    expect(() => comboChickenConsumption('abc' as never)).toThrow();
    // Un elemento null dentro de la lista revienta la lectura de .portion.
    expect(() =>
      comboChickenConsumption([{ quantity: 1, portion: 'whole', cut: null }, null as never]),
    ).toThrow(TypeError);
    // Defensa real: cut sin portion y combinaciones invalidas lanzan (AC-05).
    expect(() => comboChickenConsumption([{ quantity: 1, portion: null, cut: 'leg' }])).toThrow(
      CUT_WITHOUT_PORTION_MESSAGE,
    );
    // portion undefined no es null: cae en chickenConsumption y lanza igual.
    expect(() =>
      comboChickenConsumption([
        { quantity: 1, portion: undefined as unknown as Portion, cut: 'leg' },
      ]),
    ).toThrow();
    expect(() =>
      comboChickenConsumption([{ quantity: 1, portion: 'quarter', cut: null }]),
    ).toThrow();
    expect(() =>
      comboChickenConsumption([{ quantity: 1, portion: 'octavo' as Portion, cut: 'breast' }]),
    ).toThrow();
    // Observacion documentada (Bajo, fuera de contrato): la funcion no defiende
    // quantity — el servicio garantiza enteros 1..99, pero si un caller colara un
    // decimal, negativo o NaN, los octavos salen fraccionados, negativos o NaN y la
    // regla de dominio 1 se rompe en silencio. Se registra el comportamiento real.
    expect(comboChickenConsumption([{ quantity: 1.5, portion: 'eighth', cut: 'leg' }])).toEqual({
      breastEighths: 0,
      legEighths: 1.5, // octavos fraccionados: el pollo solo se mide en enteros
    });
    expect(comboChickenConsumption([{ quantity: -2, portion: 'quarter', cut: 'leg' }])).toEqual({
      breastEighths: 0,
      legEighths: -4,
    });
    const nan = comboChickenConsumption([{ quantity: Number.NaN, portion: 'whole', cut: null }]);
    expect(Number.isNaN(nan.breastEighths)).toBe(true);
  });

  it('ADV-007-07: un getter que lanza dentro del cuerpo se propaga como excepcion, no como ZodError', () => {
    // Documentado como observacion (Bajo, defensa en profundidad — la misma que
    // ADV-006-07): safeParse evalua las claves del objeto y un getter hostil lanza una
    // excepcion generica; un llamador interno que reciba un objeto asi (no alcanzable
    // por HTTP: JSON.parse jamas crea getters) produciria un 500 en vez de 400.
    const hostile = {
      get items(): unknown {
        throw new Error('getter hostil');
      },
    };
    expect(() => replaceComboItemsRequestSchema.safeParse(hostile)).toThrow('getter hostil');
  });

  it('ADV-007-08: las listas del dominio compartido son mutables en ejecucion', () => {
    // Documentado como observacion (Bajo, la misma clase que ADV-006-08):
    // PRODUCT_CATEGORIES es `as const` solo en tipos — el arreglo en ejecucion admite
    // push: si algun modulo lo hiciera por accidente, el orden de la carta y de los
    // componentes saldria corrompido para toda la app (indexOf cambia). Se restaura al
    // final de la prueba.
    const categories = PRODUCT_CATEGORIES as unknown as string[];
    const length = categories.length;
    try {
      categories.push('inventada');
      expect(PRODUCT_CATEGORIES).toHaveLength(length + 1);
      expect(PRODUCT_CATEGORIES.indexOf('inventada' as never)).toBe(length);
    } finally {
      categories.pop();
    }
    expect(PRODUCT_CATEGORIES).toHaveLength(length);
    // El consumo unitario sigue siendo la unica fuente de verdad (RN-006-05): la suma
    // del combo coincide con la de sus items por separado.
    const items = [
      { quantity: 2, portion: 'quarter' as const, cut: 'leg' as const },
      { quantity: 1, portion: 'half' as const, cut: null },
    ];
    const summed = comboChickenConsumption(items);
    const manual = items.reduce(
      (acc, item) => {
        const part = chickenConsumption(item.portion, item.cut);
        return {
          breastEighths: acc.breastEighths + part.breastEighths * item.quantity,
          legEighths: acc.legEighths + part.legEighths * item.quantity,
        };
      },
      { breastEighths: 0, legEighths: 0 },
    );
    expect(summed).toEqual(manual);
  });
});
