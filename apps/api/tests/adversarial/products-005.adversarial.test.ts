import request from 'supertest';
import { QueryTypes } from 'sequelize';
import type { Sequelize, InstanceUpdateOptions } from 'sequelize';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserRole } from '@polleria/shared';
import { assertTestDatabase } from '../../src/db/assert-test-database.ts';
import { getPostgresConnectionParts } from '../../src/db/postgres-url.ts';
import { AppError } from '../../src/errors/app-error.ts';
import { errorHandler } from '../../src/middlewares/error-handler.ts';
import { createProductService } from '../../src/services/products/product.service.ts';
import {
  assertConnectedToTestDatabase,
  clearAuthTables,
  clearMenuTables,
  closeTestDatabase,
  connectTestDatabase,
  getTestDatabaseUrl,
  migrateAndClearAuthTables,
} from '../helpers/test-database.ts';
import { loginWithCookie, setupAuth, UNAUTHENTICATED_BODY } from '../helpers/auth.ts';
import { sendRawBody } from '../helpers/raw-body.ts';

const FORBIDDEN_BODY = {
  error: {
    code: 'FORBIDDEN',
    message: 'No tienes permiso para realizar esta acción.',
    details: null,
  },
};
const PRODUCT_NAME_TAKEN_BODY = {
  error: {
    code: 'PRODUCT_NAME_TAKEN',
    message: 'Ya existe un producto con ese nombre.',
    details: null,
  },
};
const PRODUCT_NOT_FOUND_BODY = {
  error: { code: 'PRODUCT_NOT_FOUND', message: 'Ese producto no existe.', details: null },
};
const NOT_FOUND_BODY = {
  error: { code: 'NOT_FOUND', message: 'La ruta solicitada no existe.', details: null },
};
const PRODUCT_ID_MESSAGE = 'El identificador del producto no es válido.';

/** Los issues de un VALIDATION_ERROR con el tipo mínimo (el body de supertest es any). */
const issuesOf = (response: { body: unknown }) =>
  (response.body as { error: { details: { issues: { path: string; message: string }[] } } }).error
    .details.issues;
const ADMIN_PIN = '975310';

/** JSON válido de exactamente `bytes` bytes: {"a":"xxx...x"}. */
function jsonBodyOfSize(bytes: number): string {
  const overhead = Buffer.byteLength('{"a":""}');
  return `{"a":"${'x'.repeat(bytes - overhead)}"}`;
}

/**
 * Guardia estricta de la conexión de pruebas (idéntica a la de la 004): la URL debe
 * ser exactamente polleria_test en localhost como usuario polleria, sin parámetros
 * extra, antes de permitir cualquier SQL directo de las pruebas. products está
 * autorizada a limpieza (D-005-10) igual que users y sessions.
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

/**
 * Ataques a la carta (spec 005) que las pruebas de AC no cubren: productId hostiles en
 * la URL, métodos y rutas alias, el no-store en rutas hermanas, el lector del cuerpo
 * antes de la autenticación, la frontera exacta del límite de 100 KB, choques de
 * unicidad bajo concurrencia real, duplicados visuales que lower() no equipara, la
 * diferencia entre los CHECK de la base y el dominio, el productId no validado del
 * servicio, la actualización fantasma de una fila borrada a mitad de vuelo, la sesión
 * y el rol leídos en vivo, y el orden de la carta con ñ, tildes y dígitos.
 */
describe('005-adversarial: API, servicio y migración de productos sobre polleria_test', () => {
  let sequelize: Sequelize | undefined;
  let auth: ReturnType<typeof setupAuth>;
  let service: ReturnType<typeof createProductService>;
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
    await clearMenuTables(database());
    auth = setupAuth(database());
    service = createProductService({ models: auth.models });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    try {
      if (sequelize && prepared) {
        await assertAuthorizedConnection(sequelize);
        await clearMenuTables(sequelize);
        await clearAuthTables(sequelize);
      }
    } finally {
      await closeTestDatabase(sequelize);
    }
  });

  const rows = <T extends object>(sql: string, bind?: (string | number | null)[]) =>
    database().query<T>(sql, { type: QueryTypes.SELECT, bind });
  const productRow = (id: number) =>
    rows<{ name: string; category: string; price_cents: number; is_active: boolean }>(
      'SELECT name, category, price_cents, is_active FROM products WHERE id = $1',
      [id],
    );
  const productIds = () => rows<{ id: number }>('SELECT id FROM products');
  const insertProductSql = (name: string, category = 'drink', priceCents = 500) =>
    database().query(
      'INSERT INTO products (name, category, price_cents) VALUES ($1, $2, $3) RETURNING id',
      { bind: [name, category, priceCents] },
    );

  /** Crea al administrador dueño y devuelve la cookie de su sesión real. */
  async function adminCookie() {
    await auth.createUser('dueno', 'Don Carlos', ['admin'], ADMIN_PIN);
    return (await loginWithCookie(auth.app, 'dueno', ADMIN_PIN)).cookie;
  }
  /** Crea una usuaria con esos roles y devuelve la cookie de su sesión real. */
  async function cookieFor(username: string, roles: UserRole[], pin: string) {
    await auth.createUser(username, 'Persona', roles, pin);
    return (await loginWithCookie(auth.app, username, pin)).cookie;
  }

  const getProducts = (cookie?: string) => {
    const call = request(auth.app).get('/api/products');
    return cookie === undefined ? call : call.set('Cookie', cookie);
  };
  const postProducts = (body: unknown, cookie?: string) => {
    const call = request(auth.app)
      .post('/api/products')
      .send(body as object);
    return cookie === undefined ? call : call.set('Cookie', cookie);
  };
  const patchProduct = (id: number | string, body: unknown, cookie?: string) => {
    const call = request(auth.app)
      .patch(`/api/products/${id}`)
      .send(body as object);
    return cookie === undefined ? call : call.set('Cookie', cookie);
  };

  it('ADV-005-11: productId en la frontera exacta y formas hostiles responden 400/404 con no-store', async () => {
    const cookie = await adminCookie();
    const product = await service.createProduct({
      name: 'Chicha',
      category: 'drink',
      priceCents: 500,
    });
    // Frontera del INTEGER de la base: 2147483647 es válido (404), 2147483648 no.
    const boundary = await patchProduct('2147483647', { isActive: false }, cookie);
    expect(boundary.status).toBe(404);
    expect(boundary.body).toEqual(PRODUCT_NOT_FOUND_BODY);
    for (const id of [
      '2147483648',
      '9'.repeat(30),
      '0',
      '00',
      '1.5',
      '-3',
      '1e5',
      '+1',
      '0x10',
      ' 1',
      '1 ',
      '1.0',
      '\u0663',
      '\uFF11\uFF12',
      "1' OR '1'='1",
      '1;DROP TABLE products',
      'null',
      'undefined',
      'NaN',
    ]) {
      const response = await patchProduct(encodeURIComponent(id), { isActive: false }, cookie);
      expect.soft(response.status, id).toBe(400);
      expect.soft(response.headers['cache-control'], id).toBe('no-store');
      expect
        .soft(
          (response.body as { error: { details: { issues: { path: string }[] } } }).error.details
            .issues[0]?.path,
          id,
        )
        .toBe('productId');
    }
    // Formas codificadas: %32 es '2', %00 inyecta NUL, %2F una barra dentro del
    // segmento (router la decodifica a '1/2' y el patrón la rechaza igual).
    for (const id of ['3%20', '%203', '3%00x', '1%2F2', '3;']) {
      const response = await patchProduct(id, { isActive: false }, cookie);
      expect.soft(response.status, id).toBe(400);
      expect.soft(response.headers['cache-control'], id).toBe('no-store');
    }
    // Ceros a la izquierda resuelven al producto real.
    const padded = await patchProduct(
      '0'.repeat(24) + String(product.id),
      { priceCents: 600 },
      cookie,
    );
    expect(padded.status).toBe(200);
    expect(padded.body).toMatchObject({ id: product.id, priceCents: 600 });
    // El objetivo sigue intacto tras la batería.
    expect(await productRow(product.id)).toEqual([
      { name: 'Chicha', category: 'drink', price_cents: 600, is_active: true },
    ]);
  });

  it('ADV-005-12: métodos no declarados, alias de ruta y auto-OPTIONS de Express 5', async () => {
    const cookie = await adminCookie();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // HEAD y OPTIONS los resuelve Express sobre las rutas declaradas: sin cuerpo y con
    // la lista Allow. Exponen la superficie (qué métodos existen) pero ningún dato.
    const head = await request(auth.app).head('/api/products').set('Cookie', cookie);
    expect(head.status).toBe(200);
    expect(head.text ?? '').toBe('');
    const options = await request(auth.app).options('/api/products').set('Cookie', cookie);
    expect(options.status).toBe(200);
    expect(options.headers['allow']).toBe('GET, HEAD, POST');
    const optionsId = await request(auth.app).options('/api/products/7').set('Cookie', cookie);
    expect(optionsId.status).toBe(200);
    expect(optionsId.headers['allow']).toBe('PATCH');
    // OPTIONS tampoco exige sesión (preflight de navegador): responde la lista igual.
    const anonOptions = await request(auth.app).options('/api/products');
    expect(anonOptions.status).toBe(200);
    expect(anonOptions.headers['cache-control']).toBe('no-store');
    // Métodos y subrutas no declarados: 404 NOT_FOUND con no-store.
    const product = await service.createProduct({
      name: 'Chicha',
      category: 'drink',
      priceCents: 500,
    });
    for (const response of [
      await request(auth.app).trace('/api/products').set('Cookie', cookie),
      await request(auth.app).patch('/api/products').set('Cookie', cookie).send({ priceCents: 1 }),
      await request(auth.app).post(`/api/products/${product.id}`).set('Cookie', cookie).send({}),
      await request(auth.app).get(`/api/products/${product.id}`).set('Cookie', cookie),
      await request(auth.app).delete(`/api/products/${product.id}`).set('Cookie', cookie),
      await request(auth.app).put('/api/products').set('Cookie', cookie).send({}),
    ]) {
      expect.soft(response.status).toBe(404);
      expect.soft(response.body).toEqual(NOT_FOUND_BODY);
      expect.soft(response.headers['cache-control']).toBe('no-store');
    }
    // HEAD sobre '/:productId' (solo PATCH declarado): 404 igual, pero una respuesta
    // HEAD nunca lleva cuerpo — el formato {error:{...}} no aplica ahí.
    const headId = await request(auth.app)
      .head(`/api/products/${product.id}`)
      .set('Cookie', cookie);
    expect(headId.status).toBe(404);
    expect(headId.headers['cache-control']).toBe('no-store');
    expect(headId.text ?? '').toBe('');
    // Alias de ruta que Express acepta igual: barra final y doble barra resuelven '/'.
    const trailing = await getProducts(cookie);
    const withSlash = await request(auth.app).get('/api/products/').set('Cookie', cookie);
    const doubleSlash = await request(auth.app).get('/api/products//').set('Cookie', cookie);
    for (const response of [trailing, withSlash, doubleSlash]) {
      expect.soft(response.status).toBe(200);
      expect.soft(response.headers['cache-control']).toBe('no-store');
    }
    const postSlash = await request(auth.app)
      .post('/api/products/')
      .set('Cookie', cookie)
      .send({ name: 'Barra', category: 'dish', priceCents: 100 });
    expect(postSlash.status).toBe(201);
    // Mayúsculas en la ruta: Express enruta sin distinguirlas y el no-store se fija en
    // minúsculas (lección ADV-004-25), así que el alias completo queda cubierto.
    for (const response of [
      await request(auth.app).get('/api/PRODUCTS').set('Cookie', cookie),
      await request(auth.app).get('/Api/Products').set('Cookie', cookie),
      await request(auth.app)
        .patch('/API/PRODUCTS/1')
        .set('Cookie', cookie)
        .send({ priceCents: 1 }),
      await request(auth.app).post('/api/PRODUCTS').set('Cookie', cookie).send({}),
    ]) {
      expect.soft(response.headers['cache-control']).toBe('no-store');
      expect.soft(response.status).toBeGreaterThanOrEqual(200);
      expect.soft(response.status).toBeLessThan(500);
    }
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-005-13: las rutas hermanas de /api/products responden 404 pero SIN Cache-Control', async () => {
    const cookie = await adminCookie();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // NO_STORE_PATH_PREFIXES exige el prefijo exacto o seguido de '/': una ruta que
    // comparte el texto pero no cuelga del router (/api/products.json, /api/products;x,
    // /api/productsX) cae en el 404 común sin la cabecera. Documenta el borde de la
    // regla "toda respuesta de /api/products/* lleva no-store": esos URLs no son
    // /api/products/* estrictamente. Residual de la clase ADV-004-25.
    for (const path of [
      '/api/products.json',
      '/api/products;foo',
      '/api/productsX',
      '/api/products%20',
    ]) {
      const response = await request(auth.app).get(path).set('Cookie', cookie);
      expect.soft(response.status, path).toBe(404);
      expect.soft(response.body, path).toEqual(NOT_FOUND_BODY);
      // Documentado: el prefijo NO los cubre, así que este 404 sale sin no-store. No es
      // hallazgo — la regla habla de /api/products/* y una ruta hermana no entrega
      // datos de la carta— pero delimita dónde termina la protección.
      expect.soft(response.headers['cache-control'], path).toBeUndefined();
    }
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-005-14: el lector del cuerpo corre antes de la sesión y ignora Content-Type que no son JSON', async () => {
    const cookie = await adminCookie();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Sin sesión + JSON roto: el 400 INVALID_JSON gana al 401 (el lector es global).
    const badAnon = await sendRawBody(
      request(auth.app).post('/api/products').set('Content-Type', 'application/json'),
      Buffer.from('{"name":'),
    );
    expect(badAnon.status).toBe(400);
    expect(badAnon.body).toMatchObject({ error: { code: 'INVALID_JSON' } });
    expect(badAnon.headers['cache-control']).toBe('no-store');
    // GET no usa el cuerpo, pero un JSON roto igual lo tumban antes del handler.
    const getBad = await sendRawBody(
      request(auth.app)
        .get('/api/products')
        .set('Cookie', cookie)
        .set('Content-Type', 'application/json'),
      Buffer.from('{"x":'),
    );
    expect(getBad.status).toBe(400);
    expect(getBad.body).toMatchObject({ error: { code: 'INVALID_JSON' } });
    // Cuerpos con otro Content-Type no se leen: el esquema recibe {} y responde 400.
    for (const [contentType, body] of [
      ['text/plain', '{"name":"A","category":"dish","priceCents":1}'],
      ['application/x-www-form-urlencoded', 'name=B&category=dish&priceCents=1'],
      ['application/jsonx', '{"name":"C","category":"dish","priceCents":1}'],
      // +json no está habilitado en el lector por defecto.
      ['application/vnd.api+json', '{"name":"D","category":"dish","priceCents":1}'],
      ['application/json; charset=iso-8859-1', '{"name":"E","category":"dish","priceCents":1}'],
    ] as [string, string][]) {
      const response = await request(auth.app)
        .post('/api/products')
        .set('Cookie', cookie)
        .set('Content-Type', contentType)
        .send(body);
      expect.soft(response.status, contentType).toBeGreaterThanOrEqual(400);
      expect.soft(response.status, contentType).toBeLessThan(500);
      expect.soft(response.headers['cache-control'], contentType).toBe('no-store');
    }
    // application/JSON en mayúsculas sí se parsea (typeis no distingue mayúsculas).
    const upper = await request(auth.app)
      .post('/api/products')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/JSON')
      .send({ name: 'Mayus', category: 'dish', priceCents: 1 });
    expect(upper.status).toBe(201);
    // charset=utf-7 se declara pero los bytes ASCII se leen igual: pasa.
    const utf7 = await request(auth.app)
      .post('/api/products')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json; charset=utf-7')
      .send('{"name":"Utf7","category":"dish","priceCents":1}');
    expect(utf7.status).toBe(201);
    expect(await productIds()).toHaveLength(2);
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-005-15: el límite del cuerpo se mide tras descomprimir y en bytes exactos', async () => {
    const cookie = await adminCookie();
    const zlib = await import('node:zlib');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const post = (contentEncoding?: string) => {
      const call = request(auth.app)
        .post('/api/products')
        .set('Cookie', cookie)
        .set('Content-Type', 'application/json');
      return contentEncoding === undefined ? call : call.set('Content-Encoding', contentEncoding);
    };
    // La frontera de '100kb' son 102400 bytes: exactos pasa el lector (cae en el
    // esquema como 400 por la clave 'a' desconocida) y uno más es 413.
    const exact = await sendRawBody(post(), Buffer.from(jsonBodyOfSize(102400)));
    expect(exact.status).toBe(400);
    expect(exact.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    const over = await sendRawBody(post(), Buffer.from(jsonBodyOfSize(102401)));
    expect(over.status).toBe(413);
    expect(over.body).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
    // Comprimido no engaña: un gzip que infla a más de 100 KB también es 413.
    const gzip = await sendRawBody(
      post('gzip'),
      zlib.gzipSync(Buffer.from(jsonBodyOfSize(150 * 1024))),
    );
    expect(gzip.status).toBe(413);
    expect(gzip.body).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
    // Y brotli es una codificación admitida: el mismo cuerpo comprimido crea el producto.
    const br = await sendRawBody(
      post('br'),
      zlib.brotliCompressSync(Buffer.from('{"name":"Brotli","category":"dish","priceCents":1}')),
    );
    expect(br.status).toBe(201);
    for (const response of [exact, over, gzip, br])
      expect.soft(response.headers['cache-control']).toBe('no-store');
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-005-16: la unicidad bajo concurrencia real deja siempre un solo producto', async () => {
    const cookie = await adminCookie();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Seis altas simultáneas del mismo nombre: el índice único decide la ganadora.
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        postProducts({ name: 'Carrera', category: 'dish', priceCents: 100 }, cookie),
      ),
    );
    expect(results.map((response) => response.status).sort((a, b) => a - b)).toEqual([
      201, 409, 409, 409, 409, 409,
    ]);
    for (const response of results) {
      if (response.status === 409) expect(response.body).toEqual(PRODUCT_NAME_TAKEN_BODY);
      expect(response.headers['cache-control']).toBe('no-store');
    }
    // Carrera mixta: un PATCH que renombra a 'x' contra un POST que crea 'x'.
    const renamed = await service.createProduct({ name: 'Viejo', category: 'dish', priceCents: 1 });
    const clash = await Promise.all([
      postProducts({ name: 'X', category: 'dish', priceCents: 1 }, cookie),
      patchProduct(renamed.id, { name: 'x' }, cookie),
    ]);
    // Uno gana (200 o 201 según quién llegó primero) y el otro choca (409); en la base
    // queda exactamente una 'x'.
    const clashStatuses = clash.map((response) => response.status);
    expect(clashStatuses.filter((status) => status === 409)).toHaveLength(1);
    expect(clashStatuses.filter((status) => status === 200 || status === 201)).toHaveLength(1);
    expect(await rows('SELECT id FROM products WHERE lower(name) = $1', ['x'])).toHaveLength(1);
    // Dos PATCH a nombre en colisión: misma regla.
    const first = await service.createProduct({ name: 'P1', category: 'dish', priceCents: 1 });
    const second = await service.createProduct({ name: 'P2', category: 'dish', priceCents: 1 });
    const renames = await Promise.all([
      patchProduct(first.id, { name: 'Mismo' }, cookie),
      patchProduct(second.id, { name: 'MISMO' }, cookie),
    ]);
    expect(renames.map((response) => response.status).sort((a, b) => a - b)).toEqual([200, 409]);
    // Y dos PATCH a campos distintos del mismo producto se fusionan sin perder nada.
    const merged = await service.createProduct({
      name: 'Fusion',
      category: 'dish',
      priceCents: 100,
    });
    const [byName, byPrice] = await Promise.all([
      patchProduct(merged.id, { name: 'Fusion Nueva' }, cookie),
      patchProduct(merged.id, { priceCents: 999 }, cookie),
    ]);
    expect(byName.status).toBe(200);
    expect(byPrice.status).toBe(200);
    expect(await productRow(merged.id)).toEqual([
      { name: 'Fusion Nueva', category: 'dish', price_cents: 999, is_active: true },
    ]);
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-005-17: un PATCH que choca por nombre no aplica NI siquiera el isActive del mismo cuerpo', async () => {
    const cookie = await adminCookie();
    const target = await service.createProduct({
      name: 'Objetivo',
      category: 'dish',
      priceCents: 500,
    });
    await service.createProduct({ name: 'Ocupado', category: 'dish', priceCents: 1 });
    const before = await productRow(target.id);
    // El UPDATE es atómico: si el nombre choca, la desactivación tampoco se aplica.
    const response = await patchProduct(
      target.id,
      { isActive: false, name: 'ocupado', priceCents: 999 },
      cookie,
    );
    expect(response.status).toBe(409);
    expect(response.body).toEqual(PRODUCT_NAME_TAKEN_BODY);
    expect(await productRow(target.id)).toEqual(before);
  });

  it('ADV-005-18: renombrar libera el nombre viejo y el auto-rename con otra capitalización lo mantiene tomado', async () => {
    const cookie = await adminCookie();
    const product = await service.createProduct({
      name: 'Chicha',
      category: 'drink',
      priceCents: 500,
    });
    // Renombrar a sí mismo con otra capitalización no choca contra sí mismo.
    const self = await patchProduct(product.id, { name: 'CHICHA' }, cookie);
    expect(self.status).toBe(200);
    expect(self.body).toMatchObject({ id: product.id, name: 'CHICHA' });
    // ...y el nombre sigue tomado para un segundo producto.
    const taken = await postProducts({ name: 'chicha', category: 'drink', priceCents: 1 }, cookie);
    expect(taken.status).toBe(409);
    // Al renombrar, el nombre viejo queda libre para el siguiente alta.
    const moved = await patchProduct(product.id, { name: 'Chicha Grande' }, cookie);
    expect(moved.status).toBe(200);
    const freed = await postProducts({ name: 'chicha', category: 'drink', priceCents: 1 }, cookie);
    expect(freed.status).toBe(201);
  });

  it('ADV-005-19: la NFC del esquema protege contra NFD por API, y el precio se valida en la frontera', async () => {
    const cookie = await adminCookie();
    await service.createProduct({ name: 'Chicha', category: 'drink', priceCents: 500 });
    // 'Chicha' en NFD se normaliza a NFC antes del INSERT: choca contra la existente.
    const nfd = await postProducts(
      { name: 'Chicha'.normalize('NFD'), category: 'drink', priceCents: 600 },
      cookie,
    );
    expect(nfd.status).toBe(409);
    expect(nfd.body).toEqual(PRODUCT_NAME_TAKEN_BODY);
    // Espacio duro en los bordes: el recorte lo quita y choca igual.
    const nbsp = await postProducts(
      { name: '\u00A0Chicha\u00A0', category: 'drink', priceCents: 600 },
      cookie,
    );
    expect(nbsp.status).toBe(409);
    // Frontera del precio por HTTP.
    for (const [priceCents, expected] of [
      [-0, 201], // -0 entra como entero y la base guarda 0
      [99999, 201],
      [1e2, 201], // notación float que sigue siendo entera
      [100000, 400],
      [-1, 400],
      [18.5, 400],
      ['500', 400],
    ] as [number | string, number][]) {
      const response = await postProducts(
        {
          name: `P-${String(priceCents)}-${Math.random().toString(36).slice(2, 6)}`,
          category: 'dish',
          priceCents,
        },
        cookie,
      );
      expect.soft(response.status, String(priceCents)).toBe(expected);
      expect.soft(response.headers['cache-control']).toBe('no-store');
      if (expected === 201 && Object.is(priceCents, -0))
        expect(response.body).toMatchObject({ priceCents: 0 });
    }
  });

  it('ADV-005-20: la unicidad por lower() permite duplicados visuales (espacio doble y homoglifos)', async () => {
    const cookie = await adminCookie();
    await service.createProduct({ name: 'Chicha Morada', category: 'drink', priceCents: 500 });
    // Documentado como hallazgo (Medio, gap de spec): RN-005-05 define la unicidad como
    // lower(name), sin colapsar espacios internos ni igualar homoglifos. 'Chicha
    // Morada' con doble espacio y 'Chicha Morada' con la 'a' final cirílica U+0430 se
    // ven idénticas en la carta pero son otra fila para el índice. Un error de tipeo
    // del administrador (doble espacio) basta para duplicar la carta.
    const doubleSpace = await postProducts(
      { name: 'Chicha  Morada', category: 'drink', priceCents: 600 },
      cookie,
    );
    expect(doubleSpace.status).toBe(201);
    const homoglyph = await postProducts(
      { name: 'Chicha Morad\u0430', category: 'drink', priceCents: 700 },
      cookie,
    );
    expect(homoglyph.status).toBe(201);
    const listed = (await getProducts(cookie)).body as { products: { name: string }[] };
    expect(listed.products.filter((product) => /chicha/i.test(product.name))).toHaveLength(3);
  });

  it('ADV-005-21: los CHECK de la base admiten lo que el dominio rechaza (btrim solo ASCII y lower() sin normalización)', async () => {
    // Documentado como hallazgo (Bajo, deuda técnica): la base solo garantiza
    // `name = btrim(name)`, que recorta el espacio ASCII. Un INSERT directo con un tab
    // o un NBSP en los bordes, o con caracteres de control en medio, pasa el CHECK —
    // y un nombre en NFD coexistiendo con su equivalente NFC porque lower() no
    // normaliza. La API no puede producir estas filas (el esquema recorta y
    // normaliza), pero quedan servidas en la carta si entran por SQL/seed/migración.
    const cookie = await adminCookie();
    await service.createProduct({ name: 'Chicha', category: 'drink', priceCents: 500 });
    // btrim no quita tab ni NBSP: pasan el CHECK y quedan guardados.
    await expect(
      database().query('INSERT INTO products (name, category, price_cents) VALUES ($1, $2, $3)', {
        bind: ['\tTabulada\t', 'dish', 100],
      }),
    ).resolves.toBeDefined();
    await expect(
      insertProductSql('\u00A0ConEspacioDuro\u00A0', 'dish', 100),
    ).resolves.toBeDefined();
    // Y un tab en medio del texto también pasa: varchar lo guarda sin queja.
    await expect(insertProductSql('Con\tTab', 'dish', 100)).resolves.toBeDefined();
    // Un NUL por bind de Sequelize llega mutilado: el escape del dialecto pg lo
    // reescribe como los caracteres '\\' + '0' (la fila queda 'Con\\0NUL?', sondeado),
    // sin que nadie avise. Por un parámetro $N real del driver, Postgres sí rechaza
    // el byte con 22021. Otro caso de la capa SQL comportándose distinto del dominio.
    await insertProductSql('Con\u0000NUL?', 'dish', 100);
    expect(
      await rows<{ name: string }>("SELECT name FROM products WHERE name = 'Con\\0NUL?'"),
    ).toEqual([{ name: 'Con\\0NUL?' }]);
    // NFD coexistente: 'Chicha' + U+0301 es visualmente 'Chichá' para quien lee pero
    // otra cadena para lower() — convive con una fila NFC del mismo nombre visual.
    await insertProductSql('Chich\u00E1', 'drink', 600); // NFC
    await insertProductSql('Chicha\u0301', 'drink', 700); // NFD: 'a' + tilde combinante
    const names = await rows<{ name: string }>('SELECT name FROM products ORDER BY id');
    expect(names.map((row) => row.name)).toContain('Chich\u00E1');
    expect(names.map((row) => row.name)).toContain('Chicha\u0301');
    // Y la carta los sirve tal cual a quien consulte.
    const listed = (await getProducts(cookie)).body as { products: { name: string }[] };
    expect(listed.products.map((product) => product.name)).toContain('Chicha\u0301');
  });

  it('ADV-005-22: el servicio confía en productId: NaN e Infinity escapan como DatabaseError cruda', async () => {
    // Documentado como hallazgo (Bajo, defensa en profundidad): el controller valida
    // ^[0-9]+$ antes de llamar, pero el contrato del servicio no blinda el id. Con un
    // número no entero findByPk devuelve null (→ PRODUCT_NOT_FOUND coherente), pero
    // con NaN o Infinity Sequelize genera SQL que la base rechaza con 42703 — un
    // error crudo que sería un 500 con log si algún caller no validara antes.
    await service.createProduct({ name: 'Existente', category: 'dish', priceCents: 100 });
    for (const badId of [1.5, -1, 2147483648, Number.MAX_SAFE_INTEGER])
      await expect(service.updateProduct(badId, { priceCents: 1 })).rejects.toMatchObject({
        code: 'PRODUCT_NOT_FOUND',
      });
    for (const badId of [Number.NaN, Infinity, -Infinity]) {
      const caught = await service
        .updateProduct(badId, { priceCents: 1 })
        .catch((error: unknown) => error);
      expect.soft(caught).toBeInstanceOf(Error);
      expect.soft(caught instanceof AppError, String(badId)).toBe(false);
    }
    // Un id como texto dígito se coacciona: 'el id' llega a la base igual.
    const created = await service.createProduct({ name: 'PorId', category: 'dish', priceCents: 1 });
    const viaString = await service.updateProduct(String(created.id) as unknown as number, {
      priceCents: 42,
    });
    expect(viaString.priceCents).toBe(42);
  });

  it('ADV-005-23: los roles y el estado del usuario se leen en vivo en cada solicitud', async () => {
    const cookie = await adminCookie();
    const dueno = await rows<{ id: number }>("SELECT id FROM users WHERE username = 'dueno'");
    const adminId = dueno[0]!.id;
    // Le quitan admin con la sesión abierta: la siguiente escritura es 403, pero la
    // lectura de la carta sigue siendo válida (RN-003-06/07, D-005-08).
    await database().query('UPDATE users SET roles = $1 WHERE id = $2', {
      bind: [['waiter'], adminId],
    });
    const demotedPost = await postProducts(
      { name: 'Nuevo', category: 'dish', priceCents: 100 },
      cookie,
    );
    expect(demotedPost.status).toBe(403);
    expect(demotedPost.body).toEqual(FORBIDDEN_BODY);
    const demotedGet = await getProducts(cookie);
    expect(demotedGet.status).toBe(200);
    // Y si lo desactivan del todo, ni siquiera la lectura pasa.
    await database().query('UPDATE users SET is_active = false WHERE id = $1', {
      bind: [adminId],
    });
    for (const response of [
      await getProducts(cookie),
      await postProducts({ name: 'Otro', category: 'dish', priceCents: 100 }, cookie),
      await patchProduct(1, { priceCents: 1 }, cookie),
    ]) {
      expect.soft(response.status).toBe(401);
      expect.soft(response.body).toEqual(UNAUTHENTICATED_BODY);
      expect.soft(response.headers['cache-control']).toBe('no-store');
    }
  });

  it('ADV-005-24: el orden de la carta con dígitos, ñ, tildes y mayúsculas mixtas', async () => {
    // La colación española manda: dígitos antes de letras en orden léxico ('10' antes
    // de '2': no hay orden numérico — queda documentado), ñ entre n y o, y los
    // empates insensibles a tilde/mayúscula se resuelven por id.
    const created: { id: number; name: string }[] = [];
    for (const name of [
      '2 unidades',
      '10 unidades',
      '\u00E1rbol',
      'Arpa',
      'Naranja',
      '\u00D1apa',
      'NIDO',
      'M\u00EDo',
      'Mi\u00F1o',
      'Aji',
      'Aj\u00ED',
    ])
      created.push(await service.createProduct({ name, category: 'dish', priceCents: 100 }));
    const byName = (name: string) => created.find((product) => product.name === name)!.id;
    const order = (await service.listProducts()).map((product) => product.id);
    const expected = [
      '10 unidades',
      '2 unidades',
      'Aji',
      'Aj\u00ED',
      '\u00E1rbol',
      'Arpa',
      'Mi\u00F1o',
      'M\u00EDo',
      'Naranja',
      'NIDO',
      '\u00D1apa',
    ].map(byName);
    // 'Aji'/'Ají' empatan por colación base y manda el id de creación; 'Miño' va
    // antes de 'Mío' porque en la colación española ñ < o (letra distinta de n).
    expect(order).toEqual(expected);
  });

  it('ADV-005-25: updateProduct resuelve un producto que ya no existe (UPDATE de cero filas no se detecta)', async () => {
    // Hallazgo (Bajo): findByPk lee la fila y update() dispara un UPDATE sin verificar
    // affectedRows. Si la fila desaparece entre ambos (hoy solo por SQL directo — la
    // API nunca borra productos, RN-005-04), el servicio resuelve con el objeto en
    // memoria como si hubiera funcionado: la API respondería 200 de un producto
    // fantasma. Lo correcto sería detectar el UPDATE vacío y responder PRODUCT_NOT_FOUND.
    const product = await service.createProduct({
      name: 'Fantasma',
      category: 'dish',
      priceCents: 100,
    });
    let armed = true;
    auth.models.Product.addHook(
      'beforeUpdate',
      'adv005phantom',
      async (_instance: unknown, options: InstanceUpdateOptions) => {
        if (!armed || options.transaction !== undefined) return;
        armed = false;
        await database().query('DELETE FROM products WHERE id = $1', { bind: [product.id] });
      },
    );
    try {
      await expect(service.updateProduct(product.id, { priceCents: 700 })).rejects.toMatchObject({
        code: 'PRODUCT_NOT_FOUND',
      });
    } finally {
      auth.models.Product.removeHook('beforeUpdate', 'adv005phantom');
    }
    expect(await rows('SELECT id FROM products WHERE id = $1', [product.id])).toEqual([]);
  });

  it('ADV-005-26: la carta no degrada lo existente: login, me y /api/users siguen igual', async () => {
    const cookie = await adminCookie();
    const mozo = await cookieFor('mozo.juan', ['waiter'], '2468');
    await service.createProduct({ name: 'Chicha', category: 'drink', priceCents: 500 });
    await postProducts({ name: 'Otro', category: 'dish', priceCents: 100 }, cookie);
    // La sesión y los roles previos no se tocan: el admin lista usuarios, el mozo no.
    const me = await request(auth.app).get('/api/auth/me').set('Cookie', cookie);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ user: { username: 'dueno' } });
    const users = await request(auth.app).get('/api/users').set('Cookie', cookie);
    expect(users.status).toBe(200);
    const mozoUsers = await request(auth.app).get('/api/users').set('Cookie', mozo);
    expect(mozoUsers.status).toBe(403);
    // El mozo sí lee la carta pero no la escribe.
    expect((await getProducts(mozo)).status).toBe(200);
    const mozoPost = await postProducts(
      { name: 'Invasion', category: 'dish', priceCents: 1 },
      mozo,
    );
    expect(mozoPost.status).toBe(403);
    expect(await rows("SELECT id FROM products WHERE name = 'Invasion'")).toEqual([]);
  });

  it('ADV-005-27: JSON con claves duplicadas toma la última y los cuerpos con __proto__ o arreglo se rechazan', async () => {
    const cookie = await adminCookie();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // JSON.parse se queda con la última clave repetida: se crea 'Segunda'.
    const dup = await request(auth.app)
      .post('/api/products')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send('{"name":"Primera","name":"Segunda","category":"dish","priceCents":1}');
    expect(dup.status).toBe(201);
    expect(dup.body).toMatchObject({ name: 'Segunda' });
    // __proto__ como clave propia: objeto estricto la rechaza y nada se contamina.
    const proto = await request(auth.app)
      .post('/api/products')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send('{"name":"P","category":"dish","priceCents":1,"__proto__":{"adv":true}}');
    expect(proto.status).toBe(400);
    expect(Reflect.has({}, 'adv')).toBe(false);
    // Arreglo, texto plano y null como cuerpo JSON: todos 400 VALIDATION_ERROR.
    for (const raw of ['[{"name":"P","category":"dish","priceCents":1}]', '"texto"', 'null'])
      expect
        .soft(
          (
            await request(auth.app)
              .post('/api/products')
              .set('Cookie', cookie)
              .set('Content-Type', 'application/json')
              .send(raw)
          ).status,
          raw.slice(0, 20),
        )
        .toBe(400);
    expect(await productIds()).toHaveLength(1);
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-005-28: el productId de la ruta se valida antes que el cuerpo (y a solas)', async () => {
    const cookie = await adminCookie();
    // PATCH /api/products/abc con cuerpo inválido reporta solo el issue de productId.
    const response = await patchProduct('abc', { priceCents: 'x' }, cookie);
    expect(response.status).toBe(400);
    expect(issuesOf(response)).toEqual([{ path: 'productId', message: PRODUCT_ID_MESSAGE }]);
    // Y con cuerpo vacío igual: el identificador se valida primero.
    const empty = await patchProduct('abc', {}, cookie);
    expect(empty.status).toBe(400);
    expect(issuesOf(empty)).toEqual([{ path: 'productId', message: PRODUCT_ID_MESSAGE }]);
  });

  it('ADV-005-29: ninguna respuesta de la batería registra log y todas llevan no-store', async () => {
    const cookie = await adminCookie();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const responses = [
      await getProducts(cookie),
      await getProducts(),
      await postProducts({ name: 'Ok', category: 'dish', priceCents: 100 }, cookie),
      await postProducts({ name: 'ok', category: 'dish', priceCents: 100 }, cookie),
      await postProducts({ name: 'Malo', category: 'combo', priceCents: 100 }, cookie),
      await postProducts({ name: 'Malo' }, cookie),
      await patchProduct(999999, { priceCents: 1 }, cookie),
      await patchProduct('abc', { priceCents: 1 }, cookie),
      await patchProduct(1, {}, cookie),
      await request(auth.app).delete('/api/products/1').set('Cookie', cookie),
      await request(auth.app).options('/api/products'),
    ];
    for (const response of responses) {
      expect.soft(response.headers['cache-control'], String(response.status)).toBe('no-store');
      // Ningún 4xx registra error y ninguno filtra datos de sesión ni de la base.
      expect
        .soft(JSON.stringify(response.body))
        .not.toMatch(/polleria|sequelize|SELECT|password|token/i);
    }
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-005-30: un escape % malformado en la ruta debería ser 4xx, pero hoy es 500 con log', async () => {
    // Hallazgo (Medio): path-to-regexp lanza URIError al decodificar '%' o un escape
    // UTF-8 incompleto dentro de :productId. El router lo reenvía con status 400, pero
    // el errorHandler solo reconoce AppError/ZodError/BodyReaderError —todo lo demás
    // cae como "inesperado": 500 INTERNAL_ERROR y línea de error en el log. La
    // superficie correcta es un 4xx sin ruido: una URL malformada es un dato de
    // entrada inválido, no una falla del servidor. (Ocurre en CUALQUIER ruta con
    // parámetro, no solo en productos: /api/users/% tiene el mismo destino.)
    const cookie = await adminCookie();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (const id of ['%', '%E0%A4%A', 'abc%']) {
      const response = await patchProduct(id, { isActive: false }, cookie);
      expect.soft(response.status, id).toBe(400);
      expect.soft(response.headers['cache-control'], id).toBe('no-store');
      expect.soft(response.body, id).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'La dirección no es válida.',
          details: null,
        },
      });
    }
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-005-31: posarreglo — el % malformado responde 400 en TODAS las rutas con parámetro', async () => {
    // El URIError de decodeParam no es exclusivo de productId: cualquier router con
    // :parametro lo dispara (users tiene PATCH /:userId y POST /:userId/pin). La
    // corrección vive en el errorHandler común, así que el 400 vale para todas.
    const cookie = await adminCookie();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const invalidUrlBody = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'La dirección no es válida.',
        details: null,
      },
    };
    for (const response of [
      await request(auth.app).patch('/api/users/%').set('Cookie', cookie).send({}),
      await request(auth.app)
        .post('/api/users/%E0%A4/pin')
        .set('Cookie', cookie)
        .send({ pin: '1234' }),
      await request(auth.app).patch('/api/products/%%').set('Cookie', cookie).send({}),
      await request(auth.app).patch('/api/products/1%2').set('Cookie', cookie).send({}),
      await request(auth.app).patch('/api/products/%C3%28').set('Cookie', cookie).send({}),
    ]) {
      expect.soft(response.status).toBe(400);
      expect.soft(response.body).toEqual(invalidUrlBody);
      expect.soft(response.headers['cache-control']).toBe('no-store');
    }
    // Un segmento malformado donde NO hay parámetro sigue siendo 404 NOT_FOUND:
    // no se decodifica nada porque ninguna ruta de /api/auth usa :parametro.
    const authRoute = await request(auth.app).post('/api/auth/%').set('Cookie', cookie).send({});
    expect(authRoute.status).toBe(404);
    expect(authRoute.body).toEqual(NOT_FOUND_BODY);
    // Y un escape válido que decodifica a un carácter ilegal llega al controller:
    // '%' decodifica a '%' y el patrón ^[0-9]+$ lo rechaza como issue productId.
    const decoded = await patchProduct('%25', { isActive: false }, cookie);
    expect(decoded.status).toBe(400);
    expect(issuesOf(decoded)).toEqual([{ path: 'productId', message: PRODUCT_ID_MESSAGE }]);
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-005-32: posarreglo — el errorHandler solo traduce URIError con status 400; el resto sigue siendo 500 con log', () => {
    // La corrección de ADV-005-30 abrió una clasificación nueva: hay que comprobar
    // que no se relajó AC-37 (un Error cualquiera con `status` 4xx sigue siendo
    // inesperado y se registra). Se llama al errorHandler directo con errores
    // sintéticos porque ningún endpoint público los produce.
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const req = { method: 'GET', path: '/api/products/%' };
    const invoke = (error: unknown) => {
      const res = {
        headersSent: false,
        statusCode: 0,
        body: undefined as unknown,
        status(code: number) {
          res.statusCode = code;
          return res;
        },
        json(payload: unknown) {
          res.body = payload;
          return res;
        },
      };
      errorHandler(error, req as never, res as never, vi.fn() as never);
      return { statusCode: res.statusCode, body: res.body };
    };
    // Lo que el router lanza de verdad: URIError con status 400 → 400 sin log.
    const decoded = invoke(
      Object.assign(new URIError("Failed to decode param '%'"), { status: 400 }),
    );
    expect(decoded.statusCode).toBe(400);
    expect(decoded.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'La dirección no es válida.', details: null },
    });
    // Todo lo demás sigue siendo 500 + registro: Error genérico con status 4xx,
    // URIError sin status, URIError con otro status, status como texto, y un objeto
    // que solo "parece" de cliente.
    for (const error of [
      Object.assign(new Error('boom'), { status: 403 }),
      Object.assign(new Error('boom'), { status: 404 }),
      new URIError('URI malformed'),
      Object.assign(new URIError('x'), { status: 404 }),
      Object.assign(new URIError('x'), { status: '400' }),
      { status: 400 },
      Object.assign(new TypeError('x'), { status: 400 }),
    ]) {
      const result = invoke(error);
      expect
        .soft(result.statusCode, (error as { constructor?: { name?: string } }).constructor?.name)
        .toBe(500);
      expect.soft(result.body).toEqual({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Ocurrió un error inesperado. Intenta nuevamente.',
          details: null,
        },
      });
    }
    expect(log).toHaveBeenCalledTimes(7);
  });

  it('ADV-005-33: posarreglo — borrar la fila en afterUpdate (entre el UPDATE y la verificación) también es 404', async () => {
    // La corrección de ADV-005-25 verifica la existencia DESPUÉS del UPDATE: cubre el
    // hueco original (borrado en beforeUpdate) y también un borrado más tardío, entre
    // el UPDATE y la lectura de confirmación. Sin el check, este caso devolvería el
    // objeto en memoria igual.
    const product = await service.createProduct({
      name: 'Tarde',
      category: 'dish',
      priceCents: 100,
    });
    let armed = true;
    auth.models.Product.addHook(
      'afterUpdate',
      'adv005latephantom',
      async (_instance: unknown, options: InstanceUpdateOptions) => {
        if (!armed || options.transaction !== undefined) return;
        armed = false;
        await database().query('DELETE FROM products WHERE id = $1', { bind: [product.id] });
      },
    );
    try {
      await expect(service.updateProduct(product.id, { priceCents: 700 })).rejects.toMatchObject({
        code: 'PRODUCT_NOT_FOUND',
      });
    } finally {
      auth.models.Product.removeHook('afterUpdate', 'adv005latephantom');
    }
    expect(await rows('SELECT id FROM products WHERE id = $1', [product.id])).toEqual([]);
    // Y el camino feliz no se tocó: un UPDATE sobre fila existente sigue devolviendo
    // el producto actualizado.
    const alive = await service.createProduct({ name: 'Vivo', category: 'dish', priceCents: 100 });
    const updated = await service.updateProduct(alive.id, { priceCents: 999 });
    expect(updated).toMatchObject({ id: alive.id, priceCents: 999 });
  });
});
