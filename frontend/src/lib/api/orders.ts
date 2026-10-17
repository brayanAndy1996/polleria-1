import { kitchenTicketsResponseSchema, orderSchema } from '@polleria/shared';
import type { KitchenTicket, Order } from '@polleria/shared';
import { apiClient, parseResponse } from './client.ts';

/**
 * Funciones del pedido y las comandas (spec 011, D-011-02): cada respuesta se
 * valida con el esquema de shared y los errores de la API llegan como ApiError
 * con code, message y details, igual que en lib/api/products.ts.
 */

/** GET /api/orders/{orderId}: el detalle del pedido con ítems y total. */
export async function getOrder(orderId: number): Promise<Order> {
  const { body, status } = await apiClient.requestWithStatus(`/orders/${orderId}`);
  return parseResponse(orderSchema, status, body);
}

/** POST /api/orders/{orderId}/move: mueve el pedido a otra mesa. */
export async function moveOrder(orderId: number, tableId: number): Promise<Order> {
  const { body, status } = await apiClient.requestWithStatus(`/orders/${orderId}/move`, {
    method: 'POST',
    body: { tableId },
    expectedStatus: 200,
  });
  return parseResponse(orderSchema, status, body);
}

/** Señal del ciclo del pedido: POST sin cuerpo que exige 200 con Order. */
async function orderSignal(orderId: number, action: string): Promise<Order> {
  const { body, status } = await apiClient.requestWithStatus(`/orders/${orderId}/${action}`, {
    method: 'POST',
    expectedStatus: 200,
  });
  return parseResponse(orderSchema, status, body);
}

/** POST request-bill: el mozo pide la pre-cuenta. */
export async function requestBill(orderId: number): Promise<Order> {
  return orderSignal(orderId, 'request-bill');
}

/** POST ready: cocina terminó el pedido. */
export async function markReady(orderId: number): Promise<Order> {
  return orderSignal(orderId, 'ready');
}

/** POST served: el pedido listo llegó a la mesa. */
export async function markServed(orderId: number): Promise<Order> {
  return orderSignal(orderId, 'served');
}

/** POST cancel con { reason }: anula el pedido completo con motivo. */
export async function cancelOrder(orderId: number, reason: string): Promise<Order> {
  const { body, status } = await apiClient.requestWithStatus(`/orders/${orderId}/cancel`, {
    method: 'POST',
    body: { reason },
    expectedStatus: 200,
  });
  return parseResponse(orderSchema, status, body);
}

/** GET /api/orders/{orderId}/tickets: las comandas impresas en cocina, en orden. */
export async function getOrderTickets(orderId: number): Promise<KitchenTicket[]> {
  const { body, status } = await apiClient.requestWithStatus(`/orders/${orderId}/tickets`);
  return parseResponse(kitchenTicketsResponseSchema, status, body).tickets;
}
