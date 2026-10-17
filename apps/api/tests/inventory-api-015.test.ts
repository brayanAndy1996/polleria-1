import request from 'supertest';
import type { Test } from 'supertest';
import type { Express } from 'express';
import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  errorResponseSchema,
  inventoryMutationResponseSchema,
  inventoryMovementsResponseSchema,
  inventorySnapshotSchema,
} from '@polleria/shared';
import type { UserRole } from '@polleria/shared';
import { migrateUp } from '../src/db/migrator.ts';
import { createProductService } from '../src/services/products/product.service.ts';
import {
  clearAuthTables,
  clearMenuTables,
  clearOrderTables,
  closeTestDatabase,
  connectTestDatabase,
} from './helpers/test-database.ts';
import { loginWithCookie, setupAuth, UNAUTHENTICATED_BODY } from './helpers/auth.ts';
import { sendRawBody } from './helpers/raw-body.ts';

let sequelize: Sequelize;
let app: Express;
let auth: ReturnType<typeof setupAuth>;
let users: Record<string, { id: number; cookie: string }>;
let drinkId: number;

function noStore(response: { headers: Record<string, unknown> }) {
  expect(response.headers['cache-control']).toBe('no-store');
}

function idempotency(response: Test, key: string) {
  return response.set('Idempotency-Key', key).set('Cookie', users.admin!.cookie);
}

async function createDrink(name = 'Inca Kola') {
  const created = await createProductService({ models: auth.models }).createProduct({
    name,
    category: 'drink',
    priceCents: 400,
  });
  return created.id;
}

async function count(table: 'inventory_movements' | 'inventory_commands' | 'inventory_drinks') {
  const rows = await sequelize.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM ${table}`,
    {
      type: QueryTypes.SELECT,
    },
  );
  return rows[0]!.count;
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
  auth = setupAuth(sequelize);
  app = auth.app;
  const roles: Record<string, UserRole> = {
    waiter: 'waiter',
    admin: 'admin',
    cashier: 'cashier',
    kitchen: 'kitchen',
  };
  users = {};
  for (const [name, role] of Object.entries(roles)) {
    const user = await auth.createUser(`${name}.inventory`, name, [role]);
    const login = await loginWithCookie(app, `${name}.inventory`);
    users[name] = { id: user.id, cookie: login.cookie };
  }
  drinkId = await createDrink();
});

describe('015: API HTTP de inventario sobre polleria_test', () => {
  it('AC-11/12: protege snapshot y disponibilidad por rol, sesión actual y no-store', async () => {
    const unauthenticated = await request(app).get('/api/inventory');
    expect(unauthenticated.status).toBe(401);
    noStore(unauthenticated);
    expect(unauthenticated.body).toEqual(UNAUTHENTICATED_BODY);

    const adminSnapshot = await request(app)
      .get('/api/inventory')
      .set('Cookie', users.admin!.cookie);
    expect(adminSnapshot.status).toBe(200);
    noStore(adminSnapshot);
    expect(inventorySnapshotSchema.parse(adminSnapshot.body as unknown).drinks).toEqual([
      { productId: drinkId, productName: 'Inca Kola', enabled: false, quantity: 0 },
    ]);

    const waiterAvailability = await request(app)
      .get('/api/inventory/availability')
      .set('Cookie', users.waiter!.cookie);
    expect(waiterAvailability.status).toBe(200);
    noStore(waiterAvailability);
    expect(
      inventorySnapshotSchema.parse(waiterAvailability.body as unknown).drinks[0],
    ).toMatchObject({
      enabled: false,
      quantity: 0,
    });

    for (const role of ['waiter', 'cashier', 'kitchen']) {
      const forbidden = await request(app).get('/api/inventory').set('Cookie', users[role]!.cookie);
      expect(forbidden.status).toBe(403);
      noStore(forbidden);
      expect(errorResponseSchema.parse(forbidden.body as unknown).error.code).toBe('FORBIDDEN');
    }
    for (const role of ['cashier', 'kitchen']) {
      const forbidden = await request(app)
        .get('/api/inventory/availability')
        .set('Cookie', users[role]!.cookie);
      expect(forbidden.status).toBe(403);
      noStore(forbidden);
    }
    expect(await count('inventory_drinks')).toBe(0);

    await auth.models.User.update({ roles: ['waiter'] }, { where: { id: users.admin!.id } });
    const revoked = await request(app).get('/api/inventory').set('Cookie', users.admin!.cookie);
    expect(revoked.status).toBe(403);
    noStore(revoked);
  });

  it('AC-11: rechaza query extra/repetida y fija no-store antes de leer cuerpos inválidos', async () => {
    for (const query of ['?extra=1', '?afterId=0', '?afterId=1&afterId=2', '?afterId=01']) {
      const invalid = await request(app)
        .get(`/api/inventory/movements${query}`)
        .set('Cookie', users.admin!.cookie);
      expect(invalid.status).toBe(400);
      noStore(invalid);
      expect(errorResponseSchema.parse(invalid.body as unknown).error.code).toBe(
        'VALIDATION_ERROR',
      );
    }

    const invalidJsonTest = request(app)
      .put('/api/inventory/chicken/control')
      .set('Cookie', users.admin!.cookie)
      .set('Content-Type', 'application/json')
      .set('Idempotency-Key', 'invalid-json-key');
    const invalidJson = await sendRawBody(invalidJsonTest, Buffer.from('{'));
    expect(invalidJson.status).toBe(400);
    noStore(invalidJson);

    const ignoredBodyTest = request(app)
      .get('/api/inventory')
      .set('Cookie', users.admin!.cookie)
      .set('Content-Type', 'application/json');
    const ignoredBody = await sendRawBody(ignoredBodyTest, Buffer.from('{'));
    expect(ignoredBody.status).toBe(200);
    noStore(ignoredBody);
  });

  it('AC-02/03/07/09/12: writes return strict response schemas and replay exact original response', async () => {
    const enabled = await idempotency(
      request(app).put('/api/inventory/chicken/control'),
      'api-chicken-control-001',
    ).send({ enabled: true, reason: 'Apertura' });
    expect(enabled.status).toBe(200);
    noStore(enabled);
    expect(inventoryMutationResponseSchema.parse(enabled.body as unknown).movements).toHaveLength(
      2,
    );

    const batchRequest = idempotency(
      request(app).post('/api/inventory/chicken/batches'),
      'api-chicken-batch-001',
    );
    const batch = await batchRequest.send({ chickens: 10, reason: 'Tanda' });
    expect(batch.status).toBe(201);
    noStore(batch);
    expect(inventoryMutationResponseSchema.parse(batch.body as unknown).inventory.chicken).toEqual({
      enabled: true,
      breastEighths: 40,
      legEighths: 40,
    });

    const drinkControl = await idempotency(
      request(app).put(`/api/inventory/drinks/${drinkId}/control`),
      'api-drink-control-001',
    ).send({ enabled: true, reason: 'Activar' });
    expect(drinkControl.status).toBe(200);
    noStore(drinkControl);

    const receipt = await idempotency(
      request(app).post(`/api/inventory/drinks/${drinkId}/receipts`),
      'api-drink-receipt-001',
    ).send({ quantity: 3, reason: 'Compra' });
    expect(receipt.status).toBe(201);
    noStore(receipt);
    expect(
      inventoryMutationResponseSchema.parse(receipt.body as unknown).inventory.drinks[0],
    ).toMatchObject({
      enabled: true,
      quantity: 3,
    });

    const replay = await idempotency(
      request(app).post(`/api/inventory/drinks/${drinkId}/receipts`),
      'api-drink-receipt-001',
    ).send({ quantity: 3, reason: 'Compra' });
    expect(replay.status).toBe(201);
    noStore(replay);
    expect(replay.body).toEqual(receipt.body);

    const adjustment = await idempotency(
      request(app).post('/api/inventory/adjustments'),
      'api-drink-adjustment-001',
    ).send({ kind: 'drink', productId: drinkId, delta: -1, reason: 'Merma' });
    expect(adjustment.status).toBe(201);
    noStore(adjustment);
    expect(
      inventoryMutationResponseSchema.parse(adjustment.body as unknown).inventory.drinks[0],
    ).toMatchObject({
      enabled: true,
      quantity: 2,
    });
    expect(await count('inventory_commands')).toBe(5);
    expect(await count('inventory_movements')).toBe(7);
  });

  it('AC-07/11/12: incompatible key, disabled entry and non-admin writes fail without mutation', async () => {
    const disabled = await idempotency(
      request(app).post(`/api/inventory/drinks/${drinkId}/receipts`),
      'api-disabled-receipt',
    ).send({ quantity: 2, reason: 'Compra' });
    expect(disabled.status).toBe(409);
    noStore(disabled);
    expect(errorResponseSchema.parse(disabled.body as unknown).error.code).toBe(
      'INVENTORY_DISABLED',
    );

    const adminControl = await idempotency(
      request(app).put('/api/inventory/chicken/control'),
      'api-key-conflict',
    ).send({ enabled: true, reason: 'Abrir' });
    expect(adminControl.status).toBe(200);
    const conflict = await idempotency(
      request(app).put('/api/inventory/chicken/control'),
      'api-key-conflict',
    ).send({ enabled: false, reason: 'Cerrar' });
    expect(conflict.status).toBe(409);
    noStore(conflict);
    expect(errorResponseSchema.parse(conflict.body as unknown).error.code).toBe(
      'IDEMPOTENCY_CONFLICT',
    );

    for (const role of ['waiter', 'cashier', 'kitchen']) {
      const forbidden = await request(app)
        .put('/api/inventory/chicken/control')
        .set('Cookie', users[role]!.cookie)
        .set('Idempotency-Key', `forbidden-${role}`)
        .send({ enabled: true, reason: 'Sin permiso' });
      expect(forbidden.status).toBe(403);
      noStore(forbidden);
    }
    expect(await count('inventory_commands')).toBe(1);
    expect(await count('inventory_movements')).toBe(2);
  });

  it('AC-03/11/12: schema validation and product errors are strict and do not mutate', async () => {
    const invalidBody = await idempotency(
      request(app).put('/api/inventory/chicken/control'),
      'invalid-schema',
    ).send({ enabled: true, reason: 'ok', debug: true });
    expect(invalidBody.status).toBe(400);
    noStore(invalidBody);
    expect(errorResponseSchema.parse(invalidBody.body as unknown).error.code).toBe(
      'VALIDATION_ERROR',
    );

    const missingProduct = await idempotency(
      request(app).put('/api/inventory/drinks/2147483000/control'),
      'missing-product',
    ).send({ enabled: true, reason: 'Activar' });
    expect(missingProduct.status).toBe(404);
    noStore(missingProduct);
    expect(errorResponseSchema.parse(missingProduct.body as unknown).error.code).toBe(
      'PRODUCT_NOT_FOUND',
    );

    const control = await idempotency(
      request(app).put(`/api/inventory/drinks/${drinkId}/control`),
      'product-has-inventory-control',
    ).send({ enabled: true, reason: 'Activar' });
    expect(control.status).toBe(200);
    const recategorize = await request(app)
      .patch(`/api/products/${drinkId}`)
      .set('Cookie', users.admin!.cookie)
      .send({ category: 'dish' });
    expect(recategorize.status).toBe(409);
    noStore(recategorize);
    expect(errorResponseSchema.parse(recategorize.body as unknown).error.code).toBe(
      'PRODUCT_HAS_INVENTORY',
    );
    expect(await count('inventory_commands')).toBe(1);
  });

  it('AC-11: movement pages expose audit to admin only and hide audit from availability', async () => {
    const enabled = await idempotency(
      request(app).put(`/api/inventory/drinks/${drinkId}/control`),
      'audit-drink-control',
    ).send({ enabled: true, reason: 'Activar' });
    expect(enabled.status).toBe(200);
    const receipt = await idempotency(
      request(app).post(`/api/inventory/drinks/${drinkId}/receipts`),
      'audit-drink-receipt',
    ).send({ quantity: 4, reason: 'Compra auditada' });
    expect(receipt.status).toBe(201);

    const history = await request(app)
      .get('/api/inventory/movements')
      .set('Cookie', users.admin!.cookie);
    expect(history.status).toBe(200);
    noStore(history);
    expect(inventoryMovementsResponseSchema.parse(history.body as unknown).movements).toHaveLength(
      2,
    );
    expect(JSON.stringify(history.body)).toContain('Compra auditada');

    const availability = await request(app)
      .get('/api/inventory/availability')
      .set('Cookie', users.waiter!.cookie);
    expect(availability.status).toBe(200);
    noStore(availability);
    expect(JSON.stringify(availability.body)).not.toContain('Compra auditada');
    expect(JSON.stringify(availability.body)).not.toContain('actor');
  });
});
