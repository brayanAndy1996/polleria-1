import request from 'supertest';
import type { Express } from 'express';
import type { Sequelize } from 'sequelize';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  kitchenTicketPrintsResponseSchema,
  kitchenTicketPrintAttentionResponseSchema,
  reprintKitchenTicketResponseSchema,
  sendOrderItemsResponseSchema,
} from '@polleria/shared';
import { createApp } from '../src/app.ts';
import { loginWithCookie } from './helpers/auth.ts';
import {
  clearMenuTables,
  clearOrderTables,
  closeTestDatabase,
  connectTestDatabase,
  migrateAndClearAuthTables,
} from './helpers/test-database.ts';
import { createTempDir, removeTempDir } from './helpers/printer-files.ts';
import { setupPrinting, finishAttempt } from './helpers/kitchen-printing-context.ts';
import { countRows, PRINT_TIME, sqlRows } from './helpers/kitchen-printing-data.ts';

let sequelize: Sequelize;
let context: Awaited<ReturnType<typeof setupPrinting>>;
let dir: string;
let app: Express;
let cookies: Record<string, string>;
let suspended: boolean;
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
  dir = await createTempDir();
  suspended = false;
  context = await setupPrinting(sequelize, dir, () => suspended);
  app = createApp({
    sequelize,
    now: () => PRINT_TIME,
    pinHasher: context.pinHasher,
    printService: context.prints,
  });
  cookies = {};
  for (const username of ['juan', 'luz', 'ana', 'beto'])
    cookies[username] = (await loginWithCookie(app, username, '2468')).cookie;
});
afterEach(async () => {
  await removeTempDir(dir);
});
function copy(
  ticketId: number,
  username = 'juan',
  key = 'copy-013',
  reason = 'Se perdió el archivo',
) {
  return request(app)
    .post(`/api/kitchen-ticket-prints/${ticketId}/reprint`)
    .set('Cookie', cookies[username]!)
    .set('Idempotency-Key', key)
    .send({ reason });
}
function noStore(response: { headers: Record<string, unknown> }) {
  expect(response.headers['cache-control']).toBe('no-store');
}

describe('013: contrato HTTP de historial y copia sobre polleria_test', () => {
  it('AC-03: HTTP201 sigue siendo solo order/ticket y el estado se consulta aparte sin I/O', async () => {
    const response = await request(app)
      .post(`/api/orders/${context.order.id}/items`)
      .set('Cookie', cookies.juan!)
      .set('Idempotency-Key', 'send-http')
      .send({ items: [{ productId: context.drink.id, quantity: 2 }] });
    expect(response.status).toBe(201);
    expect(sendOrderItemsResponseSchema.safeParse(response.body).success).toBe(true);
    expect(Object.keys(response.body).sort()).toEqual(['order', 'ticket']);
    const state = await request(app)
      .get(`/api/orders/${context.order.id}/ticket-prints`)
      .set('Cookie', cookies.juan!);
    expect(state.status).toBe(200);
    noStore(state);
    expect(kitchenTicketPrintsResponseSchema.safeParse(state.body).success).toBe(true);
    expect(state.body.prints).toHaveLength(1);
    expect(state.body.prints[0]).toMatchObject({ status: 'queued', canReprint: false });
  });
  it.each(['juan', 'luz', 'ana', 'beto'])(
    'AC-11: %s puede leer los estados de un pedido autenticado',
    async (username) => {
      await context.send();
      const response = await request(app)
        .get(`/api/orders/${context.order.id}/ticket-prints`)
        .set('Cookie', cookies[username]!);
      expect(response.status).toBe(200);
      noStore(response);
      expect(kitchenTicketPrintsResponseSchema.safeParse(response.body).success).toBe(true);
    },
  );
  it('AC-09: comanda histórica aparece not_tracked y rechaza copia sin crear trabajo', async () => {
    const old = await context.models.KitchenTicket.create({
      orderId: context.order.id,
      kind: 'initial',
      createdByUserId: context.waiter.id,
    });
    const state = await request(app)
      .get(`/api/orders/${context.order.id}/ticket-prints`)
      .set('Cookie', cookies.juan!);
    expect(state.status).toBe(200);
    expect(state.body).toEqual({
      prints: [
        {
          ticketId: old.id,
          orderId: context.order.id,
          kind: 'initial',
          tablesAtIssue: [],
          status: 'not_tracked',
          lastAttempt: null,
          canReprint: false,
        },
      ],
    });
    const response = await copy(old.id);
    expect(response.status).toBe(409);
    noStore(response);
    expect(response.body.error).toMatchObject({
      code: 'PRINT_SNAPSHOT_UNAVAILABLE',
      details: null,
    });
    expect(await countRows(sequelize, 'kitchen_ticket_prints')).toBe(0);
    expect(await countRows(sequelize, 'kitchen_ticket_print_attempts')).toBe(0);
  });
  it('AC-10: acepta copia202 y replay devuelve cuerpo queued original aun después de avanzar; conflicto no consume número', async () => {
    const sent = await context.send();
    await finishAttempt(sequelize, sent.ticket.id, 'succeeded', dir);
    const first = await copy(sent.ticket.id);
    expect(first.status).toBe(202);
    noStore(first);
    expect(reprintKitchenTicketResponseSchema.safeParse(first.body).success).toBe(true);
    expect(first.body.attempt).toMatchObject({
      ticketId: sent.ticket.id,
      copyNumber: 1,
      status: 'queued',
      requestedBy: { id: context.waiter.id, displayName: 'Juan' },
      pageCount: null,
      completedPages: 0,
      startedAt: null,
      finishedAt: null,
    });
    await finishAttempt(sequelize, sent.ticket.id, 'succeeded', dir);
    suspended = true;
    const replay = await copy(sent.ticket.id);
    expect(replay.status).toBe(202);
    expect(replay.body).toEqual(first.body);
    const conflict = await copy(sent.ticket.id, 'juan', 'copy-013', 'otro motivo');
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(await countRows(sequelize, 'kitchen_ticket_print_attempts')).toBe(2);
  });
  it('AC-10: claves concurrentes distintas tienen un ganador y un 409; la misma clave reenvía exactamente 202', async () => {
    const sent = await context.send();
    await finishAttempt(sequelize, sent.ticket.id, 'failed', dir);
    const both = await Promise.all([
      copy(sent.ticket.id, 'juan', 'copy-a'),
      copy(sent.ticket.id, 'luz', 'copy-b'),
    ]);
    expect(both.map((response) => response.status).sort()).toEqual([202, 409]);
    expect(both.find((response) => response.status === 409)?.body.error.code).toBe(
      'PRINT_IN_PROGRESS',
    );
    expect(await countRows(sequelize, 'kitchen_ticket_print_attempts')).toBe(2);
    const winner =
      both[0]!.status === 202
        ? { username: 'juan', key: 'copy-a', response: both[0]! }
        : { username: 'luz', key: 'copy-b', response: both[1]! };
    const repeated = await Promise.all([
      copy(sent.ticket.id, winner.username, winner.key),
      copy(sent.ticket.id, winner.username, winner.key),
    ]);
    for (const replay of repeated) {
      expect(replay.status).toBe(202);
      expect(replay.body).toEqual(winner.response.body);
    }
  });
  it('AC-10: incertidumbre activa A suspende copia nueva B succeeded y todas las vistas; replay ya aceptado precede guardia global', async () => {
    const a = await context.send();
    const b = await context.send('send-second');
    await finishAttempt(sequelize, a.ticket.id, 'failed', dir);
    await finishAttempt(sequelize, b.ticket.id, 'succeeded', dir);
    const accepted = await copy(b.ticket.id);
    expect(accepted.status).toBe(202);
    await finishAttempt(sequelize, b.ticket.id, 'succeeded', dir);
    await finishAttempt(sequelize, a.ticket.id, 'uncertain', dir, true);
    suspended = true;
    const state = await request(app)
      .get(`/api/orders/${context.order.id}/ticket-prints`)
      .set('Cookie', cookies.luz!);
    expect(state.body.prints.every((entry: { canReprint: boolean }) => !entry.canReprint)).toBe(
      true,
    );
    const blocked = await copy(b.ticket.id, 'luz', 'new-copy');
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('PRINT_IN_PROGRESS');
    const replay = await copy(b.ticket.id);
    expect(replay.status).toBe(202);
    expect(replay.body).toEqual(accepted.body);
  });
  it.each([
    ['juan', 403],
    ['beto', 403],
    ['ana', 202],
    ['luz', 202],
  ] as const)('AC-10: %s solicita ANULADO con resultado %i', async (username, status) => {
    const sent = await context.send();
    const voided = await context.items.voidItem(
      context.order.id,
      sent.order.items[0]!.id,
      { reason: 'Se quemó el pollo' },
      'void-http',
      { userId: context.admin.id },
    );
    await finishAttempt(sequelize, sent.ticket.id, 'succeeded', dir);
    await finishAttempt(sequelize, voided.ticket.id, 'failed', dir);
    const response = await copy(voided.ticket.id, username);
    expect(response.status).toBe(status);
    noStore(response);
    if (status === 403) expect(response.body.error.code).toBe('FORBIDDEN');
  });
  it('AC-10: copiar un pedido cerrado/fusionado no altera ticket, ítems, venta ni claves previas010', async () => {
    const sent = await context.send();
    await finishAttempt(sequelize, sent.ticket.id, 'succeeded', dir);
    await context.orders.moveOrder(context.order.id, context.destination.id, {
      userId: context.waiter.id,
    });
    const other = await context.tables.createTable({ name: 'Mesa 5' });
    const target = await context.orders.openOrder(other.id, { userId: context.waiter.id });
    await context.orders.joinTable(context.destination.id, other.id, { userId: context.waiter.id });
    await sequelize.query('UPDATE tables SET current_order_id=NULL WHERE current_order_id=:id', {
      replacements: { id: target.id },
    });
    await sequelize.query(
      "UPDATE orders SET status='closed',closed_at=now(),closed_by_user_id=:user WHERE id=:id",
      { replacements: { id: target.id, user: context.admin.id } },
    );
    const before = await sqlRows(sequelize, 'SELECT * FROM order_items ORDER BY id');
    const keys = await sqlRows(sequelize, 'SELECT * FROM idempotency_keys ORDER BY id');
    const response = await copy(sent.ticket.id);
    expect(response.status).toBe(202);
    expect(await sqlRows(sequelize, 'SELECT * FROM order_items ORDER BY id')).toEqual(before);
    expect(await sqlRows(sequelize, 'SELECT * FROM idempotency_keys ORDER BY id')).toEqual(keys);
    const state = await request(app)
      .get(`/api/orders/${target.id}/ticket-prints`)
      .set('Cookie', cookies.juan!);
    expect(state.body.prints[0]).toMatchObject({
      ticketId: sent.ticket.id,
      orderId: target.id,
      tablesAtIssue: [{ id: context.table.id, name: 'Mesa 3' }],
    });
  });
  it('AC-11: atención pagina 50 últimos estados por ticketId, sin duplicados ni datos privados incluso ANULADO', async () => {
    const ids: number[] = [];
    for (let index = 0; index < 51; index++) {
      const result = await context.send(`attention-${index}`);
      ids.push(result.ticket.id);
      await finishAttempt(sequelize, result.ticket.id, 'failed', dir);
    }
    const first = await request(app)
      .get('/api/kitchen-ticket-prints/attention')
      .set('Cookie', cookies.juan!);
    expect(first.status).toBe(200);
    noStore(first);
    expect(kitchenTicketPrintAttentionResponseSchema.safeParse(first.body).success).toBe(true);
    expect(first.body.prints.map((entry: { ticketId: number }) => entry.ticketId)).toEqual(
      ids.slice(0, 50),
    );
    expect(first.body.nextAfterTicketId).toBe(ids[49]);
    const second = await request(app)
      .get(`/api/kitchen-ticket-prints/attention?afterTicketId=${ids[49]}`)
      .set('Cookie', cookies.juan!);
    expect(second.body.prints.map((entry: { ticketId: number }) => entry.ticketId)).toEqual(
      ids.slice(50),
    );
    expect(second.body.nextAfterTicketId).toBeNull();
    expect(JSON.stringify(first.body)).not.toMatch(
      /reason|snapshot|destination|ownerHost|ownerPid|\.txt|\/tmp\//,
    );
    const denied = await request(app)
      .get('/api/kitchen-ticket-prints/attention')
      .set('Cookie', cookies.beto!);
    expect(denied.status).toBe(403);
    noStore(denied);
  });
  it.each(['0', '-1', '1.5', 'abc', '2147483648'])(
    'AC-11: ids/cursor %s inválidos devuelven400 sin cache',
    async (id) => {
      const urls = [
        `/api/orders/${id}/ticket-prints`,
        `/api/kitchen-ticket-prints/attention?afterTicketId=${id}`,
      ];
      for (const url of urls) {
        const response = await request(app).get(url).set('Cookie', cookies.juan!);
        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
        noStore(response);
      }
      const response = await request(app)
        .post(`/api/kitchen-ticket-prints/${id}/reprint`)
        .set('Cookie', cookies.juan!)
        .set('Idempotency-Key', 'invalid-id')
        .send({ reason: 'archivo perdido' });
      expect(response.status).toBe(400);
      noStore(response);
    },
  );
  it('AC-11: rutas sin sesión401 y recurso inexistente404 con errores seguros/no-store', async () => {
    for (const url of [
      `/api/orders/${context.order.id}/ticket-prints`,
      '/api/kitchen-ticket-prints/attention',
    ]) {
      const response = await request(app).get(url);
      expect(response.status).toBe(401);
      noStore(response);
    }
    const anon = await request(app)
      .post('/api/kitchen-ticket-prints/1/reprint')
      .send({ reason: 'copia' });
    expect(anon.status).toBe(401);
    noStore(anon);
    const order = await request(app)
      .get('/api/orders/2147483647/ticket-prints')
      .set('Cookie', cookies.juan!);
    expect(order.status).toBe(404);
    expect(order.body.error.code).toBe('ORDER_NOT_FOUND');
    noStore(order);
    const missing = await copy(2147483647);
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({
      error: { code: 'KITCHEN_TICKET_NOT_FOUND', message: 'Esa comanda no existe.', details: null },
    });
    noStore(missing);
  });
  it.each(['', 'x'.repeat(201), 'a\nb', 'a\u200bb'])(
    'AC-10: motivo inválido %j no crea intento ni consume clave',
    async (reason) => {
      const sent = await context.send();
      await finishAttempt(sequelize, sent.ticket.id, 'succeeded', dir);
      const response = await copy(sent.ticket.id, 'juan', 'retry-valid', reason);
      expect(response.status).toBe(400);
      noStore(response);
      expect(await countRows(sequelize, 'kitchen_ticket_print_attempts')).toBe(1);
      expect((await copy(sent.ticket.id, 'juan', 'retry-valid', 'copia válida')).status).toBe(202);
    },
  );
});
