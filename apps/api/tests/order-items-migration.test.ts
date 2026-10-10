// AC-03, AC-04 y AC-05. Spec 010 — archivo nuevo: va EN ROJO hasta que T-08 escriba
// la migración 20261011120000-create-order-items.ts y el migrador la recoja.
import { Sequelize } from 'sequelize';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrateDown, migrateUp } from '../src/db/migrator.ts';
import {
  connectTestDatabase,
  closeTestDatabase,
  resetMigrationTables,
  tableExists,
} from './helpers/test-database.ts';

const MIGRATIONS = [
  '20261008120000-create-users.ts',
  '20261008120100-create-sessions.ts',
  '20261008180000-create-products.ts',
  '20261009120000-create-product-portions.ts',
  '20261009180000-create-combo-items.ts',
  '20261010120000-create-tables-orders.ts',
  '20261011120000-create-order-items.ts',
];

let sequelize: Sequelize;

/** Fila genérica de un SELECT. */
async function rows<T>(sql: string, bind?: unknown[]): Promise<T[]> {
  const [result] = await sequelize.query(sql, { bind });
  return result as T[];
}

/** Columnas de una tabla: nombre, tipo, si admite NULL y su default. */
async function columnsOf(table: string) {
  return rows<{
    column_name: string;
    data_type: string;
    is_nullable: 'YES' | 'NO';
    column_default: string | null;
    character_maximum_length: number | null;
  }>(
    'SELECT column_name, data_type, is_nullable, column_default, character_maximum_length ' +
      'FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position',
    [table],
  );
}

/** Nombre -> fila de columna. */
async function columnsMap(table: string) {
  const columns = await columnsOf(table);
  return new Map(columns.map((column) => [column.column_name, column]));
}

/** Columnas de la clave primaria. */
async function primaryKeyColumns(table: string): Promise<string[]> {
  const result = await rows<{ column_name: string }>(
    'SELECT kcu.column_name FROM information_schema.table_constraints tc ' +
      'JOIN information_schema.key_column_usage kcu ' +
      'ON tc.constraint_name = kcu.constraint_name AND tc.table_name = kcu.table_name ' +
      "WHERE tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY' ORDER BY kcu.ordinal_position",
    [table],
  );
  return result.map((row) => row.column_name);
}

/** Restricciones de una tabla: nombre, tipo (c check, u unique, f foreign key). */
async function constraintsOf(table: string) {
  return rows<{ conname: string; contype: string }>(
    'SELECT conname, contype FROM pg_constraint WHERE conrelid = $1::regclass ORDER BY conname',
    [table],
  );
}

/** Índices de una tabla: nombre y definición. */
async function indexesOf(table: string) {
  return rows<{ indexname: string; indexdef: string }>(
    'SELECT indexname, indexdef FROM pg_indexes WHERE tablename = $1 ORDER BY indexname',
    [table],
  );
}

/** Nombre del constraint violado por un error de Sequelize/Postgres. */
function violatedConstraint(error: unknown): string | undefined {
  const e = error as { parent?: { constraint?: string }; original?: { constraint?: string } };
  return e.parent?.constraint ?? e.original?.constraint;
}

/** Inserta un usuario mínimo y devuelve su id. */
async function insertUser(): Promise<number> {
  const result = await rows<{ id: number }>(
    'INSERT INTO users (username, display_name, pin_hash, roles, created_at, updated_at) ' +
      "VALUES ('mozo', 'Juan', $1, '{waiter}', now(), now()) RETURNING id",
    ['x'.repeat(60)],
  );
  return result[0]!.id;
}

/** Inserta una mesa mínima y devuelve su id. */
async function insertTable(name: string): Promise<number> {
  const result = await rows<{ id: number }>(
    'INSERT INTO tables (name, is_active, created_at, updated_at) ' +
      'VALUES ($1, true, now(), now()) RETURNING id',
    [name],
  );
  return result[0]!.id;
}

/** Inserta un pedido abierto y devuelve su id. */
async function insertOrder(openedByUserId: number): Promise<number> {
  const result = await rows<{ id: number }>(
    'INSERT INTO orders (status, opened_by_user_id, opened_at, created_at, updated_at) ' +
      "VALUES ('open', $1, now(), now(), now()) RETURNING id",
    [openedByUserId],
  );
  return result[0]!.id;
}

/** Inserta un producto mínimo de la carta y devuelve su id. */
async function insertProduct(): Promise<number> {
  const result = await rows<{ id: number }>(
    'INSERT INTO products (name, category, price_cents, is_active, created_at, updated_at) ' +
      "VALUES ('Inca Kola 1L', 'drink', 800, true, now(), now()) RETURNING id",
  );
  return result[0]!.id;
}

/** Inserta una comanda mínima y devuelve su id. */
async function insertTicket(orderId: number, userId: number, kind = 'initial'): Promise<number> {
  const result = await rows<{ id: number }>(
    'INSERT INTO kitchen_tickets (order_id, kind, created_by_user_id, created_at, updated_at) ' +
      'VALUES ($1, $2, $3, now(), now()) RETURNING id',
    [orderId, kind, userId],
  );
  return result[0]!.id;
}

/** Columnas obligatorias del INSERT mínimo de un ítem 'sent'. */
async function insertItem(
  orderId: number,
  productId: number,
  ticketId: number,
  userId: number,
): Promise<number> {
  const result = await rows<{ id: number }>(
    'INSERT INTO order_items (order_id, product_id, product_name, product_category, quantity, ' +
      'price_cents, status, kitchen_ticket_id, created_by_user_id, created_at, updated_at) ' +
      "VALUES ($1, $2, 'Inca Kola 1L', 'drink', 1, 800, 'sent', $3, $4, now(), now()) RETURNING id",
    [orderId, productId, ticketId, userId],
  );
  return result[0]!.id;
}

beforeAll(async () => {
  sequelize = await connectTestDatabase();
});
afterAll(async () => {
  await closeTestDatabase(sequelize);
});
beforeEach(async () => {
  await resetMigrationTables(sequelize);
  await migrateUp(sequelize);
});

describe('010: migración de ítems del pedido sobre polleria_test', () => {
  it('AC-03: kitchen_tickets existe con sus columnas, PK, FKs, CHECK e índice', async () => {
    expect(await tableExists(sequelize, 'kitchen_tickets')).toBe(true);
    const columns = await columnsMap('kitchen_tickets');
    expect([...columns.keys()]).toEqual([
      'id',
      'order_id',
      'kind',
      'created_by_user_id',
      'created_at',
      'updated_at',
    ]);
    expect(columns.get('order_id')?.is_nullable).toBe('NO');
    expect(columns.get('kind')).toMatchObject({
      data_type: 'character varying',
      character_maximum_length: 12,
      is_nullable: 'NO',
    });
    expect(columns.get('created_by_user_id')?.is_nullable).toBe('NO');
    for (const stamp of ['created_at', 'updated_at'])
      expect(columns.get(stamp)).toMatchObject({
        data_type: 'timestamp with time zone',
        is_nullable: 'NO',
      });
    expect(await primaryKeyColumns('kitchen_tickets')).toEqual(['id']);
    expect((await constraintsOf('kitchen_tickets')).filter((c) => c.contype === 'f')).toHaveLength(
      2,
    ); // order_id → orders, created_by_user_id → users
    expect(await indexesOf('kitchen_tickets')).toEqual(
      expect.arrayContaining([expect.objectContaining({ indexname: 'kitchen_tickets_order_id' })]),
    );
  });
  it('AC-03: kitchen_tickets rechaza un kind fuera de lista y un pedido inexistente', async () => {
    const userId = await insertUser();
    const orderId = await insertOrder(userId);
    await expect(
      sequelize.query(
        'INSERT INTO kitchen_tickets (order_id, kind, created_by_user_id, created_at, updated_at) ' +
          "VALUES ($1, 'comanda', $2, now(), now())",
        { bind: [orderId, userId] },
      ),
    ).rejects.toSatisfy((e: unknown) => violatedConstraint(e) === 'kitchen_tickets_kind_allowed');
    await expect(
      sequelize.query(
        'INSERT INTO kitchen_tickets (order_id, kind, created_by_user_id, created_at, updated_at) ' +
          "VALUES (999999, 'initial', $1, now(), now())",
        { bind: [userId] },
      ),
    ).rejects.toThrow();
    await expect(
      sequelize.query(
        'INSERT INTO kitchen_tickets (order_id, kind, created_by_user_id, created_at, updated_at) ' +
          "VALUES ($1, 'initial', 999999, now(), now())",
        { bind: [orderId] },
      ),
    ).rejects.toThrow();
  });

  it('AC-03: order_items existe con sus columnas, tipos, defaults y PK', async () => {
    expect(await tableExists(sequelize, 'order_items')).toBe(true);
    const columns = await columnsMap('order_items');
    expect([...columns.keys()]).toEqual([
      'id',
      'order_id',
      'product_id',
      'product_name',
      'product_category',
      'quantity',
      'price_cents',
      'portion',
      'cut',
      'breast_eighths',
      'leg_eighths',
      'notes',
      'status',
      'kitchen_ticket_id',
      'void_ticket_id',
      'void_requested_at',
      'void_requested_by_user_id',
      'void_request_reason',
      'voided_at',
      'voided_by_user_id',
      'void_reason',
      'ordered_at_table_id',
      'created_by_user_id',
      'created_at',
      'updated_at',
    ]);
    for (const notNull of [
      'order_id',
      'product_id',
      'quantity',
      'price_cents',
      'status',
      'kitchen_ticket_id',
      'created_by_user_id',
      'created_at',
      'updated_at',
    ])
      expect(columns.get(notNull)?.is_nullable).toBe('NO');
    for (const nullable of [
      'portion',
      'cut',
      'notes',
      'void_ticket_id',
      'void_requested_at',
      'void_requested_by_user_id',
      'void_request_reason',
      'voided_at',
      'voided_by_user_id',
      'void_reason',
      'ordered_at_table_id',
    ])
      expect(columns.get(nullable)?.is_nullable).toBe('YES');
    expect(columns.get('product_name')).toMatchObject({
      data_type: 'character varying',
      character_maximum_length: 60,
    });
    expect(columns.get('product_category')).toMatchObject({
      data_type: 'character varying',
      character_maximum_length: 16,
    });
    expect(columns.get('portion')?.character_maximum_length).toBe(8);
    expect(columns.get('cut')?.character_maximum_length).toBe(8);
    expect(columns.get('status')).toMatchObject({
      character_maximum_length: 16,
      column_default: "'sent'::character varying",
    });
    expect(columns.get('breast_eighths')?.column_default).toBe('0');
    expect(columns.get('leg_eighths')?.column_default).toBe('0');
    expect(columns.get('notes')?.character_maximum_length).toBe(200);
    expect(columns.get('void_request_reason')?.character_maximum_length).toBe(200);
    expect(columns.get('void_reason')?.character_maximum_length).toBe(200);
    for (const stamp of ['void_requested_at', 'voided_at'])
      expect(columns.get(stamp)?.data_type).toBe('timestamp with time zone');
    expect(await primaryKeyColumns('order_items')).toEqual(['id']);
  });
  it('AC-03: order_items tiene sus siete FK y sus cuatro índices', async () => {
    const constraints = await constraintsOf('order_items');
    expect(constraints.filter((c) => c.contype === 'f')).toHaveLength(7);
    // orders, products, kitchen_tickets (x2), users (x2), tables
    const indexNames = (await indexesOf('order_items')).map((i) => i.indexname);
    for (const name of [
      'order_items_order_id',
      'order_items_product_id',
      'order_items_kitchen_ticket_id',
      'order_items_ordered_at_table_id',
    ])
      expect(indexNames).toContain(name);
  });
  it('AC-03: un INSERT válido pasa y trae los defaults', async () => {
    const userId = await insertUser();
    const orderId = await insertOrder(userId);
    const productId = await insertProduct();
    const ticketId = await insertTicket(orderId, userId);
    const itemId = await insertItem(orderId, productId, ticketId, userId);
    const [item] = await rows<{ status: string; breast_eighths: number; leg_eighths: number }>(
      'SELECT status, breast_eighths, leg_eighths FROM order_items WHERE id = $1',
      [itemId],
    );
    expect(item).toMatchObject({ status: 'sent', breast_eighths: 0, leg_eighths: 0 });
    // FKs: producto, pedido, comanda, usuario y mesa inexistentes fallan.
    for (const bad of [
      { column: 'order_id', value: '999999' },
      { column: 'product_id', value: '999999' },
      { column: 'kitchen_ticket_id', value: '999999' },
      { column: 'created_by_user_id', value: '999999' },
      { column: 'void_ticket_id', value: '999999' },
      { column: 'ordered_at_table_id', value: '999999' },
    ]) {
      await expect(
        sequelize.query(
          'INSERT INTO order_items (order_id, product_id, product_name, product_category, ' +
            'quantity, price_cents, status, kitchen_ticket_id, created_by_user_id, ' +
            `${bad.column}, created_at, updated_at) VALUES ($1, $2, 'x', 'drink', 1, 1, ` +
            `'sent', $3, $4, ${bad.value}, now(), now())`,
          {
            bind: [
              bad.column === 'order_id' ? 1 : orderId,
              bad.column === 'product_id' ? 1 : productId,
              bad.column === 'kitchen_ticket_id' ? 1 : ticketId,
              bad.column === 'created_by_user_id' ? 1 : userId,
            ],
          },
        ),
      ).rejects.toThrow();
    }
    // ordered_at_table_id con una mesa real pasa (queda anotada la mesa de origen).
    const tableId = await insertTable('Mesa 9');
    const [withTable] = await rows<{ id: number }>(
      'INSERT INTO order_items (order_id, product_id, product_name, product_category, quantity, ' +
        'price_cents, status, kitchen_ticket_id, created_by_user_id, ordered_at_table_id, ' +
        "created_at, updated_at) VALUES ($1, $2, 'Inca Kola 1L', 'drink', 1, 800, 'sent', $3, $4, " +
        '$5, now(), now()) RETURNING id',
      [orderId, productId, ticketId, userId, tableId],
    );
    expect(withTable?.id).toBeTypeOf('number');
    const [conMesa] = await rows<{ ordered_at_table_id: number | null }>(
      'SELECT ordered_at_table_id FROM order_items WHERE ordered_at_table_id = $1',
      [tableId],
    );
    expect(conMesa?.ordered_at_table_id).toBe(tableId);
  });
  it.each([0, 100, -1])('AC-03: quantity %s cae por order_items_quantity_range', async (qty) => {
    const userId = await insertUser();
    const orderId = await insertOrder(userId);
    const productId = await insertProduct();
    const ticketId = await insertTicket(orderId, userId);
    await expect(
      sequelize.query(
        'INSERT INTO order_items (order_id, product_id, product_name, product_category, ' +
          'quantity, price_cents, status, kitchen_ticket_id, created_by_user_id, ' +
          "created_at, updated_at) VALUES ($1, $2, 'x', 'drink', $3, 1, 'sent', $4, $5, now(), now())",
        { bind: [orderId, productId, qty, ticketId, userId] },
      ),
    ).rejects.toSatisfy((e: unknown) => violatedConstraint(e) === 'order_items_quantity_range');
  });
  it.each([-1, 1000000])(
    'AC-03: price_cents %s cae por order_items_price_cents_range',
    async (price) => {
      const userId = await insertUser();
      const orderId = await insertOrder(userId);
      const productId = await insertProduct();
      const ticketId = await insertTicket(orderId, userId);
      await expect(
        sequelize.query(
          'INSERT INTO order_items (order_id, product_id, product_name, product_category, ' +
            'quantity, price_cents, status, kitchen_ticket_id, created_by_user_id, ' +
            "created_at, updated_at) VALUES ($1, $2, 'x', 'drink', 1, $3, 'sent', $4, $5, now(), now())",
          { bind: [orderId, productId, price, ticketId, userId] },
        ),
      ).rejects.toSatisfy(
        (e: unknown) => violatedConstraint(e) === 'order_items_price_cents_range',
      );
    },
  );
  it('AC-03: la correspondencia portion/cut es la de la spec', async () => {
    const userId = await insertUser();
    const orderId = await insertOrder(userId);
    const productId = await insertProduct();
    const ticketId = await insertTicket(orderId, userId);
    const insert = (portion: string | null, cut: string | null) =>
      sequelize.query(
        'INSERT INTO order_items (order_id, product_id, product_name, product_category, ' +
          'quantity, price_cents, portion, cut, status, kitchen_ticket_id, ' +
          'created_by_user_id, created_at, updated_at) VALUES ($1, $2, ' +
          "'Pollo', 'chicken', 1, 1400, $3, $4, 'sent', $5, $6, now(), now())",
        { bind: [orderId, productId, portion, cut, ticketId, userId] },
      );
    await expect(insert('quarter', 'leg')).resolves.toBeDefined();
    await expect(insert('eighth', 'breast')).resolves.toBeDefined();
    await expect(insert('half', null)).resolves.toBeDefined();
    await expect(insert('whole', null)).resolves.toBeDefined();
    await expect(insert(null, null)).resolves.toBeDefined();
    for (const [portion, cut] of [
      ['quarter', null],
      ['eighth', null],
      ['half', 'leg'],
      ['whole', 'breast'],
      [null, 'leg'],
      ['cuarto', 'leg'],
      ['quarter', 'ala'],
    ])
      await expect(insert(portion, cut)).rejects.toSatisfy(
        (e: unknown) => violatedConstraint(e) === 'order_items_portion_cut',
      );
  });
  it('AC-03: order_items_void_consistent deja sent limpio, void_requested con triple y voided con cuádruple', async () => {
    const userId = await insertUser();
    const orderId = await insertOrder(userId);
    const productId = await insertProduct();
    const ticketId = await insertTicket(orderId, userId);
    const voidTicketId = await insertTicket(orderId, userId, 'void');
    const insert = (status: string, extraColumns: string, extraValues: string) =>
      sequelize.query(
        'INSERT INTO order_items (order_id, product_id, product_name, product_category, ' +
          'quantity, price_cents, status, kitchen_ticket_id, created_by_user_id, ' +
          'created_at, updated_at' +
          extraColumns +
          ") VALUES ($1, $2, 'x', 'drink', 1, 1, $3, $4, $5, now(), now()" +
          extraValues +
          ')',
        { bind: [orderId, productId, status, ticketId, userId] },
      );
    // 'sent' con cualquier campo de anulación puesto falla.
    await expect(insert('sent', ', voided_at', ', now()')).rejects.toSatisfy(
      (e: unknown) => violatedConstraint(e) === 'order_items_void_consistent',
    );
    await expect(insert('sent', ', void_request_reason', ", 'motivo'")).rejects.toSatisfy(
      (e: unknown) => violatedConstraint(e) === 'order_items_void_consistent',
    );
    // 'void_requested' exige el triple y los 4 de anulación NULL.
    await expect(
      sequelize.query(
        'INSERT INTO order_items (order_id, product_id, product_name, product_category, ' +
          'quantity, price_cents, status, kitchen_ticket_id, created_by_user_id, ' +
          'created_at, updated_at, void_requested_at, void_requested_by_user_id, ' +
          "void_request_reason) VALUES ($1, $2, 'x', 'drink', 1, 1, 'void_requested', $3, $4, " +
          "now(), now(), now(), $5, 'motivo')",
        { bind: [orderId, productId, ticketId, userId, userId] },
      ),
    ).resolves.toBeDefined();
    await expect(insert('void_requested', '', '')).rejects.toSatisfy(
      (e: unknown) => violatedConstraint(e) === 'order_items_void_consistent',
    );
    await expect(
      sequelize.query(
        'INSERT INTO order_items (order_id, product_id, product_name, product_category, ' +
          'quantity, price_cents, status, kitchen_ticket_id, created_by_user_id, ' +
          'created_at, updated_at, void_requested_at, void_requested_by_user_id, ' +
          "void_request_reason, voided_at) VALUES ($1, $2, 'x', 'drink', 1, 1, 'void_requested', " +
          "$3, $4, now(), now(), now(), $5, 'motivo', now())",
        { bind: [orderId, productId, ticketId, userId, userId] },
      ),
    ).rejects.toSatisfy((e: unknown) => violatedConstraint(e) === 'order_items_void_consistent');
    // 'voided' exige los 4 de anulación; el triple puede quedar puesto o NULL.
    await expect(
      sequelize.query(
        'INSERT INTO order_items (order_id, product_id, product_name, product_category, ' +
          'quantity, price_cents, status, kitchen_ticket_id, void_ticket_id, ' +
          'created_by_user_id, created_at, updated_at, voided_at, voided_by_user_id, ' +
          "void_reason) VALUES ($1, $2, 'x', 'drink', 1, 1, 'voided', $3, $6, $4, now(), now(), " +
          "now(), $5, 'aprobado')",
        { bind: [orderId, productId, ticketId, userId, userId, voidTicketId] },
      ),
    ).resolves.toBeDefined();
    await expect(
      sequelize.query(
        'INSERT INTO order_items (order_id, product_id, product_name, product_category, ' +
          'quantity, price_cents, status, kitchen_ticket_id, void_ticket_id, ' +
          'created_by_user_id, created_at, updated_at, voided_at, voided_by_user_id, ' +
          'void_reason, void_requested_at, void_requested_by_user_id, void_request_reason) ' +
          "VALUES ($1, $2, 'x', 'drink', 1, 1, 'voided', $3, $6, $4, now(), now(), now(), $5, " +
          "'aprobado', now(), $5, 'pedido')",
        { bind: [orderId, productId, ticketId, userId, userId, voidTicketId] },
      ),
    ).resolves.toBeDefined();
    await expect(
      sequelize.query(
        'INSERT INTO order_items (order_id, product_id, product_name, product_category, ' +
          'quantity, price_cents, status, kitchen_ticket_id, created_by_user_id, ' +
          'created_at, updated_at, voided_at, voided_by_user_id, void_reason) ' +
          "VALUES ($1, $2, 'x', 'drink', 1, 1, 'voided', $3, $4, now(), now(), now(), $5, 'x')",
        { bind: [orderId, productId, ticketId, userId, userId] },
      ),
    ).rejects.toSatisfy((e: unknown) => violatedConstraint(e) === 'order_items_void_consistent');
    // Un estado fuera de lista cae por su propio CHECK.
    await expect(insert('anulado', '', '')).rejects.toSatisfy(
      (e: unknown) => violatedConstraint(e) === 'order_items_status_allowed',
    );
  });
  it.each([-1])('AC-03: breast_eighths/leg_eighths %s cae por su CHECK', async (eighths) => {
    const userId = await insertUser();
    const orderId = await insertOrder(userId);
    const productId = await insertProduct();
    const ticketId = await insertTicket(orderId, userId);
    for (const column of ['breast_eighths', 'leg_eighths']) {
      await expect(
        sequelize.query(
          'INSERT INTO order_items (order_id, product_id, product_name, product_category, ' +
            `quantity, price_cents, status, kitchen_ticket_id, created_by_user_id, ${column}, ` +
            "created_at, updated_at) VALUES ($1, $2, 'x', 'drink', 1, 1, 'sent', $3, $4, $5, " +
            'now(), now())',
          { bind: [orderId, productId, ticketId, userId, eighths] },
        ),
      ).rejects.toThrow();
    }
  });

  it('AC-04: order_item_components y order_item_sauces existen con sus reglas', async () => {
    expect(await tableExists(sequelize, 'order_item_components')).toBe(true);
    expect(await tableExists(sequelize, 'order_item_sauces')).toBe(true);
    const components = await columnsMap('order_item_components');
    expect([...components.keys()]).toEqual([
      'id',
      'order_item_id',
      'product_id',
      'product_name',
      'quantity',
      'portion',
      'cut',
      'breast_eighths',
      'leg_eighths',
      'created_at',
      'updated_at',
    ]);
    const sauces = await columnsMap('order_item_sauces');
    expect([...sauces.keys()]).toEqual([
      'id',
      'order_item_id',
      'product_id',
      'product_name',
      'quantity',
      'price_cents',
      'created_at',
      'updated_at',
    ]);
    expect(await primaryKeyColumns('order_item_components')).toEqual(['id']);
    expect(await primaryKeyColumns('order_item_sauces')).toEqual(['id']);
    for (const table of ['order_item_components', 'order_item_sauces'])
      expect((await constraintsOf(table)).filter((c) => c.contype === 'f')).toHaveLength(2);
    expect(await indexesOf('order_item_components')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ indexname: 'order_item_components_order_item_id' }),
      ]),
    );
    expect(await indexesOf('order_item_sauces')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ indexname: 'order_item_sauces_order_item_id' }),
      ]),
    );
  });
  it('AC-04: INSERTs en hijas respetan quantity, FK y portion/cut', async () => {
    const userId = await insertUser();
    const orderId = await insertOrder(userId);
    const productId = await insertProduct();
    const ticketId = await insertTicket(orderId, userId);
    const itemId = await insertItem(orderId, productId, ticketId, userId);
    await expect(
      sequelize.query(
        'INSERT INTO order_item_components (order_item_id, product_id, product_name, quantity, ' +
          'portion, cut, created_at, updated_at) VALUES ($1, $2, $3, 1, $4, $5, now(), now())',
        { bind: [itemId, productId, 'Pollo a la brasa', 'quarter', 'leg'] },
      ),
    ).resolves.toBeDefined();
    await expect(
      sequelize.query(
        'INSERT INTO order_item_sauces (order_item_id, product_id, product_name, quantity, ' +
          "price_cents, created_at, updated_at) VALUES ($1, $2, 'Ají', 2, 0, now(), now())",
        { bind: [itemId, productId] },
      ),
    ).resolves.toBeDefined();
    // FKs a ítem y producto inexistentes fallan; quantity fuera de rango falla.
    for (const [table, quantity] of [
      ['order_item_components', 0],
      ['order_item_sauces', 100],
    ] as const) {
      await expect(
        sequelize.query(
          `INSERT INTO ${table} (order_item_id, product_id, product_name, quantity, ` +
            'created_at, updated_at) VALUES ($1, $2, $3, $4, now(), now())',
          { bind: [itemId, productId, 'x', quantity] },
        ),
      ).rejects.toThrow();
      await expect(
        sequelize.query(
          `INSERT INTO ${table} (order_item_id, product_id, product_name, quantity, ` +
            'created_at, updated_at) VALUES (999999, $1, $2, 1, now(), now())',
          { bind: [productId, 'x'] },
        ),
      ).rejects.toThrow();
    }
    // El mismo CHECK de correspondencia se repite en components.
    await expect(
      sequelize.query(
        'INSERT INTO order_item_components (order_item_id, product_id, product_name, quantity, ' +
          'portion, cut, created_at, updated_at) VALUES ($1, $2, $3, 1, $4, NULL, now(), now())',
        { bind: [itemId, productId, 'x', 'quarter'] },
      ),
    ).rejects.toThrow();
    // price_cents de la crema fuera de rango falla.
    await expect(
      sequelize.query(
        'INSERT INTO order_item_sauces (order_item_id, product_id, product_name, quantity, ' +
          'price_cents, created_at, updated_at) VALUES ($1, $2, $3, 1, -1, now(), now())',
        { bind: [itemId, productId, 'x'] },
      ),
    ).rejects.toThrow();
  });
  it('AC-04: idempotency_keys existe con su unicidad (scope, key)', async () => {
    expect(await tableExists(sequelize, 'idempotency_keys')).toBe(true);
    const columns = await columnsMap('idempotency_keys');
    expect([...columns.keys()]).toEqual([
      'id',
      'scope',
      'key',
      'order_id',
      'request_hash',
      'response_status',
      'response_body',
      'created_at',
    ]);
    expect(columns.get('key')?.character_maximum_length).toBe(128);
    expect(columns.get('scope')?.character_maximum_length).toBe(32);
    expect(columns.get('response_status')?.data_type).toBe('smallint');
    expect(columns.get('response_body')?.data_type).toBe('jsonb');
    expect(await primaryKeyColumns('idempotency_keys')).toEqual(['id']);
    const userId = await insertUser();
    const orderId = await insertOrder(userId);
    const insert = (scope: string, key: string, order: number) =>
      sequelize.query(
        'INSERT INTO idempotency_keys (scope, key, order_id, request_hash, response_status, ' +
          'response_body, created_at) VALUES ($1, $2, $3, $4, 201, $5, now())',
        {
          bind: [scope, key, order, 'a'.repeat(64), '{"order":{"id":1}}'],
        },
      );
    await expect(insert('order-items', 'k-1', orderId)).resolves.toBeDefined();
    await expect(insert('order-items', 'k-1', orderId)).rejects.toSatisfy(
      (e: unknown) => violatedConstraint(e) === 'idempotency_keys_scope_key_unique',
    );
    // La misma clave en otro scope pasa; la misma scope con otra clave también.
    await expect(insert('order-item-voids', 'k-1', orderId)).resolves.toBeDefined();
    await expect(insert('order-items', 'k-2', orderId)).resolves.toBeDefined();
    // order_id inexistente falla por FK.
    await expect(insert('order-items', 'k-3', 999999)).rejects.toThrow();
  });

  it('AC-05: migrateUp crea las cinco tablas en orden; migrateDown y re-up funcionan', async () => {
    await resetMigrationTables(sequelize);
    expect(await migrateUp(sequelize)).toEqual(MIGRATIONS);
    for (const table of [
      'kitchen_tickets',
      'order_items',
      'order_item_components',
      'order_item_sauces',
      'idempotency_keys',
    ])
      expect(await tableExists(sequelize, table)).toBe(true);
    // Un solo down revierte solo la migración nueva.
    expect(await migrateDown(sequelize)).toEqual(['20261011120000-create-order-items.ts']);
    for (const table of [
      'kitchen_tickets',
      'order_items',
      'order_item_components',
      'order_item_sauces',
      'idempotency_keys',
    ])
      expect(await tableExists(sequelize, table)).toBe(false);
    expect(await tableExists(sequelize, 'orders')).toBe(true);
    // Re-up la vuelve a crear con todas sus restricciones (AC-03/AC-04).
    expect(await migrateUp(sequelize)).toEqual(['20261011120000-create-order-items.ts']);
    const userId = await insertUser();
    const orderId = await insertOrder(userId);
    const productId = await insertProduct();
    const ticketId = await insertTicket(orderId, userId);
    await expect(insertItem(orderId, productId, ticketId, userId)).resolves.toBeTypeOf('number');
  });
});
