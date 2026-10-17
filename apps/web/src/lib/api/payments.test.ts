// AC-07/10/13: respuestas estrictas y solicitudes idempotentes de Caja (MSW, sin API/DB).
import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../tests/msw-server.ts';
import { createPayment, getBill, getPayment, listCashierOrders } from './payments.ts';

const BILL = {
  orderId: 41,
  tables: [{ id: 3, name: 'Mesa 3' }],
  items: [
    {
      id: 5,
      productId: 2,
      productName: 'Pollo',
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
  billToken: 'a'.repeat(64),
  generatedAt: '2026-10-16T15:00:00.000Z',
};
const CASHIER = { id: 7, displayName: 'Rosa' };
const PAID_AT = '2026-10-16T15:01:00.000Z';
const PAYMENT = {
  id: 19,
  orderId: 41,
  method: 'cash',
  amountCents: 2100,
  receivedCents: 3000,
  changeCents: 900,
  cashier: CASHIER,
  paidAt: PAID_AT,
  snapshot: {
    version: 1,
    bill: BILL,
    cashier: CASHIER,
    method: 'cash',
    amountCents: 2100,
    receivedCents: 3000,
    changeCents: 900,
    paidAt: PAID_AT,
  },
};
const ORDER = {
  id: 41,
  status: 'closed',
  tables: [],
  openedBy: { id: 2, displayName: 'Juan' },
  openedAt: '2026-10-16T14:00:00.000Z',
  readyAt: null,
  billRequestedAt: null,
  closedAt: PAID_AT,
  closedBy: CASHIER,
  cancelReason: null,
  mergedIntoOrderId: null,
  items: [],
  totalCents: 2100,
};
const CREATE_RESULT = { order: ORDER, payment: PAYMENT };
const LIST_RESULT = {
  orders: [
    {
      id: 41,
      tables: BILL.tables,
      totalCents: 2100,
      openedAt: '2026-10-16T14:00:00.000Z',
      billRequestedAt: null,
      hasPendingVoids: false,
      canPay: true,
    },
  ],
  nextAfterOrderId: null,
};

describe('014: cliente de pagos de Caja', () => {
  afterEach(() => vi.clearAllMocks());

  it('AC-12: lista pedidos con cursor opcional y valida respuesta', async () => {
    const urls: string[] = [];
    server.use(
      http.get('*/api/cashier/orders', ({ request }) => {
        urls.push(request.url);
        return HttpResponse.json(LIST_RESULT);
      }),
    );
    await expect(listCashierOrders()).resolves.toEqual(LIST_RESULT);
    await expect(listCashierOrders(35)).resolves.toEqual(LIST_RESULT);
    expect(urls).toEqual([
      `${window.location.origin}/api/cashier/orders`,
      `${window.location.origin}/api/cashier/orders?afterOrderId=35`,
    ]);
  });

  it('AC-03: lee la cuenta y exige el envelope bill', async () => {
    server.use(
      http.get('*/api/orders/41/bill', ({ request }) => {
        expect(request.url).toBe(`${window.location.origin}/api/orders/41/bill`);
        return HttpResponse.json({ bill: BILL });
      }),
    );
    await expect(getBill(41)).resolves.toEqual(BILL);
    server.use(http.get('*/api/orders/41/bill', () => HttpResponse.json(BILL)));
    await expect(getBill(41)).rejects.toMatchObject({ code: 'UNEXPECTED_RESPONSE', status: 200 });
  });

  it('AC-07: crea el pago una vez con cuerpo congelado y cabecera Idempotency-Key', async () => {
    const key = 'same-attempt-014';
    const body = {
      method: 'cash' as const,
      receivedCents: 3000,
      billToken: BILL.billToken,
      confirmedReceived: true as const,
    };
    const requests: Array<{ url: string; key: string | null; body: unknown }> = [];
    server.use(
      http.post('*/api/orders/41/payments', async ({ request }) => {
        requests.push({
          url: request.url,
          key: request.headers.get('Idempotency-Key'),
          body: await request.json(),
        });
        return HttpResponse.json(CREATE_RESULT, { status: 201 });
      }),
    );
    await expect(createPayment(41, body, key)).resolves.toEqual(CREATE_RESULT);
    await expect(createPayment(41, body, key)).resolves.toEqual(CREATE_RESULT);
    expect(requests).toEqual([
      { url: `${window.location.origin}/api/orders/41/payments`, key, body },
      { url: `${window.location.origin}/api/orders/41/payments`, key, body },
    ]);
  });

  it('AC-13: un 201 truncado o malformado conserva el estado incierto', async () => {
    server.use(
      http.post('*/api/orders/41/payments', () =>
        HttpResponse.json(
          { order: ORDER, payment: { ...PAYMENT, amountCents: 1 } },
          { status: 201 },
        ),
      ),
    );
    await expect(
      createPayment(
        41,
        {
          method: 'cash',
          receivedCents: 3000,
          billToken: BILL.billToken,
          confirmedReceived: true,
        },
        'uncertain-malformed-014',
      ),
    ).rejects.toMatchObject({ name: 'ApiError', code: 'UNEXPECTED_RESPONSE', status: 201 });
  });

  it('AC-13: una respuesta de red perdida se puede repetir con la misma clave y cuerpo', async () => {
    const body = {
      method: 'cash' as const,
      receivedCents: 3000,
      billToken: BILL.billToken,
      confirmedReceived: true as const,
    };
    const observed: string[] = [];
    let attempt = 0;
    server.use(
      http.post('*/api/orders/41/payments', async ({ request }) => {
        observed.push(`${request.headers.get('Idempotency-Key')}|${await request.text()}`);
        attempt += 1;
        return attempt === 1
          ? HttpResponse.error()
          : HttpResponse.json(CREATE_RESULT, { status: 201 });
      }),
    );
    await expect(createPayment(41, body, 'uncertain-replay-014')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      status: 0,
    });
    await expect(createPayment(41, body, 'uncertain-replay-014')).resolves.toEqual(CREATE_RESULT);
    expect(observed).toHaveLength(2);
    expect(observed[0]).toBe(observed[1]);
  });

  it('AC-11: recupera el pago histórico y comunica errores de negocio concretos', async () => {
    server.use(http.get('*/api/payments/19', () => HttpResponse.json({ payment: PAYMENT })));
    await expect(getPayment(19)).resolves.toEqual(PAYMENT);
    server.use(
      http.post('*/api/orders/41/payments', () =>
        HttpResponse.json(
          { error: { code: 'BILL_CHANGED', message: 'La cuenta cambió.', details: null } },
          { status: 409 },
        ),
      ),
    );
    await expect(
      createPayment(
        41,
        {
          method: 'cash',
          receivedCents: 3000,
          billToken: BILL.billToken,
          confirmedReceived: true,
        },
        'bill-changed-014',
      ),
    ).rejects.toMatchObject({ name: 'ApiError', code: 'BILL_CHANGED', status: 409 });
  });
});
