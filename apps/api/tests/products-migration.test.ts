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
];
const PRODUCTS_MIGRATION = '20261008180000-create-products.ts';
const PRODUCT_PORTIONS_MIGRATION = '20261009120000-create-product-portions.ts';
const COMBO_ITEMS_MIGRATION = '20261009180000-create-combo-items.ts';

/**
 * Nombre del índice único o de la restricción que reporta el driver pg en un error. Los índices
 * por expresión (como products_name_unique sobre lower(name)) llegan con ese mismo campo.
 */
function violatedConstraint(error: unknown): unknown {
  const fields = error as {
    parent?: { constraint?: unknown };
    original?: { constraint?: unknown };
  };
  return fields.parent?.constraint ?? fields.original?.constraint;
}

describe('005: tabla products y su migración sobre polleria_test', () => {
  let sequelize: Sequelize;
  beforeAll(async () => {
    sequelize = await connectTestDatabase();
  });
  beforeEach(async () => {
    // Partir de cero y aplicar las migraciones reales: products queda creada y vacía.
    await resetMigrationTables(sequelize);
    await migrateUp(sequelize);
  });
  afterAll(async () => {
    await closeTestDatabase(sequelize);
  });
  const rows = <T extends object>(sql: string, bind?: (string | number | null)[]) =>
    sequelize.query<T>(sql, { type: QueryTypes.SELECT, bind });
  const insertProduct = (
    name: string | null,
    category: string | null = 'chicken',
    priceCents: number | null = 1850,
  ) =>
    sequelize.query(
      'INSERT INTO products (name, category, price_cents) VALUES ($1, $2, $3) RETURNING id',
      { bind: [name, category, priceCents] },
    );

  it('AC-06: products tiene las columnas, tipos y valores por defecto de la spec', async () => {
    const columns = await rows<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      character_maximum_length: number | null;
      column_default: string | null;
      is_identity: string;
    }>(
      "SELECT column_name, data_type, is_nullable, character_maximum_length, column_default, is_identity FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'products' ORDER BY ordinal_position",
    );
    expect(columns.map((column) => column.column_name)).toEqual([
      'id',
      'name',
      'category',
      'price_cents',
      'is_active',
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
      { column_name: 'name', data_type: 'character varying', character_maximum_length: 60 },
      { column_name: 'category', data_type: 'character varying', character_maximum_length: 16 },
      { column_name: 'price_cents', data_type: 'integer', character_maximum_length: null },
      { column_name: 'is_active', data_type: 'boolean', character_maximum_length: null },
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
    expect(columns.every((column) => column.is_nullable === 'NO')).toBe(true);
    // is_active, created_at y updated_at tienen valor por defecto.
    for (const name of ['is_active', 'created_at', 'updated_at'])
      expect(columns.find((column) => column.column_name === name)?.column_default).not.toBeNull();
    // id es la clave primaria autoincremental (SERIAL o IDENTITY).
    expect(
      await rows<{ column_name: string }>(
        `SELECT kcu.column_name FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name AND tc.constraint_schema = kcu.constraint_schema
         WHERE tc.table_schema = current_schema() AND tc.table_name = 'products' AND tc.constraint_type = 'PRIMARY KEY'`,
      ),
    ).toEqual([{ column_name: 'id' }]);
    const idColumn = columns.find((column) => column.column_name === 'id')!;
    expect(idColumn.is_identity === 'YES' || /^nextval\(/.test(idColumn.column_default ?? '')).toBe(
      true,
    );
  });

  it('AC-06: un INSERT con name, category y price_cents funciona y deja is_active true', async () => {
    const inserted = await sequelize.query<{ id: number }>(
      'INSERT INTO products (name, category, price_cents) VALUES ($1, $2, $3) RETURNING id',
      { bind: ['1/4 de Pollo', 'chicken', 1850], type: QueryTypes.SELECT },
    );
    expect(inserted).toEqual([{ id: 1 }]);
    expect(
      await rows(
        'SELECT is_active, created_at IS NOT NULL AS created, updated_at IS NOT NULL AS updated FROM products',
      ),
    ).toEqual([{ is_active: true, created: true, updated: true }]);
  });

  it('AC-06: los CHECK y los NOT NULL rechazan lo que la carta no permite, sin dejar fila', async () => {
    for (const args of [
      // name: vacío, solo espacios o con espacio al inicio (CHECK products_name_valid)
      ['', 'chicken', 1850],
      ['   ', 'chicken', 1850],
      [' Chicha', 'chicken', 1850],
      // name de 61 caracteres supera VARCHAR(60)
      ['x'.repeat(61), 'chicken', 1850],
      [null, 'chicken', 1850],
      // category fuera de la lista o NULL (CHECK products_category_allowed / NOT NULL)
      ['Chicha', 'pollo', 500],
      ['Chicha', 'COMBO', 500],
      ['Chicha', null, 500],
      // price_cents fuera de rango o NULL (CHECK products_price_cents_range / NOT NULL)
      ['Chicha', 'drink', -1],
      ['Chicha', 'drink', 100000],
      ['Chicha', 'drink', null],
    ] as [string | null, string | null, number | null][])
      await expect(insertProduct(...args)).rejects.toBeInstanceOf(Error);
    // is_active no admite NULL.
    await expect(
      sequelize.query(
        'INSERT INTO products (name, category, price_cents, is_active) VALUES ($1, $2, $3, NULL)',
        { bind: ['Chicha', 'drink', 500] },
      ),
    ).rejects.toBeInstanceOf(Error);
    expect(await rows('SELECT id FROM products')).toEqual([]);
  });

  it('AC-06: el índice único products_name_unique sobre lower(name) choca sin distinguir mayúsculas', async () => {
    await insertProduct('Chicha', 'drink', 500);
    for (const clash of ['chicha', 'CHICHA']) {
      const error = await insertProduct(clash, 'drink', 600).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(Error);
      expect(violatedConstraint(error)).toBe('products_name_unique');
    }
    // El índice existe y es por expresión sobre lower(name).
    const indexes = await rows<{ indexname: string; indexdef: string }>(
      "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'products' AND schemaname = current_schema()",
    );
    const unique = indexes.find((index) => index.indexname === 'products_name_unique');
    expect(unique).toBeDefined();
    expect(unique?.indexdef).toContain('UNIQUE');
    // Postgres deparsea lower() sobre varchar como lower((name)::text): el match admite ese cast
    // sin debilitar el AC (la unicidad sin distinguir mayúsculas ya se comprobó con los INSERT).
    expect(unique?.indexdef).toMatch(/lower\(\(?name/);
    expect(await rows('SELECT id FROM products')).toHaveLength(1);
  });

  it('AC-07: aplica, revierte y reaplica las migraciones en orden', async () => {
    await resetMigrationTables(sequelize);
    expect(await migrateUp(sequelize)).toEqual(MIGRATIONS);
    expect(await tableExists(sequelize, 'users')).toBe(true);
    expect(await tableExists(sequelize, 'sessions')).toBe(true);
    expect(await tableExists(sequelize, 'products')).toBe(true);
    expect(await tableExists(sequelize, 'product_portions')).toBe(true);
    expect(await tableExists(sequelize, 'combo_items')).toBe(true);

    // La última migración aplicada es la de la spec 007: revierte primero ella.
    expect(await migrateDown(sequelize)).toEqual([COMBO_ITEMS_MIGRATION]);
    expect(await tableExists(sequelize, 'combo_items')).toBe(false);
    expect(await tableExists(sequelize, 'product_portions')).toBe(true);
    expect(await migrateDown(sequelize)).toEqual([PRODUCT_PORTIONS_MIGRATION]);
    expect(await tableExists(sequelize, 'product_portions')).toBe(false);
    expect(await tableExists(sequelize, 'products')).toBe(true);
    expect(await migrateDown(sequelize)).toEqual([PRODUCTS_MIGRATION]);
    expect(await tableExists(sequelize, 'products')).toBe(false);
    expect(await tableExists(sequelize, 'users')).toBe(true);
    expect(await tableExists(sequelize, 'sessions')).toBe(true);

    // Las migraciones son reaplicables tras revertir y las tablas vuelven a funcionar.
    expect(await migrateUp(sequelize)).toEqual([
      PRODUCTS_MIGRATION,
      PRODUCT_PORTIONS_MIGRATION,
      COMBO_ITEMS_MIGRATION,
    ]);
    expect(await tableExists(sequelize, 'products')).toBe(true);
    expect(await tableExists(sequelize, 'product_portions')).toBe(true);
    expect(await tableExists(sequelize, 'combo_items')).toBe(true);
    await insertProduct('Chicha', 'drink', 500);
    expect(await rows<{ id: number }>('SELECT id FROM products')).toEqual([{ id: 1 }]);
  });
});
