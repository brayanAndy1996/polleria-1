import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginScreen } from '../../src/components/auth/login-screen.tsx';
import AdminPage from '../../src/app/admin/page.tsx';
import MozoPage from '../../src/app/mozo/page.tsx';
import CajaPage from '../../src/app/caja/page.tsx';
import CocinaPage from '../../src/app/cocina/page.tsx';
import AreasPage from '../../src/app/areas/page.tsx';
import { hardNavigate } from '../../src/lib/navigation.ts';
import { logout } from '../../src/lib/api/auth.ts';
import { ApiError } from '../../src/lib/api/client.ts';
import { server } from '../msw-server.ts';
import type { UserRole } from '@polleria/shared';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => window.location.pathname,
}));
vi.mock('../../src/lib/navigation.ts', () => ({ hardNavigate: vi.fn() }));

const clients: QueryClient[] = [];
const users = [
  { username: 'mozo.juan', displayName: 'Juan' },
  { username: 'caja.ana', displayName: 'Ana' },
];
const session = (roles: UserRole[] = ['waiter']) => ({
  user: { id: 1, username: 'mozo.juan', displayName: 'Juan', roles },
  expiresAt: '2026-10-09T07:00:00.000Z',
});
const unauthenticated = {
  error: {
    code: 'UNAUTHENTICATED',
    message: 'Debes iniciar sesión para continuar.',
    details: null,
  },
};
function barrier() {
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { waiting, release };
}
function show(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  clients.push(client);
  return { client, ...render(<QueryClientProvider client={client}>{node}</QueryClientProvider>) };
}
function enterPin(pin = '2468') {
  for (const key of pin) fireEvent.keyDown(document, { key });
}
async function chooseJuan() {
  fireEvent.click(await screen.findByRole('button', { name: /Juan/ }));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.history.replaceState({}, '', '/login');
  server.use(
    http.get('*/api/auth/me', () => HttpResponse.json(unauthenticated, { status: 401 })),
    http.get('*/api/auth/users', () => HttpResponse.json({ users })),
  );
});
afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
  vi.restoreAllMocks();
});

const malformedSessions = [
  [
    'roles repetidos',
    {
      ...session(['admin']),
      user: { ...session(['admin']).user, roles: ['admin', 'admin'] },
    },
  ],
  [
    'roles anidados',
    { ...session(['admin']), user: { ...session(['admin']).user, roles: [['admin']] } },
  ],
  [
    'roles objeto',
    {
      ...session(['admin']),
      user: { ...session(['admin']).user, roles: { 0: 'admin', length: 1 } },
    },
  ],
  ['roles vacíos', session([])],
  ['rol extra', { ...session(['admin']), user: { ...session(['admin']).user, role: 'admin' } }],
  [
    'hash extra',
    { ...session(['admin']), user: { ...session(['admin']).user, pinHash: 'privado' } },
  ],
  ['id texto', { ...session(['admin']), user: { ...session(['admin']).user, id: '1' } }],
  ['fecha inválida', { ...session(['admin']), expiresAt: '2026-10-09T07:00:00-05:00' }],
  ['raíz extra', { ...session(['admin']), authenticated: true }],
  ['raíz nula', null],
] as const;

describe('003: ataques adversariales de la web con MSW', () => {
  it.each(malformedSessions)(
    'ADV-003-10: /me malformado (%s) no revela ninguna de las cuatro áreas (AC-33/34/42)',
    async (_name, body) => {
      server.use(http.get('*/api/auth/me', () => HttpResponse.json(body)));
      for (const [Page, heading, path] of [
        [MozoPage, 'Mesas', '/mozo'],
        [CajaPage, 'Caja', '/caja'],
        [CocinaPage, 'Cocina', '/cocina'],
        [AdminPage, 'Administración', '/admin'],
        [AreasPage, '¿Dónde vas a trabajar?', '/areas'],
      ] as const) {
        localStorage.clear();
        window.history.replaceState({}, '', path);
        const view = show(<Page />);
        expect(await screen.findByRole('alert')).toHaveTextContent(
          'No se pudo verificar tu sesión.',
        );
        expect(screen.queryByRole('heading', { name: heading })).not.toBeInTheDocument();
        expect(screen.queryByRole('navigation', { name: 'Áreas' })).not.toBeInTheDocument();
        expect(localStorage.getItem('polleria:lastArea')).toBeNull();
        expect(replace).not.toHaveBeenCalled();
        view.unmount();
        view.client.clear();
      }
    },
  );

  it.each(malformedSessions.slice(0, 5))(
    'ADV-003-11: login malformado (%s) no se guarda, no navega y borra el PIN (AC-31/32)',
    async (_name, body) => {
      server.use(http.post('*/api/auth/login', () => HttpResponse.json(body)));
      const view = show(<LoginScreen />);
      await chooseJuan();
      enterPin();
      fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Respuesta inesperada del servidor. Intenta nuevamente.',
      );
      expect(screen.getByText('PIN de 4 a 6 dígitos')).toBeVisible();
      expect(localStorage.getItem('polleria:lastUsername')).toBeNull();
      expect(view.client.getQueryData(['auth', 'me'])).toBeUndefined();
      expect(replace).not.toHaveBeenCalled();
      expect(hardNavigate).not.toHaveBeenCalled();
    },
  );

  it('ADV-003-12: Enter/clic en el mismo turno y reintento tras red no duplican PIN ni mezclan usuarios (AC-30/31)', async () => {
    const pending = barrier();
    const bodies: unknown[] = [];
    server.use(
      http.post('*/api/auth/login', async ({ request }) => {
        bodies.push(await request.json());
        if (bodies.length === 1) {
          await pending.waiting;
          return HttpResponse.error();
        }
        return HttpResponse.json({
          ...session(['cashier']),
          user: { ...session(['cashier']).user, id: 2, username: 'caja.ana', displayName: 'Ana' },
        });
      }),
    );
    show(<LoginScreen />);
    await chooseJuan();
    enterPin();
    const enter = screen.getByRole('button', { name: 'Entrar' });
    act(() => {
      fireEvent.keyDown(document, { key: 'Enter' });
      fireEvent.click(enter);
      fireEvent.keyDown(document, { key: 'Enter' });
    });
    try {
      await waitFor(() => expect(bodies).toHaveLength(1));
      expect(screen.getByRole('button', { name: 'Cambiar usuario' })).toBeDisabled();
      expect(replace).not.toHaveBeenCalled();
    } finally {
      pending.release();
    }
    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión con el servidor.');
    expect(screen.getByText('PIN de 4 a 6 dígitos')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar usuario' }));
    fireEvent.click(screen.getByRole('button', { name: /Ana/ }));
    enterPin('1357');
    fireEvent.keyDown(document, { key: 'Enter' });
    await waitFor(() => expect(replace).toHaveBeenCalledExactlyOnceWith('/caja'));
    expect(bodies).toEqual([
      { username: 'mozo.juan', pin: '2468' },
      { username: 'caja.ana', pin: '1357' },
    ]);
    expect(localStorage.getItem('polleria:lastUsername')).toBe('caja.ana');
  });

  it('ADV-003-13: logout doble en el mismo turno, red caída y reintento producen una sola recarga (AC-35)', async () => {
    server.use(http.get('*/api/auth/me', () => HttpResponse.json(session())));
    const pending = barrier();
    const calls = vi.fn();
    server.use(
      http.post('*/api/auth/logout', async () => {
        calls();
        if (calls.mock.calls.length === 1) {
          await pending.waiting;
          return HttpResponse.error();
        }
        return new HttpResponse(null, { status: 204 });
      }),
    );
    show(<MozoPage />);
    const logout = await screen.findByRole('button', { name: 'Cerrar sesión' });
    act(() => {
      fireEvent.click(logout);
      fireEvent.click(logout);
    });
    try {
      await waitFor(() => expect(calls).toHaveBeenCalledTimes(1));
      expect(hardNavigate).not.toHaveBeenCalled();
    } finally {
      pending.release();
    }
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo cerrar la sesión. Intenta de nuevo.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await waitFor(() => expect(hardNavigate).toHaveBeenCalledExactlyOnceWith('/login'));
    expect(calls).toHaveBeenCalledTimes(2);
  });

  it.each([200, 202])(
    'ADV-003-14: logout %i con cuerpo de error no confirma un cierre inexistente (AC-35/contrato 9.4)',
    async (status) => {
      server.use(
        http.get('*/api/auth/me', () => HttpResponse.json(session())),
        http.get('*/api/tables', () =>
          HttpResponse.json({
            tables: [{ id: 1, name: 'Mesa 1', isActive: true, state: 'free', order: null }],
          }),
        ),
        http.post('*/api/auth/logout', () =>
          HttpResponse.json(
            {
              error: {
                code: 'INTERNAL_ERROR',
                message: 'No se cerró la sesión.',
                details: null,
              },
            },
            { status },
          ),
        ),
      );
      show(<MozoPage />);
      fireEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
      const logoutError = await screen.findByRole('alert');
      await waitFor(() =>
        expect(
          screen.queryByRole('button', { name: 'Cerrando sesión...' }),
        ).not.toBeInTheDocument(),
      );
      expect(hardNavigate).not.toHaveBeenCalled();
      expect(logoutError).toHaveTextContent('No se pudo cerrar la sesión. Intenta de nuevo.');
    },
  );

  it('ADV-003-15: una respuesta malformada al reverificar oculta admin y el reintento no revive permisos obsoletos (AC-33/34)', async () => {
    window.history.replaceState({}, '', '/admin');
    server.use(http.get('*/api/auth/me', () => HttpResponse.json(session(['admin']))));
    const view = show(<AdminPage />);
    expect(await screen.findByRole('heading', { name: 'Administración' })).toBeVisible();
    server.use(http.get('*/api/auth/me', () => HttpResponse.json(malformedSessions[0][1])));
    await act(async () => {
      await view.client.refetchQueries({ queryKey: ['auth', 'me'] });
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo verificar tu sesión.');
    expect(screen.queryByRole('heading', { name: 'Administración' })).not.toBeInTheDocument();
    const pending = barrier();
    const calls = vi.fn();
    server.use(
      http.get('*/api/auth/me', async () => {
        calls();
        await pending.waiting;
        return HttpResponse.json(session(['cashier']));
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    try {
      await waitFor(() => expect(calls).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole('heading', { name: 'Administración' })).not.toBeInTheDocument();
    } finally {
      pending.release();
    }
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/caja'));
    expect(screen.queryByRole('heading', { name: 'Administración' })).not.toBeInTheDocument();
  });

  it.each(
    [200, 202].flatMap((status) =>
      ['JSON válido', 'JSON mal formado', 'sin JSON', 'vacío'].map((bodyCase) => ({
        status,
        bodyCase,
      })),
    ),
  )(
    'ADV-003-16: logout $status con $bodyCase conserva status real y pantalla (AC-35 posaclaración)',
    async ({ status, bodyCase }) => {
      window.history.replaceState({}, '', '/mozo');
      server.use(
        http.get('*/api/auth/me', () => HttpResponse.json(session())),
        http.get('*/api/tables', () =>
          HttpResponse.json({
            tables: [{ id: 1, name: 'Mesa 1', isActive: true, state: 'free', order: null }],
          }),
        ),
        http.post('*/api/auth/logout', () => {
          if (bodyCase === 'JSON válido') return HttpResponse.json({ ok: true }, { status });
          if (bodyCase === 'JSON mal formado')
            return new HttpResponse('{"ok":', {
              status,
              headers: { 'Content-Type': 'application/json' },
            });
          if (bodyCase === 'sin JSON')
            return new HttpResponse('<html>No se cerró la sesión.</html>', {
              status,
              headers: { 'Content-Type': 'text/html' },
            });
          return new HttpResponse(null, { status });
        }),
      );
      const failure: unknown = await logout().then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(ApiError);
      expect(failure).toMatchObject({
        status,
        code: 'UNEXPECTED_RESPONSE',
        message: 'Respuesta inesperada del servidor. Intenta nuevamente.',
        details: null,
      });
      expect(hardNavigate).not.toHaveBeenCalled();
      show(<MozoPage />);
      fireEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'No se pudo cerrar la sesión. Intenta de nuevo.',
      );
      expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeEnabled();
      expect(screen.getByRole('heading', { name: 'Mesas' })).toBeVisible();
      expect(hardNavigate).not.toHaveBeenCalled();
      expect(replace).not.toHaveBeenCalled();
    },
  );

  it('ADV-003-17: logout 401 conserva ApiError y permite reintentar sin recarga hasta un 204 (AC-35 posaclaración)', async () => {
    window.history.replaceState({}, '', '/mozo');
    const calls = vi.fn();
    server.use(
      http.get('*/api/auth/me', () => HttpResponse.json(session())),
      http.post('*/api/auth/logout', () => {
        calls();
        return HttpResponse.json(unauthenticated, { status: 401 });
      }),
    );
    const failure: unknown = await logout().then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED',
      message: 'Debes iniciar sesión para continuar.',
      details: null,
    });
    expect(hardNavigate).not.toHaveBeenCalled();
    show(<MozoPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo cerrar la sesión. Intenta de nuevo.',
    );
    expect(calls).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeEnabled();
    expect(hardNavigate).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    server.use(
      http.post('*/api/auth/logout', () => {
        calls();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await waitFor(() => expect(hardNavigate).toHaveBeenCalledExactlyOnceWith('/login'));
    expect(calls).toHaveBeenCalledTimes(3);
  });
});
