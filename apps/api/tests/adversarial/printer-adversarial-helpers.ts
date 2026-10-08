/**
 * Utilidades de los ataques a la spec 002 (adversarial-tester).
 *
 * El conjunto imprimible se escribe aquí con escapes, con los valores de D-002-03, y no se importa
 * del código de producción: así un error de la implementación no se copia también en la prueba.
 */

/** Los 114 caracteres de D-002-03: U+0020 a U+007E y luego á é í ó ú ü ñ Á É Í Ó Ú Ü Ñ ¿ ¡ ° º ª. */
export const EXPECTED_PRINTABLE: ReadonlySet<string> = new Set<string>([
  ...Array.from({ length: 95 }, (_, index) => String.fromCharCode(0x20 + index)),
  ...'áéíóúüñÁÉÍÓÚÜÑ¿¡°ºª',
]);

/** Una URL de PostgreSQL válida para loadConfig. loadConfig nunca se conecta. */
export const VALID_DATABASE_URL = 'postgres://polleria:clave@localhost:5432/polleria_dev';

/** Bytes que inician comandos ESC/POS: NUL, DLE, CAN, ESC, FS, GS y DEL. */
export const ESCPOS_COMMAND_BYTES: readonly number[] = [0x00, 0x10, 0x18, 0x1b, 0x1c, 0x1d, 0x7f];

/**
 * Problemas de una salida de normalizeDocumentLines respecto de RN-002-02 (sin contar el máximo de
 * líneas): cada línea mide 48 o menos, solo tiene caracteres imprimibles y no termina en espacio.
 */
export function outputViolations(output: readonly string[]): string[] {
  const problems: string[] = [];
  if (output.length < 1) {
    problems.push('devolvió una lista vacía');
  }
  for (const line of output) {
    if (line.length > 48) {
      problems.push(`una línea mide ${String(line.length)} columnas`);
    }
    for (const character of line) {
      if (!EXPECTED_PRINTABLE.has(character)) {
        const code = character.codePointAt(0) ?? 0;
        problems.push(`carácter fuera del conjunto: U+${code.toString(16).toUpperCase()}`);
        break;
      }
    }
    if (line.endsWith(' ')) {
      problems.push('una línea termina en espacio');
    }
  }
  return problems;
}

/** Texto legible de un carácter o una cadena para los mensajes de las pruebas. */
export function describeText(text: string): string {
  return [...text]
    .map((character) => `U+${(character.codePointAt(0) ?? 0).toString(16).toUpperCase()}`)
    .join(' ');
}
