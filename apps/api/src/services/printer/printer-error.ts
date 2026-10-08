/** Códigos de error de impresión (D-002-07). En inglés y en MAYÚSCULAS, como el resto de la API. */
export const PRINTER_ERROR_CODES = {
  PRINTER_INVALID_DOCUMENT: 'PRINTER_INVALID_DOCUMENT',
  PRINTER_EMPTY_DOCUMENT: 'PRINTER_EMPTY_DOCUMENT',
  PRINTER_OUTPUT_FAILED: 'PRINTER_OUTPUT_FAILED',
} as const;

export type PrinterErrorCode = keyof typeof PRINTER_ERROR_CODES;

/**
 * Mensajes fijos por código, en español. Nunca incluyen rutas, valores recibidos ni detalles del
 * sistema (RN-002-04): el detalle técnico va solo en `cause`, para el log del servidor.
 */
export const PRINTER_ERROR_MESSAGES: Readonly<Record<PrinterErrorCode, string>> = {
  PRINTER_INVALID_DOCUMENT: 'El documento a imprimir no es válido.',
  PRINTER_EMPTY_DOCUMENT: 'El documento a imprimir está vacío.',
  PRINTER_OUTPUT_FAILED: 'No se pudo imprimir. Revisa la impresora e intenta de nuevo.',
};

/**
 * Error de impresión. No extiende AppError: en esta fase ningún endpoint imprime. `cause` (el error
 * original, si existe) no es enumerable, así que no sale en JSON.stringify ni en Object.keys.
 */
export class PrinterError extends Error {
  readonly code: PrinterErrorCode;

  constructor(code: PrinterErrorCode, options?: { cause?: unknown }) {
    super(PRINTER_ERROR_MESSAGES[code], options);
    this.name = 'PrinterError';
    this.code = code;
  }
}
