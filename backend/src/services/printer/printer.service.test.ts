import { describe, expect, it } from 'vitest';
import {
  createDriverWith,
  createFakeDriver,
  expectPrinterError,
  rejectionOf,
  visibleErrorText,
} from '../../../tests/helpers/printer-fixtures.ts';
import { generateNoisyLine, mulberry32 } from '../../../tests/helpers/seeded-random.ts';
import type { PrintDocument } from './print-document.ts';
import { JOB_ID_MAX_LENGTH, JOB_ID_PATTERN } from './print-job.ts';
import type { PrinterDriver } from './print-job.ts';
import { PrinterError } from './printer-error.ts';
import { createPrinterService } from './printer.service.ts';

const FIXED_NOW = new Date('2026-10-07T20:30:12.123Z');

/** Servicio con reloj y aleatorio fijos (AC-14). */
function createFixedService(driver: PrinterDriver, now = FIXED_NOW) {
  return createPrinterService({ driver, now: () => now, randomId: () => 'a1b2c3d4' });
}

/** Llama a print y comprueba que no lanza de forma síncrona y que devuelve una promesa. */
function startPrint(
  service: { print: (document: PrintDocument) => Promise<unknown> },
  document: unknown,
): Promise<unknown> {
  let started: Promise<unknown>;

  try {
    started = service.print(document as PrintDocument);
  } catch (error) {
    throw new Error(
      `print lanzó de forma síncrona en vez de devolver una promesa: ${String(error)}`,
      { cause: error },
    );
  }

  expect(started).toBeInstanceOf(Promise);
  return started;
}

function xLines(count: number, text = 'x'): string[] {
  return Array.from({ length: count }, () => text);
}

describe('002: PrinterService (backend/src/services/printer/printer.service.ts)', () => {
  describe('AC-14: el servicio entrega al driver un trabajo normalizado', () => {
    it('AC-14: el driver recibe una sola vez el trabajo con jobId de Lima y líneas normalizadas', async () => {
      const fake = createFakeDriver();
      const service = createFixedService(fake.driver);

      const receipt = await service.print({
        label: 'prueba',
        lines: ['Hola', 'x'.repeat(50), 'pollo \u{1F357}'],
      });

      expect(fake.jobs).toStrictEqual([
        {
          jobId: '20261007-153012-123-prueba-a1b2c3d4',
          label: 'prueba',
          lines: ['Hola', 'x'.repeat(48), 'xx', 'pollo ?'],
        },
      ]);
      expect(receipt).toBe(fake.receipts[0]);
    });

    it.each([
      ['2026-10-08T04:59:59.999Z', '20261007-235959-999-prueba-a1b2c3d4'],
      ['2026-10-08T05:00:00.000Z', '20261008-000000-000-prueba-a1b2c3d4'],
    ])('AC-14: con now en %s el jobId usa la hora de Lima (%s)', async (utc, expectedJobId) => {
      const fake = createFakeDriver();
      const service = createFixedService(fake.driver, new Date(utc));

      await service.print({ label: 'prueba', lines: ['Hola'] });

      expect(fake.jobs.map((job) => job.jobId)).toEqual([expectedJobId]);
    });

    it('AC-14: el jobId cumple JOB_ID_PATTERN y JOB_ID_MAX_LENGTH es 61', async () => {
      const fake = createFakeDriver();

      await createFixedService(fake.driver).print({ label: 'prueba', lines: ['Hola'] });

      expect(JOB_ID_MAX_LENGTH).toBe(61);
      expect(fake.jobs[0]?.jobId).toMatch(JOB_ID_PATTERN);
    });

    it('AC-14: JOB_ID_PATTERN acepta el formato de la spec y rechaza variantes', () => {
      expect('20261007-153012-123-prueba-a1b2c3d4').toMatch(JOB_ID_PATTERN);
      expect('20261007-153012-123-pre-cuenta-2-a1b2c3d4').toMatch(JOB_ID_PATTERN);
      for (const bad of [
        '20261007-153012-123-prueba-A1B2C3D4',
        '20261007-153012-123-prueba-a1b2c3d',
        '20261007-153012-123-Prueba-a1b2c3d4',
        '20261007-153012-12-prueba-a1b2c3d4',
        '../20261007-153012-123-prueba-a1b2c3d4',
        '20261007-153012-123-prueba-a1b2c3d4.txt',
        '',
      ]) {
        expect(bad).not.toMatch(JOB_ID_PATTERN);
      }
    });
  });

  describe('AC-15: identificadores únicos y ordenables', () => {
    it('AC-15: 200 impresiones simultáneas dan 200 jobId distintos, válidos y con 8 caracteres hexadecimales', async () => {
      const fake = createFakeDriver();
      const service = createPrinterService({ driver: fake.driver });

      await Promise.all(
        Array.from({ length: 200 }, (_, index) =>
          service.print({ label: 'prueba', lines: [`Trabajo ${String(index)}`] }),
        ),
      );

      const jobIds = fake.jobs.map((job) => job.jobId);
      expect(jobIds).toHaveLength(200);
      expect(new Set(jobIds).size).toBe(200);
      for (const jobId of jobIds) {
        expect(jobId).toMatch(JOB_ID_PATTERN);
        expect(jobId).toMatch(/-[0-9a-f]{8}$/);
      }
    });

    it('AC-15: ordenados alfabéticamente, los jobId quedan en el orden del tiempo (hora de Lima)', async () => {
      const dates = [
        '2026-10-07T23:59:59.999Z',
        '2026-10-08T00:00:00.000Z',
        '2026-10-08T05:00:00.000Z',
      ];
      const randoms = ['ffffffff', '00000000', '12345678'];
      const fake = createFakeDriver();
      let current = new Date(dates[0] ?? '');
      let currentRandom = randoms[0] ?? '';
      const service = createPrinterService({
        driver: fake.driver,
        now: () => current,
        randomId: () => currentRandom,
      });

      for (const [index, date] of dates.entries()) {
        current = new Date(date);
        currentRandom = randoms[index] ?? '';
        await service.print({ label: 'prueba', lines: ['Hola'] });
      }

      const jobIds = fake.jobs.map((job) => job.jobId);
      expect(jobIds).toHaveLength(3);
      expect([...jobIds].sort()).toEqual(jobIds);
    });
  });

  describe('AC-16: documento inválido', () => {
    const INVALID_LABELS: readonly unknown[] = [
      '',
      'Prueba',
      'prueba 1',
      'prueba_1',
      '../x',
      '..\\x',
      'a/b',
      '-a',
      'a-',
      'a--b',
      '\u00F1andu',
      'a'.repeat(33),
      1,
    ];

    const INVALID_DOCUMENTS: readonly (readonly [name: string, build: () => unknown])[] = [
      ['null', () => null],
      ['undefined', () => undefined],
      ["un texto ('hola')", () => 'hola'],
      ['un número (42)', () => 42],
      ['una lista vacía ([])', () => []],
      ['un documento sin label', () => ({ lines: ['x'] })],
      ...INVALID_LABELS.map((label): readonly [string, () => unknown] => [
        `un label ${JSON.stringify(label)}`,
        () => ({ label, lines: ['x'] }),
      ]),
      ['un documento sin lines', () => ({ label: 'prueba' })],
      ['un lines que es un texto', () => ({ label: 'prueba', lines: 'hola' })],
      ['una línea que es un número', () => ({ label: 'prueba', lines: [1] })],
      ['una línea null', () => ({ label: 'prueba', lines: [null] })],
      ['una línea undefined', () => ({ label: 'prueba', lines: [undefined] })],
      [
        'una lista con hueco',
        () => {
          const holey = new Array<string>(2);
          holey[1] = 'x';
          return { label: 'prueba', lines: holey };
        },
      ],
      ['501 líneas', () => ({ label: 'prueba', lines: xLines(501) })],
      ['una línea de 2001 caracteres', () => ({ label: 'prueba', lines: ['x'.repeat(2001)] })],
      [
        'una línea de 1001 emojis (2002 unidades de texto)',
        () => ({ label: 'prueba', lines: ['\u{1F600}'.repeat(1001)] }),
      ],
      ['una propiedad de más (copies)', () => ({ label: 'prueba', lines: ['x'], copies: 2 })],
      [
        'un getter de lines que lanza un Error',
        () => {
          const document = { label: 'prueba' };
          Object.defineProperty(document, 'lines', {
            enumerable: true,
            get() {
              throw new Error('lectura rota C:\\secreto\\comandas');
            },
          });
          return document;
        },
      ],
    ];

    it.each(INVALID_DOCUMENTS)(
      'AC-16: rechaza %s con PRINTER_INVALID_DOCUMENT y el driver no recibe nada',
      async (_name, build) => {
        const fake = createFakeDriver();
        const service = createPrinterService({ driver: fake.driver });

        const error = await rejectionOf(startPrint(service, build()));

        expectPrinterError(error, 'PRINTER_INVALID_DOCUMENT');
        expect(visibleErrorText(error)).not.toContain('secreto');
        expect(fake.jobs).toEqual([]);
      },
    );

    it.each(['a'.repeat(32), 'pre-cuenta-2', 'prueba'])(
      'AC-16: acepta el label %j',
      async (label) => {
        const fake = createFakeDriver();
        const service = createPrinterService({ driver: fake.driver });

        await service.print({ label, lines: ['x'] });

        expect(fake.jobs).toHaveLength(1);
        expect(fake.jobs[0]?.label).toBe(label);
        expect(fake.jobs[0]?.jobId).toMatch(JOB_ID_PATTERN);
        expect(fake.jobs[0]?.jobId.length).toBeLessThanOrEqual(61);
      },
    );

    it('AC-16: con un label de 32 caracteres el jobId mide 61 y cumple JOB_ID_PATTERN', async () => {
      const fake = createFakeDriver();

      await createPrinterService({ driver: fake.driver }).print({
        label: 'a'.repeat(32),
        lines: ['x'],
      });

      expect(fake.jobs[0]?.jobId).toHaveLength(61);
      expect(fake.jobs[0]?.jobId).toMatch(JOB_ID_PATTERN);
    });

    it('AC-16: acepta 500 líneas de entrada', async () => {
      const fake = createFakeDriver();

      await createPrinterService({ driver: fake.driver }).print({
        label: 'prueba',
        lines: xLines(500),
      });

      expect(fake.jobs[0]?.lines).toEqual(xLines(500));
    });

    it('AC-16: acepta una línea de 2000 caracteres y el driver recibe 42 líneas', async () => {
      const fake = createFakeDriver();

      await createPrinterService({ driver: fake.driver }).print({
        label: 'prueba',
        lines: ['x'.repeat(2000)],
      });

      const lines = fake.jobs[0]?.lines ?? [];
      expect(lines).toHaveLength(42);
      expect(lines.every((line) => line.length <= 48)).toBe(true);
      expect(lines.join('')).toBe('x'.repeat(2000));
    });

    it('AC-16: acepta una línea de 1000 emojis (2000 unidades de texto)', async () => {
      const fake = createFakeDriver();

      await createPrinterService({ driver: fake.driver }).print({
        label: 'prueba',
        lines: ['\u{1F600}'.repeat(1000)],
      });

      expect(fake.jobs[0]?.lines.join('')).toBe('?'.repeat(1000));
    });
  });

  describe('AC-17: documento demasiado largo', () => {
    it.each([
      ['una línea de entrada que da 502 líneas', ['a\n'.repeat(501)]],
      ['500 líneas de 96 caracteres (1000 líneas de salida)', xLines(500, 'x'.repeat(96))],
    ])('AC-17: rechaza %s con PRINTER_INVALID_DOCUMENT', async (_name, lines) => {
      const fake = createFakeDriver();
      const service = createPrinterService({ driver: fake.driver });

      const error = await rejectionOf(service.print({ label: 'prueba', lines }));

      expectPrinterError(error, 'PRINTER_INVALID_DOCUMENT');
      expect(fake.jobs).toEqual([]);
    });

    it('AC-17: una línea de entrada que da exactamente 500 líneas se acepta', async () => {
      const fake = createFakeDriver();
      const service = createPrinterService({ driver: fake.driver });

      await service.print({ label: 'prueba', lines: ['a\n'.repeat(499) + 'a'] });

      expect(fake.jobs).toHaveLength(1);
      expect(fake.jobs[0]?.lines).toEqual(xLines(500, 'a'));
    });

    it('AC-17: 500 líneas de 2000 unidades con texto, tildes NFD, controles y emojis terminan en menos de 2 s', async () => {
      const random = mulberry32(17);
      const lines = Array.from({ length: 500 }, () =>
        generateNoisyLine(random, 2000, [
          'ascii',
          'plainSpaces',
          'tildesNfd',
          'controls',
          'emojis',
        ]),
      );
      const fake = createFakeDriver();
      const service = createPrinterService({ driver: fake.driver });

      const startedAt = performance.now();
      await service.print({ label: 'prueba', lines }).then(
        () => undefined,
        () => undefined,
      );
      const elapsedMs = performance.now() - startedAt;

      expect(elapsedMs).toBeLessThan(2000);
    });
  });

  describe('AC-18: documento vacío', () => {
    it.each([
      ['[]', []],
      ["['']", ['']],
      ["['', '   ', '\\t']", ['', '   ', '\t']],
      ["['\\u0000\\u001B'] (solo controles)", ['\u0000\u001B']],
      ["['\\n\\n']", ['\n\n']],
      ["['\\u200B'] (carácter invisible)", ['\u200B']],
    ])('AC-18: rechaza %s con PRINTER_EMPTY_DOCUMENT', async (_name, lines) => {
      const fake = createFakeDriver();
      const service = createPrinterService({ driver: fake.driver });

      const error = await rejectionOf(service.print({ label: 'prueba', lines }));

      expectPrinterError(error, 'PRINTER_EMPTY_DOCUMENT');
      expect(fake.jobs).toEqual([]);
    });

    it('AC-18: las líneas en blanco de un documento con contenido se conservan', async () => {
      const fake = createFakeDriver();
      const service = createPrinterService({ driver: fake.driver });

      await service.print({ label: 'prueba', lines: ['', 'x', ''] });

      expect(fake.jobs[0]?.lines).toEqual(['', 'x', '']);
    });

    it('AC-18: un emoji no es un documento vacío: se imprime como ?', async () => {
      const fake = createFakeDriver();
      const service = createPrinterService({ driver: fake.driver });

      await service.print({ label: 'prueba', lines: ['\u{1F44D}'] });

      expect(fake.jobs[0]?.lines).toEqual(['?']);
    });
  });

  describe('AC-19: fallas del driver', () => {
    const DOCUMENT: PrintDocument = { label: 'prueba', lines: ['Hola'] };

    function rejectWith(value: unknown): Promise<never> {
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- el caso prueba justamente un valor que no es Error
      return Promise.reject(value);
    }

    it.each([
      ['PRINTER_OUTPUT_FAILED', new PrinterError('PRINTER_OUTPUT_FAILED')],
      ['PRINTER_INVALID_DOCUMENT', new PrinterError('PRINTER_INVALID_DOCUMENT')],
    ])('AC-19: un %s del driver pasa sin cambios (la misma instancia)', async (_code, original) => {
      const service = createPrinterService({
        driver: createDriverWith(() => rejectWith(original)),
      });

      const error = await rejectionOf(startPrint(service, DOCUMENT));

      expect(error).toBe(original);
    });

    it.each([
      [
        'un Error con una ruta del sistema',
        new Error('EACCES: permission denied, open C:\\secreto\\comandas\\x.tmp'),
        (value: unknown) => createDriverWith(() => rejectWith(value)),
      ],
      ['un texto', 'falla', (value: unknown) => createDriverWith(() => rejectWith(value))],
      ['undefined', undefined, (value: unknown) => createDriverWith(() => rejectWith(value))],
      [
        'una excepción síncrona sin promesa',
        new Error('boom síncrono'),
        (value: unknown) =>
          createDriverWith(() => {
            throw value;
          }),
      ],
    ])(
      'AC-19: %s se convierte en PRINTER_OUTPUT_FAILED con el original en cause',
      async (_name, original, buildDriver) => {
        const service = createPrinterService({ driver: buildDriver(original) });

        const error = await rejectionOf(startPrint(service, DOCUMENT));

        expectPrinterError(error, 'PRINTER_OUTPUT_FAILED');
        expect(error.cause).toBe(original);
      },
    );

    it('AC-19: ni message, ni String(error), ni JSON.stringify(error) filtran la ruta del Error original', async () => {
      const original = new Error('EACCES: permission denied, open C:\\secreto\\comandas\\x.tmp');
      const service = createPrinterService({
        driver: createDriverWith(() => rejectWith(original)),
      });

      const error = await rejectionOf(startPrint(service, DOCUMENT));

      expectPrinterError(error, 'PRINTER_OUTPUT_FAILED');
      expect(error.message).not.toContain('secreto');
      expect(String(error)).not.toContain('secreto');
      expect(JSON.stringify(error)).not.toContain('secreto');
      expect(visibleErrorText(error)).not.toContain('secreto');
    });
  });
});
