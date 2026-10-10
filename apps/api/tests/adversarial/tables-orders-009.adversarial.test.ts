import request from 'supertest';
import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize';
import { brotliCompressSync, deflateSync, gzipSync } from 'node:zlib';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Order, Table, UserRole } from '@polleria/shared';
import { orderSchema, tablesResponseSchema } from '@polleria/shared';
import { assertTestDatabase } from '../../src/db/assert-test-database.ts';
import { getPostgresConnectionParts } from '../../src/db/postgres-url.ts';
import { SESSION_DURATION_MS } from '../../src/services/auth/session.service.ts';
import { createOrderService } from '../../src/services/orders/order.service.ts';
import { createTableService } from '../../src/services/tables/table.service.ts';
import {
  assertConnectedToTestDatabase,
  clearAuthTables,
  clearOrderTables,
  closeTestDatabase,
  connectTestDatabase,
  getTestDatabaseUrl,
  migrateAndClearAuthTables,
} from '../helpers/test-database.ts';
import { loginWithCookie, setupAuth, UNAUTHENTICATED_BODY } from '../helpers/auth.ts';
import { sendRawBody } from '../helpers/raw-body.ts';

const FORBIDDEN_BODY = {
  error: {
    code: 'FORBIDDEN',
    message: 'No tienes permiso para realizar esta acci\u00f3n.',
    details: null,
  },
};
const TABLE_NOT_FOUND_BODY = {
  error: { code: 'TABLE_NOT_FOUND', message: 'Esa mesa no existe.', details: null },
};
const ORDER_NOT_FOUND_BODY = {
  error: { code: 'ORDER_NOT_FOUND', message: 'Ese pedido no existe.', details: null },
};
const TABLE_NAME_TAKEN_BODY = {
  error: { code: 'TABLE_NAME_TAKEN', message: 'Ya existe una mesa con ese nombre.', details: null },
};
const TABLE_OCCUPIED_BODY = {
  error: { code: 'TABLE_OCCUPIED', message: 'La mesa ya tiene un pedido abierto.', details: null },
};
const TABLE_INACTIVE_BODY = {
  error: { code: 'TABLE_INACTIVE', message: 'La mesa est\u00e1 desactivada.', details: null },
};
const TABLE_HAS_OPEN_ORDER_BODY = {
  error: {
    code: 'TABLE_HAS_OPEN_ORDER',
    message: 'La mesa tiene un pedido abierto; ci\u00e9rralo o mu\u00e9velo antes de desactivarla.',
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
const ORDER_NOT_OPEN_BODY = {
  error: { code: 'ORDER_NOT_OPEN', message: 'El pedido ya est\u00e1 cerrado.', details: null },
};
const ORDER_NEEDS_TABLE_BODY = {
  error: {
    code: 'ORDER_NEEDS_TABLE',
    message: 'El pedido necesita al menos una mesa; canc\u00e9lalo o ci\u00e9rralo.',
    details: null,
  },
};
const NOT_FOUND_BODY = {
  error: { code: 'NOT_FOUND', message: 'La ruta solicitada no existe.', details: null },
};
const INVALID_JSON_BODY = {
  error: {
    code: 'INVALID_JSON',
    message: 'El cuerpo de la solicitud no es un JSON v\u00e1lido.',
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
const UNSUPPORTED_MEDIA_TYPE_BODY = {
  error: {
    code: 'UNSUPPORTED_MEDIA_TYPE',
    message: 'La codificaci\u00f3n del cuerpo de la solicitud no es compatible.',
    details: null,
  },
};
const PAYLOAD_TOO_LARGE_BODY = {
  error: { code: 'PAYLOAD_TOO_LARGE', message: 'La solicitud es demasiado grande.', details: null },
};
const TABLE_ID_MESSAGE = 'El identificador de la mesa no es v\u00e1lido.';
const ORDER_ID_MESSAGE = 'El identificador del pedido no es v\u00e1lido.';
const TABLE_DOES_NOT_EXIST_MESSAGE = 'Esa mesa no existe.';
const ADMIN_PIN = '975310';

/** JSON válido de exactamente `bytes` bytes: {"a":"xxx...x"}. */
function jsonBodyOfSize(bytes: number): string {
  const overhead = Buffer.byteLength('{"a":""}');
  return `{"a":"${'x'.repeat(bytes - overhead)}"}`;
}

/** Los issues de un VALIDATION_ERROR (el body de supertest es any). */
const issuesOf = (response: { body: unknown }) =>
  (response.body as { error: { details: { issues: { path: string; message: string }[] } } }).error
    .details.issues;

/** El código de error estándar de la API (el body de supertest llega como any). */
const errorCode = (response: { body: unknown }) =>
  (response.body as { error?: { code?: string } }).error?.code;

/**
 * Guardia estricta de la conexión de pruebas (idéntica a la de la 006/007): la URL
 * debe ser exactamente polleria_test en localhost como usuario polleria, sin
 * parámetros extra, antes de permitir cualquier SQL directo de las pruebas.
 * `orders` y `tables` están autorizadas a limpieza (D-009-15) igual que products.
 */
function assertAuthorizedUrl(): void {
  const url = getTestDatabaseUrl();
  const parts = getPostgresConnectionParts(url);
  const parsed = new URL(url);
  if (
    assertTestDatabase(url) !== 'polleria_test' ||
    parts?.database !== 'polleria_test' ||
    !['localhost', '127.0.0.1'].includes(parts.host) ||
    parts.port !== 5432 ||
    parts.username !== 'polleria' ||
    parsed.search !== '' ||
    parsed.hash !== ''
  )
    throw new Error(
      'La conexi\u00f3n no cumple la autorizaci\u00f3n local exclusiva para polleria_test.',
    );
}

async function assertAuthorizedConnection(sequelize: Sequelize): Promise<void> {
  assertAuthorizedUrl();
  if ((await assertConnectedToTestDatabase(sequelize)) !== 'polleria_test') {
    throw new Error(
      'La base conectada no es exactamente polleria_test; preparaci\u00f3n cancelada.',
    );
  }
}

/**
 * Ataques a mesas y al ciclo del pedido (spec 009) que las pruebas de AC no cubren:
 * ids hostiles y escapes % en las rutas nuevas, no-store en cada error incluidas
 * mayúsculas (lección ADV-004-25), cuerpos hostiles y el "se ignora" de las rutas
 * sin cuerpo, doble clic e idempotencia, carreras reales abrir‖abrir, unir‖unir,
 * mover‖unir, separar‖separar, cancelar‖señales y desactivar‖abrir, agotamiento
 * del reintento de premisa (joinTable/leaveTable) que escala a 500, lecturas
 * rasgadas del tablero entre consultas, roles vivos y garantías de la base.
 */
describe('009 adversarial: API, servicio y concurrencia de mesas y pedidos sobre polleria_test', () => {
  let sequelize: Sequelize | undefined;
  let auth: ReturnType<typeof setupAuth>;
  let tableService: ReturnType<typeof createTableService>;
  let orderService: ReturnType<typeof createOrderService>;
  let prepared = false;

  function database(): Sequelize {
    if (!sequelize) throw new Error('No hay conexi\u00f3n de pruebas autorizada.');
    return sequelize;
  }

  beforeAll(async () => {
    assertAuthorizedUrl();
    sequelize = await connectTestDatabase();
    await assertAuthorizedConnection(sequelize);
    prepared = true;
  });
  beforeEach(async () => {
    await migrateAndClearAuthTables(database());
    await clearOrderTables(database());
    auth = setupAuth(database());
    tableService = createTableService({ models: auth.models });
    orderService = createOrderService({ models: auth.models });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    try {
      if (sequelize && prepared) {
        await assertAuthorizedConnection(sequelize);
        await clearOrderTables(sequelize);
        await clearAuthTables(sequelize);
      }
    } finally {
      await closeTestDatabase(sequelize);
    }
  });

  const rows = <T extends object>(sql: string, bind?: (string | number | null)[]) =>
    database().query<T>(sql, { type: QueryTypes.SELECT, bind });
  const tableRow = (id: number) =>
    rows<{ name: string; is_active: boolean; current_order_id: number | null }>(
      'SELECT name, is_active, current_order_id FROM tables WHERE id = $1',
      [id],
    );
  const orderRow = (id: number) =>
    rows<{
      status: string;
      ready_at: Date | null;
      bill_requested_at: Date | null;
      cancel_reason: string | null;
      merged_into_order_id: number | null;
      closed_by_user_id: number | null;
    }>(
      'SELECT status, ready_at, bill_requested_at, cancel_reason, merged_into_order_id, ' +
        'closed_by_user_id FROM "orders" WHERE id = $1',
      [id],
    );
  const allTableRows = () =>
    rows<{ id: number; current_order_id: number | null }>(
      'SELECT id, current_order_id FROM tables ORDER BY id',
    );

  /** Crea al administrador dueño y devuelve la cookie de su sesión real. */
  async function adminCookie() {
    await auth.createUser('adv009.dueno', 'Do\u00f1a Luz', ['admin'], ADMIN_PIN);
    return (await loginWithCookie(auth.app, 'adv009.dueno', ADMIN_PIN)).cookie;
  }
  /** Crea un usuario con esos roles y devuelve la cookie de su sesión real. */
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
  /** Secuencia para que los usuarios fixture no choquen con los de las cookies. */
  let fixtureSeq = 0;
  /** Un mozo de servicio para los fixtures (id), con username único por llamada. */
  const serviceWaiter = async () => {
    fixtureSeq += 1;
    return auth.createUser(`adv009.fixture${fixtureSeq}`, 'Mozo Fixture', ['waiter'], '2468');
  };

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
  /** El tablero como lista cruda (body de supertest es any). */
  const boardRows = (body: unknown) =>
    (body as { tables: { id: number; state: string; order: Order | null }[] }).tables;

  /**
   * Invariante observable del salón (RN-009-01 + D-009-14): ninguna mesa aparece
   * cubierta por un pedido que no esté abierto, el pedido embebido siempre lista a
   * su mesa entre las que cubre y ningún par de mesas apunta a pedidos distintos
   * con el mismo id. Devuelve el primer problema encontrado o null.
   */
  function boardInconsistency(
    board: { id: number; state: string; order: Order | null }[],
  ): string | null {
    const seen = new Set<number>();
    for (const table of board) {
      if (seen.has(table.id)) return `mesa repetida ${table.id}`;
      seen.add(table.id);
      if (table.order === null) {
        if (table.state !== 'free') return `mesa ${table.id} libre con estado ${table.state}`;
        continue;
      }
      if (table.order.status !== 'open')
        return `mesa ${table.id} cubierta por pedido ${table.order.status}`;
      if (!table.order.tables.some((ref) => ref.id === table.id))
        return `mesa ${table.id} no figura en las mesas de su pedido ${table.order.id}`;
      if (table.state === 'free') return `mesa ${table.id} con pedido pero estado free`;
    }
    return null;
  }

  it('ADV-009-07: tableId hostiles en las cuatro rutas de mesa responden 400 con issue en tableId', async () => {
    const cookie = await adminCookie();
    const juan = await serviceWaiter();
    const mesa = await createTable('Mesa 1');
    await openAt(mesa.id, juan.id);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // '00'+id vale por el id (ceros a la izquierda, misma regla que products).
    const padded = await postOpenOrder('0'.repeat(3) + String(mesa.id), cookie);
    expect.soft(padded.status).toBe(409); // ya ocupada: el id resolvió bien
    // La frontera del INTEGER: 2147483647 es un id válido que no existe (404).
    const boundary = await patchTable('2147483647', { name: 'X' }, cookie);
    expect.soft(boundary.status).toBe(404);
    expect.soft(boundary.body).toEqual(TABLE_NOT_FOUND_BODY);
    // Todo lo demás es 400 con el issue en tableId, en las cuatro rutas por igual.
    for (const id of [
      'abc',
      '0',
      '00',
      '-3',
      '1.5',
      '1.0',
      '1e5',
      '+5',
      '0x10',
      ' 5',
      '5 ',
      '\u0663',
      '\uFF15',
      '5\u00A0',
      "5' OR '1'='1",
      '5;DROP TABLE tables',
      'null',
      'undefined',
      'NaN',
      '9'.repeat(30),
      '2147483648',
      '9999999999999999999999999',
      '1%2F2',
      '5%00x',
      '%205',
      '5%20',
    ]) {
      const encoded = encodeURIComponent(id);
      for (const [label, response] of [
        ['PATCH', await patchTable(encoded, { name: 'X' }, cookie)],
        ['orders', await postOpenOrder(encoded, cookie)],
        ['join', await postJoin(encoded, { intoTableId: mesa.id }, cookie)],
        ['leave', await postLeave(encoded, cookie)],
      ] as const) {
        expect.soft(response.status, `${label} ${id}`).toBe(400);
        expect.soft(response.headers['cache-control'], `${label} ${id}`).toBe('no-store');
        expect.soft(issuesOf(response)[0]?.path, `${label} ${id}`).toBe('tableId');
      }
    }
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-009-08: orderId hostiles en las seis rutas de pedido responden 400 con issue en orderId', async () => {
    const cookie = await adminCookie();
    const juan = await serviceWaiter();
    const mesa = await createTable('Mesa 1');
    const pedido = await openAt(mesa.id, juan.id);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // '000'+id resuelve al pedido real (200), la frontera INTEGER da 404.
    expect.soft((await getOrder('0'.repeat(3) + String(pedido.id), cookie)).status).toBe(200);
    const boundary = await getOrder('2147483647', cookie);
    expect.soft(boundary.status).toBe(404);
    expect.soft(boundary.body).toEqual(ORDER_NOT_FOUND_BODY);
    for (const id of [
      'abc',
      '0',
      '-3',
      '1.5',
      '1e5',
      '+5',
      ' 5',
      '5 ',
      '\u0663',
      '\uFF15',
      "5' OR '1'='1",
      '5;DROP TABLE orders',
      'null',
      'NaN',
      '9'.repeat(30),
      '2147483648',
      '1%2F2',
      '5%00x',
    ]) {
      const encoded = encodeURIComponent(id);
      for (const [label, response] of [
        ['GET', await getOrder(encoded, cookie)],
        ['move', await postMove(encoded, { tableId: mesa.id }, cookie)],
        ['request-bill', await postSignal(encoded, 'request-bill', cookie)],
        ['ready', await postSignal(encoded, 'ready', cookie)],
        ['served', await postSignal(encoded, 'served', cookie)],
        ['cancel', await postCancel(encoded, { reason: 'motivo' }, cookie)],
      ] as const) {
        expect.soft(response.status, `${label} ${id}`).toBe(400);
        expect.soft(response.headers['cache-control'], `${label} ${id}`).toBe('no-store');
        expect.soft(issuesOf(response)[0]?.path, `${label} ${id}`).toBe('orderId');
      }
    }
    // Nada cambió en el pedido tras la batería.
    expect((await orderRow(pedido.id))[0]?.status).toBe('open');
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-009-09: un escape % malformado en las rutas nuevas responde 400 con el issue del parámetro', async () => {
    const cookie = await adminCookie();
    const mesa = await createTable('Mesa 1');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // path-to-regexp lanza URIError al decodificar el parámetro; cada router lo
    // traduce al VALIDATION_ERROR con el issue en su id (malformedIdParamError),
    // a diferencia del 'La dirección no es válida.' global de la 005.
    for (const id of ['%', '%E0%A4%A', 'abc%', '%%', '1%2']) {
      for (const [response, path] of [
        [await patchTable(id, { name: 'X' }, cookie), 'tableId'],
        [await postOpenOrder(id, cookie), 'tableId'],
        [await postLeave(id, cookie), 'tableId'],
        [await request(auth.app).get(`/api/orders/${id}`).set('Cookie', cookie), 'orderId'],
        [
          await request(auth.app)
            .post(`/api/orders/${id}/cancel`)
            .set('Cookie', cookie)
            .send({ reason: 'motivo' }),
          'orderId',
        ],
      ] as const) {
        expect.soft(response.status, `${path} ${id}`).toBe(400);
        expect.soft(response.headers['cache-control'], `${path} ${id}`).toBe('no-store');
        expect.soft(issuesOf(response)[0]?.path, `${path} ${id}`).toBe(path);
        expect
          .soft(issuesOf(response)[0]?.message, `${path} ${id}`)
          .toBe(path === 'tableId' ? TABLE_ID_MESSAGE : ORDER_ID_MESSAGE);
      }
    }
    // Un escape roto FUERA del parámetro no estalla al decodificar: ninguna ruta
    // coincide con '/api/tables%' literal y cae al NOT_FOUND común. El prefijo
    // global no-store exige '/api/tables' o '.../' exactos, así que una hermana
    // desconocida 404 sin la cabecera — paridad con '/api/products%' (el URIError
    // solo aparece cuando el % vive dentro del segmento del id).
    const brokenPath = await request(auth.app).get('/api/tables%').set('Cookie', cookie);
    expect.soft(brokenPath.status).toBe(404);
    expect.soft(brokenPath.body).toEqual(NOT_FOUND_BODY);
    const brokenProducts = await request(auth.app).get('/api/products%').set('Cookie', cookie);
    expect
      .soft(brokenPath.headers['cache-control'], 'paridad con /api/products%')
      .toBe(brokenProducts.headers['cache-control']);
    void mesa;
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-009-10: todas las respuestas llevan no-store, incluidas mayúsculas, alias y errores', async () => {
    const cookie = await adminCookie();
    const mozo = await cookieFor('adv009.juan', ['waiter'], '2468');
    const juan = await serviceWaiter();
    const mesa = await createTable('Mesa 1');
    const pedido = await openAt(mesa.id, juan.id);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Express enruta sin distinguir mayúsculas y el prefijo se compara en minúsculas
    // (lección ADV-004-25): /API/TABLES y /Api/Orders/.../Cancel quedan cubiertos.
    for (const response of [
      await request(auth.app).get('/API/TABLES').set('Cookie', mozo),
      await request(auth.app).get('/Api/Tables/').set('Cookie', mozo),
      await request(auth.app).get(`/API/ORDERS/${pedido.id}`).set('Cookie', mozo),
      await request(auth.app).post(`/Api/Tables/${mesa.id}/LEAVE`).set('Cookie', mozo),
      await request(auth.app)
        .post(`/api/orders/${pedido.id}/CANCEL`)
        .set('Cookie', mozo)
        .send({ reason: 'cierra la prueba' }),
      // Errores de cada familia también llevan la cabecera.
      await getTables(),
      await postTables({ name: 'Otra' }, mozo), // 403 rol
      await postTables({ bad: 1 }, cookie), // 400 forma
      await postOpenOrder(999999, mozo), // 404 mesa
      await postLeave(999999, mozo), // 404
      await getOrder('abc', mozo), // 400 id
      await request(auth.app).delete(`/api/tables/${mesa.id}`).set('Cookie', cookie), // 404 método
      await request(auth.app).get(`/api/orders/${pedido.id}/move`).set('Cookie', mozo), // 404 subruta
      await request(auth.app).get(`/api/tables/${mesa.id}`).set('Cookie', mozo), // 404: no hay GET por mesa
      await request(auth.app).post('/api/orders').set('Cookie', mozo), // 404
      await request(auth.app).get('/api/orders').set('Cookie', mozo), // 404 colección
    ]) {
      expect.soft(response.headers['cache-control'], String(response.status)).toBe('no-store');
      // Ningún 4xx/5xx fuga datos internos.
      expect
        .soft(JSON.stringify(response.body))
        .not.toMatch(/polleria_dev|sequelize|SELECT |password|pinHash|tokenHash/i);
    }
    // Los métodos y subrutas no declarados responden el NOT_FOUND común, nunca un 500.
    for (const [label, response] of [
      [
        'DELETE /tables/{id}',
        await request(auth.app).delete(`/api/tables/${mesa.id}`).set('Cookie', cookie),
      ],
      [
        'GET /orders/{id}/move',
        await request(auth.app).get(`/api/orders/${pedido.id}/move`).set('Cookie', mozo),
      ],
      [
        'GET /tables/{id}',
        await request(auth.app).get(`/api/tables/${mesa.id}`).set('Cookie', mozo),
      ],
      ['POST /orders', await request(auth.app).post('/api/orders').set('Cookie', mozo).send({})],
      ['GET /orders', await request(auth.app).get('/api/orders').set('Cookie', mozo)],
    ] as const) {
      expect.soft(response.status, label).toBe(404);
      expect.soft(response.body, label).toEqual(NOT_FOUND_BODY);
      expect.soft(response.headers['cache-control'], label).toBe('no-store');
    }
    // OPTIONS auto de Express 5 declara los métodos de cada ruta (HEAD gratis con GET).
    const optTables = await request(auth.app).options('/api/tables');
    expect.soft(optTables.status).toBe(200);
    expect.soft(optTables.headers['allow']).toBe('GET, HEAD, POST');
    expect.soft(optTables.headers['cache-control']).toBe('no-store');
    const optOrder = await request(auth.app).options(`/api/orders/${pedido.id}`);
    expect.soft(optOrder.status).toBe(200);
    expect.soft(optOrder.headers['allow']).toBe('GET, HEAD');
    const optCancel = await request(auth.app).options(`/api/orders/${pedido.id}/cancel`);
    expect.soft(optCancel.headers['allow']).toBe('POST');
    // HEAD existe porque GET existe: 200 sin cuerpo.
    const head = await request(auth.app).head('/api/tables').set('Cookie', mozo);
    expect.soft(head.status).toBe(200);
    expect.soft(head.text ?? '').toBe('');
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-009-11: cuerpos hostiles de POST y PATCH /api/tables se rechazan sin escribir nada', async () => {
    const cookie = await adminCookie();
    const mesa = await createTable('Mesa 1');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const tableCount = async () =>
      (await rows<{ n: number }>('SELECT count(*)::int AS n FROM tables'))[0]!.n;
    const before = await tableCount();
    const expect400 = async (raw: string, label: string, expectedCode = 'VALIDATION_ERROR') => {
      const response = await sendRawBody(
        request(auth.app)
          .post('/api/tables')
          .set('Cookie', cookie)
          .set('Content-Type', 'application/json'),
        Buffer.from(raw),
      );
      expect.soft(response.status, label).toBe(400);
      expect.soft(errorCode(response), label).toBe(expectedCode);
      expect.soft(response.headers['cache-control'], label).toBe('no-store');
      // Los rechazos del lector traen el cuerpo estándar exacto, no uno improvisado.
      if (expectedCode === 'INVALID_JSON') {
        expect.soft(response.body, label).toEqual(INVALID_JSON_BODY);
      }
      if (expectedCode === 'INVALID_BODY') {
        expect.soft(response.body, label).toEqual(INVALID_BODY_BODY);
      }
    };
    await expect400('{"name":', 'JSON truncado', 'INVALID_JSON');
    await expect400('un texto', 'raíz texto', 'INVALID_JSON');
    await expect400('null', 'raíz null', 'INVALID_JSON');
    await expect400('42', 'raíz número', 'INVALID_JSON');
    await expect400('true', 'raíz bool', 'INVALID_JSON');
    await expect400('[1,2]', 'raíz array', 'INVALID_BODY');
    await expect400('{}', 'objeto vacío');
    await expect400('{"name":5}', 'name número');
    await expect400('{"name":null}', 'name null');
    await expect400('{"name":true}', 'name bool');
    await expect400('{"name":[]}', 'name array');
    await expect400('{"name":"Mesa $"}', 'name con $');
    await expect400('{"name":"Mesa/1"}', 'name con /');
    await expect400(`{"name":"${'A'.repeat(41)}"}`, 'name 41');
    await expect400('{"name":"Mesa 9","extra":1}', 'clave de más');
    await expect400('{"name":"Mesa 9","id":3}', 'id ajeno');
    await expect400('{"name":"Mesa 9","isActive":false}', 'isActive ajeno');
    await expect400('{"name":"Mesa 9","__proto__":{"x":1}}', '__proto__ raíz');
    await expect400('{"__proto__":{"injected":true}}', '__proto__ solo');
    // Clave duplicada: gana la última (documentado ADV-005-27) — aquí la última es inválida.
    await expect400('{"name":"Mesa 9","name":"Mesa$"}', 'dup name última inválida');
    // Y si la última es válida, gana ella y SÍ crea: se comporta como el último gana.
    const dupOk = await sendRawBody(
      request(auth.app)
        .post('/api/tables')
        .set('Cookie', cookie)
        .set('Content-Type', 'application/json'),
      Buffer.from('{"name":"Mesa$","name":"Mesa Dup"}'),
    );
    expect(dupOk.status).toBe(201);
    expect((dupOk.body as Table).name).toBe('Mesa Dup');
    // PATCH con las mismas trampas.
    const expectPatch400 = async (raw: string, label: string, code = 'VALIDATION_ERROR') => {
      const response = await sendRawBody(
        request(auth.app)
          .patch(`/api/tables/${mesa.id}`)
          .set('Cookie', cookie)
          .set('Content-Type', 'application/json'),
        Buffer.from(raw),
      );
      expect.soft(response.status, label).toBe(400);
      expect.soft(errorCode(response), label).toBe(code);
      expect.soft(response.headers['cache-control'], label).toBe('no-store');
    };
    await expectPatch400('{"isActive":', 'PATCH JSON truncado', 'INVALID_JSON');
    await expectPatch400('[1]', 'PATCH array', 'INVALID_BODY');
    await expectPatch400('{}', 'PATCH vacío (sin cambios)');
    await expectPatch400('{"isActive":"false"}', 'isActive texto');
    await expectPatch400('{"isActive":0}', 'isActive número');
    await expectPatch400('{"name":"Mesa 1","name":"Otra","hack":1}', 'PATCH extra');
    // 100 KB justos vs. un byte más: el límite es >100 kb, medido tras descomprimir.
    const exact = await sendRawBody(
      request(auth.app)
        .post('/api/tables')
        .set('Cookie', cookie)
        .set('Content-Type', 'application/json'),
      Buffer.from(jsonBodyOfSize(100 * 1024)),
    );
    expect.soft(exact.status, 'exactamente 100kb').toBe(400); // forma, no tamaño
    expect.soft(errorCode(exact), 'exactamente 100kb').toBe('VALIDATION_ERROR');
    const over = await sendRawBody(
      request(auth.app)
        .post('/api/tables')
        .set('Cookie', cookie)
        .set('Content-Type', 'application/json'),
      Buffer.from(jsonBodyOfSize(100 * 1024 + 1)),
    );
    expect.soft(over.status, '100kb+1').toBe(413);
    expect.soft(over.body).toEqual(PAYLOAD_TOO_LARGE_BODY);
    // Content-Type que no es JSON con cuerpo: 415 antes de tocar nada.
    const wrongType = await sendRawBody(
      request(auth.app).post('/api/tables').set('Cookie', cookie).set('Content-Type', 'text/plain'),
      Buffer.from('{"name":"Otra"}'),
    );
    expect(wrongType.status).toBe(415);
    expect(wrongType.body).toEqual(UNSUPPORTED_MEDIA_TYPE_BODY);
    // Solo se creó la mesa del dup-name (las demás no escribieron nada).
    expect(await tableCount()).toBe(before + 1);
    expect(Reflect.has({}, 'injected')).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-009-12: cuerpos hostiles de join, move y cancel no tocan pedidos ni mesas', async () => {
    const mozo = await cookieFor('adv009.juan', ['waiter'], '2468');
    const juan = await serviceWaiter();
    const mesa3 = await createTable('Mesa 3');
    const mesa4 = await createTable('Mesa 4');
    const pedido = await openAt(mesa3.id, juan.id);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const issuesOn = (response: request.Response, path: string, message: string, label: string) => {
      expect.soft(response.status, label).toBe(400);
      expect.soft(response.headers['cache-control'], label).toBe('no-store');
      const issues = issuesOf(response);
      expect
        .soft(
          issues.some((issue) => issue.path === path && issue.message === message),
          label,
        )
        .toBe(true);
    };
    // join: intoTableId debe ser entero válido; cualquier otra forma -> issue en
    // intoTableId (singleFieldBody fija el issue en la clave aunque sobren claves).
    for (const [body, label] of [
      [{}, 'join {}'],
      [{ intoTableId: '5' }, 'intoTableId texto'],
      [{ intoTableId: 0 }, 'intoTableId 0'],
      [{ intoTableId: -3 }, 'intoTableId -3'],
      [{ intoTableId: 1.5 }, 'intoTableId 1.5'],
      [{ intoTableId: null }, 'intoTableId null'],
      [{ intoTableId: true }, 'intoTableId bool'],
      [{ intoTableId: [mesa4.id] }, 'intoTableId array'],
      [{ intoTableId: 2147483648 }, 'intoTableId >MAX'],
      [{ intoTableId: Number.MAX_SAFE_INTEGER }, 'intoTableId 2^53'],
      [{ intoTableId: mesa4.id, extra: 1 }, 'join clave de más'],
    ] as [unknown, string][]) {
      const response = await postJoin(mesa3.id, body, mozo);
      issuesOn(response, 'intoTableId', TABLE_ID_MESSAGE, label);
    }
    // Lo que ni siquiera llega al esquema: los escalares los rechaza el lector
    // estricto global (INVALID_JSON) y el array raíz requireJsonObject (INVALID_BODY).
    // Los escalares viajan en crudo: supertest no puede .send() un número suelto.
    for (const [raw, code, label] of [
      ['5', 'INVALID_JSON', 'join escalar'],
      ['texto', 'INVALID_JSON', 'join texto'],
      ['null', 'INVALID_JSON', 'join null'],
      [`[${mesa4.id}]`, 'INVALID_BODY', 'join array raíz'],
    ] as [string, string, string][]) {
      const response = await sendRawBody(
        request(auth.app)
          .post(`/api/tables/${mesa3.id}/join`)
          .set('Cookie', mozo)
          .set('Content-Type', 'application/json'),
        Buffer.from(raw),
      );
      expect.soft(response.status, label).toBe(400);
      expect.soft(errorCode(response), label).toBe(code);
      expect.soft(response.headers['cache-control'], label).toBe('no-store');
    }
    // Referencias de dato: inexistente y la misma mesa son issues del cuerpo, no 404/409.
    issuesOn(
      await postJoin(mesa3.id, { intoTableId: 999999 }, mozo),
      'intoTableId',
      TABLE_DOES_NOT_EXIST_MESSAGE,
      'intoTableId inexistente',
    );
    issuesOn(
      await postJoin(mesa3.id, { intoTableId: mesa3.id }, mozo),
      'intoTableId',
      'La mesa de destino debe ser otra.',
      'join consigo misma',
    );
    // move: tableId del cuerpo con la misma batería; inexistente -> 'Esa mesa no existe.'.
    for (const [body, label] of [
      [{}, 'move {}'],
      [{ tableId: '5' }, 'tableId texto'],
      [{ tableId: 0 }, 'tableId 0'],
      [{ tableId: 1.5 }, 'tableId 1.5'],
      [{ tableId: null }, 'tableId null'],
      [{ tableId: -0 }, 'tableId -0'],
      [{ tableId: 2147483648 }, 'tableId >MAX'],
      [{ tableId: mesa4.id, extra: 1 }, 'move clave de más'],
    ] as [unknown, string][]) {
      const response = await postMove(pedido.id, body, mozo);
      issuesOn(response, 'tableId', TABLE_ID_MESSAGE, label);
    }
    // El array raíz no llega al esquema: requireJsonObject responde INVALID_BODY.
    const moveArray = await sendRawBody(
      request(auth.app)
        .post(`/api/orders/${pedido.id}/move`)
        .set('Cookie', mozo)
        .set('Content-Type', 'application/json'),
      Buffer.from(`[${mesa4.id}]`),
    );
    expect.soft(moveArray.status).toBe(400);
    expect.soft(errorCode(moveArray)).toBe('INVALID_BODY');
    issuesOn(
      await postMove(pedido.id, { tableId: 999999 }, mozo),
      'tableId',
      TABLE_DOES_NOT_EXIST_MESSAGE,
      'move a mesa inexistente',
    );
    // cancel: reason obligatorio 1-200 tras recorte; fronteras exactas y tipos.
    const reasonMessage = 'Escribe el motivo de la anulaci\u00f3n (hasta 200 caracteres).';
    for (const [body, label] of [
      [{}, 'cancel {}'],
      [{ reason: '' }, 'reason vacío'],
      [{ reason: '   ' }, 'reason espacios'],
      [{ reason: '\u00a0\u00a0' }, 'reason NBSP'],
      [{ reason: 'a'.repeat(201) }, 'reason 201'],
      [{ reason: 5 }, 'reason número'],
      [{ reason: null }, 'reason null'],
      [{ reason: true }, 'reason bool'],
      [{ reason: ['x'] }, 'reason array'],
      [{ reason: 'válido', extra: 1 }, 'cancel clave de más'],
    ] as [unknown, string][]) {
      const response = await postCancel(pedido.id, body, mozo);
      issuesOn(response, 'reason', reasonMessage, label);
    }
    // Los escalares los para el lector estricto global antes del esquema (en crudo).
    for (const [raw, label] of [
      ['null', 'cancel null'],
      ['x', 'cancel texto'],
    ] as [string, string][]) {
      const response = await sendRawBody(
        request(auth.app)
          .post(`/api/orders/${pedido.id}/cancel`)
          .set('Cookie', mozo)
          .set('Content-Type', 'application/json'),
        Buffer.from(raw),
      );
      expect.soft(response.status, label).toBe(400);
      expect.soft(errorCode(response), label).toBe('INVALID_JSON');
    }
    // Frontera válida: 200 justos con acolchado (se guarda recortado).
    const ok200 = await postCancel(pedido.id, { reason: '  ' + 'a'.repeat(200) + ' ' }, mozo);
    expect(ok200.status).toBe(200);
    expect((ok200.body as Order).cancelReason).toBe('a'.repeat(200));
    // El pedido quedó cancelado de verdad y las mesas siguen sin hijos raros.
    expect((await orderRow(pedido.id))[0]?.status).toBe('cancelled');
    expect((await tableRow(mesa3.id))[0]?.current_order_id).toBeNull();
    expect(Reflect.has({}, 'injected')).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-009-13: compresión gzip cuenta el límite tras inflar y otras codificaciones se documentan', async () => {
    const cookie = await adminCookie();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // body-parser infla gzip: un JSON válido comprimido funciona igual que en claro.
    const gz = await sendRawBody(
      request(auth.app)
        .post('/api/tables')
        .set('Cookie', cookie)
        .set('Content-Type', 'application/json')
        .set('Content-Encoding', 'gzip'),
      gzipSync(Buffer.from('{"name":"Mesa Zip"}')),
    );
    expect(gz.status).toBe(201);
    expect((gz.body as Table).name).toBe('Mesa Zip');
    // La bomba: pocos KB comprimidos que pasan a más de 100 KB al inflarse -> 413.
    const bomb = gzipSync(Buffer.from(jsonBodyOfSize(150 * 1024)));
    expect(bomb.length).toBeLessThan(1024);
    const bombed = await sendRawBody(
      request(auth.app)
        .post('/api/tables')
        .set('Cookie', cookie)
        .set('Content-Type', 'application/json')
        .set('Content-Encoding', 'gzip'),
      bomb,
    );
    expect(bombed.status).toBe(413);
    expect(bombed.body).toEqual(PAYLOAD_TOO_LARGE_BODY);
    // Gzip truncado: el lector lo trata como cuerpo ilegible (4xx, no 500).
    const corrupted = await sendRawBody(
      request(auth.app)
        .post('/api/tables')
        .set('Cookie', cookie)
        .set('Content-Type', 'application/json')
        .set('Content-Encoding', 'gzip'),
      gzipSync(Buffer.from('{"name":"X"}')).subarray(0, 8),
    );
    expect.soft(corrupted.status).toBe(400);
    expect.soft(corrupted.body).toEqual(INVALID_BODY_BODY);
    // Brotli es una codificación admitida (ADV-005-15): comprimido de verdad crea.
    const br = await sendRawBody(
      request(auth.app)
        .post('/api/tables')
        .set('Cookie', cookie)
        .set('Content-Type', 'application/json')
        .set('Content-Encoding', 'br'),
      brotliCompressSync(Buffer.from('{"name":"Mesa Br"}')),
    );
    expect.soft(br.status).toBe(201);
    expect.soft((br.body as Table).name).toBe('Mesa Br');
    // Declarar brotli y mandar texto en claro no puede "pasar": el inflado falla
    // o produce basura — en ambos casos es un 400, nunca un 201 ni un 500.
    const fakeBr = await sendRawBody(
      request(auth.app)
        .post('/api/tables')
        .set('Cookie', cookie)
        .set('Content-Type', 'application/json')
        .set('Content-Encoding', 'br'),
      Buffer.from('{"name":"Mesa Falsa"}'),
    );
    expect.soft(fakeBr.status, 'br declarado con cuerpo en claro').toBe(400);
    expect.soft(['INVALID_BODY', 'INVALID_JSON'], 'br falso').toContain(errorCode(fakeBr));
    // Una codificación que el lector no conoce se rechaza como 415, no se lee en claro.
    for (const encoding of ['compress', 'x-custom', 'gzip, br']) {
      const weird = await sendRawBody(
        request(auth.app)
          .post('/api/tables')
          .set('Cookie', cookie)
          .set('Content-Type', 'application/json')
          .set('Content-Encoding', encoding),
        Buffer.from('{"name":"Mesa Rara"}'),
      );
      expect.soft(weird.status, `encoding ${encoding}`).toBe(415);
      expect.soft(weird.body, `encoding ${encoding}`).toEqual(UNSUPPORTED_MEDIA_TYPE_BODY);
    }
    // Deflate real también se infla (paridad con el resto de la API).
    const deflated = await sendRawBody(
      request(auth.app)
        .post('/api/tables')
        .set('Cookie', cookie)
        .set('Content-Type', 'application/json')
        .set('Content-Encoding', 'deflate'),
      deflateSync(Buffer.from('{"name":"Mesa Deflate"}')),
    );
    expect.soft(deflated.status).toBe(201);
    // application/json con charset explícito funciona; charset raro responde su error.
    const charset = await sendRawBody(
      request(auth.app)
        .post('/api/tables')
        .set('Cookie', cookie)
        .set('Content-Type', 'application/json; charset=utf-8'),
      Buffer.from('{"name":"Mesa Charset"}'),
    );
    expect.soft(charset.status).toBe(201);
    const badCharset = await sendRawBody(
      request(auth.app)
        .post('/api/tables')
        .set('Cookie', cookie)
        .set('Content-Type', 'application/json; charset=utf-99'),
      Buffer.from('{"name":"X"}'),
    );
    expect.soft(badCharset.status).toBe(415);
    expect.soft(badCharset.body).toEqual(UNSUPPORTED_MEDIA_TYPE_BODY);
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-009-14: las rutas sin cuerpo ignoran cualquier cuerpo que llegue (spec §9: "si llega uno, se ignora")', async () => {
    const mozo = await cookieFor('adv009.juan', ['waiter'], '2468');
    const juan = await serviceWaiter();
    const mesa = await createTable('Mesa 1');
    const mesaLibre = await createTable('Mesa 2');
    const pedido = await openAt(mesa.id, juan.id);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // La spec es explícita: orders/leave/request-bill/ready/served "no exigen
    // Content-Type ni leen cuerpo; si llega uno, se ignora". Un cuerpo VÁLIDO se
    // ignora de verdad: la operación corre igual (también si intenta inyectar actor).
    const injected = await request(auth.app)
      .post(`/api/tables/${mesaLibre.id}/orders`)
      .set('Cookie', mozo)
      .send({ openedByUserId: 1, userId: 1 });
    expect.soft(injected.status, 'open con cuerpo JSON válido').toBe(201);
    // El actor siempre sale de la sesión, nunca del cuerpo (anti asignación masiva).
    const abierto = injected.body as Order;
    const juanRow = (
      await rows<{ id: number }>('SELECT id FROM users WHERE username = $1', ['adv009.juan'])
    )[0]!;
    expect.soft(abierto.openedBy?.id, 'openedBy debe ser el de la sesión').toBe(juanRow.id);
    // Cuerpo de texto plano: tampoco se lee, la operación corre.
    const pedidoListo = await request(auth.app)
      .post(`/api/orders/${pedido.id}/ready`)
      .set('Cookie', mozo)
      .set('Content-Type', 'text/plain')
      .send('esto no es json pero debe ignorarse');
    expect.soft(pedidoListo.status, 'ready con text/plain').toBe(200);
    // Un cuerpo JSON MALFORMADO declarado como application/json debería ignorarse
    // igual: la ruta no lee cuerpo (§9). Hoy el lector global estricto contesta
    // INVALID_JSON antes de que el router decida — la operación nunca llega a correr.
    const malformed = await sendRawBody(
      request(auth.app)
        .post(`/api/orders/${pedido.id}/served`)
        .set('Cookie', mozo)
        .set('Content-Type', 'application/json'),
      Buffer.from('{"served":'),
    );
    expect.soft(malformed.status, 'served con JSON malformado: debe ignorar el cuerpo').toBe(200);
    // Lo mismo con un cuerpo JSON gigante: si la ruta no lee cuerpo, no hay 413.
    // La mesa 1 es la última del pedido: ignorado el cuerpo, leave responde su 409.
    const huge = await sendRawBody(
      request(auth.app)
        .post(`/api/tables/${mesa.id}/leave`)
        .set('Cookie', mozo)
        .set('Content-Type', 'application/json'),
      Buffer.from(jsonBodyOfSize(150 * 1024)),
    );
    expect.soft(huge.status, 'leave con >100kb: debe ignorar el cuerpo').toBe(409);
    expect
      .soft(errorCode(huge), 'leave con >100kb: el error no puede ser PAYLOAD_TOO_LARGE')
      .not.toBe('PAYLOAD_TOO_LARGE');
    // Content-Type falso con cuerpo JSON roto: tampoco debería leerlo.
    const liedType = await sendRawBody(
      request(auth.app)
        .post(`/api/orders/${pedido.id}/request-bill`)
        .set('Cookie', mozo)
        .set('Content-Type', 'text/plain'),
      Buffer.from('{"roto":'),
    );
    expect.soft(liedType.status, 'request-bill con text/plain roto').toBe(200);
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-009-15: la matriz de roles se cumple en las doce rutas, con multi-rol incluido', async () => {
    const admin = await adminCookie();
    const mozo = await cookieFor('adv009.juan', ['waiter'], '2468');
    const cocina = await cookieFor('adv009.cocina', ['kitchen'], '1357');
    const caja = await cookieFor('adv009.caja', ['cashier'], '8642');
    const juan = await serviceWaiter();
    const mesa = await createTable('Mesa 1');
    const mesaOff = await createTable('Mesa Off', false);
    const libre = await createTable('Mesa 2');
    const pedido = await openAt(mesa.id, juan.id);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Roles por ruta según D-009-05/RN-009-03. 'salon' = waiter+admin, 'ready' suma kitchen.
    const salonCalls: [string, (cookie?: string) => Promise<request.Response>][] = [
      ['POST /tables/{id}/orders', (c) => postOpenOrder(libre.id, c)],
      ['POST /tables/{id}/join', (c) => postJoin(libre.id, { intoTableId: mesa.id }, c)],
      ['POST /tables/{id}/leave', (c) => postLeave(mesa.id, c)],
      ['POST /orders/{id}/move', (c) => postMove(pedido.id, { tableId: libre.id }, c)],
      ['POST /orders/{id}/request-bill', (c) => postSignal(pedido.id, 'request-bill', c)],
      ['POST /orders/{id}/served', (c) => postSignal(pedido.id, 'served', c)],
      ['POST /orders/{id}/cancel', (c) => postCancel(pedido.id, { reason: 'motivo' }, c)],
    ];
    for (const [name, call] of salonCalls) {
      // cocina y caja: 403 en todas las operaciones de salón.
      for (const [rol, cookie] of [
        ['kitchen', cocina],
        ['cashier', caja],
      ] as const) {
        const denied = await call(cookie);
        expect.soft(denied.status, `${name} ${rol}`).toBe(403);
        expect.soft(denied.body, `${name} ${rol}`).toEqual(FORBIDDEN_BODY);
        expect.soft(denied.headers['cache-control'], `${name} ${rol}`).toBe('no-store');
      }
      // sin cookie: 401.
      const anon = await call();
      expect.soft(anon.status, `${name} anónimo`).toBe(401);
      expect.soft(anon.body, `${name} anónimo`).toEqual(UNAUTHENTICATED_BODY);
    }
    // ready: kitchen entra; caja no.
    expect((await postSignal(pedido.id, 'ready', cocina)).status).toBe(200);
    const readyCaja = await postSignal(pedido.id, 'ready', caja);
    expect(readyCaja.status).toBe(403);
    expect(readyCaja.body).toEqual(FORBIDDEN_BODY);
    // Configuración: solo admin; mozo/cocina/caja reciben 403, anónimo 401.
    for (const [rol, cookie] of [
      ['waiter', mozo],
      ['kitchen', cocina],
      ['cashier', caja],
    ] as const) {
      expect.soft((await postTables({ name: 'Nueva' }, cookie)).status, `POST ${rol}`).toBe(403);
      expect
        .soft((await patchTable(mesaOff.id, { isActive: true }, cookie)).status, `PATCH ${rol}`)
        .toBe(403);
    }
    expect((await postTables({ name: 'Nueva' })).status).toBe(401);
    expect((await patchTable(mesaOff.id, { isActive: true })).status).toBe(401);
    // Lectura: todos los roles con sesión, en ambos GET.
    for (const cookie of [mozo, cocina, caja, admin]) {
      expect.soft((await getTables(cookie)).status).toBe(200);
      expect.soft((await getOrder(pedido.id, cookie)).status).toBe(200);
    }
    expect((await getTables()).status).toBe(401);
    expect((await getOrder(pedido.id)).status).toBe(401);
    // Multi-rol: admin+mozo abre mesa y opera salón; cocina+caja (sin waiter/admin)
    // no abre mesa aunque cocina sí puede marcar listo.
    const adminMozo = await cookieFor('adv009.duo', ['admin', 'waiter'], '1122');
    expect.soft((await postOpenOrder(libre.id, adminMozo)).status).toBe(201);
    const cocinaCaja = await cookieFor('adv009.duo2', ['kitchen', 'cashier'], '3344');
    const mesa2 = await createTable('Mesa 3');
    expect.soft((await postOpenOrder(mesa2.id, cocinaCaja)).status).toBe(403);
    expect.soft((await postSignal(pedido.id, 'ready', cocinaCaja)).status).toBe(200);
    // Los permisos se evalúan antes que el id de la ruta: 403/401 también con id hostil.
    expect.soft((await postOpenOrder('abc', caja)).status).toBe(403);
    expect.soft((await postSignal('abc', 'ready', caja)).status).toBe(403);
    expect.soft((await postOpenOrder('abc')).status).toBe(401);
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-009-16: roles y sesión se leen en vivo también en las rutas del salón', async () => {
    const mozo = await cookieFor('adv009.juan', ['waiter'], '2468');
    const juan = await serviceWaiter();
    const mesa = await createTable('Mesa 1');
    const pedido = await openAt(mesa.id, juan.id);
    const mesa2 = await createTable('Mesa 2');
    const duenoRow = (
      await rows<{ id: number }>('SELECT id FROM users WHERE username = $1', ['adv009.juan'])
    )[0]!;
    // Le quitan el rol de mozo con la sesión abierta: la siguiente escritura es 403,
    // la lectura sigue abierta (los roles se resuelven por request).
    await database().query('UPDATE users SET roles = $1 WHERE id = $2', {
      bind: [['kitchen'], duenoRow.id],
    });
    const demoted = await postOpenOrder(mesa2.id, mozo);
    expect(demoted.status).toBe(403);
    expect(demoted.body).toEqual(FORBIDDEN_BODY);
    expect((await getTables(mozo)).status).toBe(200);
    // Con rol de cocina recién puesto sí puede marcar listo, pero no abrir ni mover.
    expect((await postSignal(pedido.id, 'ready', mozo)).status).toBe(200);
    expect((await postMove(pedido.id, { tableId: mesa2.id }, mozo)).status).toBe(403);
    // Desactivado del todo: ni la lectura pasa (401 en todas las rutas).
    await database().query('UPDATE users SET is_active = false WHERE id = $1', {
      bind: [duenoRow.id],
    });
    for (const response of [
      await getTables(mozo),
      await postOpenOrder(mesa2.id, mozo),
      await postLeave(mesa.id, mozo),
    ]) {
      expect.soft(response.status).toBe(401);
      expect.soft(response.body).toEqual(UNAUTHENTICATED_BODY);
      expect.soft(response.headers['cache-control']).toBe('no-store');
    }
    // Reactivada pero con la sesión borrada de la tabla: la cookie ya no sirve.
    await database().query('UPDATE users SET is_active = true WHERE id = $1', {
      bind: [duenoRow.id],
    });
    await database().query('DELETE FROM sessions WHERE user_id = $1', { bind: [duenoRow.id] });
    expect((await getTables(mozo)).status).toBe(401);
    // Sesión vencida por tiempo: el reloj pasa de las 16h y la cookie muere.
    const mozo2 = await cookieFor('adv009.pepe', ['waiter'], '2468');
    auth.setTime(SESSION_DURATION_MS + 1);
    expect((await getTables(mozo2)).status).toBe(401);
  });

  it('ADV-009-17: doble clic en cada operación es no-op o el 409 correcto, nunca 500', async () => {
    const mozo = await cookieFor('adv009.juan', ['waiter'], '2468');
    const admin = await adminCookie();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // abrir dos veces: el segundo choca con la mesa ocupada y NO crea otro pedido.
    const mesaA = await createTable('Mesa A');
    const orderCount = async () =>
      (await rows<{ n: number }>('SELECT count(*)::int AS n FROM "orders"'))[0]!.n;
    const antes = await orderCount();
    const open1 = await postOpenOrder(mesaA.id, mozo);
    const open2 = await postOpenOrder(mesaA.id, mozo);
    expect(open1.status).toBe(201);
    expect(open2.status).toBe(409);
    expect(open2.body).toEqual(TABLE_OCCUPIED_BODY);
    expect(await orderCount()).toBe(antes + 1);
    const pedidoA = open1.body as Order;
    // crear mesa dos veces: TABLE_NAME_TAKEN con otra capitalización incluida.
    expect((await postTables({ name: 'Mesa B' }, admin)).status).toBe(201);
    const dupTable = await postTables({ name: 'mesa b' }, admin);
    expect(dupTable.status).toBe(409);
    expect(dupTable.body).toEqual(TABLE_NAME_TAKEN_BODY);
    // desactivar dos veces: idempotente (la segunda vuelve a dejarla inactiva).
    const mesaOff = await createTable('Mesa Off');
    expect((await patchTable(mesaOff.id, { isActive: false }, admin)).status).toBe(200);
    const off2 = await patchTable(mesaOff.id, { isActive: false }, admin);
    expect(off2.status).toBe(200);
    expect((off2.body as Table).isActive).toBe(false);
    // unir dos veces la misma mesa libre a la misma cuenta: la segunda es no-op 200.
    const mesaC = await createTable('Mesa C');
    const join1 = await postJoin(mesaC.id, { intoTableId: mesaA.id }, mozo);
    expect(join1.status).toBe(200);
    const join2 = await postJoin(mesaC.id, { intoTableId: mesaA.id }, mozo);
    expect(join2.status).toBe(200);
    expect((join2.body as Order).tables.map((t) => t.id).sort()).toEqual(
      [mesaA.id, mesaC.id].sort((a, b) => a - b),
    );
    // mover dos veces a la misma mesa: la segunda es no-op 200 sin cambios.
    const mesaD = await createTable('Mesa D');
    expect((await postMove(pedidoA.id, { tableId: mesaD.id }, mozo)).status).toBe(200);
    const move2 = await postMove(pedidoA.id, { tableId: mesaD.id }, mozo);
    expect(move2.status).toBe(200);
    expect((move2.body as Order).tables.map((t) => t.id)).toEqual([mesaD.id]);
    expect((await tableRow(mesaA.id))[0]?.current_order_id).toBeNull();
    expect((await tableRow(mesaC.id))[0]?.current_order_id).toBeNull();
    // pedir cuenta y marcar listo dos veces: conservan la PRIMERA marca (fecha y autor).
    const bill1 = await postSignal(pedidoA.id, 'request-bill', mozo);
    expect(bill1.status).toBe(200);
    const billFirst = (bill1.body as Order).billRequestedAt;
    const bill2 = await postSignal(pedidoA.id, 'request-bill', admin);
    expect((bill2.body as Order).billRequestedAt).toBe(billFirst);
    const ready1 = await postSignal(pedidoA.id, 'ready', mozo);
    const readyFirst = (ready1.body as Order).readyAt;
    const ready2 = await postSignal(pedidoA.id, 'ready', admin);
    expect((ready2.body as Order).readyAt).toBe(readyFirst);
    // servido dos veces: limpia la primera vez, la segunda es no-op 200.
    expect((await postSignal(pedidoA.id, 'served', mozo)).status).toBe(200);
    const served2 = await postSignal(pedidoA.id, 'served', mozo);
    expect(served2.status).toBe(200);
    expect((served2.body as Order).readyAt).toBeNull();
    // separar dos veces la mesa unida (separar mesaA primero para que quede C+D)…
    // la cuenta quedó solo en mesaD tras el move: separar la última es ORDER_NEEDS_TABLE.
    const leaveLast = await postLeave(mesaD.id, mozo);
    expect(leaveLast.status).toBe(409);
    expect(leaveLast.body).toEqual(ORDER_NEEDS_TABLE_BODY);
    // cancelar dos veces: la segunda es ORDER_NOT_OPEN.
    expect((await postCancel(pedidoA.id, { reason: 'cierre de prueba' }, mozo)).status).toBe(200);
    const cancel2 = await postCancel(pedidoA.id, { reason: 'otra vez' }, mozo);
    expect(cancel2.status).toBe(409);
    expect(cancel2.body).toEqual(ORDER_NOT_OPEN_BODY);
    // Y las señales sobre el pedido muerto también: ORDER_NOT_OPEN, nunca 500.
    for (const action of ['request-bill', 'ready', 'served']) {
      const response = await postSignal(pedidoA.id, action, action === 'ready' ? mozo : admin);
      expect.soft(response.status, action).toBe(409);
      expect.soft(response.body, action).toEqual(ORDER_NOT_OPEN_BODY);
    }
    expect((await postMove(pedidoA.id, { tableId: mesaC.id }, mozo)).status).toBe(409);
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-009-18: cuatro aperturas simultáneas de la misma mesa dejan un solo pedido', async () => {
    const mozo = await cookieFor('adv009.juan', ['waiter'], '2468');
    const moza2 = await cookieFor('adv009.luisa', ['waiter'], '2468');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // La lección de la 006: la fila de la mesa serializa — exactamente un 201 y el
    // resto 409 TABLE_OCCUPIED; jamás dos pedidos ni un 500. Ocho rondas, dos mozos.
    for (let round = 0; round < 8; round += 1) {
      const mesa = await createTable(`Mesa carrera ${round}`);
      const cookies = [mozo, moza2, mozo, mozo];
      const responses = await Promise.all(cookies.map((cookie) => postOpenOrder(mesa.id, cookie)));
      const statuses = responses.map((response) => response.status).sort();
      expect.soft(statuses, `ronda ${round}`).toEqual([201, 409, 409, 409]);
      for (const response of responses) {
        if (response.status === 409) {
          expect.soft(response.body, `ronda ${round}`).toEqual(TABLE_OCCUPIED_BODY);
        }
      }
      // Un solo pedido abierto y un solo puntero en la fila de la mesa.
      const orderRows = await rows<{ id: number; status: string }>(
        'SELECT id, status FROM "orders" ORDER BY id',
      );
      const pointer = (await tableRow(mesa.id))[0]?.current_order_id;
      expect(pointer).not.toBeNull();
      const pointerRows = await rows<{ n: number }>(
        'SELECT count(*)::int AS n FROM tables WHERE current_order_id = $1',
        [pointer ?? -1],
      );
      expect(pointerRows[0]?.n).toBe(1);
      const openOrders = orderRows.filter((row) => row.status === 'open');
      expect(openOrders).toHaveLength(1);
      // Limpieza entre rondas: cancelar para liberar la mesa.
      const cancel = await postCancel(pointer ?? -1, { reason: 'fin de ronda' }, mozo);
      expect(cancel.status).toBe(200);
    }
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-009-19: uniones simultáneas — dos al mismo destino, dos con cuentas y unirse mutuamente', async () => {
    const mozo = await cookieFor('adv009.juan', ['waiter'], '2468');
    const juan = await serviceWaiter();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // (a) Dos mesas LIBRES se suman a la vez a la misma cuenta: ambas adjunciones
    // serializan sobre el pedido destino y la cuenta final cubre las tres mesas.
    for (let round = 0; round < 5; round += 1) {
      const destino = await createTable(`Destino ${round}`);
      const libre1 = await createTable(`Libre ${round}a`);
      const libre2 = await createTable(`Libre ${round}b`);
      const cuenta = await openAt(destino.id, juan.id);
      const [a, b] = await Promise.all([
        postJoin(libre1.id, { intoTableId: destino.id }, mozo),
        postJoin(libre2.id, { intoTableId: destino.id }, mozo),
      ]);
      expect.soft([a.status, b.status].sort(), `libres ronda ${round}`).toEqual([200, 200]);
      const final = await getOrder(cuenta.id, mozo);
      expect
        .soft(
          (final.body as Order).tables.map((t) => t.id).sort((x, y) => x - y),
          `libres ronda ${round}`,
        )
        .toEqual([destino.id, libre1.id, libre2.id].sort((x, y) => x - y));
    }
    // (b) Dos pedidos distintos se fusionan al MISMO destino a la vez: los dos
    // orígenes quedan 'merged' apuntando al destino, que cubre las tres mesas.
    for (let round = 0; round < 5; round += 1) {
      const destino = await createTable(`Meta ${round}`);
      const origen1 = await createTable(`Origen ${round}a`);
      const origen2 = await createTable(`Origen ${round}b`);
      const cuenta = await openAt(destino.id, juan.id);
      const pedido1 = await openAt(origen1.id, juan.id);
      const pedido2 = await openAt(origen2.id, juan.id);
      const [a, b] = await Promise.all([
        postJoin(origen1.id, { intoTableId: destino.id }, mozo),
        postJoin(origen2.id, { intoTableId: destino.id }, mozo),
      ]);
      expect.soft([a.status, b.status].sort(), `merge ronda ${round}`).toEqual([200, 200]);
      const final = await getOrder(cuenta.id, mozo);
      expect
        .soft(
          (final.body as Order).tables.map((t) => t.id).sort((x, y) => x - y),
          `merge ronda ${round} mesas`,
        )
        .toEqual([destino.id, origen1.id, origen2.id].sort((x, y) => x - y));
      for (const absorbed of [pedido1.id, pedido2.id]) {
        const row = (await orderRow(absorbed))[0];
        expect.soft(row?.status, `merge ronda ${round}`).toBe('merged');
        expect.soft(row?.merged_into_order_id, `merge ronda ${round}`).toBe(cuenta.id);
      }
    }
    // (c) Unión mutua A→B ‖ B→A con cuentas propias: una fusión gana y la otra
    // termina como no-op del pedido sobreviviente. Jamás un empate roto ni 500.
    for (let round = 0; round < 6; round += 1) {
      const mesaA = await createTable(`Mutua ${round}a`);
      const mesaB = await createTable(`Mutua ${round}b`);
      const pedidoA = await openAt(mesaA.id, juan.id);
      const pedidoB = await openAt(mesaB.id, juan.id);
      const [ab, ba] = await Promise.all([
        postJoin(mesaA.id, { intoTableId: mesaB.id }, mozo),
        postJoin(mesaB.id, { intoTableId: mesaA.id }, mozo),
      ]);
      expect.soft([ab.status, ba.status].sort(), `mutua ronda ${round}`).toEqual([200, 200]);
      const rowsFinal = [await orderRow(pedidoA.id), await orderRow(pedidoB.id)];
      const statuses = rowsFinal.map((r) => r[0]?.status).sort();
      expect.soft(statuses, `mutua ronda ${round}`).toEqual(['merged', 'open']);
      // La mesa ganadora cubre las dos; ninguna mesa apunta al pedido muerto.
      const tableStates = await allTableRows();
      const deadId = rowsFinal[0]?.[0]?.status === 'merged' ? pedidoA.id : pedidoB.id;
      const aliveId = deadId === pedidoA.id ? pedidoB.id : pedidoA.id;
      for (const t of tableStates) {
        expect(t.current_order_id).not.toBe(deadId);
      }
      const covered = tableStates.filter((t) => t.current_order_id === aliveId);
      expect(covered.map((t) => t.id).sort()).toEqual([mesaA.id, mesaB.id].sort((a, b) => a - b));
    }
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-009-20: mover‖unir y separar‖separar nunca dejan el salón inconsistente', async () => {
    const mozo = await cookieFor('adv009.juan', ['waiter'], '2468');
    const juan = await serviceWaiter();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // (a) move O→destino ‖ join libre→mesa-de-O. Dos desenlaces legales: el join
    // entra antes (la mesa libre viaja con el pedido a su nueva mesa) o el move
    // libera primero la mesa del join (TABLE_HAS_NO_ORDER). Lo imposible: mesa
    // cubierta por pedido que no la lista, puntero doble o 500.
    for (let round = 0; round < 8; round += 1) {
      const mesaO = await createTable(`OrigenM ${round}`);
      const mesaDest = await createTable(`DestinoM ${round}`);
      const mesaLibre = await createTable(`LibreM ${round}`);
      const pedido = await openAt(mesaO.id, juan.id);
      const [move, join] = await Promise.all([
        postMove(pedido.id, { tableId: mesaDest.id }, mozo),
        postJoin(mesaLibre.id, { intoTableId: mesaO.id }, mozo),
      ]);
      const outcomes: [number, number][] = [
        [200, 200], // join adjuntó antes del move: la libre viajó con el pedido
        [200, 409], // move liberó mesaO primero: join ya no tiene cuenta destino
      ];
      expect
        .soft(
          outcomes.some(([m, j]) => m === move.status && j === join.status),
          `ronda ${round}`,
        )
        .toBe(true);
      if (join.status === 409) {
        expect.soft(join.body, `ronda ${round}`).toEqual(TABLE_HAS_NO_ORDER_BODY);
      }
      // Estado final consistente: el pedido está abierto y cada mesa apunta una vez.
      const final = await getOrder(pedido.id, mozo);
      const covered = (final.body as Order).tables.map((t) => t.id);
      expect.soft(covered.length, `ronda ${round}`).toBeGreaterThanOrEqual(1);
      const pointers = await allTableRows();
      const toOrder = pointers.filter((t) => t.current_order_id === pedido.id);
      expect
        .soft(toOrder.map((t) => t.id).sort(), `ronda ${round}`)
        .toEqual([...covered].sort((a, b) => a - b));
      // La mesa destino del move está cubierta por el pedido en ambos desenlaces.
      expect.soft(covered, `ronda ${round}`).toContain(mesaDest.id);
      await postCancel(pedido.id, { reason: 'fin de ronda' }, mozo);
    }
    // (b) Dos separaciones a la vez sobre un pedido de dos mesas: solo UNA puede
    // soltar su mesa — la otra debe responder ORDER_NEEDS_TABLE (RN-009-07 bajo
    // carrera): el pedido nunca queda de salón sin mesa.
    for (let round = 0; round < 8; round += 1) {
      const mesa1 = await createTable(`Sep ${round}a`);
      const mesa2 = await createTable(`Sep ${round}b`);
      const pedido = await openAt(mesa1.id, juan.id);
      await orderService.joinTable(mesa2.id, mesa1.id, { userId: juan.id });
      const [first, second] = await Promise.all([
        postLeave(mesa1.id, mozo),
        postLeave(mesa2.id, mozo),
      ]);
      const statuses = [first.status, second.status].sort();
      expect.soft(statuses, `separar ronda ${round}`).toEqual([200, 409]);
      const loser = first.status === 409 ? first : second;
      expect.soft(loser.body, `separar ronda ${round}`).toEqual(ORDER_NEEDS_TABLE_BODY);
      // El pedido sigue abierto con exactamente una mesa.
      const restante = (await getOrder(pedido.id, mozo)).body as Order;
      expect.soft(restante.status).toBe('open');
      expect.soft(restante.tables.length).toBe(1);
      await postCancel(pedido.id, { reason: 'fin de ronda' }, mozo);
    }
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-009-21: cancelar‖señal, desactivar‖abrir y unir‖cancelar cierran consistente', async () => {
    const mozo = await cookieFor('adv009.juan', ['waiter'], '2468');
    const admin = await adminCookie();
    const juan = await serviceWaiter();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // (a) cancel ‖ request-bill y cancel ‖ ready: gana quien confirma primero; si la
    // señal llega tarde responde ORDER_NOT_OPEN. Jamás un 500 ni marca en un muerto.
    for (const action of ['request-bill', 'ready']) {
      for (let round = 0; round < 6; round += 1) {
        const mesa = await createTable(`CxS ${action} ${round}`);
        const pedido = await openAt(mesa.id, juan.id);
        const [signal, cancel] = await Promise.all([
          postSignal(pedido.id, action, mozo),
          postCancel(pedido.id, { reason: 'cierre en carrera' }, mozo),
        ]);
        const outcomes: [number, number][] = [
          [200, 200], // la señal marcó primero y luego el pedido se canceló
          [409, 200], // el cancel ganó: la señal llega a un pedido muerto
        ];
        expect
          .soft(
            outcomes.some(([s, c]) => s === signal.status && c === cancel.status),
            `${action} ronda ${round}`,
          )
          .toBe(true);
        if (signal.status === 409) {
          expect.soft(signal.body, `${action} ronda ${round}`).toEqual(ORDER_NOT_OPEN_BODY);
        }
        const row = (await orderRow(pedido.id))[0];
        expect.soft(row?.status, `${action} ronda ${round}`).toBe('cancelled');
        expect.soft((await tableRow(mesa.id))[0]?.current_order_id).toBeNull();
      }
    }
    // (b) cancel ‖ cancel: uno cierra, el otro recibe ORDER_NOT_OPEN. Nunca dos
    // cancelaciones ni 500.
    for (let round = 0; round < 5; round += 1) {
      const mesa = await createTable(`CxC ${round}`);
      const pedido = await openAt(mesa.id, juan.id);
      const [a, b] = await Promise.all([
        postCancel(pedido.id, { reason: 'uno' }, mozo),
        postCancel(pedido.id, { reason: 'dos' }, admin),
      ]);
      expect.soft([a.status, b.status].sort(), `doble cancel ${round}`).toEqual([200, 409]);
      const loser = a.status === 409 ? a : b;
      expect.soft(loser.body).toEqual(ORDER_NOT_OPEN_BODY);
    }
    // (c) desactivar ‖ abrir sobre la misma mesa libre: si la desactivación gana la
    // fila, la apertura recibe TABLE_INACTIVE; si la apertura gana, la desactivación
    // recibe TABLE_HAS_OPEN_ORDER. Nunca ambas "exitosas" a la vez.
    for (let round = 0; round < 8; round += 1) {
      const mesa = await createTable(`DxO ${round}`);
      const [open, off] = await Promise.all([
        postOpenOrder(mesa.id, mozo),
        patchTable(mesa.id, { isActive: false }, admin),
      ]);
      const outcomes: [number, number][] = [
        [201, 409], // abrió primero: no se puede desactivar una mesa cubierta
        [409, 200], // desactivó primero: no se puede abrir una mesa inactiva
      ];
      expect
        .soft(
          outcomes.some(([o, d]) => o === open.status && d === off.status),
          `DxO ${round}`,
        )
        .toBe(true);
      const row = (await tableRow(mesa.id))[0];
      // El par (is_active, current_order_id) final es coherente con el ganador.
      if (open.status === 201) {
        expect.soft(row?.current_order_id, `DxO ${round}`).not.toBeNull();
        expect.soft(row?.is_active, `DxO ${round}`).toBe(true);
      } else {
        expect.soft(row?.current_order_id, `DxO ${round}`).toBeNull();
        expect.soft(row?.is_active, `DxO ${round}`).toBe(false);
        expect.soft(open.body, `DxO ${round}`).toEqual(TABLE_INACTIVE_BODY);
      }
      const pointer = row?.current_order_id;
      if (pointer !== null && pointer !== undefined) {
        await postCancel(pointer, { reason: 'fin de ronda' }, mozo);
      }
    }
    // (d) join origen-ocupado ‖ cancel destino: si el merge entra primero, el cancel
    // libera TODO lo fusionado; si el cancel gana, el join responde TABLE_HAS_NO_ORDER
    // y el origen conserva su cuenta abierta.
    for (let round = 0; round < 8; round += 1) {
      const mesaA = await createTable(`JxC ${round}a`);
      const mesaB = await createTable(`JxC ${round}b`);
      const pedidoA = await openAt(mesaA.id, juan.id);
      const pedidoB = await openAt(mesaB.id, juan.id);
      const [join, cancel] = await Promise.all([
        postJoin(mesaA.id, { intoTableId: mesaB.id }, mozo),
        postCancel(pedidoB.id, { reason: 'cierre en carrera' }, mozo),
      ]);
      const outcomes: [number, number][] = [
        [200, 200], // merge primero: el cancel tumba la cuenta fusionada entera
        [409, 200], // cancel primero: unir a una cuenta muerta no existe
      ];
      expect
        .soft(
          outcomes.some(([j, c]) => j === join.status && c === cancel.status),
          `JxC ${round}`,
        )
        .toBe(true);
      const rowB = (await orderRow(pedidoB.id))[0];
      expect.soft(rowB?.status).toBe('cancelled');
      const rowA = (await orderRow(pedidoA.id))[0];
      const mesaARow = (await tableRow(mesaA.id))[0];
      const mesaBRow = (await tableRow(mesaB.id))[0];
      if (join.status === 200) {
        // La cuenta A quedó absorbida y ambas mesas libres (el cancel barrió todo).
        expect.soft(rowA?.status).toBe('merged');
        expect.soft(rowA?.merged_into_order_id).toBe(pedidoB.id);
        expect.soft(mesaARow?.current_order_id).toBeNull();
        expect.soft(mesaBRow?.current_order_id).toBeNull();
      } else {
        // El join llegó tarde: la cuenta A sigue viva sobre su mesa.
        expect.soft(join.body).toEqual(TABLE_HAS_NO_ORDER_BODY);
        expect.soft(rowA?.status).toBe('open');
        expect.soft(mesaARow?.current_order_id).toBe(pedidoA.id);
        expect.soft(mesaBRow?.current_order_id).toBeNull();
        await postCancel(pedidoA.id, { reason: 'fin de ronda' }, mozo);
      }
    }
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-009-22: GET del tablero durante el merge nunca ve el pedido a medias', async () => {
    const mozo = await cookieFor('adv009.juan', ['waiter'], '2468');
    const juan = await serviceWaiter();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // La lección de ADV-006: listTables lee mesas y pedidos en dos consultas
    // separadas. Mientras se fusionan cuentas, un lector en bucle por HTTP no
    // puede observar estados imposibles: una mesa cubierta por un pedido en
    // estado final, una mesa ausente del pedido que la apunta, ni un tablero
    // que deje de cumplir su propio esquema de respuesta.
    const destino = await createTable('Mesa vista');
    const libres = await Promise.all(
      Array.from({ length: 8 }, (_, i) => createTable(`Sumada ${i}`)),
    );
    const cuenta = await openAt(destino.id, juan.id);
    for (const mesa of libres) {
      await openAt(mesa.id, juan.id);
    }
    expect(orderSchema.safeParse(cuenta).success).toBe(true);
    let checks = 0;
    let stop = false;
    const reader = (async () => {
      while (!stop) {
        const response = await getTables(mozo);
        expect.soft(response.status).toBe(200);
        expect
          .soft(tablesResponseSchema.safeParse(response.body).success, 'tablero válido')
          .toBe(true);
        expect.soft(boardInconsistency(boardRows(response.body)), 'tablero coherente').toBeNull();
        checks += 1;
      }
    })();
    // Ocho uniones en ráfagas de dos mientras el lector audita el GET: cada merge
    // repunta las mesas del origen y tumba su pedido dentro de la transacción;
    // entre las dos lecturas de listTables no debe verse nunca el tránsito.
    for (let i = 0; i < libres.length; i += 2) {
      await Promise.all(
        libres.slice(i, i + 2).map((mesa) => postJoin(mesa.id, { intoTableId: destino.id }, mozo)),
      );
    }
    stop = true;
    await reader;
    expect(checks).toBeGreaterThan(0);
    // Estado final: la cuenta cubre las cinco mesas y cada puntero lo confirma.
    const final = await getOrder(cuenta.id, mozo);
    expect(orderSchema.safeParse(final.body).success).toBe(true);
    const covered = (final.body as Order).tables.map((t) => t.id).sort((a, b) => a - b);
    expect(covered).toEqual([destino, ...libres].map((t) => t.id).sort((a, b) => a - b));
    const pointerRows = await allTableRows();
    expect(
      pointerRows
        .filter((t) => t.current_order_id === cuenta.id)
        .map((t) => t.id)
        .sort(),
    ).toEqual(covered);
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-009-23: la base rechaza lo que la aplicación promete', async () => {
    // Inserción directa contra polleria_test: los CHECK/FK deben impedir filas
    // que la aplicación nunca escribe. Cada insert que cuelga es un hueco real.
    const juan = await serviceWaiter();
    const tryInsert = async (sql: string, bind: unknown[]) => {
      try {
        await database().query(sql, { bind });
        return null; // no falló: hueco
      } catch {
        return 'rejected';
      }
    };
    // (a) Nombre vacío y de solo espacios: tables_name_valid exige <> '' y btrim.
    const emptyName = await tryInsert("INSERT INTO tables (name, is_active) VALUES ('', true)", []);
    expect.soft(emptyName, "INSERT tables name=''").toBe('rejected');
    const spaceName = await tryInsert(
      "INSERT INTO tables (name, is_active) VALUES ('   ', true)",
      [],
    );
    expect.soft(spaceName, "INSERT tables name='   '").toBe('rejected');
    // (b) Pedido con status inventado: orders_status_allowed debe rechazarlo.
    const badStatus = await tryInsert(
      'INSERT INTO "orders" (status, opened_by_user_id) VALUES ($1, $2)',
      ['bogo', juan.id],
    );
    expect.soft(badStatus, "status='bogo'").toBe('rejected');
    // (c) current_order_id apuntando a pedido inexistente: la FK debe rechazarla.
    const danglingPointer = await tryInsert(
      'INSERT INTO tables (name, is_active, current_order_id) VALUES ($1, true, 999999)',
      ['Mesa colgante'],
    );
    expect.soft(danglingPointer, 'current_order_id colgante').toBe('rejected');
    // (d) Segundo nombre en minúsculas: el índice unique(lower(name)) manda.
    await createTable('Mesa Índice');
    const ciDup = await tryInsert('INSERT INTO tables (name, is_active) VALUES ($1, true)', [
      'MESA ÍNDICE',
    ]);
    expect.soft(ciDup, 'nombre duplicado case-insensitive').toBe('rejected');
    // (e) Pedido con opened_by_user_id inexistente: la FK debe rechazarlo.
    const badOwner = await tryInsert(
      'INSERT INTO "orders" (status, opened_by_user_id) VALUES ($1, 999999)',
      ['open'],
    );
    expect.soft(badOwner, 'opened_by_user_id inexistente').toBe('rejected');
    // (f) Pedido cancelado sin motivo: orders_cancel_reason lo veta.
    const noReason = await tryInsert(
      'INSERT INTO "orders" (status, opened_by_user_id, closed_at, closed_by_user_id) ' +
        'VALUES ($1, $2, now(), $2)',
      ['cancelled', juan.id],
    );
    expect.soft(noReason, 'cancelled sin cancel_reason').toBe('rejected');
    // (g) Pedido cerrado sin par fecha+autor: orders_closed_consistent lo veta.
    const closedNoPair = await tryInsert(
      'INSERT INTO "orders" (status, opened_by_user_id, closed_at) VALUES ($1, $2, now())',
      ['cancelled', juan.id],
    );
    expect.soft(closedNoPair, 'cancelled sin closed_by').toBe('rejected');
    // (h) Pedido abierto CON rastro de cierre: mismo CHECK desde el otro lado.
    const mesaX = await createTable('Mesa coherente');
    const pedidoX = await openAt(mesaX.id, juan.id);
    const openClosed = await tryInsert('UPDATE "orders" SET closed_at = now() WHERE id = $1', [
      pedidoX.id,
    ]);
    expect.soft(openClosed, 'open con closed_at').toBe('rejected');
    // (i) Marca lista sin autor (y al revés): orders_ready_pair/bill_pair vetan.
    const halfReady = await tryInsert('UPDATE "orders" SET ready_at = now() WHERE id = $1', [
      pedidoX.id,
    ]);
    expect.soft(halfReady, 'ready_at sin ready_by').toBe('rejected');
    // (j) Una mesa apuntando a un pedido CANCELADO: la base lo permite — el
    // invariante "mesa cubierta ⇒ pedido abierto" vive solo en el servicio
    // (D-009-15 lo documenta). Se registra para que nadie lo crea blindado.
    const mesaDead = await createTable('Mesa puntero muerto');
    const cancelado = await openAt((await createTable('Mesa cadáver')).id, juan.id);
    await orderService.cancelOrder(cancelado.id, 'prueba de puntero', { userId: juan.id });
    const deadPointer = await tryInsert('UPDATE tables SET current_order_id = $1 WHERE id = $2', [
      cancelado.id,
      mesaDead.id,
    ]);
    expect.soft(deadPointer, 'puntero a pedido cancelado (invariante del servicio)').toBeNull();
    await database().query('UPDATE tables SET current_order_id = NULL WHERE id = $1', {
      bind: [mesaDead.id],
    });
    // (k) Auto-fusión: orders_no_self_merge lo prohíbe en base.
    const selfMerge = await tryInsert(
      'UPDATE "orders" SET status = \'merged\', merged_into_order_id = id, ' +
        'closed_at = now(), closed_by_user_id = $1 WHERE id = $2',
      [juan.id, pedidoX.id],
    );
    expect.soft(selfMerge, 'merged_into_order_id = id').toBe('rejected');
  });

  it('ADV-009-24: barrido final — no-store en las doce rutas, éxitos y errores', async () => {
    const mozo = await cookieFor('adv009.juan', ['waiter'], '2468');
    const admin = await adminCookie();
    const juan = await serviceWaiter();
    const mesa = await createTable('Mesa 1');
    const pedido = await openAt(mesa.id, juan.id);
    const libre = await createTable('Mesa 2');
    const calls: [string, () => Promise<request.Response>][] = [
      ['GET /tables', () => getTables(mozo)],
      ['GET /tables 401', () => getTables()],
      ['POST /tables 201', () => postTables({ name: 'Mesa X' }, admin)],
      ['POST /tables 403', () => postTables({ name: 'Mesa Y' }, mozo)],
      ['POST /tables 409', () => postTables({ name: 'mesa 1' }, admin)],
      ['PATCH /tables 200', () => patchTable(mesa.id, { name: 'Mesa Uno' }, admin)],
      ['PATCH /tables 404', () => patchTable(99999, { name: 'X' }, admin)],
      [
        'PATCH /tables 409',
        async () => {
          const response = await patchTable(mesa.id, { isActive: false }, admin);
          expect.soft(response.body).toEqual(TABLE_HAS_OPEN_ORDER_BODY);
          return response;
        },
      ],
      ['POST /tables/{id}/orders 201', () => postOpenOrder(libre.id, mozo)],
      ['POST /tables/{id}/orders 400', () => postOpenOrder('abc', mozo)],
      ['POST /tables/{id}/orders 409', () => postOpenOrder(mesa.id, mozo)],
      ['POST /tables/{id}/join 200', () => postJoin(libre.id, { intoTableId: mesa.id }, mozo)],
      ['POST /tables/{id}/join 400', () => postJoin(mesa.id, { intoTableId: mesa.id }, mozo)],
      ['POST /tables/{id}/leave 200', () => postLeave(mesa.id, mozo)],
      ['GET /orders/{id} 200', () => getOrder(pedido.id, mozo)],
      ['GET /orders/{id} 404', () => getOrder(99999, mozo)],
      ['GET /orders/{id} 400', () => getOrder('1.5', mozo)],
      ['POST /orders/{id}/move 200', () => postMove(pedido.id, { tableId: libre.id }, mozo)],
      ['POST /orders/{id}/move 404', () => postMove(99999, { tableId: libre.id }, mozo)],
      ['POST /orders/{id}/request-bill 200', () => postSignal(pedido.id, 'request-bill', mozo)],
      ['POST /orders/{id}/ready 200', () => postSignal(pedido.id, 'ready', mozo)],
      ['POST /orders/{id}/served 200', () => postSignal(pedido.id, 'served', mozo)],
      ['POST /orders/{id}/cancel 200', () => postCancel(pedido.id, { reason: 'fin' }, mozo)],
      ['POST /orders/{id}/cancel 409', () => postCancel(pedido.id, { reason: 'fin' }, mozo)],
      ['POST /orders/{id}/cancel 400', () => postCancel(pedido.id, {}, mozo)],
    ];
    for (const [name, call] of calls) {
      const response = await call();
      expect
        .soft(response.headers['cache-control'], `${name} → ${response.status}`)
        .toBe('no-store');
      expect.soft(response.headers['surrogate-control'] ?? 'none', name).not.toBeUndefined();
      // Ninguna respuesta JSON del salón lleva ETag ni Last-Modified cacheables.
      expect.soft(response.headers['last-modified'], name).toBeUndefined();
    }
  });
});
