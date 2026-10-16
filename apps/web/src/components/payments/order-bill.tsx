'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { getBill } from '../../lib/api/payments.ts';
import { BillView } from './bill-view.tsx';

export function OrderBill({ orderId }: { orderId: number }) {
  const query = useQuery({
    queryKey: ['payments', 'bill', orderId],
    queryFn: () => getBill(orderId),
    retry: false,
  });
  return (
    <>
      <div className="print-hidden">
        <Link href="/mozo" className="payment-link">
          Volver a las mesas
        </Link>
        <h1>Pre-cuenta del pedido {orderId}</h1>
      </div>
      {query.isPending && <p role="status">Cargando pre-cuenta…</p>}
      {query.isError && (
        <div>
          <p role="alert">No se pudo cargar la pre-cuenta.</p>
          <button className="payment-button" onClick={() => void query.refetch()}>
            Reintentar
          </button>
        </div>
      )}
      {query.data && <BillView bill={query.data} />}
    </>
  );
}
