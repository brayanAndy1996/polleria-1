/**
 * Drivers falsos y aserciones de errores para las pruebas del servicio de impresión (spec 002).
 *
 * Las carpetas temporales y los textos esperados están en printer-files.ts. Los mensajes fijos se
 * escriben aquí con los valores de D-002-07, no se importan del código de producción.
 */
import { expect } from 'vitest';
import type {
  PrinterDriver,
  PrintReceipt,
  PrintJob,
} from '../../src/services/printer/print-job.ts';
import { PrinterError } from '../../src/services/printer/printer-error.ts';

export interface FakeDriver {
  driver: PrinterDriver;
  /** Trabajos que recibió el driver, en orden. */
  jobs: PrintJob[];
  /** Comprobantes que devolvió el driver, en orden. */
  receipts: PrintReceipt[];
}

/** Driver falso de la sección 4.4: guarda los trabajos y devuelve { jobId, destination: 'falso' }. */
export function createFakeDriver(): FakeDriver {
  const jobs: PrintJob[] = [];
  const receipts: PrintReceipt[] = [];

  const driver: PrinterDriver = {
    name: 'file',
    print(job) {
      jobs.push(job);
      const receipt: PrintReceipt = { jobId: job.jobId, destination: 'falso' };
      receipts.push(receipt);
      return Promise.resolve(receipt);
    },
  };

  return { driver, jobs, receipts };
}

/** Driver cuyo print hace lo que indique la prueba (rechazar, lanzar, etc.). */
export function createDriverWith(print: PrinterDriver['print']): PrinterDriver {
  return { name: 'file', print };
}

/** Espera una promesa y devuelve lo que la rechazó (falla si se resuelve). */
export async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  let outcome: { rejected: false } | { rejected: true; reason: unknown } = { rejected: false };

  try {
    await promise;
  } catch (reason) {
    outcome = { rejected: true, reason };
  }

  expect(outcome.rejected, 'la promesa debía rechazarse').toBe(true);
  return outcome.rejected ? outcome.reason : undefined;
}

/** Mensajes fijos de D-002-07. */
export const PRINTER_MESSAGES = {
  PRINTER_INVALID_DOCUMENT: 'El documento a imprimir no es válido.',
  PRINTER_EMPTY_DOCUMENT: 'El documento a imprimir está vacío.',
  PRINTER_OUTPUT_FAILED: 'No se pudo imprimir. Revisa la impresora e intenta de nuevo.',
} as const;

/** Comprueba que el error es un PrinterError con ese código y su mensaje fijo. */
export function expectPrinterError(
  error: unknown,
  code: keyof typeof PRINTER_MESSAGES,
): asserts error is PrinterError {
  expect(error).toBeInstanceOf(PrinterError);
  expect((error as PrinterError).code).toBe(code);
  expect((error as PrinterError).message).toBe(PRINTER_MESSAGES[code]);
}

/** Textos por los que podría filtrarse un detalle del sistema: message, String() y JSON. */
export function visibleErrorText(error: unknown): string {
  return [
    error instanceof Error ? error.message : '',
    String(error),
    JSON.stringify(error) as string | undefined,
  ].join('\n');
}
