'use client';

import { useQuery } from '@tanstack/react-query';
import { formatCashierSoles, toLimaDateTimeParts } from '@polleria/shared';
import Link from 'next/link';
import { getPayment } from '../../lib/api/payments.ts';
import { PAYMENT_METHOD_LABELS } from './cashier-order-detail.tsx';
import { BillView } from './bill-view.tsx';

export function PaymentDetail({ paymentId }: { paymentId: number }) {
  const query = useQuery({
    queryKey: ['payments', 'payment', paymentId],
    queryFn: () => getPayment(paymentId),
    retry: false,
  });
  const payment = query.data;
  const date = payment ? toLimaDateTimeParts(new Date(payment.paidAt)) : null;
  return (
    <>
      <div className="print-hidden">
        <Link href="/caja" className="payment-link">
          Volver a Caja
        </Link>
        <h1>{payment ? 'Cobro confirmado' : 'Detalle del pago'}</h1>
      </div>
      {query.isPending && <p role="status">Cargando pago…</p>}
      {query.isError && (
        <div>
          <p role="alert">No se pudo consultar el pago.</p>
          <button className="payment-button" onClick={() => void query.refetch()}>
            Reintentar
          </button>
        </div>
      )}
      {payment && (
        <>
          <section className="payment-form print-hidden" aria-label="Pago confirmado">
            <h2>Pago {payment.id}</h2>
            <p>
              Pedido {payment.orderId} ·{' '}
              <span>{payment.snapshot.bill.tables.map((table) => table.name).join(', ')}</span>
            </p>
            <p>Medio: {PAYMENT_METHOD_LABELS[payment.method]}</p>
            <dl className="payment-totals">
              <div>
                <dt>Total</dt>
                <dd>{formatCashierSoles(payment.amountCents)}</dd>
              </div>
              <div>
                <dt>Recibido</dt>
                <dd>{formatCashierSoles(payment.receivedCents)}</dd>
              </div>
              <div>
                <dt>Vuelto</dt>
                <dd>{formatCashierSoles(payment.changeCents)}</dd>
              </div>
            </dl>
            <p>
              Cajero: <span>{payment.cashier.displayName}</span>
            </p>
            {date && (
              <p>
                {date.day}/{date.month}/{date.year} {date.hour}:{date.minute} · Lima
              </p>
            )}
            <p>El cobro cerró el pedido y liberó sus mesas.</p>
          </section>
          <BillView bill={payment.snapshot.bill} />
        </>
      )}
    </>
  );
}
