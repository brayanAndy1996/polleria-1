// AC-08, AC-09 y AC-10. Spec 007 — archivo nuevo: va EN ROJO hasta que T-07 cree
// el servicio de componentes y sume las dos guardias de categoría en updateProduct.
import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { AppError } from '../src/errors/app-error.ts';
import { defineModels } from '../src/models/index.ts';
import type { Models } from '../src/models/index.ts';
import { createProductService } from '../src/services/products/product.service.ts';
import { createProductPortionService } from '../src/services/products/product-portion.service.ts';
import {
  createComboItemService,
  createComboItemsNotAllowedError,
  createProductHasItemsError,
  createProductIsComponentError,
} from '../src/services/combo-items/combo-item.service.ts';
import {
  clearMenuTables,
  closeTestDatabase,
  connectTestDatabase,
  migrateAndClearAuthTables,
} from './helpers/test-database.ts';

const PRODUCT_NOT_FOUND = {
  code: 'PRODUCT_NOT_FOUND',
  httpStatus: 404,
  message: 'Ese producto no existe.',
};
const COMBO_ITEMS_NOT_ALLOWED = {
  code: 'COMBO_ITEMS_NOT_ALLOWED',
  httpStatus: 409,
  message: 'Solo los productos de la categor\u00EDa Combos pueden tener componentes.',
};
const PRODUCT_HAS_ITEMS = {
  code: 'PRODUCT_HAS_ITEMS',
  httpStatus: 409,
  message:
    'Este producto es un combo con componentes; quita sus componentes antes de ' +
    'cambiar su categor\u00EDa.',
};
const PRODUCT_IS_COMPONENT = {
  code: 'PRODUCT_IS_COMPONENT',
  httpStatus: 409,
  message:
    'Este producto es componente de un combo; qu\u00EDtalo del combo antes de ' +
    'cambiar su categor\u00EDa.',
};
const PRODUCT_HAS_PORTIONS = {
  code: 'PRODUCT_HAS_PORTIONS',
  httpStatus: 409,
  message:
    'Este producto tiene presentaciones de pollo; qu\u00EDtalas antes de cambiar su ' +
    'categor\u00EDa.',
};

// Mensajes de los cuatro issues de componente (D-007-10), por path items.N.*.
const COMPONENT_NOT_FOUND_MESSAGE = 'Ese producto no existe.';
const NESTED_COMBO_MESSAGE = 'Un combo no puede ser componente de otro combo.';
const CHICKEN_NEEDS_PORTION_MESSAGE =
  'El pollo de un combo lleva presentaci\u00F3n (eighth, quarter, half o whole).';
const ONLY_CHICKEN_HAS_PORTION_MESSAGE =
  'Solo un componente de pollo lleva presentaci\u00F3n y parte.';

/** issues de un AppError VALIDATION_ERROR, como { path, message } ya en orden. */
function issuesOf(error: unknown): { path: string; message: string }[] {
  const details = (error as AppError).details as {
    issues?: { path: string; message: string }[];
  } | null;
  expect(Array.isArray(details?.issues)).toBe(true);
  return details?.issues ?? [];
}

/**
 * De un ítem del servicio queda lo comparable sin `id` ni `comboId` (los id cambian
 * entre reemplazos): producto embebido, cantidad, presentación y parte.
 */
function withoutIds<
  T extends { product: unknown; quantity: unknown; portion: unknown; cut: unknown },
>(item: T) {
  return {
    product: item.product,
    quantity: item.quantity,
    portion: item.portion,
    cut: item.cut,
  };
}

describe('007: servicio de componentes de combo sobre polleria_test', () => {
  let sequelize: Sequelize;
  let models: Models;
  let items: ReturnType<typeof createComboItemService>;
  let products: ReturnType<typeof createProductService>;
  let portions: ReturnType<typeof createProductPortionService>;

  const rows = <T extends object>(sql: string, bind?: (string | number | null)[]) =>
    sequelize.query<T>(sql, { type: QueryTypes.SELECT, bind });
  const insertProduct = (
    id: number,
    name: string,
    category: string,
    priceCents: number,
    isActive = true,
  ) =>
    sequelize.query(
      'INSERT INTO products (id, name, category, price_cents, is_active) ' +
        'VALUES ($1, $2, $3, $4, $5)',
      { bind: [id, name, category, priceCents, isActive] },
    );
  const itemRows = (comboId: number) =>
    rows<{
      id: number;
      combo_id: number;
      product_id: number;
      quantity: number;
      portion: string | null;
      cut: string | null;
    }>(
      'SELECT id, combo_id, product_id, quantity, portion, cut FROM combo_items ' +
        'WHERE combo_id = $1 ORDER BY id',
      [comboId],
    );
  const productRow = (id: number) =>
    rows<{ name: string; category: string; price_cents: number; is_active: boolean }>(
      'SELECT name, category, price_cents, is_active FROM products WHERE id = $1',
      [id],
    );

  /** La carta de la AC-08/AC-09: pollo, chaufa, gaseosa y el combo mostrito. */
  const seedMenu = async () => {
    await insertProduct(5, 'Pollo a la brasa', 'chicken', 1850);
    await insertProduct(8, 'Chaufa', 'dish', 1400);
    await insertProduct(2, 'Inca Kola 500 ml', 'drink', 400);
    await insertProduct(9, 'Mostrito', 'combo', 2200);
    return { pollo: 5, chaufa: 8, inca: 2, mostrito: 9 };
  };
  /** Los componentes del mostrito, cargados en desorden a propósito. */
  const mostritoInput = () => ({
    items: [
      { productId: 8, quantity: 1 },
      { productId: 5, quantity: 1, portion: 'quarter', cut: 'leg' },
      { productId: 2, quantity: 2 },
    ],
  });
  /** La salida esperada del mostrito: orden de carta (chicken, dish, drink). */
  const mostritoExpected = () => [
    {
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
    },
    {
      product: {
        id: 8,
        name: 'Chaufa',
        category: 'dish',
        priceCents: 1400,
        isActive: true,
      },
      quantity: 1,
      portion: null,
      cut: null,
    },
    {
      product: {
        id: 2,
        name: 'Inca Kola 500 ml',
        category: 'drink',
        priceCents: 400,
        isActive: true,
      },
      quantity: 2,
      portion: null,
      cut: null,
    },
  ];

  beforeAll(async () => {
    sequelize = await connectTestDatabase();
  });
  beforeEach(async () => {
    await migrateAndClearAuthTables(sequelize);
    await clearMenuTables(sequelize);
    models = defineModels(sequelize);
    items = createComboItemService({ models });
    products = createProductService({ models });
    portions = createProductPortionService({ models });
  });
  afterAll(async () => {
    await closeTestDatabase(sequelize);
  });

  it('AC-08: lista los componentes con el producto embebido y el orden de la carta', async () => {
    await seedMenu();
    await items.replaceComboItems(9, mostritoInput());
    const listed = await items.listComboItems(9);
    expect(listed).toHaveLength(3);
    for (const item of listed) {
      // Cada ítem tiene exactamente las seis claves de D-007-09.
      expect(Object.keys(item).sort()).toEqual([
        'comboId',
        'cut',
        'id',
        'portion',
        'product',
        'quantity',
      ]);
      expect(item.comboId).toBe(9);
      expect(item.id).toBeGreaterThan(0);
      expect(Object.keys(item.product).sort()).toEqual([
        'category',
        'id',
        'isActive',
        'name',
        'priceCents',
      ]);
    }
    // El de pollo primero ('chicken' va antes que 'dish' y 'drink'), pese a entrar
    // segundo en la lista del PUT.
    const comparable = listed.map(withoutIds);
    expect(comparable).toEqual(mostritoExpected());
    // Ninguna clave extra ni en snake_case.
    const serialized = JSON.stringify(listed);
    for (const leak of ['createdAt', 'updatedAt', 'combo_id', 'product_id'])
      expect(serialized).not.toContain(leak);
  });
  it('AC-08: el producto embebido lee los datos actuales, incluido isActive false', async () => {
    await seedMenu();
    await items.replaceComboItems(9, { items: [{ productId: 8, quantity: 1 }] });
    // El componente cambia de nombre, precio y estado DESPUÉS del PUT: el GET debe
    // mostrar los valores vigentes, no los de cuando se cargó.
    await products.updateProduct(8, { name: 'Chaufa amaz\u00F3nico' });
    await products.updateProduct(8, { priceCents: 1600, isActive: false });
    const listed = await items.listComboItems(9);
    expect(listed[0]?.product).toEqual({
      id: 8,
      name: 'Chaufa amaz\u00F3nico',
      category: 'dish',
      priceCents: 1600,
      isActive: false,
    });
  });
  it('AC-08: un producto sin componentes devuelve [], sea combo o de otra categoría', async () => {
    await seedMenu();
    expect(await items.listComboItems(9)).toEqual([]);
    expect(await items.listComboItems(8)).toEqual([]);
    expect(await items.listComboItems(5)).toEqual([]);
  });
  it('AC-08: un producto inexistente se rechaza con AppError PRODUCT_NOT_FOUND', async () => {
    const error = await items.listComboItems(999999).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject(PRODUCT_NOT_FOUND);
  });
  it('AC-08: listProducts ordena el combo detrás del pollo y delante del plato', async () => {
    await insertProduct(5, 'Pollo a la brasa', 'chicken', 1850);
    await insertProduct(9, 'Mostrito', 'combo', 2200);
    await insertProduct(8, 'Chaufa', 'dish', 1400);
    // 'combo' es la segunda categoría de PRODUCT_CATEGORIES (AC-01): la carta lo
    // ubica entre el pollo y los platos.
    expect((await products.listProducts()).map((product) => product.id)).toEqual([5, 9, 8]);
  });

  it('AC-09: reemplaza el conjunto de una vez, lo devuelve ordenado y lo guarda en la base', async () => {
    await seedMenu();
    const result = await items.replaceComboItems(9, mostritoInput());
    expect(result.map(withoutIds)).toEqual(mostritoExpected());
    for (const item of result) expect(item.comboId).toBe(9);
    // La base guarda exactamente esas tres filas, con portion/cut NULL donde toca.
    const saved = await itemRows(9);
    expect(saved).toHaveLength(3);
    expect(saved).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ product_id: 5, quantity: 1, portion: 'quarter', cut: 'leg' }),
        expect.objectContaining({ product_id: 8, quantity: 1, portion: null, cut: null }),
        expect.objectContaining({ product_id: 2, quantity: 2, portion: null, cut: null }),
      ]),
    );
    // El GET posterior muestra el mismo conjunto.
    expect((await items.listComboItems(9)).map(withoutIds)).toEqual(mostritoExpected());
  });
  it('AC-09: una segunda llamada idéntica deja 3 filas, no 6 (idempotente por reemplazo)', async () => {
    await seedMenu();
    await items.replaceComboItems(9, mostritoInput());
    const again = await items.replaceComboItems(9, mostritoInput());
    expect(again.map(withoutIds)).toEqual(mostritoExpected());
    expect(await itemRows(9)).toHaveLength(3);
  });
  it('AC-09: items vacío deja el combo sin componentes y el GET devuelve { items: [] }', async () => {
    await seedMenu();
    await items.replaceComboItems(9, mostritoInput());
    expect(await items.replaceComboItems(9, { items: [] })).toEqual([]);
    expect(await itemRows(9)).toEqual([]);
    expect(await items.listComboItems(9)).toEqual([]);
  });
  it('AC-09: reemplazar por otro conjunto borra las filas ausentes', async () => {
    await seedMenu();
    await items.replaceComboItems(9, mostritoInput());
    await items.replaceComboItems(9, {
      items: [{ productId: 5, quantity: 1, portion: 'whole' }],
    });
    expect(await itemRows(9)).toEqual([
      expect.objectContaining({ product_id: 5, quantity: 1, portion: 'whole', cut: null }),
    ]);
  });
  it('AC-09: solo un combo admite componentes; el resto responde COMBO_ITEMS_NOT_ALLOWED', async () => {
    await seedMenu();
    expect(createComboItemsNotAllowedError()).toMatchObject(COMBO_ITEMS_NOT_ALLOWED);
    for (const productId of [8, 2, 5]) {
      const error = await items
        .replaceComboItems(productId, { items: [{ productId: 8, quantity: 1 }] })
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject(COMBO_ITEMS_NOT_ALLOWED);
    }
    expect(await itemRows(8)).toEqual([]);
    expect(await itemRows(2)).toEqual([]);
    expect(await itemRows(5)).toEqual([]);
  });
  it('AC-09: un producto inexistente se rechaza con PRODUCT_NOT_FOUND sin crear filas', async () => {
    const error = await items
      .replaceComboItems(999999, { items: [{ productId: 8, quantity: 1 }] })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject(PRODUCT_NOT_FOUND);
    expect(await rows('SELECT id FROM combo_items')).toEqual([]);
  });
  it('AC-09: los cuatro problemas de componente llegan en un solo VALIDATION_ERROR, en orden', async () => {
    await seedMenu();
    await items.replaceComboItems(9, { items: [{ productId: 8, quantity: 1 }] });
    const error = await items
      .replaceComboItems(9, {
        items: [
          { productId: 999999, quantity: 1 }, // no existe
          { productId: 9, quantity: 1 }, // el propio combo (auto-referencia)
          { productId: 5, quantity: 1 }, // pollo sin presentación
          { productId: 8, quantity: 1, portion: 'quarter', cut: 'leg' }, // dish con presentación
        ],
      })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: 'VALIDATION_ERROR', httpStatus: 400 });
    expect(issuesOf(error)).toEqual([
      { path: 'items.0.productId', message: COMPONENT_NOT_FOUND_MESSAGE },
      { path: 'items.1.productId', message: NESTED_COMBO_MESSAGE },
      { path: 'items.2.portion', message: CHICKEN_NEEDS_PORTION_MESSAGE },
      { path: 'items.3.portion', message: ONLY_CHICKEN_HAS_PORTION_MESSAGE },
    ]);
    // Nada se guardó: la fila anterior sigue intacta (reemplazo atómico).
    expect(await itemRows(9)).toEqual([expect.objectContaining({ product_id: 8, quantity: 1 })]);
  });
  it('AC-09: un combo como componente se rechaza, sea otro combo o el propio', async () => {
    await seedMenu();
    await insertProduct(11, 'Combo familiar', 'combo', 3900);
    for (const componentId of [11, 9]) {
      const error = await items
        .replaceComboItems(9, { items: [{ productId: componentId, quantity: 1 }] })
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ code: 'VALIDATION_ERROR', httpStatus: 400 });
      expect(issuesOf(error)).toEqual([
        { path: 'items.0.productId', message: NESTED_COMBO_MESSAGE },
      ]);
    }
    expect(await itemRows(9)).toEqual([]);
    expect(await itemRows(11)).toEqual([]);
  });
  it('AC-09: la porción del componente es libre: no exige que el producto la venda suelta', async () => {
    // El pollo solo vende cuarto pierna y entero, pero como componente acepta
    // eighth pecho igual (D-007-04).
    await seedMenu();
    await portions.replaceProductPortions(5, {
      portions: [
        { portion: 'quarter', cut: 'leg', priceCents: 1700 },
        { portion: 'whole', priceCents: 6000 },
      ],
    });
    const result = await items.replaceComboItems(9, {
      items: [{ productId: 5, quantity: 1, portion: 'eighth', cut: 'breast' }],
    });
    expect(result[0]).toMatchObject({
      product: { id: 5 },
      portion: 'eighth',
      cut: 'breast',
    });
    expect(await itemRows(9)).toEqual([
      expect.objectContaining({ product_id: 5, portion: 'eighth', cut: 'breast' }),
    ]);
  });
  it('AC-09: acepta componente desactivado y cantidades en los extremos 1 y 99', async () => {
    await seedMenu();
    await insertProduct(12, 'Suspiro', 'dessert', 700, false);
    const result = await items.replaceComboItems(9, {
      items: [
        { productId: 8, quantity: 1 },
        { productId: 2, quantity: 99 },
        { productId: 12, quantity: 50 },
      ],
    });
    expect(result).toHaveLength(3);
    // El desactivado aparece con isActive: false en la respuesta (D-007-09/10).
    const suspiro = result.find(
      (item: { product: { id: number; isActive: boolean } }) => item.product.id === 12,
    );
    expect(suspiro?.product.isActive).toBe(false);
    expect(await itemRows(9)).toHaveLength(3);
  });
  it('AC-09: las entradas inválidas se rechazan con ZodError sin cambiar filas', async () => {
    await seedMenu();
    await items.replaceComboItems(9, mostritoInput());
    const before = await itemRows(9);
    for (const input of [
      {},
      { items: 'x' },
      { items: [{}] },
      { items: [{ productId: 8, quantity: 0 }] },
      { items: [{ productId: 8, quantity: 1.5 }] },
      { items: [{ productId: 8 }, { productId: 8 }] },
      { items: Array.from({ length: 11 }, (_, index) => ({ productId: index + 1, quantity: 1 })) },
      { items: [], extra: 1 },
      null,
      undefined,
    ])
      await expect(items.replaceComboItems(9, input)).rejects.toBeInstanceOf(ZodError);
    expect(await itemRows(9)).toEqual(before);
  });

  it('AC-10: salir de combo con componentes responde PRODUCT_HAS_ITEMS y no cambia nada', async () => {
    await seedMenu();
    await items.replaceComboItems(9, { items: [{ productId: 8, quantity: 1 }] });
    expect(createProductHasItemsError()).toMatchObject(PRODUCT_HAS_ITEMS);
    const before = await productRow(9);
    for (const changes of [{ category: 'dish' }, { name: 'X', category: 'dish' }]) {
      const error = await products.updateProduct(9, changes).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject(PRODUCT_HAS_ITEMS);
    }
    expect(await productRow(9)).toEqual(before);
    // Otros campos sí se editan: el precio del combo se cambia como cualquier producto.
    expect(await products.updateProduct(9, { priceCents: 2400 })).toMatchObject({
      priceCents: 2400,
    });
    // { category: 'combo' } no es cambio real: pasa aun con componentes.
    expect(await products.updateProduct(9, { category: 'combo' })).toMatchObject({
      category: 'combo',
    });
    // Tras vaciar los componentes, el cambio de categoría ya pasa.
    await items.replaceComboItems(9, { items: [] });
    expect(await products.updateProduct(9, { category: 'dish' })).toMatchObject({
      category: 'dish',
    });
    expect(await productRow(9)).toEqual([
      { name: 'Mostrito', category: 'dish', price_cents: 2400, is_active: true },
    ]);
  });
  it('AC-10: cambiar la categoría de un componente responde PRODUCT_IS_COMPONENT y no cambia nada', async () => {
    await seedMenu();
    await items.replaceComboItems(9, { items: [{ productId: 8, quantity: 1 }] });
    expect(createProductIsComponentError()).toMatchObject(PRODUCT_IS_COMPONENT);
    const before = await productRow(8);
    const error = await products
      .updateProduct(8, { category: 'extra' })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject(PRODUCT_IS_COMPONENT);
    expect(await productRow(8)).toEqual(before);
    // También se bloquea volverlo 'combo' (sería un combo anidado) o 'chicken' con su
    // portion declarada en el combo (rompería el invariante).
    for (const category of ['combo', 'chicken']) {
      const blocked = await products
        .updateProduct(8, { category })
        .catch((caught: unknown) => caught);
      expect(blocked).toBeInstanceOf(AppError);
      expect(blocked).toMatchObject(PRODUCT_IS_COMPONENT);
    }
    // La misma categoría y los demás campos sí pasan.
    expect(await products.updateProduct(8, { category: 'dish' })).toMatchObject({
      category: 'dish',
    });
    expect(await products.updateProduct(8, { name: 'Chaufa amaz\u00F3nico' })).toMatchObject({
      name: 'Chaufa amaz\u00F3nico',
    });
    // Tras quitar al Chaufa del combo, el cambio de categoría ya pasa.
    await items.replaceComboItems(9, { items: [] });
    expect(await products.updateProduct(8, { category: 'extra' })).toMatchObject({
      category: 'extra',
    });
  });
  it('AC-10: pasar un pollo con presentaciones a combo sigue con PRODUCT_HAS_PORTIONS', async () => {
    await insertProduct(5, 'Pollo a la brasa', 'chicken', 1850);
    await portions.replaceProductPortions(5, {
      portions: [{ portion: 'quarter', cut: 'leg', priceCents: 1700 }],
    });
    const error = await products
      .updateProduct(5, { category: 'combo' })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject(PRODUCT_HAS_PORTIONS);
    expect(await productRow(5)).toEqual([
      { name: 'Pollo a la brasa', category: 'chicken', price_cents: 1850, is_active: true },
    ]);
  });
});
