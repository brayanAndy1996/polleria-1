import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { QueryInterface, Sequelize } from 'sequelize';
import { SequelizeStorage, Umzug } from 'umzug';
import type { MigrationFn, MigrationParams, RunnableMigration } from 'umzug';

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

/** Aplica las migraciones pendientes en orden alfabético. Devuelve los nombres aplicados. */
export async function migrateUp(
  sequelize: Sequelize,
  options: MigratorOptions = {},
): Promise<string[]> {
  const applied = await createMigrator(sequelize, options, MIGRATIONS).up();

  return applied.map((migration) => migration.name);
}

/** Revierte solo la última migración aplicada. Devuelve [] si no hay ninguna. */
export async function migrateDown(
  sequelize: Sequelize,
  options: MigratorOptions = {},
): Promise<string[]> {
  const reverted = await createMigrator(sequelize, options, MIGRATIONS).down();

  return reverted.map((migration) => migration.name);
}

/** Aplica los seeds que aún no se aplicaron. Devuelve los nombres aplicados. */
export async function seedUp(
  sequelize: Sequelize,
  options: MigratorOptions = {},
): Promise<string[]> {
  const applied = await createMigrator(sequelize, options, SEEDERS).up();

  return applied.map((seed) => seed.name);
}
