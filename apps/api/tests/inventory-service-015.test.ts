import { QueryTypes, Sequelize } from 'sequelize';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { defineModels } from '../src/models/index.ts';
import type { Models } from '../src/models/index.ts';
import { migrateUp } from '../src/db/migrator.ts';
import { createInventoryService } from '../src/services/inventory/inventory.service.ts';
import { createProductService } from '../src/services/products/product.service.ts';
import {
  clearAuthTables,
  clearMenuTables,
  clearOrderTables,
  closeTestDatabase,
  connectTestDatabase,
} from './helpers/test-database.ts';

const NOW = new Date('2026-10-17T15:00:00.000Z');
let sequelize: Sequelize;
let models: Models;
let service: ReturnType<typeof createInventoryService>;
let admin: { userId: number };
let secondAdmin: { userId: number };
let waiter: { userId: number };
let drinkId: number;

async function rows<T extends object>(sql: string, bind?: unknown[]): Promise<T[]> {
  return sequelize.query<T>(sql, { type: QueryTypes.SELECT, bind });
}

async function insertUser(username: string, roles: string[], displayName: string) {
  const result = await rows<{ id: number }>(
    'INSERT INTO users (username, display_name, pin_hash, roles, created_at, updated_at) ' +
      'VALUES ($1,$2,$3,$4,now(),now()) RETURNING id',
    [username, displayName, 'x'.repeat(60), `{${roles.join(',')}}`],
  );
  return { userId: result[0]!.id };
}

async function createDrink(name = 'Inca Kola') {
  const created = await createProductService({ models }).createProduct({
    name,
    category: 'drink',
    priceCents: 400,
  });
  return created.id;
}

async function count(table: 'inventory_movements' | 'inventory_commands' | 'inventory_drinks') {
  const result = await rows<{ count: number }>(`SELECT count(*)::int AS count FROM ${table}`);
  return result[0]!.count;
}

beforeAll(async () => {
  sequelize = await connectTestDatabase();
});
afterAll(async () => {
  await closeTestDatabase(sequelize);
});
afterEach(async () => {
  models.InventoryMovement.removeHook('afterCreate', 'inventoryTestMovementFailure');
  models.InventoryCommand.removeHook('beforeUpdate', 'inventoryTestCommandFailure');
});
beforeEach(async () => {
  await migrateUp(sequelize);
  await clearOrderTables(sequelize);
  await clearMenuTables(sequelize);
  await clearAuthTables(sequelize);
  models = defineModels(sequelize);
  admin = await insertUser('inventory.admin', ['admin'], 'Ana original');
  secondAdmin = await insertUser('inventory.admin2', ['admin'], 'Admin dos');
  waiter = await insertUser('inventory.waiter', ['waiter'], 'Mozo');
  drinkId = await createDrink();
  service = createInventoryService({ models, now: () => new Date(NOW) });
});

describe('015: servicio administrativo de inventario sobre polleria_test', () => {
  it('AC-11/12: aplica roles actuales y las lecturas no crean filas de bebidas', async () => {
    expect(await service.getInventory(admin)).toMatchObject({
      chicken: { enabled: false, breastEighths: 0, legEighths: 0 },
      drinks: [{ productId: drinkId, productName: 'Inca Kola', enabled: false, quantity: 0 }],
    });
    expect(await service.getAvailability(waiter)).toMatchObject({
      drinks: [{ productId: drinkId, enabled: false, quantity: 0 }],
    });
    expect(await count('inventory_drinks')).toBe(0);
    await expect(service.getInventory(waiter)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(service.getInventory({ userId: 2_147_483_647 })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await models.User.update({ isActive: false }, { where: { id: admin.userId } });
    await expect(service.getInventory(admin)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('AC-03/07/09/12: receipt replays before disabled checks and across admins with original response', async () => {
    await service.setDrinkControl(
      drinkId,
      { enabled: true, reason: 'Inicio' },
      'drink-control-001',
      admin,
    );
    const input = { quantity: 3, reason: 'Compra' };
    const original = await service.addDrinkReceipt(drinkId, input, 'drink-receipt-001', admin);
    expect(original.movements).toHaveLength(1);
    expect(original.movements[0]).toMatchObject({
      kind: 'drink',
      productId: drinkId,
      productName: 'Inca Kola',
      type: 'receipt',
      delta: 3,
      quantityAfter: 3,
      actor: { id: admin.userId, displayName: 'Ana original' },
    });

    const replayAcrossAdmin = await service.addDrinkReceipt(
      drinkId,
      input,
      'drink-receipt-001',
      secondAdmin,
    );
    expect(replayAcrossAdmin).toEqual(original);
    await expect(
      service.addChickenBatch({ chickens: 1, reason: 'Tanda' }, 'drink-receipt-001', admin),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT', httpStatus: 409 });
    await service.setDrinkControl(
      drinkId,
      { enabled: false, reason: 'Pausa' },
      'drink-control-002',
      admin,
    );
    await expect(
      service.addDrinkReceipt(drinkId, input, 'drink-receipt-001', admin),
    ).resolves.toEqual(original);
    await expect(
      service.addDrinkReceipt(
        drinkId,
        { quantity: 4, reason: 'Compra' },
        'drink-receipt-001',
        admin,
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT', httpStatus: 409 });
    expect(await count('inventory_movements')).toBe(3);
    expect(await count('inventory_commands')).toBe(3);
    const committedStatuses = await rows<{ response_status: number }>(
      'SELECT response_status FROM inventory_commands ORDER BY key',
    );
    expect(committedStatuses.map(({ response_status }) => response_status)).toEqual([
      200, 200, 201,
    ]);
    expect((await service.getInventory(admin)).drinks[0]).toMatchObject({
      enabled: false,
      quantity: 3,
    });
  });

  it('AC-02/03: batches, receipts and adjustments require enabled controls and never allow negative balances', async () => {
    await expect(
      service.addDrinkReceipt(
        drinkId,
        { quantity: 1, reason: 'Compra' },
        'disabled-receipt',
        admin,
      ),
    ).rejects.toMatchObject({ code: 'INVENTORY_DISABLED', httpStatus: 409 });
    await expect(
      service.addChickenBatch({ chickens: 1, reason: 'Tanda' }, 'disabled-batch', admin),
    ).rejects.toMatchObject({ code: 'INVENTORY_DISABLED', httpStatus: 409 });

    await service.setChickenControl(
      { enabled: true, reason: 'Apertura' },
      'chicken-control-001',
      admin,
    );
    const batch = await service.addChickenBatch(
      { chickens: 10, reason: 'Tanda inicial' },
      'chicken-batch-001',
      admin,
    );
    expect(batch.inventory.chicken).toMatchObject({ breastEighths: 40, legEighths: 40 });
    expect(
      batch.movements.map(({ kind, delta, quantityAfter }) => ({ kind, delta, quantityAfter })),
    ).toEqual([
      { kind: 'breast', delta: 40, quantityAfter: 40 },
      { kind: 'leg', delta: 40, quantityAfter: 40 },
    ]);
    await expect(
      service.adjust(
        { kind: 'breast', productId: null, delta: -41, reason: 'Conteo' },
        'negative-adjust',
        admin,
      ),
    ).rejects.toMatchObject({ code: 'INVENTORY_QUANTITY_OUT_OF_RANGE', httpStatus: 409 });

    await service.setDrinkControl(
      drinkId,
      { enabled: true, reason: 'Activar' },
      'drink-control-001',
      admin,
    );
    const receipt = await service.addDrinkReceipt(
      drinkId,
      { quantity: 8, reason: 'Compra' },
      'drink-receipt-001',
      admin,
    );
    expect(receipt.inventory.drinks[0]).toMatchObject({ quantity: 8, enabled: true });
    const adjusted = await service.adjust(
      { kind: 'drink', productId: drinkId, delta: -2, reason: 'Merma' },
      'drink-adjust-001',
      admin,
    );
    expect(adjusted.inventory.drinks[0]?.quantity).toBe(6);
  });

  it('AC-03/09/12: disabling and re-enabling preserves balances across dates', async () => {
    await service.setChickenControl(
      { enabled: true, reason: 'Apertura' },
      'chicken-control-001',
      admin,
    );
    await service.addChickenBatch({ chickens: 2, reason: 'Tanda' }, 'chicken-batch-001', admin);
    await service.setDrinkControl(
      drinkId,
      { enabled: true, reason: 'Activar' },
      'drink-control-001',
      admin,
    );
    await service.addDrinkReceipt(
      drinkId,
      { quantity: 9, reason: 'Compra' },
      'drink-receipt-001',
      admin,
    );

    service = createInventoryService({ models, now: () => new Date('2026-10-18T08:00:00.000Z') });
    await service.setChickenControl(
      { enabled: false, reason: 'Cierre manual' },
      'chicken-control-002',
      admin,
    );
    await service.setDrinkControl(
      drinkId,
      { enabled: false, reason: 'Pausa' },
      'drink-control-002',
      admin,
    );
    const disabled = await service.getInventory(admin);
    expect(disabled.chicken).toEqual({ enabled: false, breastEighths: 8, legEighths: 8 });
    expect(disabled.drinks[0]).toMatchObject({ enabled: false, quantity: 9 });

    await service.setChickenControl(
      { enabled: true, reason: 'Reactivar' },
      'chicken-control-003',
      admin,
    );
    await service.setDrinkControl(
      drinkId,
      { enabled: true, reason: 'Reactivar' },
      'drink-control-003',
      admin,
    );
    const reenabled = await service.getInventory(admin);
    expect(reenabled.chicken).toEqual({ enabled: true, breastEighths: 8, legEighths: 8 });
    expect(reenabled.drinks[0]).toMatchObject({ enabled: true, quantity: 9 });
  });

  it('AC-03/11: movement history preserves the product name copied at movement time', async () => {
    await service.setDrinkControl(
      drinkId,
      { enabled: true, reason: 'Activar' },
      'drink-control-001',
      admin,
    );
    await service.addDrinkReceipt(
      drinkId,
      { quantity: 2, reason: 'Compra' },
      'drink-receipt-001',
      admin,
    );
    await models.Product.update({ name: 'Nombre posterior' }, { where: { id: drinkId } });
    await models.User.update({ displayName: 'Nombre posterior' }, { where: { id: admin.userId } });

    const history = await service.listMovements(undefined, admin);
    expect(history.movements).toHaveLength(2);
    expect(history.movements[1]).toMatchObject({
      productId: drinkId,
      productName: 'Inca Kola',
      actor: { id: admin.userId, displayName: 'Ana original' },
    });
    expect((await service.getInventory(admin)).drinks[0]?.productName).toBe('Nombre posterior');
  });

  it('AC-03: history pages 50 records in ascending stable order with lookahead cursor', async () => {
    for (let index = 0; index < 51; index += 1) {
      await service.setDrinkControl(
        drinkId,
        { enabled: index % 2 === 0, reason: `Cambio ${index}` },
        `history-control-${String(index).padStart(3, '0')}`,
        admin,
      );
    }
    const first = await service.listMovements(undefined, admin);
    expect(first.movements).toHaveLength(50);
    expect(first.movements.map(({ id }) => id)).toEqual(
      [...first.movements.map(({ id }) => id)].sort((left, right) => left - right),
    );
    expect(first.nextAfterId).toBe(first.movements[49]?.id);

    const second = await service.listMovements(first.nextAfterId ?? undefined, admin);
    expect(second.movements).toHaveLength(1);
    expect(second.movements[0]!.id).toBeGreaterThan(first.nextAfterId!);
    expect(second.nextAfterId).toBeNull();
  });

  it('AC-02/07/08: movement failure rolls back balances, movement rows and command claim', async () => {
    await service.setChickenControl(
      { enabled: true, reason: 'Apertura' },
      'chicken-control-001',
      admin,
    );
    const baselineMovements = await count('inventory_movements');
    const baselineCommands = await count('inventory_commands');
    models.InventoryMovement.addHook('afterCreate', 'inventoryTestMovementFailure', () => {
      throw new Error('injected movement write failure');
    });
    await expect(
      service.addChickenBatch({ chickens: 2, reason: 'Tanda' }, 'rollback-batch-001', admin),
    ).rejects.toThrow('injected movement write failure');
    await models.InventoryMovement.removeHook('afterCreate', 'inventoryTestMovementFailure');

    expect((await service.getInventory(admin)).chicken).toEqual({
      enabled: true,
      breastEighths: 0,
      legEighths: 0,
    });
    expect(await count('inventory_movements')).toBe(baselineMovements);
    expect(await count('inventory_commands')).toBe(baselineCommands);
  });

  it('AC-07/08: command response write failure rolls back the balance and movement', async () => {
    await service.setChickenControl(
      { enabled: true, reason: 'Apertura' },
      'chicken-control-001',
      admin,
    );
    const baselineMovements = await count('inventory_movements');
    const baselineCommands = await count('inventory_commands');
    models.InventoryCommand.addHook('beforeUpdate', 'inventoryTestCommandFailure', () => {
      throw new Error('injected command response failure');
    });
    await expect(
      service.addChickenBatch({ chickens: 2, reason: 'Tanda' }, 'rollback-response-001', admin),
    ).rejects.toThrow('injected command response failure');
    await models.InventoryCommand.removeHook('beforeUpdate', 'inventoryTestCommandFailure');

    expect((await service.getInventory(admin)).chicken).toEqual({
      enabled: true,
      breastEighths: 0,
      legEighths: 0,
    });
    expect(await count('inventory_movements')).toBe(baselineMovements);
    expect(await count('inventory_commands')).toBe(baselineCommands);
  });
});
