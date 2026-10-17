import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import {
  HEALTH_ERROR_BODY,
  HEALTH_OK_BODY,
  VALID_TIMESTAMP,
  mockHealth,
} from '../../../tests/health-mocks.ts';
import { DEFAULT_HEALTH_TIMEOUT_MS, getServerStatus } from './health.ts';
import type { ServerConnectionStatus } from './health.ts';

const HTML_PAGE = '<!doctype html><html><body><h1>Error del servidor</h1></body></html>';

describe('getServerStatus: respuestas de la API', () => {
  it('AC-25: 200 con un HealthResponse válido devuelve connected', async () => {
    mockHealth(() => HttpResponse.json(HEALTH_OK_BODY, { status: 200 }));

    await expect(getServerStatus()).resolves.toBe('connected' satisfies ServerConnectionStatus);
  });

  it('AC-25: 503 con un HealthResponse válido devuelve databaseDown', async () => {
    mockHealth(() => HttpResponse.json(HEALTH_ERROR_BODY, { status: 503 }));

    await expect(getServerStatus()).resolves.toBe('databaseDown' satisfies ServerConnectionStatus);
  });

  it.each([
    [
      '500 con el formato común de error',
      () =>
        HttpResponse.json(
          {
            error: {
              code: 'INTERNAL_ERROR',
              message: 'Ocurrió un error inesperado. Intenta nuevamente.',
              details: null,
            },
          },
          { status: 500 },
        ),
    ],
    ['502 sin cuerpo', () => new HttpResponse(null, { status: 502 })],
    [
      '404 con el formato común de error',
      () =>
        HttpResponse.json(
          { error: { code: 'NOT_FOUND', message: 'La ruta solicitada no existe.', details: null } },
          { status: 404 },
        ),
    ],
    [
      '200 con HTML',
      () => new HttpResponse(HTML_PAGE, { status: 200, headers: { 'Content-Type': 'text/html' } }),
    ],
    [
      '503 con HTML (por ejemplo, la página de error de un proxy)',
      () => new HttpResponse(HTML_PAGE, { status: 503, headers: { 'Content-Type': 'text/html' } }),
    ],
    ['200 con un cuerpo que no cumple healthResponseSchema', () => HttpResponse.json({ ok: true })],
    [
      '200 con un campo adicional en el cuerpo',
      () => HttpResponse.json({ ...HEALTH_OK_BODY, databaseUrl: 'postgres://x' }, { status: 200 }),
    ],
    [
      '200 con un timestamp que no es ISO 8601 UTC',
      () =>
        HttpResponse.json(
          { status: 'ok', database: 'ok', timestamp: '07/10/2026' },
          { status: 200 },
        ),
    ],
    [
      '503 con un cuerpo que no cumple healthResponseSchema',
      () => HttpResponse.json({ message: 'Servicio no disponible' }, { status: 503 }),
    ],
    ['200 con status error', () => HttpResponse.json(HEALTH_ERROR_BODY, { status: 200 })],
    ['200 sin cuerpo', () => new HttpResponse(null, { status: 200 })],
    ['un error de red', () => HttpResponse.error()],
  ])('AC-25: %s devuelve unreachable', async (_nombre, resolver) => {
    mockHealth(resolver);

    await expect(getServerStatus()).resolves.toBe('unreachable' satisfies ServerConnectionStatus);
  });
});

describe('getServerStatus: tiempo límite', () => {
  it('AC-25: sin respuesta antes de timeoutMs (50) devuelve unreachable sin lanzar', async () => {
    mockHealth(() => new Promise<Response>(() => undefined));

    const startedAt = performance.now();
    const status = await getServerStatus({ timeoutMs: 50 });
    const elapsedMs = performance.now() - startedAt;

    expect(status).toBe('unreachable');
    expect(elapsedMs).toBeLessThan(2000);
  });

  it('AC-25: una respuesta que llega antes de timeoutMs se interpreta con normalidad', async () => {
    mockHealth(() => HttpResponse.json(HEALTH_OK_BODY, { status: 200 }));

    await expect(getServerStatus({ timeoutMs: 2000 })).resolves.toBe('connected');
  });

  it('AC-25: DEFAULT_HEALTH_TIMEOUT_MS vale 5000', () => {
    expect(DEFAULT_HEALTH_TIMEOUT_MS).toBe(5000);
  });
});

describe('getServerStatus: la solicitud', () => {
  it('AC-25: es un GET a /api/health del mismo origen de la página', async () => {
    const received: Request[] = [];
    mockHealth(({ request }) => {
      received.push(request.clone());
      return HttpResponse.json(HEALTH_OK_BODY, { status: 200 });
    });

    await getServerStatus();

    expect(received).toHaveLength(1);
    expect(received[0]?.method).toBe('GET');
    expect(received[0]?.url).toBe(`${window.location.origin}/api/health`);
  });

  it('AC-25: no reutiliza una respuesta anterior: cada llamada hace una solicitud nueva', async () => {
    let calls = 0;
    mockHealth(() => {
      calls += 1;
      return calls === 1
        ? HttpResponse.json(HEALTH_OK_BODY, { status: 200 })
        : HttpResponse.json(
            { status: 'error', database: 'error', timestamp: VALID_TIMESTAMP },
            { status: 503 },
          );
    });

    const first = await getServerStatus();
    const second = await getServerStatus();

    expect(first).toBe('connected');
    expect(second).toBe('databaseDown');
    expect(calls).toBe(2);
  });
});
