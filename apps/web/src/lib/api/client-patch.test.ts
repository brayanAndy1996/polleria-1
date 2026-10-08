import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../tests/msw-server.ts';
import { ApiError, createApiClient } from './client.ts';

const errorBody = (code = 'UNAUTHENTICATED', details: unknown = null) => ({
  error: { code, message: 'Mensaje de prueba.', details },
});

describe('004: cliente PATCH', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });
  it('AC-19: PATCH envía el JSON al mismo origen y devuelve el cuerpo', async () => {
    const seen = vi.fn();
    server.use(
      http.patch('*/api/users/3', async ({ request }) => {
        expect(request.method).toBe('PATCH');
        expect(request.url).toBe(`${window.location.origin}/api/users/3`);
        expect(request.credentials).toBe('same-origin');
        expect(request.headers.get('Content-Type')).toBe('application/json');
        seen(await request.json());
        return HttpResponse.json({ ok: true });
      }),
    );
    const client = createApiClient();
    expect(
      await client.request('/users/3', { method: 'PATCH', body: { isActive: false } }),
    ).toEqual({ ok: true });
    expect(seen).toHaveBeenCalledExactlyOnceWith({ isActive: false });
  });
  it('AC-19: PATCH respeta expectedStatus y devuelve undefined con 204', async () => {
    server.use(http.patch('*/api/users/3', () => new HttpResponse(null, { status: 204 })));
    const client = createApiClient();
    await expect(
      client.request('/users/3', { method: 'PATCH', expectedStatus: 204 }),
    ).resolves.toBeUndefined();
    server.use(http.patch('*/api/users/3', () => HttpResponse.json({ ok: true })));
    await expect(
      client.request('/users/3', { method: 'PATCH', expectedStatus: 204 }),
    ).rejects.toMatchObject({ code: 'UNEXPECTED_RESPONSE' });
  });
  it('AC-19: PATCH llama al manejador de sesión solo con 401 UNAUTHENTICATED', async () => {
    const onUnauthenticated = vi.fn();
    const client = createApiClient({ onUnauthenticated });
    server.use(http.patch('*/api/users/3', () => HttpResponse.json(errorBody(), { status: 401 })));
    await expect(client.request('/users/3', { method: 'PATCH' })).rejects.toBeInstanceOf(ApiError);
    await expect(client.request('/users/3', { method: 'PATCH' })).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED',
      message: 'Mensaje de prueba.',
      details: null,
    });
    expect(onUnauthenticated).toHaveBeenCalledTimes(2);
    server.use(
      http.patch('*/api/users/3', () =>
        HttpResponse.json(errorBody('UNAUTHENTICATED'), { status: 403 }),
      ),
    );
    await expect(client.request('/users/3', { method: 'PATCH' })).rejects.toMatchObject({
      status: 403,
      code: 'UNAUTHENTICATED',
    });
    expect(onUnauthenticated).toHaveBeenCalledTimes(2);
  });
  it.each([
    [404, 'USER_NOT_FOUND', null],
    [409, 'LAST_ADMIN_REQUIRED', null],
    [409, 'USERNAME_TAKEN', null],
    [400, 'VALIDATION_ERROR', { issues: [{ path: 'pin', message: 'Mensaje.' }] }],
  ])(
    'AC-19: PATCH conserva code y details del error %s %s',
    async (status, code, details) => {
      server.use(
        http.patch('*/api/users/3', () =>
          HttpResponse.json(errorBody(code, details), { status }),
        ),
      );
      await expect(
        createApiClient().request('/users/3', { method: 'PATCH' }),
      ).rejects.toMatchObject({ status, code, details });
    },
  );
});
