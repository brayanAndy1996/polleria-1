import { describe, expect, it } from 'vitest';
import { generateNoisyLines } from '../../../tests/helpers/seeded-random.ts';
import {
  PRINTABLE_CHARACTERS,
  PRINTER_LINE_WIDTH,
  normalizeDocumentLines,
} from './print-document.ts';

// Todo carácter especial se escribe con escapes (\u...) para que ningún editor lo cambie de forma
// (NFC o NFD) ni lo vuelva invisible.

const ASCII_PRINTABLE = Array.from({ length: 95 }, (_, index) =>
  String.fromCharCode(0x20 + index),
).join('');
const EXTRA_PRINTABLE = 'áéíóúüñÁÉÍÓÚÜÑ¿¡°ºª';
/** Los 114 caracteres de D-002-03, armados aquí con los códigos de la spec. */
const EXPECTED_PRINTABLE = ASCII_PRINTABLE + EXTRA_PRINTABLE;

type Case = readonly [name: string, input: string, expected: readonly string[]];

/** AC-07: líneas que ya son imprimibles. */
const PRINTABLE_LINES: readonly string[] = [
  'Hola',
  '1/4 pollo pierna + chicha',
  '  - sin ensalada',
  '',
  'Pollería: Ñandú, ¿Qué? ¡Sí! 25° Nº 1ª',
  'x'.repeat(48),
  EXPECTED_PRINTABLE.slice(0, 48),
  EXPECTED_PRINTABLE.slice(48, 96),
  EXPECTED_PRINTABLE.slice(96),
];

/** AC-08: corte duro en 48 columnas. */
const CUT_CASES: readonly Case[] = [
  ['48 letras no se cortan', 'x'.repeat(48), ['x'.repeat(48)]],
  ['49 letras', 'x'.repeat(49), ['x'.repeat(48), 'x']],
  ['96 letras', 'x'.repeat(96), ['x'.repeat(48), 'x'.repeat(48)]],
  ['100 letras', 'x'.repeat(100), ['x'.repeat(48), 'x'.repeat(48), 'xxxx']],
  [
    'corte duro sin buscar espacios',
    'a'.repeat(40) + ' ' + 'b'.repeat(20),
    ['a'.repeat(40) + ' ' + 'b'.repeat(7), 'b'.repeat(13)],
  ],
  ['los espacios finales se quitan antes de cortar', 'x'.repeat(48) + '   ', ['x'.repeat(48)]],
  ['la sangría se conserva', '   x', ['   x']],
  ['solo espacios queda vacía', '    ', ['']],
];

/** AC-09: saltos de línea dentro de una línea. */
const BREAK_CASES: readonly Case[] = [
  ['LF', 'a\nb', ['a', 'b']],
  ['CRLF cuenta como uno', 'a\r\nb', ['a', 'b']],
  ['CR', 'a\rb', ['a', 'b']],
  ['U+2028', 'a\u2028b', ['a', 'b']],
  ['U+2029', 'a\u2029b', ['a', 'b']],
  ['NEL (U+0085)', 'a\u0085b', ['a', 'b']],
  ['dos LF dejan una línea vacía', 'a\n\nb', ['a', '', 'b']],
  ['dos CRLF dejan una línea vacía', 'a\r\n\r\nb', ['a', '', 'b']],
  ['LF seguido de CR son dos saltos', 'a\n\rb', ['a', '', 'b']],
  ['un salto al final deja una línea vacía', 'a\n', ['a', '']],
  ['solo dos saltos', '\n\n', ['', '', '']],
  ['cada trozo se corta por separado', 'x'.repeat(50) + '\n' + 'y', ['x'.repeat(48), 'xx', 'y']],
];

/** AC-10: tildes, letras de otros idiomas y signos tipográficos. */
const LETTER_CASES: readonly Case[] = [
  ['NFC une n y la tilde', 'n\u0303', ['ñ']],
  ['NFC une e y el acento', 'cafe\u0301', ['café']],
  ['NFC con mayúsculas', 'N\u0303ANDU\u0301', ['ÑANDÚ']],
  [
    'se quita el acento que la impresora no tiene',
    '\u00E0 \u00E7 \u00F6 \u00C5 \u00FF',
    ['a c o A y'],
  ],
  ['puntos suspensivos (NFKD)', '\u2026', ['...']],
  [
    'comillas y rayas tipográficas',
    '\u201Chola\u201D \u2018x\u2019 \u2013 \u2014 \u00ABy\u00BB',
    ['"hola" \'x\' - - "y"'],
  ],
  ['ligadura fi (NFKD)', '\uFB01', ['fi']],
  ['grado centígrado (NFKD)', '\u2103', ['°C']],
  ['signo de número (NFKD)', '\u2116 5', ['No 5']],
  ['m cuadrado (NFKD)', 'm\u00B2', ['m2']],
  ['A de ancho completo (NFKD)', '\uFF21', ['A']],
  ['un medio: NFKD da una barra que no se imprime', '\u00BD', ['?']],
  ['O con barra', '\u00D8', ['?']],
  ['eszett', '\u00DF', ['?']],
  ['euro', '\u20AC', ['?']],
  ['punto medio', '\u00B7', ['?']],
  ['dos acentos que NFC no puede unir se pierden', 'x\u0301\u0301', ['x']],
];

/** AC-11: emojis y caracteres que la impresora no tiene. */
const EMOJI_CASES: readonly Case[] = [
  ['pulgar arriba', '\u{1F44D}', ['?']],
  ['pulgar con tono de piel es un solo signo', '\u{1F44D}\u{1F3FD}', ['?']],
  ['familia unida con ZWJ', '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}', ['?']],
  ['bandera de Perú', '\u{1F1F5}\u{1F1EA}', ['?']],
  ['corazón con selector de variante', '\u2764\uFE0F', ['?']],
  ['tecla 1', '1\uFE0F\u20E3', ['1']],
  ['pierna de pollo en medio de un texto', 'pollo \u{1F357} x2', ['pollo ? x2']],
  ['dos caracteres chinos', '\u6F22\u5B57', ['??']],
  ['sustituto suelto', '\uD800', ['?']],
  ['sustituto suelto en medio', 'a\uDC00b', ['a?b']],
  [
    '60 emojis dan 60 signos en dos líneas',
    '\u{1F600}'.repeat(60),
    ['?'.repeat(48), '?'.repeat(12)],
  ],
];

/** AC-12: caracteres de control y espacios especiales. */
const CONTROL_CASES: readonly Case[] = [
  ['la tabulación pasa a un espacio', 'a\tb', ['a b']],
  ['la sangría con tabulación se conserva', '\t- sin ají', [' - sin ají']],
  ['espacio de no separación (U+00A0)', 'a\u00A0b', ['a b']],
  ['espacio em (U+2003)', 'a\u2003b', ['a b']],
  ['espacio ideográfico (U+3000)', 'a\u3000b', ['a b']],
  [
    'ESC, GS, BEL, NUL, DEL y C1 no llegan como comandos ESC/POS',
    'A\u001B@B\u001Dv0C\u0007\u0000D\u007F\u009BE',
    ['A@Bv0CDE'],
  ],
  ['caracteres de formato invisibles', 'a\u200Bb\uFEFFc\u202Ed\u00ADe', ['abcde']],
  ['ZWJ suelto', 'a\u200Db', ['ab']],
  ['VT y FF se eliminan', 'a\u000Bb\u000Cc', ['abc']],
  ['acento combinante sin letra', '\u0301x', ['x']],
  ['solo controles', '\u0000\u001B', ['']],
];

describe('002: normalizeDocumentLines (backend/src/services/printer/print-document.ts)', () => {
  describe('AC-07: las líneas imprimibles no cambian', () => {
    it('AC-07: devuelve una lista nueva igual a la de entrada y no modifica la entrada', () => {
      const input = [...PRINTABLE_LINES];

      const output = normalizeDocumentLines(input);

      expect(output).toEqual(PRINTABLE_LINES);
      expect(output).not.toBe(input);
      expect(input).toEqual(PRINTABLE_LINES);
    });

    it('AC-07: acepta la lista congelada con Object.freeze', () => {
      const frozen = Object.freeze([...PRINTABLE_LINES]);

      expect(normalizeDocumentLines(frozen)).toEqual(PRINTABLE_LINES);
      expect(frozen).toEqual(PRINTABLE_LINES);
    });

    it('AC-07: cada carácter imprimible, solo y entre letras, pasa sin cambios', () => {
      const changed = [...EXPECTED_PRINTABLE]
        .filter((character) => normalizeDocumentLines([`a${character}b`])[0] !== `a${character}b`)
        .map((character) => `U+${(character.codePointAt(0) ?? 0).toString(16).toUpperCase()}`);

      expect(changed).toEqual([]);
    });

    it('AC-07: PRINTER_LINE_WIDTH es 48', () => {
      expect(PRINTER_LINE_WIDTH).toBe(48);
    });

    it('AC-07: PRINTABLE_CHARACTERS tiene los 114 caracteres de D-002-03, en orden', () => {
      expect(PRINTABLE_CHARACTERS).toHaveLength(114);
      expect(PRINTABLE_CHARACTERS.slice(0, 95)).toBe(ASCII_PRINTABLE);
      expect(PRINTABLE_CHARACTERS.slice(95)).toBe(EXTRA_PRINTABLE);
      expect(PRINTABLE_CHARACTERS).toBe(EXPECTED_PRINTABLE);
    });
  });

  describe('AC-08: las líneas de más de 48 columnas se cortan en trozos de 48', () => {
    it.each(CUT_CASES)('AC-08: %s', (_name, input, expected) => {
      const output = normalizeDocumentLines([input]);

      expect(output).toEqual(expected);
      // Unir los trozos da la línea de entrada sin sus espacios finales.
      expect(output.join('')).toBe(input.replace(/ +$/, ''));
    });
  });

  describe('AC-09: saltos de línea dentro de una línea', () => {
    it.each(BREAK_CASES)('AC-09: %s', (_name, input, expected) => {
      expect(normalizeDocumentLines([input])).toEqual(expected);
    });

    it('AC-09: cada línea de la lista se parte por separado y el orden se mantiene', () => {
      expect(normalizeDocumentLines(['uno\ndos', 'tres'])).toEqual(['uno', 'dos', 'tres']);
    });
  });

  describe('AC-10: tildes, letras de otros idiomas y signos tipográficos', () => {
    it.each(LETTER_CASES)('AC-10: %s', (_name, input, expected) => {
      expect(normalizeDocumentLines([input])).toEqual(expected);
    });
  });

  describe('AC-11: emojis y caracteres que la impresora no tiene', () => {
    it.each(EMOJI_CASES)('AC-11: %s', (_name, input, expected) => {
      expect(normalizeDocumentLines([input])).toEqual(expected);
    });
  });

  describe('AC-12: caracteres de control y espacios especiales', () => {
    it.each(CONTROL_CASES)('AC-12: %s', (_name, input, expected) => {
      expect(normalizeDocumentLines([input])).toEqual(expected);
    });
  });

  describe('AC-13: invariantes de la normalización', () => {
    /** Cada línea de AC-07 a AC-12 como entrada. */
    const SPEC_LINES: readonly string[] = [
      ...PRINTABLE_LINES,
      ...[...CUT_CASES, ...BREAK_CASES, ...LETTER_CASES, ...EMOJI_CASES, ...CONTROL_CASES].map(
        ([, input]) => input,
      ),
      'uno\ndos',
      'tres',
    ];

    /** 1200 líneas de 0 a 300 unidades con semilla fija: siempre las mismas. */
    const GENERATED_LINES = generateNoisyLines(1200, 20261007, 300);

    /** Devuelve los problemas de una entrada; una lista vacía significa que cumple las seis invariantes. */
    function violationsOf(input: string): string[] {
      let output: string[];
      try {
        output = normalizeDocumentLines([input]);
      } catch (error) {
        return [`lanzó un error: ${String(error)}`];
      }

      const problems: string[] = [];
      if (output.length < 1) {
        problems.push('devolvió una lista vacía');
      }
      for (const line of output) {
        if (line.length > 48) {
          problems.push(`una línea mide ${String(line.length)} columnas`);
        }
        const outsider = [...line].find((character) => !EXPECTED_PRINTABLE.includes(character));
        if (outsider !== undefined) {
          problems.push(`carácter fuera del conjunto: ${JSON.stringify(outsider)}`);
        }
        if (line.endsWith(' ')) {
          problems.push('una línea termina en espacio');
        }
      }

      try {
        if (JSON.stringify(normalizeDocumentLines(output)) !== JSON.stringify(output)) {
          problems.push('no es idempotente');
        }
      } catch (error) {
        problems.push(`lanzó un error al normalizar la salida: ${String(error)}`);
      }

      return problems;
    }

    /** Hasta tres entradas que fallan, con su problema, para que el mensaje sea legible. */
    function firstFailures(inputs: readonly string[]): string[] {
      return inputs
        .map((input) => ({ input, problems: violationsOf(input) }))
        .filter((result) => result.problems.length > 0)
        .slice(0, 3)
        .map((result) => `${JSON.stringify(result.input)} -> ${result.problems.join('; ')}`);
    }

    function someUnitBetween(lines: readonly string[], from: number, to: number): boolean {
      return lines.some((line) => {
        for (let index = 0; index < line.length; index += 1) {
          const unit = line.charCodeAt(index);
          if (unit >= from && unit <= to) {
            return true;
          }
        }
        return false;
      });
    }

    function hasLoneSurrogate(line: string): boolean {
      for (let index = 0; index < line.length; index += 1) {
        const unit = line.charCodeAt(index);
        const next = line.charCodeAt(index + 1);
        const previous = line.charCodeAt(index - 1);
        const isHigh = unit >= 0xd800 && unit <= 0xdbff;
        const isLow = unit >= 0xdc00 && unit <= 0xdfff;
        if (isHigh && !(next >= 0xdc00 && next <= 0xdfff)) {
          return true;
        }
        if (isLow && !(previous >= 0xd800 && previous <= 0xdbff)) {
          return true;
        }
      }
      return false;
    }

    it('AC-13: las líneas de AC-07 a AC-12 cumplen las seis invariantes', () => {
      expect(SPEC_LINES.length).toBeGreaterThan(60);
      expect(firstFailures(SPEC_LINES)).toEqual([]);
    });

    it('AC-13: 1000 líneas o más generadas con semilla fija cumplen las seis invariantes', () => {
      expect(GENERATED_LINES.length).toBeGreaterThanOrEqual(1000);
      expect(firstFailures(GENERATED_LINES)).toEqual([]);
    });

    it('AC-13: un corte de 48 columnas que cae justo después de un espacio no deja la línea terminando en espacio', () => {
      const inputs = [
        'a'.repeat(47) + ' b',
        'a'.repeat(47) + '    b',
        'x'.repeat(10) + ' '.repeat(100) + 'y',
        'a'.repeat(95) + ' b',
      ];

      expect(firstFailures(inputs)).toEqual([]);
    });

    it('AC-13: el generador mezcla todas las familias de caracteres y los largos de 0 a 300', () => {
      const lengths = GENERATED_LINES.map((line) => line.length);
      expect(Math.min(...lengths)).toBeLessThan(10);
      expect(Math.max(...lengths)).toBeLessThanOrEqual(300);
      expect(Math.max(...lengths)).toBeGreaterThan(250);

      const families: readonly (readonly [string, boolean])[] = [
        ['letras ASCII', someUnitBetween(GENERATED_LINES, 0x41, 0x7a)],
        ['tildes NFC', someUnitBetween(GENERATED_LINES, 0xe1, 0xfc)],
        ['marcas combinantes (NFD)', someUnitBetween(GENERATED_LINES, 0x300, 0x36f)],
        ['controles C0', someUnitBetween(GENERATED_LINES, 0x00, 0x1f)],
        ['controles C1 y DEL', someUnitBetween(GENERATED_LINES, 0x7f, 0x9f)],
        ['saltos U+2028 y U+2029', someUnitBetween(GENERATED_LINES, 0x2028, 0x2029)],
        ['espacios U+2000 a U+200A', someUnitBetween(GENERATED_LINES, 0x2000, 0x200a)],
        ['espacio U+00A0', someUnitBetween(GENERATED_LINES, 0xa0, 0xa0)],
        ['espacio U+3000', someUnitBetween(GENERATED_LINES, 0x3000, 0x3000)],
        ['formatos U+200B a U+200F', someUnitBetween(GENERATED_LINES, 0x200b, 0x200f)],
        ['formatos U+202A a U+202E', someUnitBetween(GENERATED_LINES, 0x202a, 0x202e)],
        ['formatos U+2060 a U+2064', someUnitBetween(GENERATED_LINES, 0x2060, 0x2064)],
        ['U+FEFF', someUnitBetween(GENERATED_LINES, 0xfeff, 0xfeff)],
        ['ZWJ', someUnitBetween(GENERATED_LINES, 0x200d, 0x200d)],
        ['emojis y indicadores regionales', someUnitBetween(GENERATED_LINES, 0xd83c, 0xd83d)],
        ['caracteres chinos', someUnitBetween(GENERATED_LINES, 0x4e00, 0x9fff)],
        ['sustitutos sueltos', GENERATED_LINES.some(hasLoneSurrogate)],
      ];

      expect(families.filter(([, present]) => !present).map(([name]) => name)).toEqual([]);
    });
  });
});
