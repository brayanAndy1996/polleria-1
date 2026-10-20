import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, delay, http } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../../tests/msw-server.ts';
import { hardNavigate } from '../../../lib/navigation.ts';
import UsersPage from './page.tsx';

const mocks = vi.hoisted(() => ({ replace: vi.fn(), params: { id: '2' } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => window.location.pathname,
  useParams: () => mocks.params,
}));
vi.mock('../../../lib/navigation.ts', () => ({ hardNavigate: vi.fn() }));

const SESSION_ADMIN = {
  user: { id: 1, username: 'dueno', displayName: 'Carlos', roles: ['admin'] },
  expiresAt: '2026-10-09T07:00:00.000Z',
};
const USERS = [
  { id: 1, username: 'dueno', displayName: 'Carlos', roles: ['admin'], isActive: true },
  { id: 2, username: 'ana', displayName: 'Ana', roles: ['waiter', 'cashier'], isActive: true },
  { id: 3, username: 'beto', displayName: 'Beto', roles: ['kitchen'], isActive: false },
];
const errorBody = (code: string) => ({
  error: { code, message: 'Mensaje.', details: null },
});

function show(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
function mockSession() {
  server.use(http.get('*/api/auth/me', () => HttpResponse.json(SESSION_ADMIN)));
}
function mockUsers() {
  server.use(http.get('*/api/users', () => HttpResponse.json({ users: USERS })));
}
/** Fila del usuario: el ancestro más cercano del nombre que contiene el enlace Editar. */
function userRow(displayName: string): HTMLElement {
  let element: HTMLElement | null = screen.getByText(displayName);
  while (element !== null && element.querySelector('a[href^="/admin/usuarios/"]') === null)
    element = element.parentElement;
  expect(element, `fila de ${displayName}`).not.toBeNull();
  return element as HTMLElement;
}

describe('004: lista de usuarios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, '', '/admin/usuarios');
    mockSession();
    mockUsers();
  });

  it('AC-20: exige el rol admin (un cajero va a /caja) y sin sesión recarga en /login', async () => {
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({
          user: { id: 4, username: 'caja.ana', displayName: 'Ana', roles: ['cashier'] },
          expiresAt: '2026-10-09T07:00:00.000Z',
        }),
      ),
    );
    show(<UsersPage />);
    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/caja');
    });
    expect(screen.queryByRole('heading', { name: 'Usuarios', level: 1 })).not.toBeInTheDocument();
    mocks.replace.mockClear();
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json(errorBody('UNAUTHENTICATED'), { status: 401 }),
      ),
    );
    show(<UsersPage />);
    await waitFor(() => {
      expect(hardNavigate).toHaveBeenCalledWith('/login');
    });
    expect(screen.queryByRole('heading', { name: 'Usuarios', level: 1 })).not.toBeInTheDocument();
  });

  it('AC-21: muestra "Cargando usuarios..." mientras llega la lista', async () => {
    server.use(
      http.get('*/api/users', async () => {
        await delay('infinite');
        return HttpResponse.json({ users: [] });
      }),
    );
    show(<UsersPage />);
    // La sesión sí responde: el estado visible es el de la lista, no el de la guardia.
    expect(await screen.findByText('Carlos · Administrador')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Cargando usuarios...');
  });

  it('AC-21: muestra encabezado, enlace de alta y una fila por usuario en el orden de la API', async () => {
    show(<UsersPage />);
    expect(await screen.findByRole('heading', { name: 'Usuarios', level: 1 })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Agregar usuario' })).toHaveAttribute(
      'href',
      '/admin/usuarios/nuevo',
    );
    const carlos = userRow('Carlos');
    expect(within(carlos).getByText('dueno')).toBeInTheDocument();
    expect(within(carlos).getByText('Administrador')).toBeInTheDocument();
    expect(within(carlos).getByText('(t\u00FA)')).toBeInTheDocument();
    expect(within(carlos).queryByText('Desactivado')).not.toBeInTheDocument();
    const ana = userRow('Ana');
    expect(within(ana).getByText('ana')).toBeInTheDocument();
    expect(within(ana).getByText('Mozo, Cajero')).toBeInTheDocument();
    expect(within(ana).queryByText('(t\u00FA)')).not.toBeInTheDocument();
    const beto = userRow('Beto');
    expect(within(beto).getByText('beto')).toBeInTheDocument();
    expect(within(beto).getByText('Cocina')).toBeInTheDocument();
    expect(within(beto).getByText('Desactivado')).toBeInTheDocument();
    const editLinks = screen.getAllByRole('link', { name: 'Editar' });
    expect(editLinks.map((link) => link.getAttribute('href'))).toEqual([
      '/admin/usuarios/1',
      '/admin/usuarios/2',
      '/admin/usuarios/3',
    ]);
  });

  it.each(['500', 'red'])(
    'AC-21: un fallo %s de la API muestra el error y Reintentar vuelve a consultar',
    async (kind) => {
      const fail = () =>
        kind === 'red'
          ? HttpResponse.error()
          : HttpResponse.json(errorBody('INTERNAL_ERROR'), { status: 500 });
      server.use(http.get('*/api/users', fail));
      show(<UsersPage />);
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'No se pudo cargar la lista de usuarios.',
      );
      server.use(http.get('*/api/users', () => HttpResponse.json({ users: USERS })));
      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
      expect(await screen.findByRole('heading', { name: 'Usuarios', level: 1 })).toBeVisible();
      expect(screen.getByText('Ana')).toBeVisible();
    },
  );
});
