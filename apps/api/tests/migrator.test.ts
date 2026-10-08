import path from 'node:path';
import type { Sequelize } from 'sequelize';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrateDown, migrateUp, seedUp } from '../src/db/migrator.ts';
import {
  cleanFixtureTables,
  closeTestDatabase,
  connectTestDatabase,
  readRegisteredNames,
  resetMigrationTables,
  tableExists,
} from './helpers/test-database.ts';

/** Glob absoluto con barras normales (también en Windows) hacia los fixtures de este test. */
function fixtureGlob(folder: 'migrations' | 'seeders'): string {
  const directory = path.join(import.meta.dirname, 'fixtures', folder);
  return `${directory.replaceAll('\\', '/')}/*.ts`;
}

const MIGRATIONS_OPTIONS = { glob: fixtureGlob('migrations'), tableName: 'FixtureMeta' };
const SEEDERS_OPTIONS = { glob: fixtureGlob('seeders'), tableName: 'FixtureData' };

const MIGRATION_A = '20260101000000-create-fixture-a.ts';
const MIGRATION_B = '20260101000001-create-fixture-b.ts';
const SEEDER = '20260101000000-insert-fixture-row.ts';

describe('Migraciones y seeds contra polleria_test', () => {
  let sequelize: Sequelize;

  beforeAll(async () => {
    sequelize = await connectTestDatabase();
  });

  beforeEach(async () => {
    await cleanFixtureTables(sequelize);
    await resetMigrationTables(sequelize);
  });

  afterAll(async () => {
    if (sequelize === undefined) return; // la conexión falló en beforeAll
    try {
      await cleanFixtureTables(sequelize);
    } finally {
      await closeTestDatabase(sequelize);
    }
  });

  describe('migrateUp con las migraciones reales', () => {
    it('AC-21: ejecutarlo dos veces no lanza error, crea SequelizeMeta y la segunda llamada devuelve []', async () => {
      expect(await tableExists(sequelize, 'SequelizeMeta')).toBe(false);

      await expect(migrateUp(sequelize)).resolves.toBeInstanceOf(Array);
      const second = await migrateUp(sequelize);

      expect(await tableExists(sequelize, 'SequelizeMeta')).toBe(true);
      expect(second).toEqual([]);
    });
  });

  describe('migrateUp y migrateDown con migraciones de prueba', () => {
    it('AC-22: migrateUp aplica las migraciones en orden alfabético y las registra en FixtureMeta', async () => {
      const applied = await migrateUp(sequelize, MIGRATIONS_OPTIONS);

      expect(applied).toEqual([MIGRATION_A, MIGRATION_B]);
      expect(await tableExists(sequelize, 'fixture_a')).toBe(true);
      expect(await tableExists(sequelize, 'fixture_b')).toBe(true);
      expect(await readRegisteredNames(sequelize, 'FixtureMeta')).toEqual([
        MIGRATION_A,
        MIGRATION_B,
      ]);
    });

    it('AC-22: migrateDown revierte solo la última migración y deja registrada la anterior', async () => {
      await migrateUp(sequelize, MIGRATIONS_OPTIONS);

      const reverted = await migrateDown(sequelize, MIGRATIONS_OPTIONS);

      expect(reverted).toEqual([MIGRATION_B]);
      expect(await tableExists(sequelize, 'fixture_b')).toBe(false);
      expect(await tableExists(sequelize, 'fixture_a')).toBe(true);
      expect(await readRegisteredNames(sequelize, 'FixtureMeta')).toEqual([MIGRATION_A]);
    });

    it('AC-22: un segundo migrateDown revierte la siguiente migración y un tercero devuelve []', async () => {
      await migrateUp(sequelize, MIGRATIONS_OPTIONS);
      await migrateDown(sequelize, MIGRATIONS_OPTIONS);

      const secondRevert = await migrateDown(sequelize, MIGRATIONS_OPTIONS);
      const thirdRevert = await migrateDown(sequelize, MIGRATIONS_OPTIONS);

      expect(secondRevert).toEqual([MIGRATION_A]);
      expect(await tableExists(sequelize, 'fixture_a')).toBe(false);
      expect(thirdRevert).toEqual([]);
    });

    it('AC-22: migrateDown sin migraciones aplicadas devuelve []', async () => {
      await expect(migrateDown(sequelize, MIGRATIONS_OPTIONS)).resolves.toEqual([]);
    });

    it('AC-22: migrateUp vuelve a aplicar solo la migración revertida', async () => {
      await migrateUp(sequelize, MIGRATIONS_OPTIONS);
      await migrateDown(sequelize, MIGRATIONS_OPTIONS);

      const reapplied = await migrateUp(sequelize, MIGRATIONS_OPTIONS);

      expect(reapplied).toEqual([MIGRATION_B]);
      expect(await tableExists(sequelize, 'fixture_b')).toBe(true);
    });
  });

  describe('seedUp', () => {
    it('AC-23: con los seeders reales no lanza error, crea SequelizeData y la segunda llamada devuelve []', async () => {
      expect(await tableExists(sequelize, 'SequelizeData')).toBe(false);

      await expect(seedUp(sequelize)).resolves.toBeInstanceOf(Array);
      const second = await seedUp(sequelize);

      expect(await tableExists(sequelize, 'SequelizeData')).toBe(true);
      expect(second).toEqual([]);
    });

    it('AC-23: un seeder de prueba se aplica una sola vez (una fila, segunda llamada devuelve [])', async () => {
      const first = await seedUp(sequelize, SEEDERS_OPTIONS);
      const second = await seedUp(sequelize, SEEDERS_OPTIONS);

      expect(first).toEqual([SEEDER]);
      expect(second).toEqual([]);
      expect(await readRegisteredNames(sequelize, 'FixtureData')).toEqual([SEEDER]);

      const [rows] = await sequelize.query('SELECT COUNT(*)::int AS total FROM fixture_seed_rows');
      expect(rows).toEqual([{ total: 1 }]);
    });
  });
});
