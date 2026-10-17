import request from 'supertest';
import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize';
import type { Express } from 'express';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { productPortionsResponseSchema } from '@polleria/shared';
import type { UserRole } from '@polleria/shared';
import { createApp } from '../src/app.ts';
import { defineModels } from '../src/models/index.ts';
import { createBcryptPinHasher } from '../src/services/auth/pin-hasher.ts';
import { createProductService } from '../src/services/products/product.service.ts';
import { createUserService } from '../src/services/users/user.service.ts';
import {
  clearMenuTables,
  closeTestDatabase,
  connectTestDatabase,
  migrateAndClearAuthTables,
} from './helpers/test-database.ts';
import { loginWithCookie, UNAUTHENTICATED_BODY } from './helpers/auth.ts';
import { sendRawBody } from './helpers/raw-body.ts';

const T0 = new Date('2026-10-09T15:00:00.000Z');

const FORBIDDEN_BODY = {
  error: {
    code: 'FORBIDDEN',
    message: 'No tienes permiso para realizar esta acci\u00F3n.',
    details: null,
  },
};
const PRODUCT_NOT_FOUND_BODY = {
  error: { code: 'PRODUCT_NOT_FOUND', message: 'Ese producto no existe.', details: null },
};
const PORTIONS_NOT_ALLOWED_BODY = {
  error: {
    code: 'PORTIONS_NOT_ALLOWED',
    message: 'Solo los productos de la categor\u00EDa Pollo pueden tener presentaciones.',
    details: null,
  },
};
const PRODUCT_HAS_PORTIONS_BODY = {
  error: {
    code: 'PRODUCT_HAS_PORTIONS',
    message:
      'Este producto tiene presentaciones de pollo; qu\u00EDtalas antes de cambiar su ' +
      'categor\u00EDa.',
    details: null,
  },
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

/** Las seis filas del producto de pollo, cargadas en desorden a propósito. */
const SIX_DISORDERED: [string, string | null, number][] = [
  ['half', null, 3200],
  ['quarter', 'leg', 1700],
  ['eighth', 'leg', 650],
  ['quarter', 'breast', 1850],
  ['whole', null, 6000],
  ['eighth', 'breast', 700],
];
/** El orden de D-006-11: PORTIONS, luego CUTS (breast antes que leg), empates por id. */
const SIX_ORDERED = [
  { portion: 'eighth', cut: 'breast', priceCents: 700 },
  { portion: 'eighth', cut: 'leg', priceCents: 650 },
  { portion: 'quarter', cut: 'breast', priceCents: 1850 },
  { portion: 'quarter', cut: 'leg', priceCents: 1700 },
  { portion: 'half', cut: null, priceCents: 3200 },
  { portion: 'whole', cut: null, priceCents: 6000 },
];
/** El cuerpo de reemplazo de AC-08/AC-11. */
const TRIO_INPUT = {
  portions: [
    { portion: 'quarter', cut: 'breast', priceCents: 1850 },
    { portion: 'quarter', cut: 'leg', priceCents: 1700 },
    { portion: 'half', priceCents: 3200 },
  ],
};
const TRIO_ORDERED = [
  { portion: 'quarter', cut: 'breast', priceCents: 1850 },
  { portion: 'quarter', cut: 'leg', priceCents: 1700 },
  { portion: 'half', cut: null, priceCents: 3200 },
];
/** Las seis combinaciones válidas: el conjunto completo de un producto de pollo. */
const SIX_INPUT = {
  portions: [
    { portion: 'eighth', cut: 'breast', priceCents: 700 },
    { portion: 'eighth', cut: 'leg', priceCents: 650 },
    { portion: 'quarter', cut: 'breast', priceCents: 1850 },
    { portion: 'quarter', cut: 'leg', priceCents: 1700 },
    { portion: 'half', priceCents: 3200 },
    { portion: 'whole', priceCents: 6000 },
  ],
};

/** JSON válido de exactamente `bytes` bytes: {"a":"xxx...x"}. */
function jsonBodyOfSize(bytes: number): string {
  const overhead = Buffer.byteLength('{"a":""}');
  return `{"a":"${'x'.repeat(bytes - overhead)}"}`;
}

/** De una respuesta { portions } queda solo el triple comparable (los id pueden cambiar). */
function stripPortions(body: unknown) {
  return (
    body as { portions: { portion: string; cut: string | null; priceCents: number }[] }
  ).portions.map(({ portion, cut, priceCents }) => ({ portion, cut, priceCents }));
}

describe('006: API de presentaciones contra polleria_test', () => {
  let sequelize: Sequelize;
  let app: Express;
  let current = T0;
  let userService: ReturnType<typeof createUserService>;
  let productService: ReturnType<typeof createProductService>;

  beforeAll(async () => {
    sequelize = await connectTestDatabase();
  });
  beforeEach(async () => {
    await migrateAndClearAuthTables(sequelize);
    await clearMenuTables(sequelize);
    current = T0;
    const pinHasher = createBcryptPinHasher({ cost: 4 });
    const models = defineModels(sequelize);
    userService = createUserService({ models, pinHasher });
    productService = createProductService({ models });
    app = createApp({ sequelize, now: () => current, pinHasher });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await closeTestDatabase(sequelize);
  });

  const rows = <T extends object>(sql: string, bind?: (string | number | null)[]) =>
    sequelize.query<T>(sql, { type: QueryTypes.SELECT, bind });
  const productRow = (id: number) =>
    rows<{ name: string; category: string; price_cents: number; is_active: boolean }>(
      'SELECT name, category, price_cents, is_active FROM products WHERE id = $1',
      [id],
    );
  const portionIds = (productId: number) =>
    rows<{ id: number }>('SELECT id FROM product_portions WHERE product_id = $1 ORDER BY id', [
      productId,
    ]);
  const insertPortion = (
    productId: number,
    portion: string,
    cut: string | null,
    priceCents: number,
  ) =>
    sequelize.query(
      'INSERT INTO product_portions (product_id, portion, cut, price_cents) ' +
        'VALUES ($1, $2, $3, $4)',
      { bind: [productId, portion, cut, priceCents] },
    );
  const createProduct = (name: string, category: string, priceCents: number) =>
    productService.createProduct({ name, category, priceCents });

  /** Crea al administrador dueño y devuelve la cookie de su sesión real. */
  async function adminCookie() {
    await userService.createUser({
      username: 'dueno',
      displayName: 'Don Carlos',
      roles: ['admin'],
      pin: '975310',
    });
    return (await loginWithCookie(app, 'dueno', '975310')).cookie;
  }
  /** Crea una usuaria con esos roles y devuelve la cookie de su sesión real. */
  async function cookieFor(username: string, roles: UserRole[], pin: string) {
    await userService.createUser({ username, displayName: 'Persona', roles, pin });
    return (await loginWithCookie(app, username, pin)).cookie;
  }

  const getPortions = (id: number | string, cookie?: string) => {
    const call = request(app).get(`/api/products/${id}/portions`);
    return cookie === undefined ? call : call.set('Cookie', cookie);
  };
  const putPortions = (id: number | string, body: unknown, cookie?: string) => {
    const call = request(app)
      .put(`/api/products/${id}/portions`)
      .send(body as object);
    return cookie === undefined ? call : call.set('Cookie', cookie);
  };
  const patchProduct = (id: number | string, body: unknown, cookie?: string) => {
    const call = request(app)
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

  it('AC-10: GET devuelve las seis presentaciones en orden a cualquier rol con sesión', async () => {
    const pollo = await createProduct('Pollo a la brasa', 'chicken', 1850);
    for (const [portion, cut, priceCents] of SIX_DISORDERED)
      await insertPortion(pollo.id, portion, cut, priceCents);
    for (const [username, roles, pin] of [
      ['mozo.juan', ['waiter'], '2468'],
      ['cocina.beto', ['kitchen'], '1357'],
      ['caja.ana', ['cashier'], '8642'],
      ['dueno', ['admin'], '975310'],
      ['mixta', ['waiter', 'cashier'], '5926'],
    ] as [string, UserRole[], string][]) {
      const cookie = await cookieFor(username, roles, pin);
      const response = await getPortions(pollo.id, cookie);
      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(productPortionsResponseSchema.safeParse(response.body as unknown).success).toBe(true);
      expect(stripPortions(response.body)).toEqual(SIX_ORDERED);
      for (const row of (response.body as { portions: object[] }).portions) {
        expect(Object.keys(row).sort()).toEqual([
          'cut',
          'id',
          'portion',
          'priceCents',
          'productId',
        ]);
        expect(row).toMatchObject({ productId: pollo.id });
      }
    }
  });
  it('AC-10: un producto sin presentaciones o de otra categoría responde 200 con portions vacío', async () => {
    const cookie = await cookieFor('mozo.juan', ['waiter'], '2468');
    const pollo = await createProduct('Pollo a la brasa', 'chicken', 1850);
    const chaufa = await createProduct('Chaufa', 'dish', 1400);
    for (const id of [pollo.id, chaufa.id]) {
      const response = await getPortions(id, cookie);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ portions: [] });
      expect(response.headers['cache-control']).toBe('no-store');
    }
  });
  it('AC-10: un producto inexistente responde 404 y un productId inválido 400 con issue en productId', async () => {
    const cookie = await cookieFor('mozo.juan', ['waiter'], '2468');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const notFound = await getPortions(999999, cookie);
    expect(notFound.status).toBe(404);
    expect(notFound.body).toEqual(PRODUCT_NOT_FOUND_BODY);
    expect(notFound.headers['cache-control']).toBe('no-store');
    for (const id of ['abc', '0', '1.5', '-3', '2147483648']) {
      const issues = validationIssues(await getPortions(id, cookie));
      expect(issues[0]).toEqual({ path: 'productId', message: PRODUCT_ID_MESSAGE });
    }
    expect(log).not.toHaveBeenCalled();
  });
  it('AC-10: sin sesión o con cookie mal formada o vencida responde 401 UNAUTHENTICATED', async () => {
    const pollo = await createProduct('Pollo a la brasa', 'chicken', 1850);
    const cookie = await cookieFor('mozo.juan', ['waiter'], '2468');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const anonymous = await getPortions(pollo.id);
    expect(anonymous.status).toBe(401);
    expect(anonymous.body).toEqual(UNAUTHENTICATED_BODY);
    expect(anonymous.headers['cache-control']).toBe('no-store');
    for (const header of ['polleria_session=invalid', 'otra=1']) {
      const invalid = await getPortions(pollo.id, header);
      expect(invalid.status).toBe(401);
      expect(invalid.body).toEqual(UNAUTHENTICATED_BODY);
      expect(invalid.headers['cache-control']).toBe('no-store');
    }
    // La cookie era válida al entrar, pero la sesión ya venció (16 horas).
    current = new Date(current.getTime() + 17 * 3600000);
    const expired = await getPortions(pollo.id, cookie);
    expect(expired.status).toBe(401);
    expect(expired.body).toEqual(UNAUTHENTICATED_BODY);
    expect(expired.headers['cache-control']).toBe('no-store');
    expect(log).not.toHaveBeenCalled();
  });

  it('AC-11: PUT reemplaza el conjunto con admin y con una usuaria waiter+admin, y el GET lo refleja', async () => {
    const admin = await adminCookie();
    const pollo = await createProduct('Pollo a la brasa', 'chicken', 1850);
    const put = await putPortions(pollo.id, TRIO_INPUT, admin);
    expect(put.status).toBe(200);
    expect(put.headers['cache-control']).toBe('no-store');
    expect(productPortionsResponseSchema.safeParse(put.body as unknown).success).toBe(true);
    expect(stripPortions(put.body)).toEqual(TRIO_ORDERED);
    const listed = await getPortions(pollo.id, admin);
    expect(stripPortions(listed.body)).toEqual(TRIO_ORDERED);
    // Un segundo PUT idéntico responde 200 con el mismo conjunto (idempotente).
    const again = await putPortions(pollo.id, TRIO_INPUT, admin);
    expect(again.status).toBe(200);
    expect(stripPortions(again.body)).toEqual(TRIO_ORDERED);
    // Basta un rol de la lista: la usuaria waiter+admin también reemplaza.
    const mixta = await cookieFor('mixta', ['waiter', 'admin'], '5926');
    const byMixta = await putPortions(pollo.id, SIX_INPUT, mixta);
    expect(byMixta.status).toBe(200);
    expect(stripPortions(byMixta.body)).toEqual(SIX_ORDERED);
    expect(stripPortions((await getPortions(pollo.id, admin)).body)).toEqual(SIX_ORDERED);
    expect(await portionIds(pollo.id)).toHaveLength(6);
  });
  it('AC-11: PUT con portions vacío deja el producto sin presentaciones', async () => {
    const admin = await adminCookie();
    const pollo = await createProduct('Pollo a la brasa', 'chicken', 1850);
    await putPortions(pollo.id, TRIO_INPUT, admin);
    const cleared = await putPortions(pollo.id, { portions: [] }, admin);
    expect(cleared.status).toBe(200);
    expect(cleared.body).toEqual({ portions: [] });
    expect(cleared.headers['cache-control']).toBe('no-store');
    expect((await getPortions(pollo.id, admin)).body).toEqual({ portions: [] });
    expect(await portionIds(pollo.id)).toEqual([]);
  });
  it('AC-11: PUT sobre un producto de otra categoría responde 409 exacto sin crear filas', async () => {
    const admin = await adminCookie();
    const chaufa = await createProduct('Chaufa', 'dish', 1400);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await putPortions(chaufa.id, TRIO_INPUT, admin);
    expect(response.status).toBe(409);
    expect(response.body).toEqual(PORTIONS_NOT_ALLOWED_BODY);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(await portionIds(chaufa.id)).toEqual([]);
    expect((await getPortions(chaufa.id, admin)).body).toEqual({ portions: [] });
    expect(log).not.toHaveBeenCalled();
  });
  it('AC-11: PUT sobre un producto inexistente responde 404 PRODUCT_NOT_FOUND', async () => {
    const admin = await adminCookie();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await putPortions(999999, TRIO_INPUT, admin);
    expect(response.status).toBe(404);
    expect(response.body).toEqual(PRODUCT_NOT_FOUND_BODY);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(await rows('SELECT id FROM product_portions')).toEqual([]);
    expect(log).not.toHaveBeenCalled();
  });

  it('AC-11: cuerpos inválidos responden 400 con details.issues y el conjunto anterior queda intacto', async () => {
    const admin = await adminCookie();
    const pollo = await createProduct('Pollo a la brasa', 'chicken', 1850);
    // El conjunto anterior se carga por SQL para no depender del PUT bajo prueba.
    await insertPortion(pollo.id, 'quarter', 'breast', 1850);
    await insertPortion(pollo.id, 'quarter', 'leg', 1700);
    await insertPortion(pollo.id, 'half', null, 3200);
    const before = await portionIds(pollo.id);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (const body of [
      { portions: [{ portion: 'half', cut: 'leg', priceCents: 3200 }] },
      {
        portions: [
          { portion: 'quarter', cut: 'breast', priceCents: 1850 },
          { portion: 'quarter', cut: 'breast', priceCents: 1900 },
        ],
      },
      {
        portions: [...SIX_INPUT.portions, { portion: 'quarter', cut: 'breast', priceCents: 1900 }],
      },
      { portions: [{ portion: 'quarter', cut: 'breast', priceCents: 18.5 }] },
      { portions: [{ portion: 'quarter', cut: 'breast', priceCents: 1850, id: 3 }] },
      { portions: TRIO_INPUT.portions, extra: true },
      {},
      undefined,
    ])
      expect(validationIssues(await putPortions(pollo.id, body, admin)).length).toBeGreaterThan(0);
    // productId inválido también responde 400 con el issue en productId.
    for (const id of ['abc', '0', '1.5', '-3', '2147483648']) {
      const issues = validationIssues(await putPortions(id, TRIO_INPUT, admin));
      expect(issues[0]).toEqual({ path: 'productId', message: PRODUCT_ID_MESSAGE });
    }
    // Atomicidad: el conjunto cargado sigue igual, por GET y en la base.
    expect(stripPortions((await getPortions(pollo.id, admin)).body)).toEqual(TRIO_ORDERED);
    expect(await portionIds(pollo.id)).toEqual(before);
    expect(log).not.toHaveBeenCalled();
  });
  it('AC-11: exige sesión y rol admin; los rechazos no crean ni modifican filas', async () => {
    const pollo = await createProduct('Pollo a la brasa', 'chicken', 1850);
    await insertPortion(pollo.id, 'quarter', 'breast', 1850);
    const before = await portionIds(pollo.id);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const anonymous = await putPortions(pollo.id, TRIO_INPUT);
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
      const forbidden = await putPortions(pollo.id, TRIO_INPUT, worker);
      expect(forbidden.status).toBe(403);
      expect(forbidden.body).toEqual(FORBIDDEN_BODY);
      expect(forbidden.headers['cache-control']).toBe('no-store');
    }
    expect(await portionIds(pollo.id)).toEqual(before);
    expect(log).not.toHaveBeenCalled();
  });

  it('AC-12: PATCH de categoría fuera de chicken con presentaciones responde 409 exacto', async () => {
    const admin = await adminCookie();
    const pollo = await createProduct('Pollo a la brasa', 'chicken', 1850);
    await insertPortion(pollo.id, 'quarter', 'breast', 1850);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await patchProduct(pollo.id, { category: 'dish' }, admin);
    expect(response.status).toBe(409);
    expect(response.body).toEqual(PRODUCT_HAS_PORTIONS_BODY);
    expect(response.headers['cache-control']).toBe('no-store');
    // El producto sigue en 'chicken' y la presentación intacta.
    expect(await productRow(pollo.id)).toEqual([
      { name: 'Pollo a la brasa', category: 'chicken', price_cents: 1850, is_active: true },
    ]);
    expect(await portionIds(pollo.id)).toHaveLength(1);
    expect(log).not.toHaveBeenCalled();
  });
  it('AC-12: tras vaciar las presentaciones el PATCH de categoría responde 200', async () => {
    const admin = await adminCookie();
    const pollo = await createProduct('Pollo a la brasa', 'chicken', 1850);
    await insertPortion(pollo.id, 'half', null, 3200);
    // PATCH de otros campos o con la misma categoría responde 200 con presentaciones.
    expect((await patchProduct(pollo.id, { priceCents: 3000 }, admin)).status).toBe(200);
    expect((await patchProduct(pollo.id, { category: 'chicken' }, admin)).status).toBe(200);
    const cleared = await putPortions(pollo.id, { portions: [] }, admin);
    expect(cleared.status).toBe(200);
    const patched = await patchProduct(pollo.id, { category: 'dish' }, admin);
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({ id: pollo.id, category: 'dish', priceCents: 3000 });
    expect(patched.headers['cache-control']).toBe('no-store');
  });

  it('AC-13: los métodos y rutas no declarados responden 404 NOT_FOUND con no-store', async () => {
    const admin = await adminCookie();
    const pollo = await createProduct('Pollo a la brasa', 'chicken', 1850);
    await insertPortion(pollo.id, 'quarter', 'breast', 1850);
    const before = await portionIds(pollo.id);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const responses = [
      await request(app)
        .post(`/api/products/${String(pollo.id)}/portions`)
        .set('Cookie', admin)
        .send(TRIO_INPUT),
      await request(app)
        .delete(`/api/products/${String(pollo.id)}/portions`)
        .set('Cookie', admin),
      await request(app)
        .patch(`/api/products/${String(pollo.id)}/portions`)
        .set('Cookie', admin)
        .send(TRIO_INPUT),
      await request(app)
        .get(`/api/products/${String(pollo.id)}/portions/2`)
        .set('Cookie', admin),
    ];
    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(response.body).toEqual(NOT_FOUND_BODY);
      expect(response.headers['cache-control']).toBe('no-store');
    }
    expect(await portionIds(pollo.id)).toEqual(before);
    expect(log).not.toHaveBeenCalled();
  });

  it('AC-14: los errores del lector del cuerpo en PUT llevan Cache-Control: no-store', async () => {
    const admin = await adminCookie();
    const pollo = await createProduct('Pollo a la brasa', 'chicken', 1850);
    await insertPortion(pollo.id, 'quarter', 'breast', 1850);
    const before = await portionIds(pollo.id);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const put = () =>
      request(app)
        .put(`/api/products/${String(pollo.id)}/portions`)
        .set('Cookie', admin);

    const badJson = await sendRawBody(
      put().set('Content-Type', 'application/json'),
      Buffer.from('{"portions":'),
    );
    expect(badJson.status).toBe(400);
    expect(badJson.body).toEqual(INVALID_JSON_BODY);
    expect(badJson.headers['cache-control']).toBe('no-store');

    const fakeGzip = await sendRawBody(
      put().set('Content-Type', 'application/json').set('Content-Encoding', 'gzip'),
      Buffer.from('esto no es gzip'),
    );
    expect(fakeGzip.status).toBe(400);
    expect(fakeGzip.body).toEqual(INVALID_BODY_BODY);
    expect(fakeGzip.headers['cache-control']).toBe('no-store');

    const tooLarge = await sendRawBody(
      put().set('Content-Type', 'application/json'),
      Buffer.from(jsonBodyOfSize(150 * 1024)),
    );
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.body).toEqual(PAYLOAD_TOO_LARGE_BODY);
    expect(tooLarge.headers['cache-control']).toBe('no-store');

    const weirdEncoding = await sendRawBody(
      put().set('Content-Type', 'application/json').set('Content-Encoding', 'bogus'),
      Buffer.from('{"portions":[]}'),
    );
    expect(weirdEncoding.status).toBe(415);
    expect(weirdEncoding.body).toEqual(UNSUPPORTED_MEDIA_TYPE_BODY);
    expect(weirdEncoding.headers['cache-control']).toBe('no-store');

    expect(await portionIds(pollo.id)).toEqual(before);
    expect(log).not.toHaveBeenCalled();
  });
});
