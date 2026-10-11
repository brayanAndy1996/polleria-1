// ADV-010 — ataques a la spec 010 (ítems del pedido, comandas de cocina y ciclo
// de anulación) que las pruebas de AC no cubren: octavos corruptos dentro de los
// componentes de un combo, replay de la clave de idempotencia entre ítems
// distintos, motivos de anulación con caracteres de control y NUL, la FK que la
// migración dejó fuera, separadores Unicode en la observación, issues mal
// etiquetados en ids de ruta, carreras reales envío‖unión/cancelación/
// anulación/tope y las garantías de la base.
import request from 'supertest';
import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserRole } from '@polleria/shared';
import { assertTestDatabase } from '../../src/db/assert-test-database.ts';
import { getPostgresConnectionParts } from '../../src/db/postgres-url.ts';
import { createOrderService } from '../../src/services/orders/order.service.ts';
import { createTableService } from '../../src/services/tables/table.service.ts';
import { createOrderItemService } from '../../src/services/order-items/order-item.service.ts';
import { createProductService } from '../../src/services/products/product.service.ts';
import { createProductPortionService } from '../../src/services/products/product-portion.service.ts';
import { createComboItemService } from '../../src/services/combo-items/combo-item.service.ts';
import {
  assertConnectedToTestDatabase,
  clearAuthTables,
  clearMenuTables,
  clearOrderTables,
  closeTestDatabase,
  connectTestDatabase,
  getTestDatabaseUrl,
  migrateAndClearAuthTables,
} from '../helpers/test-database.ts';
import { loginWithCookie, setupAuth } from '../helpers/auth.ts';

const IDEMPOTENCY_CONFLICT_BODY = {
  error: {
    code: 'IDEMPOTENCY_CONFLICT',
    message: 'Esa clave de env\u00EDo ya se us\u00F3 con otros datos.',
    details: null,
  },
};
const ORDER_ITEM_NOT_FOUND_BODY = {
  error: {
    code: 'ORDER_ITEM_NOT_FOUND',
    message: 'Ese \u00EDtem no existe en este pedido.',
    details: null,
  },
};

/** Los issues de un VALIDATION_ERROR (el body de supertest es any). */
const issuesOf = (response: { body: unknown }) =>
  (response.body as { error: { details: { issues: { path: string; message: string }[] } } }).error
    .details.issues;

/**
 * Guardia estricta de la conexión de pruebas (idéntica a la de la 007/009): la
 * URL debe ser exactamente polleria_test en localhost como usuario polleria,
 * sin parámetros extra, antes de permitir cualquier SQL directo.
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

interface Seed {
  mozo: Awaited<ReturnType<ReturnType<typeof setupAuth>['createUser']>>;
  admin: Awaited<ReturnType<ReturnType<typeof setupAuth>['createUser']>>;
  mesa3: { id: number };
  orderP: { id: number };
  pollo: { id: number };
  incaKola: { id: number };
  aji: { id: number };
  mostrito: { id: number };
  mostritoMedio: { id: number };
}

describe('010 adversarial: idempotencia, octavos, ciclo de anulación y carreras sobre polleria_test', () => {
  let sequelize: Sequelize | undefined;
  let auth: ReturnType<typeof setupAuth>;
  let tableService: ReturnType<typeof createTableService>;
  let orderService: ReturnType<typeof createOrderService>;
  let itemService: ReturnType<typeof createOrderItemService>;
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
    await clearMenuTables(database());
    auth = setupAuth(database());
    tableService = createTableService({ models: auth.models });
    orderService = createOrderService({ models: auth.models });
    itemService = createOrderItemService({ models: auth.models });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    try {
      if (sequelize && prepared) {
        await assertAuthorizedConnection(sequelize);
        await clearOrderTables(sequelize);
        await clearMenuTables(sequelize);
        await clearAuthTables(sequelize);
      }
    } finally {
      await closeTestDatabase(sequelize);
    }
  });

  const rows = <T extends object>(sql: string, bind?: (string | number | null)[]) =>
    database().query<T>(sql, { type: QueryTypes.SELECT, bind });

  /** Crea un usuario con esos roles y devuelve la cookie de su sesión real. */
  async function cookieFor(username: string, roles: UserRole[], pin: string) {
    await auth.createUser(username, 'Persona', roles, pin);
    return (await loginWithCookie(auth.app, username, pin)).cookie;
  }

  /**
   * La carta semilla: un pollo con las cuatro presentaciones, una bebida, una
   * crema, un combo con cuarto de pierna y otro con medio pollo — el escenario
   * mínimo para atacar los octavos de los componentes.
   */
  async function seed(): Promise<Seed> {
    const mozo = await auth.createUser('adv010.mozo', 'Juan', ['waiter'], '2468');
    const admin = await auth.createUser('adv010.admin', 'Luz', ['admin'], '1357');
    const mesa3 = await tableService.createTable({ name: 'Mesa 3' });
    const orderP = await orderService.openOrder(mesa3.id, { userId: mozo.id });
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
        { portion: 'half', cut: null, priceCents: 2600 },
        { portion: 'whole', cut: null, priceCents: 4800 },
      ],
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
    const mostritoMedio = await products.createProduct({
      name: 'Mostrito del medio',
      category: 'combo',
      priceCents: 3400,
    });
    await combos.replaceComboItems(mostritoMedio.id, {
      items: [
        { productId: pollo.id, quantity: 1, portion: 'half' },
        { productId: incaKola.id, quantity: 1 },
      ],
    });
    return { mozo, admin, mesa3, orderP, pollo, incaKola, aji, mostrito, mostritoMedio };
  }

  /** El ítem creado por ESTE envío (el último de la lista, por id). */
  async function sentItem(orderId: number, productId: number, userId: number, key: string) {
    const { order } = await itemService.sendItems(orderId, { items: [{ productId }] }, key, {
      userId,
    });
    return order.items[order.items.length - 1]!;
  }

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

  it('ADV-010-01: un componente "medio" que declara solo legEighths corrompe los octavos — la regla 1 exige 4 y se guardan 2+X', async () => {
    const s = await seed();
    // Esperado: el envío se rechaza — la distribución del medio solo viaja en la
    // pareja que suma 4 (el ítem a nivel de línea lo exige: 'La distribución del
    // medio debe sumar 4 octavos entre pecho y pierna.'). Hoy `matches` aprueba
    // con breastEighths ausente y eighthsOf rellena 2+X.
    let accepted:
      Awaited<ReturnType<ReturnType<typeof createOrderItemService>['sendItems']>> | undefined;
    let rejected: unknown;
    try {
      accepted = await itemService.sendItems(
        s.orderP.id,
        {
          items: [
            {
              productId: s.mostritoMedio.id,
              components: [
                { productId: s.pollo.id, quantity: 1, portion: 'half', legEighths: 3 },
                { productId: s.incaKola.id, quantity: 1 },
              ],
            },
          ],
        },
        'adv-010-01',
        { userId: s.mozo.id },
      );
    } catch (error) {
      rejected = error;
    }
    if (rejected !== undefined)
      expect((rejected as { code?: string }).code).toBe('VALIDATION_ERROR');
    if (accepted !== undefined) {
      const component = accepted.order.items[0]!.components[0]!;
      // Un medio siempre son 4 octavos (regla 1): la fila guardada lleva 2+X.
      expect(component.breastEighths + component.legEighths).toBe(4);
    }
    expect.soft(rejected).toBeDefined();
  });

  it('ADV-010-02: octavos declarados en componentes eighth/quarter/whole se tragan en silencio — el ítem de línea los rechaza y el componente los ignora', async () => {
    const s = await seed();
    // A nivel de ítem la distribución fuera del medio es issue ('La distribución
    // de partes solo se indica en el medio pollo.'); en el componente de un
    // combo el mismo dato pasa `matches` y lo descarta eighthsOf.
    await expect(
      itemService.sendItems(
        s.orderP.id,
        {
          items: [
            {
              productId: s.mostrito.id,
              components: [
                {
                  productId: s.pollo.id,
                  quantity: 1,
                  portion: 'quarter',
                  cut: 'leg',
                  breastEighths: 3,
                },
                { productId: s.incaKola.id, quantity: 1 },
              ],
            },
          ],
        },
        'adv-010-02',
        { userId: s.mozo.id },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('ADV-010-03: la misma clave anula un ítem y "repite" la respuesta sobre otro — el itemId de la ruta queda fuera del request_hash', async () => {
    const s = await seed();
    const { order } = await itemService.sendItems(
      s.orderP.id,
      { items: [{ productId: s.incaKola.id }, { productId: s.incaKola.id }] },
      'adv-010-03-send',
      { userId: s.mozo.id },
    );
    const [itemA, itemB] = order.items;
    await itemService.voidItem(s.orderP.id, itemA!.id, { reason: 'Se cay\u00F3' }, 'misma-clave', {
      userId: s.admin.id,
    });
    // Anular el ítem B con la MISMA clave y el MISMO motivo: mismo order_id y
    // mismo request_hash → hoy es replay silencioso (la respuesta guardada de A)
    // y B sigue 'sent' — una anulación fantasma que el cliente cree hecha.
    let replayed: { order: { id: number } } | undefined;
    try {
      replayed = await itemService.voidItem(
        s.orderP.id,
        itemB!.id,
        { reason: 'Se cay\u00F3' },
        'misma-clave',
        { userId: s.admin.id },
      );
    } catch (error) {
      expect((error as { code?: string }).code).toBe('IDEMPOTENCY_CONFLICT');
    }
    if (replayed !== undefined) {
      // La respuesta prestada afirma éxito mientras B sigue activo.
      const [rowB] = await rows<{ status: string }>(
        'SELECT status FROM order_items WHERE id = $1',
        [itemB!.id],
      );
      expect(rowB!.status).toBe('voided');
    }
  });

  it('ADV-010-04: el motivo de anulación acepta ESC/newline/TAB/NUL — voidReasonSchema no filtra caracteres de control', async () => {
    const s = await seed();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const mozo = await cookieFor('adv010.mozo2', ['waiter'], '2468');
    const { order } = await itemService.sendItems(
      s.orderP.id,
      {
        items: [
          { productId: s.incaKola.id },
          { productId: s.incaKola.id },
          { productId: s.incaKola.id },
          { productId: s.incaKola.id },
        ],
      },
      'adv-010-04-send',
      { userId: s.mozo.id },
    );
    // El motivo va a la comanda 'void' que la Fase 3 imprimirá: saltos de línea
    // y secuencias ESC/POS se guardan tal cual — la observación SÍ filtra Cc/Cf
    // (D-010-07) y el motivo debería seguir la misma regla.
    const nasty = ['l\u00EDnea1\nl\u00EDnea2', 'corte \u001B@ y papel \u001DV', 'tab\tulado'];
    for (const [index, reason] of nasty.entries()) {
      const response = await postVoidAction(
        s.orderP.id,
        order.items[index]!.id,
        'request-void',
        { reason },
        `adv-010-04-${index}`,
        mozo,
      );
      expect.soft(response.status, JSON.stringify(reason)).toBe(400);
    }
    // El NUL tampoco se frena: el driver lo envía como parámetro y Postgres lo
    // guarda tal cual en varchar — queda persistido hacia la comanda impresa.
    const nul = await postVoidAction(
      s.orderP.id,
      order.items[3]!.id,
      'request-void',
      { reason: 'se fue\u0000' },
      'adv-010-04-nul',
      mozo,
    );
    expect.soft(nul.status).toBe(400);
  });

  it('ADV-010-05: la observación admite separadores Unicode U+2028/U+2029 — "una sola línea" queda incompleta', async () => {
    const s = await seed();
    // El filtro Cc/Cf deja pasar Zl/Zp: la comanda impresa puede partir la línea
    // igual que con '\n'. Esperado: el mismo rechazo de D-010-07.
    await expect(
      itemService.sendItems(
        s.orderP.id,
        { items: [{ productId: s.incaKola.id, notes: 'mitad\u2028otra\u2029m\u00E1s' }] },
        'adv-010-05',
        { userId: s.mozo.id },
      ),
    ).rejects.toThrow();
  });

  it('ADV-010-06: void_requested_by_user_id no tiene FK — SQL puede colgar la auditoría de un usuario inexistente', async () => {
    await assertAuthorizedConnection(database());
    const s = await seed();
    const item = await sentItem(s.orderP.id, s.incaKola.id, s.mozo.id, 'adv-010-06-send');
    // La spec lista la columna como FK → users (§8.2 y §modelo); la migración la
    // dejó sin ella ("siete en total"). El UPDATE de auditoría hacia un id
    // inexistente debería chocar con la FK — hoy pasa y queda auditado un mozo
    // fantasma.
    let error: unknown = null;
    try {
      await database().query(
        'UPDATE order_items SET status = $1, void_requested_at = now(), ' +
          'void_requested_by_user_id = 999999, void_request_reason = $2 WHERE id = $3',
        { bind: ['void_requested', 'inyecci\u00f3n', item.id] },
      );
    } catch (caught) {
      error = caught;
    }
    expect(error).not.toBeNull();
    // La fila quedó consistente para el CHECK (los tres campos puestos): el
    // agujero es la FK ausente, no la coherencia de estado.
    const [row] = await rows<{ void_requested_by_user_id: number | null }>(
      'SELECT void_requested_by_user_id FROM order_items WHERE id = $1',
      [item.id],
    );
    expect.soft(row?.void_requested_by_user_id).toBeNull();
  });

  it('ADV-010-07: un orderId malformado en las rutas de ítems responde con issue "itemId" — etiqueta equivocada', async () => {
    const admin = await cookieFor('adv010.admin2', ['admin'], '1357');
    const response = await postVoidAction(
      '%E0%A4%A',
      '1',
      'void',
      { reason: 'x' },
      'adv-010-07',
      admin,
    );
    expect(response.status).toBe(400);
    // El percent-encoding roto está en el orderId, no en el itemId: el issue
    // debería nombrar el parámetro que falló.
    expect(issuesOf(response).map((issue) => issue.path)).toEqual(['orderId']);
  });

  it('ADV-010-08: doble clic del envío con la misma clave — una sola comanda, un solo ítem, una sola clave', async () => {
    const s = await seed();
    const [first, second] = await Promise.all([
      itemService.sendItems(s.orderP.id, { items: [{ productId: s.incaKola.id }] }, 'doble-clic', {
        userId: s.mozo.id,
      }),
      itemService.sendItems(s.orderP.id, { items: [{ productId: s.incaKola.id }] }, 'doble-clic', {
        userId: s.mozo.id,
      }),
    ]);
    // El segundo es un replay de la respuesta guardada: nada se duplica (regla 5).
    expect(second.ticket.id).toBe(first.ticket.id);
    expect(second.order.items).toHaveLength(1);
    const [tickets] = await rows<{ c: number }>(
      'SELECT count(*)::int AS c FROM kitchen_tickets WHERE order_id = $1',
      [s.orderP.id],
    );
    expect(tickets!.c).toBe(1);
    const [keys] = await rows<{ c: number }>(
      "SELECT count(*)::int AS c FROM idempotency_keys WHERE scope = 'order-items' AND key = $1",
      ['doble-clic'],
    );
    expect(keys!.c).toBe(1);
  });

  it('ADV-010-09: un envío rechazado no quema la clave — ni por issues de carta ni por pedido cerrado', async () => {
    const s = await seed();
    // Lote con producto fantasma → issues acumulados → rollback suelta la clave.
    await expect(
      itemService.sendItems(s.orderP.id, { items: [{ productId: 999999 }] }, 'reuso-validacion', {
        userId: s.mozo.id,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const ok = await itemService.sendItems(
      s.orderP.id,
      { items: [{ productId: s.incaKola.id }] },
      'reuso-validacion',
      { userId: s.mozo.id },
    );
    expect(ok.order.items).toHaveLength(1);
    // Pedido cancelado: el 409 ORDER_NOT_OPEN tampoco deja la clave tomada —
    // reutilizarla en OTRO pedido es un envío nuevo, no un conflicto.
    const mesa4 = await tableService.createTable({ name: 'Mesa 4' });
    const other = await orderService.openOrder(mesa4.id, { userId: s.mozo.id });
    await orderService.cancelOrder(other.id, 'error de prueba', { userId: s.admin.id });
    await expect(
      itemService.sendItems(other.id, { items: [{ productId: s.incaKola.id }] }, 'clave-cerrado', {
        userId: s.mozo.id,
      }),
    ).rejects.toMatchObject({ code: 'ORDER_NOT_OPEN' });
    const reused = await itemService.sendItems(
      s.orderP.id,
      { items: [{ productId: s.incaKola.id }] },
      'clave-cerrado',
      { userId: s.mozo.id },
    );
    expect(reused.order.items.length).toBeGreaterThan(0);
  });

  it('ADV-010-10: envío‖unión de mesas en carrera — ningún ítem ni comanda queda colgado del pedido absorbido', async () => {
    const s = await seed();
    const mesa4 = await tableService.createTable({ name: 'Mesa 4' });
    const dest = await orderService.openOrder(mesa4.id, { userId: s.mozo.id });
    const [sendResult, joinResult] = await Promise.allSettled([
      itemService.sendItems(
        s.orderP.id,
        { items: [{ productId: s.incaKola.id }] },
        'carrera-join',
        { userId: s.mozo.id },
      ),
      orderService.joinTable(s.mesa3.id, mesa4.id, { userId: s.admin.id }),
    ]);
    expect(joinResult.status).toBe('fulfilled');
    const [origin] = await rows<{ status: string }>('SELECT status FROM orders WHERE id = $1', [
      s.orderP.id,
    ]);
    if (origin!.status === 'merged') {
      // El merge repuntó todo lo que el envío había escrito (D-010-11).
      const [items] = await rows<{ c: number }>(
        'SELECT count(*)::int AS c FROM order_items WHERE order_id = $1',
        [s.orderP.id],
      );
      expect(items!.c).toBe(0);
      const [tickets] = await rows<{ c: number }>(
        'SELECT count(*)::int AS c FROM kitchen_tickets WHERE order_id = $1',
        [s.orderP.id],
      );
      expect(tickets!.c).toBe(0);
      if (sendResult.status === 'fulfilled') {
        const [destItems] = await rows<{ c: number }>(
          'SELECT count(*)::int AS c FROM order_items WHERE order_id = $1',
          [dest.id],
        );
        expect(destItems!.c).toBe(1);
      } else {
        expect((sendResult.reason as { code?: string }).code).toBe('ORDER_NOT_OPEN');
      }
    } else {
      // La unión perdió la carrera ante un puntero nuevo y reintentó: el pedido
      // origen sigue vivo con su ítem y la mesa 4 quedó unida a él.
      expect(sendResult.status).toBe('fulfilled');
    }
  });

  it('ADV-010-11: solicitud‖aprobación en carrera sobre el mismo ítem — termina anulado con una sola comanda void', async () => {
    const s = await seed();
    const item = await sentItem(s.orderP.id, s.incaKola.id, s.mozo.id, 'adv-010-11-send');
    const [requestResult, voidResult] = await Promise.allSettled([
      itemService.requestVoid(
        s.orderP.id,
        item.id,
        { reason: 'el mozo se equivoc\u00F3' },
        'k-req',
        { userId: s.mozo.id },
      ),
      itemService.voidItem(s.orderP.id, item.id, { reason: 'ok anulado' }, 'k-void', {
        userId: s.admin.id,
      }),
    ]);
    // El bloqueo del pedido serializa: si la solicitud entró primero la
    // aprobación la ejecuta; si la anulación entró primero la solicitud choca.
    expect(voidResult.status).toBe('fulfilled');
    if (requestResult.status === 'rejected')
      expect((requestResult.reason as { code?: string }).code).toBe('ORDER_ITEM_ALREADY_VOIDED');
    const [row] = await rows<{
      status: string;
      voided_by_user_id: number | null;
      void_ticket_id: number | null;
    }>('SELECT status, voided_by_user_id, void_ticket_id FROM order_items WHERE id = $1', [
      item.id,
    ]);
    expect(row).toMatchObject({
      status: 'voided',
      voided_by_user_id: s.admin.id,
    });
    expect(row!.void_ticket_id).not.toBeNull();
    const [tickets] = await rows<{ c: number }>(
      "SELECT count(*)::int AS c FROM kitchen_tickets WHERE order_id = $1 AND kind = 'void'",
      [s.orderP.id],
    );
    expect(tickets!.c).toBe(1);
  });

  it('ADV-010-12: envío‖cancelación en carrera — nunca queda un pedido cancelado con ítems sent', async () => {
    const s = await seed();
    const [sendResult, cancelResult] = await Promise.allSettled([
      itemService.sendItems(
        s.orderP.id,
        { items: [{ productId: s.incaKola.id }] },
        'carrera-cancel',
        { userId: s.mozo.id },
      ),
      orderService.cancelOrder(s.orderP.id, 'mesa equivocada', { userId: s.admin.id }),
    ]);
    const [order] = await rows<{ status: string }>('SELECT status FROM orders WHERE id = $1', [
      s.orderP.id,
    ]);
    const [active] = await rows<{ c: number }>(
      "SELECT count(*)::int AS c FROM order_items WHERE order_id = $1 AND status IN ('sent','void_requested')",
      [s.orderP.id],
    );
    if (order!.status === 'cancelled') {
      // La cancelación ganó primero: el envío tardío chocó o nunca existió.
      expect(active!.c).toBe(0);
      if (sendResult.status === 'rejected')
        expect((sendResult.reason as { code?: string }).code).toBe('ORDER_NOT_OPEN');
    } else {
      // El envío ganó primero: la cancelación chocó con la guardia de ítems.
      expect(order!.status).toBe('open');
      expect(active!.c).toBe(1);
      expect(sendResult.status).toBe('fulfilled');
      expect(cancelResult.status).toBe('rejected');
      if (cancelResult.status === 'rejected')
        expect((cancelResult.reason as { code?: string }).code).toBe('ORDER_HAS_ACTIVE_ITEMS');
    }
  });

  it('ADV-010-13: el tope de 99 activos resiste dos envíos en carrera — uno entra y el otro choca', async () => {
    const s = await seed();
    // 97 ítems activos sembrados por tandas de 20 (el máximo del envío).
    const batch = Array.from({ length: 20 }, () => ({ productId: s.incaKola.id }));
    for (let i = 0; i < 4; i += 1)
      await itemService.sendItems(s.orderP.id, { items: batch }, `tope-semilla-${i}`, {
        userId: s.mozo.id,
      });
    await itemService.sendItems(s.orderP.id, { items: batch.slice(0, 17) }, 'tope-semilla-4', {
      userId: s.mozo.id,
    });
    const results = await Promise.allSettled([
      itemService.sendItems(
        s.orderP.id,
        { items: [{ productId: s.incaKola.id }, { productId: s.incaKola.id }] },
        'tope-a',
        { userId: s.mozo.id },
      ),
      itemService.sendItems(
        s.orderP.id,
        { items: [{ productId: s.incaKola.id }, { productId: s.incaKola.id }] },
        'tope-b',
        { userId: s.mozo.id },
      ),
    ]);
    // 97 + 2 = 99 cabe; 97 + 2 + 2 = 101 no: el bloqueo del pedido fuerza al
    // segundo a leer el conteo ya cometido.
    const ok = results.filter((result) => result.status === 'fulfilled');
    const ko = results.filter((result) => result.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(ko).toHaveLength(1);
    expect((ko[0]!.reason as { code?: string }).code).toBe('ORDER_ITEMS_LIMIT');
    const [active] = await rows<{ c: number }>(
      "SELECT count(*)::int AS c FROM order_items WHERE order_id = $1 AND status IN ('sent','void_requested')",
      [s.orderP.id],
    );
    expect(active!.c).toBe(99);
  });

  it('ADV-010-14: el hash es del cuerpo validado y estable — claves reordenadas y observación normalizada repiten; mismo cuerpo con otra clave duplica', async () => {
    const s = await seed();
    const first = await itemService.sendItems(
      s.orderP.id,
      { items: [{ productId: s.incaKola.id, notes: ' sin hielo ' }] },
      'estable',
      { userId: s.mozo.id },
    );
    // Otro orden de claves, quantity omitida (default 1) y nota sin espacios:
    // tras Zod es el mismo cuerpo → replay, no conflicto ni duplicado.
    const replay = await itemService.sendItems(
      s.orderP.id,
      { items: [{ notes: 'sin hielo', productId: s.incaKola.id }] },
      'estable',
      { userId: s.mozo.id },
    );
    expect(replay.ticket.id).toBe(first.ticket.id);
    expect(replay.order.items).toHaveLength(1);
    // Misma clave con cuerpo distinto → 409 (regla 5).
    await expect(
      itemService.sendItems(
        s.orderP.id,
        { items: [{ productId: s.incaKola.id, quantity: 2 }] },
        'estable',
        { userId: s.mozo.id },
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    // Mismo cuerpo con otra clave → segundo envío real con comanda 'additional'.
    const second = await itemService.sendItems(
      s.orderP.id,
      { items: [{ productId: s.incaKola.id, notes: 'sin hielo' }] },
      'otra-clave',
      { userId: s.mozo.id },
    );
    expect(second.ticket.kind).toBe('additional');
    expect(second.order.items).toHaveLength(2);
  });

  it('ADV-010-15: la unión repunta ítems y comandas — la solicitud pendiente se resuelve en el destino y el origen rechaza el ciclo', async () => {
    const s = await seed();
    const item = await sentItem(s.orderP.id, s.incaKola.id, s.mozo.id, 'pre-join-send');
    await itemService.requestVoid(
      s.orderP.id,
      item.id,
      { reason: 'antes de unir' },
      'pre-join-req',
      { userId: s.mozo.id },
    );
    const mesa4 = await tableService.createTable({ name: 'Mesa 4' });
    const dest = await orderService.openOrder(mesa4.id, { userId: s.mozo.id });
    await orderService.joinTable(s.mesa3.id, mesa4.id, { userId: s.admin.id });
    // El ítem conserva su estado y su auditoría de solicitud pero cuelga del
    // pedido destino (D-010-11); la mesa de origen queda trazada.
    const [row] = await rows<{
      order_id: number;
      status: string;
      void_requested_by_user_id: number | null;
      ordered_at_table_id: number | null;
    }>(
      'SELECT order_id, status, void_requested_by_user_id, ordered_at_table_id ' +
        'FROM order_items WHERE id = $1',
      [item.id],
    );
    expect(row).toMatchObject({
      order_id: dest.id,
      status: 'void_requested',
      void_requested_by_user_id: s.mozo.id,
      ordered_at_table_id: s.mesa3.id,
    });
    // La aprobación sobre el pedido vivo funciona y la comanda 'void' cae allí.
    await itemService.voidItem(dest.id, item.id, { reason: 'confirmado' }, 'post-join-void', {
      userId: s.admin.id,
    });
    const [voidTicket] = await rows<{ order_id: number }>(
      "SELECT order_id FROM kitchen_tickets WHERE kind = 'void'",
    );
    expect(voidTicket!.order_id).toBe(dest.id);
    // Sobre el pedido absorbido todo el ciclo responde ORDER_NOT_OPEN.
    await expect(
      itemService.requestVoid(s.orderP.id, item.id, { reason: 'tarde' }, 'tarde', {
        userId: s.mozo.id,
      }),
    ).rejects.toMatchObject({ code: 'ORDER_NOT_OPEN' });
    // La clave vieja del envío repite su respuesta guardada aunque el pedido ya
    // esté 'merged' (el replay va antes que las guardias — D-010-08).
    const replay = await itemService.sendItems(
      s.orderP.id,
      { items: [{ productId: s.incaKola.id }] },
      'pre-join-send',
      { userId: s.mozo.id },
    );
    expect(replay.order.id).toBe(s.orderP.id);
  });

  it('ADV-010-16: regla 4 — el ítem conserva nombre y precio tras cambiar y desactivar el producto en la carta', async () => {
    const s = await seed();
    const item = await sentItem(s.orderP.id, s.incaKola.id, s.mozo.id, 'congelado');
    const products = createProductService({ models: auth.models });
    await products.updateProduct(s.incaKola.id, {
      name: 'Inca Kola Zero',
      priceCents: 950,
    });
    const view = await orderService.getOrder(s.orderP.id);
    const frozen = view.items.find((entry) => entry.id === item.id)!;
    expect(frozen).toMatchObject({ productName: 'Inca Kola 1L', priceCents: 800 });
    // El envío siguiente copia los datos NUEVOS; el ítem viejo no se mueve.
    const { order } = await itemService.sendItems(
      s.orderP.id,
      { items: [{ productId: s.incaKola.id }] },
      'nuevo-precio',
      { userId: s.mozo.id },
    );
    const fresh = order.items.find((entry) => entry.id !== item.id)!;
    expect(fresh).toMatchObject({ productName: 'Inca Kola Zero', priceCents: 950 });
    expect(order.totalCents).toBe(800 + 950);
    // Desactivado: no se puede volver a enviar pero el ítem viejo sigue en la
    // vista con sus datos congelados.
    await products.updateProduct(s.incaKola.id, { isActive: false });
    await expect(
      itemService.sendItems(s.orderP.id, { items: [{ productId: s.incaKola.id }] }, 'post-baja', {
        userId: s.mozo.id,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const after = await orderService.getOrder(s.orderP.id);
    expect(after.items).toHaveLength(2);
    expect(after.totalCents).toBe(800 + 950);
  });

  it('ADV-010-17: dos solicitudes de anulación en carrera — gana una y el triple de auditoría queda una sola vez', async () => {
    const s = await seed();
    const item = await sentItem(s.orderP.id, s.incaKola.id, s.mozo.id, 'adv-010-17-send');
    const results = await Promise.allSettled([
      itemService.requestVoid(s.orderP.id, item.id, { reason: 'a' }, 'k-req-a', {
        userId: s.mozo.id,
      }),
      itemService.requestVoid(s.orderP.id, item.id, { reason: 'b' }, 'k-req-b', {
        userId: s.mozo.id,
      }),
    ]);
    const ok = results.filter((result) => result.status === 'fulfilled');
    const ko = results.filter((result) => result.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(ko).toHaveLength(1);
    expect((ko[0]!.reason as { code?: string }).code).toBe('ORDER_ITEM_VOID_REQUESTED');
    const [row] = await rows<{ status: string; c: number }>(
      'SELECT status, count(*) OVER ()::int AS c FROM order_items WHERE id = $1',
      [item.id],
    );
    expect(row!.status).toBe('void_requested');
    expect(row!.c).toBe(1);
  });

  it('ADV-010-18: ids hostiles en ruta y cuerpo — todos 400/404 controlados; los NaN crudos documentan el hueco ya conocido', async () => {
    const s = await seed();
    const admin = await cookieFor('adv010.admin3', ['admin'], '1357');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // itemId de ruta fuera de la regla ^[0-9]+$, 1..2^31-1 → 400 con issue itemId.
    for (const badId of ['0', '-3', '1.5', '2147483648', '99999999999999999']) {
      const response = await postVoidAction(
        s.orderP.id,
        badId,
        'void',
        { reason: 'x' },
        `k-${badId}`,
        admin,
      );
      expect.soft(response.status, badId).toBe(400);
      if (response.status === 400) expect.soft(issuesOf(response)[0]!.path, badId).toBe('itemId');
    }
    // itemId válido pero que no existe en el pedido → 404 de dominio.
    const missing = await postVoidAction(
      s.orderP.id,
      '987654',
      'void',
      { reason: 'x' },
      'k-missing',
      admin,
    );
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual(ORDER_ITEM_NOT_FOUND_BODY);
    // Cabecera duplicada (arreglo) → 400 con issue en idempotencyKey.
    const dup = await request(auth.app)
      .post(`/api/orders/${s.orderP.id}/items`)
      .set('Idempotency-Key', ['a', 'b'] as unknown as string)
      .set('Cookie', admin)
      .send({ items: [{ productId: s.incaKola.id }] });
    expect(dup.status).toBe(400);
    expect(issuesOf(dup)[0]!.path).toBe('idempotencyKey');
    // Clave reutilizada con otro cuerpo → el 409 estable del conflicto.
    await itemService.sendItems(s.orderP.id, { items: [{ productId: s.incaKola.id }] }, 'tomada', {
      userId: s.mozo.id,
    });
    const conflict = await request(auth.app)
      .post(`/api/orders/${s.orderP.id}/items`)
      .set('Idempotency-Key', 'tomada')
      .set('Cookie', admin)
      .send({ items: [{ productId: s.incaKola.id, quantity: 5 }] });
    expect(conflict.status).toBe(409);
    expect(conflict.body).toEqual(IDEMPOTENCY_CONFLICT_BODY);
    // Observación (paridad con ADV-007-28, documentado Bajo): NaN/Infinity llegan
    // crudos al SQL y revientan con error de Sequelize en vez del 404 de dominio.
    // La ruta lo impide siempre (parseIdParam).
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      let thrown: unknown;
      try {
        await itemService.requestVoid(s.orderP.id, bad, { reason: 'x' }, `k-nan-${bad}`, {
          userId: s.mozo.id,
        });
      } catch (error) {
        thrown = error;
      }
      expect.soft(thrown).toBeDefined();
      expect.soft((thrown as { name?: string }).name).not.toBe('AppError');
    }
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-010-19: la base sostiene las invariantes de la 010 — CHECKs CASE, estados de anulación, FKs y unicidad de (scope, key)', async () => {
    await assertAuthorizedConnection(database());
    const s = await seed();
    const item = await sentItem(s.orderP.id, s.incaKola.id, s.mozo.id, 'adv-010-19-send');
    /** Devuelve el mensaje de error si la sentencia fue rechazada, o null si pasó. */
    const rejection = async (sql: string, bind?: (string | number | null)[]) => {
      try {
        await database().query(sql, { bind });
        return null;
      } catch (error) {
        return String(error);
      }
    };
    // CHECK de correspondencia presentación/parte con el CASE que no se anula
    // con NULL (misma lección que combo_items_portion_cut).
    for (const [portion, cut] of [
      [null, 'leg'],
      ['quarter', null],
      ['half', 'breast'],
      ['whole', 'leg'],
      ['eighth', null],
    ] as [string | null, string | null][]) {
      const message = await rejection(
        'UPDATE order_items SET portion = $1, cut = $2 WHERE id = $3',
        [portion, cut, item.id],
      );
      expect.soft(message, `(${portion},${cut})`).not.toBeNull();
      expect.soft(message, `(${portion},${cut})`).toContain('order_items_portion_cut');
    }
    // El CHECK de coherencia del ciclo de anulación (los tres estados).
    for (const sql of [
      "UPDATE order_items SET void_reason = 'x' WHERE id = " + item.id,
      "UPDATE order_items SET status = 'void_requested' WHERE id = " + item.id,
      "UPDATE order_items SET status = 'voided' WHERE id = " + item.id,
      "UPDATE order_items SET status = 'draft' WHERE id = " + item.id,
    ]) {
      const message = await rejection(sql);
      expect.soft(message, sql).not.toBeNull();
      expect.soft(message, sql).toMatch(/order_items_(void_consistent|status_allowed)/);
    }
    // La fila de prueba sigue íntegra tras la batería rechazada.
    const [alive] = await rows<{ status: string }>('SELECT status FROM order_items WHERE id = $1', [
      item.id,
    ]);
    expect(alive!.status).toBe('sent');
    // Comandas: kind fuera de lista y FK a pedido inexistente.
    expect(
      await rejection(
        "INSERT INTO kitchen_tickets (order_id, kind, created_by_user_id) VALUES ($1, 'draft', $2)",
        [s.orderP.id, s.mozo.id],
      ),
    ).toContain('kitchen_tickets_kind_allowed');
    expect(
      await rejection(
        "INSERT INTO kitchen_tickets (order_id, kind, created_by_user_id) VALUES (999999, 'additional', $1)",
        [s.mozo.id],
      ),
    ).toContain('kitchen_tickets_order_id_fkey');
    // Ítems: FK a pedido, producto y comanda; cotas de cantidad y precio.
    const ticketSub = `(SELECT kitchen_ticket_id FROM order_items WHERE id = ${item.id})`;
    expect(
      await rejection(
        'INSERT INTO order_items (order_id, product_id, product_name, product_category, quantity, price_cents, kitchen_ticket_id, created_by_user_id) ' +
          `VALUES (999999, $1, 'X', 'drink', 1, 1, ${ticketSub}, $2)`,
        [s.incaKola.id, s.mozo.id],
      ),
    ).toContain('order_items_order_id_fkey');
    expect(
      await rejection(
        'INSERT INTO order_items (order_id, product_id, product_name, product_category, quantity, price_cents, kitchen_ticket_id, created_by_user_id) ' +
          `VALUES ($1, 999999, 'X', 'drink', 1, 1, ${ticketSub}, $2)`,
        [s.orderP.id, s.mozo.id],
      ),
    ).toContain('order_items_product_id_fkey');
    expect(
      await rejection(
        'INSERT INTO order_items (order_id, product_id, product_name, product_category, quantity, price_cents, kitchen_ticket_id, created_by_user_id) ' +
          `VALUES ($1, $2, 'X', 'drink', 0, 1, ${ticketSub}, $3)`,
        [s.orderP.id, s.incaKola.id, s.mozo.id],
      ),
    ).toContain('order_items_quantity_range');
    // Idempotencia en la base: el par (scope, key) es único y el scope es libre
    // (los cuatro scopes viven solo en el servicio — se documenta).
    await database().query(
      'INSERT INTO idempotency_keys (scope, key, order_id, request_hash, response_status, response_body) ' +
        "VALUES ('inventado', 'k-1', $1, 'h', 0, '{}'::jsonb)",
      { bind: [s.orderP.id] },
    );
    let dupSignal: string;
    try {
      await database().query(
        'INSERT INTO idempotency_keys (scope, key, order_id, request_hash, response_status, response_body) ' +
          "VALUES ('inventado', 'k-1', $1, 'h', 0, '{}'::jsonb)",
        { bind: [s.orderP.id] },
      );
      dupSignal = 'sin rechazo';
    } catch (error) {
      dupSignal =
        (error as { parent?: { constraint?: string } }).parent?.constraint ?? String(error);
    }
    expect(dupSignal).toContain('idempotency_keys_scope_key_unique');
  });
});
