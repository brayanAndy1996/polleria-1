import { ApiError } from './client.ts';

/**
 * Texto que se muestra al administrador cuando una mutación falla. Con VALIDATION_ERROR
 * se muestra el primer issue (por ejemplo el de PIN débil), igual que pide la spec; con
 * cualquier otro error se muestra su message tal cual viene de la API.
 */
export function apiErrorMessage(error: Error): string {
  if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
    const details: unknown = error.details;
    if (typeof details === 'object' && details !== null && 'issues' in details) {
      const { issues } = details;
      const first: unknown = Array.isArray(issues) ? issues[0] : undefined;
      if (
        typeof first === 'object' &&
        first !== null &&
        'message' in first &&
        typeof first.message === 'string'
      )
        return first.message;
    }
  }
  return error.message;
}
