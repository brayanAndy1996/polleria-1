import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../tests/msw-server.ts';
import AdminPage from './page.tsx';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
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
    const link = screen.getByRole('link', { name: 'Usuarios' });
    expect(link).toBeVisible();
    expect(link).toHaveAttribute('href', '/admin/usuarios');
  });
});
