'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { formatCashierSoles } from '@polleria/shared';
import Link from 'next/link';
import { useEffect } from 'react';
import { listCashierOrders } from '../../lib/api/payments.ts';

export function CashierOrders() {
  const options = {
    retry: false,
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  } as const;
  const query = useInfiniteQuery({
    queryKey: ['cashier', 'orders'],
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) => listCashierOrders(pageParam),
    getNextPageParam: (last) => last.nextAfterOrderId ?? undefined,
    ...options,
  });
  const refetch = query.refetch;
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden) {
        void refetch();
      }
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [refetch]);
  const pages = query.data?.pages ?? [];
  const orders = [
    ...new Map(pages.flatMap((page) => page.orders).map((order) => [order.id, order])).values(),
  ].sort((a, b) => a.id - b.id);
  const error = query.isError;
  return (
    <section className="cashier-orders print-hidden" aria-labelledby="cashier-orders-heading">
      <h2 id="cashier-orders-heading">Pedidos abiertos</h2>
      <p>Revisa la cuenta antes de confirmar el cobro.</p>
      {query.isPending && <p role="status">Cargando pedidos…</p>}
      {error && (
        <div>
          <p role="alert">
            No se pudieron actualizar los pedidos.
            {orders.length > 0 ? ' Se conserva la información anterior.' : ''}
          </p>
          <button
            className="payment-button"
            onClick={() => {
              void refetch();
            }}
          >
            Reintentar
          </button>
        </div>
      )}
      {!query.isPending && !error && orders.length === 0 && <p>No hay pedidos abiertos.</p>}
      <ul className="cashier-order-list">
        {orders.map((order) => (
          <li key={order.id}>
            <Link href={`/caja/pedidos/${order.id}`} className="cashier-order-link">
              <div>
                <strong>{order.tables.map((table) => table.name).join(', ') || 'Sin mesa'}</strong>
                <span>Pedido #{order.id}</span>
              </div>
              <strong className="tabular-nums">{formatCashierSoles(order.totalCents)}</strong>
              <span>
                {order.hasPendingVoids
                  ? 'Anulación pendiente'
                  : !order.canPay
                    ? 'No cobrable'
                    : order.billRequestedAt
                      ? 'Cuenta solicitada'
                      : 'Cuenta abierta'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {query.hasNextPage && (
        <button
          className="payment-button"
          disabled={query.isFetching}
          onClick={() => void query.fetchNextPage()}
        >
          Cargar más pedidos
        </button>
      )}
    </section>
  );
}
