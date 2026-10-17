import { describe, expect, it } from 'vitest';
import {
  PAYMENT_METHODS,
  billItemSchema,
  billResponseSchema,
  billSchema,
  cashierOrdersResponseSchema,
  createPaymentResponseSchema,
  paymentMethodSchema,
  paymentRequestSchema,
  paymentSchema,
  paymentSnapshotSchema,
} from '@polleria/shared';

const billItem = {
  id: 1,
  productId: 2,
  productName: 'Cuarto de pollo',
  productCategory: 'chicken',
  quantity: 1,
  portion: 'quarter',
  cut: 'leg',
  priceCents: 1700,
  breastEighths: 0,
  legEighths: 2,
  notes: null,
  sauces: [],
  components: [],
  status: 'sent',
};

const billDrink = {
  ...billItem,
  id: 2,
  productId: 3,
  productName: 'Gaseosa',
  productCategory: 'drink',
  portion: null,
  cut: null,
  priceCents: 400,
  legEighths: 0,
};

const bill = {
  orderId: 12,
  tables: [{ id: 3, name: 'Mesa 3' }],
  items: [billItem, billDrink],
  totalCents: 2100,
  hasPendingVoids: false,
  canPay: true,
  billToken: 'a'.repeat(64),
  generatedAt: '2026-10-16T15:00:00.000Z',
};

const payment = {
  id: 24,
  orderId: 12,
  method: 'cash',
  amountCents: 2100,
  receivedCents: 3000,
  changeCents: 900,
  cashier: { id: 4, displayName: 'Rosa' },
  paidAt: '2026-10-16T15:01:00.000Z',
  snapshot: {
    version: 1,
    bill,
    cashier: { id: 4, displayName: 'Rosa' },
    method: 'cash',
    amountCents: 2100,
    receivedCents: 3000,
    changeCents: 900,
    paidAt: '2026-10-16T15:01:00.000Z',
  },
};

const order = {
  id: 12,
  status: 'closed',
  tables: [],
  openedBy: { id: 2, displayName: 'Juan' },
  openedAt: '2026-10-16T14:00:00.000Z',
  readyAt: null,
  billRequestedAt: null,
  closedAt: '2026-10-16T15:01:00.000Z',
  closedBy: { id: 4, displayName: 'Rosa' },
  cancelReason: null,
  mergedIntoOrderId: null,
  items: [],
  totalCents: 2100,
};

describe('014: esquemas compartidos de pre-cuenta y pago', () => {
  it('AC-02: valida la proyección de pre-cuenta sin campos internos de auditoría', () => {
    expect(billItemSchema.parse(billItem)).toEqual(billItem);
    expect(billSchema.parse(bill)).toEqual(bill);
    expect(billResponseSchema.parse({ bill })).toEqual({ bill });
    expect(
      billItemSchema.safeParse({ ...billItem, createdBy: { id: 4, displayName: 'Rosa' } }).success,
    ).toBe(false);
    expect(billItemSchema.safeParse({ ...billItem, status: 'voided' }).success).toBe(false);
  });

  it('AC-03: exige un token de cuenta hexadecimal minúsculo de 64 caracteres', () => {
    expect(billSchema.safeParse(bill).success).toBe(true);
    for (const token of ['a'.repeat(63), 'A'.repeat(64), 'g'.repeat(64)]) {
      expect(billSchema.safeParse({ ...bill, billToken: token }).success).toBe(false);
    }
  });

  it('AC-05: enumera solo los cuatro medios de pago aprobados', () => {
    expect(PAYMENT_METHODS).toEqual(['cash', 'yape', 'plin', 'card']);
    for (const method of PAYMENT_METHODS)
      expect(paymentMethodSchema.safeParse(method).success).toBe(true);
    expect(paymentMethodSchema.safeParse('transfer').success).toBe(false);
  });

  it('AC-05: exige confirmación manual y un cuerpo estricto para un medio electrónico', () => {
    const request = {
      method: 'yape',
      receivedCents: 2100,
      billToken: bill.billToken,
      confirmedReceived: true,
    };
    expect(paymentRequestSchema.parse(request)).toEqual(request);
    expect(paymentRequestSchema.safeParse({ ...request, confirmedReceived: false }).success).toBe(
      false,
    );
    expect(paymentRequestSchema.safeParse({ ...request, extra: true }).success).toBe(false);
  });

  it('AC-06: acepta sintácticamente cero y acota negativos, decimales y desbordes', () => {
    const base = {
      method: 'cash',
      receivedCents: 3000,
      billToken: bill.billToken,
      confirmedReceived: true,
    };
    // PaymentCents permite 0 en el contrato. Un pago de cero falla después en
    // la regla de negocio (total positivo / recibido suficiente), no al parsear.
    expect(paymentRequestSchema.safeParse({ ...base, receivedCents: 0 }).success).toBe(true);
    for (const receivedCents of [-1, 1.5, 2147483648]) {
      expect(paymentRequestSchema.safeParse({ ...base, receivedCents }).success).toBe(false);
    }
    expect(paymentRequestSchema.safeParse({ ...base, receivedCents: 2147483647 }).success).toBe(
      true,
    );
  });

  it('AC-11: valida pago y snapshot inmutables con la cuenta revisada', () => {
    expect(paymentSnapshotSchema.parse(payment.snapshot)).toEqual(payment.snapshot);
    expect(paymentSchema.parse(payment)).toEqual(payment);
    expect(createPaymentResponseSchema.parse({ order, payment }).payment).toEqual(payment);
  });

  it('AC-11: snapshot exige una cuenta cobrable cuyo total y aritmética coincidan', () => {
    expect(
      paymentSnapshotSchema.safeParse({
        ...payment.snapshot,
        bill: { ...bill, canPay: false },
      }).success,
    ).toBe(false);
    expect(
      paymentSnapshotSchema.safeParse({
        ...payment.snapshot,
        amountCents: 2000,
        receivedCents: 3000,
        changeCents: 1000,
      }).success,
    ).toBe(false);
    expect(
      paymentSnapshotSchema.safeParse({
        ...payment.snapshot,
        bill: {
          ...bill,
          items: [{ ...billItem, priceCents: 1800 }, billDrink],
        },
      }).success,
    ).toBe(false);
    expect(paymentSnapshotSchema.safeParse({ ...payment.snapshot, changeCents: 899 }).success).toBe(
      false,
    );
    expect(
      paymentSnapshotSchema.safeParse({ ...payment.snapshot, receivedCents: 2000 }).success,
    ).toBe(false);
    expect(
      paymentSnapshotSchema.safeParse({
        ...payment.snapshot,
        method: 'yape',
        receivedCents: 2100,
        changeCents: 0,
      }).success,
    ).toBe(true);
    expect(
      paymentSnapshotSchema.safeParse({
        ...payment.snapshot,
        method: 'yape',
        receivedCents: 3000,
        changeCents: 900,
      }).success,
    ).toBe(false);
  });

  it('AC-11: los campos repetidos en Payment deben coincidir con el snapshot', () => {
    expect(paymentSchema.safeParse({ ...payment, receivedCents: 2999 }).success).toBe(false);
    expect(paymentSchema.safeParse({ ...payment, method: 'plin' }).success).toBe(false);
    expect(paymentSchema.safeParse({ ...payment, amountCents: 2000 }).success).toBe(false);
    expect(
      paymentSchema.safeParse({ ...payment, cashier: { id: 5, displayName: 'Luis' } }).success,
    ).toBe(false);
  });

  it('AC-12: valida el sobre paginado de pedidos de Caja', () => {
    const response = {
      orders: [
        {
          id: 12,
          tables: [{ id: 3, name: 'Mesa 3' }],
          totalCents: 2100,
          openedAt: '2026-10-16T14:00:00.000Z',
          billRequestedAt: null,
          hasPendingVoids: false,
          canPay: true,
        },
      ],
      nextAfterOrderId: null,
    };
    expect(cashierOrdersResponseSchema.parse(response)).toEqual(response);
    expect(cashierOrdersResponseSchema.safeParse({ ...response, cursor: '12' }).success).toBe(
      false,
    );
  });
});
