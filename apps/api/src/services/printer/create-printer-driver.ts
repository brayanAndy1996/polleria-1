import type { PrinterConfig } from '../../config/env.ts';
import { createFilePrinterDriver } from './file-driver.ts';
import type { PrinterDriver } from './print-job.ts';

/**
 * Crea el driver que indica la configuración. Es el único lugar donde se crean los drivers: el resto
 * del sistema los pasa a createPrinterService y nunca los usa directamente (RN-002-01).
 * La Fase 3 agrega aquí el driver escpos.
 */
export function createPrinterDriver(config: PrinterConfig): PrinterDriver {
  return createFilePrinterDriver({ dir: config.fileDir });
}
