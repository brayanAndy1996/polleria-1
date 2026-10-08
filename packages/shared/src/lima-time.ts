import { TIME_ZONE } from './time-zone.ts';

/** Partes de una fecha en America/Lima, como textos con ceros a la izquierda. */
export interface LimaDateTimeParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
  millisecond: string;
}

// hourCycle 'h23' evita que la medianoche salga como '24'. Se usa Intl con la zona de la regla 8 y
// no un desfase fijo de -5 horas, para que la regla viva en un solo lugar y no dependa de la zona
// horaria del equipo.
const limaFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  fractionalSecondDigits: 3,
});

function requirePart(parts: ReadonlyMap<string, string>, type: string): string {
  const value = parts.get(type);
  if (value === undefined) {
    throw new Error(`Intl.DateTimeFormat no devolvió la parte ${type}.`);
  }
  return value;
}

/**
 * Devuelve año, mes, día, hora, minuto, segundo y milisegundo de la fecha en America/Lima.
 * Lanza RangeError si la fecha es inválida.
 */
export function toLimaDateTimeParts(date: Date): LimaDateTimeParts {
  const parts = new Map<string, string>();
  for (const part of limaFormatter.formatToParts(date)) {
    parts.set(part.type, part.value);
  }

  return {
    year: requirePart(parts, 'year').padStart(4, '0'),
    month: requirePart(parts, 'month'),
    day: requirePart(parts, 'day'),
    hour: requirePart(parts, 'hour'),
    minute: requirePart(parts, 'minute'),
    second: requirePart(parts, 'second'),
    millisecond: requirePart(parts, 'fractionalSecond'),
  };
}
