import { errorResponseSchema } from '@polleria/shared';
import request from 'supertest';
import type { Sequelize } from 'sequelize';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { closeTestDatabase } from './helpers/test-database.ts';
import { createUnreachableSequelize } from './helpers/unreachable-database.ts';

const NOT_FOUND_BODY = {
  error: { code: 'NOT_FOUND', message: 'La ruta solicitada no existe.', details: null },
};

const INVALID_JSON_BODY = {
  error: {
    code: 'INVALID_JSON',
    message: 'El cuerpo de la solicitud no es un JSON válido.',
    details: null,
  },
};

const PAYLOAD_TOO_LARGE_BODY = {
  error: {
    code: 'PAYLOAD_TOO_LARGE',
    message: 'La solicitud es demasiado grande.',
    details: null,
  },
};

const LIMIT_BYTES = 100 * 1024;

/** JSON válido de exactamente `bytes` bytes: {"a":"xxx...x"}. */
function jsonBodyOfSize(bytes: number): string {
  const overhead = Buffer.byteLength('{"a":""}');
  return `{"a":"${'x'.repeat(bytes - overhead)}"}`;
}

// Estas pruebas no tocan la base: usan un Sequelize que nunca se conecta.
describe('Formato común de errores en createApp', () => {
  let sequelize: Sequelize;

  beforeAll(() => {
    sequelize = createUnreachableSequelize();
  });

  afterAll(async () => {
    await closeTestDatabase(sequelize);
  });

  it.each([
    ['GET', '/api/no-existe'],
    ['GET', '/'],
    ['POST', '/api/health'],
  ] as const)('AC-16: %s %s responde 404 NOT_FOUND con el formato común', async (method, path) => {
    const app = createApp({ sequelize });

    const response =
      method === 'GET' ? await request(app).get(path) : await request(app).post(path);

    expect(response.status).toBe(404);
    expect(response.body).toEqual(NOT_FOUND_BODY);
    expect(errorResponseSchema.safeParse(response.body as unknown).success).toBe(true);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
  });

  it('AC-17: un cuerpo JSON mal formado responde 400 INVALID_JSON', async () => {
    const response = await request(createApp({ sequelize }))
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"a":');

    expect(response.status).toBe(400);
    expect(response.body).toEqual(INVALID_JSON_BODY);
    expect(errorResponseSchema.safeParse(response.body as unknown).success).toBe(true);
  });

  it('AC-17: un JSON válido de 150 KB responde 413 PAYLOAD_TOO_LARGE', async () => {
    const response = await request(createApp({ sequelize }))
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send(jsonBodyOfSize(150 * 1024));

    expect(response.status).toBe(413);
    expect(response.body).toEqual(PAYLOAD_TOO_LARGE_BODY);
    expect(errorResponseSchema.safeParse(response.body as unknown).success).toBe(true);
  });

  it('Borde: un JSON de exactamente 100 KB se acepta (la ruta no existe, así que responde 404)', async () => {
    const body = jsonBodyOfSize(LIMIT_BYTES);
    expect(Buffer.byteLength(body)).toBe(LIMIT_BYTES);

    const response = await request(createApp({ sequelize }))
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(response.status).toBe(404);
    expect(response.body).toEqual(NOT_FOUND_BODY);
  });

  it('Borde: un JSON de 100 KB más un byte responde 413 PAYLOAD_TOO_LARGE', async () => {
    const response = await request(createApp({ sequelize }))
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send(jsonBodyOfSize(LIMIT_BYTES + 1));

    expect(response.status).toBe(413);
    expect(response.body).toEqual(PAYLOAD_TOO_LARGE_BODY);
  });

  it('Borde: JSON inválido en una ruta inexistente responde 400 INVALID_JSON y no 404', async () => {
    const response = await request(createApp({ sequelize }))
      .post('/api/no-existe')
      .set('Content-Type', 'application/json')
      .send('{"a":');

    expect(response.status).toBe(400);
    expect(response.body).toEqual(INVALID_JSON_BODY);
  });

  it('Borde: los errores del formato común no traen X-Powered-By ni cabeceras CORS', async () => {
    const response = await request(createApp({ sequelize }))
      .get('/api/no-existe')
      .set('Origin', 'http://sitio-ajeno.example');

    expect(response.status).toBe(404);
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
