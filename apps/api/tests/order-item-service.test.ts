// AC-06, AC-07, AC-08, AC-09, AC-10 y AC-11. Spec 010 — archivo nuevo: va EN ROJO
// hasta que T-09/T-10 creen order-item.service.ts y amplíen order.service.ts.
import { Sequelize } from 'sequelize';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { defineModels, type Models } from '../src/models/index.ts';
import { createBcryptPinHasher } from '../src/services/auth/pin-hasher.ts';
import { createUserService } from '../src/services/users/user.service.ts';
import { createTableService } from '../src/services/tables/table.service.ts';
import { createOrderService, type OrderService } from '../src/services/orders/order.service.ts';
import { createProductService } from '../src/services/products/product.service.ts';
import { createProductPortionService } from '../src/services/products/product-portion.service.ts';
import { createComboItemService } from '../src/services/combo-items/combo-item.service.ts';
import { createOrderItemService } from '../src/services/order-items/order-item.service.ts';
import {
  clearMenuTables,
  clearOrderTables,
  closeTestDatabase,
  connectTestDatabase,
  migrateAndClearAuthTables,
} from './helpers/test-database.ts';

const ORDER_NOT_FOUND = { code: 'ORDER_NOT_FOUND', httpStatus: 404 };
const ORDER_NOT_OPEN = { code: 'ORDER_NOT_OPEN', httpStatus: 409 };
const ORDER_ITEM_NOT_FOUND = {
  code: 'ORDER_ITEM_NOT_FOUND',
  httpStatus: 404,
};
const ORDER_ITEM_ALREADY_VOIDED = { code: 'ORDER_ITEM_ALREADY_VOIDED', httpStatus: 409 };
const ORDER_ITEM_VOID_REQUESTED = { code: 'ORDER_ITEM_VOID_REQUESTED', httpStatus: 409 };
const ORDER_ITEM_NOT_REQUESTED = { code: 'ORDER_ITEM_NOT_REQUESTED', httpStatus: 409 };
const ORDER_ITEMS_LIMIT = { code: 'ORDER_ITEMS_LIMIT', httpStatus: 409 };
const IDEMPOTENCY_CONFLICT = { code: 'IDEMPOTENCY_CONFLICT', httpStatus: 409 };

let sequelize: Sequelize;
let models: Models;
let orderService: OrderService;
let itemService: ReturnType<typeof createOrderItemService>;

interface Seed {
  juan: { id: number };
  admin: { id: number };
  mesa3: number;
  orderP: { id: number };
  pollo: number;
  anticucho: number;
  incaKola: number;
  aji: number;
  ocopa: number;
  mostrito: number;
}

/** Fila genérica de un SELECT. */
async function rows<T>(sql: string, bind?: unknown[]): Promise<T[]> {
  const [result] = await sequelize.query(sql, { bind });
  return result as T[];
}

async function count(table: string): Promise<number> {
  const [row] = await rows<{ c: number }>(`SELECT count(*)::int AS c FROM ${table}`);
  return row!.c;
}

async function orderRow(id: number) {
  const [row] = await rows<{
    status: string;
    ready_at: Date | null;
    bill_requested_at: Date | null;
  }>('SELECT status, ready_at, bill_requested_at FROM orders WHERE id = $1', [id]);
  return row;
}

/** La carta semilla de la spec + pedido P del mozo Juan en Mesa 3. */
async function seedCarta(): Promise<Seed> {
  const pinHasher = createBcryptPinHasher({ cost: 4 });
  const users = createUserService({ models, pinHasher });
  const juan = await users.createUser({
    username: 'juan',
    displayName: 'Juan',
    pin: '1234',
    roles: ['waiter'],
  });
  const admin = await users.createUser({
    username: 'luz',
    displayName: 'Do\u00F1a Luz',
    pin: '1234',
    roles: ['admin'],
  });
  const products = createProductService({ models });
  const portions = createProductPortionService({ models });
  const combos = createComboItemService({ models });
  const pollo = (
    await products.createProduct({
      name: 'Pollo a la brasa',
      category: 'chicken',
      priceCents: 4800,
    })
  ).id;
  await portions.replaceProductPortions(pollo, {
    portions: [
      { portion: 'quarter', cut: 'breast', priceCents: 1500 },
      { portion: 'quarter', cut: 'leg', priceCents: 1400 },
      { portion: 'half', cut: null, priceCents: 2600 },
      { portion: 'whole', cut: null, priceCents: 4800 },
    ],
  });
  const anticucho = (
    await products.createProduct({
      name: 'Anticucho de pollo',
      category: 'chicken',
      priceCents: 1200,
    })
  ).id;
  const incaKola = (
    await products.createProduct({ name: 'Inca Kola 1L', category: 'drink', priceCents: 800 })
  ).id;
  const aji = (await products.createProduct({ name: 'Aj\u00ED', category: 'sauce', priceCents: 0 }))
    .id;
  const ocopa = (
    await products.createProduct({ name: 'Ocopa', category: 'sauce', priceCents: 300 })
  ).id;
  const mostrito = (
    await products.createProduct({ name: 'Mostrito', category: 'combo', priceCents: 2200 })
  ).id;
  await combos.replaceComboItems(mostrito, {
    items: [
      { productId: pollo, quantity: 1, portion: 'quarter', cut: 'leg' },
      { productId: incaKola, quantity: 1 },
    ],
  });
  const tables = createTableService({ models });
  const mesa3 = (await tables.createTable({ name: 'Mesa 3' })).id;
  const orderP = await orderService.openOrder(mesa3, { userId: juan.id });
  return { juan, admin, mesa3, orderP, pollo, anticucho, incaKola, aji, ocopa, mostrito };
}

/** Issues de un AppError VALIDATION_ERROR. */
function issuesOf(error: unknown): { path: string; message: string }[] {
  const e = error as {
    code?: string;
    details?: { issues?: { path: (string | number)[]; message: string }[] };
  };
  expect(e.code).toBe('VALIDATION_ERROR');
  return (e.details?.issues ?? []).map((issue) => ({
    path: String(issue.path),
    message: issue.message,
  }));
}

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
  models = defineModels(sequelize);
  orderService = createOrderService({ models });
  itemService = createOrderItemService({ models });
});

describe('010: servicio de ítems del pedido sobre polleria_test', () => {
  it('AC-06: el envío copia precio, nombre, octavos y emite la comanda initial', async () => {
    const s = await seedCarta();
    const { order, ticket } = await itemService.sendItems(
      s.orderP.id,
      { items: [{ productId: s.incaKola, quantity: 2 }] },
      'k-1',
      { userId: s.juan.id },
    );
    expect(ticket).toMatchObject({ orderId: s.orderP.id, kind: 'initial' });
    expect(ticket.createdBy).toMatchObject({ id: s.juan.id, displayName: 'Juan' });
    expect(order.items).toHaveLength(1);
    expect(order.items[0]).toMatchObject({
      productId: s.incaKola,
      productName: 'Inca Kola 1L',
      productCategory: 'drink',
      quantity: 2,
      priceCents: 800,
      portion: null,
      cut: null,
      breastEighths: 0,
      legEighths: 0,
      status: 'sent',
      kitchenTicketId: ticket.id,
      orderedAtTable: { id: s.mesa3 },
      createdBy: { id: s.juan.id },
      sauces: [],
      components: [],
    });
    expect(order.totalCents).toBe(1600);
    expect(ticket.items).toHaveLength(1);
  });
  it('AC-06: el pollo cobra la fila de presentación y fija sus octavos', async () => {
    const s = await seedCarta();
    const { order } = await itemService.sendItems(
      s.orderP.id,
      {
        items: [
          { productId: s.pollo, portion: 'quarter', cut: 'leg' },
          { productId: s.pollo, portion: 'half', breastEighths: 1, legEighths: 3 },
          { productId: s.pollo, portion: 'half' },
          { productId: s.pollo, portion: 'whole' },
          { productId: s.anticucho },
        ],
      },
      'k-1',
      { userId: s.juan.id },
    );
    const [pierna, medio13, medio22, entero, anticucho] = order.items;
    expect(pierna).toMatchObject({
      priceCents: 1400,
      portion: 'quarter',
      cut: 'leg',
      breastEighths: 0,
      legEighths: 2,
    });
    expect(medio13).toMatchObject({ priceCents: 2600, breastEighths: 1, legEighths: 3 });
    expect(medio22).toMatchObject({ priceCents: 2600, breastEighths: 2, legEighths: 2 });
    expect(entero).toMatchObject({ priceCents: 4800, breastEighths: 4, legEighths: 4 });
    // El chicken sin porciones cobra el precio base de la carta.
    expect(anticucho).toMatchObject({ priceCents: 1200, portion: null, cut: null });
    expect(order.totalCents).toBe(1400 + 2600 + 2600 + 4800 + 1200);
  });
  it('AC-06: notes recortada, cremas con precio copiado y octavos por cantidad', async () => {
    const s = await seedCarta();
    const { order } = await itemService.sendItems(
      s.orderP.id,
      {
        items: [
          {
            productId: s.pollo,
            portion: 'quarter',
            cut: 'breast',
            quantity: 2,
            notes: '  sin ensalada  ',
            sauces: [{ productId: s.aji }, { productId: s.ocopa, quantity: 2 }],
          },
        ],
      },
      'k-1',
      { userId: s.juan.id },
    );
    const item = order.items[0]!;
    expect(item).toMatchObject({
      quantity: 2,
      priceCents: 1500,
      breastEighths: 4,
      legEighths: 0,
      notes: 'sin ensalada',
    });
    expect(item.sauces).toEqual([
      expect.objectContaining({
        productId: s.aji,
        productName: 'Aj\u00ED',
        quantity: 1,
        priceCents: 0,
      }),
      expect.objectContaining({
        productId: s.ocopa,
        productName: 'Ocopa',
        quantity: 2,
        priceCents: 300,
      }),
    ]);
    expect(order.totalCents).toBe(2 * 1500 + 0 + 2 * 300);
  });
  it('AC-06: el combo copia sus componentes resueltos con octavos en el ítem', async () => {
    const s = await seedCarta();
    const { order } = await itemService.sendItems(
      s.orderP.id,
      {
        items: [
          {
            productId: s.mostrito,
            components: [
              { productId: s.pollo, quantity: 1, portion: 'quarter', cut: 'breast' },
              { productId: s.incaKola, quantity: 1 },
            ],
          },
        ],
      },
      'k-1',
      { userId: s.juan.id },
    );
    const combo = order.items[0]!;
    expect(combo).toMatchObject({ priceCents: 2200, breastEighths: 2, legEighths: 0 });
    expect(combo.components).toEqual([
      expect.objectContaining({
        productId: s.pollo,
        productName: 'Pollo a la brasa',
        quantity: 1,
        portion: 'quarter',
        cut: 'breast',
        breastEighths: 2,
        legEighths: 0,
      }),
      expect.objectContaining({
        productId: s.incaKola,
        productName: 'Inca Kola 1L',
        quantity: 1,
        portion: null,
        cut: null,
        breastEighths: 0,
        legEighths: 0,
      }),
    ]);
    // Sin components en la entrada: se resuelven desde la carta (cut 'leg' de la carta).
    const { order: order2 } = await itemService.sendItems(
      s.orderP.id,
      { items: [{ productId: s.mostrito }] },
      'k-2',
      { userId: s.juan.id },
    );
    const combo2 = order2.items[order2.items.length - 1]!;
    expect(combo2).toMatchObject({ priceCents: 2200, breastEighths: 0, legEighths: 2 });
    expect(combo2.components?.[0]).toMatchObject({ portion: 'quarter', cut: 'leg' });
  });
  it('AC-06: cambiar la carta después del envío no altera el ítem (regla 4)', async () => {
    const s = await seedCarta();
    const { order } = await itemService.sendItems(
      s.orderP.id,
      { items: [{ productId: s.incaKola, quantity: 1 }] },
      'k-1',
      { userId: s.juan.id },
    );
    await sequelize.query('UPDATE products SET price_cents = 99999 WHERE id = $1', {
      bind: [s.incaKola],
    });
    const again = await orderService.getOrder(s.orderP.id);
    expect(again.items[0]).toMatchObject({ priceCents: 800, productName: 'Inca Kola 1L' });
    expect(again.totalCents).toBe(800);
    expect(order.items[0]!.priceCents).toBe(800);
  });

  it('AC-07: los issues por ítem se acumulan con su ruta items.N.*', async () => {
    const s = await seedCarta();
    const inactivo = (
      await createProductService({ models }).createProduct({
        name: 'Chicha morada',
        category: 'drink',
        priceCents: 600,
      })
    ).id;
    await sequelize.query('UPDATE products SET is_active = false WHERE id = $1', {
      bind: [inactivo],
    });
    try {
      await itemService.sendItems(
        s.orderP.id,
        {
          items: [
            { productId: 999999 },
            { productId: inactivo },
            { productId: s.anticucho, portion: 'quarter', cut: 'leg' },
            { productId: s.incaKola, portion: 'quarter', cut: 'leg' },
            { productId: s.pollo, portion: 'eighth', cut: 'leg' },
            { productId: s.pollo, portion: 'half', breastEighths: 1, legEighths: 1 },
            { productId: s.incaKola, components: [{ productId: s.aji, quantity: 1 }] },
            {
              productId: s.mostrito,
              components: [{ productId: s.aji, quantity: 1 }],
            },
            { productId: s.incaKola, sauces: [{ productId: s.aji }] },
            { productId: s.pollo, portion: 'quarter', cut: 'leg', sauces: [{ productId: 999999 }] },
            {
              productId: s.pollo,
              portion: 'quarter',
              cut: 'leg',
              sauces: [{ productId: s.incaKola }],
            },
            {
              productId: s.pollo,
              portion: 'quarter',
              cut: 'leg',
              sauces: [{ productId: inactivo }],
            },
            {
              productId: s.pollo,
              portion: 'quarter',
              cut: 'leg',
              sauces: [{ productId: s.aji }, { productId: s.aji }],
            },
          ],
        },
        'k-1',
        { userId: s.juan.id },
      );
      expect.unreachable('el envío debió rechazarse');
    } catch (error) {
      const issues = issuesOf(error);
      expect(issues).toEqual(
        expect.arrayContaining([
          { path: 'items.0.productId', message: 'Ese producto no existe.' },
          { path: 'items.1.productId', message: 'Ese producto est\u00E1 desactivado en la carta.' },
          {
            path: 'items.2.portion',
            message: 'Este producto no lleva presentaci\u00F3n ni parte.',
          },
          {
            path: 'items.3.portion',
            message: 'Este producto no lleva presentaci\u00F3n ni parte.',
          },
          {
            path: 'items.4.portion',
            message: 'Esa presentaci\u00F3n no est\u00E1 en la carta de este producto.',
          },
          {
            path: 'items.5.breastEighths',
            message: 'La distribuci\u00F3n del medio debe sumar 4 octavos entre pecho y pierna.',
          },
          { path: 'items.6.components', message: 'Solo los combos llevan componentes.' },
          {
            path: 'items.7.components',
            message: 'Los componentes no coinciden con el combo de la carta.',
          },
          { path: 'items.8.sauces', message: 'Las cremas solo van con platos, pollo o combos.' },
          { path: 'items.9.sauces.0.productId', message: 'Esa crema no existe.' },
          { path: 'items.10.sauces.0.productId', message: 'Ese producto no es una crema.' },
          {
            path: 'items.11.sauces.0.productId',
            message: 'Esa crema est\u00E1 desactivada en la carta.',
          },
          { path: 'items.12.sauces', message: 'Hay cremas repetidas en el \u00EDtem.' },
        ]),
      );
    }
    // Falla sin escribir nada.
    expect(await count('order_items')).toBe(0);
    expect(await count('kitchen_tickets')).toBe(0);
    expect(await count('idempotency_keys')).toBe(0);
  });
  it('AC-07: breastEighths fuera del medio y demás guardias del pedido', async () => {
    const s = await seedCarta();
    try {
      await itemService.sendItems(
        s.orderP.id,
        { items: [{ productId: s.incaKola, breastEighths: 2, legEighths: 2 }] },
        'k-1',
        { userId: s.juan.id },
      );
      expect.unreachable();
    } catch (error) {
      expect(issuesOf(error)).toContainEqual({
        path: 'items.0.breastEighths',
        message: 'La distribuci\u00F3n de partes solo se indica en el medio pollo.',
      });
    }
    await expect(
      itemService.sendItems(999999, { items: [{ productId: s.incaKola }] }, 'k-2', {
        userId: s.juan.id,
      }),
    ).rejects.toMatchObject(ORDER_NOT_FOUND);
    // Pedido cerrado → ORDER_NOT_OPEN.
    await sequelize.query(
      "UPDATE orders SET status = 'closed', closed_at = now(), closed_by_user_id = $2 WHERE id = $1",
      {
        bind: [s.orderP.id, s.admin.id],
      },
    );
    await expect(
      itemService.sendItems(s.orderP.id, { items: [{ productId: s.incaKola }] }, 'k-3', {
        userId: s.juan.id,
      }),
    ).rejects.toMatchObject(ORDER_NOT_OPEN);
  });
  it('AC-07: el tope de ítems activos del pedido es 99', async () => {
    const s = await seedCarta();
    // 98 ítems 'sent' por SQL (un ticket fantasma para la FK).
    const [ticket] = await rows<{ id: number }>(
      'INSERT INTO kitchen_tickets (order_id, kind, created_by_user_id, created_at, updated_at) ' +
        "VALUES ($1, 'initial', $2, now(), now()) RETURNING id",
      [s.orderP.id, s.juan.id],
    );
    for (let i = 0; i < 98; i++) {
      await sequelize.query(
        'INSERT INTO order_items (order_id, product_id, product_name, product_category, ' +
          'quantity, price_cents, status, kitchen_ticket_id, created_by_user_id, created_at, ' +
          "updated_at) VALUES ($1, $2, 'Inca Kola 1L', 'drink', 1, 800, 'sent', $3, $4, now(), now())",
        { bind: [s.orderP.id, s.incaKola, ticket!.id, s.juan.id] },
      );
    }
    // Uno entra (99); dos ya no.
    await itemService.sendItems(s.orderP.id, { items: [{ productId: s.incaKola }] }, 'k-98', {
      userId: s.juan.id,
    });
    await expect(
      itemService.sendItems(
        s.orderP.id,
        { items: [{ productId: s.incaKola }, { productId: s.incaKola }] },
        'k-99',
        { userId: s.juan.id },
      ),
    ).rejects.toMatchObject(ORDER_ITEMS_LIMIT);
    // Los ítems 'voided' no cuentan para el tope: anulo uno por SQL y vuelve a entrar uno.
    await sequelize.query(
      "UPDATE order_items SET status = 'voided', voided_at = now(), voided_by_user_id = $1, " +
        "void_reason = 'x', void_ticket_id = $2 WHERE id = (SELECT min(id) FROM order_items)",
      { bind: [s.admin.id, ticket!.id] },
    );
    await itemService.sendItems(s.orderP.id, { items: [{ productId: s.incaKola }] }, 'k-100', {
      userId: s.juan.id,
    });
  });

  it('AC-08: el replay devuelve la misma respuesta sin escribir filas', async () => {
    const s = await seedCarta();
    const body = { items: [{ productId: s.incaKola, quantity: 2 }] };
    const first = await itemService.sendItems(s.orderP.id, body, 'k-9', { userId: s.juan.id });
    const before = {
      items: await count('order_items'),
      tickets: await count('kitchen_tickets'),
      keys: await count('idempotency_keys'),
    };
    const replay = await itemService.sendItems(s.orderP.id, body, 'k-9', { userId: s.juan.id });
    expect(replay.ticket.id).toBe(first.ticket.id);
    expect(replay.order.items.map((i: { id: number }) => i.id)).toEqual(
      first.order.items.map((i: { id: number }) => i.id),
    );
    expect(await count('order_items')).toBe(before.items);
    expect(await count('kitchen_tickets')).toBe(before.tickets);
    expect(await count('idempotency_keys')).toBe(before.keys);
  });
  it('AC-08: la misma clave con otro cuerpo u otro pedido es conflicto', async () => {
    const s = await seedCarta();
    await itemService.sendItems(s.orderP.id, { items: [{ productId: s.incaKola }] }, 'k-9', {
      userId: s.juan.id,
    });
    await expect(
      itemService.sendItems(
        s.orderP.id,
        { items: [{ productId: s.incaKola, quantity: 2 }] },
        'k-9',
        { userId: s.juan.id },
      ),
    ).rejects.toMatchObject(IDEMPOTENCY_CONFLICT);
    // La misma clave sobre otro pedido también choca (la clave es global por scope).
    const mesa4 = (await createTableService({ models }).createTable({ name: 'Mesa 4' })).id;
    const orderQ = await orderService.openOrder(mesa4, { userId: s.juan.id });
    await expect(
      itemService.sendItems(orderQ.id, { items: [{ productId: s.incaKola }] }, 'k-9', {
        userId: s.juan.id,
      }),
    ).rejects.toMatchObject(IDEMPOTENCY_CONFLICT);
  });
  it('AC-08: el replay funciona tras mover o cerrar el pedido', async () => {
    const s = await seedCarta();
    const body = { items: [{ productId: s.incaKola }] };
    const first = await itemService.sendItems(s.orderP.id, body, 'k-9', { userId: s.juan.id });
    const mesa4 = (await createTableService({ models }).createTable({ name: 'Mesa 4' })).id;
    await orderService.moveOrder(s.orderP.id, mesa4, { userId: s.juan.id });
    const replay = await itemService.sendItems(s.orderP.id, body, 'k-9', { userId: s.juan.id });
    expect(replay.ticket.id).toBe(first.ticket.id);
    await sequelize.query(
      "UPDATE orders SET status = 'closed', closed_at = now(), closed_by_user_id = $2 WHERE id = $1",
      {
        bind: [s.orderP.id, s.admin.id],
      },
    );
    const replayClosed = await itemService.sendItems(s.orderP.id, body, 'k-9', {
      userId: s.juan.id,
    });
    expect(replayClosed.ticket.id).toBe(first.ticket.id);
  });
  it('AC-08: claves distintas emiten initial y luego additional', async () => {
    const s = await seedCarta();
    const first = await itemService.sendItems(
      s.orderP.id,
      { items: [{ productId: s.incaKola }] },
      'k-1',
      { userId: s.juan.id },
    );
    const second = await itemService.sendItems(
      s.orderP.id,
      { items: [{ productId: s.aji }] },
      'k-2',
      { userId: s.juan.id },
    );
    expect(first.ticket.kind).toBe('initial');
    expect(second.ticket.kind).toBe('additional');
    expect(second.order.items).toHaveLength(2);
    expect(second.order.totalCents).toBe(800 + 0);
  });

  it('AC-09: el envío limpia la pre-cuenta y conserva el listo', async () => {
    const s = await seedCarta();
    await orderService.requestBill(s.orderP.id, { userId: s.juan.id });
    await orderService.markReady(s.orderP.id, { userId: s.juan.id });
    const { order } = await itemService.sendItems(
      s.orderP.id,
      { items: [{ productId: s.incaKola }] },
      'k-1',
      { userId: s.juan.id },
    );
    expect(order.billRequestedAt).toBeNull();
    expect(order.readyAt).not.toBeNull();
    const row = await orderRow(s.orderP.id);
    expect(row?.bill_requested_at).toBeNull();
    expect(row?.ready_at).not.toBeNull();
  });

  it('AC-10: requestVoid marca el triple sin comanda ni cambio de total', async () => {
    const s = await seedCarta();
    const sent = await itemService.sendItems(
      s.orderP.id,
      { items: [{ productId: s.incaKola }] },
      'k-1',
      { userId: s.juan.id },
    );
    const itemId = sent.order.items[0]!.id;
    await orderService.requestBill(s.orderP.id, { userId: s.juan.id });
    const { order } = await itemService.requestVoid(
      s.orderP.id,
      itemId,
      { reason: 'Se equivoc\u00F3 el cliente' },
      'k-r1',
      { userId: s.juan.id },
    );
    const item = order.items[0]!;
    expect(item).toMatchObject({
      status: 'void_requested',
      voidRequestReason: 'Se equivoc\u00F3 el cliente',
    });
    expect(item.voidRequestedBy).toMatchObject({ id: s.juan.id, displayName: 'Juan' });
    expect(item.voidRequestedAt).not.toBeNull();
    // Sin comanda nueva; el ítem sigue contando y la pre-cuenta intacta.
    expect(await count('kitchen_tickets')).toBe(1);
    expect(order.totalCents).toBe(800);
    expect(order.billRequestedAt).not.toBeNull();
    // Replay con la misma clave devuelve la respuesta guardada.
    const replay = await itemService.requestVoid(
      s.orderP.id,
      itemId,
      { reason: 'Se equivoc\u00F3 el cliente' },
      'k-r1',
      { userId: s.juan.id },
    );
    expect(replay.order.items[0]!.status).toBe('void_requested');
    // Otra clave sobre el mismo ítem → ya tiene anulación pendiente.
    await expect(
      itemService.requestVoid(s.orderP.id, itemId, { reason: 'otro' }, 'k-r2', {
        userId: s.juan.id,
      }),
    ).rejects.toMatchObject(ORDER_ITEM_VOID_REQUESTED);
  });
  it('AC-10: requestVoid sobre ítem ajeno, anulado o pedido cerrado falla', async () => {
    const s = await seedCarta();
    const sent = await itemService.sendItems(
      s.orderP.id,
      { items: [{ productId: s.incaKola }] },
      'k-1',
      { userId: s.juan.id },
    );
    const itemId = sent.order.items[0]!.id;
    await expect(
      itemService.requestVoid(s.orderP.id, 999999, { reason: 'x' }, 'k-r1', {
        userId: s.juan.id,
      }),
    ).rejects.toMatchObject(ORDER_ITEM_NOT_FOUND);
    await itemService.voidItem(s.orderP.id, itemId, { reason: 'ok' }, 'k-v1', {
      userId: s.admin.id,
    });
    await expect(
      itemService.requestVoid(s.orderP.id, itemId, { reason: 'x' }, 'k-r2', {
        userId: s.juan.id,
      }),
    ).rejects.toMatchObject(ORDER_ITEM_ALREADY_VOIDED);
    await sequelize.query(
      "UPDATE orders SET status = 'closed', closed_at = now(), closed_by_user_id = $2 WHERE id = $1",
      {
        bind: [s.orderP.id, s.admin.id],
      },
    );
    await expect(
      itemService.requestVoid(s.orderP.id, itemId, { reason: 'x' }, 'k-r3', {
        userId: s.juan.id,
      }),
    ).rejects.toMatchObject(ORDER_NOT_OPEN);
  });
  it('AC-10: voidItem aprueba la solicitud y emite la comanda void', async () => {
    const s = await seedCarta();
    const sent = await itemService.sendItems(
      s.orderP.id,
      { items: [{ productId: s.incaKola }, { productId: s.ocopa }] },
      'k-1',
      { userId: s.juan.id },
    );
    const itemId = sent.order.items[0]!.id;
    await itemService.requestVoid(
      s.orderP.id,
      itemId,
      { reason: 'Se equivoc\u00F3 el cliente' },
      'k-r1',
      { userId: s.juan.id },
    );
    await orderService.requestBill(s.orderP.id, { userId: s.juan.id });
    const { order, ticket } = await itemService.voidItem(
      s.orderP.id,
      itemId,
      { reason: 'Confirmado, error del cliente' },
      'k-v1',
      { userId: s.admin.id },
    );
    const item = order.items[0]!;
    expect(item).toMatchObject({
      status: 'voided',
      voidReason: 'Confirmado, error del cliente',
      voidTicketId: ticket.id,
      voidRequestReason: 'Se equivoc\u00F3 el cliente',
    });
    expect(item.voidedBy).toMatchObject({ id: s.admin.id });
    expect(item.voidedAt).not.toBeNull();
    expect(item.voidRequestedBy).toMatchObject({ id: s.juan.id });
    expect(ticket).toMatchObject({ kind: 'void', orderId: s.orderP.id });
    expect(ticket.createdBy).toMatchObject({ id: s.admin.id });
    expect(ticket.items).toHaveLength(1);
    expect(order.totalCents).toBe(300);
    expect(order.billRequestedAt).toBeNull();
    // Replay con la misma clave.
    const replay = await itemService.voidItem(
      s.orderP.id,
      itemId,
      { reason: 'Confirmado, error del cliente' },
      'k-v1',
      { userId: s.admin.id },
    );
    expect(replay.ticket.id).toBe(ticket.id);
    await expect(
      itemService.voidItem(s.orderP.id, itemId, { reason: 'x' }, 'k-v2', { userId: s.admin.id }),
    ).rejects.toMatchObject(ORDER_ITEM_ALREADY_VOIDED);
  });
  it('AC-10: voidItem directo sobre sent deja el triple en NULL', async () => {
    const s = await seedCarta();
    const sent = await itemService.sendItems(
      s.orderP.id,
      { items: [{ productId: s.incaKola }] },
      'k-1',
      { userId: s.juan.id },
    );
    const itemId = sent.order.items[0]!.id;
    const { order, ticket } = await itemService.voidItem(
      s.orderP.id,
      itemId,
      { reason: 'Directo' },
      'k-v1',
      { userId: s.admin.id },
    );
    expect(order.items[0]).toMatchObject({
      status: 'voided',
      voidTicketId: ticket.id,
      voidRequestedBy: null,
      voidRequestedAt: null,
      voidRequestReason: null,
    });
    expect(order.totalCents).toBe(0);
    await expect(
      itemService.voidItem(s.orderP.id, 999999, { reason: 'x' }, 'k-v2', { userId: s.admin.id }),
    ).rejects.toMatchObject(ORDER_ITEM_NOT_FOUND);
    await sequelize.query(
      "UPDATE orders SET status = 'closed', closed_at = now(), closed_by_user_id = $2 WHERE id = $1",
      {
        bind: [s.orderP.id, s.admin.id],
      },
    );
    await expect(
      itemService.voidItem(s.orderP.id, itemId, { reason: 'x' }, 'k-v3', { userId: s.admin.id }),
    ).rejects.toMatchObject(ORDER_NOT_OPEN);
  });
  it('AC-10: rejectVoid devuelve el ítem a sent y permite volver a pedir', async () => {
    const s = await seedCarta();
    const sent = await itemService.sendItems(
      s.orderP.id,
      { items: [{ productId: s.incaKola }] },
      'k-1',
      { userId: s.juan.id },
    );
    const itemId = sent.order.items[0]!.id;
    await itemService.requestVoid(
      s.orderP.id,
      itemId,
      { reason: 'Se equivoc\u00F3 el cliente' },
      'k-r1',
      { userId: s.juan.id },
    );
    const ticketsBefore = await count('kitchen_tickets');
    const { order } = await itemService.rejectVoid(s.orderP.id, itemId, 'k-x1', {
      userId: s.admin.id,
    });
    expect(order.items[0]).toMatchObject({
      status: 'sent',
      voidRequestedBy: null,
      voidRequestedAt: null,
      voidRequestReason: null,
    });
    expect(await count('kitchen_tickets')).toBe(ticketsBefore);
    const replay = await itemService.rejectVoid(s.orderP.id, itemId, 'k-x1', {
      userId: s.admin.id,
    });
    expect(replay.order.items[0]!.status).toBe('sent');
    // Sobre 'sent' → NOT_REQUESTED; el mozo puede volver a solicitar tras el rechazo.
    await expect(
      itemService.rejectVoid(s.orderP.id, itemId, 'k-x2', { userId: s.admin.id }),
    ).rejects.toMatchObject(ORDER_ITEM_NOT_REQUESTED);
    const again = await itemService.requestVoid(
      s.orderP.id,
      itemId,
      { reason: 'De verdad se equivoc\u00F3' },
      'k-r2',
      { userId: s.juan.id },
    );
    expect(again.order.items[0]!.status).toBe('void_requested');
    await expect(
      itemService.rejectVoid(s.orderP.id, 999999, 'k-x3', { userId: s.admin.id }),
    ).rejects.toMatchObject(ORDER_ITEM_NOT_FOUND);
    await sequelize.query(
      "UPDATE orders SET status = 'closed', closed_at = now(), closed_by_user_id = $2 WHERE id = $1",
      {
        bind: [s.orderP.id, s.admin.id],
      },
    );
    await expect(
      itemService.rejectVoid(s.orderP.id, itemId, 'k-x4', { userId: s.admin.id }),
    ).rejects.toMatchObject(ORDER_NOT_OPEN);
  });
  it('AC-10: rejectVoid sobre voided es ALREADY_VOIDED', async () => {
    const s = await seedCarta();
    const sent = await itemService.sendItems(
      s.orderP.id,
      { items: [{ productId: s.incaKola }] },
      'k-1',
      { userId: s.juan.id },
    );
    const itemId = sent.order.items[0]!.id;
    await itemService.voidItem(s.orderP.id, itemId, { reason: 'ok' }, 'k-v1', {
      userId: s.admin.id,
    });
    await expect(
      itemService.rejectVoid(s.orderP.id, itemId, 'k-x1', { userId: s.admin.id }),
    ).rejects.toMatchObject(ORDER_ITEM_ALREADY_VOIDED);
  });

  it('AC-11: listOrderTickets ordena las comandas con sus ítems', async () => {
    const s = await seedCarta();
    const sent1 = await itemService.sendItems(
      s.orderP.id,
      { items: [{ productId: s.incaKola }] },
      'k-1',
      { userId: s.juan.id },
    );
    await itemService.sendItems(s.orderP.id, { items: [{ productId: s.mostrito }] }, 'k-2', {
      userId: s.juan.id,
    });
    const itemId = sent1.order.items[0]!.id;
    await itemService.requestVoid(
      s.orderP.id,
      itemId,
      { reason: 'Se equivoc\u00F3 el cliente' },
      'k-r1',
      { userId: s.juan.id },
    );
    await itemService.voidItem(s.orderP.id, itemId, { reason: 'ok' }, 'k-v1', {
      userId: s.admin.id,
    });
    const { tickets } = await itemService.listOrderTickets(s.orderP.id);
    expect(tickets.map((t: { kind: string }) => t.kind)).toEqual(['initial', 'additional', 'void']);
    expect(tickets[0]!.items).toHaveLength(1);
    expect(tickets[1]!.items[0]!.components).toHaveLength(2);
    expect(tickets[2]!.items).toHaveLength(1);
    expect(tickets[2]!.items[0]!.status).toBe('voided');
    // La solicitud no emite comanda: solo hay 3.
    expect(tickets).toHaveLength(3);
    await expect(itemService.listOrderTickets(999999)).rejects.toMatchObject(ORDER_NOT_FOUND);
  });
  it('AC-11: getOrder devuelve ítems en los tres estados y el total', async () => {
    const s = await seedCarta();
    const sent = await itemService.sendItems(
      s.orderP.id,
      { items: [{ productId: s.incaKola }, { productId: s.ocopa }, { productId: s.aji }] },
      'k-1',
      { userId: s.juan.id },
    );
    const [bebida, cremaCara] = sent.order.items;
    await itemService.requestVoid(s.orderP.id, bebida!.id, { reason: 'Se equivoc\u00F3' }, 'k-r1', {
      userId: s.juan.id,
    });
    await itemService.voidItem(s.orderP.id, cremaCara!.id, { reason: 'ok' }, 'k-v1', {
      userId: s.admin.id,
    });
    const order = await orderService.getOrder(s.orderP.id);
    expect(order.items.map((i: { status: string }) => i.status)).toEqual([
      'void_requested',
      'voided',
      'sent',
    ]);
    // totalCents cuenta 'sent' + 'void_requested', no 'voided'.
    expect(order.totalCents).toBe(800 + 0);
  });
  it('AC-11: un pedido sin ítems devuelve lista vacía y total 0', async () => {
    const s = await seedCarta();
    const order = await orderService.getOrder(s.orderP.id);
    expect(order.items).toEqual([]);
    expect(order.totalCents).toBe(0);
    const { tickets } = await itemService.listOrderTickets(s.orderP.id);
    expect(tickets).toEqual([]);
  });
});
