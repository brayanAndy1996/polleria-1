// Puerta pública del servicio de impresión (regla de dominio 7). El resto del sistema importa solo
// desde aquí. Los drivers se obtienen con createPrinterDriver; createFilePrinterDriver no se exporta.
export { createPrinterService } from './printer.service.ts';
export type { PrinterService, PrinterServiceDeps } from './printer.service.ts';
export { createPrinterDriver } from './create-printer-driver.ts';
export { buildTestPage, TEST_PAGE_LABEL } from './test-page.ts';
export { PrinterError, PRINTER_ERROR_CODES } from './printer-error.ts';
export type { PrinterErrorCode } from './printer-error.ts';
export { PRINTER_LINE_WIDTH } from './print-document.ts';
export type { PrintDocument } from './print-document.ts';
export type { PrintReceipt, PrinterDriver, PrinterDriverName } from './print-job.ts';
