import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { QueryInterface, Sequelize } from 'sequelize';
import { SequelizeStorage, Umzug } from 'umzug';
import type { MigrationFn, MigrationParams, RunnableMigration } from 'umzug';

/**
 * Clave del bloqueo consultivo de PostgreSQL que serializa migraciones y seeds (spec 001, D-13):
 * la fecha de la enmienda (2026-10-07) más 01. Es el registro de claves del proyecto: una spec
 * futura que use bloqueos consultivos agrega aquí su clave y no reutiliza esta.
 *
 *   2026100701 = migraciones y seeds
 */
export const MIGRATION_LOCK_KEY = 2026100701;

export interface MigratorOptions {
  /** Glob absoluto con barras normales (/) hacia los archivos .ts. Por defecto, las carpetas reales. */
  glob?: string;
  /** Tabla donde se registra lo aplicado. Por defecto, SequelizeMeta (migraciones) o SequelizeData (seeds). */
  tableName?: string;
}

interface MigratorDefaults {
  glob: string;
  tableName: string;
}

/** Glob absoluto con barras normales: tinyglobby (umzug) no acepta barras invertidas en Windows. */
function folderGlob(folder: string): string {
  return path
    .join(import.meta.dirname, folder, '*.ts')
    .split(path.sep)
    .join('/');
}

const MIGRATIONS: MigratorDefaults = { glob: folderGlob('migrations'), tableName: 'SequelizeMeta' };

// SUPUESTO S-06: cada seed se aplica una sola vez, por eso tiene su propia tabla de registro.
const SEEDERS: MigratorDefaults = { glob: folderGlob('seeders'), tableName: 'SequelizeData' };

interface MigrationModule {
  up: MigrationFn<QueryInterface>;
  down: MigrationFn<QueryInterface>;
}

function isMigrationModule(value: unknown): value is MigrationModule {
  return (
    typeof value === 'object' &&
    value !== null &&
    'up' in value &&
    typeof value.up === 'function' &&
    'down' in value &&
    typeof value.down === 'function'
  );
}

/** Carga un archivo .ts con import dinámico (type stripping de Node; también dentro de Vitest). */
async function loadMigrationModule(name: string, filePath: string): Promise<MigrationModule> {
  const loaded: unknown = await import(/* @vite-ignore */ pathToFileURL(filePath).href);

  if (!isMigrationModule(loaded)) {
    throw new Error(`El archivo ${name} debe exportar las funciones up y down.`);
  }

  return loaded;
}

function resolveMigration({
  name,
  path: filePath,
}: MigrationParams<QueryInterface>): RunnableMigration<QueryInterface> {
  if (filePath === undefined) {
    throw new Error(`La migración ${name} no tiene una ruta de archivo.`);
  }

  return {
    name,
    path: filePath,
    up: async (params) => (await loadMigrationModule(name, filePath)).up(params),
    down: async (params) => (await loadMigrationModule(name, filePath)).down(params),
  };
}

function createMigrator(
  sequelize: Sequelize,
  options: MigratorOptions,
  defaults: MigratorDefaults,
): Umzug<QueryInterface> {
  const tableName = options.tableName ?? defaults.tableName;

  return new Umzug<QueryInterface>({
    migrations: { glob: options.glob ?? defaults.glob, resolve: resolveMigration },
    context: sequelize.getQueryInterface(),
    // modelName igual a tableName: así cada tabla de registro tiene su propio modelo en la misma
    // instancia de Sequelize (SequelizeMeta, SequelizeData, y las de prueba).
    storage: new SequelizeStorage({ sequelize, tableName, modelName: tableName }),
    // El detalle de lo aplicado lo imprime cli.ts, en español.
    logger: undefined,
  });
}

/**
 * Ejecuta `operation` con el bloqueo consultivo de migraciones y seeds tomado (spec 001, D-13).
 *
 * El bloqueo es de transacción (pg_advisory_xact_lock) y vive en una transacción propia que fija
 * una conexión del pool durante toda la operación: un bloqueo de sesión solo se suelta desde la
 * conexión que lo tomó, y el pool podría entregar otra. `operation` no usa esa transacción (no hay
 * CLS), así que las migraciones se ejecutan como siempre, en sus propias conexiones. El bloqueo se
 * toma antes de leer o crear la tabla de registro y se suelta al terminar, también si falla.
 *
 * Si otra conexión lo tiene, la consulta espera sin límite de tiempo (SUPUESTO S-15).
 */
async function withMigrationLock<T>(sequelize: Sequelize, operation: () => Promise<T>): Promise<T> {
  const lockTransaction = await sequelize.transaction();

  try {
    await sequelize.query('SELECT pg_advisory_xact_lock($1)', {
      bind: [MIGRATION_LOCK_KEY],
      transaction: lockTransaction,
    });

    return await operation();
  } finally {
    // Si el rollback falla es porque la conexión se perdió, y PostgreSQL suelta el bloqueo al
    // cerrarla. Ese error no debe tapar el de la operación.
    await lockTransaction.rollback().catch(() => undefined);
  }
}

/** Ejecuta una operación de umzug bajo el bloqueo y devuelve los nombres que procesó. */
function runLocked(
  sequelize: Sequelize,
  options: MigratorOptions,
  defaults: MigratorDefaults,
  run: (migrator: Umzug<QueryInterface>) => Promise<{ name: string }[]>,
): Promise<string[]> {
  return withMigrationLock(sequelize, async () => {
    const processed = await run(createMigrator(sequelize, options, defaults));

    return processed.map((migration) => migration.name);
  });
}

/** Aplica las migraciones pendientes en orden alfabético. Devuelve los nombres aplicados. */
export function migrateUp(sequelize: Sequelize, options: MigratorOptions = {}): Promise<string[]> {
  return runLocked(sequelize, options, MIGRATIONS, (migrator) => migrator.up());
}

/** Revierte solo la última migración aplicada. Devuelve [] si no hay ninguna. */
export function migrateDown(
  sequelize: Sequelize,
  options: MigratorOptions = {},
): Promise<string[]> {
  return runLocked(sequelize, options, MIGRATIONS, (migrator) => migrator.down());
}

/** Aplica los seeds que aún no se aplicaron. Devuelve los nombres aplicados. */
export function seedUp(sequelize: Sequelize, options: MigratorOptions = {}): Promise<string[]> {
  return runLocked(sequelize, options, SEEDERS, (migrator) => migrator.up());
}
