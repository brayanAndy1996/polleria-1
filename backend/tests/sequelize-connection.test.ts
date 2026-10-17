import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize';
import { afterEach, describe, expect, it } from 'vitest';
import { assertTestDatabase } from '../src/db/assert-test-database.ts';
import { createSequelize } from '../src/db/sequelize.ts';
import {
  closeTestDatabase,
  connectTestDatabase,
  getTestDatabaseUrl,
} from './helpers/test-database.ts';

/** Ejecuta una consulta de una sola columna y fila, y devuelve su valor como texto. */
async function readValue(sequelize: Sequelize, sql: string, column: string): Promise<string> {
  const rows = await sequelize.query<Record<string, string>>(sql, { type: QueryTypes.SELECT });
  return rows[0]?.[column] ?? '';
}

describe('createSequelize con una URL de polleria_test que trae parámetros en la query', () => {
  const opened: Sequelize[] = [];

  afterEach(async () => {
    for (const sequelize of opened.splice(0)) {
      await closeTestDatabase(sequelize);
    }
  });

  it('AC-40: la conexión ignora host, options y application_name de la query y va a la base de la URL original', async () => {
    const originalUrl = getTestDatabaseUrl();
    const databaseName = assertTestDatabase(originalUrl);

    // Se agregan los parámetros conservando los que ya tuviera la URL.
    const attackUrl = new URL(originalUrl);
    attackUrl.searchParams.set('host', 'host-ajeno.invalid');
    attackUrl.searchParams.set('options', '-c search_path=esquema_ajeno');
    attackUrl.searchParams.set('application_name', 'polleria_ataque');

    const reference = await connectTestDatabase();
    opened.push(reference);
    const withParameters = createSequelize(attackUrl.toString());
    opened.push(withParameters);

    // Se abre sin error: no intenta conectar con host-ajeno.invalid.
    await withParameters.authenticate();

    expect(await readValue(withParameters, 'SHOW search_path', 'search_path')).toBe(
      await readValue(reference, 'SHOW search_path', 'search_path'),
    );
    expect(
      await readValue(withParameters, "SELECT current_setting('application_name') AS name", 'name'),
    ).not.toBe('polleria_ataque');
    expect(await readValue(withParameters, 'SELECT current_database() AS name', 'name')).toBe(
      databaseName,
    );
  });
});
