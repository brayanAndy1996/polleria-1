import path from 'node:path';
import type { Sequelize } from 'sequelize';
import { QueryTypes } from 'sequelize';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MIGRATION_LOCK_KEY, migrateDown, migrateUp, seedUp } from '../src/db/migrator.ts';
import {
  AdvisoryLockHolder,
  DOCUMENTED_LOCK_KEY,
  isMigrationLockFree,
} from './helpers/advisory-lock.ts';
import {
  cleanFixtureTables,
  closeTestDatabase,
  connectTestDatabase,
  readRegisteredNames,
  resetMigrationTables,
  tableExists,
} from './helpers/test-database.ts';

/** Glob absoluto con barras normales (también en Windows) hacia los fixtures de este test. */
function fixtureGlob(folder: 'migrations' | 'migrations-failing' | 'seeders'): string {
  const directory = path.join(import.meta.dirname, 'fixtures', folder);
  return `${directory.replaceAll('\\', '/')}/*.ts`;
}

const MIGRATIONS_OPTIONS = { glob: fixtureGlob('migrations'), tableName: 'FixtureMeta' };
const FAILING_OPTIONS = { glob: fixtureGlob('migrations-failing'), tableName: 'FixtureMeta' };
const SEEDERS_OPTIONS = { glob: fixtureGlob('seeders'), tableName: 'FixtureData' };

const MIGRATION_A = '20260101000000-create-fixture-a.ts';
const MIGRATION_B = '20260101000001-create-fixture-b.ts';
const SEEDER = '20260101000000-insert-fixture-row.ts';

/** Tiempo que se espera para afirmar que una llamada sigue pendiente (spec 001, AC-43). */
const PENDING_CHECK_MS = 500;

/** Plazo para que una llamada termine después de soltar el bloqueo (spec 001, AC-43 y AC-44). */
const FINISH_DEADLINE_MS = 5000;

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/** Rechaza si la promesa no termina a tiempo; así un bloqueo que no se suelta no cuelga la prueba. */
function withDeadline<T>(promise: Promise<T>, milliseconds: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${what} no terminó en ${String(milliseconds)} ms.`));
    }, milliseconds);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/** Resultado de una llamada que se observa: permite preguntar si ya terminó sin esperarla. */
interface Watched<T> {
  promise: Promise<T>;
  isSettled: () => boolean;
}

function describeReason(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

/**
 * Devuelve los valores de las llamadas y exige que ninguna haya sido rechazada. Si alguna falló,
 * la aserción muestra el mensaje del error (por ejemplo, una llave duplicada de PostgreSQL).
 */
function expectNoneRejected<T>(results: PromiseSettledResult<T>[]): T[] {
  const reasons = results.flatMap((result) =>
    result.status === 'rejected' ? [describeReason(result.reason)] : [],
  );
  expect(reasons).toEqual([]);

  return results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
}

describe('Bloqueo consultivo de migraciones y seeds contra polleria_test', () => {
  let sequelize: Sequelize;
  let holderConnection: Sequelize;
  let holder: AdvisoryLockHolder;
  let inFlight: Promise<unknown>[] = [];

  /** Observa una llamada y la registra para esperarla antes de limpiar, pase lo que pase. */
  function watch<T>(promise: Promise<T>): Watched<T> {
    let settled = false;
    const observed = promise.finally(() => {
      settled = true;
    });
    inFlight.push(observed.catch(() => undefined));

    return { promise: observed, isSettled: () => settled };
  }

  beforeAll(async () => {
    sequelize = await connectTestDatabase();
    try {
      holderConnection = await connectTestDatabase();
    } catch (error) {
      await closeTestDatabase(sequelize);
      throw error;
    }
  });

  beforeEach(async () => {
    inFlight = [];
    holder = new AdvisoryLockHolder(holderConnection);
    await cleanFixtureTables(sequelize);
    await resetMigrationTables(sequelize);
  });

  afterEach(async () => {
    // El bloqueo se suelta siempre, también si la prueba falló; si no, las demás pruebas de
    // migraciones esperarían hasta su tiempo límite.
    await holder.release();
    await Promise.allSettled(inFlight);
    await cleanFixtureTables(sequelize);
    await resetMigrationTables(sequelize);
  });

  afterAll(async () => {
    if (sequelize === undefined) return; // la conexión falló en beforeAll
    try {
      await cleanFixtureTables(sequelize);
    } finally {
      await closeTestDatabase(holderConnection);
      await closeTestDatabase(sequelize);
    }
  });

  describe('migraciones y seeds simultáneos se serializan', () => {
    it('AC-42: dos migrateUp simultáneos sobre la misma instancia no fallan: uno aplica las dos migraciones y el otro devuelve []', async () => {
      const results = await Promise.allSettled([
        migrateUp(sequelize, MIGRATIONS_OPTIONS),
        migrateUp(sequelize, MIGRATIONS_OPTIONS),
      ]);

      const values = expectNoneRejected(results).sort(
        (first, second) => second.length - first.length,
      );
      expect(values).toEqual([[MIGRATION_A, MIGRATION_B], []]);
      expect(await readRegisteredNames(sequelize, 'FixtureMeta')).toEqual([
        MIGRATION_A,
        MIGRATION_B,
      ]);
      expect(await tableExists(sequelize, 'fixture_a')).toBe(true);
      expect(await tableExists(sequelize, 'fixture_b')).toBe(true);
    });

    it('AC-42: dos migrateUp simultáneos con dos instancias distintas (dos conexiones, como dos procesos) dan el mismo resultado', async () => {
      const other = await connectTestDatabase();
      try {
        const results = await Promise.allSettled([
          migrateUp(sequelize, MIGRATIONS_OPTIONS),
          migrateUp(other, MIGRATIONS_OPTIONS),
        ]);

        const values = expectNoneRejected(results).sort(
          (first, second) => second.length - first.length,
        );
        expect(values).toEqual([[MIGRATION_A, MIGRATION_B], []]);
        expect(await readRegisteredNames(sequelize, 'FixtureMeta')).toEqual([
          MIGRATION_A,
          MIGRATION_B,
        ]);
        expect(await tableExists(sequelize, 'fixture_a')).toBe(true);
        expect(await tableExists(sequelize, 'fixture_b')).toBe(true);
      } finally {
        await closeTestDatabase(other);
      }
    });

    it('AC-42: dos migrateDown simultáneos no fallan: cada uno revierte una migración y entre los dos revierten las dos', async () => {
      await migrateUp(sequelize, MIGRATIONS_OPTIONS);

      const results = await Promise.allSettled([
        migrateDown(sequelize, MIGRATIONS_OPTIONS),
        migrateDown(sequelize, MIGRATIONS_OPTIONS),
      ]);

      const values = expectNoneRejected(results);
      expect(values.map((names) => names.length)).toEqual([1, 1]);
      expect(values.flat().sort()).toEqual([MIGRATION_A, MIGRATION_B]);
      expect(await tableExists(sequelize, 'fixture_a')).toBe(false);
      expect(await tableExists(sequelize, 'fixture_b')).toBe(false);
    });

    it('AC-42: dos seedUp simultáneos no fallan: uno aplica el seed, el otro devuelve [] y la tabla queda con una sola fila', async () => {
      const results = await Promise.allSettled([
        seedUp(sequelize, SEEDERS_OPTIONS),
        seedUp(sequelize, SEEDERS_OPTIONS),
      ]);

      const values = expectNoneRejected(results).sort(
        (first, second) => second.length - first.length,
      );
      expect(values).toEqual([[SEEDER], []]);
      expect(await readRegisteredNames(sequelize, 'FixtureData')).toEqual([SEEDER]);

      const rows = await sequelize.query<{ total: number }>(
        'SELECT COUNT(*)::int AS total FROM fixture_seed_rows',
        { type: QueryTypes.SELECT },
      );
      expect(rows).toEqual([{ total: 1 }]);
    });
  });

  describe('el bloqueo usa la clave documentada y espera a quien lo tiene', () => {
    it('AC-43: MIGRATION_LOCK_KEY se exporta desde migrator.ts y vale 2026100701', () => {
      expect(MIGRATION_LOCK_KEY).toBe(2026100701);
      expect(MIGRATION_LOCK_KEY).toBe(DOCUMENTED_LOCK_KEY);
    });

    it('AC-43: migrateUp espera a quien tiene el bloqueo sin tocar la tabla de registro; al soltarlo termina en menos de 5 s y deja el bloqueo libre', async () => {
      await holder.acquire();

      const call = watch(migrateUp(sequelize, MIGRATIONS_OPTIONS));
      await sleep(PENDING_CHECK_MS);

      expect(call.isSettled()).toBe(false);
      expect(await tableExists(holderConnection, 'FixtureMeta')).toBe(false);
      expect(await tableExists(holderConnection, 'fixture_a')).toBe(false);

      await holder.release();
      const names = await withDeadline(call.promise, FINISH_DEADLINE_MS, 'migrateUp');

      expect(names).toEqual([MIGRATION_A, MIGRATION_B]);
      expect(await isMigrationLockFree(holderConnection)).toBe(true);
    });

    it('AC-43: seedUp espera a quien tiene el bloqueo (otra tabla de registro, misma clave) y termina al soltarlo', async () => {
      await holder.acquire();

      const call = watch(seedUp(sequelize, SEEDERS_OPTIONS));
      await sleep(PENDING_CHECK_MS);

      expect(call.isSettled()).toBe(false);
      expect(await tableExists(holderConnection, 'FixtureData')).toBe(false);
      expect(await tableExists(holderConnection, 'fixture_seed_rows')).toBe(false);

      await holder.release();
      const names = await withDeadline(call.promise, FINISH_DEADLINE_MS, 'seedUp');

      expect(names).toEqual([SEEDER]);
      expect(await isMigrationLockFree(holderConnection)).toBe(true);
    });

    it('AC-43: migrateDown espera a quien tiene el bloqueo sin revertir nada y termina al soltarlo', async () => {
      await migrateUp(sequelize, MIGRATIONS_OPTIONS);
      await holder.acquire();

      const call = watch(migrateDown(sequelize, MIGRATIONS_OPTIONS));
      await sleep(PENDING_CHECK_MS);

      expect(call.isSettled()).toBe(false);
      expect(await tableExists(holderConnection, 'fixture_b')).toBe(true);

      await holder.release();
      const names = await withDeadline(call.promise, FINISH_DEADLINE_MS, 'migrateDown');

      expect(names).toEqual([MIGRATION_B]);
      expect(await tableExists(holderConnection, 'fixture_b')).toBe(false);
      expect(await isMigrationLockFree(holderConnection)).toBe(true);
    });
  });

  describe('el bloqueo se suelta aunque la migración falle', () => {
    it('AC-44: si la migración falla, migrateUp se rechaza con su error, el bloqueo queda libre y el siguiente migrateUp termina en menos de 5 s', async () => {
      await expect(migrateUp(sequelize, FAILING_OPTIONS)).rejects.toThrow('Falla de prueba.');

      expect(await isMigrationLockFree(holderConnection)).toBe(true);

      const names = await withDeadline(
        migrateUp(sequelize, MIGRATIONS_OPTIONS),
        FINISH_DEADLINE_MS,
        'migrateUp después de la falla',
      );
      expect(names).toEqual([MIGRATION_A, MIGRATION_B]);
    });

    it('AC-44: la migración que falla sí toma el bloqueo (espera a quien lo tiene) y lo suelta al fallar', async () => {
      await holder.acquire();

      const call = watch(migrateUp(sequelize, FAILING_OPTIONS));
      await sleep(PENDING_CHECK_MS);

      expect(call.isSettled()).toBe(false);

      await holder.release();
      await expect(
        withDeadline(call.promise, FINISH_DEADLINE_MS, 'migrateUp que falla'),
      ).rejects.toThrow('Falla de prueba.');

      expect(await isMigrationLockFree(holderConnection)).toBe(true);
    });
  });
});
