import { Sequelize } from 'sequelize';
import { getPostgresConnectionParts } from './postgres-url.ts';

/** Espera máxima por una conexión libre del pool, para no colgar la API si la base no responde. */
const POOL_ACQUIRE_TIMEOUT_MS = 10_000;

/** Espera máxima para abrir una conexión nueva con PostgreSQL. */
const CONNECTION_TIMEOUT_MS = 5_000;

/**
 * Crea la conexión a PostgreSQL. Sequelize conecta bajo demanda: crearla no abre ninguna
 * conexión, así que la API arranca aunque la base esté apagada.
 *
 * La conexión usa solo host, puerto, base, usuario y clave de la URL (spec 001, D-12): la query
 * (`?host=`, `?options=`, `?sslmode=`, etc.) se ignora por completo y la conexión va sin SSL
 * (S-12), porque PostgreSQL corre en la misma PC. Así lo que revisa assertTestDatabase es
 * exactamente a lo que se conecta. Se pasa la forma de objeto a Sequelize porque con una URL
 * copiaría toda la query a dialectOptions y tomaría `?host=` como host.
 *
 * Fechas en UTC (`timezone`) y columnas en snake_case (`underscored`), según la spec 001 (D-10).
 * No registra consultas en el log: las URL y los parámetros no deben aparecer en ninguna salida.
 */
export function createSequelize(databaseUrl: string): Sequelize {
  const connection = getPostgresConnectionParts(databaseUrl);

  if (connection === undefined) {
    // Error nuevo y sin `cause`: el TypeError de `new URL` trae el valor recibido en `input`.
    throw new Error('La URL de la base de datos no es válida.');
  }

  return new Sequelize({
    dialect: 'postgres',
    ...connection,
    logging: false,
    timezone: '+00:00',
    define: { underscored: true },
    pool: { acquire: POOL_ACQUIRE_TIMEOUT_MS },
    dialectOptions: { connectionTimeoutMillis: CONNECTION_TIMEOUT_MS, ssl: false },
  });
}
