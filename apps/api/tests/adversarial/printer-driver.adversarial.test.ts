/**
 * Ataques al driver file y a la puerta pública del servicio de impresión (adversarial-tester,
 * spec 002).
 *
 * Objetivo: que nada escriba fuera de la carpeta configurada (path traversal), que ningún carácter
 * de control llegue al archivo y que la escritura aguante la concurrencia real. Las pruebas sin
 * hallazgo quedan en verde como protección de regresión.
 *
 * No usan la base de datos. Cada prueba usa su propia carpeta bajo os.tmpdir() (R-002-05).
 */
import { mkdir, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.ts';
import { createPrinterDriver, createPrinterService } from '../../src/services/printer/index.ts';
import type { PrinterDriver } from '../../src/services/printer/index.ts';
import { createFilePrinterDriver } from '../../src/services/printer/file-driver.ts';
import type { PrintJob } from '../../src/services/printer/print-job.ts';
import { JOB_ID, createTempDir, removeTempDir } from '../helpers/printer-files.ts';
import { expectPrinterError, rejectionOf } from '../helpers/printer-fixtures.ts';
import {
  ESCPOS_COMMAND_BYTES,
  EXPECTED_PRINTABLE,
  VALID_DATABASE_URL,
} from './printer-adversarial-helpers.ts';

/** Patrón de jobId de D-002-02, escrito aquí (no se importa del código de producción). */
const SPEC_JOB_ID = /^\d{8}-\d{6}-\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{8}$/;

describe('002 adversarial: driver file y puerta pública', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await createTempDir();
  });

  afterEach(async () => {
    await removeTempDir(dir);
  });

  /** El driver tal como lo entrega la puerta pública a partir de la configuración. */
  function publicDriver(fileDir: string): PrinterDriver {
    return createPrinterDriver(
      loadConfig({ DATABASE_URL: VALID_DATABASE_URL, PRINTER_FILE_DIR: fileDir }).printer,
    );
  }

  // ADV-002-02 (Medio): la puerta pública (index.ts) entrega el driver con createPrinterDriver y su
  // método print acepta cualquier línea. Quien lo llame sin pasar por PrinterService (por error en
  // la Fase 3, por ejemplo al reimprimir) escribe tal cual ESC p (abre el cajón), GS V (corta el
  // papel) y NUL, además de saltos y líneas de más de 48 columnas. El driver valida el jobId
  // "aunque alguien use el driver sin el servicio" (D-002-08), pero no las líneas: RN-002-02 y
  // RN-002-03 dependen solo de la disciplina de quien llama. Con el driver escpos de la Fase 3 sería
  // una inyección de comandos. Se espera que el driver rechace (PRINTER_INVALID_DOCUMENT) o que nunca
  // escriba bytes de comando.
  it('ADV-002-02: el driver de la puerta pública, usado sin el servicio, no escribe comandos ESC/POS', async () => {
    const driver = publicDriver(dir);
    const job: PrintJob = {
      jobId: '20261007-153012-123-comanda-a1b2c3d4',
      label: 'comanda',
      lines: [
        'Mesa 4',
        '  - sin ensalada\u001Bp\u0000\u0019ú',
        '\u001DV\u0000',
        'a\nb',
        'x'.repeat(60),
      ],
    };

    await driver.print(job).then(
      () => undefined,
      () => undefined,
    );

    for (const file of await readdir(dir)) {
      const bytes = await readFile(path.join(dir, file));
      const found = ESCPOS_COMMAND_BYTES.filter((commandByte) => bytes.includes(commandByte));
      expect(
        found.map((commandByte) => `0x${commandByte.toString(16)}`),
        `bytes de comando ESC/POS en ${file}`,
      ).toEqual([]);
      const lines = bytes.toString('utf8').split('\n');
      expect(lines.filter((line) => line.length > 48)).toEqual([]);
    }
  });

  // ADV-002-12 (regresión en verde): jobId con trucos que AC-27 no cubre. Barras con apariencia de
  // separador, dígitos no ASCII, salto o NUL al final, espacio o punto final (Windows los quita),
  // flujos alternos de NTFS (':'), letras cirílicas, nombres reservados de Windows y valores que no
  // son texto aunque su String() cumpla el patrón. Todos se rechazan sin tocar el disco.
  it.each([
    ['salto de línea al final', `${JOB_ID}\n`],
    ['NUL al final', `${JOB_ID}\u0000`],
    ['espacio al final', `${JOB_ID} `],
    ['punto al final', `${JOB_ID}.`],
    ['flujo alterno de NTFS', `${JOB_ID}:flujo`],
    ['flujo $DATA', `${JOB_ID}::$DATA`],
    ['barra de división U+2215', '20261007-153012-123-prueba∕a1b2c3d4'],
    ['barra de ancho completo U+FF0F', '20261007-153012-123-prueba／a1b2c3d4'],
    ['barra invertida U+29F5', '20261007-153012-123-prueba⧵a1b2c3d4'],
    ['dígitos de ancho completo', '２０２６１００７-153012-123-prueba-a1b2c3d4'],
    ['dígitos arábigo-índicos', '٢٠٢٦١٠٠٧-153012-123-prueba-a1b2c3d4'],
    ['a cirílica en la etiqueta', '20261007-153012-123-pruebа-a1b2c3d4'],
    ['traversal después del patrón', `${JOB_ID}/../../x`],
    ['traversal con barra invertida', `..\\..\\${JOB_ID}`],
    ['ruta UNC', `\\\\servidor\\recurso\\${JOB_ID}`],
    ['nombre reservado CON', 'CON'],
    ['nombre reservado NUL', 'NUL'],
    ['nombre reservado COM1', 'COM1'],
    ['nombre reservado LPT1', 'LPT1'],
    ['nombre reservado con extensión', 'aux.txt'],
    ['un arreglo cuyo String() cumple el patrón', [JOB_ID]],
    ['un objeto cuyo toString() cumple el patrón', { toString: () => JOB_ID }],
    ['un número', 20261007],
    ['null', null],
  ])('ADV-002-12: rechaza el jobId con %s sin tocar el disco', async (_name, jobId) => {
    const driver = createFilePrinterDriver({ dir: path.join(dir, 'interna') });
    const job = { jobId, label: 'prueba', lines: ['x'] } as unknown as PrintJob;

    const error = await rejectionOf(driver.print(job));

    expectPrinterError(error, 'PRINTER_INVALID_DOCUMENT');
    expect(await readdir(dir)).toEqual([]);
  });

  // ADV-002-12 (control): etiquetas que se escriben como nombres reservados de Windows sí se
  // imprimen, porque el jobId empieza con 8 dígitos y el archivo nunca se llama CON, NUL, etc.
  it.each(['con', 'nul', 'aux', 'prn', 'com1', 'lpt1'])(
    'ADV-002-12: la etiqueta %s se imprime en un archivo normal dentro de la carpeta',
    async (label) => {
      const service = createPrinterService({ driver: publicDriver(dir) });

      const receipt = await service.print({ label, lines: [`etiqueta ${label}`] });

      expect(path.dirname(receipt.destination)).toBe(dir);
      expect(await readFile(receipt.destination, 'utf8')).toBe(`etiqueta ${label}\n`);
    },
  );

  // ADV-002-13 (regresión en verde): 1000 impresiones simultáneas con el reloj y el aleatorio
  // reales (muchas caen en el mismo milisegundo). Todas se resuelven, los 1000 jobId son distintos,
  // quedan 1000 .txt, ningún .tmp y cada archivo tiene su propio contenido (sin mezclas).
  it('ADV-002-13: 1000 impresiones a la vez dejan 1000 archivos completos, sin colisiones ni .tmp', async () => {
    const service = createPrinterService({ driver: publicDriver(dir) });

    const receipts = await Promise.all(
      Array.from({ length: 1000 }, (_, index) =>
        service.print({ label: 'comanda', lines: [`Pedido ${String(index)}`, 'x'.repeat(60)] }),
      ),
    );

    const jobIds = receipts.map((receipt) => receipt.jobId);
    expect(new Set(jobIds).size).toBe(1000);
    for (const jobId of jobIds) {
      expect(jobId).toMatch(SPEC_JOB_ID);
    }
    const files = await readdir(dir);
    expect(files.filter((file) => file.endsWith('.txt'))).toHaveLength(1000);
    expect(files.filter((file) => !file.endsWith('.txt'))).toEqual([]);
    const contents = await Promise.all(
      receipts.map((receipt) => readFile(receipt.destination, 'utf8')),
    );
    contents.forEach((content, index) => {
      expect(content).toBe(`Pedido ${String(index)}\n${'x'.repeat(48)}\nxxxxxxxxxxxx\n`);
    });
  }, 60_000);

  // ADV-002-17 (regresión en verde): una carpeta de más de 260 caracteres (MAX_PATH de Windows)
  // funciona: el driver la crea y escribe el archivo completo dentro de ella.
  it('ADV-002-17: una carpeta con una ruta de más de 260 caracteres funciona', async () => {
    const longDir = path.join(
      dir,
      ...Array.from({ length: 8 }, (_, index) => `carpeta-${String(index)}-${'x'.repeat(30)}`),
    );
    expect(longDir.length).toBeGreaterThan(300);
    const service = createPrinterService({ driver: publicDriver(longDir) });

    const receipt = await service.print({ label: 'prueba', lines: ['ruta larga'] });

    expect(path.dirname(receipt.destination)).toBe(longDir);
    expect(await readFile(receipt.destination, 'utf8')).toBe('ruta larga\n');
    expect(await readdir(longDir)).toEqual([path.basename(receipt.destination)]);
  });

  // ADV-002-12 (control de traversal por la etiqueta): ninguna etiqueta que el esquema acepte puede
  // formar un nombre fuera de la carpeta. Con etiquetas límite el archivo queda en `dir`.
  it('ADV-002-12: las etiquetas límite que el esquema acepta dejan el archivo dentro de la carpeta', async () => {
    const nested = path.join(dir, 'a', 'b');
    await mkdir(nested, { recursive: true });
    const service = createPrinterService({ driver: publicDriver(nested) });

    for (const label of ['a'.repeat(32), '0', '0-0', 'z-9-z-9']) {
      const receipt = await service.print({ label, lines: ['x'] });
      expect(path.dirname(receipt.destination)).toBe(nested);
    }
    expect(await readdir(dir)).toEqual(['a']);
    expect(await readdir(path.join(dir, 'a'))).toEqual(['b']);
    const printed = await readdir(nested);
    expect(printed).toHaveLength(4);
    for (const file of printed) {
      const content = await readFile(path.join(nested, file), 'utf8');
      expect([...content].every((c) => c === '\n' || EXPECTED_PRINTABLE.has(c))).toBe(true);
    }
  });
});
