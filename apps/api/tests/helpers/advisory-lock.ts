/**
 * Helpers para probar el bloqueo consultivo de migraciones y seeds (spec 001, D-13, AC-42 a AC-44).
 *
 * La clave está escrita aquí a propósito y no se importa de migrator.ts: así las pruebas fijan la
 * clave documentada (registro de claves de bloqueo del proyecto) y no la que el código diga tener.
 *
 * El bloqueo "a mano" usa una transacción no administrada y pg_advisory_xact_lock: se suelta
 * siempre desde la misma conexión que lo tomó (commit o rollback) y PostgreSQL también lo suelta si
 * la conexión se cierra.
 */
import { QueryTypes } from 'sequelize';
import type { Sequelize, Transaction } from 'sequelize';

/** Clave documentada de las migraciones y los seeds (D-13). */
export const DOCUMENTED_LOCK_KEY = 2026100701;

/** Toma el bloqueo consultivo con una conexión propia y lo mantiene hasta release(). */
export class AdvisoryLockHolder {
  private readonly connection: Sequelize;
  private transaction: Transaction | undefined;

  constructor(connection: Sequelize) {
    this.connection = connection;
  }

  /** Toma el bloqueo exclusivo. Si otra conexión lo tiene, espera. */
  async acquire(): Promise<void> {
    const transaction = await this.connection.transaction();
    this.transaction = transaction;
    await this.connection.query(`SELECT pg_advisory_xact_lock(${String(DOCUMENTED_LOCK_KEY)})`, {
      transaction,
    });
  }

  /** Suelta el bloqueo. Se puede llamar varias veces y aunque nunca se haya tomado. */
  async release(): Promise<void> {
    const transaction = this.transaction;
    this.transaction = undefined;
    if (transaction === undefined) return;
    await transaction.commit().catch(async () => {
      await transaction.rollback().catch(() => undefined);
    });
  }
}

/**
 * Indica si el bloqueo está libre: otra conexión lo obtiene al instante (pg_try_advisory_xact_lock
 * dentro de una transacción) y lo suelta de inmediato con rollback.
 */
export async function isMigrationLockFree(connection: Sequelize): Promise<boolean> {
  const transaction = await connection.transaction();
  try {
    const rows = await connection.query<{ acquired: boolean }>(
      `SELECT pg_try_advisory_xact_lock(${String(DOCUMENTED_LOCK_KEY)}) AS acquired`,
      { type: QueryTypes.SELECT, transaction },
    );
    return rows[0]?.acquired === true;
  } finally {
    await transaction.rollback();
  }
}
