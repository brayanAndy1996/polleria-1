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

const INVENTORY_MIGRATION = '20261017120000-create-inventory.ts';
const PRE_INVENTORY_MIGRATIONS = [
  '20261008120000-create-users.ts',
  '20261008120100-create-sessions.ts',
  '20261008180000-create-products.ts',
  '20261009120000-create-product-portions.ts',
  '20261009180000-create-combo-items.ts',
  '20261010120000-create-tables-orders.ts',
  '20261011120000-create-order-items.ts',
  '20261012150000-create-kitchen-ticket-prints.ts',
  '20261016120000-create-payments.ts',
];
const PRE_INVENTORY_GLOB = path
  .join(import.meta.dirname, `../src/db/migrations/{${PRE_INVENTORY_MIGRATIONS.join(',')}}`)
  .split(path.sep)
  .join('/');
let sequelize: Sequelize;

async function rows<T extends object>(sql: string, bind?: unknown[]): Promise<T[]> {
  return sequelize.query<T>(sql, { type: QueryTypes.SELECT, bind });
}

async function insertUser(): Promise<number> {
  const result = await rows<{ id: number }>(
    'INSERT INTO users (username, display_name, pin_hash, roles, created_at, updated_at) ' +
      "VALUES ('inventory.admin', 'Admin', $1, '{admin}', now(), now()) RETURNING id",
    ['x'.repeat(60)],
  );
  return result[0]!.id;
}

async function insertProduct(category: 'drink' | 'chicken' = 'drink'): Promise<number> {
  const result = await rows<{ id: number }>(
    'INSERT INTO products (name, category, price_cents, is_active, created_at, updated_at) ' +
      'VALUES ($1, $2, 100, true, now(), now()) RETURNING id',
    [`Inventory ${category} ${Date.now()} ${Math.random()}`, category],
  );
  return result[0]!.id;
}

async function insertMovement(
  userId: number,
  fields: Partial<{
    kind: 'breast' | 'leg' | 'drink';
    product_id: number | null;
    product_name: string | null;
    type: 'batch' | 'receipt' | 'adjustment' | 'consumption' | 'control';
    delta: number;
    quantity_after: number;
    enabled_after: boolean | null;
    reason: string;
    actor_user_id: number;
    actor_display_name: string;
    ticket_id: number | null;
  }> = {},
): Promise<void> {
  const defaults = {
    kind: 'breast',
    product_id: null,
    product_name: null,
    type: 'batch',
    delta: 4,
    quantity_after: 4,
    enabled_after: null,
    reason: 'Tanda',
    actor_user_id: userId,
    actor_display_name: 'Admin',
    ticket_id: null,
  };
  const movement = { ...defaults, ...fields };
  await sequelize.query(
    'INSERT INTO inventory_movements (kind, product_id, product_name, type, delta, quantity_after, ' +
      'enabled_after, reason, actor_user_id, actor_display_name, ticket_id, created_at) ' +
      'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())',
    {
      bind: [
        movement.kind,
        movement.product_id,
        movement.product_name,
        movement.type,
        movement.delta,
        movement.quantity_after,
        movement.enabled_after,
        movement.reason,
        movement.actor_user_id,
        movement.actor_display_name,
        movement.ticket_id,
      ],
    },
  );
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

describe('015: migración de inventario sobre polleria_test', () => {
  it('AC-01: crea tablas, defaults desactivados, constraints, FKs e índices de auditoría', async () => {
    for (const table of [
      'inventory_state',
      'inventory_drinks',
      'inventory_movements',
      'inventory_commands',
    ]) {
      expect(await tableExists(sequelize, table), `falta ${table}`).toBe(true);
    }

    const state = await rows<{
      id: number;
      chicken_enabled: boolean;
      breast_eighths: number;
      leg_eighths: number;
    }>('SELECT * FROM inventory_state');
    expect(state).toEqual([{ id: 1, chicken_enabled: false, breast_eighths: 0, leg_eighths: 0 }]);
    for (const table of ['inventory_drinks', 'inventory_movements', 'inventory_commands']) {
      const result = await rows<{ count: string }>(`SELECT count(*)::text AS count FROM ${table}`);
      expect(result[0]?.count).toBe('0');
    }

    const constraints = await rows<{ conname: string; contype: string; definition: string }>(
      'SELECT con.conname, con.contype, pg_get_constraintdef(con.oid) AS definition ' +
        'FROM pg_constraint con WHERE con.conrelid IN ' +
        "('inventory_state'::regclass, 'inventory_drinks'::regclass, 'inventory_movements'::regclass, 'inventory_commands'::regclass)",
    );
    expect(constraints.filter(({ contype }) => contype === 'p')).toHaveLength(4);
    expect(constraints.some(({ definition }) => /id = 1/.test(definition))).toBe(true);
    expect(constraints.some(({ definition }) => /breast_eighths.*>= 0/i.test(definition))).toBe(
      true,
    );
    expect(constraints.some(({ definition }) => /leg_eighths.*>= 0/i.test(definition))).toBe(true);
    expect(
      constraints.some(({ conname }) => conname === 'inventory_drinks_product_category_fkey'),
    ).toBe(true);
    expect(constraints.filter(({ contype }) => contype === 'f').length).toBeGreaterThanOrEqual(4);
    expect(
      constraints.some(
        ({ contype, definition }) => contype === 'c' && /response_status/i.test(definition),
      ),
    ).toBe(true);

    const indexes = await rows<{
      indexdef: string;
      indisunique: boolean;
      predicate: string | null;
      keyExpressions: string[];
    }>(
      `SELECT pg_get_indexdef(i.indexrelid) AS indexdef,
              i.indisunique,
              pg_get_expr(i.indpred, i.indrelid) AS predicate,
              ARRAY(
                SELECT pg_get_indexdef(i.indexrelid, position, true)
                FROM generate_series(1, i.indnkeyatts) AS position
                ORDER BY position
              ) AS "keyExpressions"
         FROM pg_index i
         JOIN pg_class table_class ON table_class.oid = i.indrelid
         JOIN pg_namespace namespace ON namespace.oid = table_class.relnamespace
        WHERE namespace.nspname = current_schema()
          AND table_class.relname = 'inventory_movements'`,
    );
    expect(
      indexes.some(({ indisunique, predicate, keyExpressions }) => {
        const normalizedKeys = keyExpressions.map((key) =>
          key.replaceAll('"', '').replaceAll(' ', '').toLowerCase(),
        );
        return (
          indisunique &&
          normalizedKeys[0] === 'ticket_id' &&
          normalizedKeys[1] === 'kind' &&
          normalizedKeys[2] === 'coalesce(product_id,0)' &&
          predicate !== null &&
          /\btype\b[\s\S]*?=\s*'consumption'/i.test(predicate)
        );
      }),
    ).toBe(true);
    expect(indexes.some(({ indexdef }) => /\(id\)/.test(indexdef))).toBe(true);
  });

  it('AC-01/02/03/07: SQL constraints reject invalid resource, movement, balance and command rows', async () => {
    const userId = await insertUser();
    const drinkId = await insertProduct('drink');
    const chickenId = await insertProduct('chicken');

    await expect(
      sequelize.query('INSERT INTO inventory_state (id) VALUES (2)'),
    ).rejects.toBeDefined();
    await expect(
      sequelize.query('UPDATE inventory_state SET breast_eighths = -1 WHERE id = 1'),
    ).rejects.toBeDefined();
    await expect(
      sequelize.query(
        'INSERT INTO inventory_drinks (product_id, product_category) VALUES ($1, $2)',
        {
          bind: [chickenId, 'chicken'],
        },
      ),
    ).rejects.toBeDefined();
    await expect(
      sequelize.query('INSERT INTO inventory_drinks (product_id, quantity) VALUES ($1, -1)', {
        bind: [drinkId],
      }),
    ).rejects.toBeDefined();
    await expect(insertMovement(userId, { delta: -4, quantity_after: 0 })).rejects.toBeDefined();
    await expect(insertMovement(userId, { type: 'receipt', kind: 'breast' })).rejects.toBeDefined();
    await expect(
      insertMovement(userId, {
        type: 'control',
        delta: 0,
        enabled_after: null,
      }),
    ).rejects.toBeDefined();
    await expect(
      insertMovement(userId, {
        kind: 'drink',
        product_id: drinkId,
        product_name: 'Inventory drink',
        type: 'receipt',
        delta: 2,
        quantity_after: 2,
      }),
    ).resolves.toBeUndefined();
    await expect(
      insertMovement(userId, { type: 'control', delta: 0, enabled_after: true }),
    ).resolves.toBeUndefined();
    await expect(
      sequelize.query(
        'INSERT INTO inventory_commands (key, request_hash, response_status, response_body, actor_user_id, created_at) ' +
          "VALUES ('bad-status', $1, 500, '{}'::jsonb, $2, now())",
        { bind: ['a'.repeat(64), userId] },
      ),
    ).rejects.toBeDefined();
    await expect(
      sequelize.query(
        'INSERT INTO inventory_commands (key, request_hash, response_status, response_body, actor_user_id, created_at) ' +
          "VALUES ('bad-response', $1, 201, '[]'::jsonb, $2, now())",
        { bind: ['b'.repeat(64), userId] },
      ),
    ).rejects.toBeDefined();

    for (const status of [0, 200, 201]) {
      await sequelize.query(
        'INSERT INTO inventory_commands (key, request_hash, response_status, response_body, actor_user_id, created_at) ' +
          "VALUES ($1,$2,$3,'{}'::jsonb,$4,now())",
        { bind: [`valid-status-${status}`, 'a'.repeat(64), status, userId] },
      );
    }

    await expect(insertMovement(userId)).resolves.toBeUndefined();
    await sequelize.query('INSERT INTO inventory_drinks (product_id) VALUES ($1)', {
      bind: [drinkId],
    });
    const commands = await rows<{ response_status: number }>(
      'SELECT response_status FROM inventory_commands ORDER BY response_status',
    );
    expect(commands.map(({ response_status }) => response_status)).toEqual([0, 200, 201]);
  });

  it('AC-01/12: product category cannot change once an inventory drink row exists', async () => {
    const drinkId = await insertProduct('drink');
    await sequelize.query('INSERT INTO inventory_drinks (product_id) VALUES ($1)', {
      bind: [drinkId],
    });
    await expect(
      sequelize.query("UPDATE products SET category = 'dish' WHERE id = $1", { bind: [drinkId] }),
    ).rejects.toBeDefined();
    await expect(
      sequelize.query('DELETE FROM products WHERE id = $1', { bind: [drinkId] }),
    ).rejects.toBeDefined();
  });

  it('AC-01: down elimina solo inventario y re-up recrea saldos limpios', async () => {
    const down = await migrateDown(sequelize);
    expect(down).toEqual([INVENTORY_MIGRATION]);
    for (const table of [
      'inventory_state',
      'inventory_drinks',
      'inventory_movements',
      'inventory_commands',
    ]) {
      expect(await tableExists(sequelize, table)).toBe(false);
    }
    expect(await tableExists(sequelize, 'products')).toBe(true);
    expect(await tableExists(sequelize, 'payments')).toBe(true);

    expect(await migrateUp(sequelize)).toEqual([INVENTORY_MIGRATION]);
    expect(await tableExists(sequelize, 'inventory_state')).toBe(true);
    const state = await rows<{
      chicken_enabled: boolean;
      breast_eighths: number;
      leg_eighths: number;
    }>('SELECT chicken_enabled, breast_eighths, leg_eighths FROM inventory_state WHERE id = 1');
    expect(state).toEqual([{ chicken_enabled: false, breast_eighths: 0, leg_eighths: 0 }]);
  });

  it('AC-01/09: applying inventory does not backfill historical products or orders', async () => {
    await resetMigrationTables(sequelize);
    expect(await migrateUp(sequelize, { glob: PRE_INVENTORY_GLOB })).toEqual(
      PRE_INVENTORY_MIGRATIONS,
    );
    const userId = await insertUser();
    const drinkId = await insertProduct('drink');
    await sequelize.query(
      'INSERT INTO orders (status, opened_by_user_id, opened_at, created_at, updated_at) ' +
        "VALUES ('open', $1, now(), now(), now())",
      { bind: [userId] },
    );
    expect(await migrateUp(sequelize)).toEqual([INVENTORY_MIGRATION]);
    const drinkRows = await rows<{ count: string }>(
      'SELECT count(*)::text AS count FROM inventory_drinks WHERE product_id = $1',
      [drinkId],
    );
    const movementRows = await rows<{ count: string }>(
      'SELECT count(*)::text AS count FROM inventory_movements',
    );
    expect(drinkRows[0]?.count).toBe('0');
    expect(movementRows[0]?.count).toBe('0');
  });
});
