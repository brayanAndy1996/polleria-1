import { z } from 'zod';
import { orderItemSchema, tableRefSchema, userRefSchema } from './order-items.ts';
import { orderSchema } from './orders.ts';

export const PAYMENT_METHODS = ['cash', 'yape', 'plin', 'card'] as const;
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const PAYMENT_CENTS_MAX = 2147483647;
export const paymentCentsSchema = z.number().int().min(0).max(PAYMENT_CENTS_MAX);
export const billTokenSchema = z.string().regex(/^[0-9a-f]{64}$/);
const idSchema = z.number().int().min(1).max(2147483647);
const billTotalSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

/** Proyección pública: no expone autores ni motivos de anulación. */
export const billItemSchema = orderItemSchema
  .pick({
    id: true,
    productId: true,
    productName: true,
    productCategory: true,
    quantity: true,
    priceCents: true,
    portion: true,
    cut: true,
    breastEighths: true,
    legEighths: true,
    notes: true,
    sauces: true,
    components: true,
  })
  .extend({ status: z.enum(['sent', 'void_requested']) });
export type BillItem = z.infer<typeof billItemSchema>;

export const billSchema = z.strictObject({
  orderId: idSchema,
  tables: z.array(tableRefSchema),
  items: z.array(billItemSchema),
  totalCents: billTotalSchema,
  hasPendingVoids: z.boolean(),
  canPay: z.boolean(),
  billToken: billTokenSchema,
  generatedAt: z.iso.datetime(),
});
export type Bill = z.infer<typeof billSchema>;
export const billResponseSchema = z.strictObject({ bill: billSchema });
export type BillResponse = z.infer<typeof billResponseSchema>;

export const paymentRequestSchema = z.strictObject({
  method: paymentMethodSchema,
  receivedCents: paymentCentsSchema,
  billToken: billTokenSchema,
  confirmedReceived: z.literal(true),
});
export type PaymentRequest = z.infer<typeof paymentRequestSchema>;

const paymentFields = {
  cashier: userRefSchema,
  method: paymentMethodSchema,
  amountCents: paymentCentsSchema.min(1),
  receivedCents: paymentCentsSchema,
  changeCents: paymentCentsSchema,
  paidAt: z.iso.datetime(),
};

export const paymentSnapshotSchema = z
  .strictObject({ version: z.literal(1), bill: billSchema, ...paymentFields })
  .refine(
    (snapshot) =>
      snapshot.bill.canPay &&
      !snapshot.bill.hasPendingVoids &&
      snapshot.bill.items.length > 0 &&
      snapshot.bill.items.every((item) => item.status === 'sent') &&
      snapshot.amountCents === snapshot.bill.totalCents &&
      snapshot.receivedCents >= snapshot.amountCents &&
      snapshot.changeCents === snapshot.receivedCents - snapshot.amountCents &&
      (snapshot.method === 'cash' || snapshot.receivedCents === snapshot.amountCents),
    { message: 'Los importes del pago no coinciden con la cuenta y el medio de pago.' },
  );
export type PaymentSnapshot = z.infer<typeof paymentSnapshotSchema>;

export const paymentSchema = z
  .strictObject({
    id: idSchema,
    orderId: idSchema,
    ...paymentFields,
    snapshot: paymentSnapshotSchema,
  })
  .refine(
    (payment) =>
      payment.orderId === payment.snapshot.bill.orderId &&
      payment.method === payment.snapshot.method &&
      payment.amountCents === payment.snapshot.amountCents &&
      payment.receivedCents === payment.snapshot.receivedCents &&
      payment.changeCents === payment.snapshot.changeCents &&
      payment.paidAt === payment.snapshot.paidAt &&
      payment.cashier.id === payment.snapshot.cashier.id &&
      payment.cashier.displayName === payment.snapshot.cashier.displayName,
    { message: 'El pago no coincide con su registro histórico.' },
  );
export type Payment = z.infer<typeof paymentSchema>;
export const paymentResponseSchema = z.strictObject({ payment: paymentSchema });
export type PaymentResponse = z.infer<typeof paymentResponseSchema>;
export const createPaymentResponseSchema = z.strictObject({
  order: orderSchema,
  payment: paymentSchema,
});
export type CreatePaymentResponse = z.infer<typeof createPaymentResponseSchema>;

export const cashierOrderSummarySchema = z.strictObject({
  id: idSchema,
  tables: z.array(tableRefSchema),
  totalCents: billTotalSchema,
  openedAt: z.iso.datetime(),
  billRequestedAt: z.iso.datetime().nullable(),
  hasPendingVoids: z.boolean(),
  canPay: z.boolean(),
});
export type CashierOrderSummary = z.infer<typeof cashierOrderSummarySchema>;
export const cashierOrdersResponseSchema = z.strictObject({
  orders: z.array(cashierOrderSummarySchema).max(50),
  nextAfterOrderId: idSchema.nullable(),
});
export type CashierOrdersResponse = z.infer<typeof cashierOrdersResponseSchema>;
