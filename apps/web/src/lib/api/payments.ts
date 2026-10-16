import {
  billResponseSchema,
  cashierOrdersResponseSchema,
  createPaymentResponseSchema,
  paymentResponseSchema,
} from '@polleria/shared';
import type {
  Bill,
  CashierOrdersResponse,
  CreatePaymentResponse,
  Payment,
  PaymentRequest,
} from '@polleria/shared';
import { apiClient, parseResponse } from './client.ts';

export async function listCashierOrders(afterOrderId?: number): Promise<CashierOrdersResponse> {
  const query = afterOrderId === undefined ? '' : `?afterOrderId=${afterOrderId}`;
  const { body, status } = await apiClient.requestWithStatus(`/cashier/orders${query}`, {
    expectedStatus: 200,
  });
  return parseResponse(cashierOrdersResponseSchema, status, body);
}

export async function getBill(orderId: number): Promise<Bill> {
  const { body, status } = await apiClient.requestWithStatus(`/orders/${orderId}/bill`, {
    expectedStatus: 200,
  });
  return parseResponse(billResponseSchema, status, body).bill;
}

/** Cada reintento recibe exactamente el cuerpo y la clave del intento original. */
export async function createPayment(
  orderId: number,
  request: PaymentRequest,
  idempotencyKey: string,
): Promise<CreatePaymentResponse> {
  const { body, status } = await apiClient.requestWithStatus(`/orders/${orderId}/payments`, {
    method: 'POST',
    body: request,
    idempotencyKey,
    expectedStatus: 201,
  });
  // Un 201 ilegible conserva su status: la UI debe recuperar el intento, sin darlo por fallido.
  return parseResponse(createPaymentResponseSchema, status, body);
}

export async function getPayment(paymentId: number): Promise<Payment> {
  const { body, status } = await apiClient.requestWithStatus(`/payments/${paymentId}`, {
    expectedStatus: 200,
  });
  return parseResponse(paymentResponseSchema, status, body).payment;
}
