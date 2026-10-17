import type { KitchenTicket, UserRole } from '@polleria/shared';
import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize';
import { defineModels } from '../../src/models/index.ts';
import { createBcryptPinHasher } from '../../src/services/auth/pin-hasher.ts';
import { createUserService } from '../../src/services/users/user.service.ts';
import { createProductService } from '../../src/services/products/product.service.ts';
import { createProductPortionService } from '../../src/services/products/product-portion.service.ts';
import { createOrderService } from '../../src/services/orders/order.service.ts';
import { createTableService } from '../../src/services/tables/table.service.ts';

export const PRINT_TIME = new Date('2026-10-12T23:30:45.000Z');
export const PRINT_MIGRATION = '20261012150000-create-kitchen-ticket-prints.ts';
export const WAITER_ROLES: UserRole[] = ['waiter'];
export const ADMIN_ROLES: UserRole[] = ['admin'];

export async function sqlRows<T extends object>(
  sequelize: Sequelize,
  sql: string,
  replacements?: Record<string, unknown>,
): Promise<T[]> {
  return sequelize.query<T>(sql, { type: QueryTypes.SELECT, replacements });
}
export async function countRows(
  sequelize: Sequelize,
  table:
    | 'kitchen_ticket_prints'
    | 'kitchen_ticket_print_attempts'
    | 'kitchen_tickets'
    | 'idempotency_keys'
    | 'order_items',
) {
  const rows = await sqlRows<{ count: number }>(
    sequelize,
    `SELECT count(*)::int AS count FROM ${table}`,
  );
  return rows[0]!.count;
}

export async function seedPrinting(sequelize: Sequelize) {
  const models = defineModels(sequelize);
  const pinHasher = createBcryptPinHasher({ cost: 4 });
  const users = createUserService({ models, pinHasher });
  const waiter = await users.createUser({
    username: 'juan',
    displayName: 'Juan',
    pin: '2468',
    roles: ['waiter'],
  });
  const admin = await users.createUser({
    username: 'luz',
    displayName: 'Doña Luz',
    pin: '2468',
    roles: ['admin'],
  });
  const cashier = await users.createUser({
    username: 'ana',
    displayName: 'Ana',
    pin: '2468',
    roles: ['cashier'],
  });
  const kitchen = await users.createUser({
    username: 'beto',
    displayName: 'Beto',
    pin: '2468',
    roles: ['kitchen'],
  });
  const products = createProductService({ models });
  const drink = await products.createProduct({
    name: 'Inca Kola',
    category: 'drink',
    priceCents: 800,
  });
  const chicken = await products.createProduct({
    name: 'Pollo a la brasa',
    category: 'chicken',
    priceCents: 4800,
  });
  await createProductPortionService({ models }).replaceProductPortions(chicken.id, {
    portions: [{ portion: 'half', cut: null, priceCents: 2600 }],
  });
  const tables = createTableService({ models });
  const table = await tables.createTable({ name: 'Mesa 3' });
  const destination = await tables.createTable({ name: 'Mesa 4' });
  const orders = createOrderService({ models });
  const order = await orders.openOrder(table.id, { userId: waiter.id });
  return {
    models,
    pinHasher,
    waiter,
    admin,
    cashier,
    kitchen,
    products,
    drink,
    chicken,
    tables,
    table,
    destination,
    orders,
    order,
  };
}

export function snapshotOf(ticket: KitchenTicket, tableId: number, tableName = 'Mesa 3') {
  return {
    version: 1 as const,
    ticket,
    orderIdAtIssue: ticket.orderId,
    tablesAtIssue: [{ id: tableId, name: tableName }],
  };
}
