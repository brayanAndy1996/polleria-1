'use client';

import { formatCashierSoles, toLimaDateTimeParts } from '@polleria/shared';
import type { Bill } from '@polleria/shared';
import { formatPortionCutLabel } from '../../lib/menu-labels.ts';

export function BillView({ bill }: { bill: Bill }) {
  const date = toLimaDateTimeParts(new Date(bill.generatedAt));
  return (
    <section className="bill-sheet" aria-label="Pre-cuenta">
      <div className="bill-heading">
        <div>
          <h2>PRE-CUENTA</h2>
          <p>Pedido {bill.orderId}</p>
        </div>
        <button
          type="button"
          className="payment-button print-hidden"
          onClick={() => window.print()}
        >
          Imprimir pre-cuenta
        </button>
      </div>
      <p className="font-semibold">
        {bill.tables.map((table) => table.name).join(', ') || 'Sin mesa'}
      </p>
      <p className="text-sm text-muted">
        {date.day}/{date.month}/{date.year} {date.hour}:{date.minute} · Lima
      </p>
      <ul className="bill-items">
        {bill.items.map((item) => {
          const subtotal =
            item.quantity * item.priceCents +
            item.sauces.reduce((sum, sauce) => sum + sauce.quantity * sauce.priceCents, 0);
          return (
            <li key={item.id}>
              <div className="bill-line">
                <span className="font-semibold">{item.productName}</span>
                <span>
                  {item.quantity} × {formatCashierSoles(item.priceCents)}
                </span>
              </div>
              {item.portion && (
                <p className="text-sm">{formatPortionCutLabel(item.portion, item.cut)}</p>
              )}
              {item.components.map((component, index) => (
                <p key={index} className="text-sm">
                  {component.quantity} × {component.productName}
                  {component.portion
                    ? ` · ${formatPortionCutLabel(component.portion, component.cut)}`
                    : ''}
                </p>
              ))}
              {item.sauces.map((sauce, index) => (
                <div className="bill-line text-sm" key={index}>
                  <span>{sauce.productName}</span>
                  <span>
                    {sauce.quantity} × {formatCashierSoles(sauce.priceCents)}
                  </span>
                </div>
              ))}
              {item.notes && <p className="text-sm">{item.notes}</p>}
              {item.status === 'void_requested' && <p className="text-sm">Anulación pendiente</p>}
              <p className="bill-subtotal">Subtotal {formatCashierSoles(subtotal)}</p>
            </li>
          );
        })}
      </ul>
      {bill.items.length === 0 && <p>El pedido no tiene ítems para cobrar.</p>}
      <div className="bill-total">
        <span>Total (S/)</span>
        <strong>{formatCashierSoles(bill.totalCents)}</strong>
      </div>
      <p className="bill-disclaimer">No es comprobante de pago</p>
      {!bill.canPay && (
        <p role="status" className="payment-notice print-hidden">
          {bill.hasPendingVoids
            ? 'Hay una anulación pendiente. Resuélvela antes de cobrar.'
            : 'Esta cuenta no se puede cobrar: requiere ítems y un total positivo dentro del límite permitido.'}
        </p>
      )}
    </section>
  );
}
