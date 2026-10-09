import { describe, expect, it } from 'vitest';
import {
  PRICE_CENTS_MAX,
  PRODUCT_CATEGORIES,
  PRODUCT_NAME_MAX_LENGTH,
  PRODUCT_NAME_MESSAGE,
  createProductRequestSchema,
  priceCentsSchema,
  productCategorySchema,
  productNameSchema,
  productSchema,
  productsResponseSchema,
  updateProductRequestSchema,
} from '../../src/index.ts';

const PRICE_CENTS_MESSAGE =
  'El precio debe ser un n\u00famero entero de c\u00e9ntimos entre 0 y 99999.';
const NO_CHANGES_MESSAGE = 'No indicaste ning\u00fan cambio.';
const VALID_CREATE = { name: 'Chicha Morada', category: 'drink', priceCents: 500 };

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
 * Ataques a los esquemas de la spec 005 que las pruebas de AC no cubren: recorte de
 * espacios Unicode en los bordes, escrituras no latinas que el patrón admite (la
 * unicidad por lower() no las equipara), frontera de 60 puntos de código con letras
 * astrales y pre/post normalización NFC, valores numéricos hostiles para el precio en
 * céntimos, asignación masiva, `undefined` explícito en el PATCH y tolerancias del
 * esquema de lectura productSchema.
 *
 * Regla de la spec para estas pruebas: los caracteres especiales van siempre con
 * escapes (U+00A0 se escribe '\u00A0', nunca literal).
 */
describe('005-adversarial: esquemas de productos y dinero en c\u00e9ntimos', () => {
  it('ADV-005-01: el recorte cubre espacios Unicode en los bordes, pero el patr\u00f3n no admite invisibles ni controles dentro', () => {
    // String.prototype.trim() recorta más que el espacio ASCII: NBSP, BOM (U+FEFF),
    // espacio ideográfico y separadores de línea/párrafo también salen de los bordes.
    for (const [label, name] of [
      ['NBSP', '\u00a0Chicha\u00a0'],
      ['BOM U+FEFF', '\ufeffPollo\ufeff'],
      ['espacio ideogr\u00e1fico U+3000', '\u3000Pollo\u3000'],
      ['separador de l\u00ednea U+2028', '\u2028Pollo\u2028'],
      ['separador de p\u00e1rrafo U+2029', '\u2029Aj\u00ed\u2029'],
      ['tab en bordes', '\u00091/4 de Pollo\u0009'],
      ['vertical tab U+000B', '\u000bChicha\u000b'],
    ] as [string, string][]) {
      const parsed = productNameSchema.safeParse(name);
      expect.soft(parsed.success, label).toBe(true);
      if (parsed.success) expect.soft(parsed.data.trim()).toBe(parsed.data);
    }
    // Un espacio duro o cualquier espacio raro ENTRE caracteres sigue fuera.
    for (const [label, name] of [
      ['ZWSP U+200B', '\u200bPollo'],
      ['NBSP dentro', 'Chicha\u00a0Morada'],
      ['NUL', 'Pollo\u0000frito'],
      ['RTLO U+202E', 'Pollo\u202efrito'],
      ['soft hyphen U+00AD', 'Pollo\u00adfrito'],
      ['bell U+0007', 'Pollo\u0007frito'],
      ['DEL U+007F', 'Pollo\u007ffrito'],
    ] as [string, string][])
      expect.soft(productNameSchema.safeParse(name).success, label).toBe(false);
  });

  it('ADV-005-02: el patr\u00f3n admite letras y d\u00edgitos de CUALQUIER escritura (homoglifos incluidos)', () => {
    // \p{L}/\p{N} abarcan cirílico, griego, árabe y ancho completo: dos nombres que se
    // ven idénticos (una 'a' cirílica U+0430 vs. la 'a' latina) son textos distintos
    // para lower() de la base — la unicidad de RN-005-05 no los equipara (ADV-005-20).
    for (const name of [
      'Chich\u0430', // la 'a' final es cirílica U+0430
      '\u0420ollo', // la 'P' es cirílica U+0420
      'C\u0430ja', // la 'a' es cirílica U+0430
      '\u0391rroz', // la 'A' es griega U+0391
      '\u039fregano', // la 'O' es griega U+039F
      '\u0663', // dígito arábigo-índico U+0663: \p{N} lo admite como primer carácter
      '\uff15', // dígito de ancho completo U+FF15
      '\ufdfa', // ligadura U+FDFA (\p{Lo})
      '\u0130nca', // 'I' con punto U+0130: lower() la deja como 'i' + punto combinante
      '\u041f\u0440\u0438\u0432\u0435\u0442', // palabra cirílica completa
      '\u6f22\u5b57', // ideogramas
    ]) {
      const parsed = productNameSchema.safeParse(name);
      expect.soft(parsed.success, name).toBe(true);
      if (parsed.success) expect.soft(parsed.data.normalize('NFC')).toBe(parsed.data);
    }
  });

  it('ADV-005-03: nombres borde que el patr\u00f3n admite aunque sorprendan (superficie documentada)', () => {
    // Todo lo que el patrón acepta explícitamente: espacios internos (incluidos
    // dobles — coexisten con la versión de un espacio, ver ADV-005-20), puntuación al
    // final, solo dígitos y nombres que son propiedades de Object.prototype.
    for (const name of [
      'Chicha  Morada', // doble espacio interno: NO se colapsa
      'Chicha.', // puntuación final
      'Pollo, entero,',
      'A--B',
      "Lomo's,",
      '0',
      '911',
      '5,5',
      'constructor',
      'hasOwnProperty',
      'null',
      'undefined',
      'x',
      '1/8',
    ]) {
      const parsed = productNameSchema.safeParse(name);
      expect.soft(parsed.success, JSON.stringify(name)).toBe(true);
      if (parsed.success) expect.soft(parsed.data).toBe(name);
    }
    // La regla del primer carácter sigue firme: no empieza con letra ni dígito.
    // (' Pollo' no está aquí: el recorte va ANTES del patrón y lo rescata a 'Pollo').
    for (const name of ['-Pollo', '(jarra)', "'a", ',cafe', '%50', '+extra', ' - Pollo'])
      expect.soft(productNameSchema.safeParse(name).success, name).toBe(false);
  });

  it('ADV-005-04: el l\u00edmite de 60 se cuenta en puntos de c\u00f3digo tras la NFC, igual que VARCHAR(60)', () => {
    // Zod cuenta puntos de código: 60 con una letra astral (61 unidades UTF-16) entra.
    expect(productNameSchema.safeParse('x'.repeat(59) + '\ud835\udc00').success).toBe(true);
    expect(productNameSchema.safeParse('x'.repeat(58) + '\ud835\udc00\ud835\udc00').success).toBe(
      true,
    );
    // 61 puntos de código rechaza aunque las unidades UTF-16 coincidan con 60+1.
    expect(productNameSchema.safeParse('x'.repeat(61)).success).toBe(false);
    expect(productNameSchema.safeParse('x'.repeat(60) + '\ud835\udc00').success).toBe(false);
    // La NFC va antes del límite: 61 puntos de código crudos que componen a 60 pasan.
    const preNfc = 'x'.repeat(59) + 'e\u0301'; // 'e' + U+0301: 61 cp crudos → 'é': 60
    const parsed = productNameSchema.safeParse(preNfc);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toBe('x'.repeat(59) + '\u00e9');
    // Y si tras componer sigue en 61, rechaza.
    expect(productNameSchema.safeParse('x'.repeat(60) + 'e\u0301').success).toBe(false);
    // Un nombre que empieza con marca combinante no es válido (no es \p{L}\p{N}).
    expect(productNameSchema.safeParse('\u0301Pollo').success).toBe(false);
  });

  it('ADV-005-05: priceCentsSchema frente a n\u00fameros hostiles y tipos que no son n\u00famero', () => {
    // Enteros disfrazados: -0, enteros en notación float/exponencial y 99999.0 pasan —
    // siguen siendo enteros en céntimos. -0 se guarda como 0 en la base.
    for (const value of [-0, 0.0, 99999.0, 1e2, 5e4]) {
      const parsed = priceCentsSchema.safeParse(value);
      expect.soft(parsed.success, String(value)).toBe(true);
    }
    expect(Object.is(priceCentsSchema.parse(-0), -0)).toBe(true); // queda -0 al parsear
    // Frontera exacta.
    expect(priceCentsSchema.safeParse(PRICE_CENTS_MAX).success).toBe(true);
    expect(priceCentsSchema.safeParse(PRICE_CENTS_MAX + 1).success).toBe(false);
    // Rechazos con el mensaje único: negativos, decimales reales, desbordes, tipos.
    for (const value of [
      -0.5,
      99999.999,
      100000.0,
      Number.MAX_SAFE_INTEGER,
      2 ** 31,
      -2147483648,
      Infinity,
      -Infinity,
      NaN,
      10n, // BigInt: no es number
      true,
      false,
      new Number(5), // objetos envoltorio
      new String('500'),
      { valueOf: () => 500 },
      [],
      Symbol(500),
    ])
      expectRejectedWith(priceCentsSchema, value, PRICE_CENTS_MESSAGE);
  });

  it('ADV-005-06: createProductRequestSchema no admite asignaci\u00f3n masiva ni tipos hostiles', () => {
    for (const extra of [
      { isActive: false }, // RN-005-09: nace activo, no se negocia
      { isActive: true },
      { id: 7 },
      { price_cents: 500 }, // snake_case no se acepta: el contrato es camelCase
      { stock: 10 },
      { createdAt: '2026-10-08T15:00:00.000Z' },
      { updatedAt: '2026-10-08T15:00:00.000Z' },
      { portions: ['quarter'] },
      { constructor: 'x' },
      { toString: 'x' },
      { hasOwnProperty: true },
    ])
      expect
        .soft(createProductRequestSchema.safeParse({ ...VALID_CREATE, ...extra }).success)
        .toBe(false);
    // __proto__ como clave propia vía JSON.parse.
    expect(
      createProductRequestSchema.safeParse(
        JSON.parse(
          '{"name":"Chicha","category":"drink","priceCents":500,"__proto__":{"admin":true}}',
        ),
      ).success,
    ).toBe(false);
    expect(Reflect.has({}, 'admin')).toBe(false);
    // Tipos que no son objeto plano.
    for (const body of [
      [VALID_CREATE],
      'Chicha',
      42,
      true,
      null,
      undefined,
      new Date('2026-10-08'),
    ])
      expect.soft(createProductRequestSchema.safeParse(body).success).toBe(false);
    // Un objeto con prototipo null sí pasa el objeto estricto (es un objeto plano para Zod).
    const nullProto = Object.create(null) as Record<string, unknown>;
    Object.assign(nullProto, VALID_CREATE);
    expect(createProductRequestSchema.safeParse(nullProto).success).toBe(true);
    // Campos con tipos cambiados.
    for (const body of [
      { ...VALID_CREATE, name: { toString: () => 'X' } },
      { ...VALID_CREATE, name: new String('X') },
      { ...VALID_CREATE, name: [] },
      { ...VALID_CREATE, category: new String('drink') },
      { ...VALID_CREATE, category: { valueOf: () => 'drink' } },
      { ...VALID_CREATE, priceCents: '500' },
      { ...VALID_CREATE, priceCents: { valueOf: () => 500 } },
    ])
      expect.soft(createProductRequestSchema.safeParse(body).success).toBe(false);
  });

  it('ADV-005-07: updateProductRequestSchema con undefined expl\u00edcito, claves extra y falsy presentes', () => {
    // Claves propias pero todas undefined = mismo "sin cambios" que {}.
    for (const input of [
      { name: undefined },
      { isActive: undefined },
      { name: undefined, category: undefined, priceCents: undefined, isActive: undefined },
    ]) {
      const parsed = updateProductRequestSchema.safeParse(input);
      expect.soft(parsed.success, JSON.stringify(Object.keys(input))).toBe(false);
      if (!parsed.success)
        expect(parsed.error.issues.map((issue) => issue.message)).toContain(NO_CHANGES_MESSAGE);
    }
    // Valores falsy PRESENTES sí cuentan como cambio (0 y false no son undefined).
    for (const input of [
      { priceCents: 0 },
      { isActive: false },
      { name: 'x', priceCents: 0, isActive: false },
      { name: undefined, priceCents: 0 }, // undefined se ignora si hay un cambio real
    ])
      expect.soft(updateProductRequestSchema.safeParse(input).success).toBe(true);
    // El resultado solo trae las claves que vinieron.
    const parsed = updateProductRequestSchema.safeParse({ name: undefined, isActive: false });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual({ isActive: false });
    // Una clave desconocida aunque valga undefined: objeto estricto rechaza.
    expect(
      updateProductRequestSchema.safeParse({ isActive: false, extra: undefined }).success,
    ).toBe(false);
    // Con clave desconocida y sin cambios reales se reportan los dos motivos.
    const both = updateProductRequestSchema.safeParse({ stock: 1 });
    expect(both.success).toBe(false);
    if (!both.success) {
      const messages = both.error.issues.map((issue) => issue.message);
      expect(messages.some((message) => message.includes('stock'))).toBe(true);
      expect(messages).toContain(NO_CHANGES_MESSAGE);
    }
    // __proto__ por JSON y tipos hostiles de isActive.
    expect(
      updateProductRequestSchema.safeParse(JSON.parse('{"isActive":false,"__proto__":{}}')).success,
    ).toBe(false);
    for (const input of [
      { isActive: 'false' },
      { isActive: 0 },
      { isActive: 1 },
      { isActive: null },
      { isActive: {} },
      { priceCents: null },
      { priceCents: '100' },
      { category: null },
      { category: ['dish'] },
      { name: null },
      { name: 42 },
      [{ isActive: false }],
      'x',
      null,
      undefined,
      0,
    ])
      expect.soft(updateProductRequestSchema.safeParse(input).success).toBe(false);
  });

  it('ADV-005-08: productSchema es estricto pero tolerante con un id fuera de int4', () => {
    // El esquema de lectura valida entero positivo SIN tope: un id que la base nunca
    // genera (> 2147483647) lo acepta igual. Es tolerancia del contrato de salida; la
    // API solo emite ids reales. Se documenta para que no crezca sin querer.
    for (const id of [2147483648, 9999999999999, Number.MAX_SAFE_INTEGER]) {
      const parsed = productSchema.safeParse({
        id,
        name: 'Chicha',
        category: 'drink',
        priceCents: 500,
        isActive: true,
      });
      expect.soft(parsed.success, String(id)).toBe(true);
    }
    // Pero sí defiende el resto: un name inválido en la respuesta invalida el
    // producto. Ojo: un nombre con espacios en bordes NO rechaza — el esquema lo
    // normaliza en la lectura (productNameSchema lleva trim+NFC): queda parseado como
    // 'Chicha'. Tolerancia del contrato de entrada; la API nunca lo emite así.
    const trimmed = productSchema.safeParse({
      id: 3,
      name: '  Chicha  ',
      category: 'drink',
      priceCents: 500,
      isActive: true,
    });
    expect(trimmed.success).toBe(true);
    if (trimmed.success) expect(trimmed.data.name).toBe('Chicha');
    for (const leak of [
      { name: '' },
      { name: 'Pollo\tfrito' },
      { priceCents: 100000 },
      { priceCents: '500' },
      { category: 'admin' },
      { isActive: 'si' },
      { isActive: 1 },
      { createdAt: 'x' },
      { stock: 0 },
    ])
      expect
        .soft(
          productSchema.safeParse({
            id: 3,
            name: 'Chicha',
            category: 'drink',
            priceCents: 500,
            isActive: true,
            ...leak,
          }).success,
        )
        .toBe(false);
    // productsResponseSchema: raíz estricta y arreglo obligatorio.
    for (const body of [[], { products: null }, { products: {}, extra: 1 }, {}])
      expect.soft(productsResponseSchema.safeParse(body).success).toBe(false);
  });

  it('ADV-005-09: productCategorySchema solo acepta las siete cadenas exactas', () => {
    // Spec 007: 'combo' es la séptima categoría (segundo lugar). 'combos' sigue fuera.
    for (const input of [
      'admin', // escalar de privilegio no es categoría
      'CHICKEN ',
      'chicken\x00',
      'chicken\n',
      'Chicken',
      'pollo',
      'combos',
      ['chicken'],
      { valueOf: () => 'chicken' },
      new String('chicken'),
      0,
      true,
      Symbol('chicken'),
    ])
      expect.soft(productCategorySchema.safeParse(input).success).toBe(false);
    // Las siete exactas sí.
    for (const category of PRODUCT_CATEGORIES)
      expect.soft(productCategorySchema.safeParse(category).success).toBe(true);
  });

  it('ADV-005-10: cada campo reporta su mensaje \u00fanico y no hay mensajes gen\u00e9ricos de Zod', () => {
    const badName = createProductRequestSchema.safeParse({ ...VALID_CREATE, name: '<x>' });
    expect(badName.success).toBe(false);
    if (!badName.success)
      expect(badName.error.issues.map((issue) => issue.message)).toEqual([PRODUCT_NAME_MESSAGE]);
    const badPrice = createProductRequestSchema.safeParse({
      ...VALID_CREATE,
      priceCents: 18.5,
    });
    expect(badPrice.success).toBe(false);
    if (!badPrice.success)
      expect(badPrice.error.issues.map((issue) => issue.message)).toEqual([PRICE_CENTS_MESSAGE]);
    // name y priceCents inválidos a la vez reportan un issue por campo.
    const both = createProductRequestSchema.safeParse({
      name: '<x>',
      category: 'drink',
      priceCents: -1,
    });
    expect(both.success).toBe(false);
    if (!both.success) {
      const messages = both.error.issues.map((issue) => issue.message);
      expect(messages).toContain(PRODUCT_NAME_MESSAGE);
      expect(messages).toContain(PRICE_CENTS_MESSAGE);
    }
    // PRODUCT_NAME_MAX_LENGTH es la misma que se documenta.
    expect(PRODUCT_NAME_MAX_LENGTH).toBe(60);
  });
});
