// AC-07 y AC-10. Requiere exclusivamente DATABASE_URL_TEST (polleria_test).
import request from 'supertest';
import type { Express } from 'express';
import { QueryTypes, Sequelize } from 'sequelize';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  billResponseSchema,
  cashierOrdersResponseSchema,
  createPaymentResponseSchema,
  errorResponseSchema,
  paymentResponseSchema,
} from '@polleria/shared';
import type { Bill, UserRole } from '@polleria/shared';
import { createApp } from '../src/app.ts';
import { createBcryptPinHasher } from '../src/services/auth/pin-hasher.ts';
import { createUserService } from '../src/services/users/user.service.ts';
import { defineModels } from '../src/models/index.ts';
import type { Models } from '../src/models/index.ts';
import { createPaymentOrderFixture } from './helpers/payment-fixtures.ts';
import { loginWithCookie } from './helpers/auth.ts';
import {
  clearAuthTables,
  clearMenuTables,
  clearOrderTables,
  closeTestDatabase,
  connectTestDatabase,
} from './helpers/test-database.ts';
import { migrateUp } from '../src/db/migrator.ts';

let sequelize: Sequelize;
let app: Express;
let models: Models;
let users: Record<string, { id: number; cookie: string }>;
let opened: { orderId: number; userId: number; tables: number[] };

function noStore(response: { headers: Record<string, unknown> }) {
  expect(response.headers['cache-control']).toBe('no-store');
}

function paymentBody(bill: Bill, changes: Record<string, unknown> = {}) {
  return {
    method: 'cash',
    receivedCents: 3000,
    billToken: bill.billToken,
    confirmedReceived: true,
    ...changes,
  };
}

async function readBill(orderId = opened.orderId): Promise<Bill> {
  const response = await request(app)
    .get(`/api/orders/${orderId}/bill`)
    .set('Cookie', users.waiter!.cookie);
  expect(response.status).toBe(200);
  noStore(response);
  return billResponseSchema.parse(response.body as unknown).bill;
}

async function rowCount(table: 'payments') {
  const result = await sequelize.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM ${table}`,
    {
      type: QueryTypes.SELECT,
    },
  );
  return result[0]!.count;
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
  const pinHasher = createBcryptPinHasher({ cost: 4 });
  const userService = createUserService({ models, pinHasher });
  const now = () => new Date('2026-10-16T15:00:00.000Z');
  app = createApp({ sequelize, now, pinHasher });
  const actors: Record<string, { id: number; role: UserRole }> = {
    waiter: { id: 0, role: 'waiter' },
    cashier: { id: 0, role: 'cashier' },
    admin: { id: 0, role: 'admin' },
    kitchen: { id: 0, role: 'kitchen' },
  };
  users = {};
  for (const [username, actor] of Object.entries(actors)) {
    const user = await userService.createUser({
      username: `${username}.014`,
      displayName: username === 'waiter' ? 'Mozo' : username,
      roles: [actor.role],
      pin: '2468',
    });
    const login = await loginWithCookie(app, `${username}.014`, '2468');
    users[username] = { id: user.id, cookie: login.cookie };
  }
  opened = await createPaymentOrderFixture(sequelize, users.waiter!.id, { tableCount: 1 });
});

describe('014: contrato HTTP de pre-cuenta, Caja y cobro', () => {
  it('AC-10: roles permitidos, respuestas no-store y query estricto en la lista', async () => {
    const cashierList = await request(app)
      .get('/api/cashier/orders')
      .set('Cookie', users.cashier!.cookie);
    expect(cashierList.status).toBe(200);
    noStore(cashierList);
    expect(cashierOrdersResponseSchema.parse(cashierList.body as unknown).orders).toHaveLength(1);

    const adminList = await request(app)
      .get('/api/cashier/orders?afterOrderId=1')
      .set('Cookie', users.admin!.cookie);
    expect(adminList.status).toBe(200);
    noStore(adminList);

    for (const name of ['waiter', 'kitchen']) {
      const forbidden = await request(app)
        .get('/api/cashier/orders')
        .set('Cookie', users[name]!.cookie);
      expect(forbidden.status).toBe(403);
      noStore(forbidden);
      expect(errorResponseSchema.parse(forbidden.body as unknown).error.code).toBe('FORBIDDEN');
    }

    for (const query of ['?unknown=1', '?afterOrderId=0', '?afterOrderId=1&afterOrderId=2']) {
      const invalid = await request(app)
        .get(`/api/cashier/orders${query}`)
        .set('Cookie', users.cashier!.cookie);
      expect(invalid.status).toBe(400);
      noStore(invalid);
      expect(errorResponseSchema.parse(invalid.body as unknown).error.code).toBe(
        'VALIDATION_ERROR',
      );
    }
  });

  it('AC-10: mozo puede leer la pre-cuenta; cocina no puede leerla ni cobrar', async () => {
    const bill = await readBill();
    expect(bill.orderId).toBe(opened.orderId);
    for (const name of ['cashier', 'admin']) {
      const allowed = await request(app)
        .get(`/api/orders/${opened.orderId}/bill`)
        .set('Cookie', users[name]!.cookie);
      expect(allowed.status).toBe(200);
      noStore(allowed);
    }

    const deniedBill = await request(app)
      .get(`/api/orders/${opened.orderId}/bill`)
      .set('Cookie', users.kitchen!.cookie);
    expect(deniedBill.status).toBe(403);
    noStore(deniedBill);

    const deniedPayment = await request(app)
      .post(`/api/orders/${opened.orderId}/payments`)
      .set('Cookie', users.waiter!.cookie)
      .set('Idempotency-Key', 'role-deny-014')
      .send(paymentBody(bill));
    expect(deniedPayment.status).toBe(403);
    noStore(deniedPayment);
  });

  it('AC-10: valida ids, clave y JSON estricto antes de cobrar y conserva no-store en errores', async () => {
    for (const path of ['/api/orders/no/bill', '/api/orders/0/bill']) {
      const invalid = await request(app).get(path).set('Cookie', users.waiter!.cookie);
      expect(invalid.status).toBe(400);
      noStore(invalid);
    }
    const bill = await readBill();
    const noKey = await request(app)
      .post(`/api/orders/${opened.orderId}/payments`)
      .set('Cookie', users.cashier!.cookie)
      .send(paymentBody(bill));
    expect(noKey.status).toBe(400);
    noStore(noKey);

    const oversizedKey = await request(app)
      .post(`/api/orders/${opened.orderId}/payments`)
      .set('Cookie', users.cashier!.cookie)
      .set('Idempotency-Key', 'x'.repeat(129))
      .send(paymentBody(bill));
    expect(oversizedKey.status).toBe(400);
    noStore(oversizedKey);

    const extraField = await request(app)
      .post(`/api/orders/${opened.orderId}/payments`)
      .set('Cookie', users.cashier!.cookie)
      .set('Idempotency-Key', 'strict-body-014')
      .send(paymentBody(bill, { extra: 'no permitido' }));
    expect(extraField.status).toBe(400);
    noStore(extraField);
    expect(await rowCount('payments')).toBe(0);
  });

  it('AC-07: reintentar tras perder el ACK devuelve el 201 y snapshot original', async () => {
    const bill = await readBill();
    const body = paymentBody(bill);
    const first = await request(app)
      .post(`/api/orders/${opened.orderId}/payments`)
      .set('Cookie', users.cashier!.cookie)
      .set('Idempotency-Key', 'ack-lost-014')
      .send(body);
    expect(first.status).toBe(201);
    noStore(first);
    const original = createPaymentResponseSchema.parse(first.body as unknown);

    // El cliente perdió la primera respuesta; reproduce exactamente clave y cuerpo.
    const replay = await request(app)
      .post(`/api/orders/${opened.orderId}/payments`)
      .set('Cookie', users.admin!.cookie)
      .set('Idempotency-Key', 'ack-lost-014')
      .send(body);
    expect(replay.status).toBe(201);
    noStore(replay);
    expect(createPaymentResponseSchema.parse(replay.body as unknown)).toEqual(original);
    expect(await rowCount('payments')).toBe(1);

    const readback = await request(app)
      .get(`/api/payments/${original.payment.id}`)
      .set('Cookie', users.admin!.cookie);
    expect(readback.status).toBe(200);
    noStore(readback);
    expect(paymentResponseSchema.parse(readback.body as unknown).payment).toEqual(original.payment);

    const conflict = await request(app)
      .post(`/api/orders/${opened.orderId}/payments`)
      .set('Cookie', users.cashier!.cookie)
      .set('Idempotency-Key', 'ack-lost-014')
      .send(paymentBody(bill, { receivedCents: 3100 }));
    expect(conflict.status).toBe(409);
    noStore(conflict);
    expect(errorResponseSchema.parse(conflict.body as unknown).error.code).toBe(
      'IDEMPOTENCY_CONFLICT',
    );
    expect(await rowCount('payments')).toBe(1);
  });
});
