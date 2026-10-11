import { orderSchema, tablesResponseSchema } from '@polleria/shared';
import type { Order, Table } from '@polleria/shared';
import { apiClient, parseResponse } from './client.ts';

/**
 * Funciones del salón (spec 011, D-011-02): consumen el contrato tal cual.
 * Cada respuesta se valida con el esquema de shared — si no cuadra, parseResponse
 * lanza ApiError UNEXPECTED_RESPONSE con el status real— y los errores de la API
 * llegan como ApiError con code, message y details.
 */

/** GET /api/tables: todas las mesas, activas e inactivas, con el pedido embebido. */
export async function getTables(): Promise<Table[]> {
  const { body, status } = await apiClient.requestWithStatus('/tables');
  return parseResponse(tablesResponseSchema, status, body).tables;
}

/** POST /api/tables/{tableId}/orders sin cuerpo: abre el pedido de la mesa; exige 201. */
export async function openTableOrder(tableId: number): Promise<Order> {
  const { body, status } = await apiClient.requestWithStatus(`/tables/${tableId}/orders`, {
    method: 'POST',
    expectedStatus: 201,
  });
  return parseResponse(orderSchema, status, body);
}

/**
 * POST /api/tables/{tableId}/join: suma la mesa a la cuenta de `intoTableId`
 * (D-011-05: el mozo elige la mesa origen y el pedido actual es el destino).
 */
export async function joinTable(tableId: number, intoTableId: number): Promise<Order> {
  const { body, status } = await apiClient.requestWithStatus(`/tables/${tableId}/join`, {
    method: 'POST',
    body: { intoTableId },
    expectedStatus: 200,
  });
  return parseResponse(orderSchema, status, body);
}

/** POST /api/tables/{tableId}/leave sin cuerpo: separa la mesa de la cuenta; exige 200. */
export async function leaveTable(tableId: number): Promise<Order> {
  const { body, status } = await apiClient.requestWithStatus(`/tables/${tableId}/leave`, {
    method: 'POST',
    expectedStatus: 200,
  });
  return parseResponse(orderSchema, status, body);
}
