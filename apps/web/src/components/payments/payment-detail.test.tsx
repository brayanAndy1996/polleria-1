// AC-11: confirmación y consulta histórica del pago.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../../tests/msw-server.ts';
import { PaymentDetail } from './payment-detail.tsx';

const BILL = {
  orderId: 41,
  tables: [{ id: 3, name: 'Mesa histórica 3' }],
  items: [
    {
      id: 5,
      productId: 2,
      productName: 'Pollo histórico',
      productCategory: 'chicken',
      quantity: 1,
      priceCents: 2100,
      portion: null,
      cut: null,
      breastEighths: 0,
      legEighths: 0,
      notes: null,
      sauces: [],
      components: [],
      status: 'sent',
    },
  ],
  totalCents: 2100,
  hasPendingVoids: false,
  canPay: true,
  billToken: 'd'.repeat(64),
  generatedAt: '2026-10-16T15:00:00.000Z',
};
const CASHIER = { id: 7, displayName: 'Rosa original' };
const PAYMENT = {
  id: 19,
  orderId: 41,
  method: 'cash',
  amountCents: 2100,
  receivedCents: 3000,
  changeCents: 900,
  cashier: CASHIER,
  paidAt: '2026-10-16T15:01:00.000Z',
  snapshot: {
    version: 1,
    bill: BILL,
    cashier: CASHIER,
    method: 'cash',
    amountCents: 2100,
    receivedCents: 3000,
    changeCents: 900,
    paidAt: '2026-10-16T15:01:00.000Z',
  },
};

describe('014: consulta de confirmación de pago', () => {
  it('AC-11: muestra el snapshot histórico y permite navegar sin formulario de cobro', async () => {
    server.use(http.get('*/api/payments/19', () => HttpResponse.json({ payment: PAYMENT })));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <PaymentDetail paymentId={19} />
      </QueryClientProvider>,
    );
    const detail = within(await screen.findByRole('region', { name: 'Pago confirmado' }));
    expect(detail.getByRole('heading', { name: /Pago #?19/ })).toBeInTheDocument();
    expect(detail.getByText('Rosa original')).toBeInTheDocument();
    expect(detail.getByText('Mesa histórica 3')).toBeInTheDocument();
    expect(screen.getByText('Pollo histórico')).toBeInTheDocument();
    expect(screen.getAllByText('S/ 21,00').length).toBeGreaterThan(0);
    expect(screen.getByText('S/ 30,00')).toBeInTheDocument();
    expect(screen.getByText('S/ 9,00')).toBeInTheDocument();
    expect(detail.queryByRole('button', { name: /cobrar/i })).not.toBeInTheDocument();
  });
});
