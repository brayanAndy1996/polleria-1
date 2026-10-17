// AC-11 a AC-15. Spec 007 — archivo nuevo: va EN ROJO hasta que T-08 cree el
// controller, las rutas y las monte en la app (hoy la ruta no existe: 404).
import request from 'supertest';
import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize';
import type { Express } from 'express';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { comboItemsResponseSchema } from '@polleria/shared';
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
const COMBO_ITEMS_NOT_ALLOWED_BODY = {
  error: {
    code: 'COMBO_ITEMS_NOT_ALLOWED',
    message: 'Solo los productos de la categor\u00EDa Combos pueden tener componentes.',
    details: null,
  },
};
const PRODUCT_HAS_ITEMS_BODY = {
  error: {
    code: 'PRODUCT_HAS_ITEMS',
    message:
      'Este producto es un combo con componentes; quita sus componentes antes de ' +
      'cambiar su categor\u00EDa.',
    details: null,
  },
};
const PRODUCT_IS_COMPONENT_BODY = {
  error: {
    code: 'PRODUCT_IS_COMPONENT',
    message:
      'Este producto es componente de un combo; qu\u00EDtalo del combo antes de ' +
      'cambiar su categor\u00EDa.',
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
const COMPONENT_NOT_FOUND_MESSAGE = 'Ese producto no existe.';
const NESTED_COMBO_MESSAGE = 'Un combo no puede ser componente de otro combo.';
const CHICKEN_NEEDS_PORTION_MESSAGE =
  'El pollo de un combo lleva presentaci\u00F3n (eighth, quarter, half o whole).';
const ONLY_CHICKEN_HAS_PORTION_MESSAGE =
  'Solo un componente de pollo lleva presentaci\u00F3n y parte.';

/** JSON válido de exactamente `bytes` bytes: {"a":"xxx...x"}. */
function jsonBodyOfSize(bytes: number): string {
  const overhead = Buffer.byteLength('{"a":""}');
  return `{"a":"${'x'.repeat(bytes - overhead)}"}`;
}

describe('007: API de componentes de combo contra polleria_test', () => {
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
  const itemRows = (comboId: number) =>
    rows<{ id: number; product_id: number }>(
      'SELECT id, product_id FROM combo_items WHERE combo_id = $1 ORDER BY id',
      [comboId],
    );
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
  const insertItem = (
    comboId: number,
    productId: number,
    quantity = 1,
    portion: string | null = null,
    cut: string | null = null,
  ) =>
    sequelize.query(
      'INSERT INTO combo_items (combo_id, product_id, quantity, portion, cut) ' +
        'VALUES ($1, $2, $3, $4, $5)',
      { bind: [comboId, productId, quantity, portion, cut] },
    );
  const createProduct = (name: string, category: string, priceCents: number) =>
    productService.createProduct({ name, category, priceCents });

  /** Crea a la administradora y devuelve la cookie de su sesión real. */
  async function adminCookie() {
    await userService.createUser({
      username: 'duena',
      displayName: 'Dona Luz',
      roles: ['admin'],
      pin: '864209',
    });
    return (await loginWithCookie(app, 'duena', '864209')).cookie;
  }
  /** Crea una usuaria con esos roles y devuelve la cookie de su sesión real. */
  async function cookieFor(username: string, roles: UserRole[], pin: string) {
    await userService.createUser({ username, displayName: 'Persona', roles, pin });
    return (await loginWithCookie(app, username, pin)).cookie;
  }

  const getItems = (id: number | string, cookie?: string) => {
    const call = request(app).get(`/api/products/${id}/items`);
    return cookie === undefined ? call : call.set('Cookie', cookie);
  };
  const putItems = (id: number | string, body: unknown, cookie?: string) => {
    const call = request(app)
      .put(`/api/products/${id}/items`)
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

  /** La carta de AC-11/AC-12: pollo, chaufa, gaseosa y el combo mostrito. */
  async function seedMenu() {
    const pollo = await createProduct('Pollo a la brasa', 'chicken', 1850);
    const chaufa = await createProduct('Chaufa', 'dish', 1400);
    const inca = await createProduct('Inca Kola 500 ml', 'drink', 400);
    const mostrito = await createProduct('Mostrito', 'combo', 2200);
    return { pollo, chaufa, inca, mostrito };
  }
  const mostritoInput = (ids: {
    pollo: { id: number };
    chaufa: { id: number };
    inca: { id: number };
  }) => ({
    items: [
      { productId: ids.chaufa.id, quantity: 1 },
      { productId: ids.pollo.id, quantity: 1, portion: 'quarter', cut: 'leg' },
      { productId: ids.inca.id, quantity: 2 },
    ],
  });
  const mostritoExpected = (ids: {
    pollo: { id: number };
    chaufa: { id: number };
    inca: { id: number };
  }) => [
    {
      product: {
        id: ids.pollo.id,
        name: 'Pollo a la brasa',
        category: 'chicken',
        priceCents: 1850,
        isActive: true,
      },
      quantity: 1,
      portion: 'quarter',
      cut: 'leg',
    },
    {
      product: {
        id: ids.chaufa.id,
        name: 'Chaufa',
        category: 'dish',
        priceCents: 1400,
        isActive: true,
      },
      quantity: 1,
      portion: null,
      cut: null,
    },
    {
      product: {
        id: ids.inca.id,
        name: 'Inca Kola 500 ml',
        category: 'drink',
        priceCents: 400,
        isActive: true,
      },
      quantity: 2,
      portion: null,
      cut: null,
    },
  ];
  /** De una respuesta { items } queda lo comparable sin id ni comboId (cambian entre PUTs). */
  function stripItems(body: unknown) {
    return (
      body as {
        items: { product: unknown; quantity: unknown; portion: unknown; cut: unknown }[];
      }
    ).items.map((item) => ({
      product: item.product,
      quantity: item.quantity,
      portion: item.portion,
      cut: item.cut,
    }));
  }

  it('AC-11: GET devuelve los componentes en orden y con la forma exacta a cualquier rol', async () => {
    const ids = await seedMenu();
    const admin = await adminCookie();
    // Se cargan por SQL para que el GET sea lo único bajo prueba.
    await insertItem(ids.mostrito.id, ids.chaufa.id, 1);
    await insertItem(ids.mostrito.id, ids.pollo.id, 1, 'quarter', 'leg');
    await insertItem(ids.mostrito.id, ids.inca.id, 2);
    for (const [username, roles, pin] of [
      ['mozo.luz', ['waiter'], '2468'],
      ['cocina.pedro', ['kitchen'], '1357'],
      ['caja.rosa', ['cashier'], '8642'],
    ] as [string, UserRole[], string][]) {
      const cookie = await cookieFor(username, roles, pin);
      const response = await getItems(ids.mostrito.id, cookie);
      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(comboItemsResponseSchema.safeParse(response.body as unknown).success).toBe(true);
      expect(stripItems(response.body)).toEqual(mostritoExpected(ids));
      for (const item of (response.body as { items: { comboId: number }[] }).items) {
        expect(item.comboId).toBe(ids.mostrito.id);
      }
    }
    // Con admin también: la lectura no exige un rol en particular.
    const byAdmin = await getItems(ids.mostrito.id, admin);
    expect(byAdmin.status).toBe(200);
    expect(stripItems(byAdmin.body)).toEqual(mostritoExpected(ids));
  });
  it('AC-11: un producto sin componentes responde 200 con items vacío, sea combo o no', async () => {
    const ids = await seedMenu();
    const cookie = await cookieFor('mozo.luz', ['waiter'], '2468');
    for (const id of [ids.mostrito.id, ids.chaufa.id, ids.pollo.id]) {
      const response = await getItems(id, cookie);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ items: [] });
      expect(response.headers['cache-control']).toBe('no-store');
    }
  });
  it('AC-11: un producto inexistente responde 404 y un productId inválido 400 con issue en productId', async () => {
    const cookie = await cookieFor('mozo.luz', ['waiter'], '2468');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const notFound = await getItems(999999, cookie);
    expect(notFound.status).toBe(404);
    expect(notFound.body).toEqual(PRODUCT_NOT_FOUND_BODY);
    expect(notFound.headers['cache-control']).toBe('no-store');
    for (const id of ['abc', '0', '1.5', '-3', '2147483648']) {
      const issues = validationIssues(await getItems(id, cookie));
      expect(issues[0]).toEqual({ path: 'productId', message: PRODUCT_ID_MESSAGE });
    }
    expect(log).not.toHaveBeenCalled();
  });
  it('AC-11: sin sesión responde 401 UNAUTHENTICATED con no-store', async () => {
    const ids = await seedMenu();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const anonymous = await getItems(ids.mostrito.id);
    expect(anonymous.status).toBe(401);
    expect(anonymous.body).toEqual(UNAUTHENTICATED_BODY);
    expect(anonymous.headers['cache-control']).toBe('no-store');
    for (const header of ['polleria_session=invalid', 'otra=1']) {
      const invalid = await getItems(ids.mostrito.id, header);
      expect(invalid.status).toBe(401);
      expect(invalid.body).toEqual(UNAUTHENTICATED_BODY);
      expect(invalid.headers['cache-control']).toBe('no-store');
    }
    expect(log).not.toHaveBeenCalled();
  });

  it('AC-12: PUT de admin reemplaza el conjunto y el GET lo refleja; admin+mozo también', async () => {
    const admin = await adminCookie();
    const ids = await seedMenu();
    const put = await putItems(ids.mostrito.id, mostritoInput(ids), admin);
    expect(put.status).toBe(200);
    expect(put.headers['cache-control']).toBe('no-store');
    expect(comboItemsResponseSchema.safeParse(put.body as unknown).success).toBe(true);
    expect(stripItems(put.body)).toEqual(mostritoExpected(ids));
    // El GET posterior muestra el mismo conjunto.
    const listed = await getItems(ids.mostrito.id, admin);
    expect(stripItems(listed.body)).toEqual(mostritoExpected(ids));
    // Un segundo PUT idéntico deja 3 filas, no 6 (idempotente por reemplazo).
    const again = await putItems(ids.mostrito.id, mostritoInput(ids), admin);
    expect(again.status).toBe(200);
    expect(stripItems(again.body)).toEqual(mostritoExpected(ids));
    expect(await itemRows(ids.mostrito.id)).toHaveLength(3);
    // La administradora que además es moza obtiene lo mismo (basta un rol de la lista).
    const mixta = await cookieFor('mixta.admin', ['waiter', 'admin'], '592648');
    const other = await putItems(
      ids.mostrito.id,
      { items: [{ productId: ids.chaufa.id, quantity: 3 }] },
      mixta,
    );
    expect(other.status).toBe(200);
    expect(stripItems(other.body)).toEqual([
      {
        product: {
          id: ids.chaufa.id,
          name: 'Chaufa',
          category: 'dish',
          priceCents: 1400,
          isActive: true,
        },
        quantity: 3,
        portion: null,
        cut: null,
      },
    ]);
    expect(await itemRows(ids.mostrito.id)).toHaveLength(1);
  });
  it('AC-12: PUT con items vacío deja el combo sin componentes y la tabla vacía', async () => {
    const admin = await adminCookie();
    const ids = await seedMenu();
    await insertItem(ids.mostrito.id, ids.chaufa.id, 1);
    const cleared = await putItems(ids.mostrito.id, { items: [] }, admin);
    expect(cleared.status).toBe(200);
    expect(cleared.body).toEqual({ items: [] });
    expect(cleared.headers['cache-control']).toBe('no-store');
    expect((await getItems(ids.mostrito.id, admin)).body).toEqual({ items: [] });
    expect(await itemRows(ids.mostrito.id)).toEqual([]);
  });
  it('AC-12: exige sesión y rol admin; los rechazos no crean ni modifican filas', async () => {
    const ids = await seedMenu();
    await insertItem(ids.mostrito.id, ids.chaufa.id, 1);
    const before = await itemRows(ids.mostrito.id);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const anonymous = await putItems(ids.mostrito.id, mostritoInput(ids));
    expect(anonymous.status).toBe(401);
    expect(anonymous.body).toEqual(UNAUTHENTICATED_BODY);
    expect(anonymous.headers['cache-control']).toBe('no-store');
    for (const [username, roles, pin] of [
      ['mozo.luz', ['waiter'], '2468'],
      ['cocina.pedro', ['kitchen'], '1357'],
      ['caja.rosa', ['cashier'], '8642'],
      // Varios roles sin admin también es 403.
      ['mixta.mozo', ['waiter', 'cashier'], '5926'],
    ] as [string, UserRole[], string][]) {
      const worker = await cookieFor(username, roles, pin);
      const forbidden = await putItems(ids.mostrito.id, mostritoInput(ids), worker);
      expect(forbidden.status).toBe(403);
      expect(forbidden.body).toEqual(FORBIDDEN_BODY);
      expect(forbidden.headers['cache-control']).toBe('no-store');
    }
    expect(await itemRows(ids.mostrito.id)).toEqual(before);
    expect(log).not.toHaveBeenCalled();
  });
  it('AC-12: PUT sobre un producto que no es combo responde 409 exacto sin crear filas', async () => {
    const admin = await adminCookie();
    const ids = await seedMenu();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (const id of [ids.chaufa.id, ids.inca.id, ids.pollo.id]) {
      const response = await putItems(
        id,
        { items: [{ productId: ids.inca.id, quantity: 1 }] },
        admin,
      );
      expect(response.status).toBe(409);
      expect(response.body).toEqual(COMBO_ITEMS_NOT_ALLOWED_BODY);
      expect(response.headers['cache-control']).toBe('no-store');
    }
    expect(await rows('SELECT id FROM combo_items')).toEqual([]);
    expect(log).not.toHaveBeenCalled();
  });
  it('AC-12: PUT sobre un producto inexistente responde 404 y sobre id inválido 400', async () => {
    const admin = await adminCookie();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await putItems(999999, { items: [] }, admin);
    expect(response.status).toBe(404);
    expect(response.body).toEqual(PRODUCT_NOT_FOUND_BODY);
    expect(response.headers['cache-control']).toBe('no-store');
    for (const id of ['abc', '0', '1.5', '-3', '2147483648']) {
      const issues = validationIssues(await putItems(id, { items: [] }, admin));
      expect(issues[0]).toEqual({ path: 'productId', message: PRODUCT_ID_MESSAGE });
    }
    expect(log).not.toHaveBeenCalled();
  });
  it('AC-12: los cuatro problemas de componente llegan en un 400 con issues en orden y nada se guarda', async () => {
    const admin = await adminCookie();
    const ids = await seedMenu();
    await insertItem(ids.mostrito.id, ids.chaufa.id, 1);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const issues = validationIssues(
      await putItems(
        ids.mostrito.id,
        {
          items: [
            { productId: 999999, quantity: 1 }, // no existe
            { productId: ids.mostrito.id, quantity: 1 }, // el propio combo
            { productId: ids.pollo.id, quantity: 1 }, // pollo sin presentación
            { productId: ids.chaufa.id, quantity: 1, portion: 'quarter', cut: 'leg' },
          ],
        },
        admin,
      ),
    );
    expect(issues).toEqual([
      { path: 'items.0.productId', message: COMPONENT_NOT_FOUND_MESSAGE },
      { path: 'items.1.productId', message: NESTED_COMBO_MESSAGE },
      { path: 'items.2.portion', message: CHICKEN_NEEDS_PORTION_MESSAGE },
      { path: 'items.3.portion', message: ONLY_CHICKEN_HAS_PORTION_MESSAGE },
    ]);
    // Atomicidad verificada por GET: los ítems anteriores siguen intactos.
    expect((await getItems(ids.mostrito.id, admin)).body).toEqual({
      items: [
        {
          id: expect.any(Number) as unknown,
          comboId: ids.mostrito.id,
          product: {
            id: ids.chaufa.id,
            name: 'Chaufa',
            category: 'dish',
            priceCents: 1400,
            isActive: true,
          },
          quantity: 1,
          portion: null,
          cut: null,
        },
      ],
    });
    expect(log).not.toHaveBeenCalled();
  });
  it('AC-12: la forma inválida del cuerpo responde 400 con issues y no toca filas', async () => {
    const admin = await adminCookie();
    const ids = await seedMenu();
    await insertItem(ids.mostrito.id, ids.chaufa.id, 1);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (const body of [
      {},
      { items: 'x' },
      { items: [{}] },
      { items: [{ productId: ids.chaufa.id, quantity: 0 }] },
      { items: [{ productId: ids.chaufa.id, quantity: 1.5 }] },
      { items: [{ productId: ids.chaufa.id }, { productId: ids.chaufa.id }] },
      {
        items: Array.from({ length: 11 }, (_, index) => ({
          productId: ids.inca.id + index,
          quantity: 1,
        })),
      },
      { items: [{ productId: ids.chaufa.id, quantity: 1, extra: true }] },
      { items: [], extra: true },
    ])
      expect(validationIssues(await putItems(ids.mostrito.id, body, admin)).length).toBeGreaterThan(
        0,
      );
    expect(await itemRows(ids.mostrito.id)).toHaveLength(1);
    expect(log).not.toHaveBeenCalled();
  });

  it('AC-13: PATCH de categoría sobre un combo con componentes responde 409 exacto', async () => {
    const admin = await adminCookie();
    const ids = await seedMenu();
    await insertItem(ids.mostrito.id, ids.chaufa.id, 1);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await patchProduct(ids.mostrito.id, { category: 'dish' }, admin);
    expect(response.status).toBe(409);
    expect(response.body).toEqual(PRODUCT_HAS_ITEMS_BODY);
    expect(response.headers['cache-control']).toBe('no-store');
    // El producto sigue 'combo' con su nombre y precio anteriores.
    expect(await productRow(ids.mostrito.id)).toEqual([
      { name: 'Mostrito', category: 'combo', price_cents: 2200, is_active: true },
    ]);
    expect(log).not.toHaveBeenCalled();
  });
  it('AC-13: PATCH de categoría sobre un componente responde 409 y se desbloquea al vaciar', async () => {
    const admin = await adminCookie();
    const ids = await seedMenu();
    await insertItem(ids.mostrito.id, ids.chaufa.id, 1);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await patchProduct(ids.chaufa.id, { category: 'extra' }, admin);
    expect(response.status).toBe(409);
    expect(response.body).toEqual(PRODUCT_IS_COMPONENT_BODY);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(await productRow(ids.chaufa.id)).toEqual([
      { name: 'Chaufa', category: 'dish', price_cents: 1400, is_active: true },
    ]);
    // Tras vaciar el combo, el mismo PATCH responde 200 con la categoría nueva.
    const cleared = await putItems(ids.mostrito.id, { items: [] }, admin);
    expect(cleared.status).toBe(200);
    const patched = await patchProduct(ids.chaufa.id, { category: 'extra' }, admin);
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({ id: ids.chaufa.id, category: 'extra' });
    expect(patched.headers['cache-control']).toBe('no-store');
    expect(log).not.toHaveBeenCalled();
  });
  it('AC-13: PATCH de mozo sigue en 403 y chicken con presentaciones a combo en 409', async () => {
    const admin = await adminCookie();
    const ids = await seedMenu();
    await insertPortion(ids.pollo.id, 'quarter', 'breast', 1850);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const mozo = await cookieFor('mozo.luz', ['waiter'], '2468');
    const forbidden = await patchProduct(ids.mostrito.id, { priceCents: 2400 }, mozo);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toEqual(FORBIDDEN_BODY);
    expect(forbidden.headers['cache-control']).toBe('no-store');
    // La guardia de la 006 sigue vigente hacia 'combo' (un pollo no junta
    // presentaciones y componentes).
    const response = await patchProduct(ids.pollo.id, { category: 'combo' }, admin);
    expect(response.status).toBe(409);
    expect(response.body).toEqual(PRODUCT_HAS_PORTIONS_BODY);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(log).not.toHaveBeenCalled();
  });

  it('AC-14: los métodos y subrutas no declarados de /items responden 404 con no-store', async () => {
    const admin = await adminCookie();
    const ids = await seedMenu();
    await insertItem(ids.mostrito.id, ids.chaufa.id, 1);
    const before = await itemRows(ids.mostrito.id);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const responses = [
      await request(app)
        .post(`/api/products/${String(ids.mostrito.id)}/items`)
        .set('Cookie', admin)
        .send(mostritoInput(ids)),
      await request(app)
        .delete(`/api/products/${String(ids.mostrito.id)}/items`)
        .set('Cookie', admin),
      await request(app)
        .patch(`/api/products/${String(ids.mostrito.id)}/items`)
        .set('Cookie', admin)
        .send(mostritoInput(ids)),
      await request(app)
        .get(`/api/products/${String(ids.mostrito.id)}/items/1`)
        .set('Cookie', admin),
    ];
    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(response.body).toEqual(NOT_FOUND_BODY);
      expect(response.headers['cache-control']).toBe('no-store');
    }
    expect(await itemRows(ids.mostrito.id)).toEqual(before);
    expect(log).not.toHaveBeenCalled();
  });

  it('AC-15: los errores del lector del cuerpo en PUT responden su código con no-store', async () => {
    const admin = await adminCookie();
    const ids = await seedMenu();
    await insertItem(ids.mostrito.id, ids.chaufa.id, 1);
    const before = await itemRows(ids.mostrito.id);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const put = () =>
      request(app)
        .put(`/api/products/${String(ids.mostrito.id)}/items`)
        .set('Cookie', admin);

    // JSON mal formado.
    const badJson = await sendRawBody(
      put().set('Content-Type', 'application/json'),
      Buffer.from('{"items":'),
    );
    expect(badJson.status).toBe(400);
    expect(badJson.body).toEqual(INVALID_JSON_BODY);
    expect(badJson.headers['cache-control']).toBe('no-store');

    // JSON válido que no es un objeto (un número): el cuerpo no se puede usar.
    const notObject = await sendRawBody(
      put().set('Content-Type', 'application/json'),
      Buffer.from('5'),
    );
    expect(notObject.status).toBe(400);
    expect(notObject.body).toEqual(INVALID_BODY_BODY);
    expect(notObject.headers['cache-control']).toBe('no-store');

    // Content-Type que no es application/json con cuerpo no vacío.
    const wrongType = await sendRawBody(
      put().set('Content-Type', 'text/plain'),
      Buffer.from('{"items":[]}'),
    );
    expect(wrongType.status).toBe(415);
    expect(wrongType.body).toEqual(UNSUPPORTED_MEDIA_TYPE_BODY);
    expect(wrongType.headers['cache-control']).toBe('no-store');
    const formType = await sendRawBody(
      put().set('Content-Type', 'application/x-www-form-urlencoded'),
      Buffer.from('items=x'),
    );
    expect(formType.status).toBe(415);
    expect(formType.body).toEqual(UNSUPPORTED_MEDIA_TYPE_BODY);
    expect(formType.headers['cache-control']).toBe('no-store');

    // Más de 100 kb.
    const tooLarge = await sendRawBody(
      put().set('Content-Type', 'application/json'),
      Buffer.from(jsonBodyOfSize(150 * 1024)),
    );
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.body).toEqual(PAYLOAD_TOO_LARGE_BODY);
    expect(tooLarge.headers['cache-control']).toBe('no-store');

    expect(await itemRows(ids.mostrito.id)).toEqual(before);
    expect(log).not.toHaveBeenCalled();
  });
});
