import { describe, expect, it, vi } from 'vitest';
import { toLimaDateTimeParts } from '@polleria/shared';

interface LimaParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
  millisecond: string;
}

/** Tabla de AC-01: fecha en UTC y las partes que le corresponden en America/Lima (UTC-5). */
const CASES: readonly (readonly [string, LimaParts])[] = [
  [
    '2026-10-07T20:30:12.123Z',
    {
      year: '2026',
      month: '10',
      day: '07',
      hour: '15',
      minute: '30',
      second: '12',
      millisecond: '123',
    },
  ],
  [
    '2026-10-08T04:59:59.999Z',
    {
      year: '2026',
      month: '10',
      day: '07',
      hour: '23',
      minute: '59',
      second: '59',
      millisecond: '999',
    },
  ],
  [
    '2026-10-08T05:00:00.000Z',
    {
      year: '2026',
      month: '10',
      day: '08',
      hour: '00',
      minute: '00',
      second: '00',
      millisecond: '000',
    },
  ],
  [
    '2026-01-01T04:59:59.999Z',
    {
      year: '2025',
      month: '12',
      day: '31',
      hour: '23',
      minute: '59',
      second: '59',
      millisecond: '999',
    },
  ],
  [
    '2026-03-05T07:08:09.005Z',
    {
      year: '2026',
      month: '03',
      day: '05',
      hour: '02',
      minute: '08',
      second: '09',
      millisecond: '005',
    },
  ],
];

describe('002: toLimaDateTimeParts (packages/shared)', () => {
  it.each(CASES)('AC-01: %s en UTC corresponde a las partes de America/Lima', (utc, expected) => {
    expect(toLimaDateTimeParts(new Date(utc))).toStrictEqual(expected);
  });

  it('AC-01: el resultado es el mismo con process.env.TZ en Asia/Tokyo', () => {
    try {
      // vi.stubEnv cambia process.env.TZ (el paquete no declara los tipos de Node) y unstubAllEnvs la restaura.
      vi.stubEnv('TZ', 'Asia/Tokyo');

      // Comprobación del propio entorno: en Tokio (UTC+9) las 20:30 UTC son las 05:30 del día
      // siguiente. Si esto falla, la prueba no cambió la zona horaria y no demostraría nada.
      expect(new Date('2026-10-07T20:30:12.123Z').getHours()).toBe(5);

      for (const [utc, expected] of CASES) {
        expect(toLimaDateTimeParts(new Date(utc))).toStrictEqual(expected);
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('AC-01: con una fecha inválida lanza RangeError', () => {
    expect(() => toLimaDateTimeParts(new Date(Number.NaN))).toThrow(RangeError);
  });
});
