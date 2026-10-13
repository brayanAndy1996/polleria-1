import type { Sequelize } from 'sequelize';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOrderItemService } from '../src/services/order-items/order-item.service.ts';
import { createKitchenTicketPrintService } from '../src/services/kitchen-ticket-prints/kitchen-ticket-print.service.ts';
import { createPrinterService } from '../src/services/printer/printer.service.ts';
import { createFakeDriver } from './helpers/printer-fixtures.ts';
import {
  clearMenuTables,
  clearOrderTables,
  closeTestDatabase,
  connectTestDatabase,
  migrateAndClearAuthTables,
} from './helpers/test-database.ts';
import {
  countRows,
  PRINT_TIME,
  seedPrinting,
  snapshotOf,
  sqlRows,
} from './helpers/kitchen-printing-data.ts';

let sequelize: Sequelize;
let seed: Awaited<ReturnType<typeof seedPrinting>>;
let items: ReturnType<typeof createOrderItemService>;
let prints: ReturnType<typeof createKitchenTicketPrintService>;
let output: ReturnType<typeof createFakeDriver>;
let wake: ReturnType<typeof vi.fn<() => void>>;
beforeAll(async () => {
  sequelize = await connectTestDatabase();
});
afterAll(async () => {
  await closeTestDatabase(sequelize);
});
beforeEach(async () => {
  await migrateAndClearAuthTables(sequelize);
  await clearOrderTables(sequelize);
  await clearMenuTables(sequelize);
  seed = await seedPrinting(sequelize);
  output = createFakeDriver();
  wake = vi.fn<() => void>();
  prints = createKitchenTicketPrintService({
    models: seed.models,
    printerService: createPrinterService({ driver: output.driver }),
    now: () => PRINT_TIME,
    wakeDispatcher: wake,
  });
  items = createOrderItemService({ models: seed.models, kitchenTicketPrintService: prints });
});

function send(key = 'send-013') {
  return items.sendItems(
    seed.order.id,
    { items: [{ productId: seed.drink.id, quantity: 2, notes: 'sin hielo' }] },
    key,
    { userId: seed.waiter.id },
  );
}

describe('013: enqueue atómico sin I/O en polleria_test', () => {
  it('AC-03: un envío crea snapshot+queued dentro del commit y conserva respuesta estricta 010', async () => {
    const result = await send();
    const snapshots = await sqlRows<{ snapshot: unknown }>(
      sequelize,
      'SELECT snapshot FROM kitchen_ticket_prints',
    );
    expect(snapshots).toEqual([{ snapshot: snapshotOf(result.ticket, seed.table.id) }]);
    expect(
      await sqlRows(
        sequelize,
        'SELECT ticket_id,copy_number,status,requested_by_user_id,requested_by_name,reason,idempotency_key,request_hash,documents,started_at,finished_at FROM kitchen_ticket_print_attempts',
      ),
    ).toEqual([
      {
        ticket_id: result.ticket.id,
        copy_number: 0,
        status: 'queued',
        requested_by_user_id: seed.waiter.id,
        requested_by_name: 'Juan',
        reason: null,
        idempotency_key: null,
        request_hash: null,
        documents: null,
        started_at: null,
        finished_at: null,
      },
    ]);
    expect(Object.keys(result).sort()).toEqual(['order', 'ticket']);
    expect(Object.keys(result.ticket).sort()).toEqual([
      'createdAt',
      'createdBy',
      'id',
      'items',
      'kind',
      'orderId',
    ]);
    expect(output.jobs).toEqual([]);
    expect(wake).toHaveBeenCalledTimes(1);
  });

  it('AC-03: replay secuencial y concurrente conserva exactamente el cuerpo y no vuelve a encolar/despertar', async () => {
    const first = await send('same-013');
    const replays = await Promise.all([send('same-013'), send('same-013')]);
    expect(replays).toEqual([first, first]);
    expect(await countRows(sequelize, 'kitchen_ticket_prints')).toBe(1);
    expect(await countRows(sequelize, 'kitchen_ticket_print_attempts')).toBe(1);
    expect(await countRows(sequelize, 'kitchen_tickets')).toBe(1);
    expect(wake).toHaveBeenCalledTimes(1);
    expect(output.jobs).toEqual([]);
  });

  it.each(['kitchen_ticket_prints', 'kitchen_ticket_print_attempts'] as const)(
    'AC-03: fallo PostgreSQL al insertar %s revierte ticket, ítems, clave y snapshot; la misma clave puede volver a intentarse',
    async (table) => {
      // La falla pertenece a la inserción real, con independencia de ORM o SQL.
      await sequelize.query(
        "CREATE FUNCTION test013_reject_print_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fallo de inserción 013'; END; $$",
      );
      try {
        await sequelize.query(
          `CREATE TRIGGER test013_reject_insert BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION test013_reject_print_insert()`,
        );
        try {
          await expect(send('rollback-013')).rejects.toThrow();
          for (const name of [
            'kitchen_ticket_prints',
            'kitchen_ticket_print_attempts',
            'kitchen_tickets',
            'order_items',
            'idempotency_keys',
          ] as const)
            expect(await countRows(sequelize, name)).toBe(0);
          expect(output.jobs).toEqual([]);
          expect(wake).not.toHaveBeenCalled();
        } finally {
          await sequelize.query(`DROP TRIGGER test013_reject_insert ON ${table}`);
        }
      } finally {
        await sequelize.query('DROP FUNCTION test013_reject_print_insert()');
      }
      await expect(send('rollback-013')).resolves.toMatchObject({ ticket: { kind: 'initial' } });
    },
  );

  it('AC-03: request-void y reject-void no encolan; solo void aprobado crea ANULADO con motivo final', async () => {
    const first = await send();
    const itemId = first.order.items[0]!.id;
    await items.requestVoid(seed.order.id, itemId, { reason: 'pedido equivocado' }, 'request-013', {
      userId: seed.waiter.id,
    });
    await items.rejectVoid(seed.order.id, itemId, 'reject-013', { userId: seed.admin.id });
    expect(await countRows(sequelize, 'kitchen_ticket_prints')).toBe(1);
    expect(await countRows(sequelize, 'kitchen_ticket_print_attempts')).toBe(1);
    const approved = await items.voidItem(
      seed.order.id,
      itemId,
      { reason: 'Error de cocina' },
      'void-013',
      { userId: seed.admin.id },
    );
    const snapshots = await sqlRows<{ snapshot: unknown }>(
      sequelize,
      'SELECT snapshot FROM kitchen_ticket_prints ORDER BY ticket_id',
    );
    expect(snapshots[1]?.snapshot).toEqual(snapshotOf(approved.ticket, seed.table.id));
    expect(approved.ticket.items[0]).toMatchObject({
      createdBy: { displayName: 'Juan' },
      voidedBy: { displayName: 'Doña Luz' },
      voidReason: 'Error de cocina',
    });
    expect(await countRows(sequelize, 'kitchen_ticket_print_attempts')).toBe(2);
    expect(output.jobs).toEqual([]);
  });

  it('AC-04: snapshot permanece byte-equivalente al renombrar, mover, unir y anular después; lecturas siguen FK de ticket', async () => {
    const first = await send();
    const before = await sqlRows<{ snapshot: unknown }>(
      sequelize,
      'SELECT snapshot FROM kitchen_ticket_prints WHERE ticket_id=:id',
      { id: first.ticket.id },
    );
    await seed.models.Product.update({ name: 'Nombre nuevo' }, { where: { id: seed.drink.id } });
    await seed.models.User.update(
      { displayName: 'Otro nombre' },
      { where: { id: seed.waiter.id } },
    );
    await seed.models.Table.update({ name: 'Mesa renombrada' }, { where: { id: seed.table.id } });
    await seed.orders.moveOrder(seed.order.id, seed.destination.id, { userId: seed.waiter.id });
    const newTable = await seed.tables.createTable({ name: 'Mesa 5' });
    const target = await seed.orders.openOrder(newTable.id, { userId: seed.waiter.id });
    await seed.orders.joinTable(seed.destination.id, newTable.id, { userId: seed.waiter.id });
    await items.voidItem(
      target.id,
      first.order.items[0]!.id,
      { reason: 'Error posterior' },
      'later-void',
      { userId: seed.admin.id },
    );
    expect(
      await sqlRows(sequelize, 'SELECT snapshot FROM kitchen_ticket_prints WHERE ticket_id=:id', {
        id: first.ticket.id,
      }),
    ).toEqual(before);
    const actor = { userId: seed.admin.id, roles: ['admin'] as const };
    const current = await prints.listForOrder(target.id, actor);
    expect(current.prints.filter((entry) => entry.ticketId === first.ticket.id)).toHaveLength(1);
    expect(current.prints.find((entry) => entry.ticketId === first.ticket.id)).toMatchObject({
      orderId: target.id,
      tablesAtIssue: [{ id: seed.table.id, name: 'Mesa 3' }],
    });
    expect((await prints.listForOrder(seed.order.id, actor)).prints).toEqual([]);
  });
});
