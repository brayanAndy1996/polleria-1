import http from 'node:http';
import express from 'express';
import type { Express } from 'express';
import request from 'supertest';
import type { Sequelize } from 'sequelize';
import { QueryTypes } from 'sequelize';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { USER_ROLES } from '@polleria/shared';
import type { UserRole } from '@polleria/shared';
import { assertTestDatabase } from '../../src/db/assert-test-database.ts';
import { getPostgresConnectionParts } from '../../src/db/postgres-url.ts';
import { migrateUp } from '../../src/db/migrator.ts';
import { createAuthController } from '../../src/controllers/auth.controller.ts';
import { createRequireAuth, getAuthContext, requireRole } from '../../src/middlewares/auth.ts';
import { errorHandler } from '../../src/middlewares/error-handler.ts';
import { createAuthRoutes } from '../../src/routes/auth.routes.ts';
import { createAuthService } from '../../src/services/auth/auth.service.ts';
import { createLoginLimiter } from '../../src/services/auth/login-limiter.ts';
import {
  createSessionService,
  SESSION_DURATION_MS,
} from '../../src/services/auth/session.service.ts';
import { hashSessionToken } from '../../src/services/auth/session-token.ts';
import {
  assertConnectedToTestDatabase,
  clearAuthTables,
  closeTestDatabase,
  connectTestDatabase,
  getTestDatabaseUrl,
} from '../helpers/test-database.ts';
import { loginWithCookie, setupAuth, UNAUTHENTICATED_BODY } from '../helpers/auth.ts';

function assertAuthorizedUrl(): void {
  const url = getTestDatabaseUrl();
  const parts = getPostgresConnectionParts(url);
  const parsed = new URL(url);
  if (
    assertTestDatabase(url) !== 'polleria_test' ||
    parts?.database !== 'polleria_test' ||
    !['localhost', '127.0.0.1'].includes(parts.host) ||
    parts.port !== 5432 ||
    parts.username !== 'polleria' ||
    parsed.search !== '' ||
    parsed.hash !== ''
  )
    throw new Error('La conexión no cumple la autorización local exclusiva para polleria_test.');
}

async function assertAuthorizedConnection(sequelize: Sequelize): Promise<void> {
  assertAuthorizedUrl();
  if ((await assertConnectedToTestDatabase(sequelize)) !== 'polleria_test') {
    throw new Error('La base conectada no es exactamente polleria_test; preparación cancelada.');
  }
}

async function withServer<T>(
  app: Express,
  action: (server: http.Server) => Promise<T>,
): Promise<T> {
  const server = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    return await action(server);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

describe('003: ataques locales de autenticación contra polleria_test', () => {
  let sequelize: Sequelize | undefined;
  let auth: ReturnType<typeof setupAuth>;
  let prepared = false;

  function database(): Sequelize {
    if (!sequelize) throw new Error('No hay conexión de pruebas autorizada.');
    return sequelize;
  }

  beforeAll(async () => {
    assertAuthorizedUrl();
    sequelize = await connectTestDatabase();
    await assertAuthorizedConnection(sequelize);
    await migrateUp(sequelize);
    prepared = true;
  });
  beforeEach(async () => {
    await assertAuthorizedConnection(database());
    await clearAuthTables(database());
    auth = setupAuth(database());
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    try {
      if (sequelize && prepared) {
        await assertAuthorizedConnection(sequelize);
        await clearAuthTables(sequelize);
      }
    } finally {
      await closeTestDatabase(sequelize);
    }
  });

  const login = (username: string, pin = '2468', app?: Express) =>
    request(app ?? auth.app)
      .post('/api/auth/login')
      .send({ username, pin });
  const me = (cookie: string) => request(auth.app).get('/api/auth/me').set('Cookie', cookie);

  it('ADV-003-01: aliases normalizados concurrentes comparten contador, sin mezclar usuarios activos/inactivos (AC-16/17)', async () => {
    await auth.createUser();
    const inactive = await auth.createUser('caja.ana', 'Ana', ['cashier'], '1357');
    await database().query('UPDATE users SET is_active = false WHERE id = $1', {
      bind: [inactive.id],
    });
    const aliases = ['mozo.juan', ' MOZO.JUAN ', '\tMozo.Juan\n', '\u00A0mozo.juan\u00A0'];
    const inactiveAliases = ['caja.ana', ' CAJA.ANA ', '\tcaja.ana\n', '\u00A0Caja.Ana\u00A0'];
    await withServer(auth.app, async (server) => {
      const groups = await Promise.all(
        [aliases, inactiveAliases].map(async (names, group) => {
          const responses = await Promise.all(
            Array.from({ length: 20 }, (_value, index) =>
              request(server)
                .post('/api/auth/login')
                .send({
                  username: names[index % names.length],
                  pin: group === 0 ? '0000' : '1357',
                }),
            ),
          );
          expect(responses.filter(({ status }) => status === 401)).toHaveLength(5);
          expect(responses.filter(({ status }) => status === 429)).toHaveLength(15);
          return responses;
        }),
      );
      expect(groups.flat().every((response) => response.headers['set-cookie'] === undefined)).toBe(
        true,
      );
    });
    expect(auth.verify).toHaveBeenCalledTimes(10);
    auth.setTime(899999);
    for (const username of ['mozo.juan', 'caja.ana']) {
      const response = await login(username);
      expect(response.status).toBe(429);
      expect(response.headers['retry-after']).toBe('1');
    }
    auth.setTime(900000);
    expect((await login(' MOZO.JUAN ')).status).toBe(200);
    expect((await login('caja.ana', '1357')).status).toBe(401);
    expect((await login(' CAJA.ANA ', '1357')).status).toBe(429);
    expect(auth.verify).toHaveBeenCalledTimes(12);
  });

  it('ADV-003-02: cookies duplicadas usan solo la primera; logout no revoca la segunda ni otro usuario (AC-11/18/21)', async () => {
    const waiter = await auth.createUser();
    const admin = await auth.createUser('dueno', 'Carlos', ['admin'], '135790');
    const first = await loginWithCookie(auth.app);
    const second = await loginWithCookie(auth.app, 'dueno', '135790');
    const unchanged = await loginWithCookie(auth.app);
    for (const header of [
      `polleria_session=; ${second.cookie}`,
      `polleria_session=invalid; ${second.cookie}`,
      `polleria_session=${hashSessionToken(second.token)}; ${second.cookie}`,
      `polleria_session=%41${second.token.slice(1)}; ${second.cookie}`,
      `polleria_session="${second.token}"; ${second.cookie}`,
    ])
      expect((await me(header)).body).toEqual(UNAUTHENTICATED_BODY);
    expect((await me(`${first.cookie}; ${second.cookie}`)).body).toMatchObject({
      user: { id: waiter.id, roles: ['waiter'] },
    });
    expect((await me(`${second.cookie}; ${first.cookie}`)).body).toMatchObject({
      user: { id: admin.id, roles: ['admin'] },
    });
    const response = await request(auth.app)
      .post('/api/auth/logout')
      .set('Cookie', `${first.cookie}; ${second.cookie}`);
    expect(response.status).toBe(204);
    expect((await me(`${first.cookie}; ${second.cookie}`)).status).toBe(401);
    expect((await me(second.cookie)).status).toBe(200);
    expect((await me(unchanged.cookie)).status).toBe(200);
    await request(auth.app)
      .post('/api/auth/logout')
      .set('Cookie', `polleria_session=; ${second.cookie}`);
    expect((await me(second.cookie)).status).toBe(200);
  });

  it('ADV-003-03: cada endpoint respeta los quince conjuntos de roles y requireRole no concede admin implícito (AC-23/R-003-05)', async () => {
    const sessionService = createSessionService({ models: auth.models, now: auth.now });
    const protectedApp = express();
    const requireAuth = createRequireAuth({ sessionService });
    for (const required of USER_ROLES) {
      protectedApp.get(`/only-${required}`, requireAuth, requireRole(required), (_req, res) =>
        res.json(getAuthContext(res)?.user),
      );
    }
    protectedApp.use(errorHandler);
    await withServer(auth.app, async (server) => {
      for (let mask = 1; mask < 1 << USER_ROLES.length; mask += 1) {
        const roles: UserRole[] = USER_ROLES.filter((_role, index) => mask & (1 << index));
        const user = await auth.createUser(`matrix.${mask}`, 'Persona', roles);
        const session = await loginWithCookie(auth.app, user.username);
        expect(session.response.status).toBe(200);
        for (const endpoint of ['/api/health', '/api/auth/users', '/api/auth/me']) {
          expect((await request(server).get(endpoint).set('Cookie', session.cookie)).status).toBe(
            200,
          );
        }
        for (const required of USER_ROLES) {
          const response = await request(protectedApp)
            .get(`/only-${required}`)
            .set('Cookie', session.cookie)
            .set('X-Role', required)
            .query({ roles: [required], userId: user.id + 1 });
          expect(response.status).toBe(roles.includes(required) ? 200 : 403);
        }
        expect(
          (await request(server).post('/api/auth/logout').set('Cookie', session.cookie)).status,
        ).toBe(204);
        expect(
          (await request(server).get('/api/auth/me').set('Cookie', session.cookie)).status,
        ).toBe(401);
      }
      for (const endpoint of ['/api/health', '/api/auth/users'])
        expect((await request(server).get(endpoint)).status).toBe(200);
      expect((await request(server).get('/api/auth/me')).status).toBe(401);
      expect((await request(server).post('/api/auth/logout')).status).toBe(204);
      for (const method of ['get', 'put', 'delete'] as const) {
        expect((await request(server)[method]('/api/auth/login')).status).toBe(404);
      }
    });
  });

  it('ADV-003-04: quitar permisos, desactivar y vencer sesiones afecta todas las del usuario pero no las ajenas (AC-19/20/21/23)', async () => {
    const owner = await auth.createUser('dueno', 'Carlos', ['waiter', 'admin']);
    await auth.createUser('caja.ana', 'Ana', ['cashier'], '1357');
    const ownerSessions = [
      await loginWithCookie(auth.app, 'dueno'),
      await loginWithCookie(auth.app, 'dueno'),
    ];
    auth.setTime(3600000);
    const cashier = await loginWithCookie(auth.app, 'caja.ana', '1357');
    await database().query("UPDATE users SET roles = '{waiter}' WHERE id = $1", {
      bind: [owner.id],
    });
    for (const session of ownerSessions)
      expect((await me(session.cookie)).body).toMatchObject({ user: { roles: ['waiter'] } });
    await database().query('UPDATE users SET is_active = false WHERE id = $1', {
      bind: [owner.id],
    });
    for (const session of ownerSessions) expect((await me(session.cookie)).status).toBe(401);
    expect((await me(cashier.cookie)).status).toBe(200);
    await database().query('UPDATE users SET is_active = true WHERE id = $1', { bind: [owner.id] });
    auth.setTime(SESSION_DURATION_MS);
    for (const session of ownerSessions) expect((await me(session.cookie)).status).toBe(401);
    expect((await me(cashier.cookie)).status).toBe(200);
    expect((await login('dueno', '0000')).status).toBe(401);
    expect(
      await database().query('SELECT id FROM sessions', { type: QueryTypes.SELECT }),
    ).toHaveLength(3);
    expect((await login('dueno')).status).toBe(200);
    expect(
      await database().query('SELECT id FROM sessions', { type: QueryTypes.SELECT }),
    ).toHaveLength(2);
    expect((await me(cashier.cookie)).status).toBe(200);
  });

  it('ADV-003-05: JSON hostil, campos extra, tipos y SQLi son datos rechazados sin contaminar prototipos ni intentos (AC-15/24)', async () => {
    await auth.createUser('mozo.juan', "O'Brien", ['waiter']);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const bodies: unknown[] = [
      { username: 'mozo.juan', pin: '2468', roles: ['admin'] },
      { username: 'mozo.juan', pin: '2468', isActive: true },
      { username: 'mozo.juan', pin: '2468', sessionId: 1 },
      { username: { toString: 'mozo.juan' }, pin: '2468' },
      { username: ['mozo.juan'], pin: '2468' },
      { username: 'mozo.juan', pin: ['2468'] },
      { username: 'mozo.juan', pin: { value: '2468' } },
      { username: 'mozo.juan', pin: true },
      { username: "mozo.juan' OR '1'='1", pin: '2468' },
      { username: 'mozo.juan', pin: "2468' OR '1'='1" },
      { username: 'mozo.juan\u0000', pin: '2468' },
      { username: 'mozo.juan', pin: '\uFF12\uFF14\uFF16\uFF18' },
      [{ username: 'mozo.juan', pin: '2468' }],
    ];
    const maliciousJson = [
      '{"username":"mozo.juan","pin":"2468","__proto__":{"adv003Polluted":true,"roles":["admin"]}}',
      '{"username":"mozo.juan","pin":"2468","constructor":{"prototype":{"adv003Polluted":true}}}',
      ...bodies.map((body) => JSON.stringify(body)),
    ];
    for (const body of maliciousJson) {
      const response = await request(auth.app).post('/api/auth/login').type('json').send(body);
      expect.soft(response.status, body).toBe(400);
      expect.soft(response.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
      expect.soft(response.headers['set-cookie']).toBeUndefined();
    }
    expect(auth.verify).not.toHaveBeenCalled();
    expect(Reflect.has({}, 'adv003Polluted')).toBe(false);
    expect(log).not.toHaveBeenCalled();
    const accepted = await login('mozo.juan');
    expect(accepted.status).toBe(200);
    expect(accepted.body).toMatchObject({ user: { displayName: "O'Brien", roles: ['waiter'] } });
  });

  it('ADV-003-06: un PIN correcto sin sesión creada no borra cuatro fallos previos (D-003-05/RN-003-04)', async () => {
    await auth.createUser();
    const sessionService = createSessionService({ models: auth.models, now: auth.now });
    const createSession = vi
      .fn((userId: number) => sessionService.createSession(userId))
      .mockRejectedValueOnce(new Error('Fallo determinista al guardar la sesión.'));
    const service = createAuthService({
      models: auth.models,
      sessionService: { ...sessionService, createSession },
      pinHasher: auth.pinHasher,
      loginLimiter: createLoginLimiter({ now: auth.now }),
    });
    const app = express();
    app.use(express.json());
    app.use(
      '/api/auth',
      createAuthRoutes(
        createAuthController({ authService: service }),
        createRequireAuth({ sessionService }),
      ),
    );
    app.use(errorHandler);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (let index = 0; index < 4; index += 1)
      expect((await login('mozo.juan', '0000', app)).status).toBe(401);
    const failure = await login('mozo.juan', '2468', app);
    expect(failure.status).toBe(500);
    expect(failure.headers['set-cookie']).toBeUndefined();
    expect(
      await database().query('SELECT id FROM sessions', { type: QueryTypes.SELECT }),
    ).toHaveLength(0);
    const blocked = await login('mozo.juan', '0000', app);
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBe('900');
  });
});
