import request from 'supertest';
import { QueryTypes } from 'sequelize';
import type { Sequelize, InstanceUpdateOptions } from 'sequelize';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserRole } from '@polleria/shared';
import { assertTestDatabase } from '../../src/db/assert-test-database.ts';
import { getPostgresConnectionParts } from '../../src/db/postgres-url.ts';
import { AppError } from '../../src/errors/app-error.ts';
import { createProductService } from '../../src/services/products/product.service.ts';
import { createProductPortionService } from '../../src/services/products/product-portion.service.ts';
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
const INVALID_URL_BODY = {
  error: {
    code: 'VALIDATION_ERROR',
    message: 'La direcci\u00F3n no es v\u00E1lida.',
    details: null,
  },
};
const PRODUCT_ID_MESSAGE = 'El identificador del producto no es v\u00E1lido.';
const ADMIN_PIN = '975310';

const TRIO_INPUT = [
  { portion: 'quarter', cut: 'breast', priceCents: 1850 },
  { portion: 'quarter', cut: 'leg', priceCents: 1700 },
  { portion: 'half', priceCents: 3200 },
];
const TRIO_ORDERED = [
  { portion: 'quarter', cut: 'breast', priceCents: 1850 },
  { portion: 'quarter', cut: 'leg', priceCents: 1700 },
  { portion: 'half', cut: null, priceCents: 3200 },
];
const SIX_ORDERED = [
  { portion: 'eighth', cut: 'breast', priceCents: 700 },
  { portion: 'eighth', cut: 'leg', priceCents: 650 },
  { portion: 'quarter', cut: 'breast', priceCents: 1850 },
  { portion: 'quarter', cut: 'leg', priceCents: 1700 },
  { portion: 'half', cut: null, priceCents: 3200 },
  { portion: 'whole', cut: null, priceCents: 6000 },
];

/** De una lista de presentaciones queda solo el triple comparable (los id pueden cambiar). */
const strip = (list: { portion: string; cut: string | null; priceCents: number }[]) =>
  list.map(({ portion, cut, priceCents }) => ({ portion, cut, priceCents }));

/** Los issues de un VALIDATION_ERROR (el body de supertest es any). */
const issuesOf = (response: { body: unknown }) =>
  (response.body as { error: { details: { issues: { path: string; message: string }[] } } }).error
    .details.issues;

/**
 * Guardia estricta de la conexión de pruebas (idéntica a la de la 005): la URL debe
 * ser exactamente polleria_test en localhost como usuario polleria, sin parámetros
 * extra, antes de permitir cualquier SQL directo de las pruebas. product_portions
 * está autorizada a limpieza (D-006-10) igual que products, users y sessions.
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
    throw new Error('La conexi\u00F3n no cumple la autorizaci\u00F3n local exclusiva para polleria_test.');
}

async function assertAuthorizedConnection(sequelize: Sequelize): Promise<void> {
  assertAuthorizedUrl();
  if ((await assertConnectedToTestDatabase(sequelize)) !== 'polleria_test') {
    throw new Error('La base conectada no es exactamente polleria_test; preparaci\u00F3n cancelada.');
  }
}

/**
 * Ataques a las presentaciones (spec 006) que las pruebas de AC no cubren: productId
 * hostiles en las rutas nuevas, escapes % malformados (lección ADV-005-30), no-store en
 * cada error incluidas mayúsculas (lección ADV-004-25), cuerpos hostiles, carreras
 * PUT||PUT y PUT||PATCH sobre la guardia de categoría (TOCTOU), el borrado del
 * producto a mitad de vuelo (lección ADV-005-25), roles leídos en vivo y garantías de
 * la base frente a SQL directo.
 */
describe('006-adversarial: API, servicio y concurrencia de presentaciones sobre polleria_test', () => {
  let sequelize: Sequelize | undefined;
  let auth: ReturnType<typeof setupAuth>;
  let productService: ReturnType<typeof createProductService>;
  let portionService: ReturnType<typeof createProductPortionService>;
  let prepared = false;

  function database(): Sequelize {
    if (!sequelize) throw new Error('No hay conexi\u00F3n de pruebas autorizada.');
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
    portionService = createProductPortionService({ models: auth.models });
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
  const portionRows = (productId: number) =>
    rows<{ id: number; portion: string; cut: string | null; price_cents: number }>(
      'SELECT id, portion, cut, price_cents FROM product_portions WHERE product_id = $1 ORDER BY id',
      [productId],
    );
  const insertPortionSql = (
    productId: number,
    portion: string,
    cut: string | null,
    priceCents: number,
  ) =>
    database().query(
      'INSERT INTO product_portions (product_id, portion, cut, price_cents) ' +
        'VALUES ($1, $2, $3, $4)',
      { bind: [productId, portion, cut, priceCents] },
    );

  /** Crea al administrador y devuelve la cookie de su sesión real. El username es
   *  único del archivo ('admin006'): otros archivos de integración también crean
   *  'dueno' y las ventanas de la suite compartida no deben chocar por el UNIQUE. */
  async function adminCookie() {
    await auth.createUser('admin006', 'Don Carlos', ['admin'], ADMIN_PIN);
    return (await loginWithCookie(auth.app, 'admin006', ADMIN_PIN)).cookie;
  }
  /** Crea una usuaria con esos roles y devuelve la cookie de su sesión real. */
  async function cookieFor(username: string, roles: UserRole[], pin: string) {
    await auth.createUser(username, 'Persona', roles, pin);
    return (await loginWithCookie(auth.app, username, pin)).cookie;
  }
  /** Un producto de pollo por el servicio (sale con id propio). */
  const createChicken = (name = 'Pollo a la brasa') =>
    productService.createProduct({ name, category: 'chicken', priceCents: 1850 });

  const getPortions = (id: number | string, cookie?: string) => {
    const call = request(auth.app).get(`/api/products/${id}/portions`);
    return cookie === undefined ? call : call.set('Cookie', cookie);
  };
  const putPortions = (id: number | string, body: unknown, cookie?: string) => {
    const call = request(auth.app)
      .put(`/api/products/${id}/portions`)
      .send(body as object);
    return cookie === undefined ? call : call.set('Cookie', cookie);
  };
  const patchProduct = (id: number | string, body: unknown, cookie?: string) => {
    const call = request(auth.app)
      .patch(`/api/products/${id}`)
      .send(body as object);
    return cookie === undefined ? call : call.set('Cookie', cookie);
  };

  it('ADV-006-10: productId hostiles en GET y PUT /portions responden 400 con issue en productId', async () => {
    const cookie = await adminCookie();
    const pollo = await createChicken();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // '03' vale 3 igual que en la 005: con ceros a la izquierda se llega al producto.
    const padded = await getPortions('0'.repeat(3) + String(pollo.id), cookie);
    expect(padded.status).toBe(200);
    expect(padded.body).toEqual({ portions: [] });
    // La frontera del INTEGER: 2147483647 es un id válido que no existe (404).
    const boundary = await putPortions('2147483647', { portions: TRIO_INPUT }, cookie);
    expect(boundary.status).toBe(404);
    expect(boundary.body).toEqual(PRODUCT_NOT_FOUND_BODY);
    // Todo lo demás es 400 con el issue en productId, en GET y en PUT por igual.
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
      const get = await getPortions(encoded, cookie);
      expect.soft(get.status, `GET ${id}`).toBe(400);
      expect.soft(get.headers['cache-control'], `GET ${id}`).toBe('no-store');
      expect.soft(issuesOf(get)[0]?.path, `GET ${id}`).toBe('productId');
      const put = await putPortions(encoded, { portions: TRIO_INPUT }, cookie);
      expect.soft(put.status, `PUT ${id}`).toBe(400);
      expect.soft(put.headers['cache-control'], `PUT ${id}`).toBe('no-store');
      expect.soft(issuesOf(put)[0]?.path, `PUT ${id}`).toBe('productId');
    }
    // Formas codificadas en la ruta: %00 (NUL), %2F (barra), espacios codificados.
    for (const id of ['5%20', '%205', '5%00x', '1%2F2', '5;']) {
      const get = await getPortions(id, cookie);
      expect.soft(get.status, `GET raw ${id}`).toBe(400);
      expect.soft(get.headers['cache-control'], `GET raw ${id}`).toBe('no-store');
    }
    // Nada quedó escrito tras la batería.
    expect(await portionRows(pollo.id)).toEqual([]);
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-006-11: un escape % malformado en las rutas nuevas responde 400 sin ruido (lección ADV-005-30)', async () => {
    const cookie = await adminCookie();
    const pollo = await createChicken();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // path-to-regexp lanza URIError al decodificar '%' o un escape UTF-8 incompleto en
    // :productId; el errorHandler lo traduce a 400 VALIDATION_ERROR desde la 005.
    for (const id of ['%', '%E0%A4%A', 'abc%', '%%', '1%2']) {
      const get = await request(auth.app)
        .get(`/api/products/${id}/portions`)
        .set('Cookie', cookie);
      expect.soft(get.status, `GET ${id}`).toBe(400);
      expect.soft(get.body, `GET ${id}`).toEqual(INVALID_URL_BODY);
      expect.soft(get.headers['cache-control'], `GET ${id}`).toBe('no-store');
      const put = await request(auth.app)
        .put(`/api/products/${id}/portions`)
        .set('Cookie', cookie)
        .send({ portions: TRIO_INPUT });
      expect.soft(put.status, `PUT ${id}`).toBe(400);
      expect.soft(put.body, `PUT ${id}`).toEqual(INVALID_URL_BODY);
      expect.soft(put.headers['cache-control'], `PUT ${id}`).toBe('no-store');
    }
    expect(await portionRows(pollo.id)).toEqual([]);
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-006-12: todas las respuestas de las rutas nuevas llevan no-store, incluidas mayúsculas y alias', async () => {
    const cookie = await adminCookie();
    const mozo = await cookieFor('mozo006.juan', ['waiter'], '2468');
    const pollo = await createChicken();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Express enruta sin distinguir mayúsculas y el prefijo se compara en minúsculas
    // (lección ADV-004-25): /API/PRODUCTS/N/PORTIONS queda cubierto igual.
    for (const response of [
      await request(auth.app).get(`/api/PRODUCTS/${pollo.id}/PORTIONS`).set('Cookie', mozo),
      await request(auth.app)
        .put(`/Api/Products/${pollo.id}/Portions`)
        .set('Cookie', mozo)
        .send({ portions: TRIO_INPUT }),
      // Errores de auth y de método también llevan la cabecera.
      await getPortions(pollo.id),
      await putPortions(pollo.id, { portions: TRIO_INPUT }, mozo),
      await request(auth.app).post(`/api/products/${pollo.id}/portions`).set('Cookie', cookie).send({}),
      await request(auth.app).delete(`/api/products/${pollo.id}/portions`).set('Cookie', cookie),
      await getPortions('abc', cookie),
      await getPortions(999999, cookie),
      await request(auth.app).get(`/api/products/${pollo.id}/portions/2`).set('Cookie', cookie),
    ]) {
      expect.soft(response.headers['cache-control'], String(response.status)).toBe('no-store');
      // Ningún 4xx/5xx fuga datos internos.
      expect
        .soft(JSON.stringify(response.body))
        .not.toMatch(/polleria_dev|sequelize|SELECT |password|pinHash|tokenHash/i);
    }
    // OPTIONS auto de Express 5 sobre la ruta declara solo GET/HEAD y PUT (HEAD viene
    // gratis con GET; OPTIONS no exige sesión, es preflight de navegador).
    const options = await request(auth.app).options(`/api/products/${pollo.id}/portions`);
    expect(options.status).toBe(200);
    expect(options.headers['allow']).toBe('GET, HEAD, PUT');
    expect(options.headers['cache-control']).toBe('no-store');
    // HEAD existe porque GET existe: 200 sin cuerpo.
    const head = await request(auth.app)
      .head(`/api/products/${pollo.id}/portions`)
      .set('Cookie', mozo);
    expect(head.status).toBe(200);
    expect(head.text ?? '').toBe('');
    // Barra final y subruta inexistente.
    const trailing = await request(auth.app)
      .get(`/api/products/${pollo.id}/portions/`)
      .set('Cookie', cookie);
    expect(trailing.status).toBe(200);
    const subroute = await request(auth.app)
      .get(`/api/products/${pollo.id}/portions/extra`)
      .set('Cookie', cookie);
    expect(subroute.status).toBe(404);
    expect(subroute.body).toEqual(NOT_FOUND_BODY);
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-006-13: cuerpos hostiles del PUT se rechazan sin tocar el conjunto ni el prototipo', async () => {
    const cookie = await adminCookie();
    const pollo = await createChicken();
    await insertPortionSql(pollo.id, 'quarter', 'breast', 1850);
    await insertPortionSql(pollo.id, 'quarter', 'leg', 1700);
    const before = await portionRows(pollo.id);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const expect400 = async (
      raw: string | object,
      label: string,
      expectedCode = 'VALIDATION_ERROR',
    ) => {
      const call = request(auth.app)
        .put(`/api/products/${pollo.id}/portions`)
        .set('Cookie', cookie)
        .set('Content-Type', 'application/json');
      const response =
        typeof raw === 'string' ? await call.send(raw) : await call.send(raw as object);
      expect.soft(response.status, label).toBe(400);
      expect.soft(response.body.error?.code, label).toBe(expectedCode);
      expect.soft(response.headers['cache-control'], label).toBe('no-store');
    };
    // Repetidas con el orden de claves cambiado y con cut null vs ausente (la base
    // NULLS NOT DISTINCT las trataría igual; Zod las detecta antes).
    await expect400(
      JSON.stringify({
        portions: [
          { portion: 'quarter', cut: 'breast', priceCents: 1850 },
          { priceCents: 1900, cut: 'breast', portion: 'quarter' },
        ],
      }),
      'duplicado con claves reordenadas',
    );
    await expect400(
      JSON.stringify({
        portions: [
          { portion: 'half', priceCents: 3200 },
          { portion: 'half', cut: null, priceCents: 3400 },
        ],
      }),
      'half + half cut:null',
    );
    // Elementos hostiles y claves de prototipo en la fila y en la raíz. Ojo: para que
    // '__proto__' llegue como clave al servidor hay que escribirla en el JSON literal
    // (en un literal de objeto JS muta el prototipo y JSON.stringify la pierde).
    await expect400(JSON.stringify({ portions: [null] }), 'elemento null');
    await expect400(JSON.stringify({ portions: [[]] }), 'elemento array vacío');
    await expect400(JSON.stringify({ portions: ['quarter'] }), 'elemento texto');
    await expect400(
      '{"portions":[{"portion":"quarter","cut":"breast","priceCents":1850,"__proto__":{"x":1}}]}',
      '__proto__ en fila',
    );
    await expect400('{"portions":[],"__proto__":{"injected":true}}', '__proto__ en raíz');
    await expect400(
      JSON.stringify({ portions: [], constructor: { name: 'x' } }),
      'constructor en raíz',
    );
    await expect400(
      JSON.stringify({
        portions: [{ portion: 'quarter', cut: 'breast', priceCents: 1850, productId: 9 }],
      }),
      'productId ajeno en fila',
    );
    // Formas inválidas de cada campo.
    await expect400({ portions: {} }, 'portions objeto');
    await expect400({ portions: 'x' }, 'portions texto');
    await expect400({ portions: null }, 'portions null');
    await expect400([{ portion: 'quarter', cut: 'breast', priceCents: 1850 }], 'raíz array');
    // express.json estricto solo acepta objeto o arreglo en la raíz: un texto, null o
    // un número sueltos ni siquiera llegan al esquema — INVALID_JSON del lector.
    await expect400('un texto', 'raíz texto', 'INVALID_JSON');
    await expect400('null', 'raíz null', 'INVALID_JSON');
    await expect400('42', 'raíz número', 'INVALID_JSON');
    await expect400({ portions: TRIO_INPUT, extra: 1 }, 'clave de más en raíz');
    await expect400(
      { portions: [{ portion: 'Quarter', cut: 'breast', priceCents: 1850 }] },
      'portion capitalizada',
    );
    await expect400(
      { portions: [{ portion: 'quarter', cut: 'breast ', priceCents: 1850 }] },
      'cut con espacio',
    );
    await expect400(
      { portions: [{ portion: 'quarter', cut: 'breast', priceCents: 1850, id: 4 }] },
      'id de más en fila',
    );
    // 7 filas (el tope es 6) aunque todas tengan forma válida.
    await expect400({ portions: [...TRIO_INPUT, ...TRIO_INPUT, TRIO_INPUT[0]] }, '7 filas');
    // NUL dentro de una cadena: JSON lo admite, el enum no.
    await expect400(
      JSON.stringify({ portions: [{ portion: 'quar\u0000ter', cut: 'breast', priceCents: 1 }] }),
      'NUL en portion',
    );
    // JSON truncado: el lector responde INVALID_JSON, no VALIDATION_ERROR.
    const truncated = await sendRawBody(
      request(auth.app)
        .put(`/api/products/${pollo.id}/portions`)
        .set('Cookie', cookie)
        .set('Content-Type', 'application/json'),
      Buffer.from('{"portions":[{"portion":"quarter",'),
    );
    expect(truncated.status).toBe(400);
    expect(truncated.body.error?.code).toBe('INVALID_JSON');
    expect(truncated.headers['cache-control']).toBe('no-store');
    // JSON con la clave repetida: gana la última (documentado en ADV-005-27).
    const dupKey = await sendRawBody(
      request(auth.app)
        .put(`/api/products/${pollo.id}/portions`)
        .set('Cookie', cookie)
        .set('Content-Type', 'application/json'),
      Buffer.from('{"portions":[{"portion":"whole","priceCents":6000}],"portions":[]}'),
    );
    expect(dupKey.status).toBe(200);
    expect(dupKey.body).toEqual({ portions: [] });
    // Reponemos para verificar el resto de la batería contra un conjunto conocido.
    await putPortions(pollo.id, { portions: TRIO_INPUT }, cookie);
    // Content-Type que no es JSON: el cuerpo no se lee y el esquema recibe {}.
    const notJson = await request(auth.app)
      .put(`/api/products/${pollo.id}/portions`)
      .set('Cookie', cookie)
      .set('Content-Type', 'text/plain')
      .send('{"portions":[{"portion":"whole","priceCents":6000}]}');
    expect(notJson.status).toBe(400);
    // El conjunto vigente queda como el PUT válido del medio (todo o nada).
    expect(strip((await getPortions(pollo.id, cookie)).body.portions)).toEqual(TRIO_ORDERED);
    expect(Reflect.has({}, 'injected')).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-006-14: priceCents en la frontera exacta por HTTP y priceCents -0 guarda 0', async () => {
    const cookie = await adminCookie();
    const pollo = await createChicken();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Frontera válida: 0 (promoción gratis) y 99999 (S/ 999.99).
    const edgeOk = await putPortions(
      pollo.id,
      { portions: [{ portion: 'whole', priceCents: 0 }] },
      cookie,
    );
    expect(edgeOk.status).toBe(200);
    expect(edgeOk.body.portions[0].priceCents).toBe(0);
    const maxOk = await putPortions(
      pollo.id,
      { portions: [{ portion: 'whole', priceCents: 99999 }] },
      cookie,
    );
    expect(maxOk.status).toBe(200);
    expect(maxOk.body.portions[0].priceCents).toBe(99999);
    // -0 entra como entero y la base guarda 0 (mismo criterio que ADV-005-19).
    const minusZero = await putPortions(
      pollo.id,
      { portions: [{ portion: 'whole', priceCents: -0 }] },
      cookie,
    );
    expect(minusZero.status).toBe(200);
    expect(minusZero.body.portions[0].priceCents).toBe(0);
    const stored = await portionRows(pollo.id);
    expect(stored[0]?.price_cents).toBe(0);
    // Fuera de rango y tipos erróneos: 400 sin tocar nada.
    const before = await portionRows(pollo.id);
    for (const priceCents of [100000, -1, 18.5, '500', 1e5, true, null]) {
      const response = await putPortions(
        pollo.id,
        { portions: [{ portion: 'whole', priceCents: priceCents as number }] },
        cookie,
      );
      expect.soft(response.status, String(priceCents)).toBe(400);
      expect.soft(response.headers['cache-control'], String(priceCents)).toBe('no-store');
    }
    expect(await portionRows(pollo.id)).toEqual(before);
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-006-15: dos PUT simultáneos con conjuntos disjuntos no deben dejar la UNIÓN — gana el último', async () => {
    // La spec (casos borde) dice: "Dos PUT simultáneos sobre el mismo producto: cada
    // uno es una transacción atómica; gana el último en confirmar (no hay estado
    // intermedio visible)". El hook beforeBulkCreate mete un segundo PUT completo —
    // con su propia transacción que CONFIRMA— dentro del hueco entre el DELETE y el
    // INSERT del primero. Es la carrera real de dos administradores guardando la
    // grilla a la vez (o un doble clic con dos pestañas).
    const pollo = await createChicken();
    const setA = [{ portion: 'eighth', cut: 'breast', priceCents: 700 }];
    const setB = [
      { portion: 'quarter', cut: 'leg', priceCents: 1700 },
      { portion: 'whole', priceCents: 6000 },
    ];
    let armed = true;
    auth.models.ProductPortion.addHook('beforeBulkCreate', 'adv006union', async () => {
      if (!armed) return;
      armed = false;
      // El segundo PUT corre entero y confirma antes de que el primero inserte.
      await portionService.replaceProductPortions(pollo.id, { portions: setB });
    });
    try {
      // El primer PUT confirma DESPUÉS del segundo: por la spec debería ganar él.
      const resultA = await portionService.replaceProductPortions(pollo.id, {
        portions: setA,
      });
      // La respuesta del PUT A ya delata la mezcla: debería devolver solo su conjunto.
      expect(strip(resultA)).toEqual([
        { portion: 'eighth', cut: 'breast', priceCents: 700 },
      ]);
    } finally {
      auth.models.ProductPortion.removeHook('beforeBulkCreate', 'adv006union');
    }
    // Y la base debería quedar con el conjunto del último en confirmar (A), no con la
    // unión de ambos — que nadie pidió: quedaría un octavo de pecho a precio viejo
    // junto a un medio y un entero de la otra grilla.
    expect(strip(await portionService.listProductPortions(pollo.id))).toEqual([
      { portion: 'eighth', cut: 'breast', priceCents: 700 },
    ]);
  });

  it('ADV-006-16: dos PUT simultáneos que pisan la misma presentación no deberían romper al perdedor', async () => {
    // Misma carrera que ADV-006-15 pero con (portion, cut) solapada: el DELETE del
    // perdedor corre cuando la tabla está vacía y su INSERT choca con la fila que el
    // ganador ya confirmó — la unicidad NULLS NOT DISTINCT estalla dentro de la
    // transacción perdedora. Por la spec ambos PUT son válidos y gana el último; lo
    // que no puede pasar es un error crudo (por HTTP sería un 500 con log).
    const pollo = await createChicken();
    const setA = [{ portion: 'quarter', cut: 'breast', priceCents: 1850 }];
    const setB = [{ portion: 'quarter', cut: 'breast', priceCents: 1900 }];
    let armed = true;
    auth.models.ProductPortion.addHook('beforeBulkCreate', 'adv006clash', async () => {
      if (!armed) return;
      armed = false;
      await portionService.replaceProductPortions(pollo.id, { portions: setB });
    });
    let outcome: unknown;
    try {
      outcome = await portionService
        .replaceProductPortions(pollo.id, { portions: setA })
        .catch((error: unknown) => error);
    } finally {
      auth.models.ProductPortion.removeHook('beforeBulkCreate', 'adv006clash');
    }
    // El perdedor debería responder con el conjunto vigente igual que un PUT más (o un
    // 409 de dominio), nunca con un error de Sequelize que escala a INTERNAL_ERROR.
    expect(outcome).not.toBeInstanceOf(Error);
    // Y el estado final debe ser uno de los dos conjuntos, sin filas partidas.
    const finalRows = strip(await portionService.listProductPortions(pollo.id));
    expect(
      finalRows.length === 1 &&
        (finalRows[0]?.priceCents === 1850 || finalRows[0]?.priceCents === 1900),
    ).toBe(true);
  });

  it('ADV-006-17: un PATCH de categoría que corre entre el check y el INSERT del PUT deja un dish con presentaciones', async () => {
    // TOCTOU real entre dos requests legítimos: replaceProductPortions lee la
    // categoría FUERA de su transacción (findByPk sin FOR UPDATE) y updateProduct
    // cuenta las presentaciones también fuera de toda transacción. Con el producto
    // sin presentaciones: el PATCH a 'dish' ve 0 filas y pasa legal, y el PUT —que ya
    // había leído 'chicken'— inserta después. Resultado: un producto 'dish' con
    // presentaciones, el estado que RN-006-03 declara imposible por la API.
    const pollo = await createChicken();
    let armed = true;
    auth.models.ProductPortion.addHook('beforeBulkCreate', 'adv006toctou', async () => {
      if (!armed) return;
      armed = false;
      // El PATCH del admin corre completo dentro del hueco del PUT: cuenta 0
      // presentaciones (aún no hay ninguna confirmada) y cambia la categoría.
      await productService.updateProduct(pollo.id, { category: 'dish' });
    });
    let outcome: unknown;
    try {
      outcome = await portionService
        .replaceProductPortions(pollo.id, { portions: TRIO_INPUT })
        .catch((error: unknown) => error);
    } finally {
      auth.models.ProductPortion.removeHook('beforeBulkCreate', 'adv006toctou');
    }
    // El PUT ya no estaba autorizado: el producto dejó de ser 'chicken' a mitad de
    // vuelo. Lo correcto es 409 PORTIONS_NOT_ALLOWED (o al menos no dejar filas).
    expect.soft(outcome).toMatchObject({ code: 'PORTIONS_NOT_ALLOWED', httpStatus: 409 });
    // Ningún producto que no sea de pollo puede tener presentaciones (RN-006-03):
    // hoy queda un 'dish' con la grilla completa cargada y el GET la sirve al mozo.
    const product = await productRow(pollo.id);
    const rows = await portionRows(pollo.id);
    expect
      .soft({ category: product[0]?.category, portionsLeft: rows.length })
      .toEqual({ category: 'dish', portionsLeft: 0 });
    expect(rows).toEqual([]);
  });

  it('ADV-006-18: una presentación cargada entre el conteo y el UPDATE del PATCH deja un dish con presentaciones', async () => {
    // La carrera simétrica: updateProduct cuenta 0 presentaciones y luego hace el
    // UPDATE; si en medio un PUT carga presentaciones (transacción propia que
    // confirma), el UPDATE aplica 'dish' igual. La guardia RN-006-03 debería detectar
    // el cambio y rechazar con PRODUCT_HAS_PORTIONS.
    const pollo = await createChicken();
    let armed = true;
    auth.models.Product.addHook(
      'beforeUpdate',
      'adv006patchtoctou',
      async (_instance: unknown, options: InstanceUpdateOptions) => {
        if (!armed || options.transaction !== undefined) return;
        armed = false;
        // El PUT del admin corre completo entre el count (0) y el UPDATE del producto.
        await portionService.replaceProductPortions(pollo.id, { portions: TRIO_INPUT });
      },
    );
    let outcome: unknown;
    try {
      outcome = await productService
        .updateProduct(pollo.id, { category: 'dish' })
        .catch((error: unknown) => error);
    } finally {
      auth.models.Product.removeHook('beforeUpdate', 'adv006patchtoctou');
    }
    // El PATCH tenía que enterarse de que ya hay presentaciones y frenar con
    // PRODUCT_HAS_PORTIONS; en su lugar aplicó 'dish' sobre el conjunto recién
    // cargado. Misma invariante rota que ADV-006-17 por la ventana inversa.
    expect.soft(outcome).toMatchObject({ code: 'PRODUCT_HAS_PORTIONS', httpStatus: 409 });
    const product = await productRow(pollo.id);
    const rows = await portionRows(pollo.id);
    expect
      .soft({ category: product[0]?.category, portionsLeft: rows.length })
      .toEqual({ category: 'chicken', portionsLeft: 3 });
    expect(rows).toHaveLength(3);
  });


  it('ADV-006-19: un producto borrado entre el check y el INSERT responde 500 crudo en vez de PRODUCT_NOT_FOUND', async () => {
    // La API nunca borra productos (RN-005-04), así que la ventana solo se abre por
    // SQL directo — misma clase que ADV-005-25 (que sí se corrigió para PATCH). Si
    // ocurre, el bulkCreate revienta por la FK con un error de Sequelize que el
    // errorHandler convierte en 500 con log; la respuesta correcta sería 404.
    const pollo = await createChicken();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let armed = true;
    auth.models.ProductPortion.addHook('beforeBulkCreate', 'adv006gone', async () => {
      if (!armed) return;
      armed = false;
      // El producto desaparece dentro del hueco del PUT (sin hijos aún: borra libre).
      await database().query('DELETE FROM products WHERE id = $1', { bind: [pollo.id] });
    });
    let outcome: unknown;
    try {
      outcome = await portionService
        .replaceProductPortions(pollo.id, { portions: TRIO_INPUT })
        .catch((error: unknown) => error);
    } finally {
      auth.models.ProductPortion.removeHook('beforeBulkCreate', 'adv006gone');
    }
    expect(outcome).toMatchObject({ code: 'PRODUCT_NOT_FOUND', httpStatus: 404 });
    // La transacción sí protege el conjunto: no quedan filas huérfanas.
    expect(await rows('SELECT id FROM product_portions')).toEqual([]);
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-006-20: un GET que corre dentro del hueco del PUT nunca ve el conjunto a medias', async () => {
    // Lectura concurrente: mientras el PUT tiene su transacción abierta (filas viejas
    // ya borradas, nuevas sin confirmar), un GET hecho con otro request debe ver el
    // conjunto ANTERIOR completo — READ COMMITTED lo garantiza por statement. Lo que
    // no puede pasar es una lista partida (por ejemplo solo la mitad insertada).
    const pollo = await createChicken();
    await portionService.replaceProductPortions(pollo.id, { portions: TRIO_INPUT });
    const cookie = await cookieFor('mozo006.juan', ['waiter'], '2468');
    const six = [
      { portion: 'eighth', cut: 'breast', priceCents: 700 },
      { portion: 'eighth', cut: 'leg', priceCents: 650 },
      { portion: 'quarter', cut: 'breast', priceCents: 1850 },
      { portion: 'quarter', cut: 'leg', priceCents: 1700 },
      { portion: 'half', priceCents: 3200 },
      { portion: 'whole', priceCents: 6000 },
    ];
    let midRead: unknown;
    let armed = true;
    auth.models.ProductPortion.addHook('beforeBulkCreate', 'adv006read', async () => {
      if (!armed) return;
      armed = false;
      // El GET del mozo corre dentro del hueco del PUT (transacción sin confirmar).
      midRead = await getPortions(pollo.id, cookie);
    });
    try {
      await portionService.replaceProductPortions(pollo.id, { portions: six });
    } finally {
      auth.models.ProductPortion.removeHook('beforeBulkCreate', 'adv006read');
    }
    const mid = midRead as { status: number; body: { portions: object[] } };
    expect(mid.status).toBe(200);
    // Ve el conjunto viejo completo: el DELETE sin confirmar no es visible afuera.
    expect(strip(mid.body.portions as never)).toEqual(TRIO_ORDERED);
    // Y tras el commit el conjunto nuevo sale entero.
    expect(strip(await portionService.listProductPortions(pollo.id))).toEqual(SIX_ORDERED);
  });

  it('ADV-006-21: dos PUT reales en vuelo sobre el mismo producto (sondeo de la carrera sin hooks)', async () => {
    // Complemento probabilístico de ADV-006-15/16: dos PUT por HTTP a la vez sobre un
    // producto sin presentaciones, cinco rondas con conjuntos disjuntos y solapados.
    // La spec exige que gane el último en confirmar: cada ronda debe terminar con
    // exactamente uno de los dos conjuntos y ambos PUT respondiendo 200.
    const cookie = await adminCookie();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (let round = 0; round < 8; round++) {
      const pollo = await createChicken(`Pollo carrera ${round}`);
      // Rondas 0-4: conjuntos disjuntos (dos admins pisándose). Rondas 5-7: el MISMO
      // conjunto en ambos PUT — el doble clic o el reintento del navegador, el caso
      // más común en producción; el perdedor no debería reventar ni dejar nada raro.
      const disjoint = round < 5;
      const setA = [{ portion: 'eighth', cut: 'breast', priceCents: 700 }];
      const setB = disjoint
        ? [{ portion: 'whole', priceCents: 6000 }]
        : [{ portion: 'eighth', cut: 'breast', priceCents: 700 }];
      const [a, b] = await Promise.all([
        putPortions(pollo.id, { portions: setA }, cookie),
        putPortions(pollo.id, { portions: setB }, cookie),
      ]);
      const statuses = [a.status, b.status].sort();
      const finalList = strip(
        (await getPortions(pollo.id, cookie)).body.portions as never,
      ).map(({ portion, cut, priceCents }) => `${portion}:${String(cut)}:${priceCents}`);
      const keyOf = (row: { portion: string; cut?: string; priceCents: number }) =>
        `${row.portion}:${String(row.cut ?? null)}:${row.priceCents}`;
      const aKeys = setA.map(keyOf).join('|');
      const bKeys = setB.map(keyOf).join('|');
      // Ambos responden 200 y el conjunto final es exactamente uno de los enviados.
      expect.soft(statuses, `ronda ${round}`).toEqual([200, 200]);
      expect
        .soft(
          finalList.join('|') === aKeys || finalList.join('|') === bKeys,
          `ronda ${round} quedó ${finalList.join('|')}`,
        )
        .toBe(true);
      await database().query('DELETE FROM product_portions WHERE product_id = $1', {
        bind: [pollo.id],
      });
      await database().query('DELETE FROM products WHERE id = $1', { bind: [pollo.id] });
    }
    expect(log).not.toHaveBeenCalled();
  });

  it('ADV-006-22: los roles y la sesión se leen en vivo también para las rutas de presentaciones', async () => {
    const cookie = await adminCookie();
    const pollo = await createChicken();
    await insertPortionSql(pollo.id, 'quarter', 'breast', 1850);
    const before = await portionRows(pollo.id);
    // Le quitan admin con la sesión abierta: la siguiente escritura es 403, la
    // lectura sigue abierta (RN-003-06/07 aplicados a las rutas nuevas).
    const dueno = await rows<{ id: number }>(
      "SELECT id FROM users WHERE username = 'admin006'",
    );
    await database().query('UPDATE users SET roles = $1 WHERE id = $2', {
      bind: [['waiter'], dueno[0]!.id],
    });
    const demoted = await putPortions(pollo.id, { portions: TRIO_INPUT }, cookie);
    expect(demoted.status).toBe(403);
    expect(demoted.body).toEqual(FORBIDDEN_BODY);
    expect(demoted.headers['cache-control']).toBe('no-store');
    expect((await getPortions(pollo.id, cookie)).status).toBe(200);
    // Desactivado del todo: ni la lectura pasa.
    await database().query('UPDATE users SET is_active = false WHERE id = $1', {
      bind: [dueno[0]!.id],
    });
    for (const response of [
      await getPortions(pollo.id, cookie),
      await putPortions(pollo.id, { portions: TRIO_INPUT }, cookie),
    ]) {
      expect.soft(response.status).toBe(401);
      expect.soft(response.body).toEqual(UNAUTHENTICATED_BODY);
      expect.soft(response.headers['cache-control']).toBe('no-store');
    }
    // Y si la sesión desaparece de la tabla, la cookie no sirve aunque no haya vencido.
    await database().query('UPDATE users SET is_active = true WHERE id = $1', {
      bind: [dueno[0]!.id],
    });
    await database().query('DELETE FROM sessions WHERE user_id = $1', { bind: [dueno[0]!.id] });
    expect((await getPortions(pollo.id, cookie)).status).toBe(401);
    expect((await putPortions(pollo.id, { portions: TRIO_INPUT }, cookie)).status).toBe(401);
    expect(await portionRows(pollo.id)).toEqual(before);
  });

  it('ADV-006-23: PUT y GET sobre un producto desactivado están permitidos (configurar antes de reactivar)', async () => {
    // La spec lo declara en casos borde: las presentaciones se cargan aunque el
    // producto esté inactivo (se prepara la grilla antes de publicarlo).
    const cookie = await adminCookie();
    const pollo = await createChicken();
    await productService.updateProduct(pollo.id, { isActive: false });
    const put = await putPortions(pollo.id, { portions: TRIO_INPUT }, cookie);
    expect(put.status).toBe(200);
    expect(strip(put.body.portions)).toEqual(TRIO_ORDERED);
    const get = await getPortions(pollo.id, cookie);
    expect(get.status).toBe(200);
    expect(strip(get.body.portions)).toEqual(TRIO_ORDERED);
    // Y la guardia de categoría sigue protegiendo aunque esté inactivo.
    const blocked = await patchProduct(pollo.id, { category: 'dish' }, cookie);
    expect(blocked.status).toBe(409);
    expect(blocked.body).toEqual(PRODUCT_HAS_PORTIONS_BODY);
    expect((await productRow(pollo.id))[0]?.is_active).toBe(false);
  });

  it('ADV-006-24: un PATCH que choca con PRODUCT_HAS_PORTIONS no aplica NI el resto del cuerpo', async () => {
    // El rechazo es atómico: si la categoría no puede cambiar, el precio y la
    // desactivación del mismo cuerpo tampoco se aplican (el throw corre antes del UPDATE).
    const cookie = await adminCookie();
    const pollo = await createChicken();
    await insertPortionSql(pollo.id, 'half', null, 3200);
    const before = await productRow(pollo.id);
    const response = await patchProduct(
      pollo.id,
      { category: 'dish', priceCents: 999, isActive: false, name: 'Otro nombre' },
      cookie,
    );
    expect(response.status).toBe(409);
    expect(response.body).toEqual(PRODUCT_HAS_PORTIONS_BODY);
    expect(await productRow(pollo.id)).toEqual(before);
    // PATCH {category:'dish'} sobre un producto que YA es dish con filas cargadas por
    // SQL (estado que la API no puede crear): también 409 — quitar las filas primero
    // es la única salida, aunque "no cambie nada".
    const chaufa = await productService.createProduct({
      name: 'Chaufa',
      category: 'dish',
      priceCents: 1400,
    });
    await insertPortionSql(chaufa.id, 'quarter', 'breast', 1850);
    const stuck = await patchProduct(chaufa.id, { category: 'dish' }, cookie);
    expect(stuck.status).toBe(409);
    expect(stuck.body).toEqual(PRODUCT_HAS_PORTIONS_BODY);
    // Y esas filas existen y el GET las sirve igual: el invariante 'solo chicken tiene
    // presentaciones' depende íntegramente del servicio, la base no lo refuerza.
    const leaked = await getPortions(chaufa.id, cookie);
    expect(leaked.status).toBe(200);
    expect(strip(leaked.body.portions)).toEqual([
      { portion: 'quarter', cut: 'breast', priceCents: 1850 },
    ]);
  });

  it('ADV-006-25: PUT {portions: []} sobre un producto de otra categoría también es 409', async () => {
    // El rechazo no depende del contenido: PUT sobre un no-chicken es
    // PORTIONS_NOT_ALLOWED aunque el conjunto pedido sea vacío (un dish "sin
    // presentaciones" ya está en ese estado; el 409 deja claro que la ruta no aplica).
    const cookie = await adminCookie();
    const chaufa = await productService.createProduct({
      name: 'Chaufa',
      category: 'dish',
      priceCents: 1400,
    });
    const response = await putPortions(chaufa.id, { portions: [] }, cookie);
    expect(response.status).toBe(409);
    expect(response.body).toEqual(PORTIONS_NOT_ALLOWED_BODY);
    // Y con cuerpo inválido el 400 VALIDATION_ERROR corre antes que el 409: el cuerpo
    // se valida primero (documentado: lo que no permite el 409 es el estado del
    // producto, no el cuerpo).
    const invalid = await putPortions(chaufa.id, { portions: 'x' }, cookie);
    expect(invalid.status).toBe(400);
    expect(invalid.body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('ADV-006-26: el servicio confía en productId: NaN e Infinity escapan como error crudo', async () => {
    // Documentado como hallazgo (Bajo, defensa en profundidad — el mismo que
    // ADV-005-22 en updateProduct): el controller valida ^[0-9]+$ antes de llamar,
    // pero el contrato del servicio no blinda el id. Con un número no entero
    // findByPk devuelve null (→ PRODUCT_NOT_FOUND coherente); con NaN o Infinity
    // Sequelize genera SQL que la base rechaza — un error crudo que sería 500 con
    // log si algún caller futuro no validara antes.
    const pollo = await createChicken();
    for (const badId of [1.5, -1, 2147483648, Number.MAX_SAFE_INTEGER]) {
      const listed = await portionService
        .listProductPortions(badId)
        .catch((error: unknown) => error);
      expect.soft(listed).toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
      const replaced = await portionService
        .replaceProductPortions(badId, { portions: TRIO_INPUT })
        .catch((error: unknown) => error);
      expect.soft(replaced).toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
    }
    for (const badId of [Number.NaN, Infinity, -Infinity]) {
      const listed = await portionService
        .listProductPortions(badId)
        .catch((error: unknown) => error);
      expect.soft(listed).toBeInstanceOf(Error);
      expect.soft(listed instanceof AppError, `list ${String(badId)}`).toBe(false);
      const replaced = await portionService
        .replaceProductPortions(badId, { portions: TRIO_INPUT })
        .catch((error: unknown) => error);
      expect.soft(replaced).toBeInstanceOf(Error);
      expect.soft(replaced instanceof AppError, `replace ${String(badId)}`).toBe(false);
    }
    // Un id como texto dígito se coacciona y llega a la base igual.
    expect(
      await portionService.listProductPortions(String(pollo.id) as unknown as number),
    ).toEqual([]);
  });

  it('ADV-006-27: las garantías de la base también cubren UPDATEs ilegales y el borrado con hijos', async () => {
    // Los CHECK no solo frenan INSERTs: un UPDATE que deje la fila ilegal también
    // cae. Y la FK protege al producto con presentaciones de un borrado directo.
    const pollo = await createChicken();
    await insertPortionSql(pollo.id, 'quarter', 'breast', 1850);
    for (const sql of [
      'UPDATE product_portions SET cut = NULL WHERE product_id = $1',
      "UPDATE product_portions SET portion = 'octavo' WHERE product_id = $1",
      "UPDATE product_portions SET cut = 'wing' WHERE product_id = $1",
      'UPDATE product_portions SET price_cents = -5 WHERE product_id = $1',
      'UPDATE product_portions SET price_cents = 100000 WHERE product_id = $1',
      'UPDATE product_portions SET portion = NULL WHERE product_id = $1',
    ])
      await expect(database().query(sql, { bind: [pollo.id] })).rejects.toBeInstanceOf(Error);
    // La fila quedó intacta tras todos los intentos.
    expect(await portionRows(pollo.id)).toEqual([
      expect.objectContaining({ portion: 'quarter', cut: 'breast', price_cents: 1850 }),
    ]);
    // Borrar el producto con hijos falla por la FK (protección correcta: la API
    // nunca borra productos, pero la base lo garantiza igual).
    await expect(
      database().query('DELETE FROM products WHERE id = $1', { bind: [pollo.id] }),
    ).rejects.toBeInstanceOf(Error);
    // Frontera documentada de la garantía (spec 8.1 y 15): la base NO impide que un
    // producto con presentaciones cambie de categoría por SQL, ni que se inserten
    // filas en un producto de otra categoría — eso solo lo garantiza el servicio.
    const chaufa = await productService.createProduct({
      name: 'Chaufa',
      category: 'dish',
      priceCents: 1400,
    });
    await insertPortionSql(chaufa.id, 'half', null, 3200); // entra: no hay CHECK cruzado
    await database().query("UPDATE products SET category = 'drink' WHERE id = $1", {
      bind: [chaufa.id],
    });
    expect((await productRow(chaufa.id))[0]?.category).toBe('drink');
    expect(await portionRows(chaufa.id)).toHaveLength(1);
  });

  it('ADV-006-28: ninguna respuesta de la batería registra log ni fuga campos internos', async () => {
    const cookie = await adminCookie();
    const pollo = await createChicken();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const responses = [
      await putPortions(pollo.id, { portions: TRIO_INPUT }, cookie),
      await getPortions(pollo.id, cookie),
      await getPortions(pollo.id),
      await putPortions(pollo.id, { portions: TRIO_INPUT }),
      await getPortions('abc', cookie),
      await getPortions(999999, cookie),
      await putPortions(999999, { portions: TRIO_INPUT }, cookie),
      await putPortions(pollo.id, { portions: [{ portion: 'half', cut: 'leg', priceCents: 1 }] }, cookie),
      await putPortions(pollo.id, {}, cookie),
      await request(auth.app).delete(`/api/products/${pollo.id}/portions`).set('Cookie', cookie),
    ];
    for (const response of responses) {
      expect.soft(response.headers['cache-control'], String(response.status)).toBe('no-store');
      // Ningún cuerpo —ni los de éxito ni los de error— trae columnas internas,
      // datos de sesión ni trazas.
      expect
        .soft(JSON.stringify(response.body), String(response.status))
        .not.toMatch(/created_at|updated_at|product_id|pinHash|tokenHash|polleria_dev|SELECT |at \//i);
    }
    expect(log).not.toHaveBeenCalled();
    // La respuesta exitosa solo expone las cinco claves del contrato por fila.
    const ok = await getPortions(pollo.id, cookie);
    for (const row of (ok.body as { portions: object[] }).portions)
      expect(Object.keys(row).sort()).toEqual(['cut', 'id', 'portion', 'priceCents', 'productId']);
  });
});
