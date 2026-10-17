'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  formatCashierSoles,
  parseSolesToCents,
  PAYMENT_CENTS_MAX,
  PAYMENT_METHODS,
} from '@polleria/shared';
import type { Bill, PaymentMethod, PaymentRequest } from '@polleria/shared';
import { useRef, useState } from 'react';
import { Dialog, Modal, ModalOverlay } from 'react-aria-components';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiError } from '../../lib/api/client.ts';
import { apiErrorMessage } from '../../lib/api/error-message.ts';
import { createPayment, getBill } from '../../lib/api/payments.ts';
import { createIdempotencyKey } from '../../lib/idempotency.ts';
import { BillView } from './bill-view.tsx';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  yape: 'Yape',
  plin: 'Plin',
  card: 'Tarjeta',
};
interface Review {
  bill: Bill;
  body: PaymentRequest;
}
interface Attempt extends Review {
  key: string;
}

export function CashierOrderDetail({ orderId }: { orderId: number }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [received, setReceived] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState<string>();
  const amountInput = useRef<HTMLInputElement>(null);
  const billQuery = useQuery({
    queryKey: ['payments', 'bill', orderId],
    queryFn: () => getBill(orderId),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const bill = billQuery.data;
  const cents = method === 'cash' ? parseSolesToCents(received) : (bill?.totalCents ?? null);
  const validAmount =
    cents !== null && Number.isSafeInteger(cents) && cents >= 0 && cents <= PAYMENT_CENTS_MAX;
  const change = bill && validAmount && cents >= bill.totalCents ? cents - bill.totalCents : null;

  function startReview() {
    if (busy.current || attempt !== null || !bill?.canPay || billQuery.isError) return;
    if (!validAmount || cents === null || cents < bill.totalCents) {
      setError('Escribe un monto recibido en soles que cubra el total, con hasta dos decimales.');
      amountInput.current?.focus();
      return;
    }
    setConfirmed(false);
    setError(undefined);
    setReview({
      bill,
      body: { method, receivedCents: cents, billToken: bill.billToken, confirmedReceived: true },
    });
  }

  async function submit() {
    if (busy.current || !review || (review.body.method !== 'cash' && !confirmed)) return;
    busy.current = true;
    setPending(true);
    setError(undefined);
    const frozen = attempt ?? { ...review, key: createIdempotencyKey() };
    setAttempt(frozen);
    try {
      const response = await createPayment(orderId, frozen.body, frozen.key);
      queryClient.setQueryData(['payments', 'payment', response.payment.id], response.payment);
      void queryClient.invalidateQueries({ queryKey: ['cashier', 'orders'] });
      setAttempt(null);
      setReview(null);
      router.push(`/caja/pagos/${response.payment.id}`);
    } catch (failure) {
      const uncertain =
        !(failure instanceof ApiError) ||
        failure.code === 'NETWORK_ERROR' ||
        failure.code === 'UNEXPECTED_RESPONSE' ||
        failure.status >= 500;
      if (uncertain) {
        setError(
          'El estado del cobro está sin confirmar: no se recibió una respuesta válida. Reintenta la misma solicitud para recuperar el resultado.',
        );
      } else {
        setAttempt(null);
        setReview(null);
        if (failure.code === 'BILL_CHANGED') {
          setConfirmed(false);
          setError('La cuenta cambió. Revísala nuevamente y confirma un nuevo cobro.');
          await billQuery.refetch();
        } else {
          setError(apiErrorMessage(failure));
        }
      }
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <div className="print-hidden">
        <Link href="/caja" className="payment-link">
          Volver a Caja
        </Link>
        <h1>Revisar y cobrar</h1>
      </div>
      {!bill && billQuery.isPending && <p aria-live="polite">Cargando pre-cuenta…</p>}
      {billQuery.isError && (
        <div className="print-hidden">
          <p role="alert">No se pudo cargar la pre-cuenta.</p>
          <button className="payment-button" onClick={() => void billQuery.refetch()}>
            Reintentar
          </button>
        </div>
      )}
      {bill && (
        <div className="cashier-layout">
          <BillView bill={bill} />
          {bill.canPay && !billQuery.isError && (
            <section className="payment-form print-hidden" aria-labelledby="payment-form-heading">
              <h2 id="payment-form-heading">Cobro completo</h2>
              <p>Un solo medio de pago para este pedido.</p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  startReview();
                }}
              >
                <fieldset disabled={pending || attempt !== null} className="space-y-4">
                  <label className="payment-field">
                    Medio de pago
                    <select
                      name="paymentMethod"
                      value={method}
                      onChange={(event) => {
                        setMethod(event.target.value as PaymentMethod);
                        setConfirmed(false);
                      }}
                    >
                      {PAYMENT_METHODS.map((value) => (
                        <option key={value} value={value}>
                          {PAYMENT_METHOD_LABELS[value]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {method === 'cash' && (
                    <label className="payment-field">
                      Monto recibido (S/)
                      <input
                        ref={amountInput}
                        name="receivedAmount"
                        autoComplete="off"
                        inputMode="decimal"
                        type="text"
                        value={received}
                        onChange={(event) => setReceived(event.target.value)}
                      />
                    </label>
                  )}
                  <div className="bill-line">
                    <span>Vuelto (S/)</span>
                    <strong>{formatCashierSoles(change ?? 0)}</strong>
                  </div>
                  <button className="payment-button payment-primary" type="submit">
                    Revisar cobro
                  </button>
                </fieldset>
              </form>
              {error && !review && (
                <p role="alert" className="payment-notice">
                  {error}
                </p>
              )}
            </section>
          )}
        </div>
      )}
      <ModalOverlay
        isOpen={review !== null}
        isDismissable={attempt === null && !pending}
        onOpenChange={(open) => {
          if (!open && !pending && attempt === null) setReview(null);
        }}
        className="payment-overlay print-hidden"
      >
        <Modal className="payment-modal">
          <Dialog aria-labelledby="confirm-payment-heading">
            {review && (
              <>
                <h2 id="confirm-payment-heading">Confirmar cobro</h2>
                <p>
                  Pedido {orderId} · {review.bill.tables.map((table) => table.name).join(', ')}
                </p>
                <p>Medio: {PAYMENT_METHOD_LABELS[review.body.method]}</p>
                <dl className="payment-totals">
                  <div>
                    <dt>Total</dt>
                    <dd>{formatCashierSoles(review.bill.totalCents)}</dd>
                  </div>
                  <div>
                    <dt>Recibido</dt>
                    <dd>{formatCashierSoles(review.body.receivedCents)}</dd>
                  </div>
                  <div>
                    <dt>Vuelto</dt>
                    <dd>
                      {formatCashierSoles(review.body.receivedCents - review.bill.totalCents)}
                    </dd>
                  </div>
                </dl>
                <p>Este cobro cierra el pedido y libera sus mesas.</p>
                {review.body.method !== 'cash' && (
                  <label className="payment-check">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      disabled={attempt !== null || pending}
                      onChange={(event) => setConfirmed(event.target.checked)}
                    />
                    Confirmo que recibí el pago
                  </label>
                )}
                {error && (
                  <p role="alert" className="payment-notice">
                    {error}
                  </p>
                )}
                <div className="flex flex-wrap gap-3">
                  <button
                    className="payment-button payment-primary"
                    type="button"
                    disabled={pending || (review.body.method !== 'cash' && !confirmed)}
                    onClick={() => void submit()}
                  >
                    {pending
                      ? 'Confirmando…'
                      : attempt
                        ? 'Reintentar solicitud'
                        : 'Confirmar cobro'}
                  </button>
                  {attempt === null && (
                    <button
                      className="payment-button"
                      type="button"
                      onClick={() => setReview(null)}
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </>
  );
}
