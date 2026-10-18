// AC-01…07. Requiere exclusivamente DATABASE_URL_TEST (polleria_test).
import { buildDailySalesReport } from '@polleria/shared';
import { QueryTypes, Sequelize, Transaction } from 'sequelize';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPaymentService } from '../src/services/payments/payment.service.ts';
import { createReportsService } from '../src/services/reports/reports.service.ts';
import { defineModels } from '../src/models/index.ts';
import type { Models } from '../src/models/index.ts';
import { createPaymentOrderFixture } from './helpers/payment-fixtures.ts';
import {
  clearAuthTables,
  clearMenuTables,
  clearOrderTables,
  closeTestDatabase,
  connectTestDatabase,
} from './helpers/test-database.ts';
import { migrateUp } from '../src/db/migrator.ts';

const NOW = new Date('2026-10-08T15:00:00.000Z');
const REPORT_DATE = '2026-10-08';
let sequelize: Sequelize;
let models: Models;
let reportService: ReturnType<typeof createReportsService>;
let paymentService: ReturnType<typeof createPaymentService>;

async function createUser(username: string, displayName: string, roles: string[]) {
  const rows = await sequelize.query<{ id: number }>(
    'INSERT INTO users (username, display_name, pin_hash, roles, created_at, updated_at) ' +
      'VALUES ($1, $2, $3, $4, now(), now()) RETURNING id',
    { bind: [username, displayName, 'x'.repeat(60), roles], type: QueryTypes.SELECT },
  );
  return rows[0]!.id;
}

async function countReportSideEffects() {
  const rows = await sequelize.query<{
    payments: number;
    orders: number;
    items: number;
    movements: number;
    prints: number;
    printAttempts: number;
  }>(
    'SELECT (SELECT count(*)::int FROM payments) AS payments, ' +
      '(SELECT count(*)::int FROM orders) AS orders, ' +
      '(SELECT count(*)::int FROM order_items) AS items, ' +
      '(SELECT count(*)::int FROM inventory_movements) AS movements, ' +
      '(SELECT count(*)::int FROM kitchen_ticket_prints) AS prints, ' +
      '(SELECT count(*)::int FROM kitchen_ticket_print_attempts) AS "printAttempts"',
    { type: QueryTypes.SELECT },
  );
  const balances = await sequelize.query('SELECT * FROM inventory_state ORDER BY id', {
    type: QueryTypes.SELECT,
  });
  const drinks = await sequelize.query('SELECT * FROM inventory_drinks ORDER BY product_id', {
    type: QueryTypes.SELECT,
  });
  return { ...rows[0]!, balances, drinks };
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
  reportService = createReportsService({ models, now: () => new Date(NOW) });
  paymentService = createPaymentService({ models, now: () => new Date(NOW) });
});

describe('016: servicio de reporte diario contra polleria_test', () => {
  it('AC-03…07: usa snapshot y autor original tras mover líneas; replay y consultas no mutan datos', async () => {
    const waiterId = await createUser('report.waiter', 'Mozo original', ['waiter']);
    const attendingAdminId = await createUser('report.author', 'Admin original', ['admin']);
    const cashierId = await createUser('report.cashier', 'Caja', ['cashier']);
    const reportAdminId = await createUser('report.admin', 'Administradora', ['admin']);
    const firstOrder = await createPaymentOrderFixture(sequelize, waiterId, {
      tableCount: 1,
      itemPriceCents: 2100,
    });
    const movedOrder = await createPaymentOrderFixture(sequelize, attendingAdminId, {
      tableCount: 1,
      itemPriceCents: 1200,
    });
    await sequelize.query('UPDATE order_items SET order_id = $1 WHERE id = $2', {
      bind: [firstOrder.orderId, movedOrder.itemId],
    });

    const bill = await paymentService.getBill(firstOrder.orderId, { userId: cashierId });
    const paymentRequest = {
      method: 'cash' as const,
      receivedCents: 3700,
      billToken: bill.billToken,
      confirmedReceived: true as const,
    };
    const paid = await paymentService.createPayment(
      firstOrder.orderId,
      paymentRequest,
      'reports-replay-016',
      { userId: cashierId },
    );
    const replay = await paymentService.createPayment(
      firstOrder.orderId,
      paymentRequest,
      'reports-replay-016',
      { userId: cashierId },
    );
    expect(replay.payment.id).toBe(paid.payment.id);

    await sequelize.query('UPDATE products SET name = $1, price_cents = $2 WHERE id = $3', {
      bind: ['Carta renombrada A', 99000, firstOrder.productId],
    });
    await sequelize.query('UPDATE products SET name = $1, price_cents = $2 WHERE id = $3', {
      bind: ['Carta renombrada B', 98000, movedOrder.productId],
    });
    await sequelize.query('UPDATE users SET display_name = $1 WHERE id = $2', {
      bind: ['Mozo con nombre actual', waiterId],
    });
    await sequelize.query('UPDATE users SET display_name = $1, is_active = false WHERE id = $2', {
      bind: ['Admin inactivo actual', attendingAdminId],
    });

    await sequelize.query(
      'UPDATE inventory_state SET breast_eighths = 17, leg_eighths = 23 WHERE id = 1',
    );
    await sequelize.query(
      'INSERT INTO inventory_drinks (product_id, enabled, quantity) VALUES ($1, true, 9)',
      { bind: [firstOrder.productId] },
    );

    const before = await countReportSideEffects();
    const report = await reportService.getDailySales(REPORT_DATE, { userId: reportAdminId });
    const repeated = await reportService.getDailySales(REPORT_DATE, { userId: reportAdminId });
    const after = await countReportSideEffects();

    expect(report).toMatchObject({ date: REPORT_DATE, totalCents: 3300, paymentCount: 1 });
    expect(report.products).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productId: firstOrder.productId,
          productName: paid.payment.snapshot.bill.items[0]!.productName,
          totalCents: 2100,
        }),
        expect.objectContaining({
          productId: movedOrder.productId,
          productName: paid.payment.snapshot.bill.items[1]!.productName,
          totalCents: 1200,
        }),
      ]),
    );
    expect(report.authors).toEqual(
      expect.arrayContaining([
        { userId: waiterId, displayName: 'Mozo con nombre actual', totalCents: 2100 },
        { userId: attendingAdminId, displayName: 'Admin inactivo actual', totalCents: 1200 },
      ]),
    );
    expect(repeated).toEqual(report);
    expect(after).toEqual(before);
  });

  it('AC-01: relee rol y estado actuales en cada llamada directa al servicio', async () => {
    const adminId = await createUser('report.current-admin', 'Admin', ['admin']);
    const serviceActor = { userId: adminId };
    await expect(reportService.getDailySales(REPORT_DATE, serviceActor)).resolves.toMatchObject({
      date: REPORT_DATE,
      totalCents: 0,
      paymentCount: 0,
    });

    await sequelize.query("UPDATE users SET roles = '{cashier}' WHERE id = $1", {
      bind: [adminId],
    });
    await expect(reportService.getDailySales(REPORT_DATE, serviceActor)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      httpStatus: 403,
    });
    await sequelize.query("UPDATE users SET roles = '{admin}', is_active = false WHERE id = $1", {
      bind: [adminId],
    });
    await expect(reportService.getDailySales(REPORT_DATE, serviceActor)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      httpStatus: 403,
    });
  });

  it('AC-07: fija un corte repetible mientras se confirma otro pago y renombra a su autor', async () => {
    const authorId = await createUser('report.concurrent-author', 'Mozo antes', ['waiter']);
    const cashierId = await createUser('report.concurrent-cashier', 'Caja', ['cashier']);
    const reportAdminId = await createUser('report.concurrent-admin', 'Admin', ['admin']);
    const first = await createPaymentOrderFixture(sequelize, authorId, { tableCount: 1 });
    const second = await createPaymentOrderFixture(sequelize, authorId, {
      tableCount: 1,
      itemPriceCents: 1500,
    });
    const firstBill = await paymentService.getBill(first.orderId, { userId: cashierId });
    await paymentService.createPayment(
      first.orderId,
      {
        method: 'cash',
        receivedCents: firstBill.totalCents,
        billToken: firstBill.billToken,
        confirmedReceived: true,
      },
      'reports-concurrent-first-016',
      { userId: cashierId },
    );
    const concurrentBill = await paymentService.getBill(second.orderId, { userId: cashierId });
    const concurrentPaidAt = new Date(NOW.getTime() + 60_000);
    const cashier = await models.User.findByPk(cashierId);
    if (cashier === null) throw new Error('Falta la cajera de la fixture.');
    const concurrentSnapshot = {
      version: 1 as const,
      bill: concurrentBill,
      cashier: { id: cashier.id, displayName: cashier.displayName },
      method: 'yape' as const,
      amountCents: concurrentBill.totalCents,
      receivedCents: concurrentBill.totalCents,
      changeCents: 0,
      paidAt: concurrentPaidAt.toISOString(),
    };

    let reachedPaymentRead!: () => void;
    let allowReadToFinish!: () => void;
    const paymentReadReached = new Promise<void>((resolve) => {
      reachedPaymentRead = resolve;
    });
    const readMayFinish = new Promise<void>((resolve) => {
      allowReadToFinish = resolve;
    });
    let paused = false;
    const originalFindAll = models.Payment.findAll.bind(models.Payment);
    vi.spyOn(models.Payment, 'findAll').mockImplementation(async (options) => {
      const result = await originalFindAll(options);
      if (!paused) {
        paused = true;
        reachedPaymentRead();
        await readMayFinish;
      }
      return result;
    });

    const inFlight = reportService.getDailySales(REPORT_DATE, { userId: reportAdminId });
    // Attach a handler immediately; an early failure must not leave the barrier waiting.
    const settled = inFlight.then(
      (value) => ({ value, error: undefined }),
      (error: unknown) => ({ value: undefined, error }),
    );
    try {
      await Promise.race([
        paymentReadReached,
        settled.then(({ error }) => {
          throw error instanceof Error ? error : new Error('No se alcanzo la lectura de pagos.');
        }),
      ]);
      await sequelize.transaction(
        { isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ },
        async (transaction) => {
          await models.Payment.create(
            {
              orderId: second.orderId,
              method: 'yape',
              amountCents: concurrentSnapshot.amountCents,
              receivedCents: concurrentSnapshot.receivedCents,
              changeCents: concurrentSnapshot.changeCents,
              cashierUserId: cashierId,
              paidAt: concurrentPaidAt,
              billToken: concurrentBill.billToken,
              snapshotVersion: 1,
              snapshot: concurrentSnapshot,
            },
            { transaction },
          );
          const order = await models.Order.findByPk(second.orderId, { transaction });
          if (order === null) throw new Error('Falta el pedido concurrente.');
          await order.update(
            { status: 'closed', closedAt: concurrentPaidAt, closedByUserId: cashierId },
            { transaction },
          );
          await models.Table.update(
            { currentOrderId: null },
            { where: { currentOrderId: second.orderId }, transaction },
          );
          await models.User.update(
            { displayName: 'Mozo después del commit' },
            { where: { id: authorId }, transaction },
          );
        },
      );
    } finally {
      allowReadToFinish();
      await settled;
      vi.restoreAllMocks();
    }

    const beforeConcurrentCommit = await inFlight;
    const afterCommit = await reportService.getDailySales(REPORT_DATE, {
      userId: reportAdminId,
    });
    expect(beforeConcurrentCommit).toMatchObject({
      totalCents: firstBill.totalCents,
      paymentCount: 1,
      authors: [{ userId: authorId, displayName: 'Mozo antes', totalCents: firstBill.totalCents }],
    });
    expect(afterCommit).toMatchObject({
      totalCents: firstBill.totalCents + concurrentBill.totalCents,
      paymentCount: 2,
      authors: [
        {
          userId: authorId,
          displayName: 'Mozo después del commit',
          totalCents: firstBill.totalCents + concurrentBill.totalCents,
        },
      ],
    });
  });

  it('AC-02: SQL limita paidAt al dia Lima y el builder rechaza los pagos exteriores', async () => {
    const authorId = await createUser('report.boundary-author', 'Mozo', ['waiter']);
    const cashierId = await createUser('report.boundary-cashier', 'Caja', ['cashier']);
    const adminId = await createUser('report.boundary-admin', 'Admin', ['admin']);
    const instants = [
      '2026-10-08T04:59:59.999Z',
      '2026-10-08T05:00:00.000Z',
      '2026-10-09T04:59:59.999Z',
      '2026-10-09T05:00:00.000Z',
    ];
    const payments = [];
    for (const [index, instant] of instants.entries()) {
      const order = await createPaymentOrderFixture(sequelize, authorId, {
        tableCount: 1,
        itemPriceCents: 1000 + index,
      });
      // The order existed before the reporting date; only paidAt determines inclusion.
      await sequelize.query('UPDATE orders SET opened_at = $1 WHERE id = $2', {
        bind: ['2026-10-07T15:00:00Z', order.orderId],
      });
      const service = createPaymentService({ models, now: () => new Date(instant) });
      const bill = await service.getBill(order.orderId, { userId: cashierId });
      const paid = await service.createPayment(
        order.orderId,
        {
          method: 'card',
          receivedCents: bill.totalCents,
          billToken: bill.billToken,
          confirmedReceived: true,
        },
        `reports-boundary-${index}-016`,
        { userId: cashierId },
      );
      payments.push(paid.payment);
    }
    const report = await reportService.getDailySales(REPORT_DATE, { userId: adminId });
    expect(report).toMatchObject({ totalCents: 2003, paymentCount: 2 });
    expect(report.hours[0]).toMatchObject({ totalCents: 1001, paymentCount: 1 });
    expect(report.hours[23]).toMatchObject({ totalCents: 1002, paymentCount: 1 });
    for (const index of [0, 3]) {
      const payment = payments[index]!;
      expect(() =>
        buildDailySalesReport({
          date: REPORT_DATE,
          generatedAt: NOW.toISOString(),
          payments: [payment],
          itemAuthors: new Map([
            [payment.snapshot.bill.items[0]!.id, { id: authorId, displayName: 'Mozo' }],
          ]),
        }),
      ).toThrow(TypeError);
    }
  });

  it.each(['snapshot', 'association'] as const)(
    'AC-06: datos historicos invalidos (%s) dan 500 seguro sin resultado parcial',
    async (corruption) => {
      const authorId = await createUser('report.invalid-author', 'Mozo', ['waiter']);
      const cashierId = await createUser('report.invalid-cashier', 'Caja', ['cashier']);
      const adminId = await createUser('report.invalid-admin', 'Admin', ['admin']);
      const order = await createPaymentOrderFixture(sequelize, authorId, { tableCount: 1 });
      const bill = await paymentService.getBill(order.orderId, { userId: cashierId });
      const { payment } = await paymentService.createPayment(
        order.orderId,
        {
          method: 'plin',
          receivedCents: bill.totalCents,
          billToken: bill.billToken,
          confirmedReceived: true,
        },
        'reports-invalid-016',
        { userId: cashierId },
      );
      if (corruption === 'snapshot') {
        await sequelize.query('UPDATE payments SET snapshot = $1::jsonb WHERE id = $2', {
          bind: [JSON.stringify({ privateMarker: 'PRIVATE_REPORT_PAYLOAD' }), payment.id],
        });
      } else {
        const other = await createPaymentOrderFixture(sequelize, authorId, { tableCount: 1 });
        await sequelize.query('UPDATE order_items SET order_id = $1 WHERE id = $2', {
          bind: [other.orderId, order.itemId],
        });
      }
      const before = await countReportSideEffects();
      const error: unknown = await reportService
        .getDailySales(REPORT_DATE, { userId: adminId })
        .then(
          () => null,
          (failure: unknown) => failure,
        );
      expect(error).toMatchObject({ code: 'REPORT_DATA_INVALID', httpStatus: 500 });
      expect(JSON.stringify(error)).not.toMatch(
        /PRIVATE_REPORT_PAYLOAD|pin_hash|billToken|SELECT|UPDATE/,
      );
      expect(await countReportSideEffects()).toEqual(before);
    },
  );
});
