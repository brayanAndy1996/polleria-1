/**
 * Generador pseudoaleatorio de semilla fija y textos "sucios" para las pruebas de impresión
 * (spec 002, AC-13 y AC-17). Sin dependencias nuevas: la misma semilla da siempre los mismos textos,
 * así que las pruebas son deterministas. Todo carácter especial se escribe con escapes.
 */

export type Random = () => number;

/** mulberry32: generador de 32 bits, suficiente para variar textos de prueba. */
export function mulberry32(seed: number): Random {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Entero entre 0 y maxExclusive - 1. */
function int(random: Random, maxExclusive: number): number {
  return Math.floor(random() * maxExclusive);
}

function pick<T>(random: Random, items: readonly T[]): T {
  return items[int(random, items.length)] as T;
}

/** Un carácter (unidad UTF-16) con código entre from y to, ambos incluidos. */
function unitBetween(random: Random, from: number, to: number): string {
  return String.fromCharCode(from + int(random, to - from + 1));
}

const ASCII_SYMBOLS = '!"#$%&\'()*+,-./:;<=>?@[]^_{|}~0123456789';
const LETTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

const TILDES_NFC = [
  'á',
  'é',
  'í',
  'ó',
  'ú',
  'ü',
  'ñ',
  'Á',
  'É',
  'Í',
  'Ó',
  'Ú',
  'Ü',
  'Ñ',
  '¿',
  '¡',
  '°',
  'º',
  'ª',
] as const;

const TILDES_NFD = [
  'a\u0301',
  'e\u0301',
  'i\u0301',
  'o\u0301',
  'u\u0301',
  'u\u0308',
  'n\u0303',
  'N\u0303',
  'E\u0301',
  'U\u0301',
  'A\u0300',
  'c\u0327',
] as const;

const LINE_BREAKS = ['\n', '\r\n', '\r', '\u2028', '\u2029', '\u0085'] as const;

const EMOJIS = [
  '\u{1F44D}',
  '\u{1F44D}\u{1F3FD}',
  '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}',
  '\u{1F357}',
  '\u{1F600}',
  '\u2764\uFE0F',
  '1\uFE0F\u20E3',
] as const;

/** Familias de caracteres que mezcla el generador (las de AC-13). */
export const NOISE_FAMILIES = {
  ascii: (random: Random): string => {
    const length = 1 + int(random, 8);
    let word = '';
    for (let index = 0; index < length; index += 1) {
      const pool = random() < 0.8 ? LETTERS : ASCII_SYMBOLS;
      word += pool.charAt(int(random, pool.length));
    }
    return word;
  },
  plainSpaces: (random: Random): string => ' '.repeat(1 + int(random, 3)),
  tildesNfc: (random: Random): string => pick(random, TILDES_NFC),
  tildesNfd: (random: Random): string => pick(random, TILDES_NFD),
  controls: (random: Random): string =>
    random() < 0.5 ? unitBetween(random, 0x00, 0x1f) : unitBetween(random, 0x7f, 0x9f),
  lineBreaks: (random: Random): string => pick(random, LINE_BREAKS),
  unicodeSpaces: (random: Random): string => {
    const roll = int(random, 3);
    if (roll === 0) {
      return '\u00A0';
    }
    return roll === 1 ? '\u3000' : unitBetween(random, 0x2000, 0x200a);
  },
  formats: (random: Random): string => {
    const roll = int(random, 4);
    if (roll === 0) {
      return unitBetween(random, 0x200b, 0x200f);
    }
    if (roll === 1) {
      return unitBetween(random, 0x202a, 0x202e);
    }
    return roll === 2 ? unitBetween(random, 0x2060, 0x2064) : '\uFEFF';
  },
  emojis: (random: Random): string => pick(random, EMOJIS),
  regionalIndicators: (random: Random): string => {
    const first = String.fromCodePoint(0x1f1e6 + int(random, 26));
    return random() < 0.7 ? first + String.fromCodePoint(0x1f1e6 + int(random, 26)) : first;
  },
  chinese: (random: Random): string => unitBetween(random, 0x4e00, 0x4e00 + 500),
  loneSurrogates: (random: Random): string => unitBetween(random, 0xd800, 0xdfff),
} as const;

export type NoiseFamily = keyof typeof NOISE_FAMILIES;

export const ALL_NOISE_FAMILIES = Object.keys(NOISE_FAMILIES) as NoiseFamily[];

/** Familias de un texto "normal" escrito por un mozo: letras, espacios y tildes. */
const TEXT_LIKE_FAMILIES: readonly NoiseFamily[] = [
  'ascii',
  'ascii',
  'ascii',
  'plainSpaces',
  'plainSpaces',
  'tildesNfc',
  'tildesNfd',
];

/** Una línea de exactamente `length` unidades de texto (puede cortar un par sustituto a la mitad). */
export function generateNoisyLine(
  random: Random,
  length: number,
  families: readonly NoiseFamily[] = ALL_NOISE_FAMILIES,
): string {
  let line = '';

  while (line.length < length) {
    line += NOISE_FAMILIES[pick(random, families)](random);
  }

  return line.slice(0, length);
}

/**
 * `count` líneas de 0 a `maxLength` unidades. Cerca de un tercio son texto "normal" (para que los
 * cortes de 48 columnas caigan en muchos lugares, también justo después de un espacio) y el resto
 * mezcla todas las familias.
 */
export function generateNoisyLines(count: number, seed: number, maxLength = 300): string[] {
  const random = mulberry32(seed);
  const lines: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const length = int(random, maxLength + 1);
    const families = random() < 0.35 ? TEXT_LIKE_FAMILIES : ALL_NOISE_FAMILIES;
    lines.push(generateNoisyLine(random, length, families));
  }

  return lines;
}
