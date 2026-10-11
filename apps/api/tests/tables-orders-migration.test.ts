// AC-03, AC-04 y AC-05. Spec 009 — archivo nuevo: va EN ROJO hasta que T-07 cree
// la migración 20261010120000-create-tables-orders.ts y el migrador la recoja.
import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrateDown, migrateUp } from '../src/db/migrator.ts';
import {
  closeTestDatabase,
  connectTestDatabase,
  resetMigrationTables,
  tableExists,
} from './helpers/test-database.ts';

const MIGRATIONS = [
  '20261008120000-create-users.ts',
  '20261008120100-create-sessions.ts',
  '20261008180000-create-products.ts',
  '20261009120000-create-product-portions.ts',
  '20261009180000-create-combo-items.ts',
  '20261010120000-create-tables-orders.ts',
  '20261011120000-create-order-items.ts',
];
const TABLES_ORDERS_MIGRATION = '20261010120000-create-tables-orders.ts';
const ORDER_ITEMS_MIGRATION = '20261011120000-create-order-items.ts';

// Marcas de tiempo fijas para las columnas que piden los CHECK de pares.
const T0 = '2026-10-10T15:00:00.000Z';
const T1 = '2026-10-10T16:00:00.000Z';

/**
 * Nombre del CHECK, la unicidad o la FK que reporta el driver pg en un error (mismo
 * criterio que en las pruebas de la 005, la 006 y la 007).
 */
function violatedConstraint(error: unknown): unknown {
  const fields = error as {
    parent?: { constraint?: unknown };
    original?: { constraint?: unknown };
  };
  return fields.parent?.constraint ?? fields.original?.constraint;
}

describe('009: tablas orders y tables con su migración sobre polleria_test', () => {
  let sequelize: Sequelize;
  beforeAll(async () => {
    sequelize = await connectTestDatabase();
  });
  beforeEach(async () => {
    // Partir de cero y aplicar las migraciones reales: orders y tables quedan creadas.
    await resetMigrationTables(sequelize);
    await migrateUp(sequelize);
  });
  afterAll(async () => {
    await closeTestDatabase(sequelize);
  });
  const rows = <T extends object>(sql: string, bind?: (string | number | null)[]) =>
    sequelize.query<T>(sql, { type: QueryTypes.SELECT, bind });
  const columnsOf = (table: string) =>
    rows<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      character_maximum_length: number | null;
      column_default: string | null;
      is_identity: string;
    }>(
      'SELECT column_name, data_type, is_nullable, character_maximum_length, column_default, is_identity FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position',
      [table],
    );
  const primaryKeyColumns = (table: string) =>
    rows<{ column_name: string }>(
      `SELECT kcu.column_name FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name AND tc.constraint_schema = kcu.constraint_schema
       WHERE tc.table_schema = current_schema() AND tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'`,
      [table],
    );
  const constraintsOf = (table: string) =>
    rows<{ conname: string; contype: string }>(
      `SELECT conname, contype FROM pg_constraint
       WHERE conrelid = $1::regclass ORDER BY conname`,
      [table],
    );
  const indexesOf = (table: string) =>
    rows<{ indexname: string; indexdef: string }>(
      'SELECT indexname, indexdef FROM pg_indexes WHERE tablename = $1 AND schemaname = current_schema()',
      [table],
    );
  const insertUser = (username: string, displayName = 'Juan') =>
    sequelize
      .query<{ id: number }>(
        "INSERT INTO users (username, display_name, pin_hash, roles) VALUES ($1, $2, $3, '{waiter}') RETURNING id",
        { type: QueryTypes.SELECT, bind: [username, displayName, 'x'.repeat(60)] },
      )
      .then((result) => result[0]?.id ?? -1);
  /** INSERT en orders con defaults coherentes para un pedido 'open'. */
  const insertOrder = (
    fields: {
      status?: string;
      openedBy?: number;
      readyAt?: string | null;
      readyBy?: number | null;
      billAt?: string | null;
      billBy?: number | null;
      closedAt?: string | null;
      closedBy?: number | null;
      cancelReason?: string | null;
      mergedInto?: number | null;
    } = {},
  ) =>
    sequelize
      .query<{ id: number }>(
        'INSERT INTO "orders" (status, opened_by_user_id, opened_at, ready_at, ready_by_user_id, ' +
          'bill_requested_at, bill_requested_by_user_id, closed_at, closed_by_user_id, ' +
          'cancel_reason, merged_into_order_id) ' +
          'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id',
        {
          type: QueryTypes.SELECT,
          bind: [
            fields.status ?? 'open',
            fields.openedBy ?? 1,
            T0,
            fields.readyAt ?? null,
            fields.readyBy ?? null,
            fields.billAt ?? null,
            fields.billBy ?? null,
            fields.closedAt ?? null,
            fields.closedBy ?? null,
            fields.cancelReason ?? null,
            fields.mergedInto ?? null,
          ],
        },
      )
      .then((result) => result[0]?.id ?? -1);
  const insertTable = (
    name: string,
    fields: { isActive?: boolean; currentOrderId?: number | null } = {},
  ) =>
    sequelize
      .query<{ id: number }>(
        'INSERT INTO "tables" (name, is_active, current_order_id) VALUES ($1, $2, $3) RETURNING id',
        {
          type: QueryTypes.SELECT,
          bind: [name, fields.isActive ?? true, fields.currentOrderId ?? null],
        },
      )
      .then((result) => result[0]?.id ?? -1);
  const orderCount = () => rows<{ id: number }>('SELECT id FROM "orders"');
  const tableCount = () => rows<{ id: number }>('SELECT id FROM "tables"');

  it('AC-04: orders tiene las columnas, tipos, nulos y valores por defecto de la spec', async () => {
    const columns = await columnsOf('orders');
    expect(columns.map((column) => column.column_name)).toEqual([
      'id',
      'status',
      'opened_by_user_id',
      'opened_at',
      'ready_at',
      'ready_by_user_id',
      'bill_requested_at',
      'bill_requested_by_user_id',
      'closed_at',
      'closed_by_user_id',
      'cancel_reason',
      'merged_into_order_id',
      'created_at',
      'updated_at',
    ]);
    expect(
      columns.map(({ column_name, data_type, character_maximum_length }) => ({
        column_name,
        data_type,
        character_maximum_length,
      })),
    ).toEqual([
      { column_name: 'id', data_type: 'integer', character_maximum_length: null },
      { column_name: 'status', data_type: 'character varying', character_maximum_length: 16 },
      { column_name: 'opened_by_user_id', data_type: 'integer', character_maximum_length: null },
      {
        column_name: 'opened_at',
        data_type: 'timestamp with time zone',
        character_maximum_length: null,
      },
      {
        column_name: 'ready_at',
        data_type: 'timestamp with time zone',
        character_maximum_length: null,
      },
      { column_name: 'ready_by_user_id', data_type: 'integer', character_maximum_length: null },
      {
        column_name: 'bill_requested_at',
        data_type: 'timestamp with time zone',
        character_maximum_length: null,
      },
      {
        column_name: 'bill_requested_by_user_id',
        data_type: 'integer',
        character_maximum_length: null,
      },
      {
        column_name: 'closed_at',
        data_type: 'timestamp with time zone',
        character_maximum_length: null,
      },
      {
        column_name: 'closed_by_user_id',
        data_type: 'integer',
        character_maximum_length: null,
      },
      {
        column_name: 'cancel_reason',
        data_type: 'character varying',
        character_maximum_length: 200,
      },
      {
        column_name: 'merged_into_order_id',
        data_type: 'integer',
        character_maximum_length: null,
      },
      {
        column_name: 'created_at',
        data_type: 'timestamp with time zone',
        character_maximum_length: null,
      },
      {
        column_name: 'updated_at',
        data_type: 'timestamp with time zone',
        character_maximum_length: null,
      },
    ]);
    // NOT NULL salvo las seis señales de fecha+autor, el motivo y el destino del merge.
    const nullable = new Set([
      'ready_at',
      'ready_by_user_id',
      'bill_requested_at',
      'bill_requested_by_user_id',
      'closed_at',
      'closed_by_user_id',
      'cancel_reason',
      'merged_into_order_id',
    ]);
    for (const column of columns) {
      expect(column.is_nullable).toBe(nullable.has(column.column_name) ? 'YES' : 'NO');
    }
    // Valores por defecto de la spec: status 'open' y las tres fechas con now().
    expect(columns.find((column) => column.column_name === 'status')?.column_default).toContain(
      'open',
    );
    for (const name of ['opened_at', 'created_at', 'updated_at'])
      expect(columns.find((column) => column.column_name === name)?.column_default).not.toBeNull();
    // id es la clave primaria autoincremental (SERIAL o IDENTITY).
    expect(await primaryKeyColumns('orders')).toEqual([{ column_name: 'id' }]);
    const idColumn = columns.find((column) => column.column_name === 'id')!;
    expect(idColumn.is_identity === 'YES' || /^nextval\(/.test(idColumn.column_default ?? '')).toBe(
      true,
    );
    // El índice por opened_by_user_id (ventas por mozo, spec §8.1) existe y no es único.
    const index = (await indexesOf('orders')).find(
      (row) => row.indexname === 'orders_opened_by_user_id',
    );
    expect(index).toBeDefined();
    expect(index?.indexdef).not.toContain('UNIQUE');
    expect(index?.indexdef).toMatch(/\(opened_by_user_id\)/);
    // Un pedido 'open' mínimo cabe en la tabla.
    const userId = await insertUser('mozo.migra');
    await insertOrder({ openedBy: userId });
    expect(await orderCount()).toEqual([{ id: 1 }]);
  });

  it('AC-04: orders referencia users.id en sus cuatro autores y a sí misma en merged_into', async () => {
    // Cinco FK: las cuatro *_by_user_id hacia users y la auto-referencia merged_into.
    const foreignKeys = await rows<{ target: string }>(
      `SELECT confrelid::regclass::text AS target FROM pg_constraint
       WHERE conrelid = 'orders'::regclass AND contype = 'f'`,
    );
    expect(foreignKeys.map((row) => row.target).sort()).toEqual([
      'orders',
      'users',
      'users',
      'users',
      'users',
    ]);
    const userId = await insertUser('mozo.migra');
    // Cada autor con un usuario inexistente falla por la FK.
    await expect(insertOrder({ openedBy: 999999 })).rejects.toBeInstanceOf(Error);
    await expect(
      insertOrder({ openedBy: userId, readyAt: T1, readyBy: 999999 }),
    ).rejects.toBeInstanceOf(Error);
    await expect(
      insertOrder({ openedBy: userId, billAt: T1, billBy: 999999 }),
    ).rejects.toBeInstanceOf(Error);
    await expect(
      insertOrder({ status: 'closed', openedBy: userId, closedAt: T1, closedBy: 999999 }),
    ).rejects.toBeInstanceOf(Error);
    // merged_into hacia un pedido inexistente también es FK.
    await expect(
      insertOrder({
        status: 'merged',
        openedBy: userId,
        closedAt: T1,
        closedBy: userId,
        mergedInto: 999999,
      }),
    ).rejects.toBeInstanceOf(Error);
    // Los autores existentes pasan, incluida la auto-referencia a otro pedido.
    const first = await insertOrder({ openedBy: userId });
    await insertOrder({ openedBy: userId, readyAt: T1, readyBy: userId });
    await insertOrder({ openedBy: userId, billAt: T1, billBy: userId });
    await insertOrder({ status: 'closed', openedBy: userId, closedAt: T1, closedBy: userId });
    await insertOrder({
      status: 'merged',
      openedBy: userId,
      closedAt: T1,
      closedBy: userId,
      mergedInto: first,
    });
    expect(await orderCount()).toHaveLength(5);
  });

  it('AC-04: orders_status_allowed acepta los cuatro estados y rechaza los demás', async () => {
    const constraints = await constraintsOf('orders');
    expect(constraints).toContainEqual({ conname: 'orders_status_allowed', contype: 'c' });
    const userId = await insertUser('mozo.migra');
    const first = await insertOrder({ openedBy: userId });
    // Los cuatro estados de la spec entran con sus columnas coherentes.
    await insertOrder({ status: 'closed', openedBy: userId, closedAt: T1, closedBy: userId });
    await insertOrder({
      status: 'cancelled',
      openedBy: userId,
      closedAt: T1,
      closedBy: userId,
      cancelReason: 'Se sentaron por error',
    });
    await insertOrder({
      status: 'merged',
      openedBy: userId,
      closedAt: T1,
      closedBy: userId,
      mergedInto: first,
    });
    // Con el par de cierre coherente, el único CHECK que puede fallar es el de estado.
    for (const status of ['abierto', 'OPEN', '']) {
      const error = await insertOrder({
        status,
        openedBy: userId,
        closedAt: T1,
        closedBy: userId,
      }).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(Error);
      expect(violatedConstraint(error)).toBe('orders_status_allowed');
    }
    expect(await orderCount()).toHaveLength(4);
  });

  it('AC-04: orders_closed_consistent exige el cierre completo solo en no-abiertos', async () => {
    const constraints = await constraintsOf('orders');
    expect(constraints).toContainEqual({ conname: 'orders_closed_consistent', contype: 'c' });
    const userId = await insertUser('mozo.migra');
    // 'open' con cualquier rastro de cierre falla.
    for (const fields of [
      { closedAt: T1 },
      { closedBy: userId },
      { closedAt: T1, closedBy: userId },
    ]) {
      const error = await insertOrder({ openedBy: userId, ...fields }).catch(
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(Error);
      expect(violatedConstraint(error)).toBe('orders_closed_consistent');
    }
    // 'closed' sin el par completo (falta fecha, falta autor o faltan ambos) falla.
    for (const fields of [{ closedAt: T1 }, { closedBy: userId }, {}]) {
      const error = await insertOrder({ status: 'closed', openedBy: userId, ...fields }).catch(
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(Error);
      expect(violatedConstraint(error)).toBe('orders_closed_consistent');
    }
    // Los pares coherentes pasan: 'open' sin cierre y 'closed' con ambos.
    await insertOrder({ openedBy: userId });
    await insertOrder({ status: 'closed', openedBy: userId, closedAt: T1, closedBy: userId });
    expect(await orderCount()).toHaveLength(2);
  });

  it('AC-04: orders_cancel_reason exige el motivo solo en cancelados', async () => {
    const constraints = await constraintsOf('orders');
    expect(constraints).toContainEqual({ conname: 'orders_cancel_reason', contype: 'c' });
    const userId = await insertUser('mozo.migra');
    // 'cancelled' sin motivo falla.
    const noReason = await insertOrder({
      status: 'cancelled',
      openedBy: userId,
      closedAt: T1,
      closedBy: userId,
    }).catch((caught: unknown) => caught);
    expect(noReason).toBeInstanceOf(Error);
    expect(violatedConstraint(noReason)).toBe('orders_cancel_reason');
    // Un motivo en un pedido que no está cancelado también falla.
    for (const status of ['open', 'closed']) {
      const error = await insertOrder({
        status,
        openedBy: userId,
        closedAt: status === 'closed' ? T1 : null,
        closedBy: status === 'closed' ? userId : null,
        cancelReason: 'motivo fuera de lugar',
      }).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(Error);
      expect(violatedConstraint(error)).toBe('orders_cancel_reason');
    }
    // 'cancelled' con motivo pasa.
    await insertOrder({
      status: 'cancelled',
      openedBy: userId,
      closedAt: T1,
      closedBy: userId,
      cancelReason: 'Se sentaron por error',
    });
    await insertOrder({ openedBy: userId });
    expect(await orderCount()).toHaveLength(2);
  });

  it('AC-04: orders_merged_consistent y orders_no_self_merge piden destino ajeno solo en fusionados', async () => {
    const constraints = await constraintsOf('orders');
    expect(constraints).toContainEqual({ conname: 'orders_merged_consistent', contype: 'c' });
    expect(constraints).toContainEqual({ conname: 'orders_no_self_merge', contype: 'c' });
    const userId = await insertUser('mozo.migra');
    const first = await insertOrder({ openedBy: userId });
    // 'merged' sin destino y 'open' con destino fallan por la consistencia.
    const sinDestino = await insertOrder({
      status: 'merged',
      openedBy: userId,
      closedAt: T1,
      closedBy: userId,
    }).catch((caught: unknown) => caught);
    expect(sinDestino).toBeInstanceOf(Error);
    expect(violatedConstraint(sinDestino)).toBe('orders_merged_consistent');
    const abiertoConDestino = await insertOrder({ openedBy: userId, mergedInto: first }).catch(
      (caught: unknown) => caught,
    );
    expect(abiertoConDestino).toBeInstanceOf(Error);
    expect(violatedConstraint(abiertoConDestino)).toBe('orders_merged_consistent');
    // Apuntarse a sí mismo falla por no_self_merge (el resto queda coherente).
    const second = await insertOrder({ openedBy: userId });
    const selfMerge = await sequelize
      .query(
        'UPDATE "orders" SET status = $1, closed_at = $2, closed_by_user_id = $3, ' +
          'merged_into_order_id = id WHERE id = $4',
        { bind: ['merged', T1, userId, second] },
      )
      .catch((caught: unknown) => caught);
    expect(selfMerge).toBeInstanceOf(Error);
    expect(violatedConstraint(selfMerge)).toBe('orders_no_self_merge');
    // 'merged' apuntando a otro pedido pasa.
    await insertOrder({
      status: 'merged',
      openedBy: userId,
      closedAt: T1,
      closedBy: userId,
      mergedInto: first,
    });
    expect(await orderCount()).toHaveLength(3);
  });

  it('AC-04: orders_ready_pair y orders_bill_pair exigen fecha y autor juntos o ninguno', async () => {
    const constraints = await constraintsOf('orders');
    expect(constraints).toContainEqual({ conname: 'orders_ready_pair', contype: 'c' });
    expect(constraints).toContainEqual({ conname: 'orders_bill_pair', contype: 'c' });
    const userId = await insertUser('mozo.migra');
    // La fecha sin autor o el autor sin fecha fallan, en los dos pares.
    for (const fields of [{ readyAt: T1 }, { readyBy: userId }]) {
      const error = await insertOrder({ openedBy: userId, ...fields }).catch(
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(Error);
      expect(violatedConstraint(error)).toBe('orders_ready_pair');
    }
    for (const fields of [{ billAt: T1 }, { billBy: userId }]) {
      const error = await insertOrder({ openedBy: userId, ...fields }).catch(
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(Error);
      expect(violatedConstraint(error)).toBe('orders_bill_pair');
    }
    // Ambos NULL, un par puesto o los dos pares puestos pasan.
    await insertOrder({ openedBy: userId });
    await insertOrder({ openedBy: userId, readyAt: T1, readyBy: userId });
    await insertOrder({ openedBy: userId, billAt: T1, billBy: userId });
    await insertOrder({
      openedBy: userId,
      readyAt: T1,
      readyBy: userId,
      billAt: T1,
      billBy: userId,
    });
    expect(await orderCount()).toHaveLength(4);
  });

  it('AC-03: tables tiene las columnas, tipos, nulos y valores por defecto de la spec', async () => {
    const columns = await columnsOf('tables');
    expect(columns.map((column) => column.column_name)).toEqual([
      'id',
      'name',
      'is_active',
      'current_order_id',
      'created_at',
      'updated_at',
    ]);
    expect(
      columns.map(({ column_name, data_type, character_maximum_length }) => ({
        column_name,
        data_type,
        character_maximum_length,
      })),
    ).toEqual([
      { column_name: 'id', data_type: 'integer', character_maximum_length: null },
      { column_name: 'name', data_type: 'character varying', character_maximum_length: 40 },
      { column_name: 'is_active', data_type: 'boolean', character_maximum_length: null },
      { column_name: 'current_order_id', data_type: 'integer', character_maximum_length: null },
      {
        column_name: 'created_at',
        data_type: 'timestamp with time zone',
        character_maximum_length: null,
      },
      {
        column_name: 'updated_at',
        data_type: 'timestamp with time zone',
        character_maximum_length: null,
      },
    ]);
    // Solo current_order_id admite NULL (mesa libre); is_active nace en true.
    for (const column of columns) {
      expect(column.is_nullable).toBe(column.column_name === 'current_order_id' ? 'YES' : 'NO');
    }
    expect(columns.find((column) => column.column_name === 'is_active')?.column_default).toBe(
      'true',
    );
    for (const name of ['created_at', 'updated_at'])
      expect(columns.find((column) => column.column_name === name)?.column_default).not.toBeNull();
    // id es la clave primaria autoincremental (SERIAL o IDENTITY).
    expect(await primaryKeyColumns('tables')).toEqual([{ column_name: 'id' }]);
    const idColumn = columns.find((column) => column.column_name === 'id')!;
    expect(idColumn.is_identity === 'YES' || /^nextval\(/.test(idColumn.column_default ?? '')).toBe(
      true,
    );
    await insertTable('Mesa 1');
    expect(await tableCount()).toEqual([{ id: 1 }]);
  });

  it('AC-03: tables_name_valid rechaza nombres sin forma y tables_name_unique ignora mayúsculas', async () => {
    const constraints = await constraintsOf('tables');
    expect(constraints).toContainEqual({ conname: 'tables_name_valid', contype: 'c' });
    // Vacío, solo espacios y bordes con espacio fallan por el CHECK de forma.
    for (const name of ['', '  ', ' x']) {
      const error = await insertTable(name).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(Error);
      expect(violatedConstraint(error)).toBe('tables_name_valid');
    }
    // El índice único por lower(name) existe: 'Mesa 1', 'mesa 1' y 'MESA 1' chocan.
    const unique = (await indexesOf('tables')).find(
      (row) => row.indexname === 'tables_name_unique',
    );
    expect(unique).toBeDefined();
    expect(unique?.indexdef).toContain('UNIQUE');
    expect(unique?.indexdef).toMatch(/lower\(\(?name/);
    await insertTable('Mesa 1');
    for (const name of ['mesa 1', 'MESA 1']) {
      const error = await insertTable(name).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(Error);
      expect(violatedConstraint(error)).toBe('tables_name_unique');
    }
    await insertTable('Mesa 2');
    expect(await tableCount()).toHaveLength(2);
  });

  it('AC-03: current_order_id referencia orders.id y tiene su índice parcial', async () => {
    // La única FK de tables apunta a orders.
    const foreignKeys = await rows<{ target: string }>(
      `SELECT confrelid::regclass::text AS target FROM pg_constraint
       WHERE conrelid = 'tables'::regclass AND contype = 'f'`,
    );
    expect(foreignKeys).toEqual([{ target: 'orders' }]);
    // El índice parcial sobre current_order_id de la spec §8.2 existe.
    const index = (await indexesOf('tables')).find(
      (row) => row.indexname === 'tables_current_order_id',
    );
    expect(index).toBeDefined();
    expect(index?.indexdef).not.toContain('UNIQUE');
    expect(index?.indexdef).toMatch(/\(current_order_id\)/);
    expect(index?.indexdef).toMatch(/WHERE/i);
    expect(index?.indexdef).toMatch(/current_order_id IS NOT NULL/);
    // Un puntero a un pedido inexistente falla por la FK; NULL y uno real pasan.
    await expect(insertTable('Mesa 1', { currentOrderId: 999999 })).rejects.toBeInstanceOf(Error);
    await insertTable('Mesa 1');
    const userId = await insertUser('mozo.migra');
    const orderId = await insertOrder({ openedBy: userId });
    await insertTable('Mesa 2', { currentOrderId: orderId });
    await insertTable('Mesa 3', { currentOrderId: orderId });
    expect(await tableCount()).toHaveLength(3);
  });

  it('AC-05: aplica, revierte y reaplica la migración dentro de la lista completa', async () => {
    await resetMigrationTables(sequelize);
    expect(await migrateUp(sequelize)).toEqual(MIGRATIONS);
    for (const table of [
      'users',
      'sessions',
      'products',
      'product_portions',
      'combo_items',
      'orders',
      'tables',
    ])
      expect(await tableExists(sequelize, table)).toBe(true);

    // La última aplicada es la de la spec 010: revierte primero ella, luego la
    // de la 009, que es la que interesa a esta prueba.
    expect(await migrateDown(sequelize)).toEqual([ORDER_ITEMS_MIGRATION]);
    expect(await tableExists(sequelize, 'order_items')).toBe(false);
    expect(await tableExists(sequelize, 'kitchen_tickets')).toBe(false);
    expect(await tableExists(sequelize, 'tables')).toBe(true);
    expect(await migrateDown(sequelize)).toEqual([TABLES_ORDERS_MIGRATION]);
    expect(await tableExists(sequelize, 'tables')).toBe(false);
    expect(await tableExists(sequelize, 'orders')).toBe(false);
    expect(await tableExists(sequelize, 'combo_items')).toBe(true);
    expect(await tableExists(sequelize, 'users')).toBe(true);

    // La migración es reaplicable tras revertir y las tablas vuelven a funcionar.
    expect(await migrateUp(sequelize)).toEqual([TABLES_ORDERS_MIGRATION, ORDER_ITEMS_MIGRATION]);
    expect(await tableExists(sequelize, 'orders')).toBe(true);
    expect(await tableExists(sequelize, 'tables')).toBe(true);
    const userId = await insertUser('mozo.migra');
    const orderId = await insertOrder({ openedBy: userId });
    await insertTable('Mesa 1', { currentOrderId: orderId });
    expect(await tableCount()).toEqual([{ id: 1 }]);
  });
});
