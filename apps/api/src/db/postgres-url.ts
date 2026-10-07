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

interface PostgresUrlInfo {
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
