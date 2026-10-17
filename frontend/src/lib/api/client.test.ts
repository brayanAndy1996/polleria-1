import { HttpResponse, delay, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../tests/msw-server.ts';
import { ApiError, DEFAULT_API_TIMEOUT_MS, apiClient, createApiClient } from './client.ts';
import { hardNavigate } from '../navigation.ts';

vi.mock('../navigation.ts', () => ({ hardNavigate: vi.fn() }));
const errorBody = (code = 'UNAUTHENTICATED', details: unknown = null) => ({
  error: { code, message: 'Mensaje de prueba.', details },
});

describe('003: cliente HTTP', () => {
  afterEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/');
  });
  it('AC-28: usa el mismo origen, credenciales y JSON; acepta respuestas 204', async () => {
    expect(DEFAULT_API_TIMEOUT_MS).toBe(10000);
    server.use(
      http.get('*/api/auth/me', ({ request }) => {
        expect(request.url).toBe(`${window.location.origin}/api/auth/me`);
        expect(request.credentials).toBe('same-origin');
        expect(request.headers.get('Accept')).toBe('application/json');
        return HttpResponse.json({ ok: true });
      }),
    );
    const client = createApiClient();
    expect(await client.request('/auth/me')).toEqual({ ok: true });
    server.use(
      http.post('*/api/auth/login', async ({ request }) => {
        expect(request.headers.get('Content-Type')).toBe('application/json');
        expect(await request.text()).toBe('{"a":1}');
        return new HttpResponse(null, { status: 204 });
      }),
    );
    expect(await client.request('/auth/login', { method: 'POST', body: { a: 1 } })).toBeUndefined();
  });
  it('AC-28: conserva errores y redirige solo UNAUTHENTICATED si no se omite la guardia', async () => {
    const onUnauthenticated = vi.fn();
    const client = createApiClient({ onUnauthenticated });
    server.use(http.get('*/api/auth/me', () => HttpResponse.json(errorBody(), { status: 401 })));
    const firstUnauthorized = client.request('/auth/me');
    await expect(firstUnauthorized).rejects.toBeInstanceOf(ApiError);
    await expect(firstUnauthorized).rejects.toBeInstanceOf(Error);
    await expect(firstUnauthorized).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED',
      message: 'Mensaje de prueba.',
      details: null,
    });
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
    await expect(client.request('/auth/me', { skipAuthRedirect: true })).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json(errorBody('INVALID_CREDENTIALS'), { status: 401 }),
      ),
    );
    await expect(client.request('/auth/me')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json(errorBody('TOO_MANY_ATTEMPTS', { retryAfterSeconds: 900 }), {
          status: 429,
        }),
      ),
    );
    await expect(client.request('/auth/me')).rejects.toMatchObject({
      status: 429,
      details: { retryAfterSeconds: 900 },
    });
  });
  it.each([200, 500])(
    'AC-28: una respuesta no JSON de estado %s es un error controlado',
    async (status) => {
      server.use(
        http.get('*/api/auth/me', () => new HttpResponse('<html>Error</html>', { status })),
      );
      await expect(createApiClient().request('/auth/me')).rejects.toMatchObject({
        status,
        code: 'UNEXPECTED_RESPONSE',
        message: 'Respuesta inesperada del servidor. Intenta nuevamente.',
      });
    },
  );
  it('AC-28: transforma errores de red y tiempos límite en NETWORK_ERROR', async () => {
    const client = createApiClient({ timeoutMs: 50 });
    server.use(http.get('*/api/auth/me', () => HttpResponse.error()));
    await expect(client.request('/auth/me')).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'Sin conexión con el servidor. Revisa el wifi e intenta de nuevo.',
    });
    server.use(
      http.get('*/api/auth/me', async () => {
        await delay('infinite');
        return HttpResponse.json({});
      }),
    );
    await expect(client.request('/auth/me')).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK_ERROR',
    });
  });
  it('AC-28: el cliente por defecto recarga en login salvo cuando ya está allí', async () => {
    server.use(http.get('*/api/auth/me', () => HttpResponse.json(errorBody(), { status: 401 })));
    window.history.replaceState({}, '', '/mozo');
    await expect(apiClient.request('/auth/me')).rejects.toBeInstanceOf(ApiError);
    expect(hardNavigate).toHaveBeenCalledWith('/login');
    vi.mocked(hardNavigate).mockClear();
    window.history.replaceState({}, '', '/login');
    await expect(apiClient.request('/auth/me')).rejects.toBeInstanceOf(ApiError);
    expect(hardNavigate).not.toHaveBeenCalled();
  });
});
