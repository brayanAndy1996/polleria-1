import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import path from 'node:path';
import { assertCanonicalJob } from './file-driver.ts';
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
  prepare(document: PrintDocument, date?: Date): PrintJob;
  printPrepared(job: PrintJob): Promise<PrintReceipt>;
  inspectPrepared(job: PrintJob): Promise<'exact' | 'missing' | 'uncertain'>;
  getOutputDirectoryHash(): string;
}

export interface PrinterServiceDeps {
  driver: PrinterDriver;
  /** Reloj. Por defecto, la hora actual. Se inyecta en las pruebas. */
  now?: () => Date;
  /** 8 caracteres hexadecimales en minúscula. Por defecto, 4 bytes de node:crypto. */
  randomId?: () => string;
  fileDir?: string;
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
  const directory = deps.fileDir === undefined ? undefined : path.resolve(deps.fileDir);
  function prepare(document: PrintDocument, date = now()): PrintJob {
    const { label, lines: inputLines } = parseDocument(document);
    const lines = normalizeDocumentLines(inputLines);
    if (lines.length > PRINTER_MAX_LINES) throw new PrinterError('PRINTER_INVALID_DOCUMENT');
    if (lines.every((line) => line === '')) throw new PrinterError('PRINTER_EMPTY_DOCUMENT');
    const job = { jobId: buildJobId(label, date, randomId()), label, lines };
    assertCanonicalJob(job);
    return job;
  }

  return {
    // async: print nunca lanza de forma síncrona, siempre devuelve una promesa.
    async print(document) {
      return deliver(driver, prepare(document));
    },
    prepare,
    async printPrepared(job) {
      assertCanonicalJob(job);
      return deliver(driver, job);
    },
    getOutputDirectoryHash() {
      if (directory === undefined) throw new PrinterError('PRINTER_OUTPUT_FAILED');
      return createHash('sha256').update(directory).digest('hex');
    },
    async inspectPrepared(job) {
      assertCanonicalJob(job);
      if (directory === undefined) return 'uncertain';
      let handle;
      try {
        const directoryStat = await lstat(directory);
        if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) return 'uncertain';
        const filename = path.join(directory, `${job.jobId}.txt`);
        const stat = await lstat(filename);
        if (!stat.isFile() || stat.isSymbolicLink()) return 'uncertain';
        const expected = Buffer.from(job.lines.join('\n') + '\n', 'utf8');
        handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
        const openedStat = await handle.stat();
        if (!openedStat.isFile() || openedStat.size !== expected.length) return 'uncertain';
        const bytes = Buffer.alloc(expected.length + 1);
        const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
        return bytesRead === expected.length && bytes.subarray(0, bytesRead).equals(expected)
          ? 'exact'
          : 'uncertain';
      } catch (error) {
        return typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'ENOENT'
          ? 'missing'
          : 'uncertain';
      } finally {
        await handle?.close().catch(() => undefined);
      }
    },
  };
}
