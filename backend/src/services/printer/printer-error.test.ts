import { describe, expect, it } from 'vitest';
import { AppError } from '../../errors/app-error.ts';
import { PRINTER_ERROR_CODES, PRINTER_ERROR_MESSAGES, PrinterError } from './printer-error.ts';
import type { PrinterErrorCode } from './printer-error.ts';

/** Textos de la tabla de D-002-07, escritos aquí para no depender del código que se prueba. */
const MESSAGES: Record<PrinterErrorCode, string> = {
  PRINTER_INVALID_DOCUMENT: 'El documento a imprimir no es válido.',
  PRINTER_EMPTY_DOCUMENT: 'El documento a imprimir está vacío.',
  PRINTER_OUTPUT_FAILED: 'No se pudo imprimir. Revisa la impresora e intenta de nuevo.',
};

const CODES = Object.keys(MESSAGES) as PrinterErrorCode[];

describe('002: PrinterError (backend/src/services/printer/printer-error.ts)', () => {
  it('AC-20: PRINTER_ERROR_CODES tiene exactamente las tres claves, cada una igual a su valor', () => {
    expect(PRINTER_ERROR_CODES).toStrictEqual({
      PRINTER_INVALID_DOCUMENT: 'PRINTER_INVALID_DOCUMENT',
      PRINTER_EMPTY_DOCUMENT: 'PRINTER_EMPTY_DOCUMENT',
      PRINTER_OUTPUT_FAILED: 'PRINTER_OUTPUT_FAILED',
    });
  });

  it('AC-20: PRINTER_ERROR_MESSAGES trae los mensajes en español de la tabla de D-002-07', () => {
    expect(PRINTER_ERROR_MESSAGES).toStrictEqual(MESSAGES);
  });

  it.each(CODES)(
    'AC-20: new PrinterError(%s) es un Error con name, code y message fijos',
    (code) => {
      const error = new PrinterError(code);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(PrinterError);
      expect(error.name).toBe('PrinterError');
      expect(error.code).toBe(code);
      expect(error.message).toBe(MESSAGES[code]);
    },
  );

  it('AC-20: con { cause } guarda el original en error.cause sin enumerarlo ni serializarlo', () => {
    const cause = new Error('EACCES: permission denied, open C:\\secreto\\comandas\\x.tmp');

    const error = new PrinterError('PRINTER_OUTPUT_FAILED', { cause });

    expect(error.cause).toBe(cause);
    expect(Object.keys(error)).not.toContain('cause');
    expect(JSON.stringify(error)).not.toContain(cause.message);
    expect(JSON.stringify(error)).not.toContain('secreto');
    expect(error.message).toBe(MESSAGES.PRINTER_OUTPUT_FAILED);
  });

  it('AC-20: sin opciones no tiene cause', () => {
    expect(new PrinterError('PRINTER_EMPTY_DOCUMENT').cause).toBeUndefined();
  });

  it('AC-20: no extiende AppError (en esta fase ningún endpoint imprime)', () => {
    expect(new PrinterError('PRINTER_OUTPUT_FAILED')).not.toBeInstanceOf(AppError);
  });
});
