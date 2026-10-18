import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { server } from '../../../../tests/msw-server.ts';
import InventoryPage from './page.tsx';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('../../../lib/navigation.ts', () => ({ hardNavigate: vi.fn() }));

const SNAPSHOT = {
  chicken: { enabled: true, breastEighths: 8, legEighths: 12 },
  drinks: [{ productId: 8, productName: 'Inca Kola', enabled: true, quantity: 5 }],
  generatedAt: '2026-10-17T15:00:00.000Z',
};
const ACTOR = { id: 1, displayName: 'Carlos' };
const movement = (id: number) => ({
  id,
  kind: id % 2 === 0 ? 'breast' : 'leg',
  productId: null,
  productName: null,
  type: 'batch',
  delta: 4,
  quantityAfter: id * 4,
  enabledAfter: null,
  reason: `Tanda ${id}`,
  actor: ACTOR,
  ticketId: null,
  createdAt: '2026-10-17T15:00:00.000Z',
});
const AUTH = {
  user: { id: 1, username: 'dueno', displayName: 'Carlos', roles: ['admin'] },
  expiresAt: '2026-10-20T07:00:00.000Z',
};

function show(node: ReactNode = <InventoryPage />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

function defaultReads() {
  server.use(
    http.get('*/api/auth/me', () => HttpResponse.json(AUTH)),
    http.get('*/api/inventory', () => HttpResponse.json(SNAPSHOT)),
    http.get('*/api/inventory/movements', () =>
      HttpResponse.json({ movements: [], nextAfterId: null }),
    ),
  );
}

describe('015: administración de inventario', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, '', '/admin/inventario');
    defaultReads();
  });

  it.each([
    [
      '500',
      () =>
        HttpResponse.json(
          { error: { code: 'INTERNAL_ERROR', message: 'Intenta de nuevo.', details: null } },
          { status: 500 },
        ),
    ],
    [
      '201 ilegible',
      () => HttpResponse.json({ inventory: SNAPSHOT, movements: [{ id: 0 }] }, { status: 201 }),
    ],
  ])(
    'AC-13: revisión de tanda y reintento %s conservan cuerpo y clave y congelan el borrador',
    async (_case, uncertainResponse) => {
      let attempt = 0;
      const requests: Array<{ key: string | null; body: string }> = [];
      server.use(
        http.post('*/api/inventory/chicken/batches', async ({ request }) => {
          requests.push({
            key: request.headers.get('Idempotency-Key'),
            body: await request.clone().text(),
          });
          attempt += 1;
          return attempt === 1
            ? uncertainResponse()
            : HttpResponse.json({ inventory: SNAPSHOT, movements: [] }, { status: 201 });
        }),
      );
      show();
      await screen.findByRole('heading', { name: 'Inventario', level: 1 });
      fireEvent.click(await screen.findByRole('button', { name: /registrar tanda/i }));
      fireEvent.change(screen.getByLabelText(/pollos/i), { target: { value: '2' } });
      fireEvent.change(screen.getByLabelText(/motivo/i), { target: { value: 'Tanda de prueba' } });
      fireEvent.click(screen.getByRole('button', { name: /revisar/i }));
      const reviewDialog = await screen.findByRole('dialog');
      fireEvent.click(
        within(reviewDialog).getByRole('button', { name: /confirmar.*tanda|registrar.*tanda/i }),
      );

      const retry = await screen.findByRole('button', { name: /reintentar/i });
      expect(screen.getByLabelText(/pollos/i)).toBeDisabled();
      expect(screen.getByLabelText(/motivo/i)).toBeDisabled();
      fireEvent.click(retry);
      await waitFor(() => expect(requests).toHaveLength(2));
      expect(requests[1]).toEqual(requests[0]);
    },
  );

  it('AC-13: cargar la siguiente página agrega movimientos y conserva los ya visibles', async () => {
    server.use(
      http.get('*/api/inventory/movements', ({ request }) => {
        const afterId = new URL(request.url).searchParams.get('afterId');
        return afterId === null
          ? HttpResponse.json({
              movements: Array.from({ length: 50 }, (_, i) => movement(i + 1)),
              nextAfterId: 50,
            })
          : HttpResponse.json({ movements: [movement(51)], nextAfterId: null });
      }),
    );
    show();
    expect(await screen.findByText('Tanda 1')).toBeVisible();
    expect(screen.getByText('Tanda 50')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /cargar siguientes/i }));
    expect(await screen.findByText('Tanda 51')).toBeVisible();
    expect(screen.getByText('Tanda 1')).toBeVisible();
    expect(screen.getByText('Tanda 50')).toBeVisible();
  });
});
