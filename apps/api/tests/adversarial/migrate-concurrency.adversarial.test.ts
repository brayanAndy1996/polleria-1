/**
 * Ataque de concurrencia a las migraciones (adversarial-tester, spec 001, AC-21).
 *
 * Escenario real: dos procesos `migrate` sobre polleria_test al mismo tiempo (por ejemplo, un
 * `pnpm db:migrate` disparado dos veces, o `node --watch` reiniciando mientras alguien migra a
 * mano). AC-21 solo garantiza que migrar es idempotente en SECUENCIA; no dice nada de concurrencia.
 *
 * Hallazgo (ADV-001-06, Bajo): dos migrateUp concurrentes corren una carrera al crear las tablas y
 * una de las llamadas falla con un error crudo del driver de PostgreSQL ("llave duplicada viola
 * restricción de unicidad ..."), en lugar de serializarse o fallar con un error controlado. La CLI
 * lo propagaría como "No se pudo completar el comando migrate: <mensaje del driver>".
 *
 * Usa los fixtures del test-writer (solo lectura) y deja polleria_test limpia al terminar.
 */
import path from 'node:path';
import type { Sequelize } from 'sequelize';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrateUp } from '../../src/db/migrator.ts';
import {
  cleanFixtureTables,
  closeTestDatabase,
  connectTestDatabase,
  resetMigrationTables,
} from '../helpers/test-database.ts';

function fixtureMigrationsGlob(): string {
  const directory = path.join(import.meta.dirname, '..', 'fixtures', 'migrations');
  return `${directory.replaceAll('\\', '/')}/*.ts`;
}

const OPTIONS = { glob: fixtureMigrationsGlob(), tableName: 'FixtureMeta' };

describe('Concurrencia de migraciones contra polleria_test', () => {
  let sequelize: Sequelize;

  beforeAll(async () => {
    sequelize = await connectTestDatabase();
  });

  beforeEach(async () => {
    await cleanFixtureTables(sequelize);
    await resetMigrationTables(sequelize);
  });

  afterEach(async () => {
    await cleanFixtureTables(sequelize);
    await resetMigrationTables(sequelize);
  });

  afterAll(async () => {
    if (sequelize === undefined) return;
    await closeTestDatabase(sequelize);
  });

  // ADV-001-06 (Bajo): dos migrateUp a la vez no deberían lanzar un error crudo del driver.
  it('ADV-001-06: dos migrateUp concurrentes no deberían fallar con un error crudo del driver', async () => {
    const results = await Promise.allSettled([
      migrateUp(sequelize, OPTIONS),
      migrateUp(sequelize, OPTIONS),
    ]);

    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );

    const reasons = rejected.map((result) =>
      result.reason instanceof Error ? result.reason.message : String(result.reason),
    );

    // Propiedad deseada: la concurrencia se serializa o falla de forma controlada; ninguna llamada
    // debería propagar un error de unicidad del propio PostgreSQL.
    expect(reasons.join(' | ')).not.toMatch(/llave duplicada|duplicate key|already exists/i);
    expect(rejected).toHaveLength(0);
  });
});
