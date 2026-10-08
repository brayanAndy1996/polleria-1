import { afterEach, describe, expect, it } from 'vitest';
import {
  buildChildEnv,
  getFreePort,
  killAllChildProcesses,
  occupyPort,
  startServer,
} from './helpers/child-process.ts';
import { getTestDatabaseUrl } from './helpers/test-database.ts';
import { UNREACHABLE_DATABASE_URL } from './helpers/unreachable-database.ts';

const STARTUP_LIMIT_MS = 10_000;

describe('Proceso de la API (apps/api/src/server.ts)', () => {
  afterEach(async () => {
    await killAllChildProcesses();
  });

  it('AC-08: sin DATABASE_URL termina solo con código 1 y explica la configuración inválida', async () => {
    const server = startServer(
      buildChildEnv({
        DATABASE_URL: undefined,
        DATABASE_URL_TEST: undefined,
        NODE_ENV: undefined,
        HOST: undefined,
        PORT: undefined,
      }),
    );

    const result = await server.waitForExit(STARTUP_LIMIT_MS);

    expect(result.timedOut).toBe(false);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Configuración inválida.');
    expect(result.stderr).toContain('DATABASE_URL');
  });

  it('AC-08: con el puerto ocupado termina solo con código 1 y dice qué puerto cambiar', async () => {
    const blocker = await occupyPort();

    try {
      const server = startServer(
        buildChildEnv({
          DATABASE_URL: UNREACHABLE_DATABASE_URL,
          NODE_ENV: 'test',
          HOST: '127.0.0.1',
          PORT: String(blocker.port),
        }),
      );

      const result = await server.waitForExit(STARTUP_LIMIT_MS);

      expect(result.timedOut).toBe(false);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain(
        `El puerto ${String(blocker.port)} ya está en uso. Cambia PORT en apps/api/.env.`,
      );
    } finally {
      await blocker.release();
    }
  });

  it('AC-09: escucha en el puerto configurado y GET /api/health responde 200', async () => {
    const port = await getFreePort();
    const server = startServer(
      buildChildEnv({
        DATABASE_URL: getTestDatabaseUrl(),
        NODE_ENV: 'test',
        HOST: '127.0.0.1',
        PORT: String(port),
      }),
    );

    await server.waitForStdout(
      `API escuchando en http://127.0.0.1:${String(port)}`,
      STARTUP_LIMIT_MS,
    );

    const response = await fetch(`http://127.0.0.1:${String(port)}/api/health`, {
      signal: AbortSignal.timeout(STARTUP_LIMIT_MS),
    });
    const body = (await response.json()) as { status: string; database: string };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: 'ok', database: 'ok' });
  });

  it('Borde: la API arranca aunque PostgreSQL no responda y /api/health informa 503', async () => {
    const port = await getFreePort();
    const server = startServer(
      buildChildEnv({
        DATABASE_URL: UNREACHABLE_DATABASE_URL,
        NODE_ENV: 'test',
        HOST: '127.0.0.1',
        PORT: String(port),
      }),
    );

    await server.waitForStdout(
      `API escuchando en http://127.0.0.1:${String(port)}`,
      STARTUP_LIMIT_MS,
    );

    const response = await fetch(`http://127.0.0.1:${String(port)}/api/health`, {
      signal: AbortSignal.timeout(STARTUP_LIMIT_MS),
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ status: 'error', database: 'error' });
    expect(server.stdout + server.stderr).not.toContain('Clave_Secreta_99');
  });
});
