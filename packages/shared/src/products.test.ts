import { describe, expect, it } from 'vitest';
import {
  ERROR_CODES,
  PRICE_CENTS_MAX,
  PRODUCT_CATEGORIES,
  PRODUCT_NAME_MAX_LENGTH,
  PRODUCT_NAME_MESSAGE,
  PRODUCT_NAME_PATTERN,
  createProductRequestSchema,
  errorResponseSchema,
  priceCentsSchema,
  productCategorySchema,
  productNameSchema,
  productSchema,
  productsResponseSchema,
  updateProductRequestSchema,
} from './index.ts';
import type {
  CreateProductRequest,
  Product,
  ProductCategory,
  ProductsResponse,
  UpdateProductRequest,
} from './index.ts';

const PRODUCT_NAME_TEXT =
  'Usa de 1 a 60 caracteres: letras, n\u00FAmeros, espacios y los signos punto, coma, ' +
  'ap\u00F3strofo, par\u00E9ntesis, barra, porcentaje, m\u00E1s o guion; empieza con letra o ' +
  'n\u00FAmero.';
const PRICE_CENTS_MESSAGE =
  'El precio debe ser un n\u00FAmero entero de c\u00E9ntimos entre 0 y 99999.';
const NO_CHANGES_MESSAGE = 'No indicaste ning\u00FAn cambio.';
const PRODUCT_NOT_FOUND_BODY = {
  error: { code: 'PRODUCT_NOT_FOUND', message: 'Ese producto no existe.', details: null },
};
const PRODUCT_NAME_TAKEN_BODY = {
  error: {
    code: 'PRODUCT_NAME_TAKEN',
    message: 'Ya existe un producto con ese nombre.',
    details: null,
  },
};
const VALID_PRODUCT = {
  id: 3,
  name: '1/4 de Pollo',
  category: 'chicken',
  priceCents: 1850,
  isActive: true,
} satisfies Product;

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

describe('005: esquemas de productos de la carta', () => {
  it('AC-01: PRODUCT_CATEGORIES es exactamente la lista fija en el orden de la carta', () => {
    // Spec 007 (D-007-02): 'combo' entra en segundo lugar, después del pollo.
    expect(PRODUCT_CATEGORIES).toEqual([
      'chicken',
      'combo',
      'dish',
      'drink',
      'dessert',
      'sauce',
      'extra',
    ]);
    // El type ProductCategory queda fijado por estas asignaciones (typecheck).
    const category: ProductCategory = 'chicken';
    const combo: ProductCategory = 'combo';
    expect(category).toBe('chicken');
    expect(combo).toBe('combo');
  });
  it.each(['chicken', 'combo', 'dish', 'drink', 'dessert', 'sauce', 'extra'])(
    'AC-01: productCategorySchema acepta la categoría %s y devuelve el mismo valor',
    (category) => {
      expect(productCategorySchema.parse(category)).toBe(category);
    },
  );
  it.each([
    'pollo',
    'Chicken',
    'CHICKEN',
    'combos',
    'COMBO',
    'Combo',
    'comida',
    'bebida',
    '',
    ' chicken',
    'chicken ',
    null,
    0,
    ['chicken'],
  ])('AC-01: productCategorySchema rechaza %s', (input) => {
    expect(productCategorySchema.safeParse(input).success).toBe(false);
  });
  it('AC-01: createProductRequestSchema y updateProductRequestSchema aceptan la categoría combo', () => {
    // Un combo se crea y se recategoriza con los esquemas de la 005 (spec 007, AC-01).
    expect(
      createProductRequestSchema.parse({
        name: 'Mostrito',
        category: 'combo',
        priceCents: 2200,
      }),
    ).toEqual({ name: 'Mostrito', category: 'combo', priceCents: 2200 });
    expect(updateProductRequestSchema.parse({ category: 'combo' })).toEqual({
      category: 'combo',
    });
  });

  it('AC-02: exporta el largo máximo, el patrón y el mensaje único del nombre', () => {
    expect(PRODUCT_NAME_MAX_LENGTH).toBe(60);
    expect(PRODUCT_NAME_PATTERN).toEqual(/^[\p{L}\p{N}][\p{L}\p{M}\p{N} .,'()/%+-]*$/u);
    expect(PRODUCT_NAME_PATTERN.flags).toBe('u');
    expect(PRODUCT_NAME_MESSAGE).toBe(PRODUCT_NAME_TEXT);
  });
  it('AC-02: productNameSchema recorta los bordes y normaliza a NFC', () => {
    expect(productNameSchema.parse('  1/4 de Pollo  ')).toBe('1/4 de Pollo');
    expect(productNameSchema.parse('Chicha\u0301')).toBe('Chich\u00E1');
  });
  it.each([
    'Inca Kola 1.5 L',
    'Chicha Morada (jarra)',
    'Papas + queso',
    'Aj\u00ED',
    "Lomo's",
    'x'.repeat(60),
    'Pollo, entero',
    '50% descuento',
  ])('AC-02: productNameSchema acepta %s y devuelve el mismo texto', (name) => {
    expect(productNameSchema.parse(name)).toBe(name);
  });
  it.each([
    '',
    '   ',
    'x'.repeat(61),
    '-Pollo',
    '/Pollo',
    '.Pollo',
    'Pollo\tfrito',
    'Pollo\nfrito',
    'Chicha\u00A0Morada',
    'Pollo \u{1F357}',
    'Pollo <brasa>',
    'Pollo *grande*',
    5,
    null,
    undefined,
  ])('AC-02: productNameSchema rechaza %s con el mensaje único', (input) => {
    expectRejectedWith(productNameSchema, input, PRODUCT_NAME_TEXT);
  });

  it('AC-03: exporta el tope del precio en céntimos', () => {
    expect(PRICE_CENTS_MAX).toBe(99999);
  });
  it.each([0, 1, 1850, 99999])(
    'AC-03: priceCentsSchema acepta %i y devuelve el mismo entero',
    (price) => {
      expect(priceCentsSchema.parse(price)).toBe(price);
    },
  );
  it.each([-1, -1850, 100000, 18.5, 0.5, NaN, Infinity, '1850', null, undefined])(
    'AC-03: priceCentsSchema rechaza %s con el mensaje único',
    (input) => {
      expectRejectedWith(priceCentsSchema, input, PRICE_CENTS_MESSAGE);
    },
  );

  it('AC-04: createProductRequestSchema recorta el nombre y acepta el cuerpo válido', () => {
    const request: CreateProductRequest = {
      name: '  Chicha Morada  ',
      category: 'drink',
      priceCents: 500,
    };
    expect(createProductRequestSchema.parse(request)).toEqual({
      name: 'Chicha Morada',
      category: 'drink',
      priceCents: 500,
    });
  });
  it.each([
    { category: 'drink', priceCents: 500 },
    { name: 'Chicha Morada', priceCents: 500 },
    { name: 'Chicha Morada', category: 'drink' },
    { name: 'Chicha Morada', category: 'drink', priceCents: 500, isActive: false },
    { name: 'Chicha Morada', category: 'drink', priceCents: 500, id: 3 },
    { name: 'Chicha Morada', category: 'drink', priceCents: 500, stock: 10 },
    { name: '', category: 'drink', priceCents: 500 },
    { name: '  ', category: 'drink', priceCents: 500 },
    { name: 'Chicha Morada', category: 'combos', priceCents: 500 },
    { name: 'Chicha Morada', category: 'pollo', priceCents: 500 },
    { name: 'Chicha Morada', category: 'drink', priceCents: -1 },
    { name: 'Chicha Morada', category: 'drink', priceCents: 18.5 },
    { name: 'Chicha Morada', category: 'drink', priceCents: '500' },
    'un texto',
    null,
    undefined,
  ])('AC-04: createProductRequestSchema rechaza %s', (input) => {
    expect(createProductRequestSchema.safeParse(input).success).toBe(false);
  });
  it.each([
    { name: 'Nuevo' },
    { category: 'dish' },
    { priceCents: 0 },
    { isActive: false },
    { isActive: true },
    { name: 'A', priceCents: 100, isActive: false },
  ] satisfies UpdateProductRequest[])('AC-04: updateProductRequestSchema acepta %s', (input) => {
    expect(updateProductRequestSchema.parse(input)).toEqual(input);
  });
  it("AC-04: updateProductRequestSchema rechaza el objeto vacío con 'No indicaste ningún cambio.'", () => {
    expectRejectedWith(updateProductRequestSchema, {}, NO_CHANGES_MESSAGE);
  });
  it.each([
    { id: 2 },
    { name: ' ' },
    { category: 'pollo' },
    { priceCents: 100000 },
    { isActive: 'si' },
    { name: 'Nuevo', extra: 1 },
    { isActive: false, createdAt: '2026-10-08T15:00:00.000Z' },
    'un texto',
    null,
    undefined,
  ])('AC-04: updateProductRequestSchema rechaza %s', (input) => {
    expect(updateProductRequestSchema.safeParse(input).success).toBe(false);
  });

  it('AC-05: productSchema acepta un producto con exactamente las cinco claves', () => {
    const parsed = productSchema.parse(VALID_PRODUCT);
    expect(parsed).toEqual(VALID_PRODUCT);
    expect(Object.keys(parsed).sort()).toEqual([
      'category',
      'id',
      'isActive',
      'name',
      'priceCents',
    ]);
  });
  it.each([
    { ...VALID_PRODUCT, id: 0 },
    { ...VALID_PRODUCT, id: -1 },
    { ...VALID_PRODUCT, id: 1.5 },
    { ...VALID_PRODUCT, id: '3' },
    { ...VALID_PRODUCT, name: '' },
    { ...VALID_PRODUCT, category: 'pollo' },
    { ...VALID_PRODUCT, priceCents: 18.5 },
    { ...VALID_PRODUCT, priceCents: '1850' },
    { id: 3, name: '1/4 de Pollo', category: 'chicken', priceCents: 1850 },
    { ...VALID_PRODUCT, createdAt: '2026-10-08T15:00:00.000Z' },
    { ...VALID_PRODUCT, stock: 5 },
    { ...VALID_PRODUCT, description: 'Rico' },
    { ...VALID_PRODUCT, price: 18.5 },
  ])('AC-05: productSchema rechaza %s', (input) => {
    expect(productSchema.safeParse(input).success).toBe(false);
  });
  it('AC-05: productsResponseSchema acepta la lista vacía o con productos estrictos', () => {
    expect(productsResponseSchema.parse({ products: [] })).toEqual({ products: [] });
    const response: ProductsResponse = { products: [VALID_PRODUCT] };
    expect(productsResponseSchema.parse(response).products).toHaveLength(1);
    expect(
      productsResponseSchema.safeParse({ products: [{ ...VALID_PRODUCT, stock: 3 }] }).success,
    ).toBe(false);
    expect(productsResponseSchema.safeParse({ products: [], total: 0 }).success).toBe(false);
  });
  it('AC-05: ERROR_CODES suma PRODUCT_NOT_FOUND y PRODUCT_NAME_TAKEN sin perder los anteriores', () => {
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
    ])
      expect(ERROR_CODES).toHaveProperty(code, code);
    expect(errorResponseSchema.safeParse(PRODUCT_NOT_FOUND_BODY).success).toBe(true);
    expect(errorResponseSchema.safeParse(PRODUCT_NAME_TAKEN_BODY).success).toBe(true);
  });
});
