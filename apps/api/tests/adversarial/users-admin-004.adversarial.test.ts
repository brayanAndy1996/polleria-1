import path from 'node:path';
import request from 'supertest';
import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize';
import type { FindOptions } from 'sequelize';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertTestDatabase } from '../../src/db/assert-test-database.ts';
import { getPostgresConnectionParts } from '../../src/db/postgres-url.ts';
import type { Models } from '../../src/models/index.ts';
import { createLoginLimiter } from '../../src/services/auth/login-limiter.ts';
import { createSessionService } from '../../src/services/auth/session.service.ts';
import { createUserAdminService } from '../../src/services/users/user.service.ts';
import { ManagedProcess, buildChildEnv, killAllChildProcesses } from '../helpers/child-process.ts';
import {
  assertConnectedToTestDatabase,
  clearAuthTables,
  closeTestDatabase,
  connectTestDatabase,
  getTestDatabaseUrl,
  migrateAndClearAuthTables,
} from '../helpers/test-database.ts';
import { setupAuth, loginWithCookie } from '../helpers/auth.ts';

const FORBIDDEN_BODY = {
  error: {
    code: 'FORBIDDEN',
    message: 'No tienes permiso para realizar esta acción.',
    details: null,
  },
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
const USER_ID_MESSAGE = 'El identificador del usuario no es válido.';
const ADMIN_PIN = '975310';
const CREATE_ADMIN_ENTRY = path.resolve(import.meta.dirname, '../../src/create-admin.ts');

/**
 * Guardia estricta de la conexión de pruebas (idéntica a auth-boundaries-003): la
 * URL debe ser exactamente polleria_test en localhost como usuario polleria, sin
 * parámetros extra, antes de permitir cualquier SQL directo de las pruebas.
 */
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

describe('004-adversarial: ataques a la administración de usuarios sobre polleria_test', () => {
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
    prepared = true;
  });
  beforeEach(async () => {
    await migrateAndClearAuthTables(database());
    auth = setupAuth(database());
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await killAllChildProcesses();
  });
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

  const rows = <T extends object>(sql: string, bind?: (string | number)[]) =>
    database().query<T>(sql, { type: QueryTypes.SELECT, bind });
  const userRow = (id: number) =>
    rows<{
      username: string;
      display_name: string;
      pin_hash: string;
      roles: string[];
      is_active: boolean;
    }>('SELECT username, display_name, pin_hash, roles, is_active FROM users WHERE id = $1', [id]);
  const sessionsOf = (userId: number) =>
    rows<{ user_id: number }>('SELECT user_id FROM sessions WHERE user_id = $1', [userId]);

  /** Crea al administrador dueño y devuelve la cookie de su sesión real. */
  async function adminCookie() {
    await auth.createUser('dueno', 'Don Carlos', ['admin'], ADMIN_PIN);
    return (await loginWithCookie(auth.app, 'dueno', ADMIN_PIN)).cookie;
  }
  /** Id de un usuario conocido por su username (para casos que no devuelven el id). */
  async function userRowId(username: string): Promise<number> {
    const found = await rows<{ id: number }>('SELECT id FROM users WHERE username = $1', [
      username,
    ]);
    return found[0]!.id;
  }
  const login = (username: string, pin: string) =>
    request(auth.app).post('/api/auth/login').send({ username, pin });
  const me = (cookie: string) => request(auth.app).get('/api/auth/me').set('Cookie', cookie);
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

  function createAdminService() {
    const models = auth.models;
    const loginLimiter = createLoginLimiter({ now: auth.now });
    const sessionService = createSessionService({ models, now: auth.now });
    return createUserAdminService({
      models,
      pinHasher: auth.pinHasher,
      sessionService,
      loginLimiter,
    });
  }

  /**
   * Arma una intercalación determinista de la carrera del último administrador:
   * cuando el servicio ejecute su SELECT ... FOR UPDATE sobre los administradores
   * activos, `run` ya habrá confirmado su cambio en otra conexión (como haría un
   * PATCH concurrente). El findByPk previo NO bloquea la fila del usuario, así que
   * el servicio decide con datos que pueden haber quedado obsoletos.
   */
  function armBeforeAdminScan(models: Models, run: () => Promise<void>): () => void {
    let armed = true;
    models.User.addHook('beforeFind', 'adv004', async (options: FindOptions) => {
      if (!armed || !options.lock || options.transaction === undefined) return;
      armed = false;
      await run();
    });
    return () => {
      models.User.removeHook('beforeFind', 'adv004');
    };
  }

  it('ADV-004-10: la guardia decide con el usuario leído sin bloqueo y rechaza una operación inocua', async () => {
    const service = createAdminService();
    await auth.createUser('dueno', 'Don Carlos', ['admin']);
    // juan es administrador al leerlo el servicio, pero una degradación concurrente
    // (confirmada justo antes del SELECT FOR UPDATE) lo deja como mozo.
    const juan = await auth.createUser('admin.juan', 'Juan', ['admin']);
    const disarm = armBeforeAdminScan(auth.models, async () => {
      await database().query("UPDATE users SET roles = '{waiter}' WHERE id = $1", {
        bind: [juan.id],
      });
    });
    try {
      // juan ya es un mozo: desactivarlo no puede dejar el sistema sin administrador.
      await expect(service.updateUser(juan.id, { isActive: false })).resolves.toMatchObject({
        id: juan.id,
        isActive: false,
      });
    } finally {
      disarm();
    }
    expect((await userRow(juan.id))[0]!.is_active).toBe(false);
  });

  it('ADV-004-11: los intentos mientras está inactivo construyen un bloqueo que sobrevive a la reactivación', async () => {
    const cookie = await adminCookie();
    const juan = await auth.createUser('mozo.juan', 'Juan', ['waiter'], '2468');
    expect((await patchUser(juan.id, { isActive: false }, cookie)).status).toBe(200);
    // Cinco intentos fallidos contra un usuario INACTIVO cuentan igual para el límite.
    for (let attempt = 0; attempt < 5; attempt += 1)
      expect((await login('mozo.juan', '0000')).status).toBe(401);
    expect((await login('mozo.juan', '0000')).status).toBe(429);
    // El administrador lo reactiva: la spec promete que "entra con su PIN de siempre"
    // porque el conteo se limpió al desactivarlo — pero el bloqueo nuevo sobrevive.
    expect((await patchUser(juan.id, { isActive: true }, cookie)).status).toBe(200);
    const reopened = await login('mozo.juan', '2468');
    expect(reopened.status).toBe(200);
    // Causa raíz: el bloqueo caduca tras 15 min de reloj — no quedó deshabilitado para
    // siempre, solo sobrevivió a la reactivación junto con el conteo.
    auth.setTime(15 * 60 * 1000 + 1);
    expect((await login('mozo.juan', '2468')).status).toBe(200);
  });

  it('ADV-004-12: los errores del lector del cuerpo responden sin Cache-Control: no-store', async () => {
    const cookie = await adminCookie();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // JSON mal formado: INVALID_JSON se produce antes de entrar al router /users.
    const invalidJson = await request(auth.app)
      .post('/api/users')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send('{"username":"mozo.nuevo","pin":');
    expect(invalidJson.status).toBe(400);
    expect(invalidJson.body).toMatchObject({ error: { code: 'INVALID_JSON' } });
    // Cuerpo de más de 100 KB: PAYLOAD_TOO_LARGE tampoco pasa por el middleware no-store.
    const tooLarge = await request(auth.app)
      .post('/api/users')
      .set('Cookie', cookie)
      .type('json')
      .send({
        username: 'mozo.nuevo',
        displayName: 'A'.repeat(200 * 1024),
        pin: '3968',
        roles: ['waiter'],
      });
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.body).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
    // La spec exige no-store en TODAS las respuestas de /api/users/*, también las de error.
    for (const response of [invalidJson, tooLarge])
      expect.soft(response.headers['cache-control'], String(response.status)).toBe('no-store');
    // El mismo patrón en /auth/* tiene el mismo hueco (se documenta como sistémico).
    const badLogin = await request(auth.app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"username":');
    expect(badLogin.status).toBe(400);
    expect(badLogin.body).toMatchObject({ error: { code: 'INVALID_JSON' } });
  });

  it('ADV-004-13: userId en la frontera exacta y formas hostiles', async () => {
    const cookie = await adminCookie();
    const juan = await auth.createUser('mozo.juan', 'Juan', ['waiter'], '2468');
    // La frontera del INTEGER de PostgreSQL: 2147483647 es válido (404), 2147483648 no.
    const boundary = await patchUser('2147483647', { isActive: false }, cookie);
    expect(boundary.status).toBe(404);
    expect(boundary.body).toEqual(USER_NOT_FOUND_BODY);
    for (const id of ['2147483648', '999999999999999999999999', '00']) {
      const response = await patchUser(id, { isActive: false }, cookie);
      expect.soft(response.status, id).toBe(400);
      expect
        .soft((response.body as { error: { details: { issues: { path: string }[] } } }).error)
        .toMatchObject({
          code: 'VALIDATION_ERROR',
          details: { issues: [{ path: 'userId', message: USER_ID_MESSAGE }] },
        });
    }
    // Los ceros a la izquierda cumplen ^[0-9]+$ y son >0: se resuelven al usuario real.
    const padded = await patchUser(
      '0'.repeat(24) + String(juan.id),
      { displayName: 'Juan Cero' },
      cookie,
    );
    expect(padded.status).toBe(200);
    expect(padded.body).toMatchObject({ id: juan.id, displayName: 'Juan Cero' });
    // Formas hostiles: notación científica, signos, hex, espacios, dígitos Unicode y SQLi.
    for (const id of [
      '1e5',
      '+1',
      '0x10',
      ' 1',
      '1 ',
      '1.0',
      '٣',
      '１２',
      "1' OR '1'='1",
      '1;DROP TABLE users',
      'null',
      'undefined',
    ]) {
      const response = await patchUser(encodeURIComponent(id), { isActive: false }, cookie);
      expect.soft(response.status, id).toBe(400);
      expect.soft(response.headers['cache-control']).toBe('no-store');
    }
    // El objetivo sigue intacto tras la batería.
    expect((await userRow(juan.id))[0]).toMatchObject({ is_active: true });
  });

  it('ADV-004-14: dos PATCH concurrentes para degradar a los dos últimos administradores', async () => {
    const cookie = await adminCookie();
    const admin2 = await auth.createUser('admin2', 'Segunda', ['admin'], '5926');
    // La segunda degradación la hace admin2 con SU sesión: si la hiciera la cookie del
    // dueño ya degradado respondería 403 sin llegar a la guardia, lo que medimos aquí.
    const admin2Cookie = (await loginWithCookie(auth.app, 'admin2', '5926')).cookie;
    const dueno = await userRowId('dueno');
    const results = await Promise.all([
      patchUser(dueno, { roles: ['waiter'] }, cookie),
      patchUser(admin2.id, { roles: ['waiter'] }, admin2Cookie),
    ]);
    const statuses = results.map((response) => response.status).sort((a, b) => a - b);
    expect(statuses).toEqual([200, 409]);
    const lastAdmin = results.find((response) => response.status === 409);
    expect(lastAdmin!.body).toEqual(LAST_ADMIN_BODY);
    const activeAdmins = await rows<{ id: number }>(
      "SELECT id FROM users WHERE is_active AND roles @> '{admin}'",
    );
    expect(activeAdmins).toHaveLength(1);
  });

  it('ADV-004-15: el administrador se degrada a sí mismo y conserva la sesión como mozo', async () => {
    const cookie = await adminCookie();
    const admin2 = await auth.createUser('admin2', 'Segunda', ['admin'], '5926');
    const dueno = await userRowId('dueno');
    const demoted = await patchUser(dueno, { roles: ['waiter'] }, cookie);
    expect(demoted.status).toBe(200);
    expect(demoted.body).toMatchObject({ id: dueno, roles: ['waiter'], isActive: true });
    // La sesión no muere (solo mueren las de un desactivado): vale como mozo...
    const session = await me(cookie);
    expect(session.status).toBe(200);
    expect(session.body).toMatchObject({ user: { username: 'dueno', roles: ['waiter'] } });
    // ...pero ya no administra usuarios: 403 en todas las operaciones.
    for (const response of [
      await getUsers(cookie),
      await postUsers(
        { username: 'otro', displayName: 'Otro', pin: '3968', roles: ['waiter'] },
        cookie,
      ),
      await patchUser(admin2.id, { displayName: 'X' }, cookie),
      await postPin(admin2.id, { pin: '5846' }, cookie),
    ]) {
      expect.soft(response.status).toBe(403);
      expect.soft(response.body).toEqual(FORBIDDEN_BODY);
    }
  });

  it('ADV-004-16: asignación masiva, tipos hostiles y contaminación de prototipos', async () => {
    const cookie = await adminCookie();
    const juan = await auth.createUser('mozo.juan', 'Juan', ['waiter'], '2468');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const valid = { username: 'mozo.nuevo', displayName: 'Ana', pin: '3968', roles: ['waiter'] };
    const hostileCreates: unknown[] = [
      { ...valid, isActive: false },
      { ...valid, id: 99 },
      { ...valid, pinHash: '$2b$04$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
      { ...valid, sessions: [] },
      { ...valid, roles: ['waiter', 'waiter'] },
      { ...valid, roles: 'waiter' },
      [{ ...valid }],
      'mozo.nuevo',
    ];
    for (const body of hostileCreates)
      expect.soft((await postUsers(body, cookie)).status).toBe(400);
    const protoCreate = await request(auth.app)
      .post('/api/users')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send(
        '{"username":"mozo.nuevo","displayName":"Ana","pin":"3968","roles":["waiter"],"__proto__":{"advPolluted":true}}',
      );
    expect(protoCreate.status).toBe(400);
    const hostilePatches: unknown[] = [
      { isActive: false, sessions: [] },
      { isActive: false, pinHash: 'x' },
      { isActive: 'false' },
      { isActive: null },
      { roles: 'waiter' },
      { displayName: '  ' },
      { displayName: 42 },
      { isActive: false, id: 1 },
      [{ isActive: false }],
      'x',
    ];
    for (const body of hostilePatches)
      expect.soft((await patchUser(juan.id, body, cookie)).status).toBe(400);
    for (const body of [{ pin: '5846', pin2: '5846' }, { pin: 5846 }, [{ pin: '5846' }]])
      expect.soft((await postPin(juan.id, body, cookie)).status).toBe(400);
    // Nada se creó ni cambió; el prototipo quedó limpio.
    expect(await rows("SELECT id FROM users WHERE username = 'mozo.nuevo'")).toEqual([]);
    expect((await userRow(juan.id))[0]).toMatchObject({ is_active: true, roles: ['waiter'] });
    expect(Reflect.has({}, 'advPolluted')).toBe(false);
  });

  it('ADV-004-17: altas concurrentes del mismo username producen un solo usuario', async () => {
    const cookie = await adminCookie();
    const body = { username: 'mozo.nuevo', displayName: 'Ana', pin: '3968', roles: ['waiter'] };
    const results = await Promise.all(Array.from({ length: 6 }, () => postUsers(body, cookie)));
    expect(results.map((response) => response.status).sort((a, b) => a - b)).toEqual([
      201, 409, 409, 409, 409, 409,
    ]);
    for (const response of results) {
      expect(response.headers['cache-control']).toBe('no-store');
      if (response.status === 409)
        expect(response.body).toEqual({
          error: {
            code: 'USERNAME_TAKEN',
            message: 'Ese nombre de usuario ya existe.',
            details: null,
          },
        });
    }
    const created = await rows<{ username: string }>(
      "SELECT username FROM users WHERE username = 'mozo.nuevo'",
    );
    expect(created).toHaveLength(1);
    expect((await login('mozo.nuevo', '3968')).status).toBe(200);
  });

  it('ADV-004-18: el administrador restablece su propio PIN y su sesión muere', async () => {
    const cookie = await adminCookie();
    const dueno = await userRowId('dueno');
    const reset = await postPin(dueno, { pin: '5846' }, cookie);
    expect(reset.status).toBe(204);
    expect(reset.headers['cache-control']).toBe('no-store');
    expect((await me(cookie)).status).toBe(401);
    expect((await login('dueno', ADMIN_PIN)).status).toBe(401);
    expect((await login('dueno', '5846')).status).toBe(200);
  });

  it('ADV-004-19: el único administrador acepta PATCH que no le quita nada', async () => {
    const cookie = await adminCookie();
    const dueno = await userRowId('dueno');
    for (const body of [
      { roles: ['admin'] },
      { roles: ['waiter', 'admin'] },
      { displayName: 'Don C.' },
      { isActive: true },
    ]) {
      const response = await patchUser(dueno, body, cookie);
      expect.soft(response.status, JSON.stringify(body)).toBe(200);
    }
    expect((await userRow(dueno))[0]).toMatchObject({
      display_name: 'Don C.',
      is_active: true,
    });
    expect((await userRow(dueno))[0]!.roles).toContain('admin');
  });

  it('ADV-004-20: create-admin rechaza PIN fáciles sin crear nada ni filtrarlos', async () => {
    const run = async (input: string) => {
      const process = new ManagedProcess(
        CREATE_ADMIN_ENTRY,
        [],
        buildChildEnv({ NODE_ENV: 'test', DATABASE_URL: getTestDatabaseUrl() }),
        input,
      );
      const result = await process.waitForExit(15000);
      await process.kill();
      return result;
    };
    for (const weakPin of ['1234', '2512', '2580']) {
      const result = await run(`nuevo\nNuevo\n${weakPin}\n${weakPin}\n`);
      expect(result.code).toBe(1);
      expect(result.timedOut).toBe(false);
      expect(result.stderr).toContain('Ese PIN es muy fácil de adivinar. Elige otro.');
      expect(`${result.stdout}${result.stderr}`).not.toContain(weakPin);
      expect(result.stderr).not.toMatch(/^\s+at /m);
    }
    expect(await rows('SELECT id FROM users')).toEqual([]);
  });

  it('ADV-004-21: la respuesta del PATCH devuelve campos obsoletos tras una edición concurrente', async () => {
    const service = createAdminService();
    await auth.createUser('dueno', 'Don Carlos', ['admin']);
    const juan = await auth.createUser('mozo.juan', 'Juan', ['waiter'], '2468');
    // Otra administración cambia el nombre visible justo antes del SELECT FOR UPDATE.
    const disarm = armBeforeAdminScan(auth.models, async () => {
      await database().query("UPDATE users SET display_name = 'Nombre Concurrente' WHERE id = $1", {
        bind: [juan.id],
      });
    });
    try {
      const updated = await service.updateUser(juan.id, { roles: ['cashier'] });
      // El AdminUser devuelto debería reflejar el estado actual, no el leído sin bloqueo.
      expect(updated.displayName).toBe('Nombre Concurrente');
    } finally {
      disarm();
    }
    // La escritura no pisa el campo ajeno: la base conserva el nombre concurrente.
    expect((await userRow(juan.id))[0]).toMatchObject({
      display_name: 'Nombre Concurrente',
      roles: ['cashier'],
    });
  });

  it('ADV-004-22: métodos no declarados, rutas raras y HEAD', async () => {
    const cookie = await adminCookie();
    const juan = await auth.createUser('mozo.juan', 'Juan', ['waiter'], '2468');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Un request() nuevo por llamada: los Test de un mismo agent comparten el
    // servidor efímero y solo el primero puede usarlo.
    const notFound: ['get' | 'put' | 'delete' | 'patch' | 'post', string][] = [
      ['get', `/api/users/${juan.id}`],
      ['put', `/api/users/${juan.id}`],
      ['delete', `/api/users/${juan.id}`],
      ['get', `/api/users/${juan.id}/pin`],
      ['patch', `/api/users/${juan.id}/pin`],
      ['post', `/api/users/${juan.id}/pin/extra`],
      ['patch', '/api/users'],
      ['patch', '/api/users/'],
    ];
    for (const [method, url] of notFound) {
      // El acceso dinámico va en la misma línea: partirlo dispara no-unexpected-multiline.
      const pendiente = request(auth.app)[method](url);
      const response = await pendiente.set('Cookie', cookie).send({ isActive: false });
      expect.soft(response.status, `${method.toUpperCase()} ${url}`).toBe(404);
      expect.soft(response.body).toEqual(NOT_FOUND_BODY);
    }
    // HEAD sigue la ruta GET: 200 sin cuerpo y con no-store.
    const head = await request(auth.app).head('/api/users').set('Cookie', cookie);
    expect(head.status).toBe(200);
    expect(head.headers['cache-control']).toBe('no-store');
    // OPTIONS lo responde Express de forma implícita solo tras pasar requireAuth:
    // sin sesión sigue siendo 401 (no filtra los métodos permitidos a anónimos).
    const optionsAnon = await request(auth.app).options('/api/users');
    expect(optionsAnon.status).toBe(401);
    expect(optionsAnon.headers['cache-control']).toBe('no-store');
    const optionsAdmin = await request(auth.app).options('/api/users').set('Cookie', cookie);
    expect(optionsAdmin.status).toBe(200);
    expect(optionsAdmin.headers['cache-control']).toBe('no-store');
  });

  it('ADV-004-23: desactivar o restablecer el PIN no toca sesiones ni conteo ajenos', async () => {
    const cookie = await adminCookie();
    const juan = await auth.createUser('mozo.juan', 'Juan', ['waiter'], '2468');
    const ana = await auth.createUser('caja.ana', 'Ana', ['cashier'], '8642');
    const anaSession = await loginWithCookie(auth.app, 'caja.ana', '8642');
    const anaSession2 = await loginWithCookie(auth.app, 'caja.ana', '8642');
    await loginWithCookie(auth.app, 'mozo.juan', '2468');
    // Cuatro fallos de Ana: su conteo no debe limpiarse por operar sobre otro usuario.
    for (let attempt = 0; attempt < 4; attempt += 1)
      expect((await login('caja.ana', '0000')).status).toBe(401);
    expect((await postPin(juan.id, { pin: '5846' }, cookie)).status).toBe(204);
    expect(await sessionsOf(juan.id)).toEqual([]);
    expect(await sessionsOf(ana.id)).toHaveLength(2);
    for (const session of [anaSession, anaSession2])
      expect((await me(session.cookie)).status).toBe(200);
    // El quinto fallo de Ana aún responde 401 pero la bloquea: su conteo sobrevivió
    // intacto a la operación sobre otro usuario (el sexto ya devuelve 429).
    expect((await login('caja.ana', '0000')).status).toBe(401);
    expect((await login('caja.ana', '0000')).status).toBe(429);
    // Desactivar a Juan tampoco toca a Ana.
    expect((await patchUser(juan.id, { isActive: false }, cookie)).status).toBe(200);
    expect((await me(anaSession.cookie)).status).toBe(200);
    expect(await sessionsOf(ana.id)).toHaveLength(2);
  });

  it('ADV-004-24: reactivar no revive sesiones muertas ni el PIN viejo', async () => {
    const cookie = await adminCookie();
    const juan = await auth.createUser('mozo.juan', 'Juan', ['waiter'], '2468');
    const dead = await loginWithCookie(auth.app, 'mozo.juan', '2468');
    expect((await patchUser(juan.id, { isActive: false }, cookie)).status).toBe(200);
    expect((await me(dead.cookie)).status).toBe(401);
    expect((await postPin(juan.id, { pin: '5846' }, cookie)).status).toBe(204);
    expect((await patchUser(juan.id, { isActive: true }, cookie)).status).toBe(200);
    // Ni la sesión borrada ni el PIN viejo vuelven: solo entra con el PIN nuevo.
    expect((await me(dead.cookie)).status).toBe(401);
    expect((await login('mozo.juan', '2468')).status).toBe(401);
    expect((await login('mozo.juan', '5846')).status).toBe(200);
    expect(await sessionsOf(juan.id)).toHaveLength(1);
  });
});
