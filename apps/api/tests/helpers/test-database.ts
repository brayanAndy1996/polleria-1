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
 * `users` y `sessions` (D-005-10 y sección 12); la 006 autorizó `product_portions` (D-006-10),
 * que va antes que `products` porque la referencia con una FK.
 */
export async function resetMigrationTables(sequelize: Sequelize): Promise<void> {
  await dropTables(sequelize, [
    'product_portions',
    'products',
    'sessions',
    'users',
    ...MIGRATION_TABLES,
  ]);
}

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
 * Vacía las tablas de la carta: `product_portions` (spec 006, D-006-10) y `products` (spec 005,
 * D-005-10), autorizadas a la limpieza de pruebas igual que users y sessions.
 * `product_portions` se trunca antes que `products` porque la referencia con una FK. Llamar
 * después de migrateUp (o de migrateAndClearAuthTables). Si una tabla aún no existe —por
 * ejemplo en la fase roja, cuando la migración no está escrita— no hace nada: así la prueba
 * falla por lo que verifica y no en la limpieza.
 */
export async function clearMenuTables(sequelize: Sequelize): Promise<void> {
  await assertConnectedToTestDatabase(sequelize);
  if (await tableExists(sequelize, 'product_portions'))
    await sequelize.query('TRUNCATE product_portions RESTART IDENTITY');
  if (await tableExists(sequelize, 'products'))
    await sequelize.query('TRUNCATE products RESTART IDENTITY');
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
