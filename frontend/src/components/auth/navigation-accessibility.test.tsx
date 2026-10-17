import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
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

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('../../lib/navigation.ts', () => ({ hardNavigate: vi.fn() }));

const session = (roles: UserRole[]) => ({
  user: { id: 1, username: 'ana', displayName: 'Ana', roles },
  expiresAt: '2026-10-09T07:00:00.000Z',
});

function show(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
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

    const navigation = await screen.findByRole('navigation', { name: 'Navegación de áreas' });
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
      const navigation = await screen.findByRole('navigation', { name: 'Navegación de áreas' });
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
});
