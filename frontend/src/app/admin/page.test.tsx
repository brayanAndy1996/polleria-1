import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../tests/msw-server.ts';
import AdminPage from './page.tsx';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => window.location.pathname,
}));
vi.mock('../../lib/navigation.ts', () => ({ hardNavigate: vi.fn() }));

function show(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

describe('004: enlace a Usuarios en Administración', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, '', '/admin');
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({
          user: { id: 1, username: 'dueno', displayName: 'Carlos', roles: ['admin'] },
          expiresAt: '2026-10-09T07:00:00.000Z',
        }),
      ),
    );
  });
  it('AC-20: muestra el encabezado y el enlace Usuarios a /admin/usuarios', async () => {
    show(<AdminPage />);
    expect(
      await screen.findByRole('heading', { name: 'Administraci\u00F3n', level: 1 }),
    ).toBeVisible();
    const dashboard = within(screen.getByRole('main'));
    const link = dashboard.getByRole('link', { name: 'Usuarios' });
    expect(link).toBeVisible();
    expect(link).toHaveAttribute('href', '/admin/usuarios');
  });
});

describe('008: enlace a Carta en Administración', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, '', '/admin');
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({
          user: { id: 1, username: 'dueno', displayName: 'Carlos', roles: ['admin'] },
          expiresAt: '2026-10-09T07:00:00.000Z',
        }),
      ),
    );
  });
  it('AC-05: muestra el enlace Carta a /admin/carta junto al de Usuarios', async () => {
    show(<AdminPage />);
    expect(
      await screen.findByRole('heading', { name: 'Administraci\u00F3n', level: 1 }),
    ).toBeVisible();
    const dashboard = within(screen.getByRole('main'));
    const carta = dashboard.getByRole('link', { name: 'Carta' });
    expect(carta).toBeVisible();
    expect(carta).toHaveAttribute('href', '/admin/carta');
    expect(dashboard.getByRole('link', { name: 'Usuarios' })).toHaveAttribute(
      'href',
      '/admin/usuarios',
    );
  });
});

describe('012: enlace a Mesas en Administración', () => {
  // AC-04 de la spec 012: va EN ROJO hasta que T-07 sume el enlace 'Mesas' a
  // app/admin/page.tsx junto a 'Usuarios' y 'Carta'.
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, '', '/admin');
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({
          user: { id: 1, username: 'dueno', displayName: 'Carlos', roles: ['admin'] },
          expiresAt: '2026-10-09T07:00:00.000Z',
        }),
      ),
    );
  });
  it('AC-04: muestra el enlace Mesas a /admin/mesas junto a Usuarios y Carta', async () => {
    show(<AdminPage />);
    expect(
      await screen.findByRole('heading', { name: 'Administraci\u00F3n', level: 1 }),
    ).toBeVisible();
    const dashboard = within(screen.getByRole('main'));
    const mesas = dashboard.getByRole('link', { name: 'Mesas' });
    expect(mesas).toBeVisible();
    expect(mesas).toHaveAttribute('href', '/admin/mesas');
    expect(dashboard.getByRole('link', { name: 'Usuarios' })).toHaveAttribute(
      'href',
      '/admin/usuarios',
    );
    expect(dashboard.getByRole('link', { name: 'Carta' })).toHaveAttribute('href', '/admin/carta');
  });
});
