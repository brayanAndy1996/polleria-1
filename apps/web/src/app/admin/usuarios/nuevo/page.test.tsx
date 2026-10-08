import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../../../tests/msw-server.ts';
import { hardNavigate } from '../../../../lib/navigation.ts';
import NuevoPage from './page.tsx';

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
const CREATED = {
  id: 5,
  username: 'mozo.nuevo',
  displayName: 'Ana Mar\u00EDa',
  roles: ['waiter'],
  isActive: true,
};
const errorBody = (code: string, message: string, details: unknown = null) => ({
  error: { code, message, details },
});
const WEAK_PIN = 'Ese PIN es muy f\u00E1cil de adivinar. Elige otro.';

function show(node: ReactNode, client?: QueryClient) {
  const queryClient =
    client ?? new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}
function fillForm(pin = '3968', pin2 = pin) {
  fireEvent.change(screen.getByLabelText('Nombre de usuario'), {
    target: { value: '  MOZO.Nuevo ' },
  });
  fireEvent.change(screen.getByLabelText('Nombre para mostrar'), {
    target: { value: 'Ana Mar\u00EDa' },
  });
  fireEvent.change(screen.getByLabelText('PIN'), { target: { value: pin } });
  fireEvent.change(screen.getByLabelText('Repetir PIN'), { target: { value: pin2 } });
}
async function renderForm() {
  show(<NuevoPage />);
  expect(
    await screen.findByRole('heading', { name: 'Agregar usuario', level: 1 }),
  ).toBeVisible();
}

describe('004: formulario de alta de usuario', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, '', '/admin/usuarios/nuevo');
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
    show(<NuevoPage />);
    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/caja');
    });
    expect(
      screen.queryByRole('heading', { name: 'Agregar usuario' }),
    ).not.toBeInTheDocument();
    mocks.replace.mockClear();
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json(errorBody('UNAUTHENTICATED', 'x'), { status: 401 }),
      ),
    );
    show(<NuevoPage />);
    await waitFor(() => {
      expect(hardNavigate).toHaveBeenCalledWith('/login');
    });
  });

  it('AC-22: muestra todos los campos, los PIN ocultos y un checkbox por rol', async () => {
    await renderForm();
    expect(screen.getByLabelText('Nombre de usuario')).toBeVisible();
    expect(screen.getByLabelText('Nombre para mostrar')).toBeVisible();
    for (const name of ['PIN', 'Repetir PIN'])
      expect(screen.getByLabelText(name)).toHaveAttribute('type', 'password');
    for (const role of ['Mozo', 'Cocina', 'Cajero', 'Administrador'])
      expect(screen.getByRole('checkbox', { name: role })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear usuario' })).toBeEnabled();
    expect(
      screen.getByText('Letras min\u00FAsculas sin tilde, n\u00FAmeros, punto, guion o guion bajo.'),
    ).toBeVisible();
  });

  it('AC-22: envía un solo POST sin la repetición del PIN, deshabilita e invalida', async () => {
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls: unknown[] = [];
    server.use(
      http.post('*/api/users', async ({ request }) => {
        calls.push(await request.json());
        await waiting;
        return HttpResponse.json(CREATED, { status: 201 });
      }),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    show(<NuevoPage />, client);
    await renderForm();
    fillForm();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mozo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));
    const sending = await screen.findByRole('button', { name: 'Creando...' });
    expect(sending).toBeDisabled();
    fireEvent.click(sending);
    release();
    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/admin/usuarios');
    });
    expect(calls).toHaveLength(1);
    const sent = calls[0] as Record<string, unknown>;
    // La repetición del PIN no viaja: solo las cuatro claves del contrato.
    expect(Object.keys(sent).sort()).toEqual(['displayName', 'pin', 'roles', 'username']);
    expect(String(sent.username).trim().toLowerCase()).toBe('mozo.nuevo');
    expect(sent).toMatchObject({ pin: '3968', roles: ['waiter'] });
    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['admin', 'users'] }),
    );
  });

  it('AC-22: valida en local PIN iguales y al menos un rol sin llamar a la API', async () => {
    const calls = vi.fn();
    server.use(http.post('*/api/users', () => {
      calls();
      return HttpResponse.json(CREATED, { status: 201 });
    }));
    await renderForm();
    fillForm('3968', '3969');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mozo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));
    expect(await screen.findByText('Los PIN no coinciden.')).toBeVisible();
    expect(calls).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Repetir PIN'), { target: { value: '3968' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mozo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));
    expect(await screen.findByText('Elige al menos un rol.')).toBeVisible();
    expect(calls).not.toHaveBeenCalled();
  });

  it.each([
    [
      409,
      errorBody('USERNAME_TAKEN', 'Ese nombre de usuario ya existe.'),
      'Ese nombre de usuario ya existe.',
    ],
    [
      400,
      errorBody('VALIDATION_ERROR', 'Los datos enviados no son v\u00E1lidos.', {
        issues: [{ path: 'pin', message: WEAK_PIN }],
      }),
      WEAK_PIN,
    ],
  ])(
    'AC-22: el error %s de la API se muestra, vacía los PIN y permite reenviar',
    async (status, body, message) => {
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      });
      server.use(
        http.post('*/api/users', () => HttpResponse.json(body as object, { status })),
      );
      show(<NuevoPage />, client);
      await renderForm();
      fillForm();
      fireEvent.click(screen.getByRole('checkbox', { name: 'Mozo' }));
      fireEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));
      expect(await screen.findByText(message)).toBeVisible();
      expect(screen.getByLabelText('PIN')).toHaveValue('');
      expect(screen.getByLabelText('Repetir PIN')).toHaveValue('');
      expect(screen.getByLabelText('Nombre de usuario')).toHaveValue('  MOZO.Nuevo ');
      expect(mocks.replace).not.toHaveBeenCalled();
      server.use(http.post('*/api/users', () => HttpResponse.json(CREATED, { status: 201 })));
      fillForm();
      fireEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));
      await waitFor(() => {
        expect(mocks.replace).toHaveBeenCalledWith('/admin/usuarios');
      });
    },
  );

  it('AC-22: un error de red muestra su mensaje y vacía los PIN', async () => {
    server.use(http.post('*/api/users', () => HttpResponse.error()));
    await renderForm();
    fillForm();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cocina' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear usuario' }));
    expect(
      await screen.findByText('Sin conexi\u00F3n con el servidor. Revisa el wifi e intenta de nuevo.'),
    ).toBeVisible();
    expect(screen.getByLabelText('PIN')).toHaveValue('');
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
