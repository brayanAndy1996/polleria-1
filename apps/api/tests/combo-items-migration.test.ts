// AC-06. Spec 007 — archivo nuevo: va EN ROJO hasta que T-02 cree la migración
// 20261009180000-create-combo-items.ts y la registre en el migrador.
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

const MIGRATIONS = [
  '20261008120000-create-users.ts',
  '20261008120100-create-sessions.ts',
  '20261008180000-create-products.ts',
  '20261009120000-create-product-portions.ts',
  '20261009180000-create-combo-items.ts',
  '20261010120000-create-tables-orders.ts',
  '20261011120000-create-order-items.ts',
  '20261012150000-create-kitchen-ticket-prints.ts',
];
const COMBO_ITEMS_MIGRATION = '20261009180000-create-combo-items.ts';
const TABLES_ORDERS_MIGRATION = '20261010120000-create-tables-orders.ts';
const ORDER_ITEMS_MIGRATION = '20261011120000-create-order-items.ts';

/**
 * Nombre del CHECK, la unicidad o la FK que reporta el driver pg en un error (mismo
 * criterio que en las pruebas de la 005 y la 006).
 */
function violatedConstraint(error: unknown): unknown {
  const fields = error as {
    parent?: { constraint?: unknown };
    original?: { constraint?: unknown };
  };
  return fields.parent?.constraint ?? fields.original?.constraint;
}

describe('007: tabla combo_items y su migración sobre polleria_test', () => {
  let sequelize: Sequelize;
  beforeAll(async () => {
    sequelize = await connectTestDatabase();
  });
  beforeEach(async () => {
    // Partir de cero y aplicar las migraciones reales: combo_items queda creada y vacía.
    await resetMigrationTables(sequelize);
    await migrateUp(sequelize);
  });
  afterAll(async () => {
    await closeTestDatabase(sequelize);
  });
  const rows = <T extends object>(sql: string, bind?: (string | number | null)[]) =>
    sequelize.query<T>(sql, { type: QueryTypes.SELECT, bind });
  const insertProduct = (id: number, name: string, category = 'chicken', priceCents = 1850) =>
    sequelize.query(
      'INSERT INTO products (id, name, category, price_cents) VALUES ($1, $2, $3, $4)',
      { bind: [id, name, category, priceCents] },
    );
  const insertItem = (
    comboId: number,
    productId: number,
    quantity: number | null = 1,
    portion: string | null = null,
    cut: string | null = null,
  ) =>
    sequelize.query(
      'INSERT INTO combo_items (combo_id, product_id, quantity, portion, cut) ' +
        'VALUES ($1, $2, $3, $4, $5)',
      { bind: [comboId, productId, quantity, portion, cut] },
    );
  const itemCount = () => rows<{ id: number }>('SELECT id FROM combo_items');
  const constraintRows = () =>
    rows<{ conname: string; contype: string }>(
      `SELECT conname, contype FROM pg_constraint
       WHERE conrelid = 'combo_items'::regclass ORDER BY conname`,
    );

  it('AC-06: combo_items tiene las columnas, tipos y valores por defecto de la spec', async () => {
    const columns = await rows<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      character_maximum_length: number | null;
      column_default: string | null;
      is_identity: string;
    }>(
      "SELECT column_name, data_type, is_nullable, character_maximum_length, column_default, is_identity FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'combo_items' ORDER BY ordinal_position",
    );
    expect(columns.map((column) => column.column_name)).toEqual([
      'id',
      'combo_id',
      'product_id',
      'quantity',
      'portion',
      'cut',
      'created_at',
      'updated_at',
    ]);
    expect(
      columns.map(({ column_name, data_type, character_maximum_length }) => ({
        column_name,
        data_type,
        character_maximum_length,
      })),
    ).toEqual([
      { column_name: 'id', data_type: 'integer', character_maximum_length: null },
      { column_name: 'combo_id', data_type: 'integer', character_maximum_length: null },
      { column_name: 'product_id', data_type: 'integer', character_maximum_length: null },
      { column_name: 'quantity', data_type: 'integer', character_maximum_length: null },
      { column_name: 'portion', data_type: 'character varying', character_maximum_length: 8 },
      { column_name: 'cut', data_type: 'character varying', character_maximum_length: 8 },
      {
        column_name: 'created_at',
        data_type: 'timestamp with time zone',
        character_maximum_length: null,
      },
      {
        column_name: 'updated_at',
        data_type: 'timestamp with time zone',
        character_maximum_length: null,
      },
    ]);
    // NOT NULL salvo portion y cut; created_at/updated_at con valor por defecto.
    const nullable = new Set(['portion', 'cut']);
    for (const column of columns) {
      expect(column.is_nullable).toBe(nullable.has(column.column_name) ? 'YES' : 'NO');
    }
    for (const name of ['created_at', 'updated_at'])
      expect(columns.find((column) => column.column_name === name)?.column_default).not.toBeNull();
    // id es la clave primaria autoincremental (SERIAL o IDENTITY).
    expect(
      await rows<{ column_name: string }>(
        `SELECT kcu.column_name FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name AND tc.constraint_schema = kcu.constraint_schema
         WHERE tc.table_schema = current_schema() AND tc.table_name = 'combo_items' AND tc.constraint_type = 'PRIMARY KEY'`,
      ),
    ).toEqual([{ column_name: 'id' }]);
    const idColumn = columns.find((column) => column.column_name === 'id')!;
    expect(idColumn.is_identity === 'YES' || /^nextval\(/.test(idColumn.column_default ?? '')).toBe(
      true,
    );
  });

  it('AC-06: combo_id y product_id referencian products(id) y tienen sus índices', async () => {
    await insertProduct(5, 'Combo familiar', 'combo', 3900);
    await insertProduct(6, 'Chaufa', 'dish', 1200);
    // Las dos FK apuntan a products(id): dos restricciones de tipo 'f'.
    const constraints = await constraintRows();
    expect(constraints.filter((row) => row.contype === 'f')).toHaveLength(2);
    // Un INSERT con combo_id o product_id inexistente falla con error de la base (FK).
    await expect(insertItem(999999, 6)).rejects.toBeInstanceOf(Error);
    await expect(insertItem(5, 999999)).rejects.toBeInstanceOf(Error);
    // Con productos existentes pasa.
    await insertItem(5, 6);
    expect(await itemCount()).toHaveLength(1);
    // Los dos índices simples de la spec existen (no únicos: la unicidad vive en
    // combo_items_unique, no en estos índices de consulta).
    const indexes = await rows<{ indexname: string; indexdef: string }>(
      "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'combo_items' AND schemaname = current_schema()",
    );
    for (const [indexName, column] of [
      ['combo_items_combo_id', 'combo_id'],
      ['combo_items_product_id', 'product_id'],
    ] as const) {
      const index = indexes.find((row) => row.indexname === indexName);
      expect(index).toBeDefined();
      expect(index?.indexdef).not.toContain('UNIQUE');
      expect(index?.indexdef).toMatch(new RegExp(`\\(${column}\\)`));
    }
  });

  it('AC-06: los CHECK de listas y de rango rechazan los valores fuera de la spec sin dejar fila', async () => {
    await insertProduct(5, 'Combo familiar', 'combo', 3900);
    await insertProduct(6, 'Pollo a la brasa');
    // Los cuatro CHECK con nombre de la spec existen, junto a la unicidad.
    const constraints = await constraintRows();
    for (const name of [
      'combo_items_quantity_range',
      'combo_items_portion_allowed',
      'combo_items_cut_allowed',
      'combo_items_portion_cut',
    ])
      expect(constraints).toContainEqual({ conname: name, contype: 'c' });
    expect(constraints).toContainEqual({ conname: 'combo_items_unique', contype: 'u' });
    // quantity fuera de rango o NULL.
    for (const quantity of [0, -1, 100, null]) {
      const error = await insertItem(5, 6, quantity).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(Error);
      if (quantity !== null) expect(violatedConstraint(error)).toBe('combo_items_quantity_range');
    }
    // portion fuera de la lista: el único CHECK que puede fallar es portion_allowed.
    for (const portion of ['octavo', 'big']) {
      const error = await insertItem(5, 6, 1, portion, 'breast').catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(Error);
      expect(violatedConstraint(error)).toBe('combo_items_portion_allowed');
    }
    // cut fuera de la lista: con portion 'quarter' el único CHECK que falla es cut_allowed.
    for (const cut of ['pecho', 'wing']) {
      const error = await insertItem(5, 6, 1, 'quarter', cut).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(Error);
      expect(violatedConstraint(error)).toBe('combo_items_cut_allowed');
    }
    expect(await itemCount()).toEqual([]);
  });

  it('AC-06: el CHECK portion_cut exige la correspondencia entre presentación y parte', async () => {
    await insertProduct(5, 'Combo familiar', 'combo', 3900);
    await insertProduct(6, 'Pollo a la brasa');
    // En cada caso los valores son de la lista: el único CHECK que puede fallar
    // es combo_items_portion_cut.
    for (const [portion, cut] of [
      [null, 'leg'],
      ['eighth', null],
      ['quarter', null],
      ['half', 'breast'],
      ['whole', 'leg'],
    ] as [string | null, string | null][]) {
      const error = await insertItem(5, 6, 1, portion, cut).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(Error);
      expect(violatedConstraint(error)).toBe('combo_items_portion_cut');
    }
    // Las combinaciones permitidas sí pasan.
    await insertItem(5, 6, 1, 'quarter', 'leg');
    await insertItem(5, 6, 2, 'whole', null);
    expect(await itemCount()).toHaveLength(2);
  });

  it('AC-06: combo_items_unique es NULLS NOT DISTINCT sobre (combo_id, product_id, portion, cut)', async () => {
    await insertProduct(5, 'Combo familiar', 'combo', 3900);
    await insertProduct(9, 'Otro combo', 'combo', 5000);
    await insertProduct(6, 'Pollo a la brasa');
    await insertProduct(7, 'Chicha', 'drink', 500);
    const nullsNotDistinct = await rows<{ indnullsnotdistinct: boolean }>(
      `SELECT i.indnullsnotdistinct FROM pg_constraint c
       JOIN pg_index i ON i.indexrelid = c.conindid
       WHERE c.conrelid = 'combo_items'::regclass AND c.conname = 'combo_items_unique'`,
    );
    expect(nullsNotDistinct).toEqual([{ indnullsnotdistinct: true }]);
    // El mismo producto puede entrar con distinta (portion, cut) —el "dúo"— pero no
    // repetir la misma, tampoco con NULL (NULLS NOT DISTINCT los trata iguales).
    await insertItem(5, 6, 1, 'quarter', 'breast');
    await insertItem(5, 6, 1, 'quarter', 'leg');
    const repeated = await insertItem(5, 6, 1, 'quarter', 'breast').catch(
      (caught: unknown) => caught,
    );
    expect(repeated).toBeInstanceOf(Error);
    expect(violatedConstraint(repeated)).toBe('combo_items_unique');
    await insertItem(5, 7, 2);
    const repeatedNull = await insertItem(5, 7, 1).catch((caught: unknown) => caught);
    expect(repeatedNull).toBeInstanceOf(Error);
    expect(violatedConstraint(repeatedNull)).toBe('combo_items_unique');
    // La unicidad es por combo: el mismo (product_id, portion, cut) en otro combo pasa.
    await insertItem(9, 6, 1, 'quarter', 'breast');
    await insertItem(9, 7, 1);
    // Sobreviven 5 filas: las dos del dúo, la del NULL/NULL y las dos del otro
    // combo; las dos repetidas no dejaron fila.
    expect(await itemCount()).toHaveLength(5);
  });

  it('AC-07: aplica, revierte y reaplica la migración dentro de la lista completa', async () => {
    await resetMigrationTables(sequelize);
    expect(await migrateUp(sequelize)).toEqual(MIGRATIONS);
    for (const table of [
      'users',
      'sessions',
      'products',
      'product_portions',
      'combo_items',
      'orders',
      'tables',
    ])
      expect(await tableExists(sequelize, table)).toBe(true);
    // El up deja el CHECK aceptando 'combo'. La fila se borra antes del down: con
    // un 'combo' dado de alta el CHECK viejo no se puede restaurar (D-007-14).
    await insertProduct(5, 'Mostrito', 'combo', 2200);
    await sequelize.query('DELETE FROM products WHERE id = 5');

    // La última aplicada es la de la spec 010: revierte primero ella, luego la
    // de la 009 (tables y orders) y después la de la 007 (combo_items).
    expect(await migrateDown(sequelize)).toEqual(['20261012150000-create-kitchen-ticket-prints.ts']);
    expect(await tableExists(sequelize, 'kitchen_ticket_prints')).toBe(false);
    expect(await migrateDown(sequelize)).toEqual([ORDER_ITEMS_MIGRATION]);
    expect(await tableExists(sequelize, 'order_items')).toBe(false);
    expect(await tableExists(sequelize, 'tables')).toBe(true);
    expect(await migrateDown(sequelize)).toEqual([TABLES_ORDERS_MIGRATION]);
    expect(await tableExists(sequelize, 'tables')).toBe(false);
    expect(await tableExists(sequelize, 'orders')).toBe(false);
    expect(await tableExists(sequelize, 'combo_items')).toBe(true);
    expect(await migrateDown(sequelize)).toEqual([COMBO_ITEMS_MIGRATION]);
    expect(await tableExists(sequelize, 'combo_items')).toBe(false);
    expect(await tableExists(sequelize, 'product_portions')).toBe(true);
    expect(await tableExists(sequelize, 'products')).toBe(true);
    // Tras el down el CHECK vuelve a la lista sin 'combo': 'combo' falla y 'dish' pasa.
    const comboRejected = await sequelize
      .query(
        `INSERT INTO products (id, name, category, price_cents)
         VALUES (6, 'Otro combo', 'combo', 3900)`,
      )
      .catch((caught: unknown) => caught);
    expect(comboRejected).toBeInstanceOf(Error);
    expect(violatedConstraint(comboRejected)).toBe('products_category_allowed');
    await insertProduct(7, 'Arroz con pollo', 'dish', 1500);

    // Las migraciones son reaplicables tras revertir, en su orden de la lista:
    // la de la 007 (combo_items), la de la 009 (orders + tables) y la de la 010.
    expect(await migrateUp(sequelize)).toEqual([
      COMBO_ITEMS_MIGRATION,
      TABLES_ORDERS_MIGRATION,
      ORDER_ITEMS_MIGRATION,
      '20261012150000-create-kitchen-ticket-prints.ts',
    ]);
    expect(await tableExists(sequelize, 'combo_items')).toBe(true);
    expect(await tableExists(sequelize, 'orders')).toBe(true);
    expect(await tableExists(sequelize, 'tables')).toBe(true);
    await insertProduct(8, 'Combo familiar', 'combo', 3900);
    await insertItem(8, 7, 2);
    expect(await itemCount()).toEqual([{ id: 1 }]);
  });

  it('AC-06: el CHECK products_category_allowed admite combo y sigue rechazando lo demás', async () => {
    // 'combo' pasa; valores fuera de la lista siguen fallando por el mismo CHECK.
    await insertProduct(5, 'Combo familiar', 'combo', 3900);
    for (const category of ['combos', 'COMBO', 'side']) {
      const error = await insertProduct(6, 'Papas', category, 900).catch(
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(Error);
      expect(violatedConstraint(error)).toBe('products_category_allowed');
    }
    // Las otras seis categorías originales siguen siendo válidas.
    for (const [id, category] of [
      [10, 'chicken'],
      [11, 'dish'],
      [12, 'drink'],
      [13, 'dessert'],
      [14, 'sauce'],
      [15, 'extra'],
    ] as const) {
      await insertProduct(id, `Producto ${category}`, category, 900);
    }
    expect(await rows('SELECT id FROM products')).toHaveLength(7);
  });
});
