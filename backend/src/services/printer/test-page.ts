import { toLimaDateTimeParts } from '@polleria/shared';
import { PRINTER_LINE_WIDTH } from './print-document.ts';
import type { PrintDocument } from './print-document.ts';
import type { PrinterDriverName } from './print-job.ts';

export const TEST_PAGE_LABEL = 'prueba';

export interface TestPageOptions {
  now: Date;
  driverName: PrinterDriverName;
}

/**
 * Hoja de prueba de `pnpm printer:test` (AC-29). Ya es imprimible: normalizarla no la cambia.
 * La fecha usa la hora de Lima (regla de dominio 8).
 */
export function buildTestPage({ now, driverName }: TestPageOptions): PrintDocument {
  const time = toLimaDateTimeParts(now);
  const ruler = '='.repeat(PRINTER_LINE_WIDTH);

  return {
    label: TEST_PAGE_LABEL,
    lines: [
      ruler,
      'HOJA DE PRUEBA - SISTEMA POLLERÍA',
      `Driver: ${driverName}`,
      `Fecha: ${time.day}/${time.month}/${time.year} ${time.hour}:${time.minute}:${time.second}`,
      `Ancho: ${String(PRINTER_LINE_WIDTH)} columnas`,
      // Regla de columnas: 1234567890 repetido hasta llenar el ancho.
      '1234567890'.repeat(Math.ceil(PRINTER_LINE_WIDTH / 10)).slice(0, PRINTER_LINE_WIDTH),
      'Tildes: áéíóúüñ ÁÉÍÓÚÜÑ ¿¡ °ºª',
      'Si lees esto, la impresión funciona.',
      ruler,
    ],
  };
}
