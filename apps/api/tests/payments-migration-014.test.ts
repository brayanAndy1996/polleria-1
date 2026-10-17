import path from 'node:path';
import { QueryTypes, Sequelize } from 'sequelize';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrateDown, migrateUp } from '../src/db/migrator.ts';
import {
  closeTestDatabase,
  connectTestDatabase,
  resetMigrationTables,
  tableExists,
} from './helpers/test-database.ts';

const PAYMENT_MIGRATION = '20261016120000-create-payments.ts';
const PRE_PAYMENT_MIGRATIONS = [
  '20261008120000-create-users.ts',
  '20261008120100-create-sessions.ts',
  '20261008180000-create-products.ts',
  '20261009120000-create-product-portions.ts',
  '20261009180000-create-combo-items.ts',
  '20261010120000-create-tables-orders.ts',
  '20261011120000-create-order-items.ts',
  '20261012150000-create-kitchen-ticket-prints.ts',
];
const PRE_PAYMENT_GLOB = path
  .join(import.meta.dirname, `../src/db/migrations/{${PRE_PAYMENT_MIGRATIONS.join(',')}}`)
  .split(path.sep)
  .join('/');
let sequelize: Sequelize;

async function rows<T extends object>(sql: string, bind?: unknown[]): Promise<T[]> {
  return sequelize.query<T>(sql, { type: QueryTypes.SELECT, bind });
}

async function insertUser(): Promise<number> {
  const result = await rows<{ id: number }>(
    'INSERT INTO users (username, display_name, pin_hash, roles, created_at, updated_at) ' +
      "VALUES ('cajera', 'Rosa', $1, '{cashier}', now(), now()) RETURNING id",
    ['x'.repeat(60)],
  );
  return result[0]!.id;
}

async function insertOrder(userId: number): Promise<number> {
  const result = await rows<{ id: number }>(
    'INSERT INTO orders (status, opened_by_user_id, opened_at, created_at, updated_at) ' +
      "VALUES ('open', $1, now(), now(), now()) RETURNING id",
    [userId],
  );
  return result[0]!.id;
}

async function insertPayment(
  orderId: number,
  userId: number,
  fields: {
    method?: string;
    amountCents?: number;
    receivedCents?: number;
    changeCents?: number;
    cashierUserId?: number;
    billToken?: string;
    snapshotVersion?: number;
    snapshot?: unknown;
  } = {},
): Promise<number> {
  const result = await rows<{ id: number }>(
    'INSERT INTO payments (order_id, method, amount_cents, received_cents, change_cents, ' +
      'cashier_user_id, paid_at, bill_token, snapshot_version, snapshot) ' +
      'VALUES ($1,$2,$3,$4,$5,$6,now(),$7,$8,$9::jsonb) RETURNING id',
    [
      orderId,
      fields.method ?? 'cash',
      fields.amountCents ?? 2100,
      fields.receivedCents ?? 3000,
      fields.changeCents ?? 900,
      fields.cashierUserId ?? userId,
      fields.billToken ?? 'a'.repeat(64),
      fields.snapshotVersion ?? 1,
      JSON.stringify(fields.snapshot ?? { version: 1 }),
    ],
  );
  return result[0]!.id;
}

beforeAll(async () => {
  sequelize = await connectTestDatabase();
});
afterAll(async () => {
  await closeTestDatabase(sequelize);
});
beforeEach(async () => {
  await resetMigrationTables(sequelize);
  await migrateUp(sequelize);
});

describe('014: migración de pagos sobre polleria_test', () => {
  it('AC-01: crea payments con importes, método, token y snapshot requeridos', async () => {
    expect(await tableExists(sequelize, 'payments')).toBe(true);
    const columns = await rows<{
      column_name: string;
      is_nullable: 'YES' | 'NO';
      data_type: string;
      character_maximum_length: number | null;
    }>(
      'SELECT column_name, is_nullable, data_type, character_maximum_length ' +
        'FROM information_schema.columns WHERE table_name = $1',
      ['payments'],
    );
    const byName = new Map(columns.map((column) => [column.column_name, column]));
    for (const name of [
      'id',
      'order_id',
      'method',
      'amount_cents',
      'received_cents',
      'change_cents',
      'cashier_user_id',
      'paid_at',
      'bill_token',
      'snapshot_version',
      'snapshot',
    ])
      expect(byName.has(name), `falta la columna ${name}`).toBe(true);
    for (const name of [
      'order_id',
      'method',
      'amount_cents',
      'received_cents',
      'change_cents',
      'cashier_user_id',
      'paid_at',
      'bill_token',
      'snapshot_version',
      'snapshot',
    ])
      expect(byName.get(name)?.is_nullable, `${name} debe ser NOT NULL`).toBe('NO');
    expect(byName.get('bill_token')?.character_maximum_length).toBe(64);

    const constraints = await rows<{ contype: string }>(
      'SELECT contype FROM pg_constraint WHERE conrelid = $1::regclass',
      ['payments'],
    );
    expect(constraints.filter(({ contype }) => contype === 'f')).toHaveLength(2);
    expect(constraints.some(({ contype }) => contype === 'u')).toBe(true);
    expect(constraints.some(({ contype }) => contype === 'p')).toBe(true);

    const indexes = await rows<{ indexdef: string }>(
      'SELECT indexdef FROM pg_indexes WHERE tablename = $1',
      ['payments'],
    );
    expect(indexes.some(({ indexdef }) => /\(paid_at, id\)/i.test(indexdef))).toBe(true);
  });

  it('AC-01: CHECKs rechazan método e importes imposibles y permiten un pago completo válido', async () => {
    const userId = await insertUser();
    const rejectedValues = [
      { method: 'transfer' },
      { amountCents: 0 },
      { amountCents: 2147483648 },
      { receivedCents: 2000 },
      { changeCents: 899 },
      { method: 'yape', receivedCents: 3000, changeCents: 900 },
      { billToken: 'A'.repeat(64) },
      { snapshotVersion: 2 },
      { snapshot: [] },
    ];
    for (const values of rejectedValues) {
      const orderId = await insertOrder(userId);
      await expect(insertPayment(orderId, userId, values)).rejects.toBeDefined();
    }

    const cashOrder = await insertOrder(userId);
    await expect(insertPayment(cashOrder, userId)).resolves.toBeTypeOf('number');
    const electronicOrder = await insertOrder(userId);
    await expect(
      insertPayment(electronicOrder, userId, {
        method: 'plin',
        amountCents: 2100,
        receivedCents: 2100,
        changeCents: 0,
      }),
    ).resolves.toBeTypeOf('number');
  });

  it('AC-01: order_id es único y las referencias de pedido/cajero son obligatorias', async () => {
    const userId = await insertUser();
    const orderId = await insertOrder(userId);
    await insertPayment(orderId, userId);
    await expect(insertPayment(orderId, userId)).rejects.toBeDefined();
    await expect(insertPayment(2147483647, userId)).rejects.toBeDefined();
    await expect(
      insertPayment(await insertOrder(userId), userId, { cashierUserId: 2147483647 }),
    ).rejects.toBeDefined();
  });

  it('AC-01: down retira payments y re-up la recrea sin alterar las tablas anteriores', async () => {
    const down = await migrateDown(sequelize);
    expect(down).toEqual([PAYMENT_MIGRATION]);
    expect(await tableExists(sequelize, 'payments')).toBe(false);
    expect(await tableExists(sequelize, 'orders')).toBe(true);

    expect(await migrateUp(sequelize)).toEqual([PAYMENT_MIGRATION]);
    expect(await tableExists(sequelize, 'payments')).toBe(true);
    const count = await rows<{ count: string }>('SELECT count(*)::text AS count FROM payments');
    expect(count[0]?.count).toBe('0');
  });

  it('AC-01: la migración no crea pagos retroactivos para pedidos cerrados históricos', async () => {
    await resetMigrationTables(sequelize);
    expect(await migrateUp(sequelize, { glob: PRE_PAYMENT_GLOB })).toEqual(PRE_PAYMENT_MIGRATIONS);
    const userId = await insertUser();
    const orderId = await insertOrder(userId);
    await sequelize.query(
      "UPDATE orders SET status = 'closed', closed_at = now(), closed_by_user_id = $1 WHERE id = $2",
      { bind: [userId, orderId] },
    );

    expect(await migrateUp(sequelize)).toEqual([PAYMENT_MIGRATION]);
    const count = await rows<{ count: string }>(
      'SELECT count(*)::text AS count FROM payments WHERE order_id = $1',
      [orderId],
    );
    expect(count[0]?.count).toBe('0');
  });
});
