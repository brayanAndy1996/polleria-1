// AC-14. Spec 010 — archivo nuevo: va EN ROJO hasta que T-10 cree
// src/services/menu/menu.service.ts con createMenuService({ models }).listMenu().
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Sequelize } from 'sequelize';
import { menuResponseSchema } from '@polleria/shared';
import type { MenuProduct } from '@polleria/shared';
import { migrateUp } from '../src/db/migrator.ts';
import { defineModels } from '../src/models/index.ts';
import type { Models } from '../src/models/index.ts';
import { createComboItemService } from '../src/services/combo-items/combo-item.service.ts';
import { createMenuService } from '../src/services/menu/menu.service.ts';
import { createProductPortionService } from '../src/services/products/product-portion.service.ts';
import { createProductService } from '../src/services/products/product.service.ts';
import {
  assertConnectedToTestDatabase,
  clearMenuTables,
  closeTestDatabase,
  connectTestDatabase,
} from './helpers/test-database.ts';

describe('010: servicio de la carta armada (GET /api/menu) sobre polleria_test', () => {
  let sequelize: Sequelize;
  let models: Models;
  let service: ReturnType<typeof createMenuService>;

  beforeAll(async () => {
    sequelize = await connectTestDatabase();
  });
  beforeEach(async () => {
    // Las pruebas de la carta no necesitan usuarios: migrar y limpiar sin auth.
    await assertConnectedToTestDatabase(sequelize);
    await migrateUp(sequelize);
    await clearMenuTables(sequelize);
    models = defineModels(sequelize);
    service = createMenuService({ models });
  });
  afterAll(async () => {
    await closeTestDatabase(sequelize);
  });

  /** La carta semilla de la spec §4.3 más un producto inactivo y otro dish. */
  async function seedMenu() {
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
        { portion: 'half', priceCents: 2600 },
        { portion: 'whole', priceCents: 4800 },
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
    const aji = await products.createProduct({
      name: 'Aj\u00ED',
      category: 'sauce',
      priceCents: 0,
    });
    const ocopa = await products.createProduct({
      name: 'Ocopa',
      category: 'sauce',
      priceCents: 300,
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
    const apagado = await products.createProduct({
      name: 'Chicha vieja',
      category: 'drink',
      priceCents: 500,
    });
    await products.updateProduct(apagado.id, { isActive: false });
    return { pollo, anticucho, incaKola, aji, ocopa, mostrito, apagado };
  }

  it('AC-14: listMenu devuelve solo los activos en el orden de la carta', async () => {
    const menu = await seedMenu();
    const result = await service.listMenu();
    // La respuesta valida contra el esquema compartido y es { products }.
    expect(Object.keys(result)).toEqual(['products']);
    expect(menuResponseSchema.safeParse(result).success).toBe(true);
    // Orden: categoría (chicken, combo, dish, drink, ...), nombre 'es', luego id.
    // Dentro de chicken el collator pone 'Anticucho de pollo' antes de 'Pollo'.
    expect(result.products.map((product: MenuProduct) => product.name)).toEqual([
      'Anticucho de pollo',
      'Pollo a la brasa',
      'Mostrito',
      'Inca Kola 1L',
      'Aj\u00ED',
      'Ocopa',
    ]);
    // El producto inactivo no aparece (D-010-15: solo ACTIVOS).
    expect(result.products.map((product: MenuProduct) => product.id)).not.toContain(
      menu.apagado.id,
    );
    expect(result.products).toHaveLength(6);
  });

  it('AC-14: el pollo trae sus porciones ofertadas en orden y el combo sus componentes', async () => {
    const menu = await seedMenu();
    const { products } = await service.listMenu();
    const pollo = products.find((product: MenuProduct) => product.id === menu.pollo.id);
    const mostrito = products.find((product: MenuProduct) => product.id === menu.mostrito.id);
    const anticucho = products.find((product: MenuProduct) => product.id === menu.anticucho.id);

    // Porciones en el orden de la carta (quarter-breast, quarter-leg, half, whole).
    expect(pollo).toMatchObject({
      name: 'Pollo a la brasa',
      category: 'chicken',
      priceCents: 4800,
      items: [],
      portions: [
        { portion: 'quarter', cut: 'breast', priceCents: 1500 },
        { portion: 'quarter', cut: 'leg', priceCents: 1400 },
        { portion: 'half', cut: null, priceCents: 2600 },
        { portion: 'whole', cut: null, priceCents: 4800 },
      ],
    });
    // El combo trae sus componentes con el producto embebido COMPLETO (incluido
    // isActive para que la pantalla advierta un componente desactivado).
    expect(mostrito).toMatchObject({
      name: 'Mostrito',
      category: 'combo',
      priceCents: 2200,
      portions: [],
      items: [
        {
          product: {
            id: menu.pollo.id,
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
            id: menu.incaKola.id,
            name: 'Inca Kola 1L',
            category: 'drink',
            priceCents: 800,
            isActive: true,
          },
          quantity: 1,
          portion: null,
          cut: null,
        },
      ],
    });
    // Un chicken sin porciones trae ambas listas vacías.
    expect(anticucho).toMatchObject({
      name: 'Anticucho de pollo',
      portions: [],
      items: [],
    });
    // Las bebidas y cremas también llevan las dos listas vacías.
    const incaKola = products.find((product: MenuProduct) => product.id === menu.incaKola.id);
    const aji = products.find((product: MenuProduct) => product.id === menu.aji.id);
    expect(incaKola).toMatchObject({ portions: [], items: [] });
    expect(aji).toMatchObject({ portions: [], items: [], priceCents: 0 });
  });

  it('AC-14: un componente de combo desactivado sigue embebido con isActive false', async () => {
    const menu = await seedMenu();
    // La carta admite vender el combo con un componente apagado (caso borde §7):
    // el menú lo embebe con isActive para que la pantalla lo advierta.
    await createProductService({ models }).updateProduct(menu.incaKola.id, { isActive: false });
    const { products } = await service.listMenu();
    // Inca Kola ya no aparece como producto suelto (está inactiva)…
    expect(products.map((product: MenuProduct) => product.id)).not.toContain(menu.incaKola.id);
    // …pero el Mostrito sigue listándola como componente con isActive: false.
    const mostrito = products.find((product: MenuProduct) => product.id === menu.mostrito.id);
    expect(mostrito?.items.map((item: MenuProduct['items'][number]) => item.product.id)).toEqual([
      menu.pollo.id,
      menu.incaKola.id,
    ]);
    expect(mostrito?.items[1]?.product).toMatchObject({
      id: menu.incaKola.id,
      name: 'Inca Kola 1L',
      isActive: false,
    });
  });

  it('AC-14: sin productos devuelve la lista vacía', async () => {
    expect(await service.listMenu()).toEqual({ products: [] });
  });
});
