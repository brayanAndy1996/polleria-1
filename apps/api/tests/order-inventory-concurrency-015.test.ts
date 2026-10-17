import { QueryTypes, Sequelize } from 'sequelize';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { defineModels } from '../src/models/index.ts';
import type { Models } from '../src/models/index.ts';
import { migrateUp } from '../src/db/migrator.ts';
import { createInventoryService } from '../src/services/inventory/inventory.service.ts';
import { createOrderItemService } from '../src/services/order-items/order-item.service.ts';
import { createOrderService } from '../src/services/orders/order.service.ts';
import { createProductPortionService } from '../src/services/products/product-portion.service.ts';
import { createProductService } from '../src/services/products/product.service.ts';
import {
  clearAuthTables,
  clearMenuTables,
  clearOrderTables,
  closeTestDatabase,
  connectTestDatabase,
} from './helpers/test-database.ts';

let sequelize: Sequelize;
let models: Models;
let inventory: ReturnType<typeof createInventoryService>;
let items: ReturnType<typeof createOrderItemService>;
let orders: ReturnType<typeof createOrderService>;
let waiterIds: number[];
let adminIds: number[];
let drinkId: number;
let chickenId: number;

async function rows<T extends object>(sql: string, bind?: unknown[]): Promise<T[]> {
  return sequelize.query<T>(sql, { type: QueryTypes.SELECT, bind });
}

async function orderFor(waiterId: number) {
  const table = await models.Table.create({ name: `Carrera ${waiterId}`, isActive: true });
  return (await orders.openOrder(table.id, { userId: waiterId })).id;
}

async function settle<T>(promise: Promise<T>) {
  try {
    return { ok: true as const, value: await promise };
  } catch (error) {
    return { ok: false as const, error };
  }
}

async function within<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} excedió 8 segundos (posible deadlock)`)),
          8000,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

beforeAll(async () => {
  sequelize = await connectTestDatabase();
});
afterAll(async () => {
  await closeTestDatabase(sequelize);
});
beforeEach(async () => {
  await migrateUp(sequelize);
  await clearOrderTables(sequelize);
  await clearMenuTables(sequelize);
  await clearAuthTables(sequelize);
  models = defineModels(sequelize);
  waiterIds = [];
  adminIds = [];
  for (const [index, role] of (['waiter', 'waiter', 'admin', 'admin'] as const).entries()) {
    const user = await models.User.create({
      username: `inventory-race-${role}-${index}`,
      displayName: `${role}-${index}`,
      pinHash: 'x'.repeat(60),
      roles: [role],
    });
    if (role === 'waiter') waiterIds.push(user.id);
    else adminIds.push(user.id);
  }
  const products = createProductService({ models });
  drinkId = (
    await products.createProduct({
      name: 'Bebida de carrera',
      category: 'drink',
      priceCents: 500,
    })
  ).id;
  chickenId = (
    await products.createProduct({
      name: 'Pollo de carrera',
      category: 'chicken',
      priceCents: 4000,
    })
  ).id;
  await createProductPortionService({ models }).replaceProductPortions(chickenId, {
    portions: [{ portion: 'quarter', cut: 'leg', priceCents: 1200 }],
  });
  orders = createOrderService({ models });
  inventory = createInventoryService({ models });
  items = createOrderItemService({ models });
});

describe('015: concurrencia de envíos y comandos administrativos', () => {
  it('AC-06: dos mozos compiten por la última bebida y solo uno envía', async () => {
    const [firstOrder, secondOrder] = await Promise.all([
      orderFor(waiterIds[0]!),
      orderFor(waiterIds[1]!),
    ]);
    await inventory.setDrinkControl(
      drinkId,
      { enabled: true, reason: 'Inicio' },
      'race-stock-control',
      { userId: adminIds[0]! },
    );
    await inventory.addDrinkReceipt(
      drinkId,
      { quantity: 1, reason: 'Última unidad' },
      'race-stock-receipt',
      { userId: adminIds[0]! },
    );

    const results = await within(
      Promise.all([
        settle(
          items.sendItems(firstOrder, { items: [{ productId: drinkId }] }, 'last-drink-waiter-a', {
            userId: waiterIds[0]!,
          }),
        ),
        settle(
          items.sendItems(secondOrder, { items: [{ productId: drinkId }] }, 'last-drink-waiter-b', {
            userId: waiterIds[1]!,
          }),
        ),
      ]),
      'dos mozos y última bebida',
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const loser = results.find((result) => !result.ok);
    expect(loser?.ok === false && loser.error).toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    expect(await inventory.getAvailability({ userId: waiterIds[0]! })).toMatchObject({
      drinks: [{ productId: drinkId, quantity: 0 }],
    });
    expect(
      await rows<{ count: number }>(
        "SELECT count(*)::int AS count FROM inventory_movements WHERE type = 'consumption'",
      ),
    ).toEqual([{ count: 1 }]);
    expect(
      await rows<{ count: number }>(
        "SELECT count(*)::int AS count FROM order_items WHERE product_id = $1 AND status = 'sent'",
        [drinkId],
      ),
    ).toEqual([{ count: 1 }]);
  });

  it('AC-06: dos mozos compiten por los últimos octavos de pierna y solo uno envía', async () => {
    const [firstOrder, secondOrder] = await Promise.all([
      orderFor(waiterIds[0]!),
      orderFor(waiterIds[1]!),
    ]);
    await inventory.setChickenControl({ enabled: true, reason: 'Inicio' }, 'race-chicken-control', {
      userId: adminIds[0]!,
    });
    await inventory.addChickenBatch({ chickens: 1, reason: 'Una tanda' }, 'race-chicken-batch', {
      userId: adminIds[0]!,
    });
    const request = {
      items: [
        { productId: chickenId, portion: 'quarter' as const, cut: 'leg' as const, quantity: 2 },
      ],
    };
    const results = await within(
      Promise.all([
        settle(
          items.sendItems(firstOrder, request, 'last-leg-waiter-a', { userId: waiterIds[0]! }),
        ),
        settle(
          items.sendItems(secondOrder, request, 'last-leg-waiter-b', { userId: waiterIds[1]! }),
        ),
      ]),
      'dos mozos y últimos octavos de pierna',
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const loser = results.find((result) => !result.ok);
    expect(loser?.ok === false && loser.error).toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    expect(await inventory.getAvailability({ userId: waiterIds[0]! })).toMatchObject({
      chicken: { breastEighths: 4, legEighths: 0 },
    });
    expect(
      await rows<{ count: number }>(
        "SELECT count(*)::int AS count FROM inventory_movements WHERE type = 'consumption' AND kind = 'leg'",
      ),
    ).toEqual([{ count: 1 }]);
  });

  it('AC-06: una entrada y un envío concurrentes se serializan sin saldo perdido', async () => {
    const orderId = await orderFor(waiterIds[0]!);
    const admin = { userId: adminIds[0]! };
    await inventory.setDrinkControl(
      drinkId,
      { enabled: true, reason: 'Inicio' },
      'receipt-send-control',
      admin,
    );
    const [receipt, send] = await within(
      Promise.all([
        settle(
          inventory.addDrinkReceipt(
            drinkId,
            { quantity: 1, reason: 'Compra' },
            'receipt-send-entry',
            admin,
          ),
        ),
        settle(
          items.sendItems(orderId, { items: [{ productId: drinkId }] }, 'receipt-send-order', {
            userId: waiterIds[0]!,
          }),
        ),
      ]),
      'entrada concurrente con envío',
    );
    expect(receipt.ok).toBe(true);
    const snapshot = await inventory.getInventory(admin);
    if (send.ok) {
      expect(snapshot.drinks[0]!.quantity).toBe(0);
      expect(
        await rows<{ count: number }>(
          "SELECT count(*)::int AS count FROM inventory_movements WHERE type = 'consumption'",
        ),
      ).toEqual([{ count: 1 }]);
    } else {
      expect((send.error as { code?: string }).code).toBe('INSUFFICIENT_STOCK');
      expect(snapshot.drinks[0]!.quantity).toBe(1);
      expect(
        await rows<{ count: number }>(
          "SELECT count(*)::int AS count FROM inventory_movements WHERE type = 'consumption'",
        ),
      ).toEqual([{ count: 0 }]);
    }
  });

  it('AC-06: ajuste negativo y envío compiten por la misma última unidad sin saldo negativo', async () => {
    const orderId = await orderFor(waiterIds[0]!);
    const admin = { userId: adminIds[0]! };
    await inventory.setDrinkControl(
      drinkId,
      { enabled: true, reason: 'Inicio' },
      'adjust-send-control',
      admin,
    );
    await inventory.addDrinkReceipt(
      drinkId,
      { quantity: 1, reason: 'Una unidad' },
      'adjust-send-receipt',
      admin,
    );
    const [adjustment, send] = await within(
      Promise.all([
        settle(
          inventory.adjust(
            { kind: 'drink', productId: drinkId, delta: -1, reason: 'Merma' },
            'adjust-send-minus',
            admin,
          ),
        ),
        settle(
          items.sendItems(orderId, { items: [{ productId: drinkId }] }, 'adjust-send-order', {
            userId: waiterIds[0]!,
          }),
        ),
      ]),
      'ajuste negativo frente a envío',
    );
    expect(Number(adjustment.ok) + Number(send.ok)).toBe(1);
    const snapshot = await inventory.getInventory(admin);
    expect(snapshot.drinks[0]!.quantity).toBe(0);
    expect(
      await rows<{ minimum: number }>(
        "SELECT min(quantity_after)::int AS minimum FROM inventory_movements WHERE kind = 'drink'",
      ),
    ).toEqual([{ minimum: 0 }]);
    if (!adjustment.ok)
      expect((adjustment.error as { code?: string }).code).toBe('INVENTORY_QUANTITY_OUT_OF_RANGE');
    if (!send.ok) expect((send.error as { code?: string }).code).toBe('INSUFFICIENT_STOCK');
  });

  it('AC-07: clave administrativa concurrente es un solo efecto y claves distintas acumulan', async () => {
    const adminA = { userId: adminIds[0]! };
    const adminB = { userId: adminIds[1]! };
    await inventory.setDrinkControl(
      drinkId,
      { enabled: true, reason: 'Inicio' },
      'admin-race-control',
      adminA,
    );
    const sameKey = await within(
      Promise.all([
        inventory.addDrinkReceipt(
          drinkId,
          { quantity: 2, reason: 'Compra' },
          'same-admin-key',
          adminA,
        ),
        inventory.addDrinkReceipt(
          drinkId,
          { quantity: 2, reason: 'Compra' },
          'same-admin-key',
          adminB,
        ),
      ]),
      'misma clave de inventario',
    );
    expect(sameKey[1]).toEqual(sameKey[0]);
    const differentKeys = await within(
      Promise.all([
        inventory.addDrinkReceipt(
          drinkId,
          { quantity: 3, reason: 'Compra A' },
          'admin-add-a',
          adminA,
        ),
        inventory.addDrinkReceipt(
          drinkId,
          { quantity: 4, reason: 'Compra B' },
          'admin-add-b',
          adminB,
        ),
      ]),
      'claves distintas de inventario',
    );
    expect(
      differentKeys.map((result) => result.inventory.drinks[0]!.quantity).sort((a, b) => a - b),
    ).toEqual([5, 9]);
    expect(await inventory.getInventory(adminA)).toMatchObject({
      drinks: [{ productId: drinkId, quantity: 9 }],
    });
    expect(
      await rows<{ count: number }>(
        "SELECT count(*)::int AS count FROM inventory_movements WHERE type = 'receipt'",
      ),
    ).toEqual([{ count: 3 }]);
  });

  it('AC-06: ajustes negativos rivales no dejan un saldo negativo', async () => {
    const adminA = { userId: adminIds[0]! };
    const adminB = { userId: adminIds[1]! };
    await inventory.setDrinkControl(
      drinkId,
      { enabled: true, reason: 'Inicio' },
      'negative-race-control',
      adminA,
    );
    await inventory.addDrinkReceipt(
      drinkId,
      { quantity: 1, reason: 'Una unidad' },
      'negative-race-receipt',
      adminA,
    );
    const results = await within(
      Promise.all([
        settle(
          inventory.adjust(
            { kind: 'drink', productId: drinkId, delta: -1, reason: 'Merma A' },
            'negative-adjust-a',
            adminA,
          ),
        ),
        settle(
          inventory.adjust(
            { kind: 'drink', productId: drinkId, delta: -1, reason: 'Merma B' },
            'negative-adjust-b',
            adminB,
          ),
        ),
      ]),
      'ajustes negativos rivales',
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const loser = results.find((result) => !result.ok);
    expect(loser?.ok === false && loser.error).toMatchObject({
      code: 'INVENTORY_QUANTITY_OUT_OF_RANGE',
    });
    expect(await inventory.getInventory(adminA)).toMatchObject({
      drinks: [{ productId: drinkId, quantity: 0 }],
    });
    expect(
      await rows<{ minimum: number }>(
        "SELECT min(quantity_after)::int AS minimum FROM inventory_movements WHERE kind = 'drink'",
      ),
    ).toEqual([{ minimum: 0 }]);
  });

  it('AC-06/12: envío y desactivación simultáneos se serializan sin saldo negativo', async () => {
    const orderId = await orderFor(waiterIds[0]!);
    const admin = { userId: adminIds[0]! };
    await inventory.setDrinkControl(
      drinkId,
      { enabled: true, reason: 'Inicio' },
      'toggle-race-control',
      admin,
    );
    await inventory.addDrinkReceipt(
      drinkId,
      { quantity: 1, reason: 'Compra' },
      'toggle-race-receipt',
      admin,
    );
    const [send, toggle] = await within(
      Promise.all([
        settle(
          items.sendItems(orderId, { items: [{ productId: drinkId }] }, 'toggle-race-send', {
            userId: waiterIds[0]!,
          }),
        ),
        settle(
          inventory.setDrinkControl(
            drinkId,
            { enabled: false, reason: 'Pausa' },
            'toggle-race-disable',
            admin,
          ),
        ),
      ]),
      'envío y desactivación de control',
    );
    expect(toggle.ok).toBe(true);
    expect(send.ok).toBe(true);
    const snapshot = await inventory.getInventory(admin);
    expect(snapshot.drinks[0]).toMatchObject({ enabled: false });
    expect([0, 1]).toContain(snapshot.drinks[0]!.quantity);
    const [consumption] = await rows<{ count: number }>(
      "SELECT count(*)::int AS count FROM inventory_movements WHERE type = 'consumption'",
    );
    expect(consumption!.count).toBe(snapshot.drinks[0]!.quantity === 0 ? 1 : 0);
  });

  it('AC-12: activar una bebida compite con recategorizarla sin dejar una referencia inválida', async () => {
    const products = createProductService({ models });
    const admin = { userId: adminIds[0]! };
    const results = await within(
      Promise.all([
        settle(
          inventory.setDrinkControl(
            drinkId,
            { enabled: true, reason: 'Activar' },
            'activate-recategorize-race',
            admin,
          ),
        ),
        settle(products.updateProduct(drinkId, { category: 'sauce' })),
      ]),
      'activar y recategorizar bebida',
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const [product] = await rows<{ category: string }>(
      'SELECT category FROM products WHERE id = $1',
      [drinkId],
    );
    const [drink] = await rows<{ product_id: number; enabled: boolean }>(
      'SELECT product_id, enabled FROM inventory_drinks WHERE product_id = $1',
      [drinkId],
    );
    if (results[0]!.ok) {
      expect(product!.category).toBe('drink');
      expect(drink).toMatchObject({ product_id: drinkId, enabled: true });
    } else {
      expect(product!.category).toBe('sauce');
      expect(drink).toBeUndefined();
    }
  });
});
