import {
  kitchenTicketPrintAttentionResponseSchema,
  kitchenTicketPrintsResponseSchema,
  reprintKitchenTicketResponseSchema,
} from '@polleria/shared';
import type {
  KitchenTicketPrintAttentionResponse,
  KitchenTicketPrintsResponse,
  ReprintKitchenTicketResponse,
} from '@polleria/shared';
import { apiClient, parseResponse } from './client.ts';

/** Estado independiente de generación para las comandas de un pedido. */
export async function listOrderTicketPrints(orderId: number): Promise<KitchenTicketPrintsResponse> {
  const { body, status } = await apiClient.requestWithStatus(`/orders/${orderId}/ticket-prints`, {
    expectedStatus: 200,
  });
  return parseResponse(kitchenTicketPrintsResponseSchema, status, body);
}

/** Primera página de comandas que requieren atención (máximo 50). */
export async function listKitchenTicketPrintAttention(
  afterTicketId?: number,
): Promise<KitchenTicketPrintAttentionResponse> {
  const query = afterTicketId === undefined ? '' : `?afterTicketId=${afterTicketId}`;
  const { body, status } = await apiClient.requestWithStatus(
    `/kitchen-ticket-prints/attention${query}`,
    { expectedStatus: 200 },
  );
  return parseResponse(kitchenTicketPrintAttentionResponseSchema, status, body);
}

/** Solicita una copia explícita y devuelve su primer intento en espera. */
export async function reprintKitchenTicket(
  ticketId: number,
  key: string,
  reason: string,
): Promise<ReprintKitchenTicketResponse> {
  const { body, status } = await apiClient.requestWithStatus(
    `/kitchen-ticket-prints/${ticketId}/reprint`,
    {
      method: 'POST',
      body: { reason },
      idempotencyKey: key,
      expectedStatus: 202,
    },
  );
  return parseResponse(reprintKitchenTicketResponseSchema, status, body);
}
