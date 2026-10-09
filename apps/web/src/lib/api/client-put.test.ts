import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../tests/msw-server.ts';
import { ApiError, createApiClient } from './client.ts';

const errorBody = (code = 'UNAUTHENTICATED', details: unknown = null) => ({
  error: { code, message: 'Mensaje de prueba.', details },
});

describe('008: cliente PUT', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });
  it('AC-04: PUT envía el JSON al mismo origen y devuelve el cuerpo', async () => {
    const seen = vi.fn();
    server.use(
      http.put('*/api/products/3/portions', async ({ request }) => {
        expect(request.method).toBe('PUT');
        expect(request.url).toBe(`${window.location.origin}/api/products/3/portions`);
        expect(request.credentials).toBe('same-origin');
        expect(request.headers.get('Content-Type')).toBe('application/json');
        seen(await request.json());
        return HttpResponse.json({ portions: [] });
      }),
    );
    const client = createApiClient();
    expect(
      await client.request('/products/3/portions', { method: 'PUT', body: { portions: [] } }),
    ).toEqual({ portions: [] });
    expect(seen).toHaveBeenCalledExactlyOnceWith({ portions: [] });
  });
  it('AC-04: PUT respeta expectedStatus: otro 2xx se rechaza como UNEXPECTED_RESPONSE', async () => {
    server.use(
      http.put('*/api/products/3/portions', () =>
        HttpResponse.json({ portions: [] }, { status: 201 }),
      ),
    );
    await expect(
      createApiClient().request('/products/3/portions', {
        method: 'PUT',
        expectedStatus: 200,
      }),
    ).rejects.toMatchObject({ code: 'UNEXPECTED_RESPONSE', status: 201 });
  });
  it('AC-04: PUT llama al manejador de sesión solo con 401 UNAUTHENTICATED', async () => {
    const onUnauthenticated = vi.fn();
    const client = createApiClient({ onUnauthenticated });
    server.use(
      http.put('*/api/products/3/portions', () => HttpResponse.json(errorBody(), { status: 401 })),
    );
    await expect(client.request('/products/3/portions', { method: 'PUT' })).rejects.toBeInstanceOf(
      ApiError,
    );
    await expect(client.request('/products/3/portions', { method: 'PUT' })).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED',
      message: 'Mensaje de prueba.',
      details: null,
    });
    expect(onUnauthenticated).toHaveBeenCalledTimes(2);
    server.use(
      http.put('*/api/products/3/portions', () =>
        HttpResponse.json(errorBody('UNAUTHENTICATED'), { status: 403 }),
      ),
    );
    await expect(client.request('/products/3/portions', { method: 'PUT' })).rejects.toMatchObject({
      status: 403,
      code: 'UNAUTHENTICATED',
    });
    expect(onUnauthenticated).toHaveBeenCalledTimes(2);
  });
  it.each([
    [404, 'PRODUCT_NOT_FOUND', null],
    [409, 'PORTIONS_NOT_ALLOWED', null],
    [409, 'COMBO_ITEMS_NOT_ALLOWED', null],
    [400, 'VALIDATION_ERROR', { issues: [{ path: 'portions.0.priceCents', message: 'Mensaje.' }] }],
  ])('AC-04: PUT conserva code y details del error %s %s', async (status, code, details) => {
    server.use(
      http.put('*/api/products/3/portions', () =>
        HttpResponse.json(errorBody(code, details), { status }),
      ),
    );
    await expect(
      createApiClient().request('/products/3/portions', { method: 'PUT' }),
    ).rejects.toMatchObject({ status, code, details });
  });
});
