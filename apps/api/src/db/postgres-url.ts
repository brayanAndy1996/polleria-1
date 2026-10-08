/**
 * Reglas compartidas para las URL de PostgreSQL. Las usan loadConfig (config/env.ts) y
 * assertTestDatabase (db/assert-test-database.ts) para que haya una sola definición de qué es una
 * URL válida y qué es una base de pruebas.
 *
 * Ninguna función devuelve ni propaga la URL recibida: los llamadores arman sus mensajes sin ella.
 */

const POSTGRES_PROTOCOLS: ReadonlySet<string> = new Set(['postgres:', 'postgresql:']);

/** Parámetros de la URL que cambiarían la base a la que se conecta el driver. */
const DATABASE_OVERRIDE_PARAMS = ['database', 'dbname'] as const;

/** Nombre de una base de pruebas: minúsculas, números y guion bajo, terminado en _test. */
const TEST_DATABASE_NAME = /^[a-z0-9_]+_test$/;

/** Puerto de PostgreSQL cuando la URL no trae uno. */
const DEFAULT_POSTGRES_PORT = 5432;

/** Host cuando la URL no trae uno (por ejemplo postgres:///polleria_test). */
const DEFAULT_POSTGRES_HOST = 'localhost';

interface PostgresUrlInfo {
  url: URL;
  /** Path de la URL sin la barra inicial, sin decodificar. Nunca vacío. */
  databaseName: string;
  /** true si la URL trae un parámetro que cambia la base (database o dbname). */
  overridesDatabase: boolean;
}

function inspectPostgresUrl(value: string | undefined): PostgresUrlInfo | undefined {
  if (value === undefined) {
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }

  const databaseName = url.pathname.slice(1);
  if (!POSTGRES_PROTOCOLS.has(url.protocol) || databaseName === '') {
    return undefined;
  }

  return {
    url,
    databaseName,
    overridesDatabase: DATABASE_OVERRIDE_PARAMS.some((param) => url.searchParams.has(param)),
  };
}

/** true si es una URL postgres:// o postgresql:// que incluye el nombre de la base. */
export function isPostgresUrl(value: string | undefined): boolean {
  return inspectPostgresUrl(value) !== undefined;
}

/**
 * Devuelve el nombre de la base si la URL apunta a una base de pruebas (AC-11); si no, undefined.
 * Regla exacta: protocolo postgres: o postgresql:, sin los parámetros database ni dbname, y un
 * nombre que cumple `^[a-z0-9_]+_test$` comparado sin decodificar ni normalizar.
 */
export function getTestDatabaseName(value: string | undefined): string | undefined {
  const info = inspectPostgresUrl(value);

  if (info === undefined || info.overridesDatabase || !TEST_DATABASE_NAME.test(info.databaseName)) {
    return undefined;
  }

  return info.databaseName;
}

/** Las únicas partes de una URL de PostgreSQL con las que se abre una conexión (spec 001, D-12). */
export interface PostgresConnectionParts {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

/**
 * Devuelve host, puerto, base, usuario y clave de una URL postgres:// o postgresql:// con nombre de
 * base; si no cumple esa regla (la misma de isPostgresUrl) devuelve undefined. La query de la URL
 * se ignora por completo: lo que revisa la guardia de AC-10 y AC-11 es exactamente a lo que se
 * conecta.
 *
 * - host: el hostname de la URL; un IPv6 va sin corchetes; si viene vacío, 'localhost'.
 * - port: el de la URL como número; si no trae, 5432.
 * - database: el path sin la barra inicial, sin decodificar (como la guardia).
 * - username y password: decodificados (`%40` pasa como `@`). Un escape mal formado vuelve inválida
 *   la URL (undefined).
 *
 * Nunca devuelve ni propaga la URL recibida.
 */
export function getPostgresConnectionParts(
  value: string | undefined,
): PostgresConnectionParts | undefined {
  const info = inspectPostgresUrl(value);
  if (info === undefined) {
    return undefined;
  }

  const { url, databaseName } = info;

  let username: string;
  let password: string;
  try {
    username = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
  } catch {
    return undefined;
  }

  return {
    host: url.hostname.replace(/^\[(.*)\]$/, '$1') || DEFAULT_POSTGRES_HOST,
    port: url.port === '' ? DEFAULT_POSTGRES_PORT : Number(url.port),
    database: databaseName,
    username,
    password,
  };
}
