// AC-06 a AC-11. Spec 010 — archivo nuevo: va EN ROJO hasta que T-09 cree
// src/services/order-items/order-item.service.ts (envío, copias, issues por ítem,
// idempotencia, ciclo de anulación y comandas) y T-10 amplíe getOrder/order-view.
import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { KitchenTicket, OrderItem, UserRole } from '@polleria/shared';
import { AppError } from '../src/errors/app-error.ts';
import { defineModels } from '../src/models/index.ts';
import type { Models } from '../src/models/index.ts';
import { createBcryptPinHasher } from '../src/services/auth/pin-hasher.ts';
import type { PinHasher } from '../src/services/auth/pin-hasher.ts';
import { createComboItemService } from '../src/services/combo-items/combo-item.service.ts';
import { createProductPortionService } from '../src/services/products/product-portion.service.ts';
import { createProductService } from '../src/services/products/product.service.ts';
import { createOrderService } from '../src/services/orders/order.service.ts';
import { createOrderItemService } from '../src/services/order-items/order-item.service.ts';
import { createUserService } from '../src/services/users/user.service.ts';
import {
  clearMenuTables,
  clearOrderTables,
  closeTestDatabase,
  connectTestDatabase,
  migrateAndClearAuthTables,
} from './helpers/test-database.ts';

const VALIDATION = {
  code: 'VALIDATION_ERROR',
  httpStatus: 400,
  message: 'Los datos enviados no son v\u00E1lidos.',
};
const ORDER_NOT_FOUND = {
  code: 'ORDER_NOT_FOUND',
  httpStatus: 404,
  message: 'Ese pedido no existe.',
};
const ORDER_ITEM_NOT_FOUND = {
  code: 'ORDER_ITEM_NOT_FOUND',
  httpStatus: 404,
  message: 'Ese \u00EDtem no existe en este pedido.',
};
const ORDER_NOT_OPEN = {
  code: 'ORDER_NOT_OPEN',
  httpStatus: 409,
  message: 'El pedido ya est\u00E1 cerrado.',
};
const ORDER_ITEM_ALREADY_VOIDED = {
  code: 'ORDER_ITEM_ALREADY_VOIDED',
  httpStatus: 409,
  message: 'Ese \u00EDtem ya fue anulado.',
};
const ORDER_ITEM_VOID_REQUESTED = {
  code: 'ORDER_ITEM_VOID_REQUESTED',
  httpStatus: 409,
  message: 'Ese \u00EDtem ya tiene una anulaci\u00F3n pendiente.',
};
const ORDER_ITEM_NOT_REQUESTED = {
  code: 'ORDER_ITEM_NOT_REQUESTED',
  httpStatus: 409,
  message: 'Ese \u00EDtem no tiene una anulaci\u00F3n pendiente.',
};
const ORDER_ITEMS_LIMIT = {
  code: 'ORDER_ITEMS_LIMIT',
  httpStatus: 409,
  message: 'El pedido lleg\u00F3 al l\u00EDmite de \u00EDtems.',
};
const IDEMPOTENCY_CONFLICT = {
  code: 'IDEMPOTENCY_CONFLICT',
  httpStatus: 409,
  message: 'Esa clave de env\u00EDo ya se us\u00F3 con otros datos.',
};

// Mensajes de los issues por ítem de la tabla D-010-18.
const PRODUCT_NOT_FOUND_MESSAGE = 'Ese producto no existe.';
const PRODUCT_INACTIVE_MESSAGE = 'Ese producto est\u00E1 desactivado en la carta.';
const CHICKEN_NEEDS_PORTION_MESSAGE =
  'El pollo lleva presentaci\u00F3n (eighth, quarter, half o whole).';
const NO_PORTION_MESSAGE = 'Este producto no lleva presentaci\u00F3n ni parte.';
const PORTION_NOT_IN_MENU_MESSAGE =
  'Esa presentaci\u00F3n no est\u00E1 en la carta de este producto.';
const DISTRIBUTION_ONLY_HALF_MESSAGE =
  'La distribuci\u00F3n de partes solo se indica en el medio pollo.';
const DISTRIBUTION_SUM_MESSAGE =
  'La distribuci\u00F3n del medio debe sumar 4 octavos entre pecho y pierna.';
const ONLY_COMBO_COMPONENTS_MESSAGE = 'Solo los combos llevan componentes.';
const COMPONENTS_MISMATCH_MESSAGE = 'Los componentes no coinciden con el combo de la carta.';
const SAUCES_ONLY_FOOD_MESSAGE = 'Las cremas solo van con platos, pollo o combos.';
const SAUCES_DUPLICATED_MESSAGE = 'Hay cremas repetidas en el \u00EDtem.';
const SAUCE_NOT_FOUND_MESSAGE = 'Esa crema no existe.';
const NOT_A_SAUCE_MESSAGE = 'Ese producto no es una crema.';
const SAUCE_INACTIVE_MESSAGE = 'Esa crema est\u00E1 desactivada en la carta.';
// (El tope "Un ítem admite hasta 6 cremas." se cubre en la forma por AC-01 y por
// la API en AC-15: llega como issue items.N.sauces igual que las demás formas.)

/** Issues { path, message } de un AppError VALIDATION_ERROR lanzado por el servicio. */
function issuesOf(error: unknown): { path: string; message: string }[] {
  expect(error).toBeInstanceOf(AppError);
  const appError = error as AppError;
  expect(appError).toMatchObject({ code: 'VALIDATION_ERROR', httpStatus: 400 });
  const details = appError.details as { issues?: { path: string; message: string }[] } | null;
  expect(Array.isArray(details?.issues)).toBe(true);
  return details?.issues ?? [];
}

/** El elemento en posición `index` de la lista; falla claro si la lista es corta. */
function at<T>(list: readonly T[], index: number): T {
  const element = list[index];
  if (element === undefined) throw new Error(`La prueba esperaba el elemento ${index} en la lista`);
  return element;
}

/** La carta semilla de la spec §4.3 con los ids de sus productos. */
interface MenuSeed {
  pollo: number;
  anticucho: number;
  incaKola: number;
  aji: number;
  ocopa: number;
  mostrito: number;
}

describe('010: servicio de ítems del pedido sobre polleria_test', () => {
  let sequelize: Sequelize;
  let models: Models;
  let pinHasher: PinHasher;
  let orders: ReturnType<typeof createOrderService>;
  let service: ReturnType<typeof createOrderItemService>;

  const rows = <T extends object>(sql: string, bind?: (string | number | null)[]) =>
    sequelize.query<T>(sql, { type: QueryTypes.SELECT, bind });
  const itemRows = (orderId: number) =>
    rows<{
      id: number;
      product_id: number;
      product_name: string;
      product_category: string;
      quantity: number;
      price_cents: number;
      portion: string | null;
      cut: string | null;
      breast_eighths: number;
      leg_eighths: number;
      notes: string | null;
      status: string;
      kitchen_ticket_id: number;
      void_ticket_id: number | null;
      void_requested_at: Date | null;
      void_requested_by_user_id: number | null;
      void_request_reason: string | null;
      voided_at: Date | null;
      voided_by_user_id: number | null;
      void_reason: string | null;
      ordered_at_table_id: number | null;
      created_by_user_id: number;
    }>(
      'SELECT id, product_id, product_name, product_category, quantity, price_cents, ' +
        'portion, cut, breast_eighths, leg_eighths, notes, status, kitchen_ticket_id, ' +
        'void_ticket_id, void_requested_at, void_requested_by_user_id, void_request_reason, ' +
        'voided_at, voided_by_user_id, void_reason, ordered_at_table_id, created_by_user_id ' +
        'FROM order_items WHERE order_id = $1 ORDER BY id',
      [orderId],
    );
  const sauceRows = (orderItemId: number) =>
    rows<{
      product_id: number;
      product_name: string;
      quantity: number;
      price_cents: number;
    }>(
      'SELECT product_id, product_name, quantity, price_cents FROM order_item_sauces ' +
        'WHERE order_item_id = $1 ORDER BY id',
      [orderItemId],
    );
  const componentRows = (orderItemId: number) =>
    rows<{
      product_id: number;
      product_name: string;
      quantity: number;
      portion: string | null;
      cut: string | null;
      breast_eighths: number;
      leg_eighths: number;
    }>(
      'SELECT product_id, product_name, quantity, portion, cut, breast_eighths, leg_eighths ' +
        'FROM order_item_components WHERE order_item_id = $1 ORDER BY id',
      [orderItemId],
    );
  const ticketRows = (orderId: number) =>
    rows<{ id: number; kind: string; created_by_user_id: number }>(
      'SELECT id, kind, created_by_user_id FROM kitchen_tickets WHERE order_id = $1 ORDER BY id',
      [orderId],
    );
  const keyRows = () =>
    rows<{ id: number; scope: string; key: string; order_id: number }>(
      'SELECT id, scope, key, order_id FROM idempotency_keys ORDER BY id',
    );
  /** La fila de marcas del pedido; falla claro si el pedido no existe. */
  const orderMark = async (orderId: number) => {
    const [mark] = await rows<{
      bill_requested_at: Date | null;
      bill_requested_by_user_id: number | null;
      ready_at: Date | null;
      ready_by_user_id: number | null;
    }>(
      'SELECT bill_requested_at, bill_requested_by_user_id, ready_at, ready_by_user_id ' +
        'FROM "orders" WHERE id = $1',
      [orderId],
    );
    if (mark === undefined) throw new Error(`El pedido ${orderId} no existe en la prueba`);
    return mark;
  };
  const createUser = (username: string, displayName: string, roles: UserRole[] = ['waiter']) =>
    createUserService({ models, pinHasher }).createUser({
      username,
      displayName,
      roles,
      pin: '2468',
    });
  const insertTable = (name: string) =>
    sequelize
      .query<{ id: number }>(
        'INSERT INTO "tables" (name, is_active) VALUES ($1, true) RETURNING id',
        { type: QueryTypes.SELECT, bind: [name] },
      )
      .then((result) => result[0]?.id ?? -1);
  /** INSERT directo de ítems 'sent' para los topes (no pasa por el servicio). */
  const insertSentItem = (orderId: number, productId: number, ticketId: number, userId: number) =>
    sequelize.query(
      'INSERT INTO order_items (order_id, product_id, product_name, product_category, ' +
        'quantity, price_cents, status, kitchen_ticket_id, created_by_user_id) ' +
        "VALUES ($1, $2, 'Inca Kola 1L', 'drink', 1, 800, 'sent', $3, $4)",
      { bind: [orderId, productId, ticketId, userId] },
    );
  const insertTicket = (orderId: number, userId: number, kind = 'initial') =>
    sequelize
      .query<{ id: number }>(
        'INSERT INTO kitchen_tickets (order_id, kind, created_by_user_id) VALUES ($1, $2, $3) RETURNING id',
        { type: QueryTypes.SELECT, bind: [orderId, kind, userId] },
      )
      .then((result) => result[0]?.id ?? -1);

  /**
   * La carta semilla de la spec §4.3, creada con los servicios reales de las specs
   * 005/006/007: pollo con cuatro presentaciones (sin eighth), chicken sin porciones,
   * bebida, dos cremas y el combo Mostrito con pollo cuarto-pierna y gaseosa.
   */
  const seedMenu = async (): Promise<MenuSeed> => {
    const products = createProductService({ models });
    const portions = createProductPortionService({ models });
    const combos = createComboItemService({ models });
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
  };

  /** Mesa con pedido abierto por `userId` devolviendo mesa y pedido (el P de la spec). */
  const orderOnTable = async (name: string, userId: number) => {
    const tableId = await insertTable(name);
    const order = await orders.openOrder(tableId, { userId });
    return { tableId, order };
  };

  beforeAll(async () => {
    sequelize = await connectTestDatabase();
  });
  beforeEach(async () => {
    await migrateAndClearAuthTables(sequelize);
    await clearOrderTables(sequelize);
    await clearMenuTables(sequelize);
    models = defineModels(sequelize);
    pinHasher = createBcryptPinHasher({ cost: 4 });
    orders = createOrderService({ models });
    service = createOrderItemService({ models });
  });
  afterAll(async () => {
    await closeTestDatabase(sequelize);
  });

  it('AC-06: una bebida copia nombre, categoría y precio, y crea la comanda initial', async () => {
    const juan = await createUser('items.juan', 'Juan');
    const actor = { userId: juan.id, roles: juan.roles };
    const menu = await seedMenu();
    const { tableId: mesa3, order: p } = await orderOnTable('Mesa 3', juan.id);

    const result = await service.sendItems(
      p.id,
      { items: [{ productId: menu.incaKola, quantity: 2 }] },
      'k-1',
      actor,
    );
    // La respuesta es { order, ticket } con la comanda 'initial' y su único ítem.
    expect(result.order.id).toBe(p.id);
    expect(result.order.totalCents).toBe(1600);
    expect(result.order.items).toHaveLength(1);
    const item = at<OrderItem>(result.order.items, 0);
    expect(item).toMatchObject({
      productId: menu.incaKola,
      productName: 'Inca Kola 1L',
      productCategory: 'drink',
      quantity: 2,
      priceCents: 800,
      portion: null,
      cut: null,
      breastEighths: 0,
      legEighths: 0,
      notes: null,
      status: 'sent',
      kitchenTicketId: result.ticket.id,
      voidTicketId: null,
      voidedBy: null,
      voidedAt: null,
      voidReason: null,
      voidRequestedBy: null,
      voidRequestedAt: null,
      voidRequestReason: null,
      orderedAtTable: { id: mesa3, name: 'Mesa 3' },
      createdBy: { id: juan.id, displayName: 'Juan' },
      sauces: [],
      components: [],
    });
    expect(result.ticket).toMatchObject({
      orderId: p.id,
      kind: 'initial',
      createdBy: { id: juan.id, displayName: 'Juan' },
    });
    expect(result.ticket.items).toEqual(result.order.items);
    // La fila cruda confirma la copia, el autor y la mesa de origen.
    expect(await itemRows(p.id)).toEqual([
      expect.objectContaining({
        product_id: menu.incaKola,
        product_name: 'Inca Kola 1L',
        product_category: 'drink',
        quantity: 2,
        price_cents: 800,
        portion: null,
        cut: null,
        breast_eighths: 0,
        leg_eighths: 0,
        notes: null,
        status: 'sent',
        kitchen_ticket_id: result.ticket.id,
        void_ticket_id: null,
        void_requested_at: null,
        void_requested_by_user_id: null,
        void_request_reason: null,
        voided_at: null,
        voided_by_user_id: null,
        void_reason: null,
        ordered_at_table_id: mesa3,
        created_by_user_id: juan.id,
      }),
    ]);
    expect(await ticketRows(p.id)).toEqual([
      { id: result.ticket.id, kind: 'initial', created_by_user_id: juan.id },
    ]);
  });

  it('AC-06: el pollo con presentaciones cobra el precio de la fila y copia los octavos', async () => {
    const juan = await createUser('items.juan', 'Juan');
    const actor = { userId: juan.id, roles: juan.roles };
    const menu = await seedMenu();
    const { order: p } = await orderOnTable('Mesa 3', juan.id);

    const cuarto = await service.sendItems(
      p.id,
      { items: [{ productId: menu.pollo, portion: 'quarter', cut: 'leg' }] },
      'k-cuarto',
      actor,
    );
    // La fila quarter-leg cobra 1400 (no el price_cents del producto, D-010-03).
    expect(cuarto.order.items[0]).toMatchObject({
      priceCents: 1400,
      portion: 'quarter',
      cut: 'leg',
      breastEighths: 0,
      legEighths: 2,
    });
    expect(cuarto.order.totalCents).toBe(1400);

    const medio = await service.sendItems(
      p.id,
      { items: [{ productId: menu.pollo, portion: 'half' }] },
      'k-medio',
      actor,
    );
    // Sin distribución declarada el medio reparte 2+2 por defecto (D-010-04).
    expect(medio.order.items[1]).toMatchObject({
      priceCents: 2600,
      portion: 'half',
      cut: null,
      breastEighths: 2,
      legEighths: 2,
    });

    const medioPierna = await service.sendItems(
      p.id,
      { items: [{ productId: menu.pollo, portion: 'half', breastEighths: 1, legEighths: 3 }] },
      'k-medio-pierna',
      actor,
    );
    // "Medio solo pierna" casi: misma presentación y precio, octavos reales 1+3.
    expect(medioPierna.order.items[2]).toMatchObject({
      priceCents: 2600,
      breastEighths: 1,
      legEighths: 3,
    });

    const entero = await service.sendItems(
      p.id,
      { items: [{ productId: menu.pollo, portion: 'whole', quantity: 2 }] },
      'k-entero',
      actor,
    );
    // Entero ×2: 4+4 por unidad, total de línea 8+8 y dos veces el precio de la fila.
    expect(entero.order.items[3]).toMatchObject({
      priceCents: 4800,
      quantity: 2,
      breastEighths: 8,
      legEighths: 8,
    });
    expect(entero.order.totalCents).toBe(1400 + 2600 + 2600 + 2 * 4800);
  });

  it('AC-06: el chicken sin presentaciones y el combo copian su precio de producto', async () => {
    const juan = await createUser('items.juan', 'Juan');
    const actor = { userId: juan.id, roles: juan.roles };
    const menu = await seedMenu();
    const { order: p } = await orderOnTable('Mesa 3', juan.id);

    const anticuchos = await service.sendItems(
      p.id,
      { items: [{ productId: menu.anticucho }] },
      'k-anticucho',
      actor,
    );
    // Chicken sin presentaciones: ítem simple al price_cents del producto (D-010-03).
    expect(anticuchos.order.items[0]).toMatchObject({
      productName: 'Anticucho de pollo',
      productCategory: 'chicken',
      priceCents: 1200,
      portion: null,
      cut: null,
      breastEighths: 0,
      legEighths: 0,
    });

    const mostrito = await service.sendItems(
      p.id,
      { items: [{ productId: menu.mostrito }] },
      'k-mostrito',
      actor,
    );
    // El combo cobra su propio precio y copia sus componentes resueltos (D-010-05):
    // los octavos del ítem son la suma de los componentes (un cuarto-pierna = 0+2).
    const comboItem = mostrito.order.items[1];
    expect(comboItem).toMatchObject({
      productName: 'Mostrito',
      productCategory: 'combo',
      priceCents: 2200,
      portion: null,
      cut: null,
      breastEighths: 0,
      legEighths: 2,
      components: [
        {
          productId: menu.pollo,
          productName: 'Pollo a la brasa',
          quantity: 1,
          portion: 'quarter',
          cut: 'leg',
          breastEighths: 0,
          legEighths: 2,
        },
        {
          productId: menu.incaKola,
          productName: 'Inca Kola 1L',
          quantity: 1,
          portion: null,
          cut: null,
          breastEighths: 0,
          legEighths: 0,
        },
      ],
    });
    expect(comboItem.id).toBeDefined();
    expect(await componentRows(comboItem.id)).toEqual([
      {
        product_id: menu.pollo,
        product_name: 'Pollo a la brasa',
        quantity: 1,
        portion: 'quarter',
        cut: 'leg',
        breast_eighths: 0,
        leg_eighths: 2,
      },
      {
        product_id: menu.incaKola,
        product_name: 'Inca Kola 1L',
        quantity: 1,
        portion: null,
        cut: null,
        breast_eighths: 0,
        leg_eighths: 0,
      },
    ]);
    expect(mostrito.order.totalCents).toBe(1200 + 2200);
  });

  it('AC-06: el ítem con nota y cremas copia sus precios y suma al total', async () => {
    const juan = await createUser('items.juan', 'Juan');
    const actor = { userId: juan.id, roles: juan.roles };
    const menu = await seedMenu();
    const { order: p } = await orderOnTable('Mesa 3', juan.id);

    const result = await service.sendItems(
      p.id,
      {
        items: [
          {
            productId: menu.pollo,
            portion: 'quarter',
            cut: 'breast',
            quantity: 2,
            notes: 'sin ensalada',
            sauces: [{ productId: menu.aji }, { productId: menu.ocopa, quantity: 2 }],
          },
        ],
      },
      'k-cremas',
      actor,
    );
    const item = at<OrderItem>(result.order.items, 0);
    // 2 cuartos-pecho = 4 octavos de pecho; las cremas copian su precio de carta.
    expect(item).toMatchObject({
      quantity: 2,
      priceCents: 1500,
      notes: 'sin ensalada',
      breastEighths: 4,
      legEighths: 0,
      sauces: [
        { productId: menu.aji, productName: 'Aj\u00ED', quantity: 1, priceCents: 0 },
        { productId: menu.ocopa, productName: 'Ocopa', quantity: 2, priceCents: 300 },
      ],
    });
    // totalCents = 2×1500 + 0 + 2×300 (RN-010-10).
    expect(result.order.totalCents).toBe(3600);
    expect(await sauceRows(item.id)).toEqual([
      { product_id: menu.aji, product_name: 'Aj\u00ED', quantity: 1, price_cents: 0 },
      { product_id: menu.ocopa, product_name: 'Ocopa', quantity: 2, price_cents: 300 },
    ]);
  });

  it('AC-06: el componente de pollo del combo admite otra parte vía components', async () => {
    const juan = await createUser('items.juan', 'Juan');
    const actor = { userId: juan.id, roles: juan.roles };
    const menu = await seedMenu();
    const { order: p } = await orderOnTable('Mesa 3', juan.id);

    const result = await service.sendItems(
      p.id,
      {
        items: [
          {
            productId: menu.mostrito,
            // La misma lista de la carta, pero el cuarto de pollo va de pecho.
            components: [
              { productId: menu.pollo, quantity: 1, portion: 'quarter', cut: 'breast' },
              { productId: menu.incaKola, quantity: 1 },
            ],
          },
        ],
      },
      'k-mostrito-pecho',
      actor,
    );
    const item = at<OrderItem>(result.order.items, 0);
    expect(item).toMatchObject({
      priceCents: 2200,
      breastEighths: 2,
      legEighths: 0,
      components: [
        {
          productId: menu.pollo,
          quantity: 1,
          portion: 'quarter',
          cut: 'breast',
          breastEighths: 2,
          legEighths: 0,
        },
        {
          productId: menu.incaKola,
          quantity: 1,
          portion: null,
          cut: null,
          breastEighths: 0,
          legEighths: 0,
        },
      ],
    });
  });

  it('AC-06: cambiar la carta después del envío no toca lo ya registrado (regla 4)', async () => {
    const juan = await createUser('items.juan', 'Juan');
    const actor = { userId: juan.id, roles: juan.roles };
    const menu = await seedMenu();
    const { order: p } = await orderOnTable('Mesa 3', juan.id);
    await service.sendItems(
      p.id,
      {
        items: [
          { productId: menu.incaKola, quantity: 2 },
          { productId: menu.pollo, portion: 'quarter', cut: 'leg' },
          { productId: menu.mostrito },
        ],
      },
      'k-historial',
      actor,
    );

    // Editar la carta: la fila del cuarto sube a 2000, la gaseosa se desactiva y el
    // combo cambia su componente de pollo a 'eighth'.
    const products = createProductService({ models });
    const portions = createProductPortionService({ models });
    const combos = createComboItemService({ models });
    await portions.replaceProductPortions(menu.pollo, {
      portions: [
        { portion: 'quarter', cut: 'breast', priceCents: 1500 },
        { portion: 'quarter', cut: 'leg', priceCents: 2000 },
        { portion: 'half', priceCents: 2600 },
        { portion: 'whole', priceCents: 4800 },
      ],
    });
    await products.updateProduct(menu.incaKola, { isActive: false });
    await products.updateProduct(menu.pollo, { name: 'Pollo broaster' });
    await combos.replaceComboItems(menu.mostrito, {
      items: [
        { productId: menu.pollo, quantity: 1, portion: 'eighth', cut: 'leg' },
        { productId: menu.incaKola, quantity: 2 },
      ],
    });

    // El pedido releído conserva nombre, categoría y precios copiados (RN-010-01).
    const detail = await orders.getOrder(p.id);
    expect(detail.items).toHaveLength(3);
    expect(detail.items[0]).toMatchObject({
      productName: 'Inca Kola 1L',
      productCategory: 'drink',
      priceCents: 800,
      status: 'sent',
    });
    expect(detail.items[1]).toMatchObject({
      productName: 'Pollo a la brasa',
      priceCents: 1400,
      legEighths: 2,
    });
    expect(detail.items[2]).toMatchObject({
      productName: 'Mostrito',
      priceCents: 2200,
      components: [
        expect.objectContaining({ portion: 'quarter', cut: 'leg', legEighths: 2 }),
        expect.objectContaining({ productName: 'Inca Kola 1L', quantity: 1 }),
      ],
    });
    expect(detail.totalCents).toBe(2 * 800 + 1400 + 2200);
  });

  it('AC-07: los issues por ítem se acumulan en un solo VALIDATION_ERROR sin escribir nada', async () => {
    const juan = await createUser('items.juan', 'Juan');
    const actor = { userId: juan.id, roles: juan.roles };
    await seedMenu();
    const inactivo = await createProductService({ models }).createProduct({
      name: 'Gaseosa vieja',
      category: 'drink',
      priceCents: 500,
    });
    await createProductService({ models }).updateProduct(inactivo.id, { isActive: false });
    const { order: p } = await orderOnTable('Mesa 3', juan.id);

    // Producto inexistente y producto inactivo: un solo 400 con dos issues.
    const error = await service
      .sendItems(
        p.id,
        { items: [{ productId: 999999 }, { productId: inactivo.id }] },
        'k-mal',
        actor,
      )
      .catch((caught: unknown) => caught);
    expect(issuesOf(error)).toEqual([
      { path: 'items.0.productId', message: PRODUCT_NOT_FOUND_MESSAGE },
      { path: 'items.1.productId', message: PRODUCT_INACTIVE_MESSAGE },
    ]);
    // Todo o nada: ni ítems ni comanda ni clave de idempotencia quedaron escritos.
    expect(await itemRows(p.id)).toHaveLength(0);
    expect(await ticketRows(p.id)).toHaveLength(0);
    expect(await keyRows()).toHaveLength(0);
  });

  it('AC-07: presentación, parte y distribución producen sus issues por ítem', async () => {
    const juan = await createUser('items.juan', 'Juan');
    const actor = { userId: juan.id, roles: juan.roles };
    const menu = await seedMenu();
    const { order: p } = await orderOnTable('Mesa 3', juan.id);

    // Chicken con porciones sin portion; portion no ofertada (eighth no está en la
    // carta del pollo); drink con portion; octavos fuera de medio; medio sumando 3.
    const error = await service
      .sendItems(
        p.id,
        {
          items: [
            { productId: menu.pollo },
            { productId: menu.pollo, portion: 'eighth', cut: 'leg' },
            { productId: menu.incaKola, portion: 'quarter', cut: 'leg' },
            {
              productId: menu.pollo,
              portion: 'quarter',
              cut: 'leg',
              breastEighths: 2,
              legEighths: 2,
            },
            { productId: menu.pollo, portion: 'half', breastEighths: 1, legEighths: 2 },
          ],
        },
        'k-mal2',
        actor,
      )
      .catch((caught: unknown) => caught);
    expect(issuesOf(error)).toEqual([
      { path: 'items.0.portion', message: CHICKEN_NEEDS_PORTION_MESSAGE },
      { path: 'items.1.portion', message: PORTION_NOT_IN_MENU_MESSAGE },
      { path: 'items.2.portion', message: NO_PORTION_MESSAGE },
      { path: 'items.3.breastEighths', message: DISTRIBUTION_ONLY_HALF_MESSAGE },
      { path: 'items.4.breastEighths', message: DISTRIBUTION_SUM_MESSAGE },
    ]);
    // El chicken sin porciones con portion es "no lleva presentación ni parte".
    const anticucho = await service
      .sendItems(p.id, { items: [{ productId: menu.anticucho, portion: 'half' }] }, 'k-mal3', actor)
      .catch((caught: unknown) => caught);
    expect(issuesOf(anticucho)).toEqual([{ path: 'items.0.portion', message: NO_PORTION_MESSAGE }]);
    // El medio con un solo octavo declarado también es "debe sumar 4".
    const soloUno = await service
      .sendItems(
        p.id,
        { items: [{ productId: menu.pollo, portion: 'half', breastEighths: 4 }] },
        'k-mal4',
        actor,
      )
      .catch((caught: unknown) => caught);
    expect(issuesOf(soloUno)).toEqual([
      { path: 'items.0.breastEighths', message: DISTRIBUTION_SUM_MESSAGE },
    ]);
    expect(await itemRows(p.id)).toHaveLength(0);
    expect(await ticketRows(p.id)).toHaveLength(0);
  });

  it('AC-07: components fuera de combo o distintos de la carta producen su issue', async () => {
    const juan = await createUser('items.juan', 'Juan');
    const actor = { userId: juan.id, roles: juan.roles };
    const menu = await seedMenu();
    const { order: p } = await orderOnTable('Mesa 3', juan.id);

    // components en un producto que no es combo.
    const noCombo = await service
      .sendItems(
        p.id,
        {
          items: [
            { productId: menu.incaKola, components: [{ productId: menu.pollo, quantity: 1 }] },
          ],
        },
        'k-mal5',
        actor,
      )
      .catch((caught: unknown) => caught);
    expect(issuesOf(noCombo)).toEqual([
      { path: 'items.0.components', message: ONLY_COMBO_COMPONENTS_MESSAGE },
    ]);
    // El combo con una lista que no refleja la carta: falta un componente, otra
    // porción, otra cantidad, otra parte en el componente que no es pollo o un
    // producto distinto — todos el mismo issue.
    const variants = [
      [{ productId: menu.pollo, quantity: 1, portion: 'quarter', cut: 'leg' }],
      [
        { productId: menu.pollo, quantity: 1, portion: 'half' },
        { productId: menu.incaKola, quantity: 1 },
      ],
      [
        { productId: menu.pollo, quantity: 2, portion: 'quarter', cut: 'leg' },
        { productId: menu.incaKola, quantity: 1 },
      ],
      [
        { productId: menu.pollo, quantity: 1, portion: 'quarter', cut: 'leg' },
        { productId: menu.incaKola, quantity: 1, portion: 'quarter', cut: 'breast' },
      ],
      [
        { productId: menu.pollo, quantity: 1, portion: 'quarter', cut: 'leg' },
        { productId: menu.aji, quantity: 1 },
      ],
    ];
    let index = 0;
    for (const components of variants) {
      const error = await service
        .sendItems(
          p.id,
          { items: [{ productId: menu.mostrito, components }] },
          `k-mal6-${index}`,
          actor,
        )
        .catch((caught: unknown) => caught);
      expect(issuesOf(error)).toEqual([
        { path: 'items.0.components', message: COMPONENTS_MISMATCH_MESSAGE },
      ]);
      index += 1;
    }
    // En cambio la lista idéntica a la carta sí pasa (sin resolver nada).
    const ok = await service.sendItems(
      p.id,
      {
        items: [
          {
            productId: menu.mostrito,
            components: [
              { productId: menu.pollo, quantity: 1, portion: 'quarter', cut: 'leg' },
              { productId: menu.incaKola, quantity: 1 },
            ],
          },
        ],
      },
      'k-ok-components',
      actor,
    );
    expect(ok.order.items).toHaveLength(1);
  });

  it('AC-07: las cremas producen sus issues por ítem y por crema', async () => {
    const juan = await createUser('items.juan', 'Juan');
    const actor = { userId: juan.id, roles: juan.roles };
    const menu = await seedMenu();
    const products = createProductService({ models });
    const cremaInactiva = await products.createProduct({
      name: 'Huanca\u00EDna vieja',
      category: 'sauce',
      priceCents: 200,
    });
    await products.updateProduct(cremaInactiva.id, { isActive: false });
    const { order: p } = await orderOnTable('Mesa 3', juan.id);

    // Crema en una bebida; crema inexistente; producto que no es crema; crema
    // inactiva; crema repetida; siete cremas.
    const error = await service
      .sendItems(
        p.id,
        {
          items: [
            { productId: menu.incaKola, sauces: [{ productId: menu.aji }] },
            {
              productId: menu.pollo,
              portion: 'quarter',
              cut: 'leg',
              sauces: [{ productId: 999999 }],
            },
            {
              productId: menu.pollo,
              portion: 'quarter',
              cut: 'leg',
              sauces: [{ productId: menu.incaKola }],
            },
            {
              productId: menu.pollo,
              portion: 'quarter',
              cut: 'leg',
              sauces: [{ productId: cremaInactiva.id }],
            },
            {
              productId: menu.pollo,
              portion: 'quarter',
              cut: 'leg',
              sauces: [{ productId: menu.aji }, { productId: menu.aji }],
            },
          ],
        },
        'k-mal7',
        actor,
      )
      .catch((caught: unknown) => caught);
    expect(issuesOf(error)).toEqual([
      { path: 'items.0.sauces', message: SAUCES_ONLY_FOOD_MESSAGE },
      { path: 'items.1.sauces.0.productId', message: SAUCE_NOT_FOUND_MESSAGE },
      { path: 'items.2.sauces.0.productId', message: NOT_A_SAUCE_MESSAGE },
      { path: 'items.3.sauces.0.productId', message: SAUCE_INACTIVE_MESSAGE },
      { path: 'items.4.sauces', message: SAUCES_DUPLICATED_MESSAGE },
    ]);
    expect(await itemRows(p.id)).toHaveLength(0);
  });

  it('AC-07: una tanda con un buen ítem y tres malos no escribe nada (todo o nada)', async () => {
    const juan = await createUser('items.juan', 'Juan');
    const actor = { userId: juan.id, roles: juan.roles };
    const menu = await seedMenu();
    const { order: p } = await orderOnTable('Mesa 3', juan.id);

    const error = await service
      .sendItems(
        p.id,
        {
          items: [
            { productId: menu.incaKola },
            { productId: 999999 },
            { productId: menu.pollo },
            { productId: menu.incaKola, sauces: [{ productId: menu.aji }] },
          ],
        },
        'k-mixta',
        actor,
      )
      .catch((caught: unknown) => caught);
    const issues = issuesOf(error);
    expect(issues).toEqual([
      { path: 'items.1.productId', message: PRODUCT_NOT_FOUND_MESSAGE },
      { path: 'items.2.portion', message: CHICKEN_NEEDS_PORTION_MESSAGE },
      { path: 'items.3.sauces', message: SAUCES_ONLY_FOOD_MESSAGE },
    ]);
    // El ítem bueno tampoco se escribió: ni ítems ni comanda ni clave.
    expect(await itemRows(p.id)).toHaveLength(0);
    expect(await ticketRows(p.id)).toHaveLength(0);
    expect(await keyRows()).toHaveLength(0);
  });

  it('AC-07: pedido inexistente da ORDER_NOT_FOUND y no abierto da ORDER_NOT_OPEN', async () => {
    const juan = await createUser('items.juan', 'Juan');
    const actor = { userId: juan.id, roles: juan.roles };
    const menu = await seedMenu();
    const { order: p } = await orderOnTable('Mesa 3', juan.id);
    const dueno = await createUser('items.dueno', 'Due\u00F1o', ['admin']);

    await expect(
      service.sendItems(999999, { items: [{ productId: menu.incaKola }] }, 'k-x', actor),
    ).rejects.toMatchObject(ORDER_NOT_FOUND);
    // Pedido cancelado: cualquier envío responde ORDER_NOT_OPEN.
    await orders.cancelOrder(p.id, 'Se fueron sin pedir', { userId: dueno.id, roles: dueno.roles });
    await expect(
      service.sendItems(p.id, { items: [{ productId: menu.incaKola }] }, 'k-x2', actor),
    ).rejects.toMatchObject(ORDER_NOT_OPEN);
  });

  it('AC-07: el tope de 99 ítems no anulados responde ORDER_ITEMS_LIMIT', async () => {
    const juan = await createUser('items.juan', 'Juan');
    const actor = { userId: juan.id, roles: juan.roles };
    const menu = await seedMenu();
    const { order: p } = await orderOnTable('Mesa 3', juan.id);
    const ticketId = await insertTicket(p.id, juan.id);
    // 98 ítems 'sent' sembrados por SQL (el servicio ya no los crea en la prueba).
    for (let index = 0; index < 98; index += 1)
      await insertSentItem(p.id, menu.incaKola, ticketId, juan.id);

    // Un ítem más cabe en el tope (99 activos); el envío que cruza a 100 falla.
    const alLimite = await service.sendItems(
      p.id,
      { items: [{ productId: menu.incaKola }] },
      'k-99',
      actor,
    );
    expect(alLimite.order.totalCents).toBe(99 * 800);
    await expect(
      service.sendItems(p.id, { items: [{ productId: menu.incaKola }] }, 'k-100', actor),
    ).rejects.toMatchObject(ORDER_ITEMS_LIMIT);
    // Los 'voided' no cuentan: anulado uno, vuelve a caber un envío de dos.
    const voidTicket = await insertTicket(p.id, juan.id, 'void');
    await sequelize.query(
      "UPDATE order_items SET status = 'voided', void_ticket_id = $1, voided_at = now(), " +
        "voided_by_user_id = $2, void_reason = 'Error' WHERE id = $3",
      { bind: [voidTicket, juan.id, (await itemRows(p.id))[0]?.id] },
    );
    const trasAnular = await service.sendItems(
      p.id,
      { items: [{ productId: menu.incaKola }, { productId: menu.incaKola }] },
      'k-tras-anular',
      actor,
    );
    expect(trasAnular.order.items.filter((item: OrderItem) => item.status === 'sent')).toHaveLength(
      99,
    );
  });

  it('AC-08: repetir la misma clave y el mismo cuerpo devuelve la respuesta guardada', async () => {
    const juan = await createUser('items.juan', 'Juan');
    const actor = { userId: juan.id, roles: juan.roles };
    const menu = await seedMenu();
    const { order: p } = await orderOnTable('Mesa 3', juan.id);
    const body = { items: [{ productId: menu.incaKola, quantity: 2 }] };

    const first = await service.sendItems(p.id, body, 'k-replay', actor);
    const replay = await service.sendItems(p.id, body, 'k-replay', actor);
    // Misma respuesta byte a byte; la base no duplicó ítems, comandas ni claves.
    expect(replay).toEqual(first);
    expect(replay.order.items).toHaveLength(1);
    expect(await itemRows(p.id)).toHaveLength(1);
    expect(await ticketRows(p.id)).toHaveLength(1);
    expect(await keyRows()).toEqual([{ scope: 'order-items', key: 'k-replay', order_id: p.id }]);
    // La respuesta es la guardada: aunque el pedido cambie, el replay no lo relee.
    const ticketId = await insertTicket(p.id, juan.id);
    await insertSentItem(p.id, menu.incaKola, ticketId, juan.id);
    const replay2 = await service.sendItems(p.id, body, 'k-replay', actor);
    expect(replay2).toEqual(first);
    expect(replay2.order.items).toHaveLength(1);
  });

  it('AC-08: misma clave con otro cuerpo u otro pedido es IDEMPOTENCY_CONFLICT', async () => {
    const juan = await createUser('items.juan', 'Juan');
    const actor = { userId: juan.id, roles: juan.roles };
    const menu = await seedMenu();
    const { order: p1 } = await orderOnTable('Mesa 3', juan.id);
    const { order: p2 } = await orderOnTable('Mesa 4', juan.id);
    const body = { items: [{ productId: menu.incaKola }] };
    await service.sendItems(p1.id, body, 'k-conflicto', actor);

    // Otro cuerpo (cantidad distinta).
    await expect(
      service.sendItems(
        p1.id,
        { items: [{ productId: menu.incaKola, quantity: 2 }] },
        'k-conflicto',
        actor,
      ),
    ).rejects.toMatchObject(IDEMPOTENCY_CONFLICT);
    // Otro producto.
    await expect(
      service.sendItems(p1.id, { items: [{ productId: menu.anticucho }] }, 'k-conflicto', actor),
    ).rejects.toMatchObject(IDEMPOTENCY_CONFLICT);
    // Mismo cuerpo, otro pedido: la (scope, key) ya existe con otro order_id.
    await expect(service.sendItems(p2.id, body, 'k-conflicto', actor)).rejects.toMatchObject(
      IDEMPOTENCY_CONFLICT,
    );
    // La misma clave en OTRO alcance sí es una clave distinta (unicidad por
    // (scope, key), D-010-08): p2 puede usar 'k-conflicto' para su request-void.
    const envioP2 = await service.sendItems(
      p2.id,
      { items: [{ productId: menu.anticucho }] },
      'k-p2',
      actor,
    );
    const itemP2 = envioP2.order.items[0]?.id ?? -1;
    const solicitud = await service.requestVoid(
      p2.id,
      itemP2,
      'Se equivoc\u00F3 el cliente',
      'k-conflicto',
      actor,
    );
    expect(solicitud.order.items[0]).toMatchObject({ status: 'void_requested' });
    // Y otra clave sobre p1 crea una segunda tanda sin conflicto.
    await service.sendItems(p1.id, body, 'k-otra', actor);
    expect(await itemRows(p1.id)).toHaveLength(2);
    // Claves escritas: k-conflicto (envío p1), k-p2 (envío p2), k-conflicto
    // (request-void p2, otro scope) y k-otra (segunda tanda de p1).
    expect(await keyRows()).toHaveLength(4);
  });

  it('AC-08: el primer intento que falla no quema la clave (regla 9)', async () => {
    const juan = await createUser('items.juan', 'Juan');
    const actor = { userId: juan.id, roles: juan.roles };
    const menu = await seedMenu();
    const { order: p } = await orderOnTable('Mesa 3', juan.id);

    await expect(
      service.sendItems(p.id, { items: [{ productId: 999999 }] }, 'k-reintento', actor),
    ).rejects.toMatchObject(VALIDATION);
    // El reintento con la misma clave pero ya corregido funciona como primera vez.
    const ok = await service.sendItems(
      p.id,
      { items: [{ productId: menu.incaKola }] },
      'k-reintento',
      actor,
    );
    expect(ok.order.items).toHaveLength(1);
    expect(await keyRows()).toEqual([{ scope: 'order-items', key: 'k-reintento', order_id: p.id }]);
  });

  it('AC-08/AC-15: dos envíos en paralelo con la misma clave escriben una sola tanda', async () => {
    const juan = await createUser('items.juan', 'Juan');
    const actor = { userId: juan.id, roles: juan.roles };
    const menu = await seedMenu();
    const { order: p } = await orderOnTable('Mesa 3', juan.id);
    const body = { items: [{ productId: menu.incaKola }] };

    // La carrera real: ambos llegan "a la vez". Solo uno escribe; el otro
    // recibe la respuesta ya guardada (replay) o un conflicto de escritura.
    const outcomes = await Promise.allSettled([
      service.sendItems(p.id, body, 'k-carrera', actor),
      service.sendItems(p.id, body, 'k-carrera', actor),
    ]);
    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    // Una sola clave, una sola comanda, un solo ítem: el resultado observable es
    // el de una única tanda (RN-010-09, AC-15).
    expect(await itemRows(p.id)).toHaveLength(1);
    expect(await ticketRows(p.id)).toHaveLength(1);
    expect(await keyRows()).toHaveLength(1);
  });

  it('AC-08: la primera tanda abre con comanda "initial" y las siguientes "additional"', async () => {
    const juan = await createUser('items.juan', 'Juan');
    const actor = { userId: juan.id, roles: juan.roles };
    const menu = await seedMenu();
    const { order: p } = await orderOnTable('Mesa 3', juan.id);

    const first = await service.sendItems(
      p.id,
      { items: [{ productId: menu.mostrito }, { productId: menu.incaKola }] },
      'k-t1',
      actor,
    );
    const second = await service.sendItems(
      p.id,
      { items: [{ productId: menu.incaKola }] },
      'k-t2',
      actor,
    );
    expect(first.ticket.kind).toBe('initial');
    expect(second.ticket.kind).toBe('additional');
    expect(first.ticket.id).not.toBe(second.ticket.id);
    expect(first.ticket.createdAt).toBeTruthy();
    // Las comandas del pedido en orden: initial, additional.
    expect(await ticketRows(p.id)).toEqual([
      { id: first.ticket.id, kind: 'initial' },
      { id: second.ticket.id, kind: 'additional' },
    ]);
    // Dos ítems en una tanda siguen siendo UNA comanda (regla 7).
    expect(await itemRows(p.id)).toHaveLength(3);
    expect(await ticketRows(p.id)).toHaveLength(2);
  });

  it('AC-09: enviar limpia la pre-cuenta y conserva la marca de listo', async () => {
    const juan = await createUser('items.juan', 'Juan');
    const actor = { userId: juan.id, roles: juan.roles };
    const menu = await seedMenu();
    const { order: p } = await orderOnTable('Mesa 3', juan.id);
    // Marcamos pre-cuenta y listo con el servicio de la 009.
    await orders.requestBill(p.id, { userId: juan.id });
    await orders.markReady(p.id, { userId: juan.id });
    const antes = await orderMark(p.id);
    expect(antes.bill_requested_at).not.toBeNull();
    expect(antes.ready_at).not.toBeNull();

    const result = await service.sendItems(
      p.id,
      { items: [{ productId: menu.incaKola }] },
      'k-limpia',
      actor,
    );
    // bill_requested_* quedan en NULL en la respuesta y en la fila; ready_* se conserva.
    expect(result.order.billRequestedAt).toBeNull();
    expect(result.order.readyAt).not.toBeNull();
    const despues = await orderMark(p.id);
    expect(despues.bill_requested_at).toBeNull();
    expect(despues.bill_requested_by_user_id).toBeNull();
    expect(despues.ready_at).not.toBeNull();
    expect(despues.ready_by_user_id).toBe(juan.id);
  });

  it('AC-10: requestVoid marca la solicitud con su triple sin emitir comanda', async () => {
    const juan = await createUser('items.juan', 'Juan');
    const actor = { userId: juan.id, roles: juan.roles };
    const menu = await seedMenu();
    const { order: p } = await orderOnTable('Mesa 3', juan.id);
    const sent = await service.sendItems(
      p.id,
      { items: [{ productId: menu.incaKola }] },
      'k-envio',
      actor,
    );
    const itemId = sent.order.items[0]?.id ?? -1;
    const ticketsAntes = await ticketRows(p.id);
    // Marca de pre-cuenta para verificar que la SOLICITUD no la toca (RN-010-09).
    await orders.requestBill(p.id, { userId: juan.id });

    const result = await service.requestVoid(
      p.id,
      itemId,
      'Se equivoc\u00F3 el cliente',
      'k-r1',
      actor,
    );
    const item = at<OrderItem>(result.order.items, 0);
    expect(result.order.totalCents).toBe(800);
    expect(item).toMatchObject({
      id: itemId,
      status: 'void_requested',
      voidRequestedBy: { id: juan.id, displayName: 'Juan' },
      voidRequestReason: 'Se equivoc\u00F3 el cliente',
      voidedBy: null,
      voidedAt: null,
      voidReason: null,
      voidTicketId: null,
    });
    expect(item.voidRequestedAt).toBeTruthy();
    // Sin comanda nueva ni fila 'void': la solicitud vive solo en el ítem.
    expect(await ticketRows(p.id)).toEqual(ticketsAntes);
    // La fila cruda conserva el triple y el precio sigue contando.
    const fila = at(await itemRows(p.id), 0);
    expect(fila).toMatchObject({
      status: 'void_requested',
      void_requested_by_user_id: juan.id,
      void_request_reason: 'Se equivoc\u00F3 el cliente',
      voided_at: null,
      voided_by_user_id: null,
      void_reason: null,
      void_ticket_id: null,
    });
    expect(fila?.void_requested_at).not.toBeNull();
    // La pre-cuenta sigue puesta: la cuenta aún no cambió.
    const marcas = await orderMark(p.id);
    expect(marcas.bill_requested_at).not.toBeNull();
  });

  it('AC-10: requestVoid es idempotente y rechaza los estados que no permiten solicitud', async () => {
    const juan = await createUser('items.juan', 'Juan');
    const admin = await createUser('items.dueno', 'Due\u00F1o', ['admin']);
    const actor = { userId: juan.id, roles: juan.roles };
    const adminActor = { userId: admin.id, roles: admin.roles };
    const menu = await seedMenu();
    const { order: p } = await orderOnTable('Mesa 3', juan.id);
    const sent = await service.sendItems(
      p.id,
      { items: [{ productId: menu.incaKola }, { productId: menu.anticucho }] },
      'k-envio',
      actor,
    );
    const primero = at<OrderItem>(sent.order.items, 0);
    const segundo = at<OrderItem>(sent.order.items, 1);

    const first = await service.requestVoid(
      p.id,
      primero?.id ?? -1,
      'Se equivoc\u00F3',
      'k-r1',
      actor,
    );
    // Replay exacto con la misma clave: misma respuesta, sin doble solicitud.
    const replay = await service.requestVoid(
      p.id,
      primero?.id ?? -1,
      'Se equivoc\u00F3',
      'k-r1',
      actor,
    );
    expect(replay).toEqual(first);
    expect(await keyRows()).toHaveLength(2); // la del envío + la de la solicitud
    // Misma operación con otra clave sobre 'void_requested' → 409.
    await expect(
      service.requestVoid(p.id, primero?.id ?? -1, 'Se equivoc\u00F3', 'k-r2', actor),
    ).rejects.toMatchObject(ORDER_ITEM_VOID_REQUESTED);
    // Misma clave con OTRO motivo → conflicto de idempotencia (hash distinto).
    await expect(
      service.requestVoid(p.id, primero?.id ?? -1, 'Otro motivo', 'k-r1', actor),
    ).rejects.toMatchObject(IDEMPOTENCY_CONFLICT);
    // Ítem de otro pedido → ORDER_ITEM_NOT_FOUND.
    const { order: q } = await orderOnTable('Mesa 4', juan.id);
    await expect(
      service.requestVoid(q.id, primero?.id ?? -1, 'Motivo', 'k-r3', actor),
    ).rejects.toMatchObject(ORDER_ITEM_NOT_FOUND);
    // Sobre un ítem 'voided' → ORDER_ITEM_ALREADY_VOIDED.
    await service.voidItem(p.id, segundo?.id ?? -1, 'Directo del admin', 'k-v0', adminActor);
    await expect(
      service.requestVoid(p.id, segundo?.id ?? -1, 'Tarde', 'k-r4', actor),
    ).rejects.toMatchObject(ORDER_ITEM_ALREADY_VOIDED);
    // Pedido inexistente y pedido cerrado.
    await expect(
      service.requestVoid(999999, primero?.id ?? -1, 'Motivo', 'k-r5', actor),
    ).rejects.toMatchObject(ORDER_NOT_FOUND);
    await service.voidItem(p.id, primero?.id ?? -1, 'Aprueba', 'k-v1', adminActor);
    await orders.cancelOrder(p.id, 'Error de prueba', { userId: admin.id, roles: admin.roles });
    await expect(
      service.requestVoid(p.id, primero?.id ?? -1, 'Motivo', 'k-r6', actor),
    ).rejects.toMatchObject(ORDER_NOT_OPEN);
    // La respuesta guardada se responde aunque el pedido ya no esté abierto.
    const replayTarde = await service.requestVoid(
      p.id,
      primero?.id ?? -1,
      'Se equivoc\u00F3',
      'k-r1',
      actor,
    );
    expect(replayTarde).toEqual(first);
  });

  it('AC-10: voidItem aprueba la solicitud conservando ambos actores y emite comanda void', async () => {
    const juan = await createUser('items.juan', 'Juan');
    const admin = await createUser('items.dueno', 'Due\u00F1o', ['admin']);
    const actor = { userId: juan.id, roles: juan.roles };
    const adminActor = { userId: admin.id, roles: admin.roles };
    const menu = await seedMenu();
    const { order: p } = await orderOnTable('Mesa 3', juan.id);
    const sent = await service.sendItems(
      p.id,
      { items: [{ productId: menu.incaKola }, { productId: menu.anticucho }] },
      'k-envio',
      actor,
    );
    const itemId = sent.order.items[0]?.id ?? -1;
    await service.requestVoid(p.id, itemId, 'Se equivoc\u00F3 el cliente', 'k-r1', actor);
    // Marca de pre-cuenta: la aprobación SÍ la limpia (RN-010-09).
    await orders.requestBill(p.id, { userId: juan.id });
    await orders.markReady(p.id, { userId: juan.id });

    const result = await service.voidItem(
      p.id,
      itemId,
      'Confirmado, error del cliente',
      'k-v1',
      adminActor,
    );
    // Respuesta { order, ticket }: la comanda 'void' lista solo el ítem anulado.
    expect(result.ticket).toMatchObject({
      orderId: p.id,
      kind: 'void',
      createdBy: { id: admin.id, displayName: 'Due\u00F1o' },
    });
    expect(result.ticket.items.map((item: OrderItem) => item.id)).toEqual([itemId]);
    const item = at<OrderItem>(result.order.items, 0);
    expect(item).toMatchObject({
      id: itemId,
      status: 'voided',
      voidedBy: { id: admin.id, displayName: 'Due\u00F1o' },
      voidReason: 'Confirmado, error del cliente',
      voidTicketId: result.ticket.id,
      // Auditoría de los dos actores: el triple de la solicitud se conserva.
      voidRequestedBy: { id: juan.id, displayName: 'Juan' },
      voidRequestReason: 'Se equivoc\u00F3 el cliente',
    });
    expect(item.voidedAt).toBeTruthy();
    expect(item.voidRequestedAt).toBeTruthy();
    // totalCents ya no cobra el anulado; el ítem sigue en order.items.
    expect(result.order.items).toHaveLength(2);
    expect(result.order.totalCents).toBe(1200);
    // La pre-cuenta se limpió porque la cuenta cambió; el listo se conserva.
    expect(result.order.billRequestedAt).toBeNull();
    expect(result.order.readyAt).not.toBeNull();
    const marcas = await orderMark(p.id);
    expect(marcas.bill_requested_at).toBeNull();
    expect(marcas.ready_at).not.toBeNull();
    // La fila cruda: los 4 de anulación puestos y el triple conservado.
    const fila = at(await itemRows(p.id), 0);
    expect(fila).toMatchObject({
      status: 'voided',
      void_ticket_id: result.ticket.id,
      voided_by_user_id: admin.id,
      void_reason: 'Confirmado, error del cliente',
      void_requested_by_user_id: juan.id,
      void_request_reason: 'Se equivoc\u00F3 el cliente',
    });
  });

  it('AC-10: voidItem directo sobre sent deja el triple de solicitud en NULL', async () => {
    const juan = await createUser('items.juan', 'Juan');
    const admin = await createUser('items.dueno', 'Due\u00F1o', ['admin']);
    const actor = { userId: juan.id, roles: juan.roles };
    const adminActor = { userId: admin.id, roles: admin.roles };
    const menu = await seedMenu();
    const { order: p } = await orderOnTable('Mesa 3', juan.id);
    const sent = await service.sendItems(
      p.id,
      { items: [{ productId: menu.incaKola }] },
      'k-envio',
      actor,
    );
    const itemId = sent.order.items[0]?.id ?? -1;

    const result = await service.voidItem(
      p.id,
      itemId,
      'Se cay\u00F3 el plato',
      'k-v1',
      adminActor,
    );
    const item = at<OrderItem>(result.order.items, 0);
    expect(item).toMatchObject({
      status: 'voided',
      voidedBy: { id: admin.id },
      voidReason: 'Se cay\u00F3 el plato',
      voidTicketId: result.ticket.id,
      // Anulación directa: nunca hubo solicitud, el triple queda en NULL.
      voidRequestedBy: null,
      voidRequestedAt: null,
      voidRequestReason: null,
    });
    expect(result.ticket.kind).toBe('void');
    // Anular el último ítem deja totalCents en 0 pero la fila sigue ahí.
    expect(result.order.totalCents).toBe(0);
    expect(result.order.items).toHaveLength(1);
    // Re-anular con otra clave → ALREADY_VOIDED; con la misma → replay guardado.
    await expect(
      service.voidItem(p.id, itemId, 'Otra vez', 'k-v2', adminActor),
    ).rejects.toMatchObject(ORDER_ITEM_ALREADY_VOIDED);
    const replay = await service.voidItem(
      p.id,
      itemId,
      'Se cay\u00F3 el plato',
      'k-v1',
      adminActor,
    );
    expect(replay).toEqual(result);
    // itemId que no pertenece al pedido, pedido inexistente o no abierto.
    const { order: q } = await orderOnTable('Mesa 4', juan.id);
    await expect(
      service.voidItem(q.id, itemId, 'Motivo', 'k-v3', adminActor),
    ).rejects.toMatchObject(ORDER_ITEM_NOT_FOUND);
    await expect(
      service.voidItem(999999, itemId, 'Motivo', 'k-v4', adminActor),
    ).rejects.toMatchObject(ORDER_NOT_FOUND);
  });

  it('AC-10: rejectVoid devuelve el ítem a sent limpiando el triple, sin comanda', async () => {
    const juan = await createUser('items.juan', 'Juan');
    const admin = await createUser('items.dueno', 'Due\u00F1o', ['admin']);
    const actor = { userId: juan.id, roles: juan.roles };
    const adminActor = { userId: admin.id, roles: admin.roles };
    const menu = await seedMenu();
    const { order: p } = await orderOnTable('Mesa 3', juan.id);
    const sent = await service.sendItems(
      p.id,
      { items: [{ productId: menu.incaKola }] },
      'k-envio',
      actor,
    );
    const itemId = sent.order.items[0]?.id ?? -1;
    await service.requestVoid(p.id, itemId, 'Se equivoc\u00F3 el cliente', 'k-r1', actor);
    const ticketsAntes = await ticketRows(p.id);
    // Pre-cuenta puesta: el rechazo NO la toca (la cuenta no cambió).
    await orders.requestBill(p.id, { userId: juan.id });

    const result = await service.rejectVoid(p.id, itemId, 'k-x1', adminActor);
    const item = at<OrderItem>(result.order.items, 0);
    // No trae comanda en la respuesta: el rechazo no emite void.
    expect(result).not.toHaveProperty('ticket');
    expect(item).toMatchObject({
      id: itemId,
      status: 'sent',
      voidRequestedBy: null,
      voidRequestedAt: null,
      voidRequestReason: null,
      voidedBy: null,
      voidedAt: null,
      voidReason: null,
      voidTicketId: null,
    });
    expect(result.order.totalCents).toBe(800);
    expect(await ticketRows(p.id)).toEqual(ticketsAntes);
    const marcas = await orderMark(p.id);
    expect(marcas.bill_requested_at).not.toBeNull();
    // La fila cruda vuelve a 'sent' con los 7 campos en NULL.
    const fila = at(await itemRows(p.id), 0);
    expect(fila).toMatchObject({
      status: 'sent',
      void_requested_at: null,
      void_requested_by_user_id: null,
      void_request_reason: null,
      voided_at: null,
      voided_by_user_id: null,
      void_reason: null,
      void_ticket_id: null,
    });
    // Replay con la misma clave y guardias de estado.
    const replay = await service.rejectVoid(p.id, itemId, 'k-x1', adminActor);
    expect(replay).toEqual(result);
    await expect(service.rejectVoid(p.id, itemId, 'k-x2', adminActor)).rejects.toMatchObject(
      ORDER_ITEM_NOT_REQUESTED,
    );
    // Tras el rechazo el mozo puede volver a solicitar (triple nuevo).
    const nueva = await service.requestVoid(p.id, itemId, 'Ahora s\u00ED se anula', 'k-r2', actor);
    expect(nueva.order.items[0]).toMatchObject({
      status: 'void_requested',
      voidRequestReason: 'Ahora s\u00ED se anula',
    });
    // Sobre 'voided' → ALREADY_VOIDED; itemId ajeno → NOT_FOUND.
    await service.voidItem(p.id, itemId, 'Aprueba', 'k-v1', adminActor);
    await expect(service.rejectVoid(p.id, itemId, 'k-x3', adminActor)).rejects.toMatchObject(
      ORDER_ITEM_ALREADY_VOIDED,
    );
    const { order: q } = await orderOnTable('Mesa 4', juan.id);
    await expect(service.rejectVoid(q.id, itemId, 'k-x4', adminActor)).rejects.toMatchObject(
      ORDER_ITEM_NOT_FOUND,
    );
  });

  it('AC-11: listOrderTickets devuelve { tickets } ordenadas con sus ítems, cremas y componentes', async () => {
    const juan = await createUser('items.juan', 'Juan');
    const admin = await createUser('items.dueno', 'Due\u00F1o', ['admin']);
    const actor = { userId: juan.id, roles: juan.roles };
    const adminActor = { userId: admin.id, roles: admin.roles };
    const menu = await seedMenu();
    const { order: p } = await orderOnTable('Mesa 3', juan.id);
    const t1 = await service.sendItems(
      p.id,
      {
        items: [
          {
            productId: menu.pollo,
            portion: 'quarter',
            cut: 'leg',
            sauces: [{ productId: menu.aji }],
          },
          { productId: menu.mostrito },
        ],
      },
      'k-t1',
      actor,
    );
    const t2 = await service.sendItems(
      p.id,
      { items: [{ productId: menu.incaKola }] },
      'k-t2',
      actor,
    );
    const anulado = t2.order.items[2]?.id ?? -1;
    const t3 = await service.voidItem(p.id, anulado, 'Error del cliente', 'k-v1', adminActor);

    const result = await service.listOrderTickets(p.id);
    expect(Object.keys(result)).toEqual(['tickets']);
    expect(result.tickets.map((ticket: KitchenTicket) => ticket.kind)).toEqual([
      'initial',
      'additional',
      'void',
    ]);
    expect(result.tickets.map((ticket: KitchenTicket) => ticket.id)).toEqual([
      t1.ticket.id,
      t2.ticket.id,
      t3.ticket.id,
    ]);
    // La initial lista sus dos ítems con cremas y componentes embebidos.
    const initial = at<KitchenTicket>(result.tickets, 0);
    expect(initial.items).toHaveLength(2);
    expect(initial.items[0]).toMatchObject({
      productName: 'Pollo a la brasa',
      sauces: [{ productId: menu.aji, productName: 'Aj\u00ED', quantity: 1, priceCents: 0 }],
      components: [],
    });
    expect(initial.items[1]).toMatchObject({
      productName: 'Mostrito',
      components: [
        expect.objectContaining({
          productName: 'Pollo a la brasa',
          portion: 'quarter',
          cut: 'leg',
        }),
        expect.objectContaining({ productName: 'Inca Kola 1L', portion: null, cut: null }),
      ],
    });
    expect(initial).toMatchObject({
      orderId: p.id,
      createdBy: { id: juan.id, displayName: 'Juan' },
    });
    // La void lista al único ítem anulado, con su auditoría.
    const voidTicket = at<KitchenTicket>(result.tickets, 2);
    expect(voidTicket.items.map((item: OrderItem) => item.id)).toEqual([anulado]);
    expect(voidTicket.items[0]).toMatchObject({ status: 'voided', voidTicketId: voidTicket.id });
    expect(voidTicket.createdBy.id).toBe(admin.id);
    // Pedido inexistente → ORDER_NOT_FOUND.
    await expect(service.listOrderTickets(999999)).rejects.toMatchObject(ORDER_NOT_FOUND);
    // Un pedido sin envíos devuelve la lista vacía.
    const { order: vacio } = await orderOnTable('Mesa 8', juan.id);
    expect(await service.listOrderTickets(vacio.id)).toEqual({ tickets: [] });
  });

  it('AC-11: getOrder devuelve items completos (sent y voided por id) y el totalCents', async () => {
    const juan = await createUser('items.juan', 'Juan');
    const admin = await createUser('items.dueno', 'Due\u00F1o', ['admin']);
    const actor = { userId: juan.id, roles: juan.roles };
    const adminActor = { userId: admin.id, roles: admin.roles };
    const menu = await seedMenu();
    const { order: p } = await orderOnTable('Mesa 3', juan.id);
    const t1 = await service.sendItems(
      p.id,
      {
        items: [
          { productId: menu.pollo, portion: 'quarter', cut: 'breast', quantity: 2 },
          { productId: menu.incaKola },
          { productId: menu.ocopa },
        ],
      },
      'k-t1',
      actor,
    );
    await service.voidItem(p.id, t1.order.items[1]?.id ?? -1, 'Error', 'k-v1', adminActor);

    const detail = await orders.getOrder(p.id);
    // Los tres ítems ordenados por id, incluido el anulado al final de su posición.
    expect(detail.items.map((item: OrderItem) => item.id)).toEqual(
      t1.order.items.map((item: OrderItem) => item.id),
    );
    expect(detail.items.map((item: OrderItem) => item.status)).toEqual(['sent', 'voided', 'sent']);
    // totalCents = 2×1500 (cuartos pecho) + 300 (ocopa) — el voided no cuenta.
    expect(detail.totalCents).toBe(3300);
    // Un pedido sin ítems devuelve la lista vacía y total 0.
    const { order: vacio } = await orderOnTable('Mesa 8', juan.id);
    const vacioDetail = await orders.getOrder(vacio.id);
    expect(vacioDetail.items).toEqual([]);
    expect(vacioDetail.totalCents).toBe(0);
  });
});
