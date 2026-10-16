// AC-08: carreras entre cobro y cambios del pedido. Requiere polleria_test.
import { QueryTypes, Sequelize } from 'sequelize';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { defineModels } from '../src/models/index.ts';
import type { Models } from '../src/models/index.ts';
import { createOrderItemService } from '../src/services/order-items/order-item.service.ts';
import { createOrderService } from '../src/services/orders/order.service.ts';
import { createPaymentService } from '../src/services/payments/payment.service.ts';
import { createPaymentOrderFixture } from './helpers/payment-fixtures.ts';
import { migrateUp } from '../src/db/migrator.ts';
import {
  clearAuthTables,
  clearMenuTables,
  clearOrderTables,
  closeTestDatabase,
  connectTestDatabase,
} from './helpers/test-database.ts';

let sequelize: Sequelize;
let models: Models;
let payments: ReturnType<typeof createPaymentService>;
let items: ReturnType<typeof createOrderItemService>;
let orders: ReturnType<typeof createOrderService>;

async function rows<T extends object>(sql: string, bind?: unknown[]): Promise<T[]> {
  return sequelize.query<T>(sql, { type: QueryTypes.SELECT, bind });
}

async function user(username: string, role: 'waiter' | 'cashier' | 'admin') {
  const result = await rows<{ id: number }>(
    'INSERT INTO users (username, display_name, pin_hash, roles, created_at, updated_at) ' +
      'VALUES ($1, $1, $2, $3::text[], now(), now()) RETURNING id',
    [username, 'x'.repeat(60), `{${role}}`],
  );
  return result[0]!.id;
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

async function settle<T>(promise: Promise<T>) {
  try {
    return { ok: true as const, value: await promise };
  } catch (error) {
    return { ok: false as const, error };
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
  payments = createPaymentService({ models });
  items = createOrderItemService({ models });
  orders = createOrderService({ models });
});

describe('014: concurrencia del cobro frente al salón', () => {
  it('AC-08: dos cajeros y dos claves generan un solo pago', async () => {
    const waiterId = await user('race-two-waiters', 'waiter');
    const firstCashier = await user('race-first-cashier', 'cashier');
    const secondCashier = await user('race-second-cashier', 'cashier');
    const opened = await createPaymentOrderFixture(sequelize, waiterId, { tableCount: 1 });
    const bill = await payments.getBill(opened.orderId, { userId: waiterId });
    const body = {
      method: 'cash' as const,
      receivedCents: bill.totalCents,
      billToken: bill.billToken,
      confirmedReceived: true,
    };
    const results = await within(
      Promise.all([
        settle(
          payments.createPayment(opened.orderId, body, 'two-cashiers-a-014', {
            userId: firstCashier,
          }),
        ),
        settle(
          payments.createPayment(opened.orderId, body, 'two-cashiers-b-014', {
            userId: secondCashier,
          }),
        ),
      ]),
      'carrera dos cajeros',
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(
      await rows<{ count: number }>(
        'SELECT count(*)::int AS count FROM payments WHERE order_id = $1',
        [opened.orderId],
      ),
    ).toEqual([{ count: 1 }]);
  });

  it('AC-07: misma clave/cuerpo concurrente devuelve el mismo 201 original', async () => {
    const waiterId = await user('race-replay-waiter', 'waiter');
    const firstCashier = await user('race-replay-first', 'cashier');
    const secondCashier = await user('race-replay-second', 'cashier');
    const opened = await createPaymentOrderFixture(sequelize, waiterId, { tableCount: 1 });
    const bill = await payments.getBill(opened.orderId, { userId: waiterId });
    const body = {
      method: 'cash' as const,
      receivedCents: bill.totalCents,
      billToken: bill.billToken,
      confirmedReceived: true,
    };
    const [first, replay] = await within(
      Promise.all([
        payments.createPayment(opened.orderId, body, 'same-key-concurrent-014', {
          userId: firstCashier,
        }),
        payments.createPayment(opened.orderId, body, 'same-key-concurrent-014', {
          userId: secondCashier,
        }),
      ]),
      'replay concurrente',
    );
    expect(replay).toEqual(first);
    expect(
      await rows<{ count: number }>(
        'SELECT count(*)::int AS count FROM payments WHERE order_id = $1',
        [opened.orderId],
      ),
    ).toEqual([{ count: 1 }]);
  });

  it.each(['send', 'request-void'] as const)(
    'AC-08: serializa cobro frente a %s sin cobrar un total obsoleto ni dejar bloqueo',
    async (change) => {
      const waiterId = await user(`race-waiter-${change}`, 'waiter');
      const cashierId = await user(`race-cashier-${change}`, 'cashier');
      const opened = await createPaymentOrderFixture(sequelize, waiterId, { tableCount: 1 });
      const bill = await payments.getBill(opened.orderId, { userId: waiterId });
      const request = {
        method: 'cash' as const,
        receivedCents: bill.totalCents,
        billToken: bill.billToken,
        confirmedReceived: true,
      };
      const mutation =
        change === 'send'
          ? items.sendItems(
              opened.orderId,
              { items: [{ productId: opened.productId }] },
              'race-send-014',
              { userId: waiterId },
            )
          : items.requestVoid(
              opened.orderId,
              opened.itemId,
              { reason: 'Revisar pedido' },
              'race-void-014',
              { userId: waiterId },
            );

      const [paymentResult, mutationResult] = await within(
        Promise.all([
          settle(
            payments.createPayment(opened.orderId, request, `race-pay-${change}-014`, {
              userId: cashierId,
            }),
          ),
          settle(mutation),
        ]),
        `carrera payment/${change}`,
      );

      expect(Number(paymentResult.ok) + Number(mutationResult.ok)).toBe(1);
      const persisted = await rows<{ status: string }>('SELECT status FROM orders WHERE id = $1', [
        opened.orderId,
      ]);
      const count = await rows<{ count: number }>(
        'SELECT count(*)::int AS count FROM payments WHERE order_id = $1',
        [opened.orderId],
      );
      if (paymentResult.ok) {
        expect(persisted[0]?.status).toBe('closed');
        expect(count[0]?.count).toBe(1);
      } else {
        expect(persisted[0]?.status).toBe('open');
        expect(count[0]?.count).toBe(0);
        const refreshed = await payments.getBill(opened.orderId, { userId: waiterId });
        expect(refreshed.totalCents).toBe(
          change === 'send' ? bill.totalCents + 2100 : bill.totalCents,
        );
        if (change === 'request-void') expect(refreshed.hasPendingVoids).toBe(true);
      }
      // Una consulta posterior debe completar, lo que también detecta transacciones que dejaron
      // retenido el bloqueo del pedido o sus mesas.
      await within(
        payments.getBill(opened.orderId, { userId: waiterId }).catch(() => null),
        'lectura posterior',
      );
    },
  );

  it('AC-08: el cierre y el traslado de mesa tienen un único ganador', async () => {
    const waiterId = await user('race-move-waiter', 'waiter');
    const cashierId = await user('race-move-cashier', 'cashier');
    const opened = await createPaymentOrderFixture(sequelize, waiterId, { tableCount: 2 });
    const bill = await payments.getBill(opened.orderId, { userId: waiterId });
    const [pay, move] = await within(
      Promise.all([
        settle(
          payments.createPayment(
            opened.orderId,
            {
              method: 'cash',
              receivedCents: bill.totalCents,
              billToken: bill.billToken,
              confirmedReceived: true,
            },
            'race-pay-move-014',
            { userId: cashierId },
          ),
        ),
        settle(orders.moveOrder(opened.orderId, opened.tables[1]!, { userId: waiterId })),
      ]),
      'carrera payment/move',
    );
    expect(Number(pay.ok) + Number(move.ok)).toBe(1);
    const persisted = await rows<{ status: string }>('SELECT status FROM orders WHERE id = $1', [
      opened.orderId,
    ]);
    const count = await rows<{ count: number }>(
      'SELECT count(*)::int AS count FROM payments WHERE order_id = $1',
      [opened.orderId],
    );
    if (pay.ok) {
      expect(persisted[0]?.status).toBe('closed');
      expect(count[0]?.count).toBe(1);
    } else {
      expect(persisted[0]?.status).toBe('open');
      expect(count[0]?.count).toBe(0);
      expect((await payments.getBill(opened.orderId, { userId: waiterId })).tables).toHaveLength(1);
    }
  });

  it('AC-08: cerrar un ítem pendiente de anulación bloquea el cobro obsoleto', async () => {
    const waiterId = await user('race-void-waiter', 'waiter');
    const cashierId = await user('race-void-cashier', 'cashier');
    const adminId = await user('race-void-admin', 'admin');
    const opened = await createPaymentOrderFixture(sequelize, waiterId, { tableCount: 1 });
    await items.requestVoid(
      opened.orderId,
      opened.itemId,
      { reason: 'Anulación solicitada' },
      'race-request-before-void-014',
      { userId: waiterId },
    );
    const bill = await payments.getBill(opened.orderId, { userId: waiterId });
    const [pay, closeVoid] = await within(
      Promise.all([
        settle(
          payments.createPayment(
            opened.orderId,
            {
              method: 'cash',
              receivedCents: 2100,
              billToken: bill.billToken,
              confirmedReceived: true,
            },
            'race-pay-void-014',
            { userId: cashierId },
          ),
        ),
        settle(
          items.voidItem(
            opened.orderId,
            opened.itemId,
            { reason: 'Aprobada' },
            'race-void-item-014',
            { userId: adminId },
          ),
        ),
      ]),
      'carrera payment/void-item',
    );
    expect(pay.ok).toBe(false);
    expect(closeVoid.ok).toBe(true);
    const persisted = await rows<{ status: string }>('SELECT status FROM orders WHERE id = $1', [
      opened.orderId,
    ]);
    const count = await rows<{ count: number }>(
      'SELECT count(*)::int AS count FROM payments WHERE order_id = $1',
      [opened.orderId],
    );
    expect(persisted[0]?.status).toBe('open');
    expect(count[0]?.count).toBe(0);
    expect((await payments.getBill(opened.orderId, { userId: waiterId })).totalCents).toBe(0);
  });

  it('AC-08: un join de mesas y el cobro compiten sin perder el total combinado', async () => {
    const waiterId = await user('race-join-waiter', 'waiter');
    const cashierId = await user('race-join-cashier', 'cashier');
    const target = await createPaymentOrderFixture(sequelize, waiterId, { tableCount: 1 });
    const source = await createPaymentOrderFixture(sequelize, waiterId, { tableCount: 1 });
    const bill = await payments.getBill(target.orderId, { userId: waiterId });
    const [pay, join] = await within(
      Promise.all([
        settle(
          payments.createPayment(
            target.orderId,
            {
              method: 'cash',
              receivedCents: bill.totalCents,
              billToken: bill.billToken,
              confirmedReceived: true,
            },
            'race-pay-join-014',
            { userId: cashierId },
          ),
        ),
        settle(orders.joinTable(source.tables[0]!, target.tables[0]!, { userId: waiterId })),
      ]),
      'carrera payment/join',
    );
    expect(Number(pay.ok) + Number(join.ok)).toBe(1);
    const persisted = await rows<{ status: string }>('SELECT status FROM orders WHERE id = $1', [
      target.orderId,
    ]);
    const count = await rows<{ count: number }>(
      'SELECT count(*)::int AS count FROM payments WHERE order_id = $1',
      [target.orderId],
    );
    if (pay.ok) {
      expect(persisted[0]?.status).toBe('closed');
      expect(count[0]?.count).toBe(1);
      expect(
        await rows<{ current_order_id: number | null }>(
          'SELECT current_order_id FROM tables WHERE id = $1',
          [source.tables[0]],
        ),
      ).toEqual([{ current_order_id: source.orderId }]);
    } else {
      expect(persisted[0]?.status).toBe('open');
      expect(count[0]?.count).toBe(0);
      const refreshed = await payments.getBill(target.orderId, { userId: waiterId });
      expect(refreshed.totalCents).toBe(bill.totalCents + 2100);
      expect(refreshed.tables).toHaveLength(2);
    }
  });
});
