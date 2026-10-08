import http from 'node:http';
import express from 'express';
import request from 'supertest';
import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import { loginUsersResponseSchema, sessionResponseSchema } from '@polleria/shared';
import type { UserRole } from '@polleria/shared';
import { createRequireAuth, getAuthContext, requireRole } from '../src/middlewares/auth.ts';
import { errorHandler } from '../src/middlewares/error-handler.ts';
import { SESSION_DURATION_MS, createSessionService } from '../src/services/auth/session.service.ts';
import {
  generateSessionToken,
  hashSessionToken,
  SESSION_TOKEN_PATTERN,
} from '../src/services/auth/session-token.ts';
import { createUserService } from '../src/services/users/user.service.ts';
import { createBcryptPinHasher } from '../src/services/auth/pin-hasher.ts';
import {
  closeTestDatabase,
  connectTestDatabase,
  migrateAndClearAuthTables,
} from './helpers/test-database.ts';
import {
  setupAuth,
  loginWithCookie,
  SESSION_END,
  INVALID_CREDENTIALS_BODY,
  UNAUTHENTICATED_BODY,
} from './helpers/auth.ts';

describe('003: autenticación y permisos contra polleria_test', () => {
  let sequelize: Sequelize;
  let auth: ReturnType<typeof setupAuth>;
  beforeAll(async () => {
    sequelize = await connectTestDatabase();
  });
  beforeEach(async () => {
    await migrateAndClearAuthTables(sequelize);
    auth = setupAuth(sequelize);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await closeTestDatabase(sequelize);
  });
  const rows = <T extends object>(sql: string) =>
    sequelize.query<T>(sql, { type: QueryTypes.SELECT });
  function expectValidationError(response: request.Response) {
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    const issues = (response.body as { error: { details: { issues: unknown[] } } }).error.details
      .issues;
    expect(Array.isArray(issues)).toBe(true);
    expect(issues.length).toBeGreaterThan(0);
    expect(response.headers['set-cookie']).toBeUndefined();
  }
  const login = (username = 'mozo.juan', pin = '2468') =>
    request(auth.app).post('/api/auth/login').send({ username, pin });
  const me = (cookie?: string) => {
    const call = request(auth.app).get('/api/auth/me');
    return cookie === undefined ? call : call.set('Cookie', cookie);
  };

  it('AC-12: lista solo activos, una vez y en orden español, sin roles ni PIN', async () => {
    const empty = await request(auth.app).get('/api/auth/users');
    expect(empty.body).toEqual({ users: [] });
    for (const [username, displayName, roles] of [
      ['zoila', 'Zoila', ['waiter']],
      ['ana', 'ana', ['cashier', 'waiter']],
      ['angel', 'Ángel', ['admin']],
      ['beto', 'Beto', ['kitchen']],
      ['juan.q', 'juan', ['waiter']],
      ['juan.p', 'Juan', ['waiter']],
      ['inactivo', 'Inactivo', ['waiter']],
    ] as [string, string, UserRole[]][])
      await auth.createUser(username, displayName, roles);
    await sequelize.query("UPDATE users SET is_active = false WHERE username = 'inactivo'");
    const response = await request(auth.app).get('/api/auth/users');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      users: [
        { username: 'ana', displayName: 'ana' },
        { username: 'angel', displayName: 'Ángel' },
        { username: 'beto', displayName: 'Beto' },
        { username: 'juan.p', displayName: 'Juan' },
        { username: 'juan.q', displayName: 'juan' },
        { username: 'zoila', displayName: 'Zoila' },
      ],
    });
    expect(loginUsersResponseSchema.safeParse(response.body as unknown).success).toBe(true);
    expect((await request(auth.app).get('/api/health')).status).toBe(200);
  });
  it('AC-13: inicia sesión, fija cookie segura para HTTP local y guarda solo su hash', async () => {
    auth = setupAuth(sequelize, 10);
    const user = await auth.createUser();
    const { response, cookie, token } = await loginWithCookie(auth.app, '  MOZO.Juan ');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ user, expiresAt: SESSION_END });
    expect(sessionResponseSchema.safeParse(response.body as unknown).success).toBe(true);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']).toEqual([expect.any(String)]);
    const header = String(response.headers['set-cookie']);
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Strict');
    expect(header).toContain('Path=/');
    expect(header).toContain('Max-Age=57600');
    expect(header).not.toMatch(/Secure|Domain=/);
    expect(token).toMatch(SESSION_TOKEN_PATTERN);
    expect(cookie).toMatch(/^polleria_session=/);
    expect(SESSION_DURATION_MS).toBe(57600000);
    const sessions = await rows<{ user_id: number; token_hash: string; expires_at: Date }>(
      'SELECT * FROM sessions',
    );
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      user_id: user.id,
      token_hash: hashSessionToken(token),
      expires_at: new Date(SESSION_END),
    });
    expect(JSON.stringify(sessions)).not.toContain(token);
  });
  it('AC-13: devuelve los roles en orden aunque SQL los haya cambiado', async () => {
    await auth.createUser('moza.caja', 'Rosa', ['waiter', 'cashier'], '1357');
    await sequelize.query("UPDATE users SET roles = '{cashier,waiter}'");
    expect((await login('moza.caja', '1357')).body).toMatchObject({
      user: { roles: ['waiter', 'cashier'] },
    });
  });
  it('AC-14: no distingue usuario inexistente, inactivo ni PIN incorrecto y compara cada intento', async () => {
    await auth.createUser();
    await auth.createUser('mozo.ex', 'Ex', ['waiter'], '1357');
    await sequelize.query("UPDATE users SET is_active = false WHERE username = 'mozo.ex'");
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (const [username, pin] of [
      ['mozo.juan', '2469'],
      ['nadie', '2468'],
      ['mozo.ex', '1357'],
    ]) {
      auth.verify.mockClear();
      const response = await login(username, pin);
      expect(response.status).toBe(401);
      expect(response.body).toEqual(INVALID_CREDENTIALS_BODY);
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(auth.verify).toHaveBeenCalledTimes(1);
    }
    expect(await rows('SELECT * FROM sessions')).toEqual([]);
    expect(log).not.toHaveBeenCalled();
  });
  it('AC-15: valida antes de comparar y no cuenta errores de formato', async () => {
    await auth.createUser();
    const inputs: unknown[] = [
      undefined,
      {},
      { username: 'mozo.juan' },
      { pin: '2468' },
      { username: 'mozo.juan', pin: 2468 },
      ...['24a8', '246', '2468000'].map((pin) => ({ username: 'mozo.juan', pin })),
      { username: 'ab', pin: '2468' },
      { username: 'mozo.juan', pin: '2468', role: 'admin' },
    ];
    for (const input of inputs) {
      const response = await request(auth.app)
        .post('/api/auth/login')
        .send(input as object);
      expectValidationError(response);
    }
    const text = await request(auth.app)
      .post('/api/auth/login')
      .type('text')
      .send('username=mozo.juan&pin=2468');
    expect(text.status).toBe(400);
    expectValidationError(text);
    expect(auth.verify).not.toHaveBeenCalled();
    expect((await login()).status).toBe(200);
  });
  it('AC-16: cinco fallos bloquean quince minutos, sin afectar otros usuarios', async () => {
    await auth.createUser();
    await auth.createUser('caja.ana', 'Ana', ['cashier'], '1357');
    for (let attempt = 0; attempt < 5; attempt++)
      expect((await login('mozo.juan', '0000')).status).toBe(401);
    auth.verify.mockClear();
    const blocked = await login();
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBe('900');
    expect(blocked.body).toEqual({
      error: {
        code: 'TOO_MANY_ATTEMPTS',
        message: 'Demasiados intentos fallidos. Espera unos minutos e intenta de nuevo.',
        details: { retryAfterSeconds: 900 },
      },
    });
    expect(auth.verify).not.toHaveBeenCalled();
    expect(blocked.headers['set-cookie']).toBeUndefined();
    expect((await login('caja.ana', '1357')).status).toBe(200);
    auth.setTime(600000);
    const stillBlocked = await login();
    expect(stillBlocked.status).toBe(429);
    expect(stillBlocked.headers['retry-after']).toBe('300');
    expect(stillBlocked.body).toEqual({
      error: {
        code: 'TOO_MANY_ATTEMPTS',
        message: 'Demasiados intentos fallidos. Espera unos minutos e intenta de nuevo.',
        details: { retryAfterSeconds: 300 },
      },
    });
    auth.setTime(900000);
    expect((await login()).status).toBe(200);
    for (let attempt = 0; attempt < 4; attempt++)
      expect((await login('mozo.juan', '0000')).status).toBe(401);
    for (let attempt = 0; attempt < 10; attempt++)
      expect((await login('nadie', '0000')).status).toBe(401);
  });
  it('AC-17: veinte intentos simultáneos comparan solo cinco PIN y repiten el bloqueo', async () => {
    await auth.createUser();
    const server = http.createServer(auth.app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    try {
      const responses = await Promise.all(
        Array.from({ length: 20 }, () =>
          request(server).post('/api/auth/login').send({ username: 'mozo.juan', pin: '0000' }),
        ),
      );
      expect(responses.filter((response) => response.status === 401)).toHaveLength(5);
      expect(responses.filter((response) => response.status === 429)).toHaveLength(15);
      expect(auth.verify).toHaveBeenCalledTimes(5);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
    auth.setTime(900000);
    expect((await login('mozo.juan', '0000')).status).toBe(401);
    expect((await login()).headers['retry-after']).toBe('900');
    auth.setTime(1800000);
    expect((await login()).status).toBe(200);
  });
  it('AC-18: resuelve solo la cookie vigente y rechaza tokens manipulados sin registrar errores', async () => {
    await auth.createUser();
    const { response, cookie, token } = await loginWithCookie(auth.app);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const current = await me(cookie);
    expect(current.status).toBe(200);
    expect(current.body).toEqual(response.body);
    for (const header of [
      undefined,
      'otra=1',
      `polleria_session=${generateSessionToken()}`,
      `polleria_session=${token[0] === 'A' ? 'B' : 'A'}${token.slice(1)}`,
      `polleria_session=${token.slice(1)}`,
      `polleria_session=${token}A`,
      `polleria_session="${token}"`,
      `polleria_session=${hashSessionToken(token)}`,
    ]) {
      const invalid = await me(header);
      expect(invalid.status).toBe(401);
      expect(invalid.body).toEqual(UNAUTHENTICATED_BODY);
      expect(invalid.headers['cache-control']).toBe('no-store');
    }
    expect(log).not.toHaveBeenCalled();
  });
  it('AC-19: la sesión vence exactamente a las dieciséis horas', async () => {
    await auth.createUser();
    const { cookie } = await loginWithCookie(auth.app);
    auth.setTime(SESSION_DURATION_MS - 1);
    expect((await me(cookie)).status).toBe(200);
    auth.setTime(SESSION_DURATION_MS);
    expect((await me(cookie)).status).toBe(401);
    auth.setTime(20 * 3600000);
    expect((await me(cookie)).status).toBe(401);
  });
  it('AC-20: lee nombre, roles y estado activo en cada solicitud', async () => {
    await auth.createUser();
    const { cookie } = await loginWithCookie(auth.app);
    await sequelize.query(
      "UPDATE users SET roles = '{cashier,waiter}', display_name = 'Juan Pérez'",
    );
    expect((await me(cookie)).body).toMatchObject({
      user: { displayName: 'Juan Pérez', roles: ['waiter', 'cashier'] },
    });
    await sequelize.query("UPDATE users SET roles = '{admin}'");
    expect((await me(cookie)).body).toMatchObject({ user: { roles: ['admin'] } });
    await sequelize.query('UPDATE users SET is_active = false');
    expect((await me(cookie)).status).toBe(401);
  });
  it('AC-21: cerrar sesión es idempotente y afecta solo al dispositivo actual', async () => {
    await auth.createUser();
    const first = await loginWithCookie(auth.app);
    const second = await loginWithCookie(auth.app);
    for (const cookie of [first.cookie, first.cookie, 'polleria_session=invalid', undefined]) {
      const call = request(auth.app).post('/api/auth/logout');
      const response = await (cookie === undefined ? call : call.set('Cookie', cookie));
      expect(response.status).toBe(204);
      expect(response.text).toBe('');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(String(response.headers['set-cookie'])).toMatch(
        /polleria_session=;.*Path=\/;.*HttpOnly;.*SameSite=Strict/,
      );
      const clearCookie = String(response.headers['set-cookie']);
      const expires = /(?:^|;\s*)Expires=([^;]+)/i.exec(clearCookie)?.[1];
      const expiresInPast =
        expires !== undefined && new Date(expires).getTime() < auth.now().getTime();
      expect(expiresInPast || /(?:^|;\s*)Max-Age=0(?:;|$)/i.test(clearCookie)).toBe(true);
      expect((await me(second.cookie)).status).toBe(200);
    }
    expect((await me(first.cookie)).status).toBe(401);
    expect(await rows('SELECT * FROM sessions')).toHaveLength(1);
  });
  it('AC-22: permite varios dispositivos y limpia solo las sesiones vencidas al iniciar sesión', async () => {
    await auth.createUser();
    await auth.createUser('caja.ana', 'Ana', ['cashier'], '1357');
    const first = await loginWithCookie(auth.app);
    const second = await loginWithCookie(auth.app);
    expect(first.cookie).not.toBe(second.cookie);
    expect((await me(first.cookie)).status).toBe(200);
    expect((await me(second.cookie)).status).toBe(200);
    auth.setTime(3600000);
    await login('caja.ana', '1357');
    auth.setTime(SESSION_DURATION_MS);
    await login('caja.ana', '1357');
    const sessions = await rows<{ user_id: number }>('SELECT user_id FROM sessions');
    expect(sessions).toHaveLength(2);
    expect(sessions.every((session) => session.user_id === 2)).toBe(true);
  });
  it('AC-23: exige sesión y alguno de los roles pedidos, incluidos usuarios multirrol', async () => {
    const sessionService = createSessionService({ models: auth.models, now: auth.now });
    const app = express();
    const requireAuth = createRequireAuth({ sessionService });
    const reply: express.RequestHandler = (_req, res) => {
      const context = getAuthContext(res);
      res.json({
        userId: context?.user.id,
        roles: context?.user.roles,
        sessionId: context?.sessionId,
      });
    };
    app.get('/solo-admin', requireAuth, requireRole('admin'), reply);
    app.get('/caja', requireAuth, requireRole('cashier', 'admin'), reply);
    app.get('/sin-auth', requireRole('admin'), reply);
    app.use(errorHandler);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await request(app).get('/solo-admin')).body).toEqual(UNAUTHENTICATED_BODY);
    expect(() => requireRole()).toThrow('requireRole necesita al menos un rol.');
    for (const roles of [
      ['waiter'],
      ['kitchen'],
      ['cashier'],
      ['admin'],
      ['waiter', 'cashier'],
      ['admin', 'waiter'],
    ] as UserRole[][]) {
      const user = await auth.createUser(`usuario${roles.join('.')}`, 'Persona', roles);
      await sessionService.createSession(user.id);
      const session = await sessionService.createSession(user.id);
      const savedSession = await sequelize.query<{ id: number }>(
        'SELECT id FROM sessions WHERE token_hash = $1',
        { bind: [hashSessionToken(session.token)], type: QueryTypes.SELECT },
      );
      expect(savedSession).toHaveLength(1);
      const expectedContext = {
        userId: user.id,
        roles: user.roles,
        sessionId: savedSession[0]!.id,
      };
      const cookie = `polleria_session=${session.token}`;
      const admin = await request(app).get('/solo-admin').set('Cookie', cookie);
      expect(admin.status).toBe(roles.includes('admin') ? 200 : 403);
      if (admin.status === 403)
        expect(admin.body).toEqual({
          error: {
            code: 'FORBIDDEN',
            message: 'No tienes permiso para realizar esta acción.',
            details: null,
          },
        });
      else expect(admin.body).toEqual(expectedContext);
      const cashRegister = await request(app).get('/caja').set('Cookie', cookie);
      expect(cashRegister.status).toBe(
        roles.some((role) => role === 'cashier' || role === 'admin') ? 200 : 403,
      );
      if (cashRegister.status === 200) expect(cashRegister.body).toEqual(expectedContext);
      else
        expect(cashRegister.body).toEqual({
          error: {
            code: 'FORBIDDEN',
            message: 'No tienes permiso para realizar esta acción.',
            details: null,
          },
        });
      const withoutAuth = await request(app).get('/sin-auth').set('Cookie', cookie);
      expect(withoutAuth.status).toBe(401);
      expect(withoutAuth.body).toEqual(UNAUTHENTICATED_BODY);
      if (roles.length === 1 && roles[0] === 'waiter') {
        await sequelize.query("UPDATE users SET roles = '{cashier,waiter}' WHERE id = $1", {
          bind: [user.id],
        });
        const changed = await request(app).get('/caja').set('Cookie', cookie);
        expect(changed.status).toBe(200);
        expect(changed.body).toMatchObject({ userId: user.id, roles: ['waiter', 'cashier'] });
        expect(changed.body).toEqual({ ...expectedContext, roles: ['waiter', 'cashier'] });
        expect((changed.body as { sessionId: number }).sessionId).toBeGreaterThan(0);
        await sequelize.query("UPDATE users SET roles = '{waiter}' WHERE id = $1", {
          bind: [user.id],
        });
        expect((await request(app).get('/caja').set('Cookie', cookie)).status).toBe(403);
      }
    }
    expect(log).not.toHaveBeenCalled();
  });
  it('AC-24: ninguna respuesta expone PIN ni hash y auth evita la caché en todos sus estados', async () => {
    await auth.createUser('dueno', 'Don Carlos', ['admin'], '975310');
    await auth.createUser();
    const saved = await rows<{ pin_hash: string }>(
      "SELECT pin_hash FROM users WHERE username = 'dueno'",
    );
    const success = await loginWithCookie(auth.app, 'dueno', '975310');
    const responses = [
      await request(auth.app).get('/api/auth/users'),
      success.response,
      await login('dueno', '975311'),
      await login('dueno', '97'),
      await me(success.cookie),
      await me(),
      await request(auth.app).post('/api/auth/logout').set('Cookie', success.cookie),
    ];
    for (let attempt = 0; attempt < 5; attempt++) await login('mozo.juan', '0000');
    responses.push(await login());
    for (const response of responses) {
      expect(response.headers['cache-control']).toBe('no-store');
      const visible = `${response.text}\n${JSON.stringify(response.headers)}`;
      for (const forbidden of ['975310', '$2b$', saved[0]!.pin_hash, 'pinHash', 'pin_hash'])
        expect(visible).not.toContain(forbidden);
    }
  });
  it('AC-25: valida los usuarios, normaliza los roles y garantiza la unicidad incluso con concurrencia', async () => {
    const hasher = createBcryptPinHasher();
    const service = createUserService({ models: auth.models, pinHasher: hasher });
    const input = {
      username: ' Dueno ',
      displayName: '  Don Carlos ',
      pin: '0007',
      roles: ['admin'] as UserRole[],
    };
    const user = await service.createUser(input);
    expect(user).toEqual({ id: 1, username: 'dueno', displayName: 'Don Carlos', roles: ['admin'] });
    const saved = await rows<{ pin_hash: string }>('SELECT pin_hash FROM users');
    expect(saved[0]!.pin_hash).toMatch(/^\$2b\$10\$/);
    expect(await hasher.verify('0007', saved[0]!.pin_hash)).toBe(true);
    await expect(service.createUser(input)).rejects.toMatchObject({
      code: 'USERNAME_TAKEN',
      httpStatus: 409,
      message: 'Ese nombre de usuario ya existe.',
    });
    await expect(service.createUser({ ...input, username: 'DUENO' })).rejects.toMatchObject({
      code: 'USERNAME_TAKEN',
      httpStatus: 409,
      message: 'Ese nombre de usuario ya existe.',
    });
    expect(await rows("SELECT username FROM users WHERE username = 'dueno'")).toEqual([
      { username: 'dueno' },
    ]);
    const normalized = await service.createUser({
      ...input,
      username: 'caja.mozo',
      roles: ['cashier', 'waiter'],
    });
    expect(normalized).toEqual({
      id: expect.any(Number) as unknown,
      username: 'caja.mozo',
      displayName: 'Don Carlos',
      roles: ['waiter', 'cashier'],
    });
    expect(Number.isInteger(normalized.id) && normalized.id > 0).toBe(true);
    expect(await rows("SELECT roles FROM users WHERE username = 'caja.mozo'")).toEqual([
      { roles: ['waiter', 'cashier'] },
    ]);
    const usersBeforeInvalid = await rows('SELECT * FROM users ORDER BY id');
    for (const invalid of [
      { username: 'ab' },
      { displayName: '' },
      { pin: '12' },
      { roles: [] },
      { roles: ['chef'] },
      { roles: ['waiter', 'waiter'] },
      { roles: undefined },
    ]) {
      await expect(
        service.createUser({ ...input, ...invalid } as typeof input),
      ).rejects.toBeInstanceOf(ZodError);
      expect(await rows('SELECT * FROM users ORDER BY id')).toEqual(usersBeforeInvalid);
    }
    const results = await Promise.allSettled([
      service.createUser({ ...input, username: 'nuevo', roles: ['cashier', 'waiter'] }),
      service.createUser({ ...input, username: 'NUEVO', roles: ['cashier', 'waiter'] }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'fulfilled')).toEqual({
      status: 'fulfilled',
      value: {
        id: expect.any(Number) as unknown,
        username: 'nuevo',
        displayName: 'Don Carlos',
        roles: ['waiter', 'cashier'],
      },
    });
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({ reason: { code: 'USERNAME_TAKEN' } });
    expect(await rows("SELECT roles FROM users WHERE username = 'nuevo'")).toEqual([
      { roles: ['waiter', 'cashier'] },
    ]);
  });
});
