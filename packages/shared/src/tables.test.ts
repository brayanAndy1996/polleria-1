// AC-01 y AC-02. Spec 009 — archivo nuevo: va EN ROJO hasta que T-06 cree
// packages/shared/src/tables.ts (y su exportación en index.ts).
import { describe, expect, it } from 'vitest';
import {
  ERROR_CODES,
  TABLE_NAME_MAX,
  TABLE_STATES,
  createTableRequestSchema,
  errorResponseSchema,
  tableNameSchema,
  tableSchema,
  tableStateSchema,
  tablesResponseSchema,
  updateTableRequestSchema,
} from '@polleria/shared';
import type {
  CreateTableRequest,
  Order,
  Table,
  TableState,
  TablesResponse,
  UpdateTableRequest,
} from '@polleria/shared';

const TABLE_NAME_TOO_LONG_MESSAGE = 'El nombre de la mesa no puede pasar de 40 caracteres.';
const TABLE_NAME_PATTERN_MESSAGE =
  'El nombre de la mesa solo puede llevar letras, n\u00FAmeros, espacios, punto, guion o ' +
  'guion bajo.';
const NO_CHANGES_MESSAGE = 'No indicaste ning\u00FAn cambio.';
const TABLE_NAME_TAKEN_BODY = {
  error: {
    code: 'TABLE_NAME_TAKEN',
    message: 'Ya existe una mesa con ese nombre.',
    details: null,
  },
};
const TABLE_NOT_FOUND_BODY = {
  error: { code: 'TABLE_NOT_FOUND', message: 'Esa mesa no existe.', details: null },
};

/** Un pedido abierto válido tal como lo embebe tableSchema (forma de D-010-14: la 010 suma items y totalCents). */
const EMBEDDED_ORDER = {
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
} satisfies Order;

/** Una mesa libre válida: las cinco claves exactas de D-009-14. */
const FREE_TABLE = {
  id: 1,
  name: 'Mesa 1',
  isActive: true,
  state: 'free',
  order: null,
} satisfies Table;

/** Comprueba que el esquema rechaza la entrada y que al menos un issue trae el mensaje. */
function expectRejectedWith(
  schema: { safeParse: (input: unknown) => unknown },
  input: unknown,
  message: string,
) {
  const result = schema.safeParse(input) as
    { success: true } | { success: false; error: { issues: { message: string }[] } };
  expect(result.success).toBe(false);
  if (!result.success) expect(result.error.issues.map((issue) => issue.message)).toContain(message);
}

describe('009: esquemas de mesas del salón', () => {
  it('AC-01: TABLE_NAME_MAX es 40', () => {
    expect(TABLE_NAME_MAX).toBe(40);
  });
  it.each([
    'Mesa 1',
    'Barra',
    'T-2',
    'MESA_3',
    'Terraza 2',
    'Dep\u00F3sito',
    'Mesa.4',
    'x'.repeat(TABLE_NAME_MAX),
  ])('AC-01: tableNameSchema acepta %s y devuelve el mismo texto', (name) => {
    expect(tableNameSchema.parse(name)).toBe(name);
  });
  it('AC-01: tableNameSchema recorta, reduce espacios seguidos y normaliza a NFC', () => {
    expect(tableNameSchema.parse('  mesa 7  ')).toBe('mesa 7');
    expect(tableNameSchema.parse('  mesa   7  ')).toBe('mesa 7');
    expect(tableNameSchema.parse('Mesa  9')).toBe('Mesa 9');
    expect(tableNameSchema.parse('Caf\u0065\u0301')).toBe('Caf\u00E9');
  });
  it('AC-01: tableNameSchema rechaza un nombre de 41 caracteres con su mensaje', () => {
    expectRejectedWith(
      tableNameSchema,
      'x'.repeat(TABLE_NAME_MAX + 1),
      TABLE_NAME_TOO_LONG_MESSAGE,
    );
    expectRejectedWith(tableNameSchema, `Mesa ${'larga '.repeat(8)}`, TABLE_NAME_TOO_LONG_MESSAGE);
  });
  it.each(['', '   ', '\t'])('AC-01: tableNameSchema rechaza el nombre vacío %j', (input) => {
    // La spec no fija el mensaje del vacío; basta con que sea rechazado.
    expect(tableNameSchema.safeParse(input).success).toBe(false);
  });
  it.each(['Mesa $', 'Mesa/1', 'Mesa@1', 'Mesa(1)', 'Mesa\tsucia', 'Mesa \u{1F357}'])(
    'AC-01: tableNameSchema rechaza %s con el mensaje de caracteres',
    (input) => {
      expectRejectedWith(tableNameSchema, input, TABLE_NAME_PATTERN_MESSAGE);
    },
  );
  it.each([5, null, undefined, ['Mesa 1']])(
    'AC-01: tableNameSchema rechaza %s que no es texto',
    (input) => {
      expect(tableNameSchema.safeParse(input).success).toBe(false);
    },
  );

  it('AC-01: createTableRequestSchema acepta el cuerpo válido y normaliza el nombre', () => {
    const request: CreateTableRequest = { name: '  Mesa 1  ' };
    expect(createTableRequestSchema.parse(request)).toEqual({ name: 'Mesa 1' });
    expect(createTableRequestSchema.parse({ name: 'Barra' })).toEqual({ name: 'Barra' });
  });
  it.each([
    {},
    { name: '' },
    { name: '   ' },
    { name: 'Mesa 1', extra: 1 },
    { name: 'Mesa 1', isActive: true },
    { name: 5 },
    { name: 'Mesa/1' },
    'un texto',
    null,
    undefined,
  ])('AC-01: createTableRequestSchema rechaza %s', (input) => {
    expect(createTableRequestSchema.safeParse(input).success).toBe(false);
  });

  it.each([
    { name: 'Barra' },
    { isActive: false },
    { isActive: true },
    { name: 'Barra', isActive: true },
  ] satisfies UpdateTableRequest[])('AC-01: updateTableRequestSchema acepta %s', (input) => {
    expect(updateTableRequestSchema.parse(input)).toEqual(input);
  });
  it("AC-01: updateTableRequestSchema rechaza el objeto vacío con 'No indicaste ningún cambio.'", () => {
    expectRejectedWith(updateTableRequestSchema, {}, NO_CHANGES_MESSAGE);
  });
  it.each([
    { name: '' },
    { name: 'x', extra: 1 },
    { isActive: 'si' },
    { isActive: false, createdAt: '2026-10-10T15:00:00.000Z' },
    'un texto',
    null,
    undefined,
  ])('AC-01: updateTableRequestSchema rechaza %s', (input) => {
    expect(updateTableRequestSchema.safeParse(input).success).toBe(false);
  });

  it('AC-02: TABLE_STATES es exactamente la lista de la spec', () => {
    expect(TABLE_STATES).toEqual(['free', 'occupied', 'ready', 'bill_requested']);
    const state: TableState = 'ready';
    expect(state).toBe('ready');
  });
  it.each(['free', 'occupied', 'ready', 'bill_requested'])(
    'AC-02: tableStateSchema acepta %s',
    (state) => {
      expect(tableStateSchema.parse(state)).toBe(state);
    },
  );
  it.each(['ocupada', 'libre', 'READY', 'Free', '', 'open', 0, null])(
    'AC-02: tableStateSchema rechaza %s',
    (input) => {
      expect(tableStateSchema.safeParse(input).success).toBe(false);
    },
  );

  it('AC-02: tableSchema acepta una mesa libre y una con su pedido embebido', () => {
    expect(tableSchema.parse(FREE_TABLE)).toEqual(FREE_TABLE);
    const occupied: Table = { ...FREE_TABLE, state: 'ready', order: EMBEDDED_ORDER };
    expect(tableSchema.parse(occupied)).toEqual(occupied);
    const inactive: Table = { ...FREE_TABLE, name: 'Dep\u00F3sito', isActive: false };
    expect(tableSchema.parse(inactive)).toEqual(inactive);
  });
  it.each([
    { ...FREE_TABLE, extra: 1 },
    { ...FREE_TABLE, state: 'ocupada' },
    { ...FREE_TABLE, state: 'READY' },
    { ...FREE_TABLE, order: { ...EMBEDDED_ORDER, extra: 1 } },
    { ...FREE_TABLE, order: { ...EMBEDDED_ORDER, status: 'abierto' } },
    { id: 1, name: 'Mesa 1', isActive: true, state: 'free' },
    { ...FREE_TABLE, isActive: 'si' },
    { ...FREE_TABLE, order: undefined },
    'una mesa',
    null,
  ])('AC-02: tableSchema rechaza %s', (input) => {
    expect(tableSchema.safeParse(input).success).toBe(false);
  });
  it('AC-02: tablesResponseSchema acepta la lista vacía o con mesas estrictas', () => {
    expect(tablesResponseSchema.parse({ tables: [] })).toEqual({ tables: [] });
    const response: TablesResponse = { tables: [FREE_TABLE] };
    expect(tablesResponseSchema.parse(response).tables).toHaveLength(1);
    expect(
      tablesResponseSchema.safeParse({ tables: [{ ...FREE_TABLE, position: 3 }] }).success,
    ).toBe(false);
    expect(tablesResponseSchema.safeParse({ tables: [], total: 0 }).success).toBe(false);
  });

  it('AC-02: ERROR_CODES suma los códigos de mesas y errorResponseSchema acepta sus cuerpos', () => {
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
    ])
      expect(ERROR_CODES).toHaveProperty(code, code);
    // 'TABLE_FREE' no es un código del sistema: la lista cerrada ERROR_CODES no lo
    // contiene (el "rechaza" de la spec, AC-02). errorResponseSchema acepta por
    // diseño cualquier código en mayúsculas: el filtro es la lista ERROR_CODES.
    expect(Object.values(ERROR_CODES)).not.toContain('TABLE_FREE');
    expect(errorResponseSchema.safeParse(TABLE_NAME_TAKEN_BODY).success).toBe(true);
    expect(errorResponseSchema.safeParse(TABLE_NOT_FOUND_BODY).success).toBe(true);
  });
});
