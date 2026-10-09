import {
  comboItemsResponseSchema,
  productPortionsResponseSchema,
  productSchema,
  productsResponseSchema,
} from '@polleria/shared';
import type {
  ComboItem,
  CreateProductRequest,
  Product,
  ProductPortion,
  ReplaceComboItemsRequest,
  ReplaceProductPortionsRequest,
  UpdateProductRequest,
} from '@polleria/shared';
import { apiClient, parseResponse } from './client.ts';

/**
 * Funciones de la carta (spec 008, D-008-11): consumen el contrato 0.7.0 tal cual.
 * Cada respuesta se valida con el esquema de shared — si no cuadra, parseResponse
 * lanza ApiError UNEXPECTED_RESPONSE con el status real— y los errores de la API
 * llegan como ApiError con code, message y details.
 *
 * El cuerpo viaja tal cual llega (las páginas validan antes con los esquemas de
 * shared); por eso los campos de enum aceptan string y no solo el union tipado,
 * igual que los inputs de lib/api/users.ts.
 */
type CreateProductInput = Omit<CreateProductRequest, 'category'> & { category: string };
type UpdateProductInput = Omit<UpdateProductRequest, 'category'> & { category?: string };
type PortionInput = { portion: string; cut: string | null; priceCents: number };
type ReplaceProductPortionsInput = Omit<ReplaceProductPortionsRequest, 'portions'> & {
  portions: PortionInput[];
};
type ComboItemInput = {
  productId: number;
  quantity: number;
  portion: string | null;
  cut: string | null;
};
type ReplaceComboItemsInput = Omit<ReplaceComboItemsRequest, 'items'> & {
  items: ComboItemInput[];
};

/** GET /api/products: la carta completa, activos e inactivos, en el orden de la carta. */
export async function getProducts(): Promise<Product[]> {
  const { body, status } = await apiClient.requestWithStatus('/products');
  return parseResponse(productsResponseSchema, status, body).products;
}

/** POST /api/products: alta de un producto (nace activo); exige 201. */
export async function createProduct(input: CreateProductInput): Promise<Product> {
  const { body, status } = await apiClient.requestWithStatus('/products', {
    method: 'POST',
    body: input,
    expectedStatus: 201,
  });
  return parseResponse(productSchema, status, body);
}

/** PATCH /api/products/{id}: datos del producto y activar/desactivar; exige 200. */
export async function updateProduct(
  productId: number,
  input: UpdateProductInput,
): Promise<Product> {
  const { body, status } = await apiClient.requestWithStatus(`/products/${productId}`, {
    method: 'PATCH',
    body: input,
    expectedStatus: 200,
  });
  return parseResponse(productSchema, status, body);
}

/** GET /api/products/{id}/portions: las presentaciones del pollo cargadas. */
export async function getProductPortions(productId: number): Promise<ProductPortion[]> {
  const { body, status } = await apiClient.requestWithStatus(`/products/${productId}/portions`);
  return parseResponse(productPortionsResponseSchema, status, body).portions;
}

/** PUT /api/products/{id}/portions: reemplaza el conjunto completo de presentaciones. */
export async function replaceProductPortions(
  productId: number,
  input: ReplaceProductPortionsInput,
): Promise<ProductPortion[]> {
  const { body, status } = await apiClient.requestWithStatus(`/products/${productId}/portions`, {
    method: 'PUT',
    body: input,
    expectedStatus: 200,
  });
  return parseResponse(productPortionsResponseSchema, status, body).portions;
}

/** GET /api/products/{id}/items: los componentes del combo con su producto embebido. */
export async function getComboItems(productId: number): Promise<ComboItem[]> {
  const { body, status } = await apiClient.requestWithStatus(`/products/${productId}/items`);
  return parseResponse(comboItemsResponseSchema, status, body).items;
}

/** PUT /api/products/{id}/items: reemplaza el conjunto completo de componentes. */
export async function replaceComboItems(
  productId: number,
  input: ReplaceComboItemsInput,
): Promise<ComboItem[]> {
  const { body, status } = await apiClient.requestWithStatus(`/products/${productId}/items`, {
    method: 'PUT',
    body: input,
    expectedStatus: 200,
  });
  return parseResponse(comboItemsResponseSchema, status, body).items;
}
