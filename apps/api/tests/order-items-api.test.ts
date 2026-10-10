// AC-15 a AC-19. Spec 010 — archivo nuevo: va EN ROJO hasta que T-11 monte
// las rutas /api/orders/{id}/items*, /api/orders/{id}/tickets y /api/menu.
import request from 'supertest';
import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  kitchenTicketsResponseSchema,
  menuResponseSchema,
  orderResponseSchema,
  sendOrderItemsResponseSchema,
} from '@polleria/shared';
import type { UserRole } from '@polleria/shared';
import { createOrderService } from '../src/services/orders/order.service.ts';
import { createTableService } from '../src/services/tables/table.service.ts';
import { createOrderItemService } from '../src/services/order-items/order-item.service.ts';
import { createProductService } from '../src/services/products/product.service.ts';
import {
  clearMenuTables,
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
const ORDER_NOT_FOUND_BODY = {
  error: { code: 'ORDER_NOT_FOUND', message: 'Ese pedido no existe.', details: null },
};
const ORDER_NOT_OPEN_BODY = {
  error: { code: 'ORDER_NOT_OPEN', message: 'El pedido ya est\u00E1 cerrado.', details: null },
};
const ORDER_ITEM_NOT_FOUND_BODY = {
  error: {
    code: 'ORDER_ITEM_NOT_FOUND',
    message: 'Ese \u00EDtem no existe en este pedido.',
    details: null,
  },
};
const ORDER_ITEM_ALREADY_VOIDED_BODY = {
  error: {
    code: 'ORDER_ITEM_ALREADY_VOIDED',
    message: 'Ese \u00EDtem ya fue anulado.',
    details: null,
  },
};
const ORDER_ITEM_VOID_REQUESTED_BODY = {
  error: {
    code: 'ORDER_ITEM_VOID_REQUESTED',
    message: 'Ese \u00EDtem ya tiene una anulaci\u00F3n pendiente.',
    details: null,
  },
};
const ORDER_ITEM_NOT_REQUESTED_BODY = {
  error: {
    code: 'ORDER_ITEM_NOT_REQUESTED',
    message: 'Ese \u00EDtem no tiene una anulaci\u00F3n pendiente.',
    details: null,
  },
};
const ORDER_HAS_ACTIVE_ITEMS_BODY = {
  error: {
    code: 'ORDER_HAS_ACTIVE_ITEMS',
    message: 'El pedido tiene \u00EDtems sin anular; un administrador debe anularlos primero.',
    details: null,
  },
};
const IDEMPOTENCY_CONFLICT_BODY = {
  error: {
    code: 'IDEMPOTENCY_CONFLICT',
    message: 'Esa clave de env\u00EDo ya se us\u00F3 con otros datos.',
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
const ORDER_ID_MESSAGE = 'El identificador del pedido no es v\u00E1lido.';
const ITEM_ID_MESSAGE = 'El identificador del \u00EDtem no es v\u00E1lido.';
const IDEMPOTENCY_KEY_MESSAGE = 'El env\u00EDo necesita la cabecera Idempotency-Key.';
const REASON_MESSAGE = 'Escribe el motivo de la anulaci\u00F3n (hasta 200 caracteres).';

/** JSON válido de exactamente `bytes` bytes: {"a":"xxx...x"}. */
function jsonBodyOfSize(bytes: number): string {
  const overhead = Buffer.byteLength('{"a":""}');
  return `{"a":"${'x'.repeat(bytes - overhead)}"}`;
}

describe('010: API de ítems del pedido contra polleria_test', () => {
  let sequelize: Sequelize;
  let auth: ReturnType<typeof setupAuth>;
  let orderService: ReturnType<typeof createOrderService>;
  let itemService: ReturnType<typeof createOrderItemService>;

  beforeAll(async () => {
    sequelize = await connectTestDatabase();
  });
  beforeEach(async () => {
    await migrateAndClearAuthTables(sequelize);
    await clearOrderTables(sequelize);
    await clearMenuTables(sequelize);
    auth = setupAuth(sequelize);
    orderService = createOrderService({ models: auth.models });
    itemService = createOrderItemService({ models: auth.models });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await closeTestDatabase(sequelize);
  });

  const rows = <T extends object>(sql: string, bind?: (string | number)[]) =>
    sequelize.query<T>(sql, { type: QueryTypes.SELECT, bind });

  /** Crea una usuaria con esos roles y devuelve la cookie de su sesión real. */
  async function cookieFor(username: string, roles: UserRole[], pin: string) {
    await auth.createUser(username, 'Persona', roles, pin);
    return (await loginWithCookie(auth.app, username, pin)).cookie;
  }
  /** El mozo Juan y la carta mínima (una bebida) para los envíos. */
  async function seed() {
    const mozo = await auth.createUser('mozo.juan', 'Juan', ['waiter'], '2468');
    const mesa3 = await createTableService({ models: auth.models }).createTable({
      name: 'Mesa 3',
    });
    const order = await orderService.openOrder(mesa3.id, { userId: mozo.id });
    const incaKola = await createProductService({ models: auth.models }).createProduct({
      name: 'Inca Kola 1L',
      category: 'drink',
      priceCents: 800,
    });
    return { mozo, mesa3, order, incaKola };
  }
  /** El primer ítem enviado del pedido (fixture por servicio). */
  async function sentItem(orderId: number, productId: number, userId: number, key = 'k-1') {
    const { order } = await itemService.sendItems(orderId, { items: [{ productId }] }, key, {
      userId,
    });
    return order.items[0];
  }

  const postItems = (orderId: number | string, body: unknown, key?: string, cookie?: string) => {
    let call = request(auth.app).post(`/api/orders/${orderId}/items`);
    if (key !== undefined) call = call.set('Idempotency-Key', key);
    call = call.send(body as object);
    return cookie === undefined ? call : call.set('Cookie', cookie);
  };
  const postVoidAction = (
    orderId: number | string,
    itemId: number | string,
    action: 'request-void' | 'void' | 'reject-void',
    body: unknown,
    key?: string,
    cookie?: string,
  ) => {
    let call = request(auth.app).post(`/api/orders/${orderId}/items/${itemId}/${action}`);
    if (key !== undefined) call = call.set('Idempotency-Key', key);
    if (body !== undefined) call = call.send(body as object);
    return cookie === undefined ? call : call.set('Cookie', cookie);
  };
  const getTickets = (orderId: number | string, cookie?: string) => {
    const call = request(auth.app).get(`/api/orders/${orderId}/tickets`);
    return cookie === undefined ? call : call.set('Cookie', cookie);
  };
  const getMenu = (cookie?: string) => {
    const call = request(auth.app).get('/api/menu');
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

  it('AC-15: POST /items con mozo o admin crea ítems, emite comanda y devuelve 201', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const s = await seed();
    const mozo = await loginWithCookie(auth.app, 'mozo.juan', '2468');
    const response = await postItems(
      s.order.id,
      { items: [{ productId: s.incaKola.id, quantity: 2 }] },
      'k-1',
      mozo.cookie,
    );
    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    const parsed = sendOrderItemsResponseSchema.parse(response.body);
    expect(parsed.ticket.kind).toBe('initial');
    expect(parsed.order.items).toHaveLength(1);
    expect(parsed.order.items[0]).toMatchObject({
      productId: s.incaKola.id,
      priceCents: 800,
      quantity: 2,
      status: 'sent',
    });
    expect(parsed.order.totalCents).toBe(1600);
    // El admin también puede enviar.
    const admin = await cookieFor('mesa.duena', ['admin'], '975310');
    const again = await postItems(
      s.order.id,
      { items: [{ productId: s.incaKola.id }] },
      'k-2',
      admin,
    );
    expect(again.status).toBe(201);
    expect(again.body.ticket.kind).toBe('additional');
    expect(log).not.toHaveBeenCalled();
  });
  it('AC-15: POST /items rechaza a cocina y caja, y exige sesión', async () => {
    const s = await seed();
    for (const roles of [['kitchen'], ['cashier']] as UserRole[][]) {
      const cookie = await cookieFor(`rol.${roles[0]}`, roles, '1357');
      const response = await postItems(
        s.order.id,
        { items: [{ productId: s.incaKola.id }] },
        `k-${roles[0]}`,
        cookie,
      );
      expect(response.status).toBe(403);
      expect(response.body).toEqual(FORBIDDEN_BODY);
      expect(response.headers['cache-control']).toBe('no-store');
    }
    const anon = await postItems(s.order.id, { items: [{ productId: s.incaKola.id }] }, 'k-anon');
    expect(anon.status).toBe(401);
    expect(anon.body).toEqual(UNAUTHENTICATED_BODY);
    expect(anon.headers['cache-control']).toBe('no-store');
  });
  it('AC-15: POST /items exige Idempotency-Key y valida orderId', async () => {
    const s = await seed();
    const mozo = await loginWithCookie(auth.app, 'mozo.juan', '2468');
    // Sin cabecera y con cabecera mal formada → issue en idempotencyKey.
    for (const key of [undefined, 'con espacio']) {
      const issues = validationIssues(
        await postItems(s.order.id, { items: [{ productId: s.incaKola.id }] }, key, mozo.cookie),
      );
      expect(issues).toContainEqual({
        path: 'idempotencyKey',
        message: IDEMPOTENCY_KEY_MESSAGE,
      });
    }
    // orderId inválido → issue en orderId; inexistente → 404; cerrado → 409.
    for (const id of ['abc', '0', '1.5', '-3', '2147483648'])
      expect(
        validationIssues(await postItems(id, { items: [] }, 'k-x', mozo.cookie)),
      ).toContainEqual({ path: 'orderId', message: ORDER_ID_MESSAGE });
    const notFound = await postItems(
      999999,
      { items: [{ productId: s.incaKola.id }] },
      'k-nf',
      mozo.cookie,
    );
    expect(notFound.status).toBe(404);
    expect(notFound.body).toEqual(ORDER_NOT_FOUND_BODY);
    await sequelize.query("UPDATE orders SET status = 'closed' WHERE id = $1", {
      bind: [s.order.id],
    });
    const closed = await postItems(
      s.order.id,
      { items: [{ productId: s.incaKola.id }] },
      'k-cl',
      mozo.cookie,
    );
    expect(closed.status).toBe(409);
    expect(closed.body).toEqual(ORDER_NOT_OPEN_BODY);
  });
  it('AC-15: el replay HTTP devuelve la misma respuesta sin filas nuevas', async () => {
    const s = await seed();
    const mozo = await loginWithCookie(auth.app, 'mozo.juan', '2468');
    const body = { items: [{ productId: s.incaKola.id }] };
    const first = await postItems(s.order.id, body, 'k-9', mozo.cookie);
    const counts = async () => ({
      items: (await rows<{ c: number }>('SELECT count(*)::int AS c FROM order_items'))[0]?.c,
      keys: (await rows<{ c: number }>('SELECT count(*)::int AS c FROM idempotency_keys'))[0]?.c,
    });
    const before = await counts();
    const replay = await postItems(s.order.id, body, 'k-9', mozo.cookie);
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(first.body);
    expect(await counts()).toEqual(before);
    const conflict = await postItems(
      s.order.id,
      { items: [{ productId: s.incaKola.id, quantity: 2 }] },
      'k-9',
      mozo.cookie,
    );
    expect(conflict.status).toBe(409);
    expect(conflict.body).toEqual(IDEMPOTENCY_CONFLICT_BODY);
  });
  it('AC-15: los issues por ítem llegan acumulados en details.issues', async () => {
    const s = await seed();
    const mozo = await loginWithCookie(auth.app, 'mozo.juan', '2468');
    const issues = validationIssues(
      await postItems(
        s.order.id,
        {
          items: [{ productId: 999999 }, { productId: s.incaKola, portion: 'quarter', cut: 'leg' }],
        },
        'k-1',
        mozo.cookie,
      ),
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        { path: 'items.0.productId', message: 'Ese producto no existe.' },
        {
          path: 'items.1.portion',
          message: 'Este producto no lleva presentaci\u00F3n ni parte.',
        },
      ]),
    );
  });

  it('AC-16: request-void con mozo o admin deja el ítem void_requested', async () => {
    const s = await seed();
    const mozo = await loginWithCookie(auth.app, 'mozo.juan', '2468');
    const item = await sentItem(s.order.id, s.incaKola.id, s.mozo.id);
    const response = await postVoidAction(
      s.order.id,
      item.id,
      'request-void',
      { reason: 'Se equivoc\u00F3 el cliente' },
      'k-r1',
      mozo.cookie,
    );
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const { order } = orderResponseSchema.parse(response.body);
    expect(order.items[0]).toMatchObject({
      status: 'void_requested',
      voidRequestReason: 'Se equivoc\u00F3 el cliente',
    });
    // Otra clave sobre el pendiente → 409.
    const pending = await postVoidAction(
      s.order.id,
      item.id,
      'request-void',
      { reason: 'otro' },
      'k-r2',
      mozo.cookie,
    );
    expect(pending.status).toBe(409);
    expect(pending.body).toEqual(ORDER_ITEM_VOID_REQUESTED_BODY);
  });
  it('AC-16: request-void rechaza roles, ausencias y estados inválidos', async () => {
    const s = await seed();
    const mozo = await loginWithCookie(auth.app, 'mozo.juan', '2468');
    const item = await sentItem(s.order.id, s.incaKola.id, s.mozo.id);
    for (const roles of [['kitchen'], ['cashier']] as UserRole[][]) {
      const cookie = await cookieFor(`rv.${roles[0]}`, roles, '1357');
      const response = await postVoidAction(
        s.order.id,
        item.id,
        'request-void',
        { reason: 'x' },
        'k-r9',
        cookie,
      );
      expect(response.status).toBe(403);
      expect(response.body).toEqual(FORBIDDEN_BODY);
    }
    const anon = await postVoidAction(s.order.id, item.id, 'request-void', { reason: 'x' }, 'k-r8');
    expect(anon.status).toBe(401);
    expect(anon.body).toEqual(UNAUTHENTICATED_BODY);
    for (const [body, key] of [
      [{}, 'k-1'],
      [{ reason: 'x' }, undefined],
    ] as const) {
      const issues = validationIssues(
        await postVoidAction(s.order.id, item.id, 'request-void', body, key, mozo.cookie),
      );
      expect(
        issues.some(
          (i) =>
            (i.path === 'reason' && i.message === REASON_MESSAGE) ||
            (i.path === 'idempotencyKey' && i.message === IDEMPOTENCY_KEY_MESSAGE),
        ),
      ).toBe(true);
    }
    // Ítem ajeno y pedido cerrado.
    const missing = await postVoidAction(
      s.order.id,
      999999,
      'request-void',
      { reason: 'x' },
      'k-m1',
      mozo.cookie,
    );
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual(ORDER_ITEM_NOT_FOUND_BODY);
    const badId = validationIssues(
      await postVoidAction(s.order.id, 'abc', 'request-void', { reason: 'x' }, 'k-b1', mozo.cookie),
    );
    expect(badId).toContainEqual({ path: 'itemId', message: ITEM_ID_MESSAGE });
    await sequelize.query("UPDATE orders SET status = 'closed' WHERE id = $1", {
      bind: [s.order.id],
    });
    const closed = await postVoidAction(
      s.order.id,
      item.id,
      'request-void',
      { reason: 'x' },
      'k-c1',
      mozo.cookie,
    );
    expect(closed.status).toBe(409);
    expect(closed.body).toEqual(ORDER_NOT_OPEN_BODY);
  });
  it('AC-16: void con admin anula directo o aprueba; los demás roles no', async () => {
    const s = await seed();
    const mozo = await loginWithCookie(auth.app, 'mozo.juan', '2468');
    const admin = await cookieFor('mesa.duena', ['admin'], '975310');
    const item = await sentItem(s.order.id, s.incaKola.id, s.mozo.id);
    // Anulación directa sobre 'sent'.
    const response = await postVoidAction(
      s.order.id,
      item.id,
      'void',
      { reason: 'Confirmado' },
      'k-v1',
      admin,
    );
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const { order, ticket } = sendOrderItemsResponseSchema.parse(response.body);
    expect(ticket.kind).toBe('void');
    expect(order.items[0].status).toBe('voided');
    // Ya anulado → ALREADY_VOIDED.
    const again = await postVoidAction(s.order.id, item.id, 'void', { reason: 'x' }, 'k-v2', admin);
    expect(again.status).toBe(409);
    expect(again.body).toEqual(ORDER_ITEM_ALREADY_VOIDED_BODY);
    // Otro ítem + solicitud → void del admin aprueba.
    const item2 = await sentItem(s.order.id, s.incaKola.id, s.mozo.id, 'k-3');
    await postVoidAction(
      s.order.id,
      item2.id,
      'request-void',
      { reason: 'pido' },
      'k-r1',
      mozo.cookie,
    );
    const approved = await postVoidAction(
      s.order.id,
      item2.id,
      'void',
      { reason: 'aprobado' },
      'k-v3',
      admin,
    );
    expect(approved.status).toBe(200);
    expect(approved.body.order.items.find((i: { id: number }) => i.id === item2.id)).toMatchObject({
      status: 'voided',
      voidRequestReason: 'pido',
    });
    // Mozo no anula.
    const waiter = await postVoidAction(
      s.order.id,
      item2.id,
      'void',
      { reason: 'x' },
      'k-v4',
      mozo.cookie,
    );
    expect(waiter.status).toBe(403);
    expect(waiter.body).toEqual(FORBIDDEN_BODY);
    // Sin cabecera → issue en idempotencyKey; ítem ajeno → 404.
    const noKey = validationIssues(
      await postVoidAction(s.order.id, item.id, 'void', { reason: 'x' }, undefined, admin),
    );
    expect(noKey).toContainEqual({ path: 'idempotencyKey', message: IDEMPOTENCY_KEY_MESSAGE });
  });
  it('AC-16: reject-void con admin devuelve el ítem a sent sin cuerpo', async () => {
    const s = await seed();
    const mozo = await loginWithCookie(auth.app, 'mozo.juan', '2468');
    const admin = await cookieFor('mesa.duena', ['admin'], '975310');
    const item = await sentItem(s.order.id, s.incaKola.id, s.mozo.id);
    // Sobre 'sent' → NOT_REQUESTED.
    const notRequested = await postVoidAction(
      s.order.id,
      item.id,
      'reject-void',
      undefined,
      'k-x0',
      admin,
    );
    expect(notRequested.status).toBe(409);
    expect(notRequested.body).toEqual(ORDER_ITEM_NOT_REQUESTED_BODY);
    await postVoidAction(
      s.order.id,
      item.id,
      'request-void',
      { reason: 'pido' },
      'k-r1',
      mozo.cookie,
    );
    // La ruta no lleva cuerpo: un JSON de más se ignora.
    const response = await postVoidAction(
      s.order.id,
      item.id,
      'reject-void',
      { extra: 'ignorado' },
      'k-x1',
      admin,
    );
    expect(response.status).toBe(200);
    const { order } = orderResponseSchema.parse(response.body);
    expect(order.items[0]).toMatchObject({ status: 'sent', voidRequestReason: null });
    // Mozo no resuelve; sin cabecera → 400.
    const waiter = await postVoidAction(
      s.order.id,
      item.id,
      'reject-void',
      undefined,
      'k-x2',
      mozo.cookie,
    );
    expect(waiter.status).toBe(403);
    expect(waiter.body).toEqual(FORBIDDEN_BODY);
    const noKey = validationIssues(
      await postVoidAction(s.order.id, item.id, 'reject-void', undefined, undefined, admin),
    );
    expect(noKey).toContainEqual({ path: 'idempotencyKey', message: IDEMPOTENCY_KEY_MESSAGE });
    const missing = await postVoidAction(
      s.order.id,
      999999,
      'reject-void',
      undefined,
      'k-x3',
      admin,
    );
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual(ORDER_ITEM_NOT_FOUND_BODY);
    await sequelize.query("UPDATE orders SET status = 'closed' WHERE id = $1", {
      bind: [s.order.id],
    });
    const closed = await postVoidAction(
      s.order.id,
      item.id,
      'reject-void',
      undefined,
      'k-x4',
      admin,
    );
    expect(closed.status).toBe(409);
    expect(closed.body).toEqual(ORDER_NOT_OPEN_BODY);
  });
  it('AC-16: request-void y reject-void rechazan ítem voided', async () => {
    const s = await seed();
    const admin = await cookieFor('mesa.duena', ['admin'], '975310');
    const item = await sentItem(s.order.id, s.incaKola.id, s.mozo.id);
    await postVoidAction(s.order.id, item.id, 'void', { reason: 'ok' }, 'k-v1', admin);
    const mozo = await loginWithCookie(auth.app, 'mozo.juan', '2468');
    const reqAgain = await postVoidAction(
      s.order.id,
      item.id,
      'request-void',
      { reason: 'x' },
      'k-r2',
      mozo.cookie,
    );
    expect(reqAgain.status).toBe(409);
    expect(reqAgain.body).toEqual(ORDER_ITEM_ALREADY_VOIDED_BODY);
    const rejAgain = await postVoidAction(
      s.order.id,
      item.id,
      'reject-void',
      undefined,
      'k-x1',
      admin,
    );
    expect(rejAgain.status).toBe(409);
    expect(rejAgain.body).toEqual(ORDER_ITEM_ALREADY_VOIDED_BODY);
  });

  it('AC-17: GET /api/menu responde a cualquier rol con la carta y no-store', async () => {
    const s = await seed();
    for (const roles of [['waiter'], ['admin'], ['kitchen'], ['cashier']] as UserRole[][]) {
      const cookie = await cookieFor(`menu.${roles[0]}`, roles, '1357');
      const response = await getMenu(cookie);
      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      const { products } = menuResponseSchema.parse(response.body);
      expect(products.map((p: { name: string }) => p.name)).toContain('Inca Kola 1L');
    }
    const anon = await getMenu();
    expect(anon.status).toBe(401);
    expect(anon.body).toEqual(UNAUTHENTICATED_BODY);
    expect(anon.headers['cache-control']).toBe('no-store');
    expect(s.order.id).toBeGreaterThan(0);
  });
  it('AC-17: GET /orders/{id}/tickets lista comandas a cualquier rol', async () => {
    const s = await seed();
    const mozo = await loginWithCookie(auth.app, 'mozo.juan', '2468');
    await postItems(s.order.id, { items: [{ productId: s.incaKola.id }] }, 'k-1', mozo.cookie);
    for (const roles of [['kitchen'], ['cashier'], ['admin']] as UserRole[][]) {
      const cookie = await cookieFor(`tk.${roles[0]}`, roles, '1357');
      const response = await getTickets(s.order.id, cookie);
      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      const { tickets } = kitchenTicketsResponseSchema.parse(response.body);
      expect(tickets).toHaveLength(1);
      expect(tickets[0]).toMatchObject({ kind: 'initial', orderId: s.order.id });
    }
    const anon = await getTickets(s.order.id);
    expect(anon.status).toBe(401);
    const notFound = await getTickets(999999, mozo.cookie);
    expect(notFound.status).toBe(404);
    expect(notFound.body).toEqual(ORDER_NOT_FOUND_BODY);
    expect(validationIssues(await getTickets('abc', mozo.cookie))).toContainEqual({
      path: 'orderId',
      message: ORDER_ID_MESSAGE,
    });
    // Sin envíos → lista vacía.
    const mesa9 = await createTableService({ models: auth.models }).createTable({ name: 'Mesa 9' });
    const vacio = await orderService.openOrder(mesa9.id, { userId: s.mozo.id });
    const empty = await getTickets(vacio.id, mozo.cookie);
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual({ tickets: [] });
  });

  it('AC-18: cancel con ítems activos 409; solo anulados 403 mozo / 200 admin', async () => {
    const s = await seed();
    const mozo = await loginWithCookie(auth.app, 'mozo.juan', '2468');
    const admin = await cookieFor('mesa.duena', ['admin'], '975310');
    const item = await sentItem(s.order.id, s.incaKola.id, s.mozo.id);
    const cancel = (cookie: string) =>
      request(auth.app)
        .post(`/api/orders/${s.order.id}/cancel`)
        .set('Cookie', cookie)
        .send({ reason: 'Se fueron sin pedir' });
    const active = await cancel(mozo.cookie);
    expect(active.status).toBe(409);
    expect(active.body).toEqual(ORDER_HAS_ACTIVE_ITEMS_BODY);
    await postVoidAction(s.order.id, item.id, 'void', { reason: 'ok' }, 'k-v1', admin);
    const waiter = await cancel(mozo.cookie);
    expect(waiter.status).toBe(403);
    expect(waiter.body).toEqual(FORBIDDEN_BODY);
    const done = await cancel(admin);
    expect(done.status).toBe(200);
    expect(done.body.order.status).toBe('cancelled');
  });
  it('AC-18: join por HTTP mueve los ítems y el tablero suma el total', async () => {
    const s = await seed();
    const mozo = await loginWithCookie(auth.app, 'mozo.juan', '2468');
    const mesa4 = await createTableService({ models: auth.models }).createTable({ name: 'Mesa 4' });
    const orderQ = await orderService.openOrder(mesa4.id, { userId: s.mozo.id });
    await postItems(s.order.id, { items: [{ productId: s.incaKola.id }] }, 'k-1', mozo.cookie);
    await postItems(orderQ.id, { items: [{ productId: s.incaKola.id }] }, 'k-2', mozo.cookie);
    const join = await request(auth.app)
      .post(`/api/tables/${mesa4.id}/join`)
      .set('Cookie', mozo.cookie)
      .send({ intoTableId: s.mesa3.id });
    expect(join.status).toBe(200);
    const view = await request(auth.app).get('/api/tables').set('Cookie', mozo.cookie);
    const mesa3view = (view.body.tables as { id: number; order: { totalCents: number } }[]).find(
      (t) => t.id === s.mesa3.id,
    );
    expect(mesa3view?.order.totalCents).toBe(1600);
    const orderP = await request(auth.app)
      .get(`/api/orders/${s.order.id}`)
      .set('Cookie', mozo.cookie);
    expect(orderP.body.order.items).toHaveLength(2);
    expect(orderP.body.order.totalCents).toBe(1600);
  });

  it('AC-19: métodos y sub-rutas no declarados responden 404 con no-store', async () => {
    const s = await seed();
    const mozo = await loginWithCookie(auth.app, 'mozo.juan', '2468');
    for (const call of [
      request(auth.app).patch(`/api/orders/${s.order.id}/items`).set('Cookie', mozo.cookie),
      request(auth.app).delete(`/api/orders/${s.order.id}/items`).set('Cookie', mozo.cookie),
      request(auth.app).put(`/api/orders/${s.order.id}/items/1/void`).set('Cookie', mozo.cookie),
      request(auth.app).get(`/api/orders/${s.order.id}/items/1/void`).set('Cookie', mozo.cookie),
      request(auth.app)
        .post(`/api/orders/${s.order.id}/items/1/approve`)
        .set('Cookie', mozo.cookie),
      request(auth.app).post('/api/menu').set('Cookie', mozo.cookie),
      request(auth.app).get(`/api/orders/${s.order.id}/tickets/1`).set('Cookie', mozo.cookie),
    ]) {
      const response = await call;
      expect(response.status).toBe(404);
      expect(response.body).toEqual(NOT_FOUND_BODY);
      expect(response.headers['cache-control']).toBe('no-store');
    }
  });
  it('AC-19: el lector de cuerpos responde sus cuatro errores en las rutas con cuerpo', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const s = await seed();
    const mozo = await loginWithCookie(auth.app, 'mozo.juan', '2468');
    const admin = await cookieFor('mesa.duena', ['admin'], '975310');
    const item = await sentItem(s.order.id, s.incaKola.id, s.mozo.id);
    const bodyRouteFactories = [
      () =>
        request(auth.app)
          .post(`/api/orders/${s.order.id}/items`)
          .set('Cookie', mozo.cookie)
          .set('Idempotency-Key', 'k-b1'),
      () =>
        request(auth.app)
          .post(`/api/orders/${s.order.id}/items/${item.id}/request-void`)
          .set('Cookie', mozo.cookie)
          .set('Idempotency-Key', 'k-b2'),
      () =>
        request(auth.app)
          .post(`/api/orders/${s.order.id}/items/${item.id}/void`)
          .set('Cookie', admin)
          .set('Idempotency-Key', 'k-b3'),
    ];
    for (const makeCall of bodyRouteFactories) {
      const badJson = await sendRawBody(
        makeCall().set('Content-Type', 'application/json'),
        Buffer.from('{"items":'),
      );
      expect(badJson.status).toBe(400);
      expect(badJson.body).toEqual(INVALID_JSON_BODY);
      expect(badJson.headers['cache-control']).toBe('no-store');
      const notObject = await sendRawBody(
        makeCall().set('Content-Type', 'application/json'),
        Buffer.from('[1, 2]'),
      );
      expect(notObject.status).toBe(400);
      expect(notObject.body).toEqual(INVALID_BODY_BODY);
      expect(notObject.headers['cache-control']).toBe('no-store');
      const wrongType = await sendRawBody(
        makeCall().set('Content-Type', 'text/plain'),
        Buffer.from('{"a":1}'),
      );
      expect(wrongType.status).toBe(415);
      expect(wrongType.body).toEqual(UNSUPPORTED_MEDIA_TYPE_BODY);
      const tooLarge = await sendRawBody(
        makeCall().set('Content-Type', 'application/json'),
        Buffer.from(jsonBodyOfSize(150 * 1024)),
      );
      expect(tooLarge.status).toBe(413);
      expect(tooLarge.body).toEqual(PAYLOAD_TOO_LARGE_BODY);
    }
    expect(log).not.toHaveBeenCalled();
  });
});
