import { randomBytes } from 'node:crypto';
import { toLimaDateTimeParts } from '@polleria/shared';
import {
  PRINTER_MAX_LINES,
  normalizeDocumentLines,
  printDocumentSchema,
} from './print-document.ts';
import type { PrintDocument } from './print-document.ts';
import type { PrinterDriver, PrintJob, PrintReceipt } from './print-job.ts';
import { PrinterError } from './printer-error.ts';

export interface PrinterService {
  print(document: PrintDocument): Promise<PrintReceipt>;
}

export interface PrinterServiceDeps {
  driver: PrinterDriver;
  /** Reloj. Por defecto, la hora actual. Se inyecta en las pruebas. */
  now?: () => Date;
  /** 8 caracteres hexadecimales en minúscula. Por defecto, 4 bytes de node:crypto. */
  randomId?: () => string;
}

function defaultRandomId(): string {
  return randomBytes(4).toString('hex');
}

/** AAAAMMDD-HHmmss-SSS-<label>-<8 hex>, con la hora de Lima (regla 8). */
function buildJobId(label: string, date: Date, randomId: string): string {
  const time = toLimaDateTimeParts(date);
  return (
    `${time.year}${time.month}${time.day}-${time.hour}${time.minute}${time.second}` +
    `-${time.millisecond}-${label}-${randomId}`
  );
}

/** Valida el documento. Cualquier excepción al validar (por ejemplo, un getter que falla) es inválido. */
function parseDocument(document: unknown): { label: string; lines: string[] } {
  let result: ReturnType<typeof printDocumentSchema.safeParse>;
  try {
    result = printDocumentSchema.safeParse(document);
  } catch (error) {
    throw new PrinterError('PRINTER_INVALID_DOCUMENT', { cause: error });
  }

  if (!result.success) {
    throw new PrinterError('PRINTER_INVALID_DOCUMENT', { cause: result.error });
  }
  return result.data;
}

/** Entrega el trabajo al driver. Un PrinterError pasa igual; cualquier otra falla es PRINTER_OUTPUT_FAILED. */
async function deliver(driver: PrinterDriver, job: PrintJob): Promise<PrintReceipt> {
  try {
    return await driver.print(job);
  } catch (error) {
    throw error instanceof PrinterError
      ? error
      : new PrinterError('PRINTER_OUTPUT_FAILED', { cause: error });
  }
}

/**
 * Único camino de impresión (regla de dominio 7): valida el documento, lo normaliza, le asigna un
 * jobId y lo entrega al driver. No escribe en el log: quien llama decide qué registrar.
 */
export function createPrinterService(deps: PrinterServiceDeps): PrinterService {
  const { driver } = deps;
  const now = deps.now ?? (() => new Date());
  const randomId = deps.randomId ?? defaultRandomId;

  return {
    // async: print nunca lanza de forma síncrona, siempre devuelve una promesa.
    async print(document) {
      const { label, lines: inputLines } = parseDocument(document);

      const lines = normalizeDocumentLines(inputLines);
      if (lines.length > PRINTER_MAX_LINES) {
        throw new PrinterError('PRINTER_INVALID_DOCUMENT');
      }
      if (lines.every((line) => line === '')) {
        throw new PrinterError('PRINTER_EMPTY_DOCUMENT');
      }

      const jobId = buildJobId(label, now(), randomId());
      return deliver(driver, { jobId, label, lines });
    },
  };
}
