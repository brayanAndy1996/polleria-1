// AC-15 a AC-21. Spec 009 — archivo nuevo: va EN ROJO hasta que T-10 monte
// las rutas /api/tables y /api/orders con sus controllers y roles.
import request from 'supertest';
import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { orderSchema, tablesResponseSchema } from '@polleria/shared';
import type { Table, UserRole } from '@polleria/shared';
import { createOrderService } from '../src/services/orders/order.service.ts';
import { createTableService } from '../src/services/tables/table.service.ts';
import {
  clearOrderTables,
  closeTestDatabase,
  connectTestDatabase,
  migrateAndClearAuthTables,
} from './helpers/test-database.ts';
import { loginWithCookie, setupAuth, UNAUTHENTICATED_BODY } from './helpers/auth.ts';
import { sendRawBody } from './helpers/raw-body.ts';

const FORBIDDEN_BODY = {
  error: {
    code: 'FORBIDDEN',
    message: 'No tienes permiso para realizar esta acci\u00F3n.',
    details: null,
  },
};
const TABLE_NAME_TAKEN_BODY = {
  error: {
    code: 'TABLE_NAME_TAKEN',
    message: 'Ya existe una mesa con ese nombre.',
    details: null,
  },
};
const TABLE_NOT_FOUND_BODY = {
  error: { code: 'TABLE_NOT_FOUND', message: 'Esa mesa no existe.', details: null },
};
const TABLE_OCCUPIED_BODY = {
  error: {
    code: 'TABLE_OCCUPIED',
    message: 'La mesa ya tiene un pedido abierto.',
    details: null,
  },
};
const TABLE_INACTIVE_BODY = {
  error: {
    code: 'TABLE_INACTIVE',
    message: 'La mesa est\u00E1 desactivada.',
    details: null,
  },
};
const TABLE_HAS_OPEN_ORDER_BODY = {
  error: {
    code: 'TABLE_HAS_OPEN_ORDER',
    message: 'La mesa tiene un pedido abierto; ci\u00E9rralo o mu\u00E9velo antes de desactivarla.',
    details: null,
  },
};
const TABLE_HAS_NO_ORDER_BODY = {
  error: {
    code: 'TABLE_HAS_NO_ORDER',
    message: 'La mesa no tiene un pedido abierto.',
    details: null,
  },
};
const ORDER_NOT_FOUND_BODY = {
  error: { code: 'ORDER_NOT_FOUND', message: 'Ese pedido no existe.', details: null },
};
const ORDER_NOT_OPEN_BODY = {
  error: { code: 'ORDER_NOT_OPEN', message: 'El pedido ya est\u00E1 cerrado.', details: null },
};
const ORDER_NEEDS_TABLE_BODY = {
  error: {
    code: 'ORDER_NEEDS_TABLE',
    message: 'El pedido necesita al menos una mesa; canc\u00E9lalo o ci\u00E9rralo.',
    details: null,
  },
};
const NOT_FOUND_BODY = {
  error: { code: 'NOT_FOUND', message: 'La ruta solicitada no existe.', details: null },
};
const INVALID_JSON_BODY = {
  error: {
    code: 'INVALID_JSON',
    message: 'El cuerpo de la solicitud no es un JSON v\u00E1lido.',
    details: null,
  },
};
const INVALID_BODY_BODY = {
  error: {
    code: 'INVALID_BODY',
    message: 'No se pudo leer el cuerpo de la solicitud.',
    details: null,
  },
};
const PAYLOAD_TOO_LARGE_BODY = {
  error: {
    code: 'PAYLOAD_TOO_LARGE',
    message: 'La solicitud es demasiado grande.',
    details: null,
  },
};
const UNSUPPORTED_MEDIA_TYPE_BODY = {
  error: {
    code: 'UNSUPPORTED_MEDIA_TYPE',
    message: 'La codificaci\u00F3n del cuerpo de la solicitud no es compatible.',
    details: null,
  },
};
const TABLE_ID_MESSAGE = 'El identificador de la mesa no es v\u00E1lido.';
const ORDER_ID_MESSAGE = 'El identificador del pedido no es v\u00E1lido.';
const TABLE_DOES_NOT_EXIST_MESSAGE = 'Esa mesa no existe.';
const SAME_TABLE_MESSAGE = 'La mesa de destino debe ser otra.';
const NO_CHANGES_MESSAGE = 'No indicaste ning\u00FAn cambio.';

/** JSON válido de exactamente `bytes` bytes: {"a":"xxx...x"}. */
function jsonBodyOfSize(bytes: number): string {
  const overhead = Buffer.byteLength('{"a":""}');
  return `{"a":"${'x'.repeat(bytes - overhead)}"}`;
}

describe('009: API de mesas y pedidos contra polleria_test', () => {
  let sequelize: Sequelize;
  let auth: ReturnType<typeof setupAuth>;
  let tableService: ReturnType<typeof createTableService>;
  let orderService: ReturnType<typeof createOrderService>;

  beforeAll(async () => {
    sequelize = await connectTestDatabase();
  });
  beforeEach(async () => {
    await migrateAndClearAuthTables(sequelize);
    await clearOrderTables(sequelize);
    auth = setupAuth(sequelize);
    tableService = createTableService({ models: auth.models });
    orderService = createOrderService({ models: auth.models });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await closeTestDatabase(sequelize);
  });

  const rows = <T extends object>(sql: string, bind?: (string | number)[]) =>
    sequelize.query<T>(sql, { type: QueryTypes.SELECT, bind });
  const tableRow = (id: number) =>
    rows<{ name: string; is_active: boolean; current_order_id: number | null }>(
      'SELECT name, is_active, current_order_id FROM tables WHERE id = $1',
      [id],
    );
  const orderRow = (id: number) =>
    rows<{ status: string; cancel_reason: string | null; closed_by_user_id: number | null }>(
      'SELECT status, cancel_reason, closed_by_user_id FROM "orders" WHERE id = $1',
      [id],
    );

  /** Crea al administrador dueño y devuelve la cookie de su sesión real. */
  async function adminCookie() {
    await auth.createUser('mesa.dueno', 'Do\u00F1a Luz', ['admin'], '975310');
    return (await loginWithCookie(auth.app, 'mesa.dueno', '975310')).cookie;
  }
  /** Crea una usuaria con esos roles y devuelve la cookie de su sesión real. */
  async function cookieFor(username: string, roles: UserRole[], pin: string) {
    await auth.createUser(username, 'Persona', roles, pin);
    return (await loginWithCookie(auth.app, username, pin)).cookie;
  }
  /** Crea una mesa (y la desactiva si se pide) por el servicio, como fixture. */
  const createTable = async (name: string, isActive = true): Promise<Table> => {
    const table = await tableService.createTable({ name });
    if (!isActive) return await tableService.updateTable(table.id, { isActive: false });
    return table;
  };
  /** Abre un pedido por el servicio (fixture) y devuelve su Order. */
  const openAt = (tableId: number, userId: number) => orderService.openOrder(tableId, { userId });

  const getTables = (cookie?: string) => {
    const call = request(auth.app).get('/api/tables');
    return cookie === undefined ? call : call.set('Cookie', cookie);
  };
  const postTables = (body: unknown, cookie?: string) => {
    const call = request(auth.app)
      .post('/api/tables')
      .send(body as object);
    return cookie === undefined ? call : call.set('Cookie', cookie);
  };
  const patchTable = (id: number | string, body: unknown, cookie?: string) => {
    const call = request(auth.app)
      .patch(`/api/tables/${id}`)
      .send(body as object);
    return cookie === undefined ? call : call.set('Cookie', cookie);
  };
  const postOpenOrder = (id: number | string, cookie?: string) => {
    const call = request(auth.app).post(`/api/tables/${id}/orders`);
    return cookie === undefined ? call : call.set('Cookie', cookie);
  };
  const postJoin = (id: number | string, body: unknown, cookie?: string) => {
    const call = request(auth.app)
      .post(`/api/tables/${id}/join`)
      .send(body as object);
    return cookie === undefined ? call : call.set('Cookie', cookie);
  };
  const postLeave = (id: number | string, cookie?: string) => {
    const call = request(auth.app).post(`/api/tables/${id}/leave`);
    return cookie === undefined ? call : call.set('Cookie', cookie);
  };
  const getOrder = (id: number | string, cookie?: string) => {
    const call = request(auth.app).get(`/api/orders/${id}`);
    return cookie === undefined ? call : call.set('Cookie', cookie);
  };
  const postMove = (id: number | string, body: unknown, cookie?: string) => {
    const call = request(auth.app)
      .post(`/api/orders/${id}/move`)
      .send(body as object);
    return cookie === undefined ? call : call.set('Cookie', cookie);
  };
  const postSignal = (orderId: number | string, action: string, cookie?: string) => {
    const call = request(auth.app).post(`/api/orders/${orderId}/${action}`);
    return cookie === undefined ? call : call.set('Cookie', cookie);
  };
  const postCancel = (id: number | string, body: unknown, cookie?: string) => {
    const call = request(auth.app)
      .post(`/api/orders/${id}/cancel`)
      .send(body as object);
    return cookie === undefined ? call : call.set('Cookie', cookie);
  };

  function validationIssues(response: request.Response): { path: string; message: string }[] {
    expect(response.status).toBe(400);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({
      error: { code: 'VALIDATION_ERROR', message: 'Los datos enviados no son v\u00E1lidos.' },
    });
    const issues = (response.body as { error: { details: { issues: unknown } } }).error.details
      .issues;
    expect(Array.isArray(issues)).toBe(true);
    return issues as { path: string; message: string }[];
  }

  it('AC-15: GET /api/tables responde a cualquier rol con el tablero ordenado y no-store', async () => {
    const juan = await auth.createUser('mesa.juan', 'Juan', ['waiter'], '2468');
    const mesa2 = await createTable('Mesa 2');
    // Mesa 10 existe para comprobar el orden natural (2 va antes que 10), no se abre pedido en ella.
    await createTable('Mesa 10');
    const barra = await createTable('Barra');
    await createTable('Dep\u00F3sito', false);
    await openAt(mesa2.id, juan.id);
    await openAt(barra.id, juan.id);

    for (const [username, roles, pin] of [
      ['mesa.juan', ['waiter'], '2468'],
      ['mesa.cocina', ['kitchen'], '1357'],
      ['mesa.caja', ['cashier'], '8642'],
      ['mesa.dueno', ['admin'], '975310'],
    ] as [string, UserRole[], string][]) {
      // El mozo Juan ya existe: su cookie se loguea aparte de las demás.
      const cookie =
        username === 'mesa.juan'
          ? (await loginWithCookie(auth.app, username, pin)).cookie
          : await cookieFor(username, roles, pin);
      const response = await getTables(cookie);
      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(tablesResponseSchema.safeParse(response.body as unknown).success).toBe(true);
      const tables = (response.body as { tables: { name: string }[] }).tables;
      expect(tables.map((table) => table.name)).toEqual([
        'Barra',
        'Dep\u00F3sito',
        'Mesa 2',
        'Mesa 10',
      ]);
      for (const table of tables as Record<string, unknown>[])
        expect(Object.keys(table).sort()).toEqual(['id', 'isActive', 'name', 'order', 'state']);
    }
  });

  it('AC-15: GET /api/tables sin sesión responde 401 UNAUTHENTICATED con no-store', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await getTables();
    expect(response.status).toBe(401);
    expect(response.body).toEqual(UNAUTHENTICATED_BODY);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(log).not.toHaveBeenCalled();
  });

  it('AC-16: POST /api/tables crea la mesa como admin y exige el rol', async () => {
    const admin = await adminCookie();
    const created = await postTables({ name: '  Mesa 1  ' }, admin);
    expect(created.status).toBe(201);
    expect(created.headers['cache-control']).toBe('no-store');
    expect(created.body).toEqual({
      id: 1,
      name: 'Mesa 1',
      isActive: true,
      state: 'free',
      order: null,
    });
    // waiter, kitchen y cashier reciben 403 aunque manden un cuerpo válido.
    for (const [username, roles, pin] of [
      ['mesa.juan', ['waiter'], '2468'],
      ['mesa.cocina', ['kitchen'], '1357'],
      ['mesa.caja', ['cashier'], '8642'],
    ] as [string, UserRole[], string][]) {
      const forbidden = await postTables(
        { name: `Mesa de ${username}` },
        await cookieFor(username, roles, pin),
      );
      expect(forbidden.status).toBe(403);
      expect(forbidden.body).toEqual(FORBIDDEN_BODY);
      expect(forbidden.headers['cache-control']).toBe('no-store');
    }
    const anonymous = await postTables({ name: 'Mesa 2' });
    expect(anonymous.status).toBe(401);
    expect(anonymous.body).toEqual(UNAUTHENTICATED_BODY);
    expect(anonymous.headers['cache-control']).toBe('no-store');
    // Solo quedó la mesa del admin.
    expect(await rows('SELECT id FROM "tables"')).toEqual([{ id: 1 }]);
  });

  it('AC-16: POST con nombre repetido responde 409 exacto y la forma inválida 400', async () => {
    const admin = await adminCookie();
    await postTables({ name: 'Mesa 1' }, admin);
    const inactivo = await createTable('Dep\u00F3sito', false);
    expect(inactivo.isActive).toBe(false);
    // Repetido con otra capitalización o el de una mesa inactiva: 409 exacto.
    for (const name of ['mesa 1', 'MESA 1', 'dep\u00F3sito']) {
      const taken = await postTables({ name }, admin);
      expect(taken.status).toBe(409);
      expect(taken.body).toEqual(TABLE_NAME_TAKEN_BODY);
      expect(taken.headers['cache-control']).toBe('no-store');
    }
    // Forma inválida: 400 con issues (sin crear nada).
    for (const body of [
      {},
      { name: '' },
      { name: '   ' },
      { name: 'Mesa/1' },
      { name: 'x'.repeat(41) },
      { name: 'Mesa 9', extra: 1 },
      { name: 5 },
    ])
      expect(validationIssues(await postTables(body, admin)).length).toBeGreaterThan(0);
    expect(await rows('SELECT id FROM "tables"')).toHaveLength(2);
  });

  it('AC-16: PATCH activa, renombra, rechaza ocupada y responde sus errores', async () => {
    const admin = await adminCookie();
    const juan = await auth.createUser('mesa.juan', 'Juan', ['waiter'], '2468');
    const mesa = await createTable('Mesa 1');
    const renamed = await patchTable(mesa.id, { name: '  Barra  ' }, admin);
    expect(renamed.status).toBe(200);
    expect(renamed.headers['cache-control']).toBe('no-store');
    expect(renamed.body).toMatchObject({ name: 'Barra', isActive: true, state: 'free' });
    // Desactivar una libre: 200; sigue listada con isActive false.
    const off = await patchTable(mesa.id, { isActive: false }, admin);
    expect(off.status).toBe(200);
    expect(off.body).toMatchObject({ isActive: false });
    const on = await patchTable(mesa.id, { isActive: true }, admin);
    expect(on.status).toBe(200);
    expect(on.body).toMatchObject({ isActive: true });
    // Sobre una ocupada: 409 con su mensaje y sin tocar la fila.
    await openAt(mesa.id, juan.id);
    const occupied = await patchTable(mesa.id, { isActive: false }, admin);
    expect(occupied.status).toBe(409);
    expect(occupied.body).toEqual(TABLE_HAS_OPEN_ORDER_BODY);
    expect(occupied.headers['cache-control']).toBe('no-store');
    expect((await tableRow(mesa.id))[0]).toMatchObject({ is_active: true });
    // Inexistente: 404 exacto; forma inválida: 400 con el mensaje de la spec.
    const notFound = await patchTable(999999, { name: 'X' }, admin);
    expect(notFound.status).toBe(404);
    expect(notFound.body).toEqual(TABLE_NOT_FOUND_BODY);
    const empty = validationIssues(await patchTable(mesa.id, {}, admin));
    expect(empty.map((issue) => issue.message)).toContain(NO_CHANGES_MESSAGE);
    // Como mozo: 403.
    const mozo = await cookieFor('mesa.mozo', ['waiter'], '2468');
    const forbidden = await patchTable(mesa.id, { name: 'Otra' }, mozo);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toEqual(FORBIDDEN_BODY);
  });

  it('AC-17: POST /tables/{id}/orders abre la cuenta como mozo o admin y responde 201', async () => {
    const juan = await auth.createUser('mesa.juan', 'Juan', ['waiter'], '2468');
    const juanCookie = (await loginWithCookie(auth.app, 'mesa.juan', '2468')).cookie;
    const admin = await adminCookie();
    const mixta = await cookieFor('mesa.mixta', ['waiter', 'admin'], '5926');
    const mesa3 = await createTable('Mesa 3');

    const opened = await postOpenOrder(mesa3.id, juanCookie);
    expect(opened.status).toBe(201);
    expect(opened.headers['cache-control']).toBe('no-store');
    expect(orderSchema.safeParse(opened.body as unknown).success).toBe(true);
    // El actor es el usuario de la sesión, no uno del cuerpo (T-10).
    expect(opened.body).toMatchObject({
      status: 'open',
      tables: [{ id: mesa3.id, name: 'Mesa 3' }],
      openedBy: { id: juan.id, displayName: 'Juan' },
      readyAt: null,
      billRequestedAt: null,
      closedAt: null,
      closedBy: null,
      cancelReason: null,
      mergedIntoOrderId: null,
    });
    expect((await tableRow(mesa3.id))[0]?.current_order_id).toBe(
      (opened.body as { id: number }).id,
    );
    // Admin y una usuaria con ambos roles también abren.
    const mesa4 = await createTable('Mesa 4');
    const mesa5 = await createTable('Mesa 5');
    for (const [mesa, cookie] of [
      [mesa4.id, admin],
      [mesa5.id, mixta],
    ] as [number, string][]) {
      const response = await postOpenOrder(mesa, cookie);
      expect(response.status).toBe(201);
      expect(orderSchema.safeParse(response.body as unknown).success).toBe(true);
    }
  });

  it('AC-17: abrir con cocina, caja, sin sesión o en mesa ocupada/inactiva/inexistente responde su código', async () => {
    const juan = await auth.createUser('mesa.juan', 'Juan', ['waiter'], '2468');
    const mozo = (await loginWithCookie(auth.app, 'mesa.juan', '2468')).cookie;
    const ocupada = await createTable('Mesa 1');
    const inactiva = await createTable('Dep\u00F3sito', false);
    const libre = await createTable('Mesa 2');
    await openAt(ocupada.id, juan.id);
    // Cocina y caja no abren cuentas; sin sesión es 401.
    for (const [username, roles, pin] of [
      ['mesa.cocina', ['kitchen'], '1357'],
      ['mesa.caja', ['cashier'], '8642'],
    ] as [string, UserRole[], string][]) {
      const forbidden = await postOpenOrder(libre.id, await cookieFor(username, roles, pin));
      expect(forbidden.status).toBe(403);
      expect(forbidden.body).toEqual(FORBIDDEN_BODY);
      expect(forbidden.headers['cache-control']).toBe('no-store');
    }
    const anonymous = await postOpenOrder(libre.id);
    expect(anonymous.status).toBe(401);
    expect(anonymous.body).toEqual(UNAUTHENTICATED_BODY);
    // Los estados de la mesa responden sus 409/404 exactos.
    for (const [id, expected] of [
      [ocupada.id, TABLE_OCCUPIED_BODY],
      [inactiva.id, TABLE_INACTIVE_BODY],
      [999999, TABLE_NOT_FOUND_BODY],
    ] as [number, typeof TABLE_OCCUPIED_BODY][]) {
      const response = await postOpenOrder(id, mozo);
      expect(response.status).toBe(expected === TABLE_NOT_FOUND_BODY ? 404 : 409);
      expect(response.body).toEqual(expected);
      expect(response.headers['cache-control']).toBe('no-store');
    }
    // Parámetros hostiles: 400 con el issue en tableId y el mensaje exacto.
    for (const id of ['abc', '0', '1.5', '-3', '2147483648', '%', '1%20']) {
      const issues = validationIssues(await postOpenOrder(id, mozo));
      expect(issues[0]).toEqual({ path: 'tableId', message: TABLE_ID_MESSAGE });
    }
    // '0009' se acepta como el 9 (regla de productId, D-009-13).
    const mesa9 = await createTable('Mesa 9');
    const leadingZero = await postOpenOrder(`00${mesa9.id}`, mozo);
    expect(leadingZero.status).toBe(201);
    // Ningún pedido extra quedó por los rechazos.
    expect(await rows('SELECT id FROM "orders"')).toHaveLength(2);
  });

  it('AC-17: dos mozos abriendo la misma mesa a la vez: uno entra y el otro recibe 409', async () => {
    await auth.createUser('mesa.juan', 'Juan', ['waiter'], '2468');
    await auth.createUser('mesa.beto', 'Beto', ['waiter'], '1357');
    const juanCookie = (await loginWithCookie(auth.app, 'mesa.juan', '2468')).cookie;
    const betoCookie = (await loginWithCookie(auth.app, 'mesa.beto', '1357')).cookie;
    const mesa3 = await createTable('Mesa 3');
    // Las dos solicitudes compiten: la serialización de la fila decide al ganador.
    const [first, second] = await Promise.all([
      postOpenOrder(mesa3.id, juanCookie),
      postOpenOrder(mesa3.id, betoCookie),
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 409]);
    const conflicted = first.status === 409 ? first : second;
    expect(conflicted.body).toEqual(TABLE_OCCUPIED_BODY);
    expect(conflicted.headers['cache-control']).toBe('no-store');
    // Solo quedó un pedido y una sola ocupación de Mesa 3.
    expect(await rows('SELECT id FROM "orders"')).toHaveLength(1);
    expect(await rows('SELECT id FROM "tables" WHERE current_order_id IS NOT NULL')).toHaveLength(
      1,
    );
  });

  it('AC-17: GET /api/orders/{id} responde a cualquier rol con el pedido y su no-store', async () => {
    const juan = await auth.createUser('mesa.juan', 'Juan', ['waiter'], '2468');
    const mesa3 = await createTable('Mesa 3');
    const order = await openAt(mesa3.id, juan.id);
    for (const [username, roles, pin] of [
      ['mesa.juan', ['waiter'], '2468'],
      ['mesa.cocina', ['kitchen'], '1357'],
      ['mesa.caja', ['cashier'], '8642'],
      ['mesa.dueno', ['admin'], '975310'],
    ] as [string, UserRole[], string][]) {
      const cookie =
        username === 'mesa.juan'
          ? (await loginWithCookie(auth.app, username, pin)).cookie
          : await cookieFor(username, roles, pin);
      const response = await getOrder(order.id, cookie);
      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(orderSchema.safeParse(response.body as unknown).success).toBe(true);
      expect(response.body).toMatchObject({
        id: order.id,
        status: 'open',
        tables: [{ id: mesa3.id, name: 'Mesa 3' }],
        openedBy: { id: juan.id, displayName: 'Juan' },
      });
    }
    // Sin sesión: 401; inexistente: 404 exacto; inválido: 400 con issue en orderId.
    const anonymous = await getOrder(order.id);
    expect(anonymous.status).toBe(401);
    expect(anonymous.body).toEqual(UNAUTHENTICATED_BODY);
    const notFound = await getOrder(999999, await cookieFor('mesa.otro', ['waiter'], '2468'));
    expect(notFound.status).toBe(404);
    expect(notFound.body).toEqual(ORDER_NOT_FOUND_BODY);
    expect(notFound.headers['cache-control']).toBe('no-store');
    const mozo = (await loginWithCookie(auth.app, 'mesa.otro', '2468')).cookie;
    for (const id of ['abc', '0', '1.5', '-3', '2147483648', '%']) {
      const issues = validationIssues(await getOrder(id, mozo));
      expect(issues[0]).toEqual({ path: 'orderId', message: ORDER_ID_MESSAGE });
    }
  });

  it('AC-18: join suma la mesa libre y fusiona la de otra cuenta, con el pedido en respuesta', async () => {
    const juan = await auth.createUser('mesa.juan', 'Juan', ['waiter'], '2468');
    const mozo = (await loginWithCookie(auth.app, 'mesa.juan', '2468')).cookie;
    const mesa3 = await createTable('Mesa 3');
    const mesa4 = await createTable('Mesa 4');
    const mesa5 = await createTable('Mesa 5');
    const p = await openAt(mesa3.id, juan.id);
    const q = await openAt(mesa4.id, juan.id);

    // libre → ocupada: Mesa 5 se suma a la cuenta P de Mesa 3.
    const joined = await postJoin(mesa5.id, { intoTableId: mesa3.id }, mozo);
    expect(joined.status).toBe(200);
    expect(joined.headers['cache-control']).toBe('no-store');
    expect(orderSchema.safeParse(joined.body as unknown).success).toBe(true);
    expect(joined.body).toMatchObject({
      id: p.id,
      tables: [
        { id: mesa3.id, name: 'Mesa 3' },
        { id: mesa5.id, name: 'Mesa 5' },
      ],
    });
    // ocupada → ocupada: Q se fusiona en P y queda consultable como merged.
    const merged = await postJoin(mesa4.id, { intoTableId: mesa3.id }, mozo);
    expect(merged.status).toBe(200);
    // El orden de `tables` tras el merge no lo fija la spec: se verifica el conjunto.
    expect(merged.body).toMatchObject({ id: p.id, status: 'open' });
    const mergedTables = (merged.body as { tables: { id: number; name: string }[] }).tables;
    expect(mergedTables).toHaveLength(3);
    expect(mergedTables).toEqual(
      expect.arrayContaining([
        { id: mesa3.id, name: 'Mesa 3' },
        { id: mesa4.id, name: 'Mesa 4' },
        { id: mesa5.id, name: 'Mesa 5' },
      ]),
    );
    const absorbed = await getOrder(q.id, mozo);
    expect(absorbed.status).toBe(200);
    expect(absorbed.body).toMatchObject({
      id: q.id,
      status: 'merged',
      tables: [],
      mergedIntoOrderId: p.id,
      closedBy: { id: juan.id, displayName: 'Juan' },
    });
  });

  it('AC-18: join responde sus 409/400/403 según el destino y el rol', async () => {
    const juan = await auth.createUser('mesa.juan', 'Juan', ['waiter'], '2468');
    const mozo = (await loginWithCookie(auth.app, 'mesa.juan', '2468')).cookie;
    const mesa3 = await createTable('Mesa 3');
    const mesa4 = await createTable('Mesa 4');
    const inactiva = await createTable('Dep\u00F3sito', false);
    await openAt(mesa3.id, juan.id);
    // Destino libre e inactivo.
    const libre = await postJoin(mesa3.id, { intoTableId: mesa4.id }, mozo);
    expect(libre.status).toBe(409);
    expect(libre.body).toEqual(TABLE_HAS_NO_ORDER_BODY);
    const inactivoDestino = await postJoin(mesa3.id, { intoTableId: inactiva.id }, mozo);
    expect(inactivoDestino.status).toBe(409);
    expect(inactivoDestino.body).toEqual(TABLE_INACTIVE_BODY);
    // Destino inexistente, igual al origen o de forma inválida: 400 con issue.
    const noExiste = validationIssues(await postJoin(mesa3.id, { intoTableId: 999999 }, mozo));
    expect(noExiste).toEqual([{ path: 'intoTableId', message: TABLE_DOES_NOT_EXIST_MESSAGE }]);
    const misma = validationIssues(await postJoin(mesa3.id, { intoTableId: mesa3.id }, mozo));
    expect(misma).toEqual([{ path: 'intoTableId', message: SAME_TABLE_MESSAGE }]);
    for (const body of [{}, { intoTableId: '4' }, { intoTableId: 0 }, { intoTableId: 1.5 }]) {
      const issues = validationIssues(await postJoin(mesa3.id, body, mozo));
      expect(issues[0]?.path).toBe('intoTableId');
    }
    // Cocina y caja no unen mesas; sin sesión es 401.
    for (const [username, roles, pin] of [
      ['mesa.cocina', ['kitchen'], '1357'],
      ['mesa.caja', ['cashier'], '8642'],
    ] as [string, UserRole[], string][]) {
      const forbidden = await postJoin(
        mesa4.id,
        { intoTableId: mesa3.id },
        await cookieFor(username, roles, pin),
      );
      expect(forbidden.status).toBe(403);
      expect(forbidden.body).toEqual(FORBIDDEN_BODY);
    }
    const anonymous = await postJoin(mesa4.id, { intoTableId: mesa3.id });
    expect(anonymous.status).toBe(401);
    expect(anonymous.body).toEqual(UNAUTHENTICATED_BODY);
  });

  it('AC-18: leave suelta la mesa unida y responde sus errores', async () => {
    const juan = await auth.createUser('mesa.juan', 'Juan', ['waiter'], '2468');
    const mozo = (await loginWithCookie(auth.app, 'mesa.juan', '2468')).cookie;
    const mesa3 = await createTable('Mesa 3');
    const mesa5 = await createTable('Mesa 5');
    const mesa7 = await createTable('Mesa 7');
    const p = await openAt(mesa3.id, juan.id);
    await postJoin(mesa5.id, { intoTableId: mesa3.id }, mozo);
    // Separar Mesa 5 deja a P solo con Mesa 3.
    const left = await postLeave(mesa5.id, mozo);
    expect(left.status).toBe(200);
    expect(left.headers['cache-control']).toBe('no-store');
    expect(orderSchema.safeParse(left.body as unknown).success).toBe(true);
    expect(left.body).toMatchObject({
      id: p.id,
      tables: [{ id: mesa3.id, name: 'Mesa 3' }],
    });
    expect((await tableRow(mesa5.id))[0]?.current_order_id).toBeNull();
    // Última mesa del pedido: 409 ORDER_NEEDS_TABLE; mesa libre: TABLE_HAS_NO_ORDER;
    // inexistente: TABLE_NOT_FOUND; cocina: 403; sin sesión: 401.
    const last = await postLeave(mesa3.id, mozo);
    expect(last.status).toBe(409);
    expect(last.body).toEqual(ORDER_NEEDS_TABLE_BODY);
    const sinPedido = await postLeave(mesa7.id, mozo);
    expect(sinPedido.status).toBe(409);
    expect(sinPedido.body).toEqual(TABLE_HAS_NO_ORDER_BODY);
    const noExiste = await postLeave(999999, mozo);
    expect(noExiste.status).toBe(404);
    expect(noExiste.body).toEqual(TABLE_NOT_FOUND_BODY);
    const forbidden = await postLeave(
      mesa3.id,
      await cookieFor('mesa.cocina', ['kitchen'], '1357'),
    );
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toEqual(FORBIDDEN_BODY);
    const anonymous = await postLeave(mesa3.id);
    expect(anonymous.status).toBe(401);
    expect(anonymous.body).toEqual(UNAUTHENTICATED_BODY);
    // El pedido siguió abierto en Mesa 3 pese a los rechazos.
    expect((await orderRow(p.id))[0]?.status).toBe('open');
    expect((await tableRow(mesa3.id))[0]?.current_order_id).toBe(p.id);
  });

  it('AC-19: move lleva el pedido a la mesa nueva y responde sus errores por HTTP', async () => {
    const juan = await auth.createUser('mesa.juan', 'Juan', ['waiter'], '2468');
    const mozo = (await loginWithCookie(auth.app, 'mesa.juan', '2468')).cookie;
    const mesa3 = await createTable('Mesa 3');
    const mesa4 = await createTable('Mesa 4');
    const mesa7 = await createTable('Mesa 7');
    const inactiva = await createTable('Dep\u00F3sito', false);
    const p = await openAt(mesa3.id, juan.id);
    await openAt(mesa4.id, juan.id);

    const moved = await postMove(p.id, { tableId: mesa7.id }, mozo);
    expect(moved.status).toBe(200);
    expect(moved.headers['cache-control']).toBe('no-store');
    expect(orderSchema.safeParse(moved.body as unknown).success).toBe(true);
    expect(moved.body).toMatchObject({
      id: p.id,
      tables: [{ id: mesa7.id, name: 'Mesa 7' }],
    });
    expect((await tableRow(mesa3.id))[0]?.current_order_id).toBeNull();
    // Destino ocupado e inactivo: 409 exactos.
    const ocupada = await postMove(p.id, { tableId: mesa4.id }, mozo);
    expect(ocupada.status).toBe(409);
    expect(ocupada.body).toEqual(TABLE_OCCUPIED_BODY);
    const inactivoDestino = await postMove(p.id, { tableId: inactiva.id }, mozo);
    expect(inactivoDestino.status).toBe(409);
    expect(inactivoDestino.body).toEqual(TABLE_INACTIVE_BODY);
    // Destino inexistente e inválido: 400 con issue en tableId.
    const noExiste = validationIssues(await postMove(p.id, { tableId: 999999 }, mozo));
    expect(noExiste).toEqual([{ path: 'tableId', message: TABLE_DOES_NOT_EXIST_MESSAGE }]);
    for (const body of [{}, { tableId: '7' }, { tableId: 0 }, { tableId: 1.5 }]) {
      const issues = validationIssues(await postMove(p.id, body, mozo));
      expect(issues[0]?.path).toBe('tableId');
    }
    // Pedido cerrado: 409 ORDER_NOT_OPEN; pedido inexistente: 404; cocina: 403.
    await postCancel(p.id, { reason: 'Se fueron' }, mozo);
    const cerrado = await postMove(p.id, { tableId: mesa3.id }, mozo);
    expect(cerrado.status).toBe(409);
    expect(cerrado.body).toEqual(ORDER_NOT_OPEN_BODY);
    const noPedido = await postMove(999999, { tableId: mesa3.id }, mozo);
    expect(noPedido.status).toBe(404);
    expect(noPedido.body).toEqual(ORDER_NOT_FOUND_BODY);
    const forbidden = await postMove(
      p.id,
      { tableId: mesa3.id },
      await cookieFor('mesa.cocina', ['kitchen'], '1357'),
    );
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toEqual(FORBIDDEN_BODY);
  });

  it('AC-19: request-bill es de mozo/admin, ready suma cocina y served vuelve a mozo/admin', async () => {
    const juan = await auth.createUser('mesa.juan', 'Juan', ['waiter'], '2468');
    const mozo = (await loginWithCookie(auth.app, 'mesa.juan', '2468')).cookie;
    const cocina = await cookieFor('mesa.cocina', ['kitchen'], '1357');
    const caja = await cookieFor('mesa.caja', ['cashier'], '8642');
    const admin = await adminCookie();
    const mesa3 = await createTable('Mesa 3');
    const p = await openAt(mesa3.id, juan.id);

    // request-bill: mozo y admin entran; cocina y caja no.
    const billed = await postSignal(p.id, 'request-bill', mozo);
    expect(billed.status).toBe(200);
    expect(billed.headers['cache-control']).toBe('no-store');
    expect(billed.body).toMatchObject({ id: p.id, billRequestedAt: expect.any(String) as unknown });
    for (const cookie of [cocina, caja]) {
      const forbidden = await postSignal(p.id, 'request-bill', cookie);
      expect(forbidden.status).toBe(403);
      expect(forbidden.body).toEqual(FORBIDDEN_BODY);
    }
    // ready: cocina, mozo y admin entran; caja no.
    const ready = await postSignal(p.id, 'ready', cocina);
    expect(ready.status).toBe(200);
    expect(ready.body).toMatchObject({ id: p.id, readyAt: expect.any(String) as unknown });
    const cashierReady = await postSignal(p.id, 'ready', caja);
    expect(cashierReady.status).toBe(403);
    // served: mozo y admin entran; cocina no.
    const served = await postSignal(p.id, 'served', mozo);
    expect(served.status).toBe(200);
    expect(served.body).toMatchObject({ id: p.id, readyAt: null });
    const kitchenServed = await postSignal(p.id, 'served', cocina);
    expect(kitchenServed.status).toBe(403);
    expect(kitchenServed.body).toEqual(FORBIDDEN_BODY);
    // Admin también puede request-bill sobre el mismo pedido (no-op por la marca puesta).
    const billedByAdmin = await postSignal(p.id, 'request-bill', admin);
    expect(billedByAdmin.status).toBe(200);
    const billedBody = billed.body as { billRequestedAt: unknown };
    expect(billedByAdmin.body).toMatchObject({ billRequestedAt: billedBody.billRequestedAt });
    // Sin sesión: 401 en las señales.
    const anonymous = await postSignal(p.id, 'ready');
    expect(anonymous.status).toBe(401);
    expect(anonymous.body).toEqual(UNAUTHENTICATED_BODY);
    // Pedido inexistente: 404 exacto en las tres señales.
    for (const action of ['request-bill', 'ready', 'served']) {
      const notFound = await postSignal(999999, action, mozo);
      expect(notFound.status).toBe(404);
      expect(notFound.body).toEqual(ORDER_NOT_FOUND_BODY);
    }
  });

  it('AC-19: repetir ready y request-bill por HTTP es un no-op con la primera marca', async () => {
    const juan = await auth.createUser('mesa.juan', 'Juan', ['waiter'], '2468');
    await auth.createUser('mesa.beto', 'Beto', ['waiter'], '1357');
    const mozoJuan = (await loginWithCookie(auth.app, 'mesa.juan', '2468')).cookie;
    const mozoBeto = (await loginWithCookie(auth.app, 'mesa.beto', '1357')).cookie;
    const mesa3 = await createTable('Mesa 3');
    const p = await openAt(mesa3.id, juan.id);

    const firstBill = await postSignal(p.id, 'request-bill', mozoJuan);
    const secondBill = await postSignal(p.id, 'request-bill', mozoBeto);
    expect(secondBill.status).toBe(200);
    // La marca viaja con la primera fecha (y el primer autor, verificable en fila).
    const firstBillBody = firstBill.body as { billRequestedAt: unknown };
    expect(secondBill.body).toMatchObject({ billRequestedAt: firstBillBody.billRequestedAt });
    const firstReady = await postSignal(p.id, 'ready', mozoBeto);
    const secondReady = await postSignal(p.id, 'ready', mozoJuan);
    expect(secondReady.status).toBe(200);
    const firstReadyBody = firstReady.body as { readyAt: unknown };
    expect(secondReady.body).toMatchObject({ readyAt: firstReadyBody.readyAt });
  });

  it('AC-20: cancel con motivo como mozo o admin cierra el pedido y libera sus mesas', async () => {
    const juan = await auth.createUser('mesa.juan', 'Juan', ['waiter'], '2468');
    const mozo = (await loginWithCookie(auth.app, 'mesa.juan', '2468')).cookie;
    const admin = await adminCookie();
    const mesa3 = await createTable('Mesa 3');
    const mesa5 = await createTable('Mesa 5');
    const p = await openAt(mesa3.id, juan.id);
    await postJoin(mesa5.id, { intoTableId: mesa3.id }, mozo);

    const cancelled = await postCancel(p.id, { reason: 'Se sentaron por error' }, mozo);
    expect(cancelled.status).toBe(200);
    expect(cancelled.headers['cache-control']).toBe('no-store');
    expect(orderSchema.safeParse(cancelled.body as unknown).success).toBe(true);
    expect(cancelled.body).toMatchObject({
      id: p.id,
      status: 'cancelled',
      tables: [],
      cancelReason: 'Se sentaron por error',
      closedBy: { id: juan.id, displayName: 'Juan' },
      closedAt: expect.any(String) as unknown,
    });
    // Las dos mesas quedaron libres; el tablero las muestra 'free'.
    for (const id of [mesa3.id, mesa5.id])
      expect((await tableRow(id))[0]?.current_order_id).toBeNull();
    const tablero = await getTables(mozo);
    for (const id of [mesa3.id, mesa5.id])
      expect(
        (tablero.body as { tables: { id: number; state: string }[] }).tables.find(
          (table) => table.id === id,
        )?.state,
      ).toBe('free');
    // El GET posterior muestra el cancelado con motivo y autor (RN-009-04).
    const detail = await getOrder(p.id, mozo);
    expect(detail.body).toMatchObject({
      status: 'cancelled',
      cancelReason: 'Se sentaron por error',
      closedBy: { id: juan.id },
    });
    // Admin también cancela (sobre un pedido nuevo).
    const mesa4 = await createTable('Mesa 4');
    const q = await openAt(mesa4.id, juan.id);
    const byAdmin = await postCancel(q.id, { reason: 'Error de apertura' }, admin);
    expect(byAdmin.status).toBe(200);
    expect(byAdmin.body).toMatchObject({ status: 'cancelled' });
  });

  it('AC-20: sin motivo, pedido cerrado, cocina/caja o sin sesión responden su código', async () => {
    const juan = await auth.createUser('mesa.juan', 'Juan', ['waiter'], '2468');
    const mozo = (await loginWithCookie(auth.app, 'mesa.juan', '2468')).cookie;
    const mesa3 = await createTable('Mesa 3');
    const p = await openAt(mesa3.id, juan.id);
    // Sin motivo, motivo vacío o demasiado largo: 400 con issue en reason.
    for (const body of [{}, { reason: '' }, { reason: '  ' }, { reason: 'x'.repeat(201) }]) {
      const issues = validationIssues(await postCancel(p.id, body, mozo));
      expect(issues[0]?.path).toBe('reason');
    }
    // Pedido inexistente: 404; luego se cancela de verdad y reintentar da 409.
    const noPedido = await postCancel(999999, { reason: 'Error' }, mozo);
    expect(noPedido.status).toBe(404);
    expect(noPedido.body).toEqual(ORDER_NOT_FOUND_BODY);
    await postCancel(p.id, { reason: 'Se sentaron por error' }, mozo);
    const again = await postCancel(p.id, { reason: 'Otro' }, mozo);
    expect(again.status).toBe(409);
    expect(again.body).toEqual(ORDER_NOT_OPEN_BODY);
    // Cocina y caja no cancelan; sin sesión es 401.
    for (const [username, roles, pin] of [
      ['mesa.cocina', ['kitchen'], '1357'],
      ['mesa.caja', ['cashier'], '8642'],
    ] as [string, UserRole[], string][]) {
      const forbidden = await postCancel(
        p.id,
        { reason: 'Error' },
        await cookieFor(username, roles, pin),
      );
      expect(forbidden.status).toBe(403);
      expect(forbidden.body).toEqual(FORBIDDEN_BODY);
    }
    const anonymous = await postCancel(p.id, { reason: 'Error' });
    expect(anonymous.status).toBe(401);
    expect(anonymous.body).toEqual(UNAUTHENTICATED_BODY);
  });

  it('AC-21: los métodos no declarados responden 404 con Cache-Control: no-store', async () => {
    const mozo = await cookieFor('mesa.juan', ['waiter'], '2468');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const calls = [
      request(auth.app).delete('/api/tables/1'),
      request(auth.app).get('/api/orders/1/move'),
      request(auth.app).post('/api/tables/1/orders/1'),
      request(auth.app).patch('/api/orders/1').send({ status: 'closed' }),
    ];
    for (const call of calls) {
      const response = await call.set('Cookie', mozo);
      expect(response.status).toBe(404);
      expect(response.body).toEqual(NOT_FOUND_BODY);
      expect(response.headers['cache-control']).toBe('no-store');
    }
    expect(log).not.toHaveBeenCalled();
  });

  it('AC-21: los errores del lector del cuerpo en las cinco rutas con cuerpo llevan no-store', async () => {
    const admin = await adminCookie();
    const juan = await auth.createUser('mesa.juan', 'Juan', ['waiter'], '2468');
    const mozo = (await loginWithCookie(auth.app, 'mesa.juan', '2468')).cookie;
    const mesa3 = await createTable('Mesa 3');
    const p = await openAt(mesa3.id, juan.id);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Las cinco rutas que leen cuerpo (T-10): POST tables, PATCH tables/{id},
    // move, join y cancel. Una fábrica por ruta: cada envío usa una instancia nueva.
    const bodyRouteFactories = [
      () => request(auth.app).post('/api/tables').set('Cookie', admin),
      () => request(auth.app).patch(`/api/tables/${mesa3.id}`).set('Cookie', admin),
      () => request(auth.app).post(`/api/orders/${p.id}/move`).set('Cookie', mozo),
      () => request(auth.app).post(`/api/tables/${mesa3.id}/join`).set('Cookie', mozo),
      () => request(auth.app).post(`/api/orders/${p.id}/cancel`).set('Cookie', mozo),
    ];
    for (const makeCall of bodyRouteFactories) {
      // JSON mal formado: 400 INVALID_JSON.
      const badJson = await sendRawBody(
        makeCall().set('Content-Type', 'application/json'),
        Buffer.from('{"name":'),
      );
      expect(badJson.status).toBe(400);
      expect(badJson.body).toEqual(INVALID_JSON_BODY);
      expect(badJson.headers['cache-control']).toBe('no-store');
      // JSON válido que no es objeto: 400 INVALID_BODY.
      const notObject = await sendRawBody(
        makeCall().set('Content-Type', 'application/json'),
        Buffer.from('[1, 2]'),
      );
      expect(notObject.status).toBe(400);
      expect(notObject.body).toEqual(INVALID_BODY_BODY);
      expect(notObject.headers['cache-control']).toBe('no-store');
      // Content-Type no JSON con cuerpo: 415.
      const wrongType = await sendRawBody(
        makeCall().set('Content-Type', 'text/plain'),
        Buffer.from('{"a":1}'),
      );
      expect(wrongType.status).toBe(415);
      expect(wrongType.body).toEqual(UNSUPPORTED_MEDIA_TYPE_BODY);
      expect(wrongType.headers['cache-control']).toBe('no-store');
      // Más de 100 KB: 413.
      const tooLarge = await sendRawBody(
        makeCall().set('Content-Type', 'application/json'),
        Buffer.from(jsonBodyOfSize(150 * 1024)),
      );
      expect(tooLarge.status).toBe(413);
      expect(tooLarge.body).toEqual(PAYLOAD_TOO_LARGE_BODY);
      expect(tooLarge.headers['cache-control']).toBe('no-store');
    }
    expect(log).not.toHaveBeenCalled();
  });
});
