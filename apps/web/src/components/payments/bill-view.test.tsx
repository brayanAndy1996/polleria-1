// AC-14: pre-cuenta imprimible sin generar pago ni comanda.
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Bill } from '@polleria/shared';
import { BillView } from './bill-view.tsx';

const BILL: Bill = {
  orderId: 41,
  tables: [{ id: 3, name: 'Mesa 3' }],
  items: [
    {
      id: 5,
      productId: 2,
      productName: 'Pollo a la brasa',
      productCategory: 'chicken',
      quantity: 1,
      priceCents: 1700,
      portion: 'quarter',
      cut: 'leg',
      breastEighths: 0,
      legEighths: 2,
      notes: null,
      sauces: [{ productId: 8, productName: 'Ají', quantity: 1, priceCents: 400 }],
      components: [],
      status: 'sent',
    },
  ],
  totalCents: 2100,
  hasPendingVoids: false,
  canPay: true,
  billToken: 'a'.repeat(64),
  generatedAt: '2026-10-16T15:00:00.000Z',
};

describe('014: vista imprimible de pre-cuenta', () => {
  afterEach(() => vi.restoreAllMocks());

  it('AC-14: muestra detalles en soles y advierte que no es comprobante', () => {
    render(<BillView bill={BILL} />);
    expect(screen.getByText('PRE-CUENTA')).toBeInTheDocument();
    expect(screen.getByText('Mesa 3')).toBeInTheDocument();
    expect(screen.getByText('Pollo a la brasa')).toBeInTheDocument();
    expect(screen.getByText('Ají')).toBeInTheDocument();
    expect(screen.getByText('S/ 21,00')).toBeInTheDocument();
    expect(screen.getByText('No es comprobante de pago')).toBeInTheDocument();
  });

  it('AC-14: imprimir solo abre el diálogo y una cuenta bloqueada explica por qué no se cobra', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    render(<BillView bill={{ ...BILL, hasPendingVoids: true, canPay: false }} />);
    fireEvent.click(screen.getByRole('button', { name: /imprimir pre-cuenta/i }));
    expect(print).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent(/anulación pendiente/i);
    expect(screen.queryByRole('button', { name: /cobrar/i })).not.toBeInTheDocument();
  });
});
