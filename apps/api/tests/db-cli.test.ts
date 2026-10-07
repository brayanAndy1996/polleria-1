import type { Sequelize } from 'sequelize';
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

const UNKNOWN_COMMAND_MESSAGE = 'Comando desconocido. Usa: migrate, migrate:undo o seed.';

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
    const first = await runCli(['seed'], cliEnv());
    const second = await runCli(['seed'], cliEnv());

    expect(first.timedOut).toBe(false);
    expect(first.code).toBe(0);
    expect(second.timedOut).toBe(false);
    expect(second.code).toBe(0);
    expect(second.stdout).toContain('No hay seeds pendientes.');
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
