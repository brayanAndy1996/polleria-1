import { describe, expect, it } from 'vitest';
import {
  CANCEL_REASON_MAX,
  ERROR_CODES,
  ORDER_STATUSES,
  TABLE_STATES,
  cancelOrderRequestSchema,
  cancelReasonSchema,
  createTableRequestSchema,
  joinTableRequestSchema,
  moveOrderRequestSchema,
  orderSchema,
  tableNameSchema,
  tableSchema,
  tablesResponseSchema,
  updateTableRequestSchema,
} from '../../src/index.ts';

const TABLE_NAME_TOO_LONG_MESSAGE = 'El nombre de la mesa no puede pasar de 40 caracteres.';
const TABLE_NAME_PATTERN_MESSAGE =
  'El nombre de la mesa solo puede llevar letras, n\u00fameros, espacios, punto, guion o ' +
  'guion bajo.';
const TABLE_ID_MESSAGE = 'El identificador de la mesa no es v\u00e1lido.';
const CANCEL_REASON_MESSAGE = 'Escribe el motivo de la anulaci\u00f3n (hasta 200 caracteres).';
const NO_CHANGES_MESSAGE = 'No indicaste ning\u00fan cambio.';

/** safeParse rechazado donde al menos un issue traiga el mensaje indicado. */
function expectRejectedWith(
  schema: { safeParse: (input: unknown) => unknown },
  input: unknown,
  message: string,
) {
  const result = schema.safeParse(input) as
    { success: true } | { success: false; error: { issues: { message: string }[] } };
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.issues.map((issue) => issue.message)).toContain(message);
  }
}

/** El issue de un rechazo debe salir en la clave exacta (los cuerpos de un solo campo, AC-01). */
function expectIssueOnPath(
  schema: { safeParse: (input: unknown) => unknown },
  input: unknown,
  path: string,
  message: string,
) {
  const result = schema.safeParse(input) as
    | { success: true }
    | { success: false; error: { issues: { path: (string | number)[]; message: string }[] } };
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(
      result.error.issues.some(
        (issue) => issue.path.join('.') === path && issue.message === message,
      ),
    ).toBe(true);
  }
}

/** Pedido mínimo válido según D-009-14 para probar el esquema de respuesta. */
const VALID_ORDER = {
  id: 12,
  status: 'open',
  tables: [{ id: 3, name: 'Mesa 3' }],
  openedBy: { id: 2, displayName: 'Juan' },
  openedAt: '2026-10-10T18:30:00.000Z',
  readyAt: null,
  billRequestedAt: null,
  closedAt: null,
  closedBy: null,
  cancelReason: null,
  mergedIntoOrderId: null,
  items: [],
  totalCents: 0,
};

/** Mesa mínima válida según D-009-14. */
const VALID_TABLE = {
  id: 3,
  name: 'Mesa 3',
  isActive: true,
  state: 'occupied',
  order: VALID_ORDER,
};

/**
 * Ataques a los esquemas compartidos de la spec 009 que las pruebas de AC no cubren:
 * la frontera de 40 puntos de código con NFD/NFC y marcas combinadas, invisibles y
 * confusables Unicode en el nombre de mesa, los cuerpos de un solo campo (el
 * preprocess decide el issue en la clave aunque la entrada no sea objeto, traiga
 * claves de más o claves de prototipo), la frontera del motivo de anulación con
 * puntos de código astrales y los esquemas estrictos de respuesta.
 *
 * Regla de la spec para estas pruebas: los caracteres especiales van siempre con
 * escapes, nunca literales.
 */
describe('009 adversarial: esquemas de mesas y pedidos', () => {
  it('ADV-009-01: la frontera de 40 se mide tras normalizar y en puntos de código', () => {
    // 41 unidades de entrada que normalizan a 40: la marca combinada se funde.
    const nfd40 = 'A'.repeat(39) + 'A\u0301'; // 40 chars -> NFC 40
    expect(tableNameSchema.parse(nfd40)).toBe('A'.repeat(39) + '\u00C1');
    const nfd40plus = 'A'.repeat(40) + '\u0301'; // 41 chars -> NFC 40
    expect(tableNameSchema.parse(nfd40plus)).toBe('A'.repeat(39) + '\u00C1');
    // 41 puntos de código reales: rechazo con el mensaje de largo.
    expectRejectedWith(tableNameSchema, 'A'.repeat(41), TABLE_NAME_TOO_LONG_MESSAGE);
    // Una letra astral (2 unidades UTF-16, 1 punto de código): 40 caben.
    const astral = 'Mesa ' + '\u{1D400}'.repeat(35);
    expect(tableNameSchema.parse(astral)).toBe(astral);
    // '  mesa 7  ' -> 'mesa 7' (recorte + colapso de espacios, AC-01).
    expect(tableNameSchema.parse('  mesa   7  ')).toBe('mesa 7');
    // El espacio interior no colapsa con tab ni con NBSP: el patrón los rechaza.
    expectRejectedWith(tableNameSchema, 'Mesa\t1', TABLE_NAME_PATTERN_MESSAGE);
    expectRejectedWith(tableNameSchema, 'Mesa\u00A01', TABLE_NAME_PATTERN_MESSAGE);
    expectRejectedWith(tableNameSchema, 'Mesa\u200B1', TABLE_NAME_PATTERN_MESSAGE); // ZWSP
    expectRejectedWith(tableNameSchema, 'Mesa\u00001', TABLE_NAME_PATTERN_MESSAGE); // NUL
    expectRejectedWith(tableNameSchema, 'Mesa\u20281', TABLE_NAME_PATTERN_MESSAGE); // sep. línea
    // Vacío tras recortar: el mensaje del patrón (la spec no fija el del vacío).
    expectRejectedWith(tableNameSchema, '   ', TABLE_NAME_PATTERN_MESSAGE);
    expectRejectedWith(tableNameSchema, '\u00A0\u00A0', TABLE_NAME_PATTERN_MESSAGE);
  });

  it('ADV-009-02: confusables y nombres de solo puntuación entran — paridad con la carta', () => {
    // \p{L} admite cualquier letra Unicode: la 'М' cirílica pasa aunque dibuje una
    // 'M' latina. lower() no la equipara, así que 'Мesa 1' puede coexistir con 'Mesa 1'
    // — mismo hueco documentado en los nombres de producto (ADV-005), aquí es aún
    // más visible porque un mozo no distinguiría las dos mesas en el tablero.
    expect(tableNameSchema.parse('\u041Cesa 1')).toBe('\u041Cesa 1');
    expect(tableNameSchema.parse('Mesa \u039F')).toBe('Mesa \u039F'); // omicron griega
    // Un nombre de solo puntuación también pasa la clase ('---', '...', '___').
    for (const name of ['---', '...', '___']) {
      expect(tableNameSchema.parse(name)).toBe(name);
    }
    // Tipos que no son texto: el esquema exige string.
    for (const bad of [5, true, null, undefined, {}, [], ['Mesa 1']]) {
      expect(tableNameSchema.safeParse(bad).success).toBe(false);
    }
    // createTableRequestSchema estricto: clave de más cae aunque el nombre valga.
    expect(createTableRequestSchema.safeParse({ name: 'Mesa 1', extra: 1 }).success).toBe(false);
    expect(createTableRequestSchema.safeParse({ name: 'Mesa 1', id: 3 }).success).toBe(false);
  });

  it('ADV-009-03: los cuerpos de un solo campo fijan el issue en la clave aunque la entrada sea hostil', () => {
    // moveOrderRequestSchema / joinTableRequestSchema comparten tableIdSchema y el
    // preprocess singleFieldBody: lo que no sea exactamente { campo: valor } se
    // convierte en { campo: null } para que el issue salga en la clave (AC-01).
    const pairs: [typeof moveOrderRequestSchema | typeof joinTableRequestSchema, string][] = [
      [moveOrderRequestSchema, 'tableId'],
      [joinTableRequestSchema, 'intoTableId'],
    ];
    for (const [schema, key] of pairs) {
      for (const hostile of [
        5,
        '5',
        true,
        null,
        [],
        [5],
        {},
        'x',
        { [key]: '5' },
        { [key]: 0 },
        { [key]: -3 },
        { [key]: 1.5 },
        { [key]: -0 },
        { [key]: 2147483648 },
        { [key]: Number.MAX_SAFE_INTEGER },
        { [key]: null },
        { [key]: true },
        { [key]: {} },
        { [key]: [] },
        { [key]: 5, extra: 1 }, // clave de más: el issue cae en el campo, no en 'extra'
        { other: 5 },
      ]) {
        expectIssueOnPath(schema, hostile, key, TABLE_ID_MESSAGE);
      }
      // Válidos: entero positivo dentro del INTEGER de PostgreSQL.
      expect(schema.safeParse({ [key]: 1 }).success).toBe(true);
      expect(schema.safeParse({ [key]: 5.0 }).success).toBe(true); // 5.0 es entero
      expect(schema.safeParse({ [key]: 1 }).success).toBe(true);
      expect(schema.safeParse({ [key]: 2147483647 }).success).toBe(true);
    }
    // Claves de prototipo en el JSON: cuentan como "clave de más" -> issue del campo.
    // En un literal JS, '__proto__' no es clave propia: se construye con defineProperty
    // para simular el objeto que produce JSON.parse en el servidor.
    const protoBody: object = {};
    Reflect.defineProperty(protoBody, '__proto__', {
      value: { injected: true },
      enumerable: true,
      configurable: true,
    });
    expectIssueOnPath(moveOrderRequestSchema, protoBody, 'tableId', TABLE_ID_MESSAGE);
    expectIssueOnPath(
      moveOrderRequestSchema,
      { tableId: 5, constructor: { name: 'x' } },
      'tableId',
      TABLE_ID_MESSAGE,
    );
    // cancelOrderRequestSchema aplica la misma regla a 'reason'.
    for (const hostile of [5, 'x', null, [], { reason: 5 }, { reason: null }, { reason: true }]) {
      expectIssueOnPath(cancelOrderRequestSchema, hostile, 'reason', CANCEL_REASON_MESSAGE);
    }
    expect(cancelOrderRequestSchema.parse({ reason: 'Se sentaron por error' })).toEqual({
      reason: 'Se sentaron por error',
    });
  });

  it('ADV-009-04: el motivo se recorta, mide 200 puntos de código y conserva lo demás', () => {
    // Frontera exacta tras el recorte: 200 pasa, 201 no; el acolchado no cuenta.
    expect(cancelReasonSchema.parse('a'.repeat(CANCEL_REASON_MAX))).toHaveLength(200);
    expectRejectedWith(cancelReasonSchema, 'a'.repeat(201), CANCEL_REASON_MESSAGE);
    const padded = '  ' + 'a'.repeat(200) + '  ';
    expect(cancelReasonSchema.parse(padded)).toBe('a'.repeat(200));
    // 200 letras astrales cuentan como 200 puntos de código — mismo criterio que
    // varchar(200) de PostgreSQL, así que entran en la columna (paridad de medida).
    expect(cancelReasonSchema.parse('\u{1F525}'.repeat(200))).toHaveLength(400); // 200 puntos = 400 unidades UTF-16
    expectRejectedWith(cancelReasonSchema, '\u{1F525}'.repeat(201), CANCEL_REASON_MESSAGE);
    // Solo espacios (de cualquier clase Unicode) tras recortar: rechazo.
    for (const blank of ['', '   ', '\t\n ', '\u00A0\u00A0', '\u3000']) {
      expectRejectedWith(cancelReasonSchema, blank, CANCEL_REASON_MESSAGE);
    }
    // Sin normalización ni colapso interno: el motivo se guarda tal cual (recortado).
    expect(cancelReasonSchema.parse('  Error   al   abrir  ')).toBe('Error   al   abrir');
    const nfd = 'Se cay\u0301o';
    expect(cancelReasonSchema.parse(nfd)).toBe(nfd);
    // Tipos no texto: rechazo con el mismo mensaje.
    for (const bad of [5, true, null, undefined, {}, []]) {
      expectRejectedWith(cancelReasonSchema, bad, CANCEL_REASON_MESSAGE);
    }
  });

  it('ADV-009-05: updateTableRequestSchema — al menos una propiedad y ambas opcionales', () => {
    expectRejectedWith(updateTableRequestSchema, {}, NO_CHANGES_MESSAGE);
    // Solo undefined explícito no cuenta como cambio (documentado ADV-005).
    expectRejectedWith(updateTableRequestSchema, { name: undefined }, NO_CHANGES_MESSAGE);
    expectRejectedWith(updateTableRequestSchema, { isActive: undefined }, NO_CHANGES_MESSAGE);
    expect(updateTableRequestSchema.safeParse({ name: 'Barra' }).success).toBe(true);
    expect(updateTableRequestSchema.safeParse({ isActive: false }).success).toBe(true);
    expect(updateTableRequestSchema.safeParse({ name: 'Barra', isActive: true }).success).toBe(
      true,
    );
    // Tipos hostiles en isActive y name, y claves de más.
    for (const bad of [
      { isActive: 'false' },
      { isActive: 0 },
      { isActive: 1 },
      { isActive: null },
      { name: 5 },
      { name: null },
      { name: 'X', extra: 1 },
      { isActive: false, tableId: 4 },
      5,
      'x',
      null,
      [],
    ]) {
      expect(updateTableRequestSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('ADV-009-06: los enums y los esquemas de respuesta son exactos y estrictos', () => {
    expect(TABLE_STATES).toEqual(['free', 'occupied', 'ready', 'bill_requested']);
    expect(ORDER_STATUSES).toEqual(['open', 'closed', 'cancelled', 'merged']);
    // tableSchema estricto: clave de más, estado fuera del enum o en español fallan.
    expect(tableSchema.safeParse(VALID_TABLE).success).toBe(true);
    for (const bad of [
      { ...VALID_TABLE, extra: 1 },
      { ...VALID_TABLE, state: 'ocupada' },
      { ...VALID_TABLE, state: 'READY' },
      { ...VALID_TABLE, state: 'closed' },
      { ...VALID_TABLE, order: undefined },
      { ...VALID_TABLE, isActive: 'true' },
      { ...VALID_TABLE, id: '3' },
    ]) {
      expect(tableSchema.safeParse(bad).success).toBe(false);
    }
    // orderSchema estricto: las trece claves exactas; fechas deben ser ISO o null.
    expect(orderSchema.safeParse(VALID_ORDER).success).toBe(true);
    for (const bad of [
      { ...VALID_ORDER, extra: 1 },
      { ...VALID_ORDER, status: 'abierto' },
      { ...VALID_ORDER, status: 'OPEN' },
      { ...VALID_ORDER, tables: null },
      { ...VALID_ORDER, openedAt: 'hace un rato' },
      { ...VALID_ORDER, openedAt: new Date() },
      { ...VALID_ORDER, readyAt: 'no es fecha' },
      { ...VALID_ORDER, closedBy: { id: 2, displayName: 'Juan', roles: ['waiter'] } },
      { ...VALID_ORDER, mergedIntoOrderId: '12' },
      { ...VALID_ORDER, mergedIntoOrderId: 0 },
      { ...VALID_ORDER, cancelReason: 5 },
      { ...VALID_ORDER, openedBy: { displayName: 'Juan' } },
      { ...VALID_ORDER, tables: [{ id: 3 }] },
    ]) {
      expect(orderSchema.safeParse(bad).success).toBe(false);
    }
    // Los nueve códigos nuevos están en ERROR_CODES (AC-02).
    for (const code of [
      'TABLE_NOT_FOUND',
      'ORDER_NOT_FOUND',
      'TABLE_NAME_TAKEN',
      'TABLE_OCCUPIED',
      'TABLE_INACTIVE',
      'TABLE_HAS_OPEN_ORDER',
      'TABLE_HAS_NO_ORDER',
      'ORDER_NOT_OPEN',
      'ORDER_NEEDS_TABLE',
    ] as const) {
      expect(Object.values(ERROR_CODES)).toContain(code);
    }
    // tablesResponseSchema estricto.
    expect(tablesResponseSchema.safeParse({ tables: [VALID_TABLE] }).success).toBe(true);
    expect(tablesResponseSchema.safeParse({ tables: [VALID_TABLE], extra: 1 }).success).toBe(false);
    expect(tablesResponseSchema.safeParse({ tables: 'x' }).success).toBe(false);
  });
});
