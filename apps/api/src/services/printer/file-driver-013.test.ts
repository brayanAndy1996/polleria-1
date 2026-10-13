import * as fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../config/env.ts';
import { createPrinterDriver } from './create-printer-driver.ts';
import { createFilePrinterDriver } from './file-driver.ts';
import type { PrintJob, PrinterDriver } from './print-job.ts';
import { PrinterError } from './printer-error.ts';
import { JOB_ID, createTempDir, removeTempDir } from '../../../tests/helpers/printer-files.ts';

// Espías call-through: el filesystem sigue siendo real; permiten demostrar que
// rechazar un documento no hizo I/O, incluso si luego se limpiara el archivo.
vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>();
  return { ...original, mkdir: vi.fn(original.mkdir), open: vi.fn(original.open) };
});

const INVALID_JOBS: readonly [string, Partial<PrintJob> | Record<string, unknown>][] = [
  ['ESC', { lines: ['Mesa 3\u001bp'] }],
  ['GS', { lines: ['Pollo\u001dV'] }],
  ['NUL', { lines: ['Pollo\u0000'] }],
  ['tabulación', { lines: ['\tPollo'] }],
  ['DEL', { lines: ['Pollo\u007f'] }],
  ['LF embebido', { lines: ['Mesa 3\nPollo'] }],
  ['CR embebido', { lines: ['Mesa 3\rPollo'] }],
  ['separador Unicode', { lines: ['Mesa 3\u2028Pollo'] }],
  ['emoji', { lines: ['Pollo \u{1f357}'] }],
  ['tilde sin componer', { lines: ['cafe\u0301'] }],
  ['formato invisible', { lines: ['Po\u200bllo'] }],
  ['espacio final', { lines: ['Pollo '] }],
  ['49 columnas', { lines: ['x'.repeat(49)] }],
  ['501 líneas', { lines: Array.from({ length: 501 }, () => 'x') }],
  ['lista vacía', { lines: [] }],
  ['sin contenido', { lines: ['', ''] }],
  ['etiqueta vacía', { label: '' }],
  ['etiqueta con mayúsculas', { label: 'Prueba' }],
  ['etiqueta de 33 caracteres', { label: 'a'.repeat(33) }],
  ['etiqueta con ruta', { label: '../prueba' }],
  ['jobId con ruta', { jobId: `../${JOB_ID}` }],
  ['jobId de 62 caracteres', { jobId: `20261007-153012-123-${'a'.repeat(33)}-a1b2c3d4` }],
  ['línea que no es string', { lines: [123] }],
  ['lista que no es array', { lines: 'Pollo' }],
];

describe('013: driver file defensivo', () => {
  let root: string;
  beforeEach(async () => {
    root = await createTempDir();
    vi.clearAllMocks();
  });
  afterEach(async () => {
    await removeTempDir(root);
  });

  for (const route of ['directo', 'fábrica'] as const) {
    function driver(dir: string): PrinterDriver {
      return route === 'directo'
        ? createFilePrinterDriver({ dir })
        : createPrinterDriver(
            loadConfig({
              DATABASE_URL: 'postgres://polleria:prueba@localhost:5432/polleria_test',
              PRINTER_DRIVER: 'file',
              PRINTER_FILE_DIR: dir,
            }).printer,
          );
    }

    it.each(INVALID_JOBS)(
      `AC-01: ${route} rechaza %s antes de mkdir/open y no deja archivos`,
      async (_name, invalid) => {
        const outputDir = path.join(root, 'salida');
        const job = { jobId: JOB_ID, label: 'prueba', lines: ['Hola'], ...invalid };
        let failure: unknown;
        try {
          await driver(outputDir).print(job);
        } catch (error) {
          failure = error;
        }

        // Comprobar primero I/O evita que el rojo oculte una escritura peligrosa.
        expect(fs.mkdir).not.toHaveBeenCalled();
        expect(fs.open).not.toHaveBeenCalled();
        expect(await fs.readdir(root)).toEqual([]);
        expect(failure).toBeInstanceOf(PrinterError);
        expect(failure).toMatchObject({ code: 'PRINTER_INVALID_DOCUMENT' });
      },
    );

    it(`AC-01: ${route} conserva exactamente UTF-8, sangría, líneas vacías y LF en un trabajo canónico de 500 líneas`, async () => {
      const outputDir = path.join(root, 'salida');
      const lines = [
        '  - sin ensalada',
        'Tildes: áéíóúüñ ÁÉÍÓÚÜÑ ¿¡ °ºª',
        '',
        'x'.repeat(48),
        ...Array.from({ length: 496 }, () => 'Pollo'),
      ];
      const receipt = await driver(outputDir).print({ jobId: JOB_ID, label: 'prueba', lines });

      expect(receipt).toEqual({
        jobId: JOB_ID,
        destination: path.join(outputDir, `${JOB_ID}.txt`),
      });
      expect(await fs.readdir(outputDir)).toEqual([`${JOB_ID}.txt`]);
      expect(await fs.readFile(receipt.destination)).toEqual(
        Buffer.from(lines.join('\n') + '\n', 'utf8'),
      );
    });
  }
});
