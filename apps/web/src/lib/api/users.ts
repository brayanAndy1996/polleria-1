import { adminUserSchema, usersResponseSchema } from '@polleria/shared';
import type { AdminUser, CreateUserRequest, UpdateUserRequest } from '@polleria/shared';
import type { z } from 'zod';
import { apiClient, unexpectedResponse } from './client.ts';

// El cuerpo viaja tal cual llega (la página valida antes con los esquemas de shared);
// por eso `roles` acepta string[] y no solo UserRole[].
type CreateUserInput = Omit<CreateUserRequest, 'roles'> & { roles: string[] };
type UpdateUserInput = Omit<UpdateUserRequest, 'roles'> & { roles?: string[] };

// El status real de la respuesta viaja al ApiError: un esquema que no cuadra en
// un 201 se reporta como 201, no como un 200 ficticio (ADV-004-33).
function parseResponse<T>(schema: z.ZodType<T>, status: number, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw unexpectedResponse(status);
  return result.data;
}
export async function getUsers(): Promise<AdminUser[]> {
  const { body, status } = await apiClient.requestWithStatus('/users');
  return parseResponse(usersResponseSchema, status, body).users;
}
export async function createUser(input: CreateUserInput): Promise<AdminUser> {
  const { body, status } = await apiClient.requestWithStatus('/users', {
    method: 'POST',
    body: input,
    expectedStatus: 201,
  });
  return parseResponse(adminUserSchema, status, body);
}
export async function updateUser(userId: number, input: UpdateUserInput): Promise<AdminUser> {
  const { body, status } = await apiClient.requestWithStatus(`/users/${userId}`, {
    method: 'PATCH',
    body: input,
    expectedStatus: 200,
  });
  return parseResponse(adminUserSchema, status, body);
}
export async function resetUserPin(userId: number, pin: string): Promise<void> {
  await apiClient.request(`/users/${userId}/pin`, {
    method: 'POST',
    body: { pin },
    expectedStatus: 204,
  });
}
