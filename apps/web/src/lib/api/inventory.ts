import {
  inventoryMovementsResponseSchema,
  inventoryMutationResponseSchema,
  inventorySnapshotSchema,
} from '@polleria/shared';
import type {
  InventoryAdjustmentRequest,
  InventoryBatchRequest,
  InventoryControlRequest,
  InventoryMovementsResponse,
  InventoryMutationResponse,
  InventoryReceiptRequest,
  InventorySnapshot,
} from '@polleria/shared';
import { apiClient, parseResponse } from './client.ts';

export async function getInventory(): Promise<InventorySnapshot> {
  const { body, status } = await apiClient.requestWithStatus('/inventory', { expectedStatus: 200 });
  return parseResponse(inventorySnapshotSchema, status, body);
}

export async function getInventoryAvailability(): Promise<InventorySnapshot> {
  const { body, status } = await apiClient.requestWithStatus('/inventory/availability', {
    expectedStatus: 200,
  });
  return parseResponse(inventorySnapshotSchema, status, body);
}

export async function listInventoryMovements(afterId?: number): Promise<InventoryMovementsResponse> {
  const query = afterId === undefined ? '' : `?afterId=${afterId}`;
  const { body, status } = await apiClient.requestWithStatus(`/inventory/movements${query}`, {
    expectedStatus: 200,
  });
  return parseResponse(inventoryMovementsResponseSchema, status, body);
}

export async function setChickenControl(
  body: InventoryControlRequest,
  key: string,
): Promise<InventoryMutationResponse> {
  const { body: response, status } = await apiClient.requestWithStatus(
    '/inventory/chicken/control',
    { method: 'PUT', body, idempotencyKey: key, expectedStatus: 200 },
  );
  return parseResponse(inventoryMutationResponseSchema, status, response);
}

export async function setDrinkControl(
  productId: number,
  body: InventoryControlRequest,
  key: string,
): Promise<InventoryMutationResponse> {
  const { body: response, status } = await apiClient.requestWithStatus(
    `/inventory/drinks/${productId}/control`,
    { method: 'PUT', body, idempotencyKey: key, expectedStatus: 200 },
  );
  return parseResponse(inventoryMutationResponseSchema, status, response);
}

export async function addChickenBatch(
  body: InventoryBatchRequest,
  key: string,
): Promise<InventoryMutationResponse> {
  const { body: response, status } = await apiClient.requestWithStatus(
    '/inventory/chicken/batches',
    { method: 'POST', body, idempotencyKey: key, expectedStatus: 201 },
  );
  return parseResponse(inventoryMutationResponseSchema, status, response);
}

export async function addDrinkReceipt(
  productId: number,
  body: InventoryReceiptRequest,
  key: string,
): Promise<InventoryMutationResponse> {
  const { body: response, status } = await apiClient.requestWithStatus(
    `/inventory/drinks/${productId}/receipts`,
    { method: 'POST', body, idempotencyKey: key, expectedStatus: 201 },
  );
  return parseResponse(inventoryMutationResponseSchema, status, response);
}

export async function adjustInventory(
  body: InventoryAdjustmentRequest,
  key: string,
): Promise<InventoryMutationResponse> {
  const { body: response, status } = await apiClient.requestWithStatus('/inventory/adjustments', {
    method: 'POST',
    body,
    idempotencyKey: key,
    expectedStatus: 201,
  });
  return parseResponse(inventoryMutationResponseSchema, status, response);
}
