import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTempDir, removeTempDir } from '../../../tests/helpers/printer-files.ts';
import { loadConfig } from '../../config/env.ts';
import * as printerModule from './index.ts';
import { createPrinterDriver, createPrinterService } from './index.ts';

const DEV_URL = 'postgres://polleria:clave@localhost:5432/polleria_dev';

describe('002: createPrinterDriver y la puerta pública (backend/src/services/printer/index.ts)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await createTempDir();
  });

  afterEach(async () => {
    await removeTempDir(dir);
  });

  it('AC-28: createPrinterDriver con la configuración devuelve el driver file', () => {
    const { printer } = loadConfig({ DATABASE_URL: DEV_URL, PRINTER_FILE_DIR: dir });

    const driver = createPrinterDriver(printer);

    expect(driver.name).toBe('file');
  });

  it('AC-28: el servicio imprime en la carpeta configurada un solo .txt con las líneas normalizadas', async () => {
    const { printer } = loadConfig({ DATABASE_URL: DEV_URL, PRINTER_FILE_DIR: dir });
    const service = createPrinterService({ driver: createPrinterDriver(printer) });

    const receipt = await service.print({ label: 'prueba', lines: ['Hola', 'x'.repeat(50)] });

    expect(path.dirname(path.resolve(receipt.destination))).toBe(path.resolve(dir));
    const files = await readdir(dir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/\.txt$/);
    expect(await readFile(receipt.destination, 'utf8')).toBe('Hola\n' + 'x'.repeat(48) + '\nxx\n');
  });

  it('R-002-03: la puerta pública exporta lo que la spec lista y no exporta createFilePrinterDriver', () => {
    const exported = Object.keys(printerModule);

    expect(exported).toEqual(
      expect.arrayContaining([
        'createPrinterService',
        'createPrinterDriver',
        'buildTestPage',
        'TEST_PAGE_LABEL',
        'PrinterError',
        'PRINTER_ERROR_CODES',
        'PRINTER_LINE_WIDTH',
      ]),
    );
    expect(exported).not.toContain('createFilePrinterDriver');
    expect(printerModule.PRINTER_LINE_WIDTH).toBe(48);
    expect(printerModule.TEST_PAGE_LABEL).toBe('prueba');
  });
});
