import { menuResponseSchema } from '@polleria/shared';
import type { MenuProduct } from '@polleria/shared';
import { apiClient, parseResponse } from './client.ts';

/**
 * GET /api/menu (D-011-02): la carta para armar pedidos — el producto con sus
 * presentaciones (pollos) y sus componentes (combos) ya resueltos por la API.
 * La respuesta se valida con menuResponseSchema: si no cuadra, parseResponse
 * lanza ApiError UNEXPECTED_RESPONSE con el status real.
 */
export async function getMenu(): Promise<MenuProduct[]> {
  const { body, status } = await apiClient.requestWithStatus('/menu');
  return parseResponse(menuResponseSchema, status, body).products;
}
