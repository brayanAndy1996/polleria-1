import request from 'supertest';
import { QueryTypes } from 'sequelize';
import type { Sequelize, InstanceUpdateOptions } from 'sequelize';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserRole } from '@polleria/shared';
import { assertTestDatabase } from '../../src/db/assert-test-database.ts';
import { getPostgresConnectionParts } from '../../src/db/postgres-url.ts';
import { AppError } from '../../src/errors/app-error.ts';
import { createProductService } from '../../src/services/products/product.service.ts';
import { createComboItemService } from '../../src/services/combo-items/combo-item.service.ts';
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
    message: 'No tienes permiso para realizar esta acci\u00f3n.',
    details: null,
  },
};
const PRODUCT_NOT_FOUND_BODY = {
  error: { code: 'PRODUCT_NOT_FOUND', message: 'Ese producto no existe.', details: null },
};
const COMBO_ITEMS_NOT_ALLOWED_BODY = {
  error: {
    code: 'COMBO_ITEMS_NOT_ALLOWED',
    message: 'Solo los productos de la categor\u00eda Combos pueden tener componentes.',
    details: null,
  },
};
const PRODUCT_HAS_ITEMS_BODY = {
  error: {
    code: 'PRODUCT_HAS_ITEMS',
    message:
      'Este producto es un combo con componentes; quita sus componentes antes de ' +
      'cambiar su categor\u00eda.',
    details: null,
  },
};
const PRODUCT_IS_COMPONENT_BODY = {
  error: {
    code: 'PRODUCT_IS_COMPONENT',
    message:
      'Este producto es componente de un combo; qu\u00edtalo del combo antes de ' +
      'cambiar su categor\u00eda.',
    details: null,
  },
};
const NOT_FOUND_BODY = {
  error: { code: 'NOT_FOUND', message: 'La ruta solicitada no existe.', details: null },
};
const INVALID_URL_BODY = {
  error: {
    code: 'VALIDATION_ERROR',
    message: 'La direcci\u00f3n no es v\u00e1lida.',
    details: null,
  },
};
const COMPONENT_NOT_FOUND_MESSAGE = 'Ese producto no existe.';
const ONLY_CHICKEN_HAS_PORTION_MESSAGE =
  'Solo un componente de pollo lleva presentaci\u00f3n y parte.';
const ADMIN_PIN = '864209';

/** JSON valido de exactamente `bytes` bytes: {"a":"xxx...x"}. */
function jsonBodyOfSize(bytes: number): string {
  const overhead = Buffer.byteLength('{"a":""}');
  return `{"a":"${'x'.repeat(bytes - overhead)}"}`;
}

/** De una lista de items queda solo el comparable (los id pueden cambiar entre PUTs). */
const strip = (
  list: { product: { id: number }; quantity: number; portion: string | null; cut: string | null }[],
) =>
  list
    .map(({ product, quantity, portion, cut }) => ({
      productId: product.id,
      quantity,
      portion,
      cut,
    }))
    .sort(
      (first, second) =>
        first.productId - second.productId ||
        String(first.portion).localeCompare(String(second.portion)) ||
        String(first.cut).localeCompare(String(second.cut)),
    );

/** Los issues de un VALIDATION_ERROR (el body de supertest es any). */
const issuesOf = (response: { body: unknown }) =>
  (response.body as { error: { details: { issues: { path: string; message: string }[] } } }).error
    .details.issues;

/** El cuerpo de una respuesta de componentes, segun el contrato (body de supertest es any). */
type ItemsBody = {
  items: {
    id: number;
    comboId: number;
    product: { id: number; name: string; category: string; priceCents: number; isActive: boolean };
    quantity: number;
    portion: string | null;
    cut: string | null;
  }[];
};

/** El codigo de error estandar de la API (el body de supertest llega como any). */
const errorCode = (response: { body: unknown }) =>
  (response.body as { error?: { code?: string } }).error?.code;

/**
 * Guardia estricta de la conexion de pruebas (identica a la de la 006): la URL debe
 * ser exactamente polleria_test en localhost como usuario polleria, sin parametros
 * extra, antes de permitir cualquier SQL directo de las pruebas. combo_items esta
 * autorizada a limpieza (D-007-14) igual que products y product_portions.
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
    throw new Error(
      'La conexi\u00f3n no cumple la autorizaci\u00f3n local exclusiva para polleria_test.',
    );
}

async function assertAuthorizedConnection(sequelize: Sequelize): Promise<void> {
  assertAuthorizedUrl();
  if ((await assertConnectedToTestDatabase(sequelize)) !== 'polleria_test') {
    throw new Error(
      'La base conectada no es exactamente polleria_test; preparaci\u00f3n cancelada.',
    );
  }
}

/**
 * Ataques a los componentes de combo (spec 007) que las pruebas de AC no cubren:
 * productId hostiles en las rutas nuevas, escapes % malformados (leccion ADV-005-30),
 * no-store en cada error incluidas mayusculas (leccion ADV-004-25), cuerpos hostiles,
 * el lector laxo del PUT (INVALID_BODY propio frente al INVALID_JSON del resto),
 * carreras PUT||PUT y PUT||PATCH sobre las guardias de categoria (TOCTOU, la leccion
 * de la 006), el borrado del producto a mitad de vuelo (leccion ADV-005-25), roles
 * leidos en vivo y garantias de la base frente a SQL directo.
 */
describe('007-adversarial: API, servicio y concurrencia de componentes sobre polleria_test', () => {
  let sequelize: Sequelize | undefined;
  let auth: ReturnType<typeof setupAuth>;
  let productService: ReturnType<typeof createProductService>;
  let itemService: ReturnType<typeof createComboItemService>;
  let prepared = false;

  function database(): Sequelize {
    if (!sequelize) throw new Error('No hay conexi\u00f3n de pruebas autorizada.');
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
    productService = createProductService({ models: auth.models });
    itemService = createComboItemService({ models: auth.models });
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
  const itemRows = (comboId: number) =>
    rows<{
      id: number;
      product_id: number;
      quantity: number;
      portion: string | null;
      cut: string | null;
    }>(
      'SELECT id, product_id, quantity, portion, cut FROM combo_items WHERE combo_id = $1 ORDER BY id',
      [comboId],
    );
  const insertItemSql = (
    comboId: number,
    productId: number,
    quantity = 1,
    portion: string | null = null,
    cut: string | null = null,
  ) =>
    database().query(
      'INSERT INTO combo_items (combo_id, product_id, quantity, portion, cut) ' +
        'VALUES ($1, $2, $3, $4, $5)',
      { bind: [comboId, productId, quantity, portion, cut] },
    );

  /** Crea al administrador y devuelve la cookie de su sesion real. El username es
   *  unico del archivo ('admin007'): otros archivos de integracion tambien crean
   *  'dueno' y las ventanas de la suite compartida no deben chocar por el UNIQUE. */
  async function adminCookie() {
    await auth.createUser('admin007', 'Don Carlos', ['admin'], ADMIN_PIN);
    return (await loginWithCookie(auth.app, 'admin007', ADMIN_PIN)).cookie;
  }
  /** Crea una usuaria con esos roles y devuelve la cookie de su sesion real. */
  async function cookieFor(username: string, roles: UserRole[], pin: string) {
    await auth.createUser(username, 'Persona', roles, pin);
    return (await loginWithCookie(auth.app, username, pin)).cookie;
  }
  /** Un producto por el servicio (sale con id propio). */
  const createChicken = (name = 'Pollo a la brasa') =>
    productService.createProduct({ name, category: 'chicken', priceCents: 1850 });
  const createDish = (name = 'Chaufa') =>
    productService.createProduct({ name, category: 'dish', priceCents: 1400 });
  const createDrink = (name = 'Inca Kola 500 ml') =>
    productService.createProduct({ name, category: 'drink', priceCents: 400 });
  const createCombo = (name = 'Mostrito') =>
    productService.createProduct({ name, category: 'combo', priceCents: 2200 });

  const getItems = (id: number | string, cookie?: string) => {
    const call = request(auth.app).get(`/api/products/${id}/items`);
    return cookie === undefined ? call : call.set('Cookie', cookie);
  };
  const putItems = (id: number | string, body: unknown, cookie?: string) => {
    const call = request(auth.app)
      .put(`/api/products/${id}/items`)
      .send(body as object);
    return cookie === undefined ? call : call.set('Cookie', cookie);
  };
  const patchProduct = (id: number | string, body: unknown, cookie?: string) => {
    const call = request(auth.app)
      .patch(`/api/products/${id}`)
      .send(body as object);
    return cookie === undefined ? call : call.set('Cookie', cookie);
  };

  it('ADV-007-09: productId hostiles en GET y PUT /items responden 400 con issue en productId', async () => {
    const cookie = await adminCookie();
    const combo = await createCombo();
    const chaufa = await createDish();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // '03' vale 3 igual que en la 005: con ceros a la izquierda se llega al producto.
    const padded = await getItems('0'.repeat(3) + String(combo.id), cookie);
    expect(padded.status).toBe(200);
    expect(padded.body).toEqual({ items: [] });
    const paddedPut = await putItems(
      '0'.repeat(4) + String(combo.id),
      { items: [{ productId: chaufa.id, quantity: 1 }] },
      cookie,
    );
    expect(paddedPut.status).toBe(200);
    // La frontera del INTEGER: 2147483647 es un id valido que no existe (404).
    const boundary = await putItems(
      '2147483647',
      { items: [{ productId: chaufa.id, quantity: 1 }] },
      cookie,
    );
    expect(boundary.status).toBe(404);
    expect(boundary.body).toEqual(PRODUCT_NOT_FOUND_BODY);
    // Todo lo demas es 400 con el issue en productId, en GET y en PUT por igual.
    for (const id of [
      'abc',
      '0',
      '00',
      '-3',
      '1.5',
      '1.0',
      '1e5',
      '+5',
      '0x10',
      ' 5',
      '5 ',
      '\u0663',
      '\uFF15',
      '5\u00A0',
      "5' OR '1'='1",
      '5;DROP TABLE products',
      'null',
      'undefined',
      'NaN',
      '9'.repeat(30),
      '2147483648',
      '9999999999999999999999999',
    ]) {
      const encoded = encodeURIComponent(id);
      const get = await getItems(encoded, cookie);
      expect.soft(get.status, `GET ${id}`).toBe(400);
      expect.soft(get.headers['cache-control'], `GET ${id}`).toBe('no-store');
      expect.soft(issuesOf(get)[0]?.path, `GET ${id}`).toBe('productId');
      const put = await putItems(
        encoded,
        { items: [{ productId: chaufa.id, quantity: 1 }] },
        cookie,
      );
      expect.soft(put.status, `PUT ${id}`).toBe(400);
      expect.soft(put.headers['cache-control'], `PUT ${id}`).toBe('no-store');
      expect.soft(issuesOf(put)[0]?.path, `PUT ${id}`).toBe('productId');
    }
    // Formas codificadas en la ruta: %00 (NUL), %2F (barra), espacios codificados.
    for (const id of ['5%20', '%205', '5%00x', '1%2F2', '5;']) {
      const get = await getItems(id, cookie);
      expect.soft(get.status, `GET raw ${id}`).toBe(400);
      expect.soft(get.headers['cache-control'], `GET raw ${id}`).toBe('no-store');
    }
    // Nada quedo escrito tras la bateria: solo la fila del PUT acolchado.
    expect(await itemRows(combo.id)).toHaveLength(1);
    expect(await itemRows(chaufa.id)).toEqual([]);
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-007-10: un escape % malformado en las rutas nuevas responde 400 sin ruido (leccion ADV-005-30)', async () => {
    const cookie = await adminCookie();
    const combo = await createCombo();
    const chaufa = await createDish();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // path-to-regexp lanza URIError al decodificar '%' o un escape UTF-8 incompleto en
    // :productId; el errorHandler lo traduce a 400 VALIDATION_ERROR desde la 005.
    for (const id of ['%', '%E0%A4%A', 'abc%', '%%', '1%2']) {
      const get = await request(auth.app).get(`/api/products/${id}/items`).set('Cookie', cookie);
      expect.soft(get.status, `GET ${id}`).toBe(400);
      expect.soft(get.body, `GET ${id}`).toEqual(INVALID_URL_BODY);
      expect.soft(get.headers['cache-control'], `GET ${id}`).toBe('no-store');
      const put = await request(auth.app)
        .put(`/api/products/${id}/items`)
        .set('Cookie', cookie)
        .send({ items: [{ productId: chaufa.id, quantity: 1 }] });
      expect.soft(put.status, `PUT ${id}`).toBe(400);
      expect.soft(put.body, `PUT ${id}`).toEqual(INVALID_URL_BODY);
      expect.soft(put.headers['cache-control'], `PUT ${id}`).toBe('no-store');
    }
    expect(await itemRows(combo.id)).toEqual([]);
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-007-11: todas las respuestas de las rutas nuevas llevan no-store, incluidas mayusculas y alias', async () => {
    const cookie = await adminCookie();
    const mozo = await cookieFor('mozo007.juan', ['waiter'], '2468');
    const combo = await createCombo();
    const chaufa = await createDish();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Express enruta sin distinguir mayusculas y el prefijo se compara en minusculas
    // (leccion ADV-004-25): /API/PRODUCTS/N/ITEMS queda cubierto igual.
    for (const response of [
      await request(auth.app).get(`/api/PRODUCTS/${combo.id}/ITEMS`).set('Cookie', mozo),
      await request(auth.app)
        .put(`/Api/Products/${combo.id}/Items`)
        .set('Cookie', cookie)
        .send({ items: [{ productId: chaufa.id, quantity: 1 }] }),
      // Errores de auth y de metodo tambien llevan la cabecera.
      await getItems(combo.id),
      await putItems(combo.id, { items: [{ productId: chaufa.id, quantity: 1 }] }, mozo),
      await request(auth.app)
        .post(`/api/products/${combo.id}/items`)
        .set('Cookie', cookie)
        .send({}),
      await request(auth.app).delete(`/api/products/${combo.id}/items`).set('Cookie', cookie),
      await request(auth.app)
        .patch(`/api/products/${combo.id}/items`)
        .set('Cookie', cookie)
        .send({ items: [] }),
      await getItems('abc', cookie),
      await getItems(999999, cookie),
      await request(auth.app).get(`/api/products/${combo.id}/items/2`).set('Cookie', cookie),
    ]) {
      expect.soft(response.headers['cache-control'], String(response.status)).toBe('no-store');
      // Ningun 4xx/5xx fuga datos internos.
      expect
        .soft(JSON.stringify(response.body))
        .not.toMatch(/polleria_dev|sequelize|SELECT |password|pinHash|tokenHash/i);
    }
    // OPTIONS auto de Express 5 sobre la ruta declara solo GET/HEAD y PUT (HEAD viene
    // gratis con GET; OPTIONS no exige sesion, es preflight de navegador).
    const options = await request(auth.app).options(`/api/products/${combo.id}/items`);
    expect(options.status).toBe(200);
    expect(options.headers['allow']).toBe('GET, HEAD, PUT');
    expect(options.headers['cache-control']).toBe('no-store');
    // HEAD existe porque GET existe: 200 sin cuerpo.
    const head = await request(auth.app)
      .head(`/api/products/${combo.id}/items`)
      .set('Cookie', mozo);
    expect(head.status).toBe(200);
    expect(head.text ?? '').toBe('');
    // Barra final y subruta inexistente.
    const trailing = await request(auth.app)
      .get(`/api/products/${combo.id}/items/`)
      .set('Cookie', cookie);
    expect(trailing.status).toBe(200);
    const subroute = await request(auth.app)
      .get(`/api/products/${combo.id}/items/extra`)
      .set('Cookie', cookie);
    expect(subroute.status).toBe(404);
    expect(subroute.body).toEqual(NOT_FOUND_BODY);
    // Metodos no declarados: 404, nunca 405 (AC-14).
    for (const response of [
      await request(auth.app)
        .post(`/api/products/${combo.id}/items`)
        .set('Cookie', cookie)
        .send({}),
      await request(auth.app).delete(`/api/products/${combo.id}/items`).set('Cookie', cookie),
      await request(auth.app)
        .patch(`/api/products/${combo.id}/items`)
        .set('Cookie', cookie)
        .send({ items: [] }),
    ]) {
      expect.soft(response.status).toBe(404);
      expect.soft(response.body).toEqual(NOT_FOUND_BODY);
    }
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-007-12: cuerpos hostiles del PUT se rechazan sin tocar el conjunto ni el prototipo', async () => {
    const cookie = await adminCookie();
    const combo = await createCombo();
    const pollo = await createChicken();
    const chaufa = await createDish();
    await insertItemSql(combo.id, chaufa.id, 1, null, null);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const expect400 = async (
      raw: string | object,
      label: string,
      expectedCode = 'VALIDATION_ERROR',
    ) => {
      const call = request(auth.app)
        .put(`/api/products/${combo.id}/items`)
        .set('Cookie', cookie)
        .set('Content-Type', 'application/json');
      const response = typeof raw === 'string' ? await call.send(raw) : await call.send(raw);
      expect.soft(response.status, label).toBe(400);
      expect.soft(errorCode(response), label).toBe(expectedCode);
      expect.soft(response.headers['cache-control'], label).toBe('no-store');
    };
    // Repetidos con el orden de claves cambiado, con quantity distinta y con
    // portion/cut omitidos vs null (Zod los detecta antes de la base).
    await expect400(
      JSON.stringify({
        items: [
          { productId: chaufa.id, quantity: 1 },
          { quantity: 2, productId: chaufa.id },
        ],
      }),
      'duplicado con claves reordenadas',
    );
    await expect400(
      JSON.stringify({
        items: [
          { productId: chaufa.id, quantity: 1 },
          { productId: chaufa.id, quantity: 1, portion: null, cut: null },
        ],
      }),
      'omitidos vs null explicitos',
    );
    await expect400(
      JSON.stringify({
        items: [
          { productId: pollo.id, quantity: 1, portion: 'quarter', cut: 'breast' },
          { cut: 'breast', portion: 'quarter', quantity: 2, productId: pollo.id },
        ],
      }),
      'misma clave con otra quantity',
    );
    // Elementos hostiles y claves de prototipo en la fila y en la raiz. Ojo: para que
    // '__proto__' llegue como clave al servidor hay que escribirla en el JSON literal
    // (en un literal de objeto JS muta el prototipo y JSON.stringify la pierde).
    await expect400(JSON.stringify({ items: [null] }), 'elemento null');
    await expect400(JSON.stringify({ items: [[]] }), 'elemento array vacio');
    await expect400(JSON.stringify({ items: ['quarter'] }), 'elemento texto');
    await expect400(JSON.stringify({ items: [0] }), 'elemento numero');
    await expect400(
      `{"items":[{"productId":${chaufa.id},"quantity":1,"__proto__":{"x":1}}]}`,
      '__proto__ en fila',
    );
    await expect400('{"items":[],"__proto__":{"injected":true}}', '__proto__ en raiz');
    await expect400(
      JSON.stringify({ items: [], constructor: { name: 'x' } }),
      'constructor en raiz',
    );
    await expect400(
      JSON.stringify({ items: [{ productId: chaufa.id, quantity: 1, id: 4 }] }),
      'id de mas en fila',
    );
    await expect400(
      JSON.stringify({ items: [{ productId: chaufa.id, quantity: 1, product_id: 9 }] }),
      'product_id en fila',
    );
    await expect400(
      JSON.stringify({ items: [{ productId: chaufa.id, quantity: 1, comboId: 7 }] }),
      'comboId ajeno en fila',
    );
    // Formas invalidas de cada campo del cuerpo.
    await expect400({ items: {} }, 'items objeto');
    await expect400({ items: 'x' }, 'items texto');
    await expect400({ items: null }, 'items null');
    await expect400({ items: [{ productId: chaufa.id, quantity: 1 }], extra: 1 }, 'clave de mas');
    for (const quantity of [0, -1, 100, 1.5, '1', '99', true, null, 1e2, Number.NaN])
      await expect400(
        JSON.stringify({ items: [{ productId: chaufa.id, quantity }] }),
        `quantity ${String(quantity)}`,
      );
    for (const productId of [0, -1, 1.5, '5', '05', true, null, 2147483648, '9'.repeat(12)])
      await expect400(
        JSON.stringify({ items: [{ productId, quantity: 1 }] }),
        `productId ${String(productId)}`,
      );
    // Correspondencia presentation-parte en el esquema (el servicio ni la ve).
    await expect400(
      JSON.stringify({ items: [{ productId: chaufa.id, quantity: 1, cut: 'leg' }] }),
      'cut sin portion',
    );
    await expect400(
      JSON.stringify({ items: [{ productId: pollo.id, quantity: 1, portion: 'quarter' }] }),
      'quarter sin cut',
    );
    await expect400(
      JSON.stringify({
        items: [{ productId: pollo.id, quantity: 1, portion: 'half', cut: 'breast' }],
      }),
      'half con cut',
    );
    // 11 filas (el tope es 10) aunque todas tengan forma valida.
    await expect400(
      JSON.stringify({
        items: Array.from({ length: 11 }, (_, i) => ({ productId: chaufa.id + i, quantity: 1 })),
      }),
      '11 filas',
    );
    // NUL dentro de una cadena: JSON lo admite, el enum no.
    await expect400(
      JSON.stringify({
        items: [{ productId: pollo.id, quantity: 1, portion: 'quar\u0000ter', cut: 'leg' }],
      }),
      'NUL en portion',
    );
    // JSON truncado: el lector responde INVALID_JSON, no VALIDATION_ERROR.
    const truncated = await sendRawBody(
      request(auth.app)
        .put(`/api/products/${combo.id}/items`)
        .set('Cookie', cookie)
        .set('Content-Type', 'application/json'),
      Buffer.from('{"items":[{"productId":5,'),
    );
    expect(truncated.status).toBe(400);
    expect(errorCode(truncated)).toBe('INVALID_JSON');
    expect(truncated.headers['cache-control']).toBe('no-store');
    // JSON con la clave repetida: gana la ultima (documentado en ADV-005-27): aqui el
    // segundo items vacia el combo — comportamiento del parser, no de la regla.
    const dupKey = await sendRawBody(
      request(auth.app)
        .put(`/api/products/${combo.id}/items`)
        .set('Cookie', cookie)
        .set('Content-Type', 'application/json'),
      Buffer.from(
        `{"items":[{"productId":${pollo.id},"quantity":1,"portion":"quarter","cut":"leg"}],"items":[]}`,
      ),
    );
    expect(dupKey.status).toBe(200);
    expect(dupKey.body).toEqual({ items: [] });
    // Reponemos para verificar el resto de la bateria contra un conjunto conocido.
    await putItems(combo.id, { items: [{ productId: chaufa.id, quantity: 1 }] }, cookie);
    // La forma raiz valida que no es objeto llega a requireJsonObject: INVALID_BODY
    // (el lector laxo si la lee). Un objeto con items invalido es VALIDATION_ERROR.
    expect(Reflect.has({}, 'injected')).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-007-13: el lector laxo es propio de /items: INVALID_BODY aqui, INVALID_JSON en el resto', async () => {
    const cookie = await adminCookie();
    const combo = await createCombo();
    const pollo = await createChicken();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const rawPut = (path: string, body: string, contentType = 'application/json') =>
      sendRawBody(
        request(auth.app).put(path).set('Cookie', cookie).set('Content-Type', contentType),
        Buffer.from(body),
      );
    // AC-15: JSON valido que no es objeto (numero, texto, null, booleano, array)
    // responde INVALID_BODY en PUT .../items — el lector laxo lo lee y
    // requireJsonObject lo convierte en 400 propio.
    for (const scalar of ['5', '"texto"', 'null', 'true', '[]', '[1,2]', ' { } ']) {
      const response = await rawPut(`/api/products/${combo.id}/items`, scalar);
      expect.soft(response.status, scalar).toBe(400);
      expect
        .soft(errorCode(response), scalar)
        .toBe(scalar === ' { } ' ? 'VALIDATION_ERROR' : 'INVALID_BODY');
      expect.soft(response.headers['cache-control'], scalar).toBe('no-store');
    }
    // '{}.x' no es un escalar: es JSON truncado, y responde INVALID_JSON incluso en
    // la ruta laxa.
    const malformed = await rawPut(`/api/products/${combo.id}/items`, '{}.x');
    expect(errorCode(malformed)).toBe('INVALID_JSON');
    // ADV-006-13 al reves: el lector laxo NO se escapo a otras rutas — el mismo
    // escalar en /portions y en PATCH /products responde INVALID_JSON (lector estricto).
    for (const scalar of ['5', '"texto"', 'null', 'true']) {
      const portions = await rawPut(`/api/products/${pollo.id}/portions`, scalar);
      expect.soft(errorCode(portions), `portions ${scalar}`).toBe('INVALID_JSON');
      const patch = await sendRawBody(
        request(auth.app)
          .patch(`/api/products/${combo.id}`)
          .set('Cookie', cookie)
          .set('Content-Type', 'application/json'),
        Buffer.from(scalar),
      );
      expect.soft(errorCode(patch), `patch ${scalar}`).toBe('INVALID_JSON');
    }
    // Observacion de asimetria del lector (documentada, no hallazgo): un array raiz
    // '[]' si pasa el lector estricto (es un objeto para typeof) y llega al esquema
    // como VALIDATION_ERROR en /portions y PATCH, mientras que en /items lo atrapa
    // requireJsonObject como INVALID_BODY. La frontera del lector es distinta pero
    // ambas responden 400 con no-store.
    const portionsArray = await rawPut(`/api/products/${pollo.id}/portions`, '[]');
    expect(errorCode(portionsArray)).toBe('VALIDATION_ERROR');
    const patchArray = await sendRawBody(
      request(auth.app)
        .patch(`/api/products/${combo.id}`)
        .set('Cookie', cookie)
        .set('Content-Type', 'application/json'),
      Buffer.from('[]'),
    );
    expect(errorCode(patchArray)).toBe('VALIDATION_ERROR');
    // Un escalar en una ruta no declarada del mismo subarbol cae en el 404, no en
    // el lector: POST /items no existe y no llega a requireJsonObject.
    const postScalar = await sendRawBody(
      request(auth.app)
        .post(`/api/products/${combo.id}/items`)
        .set('Cookie', cookie)
        .set('Content-Type', 'application/json'),
      Buffer.from('5'),
    );
    expect(postScalar.status).toBe(404);
    expect(postScalar.body).toEqual(NOT_FOUND_BODY);
    // Los errores del lector conservan su familia en la ruta laxa.
    const truncated = await rawPut(`/api/products/${combo.id}/items`, '{"items":[{"productId":');
    expect(errorCode(truncated)).toBe('INVALID_JSON');
    const tooLarge = await rawPut(`/api/products/${combo.id}/items`, jsonBodyOfSize(101 * 1024));
    expect(tooLarge.status).toBe(413);
    expect(errorCode(tooLarge)).toBe('PAYLOAD_TOO_LARGE');
    // Content-Type que no es JSON con cuerpo: 415 (form-urlencoded incluido).
    for (const type of [
      'text/plain',
      'application/x-www-form-urlencoded',
      'application/octet-stream',
      'text/html',
    ]) {
      const response = await rawPut(
        `/api/products/${combo.id}/items`,
        '{"items":[{"productId":1,"quantity":1}]}',
        type,
      );
      expect.soft(response.status, type).toBe(415);
      expect.soft(errorCode(response), type).toBe('UNSUPPORTED_MEDIA_TYPE');
      expect.soft(response.headers['cache-control'], type).toBe('no-store');
    }
    // application/json con charset pasa la guardia de Content-Type.
    const charset = await rawPut(
      `/api/products/${combo.id}/items`,
      '{"items":[]}',
      'application/json; charset=utf-8',
    );
    expect(charset.status).toBe(200);
    // PUT sin cuerpo: el lector deja {} y el esquema responde VALIDATION_ERROR por
    // items requerido (el comentario de requireJsonContentType lo anticipa).
    const empty = await request(auth.app)
      .put(`/api/products/${combo.id}/items`)
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send();
    expect(empty.status).toBe(400);
    expect(errorCode(empty)).toBe('VALIDATION_ERROR');
    // Los errores del lector corren antes de la autenticacion, igual que INVALID_JSON
    // en el resto de la API: un escalar sin sesion responde INVALID_BODY, no 401.
    const anonymous = await sendRawBody(
      request(auth.app)
        .put(`/api/products/${combo.id}/items`)
        .set('Content-Type', 'application/json'),
      Buffer.from('5'),
    );
    expect(anonymous.status).toBe(400);
    expect(errorCode(anonymous)).toBe('INVALID_BODY');
    // Nada quedo escrito (el ultimo PUT valido vacio el combo con charset utf-8).
    expect(await itemRows(combo.id)).toEqual([]);
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-007-14: un PUT anidado dentro del hueco del PUT A no une conjuntos ni se cuelga (ultimo-que-cierra)', async () => {
    const combo = await createCombo();
    const chaufa = await createDish();
    const gaseosa = await createDrink();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Engancha beforeBulkCreate: antes de insertar las filas de A (con el DELETE de
    // A ya corrido en su transaccion), un PUT B completo con productos ajenos a los
    // de A corre a commit — el conjunto final debe ser el de A y no una union.
    let armed = true;
    auth.models.ComboItem.addHook('beforeBulkCreate', 'adv007NestedPut', async () => {
      if (!armed) return;
      armed = false;
      const inner = await itemService.replaceComboItems(combo.id, {
        items: [{ productId: gaseosa.id, quantity: 2, portion: null, cut: null }],
      });
      expect(inner).toHaveLength(1);
      expect(inner[0]?.product.id).toBe(gaseosa.id);
    });
    const outcome = await itemService.replaceComboItems(combo.id, {
      items: [{ productId: chaufa.id, quantity: 1, portion: null, cut: null }],
    });
    expect(outcome).toHaveLength(1);
    expect(outcome[0]?.product.id).toBe(chaufa.id);
    // La base coincide: solo la fila de A quedo; la de B se barrio con el DELETE de A.
    expect(await itemRows(combo.id)).toEqual([
      expect.objectContaining({ product_id: chaufa.id, quantity: 1 }),
    ]);
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-007-15: un PATCH combo->dish dentro del hueco del PUT cierra su transaccion con COMBO_ITEMS_NOT_ALLOWED', async () => {
    const combo = await createCombo();
    const chaufa = await createDish();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Con el producto vacio aun, el PATCH cambia la categoria a 'dish' y comitea.
    // El PUT continua: inserta, bloquea la fila del producto y vuelve a leer la
    // categoria — si no releyera, dejaria filas huérfanas en un 'dish'.
    let armed = true;
    auth.models.ComboItem.addHook('beforeBulkCreate', 'adv007PatchInGap', async () => {
      if (!armed) return;
      armed = false;
      const patched = await productService.updateProduct(combo.id, { category: 'dish' });
      expect(patched.category).toBe('dish');
    });
    let thrown: unknown;
    try {
      await itemService.replaceComboItems(combo.id, {
        items: [{ productId: chaufa.id, quantity: 1, portion: null, cut: null }],
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).code).toBe('COMBO_ITEMS_NOT_ALLOWED');
    // Atomicidad: nada quedo escrito en un producto que ya no es combo.
    expect(await itemRows(combo.id)).toEqual([]);
    expect((await productRow(combo.id))[0]?.category).toBe('dish');
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-007-16: un PUT que comitea dentro del hueco del PATCH lo bloquea con PRODUCT_HAS_ITEMS', async () => {
    const combo = await createCombo();
    const chaufa = await createDish();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // beforeUpdate del combo: dentro del hueco del PATCH se comitea un PUT completo.
    // El recuento posterior del PATCH debe ver la fila, revertir y devolver el error.
    let armed = true;
    auth.models.Product.addHook(
      'beforeUpdate',
      'adv007PutInsidePatch',
      async (instance: unknown, options: InstanceUpdateOptions) => {
        const id = (instance as { getDataValue: (key: string) => unknown }).getDataValue('id');
        if (!armed || options.transaction !== undefined || id !== combo.id) return;
        armed = false;
        const outcome = await itemService.replaceComboItems(combo.id, {
          items: [{ productId: chaufa.id, quantity: 1, portion: null, cut: null }],
        });
        expect(outcome).toHaveLength(1);
      },
    );
    await expect(
      productService.updateProduct(combo.id, { category: 'dish' }),
    ).rejects.toMatchObject({ name: 'AppError', code: 'PRODUCT_HAS_ITEMS', httpStatus: 409 });
    // El PATCH se revirtio: sigue combo, su precio/nombre intactos y su fila viva.
    const [row] = await productRow(combo.id);
    expect(row?.category).toBe('combo');
    expect(await itemRows(combo.id)).toEqual([
      expect.objectContaining({ product_id: chaufa.id, quantity: 1 }),
    ]);
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-007-17: un PUT que comitea dentro del hueco del PATCH del componente lo bloquea con PRODUCT_IS_COMPONENT', async () => {
    const combo = await createCombo();
    const chaufa = await createDish();
    const arroz = await createDish('Arroz con pollo');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Mismo hueco pero del lado del componente: el PATCH del componente comitea su
    // UPDATE despues de que el PUT inserto la fila — el recuento la ve y revierte.
    let armedDish = true;
    let armedCombo = true;
    auth.models.Product.addHook(
      'beforeUpdate',
      'adv007ComponentGap',
      async (instance: unknown, options: InstanceUpdateOptions) => {
        if (options.transaction !== undefined) return;
        const id = (instance as { getDataValue: (key: string) => unknown }).getDataValue('id');
        if (armedDish && id === chaufa.id) {
          armedDish = false;
          await itemService.replaceComboItems(combo.id, {
            items: [{ productId: chaufa.id, quantity: 1, portion: null, cut: null }],
          });
        }
        if (armedCombo && id === arroz.id) {
          armedCombo = false;
          // Hacia 'combo' tambien: un componente no puede volverse combo por PATCH.
          await itemService.replaceComboItems(combo.id, {
            items: [
              { productId: chaufa.id, quantity: 1, portion: null, cut: null },
              { productId: arroz.id, quantity: 1, portion: null, cut: null },
            ],
          });
        }
      },
    );
    await expect(
      productService.updateProduct(chaufa.id, { category: 'extra' }),
    ).rejects.toMatchObject({ name: 'AppError', code: 'PRODUCT_IS_COMPONENT', httpStatus: 409 });
    await expect(
      productService.updateProduct(arroz.id, { category: 'combo' }),
    ).rejects.toMatchObject({ name: 'AppError', code: 'PRODUCT_IS_COMPONENT', httpStatus: 409 });
    expect((await productRow(chaufa.id))[0]?.category).toBe('dish');
    expect((await productRow(arroz.id))[0]?.category).toBe('dish');
    expect(await itemRows(combo.id)).toHaveLength(2);
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-007-18: un PATCH del componente lanzado mientras el PUT lo bloquea espera y es rechazado tras el commit', async () => {
    const combo = await createCombo();
    const chaufa = await createDish();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // El PUT A bloquea el componente FOR NO KEY UPDATE y aun no comitea. Dentro del
    // hueco se lanza (sin esperar) el PATCH del componente: su UPDATE queda a la cola
    // del bloqueo, corre tras el commit del PUT y su recuento ve la fila nueva.
    let armed = true;
    let patchPromise: Promise<unknown> | undefined;
    auth.models.ComboItem.addHook('beforeBulkCreate', 'adv007PatchWaits', () => {
      if (!armed) return;
      armed = false;
      patchPromise = productService.updateProduct(chaufa.id, { category: 'extra' }).then(
        (result) => result,
        (error: unknown) => error,
      );
    });
    const outcome = await itemService.replaceComboItems(combo.id, {
      items: [{ productId: chaufa.id, quantity: 1, portion: null, cut: null }],
    });
    expect(outcome).toHaveLength(1);
    const patchResult = await patchPromise;
    expect(patchResult).toBeInstanceOf(AppError);
    expect((patchResult as AppError).code).toBe('PRODUCT_IS_COMPONENT');
    // Invariante: el componente sigue 'dish' y el combo conserva su fila.
    expect((await productRow(chaufa.id))[0]?.category).toBe('dish');
    expect(await itemRows(combo.id)).toEqual([
      expect.objectContaining({ product_id: chaufa.id, quantity: 1 }),
    ]);
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-007-19: un GET dentro del hueco del PUT ve el conjunto viejo completo, nunca mezclado', async () => {
    const cookie = await adminCookie();
    const combo = await createCombo();
    const chaufa = await createDish();
    const gaseosa = await createDrink();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Conjunto viejo comiteado: {chaufa}.
    await putItems(combo.id, { items: [{ productId: chaufa.id, quantity: 1 }] }, cookie);
    // Dentro del hueco (DELETE nuevo ya ejecutado pero no comiteado) un GET por HTTP
    // debe observar el conjunto viejo completo: READ COMMITTED nunca mezcla.
    let armed = true;
    let midBody: ItemsBody | undefined;
    auth.models.ComboItem.addHook('beforeBulkCreate', 'adv007GetInGap', async () => {
      if (!armed) return;
      armed = false;
      const mid = await getItems(combo.id, cookie);
      expect(mid.status).toBe(200);
      midBody = mid.body as ItemsBody;
    });
    await putItems(combo.id, { items: [{ productId: gaseosa.id, quantity: 3 }] }, cookie);
    expect(strip(midBody?.items ?? [])).toEqual([
      { productId: chaufa.id, quantity: 1, portion: null, cut: null },
    ]);
    const after = await getItems(combo.id, cookie);
    expect(strip((after.body as ItemsBody).items)).toEqual([
      { productId: gaseosa.id, quantity: 3, portion: null, cut: null },
    ]);
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-007-20: borrar el combo a mitad del PUT devuelve PRODUCT_NOT_FOUND y no deja filas huerfanas', async () => {
    const combo = await createCombo();
    const chaufa = await createDish();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // DELETE del producto dentro del hueco: la fila ya fue seleccionada por el PUT.
    // El INSERT explota con FK; el servicio lo reconvierte en PRODUCT_NOT_FOUND.
    let armed = true;
    auth.models.ComboItem.addHook('beforeBulkCreate', 'adv007DeleteMidFlight', async () => {
      if (!armed) return;
      armed = false;
      await database().query('DELETE FROM products WHERE id = $1', { bind: [combo.id] });
    });
    let thrown: unknown;
    try {
      await itemService.replaceComboItems(combo.id, {
        items: [{ productId: chaufa.id, quantity: 1, portion: null, cut: null }],
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).code).toBe('PRODUCT_NOT_FOUND');
    expect(await itemRows(combo.id)).toEqual([]);
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-007-21: PUT||PUT reales en paralelo nunca dan 500 ni un conjunto mezclado (rondas)', async () => {
    const cookie = await adminCookie();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const normalized = (list: ItemsBody['items']) => strip(list);
    // Rondas: ajenos, mismo componente con distinta parte, y doble-clic identico.
    for (let round = 0; round < 8; round += 1) {
      const combo = await createCombo(`Combo ${round}`);
      const first = await createDish(`Plato A${round}`);
      const second = await createDrink(`Bebida B${round}`);
      const pollo = await createChicken(`Pollo ${round}`);
      const [setA, setB] =
        round < 3
          ? [[{ productId: first.id, quantity: 1 }], [{ productId: second.id, quantity: 2 }]]
          : round < 6
            ? [
                [{ productId: pollo.id, quantity: 1, portion: 'quarter', cut: 'breast' }],
                [{ productId: pollo.id, quantity: 1, portion: 'quarter', cut: 'leg' }],
              ]
            : [
                [
                  { productId: first.id, quantity: 1 },
                  { productId: second.id, quantity: 1 },
                ],
                [
                  { productId: first.id, quantity: 1 },
                  { productId: second.id, quantity: 1 },
                ],
              ];
      const [responseA, responseB] = await Promise.all([
        putItems(combo.id, { items: setA }, cookie),
        putItems(combo.id, { items: setB }, cookie),
      ]);
      expect([responseA.status, responseB.status].sort(), `ronda ${round}`).toEqual([200, 200]);
      const finalSet = normalized(((await getItems(combo.id, cookie)).body as ItemsBody).items);
      /** Convierte un cuerpo de entrada en la misma forma comparable del strip. */
      const normalizeInput = (
        set: { productId: number; quantity: number; portion?: string; cut?: string }[],
      ) =>
        set
          .map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            portion: item.portion ?? null,
            cut: item.cut ?? null,
          }))
          .sort((first, second) => first.productId - second.productId);
      const sortedA = normalizeInput(setA);
      const sortedB = normalizeInput(setB);
      // El estado final debe ser exactamente el conjunto de A o el de B — jamas mezcla.
      const isA = JSON.stringify(finalSet) === JSON.stringify(sortedA);
      const isB = JSON.stringify(finalSet) === JSON.stringify(sortedB);
      expect(isA || isB, `ronda ${round}: final=${JSON.stringify(finalSet)}`).toBe(true);
    }
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-007-22: PUT||PATCH reales en paralelo conservan el invariante sin estado intermedio (rondas)', async () => {
    const cookie = await adminCookie();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Seis rondas: en cada una un PUT que mete un pollo con parte, contra un PATCH
    // que quita ese pollo de 'chicken'. Solo dos salidas legales:
    //   a) PUT 200 + PATCH 409 IS_COMPONENT (el componente sigue 'chicken'), o
    //   b) PATCH 200 + PUT 400 (el componente ya era 'dish' y no admite parte).
    // (200,200) seria el hueco TOCTOU: plato 'dish' quedando con una parte de pollo.
    for (let round = 0; round < 6; round += 1) {
      const pollo = await createChicken(`Pollo ${round}`);
      const combo = await createCombo(`Combo ${round}`);
      const [put, patch] = await Promise.all([
        putItems(
          combo.id,
          { items: [{ productId: pollo.id, quantity: 1, portion: 'quarter', cut: 'leg' }] },
          cookie,
        ),
        patchProduct(pollo.id, { category: 'dish' }, cookie),
      ]);
      const statuses = [put.status, patch.status].sort();
      expect.soft(statuses, `ronda ${round}`).not.toContain(500);
      const legal = put.status === 200 && patch.status === 409;
      const legalAlt = patch.status === 200 && put.status === 400;
      expect(legal || legalAlt, `ronda ${round}: put=${put.status} patch=${patch.status}`).toBe(
        true,
      );
      // Invariante posterior, cualquiera sea el orden que gano la carrera.
      const [row] = await productRow(pollo.id);
      const items = await itemRows(combo.id);
      const hasPortionedComponent = items.some(
        (item) => item.product_id === pollo.id && item.portion !== null,
      );
      expect(
        !(row?.category === 'dish' && hasPortionedComponent),
        `ronda ${round}: un 'dish' no puede quedar con parte de pollo`,
      ).toBe(true);
      if (legal) {
        expect(row?.category).toBe('chicken');
        expect(items).toEqual([
          expect.objectContaining({ product_id: pollo.id, portion: 'quarter', cut: 'leg' }),
        ]);
      } else {
        expect(row?.category).toBe('dish');
        expect(items).toEqual([]);
      }
    }
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-007-23: roles vivos — GET para cualquier rol autenticado, PUT solo admin (leccion ADV-004-31)', async () => {
    // El usuario admin007 se crea aqui; su cookie queda inservible tras el DELETE de
    // sesiones de mas abajo — por eso al final se vuelve a entrar.
    await adminCookie();
    const combo = await createCombo();
    const chaufa = await createDish();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const body = { items: [{ productId: chaufa.id, quantity: 1 }] };
    // Cashier y kitchen existen en role_users de la 004 pero ningun test los usaba;
    // requireRole debe seguir dejandolos fuera del PUT y dentro del GET.
    for (const [username, roles] of [
      ['mozo007.luisa', ['waiter']],
      ['caja007.rosa', ['cashier']],
      ['cocina007.pedro', ['kitchen']],
    ] as [string, UserRole[]][]) {
      const cookie = await cookieFor(username, roles, '1122');
      const denied = await putItems(combo.id, body, cookie);
      expect.soft(denied.status, username).toBe(403);
      expect.soft(denied.body, username).toEqual(FORBIDDEN_BODY);
      const allowed = await getItems(combo.id, cookie);
      expect.soft(allowed.status, username).toBe(200);
      expect.soft(allowed.body, username).toEqual({ items: [] });
    }
    // Una sesion eliminada en vivo ya no autoriza ni el GET (leccion ADV-002-07).
    const ghost = await cookieFor('mozo007.fantasma', ['waiter'], '3344');
    const ghostRead = await getItems(combo.id, ghost);
    expect(ghostRead.status).toBe(200);
    await database().query('DELETE FROM sessions');
    const ghostDenied = await getItems(combo.id, ghost);
    expect(ghostDenied.status).toBe(401);
    expect(ghostDenied.body).toEqual(UNAUTHENTICATED_BODY);
    const ghostPut = await putItems(combo.id, body, ghost);
    expect(ghostPut.status).toBe(401);
    expect(ghostPut.body).toEqual(UNAUTHENTICATED_BODY);
    // Admin multirol y PUT real con la cookie viva (el usuario admin007 sigue
    // existiendo; solo sus sesiones murieron con el DELETE de arriba, asi que se
    // vuelve a entrar para una cookie fresca).
    const boss = await cookieFor('admin007.segundo', ['admin', 'waiter'], '7788');
    const written = await putItems(combo.id, body, boss);
    expect(written.status).toBe(200);
    const freshAdmin = (await loginWithCookie(auth.app, 'admin007', ADMIN_PIN)).cookie;
    const read = await getItems(combo.id, freshAdmin);
    expect(read.status).toBe(200);
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-007-24: estados — combo inactivo, componente inactivo y PATCH de campos que no tocan la guardia', async () => {
    const cookie = await adminCookie();
    const combo = await createCombo('Combo inactivo');
    const chaufa = await createDish('Chaufa apagado');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // El combo puede estar inactivo y seguir recibiendo componentes (no prohibido).
    await productService.updateProduct(combo.id, { isActive: false });
    const offPut = await putItems(
      combo.id,
      { items: [{ productId: chaufa.id, quantity: 1 }] },
      cookie,
    );
    expect(offPut.status).toBe(200);
    // Un componente inactivo se acepta y sale con isActive:false en la lectura.
    await productService.updateProduct(chaufa.id, { isActive: false });
    const put = await putItems(
      combo.id,
      { items: [{ productId: chaufa.id, quantity: 2 }] },
      cookie,
    );
    expect(put.status).toBe(200);
    expect((put.body as ItemsBody).items[0]?.product.isActive).toBe(false);
    // PATCH de campos permitidos sobre combo y componente (nombre, precio, activo)
    // nunca disparan la guardia aunque el combo tenga filas.
    for (const patch of [
      { name: 'Combo renombrado' },
      { priceCents: 2500 },
      { isActive: true },
      { category: 'combo' },
    ]) {
      const response = await patchProduct(combo.id, patch, cookie);
      expect.soft(response.status, JSON.stringify(patch)).toBe(200);
    }
    // PATCH de categoria a la MISMA categoria del componente no dispara la guardia.
    const sameCategory = await patchProduct(chaufa.id, { category: 'dish' }, cookie);
    expect(sameCategory.status).toBe(200);
    // PATCH de nombre del componente con filas vivas: permitido y visible en el GET.
    const renamed = await patchProduct(chaufa.id, { name: 'Chaufa especial' }, cookie);
    expect(renamed.status).toBe(200);
    const read = await getItems(combo.id, cookie);
    expect((read.body as ItemsBody).items[0]?.product.name).toBe('Chaufa especial');
    expect((read.body as ItemsBody).items[0]?.product.isActive).toBe(false);
    // Reactivar el combo por PATCH: permitido aun teniendo componentes.
    const reactivated = await patchProduct(combo.id, { isActive: true }, cookie);
    expect(reactivated.status).toBe(200);
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-007-25: atomicidad de PUT y PATCH — o todo o nada, issues en orden del request', async () => {
    const cookie = await adminCookie();
    const combo = await createCombo();
    const chaufa = await createDish();
    const arroz = await createDish('Arroz chaufa');
    const pollo = await createChicken();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Estado previo conocido.
    await putItems(combo.id, { items: [{ productId: chaufa.id, quantity: 1 }] }, cookie);
    // PUT con un id inexistente en el medio: ni una fila cambio y el issue apunta
    // a items.1 (posicion del fallo), no al conjunto entero.
    const mid = await putItems(
      combo.id,
      {
        items: [
          { productId: pollo.id, quantity: 1, portion: 'quarter', cut: 'leg' },
          { productId: 999999, quantity: 1 },
          { productId: arroz.id, quantity: 1 },
        ],
      },
      cookie,
    );
    expect(mid.status).toBe(400);
    expect(errorCode(mid)).toBe('VALIDATION_ERROR');
    expect(issuesOf(mid)).toEqual([
      expect.objectContaining({ path: 'items.1.productId', message: COMPONENT_NOT_FOUND_MESSAGE }),
    ]);
    // Dos fallos a la vez salen en el orden del request (items.0 antes que items.2).
    const two = await putItems(
      combo.id,
      {
        items: [
          { productId: pollo.id, quantity: 1 },
          { productId: arroz.id, quantity: 1 },
          { productId: 888888, quantity: 1 },
        ],
      },
      cookie,
    );
    expect(two.status).toBe(400);
    expect(issuesOf(two)).toEqual([
      expect.objectContaining({
        path: 'items.0.portion',
        message: 'El pollo de un combo lleva presentaci\u00f3n (eighth, quarter, half o whole).',
      }),
      expect.objectContaining({ path: 'items.2.productId', message: COMPONENT_NOT_FOUND_MESSAGE }),
    ]);
    // Un no-pollo con presentacion Y parte bien formadas pasa el esquema (la
    // correspondencia es valida) y cae en la regla de servicio: su issue sale en
    // items.0.portion con el mensaje propio — no es un rechazo del esquema.
    const dishWithPortion = await putItems(
      combo.id,
      { items: [{ productId: chaufa.id, quantity: 1, portion: 'quarter', cut: 'leg' }] },
      cookie,
    );
    expect(dishWithPortion.status).toBe(400);
    expect(issuesOf(dishWithPortion)).toEqual([
      expect.objectContaining({
        path: 'items.0.portion',
        message: ONLY_CHICKEN_HAS_PORTION_MESSAGE,
      }),
    ]);
    // El conjunto viejo sigue intacto despues de ambos rechazos.
    const still = await getItems(combo.id, cookie);
    expect(strip((still.body as ItemsBody).items)).toEqual([
      { productId: chaufa.id, quantity: 1, portion: null, cut: null },
    ]);
    // PATCH con campos extra a la vez que la categoria: 409 y nada se aplico.
    const patch = await patchProduct(
      combo.id,
      { category: 'dish', name: 'Cambiado', priceCents: 1, isActive: false },
      cookie,
    );
    expect(patch.status).toBe(409);
    expect(patch.body).toEqual(PRODUCT_HAS_ITEMS_BODY);
    const [row] = await productRow(combo.id);
    expect(row).toEqual(
      expect.objectContaining({ category: 'combo', name: 'Mostrito', is_active: true }),
    );
    expect(row?.price_cents).not.toBe(1);
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-007-26: componente compartido entre dos combos, duo de partes, orden por carta y aislamiento', async () => {
    const cookie = await adminCookie();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // El componente C sirve a dos combos a la vez (no prohibido en la spec).
    const comboA = await createCombo('Combo norte');
    const comboB = await createCombo('Combo sur');
    const chaufa = await createDish('Chaufa compartido');
    await putItems(comboA.id, { items: [{ productId: chaufa.id, quantity: 1 }] }, cookie);
    await putItems(comboB.id, { items: [{ productId: chaufa.id, quantity: 2 }] }, cookie);
    // Sacarlo de 'dish' choca con cualquiera de los dos combos.
    const denied = await patchProduct(chaufa.id, { category: 'extra' }, cookie);
    expect(denied.status).toBe(409);
    expect(denied.body).toEqual(PRODUCT_IS_COMPONENT_BODY);
    // Sigue chocando hasta que el ULTIMO combo lo suelta.
    await putItems(comboA.id, { items: [] }, cookie);
    const still = await patchProduct(chaufa.id, { category: 'extra' }, cookie);
    expect(still.status).toBe(409);
    await putItems(comboB.id, { items: [] }, cookie);
    const free = await patchProduct(chaufa.id, { category: 'extra' }, cookie);
    expect(free.status).toBe(200);
    // Duo: el mismo pollo como pierna Y como pecho del mismo combo (clave distinta).
    const comboDuo = await createCombo('Duo brasa');
    const pollo = await createChicken('Pollo del duo');
    const duo = await putItems(
      comboDuo.id,
      {
        items: [
          { productId: pollo.id, quantity: 1, portion: 'quarter', cut: 'breast' },
          { productId: pollo.id, quantity: 2, portion: 'quarter', cut: 'leg' },
        ],
      },
      cookie,
    );
    expect(duo.status).toBe(200);
    expect((duo.body as ItemsBody).items).toHaveLength(2);
    // Orden del GET (AC-08/AC-10): categoria por el orden de la carta y dentro el
    // collator 'es' — un 'Á' con tilde ordena como 'a' y la caja no importa.
    const comboOrder = await createCombo('Combo ordenado');
    const zeta = await createDish('Zapallo chaufa');
    const agata = await createDish('\u00c1gata saltada');
    const yuca = await createDish('Yuca frita');
    const inca = await createDrink('Inca Kola');
    const picarones = await productService.createProduct({
      name: 'Picarones',
      category: 'dessert',
      priceCents: 800,
    });
    const crema = await productService.createProduct({
      name: 'Crema de rocoto',
      category: 'sauce',
      priceCents: 300,
    });
    const bolsa = await productService.createProduct({
      name: 'Bolsa para llevar',
      category: 'extra',
      priceCents: 100,
    });
    // Se envia en orden revuelto: la respuesta debe salir ordenada por carta.
    const ordered = await putItems(
      comboOrder.id,
      {
        items: [
          { productId: bolsa.id, quantity: 1 },
          { productId: zeta.id, quantity: 1 },
          { productId: picarones.id, quantity: 1 },
          { productId: pollo.id, quantity: 1, portion: 'quarter', cut: 'leg' },
          { productId: yuca.id, quantity: 1 },
          { productId: crema.id, quantity: 1 },
          { productId: inca.id, quantity: 1 },
          { productId: agata.id, quantity: 1 },
        ],
      },
      cookie,
    );
    expect(ordered.status).toBe(200);
    const names = (ordered.body as ItemsBody).items.map((item) => item.product.name);
    // chicken -> dish (Ágata, Yuca, Zapallo por 'es') -> drink -> dessert -> sauce -> extra.
    expect(names).toEqual([
      'Pollo del duo',
      '\u00c1gata saltada',
      'Yuca frita',
      'Zapallo chaufa',
      'Inca Kola',
      'Picarones',
      'Crema de rocoto',
      'Bolsa para llevar',
    ]);
    // listProducts coloca 'combo' justo despues de 'chicken' en la carta.
    const list = await request(auth.app).get('/api/products').set('Cookie', cookie);
    expect(list.status).toBe(200);
    const categories = (list.body as { products: { category: string }[] }).products.map(
      (product) => product.category,
    );
    const firstCombo = categories.indexOf('combo');
    expect(firstCombo).toBeGreaterThan(-1);
    expect(categories.slice(0, firstCombo).every((category) => category === 'chicken')).toBe(true);
    // Aislamiento: los componentes de un combo no sangran al otro.
    const readA = await getItems(comboA.id, cookie);
    const readDuo = await getItems(comboDuo.id, cookie);
    expect((readA.body as ItemsBody).items).toEqual([]);
    expect((readDuo.body as ItemsBody).items.map((item) => item.product.id)).toEqual([
      pollo.id,
      pollo.id,
    ]);
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-007-27: la base sostiene las invariantes — CHECK CASE, FK, NULLS NOT DISTINCT y el arbitro de ON CONFLICT', async () => {
    await assertAuthorizedConnection(database());
    const combo = await createCombo('Combo SQL');
    const pollo = await createChicken('Pollo SQL');
    const chaufa = await createDish('Chaufa SQL');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    /** Devuelve el mensaje de error si la sentencia fue rechazada, o null si paso. */
    const rejection = async (sql: string, bind?: (string | number | null)[]) => {
      try {
        await database().query(sql, { bind });
        return null;
      } catch (error) {
        return String(error);
      }
    };
    // El CHECK usa un CASE que no se anula con NULL (leccion de la correccion 006):
    // todas las combinaciones con NULL quedan atrapadas por combo_items_portion_cut.
    for (const [portion, cut] of [
      [null, 'leg'],
      ['quarter', null],
      ['half', 'breast'],
      ['whole', 'leg'],
      ['eighth', null],
    ] as [string | null, string | null][]) {
      const message = await rejection(
        'INSERT INTO combo_items (combo_id, product_id, quantity, portion, cut) ' +
          'VALUES ($1, $2, 1, $3, $4)',
        [combo.id, pollo.id, portion, cut],
      );
      expect.soft(message, `(${portion},${cut})`).not.toBeNull();
      expect.soft(message, `(${portion},${cut})`).toContain('combo_items_portion_cut');
    }
    // Y las validas pasan.
    await insertItemSql(combo.id, pollo.id, 1, 'quarter', 'leg');
    await insertItemSql(combo.id, chaufa.id, 2, null, null);
    // UPDATEs hostiles sobre filas vivas.
    const badUpdates = [
      "UPDATE combo_items SET cut = NULL WHERE portion = 'quarter'",
      'UPDATE combo_items SET portion = NULL WHERE cut IS NOT NULL',
      'UPDATE combo_items SET quantity = 0',
      'UPDATE combo_items SET quantity = 100',
      "UPDATE combo_items SET cut = 'wing' WHERE id IS NOT NULL",
      "UPDATE combo_items SET portion = 'octavo' WHERE id IS NOT NULL",
    ];
    for (const sql of badUpdates) {
      const message = await rejection(sql);
      expect.soft(message, sql).not.toBeNull();
    }
    // Las filas quedaron intactas tras la bateria de UPDATEs rechazados.
    expect(await itemRows(combo.id)).toHaveLength(2);
    // FK en ambas direcciones.
    expect(
      await rejection(
        'INSERT INTO combo_items (combo_id, product_id, quantity) VALUES (999999, $1, 1)',
        [chaufa.id],
      ),
    ).toContain('combo_items_combo_id_fkey');
    expect(
      await rejection(
        'INSERT INTO combo_items (combo_id, product_id, quantity) VALUES ($1, 999999, 1)',
        [combo.id],
      ),
    ).toContain('combo_items_product_id_fkey');
    // Borrar un producto que es combo con filas, o que es componente, revienta por FK.
    expect(await rejection('DELETE FROM products WHERE id = $1', [combo.id])).toContain(
      'combo_items_combo_id_fkey',
    );
    expect(await rejection('DELETE FROM products WHERE id = $1', [chaufa.id])).toContain(
      'combo_items_product_id_fkey',
    );
    // NULLS NOT DISTINCT real: la segunda fila con las mismas claves NULL choca.
    const other = await createDish('Tallarin SQL');
    await insertItemSql(combo.id, other.id, 1, null, null);
    // Locale-robusto: en un Postgres en ingles Sequelize envuelve la violacion de
    // unicidad como 'SequelizeUniqueConstraintError: Validation error' y el nombre
    // del indice no llega al mensaje; el driver pg siempre lo expone en
    // error.parent.constraint. Se acepta cualquiera de las dos senales.
    let dupNull: unknown = null;
    try {
      await database().query(
        'INSERT INTO combo_items (combo_id, product_id, quantity, portion, cut) ' +
          'VALUES ($1, $2, 9, NULL, NULL)',
        { bind: [combo.id, other.id] },
      );
    } catch (error) {
      dupNull = error;
    }
    expect(dupNull).not.toBeNull();
    const dupSignal =
      (dupNull as { parent?: { constraint?: string } }).parent?.constraint ?? String(dupNull);
    expect(dupSignal).toContain('combo_items_unique');
    // El arbitro de ON CONFLICT resuelve con la clave NULLS NOT DISTINCT (lo que el
    // updateOnDuplicate del servicio necesita para no reventar en el doble-clic).
    await database().query(
      'INSERT INTO combo_items (combo_id, product_id, quantity, portion, cut) ' +
        'VALUES ($1, $2, 5, NULL, NULL) ' +
        'ON CONFLICT (combo_id, product_id, portion, cut) ' +
        'DO UPDATE SET quantity = EXCLUDED.quantity',
      { bind: [combo.id, other.id] },
    );
    const [merged] = await rows<{ quantity: number }>(
      'SELECT quantity FROM combo_items WHERE combo_id = $1 AND product_id = $2',
      [combo.id, other.id],
    );
    expect(merged?.quantity).toBe(5);
    // Dos filas del mismo pollo con parte distinta no chocan (la clave incluye cut).
    await insertItemSql(combo.id, pollo.id, 1, 'quarter', 'breast');
    expect(await itemRows(combo.id)).toHaveLength(4);
    // Frontera documentada: SQL puede dejar combo_items colgando de un 'dish'; la API
    // los sirve igual y el PATCH a la misma categoria SI choca con la guardia.
    const cookie = await adminCookie();
    const dish = await createDish('Plato inyectado');
    const limon = await createDish('Limonada congelada');
    await insertItemSql(dish.id, limon.id, 1, null, null);
    const ghostGet = await getItems(dish.id, cookie);
    expect(ghostGet.status).toBe(200);
    expect((ghostGet.body as ItemsBody).items).toHaveLength(1);
    // Observacion de frontera: PATCH {category:'dish'} sobre un 'dish' con filas
    // inyectadas choca con PRODUCT_HAS_ITEMS porque el guard calcula "salir de
    // combo" como categoria !== 'combo', no como "categoria cambio".
    const ghostPatch = await patchProduct(dish.id, { category: 'dish' }, cookie);
    expect(ghostPatch.status).toBe(409);
    expect(ghostPatch.body).toEqual(PRODUCT_HAS_ITEMS_BODY);
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-007-28: ids hostiles por el servicio — el esquema de la ruta los frena; crudos documentan el mismo hueco que ADV-006-26', async () => {
    const combo = await createCombo();
    const chaufa = await createDish();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // La frontera validada por Zod nunca llega con estos ids; si se inyectan al
    // servicio, los enteros inexistentes responden el 404 de dominio.
    for (const bad of [1.5, -1, 2147483648, Number.MAX_SAFE_INTEGER]) {
      await expect(itemService.listComboItems(bad)).rejects.toMatchObject({
        name: 'AppError',
        code: 'PRODUCT_NOT_FOUND',
      });
      await expect(
        itemService.replaceComboItems(bad, { items: [{ productId: chaufa.id, quantity: 1 }] }),
      ).rejects.toMatchObject({ name: 'AppError', code: 'PRODUCT_NOT_FOUND' });
    }
    // Observacion (paridad con ADV-006-26, documentado Bajo): NaN/Infinity llegan
    // crudos al SQL y revientan con error de Sequelize en vez del 404 de dominio.
    // Es deuda conocida de la 006 — la ruta lo impide siempre.
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      let thrown: unknown;
      try {
        await itemService.listComboItems(bad);
      } catch (error) {
        thrown = error;
      }
      expect.soft(thrown).toBeDefined();
      expect.soft((thrown as { name?: string }).name).not.toBe('AppError');
    }
    // Una cadena de digitos pasa por el bind: coherce al id (misma puerta que la ruta).
    const coerced = await itemService.listComboItems(Number(String(combo.id)));
    expect(coerced).toEqual([]);
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-007-29: contrato de salida — 6 claves por item, 5 por producto embebido, sin campos internos ni fugas en errores', async () => {
    const cookie = await adminCookie();
    const combo = await createCombo('Combo claves');
    const pollo = await createChicken('Pollo claves');
    const chaufa = await createDish('Chaufa claves');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await putItems(
      combo.id,
      {
        items: [
          { productId: pollo.id, quantity: 1, portion: 'quarter', cut: 'leg' },
          { productId: chaufa.id, quantity: 2 },
        ],
      },
      cookie,
    );
    const read = await getItems(combo.id, cookie);
    expect(read.status).toBe(200);
    // D-007-09: exactamente las seis claves del contrato y las cinco del producto.
    for (const item of (read.body as ItemsBody).items) {
      expect(Object.keys(item).sort()).toEqual(
        ['comboId', 'cut', 'id', 'portion', 'product', 'quantity'].sort(),
      );
      expect(Object.keys(item.product).sort()).toEqual(
        ['category', 'id', 'isActive', 'name', 'priceCents'].sort(),
      );
      expect(item.comboId).toBe(combo.id);
    }
    // El cuerpo completo no fuga columnas ni datos internos.
    expect(JSON.stringify(read.body)).not.toMatch(
      /combo_id|product_id|created_at|updated_at|createdAt|updatedAt|pinHash|tokenHash|password/i,
    );
    // Los errores de la bateria tampoco muestran nada interno.
    for (const response of [
      await getItems('abc', cookie),
      await getItems(999999, cookie),
      await putItems(combo.id, { items: 'x' }, cookie),
      await putItems(combo.id, { items: [{ productId: 999999, quantity: 1 }] }, cookie),
      await putItems(combo.id, { items: [{ productId: combo.id, quantity: 1 }] }, cookie),
      await patchProduct(combo.id, { category: 'dish' }, cookie),
    ]) {
      expect
        .soft(JSON.stringify(response.body))
        .not.toMatch(
          /combo_id|product_id|created_at|updated_at|SELECT |INSERT |polleria_dev|sequelize|password|pinHash|tokenHash|stack|at Object/i,
        );
    }
    // Los ids de productos de OTROS tests no se filtran en los issues: solo paths.
    const foreign = await putItems(
      combo.id,
      {
        items: [
          { productId: 999999, quantity: 1 },
          { productId: pollo.id, quantity: 1 },
        ],
      },
      cookie,
    );
    expect(foreign.status).toBe(400);
    for (const issue of issuesOf(foreign)) {
      expect(issue.path).toMatch(/^items\.\d+\./);
    }
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-007-30: precedencia — el cuerpo se valida antes de la categoria, y las rutas vecinas no se contaminan', async () => {
    const cookie = await adminCookie();
    const combo = await createCombo();
    const pollo = await createChicken();
    const chaufa = await createDish();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // PUT {items:[]} sobre un 'dish': el cuerpo es valido pero la categoria no es
    // combo -> 409 (no 200 vacio).
    const emptyOnDish = await putItems(chaufa.id, { items: [] }, cookie);
    expect(emptyOnDish.status).toBe(409);
    expect(emptyOnDish.body).toEqual(COMBO_ITEMS_NOT_ALLOWED_BODY);
    // Cuerpo invalido sobre un 'dish': el esquema se evalua primero -> 400, no 409.
    const badOnDish = await putItems(chaufa.id, { items: 'x' }, cookie);
    expect(badOnDish.status).toBe(400);
    expect(errorCode(badOnDish)).toBe('VALIDATION_ERROR');
    // GET /items sobre un pollo CON presentaciones cargadas: tablas distintas, la
    // respuesta es {items:[]} y no las porciones — 200, no 409.
    await request(auth.app)
      .put(`/api/products/${pollo.id}/portions`)
      .set('Cookie', cookie)
      .send({ portions: [{ portion: 'quarter', cut: 'leg', priceCents: 700 }] });
    const chickenItems = await getItems(pollo.id, cookie);
    expect(chickenItems.status).toBe(200);
    expect(chickenItems.body).toEqual({ items: [] });
    // Y el PUT /portions sobre el combo no se contamina con la guardia de items:
    // un combo no es 'chicken', asi que responde PORTIONS_NOT_ALLOWED — no 500 ni
    // un error confundido de combo_items.
    const comboPortions = await request(auth.app)
      .put(`/api/products/${combo.id}/portions`)
      .set('Cookie', cookie)
      .send({ portions: [{ portion: 'quarter', cut: 'leg', priceCents: 700 }] });
    expect(comboPortions.status).toBe(409);
    expect(errorCode(comboPortions)).toBe('PORTIONS_NOT_ALLOWED');
    // 401 sin sesion en GET y en PUT (antes de cualquier guardia de dominio).
    expect((await getItems(combo.id)).status).toBe(401);
    expect((await putItems(combo.id, { items: [] })).status).toBe(401);
    // 404 de dominio sobre id valido inexistente, con el cuerpo exacto.
    const gone = await putItems('999999', { items: [] }, cookie);
    expect(gone.status).toBe(404);
    expect(gone.body).toEqual(PRODUCT_NOT_FOUND_BODY);
    // Auto-referencia y combo-anidado: un 'combo' nunca es componente (RN-007-04) —
    // el mismo combo de la ruta vale como ejemplo porque ya es 'combo'.
    const otro = await createCombo('Otro combo');
    for (const productId of [combo.id, otro.id]) {
      const nested = await putItems(combo.id, { items: [{ productId, quantity: 1 }] }, cookie);
      expect.soft(nested.status, `productId=${productId}`).toBe(400);
      expect.soft(errorCode(nested), `productId=${productId}`).toBe('VALIDATION_ERROR');
      expect
        .soft(issuesOf(nested)[0]?.message, `productId=${productId}`)
        .toBe('Un combo no puede ser componente de otro combo.');
    }
    // Y el conjunto quedo vacio tras los rechazos.
    expect((await getItems(combo.id, cookie)).body).toEqual({ items: [] });
    expect(log).not.toHaveBeenCalled();
  });
});
