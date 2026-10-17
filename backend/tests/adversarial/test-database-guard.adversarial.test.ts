/**
 * Ataques a la guardia de la base de pruebas (adversarial-tester, spec 001, RN-001-02 / AC-10-11).
 *
 * La guardia (assertTestDatabase) solo inspecciona el NOMBRE de la base y los parámetros
 * `database` y `dbname`. Pero Sequelize, al construir la conexión a partir de la misma URL, honra
 * otros parámetros de la query que cambian a DÓNDE se conecta:
 *   - `?host=` redirige la conexión a otro servidor.
 *   - `?options=` inyecta opciones de libpq (por ejemplo `-c search_path=...`).
 *
 * Resultado: una URL puede pasar la guardia ("es polleria_test") y, en la práctica, conectar a un
 * host o a un esquema distintos del esperado. La segunda barrera (SELECT current_database()) tampoco
 * lo detecta, porque el nombre de la base sigue siendo polleria_test. Estos tests demuestran el
 * hueco comparando lo que acepta la guardia con lo que resuelve Sequelize.
 *
 * No abren ninguna conexión: createSequelize conecta bajo demanda, así que solo se lee su config.
 */
import type { Sequelize } from 'sequelize';
import { describe, expect, it } from 'vitest';
import { assertTestDatabase } from '../../src/db/assert-test-database.ts';
import { createSequelize } from '../../src/db/sequelize.ts';

interface ResolvedConnection {
  host?: string;
  database: string;
  dialectOptions?: { options?: unknown };
}

/** Lee la configuración que Sequelize usaría para conectar, sin abrir ninguna conexión. */
function resolveConnection(url: string): ResolvedConnection {
  const sequelize: Sequelize = createSequelize(url);
  const config = sequelize.config as unknown as {
    host?: string;
    database: string;
    dialectOptions?: { options?: unknown };
  };
  return { host: config.host, database: config.database, dialectOptions: config.dialectOptions };
}

describe('Bypass de la guardia por parámetros de conexión que Sequelize honra', () => {
  // ADV-001-04 (Medio): la guardia acepta una URL con ?host= y Sequelize redirige el host.
  it('ADV-001-04: una URL aceptada por la guardia no debería redirigir el host de conexión', () => {
    const url = 'postgres://polleria:clave@localhost:5432/polleria_test?host=host-ajeno.example';

    // La guardia la acepta: solo mira el nombre de la base.
    expect(assertTestDatabase(url)).toBe('polleria_test');

    // Pero el host efectivo de conexión lo toma Sequelize del parámetro ?host=.
    const resolved = resolveConnection(url);
    // Propiedad de seguridad deseada: el host efectivo debe ser el de la URL (localhost), no uno
    // tomado de un parámetro que la guardia nunca validó.
    expect(resolved.host).toBe('localhost');
  });

  // ADV-001-05 (Bajo): la guardia acepta ?options= y Sequelize inyecta opciones de libpq que pueden
  // cambiar el esquema activo (search_path) dentro de polleria_test.
  it('ADV-001-05: una URL aceptada por la guardia no debería inyectar opciones de libpq', () => {
    const url =
      'postgres://polleria:clave@localhost:5432/polleria_test?options=-c%20search_path%3Devil';

    expect(assertTestDatabase(url)).toBe('polleria_test');

    const resolved = resolveConnection(url);
    // Propiedad deseada: no debe llegar un `options` de libpq que la guardia no revisó.
    expect(resolved.dialectOptions?.options).toBeUndefined();
  });
});
