import { describe, expect, it } from 'vitest';
import { ERROR_CODES, errorResponseSchema, healthResponseSchema } from './index.ts';

const TIMESTAMP = '2026-10-07T20:00:00.000Z';

describe('healthResponseSchema', () => {
  it.each([
    ['salud correcta', { status: 'ok', database: 'ok', timestamp: TIMESTAMP }],
    ['salud con error', { status: 'error', database: 'error', timestamp: TIMESTAMP }],
    ['API arriba y base caída', { status: 'ok', database: 'error', timestamp: TIMESTAMP }],
  ])('AC-02: acepta la respuesta de %s', (_nombre, value) => {
    expect(healthResponseSchema.safeParse(value).success).toBe(true);
  });

  it('AC-02: devuelve los mismos datos al validar una respuesta correcta', () => {
    const result = healthResponseSchema.safeParse({
      status: 'ok',
      database: 'ok',
      timestamp: TIMESTAMP,
    });

    expect(result.success).toBe(true);
    expect(result.data).toStrictEqual({ status: 'ok', database: 'ok', timestamp: TIMESTAMP });
  });

  it.each([
    [
      'un campo adicional (databaseUrl)',
      {
        status: 'ok',
        database: 'ok',
        timestamp: TIMESTAMP,
        databaseUrl: 'postgres://polleria:clave@localhost:5432/polleria_test',
      },
    ],
    ['status distinto de ok y error', { status: 'warn', database: 'ok', timestamp: TIMESTAMP }],
    ['database distinto de ok y error', { status: 'ok', database: 'down', timestamp: TIMESTAMP }],
    ['status con mayúsculas', { status: 'OK', database: 'ok', timestamp: TIMESTAMP }],
    ['status que no es texto', { status: true, database: 'ok', timestamp: TIMESTAMP }],
    ['sin status', { database: 'ok', timestamp: TIMESTAMP }],
    ['sin database', { status: 'ok', timestamp: TIMESTAMP }],
    ['sin timestamp', { status: 'ok', database: 'ok' }],
    ['timestamp con formato dd/mm/aaaa', { status: 'ok', database: 'ok', timestamp: '07/10/2026' }],
    [
      'timestamp con zona horaria -05:00',
      { status: 'ok', database: 'ok', timestamp: '2026-10-07T15:00:00-05:00' },
    ],
    [
      'timestamp con +00:00 en lugar del sufijo Z',
      { status: 'ok', database: 'ok', timestamp: '2026-10-07T20:00:00+00:00' },
    ],
    [
      'timestamp sin zona horaria',
      { status: 'ok', database: 'ok', timestamp: '2026-10-07T20:00:00' },
    ],
    ['timestamp solo con fecha', { status: 'ok', database: 'ok', timestamp: '2026-10-07' }],
    ['timestamp numérico', { status: 'ok', database: 'ok', timestamp: 1791403200000 }],
    ['un valor que no es objeto', 'ok'],
    ['null', null],
  ])('AC-02: rechaza %s', (_nombre, value) => {
    expect(healthResponseSchema.safeParse(value).success).toBe(false);
  });
});

describe('errorResponseSchema', () => {
  it.each([
    [
      'un error sin detalles',
      { error: { code: 'NOT_FOUND', message: 'La ruta solicitada no existe.', details: null } },
    ],
    [
      'un error de validación con lista de problemas',
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Los datos enviados no son válidos.',
          details: { issues: [{ path: 'name', message: 'Requerido' }] },
        },
      },
    ],
    [
      'un código que aún no está en ERROR_CODES',
      {
        error: {
          code: 'TEST_CONFLICT',
          message: 'Conflicto de prueba.',
          details: { field: 'x' },
        },
      },
    ],
  ])('AC-03: acepta %s', (_nombre, value) => {
    expect(errorResponseSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    ['falta error.code', { error: { message: 'La ruta solicitada no existe.', details: null } }],
    ['falta error.message', { error: { code: 'NOT_FOUND', details: null } }],
    [
      'falta error.details',
      { error: { code: 'NOT_FOUND', message: 'La ruta solicitada no existe.' } },
    ],
    ['message es una cadena vacía', { error: { code: 'NOT_FOUND', message: '', details: null } }],
    [
      'hay un campo adicional dentro de error',
      {
        error: {
          code: 'NOT_FOUND',
          message: 'La ruta solicitada no existe.',
          details: null,
          stack: 'Error: x\n    at archivo.ts:1:1',
        },
      },
    ],
    [
      'details es un texto',
      { error: { code: 'NOT_FOUND', message: 'La ruta solicitada no existe.', details: 'x' } },
    ],
    ['falta la clave error', {}],
    ['el valor no es un objeto', 'NOT_FOUND'],
  ])('AC-03: rechaza cuando %s', (_nombre, value) => {
    expect(errorResponseSchema.safeParse(value).success).toBe(false);
  });
});

describe('ERROR_CODES', () => {
  it('AC-03: contiene al menos los cinco códigos de la spec, cada clave con un valor igual a su nombre', () => {
    expect(ERROR_CODES).toMatchObject({
      NOT_FOUND: 'NOT_FOUND',
      INTERNAL_ERROR: 'INTERNAL_ERROR',
      VALIDATION_ERROR: 'VALIDATION_ERROR',
      INVALID_JSON: 'INVALID_JSON',
      PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
    });
  });

  it('AC-03: todas las claves de ERROR_CODES valen igual que su nombre y siguen MAYÚSCULAS_CON_GUION_BAJO', () => {
    const entries = Object.entries(ERROR_CODES);

    expect(entries.length).toBeGreaterThanOrEqual(5);
    for (const [key, value] of entries) {
      expect(value).toBe(key);
      expect(key).toMatch(/^[A-Z][A-Z0-9_]*$/);
    }
  });
});
