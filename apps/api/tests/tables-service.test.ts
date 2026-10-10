// AC-06 y AC-07. Spec 009 — archivo nuevo: va EN ROJO hasta que T-08 cree
// src/services/tables/table.service.ts con sus creadores de error.
// Los pedidos del tablero se arman por SQL (fixtures) para que este archivo solo
// dependa del servicio bajo prueba y de la migración de la T-07.
import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { tablesResponseSchema } from '@polleria/shared';
import { defineModels } from '../src/models/index.ts';
import type { Models } from '../src/models/index.ts';
import { createBcryptPinHasher } from '../src/services/auth/pin-hasher.ts';
import type { PinHasher } from '../src/services/auth/pin-hasher.ts';
import { createUserService } from '../src/services/users/user.service.ts';
import {
  createTableHasNoOrderError,
  createTableHasOpenOrderError,
  createTableInactiveError,
  createTableNameTakenError,
  createTableNotFoundError,
  createTableOccupiedError,
  createTableService,
} from '../src/services/tables/table.service.ts';
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
const TABLE_NAME_TAKEN = {
  code: 'TABLE_NAME_TAKEN',
  httpStatus: 409,
  message: 'Ya existe una mesa con ese nombre.',
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
const TABLE_HAS_OPEN_ORDER = {
  code: 'TABLE_HAS_OPEN_ORDER',
  httpStatus: 409,
  message: 'La mesa tiene un pedido abierto; ci\u00E9rralo o mu\u00E9velo antes de desactivarla.',
};
const TABLE_HAS_NO_ORDER = {
  code: 'TABLE_HAS_NO_ORDER',
  httpStatus: 409,
  message: 'La mesa no tiene un pedido abierto.',
};

// Marcas fijas de los pedidos de fixture.
const T0 = '2026-10-10T15:00:00.000Z';
const T1 = '2026-10-10T16:00:00.000Z';

describe('009: servicio de mesas sobre polleria_test', () => {
  let sequelize: Sequelize;
  let models: Models;
  let pinHasher: PinHasher;
  let service: ReturnType<typeof createTableService>;

  const rows = <T extends object>(sql: string, bind?: (string | number | null)[]) =>
    sequelize.query<T>(sql, { type: QueryTypes.SELECT, bind });
  const tableRow = (id: number) =>
    rows<{ name: string; is_active: boolean; current_order_id: number | null }>(
      'SELECT name, is_active, current_order_id FROM tables WHERE id = $1',
      [id],
    );
  const tableCount = () => rows<{ id: number }>('SELECT id FROM "tables"');
  const createUser = (username: string, displayName: string) =>
    createUserService({ models, pinHasher }).createUser({
      username,
      displayName,
      roles: ['waiter'],
      pin: '2468',
    });
  /** Pedido de fixture por SQL: abierto por defecto, marcas opcionales. */
  const insertOrder = (
    fields: {
      openedBy?: number;
      readyAt?: string | null;
      readyBy?: number | null;
      billAt?: string | null;
      billBy?: number | null;
    } = {},
  ) =>
    sequelize
      .query<{ id: number }>(
        'INSERT INTO "orders" (status, opened_by_user_id, opened_at, ready_at, ' +
          'ready_by_user_id, bill_requested_at, bill_requested_by_user_id) ' +
          'VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
        {
          type: QueryTypes.SELECT,
          bind: [
            'open',
            fields.openedBy ?? 1,
            T0,
            fields.readyAt ?? null,
            fields.readyBy ?? null,
            fields.billAt ?? null,
            fields.billBy ?? null,
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
  /** Pedido abierto cubriendo las mesas dadas (repointa current_order_id). */
  const orderCovering = async (
    openedBy: number,
    tableIds: number[],
    marks: {
      readyAt?: string | null;
      readyBy?: number | null;
      billAt?: string | null;
      billBy?: number | null;
    } = {},
  ) => {
    const orderId = await insertOrder({ openedBy, ...marks });
    for (const tableId of tableIds)
      await sequelize.query('UPDATE "tables" SET current_order_id = $1 WHERE id = $2', {
        bind: [orderId, tableId],
      });
    return orderId;
  };

  beforeAll(async () => {
    sequelize = await connectTestDatabase();
  });
  beforeEach(async () => {
    await migrateAndClearAuthTables(sequelize);
    await clearOrderTables(sequelize);
    models = defineModels(sequelize);
    pinHasher = createBcryptPinHasher({ cost: 4 });
    service = createTableService({ models });
  });
  afterAll(async () => {
    await closeTestDatabase(sequelize);
  });

  it('AC-06: sin mesas devuelve una lista vacía', async () => {
    expect(await service.listTables()).toEqual([]);
  });

  it('AC-06: devuelve el tablero en orden natural con estados derivados y el pedido embebido', async () => {
    const juan = await createUser('tablero.juan', 'Juan');
    const mesa10 = await insertTable('Mesa 10');
    const mesa2 = await insertTable('Mesa 2');
    const barra = await insertTable('Barra');
    const deposito = await insertTable('Dep\u00F3sito', { isActive: false });
    // Pedido A: Mesa 2 + Barra unidas, listo para servir. Pedido B: Mesa 10, cuenta pedida.
    const orderA = await orderCovering(juan.id, [mesa2, barra], {
      readyAt: T1,
      readyBy: juan.id,
    });
    const orderB = await orderCovering(juan.id, [mesa10], { billAt: T1, billBy: juan.id });

    const tables = await service.listTables();
    // Las cuatro mesas, inactiva incluida, ordenadas por nombre con colación natural
    // (Mesa 2 antes que Mesa 10); cada una con exactamente las cinco claves de D-009-14.
    expect(tables.map((table) => table.name)).toEqual([
      'Barra',
      'Dep\u00F3sito',
      'Mesa 2',
      'Mesa 10',
    ]);
    for (const table of tables)
      expect(Object.keys(table).sort()).toEqual(['id', 'isActive', 'name', 'order', 'state']);
    expect(tablesResponseSchema.safeParse({ tables }).success).toBe(true);

    expect(tables).toHaveLength(4);
    const [barraView, depositoView, mesa2View, mesa10View] = tables as [
      (typeof tables)[number],
      (typeof tables)[number],
      (typeof tables)[number],
      (typeof tables)[number],
    ];
    // Mesa 2 y Barra: 'ready' y el MISMO pedido embebido con sus once claves.
    expect(barraView).toMatchObject({ id: barra, isActive: true, state: 'ready' });
    expect(mesa2View).toMatchObject({ id: mesa2, isActive: true, state: 'ready' });
    expect(barraView.order).toEqual(mesa2View.order);
    expect(barraView.order).toMatchObject({
      id: orderA,
      status: 'open',
      tables: [
        { id: mesa2, name: 'Mesa 2' },
        { id: barra, name: 'Barra' },
      ],
      openedBy: { id: juan.id, displayName: 'Juan' },
      readyAt: expect.any(String) as unknown,
      billRequestedAt: null,
      closedAt: null,
      closedBy: null,
      cancelReason: null,
      mergedIntoOrderId: null,
    });
    expect(typeof barraView.order?.openedAt).toBe('string');
    expect(Object.keys(barraView.order ?? {}).sort()).toEqual([
      'billRequestedAt',
      'cancelReason',
      'closedAt',
      'closedBy',
      'id',
      'mergedIntoOrderId',
      'openedAt',
      'openedBy',
      'readyAt',
      'status',
      'tables',
    ]);
    // Mesa 10: 'bill_requested' con su pedido; Depósito: inactiva, libre y sin pedido.
    expect(mesa10View).toMatchObject({ id: mesa10, isActive: true, state: 'bill_requested' });
    expect(mesa10View.order).toMatchObject({
      id: orderB,
      tables: [{ id: mesa10, name: 'Mesa 10' }],
      billRequestedAt: expect.any(String) as unknown,
      readyAt: null,
    });
    expect(depositoView).toEqual({
      id: deposito,
      name: 'Dep\u00F3sito',
      isActive: false,
      state: 'free',
      order: null,
    });
  });

  it('AC-06: un pedido sin marcas deriva occupied y con ambas marcas gana ready', async () => {
    const juan = await createUser('tablero.juan', 'Juan');
    const mesa1 = await insertTable('Mesa 1');
    const mesa2 = await insertTable('Mesa 2');
    await orderCovering(juan.id, [mesa1]);
    await orderCovering(juan.id, [mesa2], {
      readyAt: T1,
      readyBy: juan.id,
      billAt: T1,
      billBy: juan.id,
    });
    const tables = await service.listTables();
    expect(tables.find((table) => table.id === mesa1)).toMatchObject({
      state: 'occupied',
      order: { readyAt: null, billRequestedAt: null },
    });
    // Precedencia fija (RN-009-02): las dos marcas viajan pero el estado elige ready.
    expect(tables.find((table) => table.id === mesa2)).toMatchObject({
      state: 'ready',
      order: { readyAt: T1, billRequestedAt: T1 },
    });
  });

  it('AC-07: createTable devuelve la mesa libre y normaliza el nombre', async () => {
    const created = await service.createTable({ name: '  Mesa   1  ' });
    expect(created).toEqual({
      id: 1,
      name: 'Mesa 1',
      isActive: true,
      state: 'free',
      order: null,
    });
    expect(await tableRow(created.id)).toEqual([
      { name: 'Mesa 1', is_active: true, current_order_id: null },
    ]);
    expect(await service.listTables()).toEqual([created]);
  });

  it('AC-07: la unicidad del nombre no distingue mayúsculas ni mesas inactivas', async () => {
    await service.createTable({ name: 'Mesa 1' });
    await expect(service.createTable({ name: 'mesa 1' })).rejects.toMatchObject(TABLE_NAME_TAKEN);
    await expect(service.createTable({ name: '  MESA 1  ' })).rejects.toMatchObject(
      TABLE_NAME_TAKEN,
    );
    // Una mesa inactiva también reserva su nombre (RN-009-09).
    const deposito = await service.createTable({ name: 'Dep\u00F3sito' });
    await service.updateTable(deposito.id, { isActive: false });
    await expect(service.createTable({ name: 'dep\u00F3sito' })).rejects.toMatchObject(
      TABLE_NAME_TAKEN,
    );
    // Otro nombre sí entra.
    await service.createTable({ name: 'Mesa 2' });
    expect(await tableCount()).toHaveLength(3);
  });

  it('AC-07: la forma inválida lanza ZodError sin tocar la base', async () => {
    for (const input of [{}, { name: '' }, { name: 'Mesa/1' }, { name: 'x'.repeat(41) }])
      await expect(service.createTable(input)).rejects.toBeInstanceOf(ZodError);
    expect(await tableCount()).toHaveLength(0);
    const mesa = await service.createTable({ name: 'Mesa 1' });
    for (const input of [{}, { name: 'Mesa/2' }])
      await expect(service.updateTable(mesa.id, input)).rejects.toBeInstanceOf(ZodError);
    expect(await tableRow(mesa.id)).toEqual([
      { name: 'Mesa 1', is_active: true, current_order_id: null },
    ]);
  });

  it('AC-07: updateTable renombra y cambia el estado, y la mesa nunca se borra', async () => {
    const mesa = await service.createTable({ name: 'Mesa 1' });
    // Renombrar normaliza y actualiza el nombre.
    const renamed = await service.updateTable(mesa.id, { name: '  Barra  ' });
    expect(renamed).toMatchObject({ name: 'Barra', isActive: true, state: 'free', order: null });
    // Desactivar y reactivar una mesa libre: la fila sigue existiendo (RN-009-09).
    await expect(service.updateTable(mesa.id, { isActive: false })).resolves.toMatchObject({
      isActive: false,
    });
    expect(await tableRow(mesa.id)).toEqual([
      { name: 'Barra', is_active: false, current_order_id: null },
    ]);
    expect((await service.listTables()).find((table) => table.id === mesa.id)).toMatchObject({
      name: 'Barra',
      isActive: false,
      state: 'free',
      order: null,
    });
    await expect(service.updateTable(mesa.id, { isActive: true })).resolves.toMatchObject({
      isActive: true,
    });
    // Renombrar al MISMO nombre (aunque cambien las mayúsculas) no choca consigo misma.
    await expect(service.updateTable(mesa.id, { name: 'BARRA' })).resolves.toMatchObject({
      name: 'BARRA',
    });
    // Las dos operaciones se pueden combinar en un solo PATCH.
    await expect(
      service.updateTable(mesa.id, { name: 'Terraza', isActive: false }),
    ).resolves.toMatchObject({ name: 'Terraza', isActive: false });
    expect(await tableCount()).toHaveLength(1);
  });

  it('AC-07: updateTable a nombre ya usado lanza TABLE_NAME_TAKEN y nada cambia', async () => {
    const barra = await service.createTable({ name: 'Barra' });
    const mesa = await service.createTable({ name: 'Mesa 1' });
    await expect(service.updateTable(mesa.id, { name: 'BARRA' })).rejects.toMatchObject(
      TABLE_NAME_TAKEN,
    );
    // La mesa queda como estaba; la de Barra, intacta.
    expect(await tableRow(mesa.id)).toEqual([
      { name: 'Mesa 1', is_active: true, current_order_id: null },
    ]);
    expect(await tableRow(barra.id)).toEqual([
      { name: 'Barra', is_active: true, current_order_id: null },
    ]);
  });

  it('AC-07: desactivar una mesa cubierta lanza TABLE_HAS_OPEN_ORDER sin cambiar nada', async () => {
    const juan = await createUser('tablero.juan', 'Juan');
    const mesa = await service.createTable({ name: 'Mesa 1' });
    const orderId = await orderCovering(juan.id, [mesa.id]);
    await expect(service.updateTable(mesa.id, { isActive: false })).rejects.toMatchObject(
      TABLE_HAS_OPEN_ORDER,
    );
    // Ni la activación ni el puntero se tocaron: la mesa sigue ocupada por ese pedido.
    expect(await tableRow(mesa.id)).toEqual([
      { name: 'Mesa 1', is_active: true, current_order_id: orderId },
    ]);
    expect((await service.listTables())[0]).toMatchObject({
      state: 'occupied',
      isActive: true,
      order: { id: orderId },
    });
    // Renombrar una mesa ocupada sí se permite (no es desactivar).
    await expect(service.updateTable(mesa.id, { name: 'Mesa Uno' })).resolves.toMatchObject({
      name: 'Mesa Uno',
      state: 'occupied',
    });
  });

  it('AC-07: updateTable sobre una mesa inexistente lanza TABLE_NOT_FOUND', async () => {
    for (const changes of [{ name: 'X' }, { isActive: false }])
      await expect(service.updateTable(999999, changes)).rejects.toMatchObject(TABLE_NOT_FOUND);
    expect(await tableCount()).toHaveLength(0);
  });

  it('AC-07: los creadores de error de mesas devuelven el código, estado y mensaje de D-009-13', () => {
    expect(createTableNotFoundError()).toMatchObject(TABLE_NOT_FOUND);
    expect(createTableNameTakenError()).toMatchObject(TABLE_NAME_TAKEN);
    expect(createTableOccupiedError()).toMatchObject(TABLE_OCCUPIED);
    expect(createTableInactiveError()).toMatchObject(TABLE_INACTIVE);
    expect(createTableHasOpenOrderError()).toMatchObject(TABLE_HAS_OPEN_ORDER);
    expect(createTableHasNoOrderError()).toMatchObject(TABLE_HAS_NO_ORDER);
  });
});
