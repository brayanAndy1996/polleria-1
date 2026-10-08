import { errorResponseSchema } from '@polleria/shared';
import { hardNavigate } from '../navigation.ts';

export const DEFAULT_API_TIMEOUT_MS = 10000;
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  constructor(status: number, code: string, message: string, details: unknown = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export interface ApiRequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  skipAuthRedirect?: boolean;
  expectedStatus?: number;
}
export function unexpectedResponse(status: number): ApiError {
  return new ApiError(
    status,
    'UNEXPECTED_RESPONSE',
    'Respuesta inesperada del servidor. Intenta nuevamente.',
  );
}
export function createApiClient(
  options: { onUnauthenticated?: () => void; timeoutMs?: number } = {},
) {
  return {
    async request(path: string, requestOptions: ApiRequestOptions = {}): Promise<unknown> {
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, options.timeoutMs ?? DEFAULT_API_TIMEOUT_MS);
      try {
        const response = await fetch(`${window.location.origin}/api${path}`, {
          method: requestOptions.method ?? 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
            ...(requestOptions.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          ...(requestOptions.body === undefined
            ? {}
            : { body: JSON.stringify(requestOptions.body) }),
          signal: controller.signal,
        });
        if (
          response.ok &&
          requestOptions.expectedStatus !== undefined &&
          response.status !== requestOptions.expectedStatus
        ) {
          throw unexpectedResponse(response.status);
        }
        if (response.status === 204) return undefined;
        let body: unknown;
        try {
          body = await response.json();
        } catch (error) {
          if (controller.signal.aborted) throw error;
          throw unexpectedResponse(response.status);
        }
        if (response.ok) return body;
        const parsed = errorResponseSchema.safeParse(body);
        if (!parsed.success) throw unexpectedResponse(response.status);
        const { code, message, details } = parsed.data.error;
        if (
          response.status === 401 &&
          code === 'UNAUTHENTICATED' &&
          !requestOptions.skipAuthRedirect
        )
          options.onUnauthenticated?.();
        throw new ApiError(response.status, code, message, details);
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(
          0,
          'NETWORK_ERROR',
          'Sin conexión con el servidor. Revisa el wifi e intenta de nuevo.',
        );
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
export const apiClient = createApiClient({
  onUnauthenticated: () => {
    if (window.location.pathname !== '/login') hardNavigate('/login');
  },
});
