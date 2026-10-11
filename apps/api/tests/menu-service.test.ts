// AC-14. Spec 010 — archivo nuevo: va EN ROJO hasta que T-09 cree
// src/services/menu/menu.service.ts con listMenu.
import type { Sequelize } from 'sequelize';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { defineModels, type Models } from '../src/models/index.ts';
import { createProductService } from '../src/services/products/product.service.ts';
import { createProductPortionService } from '../src/services/products/product-portion.service.ts';
import { createComboItemService } from '../src/services/combo-items/combo-item.service.ts';
import { createMenuService } from '../src/services/menu/menu.service.ts';
import {
  clearMenuTables,
  closeTestDatabase,
  connectTestDatabase,
  migrateAndClearAuthTables,
} from './helpers/test-database.ts';

let sequelize: Sequelize;
let models: Models;
let menuService: ReturnType<typeof createMenuService>;

/** La carta semilla de la spec (más un producto inactivo). */
async function seedCarta() {
  const products = createProductService({ models });
  const portions = createProductPortionService({ models });
  const combos = createComboItemService({ models });
  const pollo = await products.createProduct({
    name: 'Pollo a la brasa',
    category: 'chicken',
    priceCents: 4800,
  });
  await portions.replaceProductPortions(pollo.id, {
    portions: [
      { portion: 'quarter', cut: 'breast', priceCents: 1500 },
      { portion: 'quarter', cut: 'leg', priceCents: 1400 },
      { portion: 'half', cut: null, priceCents: 2600 },
      { portion: 'whole', cut: null, priceCents: 4800 },
    ],
  });
  const anticucho = await products.createProduct({
    name: 'Anticucho de pollo',
    category: 'chicken',
    priceCents: 1200,
  });
  const incaKola = await products.createProduct({
    name: 'Inca Kola 1L',
    category: 'drink',
    priceCents: 800,
  });
  const mostrito = await products.createProduct({
    name: 'Mostrito',
    category: 'combo',
    priceCents: 2200,
  });
  await combos.replaceComboItems(mostrito.id, {
    items: [
      { productId: pollo.id, quantity: 1, portion: 'quarter', cut: 'leg' },
      { productId: incaKola.id, quantity: 1 },
    ],
  });
  const inactivo = await products.createProduct({
    name: 'Chicha morada',
    category: 'drink',
    priceCents: 600,
  });
  await products.updateProduct(inactivo.id, { isActive: false });
  return { pollo, anticucho, incaKola, mostrito, inactivo };
}

beforeAll(async () => {
  sequelize = await connectTestDatabase();
});
afterAll(async () => {
  await closeTestDatabase(sequelize);
});
beforeEach(async () => {
  await migrateAndClearAuthTables(sequelize);
  await clearMenuTables(sequelize);
  models = defineModels(sequelize);
  menuService = createMenuService({ models });
});

describe('010: servicio de la carta sobre polleria_test', () => {
  it('AC-14: listMenu devuelve solo activos ordenados por categoría, nombre e id', async () => {
    const s = await seedCarta();
    const { products } = await menuService.listMenu();
    expect(products.map((p: { id: number }) => p.id)).not.toContain(s.inactivo.id);
    // Orden de categoría: chicken, combo, dish, drink, dessert, sauce, extra;
    // dentro, por nombre (sin distinguir mayúsculas ni tildes) e id.
    expect(products.map((p: { name: string }) => p.name)).toEqual([
      'Anticucho de pollo',
      'Pollo a la brasa',
      'Mostrito',
      'Inca Kola 1L',
    ]);
  });
  it('AC-14: el pollo trae sus presentaciones en el orden de la carta e items vacío', async () => {
    const s = await seedCarta();
    const { products } = await menuService.listMenu();
    const pollo = products.find((p: { id: number }) => p.id === s.pollo.id)!;
    expect(pollo).toMatchObject({
      id: s.pollo.id,
      name: 'Pollo a la brasa',
      category: 'chicken',
      priceCents: 4800,
      items: [],
    });
    expect(pollo.portions).toEqual([
      { portion: 'quarter', cut: 'breast', priceCents: 1500 },
      { portion: 'quarter', cut: 'leg', priceCents: 1400 },
      { portion: 'half', cut: null, priceCents: 2600 },
      { portion: 'whole', cut: null, priceCents: 4800 },
    ]);
  });
  it('AC-14: el combo trae items con el componente embebido y portions vacío', async () => {
    const s = await seedCarta();
    const { products } = await menuService.listMenu();
    const mostrito = products.find((p: { id: number }) => p.id === s.mostrito.id)!;
    expect(mostrito).toMatchObject({
      id: s.mostrito.id,
      name: 'Mostrito',
      category: 'combo',
      priceCents: 2200,
      portions: [],
    });
    expect(mostrito.items).toMatchObject([
      {
        product: {
          id: s.pollo.id,
          name: 'Pollo a la brasa',
          category: 'chicken',
          priceCents: 4800,
          isActive: true,
        },
        quantity: 1,
        portion: 'quarter',
        cut: 'leg',
      },
      {
        product: {
          id: s.incaKola.id,
          name: 'Inca Kola 1L',
          category: 'drink',
          priceCents: 800,
          isActive: true,
        },
        quantity: 1,
        portion: null,
        cut: null,
      },
    ]);
  });
  it('AC-14: un chicken sin porciones trae portions e items vacíos', async () => {
    const s = await seedCarta();
    const { products } = await menuService.listMenu();
    const anticucho = products.find((p: { id: number }) => p.id === s.anticucho.id);
    expect(anticucho).toMatchObject({
      name: 'Anticucho de pollo',
      category: 'chicken',
      priceCents: 1200,
      portions: [],
      items: [],
    });
  });
});
