import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { defineModels } from '../src/models/index.ts';
import type { Models } from '../src/models/index.ts';
import {
  createProductNameTakenError,
  createProductNotFoundError,
  createProductService,
} from '../src/services/products/product.service.ts';
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
const PRODUCT_NAME_TAKEN = {
  code: 'PRODUCT_NAME_TAKEN',
  httpStatus: 409,
  message: 'Ya existe un producto con ese nombre.',
};

describe('005: servicio de productos sobre polleria_test', () => {
  let sequelize: Sequelize;
  let models: Models;
  let service: ReturnType<typeof createProductService>;

  const rows = <T extends object>(sql: string, bind?: (string | number)[]) =>
    sequelize.query<T>(sql, { type: QueryTypes.SELECT, bind });
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
    service = createProductService({ models });
  });
  afterAll(async () => {
    await closeTestDatabase(sequelize);
  });

  it('AC-08: lista la carta en el orden de la spec, inactivos incluidos, con las cinco claves', async () => {
    expect(await service.listProducts()).toEqual([]);
    // Se crean en desorden a propósito: el orden lo pone la carta, no la creación.
    const chicha = await service.createProduct({
      name: 'Chicha Morada',
      category: 'drink',
      priceCents: 500,
    });
    const entero = await service.createProduct({
      name: 'Pollo entero',
      category: 'chicken',
      priceCents: 6500,
    });
    const cuarto = await service.createProduct({
      name: '1/4 de Pollo',
      category: 'chicken',
      priceCents: 1850,
    });
    const chaufa = await service.createProduct({
      name: 'Chaufa',
      category: 'dish',
      priceCents: 1400,
    });
    const agua = await service.createProduct({
      name: 'agua',
      category: 'drink',
      priceCents: 200,
    });
    const aji = await service.createProduct({ name: 'Aj\u00ED', category: 'sauce', priceCents: 0 });
    const tresLeches = await service.createProduct({
      name: 'Tres Leches',
      category: 'dessert',
      priceCents: 900,
    });
    await service.updateProduct(tresLeches.id, { isActive: false });

    const products = await service.listProducts();
    expect(products).toEqual([
      {
        id: cuarto.id,
        name: '1/4 de Pollo',
        category: 'chicken',
        priceCents: 1850,
        isActive: true,
      },
      {
        id: entero.id,
        name: 'Pollo entero',
        category: 'chicken',
        priceCents: 6500,
        isActive: true,
      },
      { id: chaufa.id, name: 'Chaufa', category: 'dish', priceCents: 1400, isActive: true },
      { id: agua.id, name: 'agua', category: 'drink', priceCents: 200, isActive: true },
      { id: chicha.id, name: 'Chicha Morada', category: 'drink', priceCents: 500, isActive: true },
      {
        id: tresLeches.id,
        name: 'Tres Leches',
        category: 'dessert',
        priceCents: 900,
        isActive: false,
      },
      { id: aji.id, name: 'Aj\u00ED', category: 'sauce', priceCents: 0, isActive: true },
    ]);
    for (const product of products) {
      expect(Object.keys(product).sort()).toEqual([
        'category',
        'id',
        'isActive',
        'name',
        'priceCents',
      ]);
    }
    const serialized = JSON.stringify(products);
    expect(serialized).not.toContain('createdAt');
    expect(serialized).not.toContain('updatedAt');
    expect(serialized).not.toContain('price_cents');
  });

  it('AC-08: los empates de la colación española se resuelven por id', async () => {
    // lower() distingue 'Aji' de 'Ají' (el índice único deja pasar ambos), pero la colación
    // insensible a tildes los empata: manda el id menor.
    const ajiSinTilde = await service.createProduct({
      name: 'Aji',
      category: 'sauce',
      priceCents: 0,
    });
    const ajiConTilde = await service.createProduct({
      name: 'Aj\u00ED',
      category: 'sauce',
      priceCents: 0,
    });
    const products = await service.listProducts();
    expect(products.map((product) => product.id)).toEqual([ajiSinTilde.id, ajiConTilde.id]);
    expect(products.map((product) => product.name)).toEqual(['Aji', 'Aj\u00ED']);
  });

  it('AC-09: crea el producto recortado y activo, y lo guarda con snake_case', async () => {
    expect(createProductNameTakenError()).toMatchObject(PRODUCT_NAME_TAKEN);
    expect(createProductNotFoundError()).toMatchObject(PRODUCT_NOT_FOUND);
    const created = await service.createProduct({
      name: '  Chicha Morada  ',
      category: 'drink',
      priceCents: 500,
    });
    expect(created).toEqual({
      id: created.id,
      name: 'Chicha Morada',
      category: 'drink',
      priceCents: 500,
      isActive: true,
    });
    expect(Object.keys(created).sort()).toEqual([
      'category',
      'id',
      'isActive',
      'name',
      'priceCents',
    ]);
    expect(await productRow(created.id)).toEqual([
      { name: 'Chicha Morada', category: 'drink', price_cents: 500, is_active: true },
    ]);
  });
  it('AC-09: acepta precio 0 (una crema que no se cobra entra a la carta)', async () => {
    const created = await service.createProduct({
      name: 'Aj\u00ED',
      category: 'sauce',
      priceCents: 0,
    });
    expect(created).toMatchObject({ priceCents: 0, isActive: true });
    expect(await productRow(created.id)).toEqual([expect.objectContaining({ price_cents: 0 })]);
  });
  it('AC-09: un nombre tomado, con otra capitalización o estando inactivo, responde PRODUCT_NAME_TAKEN sin crear fila', async () => {
    await service.createProduct({ name: 'Chicha Morada', category: 'drink', priceCents: 500 });
    await expect(
      service.createProduct({ name: 'chicha morada', category: 'drink', priceCents: 600 }),
    ).rejects.toMatchObject(PRODUCT_NAME_TAKEN);
    // El índice único alcanza también a los inactivos.
    await sequelize.query('UPDATE products SET is_active = false');
    await expect(
      service.createProduct({ name: 'CHICHA MORADA', category: 'drink', priceCents: 700 }),
    ).rejects.toMatchObject(PRODUCT_NAME_TAKEN);
    expect(await rows('SELECT id FROM products')).toHaveLength(1);
  });
  it('AC-09: las entradas inválidas se rechazan con ZodError sin crear fila', async () => {
    for (const input of [
      { name: 'Chicha', category: 'drink' },
      { name: 'Chicha', category: 'combo', priceCents: 100 },
      { name: 'Chicha', category: 'drink', priceCents: 18.5 },
      { name: '', category: 'drink', priceCents: 100 },
      { name: 'Chicha', category: 'drink', priceCents: 100, stock: 3 },
      undefined,
      null,
    ])
      await expect(service.createProduct(input)).rejects.toBeInstanceOf(ZodError);
    expect(await rows('SELECT id FROM products')).toEqual([]);
  });

  it('AC-10: edita precio, nombre y categoría, solos y combinados, sin tocar lo demás', async () => {
    const chicha = await service.createProduct({
      name: 'Chicha Morada',
      category: 'drink',
      priceCents: 500,
    });
    const priced = await service.updateProduct(chicha.id, { priceCents: 700 });
    expect(priced).toEqual({
      id: chicha.id,
      name: 'Chicha Morada',
      category: 'drink',
      priceCents: 700,
      isActive: true,
    });
    expect(await productRow(chicha.id)).toEqual([
      { name: 'Chicha Morada', category: 'drink', price_cents: 700, is_active: true },
    ]);
    const renamed = await service.updateProduct(chicha.id, { name: '  Chicha Morada Grande  ' });
    expect(renamed).toMatchObject({ name: 'Chicha Morada Grande', priceCents: 700 });
    const recategorized = await service.updateProduct(chicha.id, {
      category: 'extra',
      priceCents: 250,
    });
    expect(recategorized).toMatchObject({ category: 'extra', priceCents: 250 });
    expect(await productRow(chicha.id)).toEqual([
      { name: 'Chicha Morada Grande', category: 'extra', price_cents: 250, is_active: true },
    ]);
  });
  it('AC-10: rechaza el objeto vacío y las entradas inválidas con ZodError sin cambiar la fila', async () => {
    const chicha = await service.createProduct({
      name: 'Chicha Morada',
      category: 'drink',
      priceCents: 500,
    });
    const before = await productRow(chicha.id);
    const empty = await service.updateProduct(chicha.id, {}).catch((error: unknown) => error);
    expect(empty).toBeInstanceOf(ZodError);
    expect((empty as ZodError).issues.map((issue) => issue.message)).toContain(
      'No indicaste ning\u00FAn cambio.',
    );
    for (const input of [
      { category: 'pollo' },
      { priceCents: -1 },
      { name: '' },
      { isActive: 'si' },
      { name: 'Chicha', extra: 1 },
    ])
      await expect(service.updateProduct(chicha.id, input)).rejects.toBeInstanceOf(ZodError);
    expect(await productRow(chicha.id)).toEqual(before);
  });
  it('AC-10: un productId inexistente se rechaza con PRODUCT_NOT_FOUND', async () => {
    await expect(service.updateProduct(999999, { priceCents: 700 })).rejects.toMatchObject(
      PRODUCT_NOT_FOUND,
    );
  });
  it('AC-10: renombrar a un nombre que ya existe responde PRODUCT_NAME_TAKEN y la fila no cambia', async () => {
    const chicha = await service.createProduct({
      name: 'Chicha Morada',
      category: 'drink',
      priceCents: 500,
    });
    await service.createProduct({ name: 'Pollo entero', category: 'chicken', priceCents: 6500 });
    const before = await productRow(chicha.id);
    await expect(service.updateProduct(chicha.id, { name: 'pollo entero' })).rejects.toMatchObject(
      PRODUCT_NAME_TAKEN,
    );
    expect(await productRow(chicha.id)).toEqual(before);
  });
  it('AC-10: desactivar es idempotente, el inactivo sigue en la lista, se edita y se reactiva', async () => {
    const chicha = await service.createProduct({
      name: 'Chicha Morada',
      category: 'drink',
      priceCents: 500,
    });
    const deactivated = await service.updateProduct(chicha.id, { isActive: false });
    expect(deactivated.isActive).toBe(false);
    // Desactivar dos veces es idempotente.
    const again = await service.updateProduct(chicha.id, { isActive: false });
    expect(again.isActive).toBe(false);
    expect(await productRow(chicha.id)).toEqual([expect.objectContaining({ is_active: false })]);
    // Sigue apareciendo en la carta completa y se puede seguir editando.
    expect(await service.listProducts()).toEqual([
      expect.objectContaining({ id: chicha.id, isActive: false }),
    ]);
    const edited = await service.updateProduct(chicha.id, { priceCents: 600 });
    expect(edited).toMatchObject({ priceCents: 600, isActive: false });
    const reactivated = await service.updateProduct(chicha.id, { isActive: true });
    expect(reactivated.isActive).toBe(true);
    expect(await productRow(chicha.id)).toEqual([expect.objectContaining({ is_active: true })]);
  });
  it('AC-10: el servicio no expone borrado: sus claves son exactamente listar, crear y editar', () => {
    expect(Object.keys(service).sort()).toEqual(['createProduct', 'listProducts', 'updateProduct']);
  });
});
