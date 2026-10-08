import { z } from 'zod';

// Este archivo no usa escapes \uXXXX: los caracteres especiales se arman con códigos numéricos para
// que ningún editor los cambie de forma (NFC o NFD) ni los vuelva invisibles.

/** Ancho del papel de 80 mm, en columnas. */
export const PRINTER_LINE_WIDTH = 48;
/** Máximo de líneas por documento, de entrada y de salida. */
export const PRINTER_MAX_LINES = 500;
/** Máximo de unidades de texto de JavaScript (`line.length`) por línea de entrada. */
export const PRINTER_MAX_INPUT_LINE_LENGTH = 2000;
export const PRINT_LABEL_MAX_LENGTH = 32;
/** Minúsculas sin tilde, dígitos y guiones simples: la etiqueta forma parte del nombre del archivo. */
export const PRINT_LABEL_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** U+0020 a U+007E: los 95 caracteres ASCII imprimibles, en orden. */
const ASCII_PRINTABLE_FIRST = 0x20;
const ASCII_PRINTABLE_COUNT = 95;

/** á é í ó ú ü ñ Á É Í Ó Ú Ü Ñ ¿ ¡ ° º ª (están en PC850 y en WPC1252). */
const EXTRA_PRINTABLE_CODES = [
  0xe1, 0xe9, 0xed, 0xf3, 0xfa, 0xfc, 0xf1, 0xc1, 0xc9, 0xcd, 0xd3, 0xda, 0xdc, 0xd1, 0xbf, 0xa1,
  0xb0, 0xba, 0xaa,
];

/** Los 114 caracteres que el servicio deja pasar a la impresora (D-002-03). Cada uno ocupa una columna. */
export const PRINTABLE_CHARACTERS: string =
  Array.from({ length: ASCII_PRINTABLE_COUNT }, (_, index) =>
    String.fromCharCode(ASCII_PRINTABLE_FIRST + index),
  ).join('') + String.fromCharCode(...EXTRA_PRINTABLE_CODES);

/** Todos los imprimibles caben en un byte: una tabla de 256 posiciones basta para consultarlos. */
const PRINTABLE_TABLE = new Uint8Array(256);
for (const character of PRINTABLE_CHARACTERS) {
  PRINTABLE_TABLE[character.charCodeAt(0)] = 1;
}

function isPrintableCode(code: number): boolean {
  return code < PRINTABLE_TABLE.length && PRINTABLE_TABLE[code] === 1;
}

function isAllPrintable(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    if (!isPrintableCode(text.charCodeAt(index))) {
      return false;
    }
  }
  return true;
}

/** Tabla de sustitución tipográfica de D-002-04, paso 4c. */
const TYPOGRAPHIC_REPLACEMENTS: ReadonlyMap<string, string> = new Map(
  (
    [
      // Comilla simple: comillas simples curvas y prima.
      ["'", [0x2018, 0x2019, 0x201a, 0x201b, 0x2032]],
      // Comilla doble: comillas dobles curvas, doble prima y comillas angulares.
      ['"', [0x201c, 0x201d, 0x201e, 0x201f, 0x2033, 0xab, 0xbb]],
      // Guion: guiones, rayas y signo menos.
      ['-', [0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2015, 0x2212]],
    ] as const
  ).flatMap(([replacement, codes]) =>
    codes.map((code): [string, string] => [String.fromCharCode(code), replacement]),
  ),
);

const SPACE_CODE = 0x20;
const LF = 0x0a;
const CR = 0x0d;
/** Saltos de línea (paso 1): LF, CR, NEL, separador de línea (U+2028) y de párrafo (U+2029). CRLF cuenta como uno. */
const LINE_BREAK_CODES: ReadonlySet<number> = new Set([LF, CR, 0x85, 0x2028, 0x2029]);

/** Un solo carácter de la categoría Zs (espacios de Unicode, por ejemplo U+00A0 o U+3000). */
const UNICODE_SPACE = /^\p{Zs}$/u;
/** Marcas combinantes (M), controles (Cc) y caracteres de formato (Cf). */
const STRIPPED_CATEGORIES = /[\p{M}\p{Cc}\p{Cf}]/gu;

const graphemeSegmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

/** Paso 1: parte el texto en los saltos de línea. Un salto al final deja una línea vacía. */
function splitAtLineBreaks(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (!LINE_BREAK_CODES.has(code)) {
      continue;
    }
    chunks.push(text.slice(start, index));
    if (code === CR && text.charCodeAt(index + 1) === LF) {
      index += 1;
    }
    start = index + 1;
  }

  chunks.push(text.slice(start));
  return chunks;
}

/** Paso 4: convierte un grafema en lo que la impresora sí tiene ('' si no queda nada). */
function convertGrapheme(grapheme: string): string {
  // a. Ya es imprimible.
  if (grapheme.length === 1 && isPrintableCode(grapheme.charCodeAt(0))) {
    return grapheme;
  }

  // b. Tabulación o espacio de Unicode: un espacio normal.
  if (grapheme === '	' || UNICODE_SPACE.test(grapheme)) {
    return ' ';
  }

  // c. Signos tipográficos.
  const replacement = TYPOGRAPHIC_REPLACEMENTS.get(grapheme);
  if (replacement !== undefined) {
    return replacement;
  }

  // d. Sin acentos que la impresora no tiene, sin controles ni caracteres invisibles. Lo que no
  // tiene equivalente se imprime como '?' para que la cocina note que había algo.
  const simplified = grapheme.normalize('NFKD').replace(STRIPPED_CATEGORIES, '');
  if (simplified === '') {
    return '';
  }
  return isAllPrintable(simplified) ? simplified : '?';
}

/** Quita los espacios (U+0020) del final. */
function trimTrailingSpaces(text: string): string {
  let end = text.length;
  while (end > 0 && text.charCodeAt(end - 1) === SPACE_CODE) {
    end -= 1;
  }
  return end === text.length ? text : text.slice(0, end);
}

/** Pasos 2 a 4: NFC y conversión de cada grafema. */
function toPrintableText(chunk: string): string {
  const composed = chunk.normalize('NFC');
  // Si todo es imprimible no hay marcas combinantes: cada carácter es su propio grafema.
  if (isAllPrintable(composed)) {
    return composed;
  }

  let converted = '';
  for (const { segment } of graphemeSegmenter.segment(composed)) {
    converted += convertGrapheme(segment);
  }
  return converted;
}

function normalizeChunk(chunk: string): string[] {
  const text = trimTrailingSpaces(toPrintableText(chunk));
  if (text.length <= PRINTER_LINE_WIDTH) {
    return [text];
  }

  // Paso 6: corte duro en posiciones fijas. Paso 7: un espacio justo en el borde del corte se descarta.
  const pieces: string[] = [];
  for (let start = 0; start < text.length; start += PRINTER_LINE_WIDTH) {
    pieces.push(trimTrailingSpaces(text.slice(start, start + PRINTER_LINE_WIDTH)));
  }
  return pieces;
}

/**
 * Deja las líneas listas para la impresora (D-002-04). Función pura: nunca lanza, no modifica la
 * entrada y no aplica límites (eso lo hace el servicio). Cada línea de entrada da una o más de
 * salida: ninguna mide más de 48 columnas, ninguna termina en espacio, todos sus caracteres están
 * en PRINTABLE_CHARACTERS y normalizar la salida otra vez la devuelve igual.
 */
export function normalizeDocumentLines(lines: readonly string[]): string[] {
  return lines.flatMap((line) => splitAtLineBreaks(line).flatMap(normalizeChunk));
}

export interface PrintDocument {
  label: string;
  lines: readonly string[];
}

/**
 * Esquema del documento a imprimir (D-002-06). Estricto: una propiedad de más es un error.
 * El largo de cada línea se mide con `line.length` (unidades UTF-16): `z.string().max()` cuenta
 * puntos de código y aceptaría 1001 emojis (2002 unidades).
 */
export const printDocumentSchema = z.strictObject({
  label: z.string().regex(PRINT_LABEL_PATTERN).max(PRINT_LABEL_MAX_LENGTH),
  lines: z
    .array(z.string().refine((line) => line.length <= PRINTER_MAX_INPUT_LINE_LENGTH))
    .max(PRINTER_MAX_LINES),
});
