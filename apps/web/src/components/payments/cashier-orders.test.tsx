// AC-12: Caja conserva todas las páginas al cargar y al actualizar pedidos abiertos.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../tests/msw-server.ts';
import { CashierOrders } from './cashier-orders.tsx';

function summary(id: number) {
  return {
    id,
    tables: [{ id, name: `Mesa ${id}` }],
    totalCents: 2100,
    openedAt: '2026-10-16T14:00:00.000Z',
    billRequestedAt: null,
    hasPendingVoids: false,
    canPay: true,
  };
}

function mount() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CashierOrders />
    </QueryClientProvider>,
  );
}

describe('014: lista de pedidos abiertos de Caja', () => {
  afterEach(() => vi.restoreAllMocks());

  it('AC-12: conserva la primera página al cargar la siguiente y actualiza ambas', async () => {
    const calls: string[] = [];
    let firstPageCalls = 0;
    let refreshed = false;
    server.use(
      http.get('*/api/cashier/orders', ({ request }) => {
        const url = new URL(request.url);
        calls.push(url.search);
        const cursor = url.searchParams.get('afterOrderId');
        if (cursor !== null) {
          return HttpResponse.json({
            orders: [summary(refreshed ? 52 : 51)],
            nextAfterOrderId: null,
          });
        }
        firstPageCalls += 1;
        if (firstPageCalls > 1) refreshed = true;
        return HttpResponse.json({
          orders: Array.from({ length: 50 }, (_, index) => summary(index + (refreshed ? 2 : 1))),
          nextAfterOrderId: refreshed ? 51 : 50,
        });
      }),
    );
    mount();
    expect(await screen.findByRole('link', { name: /Pedido #1\b/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /cargar más pedidos/i }));
    expect(await screen.findByRole('link', { name: /Pedido #51\b/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Pedido #1\b/ })).toBeInTheDocument();
    expect(calls).toEqual(['', '?afterOrderId=50']);

    // Cada polling vuelve a recorrer páginas ya cargadas para que un pago no borre
    // los resultados de páginas posteriores ni deje tarjetas obsoletas.
    await waitFor(
      () => expect(screen.getByRole('link', { name: /Pedido #52\b/ })).toBeInTheDocument(),
      {
        timeout: 7000,
      },
    );
    expect(screen.queryByRole('link', { name: /Pedido #1\b/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Pedido #51\b/ })).toBeInTheDocument();
    expect(calls).toContain('?afterOrderId=51');
  }, 10000);

  it('AC-12: muestra el total y distingue cuenta solicitada y bloqueos', async () => {
    server.use(
      http.get('*/api/cashier/orders', () =>
        HttpResponse.json({
          orders: [
            { ...summary(41), billRequestedAt: '2026-10-16T14:50:00.000Z' },
            { ...summary(42), hasPendingVoids: true, canPay: false },
          ],
          nextAfterOrderId: null,
        }),
      ),
    );
    mount();
    expect(await screen.findByRole('link', { name: /Pedido #41\b/ })).toBeInTheDocument();
    expect(screen.getByText(/cuenta solicitada/i)).toBeInTheDocument();
    expect(screen.getByText(/anulación pendiente/i)).toBeInTheDocument();
    expect(screen.getAllByText('S/ 21,00').length).toBeGreaterThan(0);
  });
});
