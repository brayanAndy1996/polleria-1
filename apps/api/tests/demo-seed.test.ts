import bcrypt from 'bcrypt';
import { QueryTypes } from 'sequelize';
import type { QueryInterface, Sequelize } from 'sequelize';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedUp } from '../src/db/migrator.ts';
import { seedDemo } from '../src/db/seeders/20261013010000-demo.ts';
import {
  cleanFixtureTables,
  clearMenuTables,
  clearOrderTables,
  closeTestDatabase,
  connectTestDatabase,
  migrateAndClearAuthTables,
} from './helpers/test-database.ts';

const SEEDER_GLOB = `${import.meta.dirname}/../src/db/seeders/*.ts`.replaceAll('\\', '/');

describe('DEMO: datos de demostración sobre polleria_test', () => {
  let sequelize: Sequelize;
  let queryInterface: QueryInterface;

  const rows = <T extends object>(sql: string, bind?: (string | number | boolean | null)[]) =>
    sequelize.query<T>(sql, { type: QueryTypes.SELECT, bind });
  const counts = async () => {
    const result = await rows<{
      users: string;
      tables: string;
      products: string;
      portions: string;
      components: string;
    }>(`
      SELECT
        (SELECT count(*) FROM users)::text AS users,
        (SELECT count(*) FROM tables)::text AS tables,
        (SELECT count(*) FROM products)::text AS products,
        (SELECT count(*) FROM product_portions)::text AS portions,
        (SELECT count(*) FROM combo_items)::text AS components
    `);
    return result[0]!;
  };
  const applyDirectly = async (environment = 'development') => {
    await seedDemo(queryInterface, { environment });
  };

  beforeAll(async () => {
    sequelize = await connectTestDatabase();
    queryInterface = sequelize.getQueryInterface();
  });
  beforeEach(async () => {
    // Limpieza únicamente con los helpers autorizados y sus guardias de base _test.
    await cleanFixtureTables(sequelize);
    await migrateAndClearAuthTables(sequelize);
    await clearMenuTables(sequelize);
    await clearOrderTables(sequelize);
  });
  afterAll(async () => {
    await closeTestDatabase(sequelize);
  });

  it('AC-01: crea los cuatro usuarios demo con sus roles y PIN bcrypt verificable', async () => {
    await applyDirectly();
    const users = await rows<{
      username: string;
      roles: string[];
      pin_hash: string;
    }>('SELECT username, roles, pin_hash FROM users ORDER BY username');
    const pins = new Map([
      ['demo.admin', '135790'],
      ['demo.caja', '1357'],
      ['demo.cocina', '8642'],
      ['demo.mozo', '2468'],
    ]);
    expect(users.map(({ username, roles }) => ({ username, roles }))).toEqual([
      { username: 'demo.admin', roles: ['admin'] },
      { username: 'demo.caja', roles: ['cashier'] },
      { username: 'demo.cocina', roles: ['kitchen'] },
      { username: 'demo.mozo', roles: ['waiter'] },
    ]);
    for (const user of users) {
      expect(user.pin_hash).toMatch(/^\$2[aby]\$10\$/);
      expect(await bcrypt.compare(pins.get(user.username)!, user.pin_hash)).toBe(true);
      expect(user.pin_hash).not.toBe(pins.get(user.username));
    }
  });

  it('AC-02: agrega seis mesas y una carta Demo con porciones y octavos de combo coherentes', async () => {
    await applyDirectly();
    const tables = await rows<{ name: string; is_active: boolean }>(
      "SELECT name, is_active FROM tables WHERE name LIKE 'Demo %' ORDER BY name",
    );
    expect(tables).toEqual(
      Array.from({ length: 6 }, (_, index) => ({ name: `Demo ${index + 1}`, is_active: true })),
    );

    const products = await rows<{
      id: number;
      name: string;
      category: string;
      price_cents: number;
    }>(
      "SELECT id, name, category, price_cents FROM products WHERE name LIKE 'Demo %' ORDER BY name",
    );
    const byName = new Map(products.map((product) => [product.name, product]));
    expect(products.length).toBeGreaterThanOrEqual(6);
    for (const name of [
      'Demo Pollo',
      'Demo Chaufa',
      'Demo Gaseosa',
      'Demo Ají',
      'Demo Mayonesa',
      'Demo Mostrito',
    ])
      expect(byName.has(name), `falta ${name}`).toBe(true);
    expect(
      products.every(
        (product) => product.price_cents >= 0 && Number.isInteger(product.price_cents),
      ),
    ).toBe(true);

    const chicken = byName.get('Demo Pollo')!;
    const portions = await rows<{ portion: string; cut: string | null; price_cents: number }>(
      'SELECT portion, cut, price_cents FROM product_portions WHERE product_id = $1 ORDER BY portion, cut',
      [chicken.id],
    );
    expect(portions.length).toBeGreaterThanOrEqual(6);
    expect(
      portions.every(({ price_cents }) => Number.isInteger(price_cents) && price_cents >= 0),
    ).toBe(true);
    expect(portions.some(({ portion, cut }) => portion === 'eighth' && cut === 'breast')).toBe(
      true,
    );
    expect(portions.some(({ portion, cut }) => portion === 'eighth' && cut === 'leg')).toBe(true);
    expect(portions.some(({ portion, cut }) => portion === 'whole' && cut === null)).toBe(true);

    const mostrito = byName.get('Demo Mostrito')!;
    const components = await rows<{
      product_id: number;
      quantity: number;
      portion: string | null;
      cut: string | null;
    }>(
      'SELECT product_id, quantity, portion, cut FROM combo_items WHERE combo_id = $1 ORDER BY product_id, portion, cut',
      [mostrito.id],
    );
    expect(components.length).toBeGreaterThanOrEqual(2);
    const componentProducts = new Map(products.map(({ id, category }) => [id, category]));
    for (const component of components) {
      expect(Number.isInteger(component.quantity) && component.quantity > 0).toBe(true);
      if (componentProducts.get(component.product_id) === 'chicken') {
        expect(component.portion).toBeTruthy();
        if (component.portion === 'eighth' || component.portion === 'quarter')
          expect(['breast', 'leg']).toContain(component.cut);
        else expect(component.cut).toBeNull();
      } else {
        expect(component.portion).toBeNull();
        expect(component.cut).toBeNull();
      }
    }
    expect(await rows('SELECT id FROM orders')).toEqual([]);
  });

  it('AC-03: repetir el seeder directo y el registro Umzug no duplica datos', async () => {
    await applyDirectly();
    const initial = await counts();
    await applyDirectly();
    expect(await counts()).toEqual(initial);

    vi.stubEnv('NODE_ENV', 'development');
    try {
      const first = await seedUp(sequelize, { glob: SEEDER_GLOB, tableName: 'FixtureData' });
      expect(first).toEqual(['20261013010000-demo.ts']);
      const afterFirstLedgerRun = await counts();
      expect(await seedUp(sequelize, { glob: SEEDER_GLOB, tableName: 'FixtureData' })).toEqual([]);
      expect(await counts()).toEqual(afterFirstLedgerRun);
      expect(await rows<{ name: string }>('SELECT name FROM "FixtureData"')).toEqual([
        { name: '20261013010000-demo.ts' },
      ]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('AC-04: conserva usuarios, mesas, productos, porciones, componentes y pedidos existentes íntegros', async () => {
    const userResult = await sequelize.query<{ id: number }>(
      `INSERT INTO users (username, display_name, pin_hash, roles) VALUES
       ('demo.admin', 'Dueño existente', $1, ARRAY['admin','waiter']::varchar(16)[]) RETURNING id`,
      { bind: [await bcrypt.hash('9999', 4)], type: QueryTypes.SELECT },
    );
    const existingUserId = userResult[0]!.id;
    await sequelize.query("INSERT INTO tables (name, is_active) VALUES ('demo 1', false)");
    const productResult = await sequelize.query<{ id: number }>(
      "INSERT INTO products (name, category, price_cents, is_active) VALUES ('DEMO POLLO', 'chicken', 1234, false) RETURNING id",
      { type: QueryTypes.SELECT },
    );
    const chickenId = productResult[0]!.id;
    await sequelize.query(
      "INSERT INTO product_portions (product_id, portion, cut, price_cents) VALUES ($1, 'eighth', 'breast', 777)",
      { bind: [chickenId] },
    );
    const comboResult = await sequelize.query<{ id: number }>(
      "INSERT INTO products (name, category, price_cents) VALUES ('Combo existente', 'combo', 4567) RETURNING id",
      { type: QueryTypes.SELECT },
    );
    const existingComboId = comboResult[0]!.id;
    await sequelize.query(
      `INSERT INTO combo_items (combo_id, product_id, quantity, portion, cut)
       VALUES ($1, $2, 3, 'quarter', 'leg')`,
      { bind: [existingComboId, chickenId] },
    );
    const orderResult = await sequelize.query<{ id: number }>(
      'INSERT INTO orders (opened_by_user_id) VALUES ($1) RETURNING id',
      { bind: [existingUserId], type: QueryTypes.SELECT },
    );
    await sequelize.query("UPDATE tables SET current_order_id = $1 WHERE name = 'demo 1'", {
      bind: [orderResult[0]!.id],
    });
    const before = {
      user: await rows('SELECT username, display_name, pin_hash, roles, is_active FROM users'),
      table: await rows('SELECT name, is_active, current_order_id FROM tables'),
      products: await rows<{
        name: string;
        category: string;
        price_cents: number;
        is_active: boolean;
      }>('SELECT name, category, price_cents, is_active FROM products ORDER BY name'),
      portions: await rows('SELECT product_id, portion, cut, price_cents FROM product_portions'),
      components: await rows(
        'SELECT combo_id, product_id, quantity, portion, cut FROM combo_items WHERE combo_id = $1',
        [existingComboId],
      ),
      orders: await rows('SELECT id, status, opened_by_user_id FROM orders'),
    };

    await applyDirectly();
    expect(await rows("SELECT username FROM users WHERE username = 'demo.admin'")).toHaveLength(1);
    expect(await rows("SELECT name FROM tables WHERE lower(name) = lower('Demo 1')")).toHaveLength(
      1,
    );
    expect(
      await rows("SELECT name FROM products WHERE lower(name) = lower('Demo Pollo')"),
    ).toHaveLength(1);
    expect({
      user: await rows(
        'SELECT username, display_name, pin_hash, roles, is_active FROM users WHERE username = $1',
        ['demo.admin'],
      ),
      table: await rows(
        "SELECT name, is_active, current_order_id FROM tables WHERE lower(name) = lower('Demo 1')",
      ),
      products: await rows(
        "SELECT name, category, price_cents, is_active FROM products WHERE lower(name) = lower('Demo Pollo') ORDER BY name",
      ),
      portions: await rows(
        'SELECT product_id, portion, cut, price_cents FROM product_portions WHERE product_id = $1',
        [chickenId],
      ),
      components: await rows(
        'SELECT combo_id, product_id, quantity, portion, cut FROM combo_items WHERE combo_id = $1',
        [existingComboId],
      ),
      orders: await rows('SELECT id, status, opened_by_user_id FROM orders'),
    }).toMatchObject({
      user: before.user,
      table: before.table,
      products: before.products.filter(
        (row: { name: string }) => row.name.toLowerCase() === 'demo pollo',
      ),
      portions: before.portions,
      components: before.components,
      orders: before.orders,
    });
  });

  it('AC-05: rechaza production antes de escribir y permite reintentar tras fallo parcial', async () => {
    await expect(applyDirectly('production')).rejects.toThrow();
    expect(await counts()).toEqual({
      users: '0',
      tables: '0',
      products: '0',
      portions: '0',
      components: '0',
    });

    await sequelize.query(`
      CREATE FUNCTION fail_demo_table_insert() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'injected demo seed failure'; END;
      $$
    `);
    await sequelize.query(`CREATE TRIGGER fail_demo_table_insert BEFORE INSERT ON tables
      FOR EACH ROW WHEN (NEW.name = 'Demo 3') EXECUTE FUNCTION fail_demo_table_insert()`);
    try {
      await expect(applyDirectly()).rejects.toThrow();
      expect(await counts()).toEqual({
        users: '0',
        tables: '0',
        products: '0',
        portions: '0',
        components: '0',
      });
    } finally {
      await sequelize.query('DROP TRIGGER IF EXISTS fail_demo_table_insert ON tables');
      await sequelize.query('DROP FUNCTION IF EXISTS fail_demo_table_insert()');
    }

    await expect(applyDirectly()).resolves.toBeUndefined();
    expect(await counts()).toMatchObject({ users: '4', tables: '6' });
  });
});
