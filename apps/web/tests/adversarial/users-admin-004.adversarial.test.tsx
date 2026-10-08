import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EditPage from '../../src/app/admin/usuarios/[id]/page.tsx';
import NewUserPage from '../../src/app/admin/usuarios/nuevo/page.tsx';
import { hardNavigate } from '../../src/lib/navigation.ts';
import { createUser, getUsers, resetUserPin, updateUser } from '../../src/lib/api/users.ts';
import { ApiError, apiClient } from '../../src/lib/api/client.ts';
import { server } from '../msw-server.ts';

const mocks = vi.hoisted(() => ({ replace: vi.fn(), params: { id: '2' } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useParams: () => mocks.params,
}));
vi.mock('../../src/lib/navigation.ts', () => ({ hardNavigate: vi.fn() }));

const SESSION_ADMIN = {
  user: { id: 1, username: 'dueno', displayName: 'Carlos', roles: ['admin'] },
  expiresAt: '2026-10-09T07:00:00.000Z',
};
const SESSION_WAITER = {
  user: { id: 1, username: 'dueno', displayName: 'Carlos', roles: ['waiter'] },
  expiresAt: '2026-10-09T07:00:00.000Z',
};
const UNAUTHENTICATED = {
  error: {
    code: 'UNAUTHENTICATED',
    message: 'Debes iniciar sesión para continuar.',
    details: null,
  },
};
const USERS = [
  { id: 1, username: 'dueno', displayName: 'Carlos', roles: ['admin'], isActive: true },
  {
    id: 2,
    username: 'mozo.ana',
    displayName: 'Ana',
    roles: ['waiter', 'kitchen'],
    isActive: true,
  },
  { id: 3, username: 'beto', displayName: 'Beto', roles: ['kitchen'], isActive: false },
];
const WEAK_PIN = 'Ese PIN es muy fácil de adivinar. Elige otro.';

const clients: QueryClient[] = [];
function show(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  clients.push(client);
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
/** Promesa manual para sostener una solicitud "en vuelo" durante dobles clics. */
function barrier() {
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { waiting, release };
}
async function renderEdit(users: unknown = USERS) {
  server.use(http.get('*/api/users', () => HttpResponse.json({ users })));
  const view = show(<EditPage />);
  expect(await screen.findByRole('heading', { name: 'Editar usuario', level: 1 })).toBeVisible();
  return view;
}
const asApiError = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined as never,
    (error: unknown) => error as ApiError,
  );

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.history.replaceState({}, '', '/admin/usuarios/2');
  mocks.params.id = '2';
  server.use(http.get('*/api/auth/me', () => HttpResponse.json(SESSION_ADMIN)));
});
afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
  vi.restoreAllMocks();
});

describe('004-adversarial: ataques a la web de administración de usuarios', () => {
  it.each([
    ['abc', 'not-found'],
    ['NaN', 'not-found'],
    ['Infinity', 'not-found'],
    ['2.9', 'not-found'],
    ['-2', 'not-found'],
    ['0', 'not-found'],
    ['999999999999', 'not-found'],
    ['1e5', 'not-found'],
    ['05', 'not-found'],
    ['', 'not-found'],
    // Number() acepta formas que la API rechazaría: todas resuelven al usuario 2.
    ['0x2', 'alias-2'],
    ['2e0', 'alias-2'],
    ['+2', 'alias-2'],
    [' 2 ', 'alias-2'],
    ['2.0', 'alias-2'],
  ])('ADV-004-30: params.id "%s" %s', async (id, expected) => {
    mocks.params.id = id;
    server.use(http.get('*/api/users', () => HttpResponse.json({ users: USERS })));
    show(<EditPage />);
    if (expected === 'not-found') {
      expect(await screen.findByText('Ese usuario no existe.')).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument();
    } else {
      // La misma página que la API rechazaría (400) aquí edita al usuario 2 sin avisar.
      expect(
        await screen.findByRole('heading', { name: 'Editar usuario', level: 1 }),
      ).toBeVisible();
      expect(screen.getByText('mozo.ana')).toBeVisible();
    }
  });

  it('ADV-004-31: un doble clic en el mismo tick no debería duplicar la mutación', async () => {
    // La edición solo se protege con `isPending`, que no cambia hasta el siguiente
    // render: dos clics dentro del mismo act llegan con isPending aún en falso.
    // El alta sí usa una marca sincrónica (`sending.current`, ver ADV-004-41).
    const patchBodies: unknown[] = [];
    const pinBodies: unknown[] = [];
    server.use(
      http.patch('*/api/users/2', async ({ request }) => {
        patchBodies.push(await request.json());
        return HttpResponse.json(USERS[1]);
      }),
      http.post('*/api/users/2/pin', async ({ request }) => {
        pinBodies.push(await request.json());
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await renderEdit();
    // Guardar perfil: dos clics seguidos deberían producir un solo PATCH.
    fireEvent.change(screen.getByLabelText('Nombre para mostrar'), {
      target: { value: 'Ana María' },
    });
    const save = screen.getByRole('button', { name: 'Guardar cambios' });
    act(() => {
      fireEvent.click(save);
      fireEvent.click(save);
    });
    await waitFor(() => expect(patchBodies.length).toBeGreaterThanOrEqual(1));
    expect.soft(patchBodies).toHaveLength(1);
    // Confirmar desactivación: dos clics seguidos deberían producir un solo PATCH.
    fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }));
    const confirmOff = await screen.findByRole('button', { name: 'Sí, desactivar' });
    act(() => {
      fireEvent.click(confirmOff);
      fireEvent.click(confirmOff);
    });
    await waitFor(() => expect(patchBodies.length).toBeGreaterThanOrEqual(2));
    expect.soft(patchBodies).toHaveLength(2);
    // Confirmar el PIN nuevo: dos clics seguidos deberían producir un solo POST.
    fireEvent.change(screen.getByLabelText('PIN nuevo'), { target: { value: '5846' } });
    fireEvent.change(screen.getByLabelText('Repetir PIN nuevo'), {
      target: { value: '5846' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Restablecer PIN' }));
    const confirmPin = await screen.findByRole('button', { name: 'Sí, restablecer' });
    act(() => {
      fireEvent.click(confirmPin);
      fireEvent.click(confirmPin);
    });
    await waitFor(() => expect(pinBodies.length).toBeGreaterThanOrEqual(1));
    expect.soft(pinBodies).toHaveLength(1);
  });

  it('ADV-004-32: tras guardar, una lista refrescada con datos más nuevos debería ganar', async () => {
    // La invalidación tras el PATCH pide la lista otra vez; esa respuesta es más
    // reciente que el AdminUser devuelto por el PATCH (otro admin editó entremedio).
    const listCalls = vi.fn();
    server.use(
      http.get('*/api/users', () => {
        listCalls();
        const renamed = USERS.map((user) =>
          user.id === 2 ? { ...user, displayName: 'Ana Otra' } : user,
        );
        return HttpResponse.json({ users: listCalls.mock.calls.length >= 2 ? renamed : USERS });
      }),
      http.patch('*/api/users/2', () =>
        HttpResponse.json({ ...USERS[1], displayName: 'Ana Editada' }),
      ),
    );
    // No renderEdit: registraría otro handler de la lista encima del personalizado.
    show(<EditPage />);
    expect(await screen.findByRole('heading', { name: 'Editar usuario', level: 1 })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('Cambios guardados.')).toBeVisible();
    await waitFor(() => expect(listCalls.mock.calls.length).toBeGreaterThanOrEqual(2));
    // `updated` retiene la respuesta del PATCH para siempre y tapa el dato más fresco.
    expect(screen.getByLabelText('Nombre para mostrar')).toHaveValue('Ana Otra');
  });

  it('ADV-004-33: ApiError conserva el status real en respuestas exitosas malformadas', async () => {
    // Un 201 con forma incorrecta conserva el status 201 igual que en client.ts.
    server.use(
      http.post('*/api/users', () => HttpResponse.json({ id: 'no-numero' }, { status: 201 })),
    );
    const created = await asApiError(
      createUser({ username: 'nuevo', displayName: 'Ana', pin: '3968', roles: ['waiter'] }),
    );
    expect(created).toBeInstanceOf(ApiError);
    expect(created.code).toBe('UNEXPECTED_RESPONSE');
    expect.soft(created.status).toBe(201);
    // En PATCH la convención sí se cumple: el status inesperado viaja en el error.
    server.use(http.patch('*/api/users/2', () => HttpResponse.json(USERS[1], { status: 201 })));
    const updated = await asApiError(updateUser(2, { displayName: 'Ana' }));
    expect(updated).toMatchObject({ status: 201, code: 'UNEXPECTED_RESPONSE' });
    // Y un GET con status inesperado y forma incorrecta también conserva el real.
    server.use(http.get('*/api/users', () => HttpResponse.json({ users: 'x' }, { status: 201 })));
    const listed = await asApiError(getUsers());
    expect.soft(listed).toMatchObject({ status: 201, code: 'UNEXPECTED_RESPONSE' });
    server.use(http.post('*/api/users/2/pin', () => HttpResponse.json({}, { status: 200 })));
    const pinned = await asApiError(resetUserPin(2, '5846'));
    expect(pinned).toMatchObject({ status: 200, code: 'UNEXPECTED_RESPONSE' });
  });

  it('ADV-004-34: ni la lista ni el PATCH dejan pasar un pinHash filtrado', async () => {
    const leaked = { ...USERS[1], pinHash: '$2b$10$filtrado' };
    server.use(
      http.get('*/api/users', () => HttpResponse.json({ users: [USERS[0], leaked, USERS[2]] })),
    );
    show(<EditPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo cargar la lista de usuarios.',
    );
    // Un PATCH que "confirma" con una clave filtrada tampoco llega al estado.
    server.use(
      http.get('*/api/users', () => HttpResponse.json({ users: USERS })),
      http.patch('*/api/users/2', () => HttpResponse.json(leaked)),
    );
    await renderEdit();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(
      await screen.findByText('Respuesta inesperada del servidor. Intenta nuevamente.'),
    ).toBeVisible();
    expect(screen.queryByText('Cambios guardados.')).not.toBeInTheDocument();
  });

  it('ADV-004-35: lista malformada oculta la pantalla hasta un Reintentar exitoso', async () => {
    for (const users of [
      [{ ...USERS[1], sessions: [] }],
      [{ id: 2, username: 'x'.repeat(40), displayName: 'A', roles: [], isActive: true }],
      [{ id: '2', username: 'mozo.ana', displayName: 'Ana', roles: ['waiter'], isActive: true }],
      null,
      { lista: USERS },
    ]) {
      server.use(http.get('*/api/users', () => HttpResponse.json({ users })));
      const view = show(<EditPage />);
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'No se pudo cargar la lista de usuarios.',
      );
      view.unmount();
    }
    // El esquema no puede detectar ids repetidos: la página toma el primero y sigue.
    server.use(http.get('*/api/users', () => HttpResponse.json({ users: [...USERS, USERS[1]] })));
    show(<EditPage />);
    expect(await screen.findByRole('heading', { name: 'Editar usuario', level: 1 })).toBeVisible();
  });

  it('ADV-004-36: un 401 en cualquier mutación o consulta recarga /login', async () => {
    server.use(
      http.patch('*/api/users/2', () => HttpResponse.json(UNAUTHENTICATED, { status: 401 })),
    );
    await renderEdit();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(hardNavigate).toHaveBeenCalledWith('/login'));
    vi.mocked(hardNavigate).mockClear();
    server.use(
      http.post('*/api/users/2/pin', () => HttpResponse.json(UNAUTHENTICATED, { status: 401 })),
    );
    fireEvent.change(screen.getByLabelText('PIN nuevo'), { target: { value: '5846' } });
    fireEvent.change(screen.getByLabelText('Repetir PIN nuevo'), {
      target: { value: '5846' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Restablecer PIN' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, restablecer' }));
    await waitFor(() => expect(hardNavigate).toHaveBeenCalledWith('/login'));
    vi.mocked(hardNavigate).mockClear();
    server.use(http.get('*/api/users', () => HttpResponse.json(UNAUTHENTICATED, { status: 401 })));
    show(<EditPage />);
    await waitFor(() => expect(hardNavigate).toHaveBeenCalledWith('/login'));
  });

  it('ADV-004-37: degradarse o desactivarse a sí mismo saca al admin de la pantalla', async () => {
    mocks.params.id = '1';
    localStorage.setItem('polleria:lastArea', '/admin');
    let selfRoles: string[] = ['admin'];
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json(selfRoles.includes('admin') ? SESSION_ADMIN : SESSION_WAITER),
      ),
      http.patch('*/api/users/1', async ({ request }) => {
        const body = (await request.json()) as { roles?: string[]; isActive?: boolean };
        selfRoles = body.roles ?? selfRoles;
        return HttpResponse.json({
          ...USERS[0],
          roles: body.roles ?? ['admin'],
          isActive: body.isActive ?? true,
        });
      }),
    );
    await renderEdit();
    // Se quita el rol admin y queda como mozo: la invalidación de auth/me lo saca
    // del área admin (un usuario sin roles no pasa la validación local).
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mozo' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Administrador' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/mozo'));
    // Desactivarse a sí mismo además mata la sesión: la verificación responde 401.
    selfRoles = ['admin'];
    mocks.params.id = '1';
    let deactivated = false;
    server.use(
      http.get('*/api/auth/me', () =>
        deactivated
          ? HttpResponse.json(UNAUTHENTICATED, { status: 401 })
          : HttpResponse.json(SESSION_ADMIN),
      ),
      http.patch('*/api/users/1', () => {
        deactivated = true;
        return HttpResponse.json({ ...USERS[0], isActive: false });
      }),
    );
    await renderEdit();
    fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, desactivar' }));
    await waitFor(() => expect(hardNavigate).toHaveBeenCalledWith('/login'));
  });

  it('ADV-004-38: un fallo del servidor al restablecer el PIN debería vaciar los campos', async () => {
    server.use(http.post('*/api/users/2/pin', () => HttpResponse.error()));
    await renderEdit();
    fireEvent.change(screen.getByLabelText('PIN nuevo'), { target: { value: '5846' } });
    fireEvent.change(screen.getByLabelText('Repetir PIN nuevo'), {
      target: { value: '5846' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Restablecer PIN' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, restablecer' }));
    expect(
      await screen.findByText('Sin conexión con el servidor. Revisa el wifi e intenta de nuevo.'),
    ).toBeVisible();
    // La convención del proyecto (login y alta) vacía los PIN tras un fallo del servidor.
    expect(screen.getByLabelText('PIN nuevo')).toHaveValue('');
    expect(screen.getByLabelText('Repetir PIN nuevo')).toHaveValue('');
  });

  it('ADV-004-39: cambiar el PIN con la confirmación abierta envía el valor nuevo sin revalidar', async () => {
    const calls: unknown[] = [];
    server.use(
      http.post('*/api/users/2/pin', async ({ request }) => {
        calls.push(await request.json());
        return HttpResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Los datos enviados no son válidos.',
              details: { issues: [{ path: 'pin', message: WEAK_PIN }] },
            },
          },
          { status: 400 },
        );
      }),
    );
    await renderEdit();
    fireEvent.change(screen.getByLabelText('PIN nuevo'), { target: { value: '5846' } });
    fireEvent.change(screen.getByLabelText('Repetir PIN nuevo'), {
      target: { value: '5846' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Restablecer PIN' }));
    await screen.findByRole('button', { name: 'Sí, restablecer' });
    // El PIN validado era 5846, pero se cambia a uno débil con el diálogo ya abierto:
    // la validación local quedó atrás; el servidor sigue siendo la puerta real.
    fireEvent.change(screen.getByLabelText('PIN nuevo'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sí, restablecer' }));
    await waitFor(() => expect(calls).toEqual([{ pin: '1234' }]));
    expect(await screen.findByText(WEAK_PIN)).toBeVisible();
  });

  it('ADV-004-40: los cuerpos enviados llevan solo las claves del contrato', async () => {
    const patchBodies: unknown[] = [];
    const pinBodies: unknown[] = [];
    const createBodies: unknown[] = [];
    server.use(
      http.patch('*/api/users/2', async ({ request }) => {
        patchBodies.push(await request.json());
        return HttpResponse.json(USERS[1]);
      }),
      http.post('*/api/users/2/pin', async ({ request }) => {
        pinBodies.push(await request.json());
        return new HttpResponse(null, { status: 204 });
      }),
      http.post('*/api/users', async ({ request }) => {
        createBodies.push(await request.json());
        return HttpResponse.json(
          { id: 9, username: 'nuevo', displayName: 'Ana', roles: ['waiter'], isActive: true },
          { status: 201 },
        );
      }),
    );
    const view = await renderEdit();
    fireEvent.change(screen.getByLabelText('Nombre para mostrar'), {
      target: { value: 'Ana María' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await screen.findByText('Cambios guardados.');
    expect(patchBodies[0]).toEqual({ displayName: 'Ana María', roles: ['waiter', 'kitchen'] });
    fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, desactivar' }));
    await waitFor(() => expect(patchBodies).toHaveLength(2));
    expect(patchBodies[1]).toEqual({ isActive: false });
    fireEvent.change(screen.getByLabelText('PIN nuevo'), { target: { value: '5846' } });
    fireEvent.change(screen.getByLabelText('Repetir PIN nuevo'), {
      target: { value: '5846' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Restablecer PIN' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, restablecer' }));
    await waitFor(() => expect(pinBodies).toEqual([{ pin: '5846' }]));
    // En el alta, `pinRepeat` nunca viaja (AC-13). La edición se desmonta antes:
    // comparte la etiqueta 'Nombre para mostrar' con el formulario de alta.
    view.unmount();
    show(<NewUserPage />);
    fireEvent.change(await screen.findByLabelText('Nombre de usuario'), {
      target: { value: 'nuevo' },
    });
    fireEvent.change(screen.getByLabelText('Nombre para mostrar'), {
      target: { value: 'Ana' },
    });
    fireEvent.change(screen.getByLabelText('PIN', { exact: true }), {
      target: { value: '3968' },
    });
    fireEvent.change(screen.getByLabelText('Repetir PIN'), { target: { value: '3968' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mozo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));
    await waitFor(() => expect(createBodies).toHaveLength(1));
    expect(createBodies[0]).toEqual({
      username: 'nuevo',
      displayName: 'Ana',
      pin: '3968',
      roles: ['waiter'],
    });
    expect(Object.keys(createBodies[0] as object)).not.toContain('pinRepeat');
  });

  it('ADV-004-41: el alta tiene su propio guardia de doble envío y una sola instancia visible', async () => {
    const pending = barrier();
    const calls = vi.fn();
    server.use(
      http.post('*/api/users', async () => {
        calls();
        await pending.waiting;
        return HttpResponse.json(
          { id: 9, username: 'nuevo', displayName: 'Ana', roles: ['waiter'], isActive: true },
          { status: 201 },
        );
      }),
    );
    show(<NewUserPage />);
    fireEvent.change(await screen.findByLabelText('Nombre de usuario'), {
      target: { value: 'nuevo' },
    });
    fireEvent.change(screen.getByLabelText('Nombre para mostrar'), {
      target: { value: 'Ana' },
    });
    fireEvent.change(screen.getByLabelText('PIN', { exact: true }), {
      target: { value: '3968' },
    });
    fireEvent.change(screen.getByLabelText('Repetir PIN'), { target: { value: '3968' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mozo' }));
    const create = screen.getByRole('button', { name: 'Crear usuario' });
    act(() => {
      fireEvent.click(create);
      fireEvent.click(create);
    });
    await waitFor(() => expect(calls).toHaveBeenCalledTimes(1));
    pending.release();
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/admin/usuarios'));
    // Una segunda página montada no duplica el formulario (instancia primaria).
    show(<NewUserPage />);
    show(<NewUserPage />);
    expect(screen.getAllByRole('heading', { name: 'Agregar usuario', level: 1 })).toHaveLength(1);
  });

  it('ADV-004-42: la guardia síncrona aguanta el triple clic y se suelta tras un error', async () => {
    // Posarreglo de ADV-004-31: las marcas `*Sending` (useRef) se activan en el
    // mismo tick y se liberan en onSettled — ni un triple clic duplica, ni un
    // error deja el botón muerto para siempre.
    const patchBodies: unknown[] = [];
    const pinBodies: unknown[] = [];
    let patchFails = false;
    server.use(
      http.patch('*/api/users/2', async ({ request }) => {
        patchBodies.push(await request.json());
        if (patchFails)
          return HttpResponse.json(
            { error: { code: 'BOOM', message: 'Falla simulada.', details: null } },
            { status: 500 },
          );
        return HttpResponse.json(USERS[1]);
      }),
      http.post('*/api/users/2/pin', async ({ request }) => {
        pinBodies.push(await request.json());
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await renderEdit();
    // Guardar: tres clics en el mismo tick deben producir un solo PATCH.
    fireEvent.change(screen.getByLabelText('Nombre para mostrar'), {
      target: { value: 'Ana María' },
    });
    const save = screen.getByRole('button', { name: 'Guardar cambios' });
    act(() => {
      fireEvent.click(save);
      fireEvent.click(save);
      fireEvent.click(save);
    });
    await waitFor(() => expect(patchBodies).toHaveLength(1));
    await screen.findByText('Cambios guardados.');
    // Desactivar: la confirmación con triple clic produce un solo PATCH.
    fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }));
    const confirmOff = await screen.findByRole('button', { name: 'Sí, desactivar' });
    act(() => {
      fireEvent.click(confirmOff);
      fireEvent.click(confirmOff);
      fireEvent.click(confirmOff);
    });
    await waitFor(() => expect(patchBodies).toHaveLength(2));
    // PIN: la confirmación con triple clic produce un solo POST.
    fireEvent.change(screen.getByLabelText('PIN nuevo'), { target: { value: '5846' } });
    fireEvent.change(screen.getByLabelText('Repetir PIN nuevo'), {
      target: { value: '5846' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Restablecer PIN' }));
    const confirmPin = await screen.findByRole('button', { name: 'Sí, restablecer' });
    act(() => {
      fireEvent.click(confirmPin);
      fireEvent.click(confirmPin);
      fireEvent.click(confirmPin);
    });
    await waitFor(() => expect(pinBodies).toHaveLength(1));
    // Tras un 500 la marca debe liberarse en onSettled: el reintento sí sale.
    patchFails = true;
    fireEvent.change(screen.getByLabelText('Nombre para mostrar'), {
      target: { value: 'Ana Dos' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(patchBodies).toHaveLength(3));
    expect(await screen.findByText('Falla simulada.')).toBeVisible();
    patchFails = false;
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(patchBodies).toHaveLength(4));
    await screen.findByText('Cambios guardados.');
  });

  it('ADV-004-43: tras el refactor, el status real viaja en todos los caminos del cliente', async () => {
    // Esquema que no cuadra sobre un 200: el status real es 200 (coincide, pero
    // ahora viaja del response y no de una constante).
    server.use(http.get('*/api/users', () => HttpResponse.json({ users: 'x' }, { status: 200 })));
    expect.soft(await asApiError(getUsers())).toMatchObject({
      status: 200,
      code: 'UNEXPECTED_RESPONSE',
    });
    // expectedStatus=200 pero el servidor contesta 202: se reporta el real.
    server.use(http.patch('*/api/users/2', () => HttpResponse.json(USERS[1], { status: 202 })));
    expect.soft(await asApiError(updateUser(2, { displayName: 'Ana' }))).toMatchObject({
      status: 202,
      code: 'UNEXPECTED_RESPONSE',
    });
    // Error sin sobre `{ error }`: status real, no un 200 ficticio ni un 0.
    server.use(http.get('*/api/users', () => HttpResponse.json({ oops: true }, { status: 500 })));
    expect.soft(await asApiError(getUsers())).toMatchObject({
      status: 500,
      code: 'UNEXPECTED_RESPONSE',
    });
    // Error con sobre válido: code, message y status del servidor pasan intactos.
    server.use(
      http.get('*/api/users', () =>
        HttpResponse.json(
          { error: { code: 'BOOM', message: 'Explotó.', details: null } },
          { status: 500 },
        ),
      ),
    );
    expect(await asApiError(getUsers())).toMatchObject({
      status: 500,
      code: 'BOOM',
      message: 'Explotó.',
    });
    // Contrato público intacto: request() devuelve el CUERPO pelado, no el
    // envoltorio { body, status } que consume el validador de esquemas.
    server.use(http.get('*/api/users', () => HttpResponse.json({ users: USERS })));
    const body = (await apiClient.request('/users')) as { users: unknown[]; body?: unknown };
    expect(body.users).toHaveLength(3);
    expect(body.body).toBeUndefined();
    const withStatus = await apiClient.requestWithStatus('/users');
    expect(withStatus.status).toBe(200);
    expect((withStatus.body as { users: unknown[] }).users).toHaveLength(3);
  });
});
