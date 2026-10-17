import { healthResponseSchema } from '@polleria/shared';

/**
 * Cómo ve la web al sistema:
 * - connected: la API responde y la base de datos también.
 * - databaseDown: la API responde, pero no tiene conexión con la base de datos.
 * - unreachable: no hay una respuesta de salud válida (red caída, tiempo agotado, error del servidor).
 */
export type ServerConnectionStatus = 'connected' | 'databaseDown' | 'unreachable';

/** Tiempo máximo de espera de la consulta de salud (spec 001, S-10). */
export const DEFAULT_HEALTH_TIMEOUT_MS = 5000;

const HEALTH_PATH = '/api/health';

/**
 * Pregunta a GET /api/health (mismo origen de la página) y traduce la respuesta.
 * Nunca lanza: cualquier problema se reporta como 'unreachable'.
 */
export async function getServerStatus(
  options: { timeoutMs?: number } = {},
): Promise<ServerConnectionStatus> {
  const { timeoutMs = DEFAULT_HEALTH_TIMEOUT_MS } = options;

  // El temporizador cubre toda la solicitud, también la lectura del cuerpo.
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(`${window.location.origin}${HEALTH_PATH}`, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    const parsed = healthResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      return 'unreachable';
    }

    // El estado HTTP y el cuerpo deben coincidir; si se contradicen, no se confía en la respuesta.
    if (response.status === 200 && parsed.data.status === 'ok') {
      return 'connected';
    }
    if (response.status === 503 && parsed.data.status === 'error') {
      return 'databaseDown';
    }
    return 'unreachable';
  } catch {
    // Red caída, tiempo agotado (AbortError) o cuerpo que no es JSON.
    return 'unreachable';
  } finally {
    clearTimeout(timer);
  }
}
