/**
 * Dinero en la interfaz (D-008-04, regla de dominio 2): el sistema guarda y calcula
 * en céntimos de sol como entero; solo en la interfaz se muestra y se escribe en
 * soles. Son funciones puras y deterministas —sin Intl ni float en el cálculo— y
 * viven en shared porque las reutilizan la carta del mozo (Fase 2) y la caja
 * (Fase 4), con el mismo criterio que toLimaDateTimeParts de la 001.
 */

/**
 * Mensaje único del campo Precio en la web (D-008-04). El tope es el del esquema de
 * precios (PRICE_CENTS_MAX = 99999 céntimos) expresado en soles: el mensaje en
 * céntimos de la API confunde en pantalla.
 */
export const PRICE_INPUT_MESSAGE =
  'Escribe el precio en soles (por ejemplo 18.50). El máximo es S/ 999.99.';

/**
 * Entero de céntimos -> 'S/ X.XX' (1850 -> 'S/ 18.50', 0 -> 'S/ 0.00', 5 -> 'S/ 0.05').
 * Aritmética de enteros, sin Intl ni float: la parte entera con Math.trunc y los dos
 * dígitos de céntimos con padStart, así el resultado es el mismo en cualquier equipo.
 * Lanza error ante cualquier entrada que no sea un entero mayor o igual a 0
 * (defensa, igual que chickenConsumption): el dinero nunca es float ni texto.
 */
export function formatSoles(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new Error(
      `formatSoles espera un entero de céntimos mayor o igual a 0 y recibió: ${String(cents)}.`,
    );
  }
  const soles = Math.trunc(cents / 100);
  const centsText = String(cents % 100).padStart(2, '0');
  return `S/ ${soles}.${centsText}`;
}

/**
 * Texto del campo Precio -> entero de céntimos ('18' -> 1800, '18.5' -> 1850,
 * '18,50' -> 1850, con espacios solo alrededor). Acepta uno o más dígitos con un
 * separador decimal '.' o ',' seguido de uno o dos dígitos; devuelve null cuando el
 * formato no cuadra: vacío, letras, el símbolo 'S/', más de un separador, más de dos
 * decimales, negativos, decimales sin dígito inicial ('.5'), separador sin decimales
 * ('18.') o espacios internos ('1 850'). No acota el rango: el tope lo revisa el
 * esquema del precio y se muestra con PRICE_INPUT_MESSAGE.
 */
export function parseSolesToCents(text: string): number | null {
  const trimmed = text.trim();
  // Uno o más dígitos, opcionalmente con un separador '.' o ',' y 1-2 decimales.
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(trimmed)) return null;
  const separatorIndex = trimmed.search(/[.,]/);
  if (separatorIndex === -1) return Number.parseInt(trimmed, 10) * 100;
  const soles = Number.parseInt(trimmed.slice(0, separatorIndex), 10);
  // Un decimal '5' vale 50 céntimos: se completa con un cero a la derecha.
  const cents = Number.parseInt(trimmed.slice(separatorIndex + 1).padEnd(2, '0'), 10);
  return soles * 100 + cents;
}
