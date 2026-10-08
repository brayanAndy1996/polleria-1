import { adminUserSchema, usersResponseSchema } from '@polleria/shared';
import type { AdminUser, CreateUserRequest, UpdateUserRequest } from '@polleria/shared';
import type { z } from 'zod';
import { apiClient, unexpectedResponse } from './client.ts';

// El cuerpo viaja tal cual llega (la página valida antes con los esquemas de shared);
// por eso `roles` acepta string[] y no solo UserRole[].
type CreateUserInput = Omit<CreateUserRequest, 'roles'> & { roles: string[] };
type UpdateUserInput = Omit<UpdateUserRequest, 'roles'> & { roles?: string[] };

function parseResponse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw unexpectedResponse(200);
  return result.data;
}
export async function getUsers(): Promise<AdminUser[]> {
  return parseResponse(usersResponseSchema, await apiClient.request('/users')).users;
}
export async function createUser(input: CreateUserInput): Promise<AdminUser> {
  return parseResponse(
    adminUserSchema,
    await apiClient.request('/users', { method: 'POST', body: input, expectedStatus: 201 }),
  );
}
export async function updateUser(userId: number, input: UpdateUserInput): Promise<AdminUser> {
  return parseResponse(
    adminUserSchema,
    await apiClient.request(`/users/${userId}`, {
      method: 'PATCH',
      body: input,
      expectedStatus: 200,
    }),
  );
}
export async function resetUserPin(userId: number, pin: string): Promise<void> {
  await apiClient.request(`/users/${userId}/pin`, {
    method: 'POST',
    body: { pin },
    expectedStatus: 204,
  });
}
