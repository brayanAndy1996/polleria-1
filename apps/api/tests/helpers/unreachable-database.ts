import type { Sequelize } from 'sequelize';
import { createSequelize } from '../../src/db/sequelize.ts';

/** Clave inventada que ninguna respuesta, mensaje ni cabecera puede filtrar (RN-001-01). */
export const UNREACHABLE_DATABASE_SECRET = 'Clave_Secreta_99';

/** Puerto 1 de 127.0.0.1: no hay ningún servidor, así que la conexión siempre falla. */
export const UNREACHABLE_DATABASE_URL = `postgres://polleria:${UNREACHABLE_DATABASE_SECRET}@127.0.0.1:1/polleria_test`;

/**
 * Sequelize que apunta a una base inalcanzable. Conecta bajo demanda, así que crearlo no abre
 * ninguna conexión: sirve también para probar rutas que nunca tocan la base.
 */
export function createUnreachableSequelize(): Sequelize {
  return createSequelize(UNREACHABLE_DATABASE_URL);
}
