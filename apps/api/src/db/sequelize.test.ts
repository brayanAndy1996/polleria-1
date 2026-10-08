import { inspect } from 'node:util';
import type { Sequelize } from 'sequelize';
import { describe, expect, it } from 'vitest';
import { assertTestDatabase } from './assert-test-database.ts';
import { createSequelize } from './sequelize.ts';

/** Lo que Sequelize usaría para conectar. Crear la instancia no abre ninguna conexión. */
interface ResolvedConnection {
  host: unknown;
  port: unknown;
  database: unknown;
  username: unknown;
  password: unknown;
  dialectOptions: unknown;
}

/** Lee la configuración resuelta de la instancia y la cierra: ninguna prueba abre conexiones. */
async function resolveConnection(url: string): Promise<ResolvedConnection> {
  const sequelize = createSequelize(url);
  try {
    const config = sequelize.config as unknown as ResolvedConnection;
    return {
      host: config.host,
      port: config.port,
      database: config.database,
      username: config.username,
      password: config.password,
      dialectOptions: config.dialectOptions,
    };
  } finally {
    await sequelize.close();
  }
}

const EXPECTED_DIALECT_OPTIONS = { connectionTimeoutMillis: 5000, ssl: false };

const HOST_IN_QUERY_URL =
  'postgres://polleria:clave@localhost:5432/polleria_test?host=host-ajeno.example';
const LIBPQ_OPTIONS_URL =
  'postgres://polleria:clave@localhost:5432/polleria_test?options=-c%20search_path%3Devil';

describe('createSequelize: la conexión usa solo las partes del URL', () => {
  it.each([
    {
      caso: 'host en la query',
      url: HOST_IN_QUERY_URL,
      expected: {
        host: 'localhost',
        port: 5432,
        database: 'polleria_test',
        username: 'polleria',
        password: 'clave',
      },
    },
    {
      caso: 'opciones de libpq en la query',
      url: LIBPQ_OPTIONS_URL,
      expected: {
        host: 'localhost',
        port: 5432,
        database: 'polleria_test',
        username: 'polleria',
        password: 'clave',
      },
    },
    {
      caso: 'muchos parámetros en la query',
      url:
        'postgresql://polleria:clave%40123@127.0.0.1/polleria_dev?sslmode=require' +
        '&application_name=x&statement_timeout=1&port=6000&user=otro&password=otra' +
        '&dbname=otra&database=otra',
      expected: {
        host: '127.0.0.1',
        port: 5432,
        database: 'polleria_dev',
        username: 'polleria',
        password: 'clave@123',
      },
    },
    {
      caso: 'IPv6 (sin corchetes en el host)',
      url: 'postgres://polleria:clave@[::1]:5433/polleria_test',
      expected: {
        host: '::1',
        port: 5433,
        database: 'polleria_test',
        username: 'polleria',
        password: 'clave',
      },
    },
    {
      caso: 'sin host (usa localhost)',
      url: 'postgres:///polleria_test',
      expected: { host: 'localhost', port: 5432, database: 'polleria_test' },
    },
  ])(
    'AC-39: $caso: host, puerto (número), base, usuario y clave salen solo del URL y dialectOptions es exactamente { connectionTimeoutMillis: 5000, ssl: false }',
    async ({ url, expected }) => {
      const resolved = await resolveConnection(url);

      expect(resolved).toMatchObject(expected);
      expect(resolved.dialectOptions).toStrictEqual(EXPECTED_DIALECT_OPTIONS);
    },
  );

  it.each([
    ['host en la query', HOST_IN_QUERY_URL],
    ['opciones de libpq en la query', LIBPQ_OPTIONS_URL],
  ])(
    'AC-39: assertTestDatabase sigue aceptando la URL con %s y devuelve polleria_test',
    (_caso, url) => {
      expect(assertTestDatabase(url)).toBe('polleria_test');
    },
  );
});

describe('createSequelize: URL inválida', () => {
  const SECRET = 'Secreta_123';
  const INVALID_URL_MESSAGE = 'La URL de la base de datos no es válida.';

  async function getError(url: string): Promise<Error> {
    let thrown: unknown;
    let created: Sequelize | undefined;
    try {
      created = createSequelize(url);
    } catch (error) {
      thrown = error;
    }
    // Si createSequelize no rechazó la URL, la instancia no debe quedar abierta.
    await created?.close();
    expect(thrown).toBeInstanceOf(Error);
    return thrown as Error;
  }

  it.each([
    ['un protocolo que no es PostgreSQL', `mysql://polleria:${SECRET}@localhost/polleria_test`],
    ['un texto que no es URL', SECRET],
    ['una URL sin nombre de base', `postgres://polleria:${SECRET}@localhost:5432`],
  ])(
    'AC-41: %s lanza el Error "La URL de la base de datos no es válida." sin filtrar la clave',
    async (_caso, url) => {
      const error = await getError(url);

      expect(error.message).toBe(INVALID_URL_MESSAGE);
      expect(error.message).not.toContain(SECRET);
      expect(error.stack ?? '').not.toContain(SECRET);
      // Todas las propiedades del error, también las ocultas y las de error.cause.
      expect(inspect(error, { depth: Infinity, showHidden: true })).not.toContain(SECRET);
      if (error.cause !== undefined) {
        expect(inspect(error.cause, { depth: Infinity, showHidden: true })).not.toContain(SECRET);
      }
    },
  );
});
