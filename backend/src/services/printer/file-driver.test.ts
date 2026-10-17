import { mkdir, readFile, readdir, rename as realRename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  JOB_ID,
  buildJob,
  createTempDir,
  removeTempDir,
} from '../../../tests/helpers/printer-files.ts';
import {
  expectPrinterError,
  rejectionOf,
  visibleErrorText,
} from '../../../tests/helpers/printer-fixtures.ts';
import { FILE_DRIVER_RENAME_RETRY_DELAYS_MS, createFilePrinterDriver } from './file-driver.ts';

/** Error de Node simulado con su código (EPERM, ENOSPC, etc.). */
function systemError(code: string): Error {
  return Object.assign(new Error(`${code}: error simulado del sistema`), { code });
}

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

describe('002: driver file (backend/src/services/printer/file-driver.ts)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await createTempDir();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await removeTempDir(dir);
  });

  describe('AC-21: un archivo UTF-8 por trabajo', () => {
    it('AC-21: el driver se llama file, devuelve el comprobante y deja un solo .txt en la carpeta', async () => {
      const driver = createFilePrinterDriver({ dir });

      const receipt = await driver.print(
        buildJob([
          'Hola',
          'Poller\u00EDa \u00D1and\u00FA \u00BFQu\u00E9? \u00A1S\u00ED!',
          '',
          'Fin',
        ]),
      );

      expect(driver.name).toBe('file');
      expect(receipt).toStrictEqual({
        jobId: JOB_ID,
        destination: path.join(dir, `${JOB_ID}.txt`),
      });
      expect(await readdir(dir)).toEqual([`${JOB_ID}.txt`]);
    });

    it('AC-21: los bytes son UTF-8 sin BOM, con LF al final de cada línea y sin CR', async () => {
      const driver = createFilePrinterDriver({ dir });

      const receipt = await driver.print(
        buildJob([
          'Hola',
          'Poller\u00EDa \u00D1and\u00FA \u00BFQu\u00E9? \u00A1S\u00ED!',
          '',
          'Fin',
        ]),
      );

      const expected = Buffer.from(
        'Hola\nPoller\u00EDa \u00D1and\u00FA \u00BFQu\u00E9? \u00A1S\u00ED!\n\nFin\n',
        'utf8',
      );
      const bytes = await readFile(receipt.destination);
      expect(bytes).toEqual(expected);
      expect(bytes.subarray(0, 3)).not.toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
      expect(bytes.includes(0x0d)).toBe(false);
    });

    it('Borde: dos trabajos con el mismo jobId: el segundo reemplaza al primero', async () => {
      const driver = createFilePrinterDriver({ dir });

      await driver.print(buildJob(['primero']));
      await driver.print(buildJob(['segundo']));

      expect(await readdir(dir)).toEqual([`${JOB_ID}.txt`]);
      expect(await readFile(path.join(dir, `${JOB_ID}.txt`), 'utf8')).toBe('segundo\n');
    });
  });

  describe('AC-22: crea la carpeta si no existe', () => {
    it('AC-22: crea las tres carpetas y escribe el archivo', async () => {
      const nested = path.join(dir, 'no', 'existe', 'comandas');
      const driver = createFilePrinterDriver({ dir: nested });

      const receipt = await driver.print(buildJob(['Hola']));

      for (const folder of [path.join(dir, 'no'), path.join(dir, 'no', 'existe'), nested]) {
        expect((await stat(folder)).isDirectory()).toBe(true);
      }
      expect(receipt.destination).toBe(path.join(nested, `${JOB_ID}.txt`));
      expect(await readFile(receipt.destination, 'utf8')).toBe('Hola\n');
    });

    it('AC-22: si la carpeta se borra con el driver en marcha, el siguiente trabajo la vuelve a crear', async () => {
      const nested = path.join(dir, 'no', 'existe', 'comandas');
      const driver = createFilePrinterDriver({ dir: nested });
      const secondJobId = '20261007-153012-124-prueba-a1b2c3d5';

      await driver.print(buildJob(['Primero']));
      await removeTempDir(path.join(dir, 'no'));
      expect(await exists(nested)).toBe(false);

      const receipt = await driver.print({
        jobId: secondJobId,
        label: 'prueba',
        lines: ['Segundo'],
      });

      expect(receipt.destination).toBe(path.join(nested, `${secondJobId}.txt`));
      expect(await readFile(receipt.destination, 'utf8')).toBe('Segundo\n');
    });
  });

  describe('AC-23: trabajos simultáneos', () => {
    it('AC-23: 50 trabajos a la vez dejan 50 archivos .txt, ningún .tmp y el contenido de cada uno', async () => {
      const driver = createFilePrinterDriver({ dir });
      const numbers = Array.from({ length: 50 }, (_, index) => index);
      const jobIdOf = (number: number): string =>
        `20261007-153012-123-prueba-${number.toString(16).padStart(8, '0')}`;

      const receipts = await Promise.all(
        numbers.map((number) =>
          driver.print({
            jobId: jobIdOf(number),
            label: 'prueba',
            lines: [`Trabajo ${String(number)}`],
          }),
        ),
      );

      expect(receipts).toHaveLength(50);
      const files = await readdir(dir);
      expect(files).toHaveLength(50);
      expect(files.every((file) => file.endsWith('.txt'))).toBe(true);
      expect(files.some((file) => file.endsWith('.tmp'))).toBe(false);
      for (const number of numbers) {
        expect(await readFile(path.join(dir, `${jobIdOf(number)}.txt`), 'utf8')).toBe(
          `Trabajo ${String(number)}\n`,
        );
      }
    });
  });

  describe('AC-24: escritura atómica', () => {
    it('AC-24: el rename recibe un .tmp completo en la misma carpeta y un destino que todavía no existe', async () => {
      const calls: { from: string; to: string }[] = [];
      const observations: { content: string; destinationExisted: boolean }[] = [];
      const rename = vi.fn(async (from: string, to: string) => {
        calls.push({ from, to });
        observations.push({
          content: await readFile(from, 'utf8'),
          destinationExisted: await exists(to),
        });
        await realRename(from, to);
      });
      const driver = createFilePrinterDriver({ dir, rename });

      const receipt = await driver.print(buildJob(['Hola', 'Fin']));

      expect(rename).toHaveBeenCalledTimes(1);
      const [call] = calls;
      expect(path.resolve(path.dirname(call?.from ?? ''))).toBe(path.resolve(dir));
      expect(call?.from.endsWith('.tmp')).toBe(true);
      expect(path.resolve(call?.to ?? '')).toBe(path.resolve(receipt.destination));
      expect(observations).toEqual([{ content: 'Hola\nFin\n', destinationExisted: false }]);
      expect(await readFile(receipt.destination, 'utf8')).toBe('Hola\nFin\n');
      expect(await readdir(dir)).toEqual([`${JOB_ID}.txt`]);
    });

    it('AC-24: si el rename falla con ENOSPC, rechaza con PRINTER_OUTPUT_FAILED y no queda ni .txt ni .tmp', async () => {
      const failure = systemError('ENOSPC');
      const driver = createFilePrinterDriver({
        dir,
        rename: () => Promise.reject(failure),
      });

      const error = await rejectionOf(driver.print(buildJob(['Hola'])));

      expectPrinterError(error, 'PRINTER_OUTPUT_FAILED');
      expect(error.cause).toBe(failure);
      expect(await readdir(dir)).toEqual([]);
    });
  });

  describe('AC-25: reintento del renombrado en Windows', () => {
    /** rename falso: falla con `code` las veces indicadas y luego llama al rename real. */
    function flakyRename(code: string, failures: number) {
      const callTimes: number[] = [];
      const rename = vi.fn(async (from: string, to: string) => {
        callTimes.push(performance.now());
        if (callTimes.length <= failures) {
          throw systemError(code);
        }
        await realRename(from, to);
      });
      return { rename, callTimes };
    }

    it('AC-25: las esperas son 20, 40, 80 y 160 ms', () => {
      expect([...FILE_DRIVER_RENAME_RETRY_DELAYS_MS]).toEqual([20, 40, 80, 160]);
    });

    it('AC-25: con EPERM dos veces y luego el rename real, se resuelve con 3 llamadas y el .txt existe', async () => {
      const { rename, callTimes } = flakyRename('EPERM', 2);
      const driver = createFilePrinterDriver({ dir, rename });

      const receipt = await driver.print(buildJob(['Hola']));

      expect(rename).toHaveBeenCalledTimes(3);
      expect(await readFile(receipt.destination, 'utf8')).toBe('Hola\n');
      expect(await readdir(dir)).toEqual([`${JOB_ID}.txt`]);
      // Espera 20 ms y luego 40 ms entre los intentos (con 10 ms de tolerancia).
      expect(callTimes[1]! - callTimes[0]!).toBeGreaterThanOrEqual(10);
      expect(callTimes[2]! - callTimes[1]!).toBeGreaterThanOrEqual(30);
    });

    it('AC-25: con EACCES una vez y luego el rename real, se resuelve con 2 llamadas', async () => {
      const { rename } = flakyRename('EACCES', 1);
      const driver = createFilePrinterDriver({ dir, rename });

      const receipt = await driver.print(buildJob(['Hola']));

      expect(rename).toHaveBeenCalledTimes(2);
      expect(await exists(receipt.destination)).toBe(true);
    });

    it('AC-25: con EBUSY siempre, rechaza en menos de 2 s tras 5 llamadas y no deja .txt ni .tmp', async () => {
      const { rename, callTimes } = flakyRename('EBUSY', Number.POSITIVE_INFINITY);
      const driver = createFilePrinterDriver({ dir, rename });

      const startedAt = performance.now();
      const error = await rejectionOf(driver.print(buildJob(['Hola'])));
      const elapsedMs = performance.now() - startedAt;

      expectPrinterError(error, 'PRINTER_OUTPUT_FAILED');
      expect(rename).toHaveBeenCalledTimes(5);
      expect(elapsedMs).toBeLessThan(2000);
      // Las esperas suman 20 + 40 + 80 + 160 = 300 ms (con tolerancia por el reloj).
      expect(callTimes[4]! - callTimes[0]!).toBeGreaterThanOrEqual(250);
      expect(await readdir(dir)).toEqual([]);
    });

    it('AC-25: con ENOSPC no reintenta: una sola llamada', async () => {
      const { rename } = flakyRename('ENOSPC', Number.POSITIVE_INFINITY);
      const driver = createFilePrinterDriver({ dir, rename });

      const error = await rejectionOf(driver.print(buildJob(['Hola'])));

      expectPrinterError(error, 'PRINTER_OUTPUT_FAILED');
      expect(rename).toHaveBeenCalledTimes(1);
      expect(await readdir(dir)).toEqual([]);
    });
  });

  describe('AC-26: fallas reales del sistema de archivos', () => {
    it('AC-26: si la carpeta configurada es un archivo, rechaza con PRINTER_OUTPUT_FAILED sin filtrar rutas', async () => {
      const filePath = path.join(dir, 'soy-un-archivo');
      await writeFile(filePath, 'contenido original');
      const driver = createFilePrinterDriver({ dir: filePath });

      const error = await rejectionOf(driver.print(buildJob(['Hola'])));

      expectPrinterError(error, 'PRINTER_OUTPUT_FAILED');
      const visible = visibleErrorText(error);
      expect(visible).not.toContain(dir);
      expect(visible).not.toContain(path.basename(dir));
      expect(visible).not.toContain('soy-un-archivo');
      expect(await readFile(filePath, 'utf8')).toBe('contenido original');
      expect(await readdir(dir)).toEqual(['soy-un-archivo']);
    });

    it('AC-26: si el destino .txt es una carpeta, rechaza en menos de 2 s, la deja intacta y no deja .tmp', async () => {
      const blocker = path.join(dir, `${JOB_ID}.txt`);
      await mkdir(blocker);
      const driver = createFilePrinterDriver({ dir });

      const startedAt = performance.now();
      const error = await rejectionOf(driver.print(buildJob(['Hola'])));
      const elapsedMs = performance.now() - startedAt;

      expectPrinterError(error, 'PRINTER_OUTPUT_FAILED');
      expect(elapsedMs).toBeLessThan(2000);
      expect((await stat(blocker)).isDirectory()).toBe(true);
      expect(await readdir(dir)).toEqual([`${JOB_ID}.txt`]);
      expect(visibleErrorText(error)).not.toContain(dir);
    });

    it('Borde: no borra un .tmp que no creó este trabajo', async () => {
      const foreignTemp = path.join(dir, `${JOB_ID}.tmp`);
      await writeFile(foreignTemp, 'de otro trabajo');
      const driver = createFilePrinterDriver({ dir });

      const error = await rejectionOf(driver.print(buildJob(['Hola'])));

      expectPrinterError(error, 'PRINTER_OUTPUT_FAILED');
      expect(await readFile(foreignTemp, 'utf8')).toBe('de otro trabajo');
      expect(await exists(path.join(dir, `${JOB_ID}.txt`))).toBe(false);
    });
  });

  describe('AC-27: nombres peligrosos y carpeta relativa', () => {
    const DANGEROUS_JOB_IDS: readonly string[] = [
      '../20261007-153012-123-prueba-a1b2c3d4',
      '..\\x',
      'a/b',
      'C:\\x',
      '',
      'con',
      '20261007-153012-123-prueba-a1b2c3d4.txt',
      '20261007-153012-123-Prueba-a1b2c3d4',
      '20261007-153012-123-prueba-A1B2C3D4',
      '20261007-153012-123-prueba-a1b2c3d',
      // Cumple el patrón pero mide 62 caracteres.
      `20261007-153012-123-${'a'.repeat(33)}-a1b2c3d4`,
    ];

    it('AC-27: el caso de 62 caracteres cumple el patrón y excede el máximo de 61', () => {
      const jobId = DANGEROUS_JOB_IDS[DANGEROUS_JOB_IDS.length - 1] ?? '';

      expect(jobId).toHaveLength(62);
      expect(jobId).toMatch(/^\d{8}-\d{6}-\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{8}$/);
    });

    it.each(DANGEROUS_JOB_IDS)(
      'AC-27: rechaza el jobId %j con PRINTER_INVALID_DOCUMENT sin tocar el disco',
      async (jobId) => {
        const driver = createFilePrinterDriver({ dir: path.join(dir, 'interna') });

        const error = await rejectionOf(driver.print({ jobId, label: 'prueba', lines: ['Hola'] }));

        expectPrinterError(error, 'PRINTER_INVALID_DOCUMENT');
        // Ni siquiera se creó la carpeta 'interna', y nada se escribió fuera de ella.
        expect(await readdir(dir)).toEqual([]);
      },
    );

    it.each(['tmp/comandas', '', 'comandas', './comandas', '..\\comandas'])(
      'AC-27: createFilePrinterDriver({ dir: %j }) lanza de inmediato porque la ruta no es absoluta',
      (relative) => {
        let thrown: unknown;
        try {
          createFilePrinterDriver({ dir: relative });
        } catch (error) {
          thrown = error;
        }

        expect(thrown).toBeInstanceOf(Error);
        expect((thrown as Error).message).toBe(
          'La carpeta de impresión debe ser una ruta absoluta.',
        );
      },
    );
  });
});
