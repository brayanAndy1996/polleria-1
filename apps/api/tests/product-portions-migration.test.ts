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
];
const PRODUCT_PORTIONS_MIGRATION = '20261009120000-create-product-portions.ts';
const COMBO_ITEMS_MIGRATION = '20261009180000-create-combo-items.ts';
const TABLES_ORDERS_MIGRATION = '20261010120000-create-tables-orders.ts';

/**
 * Nombre del CHECK, la unicidad o la FK que reporta el driver pg en un error (mismo
 * criterio que en las pruebas de la 005).
 */
function violatedConstraint(error: unknown): unknown {
  const fields = error as {
    parent?: { constraint?: unknown };
    original?: { constraint?: unknown };
  };
  return fields.parent?.constraint ?? fields.original?.constraint;
}

describe('006: tabla product_portions y su migración sobre polleria_test', () => {
  let sequelize: Sequelize;
  beforeAll(async () => {
    sequelize = await connectTestDatabase();
  });
  beforeEach(async () => {
    // Partir de cero y aplicar las migraciones reales: product_portions queda creada y vacía.
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
  const insertPortion = (
    productId: number | null,
    portion: string | null,
    cut: string | null,
    priceCents: number | null,
  ) =>
    sequelize.query(
      'INSERT INTO product_portions (product_id, portion, cut, price_cents) ' +
        'VALUES ($1, $2, $3, $4)',
      { bind: [productId, portion, cut, priceCents] },
    );
  const portionCount = () => rows<{ id: number }>('SELECT id FROM product_portions');

  it('AC-05: product_portions tiene las columnas, tipos y valores por defecto de la spec', async () => {
    const columns = await rows<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      character_maximum_length: number | null;
      column_default: string | null;
      is_identity: string;
    }>(
      "SELECT column_name, data_type, is_nullable, character_maximum_length, column_default, is_identity FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'product_portions' ORDER BY ordinal_position",
    );
    expect(columns.map((column) => column.column_name)).toEqual([
      'id',
      'product_id',
      'portion',
      'cut',
      'price_cents',
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
      { column_name: 'product_id', data_type: 'integer', character_maximum_length: null },
      { column_name: 'portion', data_type: 'character varying', character_maximum_length: 8 },
      { column_name: 'cut', data_type: 'character varying', character_maximum_length: 8 },
      { column_name: 'price_cents', data_type: 'integer', character_maximum_length: null },
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
    // Todas NOT NULL salvo cut (la única que permite NULL).
    expect(
      columns
        .filter((column) => column.column_name !== 'cut')
        .every((column) => column.is_nullable === 'NO'),
    ).toBe(true);
    expect(columns.find((column) => column.column_name === 'cut')?.is_nullable).toBe('YES');
    // created_at y updated_at tienen valor por defecto.
    for (const name of ['created_at', 'updated_at'])
      expect(columns.find((column) => column.column_name === name)?.column_default).not.toBeNull();
    // id es la clave primaria autoincremental (SERIAL o IDENTITY).
    expect(
      await rows<{ column_name: string }>(
        `SELECT kcu.column_name FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name AND tc.constraint_schema = kcu.constraint_schema
         WHERE tc.table_schema = current_schema() AND tc.table_name = 'product_portions' AND tc.constraint_type = 'PRIMARY KEY'`,
      ),
    ).toEqual([{ column_name: 'id' }]);
    const idColumn = columns.find((column) => column.column_name === 'id')!;
    expect(idColumn.is_identity === 'YES' || /^nextval\(/.test(idColumn.column_default ?? '')).toBe(
      true,
    );
  });

  it('AC-05: product_id referencia products(id) y tiene el índice no único product_portions_product_id', async () => {
    await insertProduct(5, 'Pollo a la brasa');
    // Un INSERT con product_id que no existe falla con error de la base (FK).
    await expect(insertPortion(999999, 'quarter', 'breast', 1850)).rejects.toBeInstanceOf(Error);
    // La FK a products existe como restricción.
    const constraints = await rows<{ conname: string; contype: string }>(
      `SELECT conname, contype FROM pg_constraint
       WHERE conrelid = 'product_portions'::regclass ORDER BY conname`,
    );
    expect(constraints.filter((row) => row.contype === 'f')).toHaveLength(1);
    // pg_indexes muestra el índice no único sobre (product_id).
    const indexes = await rows<{ indexname: string; indexdef: string }>(
      "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'product_portions' AND schemaname = current_schema()",
    );
    const index = indexes.find((row) => row.indexname === 'product_portions_product_id');
    expect(index).toBeDefined();
    expect(index?.indexdef).not.toContain('UNIQUE');
    expect(index?.indexdef).toMatch(/\(product_id\)/);
    expect(await portionCount()).toEqual([]);
  });

  it('AC-05: los CHECK de listas y de rango rechazan los valores fuera de la spec sin dejar fila', async () => {
    await insertProduct(5, 'Pollo a la brasa');
    // Los cuatro CHECK con nombre de la spec existen, junto a la unicidad.
    const constraints = await rows<{ conname: string; contype: string }>(
      `SELECT conname, contype FROM pg_constraint
       WHERE conrelid = 'product_portions'::regclass ORDER BY conname`,
    );
    for (const name of [
      'product_portions_portion_allowed',
      'product_portions_cut_allowed',
      'product_portions_price_cents_range',
      'product_portions_cut_matches_portion',
    ])
      expect(constraints).toContainEqual({ conname: name, contype: 'c' });
    expect(constraints).toContainEqual({ conname: 'product_portions_unique', contype: 'u' });
    // Un INSERT válido funciona.
    await insertPortion(5, 'quarter', 'breast', 1850);
    // portion fuera de la lista o NULL. Una presentación inválida puede chocar con más
    // de un CHECK: basta con que la base la rechace.
    for (const portion of ['octavo', 'big', null])
      await expect(insertPortion(5, portion, 'breast', 900)).rejects.toBeInstanceOf(Error);
    // cut fuera de la lista: con una presentación de una sola parte el único CHECK que
    // falla es product_portions_cut_allowed.
    for (const cut of ['pecho', 'wing']) {
      const error = await insertPortion(5, 'quarter', cut, 1800).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(Error);
      expect(violatedConstraint(error)).toBe('product_portions_cut_allowed');
    }
    // price_cents fuera de rango o NULL.
    for (const priceCents of [-1, 100000]) {
      const error = await insertPortion(5, 'quarter', 'breast', priceCents).catch(
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(Error);
      expect(violatedConstraint(error)).toBe('product_portions_price_cents_range');
    }
    await expect(insertPortion(5, 'quarter', 'breast', null)).rejects.toBeInstanceOf(Error);
    // Solo quedó la fila válida del inicio.
    expect(await rows('SELECT id FROM product_portions')).toHaveLength(1);
  });

  it('AC-05: el CHECK cut_matches_portion exige parte en eighth/quarter y la prohíbe en half/whole', async () => {
    await insertProduct(5, 'Pollo a la brasa');
    // En cada caso el único CHECK que falla es product_portions_cut_matches_portion:
    // la presentación y la parte son de la lista y el precio está en rango.
    for (const [portion, cut] of [
      ['eighth', null],
      ['quarter', null],
      ['half', 'breast'],
      ['whole', 'leg'],
    ] as [string, string | null][]) {
      const error = await insertPortion(5, portion, cut, 1500).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(Error);
      expect(violatedConstraint(error)).toBe('product_portions_cut_matches_portion');
    }
    expect(await portionCount()).toEqual([]);
  });

  it('AC-05: las seis combinaciones conviven y repetir (portion, cut) falla aunque cut sea NULL', async () => {
    await insertProduct(5, 'Pollo a la brasa');
    await insertProduct(6, 'Pollo premium');
    for (const [portion, cut] of [
      ['eighth', 'breast'],
      ['eighth', 'leg'],
      ['quarter', 'breast'],
      ['quarter', 'leg'],
      ['half', null],
      ['whole', null],
    ] as [string, string | null][])
      await insertPortion(5, portion, cut, 1000);
    // product_portions_unique es NULLS NOT DISTINCT: repetir (5,'half',NULL) falla igual
    // que repetir (5,'quarter','breast').
    const nullsNotDistinct = await rows<{ indnullsnotdistinct: boolean }>(
      `SELECT i.indnullsnotdistinct FROM pg_constraint c
       JOIN pg_index i ON i.indexrelid = c.conindid
       WHERE c.conrelid = 'product_portions'::regclass AND c.conname = 'product_portions_unique'`,
    );
    expect(nullsNotDistinct).toEqual([{ indnullsnotdistinct: true }]);
    for (const [portion, cut] of [
      ['quarter', 'breast'],
      ['half', null],
      ['whole', null],
    ] as [string, string | null][]) {
      const error = await insertPortion(5, portion, cut, 1100).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(Error);
      expect(violatedConstraint(error)).toBe('product_portions_unique');
    }
    // El mismo (portion, cut) sí puede existir en otro producto.
    await insertPortion(6, 'quarter', 'breast', 2000);
    expect(await rows('SELECT id FROM product_portions')).toHaveLength(7);
  });

  it('AC-06: aplica, revierte y reaplica la migración dentro de la lista completa', async () => {
    await resetMigrationTables(sequelize);
    expect(await migrateUp(sequelize)).toEqual(MIGRATIONS);
    expect(await tableExists(sequelize, 'product_portions')).toBe(true);
    expect(await tableExists(sequelize, 'products')).toBe(true);
    expect(await tableExists(sequelize, 'combo_items')).toBe(true);
    expect(await tableExists(sequelize, 'orders')).toBe(true);
    expect(await tableExists(sequelize, 'tables')).toBe(true);

    // La última aplicada es la de la spec 009: revierte primero ella, luego la de la
    // 007 (combo_items) y después la de la 006 (product_portions).
    expect(await migrateDown(sequelize)).toEqual([TABLES_ORDERS_MIGRATION]);
    expect(await tableExists(sequelize, 'tables')).toBe(false);
    expect(await tableExists(sequelize, 'orders')).toBe(false);
    expect(await tableExists(sequelize, 'combo_items')).toBe(true);
    expect(await migrateDown(sequelize)).toEqual([COMBO_ITEMS_MIGRATION]);
    expect(await tableExists(sequelize, 'combo_items')).toBe(false);
    expect(await tableExists(sequelize, 'product_portions')).toBe(true);
    expect(await migrateDown(sequelize)).toEqual([PRODUCT_PORTIONS_MIGRATION]);
    expect(await tableExists(sequelize, 'product_portions')).toBe(false);
    expect(await tableExists(sequelize, 'products')).toBe(true);

    // Las migraciones son reaplicables tras revertir, en su orden de la lista.
    expect(await migrateUp(sequelize)).toEqual([
      PRODUCT_PORTIONS_MIGRATION,
      COMBO_ITEMS_MIGRATION,
      TABLES_ORDERS_MIGRATION,
    ]);
    expect(await tableExists(sequelize, 'product_portions')).toBe(true);
    expect(await tableExists(sequelize, 'combo_items')).toBe(true);
    expect(await tableExists(sequelize, 'orders')).toBe(true);
    expect(await tableExists(sequelize, 'tables')).toBe(true);
    await insertProduct(5, 'Pollo a la brasa');
    await insertPortion(5, 'quarter', 'breast', 1850);
    expect(await rows<{ id: number }>('SELECT id FROM product_portions')).toEqual([{ id: 1 }]);
  });
});
