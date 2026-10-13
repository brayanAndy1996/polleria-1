import { mkdir, open, rename as fsRename, unlink } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { JOB_ID_MAX_LENGTH, JOB_ID_PATTERN } from './print-job.ts';
import {
  PRINT_LABEL_MAX_LENGTH,
  PRINT_LABEL_PATTERN,
  PRINTABLE_CHARACTERS,
  PRINTER_LINE_WIDTH,
  PRINTER_MAX_LINES,
} from './print-document.ts';
import type { PrintJob, PrintReceipt, PrinterDriver } from './print-job.ts';
import { PrinterError } from './printer-error.ts';

export interface FilePrinterDriverOptions {
  /** Carpeta de los archivos. Debe ser una ruta absoluta; el driver la crea si no existe. */
  dir: string;
  /** Solo para que las pruebas simulen fallas del renombrado. Por defecto, rename de node:fs/promises. */
  rename?: (from: string, to: string) => Promise<void>;
}

/**
 * Esperas entre los reintentos del renombrado. En Windows el antivirus o el indexador pueden tener
 * abierto el archivo temporal un instante y el renombrado falla con EPERM, EACCES o EBUSY.
 */
export const FILE_DRIVER_RENAME_RETRY_DELAYS_MS = [20, 40, 80, 160] as const;

const RETRYABLE_RENAME_CODES: ReadonlySet<unknown> = new Set(['EPERM', 'EACCES', 'EBUSY']);

function errorCodeOf(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
}

/** Renombra con reintentos solo para los códigos de bloqueo temporal; cualquier otro falla de inmediato. */
async function renameWithRetries(
  rename: (from: string, to: string) => Promise<void>,
  from: string,
  to: string,
): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const waitMs = FILE_DRIVER_RENAME_RETRY_DELAYS_MS[attempt];
      if (waitMs === undefined || !RETRYABLE_RENAME_CODES.has(errorCodeOf(error))) {
        throw error;
      }
      await sleep(waitMs);
    }
  }
}

/** El jobId forma el nombre del archivo: debe cumplir el patrón, así no hay rutas como ../x. */
function assertValidJobId(jobId: unknown): asserts jobId is string {
  if (
    typeof jobId !== 'string' ||
    jobId.length > JOB_ID_MAX_LENGTH ||
    !JOB_ID_PATTERN.test(jobId)
  ) {
    throw new PrinterError('PRINTER_INVALID_DOCUMENT');
  }
}

const PRINTABLE_SET: ReadonlySet<string> = new Set(PRINTABLE_CHARACTERS);

/** El driver también defiende su frontera pública: solo acepta la salida ya canónica. */
export function assertCanonicalJob(job: unknown): asserts job is PrintJob {
  if (typeof job !== 'object' || job === null || !('jobId' in job)) {
    throw new PrinterError('PRINTER_INVALID_DOCUMENT');
  }
  assertValidJobId(job.jobId);
  if (
    !('label' in job) ||
    typeof job.label !== 'string' ||
    job.label.length > PRINT_LABEL_MAX_LENGTH ||
    !PRINT_LABEL_PATTERN.test(job.label) ||
    !('lines' in job) ||
    !Array.isArray(job.lines) ||
    job.lines.length === 0 ||
    job.lines.length > PRINTER_MAX_LINES
  ) {
    throw new PrinterError('PRINTER_INVALID_DOCUMENT');
  }

  let hasContent = false;
  for (const line of job.lines) {
    if (typeof line !== 'string' || line.length > PRINTER_LINE_WIDTH || line.endsWith(' ')) {
      throw new PrinterError('PRINTER_INVALID_DOCUMENT');
    }
    for (const character of line) {
      if (!PRINTABLE_SET.has(character)) {
        throw new PrinterError('PRINTER_INVALID_DOCUMENT');
      }
    }
    hasContent ||= line.length > 0;
  }
  if (!hasContent) {
    throw new PrinterError('PRINTER_INVALID_DOCUMENT');
  }
}

/**
 * Driver file (D-002-08): escribe cada trabajo como un archivo UTF-8 `<jobId>.txt`, con cada línea
 * seguida de LF. Escribe primero `<jobId>.tmp` y lo renombra al final, así el .txt aparece completo
 * o no aparece (RN-002-05). Solo usa módulos nativos de Node; no usa la red.
 */
export function createFilePrinterDriver(options: FilePrinterDriverOptions): PrinterDriver {
  const { dir } = options;
  if (!path.isAbsolute(dir)) {
    throw new Error('La carpeta de impresión debe ser una ruta absoluta.');
  }
  const rename = options.rename ?? fsRename;

  return {
    name: 'file',
    async print(job: PrintJob): Promise<PrintReceipt> {
      // Antes de cualquier I/O, incluso cuando se llama directamente al driver.
      assertCanonicalJob(job);

      const content = job.lines.map((line) => `${line}\n`).join('');
      const tempPath = path.join(dir, `${job.jobId}.tmp`);
      const destination = path.join(dir, `${job.jobId}.txt`);
      let handle: FileHandle | undefined;
      let createdTemp = false;

      try {
        // En cada trabajo, para recuperarse si alguien borra la carpeta con la API en marcha.
        await mkdir(dir, { recursive: true });
        // 'wx' falla si el temporal ya existe: así nunca se pisa ni se borra el de otro trabajo.
        handle = await open(tempPath, 'wx');
        createdTemp = true;
        await handle.writeFile(content, 'utf8');
        // datasync y no sync(): la regla de ESLint del proyecto prohíbe llamar a cualquier .sync().
        await handle.datasync();
        await handle.close();
        handle = undefined;
        await renameWithRetries(rename, tempPath, destination);
      } catch (error) {
        await handle?.close().catch(() => undefined);
        if (createdTemp) {
          await unlink(tempPath).catch(() => undefined);
        }
        // El mensaje de un error de Node trae rutas: solo va en cause, para el log del servidor.
        throw new PrinterError('PRINTER_OUTPUT_FAILED', { cause: error });
      }

      return { jobId: job.jobId, destination };
    },
  };
}
