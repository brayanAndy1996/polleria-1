import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../tests/msw-server.ts';
import { createUser, getUsers, resetUserPin, updateUser } from './users.ts';

const ADMIN_USER = {
  id: 6,
  username: 'mozo.nuevo',
  displayName: 'Ana',
  roles: ['waiter'],
  isActive: true,
};
const errorBody = (code: string, message: string, details: unknown = null) => ({
  error: { code, message, details },
});

describe('004: funciones de la API de usuarios', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });
  it('AC-19: getUsers pide la lista y la valida con el esquema', async () => {
    server.use(
      http.get('*/api/users', ({ request }) => {
        expect(request.url).toBe(`${window.location.origin}/api/users`);
        expect(request.method).toBe('GET');
        return HttpResponse.json({ users: [ADMIN_USER] });
      }),
    );
    await expect(getUsers()).resolves.toEqual([ADMIN_USER]);
  });
  it.each([{ users: [{ ...ADMIN_USER, pinHash: 'x' }] }, { users: [], extra: 1 }, { lista: [] }])(
    'AC-19: getUsers rechaza la respuesta mal formada %s',
    async (body) => {
      server.use(http.get('*/api/users', () => HttpResponse.json(body)));
      await expect(getUsers()).rejects.toMatchObject({ code: 'UNEXPECTED_RESPONSE' });
    },
  );
  it('AC-19: createUser hace POST con el cuerpo y exige 201 con AdminUser válido', async () => {
    const seen = vi.fn();
    server.use(
      http.post('*/api/users', async ({ request }) => {
        expect(request.method).toBe('POST');
        seen(await request.json());
        return HttpResponse.json(ADMIN_USER, { status: 201 });
      }),
    );
    const input = {
      username: '  MOZO.Nuevo ',
      displayName: 'Ana',
      pin: '3968',
      roles: ['waiter'],
    };
    await expect(createUser(input)).resolves.toEqual(ADMIN_USER);
    expect(seen).toHaveBeenCalledExactlyOnceWith(input);
    // Otro 2xx distinto del esperado se rechaza aunque el cuerpo sea válido.
    server.use(http.post('*/api/users', () => HttpResponse.json(ADMIN_USER)));
    await expect(createUser(input)).rejects.toMatchObject({ code: 'UNEXPECTED_RESPONSE' });
    // Un 201 con cuerpo que no es AdminUser también se rechaza.
    server.use(
      http.post('*/api/users', () =>
        HttpResponse.json({ ...ADMIN_USER, pinHash: 'x' }, { status: 201 }),
      ),
    );
    await expect(createUser(input)).rejects.toMatchObject({ code: 'UNEXPECTED_RESPONSE' });
  });
  it('AC-19: updateUser hace PATCH con el cuerpo y exige 200 con AdminUser válido', async () => {
    const seen = vi.fn();
    server.use(
      http.patch('*/api/users/2', async ({ request }) => {
        expect(request.method).toBe('PATCH');
        seen(await request.json());
        return HttpResponse.json({ ...ADMIN_USER, id: 2, isActive: false });
      }),
    );
    await expect(updateUser(2, { isActive: false })).resolves.toEqual({
      ...ADMIN_USER,
      id: 2,
      isActive: false,
    });
    expect(seen).toHaveBeenCalledExactlyOnceWith({ isActive: false });
    server.use(
      http.patch('*/api/users/2', () =>
        HttpResponse.json({ ...ADMIN_USER, id: 2 }, { status: 201 }),
      ),
    );
    await expect(updateUser(2, { isActive: false })).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
    });
  });
  it('AC-19: resetUserPin hace POST con el PIN y exige 204 sin cuerpo', async () => {
    const seen = vi.fn();
    server.use(
      http.post('*/api/users/2/pin', async ({ request }) => {
        expect(request.method).toBe('POST');
        seen(await request.json());
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await expect(resetUserPin(2, '5846')).resolves.toBeUndefined();
    expect(seen).toHaveBeenCalledExactlyOnceWith({ pin: '5846' });
    // Otro 2xx (por ejemplo 200 con JSON) se rechaza como en logout de la 003.
    server.use(http.post('*/api/users/2/pin', () => HttpResponse.json({ ok: true })));
    await expect(resetUserPin(2, '5846')).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
    });
  });
  it.each([
    [
      'createUser',
      () => createUser({ username: 'ana', displayName: 'Ana', pin: '3968', roles: ['waiter'] }),
      '*/api/users',
      http.post,
      409,
      'USERNAME_TAKEN',
      'Ese nombre de usuario ya existe.',
      null,
    ],
    [
      'updateUser',
      () => updateUser(2, { roles: ['waiter'] }),
      '*/api/users/2',
      http.patch,
      409,
      'LAST_ADMIN_REQUIRED',
      'Debe quedar al menos un administrador activo.',
      null,
    ],
    [
      'updateUser',
      () => updateUser(2, { isActive: false }),
      '*/api/users/2',
      http.patch,
      404,
      'USER_NOT_FOUND',
      'Ese usuario no existe.',
      null,
    ],
    [
      'resetUserPin',
      () => resetUserPin(2, '5846'),
      '*/api/users/2/pin',
      http.post,
      400,
      'VALIDATION_ERROR',
      'Los datos enviados no son v\u00E1lidos.',
      { issues: [{ path: 'pin', message: 'Ese PIN es muy f\u00E1cil de adivinar. Elige otro.' }] },
    ],
  ])(
    'AC-19: %s conserva code, message y details del error de la API',
    async (_name, call, path, method, status, code, message, details) => {
      server.use(
        method(path, () => HttpResponse.json(errorBody(code, message, details), { status })),
      );
      await expect(call()).rejects.toMatchObject({
        status,
        code,
        message,
        details,
      });
    },
  );
});
