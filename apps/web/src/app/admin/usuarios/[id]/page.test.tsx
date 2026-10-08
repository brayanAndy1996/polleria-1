import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, delay, http } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../../../tests/msw-server.ts';
import { hardNavigate } from '../../../../lib/navigation.ts';
import EditPage from './page.tsx';

const mocks = vi.hoisted(() => ({ replace: vi.fn(), params: { id: '2' } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useParams: () => mocks.params,
}));
vi.mock('../../../../lib/navigation.ts', () => ({ hardNavigate: vi.fn() }));

const SESSION_ADMIN = {
  user: { id: 1, username: 'dueno', displayName: 'Carlos', roles: ['admin'] },
  expiresAt: '2026-10-09T07:00:00.000Z',
};
const USERS = [
  { id: 1, username: 'dueno', displayName: 'Carlos', roles: ['admin'], isActive: true },
  { id: 2, username: 'mozo.ana', displayName: 'Ana', roles: ['waiter', 'kitchen'], isActive: true },
  { id: 3, username: 'beto', displayName: 'Beto', roles: ['kitchen'], isActive: false },
];
const errorBody = (code: string, message: string, details: unknown = null) => ({
  error: { code, message, details },
});
const LAST_ADMIN = errorBody(
  'LAST_ADMIN_REQUIRED',
  'Debe quedar al menos un administrador activo.',
);
const NOT_FOUND = errorBody('USER_NOT_FOUND', 'Ese usuario no existe.');
const WEAK_PIN = 'Ese PIN es muy f\u00E1cil de adivinar. Elige otro.';
const NETWORK = 'Sin conexi\u00F3n con el servidor. Revisa el wifi e intenta de nuevo.';

function show(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
async function renderPage(users: unknown = USERS) {
  server.use(http.get('*/api/users', () => HttpResponse.json({ users })));
  show(<EditPage />);
  expect(await screen.findByRole('heading', { name: 'Editar usuario', level: 1 })).toBeVisible();
}

describe('004: edición de usuario', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, '', '/admin/usuarios/2');
    mocks.params.id = '2';
    server.use(http.get('*/api/auth/me', () => HttpResponse.json(SESSION_ADMIN)));
  });

  it('AC-20: exige el rol admin y sin sesión recarga en /login', async () => {
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({
          user: { id: 4, username: 'caja.ana', displayName: 'Ana', roles: ['cashier'] },
          expiresAt: '2026-10-09T07:00:00.000Z',
        }),
      ),
    );
    show(<EditPage />);
    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/caja');
    });
    expect(screen.queryByRole('heading', { name: 'Editar usuario' })).not.toBeInTheDocument();
    mocks.replace.mockClear();
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json(errorBody('UNAUTHENTICATED', 'x'), { status: 401 }),
      ),
    );
    show(<EditPage />);
    await waitFor(() => {
      expect(hardNavigate).toHaveBeenCalledWith('/login');
    });
  });

  it('AC-23: toma al usuario de la lista, muestra carga y falla con reintento', async () => {
    server.use(
      http.get('*/api/users', async () => {
        await delay('infinite');
        return HttpResponse.json({ users: [] });
      }),
    );
    show(<EditPage />);
    expect(await screen.findByText('Carlos · Administrador')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Cargando...');
  });
  it('AC-23: si la lista falla muestra el error y Reintentar vuelve a consultar', async () => {
    server.use(
      http.get('*/api/users', () =>
        HttpResponse.json(errorBody('INTERNAL_ERROR', 'x'), { status: 500 }),
      ),
    );
    show(<EditPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo cargar la lista de usuarios.',
    );
    server.use(http.get('*/api/users', () => HttpResponse.json({ users: USERS })));
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Editar usuario', level: 1 })).toBeVisible();
  });
  it('AC-23: un id que no está en la lista muestra el error sin formulario', async () => {
    mocks.params.id = '99';
    server.use(http.get('*/api/users', () => HttpResponse.json({ users: USERS })));
    show(<EditPage />);
    expect(await screen.findByText('Ese usuario no existe.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument();
  });

  it('AC-23: muestra username fijo, nombre actual y roles marcados', async () => {
    await renderPage();
    expect(screen.getByText('mozo.ana')).toBeVisible();
    expect(screen.queryByLabelText('Nombre de usuario')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nombre para mostrar')).toHaveValue('Ana');
    expect(screen.getByRole('checkbox', { name: 'Mozo' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Cocina' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Cajero' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Administrador' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled();
  });
  it('AC-23: guarda con un solo PATCH de las claves de perfil y refleja los datos', async () => {
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls: unknown[] = [];
    server.use(
      http.patch('*/api/users/2', async ({ request }) => {
        calls.push(await request.json());
        await waiting;
        return HttpResponse.json(
          {
            id: 2,
            username: 'mozo.ana',
            displayName: 'Ana Mar\u00EDa',
            roles: ['waiter', 'cashier'],
            isActive: true,
          },
          { status: 200 },
        );
      }),
    );
    await renderPage();
    fireEvent.change(screen.getByLabelText('Nombre para mostrar'), {
      target: { value: 'Ana Mar\u00EDa' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cocina' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cajero' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    const sending = await screen.findByRole('button', { name: 'Guardando...' });
    expect(sending).toBeDisabled();
    release();
    expect(await screen.findByText('Cambios guardados.')).toBeVisible();
    expect(calls).toHaveLength(1);
    const sent = calls[0] as Record<string, unknown>;
    expect(Object.keys(sent).sort()).toEqual(['displayName', 'roles']);
    expect(sent.displayName).toBe('Ana Mar\u00EDa');
    expect(sent.roles).toEqual(['waiter', 'cashier']);
    expect(screen.getByLabelText('Nombre para mostrar')).toHaveValue('Ana Mar\u00EDa');
  });
  it('AC-23: sin roles marcados muestra el mensaje y no envía', async () => {
    const calls = vi.fn();
    server.use(
      http.patch('*/api/users/2', () => {
        calls();
        return HttpResponse.json(USERS[1]);
      }),
    );
    await renderPage();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mozo' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cocina' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('Elige al menos un rol.')).toBeVisible();
    expect(calls).not.toHaveBeenCalled();
  });
  it.each([
    [409, LAST_ADMIN, 'Debe quedar al menos un administrador activo.'],
    [404, NOT_FOUND, 'Ese usuario no existe.'],
  ])('AC-23: el error %s de la API se muestra tal cual', async (status, body, message) => {
    server.use(http.patch('*/api/users/2', () => HttpResponse.json(body, { status })));
    await renderPage();
    fireEvent.change(screen.getByLabelText('Nombre para mostrar'), {
      target: { value: 'Ana Mar\u00EDa' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText(message)).toBeVisible();
  });

  it('AC-24: restablece el PIN con confirmación y muestra el aviso', async () => {
    const calls: unknown[] = [];
    server.use(
      http.post('*/api/users/2/pin', async ({ request }) => {
        calls.push(await request.json());
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await renderPage();
    for (const name of ['PIN nuevo', 'Repetir PIN nuevo'])
      expect(screen.getByLabelText(name)).toHaveAttribute('type', 'password');
    fireEvent.change(screen.getByLabelText('PIN nuevo'), { target: { value: '5846' } });
    fireEvent.change(screen.getByLabelText('Repetir PIN nuevo'), { target: { value: '5846' } });
    fireEvent.click(screen.getByRole('button', { name: 'Restablecer PIN' }));
    await waitFor(() => {
      expect(document.body.textContent).toContain(
        'Se cerrar\u00E1n las sesiones de Ana. \u00BFRestablecer su PIN?',
      );
    });
    fireEvent.click(screen.getByRole('button', { name: 'S\u00ED, restablecer' }));
    expect(await screen.findByText('PIN actualizado.')).toBeVisible();
    expect(calls).toEqual([{ pin: '5846' }]);
    expect(screen.getByLabelText('PIN nuevo')).toHaveValue('');
    expect(screen.getByLabelText('Repetir PIN nuevo')).toHaveValue('');
  });
  it('AC-24: Cancelar no envía nada y PIN distintos no pasan de la validación', async () => {
    const calls = vi.fn();
    server.use(
      http.post('*/api/users/2/pin', () => {
        calls();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await renderPage();
    fireEvent.change(screen.getByLabelText('PIN nuevo'), { target: { value: '5846' } });
    fireEvent.change(screen.getByLabelText('Repetir PIN nuevo'), { target: { value: '5847' } });
    fireEvent.click(screen.getByRole('button', { name: 'Restablecer PIN' }));
    expect(await screen.findByText('Los PIN no coinciden.')).toBeVisible();
    expect(calls).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Repetir PIN nuevo'), { target: { value: '5846' } });
    fireEvent.click(screen.getByRole('button', { name: 'Restablecer PIN' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    expect(calls).not.toHaveBeenCalled();
  });
  it.each([
    [
      400,
      errorBody('VALIDATION_ERROR', 'Los datos enviados no son v\u00E1lidos.', {
        issues: [{ path: 'pin', message: WEAK_PIN }],
      }),
      WEAK_PIN,
    ],
    [0, null, NETWORK],
  ])(
    'AC-24: el fallo %s tras confirmar muestra el mensaje correspondiente',
    async (status, body, message) => {
      server.use(
        http.post('*/api/users/2/pin', () =>
          status === 0 ? HttpResponse.error() : HttpResponse.json(body as object, { status }),
        ),
      );
      await renderPage();
      fireEvent.change(screen.getByLabelText('PIN nuevo'), { target: { value: '5846' } });
      fireEvent.change(screen.getByLabelText('Repetir PIN nuevo'), { target: { value: '5846' } });
      fireEvent.click(screen.getByRole('button', { name: 'Restablecer PIN' }));
      fireEvent.click(await screen.findByRole('button', { name: 'S\u00ED, restablecer' }));
      expect(await screen.findByText(message)).toBeVisible();
    },
  );

  it('AC-25: desactivar pide confirmación y la página muestra Desactivado y Activar', async () => {
    const calls: unknown[] = [];
    server.use(
      http.patch('*/api/users/2', async ({ request }) => {
        calls.push(await request.json());
        return HttpResponse.json({ ...USERS[1], isActive: false });
      }),
    );
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }));
    await waitFor(() => {
      expect(document.body.textContent).toContain(
        '\u00BFDesactivar a Ana? No podr\u00E1 iniciar sesi\u00F3n.',
      );
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(calls).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'S\u00ED, desactivar' }));
    expect(await screen.findByText('Desactivado')).toBeVisible();
    expect(calls).toEqual([{ isActive: false }]);
    expect(await screen.findByRole('button', { name: 'Activar' })).toBeVisible();
  });
  it('AC-25: activar envía el cambio sin pedir confirmación', async () => {
    mocks.params.id = '3';
    const calls: unknown[] = [];
    server.use(
      http.patch('*/api/users/3', async ({ request }) => {
        calls.push(await request.json());
        return HttpResponse.json({ ...USERS[2], isActive: true });
      }),
    );
    await renderPage();
    expect(screen.getByText('Desactivado')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Activar' }));
    // El handler de MSW registra el PATCH en un await posterior al click.
    await waitFor(() => {
      expect(calls).toEqual([{ isActive: true }]);
    });
    expect(screen.queryByRole('button', { name: 'S\u00ED, activar' })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('Desactivado')).not.toBeInTheDocument();
    });
    expect(await screen.findByRole('button', { name: 'Desactivar' })).toBeVisible();
  });
  it('AC-25: el 409 del último administrador se muestra y el estado no cambia', async () => {
    server.use(http.patch('*/api/users/2', () => HttpResponse.json(LAST_ADMIN, { status: 409 })));
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'S\u00ED, desactivar' }));
    expect(await screen.findByText('Debe quedar al menos un administrador activo.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Desactivar' })).toBeVisible();
    expect(screen.queryByText('Desactivado')).not.toBeInTheDocument();
  });
});
