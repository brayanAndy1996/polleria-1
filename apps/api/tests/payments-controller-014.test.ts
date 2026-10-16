// AC-07/10: controller puro; no requiere conexión ni migraciones.
import type { Request, Response, NextFunction } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { Bill, CashierOrdersResponse, CreatePaymentResponse, Payment } from '@polleria/shared';
import { createPaymentsController } from '../src/controllers/payments.controller.ts';

const bill = {
  orderId: 41,
  tables: [],
  items: [],
  totalCents: 2100,
  hasPendingVoids: false,
  canPay: true,
  billToken: 'a'.repeat(64),
  generatedAt: '2026-10-16T15:00:00.000Z',
} satisfies Bill;
const list = { orders: [], nextAfterOrderId: null } satisfies CashierOrdersResponse;
const payment = {
  id: 19,
  orderId: 41,
  method: 'cash',
  amountCents: 2100,
  receivedCents: 3000,
  changeCents: 900,
  cashier: { id: 7, displayName: 'Rosa' },
  paidAt: '2026-10-16T15:00:00.000Z',
  snapshot: {
    version: 1,
    bill,
    cashier: { id: 7, displayName: 'Rosa' },
    method: 'cash',
    amountCents: 2100,
    receivedCents: 3000,
    changeCents: 900,
    paidAt: '2026-10-16T15:00:00.000Z',
  },
} satisfies Payment;
const created = { order: { id: 41 }, payment } as unknown as CreatePaymentResponse;

function harness(
  overrides: {
    params?: Record<string, string>;
    query?: Record<string, unknown>;
    body?: unknown;
    key?: string;
    userId?: number;
  } = {},
) {
  const req = {
    params: overrides.params ?? {},
    query: overrides.query ?? {},
    body: overrides.body,
    headers: overrides.key === undefined ? {} : { 'idempotency-key': overrides.key },
  } as unknown as Request;
  const status = vi.fn().mockReturnThis();
  const res = {
    locals: overrides.userId === undefined ? {} : { auth: { user: { id: overrides.userId } } },
    status,
    json: vi.fn(function (this: Response) {
      return this;
    }),
  } as unknown as Response;
  const next = vi.fn() as NextFunction;
  return { req, res, next, status };
}

describe('014: controller HTTP de Caja', () => {
  it('AC-10: lista y lee la cuenta delegando cursor e identidad de sesión', async () => {
    const paymentService = {
      listCashierOrders: vi.fn().mockResolvedValue(list),
      getBill: vi.fn().mockResolvedValue(bill),
    };
    const controller = createPaymentsController({ paymentService } as never);
    const listRequest = harness({ query: { afterOrderId: '35' }, userId: 12 });
    await controller.listOrders(listRequest.req, listRequest.res, listRequest.next);
    expect(paymentService.listCashierOrders).toHaveBeenCalledExactlyOnceWith(35, { userId: 12 });
    expect(listRequest.res.json).toHaveBeenCalledExactlyOnceWith(list);
    expect(listRequest.next).not.toHaveBeenCalled();

    const billRequest = harness({ params: { orderId: '41' }, userId: 12 });
    await controller.getBill(billRequest.req, billRequest.res, billRequest.next);
    expect(paymentService.getBill).toHaveBeenCalledExactlyOnceWith(41, { userId: 12 });
    expect(billRequest.res.json).toHaveBeenCalledExactlyOnceWith({ bill });
  });

  it('AC-07: crea el pago con clave, cuerpo y cajero y devuelve 201', async () => {
    const paymentService = { createPayment: vi.fn().mockResolvedValue(created) };
    const controller = createPaymentsController({ paymentService } as never);
    const body = {
      method: 'cash',
      receivedCents: 3000,
      billToken: bill.billToken,
      confirmedReceived: true,
    };
    const context = harness({
      params: { orderId: '41' },
      key: 'payment-controller-014',
      body,
      userId: 7,
    });
    await controller.create(context.req, context.res, context.next);
    expect(paymentService.createPayment).toHaveBeenCalledExactlyOnceWith(
      41,
      body,
      'payment-controller-014',
      { userId: 7 },
    );
    expect(context.status).toHaveBeenCalledExactlyOnceWith(201);
    expect(context.res.json).toHaveBeenCalledExactlyOnceWith(created);
    expect(context.next).not.toHaveBeenCalled();
  });

  it('AC-10: lee un pago histórico con id y actor', async () => {
    const paymentService = { getPayment: vi.fn().mockResolvedValue(payment) };
    const controller = createPaymentsController({ paymentService } as never);
    const context = harness({ params: { paymentId: '19' }, userId: 7 });
    await controller.getPayment(context.req, context.res, context.next);
    expect(paymentService.getPayment).toHaveBeenCalledExactlyOnceWith(19, { userId: 7 });
    expect(context.res.json).toHaveBeenCalledExactlyOnceWith({ payment });
  });

  it.each([
    ['order id', 'getBill', { params: { orderId: 'nope' }, userId: 7 }],
    ['payment id', 'getPayment', { params: { paymentId: '0' }, userId: 7 }],
    ['cursor', 'listOrders', { query: { afterOrderId: '1.5' }, userId: 7 }],
    ['missing session', 'getBill', { params: { orderId: '41' } }],
  ] as const)('AC-10: rechaza %s antes de llamar el servicio', async (_name, handler, input) => {
    const paymentService = {
      listCashierOrders: vi.fn(),
      getBill: vi.fn(),
      getPayment: vi.fn(),
    };
    const controller = createPaymentsController({ paymentService } as never);
    const context = harness(input);
    await controller[handler](context.req, context.res, context.next);
    expect(context.next).toHaveBeenCalledOnce();
    expect(paymentService.listCashierOrders).not.toHaveBeenCalled();
    expect(paymentService.getBill).not.toHaveBeenCalled();
    expect(paymentService.getPayment).not.toHaveBeenCalled();
  });

  it('AC-10: exige una clave de idempotencia antes de invocar createPayment', async () => {
    const paymentService = { createPayment: vi.fn() };
    const controller = createPaymentsController({ paymentService } as never);
    const context = harness({ params: { orderId: '41' }, body: {}, userId: 7 });
    await controller.create(context.req, context.res, context.next);
    expect(context.next).toHaveBeenCalledOnce();
    expect(paymentService.createPayment).not.toHaveBeenCalled();
  });
});
