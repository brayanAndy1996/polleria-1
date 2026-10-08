import { loginUsersResponseSchema, sessionResponseSchema } from '@polleria/shared';
import type { LoginRequest, LoginUser, SessionResponse } from '@polleria/shared';
import type { z } from 'zod';
import { apiClient, unexpectedResponse } from './client.ts';

function parseResponse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw unexpectedResponse(200);
  return result.data;
}
export async function getLoginUsers(): Promise<LoginUser[]> {
  return parseResponse(loginUsersResponseSchema, await apiClient.request('/auth/users')).users;
}
export async function getSession(
  options: { skipAuthRedirect?: boolean } = {},
): Promise<SessionResponse> {
  return parseResponse(sessionResponseSchema, await apiClient.request('/auth/me', options));
}
export async function login(input: LoginRequest): Promise<SessionResponse> {
  return parseResponse(
    sessionResponseSchema,
    await apiClient.request('/auth/login', { method: 'POST', body: input }),
  );
}
export async function logout(): Promise<void> {
  await apiClient.request('/auth/logout', {
    method: 'POST',
    expectedStatus: 204,
    skipAuthRedirect: true,
  });
}
