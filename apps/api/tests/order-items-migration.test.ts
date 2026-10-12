// AC-03, AC-04 y AC-05. Spec 010 — archivo nuevo: va EN ROJO hasta que T-08 cree
// la migración 20261011120000-create-order-items.ts y el migrador la recoja.
import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrateDown, migrateUp } from '../src/db/migrator.ts';
import {
  closeTestDatabase,
  connectTestDatabase,
  resetMigrationTables,
  tableExists,
} from './helpers/test-database.ts';

// La lista completa del migrador: la de la 010 es la séptima y última (AC-05).
const MIGRATIONS = [
  '20261008120000-create-users.ts',
  '20261008120100-create-sessions.ts',
  '20261008180000-create-products.ts',
  '20261009120000-create-product-portions.ts',
  '20261009180000-create-combo-items.ts',
  '20261010120000-create-tables-orders.ts',
  '20261011120000-create-order-items.ts',
];
const ORDER_ITEMS_MIGRATION = '20261011120000-create-order-items.ts';

// Marcas de tiempo fijas para las columnas de auditoría del ciclo de anulación.
const T0 = '2026-10-11T15:00:00.000Z';
const T1 = '2026-10-11T16:00:00.000Z';
const T2 = '2026-10-11T17:00:00.000Z';

/**
 * Nombre del CHECK, la unicidad o la FK que reporta el driver pg en un error (mismo
 * criterio que en las pruebas de la 005, la 006, la 007 y la 009).
 */
function violatedConstraint(error: unknown): unknown {
  const fields = error as {
    parent?: { constraint?: unknown };
    original?: { constraint?: unknown };
  };
  return fields.parent?.constraint ?? fields.original?.constraint;
}

describe('010: tablas de ítems, comandas e idempotencia sobre polleria_test', () => {
  let sequelize: Sequelize;
  beforeAll(async () => {
    sequelize = await connectTestDatabase();
  });
  beforeEach(async () => {
    // Partir de cero y aplicar las migraciones reales: las cinco tablas quedan creadas.
    await resetMigrationTables(sequelize);
    await migrateUp(sequelize);
  });
  afterAll(async () => {
    await closeTestDatabase(sequelize);
  });
  const rows = <T extends object>(sql: string, bind?: (string | number | null)[]) =>
    sequelize.query<T>(sql, { type: QueryTypes.SELECT, bind });
  const columnsOf = (table: string) =>
    rows<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      character_maximum_length: number | null;
      column_default: string | null;
      is_identity: string;
    }>(
      'SELECT column_name, data_type, is_nullable, character_maximum_length, column_default, is_identity FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position',
      [table],
    );
  /** Mapa columna → fila de information_schema para las aserciones por nombre. */
  const columnMap = async (table: string) => {
    const map = new Map<
      string,
      {
        data_type: string;
        is_nullable: string;
        character_maximum_length: number | null;
        column_default: string | null;
        is_identity: string;
      }
    >();
    for (const column of await columnsOf(table)) map.set(column.column_name, column);
    return map;
  };
  const primaryKeyColumns = (table: string) =>
    rows<{ column_name: string }>(
      `SELECT kcu.column_name FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name AND tc.constraint_schema = kcu.constraint_schema
       WHERE tc.table_schema = current_schema() AND tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'`,
      [table],
    );
  const constraintsOf = (table: string) =>
    rows<{ conname: string; contype: string }>(
      `SELECT conname, contype FROM pg_constraint
       WHERE conrelid = $1::regclass ORDER BY conname`,
      [table],
    );
  const foreignKeyTargets = (table: string) =>
    rows<{ target: string }>(
      `SELECT confrelid::regclass::text AS target FROM pg_constraint
       WHERE conrelid = $1::regclass AND contype = 'f'`,
      [table],
    );
  const indexesOf = (table: string) =>
    rows<{ indexname: string; indexdef: string }>(
      'SELECT indexname, indexdef FROM pg_indexes WHERE tablename = $1 AND schemaname = current_schema()',
      [table],
    );
  const insertUser = (username: string, displayName = 'Juan') =>
    sequelize
      .query<{ id: number }>(
        "INSERT INTO users (username, display_name, pin_hash, roles) VALUES ($1, $2, $3, '{waiter}') RETURNING id",
        { type: QueryTypes.SELECT, bind: [username, displayName, 'x'.repeat(60)] },
      )
      .then((result) => result[0]?.id ?? -1);
  const insertProduct = (id: number, name: string, category = 'dish', priceCents = 100) =>
    sequelize.query(
      'INSERT INTO products (id, name, category, price_cents) VALUES ($1, $2, $3, $4)',
      { bind: [id, name, category, priceCents] },
    );
  const insertTable = (name: string) =>
    sequelize
      .query<{ id: number }>(
        'INSERT INTO "tables" (name, is_active) VALUES ($1, true) RETURNING id',
        { type: QueryTypes.SELECT, bind: [name] },
      )
      .then((result) => result[0]?.id ?? -1);
  const insertOrder = (openedBy: number) =>
    sequelize
      .query<{ id: number }>(
        'INSERT INTO "orders" (status, opened_by_user_id, opened_at) VALUES ($1, $2, $3) RETURNING id',
        { type: QueryTypes.SELECT, bind: ['open', openedBy, T0] },
      )
      .then((result) => result[0]?.id ?? -1);
  /** INSERT en kitchen_tickets con sus tres NOT NULL y los timestamps por defecto. */
  const insertTicket = (orderId: number, createdBy: number, kind = 'initial') =>
    sequelize
      .query<{ id: number }>(
        'INSERT INTO kitchen_tickets (order_id, kind, created_by_user_id) ' +
          'VALUES ($1, $2, $3) RETURNING id',
        { type: QueryTypes.SELECT, bind: [orderId, kind, createdBy] },
      )
      .then((result) => result[0]?.id ?? -1);
  /** INSERT en order_items con los campos del ciclo de anulación sobreescribibles. */
  const insertItem = (
    orderId: number,
    productId: number,
    ticketId: number,
    createdBy: number,
    fields: {
      productName?: string;
      productCategory?: string;
      quantity?: number;
      priceCents?: number;
      portion?: string | null;
      cut?: string | null;
      breastEighths?: number;
      legEighths?: number;
      notes?: string | null;
      status?: string;
      voidTicketId?: number | null;
      voidRequestedAt?: string | null;
      voidRequestedBy?: number | null;
      voidRequestReason?: string | null;
      voidedAt?: string | null;
      voidedBy?: number | null;
      voidReason?: string | null;
      orderedAtTableId?: number | null;
    } = {},
  ) =>
    sequelize
      .query<{ id: number }>(
        'INSERT INTO order_items (order_id, product_id, product_name, product_category, ' +
          'quantity, price_cents, portion, cut, breast_eighths, leg_eighths, notes, status, ' +
          'kitchen_ticket_id, void_ticket_id, void_requested_at, void_requested_by_user_id, ' +
          'void_request_reason, voided_at, voided_by_user_id, void_reason, ' +
          'ordered_at_table_id, created_by_user_id) ' +
          'VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, ' +
          '$17, $18, $19, $20, $21, $22) RETURNING id',
        {
          type: QueryTypes.SELECT,
          bind: [
            orderId,
            productId,
            fields.productName ?? 'Inca Kola 1L',
            fields.productCategory ?? 'drink',
            fields.quantity ?? 1,
            fields.priceCents ?? 800,
            fields.portion ?? null,
            fields.cut ?? null,
            fields.breastEighths ?? 0,
            fields.legEighths ?? 0,
            fields.notes ?? null,
            fields.status ?? 'sent',
            ticketId,
            fields.voidTicketId ?? null,
            fields.voidRequestedAt ?? null,
            fields.voidRequestedBy ?? null,
            fields.voidRequestReason ?? null,
            fields.voidedAt ?? null,
            fields.voidedBy ?? null,
            fields.voidReason ?? null,
            fields.orderedAtTableId ?? null,
            createdBy,
          ],
        },
      )
      .then((result) => result[0]?.id ?? -1);
  /** Campos que 'voided' exige puestos según order_items_void_consistent. */
  const voidedFields = (ticketId: number, by: number) => ({
    status: 'voided',
    voidTicketId: ticketId,
    voidedAt: T2,
    voidedBy: by,
    voidReason: 'Se equivocó el cliente',
  });
  /** Campos que 'void_requested' exige puestos según order_items_void_consistent. */
  const requestedFields = (by: number) => ({
    status: 'void_requested',
    voidRequestedAt: T1,
    voidRequestedBy: by,
    voidRequestReason: 'Se equivocó el cliente',
  });
  const insertComponent = (
    orderItemId: number,
    productId: number,
    fields: {
      productName?: string;
      quantity?: number;
      portion?: string | null;
      cut?: string | null;
      breastEighths?: number;
      legEighths?: number;
    } = {},
  ) =>
    sequelize
      .query<{ id: number }>(
        'INSERT INTO order_item_components (order_item_id, product_id, product_name, ' +
          'quantity, portion, cut, breast_eighths, leg_eighths) ' +
          'VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
        {
          type: QueryTypes.SELECT,
          bind: [
            orderItemId,
            productId,
            fields.productName ?? 'Inca Kola 1L',
            fields.quantity ?? 1,
            fields.portion ?? null,
            fields.cut ?? null,
            fields.breastEighths ?? 0,
            fields.legEighths ?? 0,
          ],
        },
      )
      .then((result) => result[0]?.id ?? -1);
  const insertSauce = (
    orderItemId: number,
    productId: number,
    fields: { productName?: string; quantity?: number; priceCents?: number } = {},
  ) =>
    sequelize
      .query<{ id: number }>(
        'INSERT INTO order_item_sauces (order_item_id, product_id, product_name, ' +
          'quantity, price_cents) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        {
          type: QueryTypes.SELECT,
          bind: [
            orderItemId,
            productId,
            fields.productName ?? 'Ají',
            fields.quantity ?? 1,
            fields.priceCents ?? 0,
          ],
        },
      )
      .then((result) => result[0]?.id ?? -1);
  const insertKey = (
    scope: string,
    key: string,
    orderId: number,
    requestHash = 'a'.repeat(64),
    responseStatus = 201,
    responseBody = '{"order":{},"ticket":{}}',
  ) =>
    sequelize
      .query<{ id: number }>(
        'INSERT INTO idempotency_keys (scope, key, order_id, request_hash, ' +
          'response_status, response_body) VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING id',
        {
          type: QueryTypes.SELECT,
          bind: [scope, key, orderId, requestHash, responseStatus, responseBody],
        },
      )
      .then((result) => result[0]?.id ?? -1);

  it('AC-03: kitchen_tickets existe con sus columnas, PK, CHECK, índice y FK', async () => {
    const columns = await columnMap('kitchen_tickets');
    expect([...columns.keys()]).toEqual([
      'id',
      'order_id',
      'kind',
      'created_by_user_id',
      'created_at',
      'updated_at',
    ]);
    // id es la clave primaria autoincremental (SERIAL o IDENTITY), como el resto.
    const idColumn = columns.get('id');
    expect(idColumn).toMatchObject({ data_type: 'integer', is_nullable: 'NO' });
    expect(
      idColumn?.is_identity === 'YES' || /^nextval\(/.test(idColumn?.column_default ?? ''),
    ).toBe(true);
    expect(columns.get('order_id')).toMatchObject({
      data_type: 'integer',
      is_nullable: 'NO',
    });
    expect(columns.get('kind')).toMatchObject({
      data_type: 'character varying',
      character_maximum_length: 12,
      is_nullable: 'NO',
    });
    expect(columns.get('created_by_user_id')).toMatchObject({
      data_type: 'integer',
      is_nullable: 'NO',
    });
    for (const stamp of ['created_at', 'updated_at'])
      expect(columns.get(stamp)).toMatchObject({
        data_type: 'timestamp with time zone',
        is_nullable: 'NO',
      });
    expect(await primaryKeyColumns('kitchen_tickets')).toEqual([{ column_name: 'id' }]);
    // La FK de la comanda apunta a orders y la del autor a users.
    expect((await foreignKeyTargets('kitchen_tickets')).map((row) => row.target).sort()).toEqual([
      'orders',
      'users',
    ]);
    // El CHECK de kind lleva su nombre de la spec.
    expect(await constraintsOf('kitchen_tickets')).toContainEqual({
      conname: 'kitchen_tickets_kind_allowed',
      contype: 'c',
    });
    expect((await indexesOf('kitchen_tickets')).map((row) => row.indexname)).toContain(
      'kitchen_tickets_order_id',
    );
  });

  it('AC-03: kitchen_tickets acepta los tres kind y rechaza el resto y las FK rotas', async () => {
    const userId = await insertUser('mozo.migra');
    const orderId = await insertOrder(userId);
    for (const kind of ['initial', 'additional', 'void'])
      expect(await insertTicket(orderId, userId, kind)).toBeGreaterThan(0);
    for (const kind of ['comanda', 'VOID', '']) {
      const error = await insertTicket(orderId, userId, kind).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(Error);
      expect(violatedConstraint(error)).toBe('kitchen_tickets_kind_allowed');
    }
    // order_id y created_by_user_id inexistentes fallan por su FK.
    await expect(insertTicket(999999, userId)).rejects.toBeInstanceOf(Error);
    await expect(insertTicket(orderId, 999999)).rejects.toBeInstanceOf(Error);
  });

  it('AC-03: order_items existe con sus columnas, defaults y tipos', async () => {
    const columns = await columnMap('order_items');
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
    expect(columns.get('product_name')).toMatchObject({
      data_type: 'character varying',
      character_maximum_length: 60,
      is_nullable: 'NO',
    });
    expect(columns.get('product_category')).toMatchObject({
      data_type: 'character varying',
      character_maximum_length: 16,
      is_nullable: 'NO',
    });
    for (const name of ['portion', 'cut'])
      expect(columns.get(name)).toMatchObject({
        data_type: 'character varying',
        character_maximum_length: 8,
        is_nullable: 'YES',
      });
    for (const name of ['breast_eighths', 'leg_eighths'])
      expect(columns.get(name)).toMatchObject({
        data_type: 'integer',
        is_nullable: 'NO',
        column_default: '0',
      });
    expect(columns.get('notes')).toMatchObject({
      data_type: 'character varying',
      character_maximum_length: 200,
      is_nullable: 'YES',
    });
    expect(columns.get('status')).toMatchObject({
      data_type: 'character varying',
      character_maximum_length: 16,
      is_nullable: 'NO',
      column_default: "'sent'::character varying",
    });
    // Las columnas del ciclo de anulación son todas NULL-able; las de autor not null.
    for (const name of [
      'void_ticket_id',
      'void_requested_at',
      'void_requested_by_user_id',
      'void_request_reason',
      'voided_at',
      'voided_by_user_id',
      'void_reason',
      'ordered_at_table_id',
    ])
      expect(columns.get(name)?.is_nullable).toBe('YES');
    expect(await primaryKeyColumns('order_items')).toEqual([{ column_name: 'id' }]);
  });

  it('AC-03: order_items declara sus CHECK nombrados, sus cuatro índices y sus ocho FK', async () => {
    const constraints = await constraintsOf('order_items');
    for (const name of [
      'order_items_status_allowed',
      'order_items_quantity_range',
      'order_items_price_cents_range',
      'order_items_portion_cut',
      'order_items_void_consistent',
    ])
      expect(constraints).toContainEqual({ conname: name, contype: 'c' });
    // Ocho FK: orders, products, kitchen_tickets ×2, users ×3 y tables.
    expect((await foreignKeyTargets('order_items')).map((row) => row.target).sort()).toEqual([
      'kitchen_tickets',
      'kitchen_tickets',
      'orders',
      'products',
      'tables',
      'users',
      'users',
      'users',
    ]);
    expect((await indexesOf('order_items')).map((row) => row.indexname)).toEqual(
      expect.arrayContaining([
        'order_items_order_id',
        'order_items_product_id',
        'order_items_kitchen_ticket_id',
        'order_items_ordered_at_table_id',
      ]),
    );
  });

  it('AC-03: order_items guarda las copias y rechaza cada FK rota', async () => {
    const userId = await insertUser('mozo.migra');
    await insertProduct(5, 'Inca Kola 1L', 'drink', 800);
    const mesa3 = await insertTable('Mesa 3');
    const orderId = await insertOrder(userId);
    const ticketId = await insertTicket(orderId, userId);
    const itemId = await insertItem(orderId, 5, ticketId, userId, {
      quantity: 2,
      notes: 'sin hielo',
      orderedAtTableId: mesa3,
    });
    expect(itemId).toBeGreaterThan(0);
    expect(
      await rows<{ quantity: number; status: string }>(
        'SELECT quantity, status FROM order_items WHERE id = $1',
        [itemId],
      ),
    ).toEqual([{ quantity: 2, status: 'sent' }]);
    // Cada referencia inexistente falla por su FK.
    await expect(insertItem(999999, 5, ticketId, userId)).rejects.toBeInstanceOf(Error);
    await expect(insertItem(orderId, 999999, ticketId, userId)).rejects.toBeInstanceOf(Error);
    await expect(insertItem(orderId, 5, 999999, userId)).rejects.toBeInstanceOf(Error);
    await expect(insertItem(orderId, 5, ticketId, 999999)).rejects.toBeInstanceOf(Error);
    await expect(
      insertItem(orderId, 5, ticketId, userId, { orderedAtTableId: 999999 }),
    ).rejects.toBeInstanceOf(Error);
    await expect(
      insertItem(orderId, 5, ticketId, userId, {
        status: 'voided',
        voidTicketId: 999999,
        voidedAt: T2,
        voidedBy: userId,
        voidReason: 'Error',
      }),
    ).rejects.toBeInstanceOf(Error);
    await expect(
      insertItem(orderId, 5, ticketId, userId, {
        status: 'void_requested',
        voidRequestedAt: T1,
        voidRequestedBy: 999999,
        voidRequestReason: 'Error',
      }),
    ).rejects.toBeInstanceOf(Error);
    await expect(
      insertItem(orderId, 5, ticketId, userId, {
        status: 'voided',
        voidTicketId: ticketId,
        voidedAt: T2,
        voidedBy: 999999,
        voidReason: 'Error',
      }),
    ).rejects.toBeInstanceOf(Error);
  });

  it('AC-03: order_items_status_allowed acepta los tres estados coherentes y rechaza el resto', async () => {
    const userId = await insertUser('mozo.migra');
    await insertProduct(5, 'Inca Kola 1L', 'drink', 800);
    const orderId = await insertOrder(userId);
    const ticketId = await insertTicket(orderId, userId);
    const voidTicketId = await insertTicket(orderId, userId, 'void');
    await insertItem(orderId, 5, ticketId, userId);
    await insertItem(orderId, 5, ticketId, userId, requestedFields(userId));
    await insertItem(orderId, 5, ticketId, userId, voidedFields(voidTicketId, userId));
    for (const status of ['anulado', 'SENT', '']) {
      const error = await insertItem(orderId, 5, ticketId, userId, { status }).catch(
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(Error);
      expect(violatedConstraint(error)).toBe('order_items_status_allowed');
    }
  });

  it('AC-03: order_items_quantity_range y price_cents_range acotan cantidad y precio', async () => {
    const userId = await insertUser('mozo.migra');
    await insertProduct(5, 'Inca Kola 1L', 'drink', 800);
    const orderId = await insertOrder(userId);
    const ticketId = await insertTicket(orderId, userId);
    // Los bordes válidos pasan.
    await insertItem(orderId, 5, ticketId, userId, { quantity: 1, priceCents: 0 });
    await insertItem(orderId, 5, ticketId, userId, { quantity: 99, priceCents: 999999 });
    for (const quantity of [0, -1, 100]) {
      const error = await insertItem(orderId, 5, ticketId, userId, { quantity }).catch(
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(Error);
      expect(violatedConstraint(error)).toBe('order_items_quantity_range');
    }
    for (const priceCents of [-1, 1000000]) {
      const error = await insertItem(orderId, 5, ticketId, userId, { priceCents }).catch(
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(Error);
      expect(violatedConstraint(error)).toBe('order_items_price_cents_range');
    }
    // Los octavos no admiten negativos (CHECK ≥ 0 sobre order_items).
    for (const eighths of [
      { breastEighths: -1 },
      { legEighths: -1 },
      { breastEighths: -1, legEighths: -1 },
    ]) {
      const error = await insertItem(orderId, 5, ticketId, userId, eighths).catch(
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(Error);
      expect(String(violatedConstraint(error))).toMatch(/^order_items_/);
    }
  });

  it('AC-03: order_items_portion_cut exige la correspondencia presentación-parte', async () => {
    const userId = await insertUser('mozo.migra');
    await insertProduct(5, 'Pollo a la brasa', 'chicken', 4800);
    const orderId = await insertOrder(userId);
    const ticketId = await insertTicket(orderId, userId);
    // Las combinaciones válidas: nada, eighth/quarter con parte, half/whole sin parte.
    for (const combo of [
      {},
      { portion: 'eighth', cut: 'breast' },
      { portion: 'quarter', cut: 'leg' },
      { portion: 'half' },
      { portion: 'whole' },
    ])
      expect(await insertItem(orderId, 5, ticketId, userId, combo)).toBeGreaterThan(0);
    // cut sin portion, eighth/quarter sin cut, half/whole con cut y valor fuera de lista.
    for (const combo of [
      { cut: 'leg' },
      { portion: 'eighth' },
      { portion: 'quarter' },
      { portion: 'half', cut: 'breast' },
      { portion: 'whole', cut: 'leg' },
      { portion: 'cuarto', cut: 'leg' },
      { portion: 'quarter', cut: 'ala' },
    ]) {
      const error = await insertItem(orderId, 5, ticketId, userId, combo).catch(
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(Error);
      expect(violatedConstraint(error)).toBe('order_items_portion_cut');
    }
  });

  it('AC-03: order_items_void_consistent exige los campos del ciclo por estado', async () => {
    const userId = await insertUser('mozo.migra');
    const adminId = await insertUser('admin.migra', 'Ada');
    await insertProduct(5, 'Inca Kola 1L', 'drink', 800);
    const orderId = await insertOrder(userId);
    const ticketId = await insertTicket(orderId, userId);
    const voidTicketId = await insertTicket(orderId, adminId, 'void');
    // Las tres formas válidas.
    await insertItem(orderId, 5, ticketId, userId);
    await insertItem(orderId, 5, ticketId, userId, requestedFields(userId));
    await insertItem(orderId, 5, ticketId, userId, voidedFields(voidTicketId, adminId));
    // 'sent' con cualquier campo de anulación puesto → violación.
    for (const fields of [
      { voidTicketId },
      { voidRequestedAt: T1 },
      { voidRequestedBy: userId },
      { voidRequestReason: 'Error' },
      { voidedAt: T2 },
      { voidedBy: adminId },
      { voidReason: 'Error' },
    ]) {
      const error = await insertItem(orderId, 5, ticketId, userId, fields).catch(
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(Error);
      expect(violatedConstraint(error)).toBe('order_items_void_consistent');
    }
    // 'void_requested' incompleto o con campos de 'voided' → violación.
    for (const fields of [
      { status: 'void_requested' },
      { status: 'void_requested', voidRequestedAt: T1 },
      { status: 'void_requested', voidRequestedAt: T1, voidRequestedBy: userId },
      { ...requestedFields(userId), voidTicketId },
      { ...requestedFields(userId), voidedAt: T2 },
      { ...requestedFields(userId), voidedBy: adminId },
      { ...requestedFields(userId), voidReason: 'Error' },
    ]) {
      const error = await insertItem(orderId, 5, ticketId, userId, fields).catch(
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(Error);
      expect(violatedConstraint(error)).toBe('order_items_void_consistent');
    }
    // 'voided' sin alguno de sus cuatro campos de anulación → violación.
    for (const fields of [
      { status: 'voided' },
      { status: 'voided', voidTicketId },
      { status: 'voided', voidTicketId, voidedAt: T2, voidedBy: adminId },
      { status: 'voided', voidedAt: T2, voidedBy: adminId, voidReason: 'Error' },
    ]) {
      const error = await insertItem(orderId, 5, ticketId, userId, fields).catch(
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(Error);
      expect(violatedConstraint(error)).toBe('order_items_void_consistent');
    }
    // En 'voided' el triple de solicitud queda libre: puesto si vino por solicitud.
    expect(
      await insertItem(orderId, 5, ticketId, userId, {
        ...requestedFields(userId),
        ...voidedFields(voidTicketId, adminId),
      }),
    ).toBeGreaterThan(0);
  });

  it('AC-03: order_item_components y order_item_sauces guardan copias con CHECK y FK', async () => {
    const userId = await insertUser('mozo.migra');
    await insertProduct(5, 'Combo familiar', 'combo', 6200);
    await insertProduct(6, 'Gaseosa 1L', 'drink', 800);
    await insertProduct(7, 'Ají', 'sauce', 0);
    const orderId = await insertOrder(userId);
    const ticketId = await insertTicket(orderId, userId);
    const itemId = await insertItem(orderId, 5, ticketId, userId, {
      productName: 'Combo familiar',
      productCategory: 'combo',
      priceCents: 6200,
    });
    const componentId = await insertComponent(itemId, 6, { quantity: 1 });
    const sauceId = await insertSauce(itemId, 7, { quantity: 2, priceCents: 0 });
    expect(componentId).toBeGreaterThan(0);
    expect(sauceId).toBeGreaterThan(0);
    expect(await primaryKeyColumns('order_item_components')).toEqual([{ column_name: 'id' }]);
    expect(await primaryKeyColumns('order_item_sauces')).toEqual([{ column_name: 'id' }]);
    // La copia del componente puede llevar portion/cut como el ítem padre.
    await insertProduct(8, 'Pollo a la brasa', 'chicken', 4800);
    expect(
      await insertComponent(itemId, 8, {
        productName: 'Pollo a la brasa',
        portion: 'quarter',
        cut: 'breast',
        breastEighths: 2,
      }),
    ).toBeGreaterThan(0);
    // quantity fuera de 1..99 lo rechaza el CHECK nombrado.
    for (const quantity of [0, 100]) {
      const error = await insertComponent(itemId, 6, { quantity }).catch(
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(Error);
      expect(violatedConstraint(error)).toBe('order_item_components_quantity_range');
    }
    // Las cremas acotan quantity 1..99 y precio 0..999999 como el ítem.
    for (const quantity of [0, 100]) {
      const error = await insertSauce(itemId, 7, { quantity }).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(Error);
      expect(violatedConstraint(error)).toBe('order_item_sauces_quantity_range');
    }
    for (const priceCents of [-1, 1000000]) {
      const error = await insertSauce(itemId, 7, { priceCents }).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(Error);
      expect(violatedConstraint(error)).toBe('order_item_sauces_price_cents_range');
    }
    // FK rotas: ítem o producto inexistente.
    await expect(insertComponent(999999, 6)).rejects.toBeInstanceOf(Error);
    await expect(insertComponent(itemId, 999999)).rejects.toBeInstanceOf(Error);
    await expect(insertSauce(999999, 7)).rejects.toBeInstanceOf(Error);
    await expect(insertSauce(itemId, 999999)).rejects.toBeInstanceOf(Error);
  });

  it('AC-04: order_item_components y order_item_sauces tienen sus columnas e índices', async () => {
    const componentColumns = await columnMap('order_item_components');
    expect([...componentColumns.keys()]).toEqual([
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
    expect(componentColumns.get('product_name')).toMatchObject({
      data_type: 'character varying',
      character_maximum_length: 60,
      is_nullable: 'NO',
    });
    // El componente no guarda precio: lo cobra el ítem padre (D-007-05).
    expect(componentColumns.has('price_cents')).toBe(false);
    const sauceColumns = await columnMap('order_item_sauces');
    expect([...sauceColumns.keys()]).toEqual([
      'id',
      'order_item_id',
      'product_id',
      'product_name',
      'quantity',
      'price_cents',
      'created_at',
      'updated_at',
    ]);
    for (const [table, indexName] of [
      ['order_item_components', 'order_item_components_order_item_id'],
      ['order_item_sauces', 'order_item_sauces_order_item_id'],
    ] as const)
      expect((await indexesOf(table)).map((row) => row.indexname)).toContain(indexName);
    // El CHECK de correspondencia portion/cut también vale para el componente.
    expect(await constraintsOf('order_item_components')).toContainEqual({
      conname: 'order_item_components_portion_cut',
      contype: 'c',
    });
  });

  it('AC-04: idempotency_keys tiene sus columnas, la unicidad (scope, key) y su FK', async () => {
    const columns = await columnMap('idempotency_keys');
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
    expect(columns.get('scope')).toMatchObject({
      data_type: 'character varying',
      character_maximum_length: 32,
      is_nullable: 'NO',
    });
    expect(columns.get('key')).toMatchObject({
      data_type: 'character varying',
      character_maximum_length: 128,
      is_nullable: 'NO',
    });
    expect(columns.get('request_hash')).toMatchObject({
      data_type: 'character varying',
      character_maximum_length: 64,
      is_nullable: 'NO',
    });
    expect(columns.get('response_status')).toMatchObject({
      data_type: 'smallint',
      is_nullable: 'NO',
    });
    expect(columns.get('response_body')).toMatchObject({
      data_type: 'jsonb',
      is_nullable: 'NO',
    });
    expect(columns.get('created_at')).toMatchObject({
      data_type: 'timestamp with time zone',
      is_nullable: 'NO',
    });
    expect(columns.has('updated_at')).toBe(false);
    expect(await primaryKeyColumns('idempotency_keys')).toEqual([{ column_name: 'id' }]);
    expect((await foreignKeyTargets('idempotency_keys')).map((row) => row.target)).toEqual([
      'orders',
    ]);
    const userId = await insertUser('mozo.migra');
    const orderId = await insertOrder(userId);
    const otherOrderId = await insertOrder(userId);
    const inserted = await insertKey('order-items', 'k-1', orderId);
    expect(inserted).toBeGreaterThan(0);
    // El par (scope, key) repetido falla por la unicidad nombrada.
    const duplicated = await insertKey('order-items', 'k-1', otherOrderId).catch(
      (caught: unknown) => caught,
    );
    expect(duplicated).toBeInstanceOf(Error);
    expect(violatedConstraint(duplicated)).toBe('idempotency_keys_scope_key_unique');
    // La misma clave en otro scope y otra clave en el mismo scope sí pasan.
    expect(await insertKey('order-item-voids', 'k-1', orderId)).toBeGreaterThan(0);
    expect(await insertKey('order-items', 'k-2', orderId)).toBeGreaterThan(0);
    // order_id inexistente rompe la FK.
    await expect(insertKey('order-items', 'k-3', 999999)).rejects.toBeInstanceOf(Error);
  });

  it('AC-05: la migración es la última de la lista y crea las cinco tablas en orden', async () => {
    // migrateUp devuelve la lista aplicada en orden: la 010 queda al final (kitchen_tickets
    // va antes que order_items dentro del up por la FK — lo prueban los inserts de AC-03).
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
  });

  it('AC-05: migrateDown elimina las cinco tablas y migrateUp las recrea', async () => {
    // La última aplicada es la de esta spec: revertirla tumba solo sus cinco tablas.
    expect(await migrateDown(sequelize)).toEqual([ORDER_ITEMS_MIGRATION]);
    for (const table of [
      'order_item_sauces',
      'order_item_components',
      'order_items',
      'idempotency_keys',
      'kitchen_tickets',
    ])
      expect(await tableExists(sequelize, table)).toBe(false);
    // Las tablas de specs previas quedan intactas.
    for (const table of ['orders', 'tables', 'combo_items', 'products', 'users'])
      expect(await tableExists(sequelize, table)).toBe(true);
    // Reaplicar recrea las cinco y vuelven a aceptar inserts coherentes.
    expect(await migrateUp(sequelize)).toEqual([ORDER_ITEMS_MIGRATION]);
    const userId = await insertUser('mozo.migra');
    await insertProduct(5, 'Inca Kola 1L', 'drink', 800);
    const orderId = await insertOrder(userId);
    const ticketId = await insertTicket(orderId, userId);
    expect(await insertItem(orderId, 5, ticketId, userId)).toBeGreaterThan(0);
    expect(await insertKey('order-items', 'k-1', orderId)).toBeGreaterThan(0);
  });
});
