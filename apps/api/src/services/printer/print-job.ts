/** Drivers disponibles. La Fase 3 suma 'escpos' (impresora térmica de red). */
export type PrinterDriverName = 'file';

/** Trabajo que el servicio entrega al driver: las líneas ya están normalizadas (RN-002-02). */
export interface PrintJob {
  jobId: string;
  label: string;
  lines: readonly string[];
}

/**
 * Comprobante del driver. `destination` es solo para el log del servidor y para el comando de la
 * hoja de prueba: nunca se envía a los clientes (celulares, caja).
 */
export interface PrintReceipt {
  jobId: string;
  destination: string;
}

export interface PrinterDriver {
  readonly name: PrinterDriverName;
  print(job: PrintJob): Promise<PrintReceipt>;
}

/**
 * AAAAMMDD-HHmmss-SSS-<label>-<8 hex>, con la hora de America/Lima. Se usa en el nombre del archivo,
 * por eso es estricto: nada de separadores de ruta, mayúsculas ni puntos.
 */
export const JOB_ID_PATTERN = /^\d{8}-\d{6}-\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{8}$/;

/** 8 + 1 + 6 + 1 + 3 + 1 + 32 (label) + 1 + 8 = 61 caracteres como máximo. */
export const JOB_ID_MAX_LENGTH = 61;
