export interface AppErrorOptions {
  /** Código estable en inglés, MAYÚSCULAS_CON_GUION_BAJO (por ejemplo INSUFFICIENT_STOCK). */
  code: string;
  /** Mensaje en español de Perú, listo para mostrarse al usuario. */
  message: string;
  httpStatus: number;
  details?: Record<string, unknown>;
}

/** Error esperado de la API. El errorHandler lo convierte en { error: { code, message, details } }. */
export class AppError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly details: Record<string, unknown> | null;

  constructor({ code, message, httpStatus, details }: AppErrorOptions) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details ?? null;
  }
}
