/**
 * Helpers de la base de pruebas (RN-001-02).
 *
 * Reglas que cumple este archivo:
 * - Solo usa DATABASE_URL_TEST (del entorno o de apps/api/.env). Nunca lee DATABASE_URL, la de
 *   desarrollo.
 * - Verifica la URL con assertTestDatabase antes de conectar y, ya conectado, comprueba con
 *   `SELECT current_database()` que la base termina en _test antes de cualquier limpieza.
 * - Nunca crea ni borra bases ni roles. La limpieza solo borra tablas que crean las pruebas.
 * - Ningún mensaje de error incluye la URL ni la clave.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize';
import { assertTestDatabase } from '../../src/db/assert-test-database.ts';
import { createSequelize } from '../../src/db/sequelize.ts';
import { migrateUp } from '../../src/db/migrator.ts';

const API_ENV_FILE = path.resolve(import.meta.dirname, '../../.env');

const CONNECTION_ERROR_MESSAGE =
  'No se pudo conectar a la base de pruebas polleria_test. ' +
  'Revisa DATABASE_URL_TEST y que PostgreSQL esté encendido.';

/** Tablas que crean solo las pruebas (fixtures de migraciones y seeds). */
const FIXTURE_TABLES = [
  'fixture_a',
  'fixture_b',
  'fixture_seed_rows',
  'FixtureMeta',
  'FixtureData',
] as const;

/** Tablas de registro de umzug que crea el código real (migrator.ts). */
const MIGRATION_TABLES = ['SequelizeMeta', 'SequelizeData'] as const;

/**
 * Devuelve DATABASE_URL_TEST, del entorno o de apps/api/.env (sin sobrescribir variables ya
 * definidas y sin copiar nada más del archivo al entorno). Falla con un mensaje claro si falta o si
 * no apunta a una base _test.
 */
export function getTestDatabaseUrl(): string {
  let value = process.env.DATABASE_URL_TEST;

  if ((value === undefined || value.trim() === '') && existsSync(API_ENV_FILE)) {
    value = parseEnv(readFileSync(API_ENV_FILE, 'utf8')).DATABASE_URL_TEST;
  }

  if (value === undefined || value.trim() === '') {
    throw new Error(
      'Falta DATABASE_URL_TEST. Las pruebas de integración usan la base polleria_test: ' +
        'defínela en apps/api/.env (copia apps/api/.env.example) o como variable de entorno. ' +
        'Nunca uses la base de desarrollo.',
    );
  }

  assertTestDatabase(value);
  return value;
}

/** Devuelve el nombre de la base a la que está conectada la instancia. */
async function readCurrentDatabase(sequelize: Sequelize): Promise<string> {
  const rows = await sequelize.query<{ name: string }>('SELECT current_database() AS name', {
    type: QueryTypes.SELECT,
  });
  return rows[0]?.name ?? '';
}

/**
 * Comprueba con `SELECT current_database()` que la conexión apunta a una base _test. Se llama
 * antes de cualquier limpieza o sync.
 */
export async function assertConnectedToTestDatabase(sequelize: Sequelize): Promise<string> {
  const name = await readCurrentDatabase(sequelize);

  if (!/^[a-z0-9_]+_test$/.test(name)) {
    throw new Error(
      'Por seguridad, las pruebas solo pueden usar una base cuyo nombre termine en _test. ' +
        `La conexión actual apunta a "${name}".`,
    );
  }

  return name;
}

/**
 * Conecta a polleria_test: valida la URL, abre la conexión, la prueba y verifica la base. Si algo
 * falla, cierra la conexión y lanza un error en español sin datos sensibles.
 */
export async function connectTestDatabase(): Promise<Sequelize> {
  const url = getTestDatabaseUrl();
  const sequelize = createSequelize(url);

  try {
    await sequelize.authenticate();
  } catch {
    await sequelize.close().catch(() => undefined);
    throw new Error(CONNECTION_ERROR_MESSAGE);
  }

  try {
    await assertConnectedToTestDatabase(sequelize);
  } catch (error) {
    await sequelize.close().catch(() => undefined);
    throw error;
  }

  return sequelize;
}

/** Cierra la conexión al terminar las pruebas del archivo. */
export async function closeTestDatabase(sequelize: Sequelize | undefined): Promise<void> {
  await sequelize?.close();
}

async function dropTables(sequelize: Sequelize, tables: readonly string[]): Promise<void> {
  await assertConnectedToTestDatabase(sequelize);

  for (const table of tables) {
    await sequelize.query(`DROP TABLE IF EXISTS "${table}"`);
  }
}

/**
 * Borra solo lo que crean las pruebas de migraciones y seeds: las tablas de fixtures y las tablas
 * de registro FixtureMeta y FixtureData. Siempre después de la doble verificación.
 */
export async function cleanFixtureTables(sequelize: Sequelize): Promise<void> {
  await dropTables(sequelize, FIXTURE_TABLES);
}

/**
 * Borra las tablas de dominio y las de registro SequelizeMeta y SequelizeData que crea el
 * migrador real, para que cada prueba compruebe que el código las crea (y no que quedaron de una
 * corrida anterior).
 *
 * La lista crece con cada spec que agrega una migración: sin borrar las tablas de dominio, volver
 * a migrar fallaría con "la tabla ya existe". La spec 005 autorizó limpiar `products` igual que
 * `users` y `sessions` (D-005-10 y sección 12); la 006 autorizó `product_portions` (D-006-10);
 * la 007 autorizó `combo_items` (D-007-14); la 009 autorizó `tables` y `orders` (D-009-15);
 * la 010 autorizó las cinco tablas de ítems (order_item_sauces, order_item_components,
 * order_items, idempotency_keys, kitchen_tickets) (D-010-19).
 * Las tablas de la carta van antes que `products` porque la referencian con una FK (combo_items
 * la referencia dos veces). Las cinco de ítems van antes que `orders` y `users` por sus FK
 * (order_items→orders/users/products, order_item_components/sauces→order_items/products,
 * kitchen_tickets→orders/users, idempotency_keys→orders). `tables` va antes que `orders`
 * por la FK tables.current_order_id, y ambas antes que `users` por las FK orders→users
 * (D-009-15).
 */
export async function resetMigrationTables(sequelize: Sequelize): Promise<void> {
  await dropTables(sequelize, [
    'order_item_sauces',
    'order_item_components',
    'order_items',
    'idempotency_keys',
    'kitchen_tickets',
    'tables',
    'orders',
    'combo_items',
    'product_portions',
    'products',
    'sessions',
    'users',
    ...MIGRATION_TABLES,
  ]);
}

/**
 * Vacía usuarios y sesiones. El CASCADE también alcanza `orders` y `tables` desde la spec 009
 * (FK orders→users y tables→orders): truncar usuarios vacía pedidos y mesas — efecto buscado
 * en las pruebas de auth, que igual llaman a `clearOrderTables` de forma explícita (D-009-15:
 * se documenta, no se depende del CASCADE).
 */
export async function clearAuthTables(sequelize: Sequelize): Promise<void> {
  await assertConnectedToTestDatabase(sequelize);
  await sequelize.query('TRUNCATE sessions, users RESTART IDENTITY CASCADE');
}

export async function migrateAndClearAuthTables(sequelize: Sequelize): Promise<void> {
  await assertConnectedToTestDatabase(sequelize);
  await migrateUp(sequelize);
  await clearAuthTables(sequelize);
}

/**
 * Vacía las tablas de la carta: `combo_items` (spec 007, D-007-14), `product_portions` (spec 006,
 * D-006-10) y `products` (spec 005, D-005-10), autorizadas a la limpieza de pruebas igual que
 * users y sessions. Llamar después de migrateUp (o de migrateAndClearAuthTables).
 *
 * `combo_items` y `product_portions` referencian `products` con una FK (combo_items dos veces:
 * `combo_id` y `product_id`) y PostgreSQL bloquea `TRUNCATE` sobre una tabla referenciada, aunque
 * esté vacía: por eso todas las que existen se truncan en UN solo comando (un TRUNCATE por tabla
 * falla con "cannot truncate a table referenced in a foreign key constraint"). Ninguna puede
 * existir sin `products` por esa misma FK.
 *
 * Cada tabla va detrás de su `tableExists`: en la fase roja, cuando la migración de la tabla aún
 * no está escrita, se trunca solo lo que hay; si ninguna existe no hace nada: así la prueba falla
 * por lo que verifica y no en la limpieza.
 */
export async function clearMenuTables(sequelize: Sequelize): Promise<void> {
  await assertConnectedToTestDatabase(sequelize);
  const tables: string[] = [];
  for (const table of ['combo_items', 'product_portions', 'products']) {
    if (await tableExists(sequelize, table)) tables.push(table);
  }
  if (tables.length > 0) {
    await sequelize.query(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY`);
  }
}

/**
 * Vacía las tablas del salón: las cinco de ítems de la spec 010 (order_item_sauces,
 * order_item_components, order_items, idempotency_keys, kitchen_tickets, D-010-19) junto
 * con `orders` y `tables` (spec 009, D-009-15), autorizadas a la limpieza de pruebas igual
 * que `products` y `combo_items`. Llamar después de migrateUp (o de migrateAndClearAuthTables).
 *
 * Las tablas se referencian entre sí (components/sauces→order_items, order_items y
 * kitchen_tickets→orders, idempotency_keys→orders, tables→orders) y PostgreSQL bloquea
 * `TRUNCATE` sobre una tabla referenciada aunque esté vacía: por eso las que existen se
 * truncan en UN solo comando (mismo criterio que clearMenuTables).
 *
 * Cada tabla va detrás de su `tableExists`: en la fase roja, cuando la migración aún no está
 * escrita, se trunca solo lo que hay; si ninguna existe no hace nada.
 */
export async function clearOrderTables(sequelize: Sequelize): Promise<void> {
  await assertConnectedToTestDatabase(sequelize);
  const existing: string[] = [];
  for (const table of [
    'order_item_sauces',
    'order_item_components',
    'order_items',
    'idempotency_keys',
    'kitchen_tickets',
    'orders',
    'tables',
  ]) {
    if (await tableExists(sequelize, table)) existing.push(table);
  }
  if (existing.length > 0) {
    await sequelize.query(`TRUNCATE ${existing.join(', ')} RESTART IDENTITY`);
  }
}

/** Indica si existe una tabla en el esquema actual (el nombre distingue mayúsculas). */
export async function tableExists(sequelize: Sequelize, tableName: string): Promise<boolean> {
  const rows = await sequelize.query<{ table_name: string }>(
    'SELECT table_name FROM information_schema.tables ' +
      'WHERE table_schema = current_schema() AND table_name = :tableName',
    { type: QueryTypes.SELECT, replacements: { tableName } },
  );
  return rows.length > 0;
}

/** Devuelve la columna name de una tabla de registro de umzug, en orden alfabético. */
export async function readRegisteredNames(
  sequelize: Sequelize,
  tableName: 'SequelizeMeta' | 'SequelizeData' | 'FixtureMeta' | 'FixtureData',
): Promise<string[]> {
  const rows = await sequelize.query<{ name: string }>(
    `SELECT name FROM "${tableName}" ORDER BY name`,
    { type: QueryTypes.SELECT },
  );
  return rows.map((row) => row.name);
}
