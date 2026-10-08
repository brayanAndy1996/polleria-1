/**
 * Ataque de carga a GET /api/health (adversarial-tester, spec 001, AC-12-14).
 *
 * Muchos clientes consultan la salud a la vez (varias pestañas, varios celulares del local). Se
 * comprueba que el pool de Sequelize no se agota ni se cuelga: todas las solicitudes responden con
 * el esquema correcto y dentro del tiempo límite, con la base disponible y con la base inalcanzable.
 *
 * Son regresiones en verde: el ataque no rompió nada, pero el test protege contra una regresión que
 * agote el pool o deje peticiones colgadas.
 */
import { healthResponseSchema } from '@polleria/shared';
import request from 'supertest';
import type { Sequelize } from 'sequelize';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import { closeTestDatabase, connectTestDatabase } from '../helpers/test-database.ts';
import { createUnreachableSequelize } from '../helpers/unreachable-database.ts';

const CONCURRENCY = 120;

describe('Carga concurrente sobre GET /api/health', () => {
  let sequelize: Sequelize;

  beforeAll(async () => {
    sequelize = await connectTestDatabase();
  });

  afterAll(async () => {
    if (sequelize === undefined) return;
    await closeTestDatabase(sequelize);
  });

  // ADV-001-07 (regresión en verde): con la base disponible, 120 solicitudes a la vez responden
  // todas 200 con HealthResponse válido y en menos de 2 s; el pool no se agota ni se cuelga.
  it('ADV-001-07: 120 solicitudes concurrentes con la base disponible responden 200 válido sin colgarse', async () => {
    const app = createApp({ sequelize });

    const started = Date.now();
    const responses = await Promise.all(
      Array.from({ length: CONCURRENCY }, () => request(app).get('/api/health')),
    );
    const elapsed = Date.now() - started;

    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(healthResponseSchema.safeParse(response.body as unknown).success).toBe(true);
    }
    expect(elapsed).toBeLessThan(2000);
  });

  // ADV-001-08 (regresión en verde): con la base inalcanzable y healthTimeoutMs 200, las 120
  // solicitudes responden todas 503 válido sin esperar indefinidamente ni agotar el pool.
  it('ADV-001-08: 120 solicitudes concurrentes con la base inalcanzable responden 503 válido a tiempo', async () => {
    const unreachable = createUnreachableSequelize();
    try {
      const app = createApp({ sequelize: unreachable, healthTimeoutMs: 200 });

      const started = Date.now();
      const responses = await Promise.all(
        Array.from({ length: CONCURRENCY }, () => request(app).get('/api/health')),
      );
      const elapsed = Date.now() - started;

      for (const response of responses) {
        expect(response.status).toBe(503);
        const parsed = healthResponseSchema.safeParse(response.body as unknown);
        expect(parsed.success).toBe(true);
        expect((response.body as { database?: string }).database).toBe('error');
      }
      expect(elapsed).toBeLessThan(5000);
    } finally {
      await unreachable.close();
    }
  });
});
