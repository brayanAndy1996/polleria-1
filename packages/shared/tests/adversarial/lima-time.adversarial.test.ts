/**
 * Ataques a toLimaDateTimeParts (adversarial-tester, spec 002, AC-01 y D-002-10).
 *
 * La hora de Lima forma el jobId (y en fases siguientes, la comanda, la caja y los reportes). Lima
 * usa UTC-5 sin horario de verano desde el 1 de abril de 1994: aquí se compara la función con esa
 * cuenta hecha a mano, con la zona horaria del proceso cambiada a zonas con horario de verano,
 * desfases de media hora o de +14 horas.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toLimaDateTimeParts } from '@polleria/shared';
import type { LimaDateTimeParts } from '@polleria/shared';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const LIMA_OFFSET_MS = -5 * HOUR_MS;

/** Partes esperadas en Lima calculadas a mano: UTC menos 5 horas. */
function expectedLimaParts(utcMs: number): LimaDateTimeParts {
  const shifted = new Date(utcMs + LIMA_OFFSET_MS);
  const pad = (value: number, length: number): string => String(value).padStart(length, '0');
  return {
    year: pad(shifted.getUTCFullYear(), 4),
    month: pad(shifted.getUTCMonth() + 1, 2),
    day: pad(shifted.getUTCDate(), 2),
    hour: pad(shifted.getUTCHours(), 2),
    minute: pad(shifted.getUTCMinutes(), 2),
    second: pad(shifted.getUTCSeconds(), 2),
    millisecond: pad(shifted.getUTCMilliseconds(), 3),
  };
}

/** mulberry32 de semilla fija (sin dependencias). */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Primeras diferencias entre la función y la cuenta a mano (máximo 3), para un mensaje legible. */
function mismatches(instants: readonly number[]): string[] {
  const found: string[] = [];
  for (const utcMs of instants) {
    const actual = toLimaDateTimeParts(new Date(utcMs));
    const expected = expectedLimaParts(utcMs);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      found.push(
        `${new Date(utcMs).toISOString()}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`,
      );
      if (found.length >= 3) {
        break;
      }
    }
  }
  return found;
}

describe('002 adversarial: hora de Lima', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ADV-002-05 (Bajo): Intl en 'en-US' da el año de la era, no el año ISO: el año 0 (1 a. C.) sale
  // '0001', igual que el año 1, y el -1 sale '0002', igual que el 2. Dos instantes separados por un
  // año dan las mismas partes, así que los textos (y los jobId) dejan de ordenar en el tiempo. No se
  // alcanza con el reloj real, pero la función es compartida y la reutilizarán la caja y los
  // reportes (fechas que puede escribir una persona). Se espera RangeError o años distintos (por
  // ejemplo '0000', como Date.prototype.toISOString).
  // Deuda aceptada por el usuario el 2026-10-08 (ver docs/PROGRESS.md). Corregir en la Fase 3 y volver a it(...).
  it.fails.each([
    ['0000-06-01T12:00:00.000Z', '0001-06-01T12:00:00.000Z'],
    ['-000001-06-01T12:00:00.000Z', '0002-06-01T12:00:00.000Z'],
    ['-000100-06-01T12:00:00.000Z', '0101-06-01T12:00:00.000Z'],
  ])('ADV-002-05: %s no se confunde con %s', (beforeChrist, anno) => {
    const early = new Date(beforeChrist);
    const late = new Date(anno);
    expect(Number.isNaN(early.getTime())).toBe(false);

    let earlyYear: string;
    try {
      earlyYear = toLimaDateTimeParts(early).year;
    } catch (error) {
      expect(error).toBeInstanceOf(RangeError);
      return;
    }

    expect(earlyYear, 'el año antes de Cristo sale igual que uno después').not.toBe(
      toLimaDateTimeParts(late).year,
    );
  });

  // ADV-002-16 (regresión en verde): cada hora de 2026, cada medianoche de Lima de 2026 (el último
  // milisegundo del día y el primero del siguiente) y 2000 instantes al azar entre 1994 y 9999 dan
  // exactamente UTC-5, con la zona horaria del proceso en seis zonas distintas. Comprueba que Lima no
  // tiene horario de verano y que la zona del equipo no influye.
  it.each([
    'UTC',
    'America/New_York',
    'Australia/Lord_Howe',
    'Asia/Kathmandu',
    'Pacific/Kiritimati',
    'America/Lima',
  ])('ADV-002-16: con TZ=%s la hora de Lima es siempre UTC-5', (timeZone) => {
    vi.stubEnv('TZ', timeZone);
    const start2026 = Date.UTC(2026, 0, 1);
    const instants: number[] = [];
    for (let hour = 0; hour < 365 * 24; hour += 1) {
      instants.push(start2026 + hour * HOUR_MS + 59 * 60_000 + 59_999);
    }
    for (let day = 0; day < 366; day += 1) {
      const limaMidnight = start2026 + day * DAY_MS + 5 * HOUR_MS;
      instants.push(limaMidnight - 1, limaMidnight);
    }
    const random = seededRandom(0x0002_0016);
    const from = Date.UTC(1994, 3, 2);
    const to = Date.UTC(9999, 11, 31, 23, 59, 59, 999);
    for (let index = 0; index < 2000; index += 1) {
      instants.push(from + Math.floor(random() * (to - from)));
    }

    expect(mismatches(instants)).toEqual([]);
  });

  it('ADV-002-16: cada 6 horas desde abril de 1994 hasta 2100 la hora de Lima es UTC-5', () => {
    vi.stubEnv('TZ', 'America/New_York');
    const instants: number[] = [];
    for (let utcMs = Date.UTC(1994, 3, 2); utcMs < Date.UTC(2100, 0, 1); utcMs += 6 * HOUR_MS) {
      instants.push(utcMs);
    }

    expect(mismatches(instants)).toEqual([]);
  });
});
