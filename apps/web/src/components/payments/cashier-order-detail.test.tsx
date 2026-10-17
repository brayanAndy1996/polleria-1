// AC-04/07/13: flujo de cobro completo y reintento seguro tras perder respuesta.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../tests/msw-server.ts';
import { CashierOrderDetail } from './cashier-order-detail.tsx';

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const BILL = {
  orderId: 41,
  tables: [{ id: 3, name: 'Mesa 3' }],
  items: [
    {
      id: 5,
      productId: 2,
      productName: 'Pollo a la brasa',
      productCategory: 'chicken',
      quantity: 1,
      priceCents: 2100,
      portion: 'quarter',
      cut: 'leg',
      breastEighths: 0,
      legEighths: 2,
      notes: null,
      sauces: [],
      components: [],
      status: 'sent',
    },
  ],
  totalCents: 2100,
  hasPendingVoids: false,
  canPay: true,
  billToken: 'b'.repeat(64),
  generatedAt: '2026-10-16T15:00:00.000Z',
};
const ORDER = {
  id: 41,
  status: 'closed',
  tables: [],
  openedBy: { id: 2, displayName: 'Juan' },
  openedAt: '2026-10-16T14:00:00.000Z',
  readyAt: null,
  billRequestedAt: null,
  closedAt: '2026-10-16T15:01:00.000Z',
  closedBy: { id: 7, displayName: 'Rosa' },
  cancelReason: null,
  mergedIntoOrderId: null,
  items: [],
  totalCents: 2100,
};
const PAYMENT = {
  id: 19,
  orderId: 41,
  method: 'cash',
  amountCents: 2100,
  receivedCents: 3000,
  changeCents: 900,
  cashier: { id: 7, displayName: 'Rosa' },
  paidAt: '2026-10-16T15:01:00.000Z',
  snapshot: {
    version: 1,
    bill: BILL,
    cashier: { id: 7, displayName: 'Rosa' },
    method: 'cash',
    amountCents: 2100,
    receivedCents: 3000,
    changeCents: 900,
    paidAt: '2026-10-16T15:01:00.000Z',
  },
};
const SUCCESS = { order: ORDER, payment: PAYMENT };

function mount() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CashierOrderDetail orderId={41} />
    </QueryClientProvider>,
  );
}

describe('014: detalle y formulario de Caja', () => {
  afterEach(() => {
    router.push.mockClear();
    vi.restoreAllMocks();
  });

  it('AC-04/13: revisa total, confirma efectivo en soles y muestra vuelto calculado', async () => {
    const received: Array<{ key: string | null; body: unknown }> = [];
    server.use(
      http.get('*/api/orders/41/bill', () => HttpResponse.json({ bill: BILL })),
      http.post('*/api/orders/41/payments', async ({ request }) => {
        received.push({
          key: request.headers.get('Idempotency-Key'),
          body: await request.json(),
        });
        return HttpResponse.json(SUCCESS, { status: 201 });
      }),
    );
    mount();
    expect(await screen.findByText('Pollo a la brasa')).toBeInTheDocument();
    expect(screen.getByText('S/ 21,00')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/monto recibido \(s\/\)/i), {
      target: { value: '30,00' },
    });
    expect(screen.getByText('S/ 9,00')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /revisar cobro/i }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('S/ 21,00');
    expect(screen.getByRole('dialog')).toHaveTextContent('S/ 30,00');
    expect(screen.getByRole('dialog')).toHaveTextContent('S/ 9,00');
    fireEvent.click(screen.getByRole('button', { name: /confirmar cobro/i }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/caja/pagos/19'));
    expect(received).toHaveLength(1);
    expect(received[0]?.body).toEqual({
      method: 'cash',
      receivedCents: 3000,
      billToken: BILL.billToken,
      confirmedReceived: true,
    });
    expect(received[0]?.key).toEqual(expect.any(String));
  });

  it.each(['network loss', 'server 500', 'malformed 201'] as const)(
    'AC-13: conserva clave/cuerpo ante resultado incierto (%s)',
    async (failure) => {
      const attempts: Array<{ key: string | null; body: string }> = [];
      let count = 0;
      server.use(
        http.get('*/api/orders/41/bill', () => HttpResponse.json({ bill: BILL })),
        http.post('*/api/orders/41/payments', async ({ request }) => {
          attempts.push({
            key: request.headers.get('Idempotency-Key'),
            body: await request.text(),
          });
          count += 1;
          if (count > 1) return HttpResponse.json(SUCCESS, { status: 201 });
          if (failure === 'network loss') return HttpResponse.error();
          if (failure === 'server 500')
            return HttpResponse.json(
              { error: { code: 'INTERNAL_ERROR', message: 'Error interno.', details: null } },
              { status: 500 },
            );
          return HttpResponse.json({ order: ORDER, payment: {} }, { status: 201 });
        }),
      );
      mount();
      await screen.findByText('Pollo a la brasa');
      fireEvent.change(screen.getByLabelText(/monto recibido \(s\/\)/i), {
        target: { value: '30' },
      });
      fireEvent.click(screen.getByRole('button', { name: /revisar cobro/i }));
      fireEvent.click(await screen.findByRole('button', { name: /confirmar cobro/i }));
      const retry = await screen.findByRole('button', { name: /reintentar solicitud/i });
      expect(screen.getByRole('alert')).toHaveTextContent(/sin confirmar|respuesta|estado/i);
      fireEvent.click(retry);
      await waitFor(() => expect(router.push).toHaveBeenCalledWith('/caja/pagos/19'));
      expect(attempts).toHaveLength(2);
      expect(attempts[0]).toEqual(attempts[1]);
    },
  );

  it('AC-05: Yape exige confirmación manual y envía el total exacto', async () => {
    const sent: unknown[] = [];
    server.use(
      http.get('*/api/orders/41/bill', () => HttpResponse.json({ bill: BILL })),
      http.post('*/api/orders/41/payments', async ({ request }) => {
        sent.push(await request.json());
        const yapePayment = {
          ...PAYMENT,
          method: 'yape',
          receivedCents: 2100,
          changeCents: 0,
          snapshot: {
            ...PAYMENT.snapshot,
            method: 'yape',
            receivedCents: 2100,
            changeCents: 0,
          },
        };
        return HttpResponse.json({ order: ORDER, payment: yapePayment }, { status: 201 });
      }),
    );
    const { container } = mount();
    await screen.findByText('Pollo a la brasa');
    fireEvent.change(container.querySelector('select[name="paymentMethod"]')!, {
      target: { value: 'yape' },
    });
    expect(screen.queryByLabelText(/monto recibido/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /revisar cobro/i }));
    expect(screen.getByRole('dialog')).toHaveTextContent(/confirmo que recibí el pago/i);
    const confirm = screen.getByRole('button', { name: /confirmar cobro/i });
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/confirmo que recibí el pago/i));
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/caja/pagos/19'));
    expect(sent).toEqual([
      {
        method: 'yape',
        receivedCents: 2100,
        billToken: BILL.billToken,
        confirmedReceived: true,
      },
    ]);
  });

  it('AC-13: BILL_CHANGED relee la cuenta y pide una revisión nueva con clave nueva', async () => {
    const changedBill = {
      ...BILL,
      items: [{ ...BILL.items[0]!, priceCents: 2500 }],
      totalCents: 2500,
      billToken: 'c'.repeat(64),
      generatedAt: '2026-10-16T15:02:00.000Z',
    };
    const changedPayment = {
      ...PAYMENT,
      amountCents: 2500,
      receivedCents: 3000,
      changeCents: 500,
      snapshot: {
        ...PAYMENT.snapshot,
        bill: changedBill,
        amountCents: 2500,
        receivedCents: 3000,
        changeCents: 500,
      },
    };
    const changedOrder = { ...ORDER, totalCents: 2500 };
    const keys: Array<string | null> = [];
    let billReads = 0;
    let creates = 0;
    server.use(
      http.get('*/api/orders/41/bill', () => {
        billReads += 1;
        return HttpResponse.json({ bill: billReads === 1 ? BILL : changedBill });
      }),
      http.post('*/api/orders/41/payments', ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key'));
        creates += 1;
        if (creates === 1)
          return HttpResponse.json(
            { error: { code: 'BILL_CHANGED', message: 'La cuenta cambió.', details: null } },
            { status: 409 },
          );
        return HttpResponse.json({ order: changedOrder, payment: changedPayment }, { status: 201 });
      }),
    );
    mount();
    await screen.findByText('Pollo a la brasa');
    fireEvent.change(screen.getByLabelText(/monto recibido \(s\/\)/i), {
      target: { value: '30' },
    });
    fireEvent.click(screen.getByRole('button', { name: /revisar cobro/i }));
    fireEvent.click(await screen.findByRole('button', { name: /confirmar cobro/i }));
    expect(await screen.findByText('S/ 25,00')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /revisar cobro/i })).toBeInTheDocument();
    expect(creates).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: /revisar cobro/i }));
    fireEvent.click(await screen.findByRole('button', { name: /confirmar cobro/i }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/caja/pagos/19'));
    expect(billReads).toBeGreaterThanOrEqual(2);
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('AC-13: el guard síncrono evita dos solicitudes al confirmar con doble clic', async () => {
    let requestCount = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get('*/api/orders/41/bill', () => HttpResponse.json({ bill: BILL })),
      http.post('*/api/orders/41/payments', async () => {
        requestCount += 1;
        await gate;
        return HttpResponse.json(SUCCESS, { status: 201 });
      }),
    );
    mount();
    await screen.findByText('Pollo a la brasa');
    fireEvent.change(screen.getByLabelText(/monto recibido \(s\/\)/i), {
      target: { value: '30' },
    });
    fireEvent.click(screen.getByRole('button', { name: /revisar cobro/i }));
    const confirm = await screen.findByRole('button', { name: /confirmar cobro/i });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(requestCount).toBe(1));
    release();
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/caja/pagos/19'));
    expect(requestCount).toBe(1);
  });

  it('AC-13: bloquea otro intento si no pudo releer después de BILL_CHANGED', async () => {
    let billReads = 0;
    let creates = 0;
    const changedBill = {
      ...BILL,
      items: [{ ...BILL.items[0]!, priceCents: 2500 }],
      totalCents: 2500,
      billToken: 'e'.repeat(64),
    };
    server.use(
      http.get('*/api/orders/41/bill', () => {
        billReads += 1;
        if (billReads === 1) return HttpResponse.json({ bill: BILL });
        if (billReads === 2)
          return HttpResponse.json(
            { error: { code: 'INTERNAL_ERROR', message: 'Error interno.', details: null } },
            { status: 500 },
          );
        return HttpResponse.json({ bill: changedBill });
      }),
      http.post('*/api/orders/41/payments', () => {
        creates += 1;
        return HttpResponse.json(
          { error: { code: 'BILL_CHANGED', message: 'La cuenta cambió.', details: null } },
          { status: 409 },
        );
      }),
    );
    mount();
    await screen.findByText('Pollo a la brasa');
    fireEvent.change(screen.getByLabelText(/monto recibido \(s\/\)/i), {
      target: { value: '30' },
    });
    fireEvent.click(screen.getByRole('button', { name: /revisar cobro/i }));
    fireEvent.click(await screen.findByRole('button', { name: /confirmar cobro/i }));
    expect(await screen.findByText(/no se pudo cargar la pre-cuenta/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /revisar cobro/i })).not.toBeInTheDocument();
    expect(creates).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(await screen.findByText('S/ 25,00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /revisar cobro/i })).toBeInTheDocument();
    expect(creates).toBe(1);
  });

  it('AC-06/13: bloquea cuentas que no pueden cobrarse', async () => {
    server.use(
      http.get('*/api/orders/41/bill', () =>
        HttpResponse.json({ bill: { ...BILL, canPay: false, hasPendingVoids: true } }),
      ),
    );
    mount();
    expect(await screen.findByRole('status')).toHaveTextContent(/anulación pendiente/i);
    expect(screen.queryByRole('button', { name: /revisar cobro/i })).not.toBeInTheDocument();
  });
});
