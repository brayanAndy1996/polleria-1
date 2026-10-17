import { createServer, request as httpRequest } from 'node:http';
import { QueryTypes, Sequelize } from 'sequelize';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineModels } from '../src/models/index.ts';
import type { Models } from '../src/models/index.ts';
import { migrateUp } from '../src/db/migrator.ts';
import { createInventoryService } from '../src/services/inventory/inventory.service.ts';
import { createComboItemService } from '../src/services/combo-items/combo-item.service.ts';
import { createKitchenTicketPrintService } from '../src/services/kitchen-ticket-prints/kitchen-ticket-print.service.ts';
import { createOrderItemService } from '../src/services/order-items/order-item.service.ts';
import { createOrderService } from '../src/services/orders/order.service.ts';
import { createPaymentService } from '../src/services/payments/payment.service.ts';
import { createProductPortionService } from '../src/services/products/product-portion.service.ts';
import { createProductService } from '../src/services/products/product.service.ts';
import { createPrinterService } from '../src/services/printer/printer.service.ts';
import { createFakeDriver } from './helpers/printer-fixtures.ts';
import { loginWithCookie, setupAuth } from './helpers/auth.ts';
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
let payments: ReturnType<typeof createPaymentService>;
let waiterId: number;
let adminId: number;
let cashierId: number;
let chickenId: number;
let drinkId: number;
let comboId: number;
let orderId: number;
let fixtureSequence = 0;

async function rows<T extends object>(sql: string, bind?: unknown[]): Promise<T[]> {
  return sequelize.query<T>(sql, { type: QueryTypes.SELECT, bind });
}

async function count(
  table:
    | 'order_items'
    | 'kitchen_tickets'
    | 'inventory_movements'
    | 'idempotency_keys'
    | 'kitchen_ticket_prints'
    | 'kitchen_ticket_print_attempts',
  where = '',
) {
  const result = await rows<{ count: number }>(
    `SELECT count(*)::int AS count FROM ${table} ${where}`,
  );
  return result[0]!.count;
}

async function createOrder() {
  fixtureSequence += 1;
  const table = await models.Table.create({
    name: `Inventario ${fixtureSequence}`,
    isActive: true,
  });
  const order = await orders.openOrder(table.id, { userId: waiterId });
  return order.id;
}

async function openChickenAndDrink(chickenQuantity = 4, drinkQuantity = 10) {
  await inventory.setChickenControl({ enabled: true, reason: 'Inicio' }, 'open-chicken', {
    userId: adminId,
  });
  await inventory.addChickenBatch({ chickens: chickenQuantity, reason: 'Tanda' }, 'batch-chicken', {
    userId: adminId,
  });
  await inventory.setDrinkControl(drinkId, { enabled: true, reason: 'Inicio' }, 'open-drink', {
    userId: adminId,
  });
  await inventory.addDrinkReceipt(
    drinkId,
    { quantity: drinkQuantity, reason: 'Compra' },
    'receipt-drink',
    {
      userId: adminId,
    },
  );
}

beforeAll(async () => {
  sequelize = await connectTestDatabase();
});
afterAll(async () => {
  await closeTestDatabase(sequelize);
});
afterEach(() => {
  vi.restoreAllMocks();
});
beforeEach(async () => {
  await migrateUp(sequelize);
  await clearOrderTables(sequelize);
  await clearMenuTables(sequelize);
  await clearAuthTables(sequelize);
  models = defineModels(sequelize);
  const user = await models.User.create({
    username: 'inventory-order-waiter',
    displayName: 'Mozo Inventario',
    pinHash: 'x'.repeat(60),
    roles: ['waiter'],
  });
  waiterId = user.id;
  const admin = await models.User.create({
    username: 'inventory-order-admin',
    displayName: 'Admin Inventario',
    pinHash: 'x'.repeat(60),
    roles: ['admin'],
  });
  adminId = admin.id;
  const cashier = await models.User.create({
    username: 'inventory-order-cashier',
    displayName: 'Caja Inventario',
    pinHash: 'x'.repeat(60),
    roles: ['cashier'],
  });
  cashierId = cashier.id;
  const products = createProductService({ models });
  const chicken = await products.createProduct({
    name: 'Pollo',
    category: 'chicken',
    priceCents: 4800,
  });
  chickenId = chicken.id;
  await createProductPortionService({ models }).replaceProductPortions(chicken.id, {
    portions: [
      { portion: 'eighth', cut: 'breast', priceCents: 700 },
      { portion: 'quarter', cut: 'breast', priceCents: 1400 },
      { portion: 'quarter', cut: 'leg', priceCents: 1400 },
      { portion: 'half', cut: null, priceCents: 2600 },
      { portion: 'whole', cut: null, priceCents: 4800 },
    ],
  });
  drinkId = (await products.createProduct({ name: 'Gaseosa', category: 'drink', priceCents: 500 }))
    .id;
  comboId = (await products.createProduct({ name: 'Combo', category: 'combo', priceCents: 2000 }))
    .id;
  await createComboItemService({ models }).replaceComboItems(comboId, {
    items: [
      { productId: chickenId, quantity: 2, portion: 'quarter', cut: 'leg' },
      { productId: drinkId, quantity: 2 },
    ],
  });
  orders = createOrderService({ models });
  payments = createPaymentService({ models });
  inventory = createInventoryService({ models });
  const fakePrinter = createFakeDriver();
  const prints = createKitchenTicketPrintService({
    models,
    printerService: createPrinterService({ driver: fakePrinter.driver }),
    wakeDispatcher: vi.fn(),
  });
  items = createOrderItemService({ models, kitchenTicketPrintService: prints });
  orderId = await createOrder();
});

describe('015: consumo de inventario en envío a cocina', () => {
  it.each([
    {
      name: 'octavo de pecho',
      item: { productId: 0, portion: 'eighth' as const, cut: 'breast' as const, quantity: 1 },
      breast: 1,
      leg: 0,
    },
    {
      name: 'cuarto de pecho',
      item: { productId: 0, portion: 'quarter' as const, cut: 'breast' as const, quantity: 1 },
      breast: 2,
      leg: 0,
    },
    {
      name: 'medio configurable 1+3 repetido dos veces',
      item: {
        productId: 0,
        portion: 'half' as const,
        cut: null,
        quantity: 2,
        breastEighths: 1,
        legEighths: 3,
      },
      breast: 2,
      leg: 6,
    },
    {
      name: 'pollo entero repetido dos veces',
      item: { productId: 0, portion: 'whole' as const, cut: null, quantity: 2 },
      breast: 8,
      leg: 8,
    },
  ])(
    'AC-04: $name descuenta la distribución de pecho y pierna una vez',
    async ({ item, breast, leg }) => {
      await openChickenAndDrink(4, 10);
      const before = await inventory.getAvailability({ userId: waiterId });
      await items.sendItems(
        orderId,
        { items: [{ ...item, productId: chickenId }] },
        `chicken-shape-${fixtureSequence}`,
        { userId: waiterId },
      );
      const after = await inventory.getAvailability({ userId: waiterId });
      expect(after.chicken.breastEighths).toBe(before.chicken.breastEighths - breast);
      expect(after.chicken.legEighths).toBe(before.chicken.legEighths - leg);
      expect(
        await rows<{ kind: string; delta: number }>(
          "SELECT kind, delta FROM inventory_movements WHERE type = 'consumption' ORDER BY kind",
        ),
      ).toEqual(
        [
          ...(breast > 0 ? [{ kind: 'breast', delta: -breast }] : []),
          ...(leg > 0 ? [{ kind: 'leg', delta: -leg }] : []),
        ].sort((a, b) => a.kind.localeCompare(b.kind)),
      );
    },
  );

  it('AC-04: medio configurable 1+3 en combo de cantidad 2 multiplica por padre y receta', async () => {
    await createComboItemService({ models }).replaceComboItems(comboId, {
      items: [
        { productId: chickenId, quantity: 1, portion: 'half', cut: null },
        { productId: drinkId, quantity: 1 },
      ],
    });
    await openChickenAndDrink(4, 10);
    const before = await inventory.getAvailability({ userId: waiterId });
    await items.sendItems(
      orderId,
      {
        items: [
          {
            productId: comboId,
            quantity: 2,
            components: [
              {
                productId: chickenId,
                quantity: 1,
                portion: 'half',
                cut: null,
                breastEighths: 1,
                legEighths: 3,
              },
              { productId: drinkId, quantity: 1 },
            ],
          },
        ],
      },
      'combo-half-custom-quantity-2',
      { userId: waiterId },
    );
    const after = await inventory.getAvailability({ userId: waiterId });
    expect(after.chicken.breastEighths).toBe(before.chicken.breastEighths - 2);
    expect(after.chicken.legEighths).toBe(before.chicken.legEighths - 6);
    expect(after.drinks[0]!.quantity).toBe(before.drinks[0]!.quantity - 2);
    expect(
      await rows<{ kind: string; delta: number }>(
        "SELECT kind, delta FROM inventory_movements WHERE type = 'consumption' ORDER BY kind",
      ),
    ).toEqual([
      { kind: 'breast', delta: -2 },
      { kind: 'drink', delta: -2 },
      { kind: 'leg', delta: -6 },
    ]);
  });

  it('AC-12: envío concurrente y recategorización conservan el envío y rechazan la carta con 409', async () => {
    await openChickenAndDrink(1, 3);
    const products = createProductService({ models });
    const [sent, recategorized] = await Promise.allSettled([
      items.sendItems(
        orderId,
        { items: [{ productId: drinkId, quantity: 1 }] },
        'send-vs-recategory-drink',
        { userId: waiterId },
      ),
      products.updateProduct(drinkId, { category: 'dessert' }),
    ]);
    expect(sent.status).toBe('fulfilled');
    expect(recategorized).toMatchObject({
      status: 'rejected',
      reason: { code: 'PRODUCT_HAS_INVENTORY', httpStatus: 409 },
    });
    expect(await count('inventory_movements', "WHERE type = 'consumption'")).toBe(1);
    expect(await models.Product.findByPk(drinkId)).toMatchObject({ category: 'drink' });
  });

  it('AC-08: si falla guardar la respuesta de replay, revierte el envío entero y deja reintentar la clave', async () => {
    await openChickenAndDrink(2, 5);
    const before = await inventory.getAvailability({ userId: waiterId });
    const query = sequelize.query.bind(sequelize);
    vi.spyOn(sequelize, 'query').mockImplementation(((sql: unknown, options?: unknown) => {
      if (typeof sql === 'string' && sql.startsWith('UPDATE idempotency_keys SET response_status'))
        return Promise.reject(new Error('fallo forzado al guardar respuesta'));
      return query(sql as Parameters<typeof sequelize.query>[0], options as never);
    }) as typeof sequelize.query);
    await expect(
      items.sendItems(
        orderId,
        { items: [{ productId: drinkId, quantity: 2 }] },
        'retry-after-replay-store-failure',
        { userId: waiterId },
      ),
    ).rejects.toThrow('fallo forzado al guardar respuesta');
    const afterFailure = await inventory.getAvailability({ userId: waiterId });
    expect(afterFailure.chicken).toEqual(before.chicken);
    expect(afterFailure.drinks).toEqual(before.drinks);
    expect(await count('inventory_movements', "WHERE type = 'consumption'")).toBe(0);
    expect(await count('order_items', `WHERE order_id = ${orderId}`)).toBe(0);
    expect(await count('kitchen_tickets', `WHERE order_id = ${orderId}`)).toBe(0);
    expect(await count('kitchen_ticket_prints')).toBe(0);
    expect(await count('kitchen_ticket_print_attempts')).toBe(0);
    expect(
      await count(
        'idempotency_keys',
        "WHERE scope = 'order-items' AND key = 'retry-after-replay-store-failure'",
      ),
    ).toBe(0);

    vi.restoreAllMocks();
    await items.sendItems(
      orderId,
      { items: [{ productId: drinkId, quantity: 2 }] },
      'retry-after-replay-store-failure',
      { userId: waiterId },
    );
    expect(await inventory.getAvailability({ userId: waiterId })).toMatchObject({
      drinks: [{ productId: drinkId, quantity: 3 }],
    });
    expect(await count('inventory_movements', "WHERE type = 'consumption'")).toBe(1);
  });

  it('AC-04: pollo directo con cantidad ya resuelta descuenta octavos una sola vez', async () => {
    await openChickenAndDrink(4, 10);
    const before = await inventory.getAvailability({ userId: waiterId });
    await items.sendItems(
      orderId,
      { items: [{ productId: chickenId, portion: 'quarter', cut: 'leg', quantity: 2 }] },
      'direct-chicken-quantity-2',
      { userId: waiterId },
    );
    const after = await inventory.getAvailability({ userId: waiterId });
    expect(before.chicken).toMatchObject({ breastEighths: 16, legEighths: 16 });
    expect(after.chicken).toMatchObject({ breastEighths: 16, legEighths: 12 });
    expect(await count('inventory_movements', "WHERE type = 'consumption'")).toBe(1);
    expect(
      await rows<{ delta: number; kind: string }>(
        "SELECT delta, kind FROM inventory_movements WHERE type = 'consumption'",
      ),
    ).toEqual([{ delta: -4, kind: 'leg' }]);
  });

  it('AC-04: combos repetidos acumulan pollo y bebida compartidos sin sumar el padre dos veces', async () => {
    await openChickenAndDrink(4, 10);
    const before = await inventory.getAvailability({ userId: waiterId });
    await items.sendItems(
      orderId,
      {
        items: [
          { productId: comboId, quantity: 2 },
          { productId: drinkId, quantity: 1 },
        ],
      },
      'repeated-combo-and-direct-drink',
      { userId: waiterId },
    );
    const after = await inventory.getAvailability({ userId: waiterId });
    expect(before.chicken.legEighths - after.chicken.legEighths).toBe(8);
    expect(before.chicken.breastEighths - after.chicken.breastEighths).toBe(0);
    expect(before.drinks[0]!.quantity - after.drinks[0]!.quantity).toBe(5);
    expect(
      await rows<{ kind: string; product_id: number | null; delta: number }>(
        "SELECT kind, product_id, delta FROM inventory_movements WHERE type = 'consumption' ORDER BY kind, product_id",
      ),
    ).toEqual([
      { kind: 'drink', product_id: drinkId, delta: -5 },
      { kind: 'leg', product_id: null, delta: -8 },
    ]);
  });

  it('AC-05: un recurso escaso revierte ítems, comanda, movimientos e idempotencia del envío mixto', async () => {
    await inventory.setChickenControl(
      { enabled: true, reason: 'Inicio' },
      'short-chicken-control',
      {
        userId: adminId,
      },
    );
    await inventory.addChickenBatch({ chickens: 1, reason: 'Tanda' }, 'short-chicken-batch', {
      userId: adminId,
    });
    await inventory.setDrinkControl(
      drinkId,
      { enabled: true, reason: 'Inicio' },
      'short-drink-control',
      {
        userId: adminId,
      },
    );
    await inventory.addDrinkReceipt(
      drinkId,
      { quantity: 1, reason: 'Compra' },
      'short-drink-receipt',
      {
        userId: adminId,
      },
    );
    const beforeMovements = await count('inventory_movements');
    await expect(
      items.sendItems(
        orderId,
        {
          items: [
            { productId: chickenId, portion: 'quarter', cut: 'leg' },
            { productId: drinkId, quantity: 2 },
          ],
        },
        'mixed-insufficient-inventory',
        { userId: waiterId },
      ),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK', httpStatus: 409 });
    expect(await count('order_items', `WHERE order_id = ${orderId}`)).toBe(0);
    expect(await count('kitchen_tickets', `WHERE order_id = ${orderId}`)).toBe(0);
    expect(await count('inventory_movements')).toBe(beforeMovements);
    expect(
      await count(
        'idempotency_keys',
        "WHERE scope = 'order-items' AND key = 'mixed-insufficient-inventory'",
      ),
    ).toBe(0);
  });

  it('AC-08: un fallo al guardar el ítem revierte consumo y permite reintentar la misma clave', async () => {
    await openChickenAndDrink(2, 5);
    const before = await inventory.getAvailability({ userId: waiterId });
    vi.spyOn(models.OrderItem, 'create').mockRejectedValueOnce(new Error('fallo forzado de ítem'));
    await expect(
      items.sendItems(
        orderId,
        { items: [{ productId: drinkId, quantity: 2 }] },
        'retry-after-item-failure',
        { userId: waiterId },
      ),
    ).rejects.toThrow('fallo forzado de ítem');
    const afterFailure = await inventory.getAvailability({ userId: waiterId });
    expect(afterFailure.chicken).toEqual(before.chicken);
    expect(afterFailure.drinks).toEqual(before.drinks);
    expect(await count('inventory_movements', "WHERE type = 'consumption'")).toBe(0);
    expect(await count('kitchen_tickets', `WHERE order_id = ${orderId}`)).toBe(0);
    expect(await count('kitchen_ticket_prints')).toBe(0);
    expect(await count('kitchen_ticket_print_attempts')).toBe(0);
    vi.restoreAllMocks();
    await expect(
      items.sendItems(
        orderId,
        { items: [{ productId: drinkId, quantity: 2 }] },
        'retry-after-item-failure',
        { userId: waiterId },
      ),
    ).resolves.toBeDefined();
    expect(await inventory.getAvailability({ userId: waiterId })).toMatchObject({
      drinks: [{ productId: drinkId, quantity: 3 }],
    });
    expect(await count('inventory_movements', "WHERE type = 'consumption'")).toBe(1);
  });

  it('AC-08: un fallo al guardar la impresión durable revierte el envío y libera la misma clave', async () => {
    await openChickenAndDrink(2, 5);
    const before = await inventory.getAvailability({ userId: waiterId });
    vi.spyOn(models.KitchenTicketPrint, 'create').mockRejectedValueOnce(
      new Error('fallo forzado de impresión durable'),
    );
    await expect(
      items.sendItems(
        orderId,
        { items: [{ productId: drinkId, quantity: 2 }] },
        'retry-after-print-failure',
        { userId: waiterId },
      ),
    ).rejects.toThrow('fallo forzado de impresión durable');
    const afterFailure = await inventory.getAvailability({ userId: waiterId });
    expect(afterFailure.chicken).toEqual(before.chicken);
    expect(afterFailure.drinks).toEqual(before.drinks);
    expect(await count('inventory_movements', "WHERE type = 'consumption'")).toBe(0);
    expect(await count('order_items', `WHERE order_id = ${orderId}`)).toBe(0);
    expect(await count('kitchen_tickets', `WHERE order_id = ${orderId}`)).toBe(0);
    expect(await count('kitchen_ticket_prints')).toBe(0);
    expect(await count('kitchen_ticket_print_attempts')).toBe(0);
    expect(
      await count(
        'idempotency_keys',
        "WHERE scope = 'order-items' AND key = 'retry-after-print-failure'",
      ),
    ).toBe(0);

    vi.restoreAllMocks();
    await items.sendItems(
      orderId,
      { items: [{ productId: drinkId, quantity: 2 }] },
      'retry-after-print-failure',
      { userId: waiterId },
    );
    expect(await count('inventory_movements', "WHERE type = 'consumption'")).toBe(1);
    expect(await count('kitchen_ticket_prints')).toBe(1);
    expect(await count('kitchen_ticket_print_attempts')).toBe(1);
  });

  it('AC-08: fallo inyectado en la actualización del saldo revierte movimiento, pedido y replay', async () => {
    await openChickenAndDrink(2, 5);
    const before = await inventory.getAvailability({ userId: waiterId });
    models.InventoryDrink.addHook('beforeUpdate', 'inventoryT03BalanceFailure', () => {
      throw new Error('fallo forzado de saldo');
    });
    try {
      await expect(
        items.sendItems(
          orderId,
          { items: [{ productId: drinkId, quantity: 2 }] },
          'retry-after-balance-failure',
          { userId: waiterId },
        ),
      ).rejects.toThrow('fallo forzado de saldo');
    } finally {
      models.InventoryDrink.removeHook('beforeUpdate', 'inventoryT03BalanceFailure');
    }
    const afterFailure = await inventory.getAvailability({ userId: waiterId });
    expect(afterFailure.drinks).toEqual(before.drinks);
    expect(await count('inventory_movements', "WHERE type = 'consumption'")).toBe(0);
    expect(await count('order_items', `WHERE order_id = ${orderId}`)).toBe(0);
    expect(await count('kitchen_tickets', `WHERE order_id = ${orderId}`)).toBe(0);
    expect(await count('kitchen_ticket_prints')).toBe(0);
    expect(
      await count(
        'idempotency_keys',
        "WHERE scope = 'order-items' AND key = 'retry-after-balance-failure'",
      ),
    ).toBe(0);
    await items.sendItems(
      orderId,
      { items: [{ productId: drinkId, quantity: 2 }] },
      'retry-after-balance-failure',
      { userId: waiterId },
    );
    expect(await inventory.getAvailability({ userId: waiterId })).toMatchObject({
      drinks: [{ productId: drinkId, quantity: 3 }],
    });
    expect(await count('inventory_movements', "WHERE type = 'consumption'")).toBe(1);
  });

  it('AC-08: fallo inyectado al persistir el movimiento revierte saldo e ítems y permite replay', async () => {
    await openChickenAndDrink(2, 5);
    const before = await inventory.getAvailability({ userId: waiterId });
    models.InventoryMovement.addHook('afterCreate', 'inventoryT03MovementFailure', () => {
      throw new Error('fallo forzado de movimiento');
    });
    try {
      await expect(
        items.sendItems(
          orderId,
          { items: [{ productId: drinkId, quantity: 2 }] },
          'retry-after-movement-failure',
          { userId: waiterId },
        ),
      ).rejects.toThrow('fallo forzado de movimiento');
    } finally {
      models.InventoryMovement.removeHook('afterCreate', 'inventoryT03MovementFailure');
    }
    const afterFailure = await inventory.getAvailability({ userId: waiterId });
    expect(afterFailure.drinks).toEqual(before.drinks);
    expect(await count('inventory_movements', "WHERE type = 'consumption'")).toBe(0);
    expect(await count('order_items', `WHERE order_id = ${orderId}`)).toBe(0);
    expect(await count('kitchen_tickets', `WHERE order_id = ${orderId}`)).toBe(0);
    expect(await count('kitchen_ticket_prints')).toBe(0);
    expect(
      await count(
        'idempotency_keys',
        "WHERE scope = 'order-items' AND key = 'retry-after-movement-failure'",
      ),
    ).toBe(0);
    await items.sendItems(
      orderId,
      { items: [{ productId: drinkId, quantity: 2 }] },
      'retry-after-movement-failure',
      { userId: waiterId },
    );
    expect(await inventory.getAvailability({ userId: waiterId })).toMatchObject({
      drinks: [{ productId: drinkId, quantity: 3 }],
    });
    expect(await count('inventory_movements', "WHERE type = 'consumption'")).toBe(1);
  });

  it('AC-07/09: replay tras cambio de fecha/control devuelve respuesta original y conserva saldo permanente', async () => {
    let currentDate = new Date('2026-10-18T04:59:00.000Z');
    inventory = createInventoryService({ models, now: () => new Date(currentDate) });
    await inventory.setDrinkControl(drinkId, { enabled: true, reason: 'Inicio' }, 'date-control', {
      userId: adminId,
    });
    await inventory.addDrinkReceipt(drinkId, { quantity: 2, reason: 'Compra' }, 'date-receipt', {
      userId: adminId,
    });
    const first = await items.sendItems(
      orderId,
      { items: [{ productId: drinkId }] },
      'same-order-retry-next-day',
      { userId: waiterId },
    );
    const beforeReplay = await inventory.getAvailability({ userId: waiterId });
    currentDate = new Date('2026-10-18T05:01:00.000Z');
    await inventory.setDrinkControl(drinkId, { enabled: false, reason: 'Pausa' }, 'date-disable', {
      userId: adminId,
    });
    const replay = await items.sendItems(
      orderId,
      { items: [{ productId: drinkId }] },
      'same-order-retry-next-day',
      { userId: waiterId },
    );
    expect(replay).toEqual(first);
    expect(await count('inventory_movements', "WHERE type = 'consumption'")).toBe(1);
    expect(beforeReplay.drinks[0]!.quantity).toBe(1);
    expect(await inventory.getAvailability({ userId: waiterId })).toMatchObject({
      drinks: [{ enabled: false, quantity: 1 }],
      generatedAt: '2026-10-18T05:01:00.000Z',
    });
  });

  it('AC-07: reintenta tras desconectar el cliente antes de recibir el cuerpo del envío comprometido', async () => {
    await openChickenAndDrink(1, 2);
    const auth = setupAuth(sequelize);
    const apiWaiter = await auth.createUser('inventory.ack-waiter', 'Mozo ACK', ['waiter'], '2468');
    const { cookie } = await loginWithCookie(auth.app, 'inventory.ack-waiter', '2468');
    fixtureSequence += 1;
    const apiTable = await models.Table.create({
      name: `Inventario ACK ${fixtureSequence}`,
      isActive: true,
    });
    const apiOrder = await orders.openOrder(apiTable.id, { userId: apiWaiter.id });
    const server = createServer(auth.app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string')
      throw new Error('No se abrió el servidor de prueba.');
    const body = JSON.stringify({ items: [{ productId: drinkId }] });
    let disconnected: number;
    try {
      disconnected = await new Promise<number>((resolve, reject) => {
        const outgoingRequest = httpRequest(
          {
            hostname: '127.0.0.1',
            port: address.port,
            method: 'POST',
            path: `/api/orders/${apiOrder.id}/items`,
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body),
              'Idempotency-Key': 'ack-client-disconnect-015',
              Cookie: cookie,
            },
          },
          (response) => {
            const status = response.statusCode ?? 0;
            response.destroy();
            resolve(status);
          },
        );
        outgoingRequest.setTimeout(8000, () =>
          outgoingRequest.destroy(new Error('El envío HTTP excedió 8 segundos.')),
        );
        outgoingRequest.on('error', reject);
        outgoingRequest.end(body);
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
    expect(disconnected).toBe(201);
    expect(await count('order_items', `WHERE order_id = ${apiOrder.id}`)).toBe(1);
    expect(await count('inventory_movements', "WHERE type = 'consumption'")).toBe(1);

    const replay = await request(auth.app)
      .post(`/api/orders/${apiOrder.id}/items`)
      .set('Cookie', cookie)
      .set('Idempotency-Key', 'ack-client-disconnect-015')
      .send({ items: [{ productId: drinkId }] });
    expect(replay.status).toBe(201);
    expect(replay.body.ticket.id).toBe(
      (
        await rows<{ id: number }>(`SELECT id FROM kitchen_tickets WHERE order_id = ${apiOrder.id}`)
      )[0]!.id,
    );
    expect(await count('order_items', `WHERE order_id = ${apiOrder.id}`)).toBe(1);
    expect(await count('inventory_movements', "WHERE type = 'consumption'")).toBe(1);
  });

  it('AC-10: solicitar, rechazar y aprobar anulación no reponen el inventario', async () => {
    await openChickenAndDrink(2, 3);
    const sent = await items.sendItems(
      orderId,
      { items: [{ productId: drinkId, quantity: 2 }] },
      'void-policy-send',
      { userId: waiterId },
    );
    const itemId = sent.order.items[0]!.id;
    const afterSend = await inventory.getAvailability({ userId: waiterId });
    await items.requestVoid(orderId, itemId, { reason: 'Revisar' }, 'void-request', {
      userId: waiterId,
    });
    await items.rejectVoid(orderId, itemId, 'void-reject', { userId: waiterId });
    await items.requestVoid(orderId, itemId, { reason: 'Confirmar' }, 'void-request-again', {
      userId: waiterId,
    });
    await items.voidItem(orderId, itemId, { reason: 'Aprobada' }, 'void-approve', {
      userId: adminId,
    });
    const afterVoid = await inventory.getAvailability({ userId: waiterId });
    expect(afterVoid.chicken).toEqual(afterSend.chicken);
    expect(afterVoid.drinks).toEqual(afterSend.drinks);
    expect(await count('inventory_movements', "WHERE type = 'consumption'")).toBe(1);

    const direct = await items.sendItems(
      orderId,
      { items: [{ productId: drinkId }] },
      'direct-void-send',
      { userId: waiterId },
    );
    const beforeDirectVoid = await inventory.getAvailability({ userId: waiterId });
    await items.voidItem(
      orderId,
      direct.order.items.at(-1)!.id,
      { reason: 'Anulación directa' },
      'direct-void',
      {
        userId: adminId,
      },
    );
    const afterDirectVoid = await inventory.getAvailability({ userId: waiterId });
    expect(afterDirectVoid.chicken).toEqual(beforeDirectVoid.chicken);
    expect(afterDirectVoid.drinks).toEqual(beforeDirectVoid.drinks);
    expect(await count('inventory_movements', "WHERE type = 'consumption'")).toBe(2);
  });

  it('AC-09/10: pedidos previos a activar no se reconstruyen; mover, unir y cobrar no consumen otra vez', async () => {
    await items.sendItems(
      orderId,
      { items: [{ productId: drinkId }] },
      'historical-send-before-enable',
      { userId: waiterId },
    );
    expect(await count('inventory_movements', "WHERE type = 'consumption'")).toBe(0);
    await inventory.setDrinkControl(
      drinkId,
      { enabled: true, reason: 'Activación explícita' },
      'enable-after-historical-send',
      { userId: adminId },
    );
    await inventory.addDrinkReceipt(
      drinkId,
      { quantity: 5, reason: 'Existencia contada' },
      'stock-after-historical-send',
      { userId: adminId },
    );
    expect(await inventory.getInventory({ userId: adminId })).toMatchObject({
      drinks: [{ productId: drinkId, quantity: 5 }],
    });

    const destination = await models.Table.create({ name: 'Inventario destino', isActive: true });
    await orders.moveOrder(orderId, destination.id, { userId: waiterId });
    const source = await models.Table.create({ name: 'Inventario origen', isActive: true });
    const sourceOrder = await orders.openOrder(source.id, { userId: waiterId });
    await items.sendItems(
      sourceOrder.id,
      { items: [{ productId: drinkId }] },
      'send-before-merge',
      { userId: waiterId },
    );
    const movementCount = await count('inventory_movements', "WHERE type = 'consumption'");
    await orders.joinTable(source.id, destination.id, { userId: waiterId });
    await orders.leaveTable(source.id, { userId: waiterId });
    expect(await count('inventory_movements', "WHERE type = 'consumption'")).toBe(movementCount);
    const bill = await payments.getBill(orderId, { userId: cashierId });
    await payments.createPayment(
      orderId,
      {
        method: 'cash',
        receivedCents: bill.totalCents,
        billToken: bill.billToken,
        confirmedReceived: true,
      },
      'payment-after-merge-inventory',
      { userId: cashierId },
    );
    expect(await count('inventory_movements', "WHERE type = 'consumption'")).toBe(movementCount);
    expect(await inventory.getInventory({ userId: adminId })).toMatchObject({
      drinks: [{ productId: drinkId, quantity: 4 }],
    });
  });

  it('AC-05/12: pollo sin consumo definido pasa apagado y se bloquea al activar control', async () => {
    const undefinedChicken = await createProductService({ models }).createProduct({
      name: 'Pollo sin presentación',
      category: 'chicken',
      priceCents: 3000,
    });
    await items.sendItems(
      orderId,
      { items: [{ productId: undefinedChicken.id }] },
      'undefined-chicken-control-off',
      { userId: waiterId },
    );
    expect(await count('inventory_movements', "WHERE type = 'consumption'")).toBe(0);
    await inventory.setChickenControl(
      { enabled: true, reason: 'Activar control' },
      'undefined-chicken-enable',
      { userId: adminId },
    );
    const beforeItems = await count('order_items', `WHERE order_id = ${orderId}`);
    const beforeTickets = await count('kitchen_tickets', `WHERE order_id = ${orderId}`);
    await expect(
      items.sendItems(
        orderId,
        { items: [{ productId: undefinedChicken.id }] },
        'undefined-chicken-control-on',
        { userId: waiterId },
      ),
    ).rejects.toMatchObject({ code: 'STOCK_CONSUMPTION_UNDEFINED', httpStatus: 409 });
    expect(await count('order_items', `WHERE order_id = ${orderId}`)).toBe(beforeItems);
    expect(await count('kitchen_tickets', `WHERE order_id = ${orderId}`)).toBe(beforeTickets);
    expect(await count('inventory_movements', "WHERE type = 'consumption'")).toBe(0);
  });

  it('AC-11: el servicio rechaza envío fresco y replay si se revoca el rol o se desactiva la sesión', async () => {
    await openChickenAndDrink(1, 3);
    const first = await items.sendItems(
      orderId,
      { items: [{ productId: drinkId }] },
      'current-role-replay',
      { userId: waiterId },
    );
    const movementCount = await count('inventory_movements', "WHERE type = 'consumption'");
    await models.User.update({ roles: ['cashier'] }, { where: { id: waiterId } });
    await expect(
      items.sendItems(orderId, { items: [{ productId: drinkId }] }, 'current-role-replay', {
        userId: waiterId,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', httpStatus: 403 });
    expect(await count('inventory_movements', "WHERE type = 'consumption'")).toBe(movementCount);

    await models.User.update({ roles: ['waiter'], isActive: false }, { where: { id: waiterId } });
    await expect(
      items.sendItems(
        orderId,
        { items: [{ productId: drinkId, quantity: 2 }] },
        'fresh-send-inactive-waiter',
        { userId: waiterId },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', httpStatus: 403 });
    expect(await count('inventory_movements', "WHERE type = 'consumption'")).toBe(movementCount);
    expect(first.order.items).toHaveLength(1);
  });
});
