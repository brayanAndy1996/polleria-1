/**
 * Ataques al formato común de errores (adversarial-tester, spec 001).
 *
 * Objetivo: el errorHandler solo convierte en AppError los errores de body-parser de tipo
 * `entity.parse.failed` (400 INVALID_JSON) y `entity.too.large` (413 PAYLOAD_TOO_LARGE). Cualquier
 * otro error del lector del cuerpo (codificación de contenido desconocida, cuerpo gzip corrupto,
 * etc.) cae al camino de "error inesperado": responde 500 INTERNAL_ERROR y registra una traza
 * completa en stderr, aunque sea una falla del cliente (4xx). Estos tests demuestran ese hallazgo.
 *
 * No tocan la base: usan un Sequelize que nunca se conecta.
 */
import request from 'supertest';
import type { Sequelize } from 'sequelize';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.ts';
import { closeTestDatabase } from '../helpers/test-database.ts';
import { createUnreachableSequelize } from '../helpers/unreachable-database.ts';

describe('Ataques al lector del cuerpo (body-parser) y al errorHandler', () => {
  let sequelize: Sequelize;

  beforeAll(() => {
    sequelize = createUnreachableSequelize();
  });

  afterAll(async () => {
    await closeTestDatabase(sequelize);
  });

  // ADV-001-01 (Medio): una codificación de contenido desconocida es una falla del cliente, pero la
  // API responde 500 INTERNAL_ERROR (y escribe la traza en stderr). Debería ser un 4xx.
  it('ADV-001-01: un Content-Encoding desconocido debería responder 4xx de cliente, no 500', async () => {
    const response = await request(createApp({ sequelize }))
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'bogus')
      .send('{"a":1}');

    expect(response.status).toBeGreaterThanOrEqual(400);
    // El hallazgo: hoy devuelve 500. Un cuerpo mal codificado es culpa del cliente (4xx).
    expect(response.status).toBeLessThan(500);
    expect((response.body as { error?: { code?: string } }).error?.code).not.toBe('INTERNAL_ERROR');
  });

  // ADV-001-02 (Medio): un cuerpo que dice ser gzip pero no lo es rompe el descompresor; la API
  // responde 500 INTERNAL_ERROR en lugar de un 4xx, y registra una traza por cada solicitud.
  it('ADV-001-02: un cuerpo gzip corrupto debería responder 4xx de cliente, no 500', async () => {
    const response = await request(createApp({ sequelize }))
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'gzip')
      .send(Buffer.from('esto no es gzip'));

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect((response.body as { error?: { code?: string } }).error?.code).not.toBe('INTERNAL_ERROR');
  });

  // ADV-001-03 (Bajo, regresión en verde): un cuerpo con __proto__ o constructor.prototype no
  // contamina Object.prototype. Protege contra prototype pollution si en el futuro una ruta lee el
  // cuerpo.
  it('ADV-001-03: un cuerpo con __proto__ o constructor no contamina Object.prototype', async () => {
    const app = createApp({ sequelize });

    await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"__proto__":{"polluted":"si"}}');
    await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"constructor":{"prototype":{"polluted2":"si"}}}');

    const probe = {} as Record<string, unknown>;
    expect(probe.polluted).toBeUndefined();
    expect(probe.polluted2).toBeUndefined();
  });
});
