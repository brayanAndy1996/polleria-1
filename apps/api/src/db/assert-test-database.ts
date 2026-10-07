import { getTestDatabaseName } from './postgres-url.ts';

/**
 * La URL recibida no apunta a una base de pruebas. El mensaje nunca incluye la URL ni la clave
 * (RN-001-01).
 */
export class UnsafeTestDatabaseError extends Error {
  constructor() {
    super(
      'Por seguridad, las pruebas solo pueden usar una base cuyo nombre termine en _test. ' +
        'Revisa DATABASE_URL_TEST en apps/api/.env.',
    );
    this.name = 'UnsafeTestDatabaseError';
  }
}

/**
 * Guardia de las pruebas (RN-001-02): acepta solo una URL de PostgreSQL cuya base termine en _test
 * y devuelve el nombre de esa base. Con cualquier otro valor lanza UnsafeTestDatabaseError.
 */
export function assertTestDatabase(databaseUrl: string | undefined): string {
  const databaseName = getTestDatabaseName(databaseUrl);

  if (databaseName === undefined) {
    throw new UnsafeTestDatabaseError();
  }

  return databaseName;
}
