import { orderResponseSchema, sendOrderItemsResponseSchema } from '@polleria/shared';
import type { OrderResponse, SendOrderItemsResponse } from '@polleria/shared';
import { apiClient, parseResponse } from './client.ts';

/**
 * Envío de ítems y ciclo de anulación (spec 011, D-011-02): los cuatro POST llevan
 * la cabecera Idempotency-Key exacta (regla de dominio 5) — cada intento de envío
 * o de decisión de anulación genera su clave y su reintento la reusa. El cuerpo
 * viaja tal cual llega (las páginas validan antes con los esquemas de shared).
 */

/** POST /api/orders/{orderId}/items + Idempotency-Key: la tanda a cocina; exige 201. */
export async function sendOrderItems(
  orderId: number,
  idempotencyKey: string,
  body: unknown,
): Promise<SendOrderItemsResponse> {
  const { body: responseBody, status } = await apiClient.requestWithStatus(
    `/orders/${orderId}/items`,
    {
      method: 'POST',
      body,
      expectedStatus: 201,
      idempotencyKey,
    },
  );
  return parseResponse(sendOrderItemsResponseSchema, status, responseBody);
}

/** POST request-void { reason } + clave: el mozo pide anular el ítem; exige 200 { order }. */
export async function requestVoidItem(
  orderId: number,
  itemId: number,
  idempotencyKey: string,
  reason: string,
): Promise<OrderResponse> {
  const { body, status } = await apiClient.requestWithStatus(
    `/orders/${orderId}/items/${itemId}/request-void`,
    {
      method: 'POST',
      body: { reason },
      expectedStatus: 200,
      idempotencyKey,
    },
  );
  return parseResponse(orderResponseSchema, status, body);
}

/** POST void { reason } + clave: el admin anula (directo o aprobando); 200 { order, ticket }. */
export async function voidOrderItem(
  orderId: number,
  itemId: number,
  idempotencyKey: string,
  reason: string,
): Promise<SendOrderItemsResponse> {
  const { body, status } = await apiClient.requestWithStatus(
    `/orders/${orderId}/items/${itemId}/void`,
    {
      method: 'POST',
      body: { reason },
      expectedStatus: 200,
      idempotencyKey,
    },
  );
  return parseResponse(sendOrderItemsResponseSchema, status, body);
}

/** POST reject-void SIN cuerpo + clave: el admin rechaza la solicitud; 200 { order }. */
export async function rejectVoidItem(
  orderId: number,
  itemId: number,
  idempotencyKey: string,
): Promise<OrderResponse> {
  const { body, status } = await apiClient.requestWithStatus(
    `/orders/${orderId}/items/${itemId}/reject-void`,
    {
      method: 'POST',
      expectedStatus: 200,
      idempotencyKey,
    },
  );
  return parseResponse(orderResponseSchema, status, body);
}
