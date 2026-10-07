import { Sequelize } from 'sequelize';

/** Espera máxima por una conexión libre del pool, para no colgar la API si la base no responde. */
const POOL_ACQUIRE_TIMEOUT_MS = 10_000;

/** Espera máxima para abrir una conexión nueva con PostgreSQL. */
const CONNECTION_TIMEOUT_MS = 5_000;

/**
 * Crea la conexión a PostgreSQL. Sequelize conecta bajo demanda: crearla no abre ninguna
 * conexión, así que la API arranca aunque la base esté apagada.
 *
 * Fechas en UTC (`timezone`) y columnas en snake_case (`underscored`), según la spec 001 (D-10).
 * No registra consultas en el log: las URL y los parámetros no deben aparecer en ninguna salida.
 */
export function createSequelize(databaseUrl: string): Sequelize {
  return new Sequelize(databaseUrl, {
    dialect: 'postgres',
    logging: false,
    timezone: '+00:00',
    define: { underscored: true },
    pool: { acquire: POOL_ACQUIRE_TIMEOUT_MS },
    dialectOptions: { connectionTimeoutMillis: CONNECTION_TIMEOUT_MS },
  });
}
