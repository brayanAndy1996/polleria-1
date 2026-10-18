// AC-01…03 y AC-06. Requiere exclusivamente DATABASE_URL_TEST (polleria_test).
import request from 'supertest';
import { Sequelize } from 'sequelize';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { dailySalesReportSchema, errorResponseSchema } from '@polleria/shared';
import type { UserRole } from '@polleria/shared';
import { createPaymentService } from '../src/services/payments/payment.service.ts';
import { createPaymentOrderFixture } from './helpers/payment-fixtures.ts';
import { loginWithCookie, setupAuth } from './helpers/auth.ts';
import {
  clearAuthTables,
  clearMenuTables,
  clearOrderTables,
  closeTestDatabase,
  connectTestDatabase,
} from './helpers/test-database.ts';
import { migrateUp } from '../src/db/migrator.ts';

const REPORT_PATH = '/api/reports/daily-sales';
let sequelize: Sequelize;
let auth: ReturnType<typeof setupAuth>;
let users: Record<string, { id: number; cookie: string }>;

function noStore(response: { headers: Record<string, unknown> }) {
  expect(response.headers['cache-control']).toBe('no-store');
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
  const actors: Array<[string, UserRole]> = [
    ['admin', 'admin'],
    ['cashier', 'cashier'],
    ['waiter', 'waiter'],
    ['kitchen', 'kitchen'],
  ];
  users = {};
  for (const [name, role] of actors) {
    const user = await auth.createUser(`${name}.report016`, name, [role], '2468');
    const login = await loginWithCookie(auth.app, `${name}.report016`, '2468');
    users[name] = { id: user.id, cookie: login.cookie };
  }
});

describe('016: API GET de ventas diarias contra polleria_test', () => {
  it('AC-02/03/06: devuelve el día Lima del reloj de servidor y no duplica el replay', async () => {
    const opened = await createPaymentOrderFixture(sequelize, users.waiter!.id, {
      tableCount: 1,
      itemPriceCents: 1700,
    });
    const paymentService = createPaymentService({ models: auth.models, now: auth.now });
    const bill = await paymentService.getBill(opened.orderId, { userId: users.cashier!.id });
    const body = {
      method: 'cash' as const,
      receivedCents: 2500,
      billToken: bill.billToken,
      confirmedReceived: true as const,
    };
    const first = await paymentService.createPayment(
      opened.orderId,
      body,
      'reports-api-replay-016',
      { userId: users.cashier!.id },
    );
    const replay = await paymentService.createPayment(
      opened.orderId,
      body,
      'reports-api-replay-016',
      { userId: users.cashier!.id },
    );
    expect(replay.payment.id).toBe(first.payment.id);

    const response = await request(auth.app).get(REPORT_PATH).set('Cookie', users.admin!.cookie);
    expect(response.status).toBe(200);
    noStore(response);
    expect(dailySalesReportSchema.parse(response.body as unknown)).toMatchObject({
      date: '2026-10-08',
      totalCents: 1700,
      paymentCount: 1,
      methods: [
        { method: 'cash', totalCents: 1700, paymentCount: 1 },
        { method: 'yape', totalCents: 0, paymentCount: 0 },
        { method: 'plin', totalCents: 0, paymentCount: 0 },
        { method: 'card', totalCents: 0, paymentCount: 0 },
      ],
      authors: [{ userId: users.waiter!.id, displayName: 'waiter', totalCents: 1700 }],
    });
  });

  it('AC-01/02: exige admin actual, fija no-store en errores y valida query estricta', async () => {
    const anonymous = await request(auth.app).get(REPORT_PATH);
    expect(anonymous.status).toBe(401);
    noStore(anonymous);
    expect(errorResponseSchema.parse(anonymous.body as unknown).error.code).toBe('UNAUTHENTICATED');

    for (const name of ['cashier', 'waiter', 'kitchen']) {
      const denied = await request(auth.app).get(REPORT_PATH).set('Cookie', users[name]!.cookie);
      expect(denied.status).toBe(403);
      noStore(denied);
      expect(errorResponseSchema.parse(denied.body as unknown).error.code).toBe('FORBIDDEN');
    }

    for (const query of ['?date=2026-02-29', '?date=2026-10-08&date=2026-10-09', '?other=1']) {
      const invalid = await request(auth.app)
        .get(`${REPORT_PATH}${query}`)
        .set('Cookie', users.admin!.cookie);
      expect(invalid.status).toBe(400);
      noStore(invalid);
      expect(errorResponseSchema.parse(invalid.body as unknown).error.code).toBe(
        'VALIDATION_ERROR',
      );
    }

    await sequelize.query("UPDATE users SET roles = '{cashier}' WHERE id = $1", {
      bind: [users.admin!.id],
    });
    const revoked = await request(auth.app).get(REPORT_PATH).set('Cookie', users.admin!.cookie);
    expect(revoked.status).toBe(403);
    noStore(revoked);

    await sequelize.query("UPDATE users SET roles = '{admin}', is_active = false WHERE id = $1", {
      bind: [users.admin!.id],
    });
    const inactive = await request(auth.app).get(REPORT_PATH).set('Cookie', users.admin!.cookie);
    expect(inactive.status).toBe(401);
    noStore(inactive);
  });

  it('AC-02: GET ignora cuerpo roto y una fecha válida vacía devuelve ceros', async () => {
    const response = await request(auth.app)
      .get(`${REPORT_PATH}?date=2026-10-09`)
      .set('Cookie', users.admin!.cookie)
      .set('Content-Type', 'application/json')
      .send('{cuerpo roto');
    expect(response.status).toBe(200);
    noStore(response);
    expect(dailySalesReportSchema.parse(response.body as unknown)).toMatchObject({
      date: '2026-10-09',
      totalCents: 0,
      paymentCount: 0,
      products: [],
      authors: [],
    });
  });
});
