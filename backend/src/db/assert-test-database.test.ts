import { describe, expect, it } from 'vitest';
import { UnsafeTestDatabaseError, assertTestDatabase } from './assert-test-database.ts';

const SECRET = 'Secreta_123';
const MESSAGE_START =
  'Por seguridad, las pruebas solo pueden usar una base cuyo nombre termine en _test.';
const BASE = `postgres://polleria:${SECRET}@localhost:5432`;

function getUnsafeError(value: string | undefined): UnsafeTestDatabaseError {
  let thrown: unknown;
  try {
    assertTestDatabase(value);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(UnsafeTestDatabaseError);
  return thrown as UnsafeTestDatabaseError;
}

describe('assertTestDatabase: URLs aceptadas', () => {
  it.each([
    ['postgres:// con localhost', 'postgres://polleria:clave@localhost:5432/polleria_test'],
    ['postgresql:// con 127.0.0.1', 'postgresql://polleria:clave@127.0.0.1:5432/polleria_test'],
    [
      'un parámetro inofensivo (sslmode)',
      'postgres://polleria:clave@localhost:5432/polleria_test?sslmode=disable',
    ],
  ])('AC-10: acepta %s y devuelve polleria_test', (_nombre, url) => {
    expect(() => assertTestDatabase(url)).not.toThrow();
    expect(assertTestDatabase(url)).toBe('polleria_test');
  });

  it('AC-10: devuelve el nombre de otra base de pruebas válida', () => {
    expect(assertTestDatabase('postgres://polleria:clave@localhost:5432/otra_base2_test')).toBe(
      'otra_base2_test',
    );
  });
});

describe('assertTestDatabase: valores rechazados', () => {
  it.each([
    ['la base de desarrollo', `${BASE}/polleria_dev`],
    ['una URL sin nombre de base', BASE],
    ['una URL sin nombre de base y con barra final', `${BASE}/`],
    ['un nombre que no termina en _test', `${BASE}/polleria_test_copia`],
    ['un nombre con mayúsculas', `${BASE}/polleria_TEST`],
    ['un nombre que es solo "test"', `${BASE}/test`],
    ['un nombre codificado (polleria%5Ftest)', `${BASE}/polleria%5Ftest`],
    ['el parámetro database que cambia la base', `${BASE}/polleria_test?database=polleria_dev`],
    ['el parámetro dbname que cambia la base', `${BASE}/polleria_test?dbname=polleria_dev`],
    ['otro protocolo (mysql)', `mysql://polleria:${SECRET}@localhost/polleria_test`],
    ['un texto que no es URL', SECRET],
  ])('AC-11: rechaza %s sin filtrar la clave ni la URL', (_nombre, url) => {
    const error = getUnsafeError(url);

    expect(error).toBeInstanceOf(Error);
    expect(error.message.startsWith(MESSAGE_START)).toBe(true);
    expect(error.message).not.toContain(SECRET);
    expect(error.message).not.toContain(url);
  });

  it.each([
    ['una cadena vacía', ''],
    ['undefined', undefined],
  ])('AC-11: rechaza %s', (_nombre, value) => {
    const error = getUnsafeError(value);

    expect(error.message.startsWith(MESSAGE_START)).toBe(true);
  });

  it('AC-11: el nombre de la base se compara sin decodificar ni normalizar', () => {
    expect(() => assertTestDatabase(`${BASE}/polleria_test%20`)).toThrow(UnsafeTestDatabaseError);
    expect(() => assertTestDatabase(`${BASE}/polleria-test`)).toThrow(UnsafeTestDatabaseError);
    expect(() => assertTestDatabase(`${BASE}/_test`)).toThrow(UnsafeTestDatabaseError);
  });
});
