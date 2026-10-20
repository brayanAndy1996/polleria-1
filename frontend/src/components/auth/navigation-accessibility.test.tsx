import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserRole } from '@polleria/shared';
import { respondHealthOk } from '../../../tests/health-mocks.ts';
import { server } from '../../../tests/msw-server.ts';
import { AreaSelector } from './area-selector.tsx';
import { LoginScreen } from './login-screen.tsx';
import HomePage from '../../app/page.tsx';
import WaiterPage from '../../app/mozo/page.tsx';
import CashierPage from '../../app/caja/page.tsx';
import AdminPage from '../../app/admin/page.tsx';
import { RoleGuard } from './role-guard.tsx';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => window.location.pathname,
}));
vi.mock('../../lib/navigation.ts', () => ({ hardNavigate: vi.fn() }));

const session = (roles: UserRole[]) => ({
  user: { id: 1, username: 'ana', displayName: 'Ana', roles },
  expiresAt: '2026-10-09T07:00:00.000Z',
});

function show(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return Object.assign(render(<QueryClientProvider client={client}>{node}</QueryClientProvider>), {
    queryClient: client,
  });
}

function setDesktopViewport(desktop: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((media: string) => ({
      matches: media === '(min-width: 1024px)' && desktop,
      media,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function hasInertAncestor(element: Element): boolean {
  let current: Element | null = element;
  while (current) {
    if ('inert' in current && (current as HTMLElement).inert) return true;
    if (current.hasAttribute('inert')) return true;
    current = current.parentElement;
  }
  return false;
}

function mockSession(roles: UserRole[]) {
  server.use(http.get('*/api/auth/me', () => HttpResponse.json(session(roles))));
}

async function expectSkipLinkTargetsTheOnlyMain() {
  const skipLink = await screen.findByRole('link', { name: 'Saltar al contenido' });
  expect(skipLink).toHaveAttribute('href', '#main-content');
  expect(document.getElementById('main-content')).toBeInTheDocument();
  expect(document.querySelectorAll('main')).toHaveLength(1);
  expect(document.querySelectorAll('#main-content')).toHaveLength(1);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  document.body.style.overflow = '';
  setDesktopViewport(true);
  window.history.replaceState({}, '', '/');
  server.use(
    http.get('*/api/auth/me', () =>
      HttpResponse.json(
        { error: { code: 'UNAUTHENTICATED', message: 'Inicia sesión.' } },
        { status: 401 },
      ),
    ),
    http.get('*/api/auth/users', () => HttpResponse.json({ users: [] })),
    http.get('*/api/tables', () => HttpResponse.json({ tables: [] })),
  );
  respondHealthOk();
});

describe('navegación accesible del rediseño', () => {
  it('AC-02/05: conserva una navegación de áreas única y con nombre accesible', async () => {
    window.history.replaceState({}, '', '/caja');
    mockSession(['waiter', 'cashier']);
    show(<CashierPage />);

    const navigation = await screen.findByRole('navigation', { name: 'Navegación principal' });
    expect(document.querySelectorAll('nav')).toHaveLength(1);
    expect(
      within(navigation)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/mozo', '/caja']);
    expect(within(navigation).getByRole('link', { name: 'Caja' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('conecta el skip link al único main en inicio e inicio de sesión', async () => {
    const home = show(<HomePage />);
    await expectSkipLinkTargetsTheOnlyMain();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    home.unmount();

    show(<LoginScreen />);
    await expectSkipLinkTargetsTheOnlyMain();
    expect(await screen.findByRole('heading', { level: 1, name: '¿Quién eres?' })).toBeVisible();
    await expectSkipLinkTargetsTheOnlyMain();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('conecta el skip link al único main del selector de áreas', async () => {
    window.history.replaceState({}, '', '/areas');
    mockSession(['waiter', 'cashier']);
    show(<AreaSelector />);
    await expectSkipLinkTargetsTheOnlyMain();
    expect(await screen.findByRole('heading', { name: '¿Dónde vas a trabajar?' })).toBeVisible();
  });

  it('conecta el skip link al único main de un área protegida', async () => {
    window.history.replaceState({}, '', '/mozo');
    mockSession(['waiter']);
    show(<WaiterPage />);
    await expectSkipLinkTargetsTheOnlyMain();
    expect(await screen.findByRole('heading', { name: 'Mesas' })).toBeVisible();
  });

  it('limita la navegación de áreas a los roles y marca una única área actual', async () => {
    const cases = [
      { roles: ['waiter', 'cashier'] as UserRole[], path: '/caja', allowed: ['/mozo', '/caja'] },
      {
        roles: ['admin'] as UserRole[],
        path: '/admin',
        allowed: ['/mozo', '/caja', '/cocina', '/admin'],
      },
    ];
    for (const { roles, path, allowed } of cases) {
      window.history.replaceState({}, '', path);
      mockSession(roles);
      const view = show(path === '/caja' ? <CashierPage /> : <AdminPage />);
      await screen.findByRole('heading', { level: 1 });
      const navigation = await screen.findByRole('navigation', { name: 'Navegación principal' });
      const links = within(navigation).getAllByRole('link');
      expect(links.map((link) => link.getAttribute('href'))).toEqual(allowed);
      const names = links.map((link) => link.textContent?.trim());
      expect(names.every((name) => !!name)).toBe(true);
      expect(new Set(names).size).toBe(names.length);
      expect(new Set(links.map((link) => link.getAttribute('href'))).size).toBe(links.length);
      expect(
        links
          .filter((link) => link.getAttribute('aria-current') === 'page')
          .map((link) => link.getAttribute('href')),
      ).toEqual([path]);
      view.unmount();
    }
  });

  it('AC-S01/S02: en escritorio conserva marca, navegación autorizada Mesas y salida sin duplicar chrome', async () => {
    window.history.replaceState({}, '', '/mozo');
    mockSession(['waiter']);
    show(<WaiterPage />);

    const navigation = await screen.findByRole('navigation', { name: 'Navegación principal' });
    const mesas = within(navigation).getByRole('link', { name: 'Mesas' });
    expect(mesas).toHaveAttribute('href', '/mozo');
    expect(mesas).toHaveAttribute('aria-current', 'page');
    expect(within(navigation).queryByRole('link', { name: 'Administración' })).toBeNull();
    expect(screen.getByText('Sistema Pollería')).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Cerrar sesión' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Abrir navegación' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.querySelectorAll('main')).toHaveLength(1);
  });

  it('AC-S02: el administrador conserva secciones reales y activa Carta en rutas nuevas/detalle', async () => {
    const cases = [
      { path: '/admin/carta/nuevo', label: 'Carta', href: '/admin/carta' },
      { path: '/admin/carta/12', label: 'Carta', href: '/admin/carta' },
      { path: '/admin/mesas/3', label: 'Configurar mesas', href: '/admin/mesas' },
      { path: '/admin/usuarios/nuevo', label: 'Usuarios', href: '/admin/usuarios' },
    ];

    for (const route of cases) {
      window.history.replaceState({}, '', route.path);
      mockSession(['admin']);
      const view = show(
        <RoleGuard area="/admin">
          <p>Contenido administrativo</p>
        </RoleGuard>,
      );

      const navigation = await screen.findByRole('navigation', { name: 'Navegación principal' });
      const sections = screen.getByRole('navigation', { name: 'Administración' });
      const activeLink = within(sections).getByRole('link', { name: route.label });
      expect(activeLink).toHaveAttribute('href', route.href);
      expect(activeLink).toHaveAttribute('aria-current', 'page');
      expect(within(sections).getByRole('link', { name: 'Carta' })).toHaveAttribute(
        'href',
        '/admin/carta',
      );
      expect(within(sections).getByRole('link', { name: 'Configurar mesas' })).toHaveAttribute(
        'href',
        '/admin/mesas',
      );
      expect(within(sections).getByRole('link', { name: 'Usuarios' })).toHaveAttribute(
        'href',
        '/admin/usuarios',
      );
      expect(within(navigation).getByRole('link', { name: 'Administración' })).toHaveAttribute(
        'href',
        '/admin',
      );
      view.unmount();
    }
  });

  it('AC-S03: el drawer móvil abre, limita foco, cierra con Escape/cierre/navegación y devuelve foco', async () => {
    setDesktopViewport(false);
    window.history.replaceState({}, '', '/mozo');
    mockSession(['waiter', 'cashier']);
    show(
      <RoleGuard area="/mozo">
        <p>Contenido de mesas</p>
      </RoleGuard>,
    );

    const trigger = await screen.findByRole('button', { name: 'Abrir navegación' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog', { name: 'Navegación' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Caja' })).not.toBeInTheDocument();

    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Navegación' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(hasInertAncestor(dialog)).toBe(false);
    expect(hasInertAncestor(screen.getByRole('main'))).toBe(true);
    expect(document.activeElement === dialog || dialog.contains(document.activeElement)).toBe(true);
    expect(within(dialog).getByRole('link', { name: 'Mesas' })).toHaveAttribute('href', '/mozo');
    expect(within(dialog).getByRole('link', { name: 'Caja' })).toHaveAttribute('href', '/caja');
    expect(within(dialog).queryByRole('link', { name: 'Administración' })).not.toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Navegación' })).toBeNull());
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(trigger);
    expect(hasInertAncestor(screen.getByRole('main'))).toBe(false);

    fireEvent.click(trigger);
    const reopened = await screen.findByRole('dialog', { name: 'Navegación' });
    fireEvent.click(within(reopened).getByRole('button', { name: 'Cerrar navegación' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Navegación' })).toBeNull());
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    const forNavigation = await screen.findByRole('dialog', { name: 'Navegación' });
    fireEvent.click(within(forNavigation).getByRole('link', { name: 'Caja' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Navegación' })).toBeNull());
  });

  it('AC-S03: libera fondo y scroll si la sesión falla mientras el drawer está abierto', async () => {
    setDesktopViewport(false);
    window.history.replaceState({}, '', '/mozo');
    mockSession(['waiter']);
    document.body.style.overflow = 'clip';
    const view = show(
      <RoleGuard area="/mozo">
        <p>Contenido de mesas</p>
      </RoleGuard>,
    );

    const trigger = await screen.findByRole('button', { name: 'Abrir navegación' });
    fireEvent.click(trigger);
    expect(await screen.findByRole('dialog', { name: 'Navegación' })).toBeVisible();
    expect(document.body.style.overflow).toBe('hidden');

    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json(
          { error: { code: 'INTERNAL_ERROR', message: 'Fallo de sesión.' } },
          { status: 500 },
        ),
      ),
    );
    await view.queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo verificar tu sesión.');
    expect(screen.queryByRole('dialog', { name: 'Navegación' })).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('clip');

    mockSession(['waiter']);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Contenido de mesas')).toBeVisible();
    const recoveredTrigger = screen.getByRole('button', { name: 'Abrir navegación' });
    expect(recoveredTrigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog', { name: 'Navegación' })).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('clip');
  });
});
