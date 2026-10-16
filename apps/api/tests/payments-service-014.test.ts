// AC-04, AC-05, AC-09 y AC-11. Requiere exclusivamente DATABASE_URL_TEST (polleria_test).
import { QueryTypes, Sequelize } from 'sequelize';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPaymentResponseSchema } from '@polleria/shared';
import type { PaymentRequest } from '@polleria/shared';
import { defineModels } from '../src/models/index.ts';
import type { Models } from '../src/models/index.ts';
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

const NOW = new Date('2026-10-16T15:00:00.000Z');
let sequelize: Sequelize;
let models: Models;
let service: ReturnType<typeof createPaymentService>;

async function rows<T extends object>(sql: string, bind?: unknown[]): Promise<T[]> {
  return sequelize.query<T>(sql, { type: QueryTypes.SELECT, bind });
}

async function createCashierUser() {
  const userRows = await rows<{ id: number }>(
    'INSERT INTO users (username, display_name, pin_hash, roles, created_at, updated_at) ' +
      "VALUES ($1, 'Rosa', $2, '{cashier}', now(), now()) RETURNING id",
    ['cashier.test', 'x'.repeat(60)],
  );
  return userRows[0]!.id;
}

async function countPayments(): Promise<number> {
  const result = await rows<{ count: number }>('SELECT count(*)::int AS count FROM payments');
  return result[0]!.count;
}

async function countPaymentKeys(key: string): Promise<number> {
  const result = await rows<{ count: number }>(
    "SELECT count(*)::int AS count FROM idempotency_keys WHERE scope = 'order_payment' AND key = $1",
    [key],
  );
  return result[0]!.count;
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
  service = createPaymentService({ models, now: () => new Date(NOW) });
});

describe('014: cobro transaccional sobre polleria_test', () => {
  it('AC-04: efectivo registra total/vuelto, cierra pedido y libera todas las mesas', async () => {
    const userId = await createCashierUser();
    const { orderId, tables } = await createPaymentOrderFixture(sequelize, userId);
    const bill = await service.getBill(orderId, { userId });
    const request: PaymentRequest = {
      method: 'cash',
      receivedCents: 3000,
      billToken: bill.billToken,
      confirmedReceived: true,
    };

    const response = await service.createPayment(orderId, request, 'cash-attempt-001', { userId });

    expect(createPaymentResponseSchema.parse(response)).toMatchObject({
      order: { id: orderId, status: 'closed', tables: [] },
      payment: {
        orderId,
        method: 'cash',
        amountCents: 2100,
        receivedCents: 3000,
        changeCents: 900,
        paidAt: NOW.toISOString(),
        snapshot: { bill: { tables: bill.tables }, amountCents: 2100, changeCents: 900 },
      },
    });
    expect(
      await rows<{ current_order_id: number | null }>(
        'SELECT current_order_id FROM tables WHERE id = ANY($1::int[]) ORDER BY id',
        [tables],
      ),
    ).toEqual(tables.map(() => ({ current_order_id: null })));
    expect(await countPayments()).toBe(1);
  });

  it.each(['yape', 'plin', 'card'] as const)(
    'AC-05: %s requiere confirmación y registra recibido exacto sin vuelto',
    async (method) => {
      const userId = await createCashierUser();
      const { orderId } = await createPaymentOrderFixture(sequelize, userId, { tableCount: 1 });
      const bill = await service.getBill(orderId, { userId });
      const response = await service.createPayment(
        orderId,
        {
          method,
          receivedCents: bill.totalCents,
          billToken: bill.billToken,
          confirmedReceived: true,
        },
        `electronic-${method}-001`,
        { userId },
      );

      expect(response.payment).toMatchObject({
        method,
        amountCents: bill.totalCents,
        receivedCents: bill.totalCents,
        changeCents: 0,
      });
      expect(await countPayments()).toBe(1);
    },
  );

  it('AC-06: rechaza recibido insuficiente, token vencido y anulación pendiente sin mutar', async () => {
    const userId = await createCashierUser();
    const { orderId, tables, itemId } = await createPaymentOrderFixture(sequelize, userId);
    const bill = await service.getBill(orderId, { userId });
    const underpaid: PaymentRequest = {
      method: 'cash',
      receivedCents: 2000,
      billToken: bill.billToken,
      confirmedReceived: true,
    };
    await expect(
      service.createPayment(orderId, underpaid, 'cash-insufficient-001', { userId }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_CASH', httpStatus: 422 });
    await expect(
      service.createPayment(
        orderId,
        { ...underpaid, receivedCents: 3000, billToken: '0'.repeat(64) },
        'cash-stale-token-001',
        { userId },
      ),
    ).rejects.toMatchObject({ code: 'BILL_CHANGED', httpStatus: 409 });

    await sequelize.query(
      "UPDATE order_items SET status = 'void_requested', void_requested_at = now(), " +
        'void_requested_by_user_id = $1, void_request_reason = $2 WHERE id = $3',
      { bind: [userId, 'El cliente pidió corregirlo', itemId] },
    );
    const pendingBill = await service.getBill(orderId, { userId });
    expect(pendingBill.canPay).toBe(false);
    await expect(
      service.createPayment(
        orderId,
        { ...underpaid, receivedCents: 3000, billToken: pendingBill.billToken },
        'cash-pending-void-001',
        { userId },
      ),
    ).rejects.toMatchObject({ code: 'PENDING_VOIDS', httpStatus: 409 });

    expect(await countPayments()).toBe(0);
    expect(
      await rows<{ status: string }>('SELECT status FROM orders WHERE id = $1', [orderId]),
    ).toEqual([{ status: 'open' }]);
    expect(
      await rows<{ current_order_id: number | null }>(
        'SELECT current_order_id FROM tables WHERE id = ANY($1::int[]) ORDER BY id',
        [tables],
      ),
    ).toEqual(tables.map(() => ({ current_order_id: orderId })));
  });

  it.each(['empty', 'zero', 'excess', 'closed', 'cancelled', 'merged'] as const)(
    'AC-06: rechaza cuenta %s sin cambiar pedido, mesas ni clave',
    async (state) => {
      const userId = await createCashierUser();
      const opened = await createPaymentOrderFixture(sequelize, userId, {
        tableCount: 1,
        itemPriceCents: state === 'zero' ? 0 : state === 'excess' ? 999999 : 2100,
        itemQuantity: state === 'excess' ? 99 : 1,
      });
      if (state === 'empty') {
        await sequelize.query('DELETE FROM order_items WHERE order_id = $1', {
          bind: [opened.orderId],
        });
      }
      if (state === 'excess') {
        // 22 líneas válidas de 99 × 999999 superan INTEGER sin violar constraints individuales.
        await sequelize.query(
          'INSERT INTO order_items (order_id, product_id, product_name, product_category, quantity, ' +
            'price_cents, status, kitchen_ticket_id, created_by_user_id, created_at, updated_at) ' +
            'SELECT order_id, product_id, product_name, product_category, quantity, price_cents, ' +
            'status, kitchen_ticket_id, created_by_user_id, now(), now() FROM order_items ' +
            'CROSS JOIN generate_series(1, 21) WHERE id = $1',
          { bind: [opened.itemId] },
        );
      }
      let token = (await service.getBill(opened.orderId, { userId })).billToken;
      const terminal = ['closed', 'cancelled', 'merged'].includes(state);
      if (terminal) {
        const target =
          state === 'merged'
            ? await createPaymentOrderFixture(sequelize, userId, { tableCount: 1 })
            : undefined;
        await sequelize.query(
          'UPDATE orders SET status = $1, closed_at = now(), closed_by_user_id = $2, ' +
            'cancel_reason = $3, merged_into_order_id = $4 WHERE id = $5',
          {
            bind: [
              state,
              userId,
              state === 'cancelled' ? 'Cancelado' : null,
              target?.orderId ?? null,
              opened.orderId,
            ],
          },
        );
      } else {
        const bill = await service.getBill(opened.orderId, { userId });
        expect(bill.canPay).toBe(false);
        if (state === 'excess') expect(bill.totalCents).toBeGreaterThan(2147483647);
        else expect(bill.totalCents).toBe(0);
        token = bill.billToken;
      }
      const beforeOrder = await models.Order.findByPk(opened.orderId, { raw: true });
      const beforeTables = await rows('SELECT * FROM tables ORDER BY id');
      const key = `not-payable-${state}-014`;
      await expect(
        service.createPayment(
          opened.orderId,
          {
            method: 'cash',
            receivedCents: 2147483647,
            billToken: token,
            confirmedReceived: true,
          },
          key,
          { userId },
        ),
      ).rejects.toMatchObject({
        code: terminal ? 'ORDER_NOT_OPEN' : 'ORDER_NOT_PAYABLE',
        httpStatus: 409,
      });
      expect(await countPayments()).toBe(0);
      expect(await countPaymentKeys(key)).toBe(0);
      expect(await models.Order.findByPk(opened.orderId, { raw: true })).toEqual(beforeOrder);
      expect(await rows('SELECT * FROM tables ORDER BY id')).toEqual(beforeTables);
    },
  );

  it('AC-11: snapshot conserva nombres, mesas y detalle al renombrar y reusar la mesa', async () => {
    const userId = await createCashierUser();
    const { orderId, tables, productId } = await createPaymentOrderFixture(sequelize, userId, {
      tableCount: 1,
    });
    const bill = await service.getBill(orderId, { userId });
    const response = await service.createPayment(
      orderId,
      {
        method: 'cash',
        receivedCents: bill.totalCents,
        billToken: bill.billToken,
        confirmedReceived: true,
      },
      'immutable-snapshot-001',
      { userId },
    );
    const paymentId = response.payment.id;

    await sequelize.query('UPDATE users SET display_name = $1 WHERE id = $2', {
      bind: ['Rosa Renombrada', userId],
    });
    await sequelize.query('UPDATE tables SET name = $1 WHERE id = $2', {
      bind: ['Mesa Reutilizada', tables[0]],
    });
    await sequelize.query('UPDATE products SET name = $1 WHERE id = $2', {
      bind: ['Gaseosa actualizada', productId],
    });
    const newOrder = await rows<{ id: number }>(
      'INSERT INTO orders (status, opened_by_user_id, opened_at, created_at, updated_at) ' +
        "VALUES ('open', $1, now(), now(), now()) RETURNING id",
      [userId],
    );
    await sequelize.query('UPDATE tables SET current_order_id = $1 WHERE id = $2', {
      bind: [newOrder[0]!.id, tables[0]],
    });

    const stored = await rows<{ snapshot: { bill: { tables: unknown[] }; cashier: unknown } }>(
      'SELECT snapshot FROM payments WHERE id = $1',
      [paymentId],
    );
    expect(stored[0]?.snapshot.bill.tables).toEqual(bill.tables);
    expect(stored[0]?.snapshot.cashier).toEqual({ id: userId, displayName: 'Rosa' });
    expect(response.payment.snapshot.bill.items).toEqual(bill.items);
  });

  it('AC-09: una inserción fallida revierte el cierre, las mesas y la clave idempotente', async () => {
    const userId = await createCashierUser();
    const { orderId, tables } = await createPaymentOrderFixture(sequelize, userId);
    const bill = await service.getBill(orderId, { userId });
    const request: PaymentRequest = {
      method: 'cash',
      receivedCents: 3000,
      billToken: bill.billToken,
      confirmedReceived: true,
    };
    vi.spyOn(models.Payment, 'create').mockRejectedValueOnce(
      new Error('fallo forzado de inserción'),
    );

    await expect(
      service.createPayment(orderId, request, 'rollback-insert-001', { userId }),
    ).rejects.toThrow('fallo forzado de inserción');
    expect(
      await rows<{ status: string }>('SELECT status FROM orders WHERE id = $1', [orderId]),
    ).toEqual([{ status: 'open' }]);
    expect(
      await rows<{ current_order_id: number | null }>(
        'SELECT current_order_id FROM tables WHERE id = ANY($1::int[]) ORDER BY id',
        [tables],
      ),
    ).toEqual(tables.map(() => ({ current_order_id: orderId })));
    expect(await countPayments()).toBe(0);
    vi.restoreAllMocks();
    await expect(
      service.createPayment(orderId, request, 'rollback-insert-001', { userId }),
    ).resolves.toMatchObject({ order: { status: 'closed' } });
  });

  it.each([
    [
      'order update',
      () => {
        vi.spyOn(models.Order.prototype, 'update').mockRejectedValueOnce(
          new Error('fallo forzado al cerrar pedido'),
        );
        return 'fallo forzado al cerrar pedido';
      },
    ],
    [
      'table release',
      () => {
        vi.spyOn(models.Table, 'update').mockRejectedValueOnce(
          new Error('fallo forzado al liberar mesas'),
        );
        return 'fallo forzado al liberar mesas';
      },
    ],
    [
      'idempotency response',
      () => {
        const query = sequelize.query.bind(sequelize);
        vi.spyOn(sequelize, 'query').mockImplementation(((sql: string, options?: unknown) => {
          if (sql.startsWith('UPDATE idempotency_keys SET response_status'))
            return Promise.reject(new Error('fallo forzado al guardar respuesta'));
          return query(sql, options as never);
        }) as typeof sequelize.query);
        return 'fallo forzado al guardar respuesta';
      },
    ],
  ])(
    'AC-09: %s fallido revierte todas las mutaciones y permite reintentar',
    async (_phase, installFailure) => {
      const userId = await createCashierUser();
      const { orderId, tables } = await createPaymentOrderFixture(sequelize, userId);
      const bill = await service.getBill(orderId, { userId });
      const request: PaymentRequest = {
        method: 'cash',
        receivedCents: 3000,
        billToken: bill.billToken,
        confirmedReceived: true,
      };
      const key = `rollback-${String(_phase).replaceAll(' ', '-')}-014`;
      const message = installFailure();

      await expect(service.createPayment(orderId, request, key, { userId })).rejects.toThrow(
        message,
      );
      expect(await countPayments()).toBe(0);
      expect(await countPaymentKeys(key)).toBe(0);
      expect(
        await rows<{ status: string }>('SELECT status FROM orders WHERE id = $1', [orderId]),
      ).toEqual([{ status: 'open' }]);
      expect(
        await rows<{ current_order_id: number | null }>(
          'SELECT current_order_id FROM tables WHERE id = ANY($1::int[]) ORDER BY id',
          [tables],
        ),
      ).toEqual(tables.map(() => ({ current_order_id: orderId })));

      vi.restoreAllMocks();
      await expect(service.createPayment(orderId, request, key, { userId })).resolves.toMatchObject(
        { order: { status: 'closed' } },
      );
      expect(await countPayments()).toBe(1);
      expect(await countPaymentKeys(key)).toBe(1);
    },
  );
});
