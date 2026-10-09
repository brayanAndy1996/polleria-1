import request from 'supertest';
import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { productsResponseSchema } from '@polleria/shared';
import type { UserRole } from '@polleria/shared';
import { createProductService } from '../src/services/products/product.service.ts';
import {
  clearMenuTables,
  closeTestDatabase,
  connectTestDatabase,
  migrateAndClearAuthTables,
} from './helpers/test-database.ts';
import { loginWithCookie, setupAuth, UNAUTHENTICATED_BODY } from './helpers/auth.ts';
import { sendRawBody } from './helpers/raw-body.ts';

const FORBIDDEN_BODY = {
  error: {
    code: 'FORBIDDEN',
    message: 'No tienes permiso para realizar esta acci\u00F3n.',
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
const INVALID_JSON_BODY = {
  error: {
    code: 'INVALID_JSON',
    message: 'El cuerpo de la solicitud no es un JSON v\u00E1lido.',
    details: null,
  },
};
const INVALID_BODY_BODY = {
  error: {
    code: 'INVALID_BODY',
    message: 'No se pudo leer el cuerpo de la solicitud.',
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
const UNSUPPORTED_MEDIA_TYPE_BODY = {
  error: {
    code: 'UNSUPPORTED_MEDIA_TYPE',
    message: 'La codificaci\u00F3n del cuerpo de la solicitud no es compatible.',
    details: null,
  },
};
const PRODUCT_ID_MESSAGE = 'El identificador del producto no es v\u00E1lido.';

/** JSON válido de exactamente `bytes` bytes: {"a":"xxx...x"}. */
function jsonBodyOfSize(bytes: number): string {
  const overhead = Buffer.byteLength('{"a":""}');
  return `{"a":"${'x'.repeat(bytes - overhead)}"}`;
}

describe('005: API de productos contra polleria_test', () => {
  let sequelize: Sequelize;
  let auth: ReturnType<typeof setupAuth>;
  let productService: ReturnType<typeof createProductService>;

  beforeAll(async () => {
    sequelize = await connectTestDatabase();
  });
  beforeEach(async () => {
    await migrateAndClearAuthTables(sequelize);
    await clearMenuTables(sequelize);
    auth = setupAuth(sequelize);
    productService = createProductService({ models: auth.models });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await closeTestDatabase(sequelize);
  });

  const rows = <T extends object>(sql: string, bind?: (string | number)[]) =>
    sequelize.query<T>(sql, { type: QueryTypes.SELECT, bind });
  const productRow = (id: number) =>
    rows<{ name: string; category: string; price_cents: number; is_active: boolean }>(
      'SELECT name, category, price_cents, is_active FROM products WHERE id = $1',
      [id],
    );
  const productIds = () => rows<{ id: number }>('SELECT id FROM products');
  const createProduct = (name: string, category: string, priceCents: number) =>
    productService.createProduct({ name, category, priceCents });

  /** Crea al administrador dueño y devuelve la cookie de su sesión real. */
  async function adminCookie() {
    await auth.createUser('dueno', 'Don Carlos', ['admin'], '975310');
    return (await loginWithCookie(auth.app, 'dueno', '975310')).cookie;
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

  it('AC-11: GET devuelve la carta completa en orden a cualquier rol con sesión', async () => {
    // Los productos de AC-08, creados en desorden y con 'Tres Leches' inactivo.
    const chicha = await createProduct('Chicha Morada', 'drink', 500);
    const entero = await createProduct('Pollo entero', 'chicken', 6500);
    const cuarto = await createProduct('1/4 de Pollo', 'chicken', 1850);
    const chaufa = await createProduct('Chaufa', 'dish', 1400);
    const agua = await createProduct('agua', 'drink', 200);
    const aji = await createProduct('Aj\u00ED', 'sauce', 0);
    const tresLeches = await createProduct('Tres Leches', 'dessert', 900);
    await productService.updateProduct(tresLeches.id, { isActive: false });
    const carta = {
      products: [
        {
          id: cuarto.id,
          name: '1/4 de Pollo',
          category: 'chicken',
          priceCents: 1850,
          isActive: true,
        },
        {
          id: entero.id,
          name: 'Pollo entero',
          category: 'chicken',
          priceCents: 6500,
          isActive: true,
        },
        { id: chaufa.id, name: 'Chaufa', category: 'dish', priceCents: 1400, isActive: true },
        { id: agua.id, name: 'agua', category: 'drink', priceCents: 200, isActive: true },
        {
          id: chicha.id,
          name: 'Chicha Morada',
          category: 'drink',
          priceCents: 500,
          isActive: true,
        },
        {
          id: tresLeches.id,
          name: 'Tres Leches',
          category: 'dessert',
          priceCents: 900,
          isActive: false,
        },
        { id: aji.id, name: 'Aj\u00ED', category: 'sauce', priceCents: 0, isActive: true },
      ],
    };
    for (const [username, roles, pin] of [
      ['mozo.juan', ['waiter'], '2468'],
      ['cocina.beto', ['kitchen'], '1357'],
      ['caja.ana', ['cashier'], '8642'],
      ['dueno', ['admin'], '975310'],
      ['mixta', ['waiter', 'cashier'], '5926'],
    ] as [string, UserRole[], string][]) {
      const cookie = await cookieFor(username, roles, pin);
      const response = await getProducts(cookie);
      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(productsResponseSchema.safeParse(response.body as unknown).success).toBe(true);
      expect(response.body).toEqual(carta);
      for (const product of (response.body as { products: object[] }).products)
        expect(Object.keys(product).sort()).toEqual([
          'category',
          'id',
          'isActive',
          'name',
          'priceCents',
        ]);
    }
  });
  it('AC-11: sin sesión, con cookie mal formada o vencida responde 401 UNAUTHENTICATED', async () => {
    const cookie = await cookieFor('mozo.juan', ['waiter'], '2468');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const anonymous = await getProducts();
    expect(anonymous.status).toBe(401);
    expect(anonymous.body).toEqual(UNAUTHENTICATED_BODY);
    expect(anonymous.headers['cache-control']).toBe('no-store');
    for (const header of ['polleria_session=invalid', 'otra=1']) {
      const invalid = await getProducts(header);
      expect(invalid.status).toBe(401);
      expect(invalid.body).toEqual(UNAUTHENTICATED_BODY);
      expect(invalid.headers['cache-control']).toBe('no-store');
    }
    // La cookie era válida al entrar, pero la sesión ya venció (16 horas).
    auth.setTime(17 * 3600000);
    const expired = await getProducts(cookie);
    expect(expired.status).toBe(401);
    expect(expired.body).toEqual(UNAUTHENTICATED_BODY);
    expect(log).not.toHaveBeenCalled();
  });

  it('AC-12: POST crea el producto con la cookie de admin y también con una waiter+admin', async () => {
    const admin = await adminCookie();
    const mixta = await cookieFor('mixta', ['waiter', 'admin'], '5926');
    const created = await postProducts(
      { name: '  1/4 de Pollo  ', category: 'chicken', priceCents: 1850 },
      admin,
    );
    expect(created.status).toBe(201);
    expect(created.headers['cache-control']).toBe('no-store');
    const body = created.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['category', 'id', 'isActive', 'name', 'priceCents']);
    expect(typeof body.id).toBe('number');
    expect(body).toEqual({
      id: body.id,
      name: '1/4 de Pollo',
      category: 'chicken',
      priceCents: 1850,
      isActive: true,
    });
    // Basta un rol de la lista: la usuaria waiter+admin también crea.
    const crema = await postProducts({ name: 'Aj\u00ED', category: 'sauce', priceCents: 0 }, mixta);
    expect(crema.status).toBe(201);
    expect(crema.body).toMatchObject({ name: 'Aj\u00ED', priceCents: 0, isActive: true });
    expect(
      await rows('SELECT name, category, price_cents, is_active FROM products ORDER BY id'),
    ).toEqual([
      { name: '1/4 de Pollo', category: 'chicken', price_cents: 1850, is_active: true },
      { name: 'Aj\u00ED', category: 'sauce', price_cents: 0, is_active: true },
    ]);
  });
  it('AC-12: un nombre tomado, activo o inactivo y con otra capitalización, responde 409 exacto', async () => {
    const cookie = await adminCookie();
    await createProduct('Chicha Morada', 'drink', 500);
    const clash = await postProducts(
      { name: 'chicha morada', category: 'drink', priceCents: 600 },
      cookie,
    );
    expect(clash.status).toBe(409);
    expect(clash.body).toEqual(PRODUCT_NAME_TAKEN_BODY);
    expect(clash.headers['cache-control']).toBe('no-store');
    // El nombre de un producto inactivo también está tomado.
    await sequelize.query('UPDATE products SET is_active = false');
    const inactive = await postProducts(
      { name: 'CHICHA MORADA', category: 'drink', priceCents: 700 },
      cookie,
    );
    expect(inactive.status).toBe(409);
    expect(inactive.body).toEqual(PRODUCT_NAME_TAKEN_BODY);
    expect(await productIds()).toHaveLength(1);
  });
  it('AC-12: valida el cuerpo con issues no vacíos y no crea ninguna fila', async () => {
    const cookie = await adminCookie();
    const valid = { name: 'Chicha Morada', category: 'drink', priceCents: 500 };
    for (const body of [
      {},
      { name: 'Chicha Morada', category: 'drink' },
      { ...valid, category: 'combos' },
      { ...valid, category: 'pollo' },
      { ...valid, priceCents: 18.5 },
      { ...valid, priceCents: '1850' },
      { ...valid, priceCents: 100000 },
      { ...valid, name: '' },
      { ...valid, isActive: false },
      { ...valid, stock: 10 },
      undefined,
    ])
      expect(validationIssues(await postProducts(body, cookie)).length).toBeGreaterThan(0);
    expect(await productIds()).toEqual([]);
  });
  it('AC-12: exige sesión y rol admin; los rechazos no crean filas ni se registran', async () => {
    await adminCookie();
    const body = { name: 'Chicha', category: 'drink', priceCents: 500 };
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const anonymous = await postProducts(body);
    expect(anonymous.status).toBe(401);
    expect(anonymous.body).toEqual(UNAUTHENTICATED_BODY);
    expect(anonymous.headers['cache-control']).toBe('no-store');
    for (const [username, roles, pin] of [
      ['mozo.juan', ['waiter'], '2468'],
      ['cocina.beto', ['kitchen'], '1357'],
      ['caja.ana', ['cashier'], '8642'],
      // Varios roles sin admin también es 403.
      ['mixta', ['waiter', 'cashier'], '5926'],
    ] as [string, UserRole[], string][]) {
      const worker = await cookieFor(username, roles, pin);
      const forbidden = await postProducts(body, worker);
      expect(forbidden.status).toBe(403);
      expect(forbidden.body).toEqual(FORBIDDEN_BODY);
      expect(forbidden.headers['cache-control']).toBe('no-store');
    }
    expect(await productIds()).toEqual([]);
    expect(log).not.toHaveBeenCalled();
  });

  it('AC-13: PATCH edita el precio, desactiva y reactiva, y el GET lo refleja', async () => {
    const cookie = await adminCookie();
    const chicha = await createProduct('Chicha Morada', 'drink', 500);
    const updated = await patchProduct(chicha.id, { priceCents: 700 }, cookie);
    expect(updated.status).toBe(200);
    expect(updated.headers['cache-control']).toBe('no-store');
    expect(updated.body).toEqual({
      id: chicha.id,
      name: 'Chicha Morada',
      category: 'drink',
      priceCents: 700,
      isActive: true,
    });
    const listed = await getProducts(cookie);
    expect(listed.body).toEqual({
      products: [
        {
          id: chicha.id,
          name: 'Chicha Morada',
          category: 'drink',
          priceCents: 700,
          isActive: true,
        },
      ],
    });
    const deactivated = await patchProduct(chicha.id, { isActive: false }, cookie);
    expect(deactivated.status).toBe(200);
    expect(deactivated.body).toMatchObject({ id: chicha.id, isActive: false });
    // El inactivo sigue en la lista completa.
    const withInactive = await getProducts(cookie);
    expect((withInactive.body as { products: { isActive: boolean }[] }).products).toEqual([
      expect.objectContaining({ id: chicha.id, isActive: false }),
    ]);
    const reactivated = await patchProduct(chicha.id, { isActive: true }, cookie);
    expect(reactivated.status).toBe(200);
    expect(reactivated.body).toMatchObject({ isActive: true });
    expect(await productRow(chicha.id)).toEqual([
      { name: 'Chicha Morada', category: 'drink', price_cents: 700, is_active: true },
    ]);
  });
  it('AC-13: renombrar a un nombre tomado responde 409 exacto y nada cambia', async () => {
    const cookie = await adminCookie();
    const chicha = await createProduct('Chicha Morada', 'drink', 500);
    await createProduct('Pollo entero', 'chicken', 6500);
    const before = await productRow(chicha.id);
    const response = await patchProduct(chicha.id, { name: 'pollo entero' }, cookie);
    expect(response.status).toBe(409);
    expect(response.body).toEqual(PRODUCT_NAME_TAKEN_BODY);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(await productRow(chicha.id)).toEqual(before);
  });
  it('AC-13: un productId inexistente responde 404 exacto y los inválidos 400 con issue en productId', async () => {
    const cookie = await adminCookie();
    const chicha = await createProduct('Chicha Morada', 'drink', 500);
    const notFound = await patchProduct(999999, { priceCents: 700 }, cookie);
    expect(notFound.status).toBe(404);
    expect(notFound.body).toEqual(PRODUCT_NOT_FOUND_BODY);
    expect(notFound.headers['cache-control']).toBe('no-store');
    for (const id of ['abc', '0', '1.5', '-3', '2147483648', '999999999999999999999999']) {
      const issues = validationIssues(await patchProduct(id, { priceCents: 700 }, cookie));
      expect(issues[0]).toEqual({ path: 'productId', message: PRODUCT_ID_MESSAGE });
    }
    // Un entero con ceros a la izquierda sí pasa por válido (vale el número).
    const leadingZero = await patchProduct(`0${String(chicha.id)}`, { priceCents: 700 }, cookie);
    expect(leadingZero.status).toBe(200);
    expect(leadingZero.body).toMatchObject({ id: chicha.id, priceCents: 700 });
  });
  it('AC-13: valida el cuerpo del PATCH sin cambiar la fila', async () => {
    const cookie = await adminCookie();
    const chicha = await createProduct('Chicha Morada', 'drink', 500);
    const before = await productRow(chicha.id);
    const empty = validationIssues(await patchProduct(chicha.id, {}, cookie));
    expect(empty.map((issue) => issue.message)).toContain('No indicaste ning\u00FAn cambio.');
    for (const body of [
      { id: 7 },
      { stock: 3 },
      { name: ' ' },
      { category: 'combos' },
      { priceCents: 18.5 },
      { isActive: 'si' },
      { name: 'Otra', createdAt: '2026-10-08T15:00:00.000Z' },
    ])
      expect(validationIssues(await patchProduct(chicha.id, body, cookie)).length).toBeGreaterThan(
        0,
      );
    expect(await productRow(chicha.id)).toEqual(before);
  });
  it('AC-13: exige sesión y rol admin', async () => {
    await adminCookie();
    const chicha = await createProduct('Chicha Morada', 'drink', 500);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const anonymous = await patchProduct(chicha.id, { priceCents: 700 });
    expect(anonymous.status).toBe(401);
    expect(anonymous.body).toEqual(UNAUTHENTICATED_BODY);
    expect(anonymous.headers['cache-control']).toBe('no-store');
    const mozo = await cookieFor('mozo.juan', ['waiter'], '2468');
    const forbidden = await patchProduct(chicha.id, { priceCents: 700 }, mozo);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toEqual(FORBIDDEN_BODY);
    expect(forbidden.headers['cache-control']).toBe('no-store');
    expect(await productRow(chicha.id)).toEqual([
      { name: 'Chicha Morada', category: 'drink', price_cents: 500, is_active: true },
    ]);
    expect(log).not.toHaveBeenCalled();
  });

  it('AC-14: los métodos y rutas no declarados responden 404 NOT_FOUND con no-store', async () => {
    const cookie = await adminCookie();
    const chicha = await createProduct('Chicha Morada', 'drink', 500);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const responses = [
      await request(auth.app)
        .get(`/api/products/${String(chicha.id)}`)
        .set('Cookie', cookie),
      await request(auth.app)
        .delete(`/api/products/${String(chicha.id)}`)
        .set('Cookie', cookie),
      await request(auth.app)
        .put('/api/products')
        .set('Cookie', cookie)
        .send({ name: 'Otro', category: 'dish', priceCents: 100 }),
      await request(auth.app)
        .put(`/api/products/${String(chicha.id)}`)
        .set('Cookie', cookie)
        .send({ priceCents: 100 }),
    ];
    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(response.body).toEqual(NOT_FOUND_BODY);
      expect(response.headers['cache-control']).toBe('no-store');
    }
    expect(await productRow(chicha.id)).toEqual([
      { name: 'Chicha Morada', category: 'drink', price_cents: 500, is_active: true },
    ]);
    expect(await productIds()).toHaveLength(1);
    expect(log).not.toHaveBeenCalled();
  });

  it('AC-15: los errores del lector del cuerpo en POST llevan Cache-Control: no-store', async () => {
    const cookie = await adminCookie();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const post = () => request(auth.app).post('/api/products').set('Cookie', cookie);

    const badJson = await sendRawBody(
      post().set('Content-Type', 'application/json'),
      Buffer.from('{"name":'),
    );
    expect(badJson.status).toBe(400);
    expect(badJson.body).toEqual(INVALID_JSON_BODY);
    expect(badJson.headers['cache-control']).toBe('no-store');

    const fakeGzip = await sendRawBody(
      post().set('Content-Type', 'application/json').set('Content-Encoding', 'gzip'),
      Buffer.from('esto no es gzip'),
    );
    expect(fakeGzip.status).toBe(400);
    expect(fakeGzip.body).toEqual(INVALID_BODY_BODY);
    expect(fakeGzip.headers['cache-control']).toBe('no-store');

    const tooLarge = await sendRawBody(
      post().set('Content-Type', 'application/json'),
      Buffer.from(jsonBodyOfSize(150 * 1024)),
    );
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.body).toEqual(PAYLOAD_TOO_LARGE_BODY);
    expect(tooLarge.headers['cache-control']).toBe('no-store');

    const weirdEncoding = await sendRawBody(
      post().set('Content-Type', 'application/json').set('Content-Encoding', 'bogus'),
      Buffer.from('{"name":"Chicha","category":"drink","priceCents":500}'),
    );
    expect(weirdEncoding.status).toBe(415);
    expect(weirdEncoding.body).toEqual(UNSUPPORTED_MEDIA_TYPE_BODY);
    expect(weirdEncoding.headers['cache-control']).toBe('no-store');

    expect(await productIds()).toEqual([]);
    expect(log).not.toHaveBeenCalled();
  });
});
