import net from 'node:net';
import type { Socket } from 'node:net';
import { healthResponseSchema } from '@polleria/shared';
import request from 'supertest';
import type { Sequelize } from 'sequelize';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { createSequelize } from '../src/db/sequelize.ts';
import { closeTestDatabase, connectTestDatabase } from './helpers/test-database.ts';
import {
  UNREACHABLE_DATABASE_SECRET,
  createUnreachableSequelize,
} from './helpers/unreachable-database.ts';

const FORBIDDEN_IN_UNHEALTHY_RESPONSE = [
  UNREACHABLE_DATABASE_SECRET,
  'postgres://',
  '127.0.0.1:1',
  'polleria_test',
];

describe('GET /api/health con la base disponible (polleria_test)', () => {
  let sequelize: Sequelize;

  beforeAll(async () => {
    sequelize = await connectTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase(sequelize);
  });

  it('AC-12: responde 200 con JSON, status ok, database ok y un timestamp reciente', async () => {
    const app = createApp({ sequelize });
    const before = Date.now();

    const response = await request(app).get('/api/health');

    const after = Date.now();
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^application\/json/);

    const body: unknown = response.body;
    const parsed = healthResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    expect(body).toMatchObject({ status: 'ok', database: 'ok' });

    const timestamp = Date.parse((body as { timestamp: string }).timestamp);
    expect(timestamp).toBeGreaterThanOrEqual(before - 5000);
    expect(timestamp).toBeLessThanOrEqual(after + 5000);
  });

  it('AC-12: el cuerpo tiene exactamente las claves status, database y timestamp', async () => {
    const response = await request(createApp({ sequelize })).get('/api/health');

    expect(Object.keys(response.body as object).sort()).toEqual([
      'database',
      'status',
      'timestamp',
    ]);
  });

  it('AC-15: con la base disponible incluye Cache-Control no-store y no incluye X-Powered-By ni CORS', async () => {
    const response = await request(createApp({ sequelize }))
      .get('/api/health')
      .set('Origin', 'http://sitio-ajeno.example');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('Borde: /api/health/ con barra final responde 200', async () => {
    const response = await request(createApp({ sequelize })).get('/api/health/');

    expect(response.status).toBe(200);
    expect(healthResponseSchema.safeParse(response.body as unknown).success).toBe(true);
  });

  it('Borde: HEAD /api/health responde como GET pero sin cuerpo', async () => {
    const response = await request(createApp({ sequelize })).head('/api/health');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.text ?? '').toBe('');
  });

  it('Borde: la API sigue respondiendo 200 en consultas seguidas sin reiniciar', async () => {
    const app = createApp({ sequelize });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await request(app).get('/api/health');
      expect(response.status).toBe(200);
    }
  });
});

describe('GET /api/health con la base caída (127.0.0.1:1, sin servidor)', () => {
  let sequelize: Sequelize;

  beforeAll(() => {
    sequelize = createUnreachableSequelize();
  });

  afterAll(async () => {
    await closeTestDatabase(sequelize);
  });

  it('AC-13: responde 503 en menos de 5 s con status error y database error, sin filtrar secretos', async () => {
    const app = createApp({ sequelize });
    const startedAt = Date.now();

    const response = await request(app).get('/api/health');

    expect(Date.now() - startedAt).toBeLessThan(5000);
    expect(response.status).toBe(503);

    const body: unknown = response.body;
    expect(healthResponseSchema.safeParse(body).success).toBe(true);
    expect(body).toMatchObject({ status: 'error', database: 'error' });
    expect(Object.keys(body as object).sort()).toEqual(['database', 'status', 'timestamp']);

    const visible = `${response.text}\n${JSON.stringify(response.headers)}`;
    for (const forbidden of FORBIDDEN_IN_UNHEALTHY_RESPONSE) {
      expect(visible).not.toContain(forbidden);
    }
  });

  it('AC-13: la respuesta 503 es JSON', async () => {
    const response = await request(createApp({ sequelize })).get('/api/health');

    expect(response.status).toBe(503);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
  });

  it('AC-15: con la base caída incluye Cache-Control no-store y no incluye X-Powered-By ni CORS', async () => {
    const response = await request(createApp({ sequelize }))
      .get('/api/health')
      .set('Origin', 'http://sitio-ajeno.example');

    expect(response.status).toBe(503);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('Borde: HEAD /api/health con la base caída responde 503 sin cuerpo', async () => {
    const response = await request(createApp({ sequelize })).head('/api/health');

    expect(response.status).toBe(503);
    expect(response.text ?? '').toBe('');
  });
});

describe('GET /api/health con una base colgada (acepta la conexión y nunca responde)', () => {
  const openSockets = new Set<Socket>();
  const hangingServer = net.createServer((socket) => {
    openSockets.add(socket);
    socket.on('error', () => undefined);
    socket.on('close', () => {
      openSockets.delete(socket);
    });
  });
  let sequelize: Sequelize;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      hangingServer.listen(0, '127.0.0.1', () => {
        resolve();
      });
    });
    const address = hangingServer.address();
    if (address === null || typeof address === 'string') {
      throw new Error('No se pudo obtener el puerto del servidor de prueba.');
    }
    sequelize = createSequelize(
      `postgres://polleria:${UNREACHABLE_DATABASE_SECRET}@127.0.0.1:${String(address.port)}/polleria_test`,
    );
  });

  afterAll(async () => {
    for (const socket of openSockets) {
      socket.destroy();
    }
    await closeTestDatabase(sequelize);
    await new Promise<void>((resolve) => {
      hangingServer.close(() => {
        resolve();
      });
    });
  });

  it('Borde: responde 503 sin esperar indefinidamente cuando la base no contesta (healthTimeoutMs 200)', async () => {
    const app = createApp({ sequelize, healthTimeoutMs: 200 });
    const startedAt = Date.now();

    const response = await request(app).get('/api/health');

    expect(Date.now() - startedAt).toBeLessThan(3000);
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ status: 'error', database: 'error' });
    expect(response.headers['cache-control']).toBe('no-store');
  });
});
