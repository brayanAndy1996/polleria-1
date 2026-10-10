// AC-08 a AC-14. Spec 009 — archivo nuevo: va EN ROJO hasta que T-09 cree
// src/services/orders/order.service.ts con sus creadores de error.
// Las mesas del salón se arman por SQL (fixtures) para que este archivo solo
// dependa del servicio bajo prueba y de la migración de la T-07.
import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { orderSchema } from '@polleria/shared';
import type { UserRole } from '@polleria/shared';
import { defineModels } from '../src/models/index.ts';
import type { Models } from '../src/models/index.ts';
import { createBcryptPinHasher } from '../src/services/auth/pin-hasher.ts';
import type { PinHasher } from '../src/services/auth/pin-hasher.ts';
import { createUserService } from '../src/services/users/user.service.ts';
import {
  createOrderNeedsTableError,
  createOrderNotFoundError,
  createOrderNotOpenError,
  createOrderService,
} from '../src/services/orders/order.service.ts';
import {
  clearOrderTables,
  closeTestDatabase,
  connectTestDatabase,
  migrateAndClearAuthTables,
} from './helpers/test-database.ts';

const TABLE_NOT_FOUND = {
  code: 'TABLE_NOT_FOUND',
  httpStatus: 404,
  message: 'Esa mesa no existe.',
};
const ORDER_NOT_FOUND = {
  code: 'ORDER_NOT_FOUND',
  httpStatus: 404,
  message: 'Ese pedido no existe.',
};
const TABLE_OCCUPIED = {
  code: 'TABLE_OCCUPIED',
  httpStatus: 409,
  message: 'La mesa ya tiene un pedido abierto.',
};
const TABLE_INACTIVE = {
  code: 'TABLE_INACTIVE',
  httpStatus: 409,
  message: 'La mesa est\u00E1 desactivada.',
};
const TABLE_HAS_NO_ORDER = {
  code: 'TABLE_HAS_NO_ORDER',
  httpStatus: 409,
  message: 'La mesa no tiene un pedido abierto.',
};
const ORDER_NOT_OPEN = {
  code: 'ORDER_NOT_OPEN',
  httpStatus: 409,
  message: 'El pedido ya est\u00E1 cerrado.',
};
const ORDER_NEEDS_TABLE = {
  code: 'ORDER_NEEDS_TABLE',
  httpStatus: 409,
  message: 'El pedido necesita al menos una mesa; canc\u00E9lalo o ci\u00E9rralo.',
};
const TABLE_DOES_NOT_EXIST_MESSAGE = 'Esa mesa no existe.';
const SAME_TABLE_MESSAGE = 'La mesa de destino debe ser otra.';

/** Issues { path, message } de un AppError VALIDATION_ERROR lanzado por el servicio. */
function issuesOf(error: unknown): { path: string; message: string }[] {
  const details = (error as { details?: { issues?: { path: string; message: string }[] } }).details;
  expect(error).toMatchObject({ code: 'VALIDATION_ERROR', httpStatus: 400 });
  expect(Array.isArray(details?.issues)).toBe(true);
  return details?.issues ?? [];
}

describe('009: servicio de pedidos sobre polleria_test', () => {
  let sequelize: Sequelize;
  let models: Models;
  let pinHasher: PinHasher;
  let service: ReturnType<typeof createOrderService>;

  const rows = <T extends object>(sql: string, bind?: (string | number | null)[]) =>
    sequelize.query<T>(sql, { type: QueryTypes.SELECT, bind });
  const orderCount = () => rows<{ id: number }>('SELECT id FROM "orders"');
  const orderRow = (id: number) =>
    rows<{
      status: string;
      opened_by_user_id: number;
      ready_at: Date | null;
      ready_by_user_id: number | null;
      bill_requested_at: Date | null;
      bill_requested_by_user_id: number | null;
      closed_at: Date | null;
      closed_by_user_id: number | null;
      cancel_reason: string | null;
      merged_into_order_id: number | null;
    }>(
      'SELECT status, opened_by_user_id, ready_at, ready_by_user_id, bill_requested_at, ' +
        'bill_requested_by_user_id, closed_at, closed_by_user_id, cancel_reason, ' +
        'merged_into_order_id FROM "orders" WHERE id = $1',
      [id],
    );
  const tableRow = (id: number) =>
    rows<{ name: string; is_active: boolean; current_order_id: number | null }>(
      'SELECT name, is_active, current_order_id FROM tables WHERE id = $1',
      [id],
    );
  const createUser = (username: string, displayName: string, roles: UserRole[] = ['waiter']) =>
    createUserService({ models, pinHasher }).createUser({
      username,
      displayName,
      roles,
      pin: '2468',
    });
  const insertTable = (name: string, fields: { isActive?: boolean } = {}) =>
    sequelize
      .query<{ id: number }>(
        'INSERT INTO "tables" (name, is_active) VALUES ($1, $2) RETURNING id',
        { type: QueryTypes.SELECT, bind: [name, fields.isActive ?? true] },
      )
      .then((result) => result[0]?.id ?? -1);
  /** Crea una mesa activa y le abre un pedido como `userId`. */
  const tableWithOrder = async (name: string, userId: number) => {
    const tableId = await insertTable(name);
    const order = await service.openOrder(tableId, { userId });
    return { tableId, order };
  };

  beforeAll(async () => {
    sequelize = await connectTestDatabase();
  });
  beforeEach(async () => {
    await migrateAndClearAuthTables(sequelize);
    await clearOrderTables(sequelize);
    models = defineModels(sequelize);
    pinHasher = createBcryptPinHasher({ cost: 4 });
    service = createOrderService({ models });
  });
  afterAll(async () => {
    await closeTestDatabase(sequelize);
  });

  it('AC-08: openOrder crea el pedido, lo devuelve en forma D-009-14 y ocupa la mesa', async () => {
    const juan = await createUser('salon.juan', 'Juan');
    const mesa3 = await insertTable('Mesa 3');
    const order = await service.openOrder(mesa3, { userId: juan.id });
    expect(orderSchema.safeParse(order).success).toBe(true);
    expect(order).toMatchObject({
      status: 'open',
      tables: [{ id: mesa3, name: 'Mesa 3' }],
      openedBy: { id: juan.id, displayName: 'Juan' },
      openedAt: expect.any(String) as unknown,
      readyAt: null,
      billRequestedAt: null,
      closedAt: null,
      closedBy: null,
      cancelReason: null,
      mergedIntoOrderId: null,
    });
    // La mesa quedó apuntando al pedido nuevo (RN-009-04: opened_by_user_id grabado).
    expect(await tableRow(mesa3)).toEqual([
      { name: 'Mesa 3', is_active: true, current_order_id: order.id },
    ]);
    expect(await orderRow(order.id)).toEqual([
      {
        status: 'open',
        opened_by_user_id: juan.id,
        ready_at: null,
        ready_by_user_id: null,
        bill_requested_at: null,
        bill_requested_by_user_id: null,
        closed_at: null,
        closed_by_user_id: null,
        cancel_reason: null,
        merged_into_order_id: null,
      },
    ]);
  });

  it('AC-08: repetir la apertura lanza TABLE_OCCUPIED sin crear otro pedido', async () => {
    const juan = await createUser('salon.juan', 'Juan');
    const mesa3 = await insertTable('Mesa 3');
    await service.openOrder(mesa3, { userId: juan.id });
    await expect(service.openOrder(mesa3, { userId: juan.id })).rejects.toMatchObject(
      TABLE_OCCUPIED,
    );
    // La tabla orders no creció y el puntero sigue siendo el del primer pedido.
    expect(await orderCount()).toHaveLength(1);
    expect(await tableRow(mesa3)).toEqual([
      { name: 'Mesa 3', is_active: true, current_order_id: 1 },
    ]);
  });

  it('AC-08: mesa inactiva lanza TABLE_INACTIVE e inexistente lanza TABLE_NOT_FOUND', async () => {
    const juan = await createUser('salon.juan', 'Juan');
    const deposito = await insertTable('Dep\u00F3sito', { isActive: false });
    await expect(service.openOrder(deposito, { userId: juan.id })).rejects.toMatchObject(
      TABLE_INACTIVE,
    );
    await expect(service.openOrder(999999, { userId: juan.id })).rejects.toMatchObject(
      TABLE_NOT_FOUND,
    );
    expect(await orderCount()).toHaveLength(0);
  });

  it('AC-08: dos aperturas a la vez dejan un solo pedido y un solo puntero', async () => {
    const juan = await createUser('salon.juan', 'Juan');
    const beto = await createUser('salon.beto', 'Beto');
    const mesa3 = await insertTable('Mesa 3');
    // Dos mozos abren la misma mesa en paralelo: la serialización decide al ganador.
    const [ganador, perdedor] = await Promise.allSettled([
      service.openOrder(mesa3, { userId: juan.id }),
      service.openOrder(mesa3, { userId: beto.id }),
    ]);
    const results = [ganador, perdedor];
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject(TABLE_OCCUPIED);
    expect(await orderCount()).toHaveLength(1);
    expect(await tableRow(mesa3)).toEqual([
      { name: 'Mesa 3', is_active: true, current_order_id: 1 },
    ]);
  });

  it('AC-09: getOrder devuelve el pedido con sus mesas, marcas y autores', async () => {
    const juan = await createUser('salon.juan', 'Juan');
    const { tableId: mesa3, order } = await tableWithOrder('Mesa 3', juan.id);
    const mesa5 = await insertTable('Mesa 5');
    await service.joinTable(mesa5, mesa3, { userId: juan.id });
    await service.requestBill(order.id, { userId: juan.id });
    const detail = await service.getOrder(order.id);
    expect(orderSchema.safeParse(detail).success).toBe(true);
    expect(detail).toMatchObject({
      id: order.id,
      status: 'open',
      openedBy: { id: juan.id, displayName: 'Juan' },
      billRequestedAt: expect.any(String) as unknown,
      readyAt: null,
      closedAt: null,
      closedBy: null,
      cancelReason: null,
      mergedIntoOrderId: null,
    });
    expect(detail.tables).toEqual([
      { id: mesa3, name: 'Mesa 3' },
      { id: mesa5, name: 'Mesa 5' },
    ]);
  });

  it('AC-09: getOrder de un inexistente lanza ORDER_NOT_FOUND y de uno merged informa su destino', async () => {
    const juan = await createUser('salon.juan', 'Juan');
    await expect(service.getOrder(999999)).rejects.toMatchObject(ORDER_NOT_FOUND);
    const { tableId: mesa3, order: p } = await tableWithOrder('Mesa 3', juan.id);
    const { tableId: mesa4, order: q } = await tableWithOrder('Mesa 4', juan.id);
    await service.joinTable(mesa4, mesa3, { userId: juan.id });
    // El pedido absorbido (Q, el de Mesa 4) sigue consultable con su forma de cierre.
    const absorbed = await service.getOrder(q.id);
    expect(orderSchema.safeParse(absorbed).success).toBe(true);
    expect(absorbed).toMatchObject({
      status: 'merged',
      tables: [],
      mergedIntoOrderId: p.id,
      closedBy: { id: juan.id, displayName: 'Juan' },
      closedAt: expect.any(String) as unknown,
    });
  });

  it('AC-10: moveOrder lleva el pedido completo a una mesa libre y conserva las marcas', async () => {
    const juan = await createUser('salon.juan', 'Juan');
    // Pedido multi: cubre Mesa 3 y Mesa 4 unidas, con ambas señales puestas.
    const { tableId: mesa3, order: p } = await tableWithOrder('Mesa 3', juan.id);
    const mesa4 = await insertTable('Mesa 4');
    await service.joinTable(mesa4, mesa3, { userId: juan.id });
    await service.requestBill(p.id, { userId: juan.id });
    await service.markReady(p.id, { userId: juan.id });
    const mesa7 = await insertTable('Mesa 7');

    const moved = await service.moveOrder(p.id, mesa7, { userId: juan.id });
    expect(moved).toMatchObject({
      id: p.id,
      status: 'open',
      tables: [{ id: mesa7, name: 'Mesa 7' }],
      readyAt: expect.any(String) as unknown,
      billRequestedAt: expect.any(String) as unknown,
    });
    // Mesa 3 y Mesa 4 quedaron libres; Mesa 7 es la única que apunta al pedido.
    for (const tableId of [mesa3, mesa4])
      expect(await tableRow(tableId)).toEqual([
        { name: expect.any(String) as unknown, is_active: true, current_order_id: null },
      ]);
    expect(await tableRow(mesa7)).toEqual([
      { name: 'Mesa 7', is_active: true, current_order_id: p.id },
    ]);
    // Las marcas sobrevivieron al movimiento (RN-009-06).
    expect((await orderRow(p.id))[0]).toMatchObject({
      ready_at: expect.any(Date) as unknown,
      bill_requested_at: expect.any(Date) as unknown,
    });
  });

  it('AC-10: destino ocupado, inactivo o inexistente y pedido no abierto fallan sin cambios', async () => {
    const juan = await createUser('salon.juan', 'Juan');
    const { tableId: mesa3, order: p } = await tableWithOrder('Mesa 3', juan.id);
    const { tableId: mesa4 } = await tableWithOrder('Mesa 4', juan.id);
    const deposito = await insertTable('Dep\u00F3sito', { isActive: false });
    // Destino ocupado e inactivo responden su 409.
    await expect(service.moveOrder(p.id, mesa4, { userId: juan.id })).rejects.toMatchObject(
      TABLE_OCCUPIED,
    );
    await expect(service.moveOrder(p.id, deposito, { userId: juan.id })).rejects.toMatchObject(
      TABLE_INACTIVE,
    );
    // Destino inexistente es un problema de dato del cuerpo: VALIDATION_ERROR con issue.
    const noExiste = await service
      .moveOrder(p.id, 999999, { userId: juan.id })
      .catch((error: unknown) => error);
    expect(issuesOf(noExiste)).toEqual([
      { path: 'tableId', message: TABLE_DOES_NOT_EXIST_MESSAGE },
    ]);
    // Pedido inexistente y cerrado.
    await expect(service.moveOrder(999999, mesa3, { userId: juan.id })).rejects.toMatchObject(
      ORDER_NOT_FOUND,
    );
    await service.cancelOrder(p.id, 'Se fueron sin pedir', { userId: juan.id });
    await expect(service.moveOrder(p.id, mesa3, { userId: juan.id })).rejects.toMatchObject(
      ORDER_NOT_OPEN,
    );
    // Nada se movió: Mesa 3 sigue libre, Mesa 4 sigue con su pedido, Depósito intacta.
    expect(await tableRow(mesa3)).toEqual([
      { name: 'Mesa 3', is_active: true, current_order_id: null },
    ]);
    expect((await tableRow(mesa4))[0]?.current_order_id).not.toBeNull();
    expect(await tableRow(deposito)).toEqual([
      { name: 'Dep\u00F3sito', is_active: false, current_order_id: null },
    ]);
  });

  it('AC-10: mover a la mesa que ya cubre sola el pedido es un no-op sin cambios', async () => {
    const juan = await createUser('salon.juan', 'Juan');
    const { tableId: mesa3, order: p } = await tableWithOrder('Mesa 3', juan.id);
    const again = await service.moveOrder(p.id, mesa3, { userId: juan.id });
    expect(again).toMatchObject({ id: p.id, tables: [{ id: mesa3, name: 'Mesa 3' }] });
    expect(await tableRow(mesa3)).toEqual([
      { name: 'Mesa 3', is_active: true, current_order_id: p.id },
    ]);
  });

  it('AC-11: unir una mesa libre la suma al pedido de la mesa destino', async () => {
    const juan = await createUser('salon.juan', 'Juan');
    const { tableId: mesa3, order: p } = await tableWithOrder('Mesa 3', juan.id);
    const mesa5 = await insertTable('Mesa 5');
    const joined = await service.joinTable(mesa5, mesa3, { userId: juan.id });
    // La respuesta es el pedido destino P cubriendo las dos mesas.
    expect(joined).toMatchObject({
      id: p.id,
      status: 'open',
      tables: [
        { id: mesa3, name: 'Mesa 3' },
        { id: mesa5, name: 'Mesa 5' },
      ],
    });
    expect(await tableRow(mesa5)).toEqual([
      { name: 'Mesa 5', is_active: true, current_order_id: p.id },
    ]);
    expect(await orderCount()).toHaveLength(1);
  });

  it('AC-11: unir dos mesas ocupadas fusiona el pedido origen en el del destino', async () => {
    const juan = await createUser('salon.juan', 'Juan');
    const ana = await createUser('salon.ana', 'Ana');
    const { tableId: mesa3, order: p } = await tableWithOrder('Mesa 3', juan.id);
    const { tableId: mesa4, order: q } = await tableWithOrder('Mesa 4', ana.id);
    const mesa6 = await insertTable('Mesa 6');
    // Mesa 6 se suma al pedido Q antes del merge: todas las mesas de Q pasan a P.
    await service.joinTable(mesa6, mesa4, { userId: ana.id });
    // P pide la cuenta: sus marcas se conservan pese al merge (RN-009-05).
    await service.requestBill(p.id, { userId: juan.id });

    const merged = await service.joinTable(mesa4, mesa3, { userId: juan.id });
    expect(merged).toMatchObject({
      id: p.id,
      status: 'open',
      billRequestedAt: expect.any(String) as unknown,
    });
    // El orden de `tables` tras el merge no lo fija la spec: se verifica el conjunto.
    expect(merged.tables).toHaveLength(3);
    expect(merged.tables).toEqual(
      expect.arrayContaining([
        { id: mesa3, name: 'Mesa 3' },
        { id: mesa4, name: 'Mesa 4' },
        { id: mesa6, name: 'Mesa 6' },
      ]),
    );
    // Q quedó 'merged' apuntando a P con el cierre registrado (RN-009-05).
    expect((await orderRow(q.id))[0]).toMatchObject({
      status: 'merged',
      merged_into_order_id: p.id,
      closed_by_user_id: juan.id,
      closed_at: expect.any(Date) as unknown,
    });
    // Las tres mesas apuntan a P; P conserva su marca de cuenta pedida.
    for (const tableId of [mesa3, mesa4, mesa6])
      expect((await tableRow(tableId))[0]?.current_order_id).toBe(p.id);
    expect((await orderRow(p.id))[0]).toMatchObject({
      status: 'open',
      bill_requested_at: expect.any(Date) as unknown,
      closed_at: null,
      merged_into_order_id: null,
    });
  });

  it('AC-11: unir al mismo pedido es un no-op y las guardias responden su código', async () => {
    const juan = await createUser('salon.juan', 'Juan');
    const { tableId: mesa3, order: p } = await tableWithOrder('Mesa 3', juan.id);
    const mesa4 = await insertTable('Mesa 4');
    await service.joinTable(mesa4, mesa3, { userId: juan.id });
    // Mesa 3 y Mesa 4 ya comparten el pedido P: unirlas entre sí no cambia nada.
    const noop = await service.joinTable(mesa3, mesa4, { userId: juan.id });
    expect(noop).toMatchObject({ id: p.id });
    expect((await tableRow(mesa3))[0]?.current_order_id).toBe(p.id);
    // Destino libre y destino inactivo.
    const mesa5 = await insertTable('Mesa 5');
    const deposito = await insertTable('Dep\u00F3sito', { isActive: false });
    await expect(service.joinTable(mesa4, mesa5, { userId: juan.id })).rejects.toMatchObject(
      TABLE_HAS_NO_ORDER,
    );
    await expect(service.joinTable(mesa4, deposito, { userId: juan.id })).rejects.toMatchObject(
      TABLE_INACTIVE,
    );
    // Destino inexistente e igual al origen: issues de VALIDATION_ERROR.
    const noExiste = await service
      .joinTable(mesa4, 999999, { userId: juan.id })
      .catch((error: unknown) => error);
    expect(issuesOf(noExiste)).toEqual([
      { path: 'intoTableId', message: TABLE_DOES_NOT_EXIST_MESSAGE },
    ]);
    const misma = await service
      .joinTable(mesa4, mesa4, { userId: juan.id })
      .catch((error: unknown) => error);
    expect(issuesOf(misma)).toEqual([{ path: 'intoTableId', message: SAME_TABLE_MESSAGE }]);
    // Origen inexistente e inactivo responden sus códigos de la ruta.
    await expect(service.joinTable(999999, mesa3, { userId: juan.id })).rejects.toMatchObject(
      TABLE_NOT_FOUND,
    );
    await expect(service.joinTable(deposito, mesa3, { userId: juan.id })).rejects.toMatchObject(
      TABLE_INACTIVE,
    );
  });

  it('AC-11: unir hacia una mesa cuyo pedido ya no está abierto responde TABLE_HAS_NO_ORDER', async () => {
    const juan = await createUser('salon.juan', 'Juan');
    const { tableId: mesa3, order: p } = await tableWithOrder('Mesa 3', juan.id);
    await service.cancelOrder(p.id, 'Mesa abierta por error', { userId: juan.id });
    // Mesa 3 quedó libre tras cancelar: unir hacia ella es TABLE_HAS_NO_ORDER.
    const mesa5 = await insertTable('Mesa 5');
    await expect(service.joinTable(mesa5, mesa3, { userId: juan.id })).rejects.toMatchObject(
      TABLE_HAS_NO_ORDER,
    );
  });

  it('AC-12: separar una mesa la libera y deja el pedido con las restantes', async () => {
    const juan = await createUser('salon.juan', 'Juan');
    const { tableId: mesa3, order: p } = await tableWithOrder('Mesa 3', juan.id);
    const mesa5 = await insertTable('Mesa 5');
    await service.joinTable(mesa5, mesa3, { userId: juan.id });
    const remaining = await service.leaveTable(mesa5, { userId: juan.id });
    // La respuesta es el pedido P cubriendo solo Mesa 3; Mesa 5 quedó libre.
    expect(remaining).toMatchObject({
      id: p.id,
      status: 'open',
      tables: [{ id: mesa3, name: 'Mesa 3' }],
    });
    expect(await tableRow(mesa5)).toEqual([
      { name: 'Mesa 5', is_active: true, current_order_id: null },
    ]);
    expect(await tableRow(mesa3)).toEqual([
      { name: 'Mesa 3', is_active: true, current_order_id: p.id },
    ]);
  });

  it('AC-12: la última mesa del pedido, una libre o inexistente responden su código', async () => {
    const juan = await createUser('salon.juan', 'Juan');
    const { tableId: mesa3, order: p } = await tableWithOrder('Mesa 3', juan.id);
    const mesa5 = await insertTable('Mesa 5');
    // Soltar la única mesa dejaría un pedido de salón sin mesa (RN-009-07).
    await expect(service.leaveTable(mesa3, { userId: juan.id })).rejects.toMatchObject(
      ORDER_NEEDS_TABLE,
    );
    await expect(service.leaveTable(mesa5, { userId: juan.id })).rejects.toMatchObject(
      TABLE_HAS_NO_ORDER,
    );
    await expect(service.leaveTable(999999, { userId: juan.id })).rejects.toMatchObject(
      TABLE_NOT_FOUND,
    );
    // Nada cambió: el pedido sigue abierto y cubriendo Mesa 3.
    expect((await orderRow(p.id))[0]?.status).toBe('open');
    expect(await tableRow(mesa3)).toEqual([
      { name: 'Mesa 3', is_active: true, current_order_id: p.id },
    ]);
  });

  it('AC-13: requestBill y markReady ponen su par y repiten como no-op con la primera marca', async () => {
    const juan = await createUser('salon.juan', 'Juan');
    const beto = await createUser('salon.beto', 'Beto');
    const { order: p } = await tableWithOrder('Mesa 3', juan.id);

    const billed = await service.requestBill(p.id, { userId: juan.id });
    expect(billed).toMatchObject({
      id: p.id,
      status: 'open',
      billRequestedAt: expect.any(String) as unknown,
      readyAt: null,
    });
    // Repetir con otro usuario conserva la primera marca (no-op idempotente).
    const billedAgain = await service.requestBill(p.id, { userId: beto.id });
    expect(billedAgain.billRequestedAt).toBe(billed.billRequestedAt);
    expect((await orderRow(p.id))[0]).toMatchObject({
      bill_requested_by_user_id: juan.id,
    });

    const ready = await service.markReady(p.id, { userId: beto.id });
    expect(ready).toMatchObject({
      id: p.id,
      status: 'open',
      readyAt: expect.any(String) as unknown,
    });
    // Ambas marcas viajan en el pedido; el estado derivado lo decide la mesa (AC-06).
    expect(ready.billRequestedAt).toBe(billed.billRequestedAt);
    const readyAgain = await service.markReady(p.id, { userId: juan.id });
    expect(readyAgain.readyAt).toBe(ready.readyAt);
    expect((await orderRow(p.id))[0]).toMatchObject({ ready_by_user_id: beto.id });
  });

  it('AC-13: markServed limpia solo el par de listo y es un no-op si ya estaba limpio', async () => {
    const juan = await createUser('salon.juan', 'Juan');
    const beto = await createUser('salon.beto', 'Beto');
    const { order: p } = await tableWithOrder('Mesa 3', juan.id);
    await service.requestBill(p.id, { userId: juan.id });
    await service.markReady(p.id, { userId: beto.id });

    const served = await service.markServed(p.id, { userId: juan.id });
    // Se sirvió: la marca de listo se limpia y la de la cuenta sigue puesta.
    expect(served).toMatchObject({ id: p.id, readyAt: null });
    expect(served.billRequestedAt).not.toBeNull();
    expect((await orderRow(p.id))[0]).toMatchObject({
      ready_at: null,
      ready_by_user_id: null,
      bill_requested_at: expect.any(Date) as unknown,
    });
    // Repetir sin marca no cambia nada; un markReady posterior vuelve a ponerla.
    const servedAgain = await service.markServed(p.id, { userId: juan.id });
    expect(servedAgain).toMatchObject({ readyAt: null });
    const readyOnceMore = await service.markReady(p.id, { userId: juan.id });
    expect(readyOnceMore.readyAt).not.toBeNull();
    expect((await orderRow(p.id))[0]).toMatchObject({ ready_by_user_id: juan.id });
  });

  it('AC-13: las señales sobre pedidos no abiertos o inexistentes responden su código', async () => {
    const juan = await createUser('salon.juan', 'Juan');
    const { tableId: mesa3, order: p } = await tableWithOrder('Mesa 3', juan.id);
    const { tableId: mesa4, order: q } = await tableWithOrder('Mesa 4', juan.id);
    await service.joinTable(mesa4, mesa3, { userId: juan.id }); // Q queda merged en P.
    await service.cancelOrder(p.id, 'Se fueron sin pedir', { userId: juan.id });
    // merged y cancelled son pedidos no abiertos: las tres señales dan ORDER_NOT_OPEN.
    for (const orderId of [p.id, q.id]) {
      await expect(service.requestBill(orderId, { userId: juan.id })).rejects.toMatchObject(
        ORDER_NOT_OPEN,
      );
      await expect(service.markReady(orderId, { userId: juan.id })).rejects.toMatchObject(
        ORDER_NOT_OPEN,
      );
      await expect(service.markServed(orderId, { userId: juan.id })).rejects.toMatchObject(
        ORDER_NOT_OPEN,
      );
    }
    // Thunks: cada promesa se crea dentro del await para no dejar rechazos sin enganchar.
    for (const operation of [
      () => service.requestBill(999999, { userId: juan.id }),
      () => service.markReady(999999, { userId: juan.id }),
      () => service.markServed(999999, { userId: juan.id }),
    ])
      await expect(operation()).rejects.toMatchObject(ORDER_NOT_FOUND);
  });

  it('AC-14: cancelOrder cierra con motivo, autor y libera todas las mesas en una transacción', async () => {
    const juan = await createUser('salon.juan', 'Juan');
    const dueno = await createUser('salon.dueno', 'Do\u00F1a Luz', ['admin']);
    const { tableId: mesa3, order: p } = await tableWithOrder('Mesa 3', juan.id);
    const mesa5 = await insertTable('Mesa 5');
    await service.joinTable(mesa5, mesa3, { userId: juan.id });
    await service.requestBill(p.id, { userId: juan.id });

    const cancelled = await service.cancelOrder(p.id, '  Se sentaron por error  ', {
      userId: dueno.id,
    });
    expect(orderSchema.safeParse(cancelled).success).toBe(true);
    expect(cancelled).toMatchObject({
      id: p.id,
      status: 'cancelled',
      tables: [],
      cancelReason: 'Se sentaron por error',
      closedAt: expect.any(String) as unknown,
      closedBy: { id: dueno.id, displayName: 'Do\u00F1a Luz' },
      openedBy: { id: juan.id, displayName: 'Juan' },
      mergedIntoOrderId: null,
    });
    // Las dos mesas quedaron libres en la misma transacción y el pedido NO se borró
    // (RN-009-04: el historial queda con motivo y autor).
    for (const tableId of [mesa3, mesa5])
      expect((await tableRow(tableId))[0]?.current_order_id).toBeNull();
    expect((await orderRow(p.id))[0]).toMatchObject({
      status: 'cancelled',
      cancel_reason: 'Se sentaron por error',
      closed_by_user_id: dueno.id,
      closed_at: expect.any(Date) as unknown,
    });
    // GET posterior muestra el pedido cancelado con su motivo y quién lo hizo.
    const detail = await service.getOrder(p.id);
    expect(detail).toMatchObject({
      status: 'cancelled',
      tables: [],
      cancelReason: 'Se sentaron por error',
      closedBy: { id: dueno.id, displayName: 'Do\u00F1a Luz' },
    });
  });

  it('AC-14: sin motivo o con motivo fuera de forma lanza ZodError sin tocar nada', async () => {
    const juan = await createUser('salon.juan', 'Juan');
    const { tableId: mesa3, order: p } = await tableWithOrder('Mesa 3', juan.id);
    for (const reason of ['', '   ', 'x'.repeat(201)])
      await expect(service.cancelOrder(p.id, reason, { userId: juan.id })).rejects.toBeInstanceOf(
        ZodError,
      );
    // El pedido sigue abierto y la mesa sigue ocupada.
    expect((await orderRow(p.id))[0]?.status).toBe('open');
    expect(await tableRow(mesa3)).toEqual([
      { name: 'Mesa 3', is_active: true, current_order_id: p.id },
    ]);
  });

  it('AC-14: cancelar un pedido no abierto o inexistente responde su código', async () => {
    const juan = await createUser('salon.juan', 'Juan');
    const { order: p } = await tableWithOrder('Mesa 3', juan.id);
    await service.cancelOrder(p.id, 'Se sentaron por error', { userId: juan.id });
    await expect(
      service.cancelOrder(p.id, 'Otro motivo', { userId: juan.id }),
    ).rejects.toMatchObject(ORDER_NOT_OPEN);
    await expect(
      service.cancelOrder(999999, 'Otro motivo', { userId: juan.id }),
    ).rejects.toMatchObject(ORDER_NOT_FOUND);
    // El motivo y el cierre originales quedaron intactos (no se reescribió nada).
    expect((await orderRow(p.id))[0]).toMatchObject({
      status: 'cancelled',
      cancel_reason: 'Se sentaron por error',
    });
  });

  it('AC-14: los creadores de error de pedidos devuelven el código, estado y mensaje de D-009-13', () => {
    expect(createOrderNotFoundError()).toMatchObject(ORDER_NOT_FOUND);
    expect(createOrderNotOpenError()).toMatchObject(ORDER_NOT_OPEN);
    expect(createOrderNeedsTableError()).toMatchObject(ORDER_NEEDS_TABLE);
  });
});
