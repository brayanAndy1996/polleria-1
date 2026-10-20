import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserRole } from '@polleria/shared';
import { server } from '../../../tests/msw-server.ts';
import { respondHealthOk } from '../../../tests/health-mocks.ts';
import { LoginScreen } from './login-screen.tsx';
import MozoPage from '../../app/mozo/page.tsx';
import CajaPage from '../../app/caja/page.tsx';
import CocinaPage from '../../app/cocina/page.tsx';
import AdminPage from '../../app/admin/page.tsx';
import AreasPage from '../../app/areas/page.tsx';
import HomePage from '../../app/page.tsx';
import { hardNavigate } from '../../lib/navigation.ts';
import { RoleGuard } from './role-guard.tsx';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => window.location.pathname,
}));
vi.mock('../../lib/navigation.ts', () => ({ hardNavigate: vi.fn() }));
const USERS = [
  { username: 'mozo.juan', displayName: 'Juan' },
  { username: 'caja.ana', displayName: 'Ana' },
];
const session = (roles: UserRole[] = ['waiter'], displayName = 'Juan') => ({
  user: { id: 1, username: 'mozo.juan', displayName, roles },
  expiresAt: '2026-10-09T07:00:00.000Z',
});
const error = (code: string, message: string, details: unknown = null) => ({
  error: { code, message, details },
});
function show(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
function mockSession(roles: UserRole[] = ['waiter'], displayName = 'Juan') {
  server.use(http.get('*/api/auth/me', () => HttpResponse.json(session(roles, displayName))));
}
async function chooseJuan() {
  fireEvent.click(await screen.findByRole('button', { name: /Juan/ }));
}
function enterPin(pin = '2468') {
  for (const digit of pin) fireEvent.click(screen.getByRole('button', { name: digit }));
}
function expectLoginUsersInOrder() {
  const buttons = screen.getAllByRole('button');
  expect(buttons).toHaveLength(USERS.length);
  USERS.forEach((user, index) => {
    expect(buttons[index]).toHaveAccessibleName(`${user.displayName} ${user.username}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.history.replaceState({}, '', '/login');
  server.use(
    http.get('*/api/auth/me', () =>
      HttpResponse.json(error('UNAUTHENTICATED', 'Debes iniciar sesión para continuar.'), {
        status: 401,
      }),
    ),
    http.get('*/api/auth/users', () => HttpResponse.json({ users: USERS })),
    // El tablero del mozo solo pinta 'Mesas' cuando la consulta resuelve.
    http.get('*/api/tables', () => HttpResponse.json({ tables: [] })),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('003: pantalla de inicio de sesión', () => {
  it('AC-29: muestra carga y luego la lista ordenada sin recargar por el 401', async () => {
    show(<LoginScreen />);
    expect(screen.getByRole('status')).toHaveTextContent('Cargando usuarios...');
    expect(await screen.findByRole('heading', { name: '¿Quién eres?', level: 1 })).toBeVisible();
    expectLoginUsersInOrder();
    expect(hardNavigate).not.toHaveBeenCalled();
  });
  it('AC-29: maneja una lista vacía y permite reintentar tras un error', async () => {
    server.use(http.get('*/api/auth/users', () => new HttpResponse(null, { status: 500 })));
    show(<LoginScreen />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo cargar la lista de usuarios.',
    );
    server.use(http.get('*/api/auth/users', () => HttpResponse.json({ users: [] })));
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(
      await screen.findByText(
        'No hay usuarios activos. El administrador debe crear el primero con el comando pnpm users:create-admin.',
      ),
    ).toBeVisible();
  });
  it('AC-29: reintenta la lista después de un fallo de red y muestra los usuarios', async () => {
    server.use(http.get('*/api/auth/users', () => HttpResponse.error()));
    show(<LoginScreen />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo cargar la lista de usuarios.',
    );
    server.use(http.get('*/api/auth/users', () => HttpResponse.json({ users: USERS })));
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: '¿Quién eres?', level: 1 })).toBeVisible();
    expectLoginUsersInOrder();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(hardNavigate).not.toHaveBeenCalled();
  });
  it('AC-29: una sesión de caja ya abierta omite la lista y navega a caja', async () => {
    mockSession(['cashier']);
    show(<LoginScreen />);
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/caja');
    });
    expect(screen.queryByRole('heading', { name: '¿Quién eres?' })).not.toBeInTheDocument();
  });
  it('AC-30: el teclado oculta el PIN, limita seis dígitos y borra al cambiar de usuario', async () => {
    show(<LoginScreen />);
    await chooseJuan();
    expect(screen.getByRole('heading', { name: 'Hola, Juan', level: 1 })).toBeVisible();
    expect(screen.getByText('PIN de 4 a 6 dígitos')).toBeVisible();
    expect(screen.queryByText(/^•+$/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button').map((button) => button.textContent?.trim())).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      'Borrar',
      '0',
      'Entrar',
      'Cambiar usuario',
    ]);
    for (const name of [
      '0',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      'Borrar',
      'Entrar',
      'Cambiar usuario',
    ])
      expect(screen.getByRole('button', { name })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeDisabled();
    enterPin('123');
    expect(screen.getByText('•••')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeDisabled();
    enterPin('4');
    expect(screen.getByText('••••')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
    enterPin('567');
    expect(screen.getByText('••••••')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
    expect(document.body.textContent).not.toContain('123456');
    expect(document.querySelector('input')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Borrar' }));
    expect(screen.getByText('•••••')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar usuario' }));
    await chooseJuan();
    expect(screen.getByText('PIN de 4 a 6 dígitos')).toBeVisible();
  });
  it('AC-30: acepta teclado físico y Enter sin mostrar el PIN', async () => {
    server.use(http.post('*/api/auth/login', () => HttpResponse.json(session())));
    show(<LoginScreen />);
    await chooseJuan();
    for (const key of ['2', '4', '6', '8']) fireEvent.keyDown(document, { key });
    expect(screen.getByText('••••')).toBeVisible();
    fireEvent.keyDown(document, { key: 'Backspace' });
    expect(screen.getByText('•••')).toBeVisible();
    fireEvent.keyDown(document, { key: '8' });
    fireEvent.keyDown(document, { key: 'Enter' });
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/mozo');
    });
  });
  it('AC-30: Enter en el skip link no cancela su activación ni intenta enviar el PIN', async () => {
    const loginCalls = vi.fn();
    server.use(
      http.post('*/api/auth/login', () => {
        loginCalls();
        return HttpResponse.json(session());
      }),
    );
    show(<LoginScreen />);
    await chooseJuan();

    const skipLink = screen.getByRole('link', { name: 'Saltar al contenido' });
    expect(fireEvent.keyDown(skipLink, { key: 'Enter' })).toBe(true);
    expect(loginCalls).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it.each([
    [['waiter'], null, '/mozo'],
    [['cashier'], null, '/caja'],
    [['kitchen'], null, '/cocina'],
    [['admin'], null, '/areas'],
    [['waiter', 'cashier'], null, '/areas'],
    [['admin'], '/caja', '/caja'],
    [['waiter', 'cashier'], '/caja', '/caja'],
  ])(
    'AC-31: navega al destino autorizado de %s con última área %s',
    async (roles, lastArea, path) => {
      if (lastArea) localStorage.setItem('polleria:lastArea', lastArea);
      const body = vi.fn();
      server.use(
        http.post('*/api/auth/login', async ({ request }) => {
          body(await request.json());
          return HttpResponse.json(session(roles as UserRole[]));
        }),
      );
      show(<LoginScreen />);
      await chooseJuan();
      enterPin();
      fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
      await waitFor(() => {
        expect(replace).toHaveBeenCalledWith(path);
      });
      expect(body).toHaveBeenCalledExactlyOnceWith({ username: 'mozo.juan', pin: '2468' });
      expect(localStorage.getItem('polleria:lastUsername')).toBe('mozo.juan');
    },
  );
  it('AC-31: impide un doble envío mientras el login está pendiente', async () => {
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls = vi.fn();
    server.use(
      http.post('*/api/auth/login', async () => {
        calls();
        await waiting;
        return HttpResponse.json(session());
      }),
    );
    show(<LoginScreen />);
    await chooseJuan();
    enterPin();
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    const button = await screen.findByRole('button', { name: 'Entrando...' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    await waitFor(() => {
      expect(calls).toHaveBeenCalledTimes(1);
    });
    release();
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/mozo');
    });
  });
  it.each([
    [401, 'INVALID_CREDENTIALS', null, 'Usuario o PIN incorrecto.', 'Usuario o PIN incorrecto.'],
    [
      429,
      'TOO_MANY_ATTEMPTS',
      900,
      'Bloqueado.',
      'Demasiados intentos fallidos. Intenta de nuevo en 15 minutos.',
    ],
    [
      429,
      'TOO_MANY_ATTEMPTS',
      60,
      'Bloqueado.',
      'Demasiados intentos fallidos. Intenta de nuevo en 1 minuto.',
    ],
    [
      429,
      'TOO_MANY_ATTEMPTS',
      61,
      'Bloqueado.',
      'Demasiados intentos fallidos. Intenta de nuevo en 2 minutos.',
    ],
    [
      500,
      'INTERNAL_ERROR',
      null,
      'Ocurrió un error inesperado. Intenta nuevamente.',
      'Ocurrió un error inesperado. Intenta nuevamente.',
    ],
    [
      0,
      'NETWORK_ERROR',
      null,
      '',
      'Sin conexión con el servidor. Revisa el wifi e intenta de nuevo.',
    ],
  ])(
    'AC-31: muestra el error %s y vacía el PIN',
    async (status, code, seconds, message, expected) => {
      server.use(
        http.post('*/api/auth/login', () =>
          status === 0
            ? HttpResponse.error()
            : HttpResponse.json(
                error(code, message, seconds === null ? null : { retryAfterSeconds: seconds }),
                { status: status },
              ),
        ),
      );
      show(<LoginScreen />);
      await chooseJuan();
      enterPin();
      fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(expected);
      expect(screen.getByText('PIN de 4 a 6 dígitos')).toBeVisible();
      expect(replace).not.toHaveBeenCalled();
      expect(hardNavigate).not.toHaveBeenCalled();
    },
  );
  it.each(['mozo.juan', 'nadie'])(
    'AC-32: recuerda al último usuario solo si sigue en la lista: %s',
    async (username) => {
      localStorage.setItem('polleria:lastUsername', username);
      show(<LoginScreen />);
      expect(
        await screen.findByRole('heading', {
          name: username === 'mozo.juan' ? 'Hola, Juan' : '¿Quién eres?',
        }),
      ).toBeVisible();
      if (username === 'mozo.juan') {
        fireEvent.click(screen.getByRole('button', { name: 'Cambiar usuario' }));
        expect(screen.getByRole('heading', { name: '¿Quién eres?' })).toBeVisible();
      }
    },
  );
  it('AC-32: puede iniciar sesión aunque localStorage falle', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('No disponible');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('No disponible');
    });
    server.use(http.post('*/api/auth/login', () => HttpResponse.json(session())));
    show(<LoginScreen />);
    await chooseJuan();
    enterPin();
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/mozo');
    });
  });
});

describe('003: guardias, páginas y cambio de área', () => {
  it.each([
    [['waiter'], null, null],
    [['waiter', 'cashier'], null, null],
    [['cashier'], null, '/caja'],
    [['kitchen', 'cashier'], null, '/areas'],
    [['kitchen', 'cashier'], '/cocina', '/cocina'],
  ])(
    'AC-33: muestra Mozo solo si los roles %s lo permiten',
    async (roles, lastArea, destination) => {
      window.history.replaceState({}, '', '/mozo');
      if (lastArea) localStorage.setItem('polleria:lastArea', lastArea);
      mockSession(roles as UserRole[]);
      show(<MozoPage />);
      expect(screen.getByRole('status')).toHaveTextContent('Cargando...');
      expect(screen.queryByRole('heading', { name: 'Mesas' })).not.toBeInTheDocument();
      if (destination) {
        await waitFor(() => {
          expect(replace).toHaveBeenCalledWith(destination);
        });
        expect(screen.queryByRole('heading', { name: 'Mesas' })).not.toBeInTheDocument();
      } else expect(await screen.findByRole('heading', { name: 'Mesas', level: 1 })).toBeVisible();
    },
  );
  it('AC-33: sin sesión recarga en login y sin red ofrece reintentar', async () => {
    window.history.replaceState({}, '', '/mozo');
    const view = show(<MozoPage />);
    await waitFor(() => {
      expect(hardNavigate).toHaveBeenCalledWith('/login');
    });
    expect(screen.queryByRole('heading', { name: 'Mesas' })).not.toBeInTheDocument();
    view.unmount();
    server.use(http.get('*/api/auth/me', () => HttpResponse.error()));
    show(<MozoPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo verificar tu sesión.');
    mockSession();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Mesas' })).toBeVisible();
  });
  it.each([
    [MozoPage, 'Mesas', ['waiter'], 'Juan', 'Juan · Mozo'],
    [CajaPage, 'Caja', ['cashier', 'waiter'], 'Ana', 'Ana · Mozo, Cajero'],
    [CocinaPage, 'Cocina', ['kitchen'], 'Beto', 'Beto · Cocina'],
    [AdminPage, 'Administración', ['admin'], 'Carlos', 'Carlos · Administrador'],
  ])(
    'AC-34: el área %s muestra encabezado, roles y cierre de sesión',
    async (Page, heading, roles, displayName, line) => {
      mockSession(roles as UserRole[], displayName);
      show(<Page />);
      expect(await screen.findByRole('heading', { name: heading, level: 1 })).toBeVisible();
      expect(screen.getByText(line)).toBeVisible();
      expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
    },
  );
  it.each([
    ['/mozo', 'waiter', MozoPage, 'Mesas'],
    ['/mozo', 'admin', MozoPage, 'Mesas'],
    ['/caja', 'cashier', CajaPage, 'Caja'],
    ['/caja', 'admin', CajaPage, 'Caja'],
    ['/cocina', 'kitchen', CocinaPage, 'Cocina'],
    ['/cocina', 'admin', CocinaPage, 'Cocina'],
    ['/admin', 'admin', AdminPage, 'Administración'],
  ] as const)(
    'AC-34: %s permite el rol único %s con encabezado y cierre',
    async (path, role, Page, heading) => {
      window.history.replaceState({}, '', path);
      mockSession([role]);
      show(<Page />);
      expect(await screen.findByRole('heading', { name: heading, level: 1 })).toBeVisible();
      expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
      expect(replace).not.toHaveBeenCalled();
    },
  );
  it.each([
    ['/mozo', ['kitchen'], '/cocina', MozoPage, 'Mesas'],
    ['/mozo', ['cashier'], '/caja', MozoPage, 'Mesas'],
    ['/caja', ['waiter'], '/mozo', CajaPage, 'Caja'],
    ['/caja', ['kitchen'], '/cocina', CajaPage, 'Caja'],
    ['/cocina', ['waiter'], '/mozo', CocinaPage, 'Cocina'],
    ['/cocina', ['cashier'], '/caja', CocinaPage, 'Cocina'],
    ['/cocina', ['waiter', 'cashier'], '/areas', CocinaPage, 'Cocina'],
    ['/admin', ['cashier'], '/caja', AdminPage, 'Administración'],
    ['/admin', ['waiter'], '/mozo', AdminPage, 'Administración'],
    ['/admin', ['kitchen'], '/cocina', AdminPage, 'Administración'],
  ] as const)(
    'AC-34: %s deniega los roles %s y navega a %s',
    async (path, roles, destination, Page, heading) => {
      window.history.replaceState({}, '', path);
      mockSession([...roles]);
      show(<Page />);
      expect(screen.queryByRole('heading', { name: heading, level: 1 })).not.toBeInTheDocument();
      await waitFor(() => {
        expect(replace).toHaveBeenCalledExactlyOnceWith(destination);
      });
      expect(screen.queryByRole('heading', { name: heading, level: 1 })).not.toBeInTheDocument();
      expect(localStorage.getItem('polleria:lastArea')).toBeNull();
    },
  );
  it('AC-35: cierra una sola vez, espera la respuesta y recarga completamente', async () => {
    mockSession();
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls = vi.fn();
    server.use(
      http.post('*/api/auth/logout', async () => {
        calls();
        await waiting;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    show(<MozoPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
    const button = await screen.findByRole('button', { name: 'Cerrando sesión...' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    await waitFor(() => {
      expect(calls).toHaveBeenCalledTimes(1);
    });
    expect(hardNavigate).not.toHaveBeenCalled();
    release();
    await waitFor(() => {
      expect(hardNavigate).toHaveBeenCalledExactlyOnceWith('/login');
    });
  });
  it.each([500, 0])(
    'AC-35: un error de logout %s conserva la sesión y permite reintentar',
    async (status) => {
      mockSession();
      server.use(
        http.post('*/api/auth/logout', () =>
          status === 0
            ? HttpResponse.error()
            : HttpResponse.json(error('INTERNAL_ERROR', 'Error.'), { status }),
        ),
      );
      show(<MozoPage />);
      fireEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'No se pudo cerrar la sesión. Intenta de nuevo.',
      );
      expect(hardNavigate).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeEnabled();
    },
  );
  it('AC-36: Inicio conserva la salud y agrega el enlace de inicio de sesión', async () => {
    respondHealthOk();
    show(<HomePage />);
    expect(screen.getByRole('heading', { name: 'Sistema Pollería' })).toBeVisible();
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Conectado');
    });
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', '/login');
  });
  it.each([
    [
      ['waiter', 'cashier'],
      ['Mozo', 'Caja'],
    ],
    [['admin'], ['Mozo', 'Caja', 'Cocina', 'Administración']],
  ])(
    'AC-42: muestra solo las áreas permitidas de %s sin saltar a la última',
    async (roles, labels) => {
      window.history.replaceState({}, '', '/areas');
      localStorage.setItem('polleria:lastArea', '/caja');
      mockSession(roles as UserRole[], 'Ana');
      show(<AreasPage />);
      expect(screen.getByRole('status')).toHaveTextContent('Cargando...');
      expect(await screen.findByRole('heading', { name: '¿Dónde vas a trabajar?' })).toBeVisible();
      const links = within(screen.getByRole('navigation', { name: 'Áreas' })).getAllByRole('link');
      expect(links.map((link) => link.textContent)).toEqual(labels);
      expect(links.map((link) => link.getAttribute('href'))).toEqual(
        roles.includes('admin') ? ['/mozo', '/caja', '/cocina', '/admin'] : ['/mozo', '/caja'],
      );
      expect(replace).not.toHaveBeenCalled();
      expect(
        screen.getByText(roles.includes('admin') ? 'Ana · Administrador' : 'Ana · Mozo, Cajero'),
      ).toBeVisible();
      expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
    },
  );
  it('AC-42: sin sesión recarga en login sin mostrar el selector', async () => {
    window.history.replaceState({}, '', '/areas');
    show(<AreasPage />);
    await waitFor(() => {
      expect(hardNavigate).toHaveBeenCalledExactlyOnceWith('/login');
    });
    expect(
      screen.queryByRole('heading', { name: '¿Dónde vas a trabajar?', level: 1 }),
    ).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
  it('AC-42: un fallo de red permite reintentar y mostrar las áreas de Ana', async () => {
    window.history.replaceState({}, '', '/areas');
    server.use(http.get('*/api/auth/me', () => HttpResponse.error()));
    show(<AreasPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo verificar tu sesión.');
    expect(
      screen.queryByRole('heading', { name: '¿Dónde vas a trabajar?', level: 1 }),
    ).not.toBeInTheDocument();
    mockSession(['waiter', 'cashier'], 'Ana');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(
      await screen.findByRole('heading', { name: '¿Dónde vas a trabajar?', level: 1 }),
    ).toBeVisible();
    expect(screen.getByText('Ana · Mozo, Cajero')).toBeVisible();
    expect(
      within(screen.getByRole('navigation', { name: 'Áreas' }))
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/mozo', '/caja']);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(hardNavigate).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
  it('AC-42: con una sola área no muestra el selector y redirige directamente', async () => {
    mockSession();
    show(<AreasPage />);
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/mozo');
    });
    expect(
      screen.queryByRole('heading', { name: '¿Dónde vas a trabajar?' }),
    ).not.toBeInTheDocument();
  });
  it.each([
    [CajaPage, ['waiter', 'cashier'], '/caja', true, 'Caja'],
    [AdminPage, ['admin'], '/admin', true, 'Administración'],
    [MozoPage, ['admin'], '/mozo', true, 'Mesas'],
    [MozoPage, ['waiter'], '/mozo', false, 'Mesas'],
    [CocinaPage, ['kitchen'], '/cocina', false, 'Cocina'],
  ])(
    'AC-43: recuerda el área autorizada %s y ofrece cambio solo con varias áreas',
    async (Page, roles, path, canChange, heading) => {
      mockSession(roles as UserRole[]);
      show(<Page />);
      expect(await screen.findByRole('heading', { name: heading })).toBeVisible();
      await waitFor(() => {
        expect(localStorage.getItem('polleria:lastArea')).toBe(path);
      });
      if (canChange)
        expect(screen.getByRole('link', { name: 'Cambiar de área' })).toHaveAttribute(
          'href',
          '/areas',
        );
      else expect(screen.queryByRole('link', { name: 'Cambiar de área' })).not.toBeInTheDocument();
    },
  );
  it('AC-43: no guarda áreas prohibidas y tolera errores al guardar', async () => {
    mockSession(['cashier']);
    const view = show(<AdminPage />);
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/caja');
    });
    expect(localStorage.getItem('polleria:lastArea')).toBeNull();
    view.unmount();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('No disponible');
    });
    mockSession(['waiter', 'cashier']);
    show(<CajaPage />);
    expect(await screen.findByRole('heading', { name: 'Caja' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Cambiar de área' })).toBeVisible();
  });
});

describe('AC-P05: chrome POS opt-in del RoleGuard', () => {
  function renderGuard(pos = false) {
    return show(
      pos ? (
        <RoleGuard area="/mozo" appearance="pos">
          <p>Contenido de mesas</p>
        </RoleGuard>
      ) : (
        <RoleGuard area="/mozo">
          <p>Contenido de mesas</p>
        </RoleGuard>
      ),
    );
  }

  function expectOperationalActions() {
    const navigation = screen.getByRole('navigation', { name: 'Navegación principal' });
    expect(within(navigation).getByRole('link', { name: 'Mesas' })).toHaveAttribute(
      'href',
      '/mozo',
    );
    expect(within(navigation).getByRole('link', { name: 'Caja' })).toHaveAttribute('href', '/caja');
    expect(screen.getByRole('link', { name: 'Cambiar de área' })).toHaveAttribute('href', '/areas');
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Saltar al contenido' })).toHaveAttribute(
      'href',
      '#main-content',
    );
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
  }

  it('AC-P05: conserva el acceso y la navegación compartida sin appearance="pos"', async () => {
    mockSession(['waiter', 'cashier']);
    renderGuard();

    expect(await screen.findByText('Contenido de mesas')).toBeVisible();
    expectOperationalActions();
  });

  it('AC-P05: activa el chrome POS y conserva áreas, cambio de área, salida y salto accesible', async () => {
    mockSession(['waiter', 'cashier']);
    renderGuard(true);

    expect(await screen.findByText('Contenido de mesas')).toBeVisible();
    expectOperationalActions();
  });

  it('AC-P05: la apariencia POS sigue siendo opt-in para el contenedor del contenido', async () => {
    mockSession(['waiter', 'cashier']);
    const defaultView = renderGuard();
    expect(await screen.findByText('Contenido de mesas')).toBeVisible();
    const defaultMainClass = screen.getByRole('main').className;
    defaultView.unmount();

    renderGuard(true);
    expect(await screen.findByText('Contenido de mesas')).toBeVisible();
    expect(screen.getByRole('main').className).not.toBe(defaultMainClass);
  });
});
