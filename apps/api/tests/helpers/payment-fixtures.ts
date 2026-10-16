import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize';

let fixtureSequence = 0;

async function rows<T extends object>(
  sequelize: Sequelize,
  sql: string,
  bind?: unknown[],
): Promise<T[]> {
  return sequelize.query<T>(sql, { type: QueryTypes.SELECT, bind });
}

/**
 * Crea un pedido abierto con N mesas apuntando a él y un ítem con precio copiado.
 * Las llamadas deben ocurrir después de aplicar migraciones y limpiar polleria_test.
 */
export async function createPaymentOrderFixture(
  sequelize: Sequelize,
  userId: number,
  options: { tableCount?: number; itemPriceCents?: number; itemQuantity?: number } = {},
) {
  const fixtureId = ++fixtureSequence;
  const tableCount = options.tableCount ?? 2;
  const itemPriceCents = options.itemPriceCents ?? 2100;
  const itemQuantity = options.itemQuantity ?? 1;
  const tables: number[] = [];
  for (let index = 0; index < tableCount; index += 1) {
    const tableRows = await rows<{ id: number }>(
      sequelize,
      'INSERT INTO tables (name, is_active, created_at, updated_at) ' +
        'VALUES ($1, true, now(), now()) RETURNING id',
      [`Mesa pago ${fixtureId}-${index + 1}`],
    );
    tables.push(tableRows[0]!.id);
  }
  const orderRows = await rows<{ id: number }>(
    sequelize,
    'INSERT INTO orders (status, opened_by_user_id, opened_at, created_at, updated_at) ' +
      "VALUES ('open', $1, now(), now(), now()) RETURNING id",
    [userId],
  );
  const orderId = orderRows[0]!.id;
  await sequelize.query('UPDATE tables SET current_order_id = $1 WHERE id = ANY($2::int[])', {
    bind: [orderId, tables],
  });
  const productRows = await rows<{ id: number }>(
    sequelize,
    'INSERT INTO products (name, category, price_cents, is_active, created_at, updated_at) ' +
      "VALUES ($1, 'drink', $2, true, now(), now()) RETURNING id",
    [`Gaseosa congelada ${fixtureId}`, Math.min(itemPriceCents, 99999)],
  );
  const productId = productRows[0]!.id;
  const ticketRows = await rows<{ id: number }>(
    sequelize,
    'INSERT INTO kitchen_tickets (order_id, kind, created_by_user_id, created_at, updated_at) ' +
      "VALUES ($1, 'initial', $2, now(), now()) RETURNING id",
    [orderId, userId],
  );
  const itemRows = await rows<{ id: number }>(
    sequelize,
    'INSERT INTO order_items (order_id, product_id, product_name, product_category, quantity, ' +
      'price_cents, status, kitchen_ticket_id, created_by_user_id, created_at, updated_at) ' +
      "VALUES ($1,$2,$3,'drink',$4,$5,'sent',$6,$7,now(),now()) RETURNING id",
    [
      orderId,
      productId,
      `Gaseosa congelada ${fixtureId}`,
      itemQuantity,
      itemPriceCents,
      ticketRows[0]!.id,
      userId,
    ],
  );
  return { orderId, userId, tables, productId, itemId: itemRows[0]!.id };
}
