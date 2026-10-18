import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Sequelize } from 'sequelize';
import { migrateDown, migrateUp } from '../src/db/migrator.ts';
import {
  connectTestDatabase,
  closeTestDatabase,
  resetMigrationTables,
  tableExists,
} from './helpers/test-database.ts';
import { PRINT_MIGRATION, seedPrinting, sqlRows } from './helpers/kitchen-printing-data.ts';

let sequelize: Sequelize;
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

describe('013: migración durable de generación file en polleria_test', () => {
  it('AC-03: crea ambas tablas con columnas, FK e índices de despacho e historial', async () => {
    expect(await tableExists(sequelize, 'kitchen_ticket_prints')).toBe(true);
    expect(await tableExists(sequelize, 'kitchen_ticket_print_attempts')).toBe(true);
    const columns = await sqlRows<{
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>(
      sequelize,
      "SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns WHERE table_name IN ('kitchen_ticket_prints','kitchen_ticket_print_attempts')",
    );
    const snapshot = columns.filter((column) => column.table_name === 'kitchen_ticket_prints');
    expect(snapshot.map((column) => column.column_name).sort()).toEqual([
      'created_at',
      'snapshot',
      'snapshot_version',
      'ticket_id',
    ]);
    expect(snapshot.find((column) => column.column_name === 'snapshot')).toMatchObject({
      data_type: 'jsonb',
      is_nullable: 'NO',
    });
    for (const field of [
      'ticket_id',
      'copy_number',
      'status',
      'requested_by_user_id',
      'requested_by_name',
      'reason',
      'idempotency_key',
      'request_hash',
      'response_body',
      'documents',
      'output_directory_hash',
      'owner_host',
      'owner_pid',
      'owner_execution_id',
      'completed_pages',
      'error_code',
      'created_at',
      'started_at',
      'finished_at',
    ]) {
      expect(
        columns
          .filter((column) => column.table_name === 'kitchen_ticket_print_attempts')
          .map((column) => column.column_name),
      ).toContain(field);
    }
    const fk = await sqlRows<{ definition: string }>(
      sequelize,
      "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid IN ('kitchen_ticket_prints'::regclass,'kitchen_ticket_print_attempts'::regclass) AND contype='f'",
    );
    expect(fk.map((row) => row.definition).join('\n')).toMatch(/REFERENCES kitchen_tickets/);
    expect(fk.map((row) => row.definition).join('\n')).toMatch(/REFERENCES kitchen_ticket_prints/);
    expect(fk.map((row) => row.definition).join('\n')).toMatch(/REFERENCES users/);
    expect(fk.map((row) => row.definition).join('\n')).not.toMatch(/ON DELETE CASCADE/);
    const indexes = await sqlRows<{ indexdef: string }>(
      sequelize,
      "SELECT indexdef FROM pg_indexes WHERE tablename='kitchen_ticket_print_attempts'",
    );
    const definitions = indexes.map((row) => row.indexdef).join('\n');
    expect(definitions).toMatch(/ticket_id, id DESC/);
    expect(definitions).toMatch(/WHERE.*queued/);
    expect(definitions).toMatch(/UNIQUE.*idempotency_key/);
    expect(definitions).toMatch(/UNIQUE.*ticket_id.*WHERE.*finished_at IS NULL/);
  });

  it('AC-09: down/up conserva las comandas antiguas y no crea snapshots ni intentos históricos', async () => {
    expect(await tableExists(sequelize, 'kitchen_ticket_prints')).toBe(true);
    const seed = await seedPrinting(sequelize);
    const old = await seed.models.KitchenTicket.create({
      orderId: seed.order.id,
      kind: 'initial',
      createdByUserId: seed.waiter.id,
    });
    expect(await tableExists(sequelize, 'payments')).toBe(true);
    expect(await migrateDown(sequelize)).toEqual(['20261017120000-create-inventory.ts']);
    expect(await tableExists(sequelize, 'inventory_state')).toBe(false);
    expect(await tableExists(sequelize, 'payments')).toBe(true);
    expect(await migrateDown(sequelize)).toEqual(['20261016120000-create-payments.ts']);
    expect(await tableExists(sequelize, 'payments')).toBe(false);
    expect(await migrateDown(sequelize)).toEqual([PRINT_MIGRATION]);
    expect(await seed.models.KitchenTicket.count()).toBe(1);
    expect(await migrateUp(sequelize)).toEqual([
      PRINT_MIGRATION,
      '20261016120000-create-payments.ts',
      '20261017120000-create-inventory.ts',
    ]);
    expect(await tableExists(sequelize, 'payments')).toBe(true);
    expect(await sqlRows(sequelize, 'SELECT * FROM kitchen_ticket_prints')).toEqual([]);
    expect(await sqlRows(sequelize, 'SELECT * FROM kitchen_ticket_print_attempts')).toEqual([]);
    expect((await seed.models.KitchenTicket.findByPk(old.id))?.orderId).toBe(seed.order.id);
  });

  it.each([
    ['snapshot_version', 'UPDATE kitchen_ticket_prints SET snapshot_version=2'],
    ['status', "UPDATE kitchen_ticket_print_attempts SET status='not_tracked'"],
    ['copy_number', 'UPDATE kitchen_ticket_print_attempts SET copy_number=-1'],
    ['reason inicial', "UPDATE kitchen_ticket_print_attempts SET reason='copia'"],
    ['par clave/hash', "UPDATE kitchen_ticket_print_attempts SET idempotency_key='k'"],
    ['pages negativos', 'UPDATE kitchen_ticket_print_attempts SET completed_pages=-1'],
    ['queued iniciado', 'UPDATE kitchen_ticket_print_attempts SET started_at=now()'],
    ['printing sin inicio', "UPDATE kitchen_ticket_print_attempts SET status='printing'"],
    ['succeeded sin fin', "UPDATE kitchen_ticket_print_attempts SET status='succeeded'"],
    ['failed sin fin', "UPDATE kitchen_ticket_print_attempts SET status='failed'"],
    ['owner incompleto', "UPDATE kitchen_ticket_print_attempts SET owner_host='localhost'"],
    ['FK actor', 'UPDATE kitchen_ticket_print_attempts SET requested_by_user_id=2147483647'],
  ])('AC-03: PostgreSQL rechaza %s aun en escritura directa', async (_name, sql) => {
    expect(await tableExists(sequelize, 'kitchen_ticket_prints')).toBe(true);
    const seed = await seedPrinting(sequelize);
    const ticket = await seed.models.KitchenTicket.create({
      orderId: seed.order.id,
      kind: 'initial',
      createdByUserId: seed.waiter.id,
    });
    await sequelize.query(
      "INSERT INTO kitchen_ticket_prints(ticket_id,snapshot_version,snapshot,created_at) VALUES(:id,1,'{}',now())",
      { replacements: { id: ticket.id } },
    );
    await sequelize.query(
      "INSERT INTO kitchen_ticket_print_attempts(ticket_id,copy_number,status,requested_by_user_id,requested_by_name,completed_pages,created_at) VALUES(:ticket,0,'queued',:user,'Juan',0,now())",
      { replacements: { ticket: ticket.id, user: seed.waiter.id } },
    );
    const rejection = await sequelize.query(sql).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(rejection).toBeDefined();
    if (typeof rejection !== 'object' || rejection === null || !('parent' in rejection)) {
      throw new Error('La escritura inválida no devolvió un error de PostgreSQL con parent.');
    }
    const parent = rejection.parent;
    if (typeof parent !== 'object' || parent === null || !('code' in parent)) {
      throw new Error('El error de PostgreSQL no incluyó su código SQLSTATE.');
    }
    expect(parent.code).toMatch(/23514|23503/);
  });

  it('AC-10: unicidad impide otra copia activa, incluida uncertain sin finished_at, pero permite historial terminal', async () => {
    expect(await tableExists(sequelize, 'kitchen_ticket_prints')).toBe(true);
    const seed = await seedPrinting(sequelize);
    const ticket = await seed.models.KitchenTicket.create({
      orderId: seed.order.id,
      kind: 'initial',
      createdByUserId: seed.waiter.id,
    });
    await sequelize.query(
      "INSERT INTO kitchen_ticket_prints(ticket_id,snapshot_version,snapshot,created_at) VALUES(:id,1,'{}',now())",
      { replacements: { id: ticket.id } },
    );
    await sequelize.query(
      "INSERT INTO kitchen_ticket_print_attempts(ticket_id,copy_number,status,requested_by_user_id,requested_by_name,completed_pages,created_at,started_at,owner_host,owner_pid,owner_execution_id) VALUES(:ticket,0,'uncertain',:user,'Juan',0,now(),now(),'localhost',123,'c10ce234-ecf9-4187-91d0-e132600ceda5')",
      { replacements: { ticket: ticket.id, user: seed.waiter.id } },
    );
    const copy =
      "INSERT INTO kitchen_ticket_print_attempts(ticket_id,copy_number,status,requested_by_user_id,requested_by_name,reason,idempotency_key,request_hash,completed_pages,created_at) VALUES(:ticket,1,'queued',:user,'Juan','archivo perdido','copy-key',:hash,0,now())";
    const replacements = { ticket: ticket.id, user: seed.waiter.id, hash: 'a'.repeat(64) };
    await expect(sequelize.query(copy, { replacements })).rejects.toMatchObject({
      parent: { code: '23505' },
    });
    await sequelize.query('UPDATE kitchen_ticket_print_attempts SET finished_at=now()');
    await expect(sequelize.query(copy, { replacements })).resolves.toBeDefined();
  });
});
