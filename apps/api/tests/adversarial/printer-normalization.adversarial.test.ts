/**
 * Ataques a la normalización y a la validación de documentos (adversarial-tester, spec 002).
 *
 * Objetivo principal: que nada de lo que escriba un mozo llegue al driver como comando ESC/POS
 * (RN-002-03) y que el trabajo de normalizar tenga un tope (D-002-06, AC-17). Las pruebas sin
 * hallazgo quedan en verde como protección de regresión.
 *
 * No usan la base de datos. Las que escriben en disco usan su propia carpeta bajo os.tmpdir()
 * (R-002-05).
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.ts';
import { createPrinterDriver, createPrinterService } from '../../src/services/printer/index.ts';
import { normalizeDocumentLines } from '../../src/services/printer/print-document.ts';
import type { PrintDocument } from '../../src/services/printer/print-document.ts';
import { createTempDir, removeTempDir } from '../helpers/printer-files.ts';
import {
  createDriverWith,
  createFakeDriver,
  expectPrinterError,
  rejectionOf,
} from '../helpers/printer-fixtures.ts';
import { mulberry32 } from '../helpers/seeded-random.ts';
import type { Random } from '../helpers/seeded-random.ts';
import {
  ESCPOS_COMMAND_BYTES,
  EXPECTED_PRINTABLE,
  VALID_DATABASE_URL,
  describeText,
  outputViolations,
} from './printer-adversarial-helpers.ts';

/** Todos los puntos de código entre from y to (incluye sustitutos sueltos si caen en el rango). */
function codePoints(from: number, to: number): string[] {
  return Array.from({ length: to - from + 1 }, (_, index) => String.fromCodePoint(from + index));
}

function pick<T>(random: Random, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)] as T;
}

/**
 * Familias de caracteres peligrosos o raros. Cada elemento es un "átomo" que el generador concatena.
 * Amplía las familias de AC-13 con lo que el test-writer no generó: C1 completos, Cf de otros
 * bloques (árabe, siríaco, mongol, música, etiquetas), Prepend, marcas que NFC reordena,
 * caracteres que NFKD expande, no-caracteres, uso privado, jamo coreanos y conjuntos índicos.
 */
const DANGEROUS_POOLS: readonly (readonly string[])[] = [
  codePoints(0x20, 0x7e),
  [
    ...'\u00E1\u00E9\u00ED\u00F3\u00FA\u00FC\u00F1\u00C1\u00C9\u00CD\u00D3\u00DA\u00DC\u00D1\u00BF\u00A1\u00B0\u00BA\u00AA',
  ],
  ['a\u0301', 'n\u0303', 'N\u0303', 'u\u0308', 'U\u0301', 'A\u030A', 'x\u0301\u0301'],
  codePoints(0x00, 0x1f),
  codePoints(0x7f, 0x9f),
  [
    '\u00AD',
    ...codePoints(0x0600, 0x0605),
    '\u061C',
    '\u06DD',
    '\u070F',
    '\u180E',
    ...codePoints(0x200b, 0x200f),
    ...codePoints(0x202a, 0x202e),
    ...codePoints(0x2060, 0x2064),
    ...codePoints(0x2066, 0x206f),
    '\uFEFF',
    ...codePoints(0xfff9, 0xfffb),
    '\u{110BD}',
    ...codePoints(0x1d173, 0x1d17a),
    '\u{E0001}',
    ...codePoints(0xe0020, 0xe007f),
  ],
  ['\t', '\u00A0', '\u1680', ...codePoints(0x2000, 0x200a), '\u202F', '\u205F', '\u3000'],
  ['\n', '\r', '\r\n', '\n\r', '\u0085', '\u2028', '\u2029', '\u000B', '\u000C'],
  [
    ...codePoints(0x0300, 0x036f),
    '\u0F73',
    '\u0F75',
    '\u0F81',
    ...codePoints(0x20d0, 0x20f0),
    ...codePoints(0xfe00, 0xfe0f),
    ...codePoints(0xfe20, 0xfe2f),
  ],
  ['\u0D4E', '\u{111C2}', '\u0600', '\u0D4Ea'],
  [
    ...codePoints(0x1f3fb, 0x1f3ff),
    '\u200D',
    '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}',
    '\u{1F44D}\u{1F3FD}',
    '\u2764\uFE0F',
    '1\uFE0F\u20E3',
    '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}',
    '\u{1F357}',
  ],
  codePoints(0x1f1e6, 0x1f1ff),
  [
    '\u2026',
    '\uFB01',
    '\u2103',
    '\u2116',
    '\u00BD',
    '\u33C2',
    '\u2487',
    '\uFDFA',
    '\u3250',
    '\u00A8',
    '\u00B4',
    '\u037A',
    '\u2474',
    '\u2400',
    '\u241B',
    ...codePoints(0xff01, 0xff5e),
  ],
  [
    ...codePoints(0x2018, 0x201f),
    '\u2032',
    '\u2033',
    '\u00AB',
    '\u00BB',
    ...codePoints(0x2010, 0x2015),
    '\u2212',
  ],
  codePoints(0xd800, 0xdfff),
  [
    '\uFFFE',
    '\uFFFF',
    '\u{1FFFE}',
    ...codePoints(0xfdd0, 0xfdef),
    '\uE000',
    '\uF8FF',
    '\u{F0000}',
    '\u{10FFFF}',
    '\uFFFD',
    '\uFFFC',
  ],
  [...codePoints(0x1100, 0x1112), ...codePoints(0x1161, 0x1175), ...codePoints(0x11a8, 0x11c2)],
  ['\uAC00', '\uD7A3', '\u0915', '\u094D', '\u0924', '\u0937'],
  [' ', '  ', ' '.repeat(47), 'x'.repeat(47) + ' ', 'y'.repeat(48)],
];

/** Una línea de unas `targetLength` unidades armada con átomos de las familias peligrosas. */
function dangerousLine(random: Random, targetLength: number): string {
  let line = '';
  while (line.length < targetLength) {
    line += pick(random, pick(random, DANGEROUS_POOLS));
  }
  return line;
}

describe('002 adversarial: normalización y validación del documento', () => {
  // ADV-002-01 (Medio): la normalización a NFC reordena las marcas combinantes con un algoritmo
  // cuadrático. Una línea de 2000 unidades con 1000 U+0344 (se descompone en dos marcas de clase
  // 230) seguidas de 999 U+0323 (clase 220) obliga a unos 2 millones de intercambios. 500 de esas
  // líneas son un documento válido (cada línea da 'x'), pero bloquean el hilo de Node unos 2 s la
  // primera vez y 5 a 7 s al reimprimir (en la PC de desarrollo). AC-17 pide menos de 2 s y
  // D-002-06 promete unos 100 ms para el caso más grande. En la Fase 3 congelaría la API completa
  // mientras se imprime.
  // Deuda aceptada por el usuario el 2026-10-08 (ver docs/PROGRESS.md). Corregir en la Fase 3 y volver a it(...).
  it.fails(
    'ADV-002-01: el documento más costoso que se acepta se imprime en menos de 2 s, también al reimprimirlo',
    async () => {
      const line = 'x' + '\u0344'.repeat(1000) + '\u0323'.repeat(999);
      expect(line.length).toBe(2000);
      const lines = Array.from({ length: 500 }, () => line);
      const fake = createFakeDriver();
      const service = createPrinterService({ driver: fake.driver });

      const elapsedMs: number[] = [];
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const startedAt = performance.now();
        await service.print({ label: 'prueba', lines });
        elapsedMs.push(performance.now() - startedAt);
      }

      // El documento es válido: cada línea se imprime como 'x' (las marcas sin equivalente se quitan).
      expect(fake.jobs).toHaveLength(2);
      expect(fake.jobs[0]?.lines).toEqual(Array.from({ length: 500 }, () => 'x'));
      const report = elapsedMs.map((ms) => `${String(Math.round(ms))} ms`).join(', ');
      expect(
        Math.max(...elapsedMs),
        `tiempos de la impresión y la reimpresión: ${report}`,
      ).toBeLessThan(2000);
    },
    120_000,
  );

  // ADV-002-03 (Bajo): el esquema revisa el máximo de 500 líneas después de recorrer TODOS los
  // elementos. Con un arreglo enorme (por ejemplo `new Array(2 ** 32 - 1)`, que no ocupa memoria
  // por ser disperso) Zod recorre los 4 mil millones de posiciones y crea un issue por cada hueco:
  // con 1 000 000 de huecos ya tarda unos 0,5 s y crea 1 000 001 issues; con el máximo agotaría la
  // memoria del proceso. El límite de D-002-06 debería cortar antes de recorrer los elementos.
  // Deuda aceptada por el usuario el 2026-10-08 (ver docs/PROGRESS.md). Corregir en la Fase 3 y volver a it(...).
  it.fails(
    'ADV-002-03: un documento con 100 000 líneas se rechaza sin leer más de 500 elementos',
    async () => {
      let elementReads = 0;
      const backing: string[] = Array.from({ length: 100_000 }, () => 'x');
      const lines = new Proxy(backing, {
        get(target, property, receiver): unknown {
          if (typeof property === 'string' && /^\d+$/.test(property)) {
            elementReads += 1;
          }
          return Reflect.get(target, property, receiver) as unknown;
        },
      });
      const fake = createFakeDriver();
      const service = createPrinterService({ driver: fake.driver });

      const error = await rejectionOf(service.print({ label: 'prueba', lines }));

      expectPrinterError(error, 'PRINTER_INVALID_DOCUMENT');
      expect(fake.jobs).toEqual([]);
      expect(elementReads, 'elementos leídos antes de rechazar').toBeLessThanOrEqual(500);
    },
  );

  // ADV-002-06 (regresión en verde): barrido exhaustivo. Cada punto de código del plano básico, del
  // plano 1 (emojis, símbolos) y del plano 14 (etiquetas y selectores de variante), más una muestra
  // del resto, entre dos letras: la salida solo tiene caracteres de PRINTABLE_CHARACTERS. Así ningún
  // carácter suelto puede llegar al driver como control o formato.
  it('ADV-002-06: ningún punto de código, solo entre letras, sale fuera del conjunto imprimible', () => {
    const offenders: string[] = [];
    const scan = (codePoint: number): void => {
      const character = String.fromCodePoint(codePoint);
      const output = normalizeDocumentLines(['a' + character + 'b']);
      const problems = outputViolations(output);
      if (problems.length > 0 && offenders.length < 5) {
        offenders.push(`${describeText(character)} -> ${problems.join('; ')}`);
      }
    };

    for (let codePoint = 0; codePoint <= 0x1ffff; codePoint += 1) {
      scan(codePoint);
    }
    for (let codePoint = 0xe0000; codePoint <= 0xeffff; codePoint += 1) {
      scan(codePoint);
    }
    for (let codePoint = 0x20000; codePoint < 0xe0000; codePoint += 97) {
      scan(codePoint);
    }
    for (let codePoint = 0xf0000; codePoint <= 0x10ffff; codePoint += 97) {
      scan(codePoint);
    }

    expect(offenders).toEqual([]);
  }, 60_000);

  // ADV-002-07 (regresión en verde): 8000 líneas con semilla fija, armadas con familias que AC-13
  // no generó. Además de las invariantes de AC-13 comprueba dos propiedades nuevas:
  // - estabilidad ante NFC y NFD: normalizar la línea en NFD o en NFC da exactamente lo mismo;
  // - partición: `a + '\n' + b` da lo mismo que normalizar a y b por separado (si a no termina en CR).
  it('ADV-002-07: líneas aleatorias peligrosas cumplen las invariantes, son estables ante NFC/NFD y se parten bien', () => {
    const random = mulberry32(0x0002_0007);
    const inputs = Array.from({ length: 8000 }, () =>
      dangerousLine(random, Math.floor(random() * 201)),
    );
    const failures: string[] = [];
    const fail = (input: string, problem: string): void => {
      if (failures.length < 3) {
        failures.push(`${describeText(input.slice(0, 40))}... -> ${problem}`);
      }
    };

    inputs.forEach((input, index) => {
      let output: string[];
      try {
        output = normalizeDocumentLines([input]);
      } catch (error) {
        fail(input, `lanzó: ${String(error)}`);
        return;
      }

      const problems = outputViolations(output);
      if (problems.length > 0) {
        fail(input, problems.join('; '));
      }
      if (JSON.stringify(normalizeDocumentLines(output)) !== JSON.stringify(output)) {
        fail(input, 'no es idempotente');
      }
      const expected = JSON.stringify(output);
      if (JSON.stringify(normalizeDocumentLines([input.normalize('NFD')])) !== expected) {
        fail(input, 'cambia si la entrada viene en NFD');
      }
      if (JSON.stringify(normalizeDocumentLines([input.normalize('NFC')])) !== expected) {
        fail(input, 'cambia si la entrada viene en NFC');
      }

      const next = inputs[(index + 1) % inputs.length] ?? '';
      if (!input.endsWith('\r')) {
        const joined = normalizeDocumentLines([input + '\n' + next]);
        const separate = [...output, ...normalizeDocumentLines([next])];
        if (JSON.stringify(joined) !== JSON.stringify(separate)) {
          fail(input, 'un salto de línea no parte igual que dos líneas separadas');
        }
      }
    });

    expect(failures).toEqual([]);
  }, 60_000);

  // ADV-002-08 (regresión en verde): con texto ya imprimible no se pierde ni se agrega ningún
  // carácter visible (D-002-04, paso 7): quitando los espacios, la salida unida es la entrada; sin
  // espacios en la entrada, la salida unida es exactamente la entrada y cada trozo menos el último
  // mide 48.
  it('ADV-002-08: con texto imprimible no se pierde ni se agrega ningún carácter visible', () => {
    const random = mulberry32(0x0002_0008);
    const printable = [...EXPECTED_PRINTABLE];
    const visible = printable.filter((character) => character !== ' ');
    const failures: string[] = [];

    for (let round = 0; round < 5000; round += 1) {
      const pool = round % 2 === 0 ? printable : visible;
      const length = Math.floor(random() * 301);
      const input = Array.from({ length }, () => pick(random, pool)).join('');
      const output = normalizeDocumentLines([input]);
      const withoutSpaces = (text: string): string => text.replaceAll(' ', '');

      if (withoutSpaces(output.join('')) !== withoutSpaces(input)) {
        failures.push(`se perdió o agregó un carácter: ${JSON.stringify(input)}`);
      }
      if (pool === visible) {
        const cutsAreFull = output.slice(0, -1).every((line) => line.length === 48);
        if (output.join('') !== input || !cutsAreFull) {
          failures.push(`corte incorrecto: ${JSON.stringify(input)}`);
        }
      }
      if (failures.length >= 3) {
        break;
      }
    }

    expect(failures).toEqual([]);
  });

  describe('cadena completa hasta el disco', () => {
    let dir: string;

    beforeEach(async () => {
      dir = await createTempDir();
    });

    afterEach(async () => {
      await removeTempDir(dir);
    });

    // ADV-002-09 (regresión en verde): comandos ESC/POS reales escritos por un "mozo" en las
    // observaciones, mezclados con trucos de formato, pasan por la puerta pública (loadConfig,
    // createPrinterDriver y createPrinterService). El archivo resultante es UTF-8 válido, solo tiene
    // caracteres imprimibles y LF, y ningún byte que inicie un comando ESC/POS.
    it('ADV-002-09: los comandos ESC/POS de un mozo no llegan al archivo', async () => {
      const payloads = [
        '\u001B@', // ESC @: reinicia la impresora
        '\u001Bp\u0000\u0019\u00FA', // ESC p: abre el cajón de dinero
        '\u0010\u0014\u0001\u0000\u0005', // DLE DC4: pulso en tiempo real (cajón)
        '\u001DV\u0000', // GS V: corta el papel
        '\u001DVA\u0003', // GS V A: corte parcial con avance
        '\u0010\u0004\u0001', // DLE EOT: estado en tiempo real
        '\u001Bt\u0010', // ESC t: cambia la tabla de caracteres
        '\u001B!\u0030', // ESC !: letra doble
        '\u001C.', // FS .: sale del modo kanji
        '\u001D(k\u0003\u00001A2', // GS ( k: código QR
        '\u001B[2J', // secuencia ANSI
        '\u009B2J', // CSI de C1
        '\u000C\u0018\u000B\u007F\u0000', // FF, CAN, VT, DEL y NUL
        '\u001B\u0301@', // ESC con una marca combinante pegada
        '\u200D\u001Bp0', // ZWJ antes de ESC
        '\uFEFF\u001DV1', // BOM antes de GS
        '\u202E\u001B@\u202C', // bidi override alrededor de ESC
        '\uFE0F\u001B\uFE0F', // selectores de variante alrededor de ESC
        '\uD83D\u001B\uDE00', // sustitutos separados por ESC
        '\uFFFE\uFFFF\u{10FFFF}', // no-caracteres
        '\u241B@', // símbolo visible de ESC (se imprime como ?)
      ];
      const document: PrintDocument = {
        label: 'comanda',
        lines: [
          'Mesa 4 - 1/4 pollo pierna',
          ...payloads.map((payload) => `  - sin ensalada ${payload} gracias`),
          payloads.join(''),
        ],
      };
      const config = loadConfig({ DATABASE_URL: VALID_DATABASE_URL, PRINTER_FILE_DIR: dir });
      const service = createPrinterService({ driver: createPrinterDriver(config.printer) });

      const receipt = await service.print(document);

      const files = await readdir(dir);
      expect(files).toEqual([path.basename(receipt.destination)]);
      const bytes = await readFile(receipt.destination);
      for (const commandByte of ESCPOS_COMMAND_BYTES) {
        expect(bytes.includes(commandByte), `byte 0x${commandByte.toString(16)}`).toBe(false);
      }
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      expect(text.endsWith('\n')).toBe(true);
      const outsiders = [...text].filter(
        (character) => character !== '\n' && !EXPECTED_PRINTABLE.has(character),
      );
      expect(outsiders.map(describeText)).toEqual([]);
      for (const line of text.slice(0, -1).split('\n')) {
        expect(line.length).toBeLessThanOrEqual(48);
      }
    });
  });

  // ADV-002-10 (regresión en verde): documentos hostiles. Un getter que devuelve líneas limpias al
  // validar y comandos después (TOCTOU), un arreglo cuyo elemento cambia en la segunda lectura, un
  // Proxy revocado y un getter que lanza un valor que no es Error. El driver nunca recibe nada sin
  // validar y print nunca lanza de forma síncrona.
  describe('ADV-002-10: documentos hostiles', () => {
    it('ADV-002-10: un getter que cambia de valor después de validar no cuela comandos (TOCTOU)', async () => {
      let documentReads = 0;
      let elementReads = 0;
      const sneakyLines = new Proxy(['limpio'], {
        get(target, property, receiver): unknown {
          if (property === '0') {
            elementReads += 1;
            return elementReads === 1 ? 'limpio' : '\u001Bp\u0000\u0019\u00FA';
          }
          return Reflect.get(target, property, receiver) as unknown;
        },
      });
      const document = {
        label: 'prueba',
        get lines(): readonly string[] {
          documentReads += 1;
          return documentReads === 1 ? sneakyLines : ['\u001B@'];
        },
      };
      const fake = createFakeDriver();
      const service = createPrinterService({ driver: fake.driver });

      await service.print(document);

      expect(fake.jobs).toHaveLength(1);
      expect(fake.jobs[0]?.lines).toEqual(['limpio']);
    });

    it.each([
      [
        'un Proxy revocado',
        (): unknown => {
          const { proxy, revoke } = Proxy.revocable({ label: 'prueba', lines: ['x'] }, {});
          revoke();
          return proxy;
        },
      ],
      [
        'un getter que lanza un Symbol',
        (): unknown => ({
          label: 'prueba',
          get lines(): never {
            // eslint-disable-next-line @typescript-eslint/only-throw-error -- el ataque lanza a propósito algo que no es Error
            throw Symbol('no soy un Error');
          },
        }),
      ],
      [
        'una línea cuyo getter lanza',
        (): unknown => {
          const lines: string[] = [];
          Object.defineProperty(lines, 0, {
            enumerable: true,
            get(): never {
              throw new Error('C:\\secreto\\linea');
            },
          });
          return { label: 'prueba', lines };
        },
      ],
    ])(
      'ADV-002-10: %s se rechaza con PRINTER_INVALID_DOCUMENT sin lanzar de forma síncrona',
      async (_name, build) => {
        const fake = createFakeDriver();
        const service = createPrinterService({ driver: fake.driver });

        let promise: Promise<unknown> | undefined;
        expect(() => {
          promise = service.print(build() as PrintDocument);
        }).not.toThrow();
        const error = await rejectionOf(promise ?? Promise.resolve());

        expectPrinterError(error, 'PRINTER_INVALID_DOCUMENT');
        expect(JSON.stringify(error)).not.toContain('secreto');
        expect(fake.jobs).toEqual([]);
      },
    );
  });

  // ADV-002-11 (regresión en verde): un driver que rechaza con un objeto disfrazado de PrinterError
  // (mismo name, code y un message con una ruta) o que devuelve un thenable que lanza dentro de
  // then. El servicio no confía en el disfraz: responde PRINTER_OUTPUT_FAILED con el mensaje fijo.
  describe('ADV-002-11: drivers tramposos', () => {
    it.each([
      [
        'un objeto disfrazado de PrinterError',
        (): Promise<never> =>
          Promise.reject(
            Object.assign(new Error('EACCES C:\\secreto\\comandas'), {
              name: 'PrinterError',
              code: 'PRINTER_INVALID_DOCUMENT',
            }),
          ),
      ],
      [
        'un thenable que lanza dentro de then',
        (): Promise<never> =>
          ({
            then(): never {
              throw new Error('C:\\secreto\\then');
            },
          }) as unknown as Promise<never>,
      ],
    ])(
      'ADV-002-11: %s se convierte en PRINTER_OUTPUT_FAILED sin filtrar la ruta',
      async (_name, print) => {
        const service = createPrinterService({ driver: createDriverWith(print) });

        const error = await rejectionOf(service.print({ label: 'prueba', lines: ['x'] }));

        expectPrinterError(error, 'PRINTER_OUTPUT_FAILED');
        expect(`${error.message}\n${String(error)}\n${JSON.stringify(error)}`).not.toContain(
          'secreto',
        );
      },
    );
  });
});
