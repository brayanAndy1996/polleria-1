import request from 'supertest';
import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { usersResponseSchema } from '@polleria/shared';
import {
  closeTestDatabase,
  connectTestDatabase,
  migrateAndClearAuthTables,
} from './helpers/test-database.ts';
import {
  setupAuth,
  loginWithCookie,
  INVALID_CREDENTIALS_BODY,
  UNAUTHENTICATED_BODY,
} from './helpers/auth.ts';

const FORBIDDEN_BODY = {
  error: {
    code: 'FORBIDDEN',
    message: 'No tienes permiso para realizar esta acci\u00F3n.',
    details: null,
  },
};
const USERNAME_TAKEN_BODY = {
  error: { code: 'USERNAME_TAKEN', message: 'Ese nombre de usuario ya existe.', details: null },
};
const USER_NOT_FOUND_BODY = {
  error: { code: 'USER_NOT_FOUND', message: 'Ese usuario no existe.', details: null },
};
const LAST_ADMIN_BODY = {
  error: {
    code: 'LAST_ADMIN_REQUIRED',
    message: 'Debe quedar al menos un administrador activo.',
    details: null,
  },
};
const NOT_FOUND_BODY = {
  error: { code: 'NOT_FOUND', message: 'La ruta solicitada no existe.', details: null },
};
const WEAK_PIN_MESSAGE = 'Ese PIN es muy f\u00E1cil de adivinar. Elige otro.';
const USER_ID_MESSAGE = 'El identificador del usuario no es v\u00E1lido.';

describe('004: API de gestión de usuarios contra polleria_test', () => {
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

  const rows = <T extends object>(sql: string, bind?: (string | number)[]) =>
    sequelize.query<T>(sql, { type: QueryTypes.SELECT, bind });
  /** Crea al administrador dueño y devuelve la cookie de su sesión real. */
  async function adminCookie() {
    await auth.createUser('dueno', 'Don Carlos', ['admin'], '975310');
    return (await loginWithCookie(auth.app, 'dueno', '975310')).cookie;
  }
  const getUsers = (cookie?: string) => {
    const call = request(auth.app).get('/api/users');
    return cookie === undefined ? call : call.set('Cookie', cookie);
  };
  const postUsers = (body: unknown, cookie?: string) => {
    const call = request(auth.app)
      .post('/api/users')
      .send(body as object);
    return cookie === undefined ? call : call.set('Cookie', cookie);
  };
  const patchUser = (id: number | string, body: unknown, cookie?: string) => {
    const call = request(auth.app)
      .patch(`/api/users/${id}`)
      .send(body as object);
    return cookie === undefined ? call : call.set('Cookie', cookie);
  };
  const postPin = (id: number | string, body: unknown, cookie?: string) => {
    const call = request(auth.app)
      .post(`/api/users/${id}/pin`)
      .send(body as object);
    return cookie === undefined ? call : call.set('Cookie', cookie);
  };
  const login = (username: string, pin: string) =>
    request(auth.app).post('/api/auth/login').send({ username, pin });
  const me = (cookie: string) => request(auth.app).get('/api/auth/me').set('Cookie', cookie);
  function validationIssues(response: request.Response): { path: string; message: string }[] {
    expect(response.status).toBe(400);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({
      error: { code: 'VALIDATION_ERROR', message: 'Los datos enviados no son v\u00E1lidos.' },
    });
    const issues = (response.body as { error: { details: { issues: unknown } } }).error.details
      .issues;
    expect(Array.isArray(issues)).toBe(true);
    return issues as { path: string; message: string }[];
  }

  it('AC-13: lista todos los usuarios con llaves exactas en orden español', async () => {
    const zoila = await auth.createUser('zoila', 'Zoila', ['waiter']);
    const ana = await auth.createUser('ana', 'ana', ['waiter', 'cashier']);
    await sequelize.query("UPDATE users SET roles = '{cashier,waiter}' WHERE username = 'ana'");
    const dueno = await auth.createUser('dueno', 'Don Carlos', ['admin'], '975310');
    const inactivo = await auth.createUser('inactivo', 'Inactivo', ['waiter']);
    await sequelize.query("UPDATE users SET is_active = false WHERE username = 'inactivo'");
    const session = await loginWithCookie(auth.app, 'dueno', '975310');
    const response = await getUsers(session.cookie);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(usersResponseSchema.safeParse(response.body as unknown).success).toBe(true);
    expect(response.body).toEqual({
      users: [
        {
          id: ana.id,
          username: 'ana',
          displayName: 'ana',
          roles: ['waiter', 'cashier'],
          isActive: true,
        },
        {
          id: dueno.id,
          username: 'dueno',
          displayName: 'Don Carlos',
          roles: ['admin'],
          isActive: true,
        },
        {
          id: inactivo.id,
          username: 'inactivo',
          displayName: 'Inactivo',
          roles: ['waiter'],
          isActive: false,
        },
        {
          id: zoila.id,
          username: 'zoila',
          displayName: 'Zoila',
          roles: ['waiter'],
          isActive: true,
        },
      ],
    });
    for (const user of (response.body as { users: object[] }).users)
      expect(Object.keys(user).sort()).toEqual([
        'displayName',
        'id',
        'isActive',
        'roles',
        'username',
      ]);
    expect(response.text).not.toContain('pinHash');
    expect(response.text).not.toContain('pin_hash');
    expect(response.text).not.toContain('$2b$');
  });
  it('AC-13: exige sesión y el rol admin con los cuerpos exactos de la 003', async () => {
    await auth.createUser('mozo.juan', 'Juan', ['waiter'], '2468');
    await auth.createUser('cocina.beto', 'Beto', ['kitchen'], '1357');
    await auth.createUser('caja.ana', 'Ana', ['cashier'], '8642');
    await auth.createUser('mixta', 'Mixta', ['waiter', 'cashier'], '5926');
    await auth.createUser('dueno', 'Don Carlos', ['admin'], '975310');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const anonymous = await getUsers();
    expect(anonymous.status).toBe(401);
    expect(anonymous.body).toEqual(UNAUTHENTICATED_BODY);
    expect(anonymous.headers['cache-control']).toBe('no-store');
    for (const [username, pin] of [
      ['mozo.juan', '2468'],
      ['cocina.beto', '1357'],
      ['caja.ana', '8642'],
      ['mixta', '5926'],
    ]) {
      const { cookie } = await loginWithCookie(auth.app, username, pin);
      const response = await getUsers(cookie);
      expect(response.status).toBe(403);
      expect(response.body).toEqual(FORBIDDEN_BODY);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.text).not.toContain('pinHash');
      expect(response.text).not.toContain('pin_hash');
      expect(response.text).not.toContain('$2b$');
    }
    expect(log).not.toHaveBeenCalled();
  });

  it('AC-14: crea un usuario normalizado que puede iniciar sesión con su PIN', async () => {
    const cookie = await adminCookie();
    const created = await postUsers(
      {
        username: '  MOZO.Nuevo ',
        displayName: 'Ana Mar\u00EDa',
        pin: '3968',
        roles: ['cashier', 'waiter'],
      },
      cookie,
    );
    expect(created.status).toBe(201);
    expect(created.headers['cache-control']).toBe('no-store');
    const createdUser = created.body as Record<string, unknown>;
    expect(Object.keys(createdUser).sort()).toEqual([
      'displayName',
      'id',
      'isActive',
      'roles',
      'username',
    ]);
    expect(typeof createdUser.id).toBe('number');
    expect(createdUser).toEqual({
      id: createdUser.id,
      username: 'mozo.nuevo',
      displayName: 'Ana Mar\u00EDa',
      roles: ['waiter', 'cashier'],
      isActive: true,
    });
    const saved = await rows<{ pin_hash: string }>(
      "SELECT pin_hash FROM users WHERE username = 'mozo.nuevo'",
    );
    expect(saved).toHaveLength(1);
    expect(saved[0]!.pin_hash).toMatch(/^\$2b\$/);
    expect(await auth.pinHasher.verify('3968', saved[0]!.pin_hash)).toBe(true);
    expect((await login('mozo.nuevo', '3968')).status).toBe(200);
  });
  it('AC-14: un nombre de usuario tomado, activo o inactivo, responde 409 exacto', async () => {
    const cookie = await adminCookie();
    await auth.createUser('mozo.ex', 'Ex', ['waiter'], '2468');
    await sequelize.query("UPDATE users SET is_active = false WHERE username = 'mozo.ex'");
    for (const username of ['dueno', 'mozo.ex']) {
      const response = await postUsers(
        { username, displayName: 'Otro', pin: '3968', roles: ['waiter'] },
        cookie,
      );
      expect(response.status).toBe(409);
      expect(response.body).toEqual(USERNAME_TAKEN_BODY);
      expect(response.headers['cache-control']).toBe('no-store');
    }
  });
  it('AC-14: valida el cuerpo y rechaza los PIN fáciles con el issue en pin', async () => {
    const cookie = await adminCookie();
    const base = { username: 'mozo.nuevo', displayName: 'Ana', roles: ['waiter'] };
    for (const pin of ['1234', '150385']) {
      const issues = validationIssues(await postUsers({ ...base, pin }, cookie));
      expect(issues).toContainEqual({ path: 'pin', message: WEAK_PIN_MESSAGE });
    }
    for (const body of [
      {},
      { username: 'mozo.nuevo' },
      { ...base, pin: '3968', note: 'x' },
      { ...base, pin: '3968', roles: [] },
      undefined,
    ])
      expect(validationIssues(await postUsers(body, cookie)).length).toBeGreaterThan(0);
    expect(await rows("SELECT id FROM users WHERE username <> 'dueno'")).toEqual([]);
  });
  it('AC-14: exige sesión y rol admin; un método no declarado responde 404', async () => {
    const cookie = await adminCookie();
    const body = { username: 'mozo.nuevo', displayName: 'Ana', pin: '3968', roles: ['waiter'] };
    const anonymous = await postUsers(body);
    expect(anonymous.status).toBe(401);
    expect(anonymous.body).toEqual(UNAUTHENTICATED_BODY);
    expect(anonymous.headers['cache-control']).toBe('no-store');
    await auth.createUser('mozo.juan', 'Juan', ['waiter'], '2468');
    const mozo = await loginWithCookie(auth.app, 'mozo.juan', '2468');
    const forbidden = await postUsers(body, mozo.cookie);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toEqual(FORBIDDEN_BODY);
    expect(forbidden.headers['cache-control']).toBe('no-store');
    const put = await request(auth.app).put('/api/users').set('Cookie', cookie).send(body);
    expect(put.status).toBe(404);
    expect(put.body).toEqual(NOT_FOUND_BODY);
  });

  it('AC-15: edita nombre y roles por HTTP y la sesión refleja el cambio al instante', async () => {
    const cookie = await adminCookie();
    await auth.createUser('admin2', 'Segunda', ['admin'], '5926');
    const juan = await auth.createUser('mozo.juan', 'Juan', ['waiter'], '2468');
    await auth.createUser('caja.ana', 'Ana', ['cashier'], '8642');
    const mozo = await loginWithCookie(auth.app, 'mozo.juan', '2468');
    const updated = await patchUser(
      juan.id,
      { displayName: 'Juan P\u00E9rez', roles: ['waiter', 'kitchen'] },
      cookie,
    );
    expect(updated.status).toBe(200);
    expect(updated.headers['cache-control']).toBe('no-store');
    expect(updated.body).toEqual({
      id: juan.id,
      username: 'mozo.juan',
      displayName: 'Juan P\u00E9rez',
      roles: ['waiter', 'kitchen'],
      isActive: true,
    });
    const current = await me(mozo.cookie);
    expect(current.status).toBe(200);
    expect(current.body).toMatchObject({
      user: { displayName: 'Juan P\u00E9rez', roles: ['waiter', 'kitchen'] },
    });
  });
  it('AC-15: desactivar borra sesiones, quita de la lista y bloquea; reactivar restaura', async () => {
    const cookie = await adminCookie();
    const juan = await auth.createUser('mozo.juan', 'Juan', ['waiter'], '2468');
    const mozo = await loginWithCookie(auth.app, 'mozo.juan', '2468');
    const deactivated = await patchUser(juan.id, { isActive: false }, cookie);
    expect(deactivated.status).toBe(200);
    expect(deactivated.body).toMatchObject({ id: juan.id, isActive: false });
    const publicList = await request(auth.app).get('/api/auth/users');
    expect(publicList.status).toBe(200);
    expect(publicList.body).toEqual({
      users: [{ username: 'dueno', displayName: 'Don Carlos' }],
    });
    expect((await login('mozo.juan', '2468')).status).toBe(401);
    expect((await login('mozo.juan', '2468')).body).toEqual(INVALID_CREDENTIALS_BODY);
    expect((await me(mozo.cookie)).status).toBe(401);
    expect(await rows('SELECT user_id FROM sessions WHERE user_id = $1', [juan.id])).toEqual([]);
    const reactivated = await patchUser(juan.id, { isActive: true }, cookie);
    expect(reactivated.status).toBe(200);
    expect(reactivated.body).toMatchObject({ isActive: true });
    expect((await login('mozo.juan', '2468')).status).toBe(200);
  });
  it('AC-15: valida el userId de la ruta y el cuerpo con sus mensajes exactos', async () => {
    const cookie = await adminCookie();
    const juan = await auth.createUser('mozo.juan', 'Juan', ['waiter'], '2468');
    const notFound = await patchUser(999999, { isActive: false }, cookie);
    expect(notFound.status).toBe(404);
    expect(notFound.body).toEqual(USER_NOT_FOUND_BODY);
    expect(notFound.headers['cache-control']).toBe('no-store');
    for (const id of ['abc', '0', '1.5', '-3', '999999999999999999999999', '2147483648']) {
      const issues = validationIssues(await patchUser(id, { isActive: false }, cookie));
      expect(issues[0]).toEqual({ path: 'userId', message: USER_ID_MESSAGE });
    }
    const empty = validationIssues(await patchUser(juan.id, {}, cookie));
    expect(empty.map((issue) => issue.message)).toContain('No indicaste ning\u00FAn cambio.');
    for (const body of [{ pin: '2468' }, { username: 'otro' }, { id: 7 }])
      expect(validationIssues(await patchUser(juan.id, body, cookie)).length).toBeGreaterThan(0);
    // Un GET sobre la ruta de PATCH es un método no declarado: 404 como en la 003.
    const get = await request(auth.app).get(`/api/users/${juan.id}`).set('Cookie', cookie);
    expect(get.status).toBe(404);
    expect(get.body).toEqual(NOT_FOUND_BODY);
  });
  it('AC-15: exige sesión y rol admin', async () => {
    await adminCookie();
    const juan = await auth.createUser('mozo.juan', 'Juan', ['waiter'], '2468');
    const anonymous = await patchUser(juan.id, { isActive: false });
    expect(anonymous.status).toBe(401);
    expect(anonymous.body).toEqual(UNAUTHENTICATED_BODY);
    expect(anonymous.headers['cache-control']).toBe('no-store');
    const mozo = await loginWithCookie(auth.app, 'mozo.juan', '2468');
    const forbidden = await patchUser(juan.id, { isActive: false }, mozo.cookie);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toEqual(FORBIDDEN_BODY);
    expect(forbidden.headers['cache-control']).toBe('no-store');
    const after = await rows<{ is_active: boolean }>('SELECT is_active FROM users WHERE id = $1', [
      juan.id,
    ]);
    expect(after).toEqual([{ is_active: true }]);
  });

  it('AC-16: el último administrador no se puede desactivar ni quedar sin rol', async () => {
    const cookie = await adminCookie();
    await auth.createUser('mozo.juan', 'Juan', ['waiter'], '2468');
    const dueno = await rows<{ id: number }>("SELECT id FROM users WHERE username = 'dueno'");
    for (const body of [{ isActive: false }, { roles: ['waiter'] }]) {
      const response = await patchUser(dueno[0]!.id, body, cookie);
      expect(response.status).toBe(409);
      expect(response.body).toEqual(LAST_ADMIN_BODY);
      expect(response.headers['cache-control']).toBe('no-store');
    }
    expect((await login('dueno', '975310')).status).toBe(200);
  });
  it('AC-16: con otro administrador activo el propio se desactiva y su sesión muere', async () => {
    const cookie = await adminCookie();
    await auth.createUser('admin2', 'Segunda', ['admin'], '5926');
    const dueno = await rows<{ id: number }>("SELECT id FROM users WHERE username = 'dueno'");
    const response = await patchUser(dueno[0]!.id, { isActive: false }, cookie);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: dueno[0]!.id, isActive: false });
    expect((await me(cookie)).status).toBe(401);
  });

  it('AC-17: restablece el PIN, cierra las sesiones y limpia el bloqueo', async () => {
    const cookie = await adminCookie();
    const juan = await auth.createUser('mozo.juan', 'Juan', ['waiter'], '2468');
    const mozo = await loginWithCookie(auth.app, 'mozo.juan', '2468');
    for (let attempt = 0; attempt < 5; attempt++)
      expect((await login('mozo.juan', '0000')).status).toBe(401);
    expect((await login('mozo.juan', '0000')).status).toBe(429);
    const reset = await postPin(juan.id, { pin: '5846' }, cookie);
    expect(reset.status).toBe(204);
    expect(reset.text).toBe('');
    expect(reset.headers['cache-control']).toBe('no-store');
    expect((await login('mozo.juan', '5846')).status).toBe(200);
    const wrongPin = await login('mozo.juan', '2468');
    expect(wrongPin.status).toBe(401);
    expect(wrongPin.body).toEqual(INVALID_CREDENTIALS_BODY);
    expect((await me(mozo.cookie)).status).toBe(401);
    // Los intentos inválidos después no cambian nada: el PIN nuevo sigue sirviendo.
    for (const body of [{ pin: '1234' }, { pin: '2512' }]) {
      const issues = validationIssues(await postPin(juan.id, body, cookie));
      expect(issues).toContainEqual({ path: 'pin', message: WEAK_PIN_MESSAGE });
    }
    for (const body of [{}, { pin: '5846', extra: 1 }])
      expect(validationIssues(await postPin(juan.id, body, cookie)).length).toBeGreaterThan(0);
    expect((await login('mozo.juan', '5846')).status).toBe(200);
  });
  it('AC-17: valida el userId y exige sesión de admin', async () => {
    const cookie = await adminCookie();
    const juan = await auth.createUser('mozo.juan', 'Juan', ['waiter'], '2468');
    const notFound = await postPin(999999, { pin: '5846' }, cookie);
    expect(notFound.status).toBe(404);
    expect(notFound.body).toEqual(USER_NOT_FOUND_BODY);
    const issues = validationIssues(await postPin('abc', { pin: '5846' }, cookie));
    expect(issues[0]).toEqual({ path: 'userId', message: USER_ID_MESSAGE });
    const anonymous = await postPin(juan.id, { pin: '5846' });
    expect(anonymous.status).toBe(401);
    expect(anonymous.body).toEqual(UNAUTHENTICATED_BODY);
    const mozo = await loginWithCookie(auth.app, 'mozo.juan', '2468');
    const forbidden = await postPin(juan.id, { pin: '5846' }, mozo.cookie);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toEqual(FORBIDDEN_BODY);
    expect((await login('mozo.juan', '2468')).status).toBe(200);
  });

  it('AC-18: ninguna respuesta ni cabecera expone el PIN ni su hash', async () => {
    const cookie = await adminCookie();
    const juan = await auth.createUser('mozo.juan', 'Juan', ['waiter'], '2468');
    const saved = await rows<{ pin_hash: string }>('SELECT pin_hash FROM users WHERE id = $1', [
      juan.id,
    ]);
    const responses = [
      await getUsers(cookie),
      await postUsers(
        { username: 'ana', displayName: 'Ana', pin: '3968', roles: ['waiter'] },
        cookie,
      ),
      await patchUser(juan.id, { displayName: 'Juan P.' }, cookie),
      await patchUser(juan.id, { pin: '2468' }, cookie),
      await postPin(juan.id, { pin: '5846' }, cookie),
      await postPin(juan.id, { pin: '1234' }, cookie),
      await patchUser(999999, { isActive: false }, cookie),
    ];
    for (const response of responses) {
      expect(response.headers['cache-control']).toBe('no-store');
      const visible = `${response.text}\n${JSON.stringify(response.headers)}`;
      for (const forbidden of [
        '3968',
        '2468',
        '5846',
        '1234',
        '$2b$',
        saved[0]!.pin_hash,
        'pinHash',
        'pin_hash',
      ])
        expect(visible).not.toContain(forbidden);
    }
  });
});
