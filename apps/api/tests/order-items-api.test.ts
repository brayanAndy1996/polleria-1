// AC-15 a AC-19. Spec 010 — archivo nuevo: va EN ROJO hasta que T-11/T-12 monten
// las rutas /api/menu y /api/orders/{id}/items[/…] con sus controllers, roles,
// cabecera Idempotency-Key y lectores de cuerpo.
import request from 'supertest';
import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  kitchenTicketsResponseSchema,
  menuResponseSchema,
  orderSchema,
  sendOrderItemsResponseSchema,
} from '@polleria/shared';
import type { KitchenTicket, Order, OrderItem, Table, UserRole } from '@polleria/shared';
import { createComboItemService } from '../src/services/combo-items/combo-item.service.ts';
import { createOrderService } from '../src/services/orders/order.service.ts';
import { createProductPortionService } from '../src/services/products/product-portion.service.ts';
import { createProductService } from '../src/services/products/product.service.ts';
import { createTableService } from '../src/services/tables/table.service.ts';
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
const NOT_FOUND_BODY = {
  error: { code: 'NOT_FOUND', message: 'La ruta solicitada no existe.', details: null },
};
const ORDER_NOT_FOUND_BODY = {
  error: { code: 'ORDER_NOT_FOUND', message: 'Ese pedido no existe.', details: null },
};
const ORDER_ITEM_NOT_FOUND_BODY = {
  error: {
    code: 'ORDER_ITEM_NOT_FOUND',
    message: 'Ese \u00EDtem no existe en este pedido.',
    details: null,
  },
};
const ORDER_NOT_OPEN_BODY = {
  error: { code: 'ORDER_NOT_OPEN', message: 'El pedido ya est\u00E1 cerrado.', details: null },
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

describe('010: API de ítems, comandas y menú contra polleria_test', () => {
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
    await clearMenuTables(sequelize);
    auth = setupAuth(sequelize);
    tableService = createTableService({ models: auth.models });
    orderService = createOrderService({ models: auth.models });
  });
  afterAll(async () => {
    await closeTestDatabase(sequelize);
  });

  const rows = <T extends object>(sql: string, bind?: (string | number)[]) =>
    sequelize.query<T>(sql, { type: QueryTypes.SELECT, bind });
  const itemCount = (orderId: number) =>
    rows<{ id: number }>('SELECT id FROM order_items WHERE order_id = $1', [orderId]);
  const ticketCount = (orderId: number) =>
    rows<{ id: number }>('SELECT id FROM kitchen_tickets WHERE order_id = $1', [orderId]);
  const keyCount = () => rows<{ id: number }>('SELECT id FROM idempotency_keys');

  /** Crea el usuario con su nombre visible y devuelve su cookie de sesión y el usuario. */
  async function cookieFor(username: string, displayName: string, roles: UserRole[], pin: string) {
    const user = await auth.createUser(username, displayName, roles, pin);
    const { cookie } = await loginWithCookie(auth.app, username, pin);
    return { cookie, user };
  }
  const mozoCookie = () => cookieFor('items.juan', 'Juan', ['waiter'], '2468');
  const adminCookie = () => cookieFor('items.dueno', 'Due\u00F1o', ['admin'], '975310');
  // Cocina y caja solo ejercitan el 403: basta su cookie.
  const cocinaCookie = async () =>
    (await cookieFor('items.cocina', 'Beto', ['kitchen'], '1357')).cookie;
  const cajaCookie = async () =>
    (await cookieFor('items.caja', 'Rosa', ['cashier'], '8642')).cookie;

  /** La carta semilla de la spec §4.3, por servicios, como fixture. */
  async function seedMenu() {
    const products = createProductService({ models: auth.models });
    const portions = createProductPortionService({ models: auth.models });
    const combos = createComboItemService({ models: auth.models });
    const pollo = await products.createProduct({
      name: 'Pollo a la brasa',
      category: 'chicken',
      priceCents: 4800,
    });
    await portions.replaceProductPortions(pollo.id, {
      portions: [
        { portion: 'quarter', cut: 'breast', priceCents: 1500 },
        { portion: 'quarter', cut: 'leg', priceCents: 1400 },
        { portion: 'half', priceCents: 2600 },
        { portion: 'whole', priceCents: 4800 },
      ],
    });
    const anticucho = await products.createProduct({
      name: 'Anticucho de pollo',
      category: 'chicken',
      priceCents: 1200,
    });
    const incaKola = await products.createProduct({
      name: 'Inca Kola 1L',
      category: 'drink',
      priceCents: 800,
    });
    const aji = await products.createProduct({
      name: 'Aj\u00ED',
      category: 'sauce',
      priceCents: 0,
    });
    const ocopa = await products.createProduct({
      name: 'Ocopa',
      category: 'sauce',
      priceCents: 300,
    });
    const mostrito = await products.createProduct({
      name: 'Mostrito',
      category: 'combo',
      priceCents: 2200,
    });
    await combos.replaceComboItems(mostrito.id, {
      items: [
        { productId: pollo.id, quantity: 1, portion: 'quarter', cut: 'leg' },
        { productId: incaKola.id, quantity: 1 },
      ],
    });
    return {
      pollo: pollo.id,
      anticucho: anticucho.id,
      incaKola: incaKola.id,
      aji: aji.id,
      ocopa: ocopa.id,
      mostrito: mostrito.id,
    };
  }

  /** Mesa activa por el servicio; pedido abierto por el servicio (fixtures). */
  const createTable = (name: string): Promise<Table> => tableService.createTable({ name });
  const openAt = (tableId: number, userId: number): Promise<Order> =>
    orderService.openOrder(tableId, { userId });
  /** Mesa con pedido abierto por `userId`, lista para recibir ítems. */
  async function orderOnTable(name: string, userId: number) {
    const table = await createTable(name);
    const order = await openAt(table.id, userId);
    return { table, order };
  }
  /** Envía un ítem simple por HTTP y devuelve el ítem creado. */
  async function sendOne(orderId: number, productId: number, key: string, cookie: string) {
    const response = await postItems(orderId, { items: [{ productId }] }, key, cookie);
    expect(response.status).toBe(201);
    const items = (response.body as { order: Order }).order.items;
    return items[items.length - 1] as OrderItem;
  }

  const postItems = (orderId: number | string, body: unknown, key?: string, cookie?: string) => {
    let call = request(auth.app).post(`/api/orders/${orderId}/items`);
    if (key !== undefined) call = call.set('Idempotency-Key', key);
    if (cookie !== undefined) call = call.set('Cookie', cookie);
    return call.send(body as object);
  };
  const postItemAction = (
    orderId: number | string,
    itemId: number | string,
    action: 'request-void' | 'void' | 'reject-void',
    key?: string,
    body?: unknown,
    cookie?: string,
  ) => {
    let call = request(auth.app).post(`/api/orders/${orderId}/items/${itemId}/${action}`);
    if (key !== undefined) call = call.set('Idempotency-Key', key);
    if (cookie !== undefined) call = call.set('Cookie', cookie);
    // reject-void es bodiless; el cuerpo solo se manda cuando la prueba lo pide
    // (por ejemplo, para comprobar que se ignora).
    return body === undefined ? call : call.send(body as object);
  };
  const getTickets = (orderId: number | string, cookie?: string) => {
    const call = request(auth.app).get(`/api/orders/${orderId}/tickets`);
    return cookie === undefined ? call : call.set('Cookie', cookie);
  };
  const getMenu = (cookie?: string) => {
    const call = request(auth.app).get('/api/menu');
    return cookie === undefined ? call : call.set('Cookie', cookie);
  };
  const getOrder = (id: number | string, cookie?: string) => {
    const call = request(auth.app).get(`/api/orders/${id}`);
    return cookie === undefined ? call : call.set('Cookie', cookie);
  };
  const postCancel = (id: number | string, body: unknown, cookie?: string) => {
    const call = request(auth.app)
      .post(`/api/orders/${id}/cancel`)
      .send(body as object);
    return cookie === undefined ? call : call.set('Cookie', cookie);
  };
  const postJoin = (id: number | string, body: unknown, cookie?: string) => {
    const call = request(auth.app)
      .post(`/api/tables/${id}/join`)
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

  it('AC-15: POST /api/orders/{id}/items responde 201 con order+ticket y no-store', async () => {
    const { cookie, user: juan } = await mozoCookie();
    const menu = await seedMenu();
    const { table, order } = await orderOnTable('Mesa 3', juan.id);

    const response = await postItems(
      order.id,
      {
        items: [
          {
            productId: menu.pollo,
            quantity: 2,
            portion: 'quarter',
            cut: 'leg',
            notes: 'sin ensalada',
            sauces: [{ productId: menu.aji }, { productId: menu.ocopa, quantity: 2 }],
          },
          { productId: menu.incaKola },
          { productId: menu.mostrito },
        ],
      },
      'pedido-m3-001',
      cookie,
    );
    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(sendOrderItemsResponseSchema.safeParse(response.body as unknown).success).toBe(true);
    const body = response.body as {
      order: Order;
      ticket: { id: number; kind: string; orderId: number };
    };
    // El pedido embebido ya trae items y totalCents (el total del ejemplo de la spec: 6400).
    expect(body.order.totalCents).toBe(6400);
    expect(body.order.items).toHaveLength(3);
    expect(body.order.items[0]).toMatchObject({
      productId: menu.pollo,
      productName: 'Pollo a la brasa',
      productCategory: 'chicken',
      quantity: 2,
      priceCents: 1400,
      portion: 'quarter',
      cut: 'leg',
      breastEighths: 0,
      legEighths: 4,
      notes: 'sin ensalada',
      status: 'sent',
      kitchenTicketId: body.ticket.id,
      orderedAtTable: { id: table.id, name: 'Mesa 3' },
      createdBy: { id: juan.id, displayName: 'Juan' },
      sauces: [
        { productId: menu.aji, productName: 'Aj\u00ED', quantity: 1, priceCents: 0 },
        { productId: menu.ocopa, productName: 'Ocopa', quantity: 2, priceCents: 300 },
      ],
    });
    expect(body.ticket).toMatchObject({ orderId: order.id, kind: 'initial' });
    // El admin también puede enviar (RN-010-14).
    const { cookie: admin } = await adminCookie();
    const segunda = await postItems(
      order.id,
      { items: [{ productId: menu.incaKola }] },
      'pedido-m3-002',
      admin,
    );
    expect(segunda.status).toBe(201);
    expect((segunda.body as { ticket: { kind: string } }).ticket.kind).toBe('additional');
  });

  it('AC-15: roles, sesión, cabecera y orderId responden su código', async () => {
    const { cookie, user: juan } = await mozoCookie();
    const menu = await seedMenu();
    const { order } = await orderOnTable('Mesa 3', juan.id);
    const body = { items: [{ productId: menu.incaKola }] };

    // Cocina y caja reciben 403; sin cookie 401.
    for (const other of [await cocinaCookie(), await cajaCookie()]) {
      const forbidden = await postItems(order.id, body, 'k-rol', other);
      expect(forbidden.status).toBe(403);
      expect(forbidden.body).toEqual(FORBIDDEN_BODY);
      expect(forbidden.headers['cache-control']).toBe('no-store');
    }
    const sinSesion = await postItems(order.id, body, 'k-rol');
    expect(sinSesion.status).toBe(401);
    expect(sinSesion.body).toEqual(UNAUTHENTICATED_BODY);
    // Sin cabecera o mal formada → 400 con issue en idempotencyKey.
    for (const key of [undefined, 'con espacio', 'x'.repeat(129)]) {
      const response = await postItems(order.id, body, key, cookie);
      expect(validationIssues(response)).toContainEqual({
        path: 'idempotencyKey',
        message: IDEMPOTENCY_KEY_MESSAGE,
      });
    }
    // orderId inválido → 400 con issue en orderId; inexistente → 404.
    expect(validationIssues(await postItems('abc', body, 'k-x', cookie))).toContainEqual({
      path: 'orderId',
      message: ORDER_ID_MESSAGE,
    });
    const noExiste = await postItems(999999, body, 'k-x', cookie);
    expect(noExiste.status).toBe(404);
    expect(noExiste.body).toEqual(ORDER_NOT_FOUND_BODY);
    // Pedido cancelado → 409 ORDER_NOT_OPEN.
    const { cookie: admin } = await adminCookie();
    await postCancel(order.id, { reason: 'Se fueron sin pedir' }, admin);
    const cerrado = await postItems(order.id, body, 'k-cerrado', cookie);
    expect(cerrado.status).toBe(409);
    expect(cerrado.body).toEqual(ORDER_NOT_OPEN_BODY);
    expect(cerrado.headers['cache-control']).toBe('no-store');
  });

  it('AC-15: la repetición idéntica devuelve la respuesta guardada sin duplicar filas', async () => {
    const { cookie, user: juan } = await mozoCookie();
    const menu = await seedMenu();
    const { order } = await orderOnTable('Mesa 3', juan.id);
    const body = { items: [{ productId: menu.incaKola, quantity: 2 }] };

    const first = await postItems(order.id, body, 'k-9', cookie);
    expect(first.status).toBe(201);
    const replay = await postItems(order.id, body, 'k-9', cookie);
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(first.body);
    // Nada se duplicó: un ítem, una comanda, una clave (regla 5).
    expect(await itemCount(order.id)).toHaveLength(1);
    expect(await ticketCount(order.id)).toHaveLength(1);
    expect(await keyCount()).toHaveLength(1);
    // Misma clave con otro cuerpo → 409 IDEMPOTENCY_CONFLICT.
    const conflicto = await postItems(
      order.id,
      { items: [{ productId: menu.incaKola, quantity: 3 }] },
      'k-9',
      cookie,
    );
    expect(conflicto.status).toBe(409);
    expect(conflicto.body).toEqual(IDEMPOTENCY_CONFLICT_BODY);
  });

  it('AC-15: una tanda con dos ítems malos acumula los issues y no escribe nada', async () => {
    const { cookie, user: juan } = await mozoCookie();
    const menu = await seedMenu();
    const { order } = await orderOnTable('Mesa 3', juan.id);

    const response = await postItems(
      order.id,
      {
        items: [{ productId: menu.incaKola }, { productId: 999999 }, { productId: menu.pollo }],
      },
      'k-mala',
      cookie,
    );
    expect(validationIssues(response)).toEqual([
      { path: 'items.1.productId', message: 'Ese producto no existe.' },
      {
        path: 'items.2.portion',
        message: 'El pollo lleva presentaci\u00F3n (eighth, quarter, half o whole).',
      },
    ]);
    // El ítem bueno tampoco se escribió: ni ítems, ni comanda, ni clave.
    expect(await itemCount(order.id)).toHaveLength(0);
    expect(await ticketCount(order.id)).toHaveLength(0);
    expect(await keyCount()).toHaveLength(0);
  });

  it('AC-16: request-void marca el ítem y responde 200 { order } con no-store', async () => {
    const { cookie, user: juan } = await mozoCookie();
    const menu = await seedMenu();
    const { order } = await orderOnTable('Mesa 3', juan.id);
    const item = await sendOne(order.id, menu.incaKola, 'k-envio', cookie);

    const response = await postItemAction(
      order.id,
      item.id,
      'request-void',
      'sol-anul-001',
      { reason: 'Se equivoc\u00F3 el cliente' },
      cookie,
    );
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const body = response.body as { order: Order };
    expect(Object.keys(body)).toEqual(['order']);
    expect(orderSchema.safeParse(body.order).success).toBe(true);
    const actualizado = body.order.items.find((entry: OrderItem) => entry.id === item.id);
    expect(actualizado).toMatchObject({
      status: 'void_requested',
      voidRequestedBy: { id: juan.id, displayName: 'Juan' },
      voidRequestReason: 'Se equivoc\u00F3 el cliente',
      voidedBy: null,
      voidTicketId: null,
    });
    // Sigue contando en totalCents y no se creó comanda.
    expect(body.order.totalCents).toBe(800);
    expect(await ticketCount(order.id)).toHaveLength(1);
    // El admin también puede solicitar (RN-010-14).
    const { cookie: admin } = await adminCookie();
    const otro = await sendOne(order.id, menu.anticucho, 'k-envio2', cookie);
    const porAdmin = await postItemAction(
      order.id,
      otro.id,
      'request-void',
      'sol-anul-002',
      { reason: 'El cliente se arrepinti\u00F3' },
      admin,
    );
    expect(porAdmin.status).toBe(200);
  });

  it('AC-16: request-void responde 401, 403, 400 y 409 según el caso', async () => {
    const { cookie, user: juan } = await mozoCookie();
    const menu = await seedMenu();
    const { order } = await orderOnTable('Mesa 3', juan.id);
    const item = await sendOne(order.id, menu.incaKola, 'k-envio', cookie);
    await postItemAction(
      order.id,
      item.id,
      'request-void',
      'sol-1',
      { reason: 'Ya pidida' },
      cookie,
    );

    // Cocina y caja → 403; sin cookie → 401.
    for (const other of [await cocinaCookie(), await cajaCookie()]) {
      const forbidden = await postItemAction(
        order.id,
        item.id,
        'request-void',
        'sol-rol',
        { reason: 'Motivo' },
        other,
      );
      expect(forbidden.status).toBe(403);
      expect(forbidden.body).toEqual(FORBIDDEN_BODY);
    }
    const sinSesion = await postItemAction(order.id, item.id, 'request-void', 'sol-x', {
      reason: 'Motivo',
    });
    expect(sinSesion.status).toBe(401);
    expect(sinSesion.body).toEqual(UNAUTHENTICATED_BODY);
    // Sin reason → 400 issue en reason; sin cabecera → 400 en idempotencyKey.
    expect(
      validationIssues(
        await postItemAction(order.id, item.id, 'request-void', 'sol-2', {}, cookie),
      ),
    ).toContainEqual({ path: 'reason', message: REASON_MESSAGE });
    expect(
      validationIssues(
        await postItemAction(order.id, item.id, 'request-void', undefined, { reason: 'M' }, cookie),
      ),
    ).toContainEqual({ path: 'idempotencyKey', message: IDEMPOTENCY_KEY_MESSAGE });
    // Ya 'void_requested' con otra clave → 409; sobre ítem anulado → ALREADY_VOIDED.
    const pendiente = await postItemAction(
      order.id,
      item.id,
      'request-void',
      'sol-3',
      { reason: 'Otro' },
      cookie,
    );
    expect(pendiente.status).toBe(409);
    expect(pendiente.body).toEqual(ORDER_ITEM_VOID_REQUESTED_BODY);
    const { cookie: admin } = await adminCookie();
    const directo = await sendOne(order.id, menu.anticucho, 'k-envio3', cookie);
    await postItemAction(order.id, directo.id, 'void', 'anul-1', { reason: 'Se cay\u00F3' }, admin);
    const yaAnulado = await postItemAction(
      order.id,
      directo.id,
      'request-void',
      'sol-4',
      { reason: 'Tarde' },
      cookie,
    );
    expect(yaAnulado.status).toBe(409);
    expect(yaAnulado.body).toEqual(ORDER_ITEM_ALREADY_VOIDED_BODY);
  });

  it('AC-16: void como admin responde 200 { order, ticket } con el ítem anulado', async () => {
    const { cookie, user: juan } = await mozoCookie();
    const { cookie: admin, user: dueno } = await adminCookie();
    const menu = await seedMenu();
    const { order } = await orderOnTable('Mesa 3', juan.id);
    const item = await sendOne(order.id, menu.incaKola, 'k-envio', cookie);
    await postItemAction(
      order.id,
      item.id,
      'request-void',
      'sol-1',
      { reason: 'Se equivoc\u00F3 el cliente' },
      cookie,
    );

    const response = await postItemAction(
      order.id,
      item.id,
      'void',
      'anul-1',
      { reason: 'Confirmado, error del cliente' },
      admin,
    );
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(sendOrderItemsResponseSchema.safeParse(response.body as unknown).success).toBe(true);
    const body = response.body as { order: Order; ticket: { id: number; kind: string } };
    expect(body.ticket).toMatchObject({ kind: 'void', orderId: order.id });
    expect(body.order.items[0]).toMatchObject({
      id: item.id,
      status: 'voided',
      voidedBy: { id: dueno.id, displayName: 'Due\u00F1o' },
      voidReason: 'Confirmado, error del cliente',
      voidTicketId: body.ticket.id,
      voidRequestedBy: { id: juan.id, displayName: 'Juan' },
      voidRequestReason: 'Se equivoc\u00F3 el cliente',
    });
    expect(body.order.totalCents).toBe(0);
    // Anulación directa sobre 'sent' también funciona (sin solicitud previa).
    const segundo = await sendOne(order.id, menu.anticucho, 'k-envio2', cookie);
    const directo = await postItemAction(
      order.id,
      segundo.id,
      'void',
      'anul-2',
      { reason: 'Lo anulo yo' },
      admin,
    );
    expect(directo.status).toBe(200);
    expect((directo.body as { order: Order }).order.items[1]).toMatchObject({
      status: 'voided',
      voidRequestedBy: null,
    });
    // Ya 'voided' con otra clave → 409; replay con la misma → respuesta guardada.
    const replay = await postItemAction(
      order.id,
      item.id,
      'void',
      'anul-1',
      { reason: 'Confirmado, error del cliente' },
      admin,
    );
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(response.body);
    const otraClave = await postItemAction(
      order.id,
      item.id,
      'void',
      'anul-3',
      { reason: 'Otra vez' },
      admin,
    );
    expect(otraClave.status).toBe(409);
    expect(otraClave.body).toEqual(ORDER_ITEM_ALREADY_VOIDED_BODY);
  });

  it('AC-16: void exige admin, reason y cabecera', async () => {
    const { cookie, user: juan } = await mozoCookie();
    const { cookie: admin } = await adminCookie();
    const menu = await seedMenu();
    const { order } = await orderOnTable('Mesa 3', juan.id);
    const item = await sendOne(order.id, menu.incaKola, 'k-envio', cookie);
    await postItemAction(order.id, item.id, 'request-void', 'sol-1', { reason: 'Motivo' }, cookie);

    // void: mozo, cocina y caja reciben 403 (solo admin — regla 6).
    for (const other of [cookie, await cocinaCookie(), await cajaCookie()]) {
      const forbidden = await postItemAction(
        order.id,
        item.id,
        'void',
        'anul-rol',
        { reason: 'Motivo' },
        other,
      );
      expect(forbidden.status).toBe(403);
      expect(forbidden.body).toEqual(FORBIDDEN_BODY);
    }
    // Sin reason o sin cabecera → 400 con el issue correspondiente; sin cookie → 401.
    expect(
      validationIssues(await postItemAction(order.id, item.id, 'void', 'anul-2', {}, admin)),
    ).toContainEqual({ path: 'reason', message: REASON_MESSAGE });
    expect(
      validationIssues(
        await postItemAction(order.id, item.id, 'void', undefined, { reason: 'M' }, admin),
      ),
    ).toContainEqual({ path: 'idempotencyKey', message: IDEMPOTENCY_KEY_MESSAGE });
    const sinSesion = await postItemAction(order.id, item.id, 'void', 'anul-3', { reason: 'M' });
    expect(sinSesion.status).toBe(401);
    expect(sinSesion.body).toEqual(UNAUTHENTICATED_BODY);
  });

  it('AC-16: reject-void devuelve el ítem a sent, exige admin y sin cuerpo', async () => {
    const { cookie, user: juan } = await mozoCookie();
    const { cookie: admin } = await adminCookie();
    const menu = await seedMenu();
    const { order } = await orderOnTable('Mesa 3', juan.id);
    const item = await sendOne(order.id, menu.incaKola, 'k-envio', cookie);
    await postItemAction(order.id, item.id, 'request-void', 'sol-1', { reason: 'Motivo' }, cookie);

    // Solo admin rechaza: mozo, cocina y caja reciben 403.
    for (const other of [cookie, await cocinaCookie(), await cajaCookie()]) {
      const forbidden = await postItemAction(
        order.id,
        item.id,
        'reject-void',
        'rech-rol',
        undefined,
        other,
      );
      expect(forbidden.status).toBe(403);
      expect(forbidden.body).toEqual(FORBIDDEN_BODY);
    }
    // Sin cabecera → 400; sin cookie → 401.
    expect(
      validationIssues(
        await postItemAction(order.id, item.id, 'reject-void', undefined, undefined, admin),
      ),
    ).toContainEqual({ path: 'idempotencyKey', message: IDEMPOTENCY_KEY_MESSAGE });
    expect((await postItemAction(order.id, item.id, 'reject-void', 'rech-0')).status).toBe(401);

    // La ruta es bodiless: si llega un cuerpo JSON se ignora por completo.
    const rejected = await postItemAction(
      order.id,
      item.id,
      'reject-void',
      'rech-1',
      { reason: 'Este cuerpo se ignora', extra: 1 },
      admin,
    );
    expect(rejected.status).toBe(200);
    expect(rejected.headers['cache-control']).toBe('no-store');
    expect(Object.keys(rejected.body as object)).toEqual(['order']);
    const devuelto = (rejected.body as { order: Order }).order.items[0];
    expect(devuelto).toMatchObject({
      id: item.id,
      status: 'sent',
      voidRequestedBy: null,
      voidRequestedAt: null,
      voidRequestReason: null,
      voidedBy: null,
    });
    expect((rejected.body as { order: Order }).order.totalCents).toBe(800);
    // Rechazar sobre 'sent' (ya rechazado) con otra clave → 409 NOT_REQUESTED.
    const sinPendiente = await postItemAction(
      order.id,
      item.id,
      'reject-void',
      'rech-2',
      undefined,
      admin,
    );
    expect(sinPendiente.status).toBe(409);
    expect(sinPendiente.body).toEqual(ORDER_ITEM_NOT_REQUESTED_BODY);
  });

  it('AC-16: itemId inválido, ajeno o sobre pedido cerrado responden su código', async () => {
    const { cookie, user: juan } = await mozoCookie();
    const { cookie: admin } = await adminCookie();
    const menu = await seedMenu();
    const { order } = await orderOnTable('Mesa 3', juan.id);
    const { order: otroPedido } = await orderOnTable('Mesa 4', juan.id);
    const item = await sendOne(order.id, menu.incaKola, 'k-envio', cookie);
    const ajeno = await sendOne(otroPedido.id, menu.incaKola, 'k-ajeno', cookie);

    for (const action of ['request-void', 'void', 'reject-void'] as const) {
      const actor = action === 'request-void' ? cookie : admin;
      const body = action === 'reject-void' ? undefined : { reason: 'Motivo' };
      // itemId 'abc' → 400 con issue en itemId.
      expect(
        validationIssues(
          await postItemAction(order.id, 'abc', action, `k-a-${action}`, body, actor),
        ),
      ).toContainEqual({ path: 'itemId', message: ITEM_ID_MESSAGE });
      // itemId inexistente y de otro pedido → 404 ORDER_ITEM_NOT_FOUND.
      for (const itemId of [999999, ajeno.id]) {
        const noHallado = await postItemAction(
          order.id,
          itemId,
          action,
          `k-b-${action}-${itemId}`,
          body,
          actor,
        );
        expect(noHallado.status).toBe(404);
        expect(noHallado.body).toEqual(ORDER_ITEM_NOT_FOUND_BODY);
      }
      // Pedido de la ruta inexistente → 404 ORDER_NOT_FOUND.
      const sinPedido = await postItemAction(999999, item.id, action, `k-c-${action}`, body, actor);
      expect(sinPedido.status).toBe(404);
      expect(sinPedido.body).toEqual(ORDER_NOT_FOUND_BODY);
      expect(sinPedido.headers['cache-control']).toBe('no-store');
    }
    // Pedido cancelado → 409 ORDER_NOT_OPEN en las tres.
    await postCancel(order.id, { reason: 'Cerrado' }, admin);
    for (const action of ['request-void', 'void', 'reject-void'] as const) {
      const actor = action === 'request-void' ? cookie : admin;
      const body = action === 'reject-void' ? undefined : { reason: 'Motivo' };
      const cerrado = await postItemAction(order.id, item.id, action, `k-d-${action}`, body, actor);
      expect(cerrado.status).toBe(409);
      expect(cerrado.body).toEqual(ORDER_NOT_OPEN_BODY);
    }
  });

  it('AC-17: GET /api/menu responde la carta armada a cualquier rol con no-store', async () => {
    const { cookie } = await mozoCookie();
    await seedMenu();

    for (const session of [
      cookie,
      await cocinaCookie(),
      await cajaCookie(),
      (await adminCookie()).cookie,
    ]) {
      const response = await getMenu(session);
      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(menuResponseSchema.safeParse(response.body as unknown).success).toBe(true);
      const products = (response.body as { products: { name: string }[] }).products;
      expect(products.map((product) => product.name)).toEqual([
        'Anticucho de pollo',
        'Pollo a la brasa',
        'Mostrito',
        'Inca Kola 1L',
        'Aj\u00ED',
        'Ocopa',
      ]);
    }
    // Sin sesión → 401.
    const sinSesion = await getMenu();
    expect(sinSesion.status).toBe(401);
    expect(sinSesion.body).toEqual(UNAUTHENTICATED_BODY);
    expect(sinSesion.headers['cache-control']).toBe('no-store');
  });

  it('AC-17: GET /api/orders/{id}/tickets devuelve las comandas del pedido en orden', async () => {
    const { cookie, user: juan } = await mozoCookie();
    const { cookie: admin } = await adminCookie();
    const menu = await seedMenu();
    const { order } = await orderOnTable('Mesa 3', juan.id);
    // initial, additional y void: la serie completa del pedido.
    await postItems(order.id, { items: [{ productId: menu.incaKola }] }, 'k-1', cookie);
    const segundo = await postItems(
      order.id,
      { items: [{ productId: menu.anticucho }] },
      'k-2',
      cookie,
    );
    const anulado = (segundo.body as { order: Order }).order.items[1]?.id ?? -1;
    await postItemAction(order.id, anulado, 'void', 'anul-1', { reason: 'Error' }, admin);

    for (const session of [cookie, await cocinaCookie(), await cajaCookie(), admin]) {
      const response = await getTickets(order.id, session);
      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(kitchenTicketsResponseSchema.safeParse(response.body as unknown).success).toBe(true);
      const tickets = (response.body as { tickets: { kind: string; items: unknown[] }[] }).tickets;
      expect(tickets.map((ticket: KitchenTicket) => ticket.kind)).toEqual([
        'initial',
        'additional',
        'void',
      ]);
      expect(tickets[2]?.items).toHaveLength(1);
    }
    // Un pedido sin envíos → { tickets: [] }; inexistente → 404; inválido → 400.
    const { order: vacio } = await orderOnTable('Mesa 8', juan.id);
    const vacioTickets = await getTickets(vacio.id, cookie);
    expect(vacioTickets.status).toBe(200);
    expect(vacioTickets.body).toEqual({ tickets: [] });
    const noExiste = await getTickets(999999, cookie);
    expect(noExiste.status).toBe(404);
    expect(noExiste.body).toEqual(ORDER_NOT_FOUND_BODY);
    expect(validationIssues(await getTickets('abc', cookie))).toContainEqual({
      path: 'orderId',
      message: ORDER_ID_MESSAGE,
    });
    // Sin sesión → 401.
    expect((await getTickets(order.id)).status).toBe(401);
  });

  it('AC-18: cancel por HTTP bloquea con ítems activos y exige admin tras anularlos', async () => {
    const { cookie, user: juan } = await mozoCookie();
    const { cookie: admin } = await adminCookie();
    const menu = await seedMenu();
    const { order } = await orderOnTable('Mesa 3', juan.id);
    const item = await sendOne(order.id, menu.incaKola, 'k-envio', cookie);

    // Con un ítem 'sent' → 409 ORDER_HAS_ACTIVE_ITEMS para mozo y admin.
    for (const actor of [cookie, admin]) {
      const bloqueado = await postCancel(order.id, { reason: 'Se fueron' }, actor);
      expect(bloqueado.status).toBe(409);
      expect(bloqueado.body).toEqual(ORDER_HAS_ACTIVE_ITEMS_BODY);
      expect(bloqueado.headers['cache-control']).toBe('no-store');
    }
    // Con la solicitud pendiente también bloquea.
    await postItemAction(order.id, item.id, 'request-void', 'sol-1', { reason: 'Error' }, cookie);
    const conPendiente = await postCancel(order.id, { reason: 'Se fueron' }, admin);
    expect(conPendiente.status).toBe(409);
    expect(conPendiente.body).toEqual(ORDER_HAS_ACTIVE_ITEMS_BODY);
    // Anulado el ítem: mozo → 403; admin → 200 cancelled.
    await postItemAction(order.id, item.id, 'void', 'anul-1', { reason: 'Confirmado' }, admin);
    const mozoCancela = await postCancel(order.id, { reason: 'Se fueron' }, cookie);
    expect(mozoCancela.status).toBe(403);
    expect(mozoCancela.body).toEqual(FORBIDDEN_BODY);
    const cancelado = await postCancel(order.id, { reason: 'Se fueron sin pagar' }, admin);
    expect(cancelado.status).toBe(200);
    expect((cancelado.body as { order: Order }).order).toMatchObject({
      status: 'cancelled',
      totalCents: 0,
    });
    expect((cancelado.body as { order: Order }).order.items[0]).toMatchObject({
      status: 'voided',
    });
    // Pedido que nunca tuvo ítems → el mozo cancela como en la 009 (sin regresión).
    const { order: sinItems } = await orderOnTable('Mesa 5', juan.id);
    const comunCancela = await postCancel(sinItems.id, { reason: 'Error de apertura' }, cookie);
    expect(comunCancela.status).toBe(200);
    expect((comunCancela.body as { order: Order }).order.status).toBe('cancelled');
  });

  it('AC-18: join por HTTP mueve los ítems y el tablero muestra el total combinado', async () => {
    const { cookie, user: juan } = await mozoCookie();
    const menu = await seedMenu();
    const { table: mesa3, order: p } = await orderOnTable('Mesa 3', juan.id);
    const { table: mesa4, order: q } = await orderOnTable('Mesa 4', juan.id);
    await postItems(
      p.id,
      { items: [{ productId: menu.pollo, portion: 'quarter', cut: 'leg' }] },
      'k-p',
      cookie,
    );
    await postItems(q.id, { items: [{ productId: menu.incaKola, quantity: 2 }] }, 'k-q', cookie);

    const joined = await postJoin(mesa4.id, { intoTableId: mesa3.id }, cookie);
    expect(joined.status).toBe(200);
    const destino = (joined.body as { order: Order }).order;
    expect(destino.id).toBe(p.id);
    // Los ítems de Q conservan su mesa de origen y el total se combina.
    expect(destino.items).toHaveLength(2);
    const deQ = destino.items.filter((item: OrderItem) => item.orderedAtTable?.id === mesa4.id);
    expect(deQ).toHaveLength(1);
    expect(deQ[0]).toMatchObject({ productId: menu.incaKola, quantity: 2 });
    expect(destino.totalCents).toBe(1400 + 1600);
    // GET del pedido absorbido: merged, sin ítems, total 0.
    const absorbido = await getOrder(q.id, cookie);
    expect((absorbido.body as { order: Order }).order).toMatchObject({
      status: 'merged',
      items: [],
      totalCents: 0,
    });
    // El tablero embebe el pedido con el total combinado en cada mesa.
    const tablero = await request(auth.app).get('/api/tables').set('Cookie', cookie);
    const mesa3View = (
      tablero.body as { tables: { id: number; order: Order | null }[] }
    ).tables.find((table) => table.id === mesa3.id);
    const mesa4View = (
      tablero.body as { tables: { id: number; order: Order | null }[] }
    ).tables.find((table) => table.id === mesa4.id);
    expect(mesa3View?.order?.totalCents).toBe(3000);
    expect(mesa4View?.order?.totalCents).toBe(3000);
    expect(mesa4View?.order?.items).toHaveLength(2);
  });

  it('AC-19: métodos no declarados en las rutas nuevas responden 404 con no-store', async () => {
    const { cookie, user: juan } = await mozoCookie();
    await seedMenu();
    const { order } = await orderOnTable('Mesa 3', juan.id);

    // PUT al envío, GET a la anulación y DELETE a las comandas: nunca 405.
    const putItems = await request(auth.app)
      .put(`/api/orders/${order.id}/items`)
      .set('Cookie', cookie)
      .send({ items: [] });
    expect(putItems.status).toBe(404);
    expect(putItems.body).toEqual(NOT_FOUND_BODY);
    expect(putItems.headers['cache-control']).toBe('no-store');
    const getVoid = await request(auth.app)
      .get(`/api/orders/${order.id}/items/5/void`)
      .set('Cookie', cookie);
    expect(getVoid.status).toBe(404);
    expect(getVoid.body).toEqual(NOT_FOUND_BODY);
    const deleteTickets = await request(auth.app)
      .delete(`/api/orders/${order.id}/tickets`)
      .set('Cookie', cookie);
    expect(deleteTickets.status).toBe(404);
    expect(deleteTickets.body).toEqual(NOT_FOUND_BODY);
    // PATCH al menú tampoco existe.
    const patchMenu = await request(auth.app)
      .patch('/api/menu')
      .set('Cookie', cookie)
      .send({ name: 'X' });
    expect(patchMenu.status).toBe(404);
    expect(patchMenu.headers['cache-control']).toBe('no-store');
  });

  it('AC-19: el lector del cuerpo responde 400/415/413 en las rutas con cuerpo', async () => {
    const { cookie, user: juan } = await mozoCookie();
    const { cookie: admin } = await adminCookie();
    const menu = await seedMenu();
    const { order } = await orderOnTable('Mesa 3', juan.id);
    const item = await sendOne(order.id, menu.incaKola, 'k-envio', cookie);
    // Las tres rutas nuevas con cuerpo: items (mozo), request-void (mozo) y void (admin).
    const rutas: { path: string; cookie: string; key: string }[] = [
      { path: `/api/orders/${order.id}/items`, cookie, key: 'k-lector-1' },
      { path: `/api/orders/${order.id}/items/${item.id}/request-void`, cookie, key: 'k-lector-2' },
      { path: `/api/orders/${order.id}/items/${item.id}/void`, cookie: admin, key: 'k-lector-3' },
    ];
    for (const { path, cookie: sesion, key } of rutas) {
      // JSON inválido → 400 INVALID_JSON.
      const roto = await request(auth.app)
        .post(path)
        .set('Cookie', sesion)
        .set('Idempotency-Key', key)
        .set('Content-Type', 'application/json')
        .send('{"items": [');
      expect(roto.status).toBe(400);
      expect(roto.body).toEqual(INVALID_JSON_BODY);
      expect(roto.headers['cache-control']).toBe('no-store');
      // JSON que no es objeto → 400 INVALID_BODY.
      const noObjeto = await request(auth.app)
        .post(path)
        .set('Cookie', sesion)
        .set('Idempotency-Key', key)
        .set('Content-Type', 'application/json')
        .send('[1,2,3]');
      expect(noObjeto.status).toBe(400);
      expect(noObjeto.body).toEqual(INVALID_BODY_BODY);
      // Content-Type incorrecto con cuerpo → 415.
      const textoPlano = await request(auth.app)
        .post(path)
        .set('Cookie', sesion)
        .set('Idempotency-Key', key)
        .set('Content-Type', 'text/plain')
        .send('{"items": []}');
      expect(textoPlano.status).toBe(415);
      expect(textoPlano.body).toEqual(UNSUPPORTED_MEDIA_TYPE_BODY);
      // Cuerpo > 100 kb → 413 PAYLOAD_TOO_LARGE.
      const grande = await sendRawBody(
        request(auth.app)
          .post(path)
          .set('Cookie', sesion)
          .set('Idempotency-Key', key)
          .set('Content-Type', 'application/json'),
        Buffer.from(jsonBodyOfSize(102 * 1024 + 1), 'utf8'),
      );
      expect(grande.status).toBe(413);
      expect(grande.body).toEqual(PAYLOAD_TOO_LARGE_BODY);
      expect(grande.headers['cache-control']).toBe('no-store');
    }
    // Nada quedó escrito: un ítem (el del arreglo), una comanda, una clave.
    expect(await itemCount(order.id)).toHaveLength(1);
    expect(await ticketCount(order.id)).toHaveLength(1);
    expect(await keyCount()).toHaveLength(1);
  });
});
