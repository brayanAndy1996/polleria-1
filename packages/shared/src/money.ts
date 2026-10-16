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
 * Aritmética de enteros, sin Intl ni float: la conversión a dígitos se hace con
 * BigInt sobre el valor exacto del entero double —String() pasa a notación
 * exponencial cuando la parte de soles llega a 1e21 y rompería el formato
 * (ADV-008-03)—, así el resultado es el mismo en cualquier equipo.
 * Lanza error ante cualquier entrada que no sea un entero mayor o igual a 0
 * (defensa, igual que chickenConsumption): el dinero nunca es float ni texto.
 */
export function formatSoles(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new Error(
      `formatSoles espera un entero de céntimos mayor o igual a 0 y recibió: ${String(cents)}.`,
    );
  }
  // BigInt solo acepta números enteros: la guardia de arriba ya lo garantiza, y
  // conserva el valor exacto aunque supere 2^53.
  const integer = BigInt(cents);
  const soles = integer / 100n;
  const centsText = String(integer % 100n).padStart(2, '0');
  return `S/ ${soles}.${centsText}`;
}

/** Formato de Caja aprobado en la 014: soles con dos decimales y coma decimal. */
export function formatCashierSoles(cents: number): string {
  return formatSoles(cents).replace('.', ',');
}

/**
 * Texto del campo Precio -> entero de céntimos ('18' -> 1800, '18.5' -> 1850,
 * '18,50' -> 1850, con espacios solo alrededor). Acepta uno o más dígitos con un
 * separador decimal '.' o ',' seguido de uno o dos dígitos; devuelve null cuando el
 * formato no cuadra: vacío, letras, el símbolo 'S/', más de un separador, más de dos
 * decimales, negativos, decimales sin dígito inicial ('.5'), separador sin decimales
 * ('18.') o espacios internos ('1 850'). No acota el rango: el tope lo revisa el
 * esquema del precio y se muestra con PRICE_INPUT_MESSAGE. La única cota es la
 * representabilidad (ADV-008-02): con ~309 dígitos o más en la parte entera
 * parseInt desborda a Infinity y no existe un entero de céntimos que devolver,
 * así que se devuelve null. Entre 2^53 y ese límite el resultado sigue siendo
 * un entero finito aunque pierda precisión — límite documentado y aceptado,
 * muy por encima del tope real de precios.
 */
export function parseSolesToCents(text: string): number | null {
  const trimmed = text.trim();
  // Uno o más dígitos, opcionalmente con un separador '.' o ',' y 1-2 decimales.
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(trimmed)) return null;
  const separatorIndex = trimmed.search(/[.,]/);
  const solesText = separatorIndex === -1 ? trimmed : trimmed.slice(0, separatorIndex);
  // Un decimal '5' vale 50 céntimos: se completa con un cero a la derecha.
  const cents =
    separatorIndex === -1
      ? 0
      : Number.parseInt(trimmed.slice(separatorIndex + 1).padEnd(2, '0'), 10);
  const total = Number.parseInt(solesText, 10) * 100 + cents;
  // El contrato es "entero de céntimos o null": Infinity (desborde) no es un
  // entero; todo resultado finito ya es un entero válido.
  return Number.isFinite(total) ? total : null;
}
