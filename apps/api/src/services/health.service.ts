import type { HealthResponse } from '@polleria/shared';
import type { Sequelize } from 'sequelize';

/** Tiempo máximo que /api/health espera a la base antes de responder que no está disponible. */
export const DEFAULT_HEALTH_TIMEOUT_MS = 2000;

export interface HealthServiceDependencies {
  sequelize: Pick<Sequelize, 'authenticate'>;
  timeoutMs?: number;
  now?: () => Date;
}

export interface HealthService {
  check: () => Promise<HealthResponse>;
}

type ComponentStatus = HealthResponse['database'];

/** Prueba la base. Nunca lanza ni espera más de timeoutMs; no devuelve mensajes del driver. */
async function pingDatabase(
  sequelize: Pick<Sequelize, 'authenticate'>,
  timeoutMs: number,
): Promise<ComponentStatus> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<ComponentStatus>((resolve) => {
    timer = setTimeout(() => {
      resolve('error');
    }, timeoutMs);
  });

  // La función async convierte también un fallo síncrono de authenticate() en un rechazo.
  const ping = (async (): Promise<ComponentStatus> => {
    await sequelize.authenticate();
    return 'ok';
  })();

  try {
    return await Promise.race([ping, timeout]);
  } catch {
    return 'error';
  } finally {
    clearTimeout(timer);
  }
}

/** Servicio de salud (D-06): consulta la base y devuelve un HealthResponse sin datos internos. */
export function createHealthService({
  sequelize,
  timeoutMs = DEFAULT_HEALTH_TIMEOUT_MS,
  now = () => new Date(),
}: HealthServiceDependencies): HealthService {
  return {
    check: async () => {
      const database = await pingDatabase(sequelize, timeoutMs);

      return { status: database, database, timestamp: now().toISOString() };
    },
  };
}
