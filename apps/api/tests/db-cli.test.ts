import type { Sequelize } from 'sequelize';
import { QueryTypes } from 'sequelize';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildChildEnv, killAllChildProcesses, runCli } from './helpers/child-process.ts';
import {
  closeTestDatabase,
  connectTestDatabase,
  getTestDatabaseUrl,
  resetMigrationTables,
} from './helpers/test-database.ts';
import {
  UNREACHABLE_DATABASE_SECRET,
  UNREACHABLE_DATABASE_URL,
} from './helpers/unreachable-database.ts';

const UNKNOWN_COMMAND_MESSAGE = 'Comando desconocido. Usa: migrate, migrate:undo, seed o demo.';

describe('Comandos de base de datos (apps/api/src/db/cli.ts)', () => {
  let sequelize: Sequelize;
  let testDatabaseUrl: string;

  /** Entorno del hijo: DATABASE_URL de polleria_test y NODE_ENV=test. */
  function cliEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
    return buildChildEnv({
      DATABASE_URL: testDatabaseUrl,
      NODE_ENV: 'test',
      HOST: undefined,
      PORT: undefined,
      ...overrides,
    });
  }

  beforeAll(async () => {
    sequelize = await connectTestDatabase();
    testDatabaseUrl = getTestDatabaseUrl();
  });

  beforeEach(async () => {
    await resetMigrationTables(sequelize);
  });

  afterEach(async () => {
    await killAllChildProcesses();
  });

  afterAll(async () => {
    await closeTestDatabase(sequelize);
  });

  it('AC-24: migrate dos veces termina con código 0 y la segunda dice que no hay migraciones pendientes', async () => {
    const first = await runCli(['migrate'], cliEnv());
    const second = await runCli(['migrate'], cliEnv());

    expect(first.timedOut).toBe(false);
    expect(first.code).toBe(0);
    expect(second.timedOut).toBe(false);
    expect(second.code).toBe(0);
    expect(second.stdout).toContain('No hay migraciones pendientes.');
  });

  it('AC-24: seed dos veces termina con código 0 y la segunda dice que no hay seeds pendientes', async () => {
    // La prueba usa explícitamente polleria_test; seed es dev-only y el entorno de desarrollo
    // aquí solo autoriza la lógica del seeder, nunca una conexión a polleria_dev.
    const testSeedEnv = cliEnv({ NODE_ENV: 'development' });
    const migrations = await runCli(['migrate'], testSeedEnv);
    expect(migrations.timedOut).toBe(false);
    expect(migrations.code).toBe(0);
    const first = await runCli(['seed'], testSeedEnv);
    const second = await runCli(['seed'], testSeedEnv);

    expect(first.timedOut).toBe(false);
    expect(first.code).toBe(0);
    expect(second.timedOut).toBe(false);
    expect(second.code).toBe(0);
    expect(second.stdout).toContain('No hay seeds pendientes.');
  });

  it('AC-DEMO: demo en development migra y siembra en una sola orden idempotente', async () => {
    const testDemoEnv = cliEnv({ NODE_ENV: 'development' });
    const first = await runCli(['demo'], testDemoEnv);
    const second = await runCli(['demo'], testDemoEnv);

    expect(first.timedOut).toBe(false);
    expect(first.code).toBe(0);
    expect(second.timedOut).toBe(false);
    expect(second.code).toBe(0);
    expect(second.stdout).toMatch(
      /no hay migraciones pendientes|ya está aplicado|no hay seeds pendientes/i,
    );
    const counts = await sequelize.query<{ users: number; tables: number }>(
      `SELECT (SELECT count(*)::integer FROM users) AS users,
              (SELECT count(*)::integer FROM tables) AS tables`,
      { type: QueryTypes.SELECT },
    );
    expect(counts).toEqual([{ users: 4, tables: 6 }]);
  });

  it('AC-DEMO: rechaza demo en production antes de intentar conectar o migrar', async () => {
    const result = await runCli(
      ['demo'],
      cliEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://user:pass@127.0.0.1:1/must_not_connect',
      }),
    );

    expect(result.timedOut).toBe(false);
    expect(result.code).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/development|desarrollo/i);
    expect(`${result.stdout}\n${result.stderr}`).not.toContain(
      'No se pudo conectar con la base de datos.',
    );
  });

  it('AC-24: migrate:undo sin migraciones aplicadas termina con 0 y avisa; luego migrate también termina con 0', async () => {
    const undo = await runCli(['migrate:undo'], cliEnv());
    const migrate = await runCli(['migrate'], cliEnv());

    expect(undo.timedOut).toBe(false);
    expect(undo.code).toBe(0);
    expect(undo.stdout).toContain('No hay migraciones para revertir.');
    expect(migrate.timedOut).toBe(false);
    expect(migrate.code).toBe(0);
  });

  it.each([
    ['un comando desconocido (borrar)', ['borrar']],
    ['ningún comando', []],
  ])('AC-24: %s termina con código 1 y explica los comandos válidos', async (_nombre, args) => {
    const result = await runCli(args, cliEnv());

    expect(result.timedOut).toBe(false);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(UNKNOWN_COMMAND_MESSAGE);
  });

  it('AC-24: con una base inalcanzable termina con código 1, avisa y no filtra la clave', async () => {
    const result = await runCli(['migrate'], cliEnv({ DATABASE_URL: UNREACHABLE_DATABASE_URL }));

    expect(result.timedOut).toBe(false);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('No se pudo conectar con la base de datos.');
    expect(result.stderr).not.toContain(UNREACHABLE_DATABASE_SECRET);
    expect(result.stdout).not.toContain(UNREACHABLE_DATABASE_SECRET);
  });

  it('AC-24: sin DATABASE_URL termina con código 1 y avisa de la configuración inválida', async () => {
    const result = await runCli(['migrate'], cliEnv({ DATABASE_URL: undefined }));

    expect(result.timedOut).toBe(false);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Configuración inválida.');
  });
});
