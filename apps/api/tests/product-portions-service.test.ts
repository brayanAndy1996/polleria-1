import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { AppError } from '../src/errors/app-error.ts';
import { defineModels } from '../src/models/index.ts';
import type { Models } from '../src/models/index.ts';
import { createProductService } from '../src/services/products/product.service.ts';
import {
  createPortionsNotAllowedError,
  createProductHasPortionsError,
  createProductPortionService,
} from '../src/services/products/product-portion.service.ts';
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
const PORTIONS_NOT_ALLOWED = {
  code: 'PORTIONS_NOT_ALLOWED',
  httpStatus: 409,
  message: 'Solo los productos de la categor\u00EDa Pollo pueden tener presentaciones.',
};
const PRODUCT_HAS_PORTIONS = {
  code: 'PRODUCT_HAS_PORTIONS',
  httpStatus: 409,
  message:
    'Este producto tiene presentaciones de pollo; qu\u00EDtalas antes de cambiar su ' +
    'categor\u00EDa.',
};

/** Las seis filas cargadas en desorden a propósito: el orden lo pone el servicio. */
const SIX_DISORDERED: [string, string | null, number][] = [
  ['half', null, 3200],
  ['quarter', 'leg', 1700],
  ['eighth', 'leg', 650],
  ['quarter', 'breast', 1850],
  ['whole', null, 6000],
  ['eighth', 'breast', 700],
];
/** El orden de D-006-11: PORTIONS, luego CUTS (breast antes que leg), empates por id. */
const SIX_ORDERED = [
  { portion: 'eighth', cut: 'breast', priceCents: 700 },
  { portion: 'eighth', cut: 'leg', priceCents: 650 },
  { portion: 'quarter', cut: 'breast', priceCents: 1850 },
  { portion: 'quarter', cut: 'leg', priceCents: 1700 },
  { portion: 'half', cut: null, priceCents: 3200 },
  { portion: 'whole', cut: null, priceCents: 6000 },
];
const TRIO_INPUT = [
  { portion: 'quarter', cut: 'breast', priceCents: 1850 },
  { portion: 'quarter', cut: 'leg', priceCents: 1700 },
  { portion: 'half', priceCents: 3200 },
];
const TRIO_ORDERED = [
  { portion: 'quarter', cut: 'breast', priceCents: 1850 },
  { portion: 'quarter', cut: 'leg', priceCents: 1700 },
  { portion: 'half', cut: null, priceCents: 3200 },
];

/** De una presentación del servicio queda solo el triple comparable (los id pueden cambiar). */
const strip = (rows: { portion: string; cut: string | null; priceCents: number }[]) =>
  rows.map(({ portion, cut, priceCents }) => ({ portion, cut, priceCents }));

describe('006: servicio de presentaciones y guardia de categoría sobre polleria_test', () => {
  let sequelize: Sequelize;
  let models: Models;
  let portions: ReturnType<typeof createProductPortionService>;
  let productService: ReturnType<typeof createProductService>;

  const rows = <T extends object>(sql: string, bind?: (string | number | null)[]) =>
    sequelize.query<T>(sql, { type: QueryTypes.SELECT, bind });
  const insertProduct = (id: number, name: string, category = 'chicken', priceCents = 1850) =>
    sequelize.query(
      'INSERT INTO products (id, name, category, price_cents) VALUES ($1, $2, $3, $4)',
      { bind: [id, name, category, priceCents] },
    );
  const insertPortion = (
    productId: number,
    portion: string,
    cut: string | null,
    priceCents: number,
  ) =>
    sequelize.query(
      'INSERT INTO product_portions (product_id, portion, cut, price_cents) ' +
        'VALUES ($1, $2, $3, $4)',
      { bind: [productId, portion, cut, priceCents] },
    );
  const portionRows = (productId: number) =>
    rows<{ id: number; portion: string; cut: string | null; price_cents: number }>(
      'SELECT id, portion, cut, price_cents FROM product_portions WHERE product_id = $1 ORDER BY id',
      [productId],
    );
  const productRow = (id: number) =>
    rows<{ name: string; category: string; price_cents: number; is_active: boolean }>(
      'SELECT name, category, price_cents, is_active FROM products WHERE id = $1',
      [id],
    );

  beforeAll(async () => {
    sequelize = await connectTestDatabase();
  });
  beforeEach(async () => {
    await migrateAndClearAuthTables(sequelize);
    await clearMenuTables(sequelize);
    models = defineModels(sequelize);
    portions = createProductPortionService({ models });
    productService = createProductService({ models });
  });
  afterAll(async () => {
    await closeTestDatabase(sequelize);
  });

  it('AC-07: lista las presentaciones en el orden de la spec con exactamente las cinco claves', async () => {
    await insertProduct(5, 'Pollo a la brasa');
    for (const [portion, cut, priceCents] of SIX_DISORDERED)
      await insertPortion(5, portion, cut, priceCents);
    const listed = await portions.listProductPortions(5);
    expect(strip(listed)).toEqual(SIX_ORDERED);
    for (const row of listed) {
      expect(Object.keys(row).sort()).toEqual(['cut', 'id', 'portion', 'priceCents', 'productId']);
      expect(row.id).toBeGreaterThan(0);
      expect(row.productId).toBe(5);
    }
    // Ninguna lleva createdAt/updatedAt ni el nombre de columna en snake_case.
    const serialized = JSON.stringify(listed);
    expect(serialized).not.toContain('createdAt');
    expect(serialized).not.toContain('updatedAt');
    expect(serialized).not.toContain('product_id');
  });
  it('AC-07: un producto sin presentaciones devuelve [], sea chicken o de otra categoría', async () => {
    await insertProduct(5, 'Pollo a la brasa', 'chicken', 1850);
    await insertProduct(8, 'Chaufa', 'dish', 1400);
    expect(await portions.listProductPortions(5)).toEqual([]);
    expect(await portions.listProductPortions(8)).toEqual([]);
  });
  it('AC-07: un producto inexistente se rechaza con AppError PRODUCT_NOT_FOUND', async () => {
    const error = await portions.listProductPortions(999999).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject(PRODUCT_NOT_FOUND);
  });

  it('AC-08: reemplaza el conjunto de una vez, lo devuelve ordenado y lo guarda en la base', async () => {
    await insertProduct(5, 'Pollo a la brasa');
    const result = await portions.replaceProductPortions(5, { portions: TRIO_INPUT });
    expect(strip(result)).toEqual(TRIO_ORDERED);
    // La base guarda exactamente esas tres filas, con cut NULL en half.
    const saved = await portionRows(5);
    expect(saved).toHaveLength(3);
    expect(saved).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ portion: 'quarter', cut: 'breast', price_cents: 1850 }),
        expect.objectContaining({ portion: 'quarter', cut: 'leg', price_cents: 1700 }),
        expect.objectContaining({ portion: 'half', cut: null, price_cents: 3200 }),
      ]),
    );
  });
  it('AC-08: una segunda llamada idéntica deja el mismo conjunto (idempotente)', async () => {
    await insertProduct(5, 'Pollo a la brasa');
    await portions.replaceProductPortions(5, { portions: TRIO_INPUT });
    const again = await portions.replaceProductPortions(5, { portions: TRIO_INPUT });
    // Los id pueden cambiar entre llamadas (D-006-06): el conjunto es el mismo.
    expect(strip(again)).toEqual(TRIO_ORDERED);
    expect(await portionRows(5)).toHaveLength(3);
  });
  it('AC-08: las filas ausentes se borran y portions vacío deja al producto sin presentaciones', async () => {
    await insertProduct(5, 'Pollo a la brasa');
    await portions.replaceProductPortions(5, { portions: TRIO_INPUT });
    const onlyWhole = await portions.replaceProductPortions(5, {
      portions: [{ portion: 'whole', priceCents: 6000 }],
    });
    expect(strip(onlyWhole)).toEqual([{ portion: 'whole', cut: null, priceCents: 6000 }]);
    expect(await portionRows(5)).toEqual([
      expect.objectContaining({ portion: 'whole', cut: null, price_cents: 6000 }),
    ]);
    expect(await portions.replaceProductPortions(5, { portions: [] })).toEqual([]);
    expect(await portionRows(5)).toEqual([]);
  });
  it('AC-08: una fila inválida entre válidas rechaza todo con ZodError y el conjunto queda intacto', async () => {
    await insertProduct(5, 'Pollo a la brasa');
    await portions.replaceProductPortions(5, { portions: TRIO_INPUT });
    const before = await portionRows(5);
    const withBadRow = {
      portions: [...TRIO_INPUT, { portion: 'half', cut: 'leg', priceCents: 3200 }],
    };
    await expect(portions.replaceProductPortions(5, withBadRow)).rejects.toBeInstanceOf(ZodError);
    expect(await portionRows(5)).toEqual(before);
  });
  it('AC-08: un producto inexistente se rechaza con PRODUCT_NOT_FOUND sin crear filas', async () => {
    const error = await portions
      .replaceProductPortions(999999, { portions: TRIO_INPUT })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject(PRODUCT_NOT_FOUND);
    expect(await rows('SELECT id FROM product_portions')).toEqual([]);
  });
  it('AC-08: un producto de otra categoría se rechaza con PORTIONS_NOT_ALLOWED sin tocar nada', async () => {
    await insertProduct(8, 'Chaufa', 'dish', 1400);
    expect(createPortionsNotAllowedError()).toMatchObject(PORTIONS_NOT_ALLOWED);
    const error = await portions
      .replaceProductPortions(8, { portions: TRIO_INPUT })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject(PORTIONS_NOT_ALLOWED);
    expect(await rows('SELECT id FROM product_portions')).toEqual([]);
  });
  it('AC-08: las entradas inválidas se rechazan con ZodError sin cambiar filas', async () => {
    await insertProduct(5, 'Pollo a la brasa');
    await portions.replaceProductPortions(5, { portions: TRIO_INPUT });
    const before = await portionRows(5);
    for (const input of [
      {},
      { portions: [{ portion: 'quarter', cut: 'breast', priceCents: 18.5 }] },
      { portions: TRIO_INPUT, extra: 1 },
      { portions: 'x' },
      null,
      undefined,
    ])
      await expect(portions.replaceProductPortions(5, input)).rejects.toBeInstanceOf(ZodError);
    expect(await portionRows(5)).toEqual(before);
  });

  it('AC-09: cambiar la categoría fuera de chicken con presentaciones se rechaza y no toca la fila', async () => {
    await insertProduct(5, 'Pollo a la brasa', 'chicken', 1850);
    await insertPortion(5, 'quarter', 'breast', 1850);
    expect(createProductHasPortionsError()).toMatchObject(PRODUCT_HAS_PORTIONS);
    const before = await productRow(5);
    const error = await productService
      .updateProduct(5, { category: 'dish' })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject(PRODUCT_HAS_PORTIONS);
    expect(await productRow(5)).toEqual(before);
    // Las presentaciones tampoco cambiaron.
    expect(await portionRows(5)).toHaveLength(1);
  });
  it('AC-09: category chicken (sin cambio real) y los demás campos se editan con presentaciones', async () => {
    await insertProduct(5, 'Pollo a la brasa', 'chicken', 1850);
    await insertPortion(5, 'half', null, 3200);
    expect(await productService.updateProduct(5, { category: 'chicken' })).toMatchObject({
      id: 5,
      category: 'chicken',
    });
    expect(await productService.updateProduct(5, { name: 'Pollo entero' })).toMatchObject({
      name: 'Pollo entero',
    });
    expect(await productService.updateProduct(5, { priceCents: 3000 })).toMatchObject({
      priceCents: 3000,
    });
    expect(await productService.updateProduct(5, { isActive: false })).toMatchObject({
      isActive: false,
    });
    expect(await portionRows(5)).toHaveLength(1);
  });
  it('AC-09: tras vaciar las presentaciones el cambio de categoría sí resuelve', async () => {
    await insertProduct(5, 'Pollo a la brasa', 'chicken', 1850);
    await insertPortion(5, 'half', null, 3200);
    await portions.replaceProductPortions(5, { portions: [] });
    expect(await productService.updateProduct(5, { category: 'dish' })).toMatchObject({
      id: 5,
      category: 'dish',
    });
    expect(await productRow(5)).toEqual([
      { name: 'Pollo a la brasa', category: 'dish', price_cents: 1850, is_active: true },
    ]);
  });
  it('AC-09: un producto de otra categoría sin presentaciones sí puede pasar a chicken', async () => {
    await insertProduct(8, 'Chaufa', 'dish', 1400);
    expect(await productService.updateProduct(8, { category: 'chicken' })).toMatchObject({
      id: 8,
      category: 'chicken',
    });
    expect(await productRow(8)).toEqual([
      { name: 'Chaufa', category: 'chicken', price_cents: 1400, is_active: true },
    ]);
  });
});
