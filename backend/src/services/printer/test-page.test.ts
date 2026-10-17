import { describe, expect, it } from 'vitest';
import { expectedTestPageLines } from '../../../tests/helpers/printer-files.ts';
import { normalizeDocumentLines } from './print-document.ts';
import { TEST_PAGE_LABEL, buildTestPage } from './test-page.ts';

describe('002: hoja de prueba (backend/src/services/printer/test-page.ts)', () => {
  it('AC-29: buildTestPage devuelve el documento con las 9 líneas exactas, con la hora de Lima', () => {
    const page = buildTestPage({ now: new Date('2026-10-07T20:30:12.000Z'), driverName: 'file' });

    expect(page).toStrictEqual({
      label: 'prueba',
      lines: [
        '='.repeat(48),
        'HOJA DE PRUEBA - SISTEMA POLLERÍA',
        'Driver: file',
        'Fecha: 07/10/2026 15:30:12',
        'Ancho: 48 columnas',
        '123456789012345678901234567890123456789012345678',
        'Tildes: áéíóúüñ ÁÉÍÓÚÜÑ ¿¡ °ºª',
        'Si lees esto, la impresión funciona.',
        '='.repeat(48),
      ],
    });
    expect(page.lines).toEqual(expectedTestPageLines());
  });

  it('AC-29: la regla de números mide exactamente 48 columnas', () => {
    const page = buildTestPage({ now: new Date('2026-10-07T20:30:12.000Z'), driverName: 'file' });

    expect(page.lines[5]).toHaveLength(48);
    expect(page.lines[0]).toHaveLength(48);
    expect(page.lines[8]).toHaveLength(48);
  });

  it('AC-29: normalizeDocumentLines devuelve las mismas líneas (la hoja ya es imprimible)', () => {
    const page = buildTestPage({ now: new Date('2026-10-07T20:30:12.000Z'), driverName: 'file' });

    expect(normalizeDocumentLines(page.lines)).toEqual(page.lines);
  });

  it('AC-29: TEST_PAGE_LABEL es prueba', () => {
    expect(TEST_PAGE_LABEL).toBe('prueba');
  });

  it.each([
    ['2026-10-08T04:59:59.000Z', 'Fecha: 07/10/2026 23:59:59'],
    ['2026-10-08T05:00:00.000Z', 'Fecha: 08/10/2026 00:00:00'],
    ['2026-03-05T07:08:09.000Z', 'Fecha: 05/03/2026 02:08:09'],
  ])(
    'AC-29: con now en %s la cuarta línea es "%s" (dd/MM/AAAA HH:mm:ss, hora de Lima)',
    (utc, dateLine) => {
      const page = buildTestPage({ now: new Date(utc), driverName: 'file' });

      expect(page.lines[3]).toBe(dateLine);
      expect(page.lines).toEqual(expectedTestPageLines(dateLine));
    },
  );
});
