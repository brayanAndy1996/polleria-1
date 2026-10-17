import { HttpResponse, delay, http } from 'msw';
import type { HttpResponseResolver } from 'msw';
import { server } from './msw-server.ts';

/** Patrón con comodín: no depende del origen que use jsdom. */
export const HEALTH_PATH_PATTERN = '*/api/health';

export const VALID_TIMESTAMP = '2026-10-07T20:00:00.000Z';

export const HEALTH_OK_BODY = { status: 'ok', database: 'ok', timestamp: VALID_TIMESTAMP };
export const HEALTH_ERROR_BODY = { status: 'error', database: 'error', timestamp: VALID_TIMESTAMP };

/** Reemplaza la respuesta de GET /api/health con el resolver dado. */
export function mockHealth(resolver: HttpResponseResolver): void {
  server.use(http.get(HEALTH_PATH_PATTERN, resolver));
}

/** API y base responden: 200 con HealthResponse válido. */
export function respondHealthOk(): void {
  mockHealth(() => HttpResponse.json(HEALTH_OK_BODY, { status: 200 }));
}

/** API arriba, base caída: 503 con HealthResponse válido. */
export function respondHealthDatabaseDown(): void {
  mockHealth(() => HttpResponse.json(HEALTH_ERROR_BODY, { status: 503 }));
}

/** Error de red (servidor inalcanzable). */
export function respondNetworkError(): void {
  mockHealth(() => HttpResponse.error());
}

/** Respuesta que nunca llega. */
export function respondNever(): void {
  mockHealth(async () => {
    await delay('infinite');
    return HttpResponse.json(HEALTH_OK_BODY);
  });
}

export interface DeferredHealth {
  /** Deja pasar la respuesta pendiente con el cuerpo dado (200 válido por defecto). */
  release: (response?: Response) => void;
  /** Cantidad de solicitudes recibidas. */
  readonly calls: number;
}

/** Responde solo cuando la prueba llama a release(): sirve para ver el estado "en curso". */
export function respondDeferred(): DeferredHealth {
  let calls = 0;
  const waiting: ((response: Response) => void)[] = [];

  mockHealth(() => {
    calls += 1;
    return new Promise<Response>((resolve) => {
      waiting.push(resolve);
    });
  });

  return {
    release: (response = HttpResponse.json(HEALTH_OK_BODY, { status: 200 })) => {
      for (const resolve of waiting.splice(0)) {
        resolve(response.clone());
      }
    },
    get calls() {
      return calls;
    },
  };
}

/** Responde 200 válido y cuenta las solicitudes recibidas. */
export function respondHealthOkCounting(): { readonly calls: number } {
  let calls = 0;
  mockHealth(() => {
    calls += 1;
    return HttpResponse.json(HEALTH_OK_BODY, { status: 200 });
  });
  return {
    get calls() {
      return calls;
    },
  };
}
