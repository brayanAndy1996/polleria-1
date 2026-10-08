import { ConfigError, loadConfig } from './config/env.ts';
import {
  PrinterError,
  buildTestPage,
  createPrinterDriver,
  createPrinterService,
} from './services/printer/index.ts';

/**
 * Comando `pnpm printer:test` (D-002-11): imprime una hoja de prueba con el driver configurado y
 * devuelve el código de salida. Solo lee process.env: el archivo .env lo carga
 * `node --env-file-if-exists` desde el script de package.json. No abre ninguna conexión a la base.
 * Nunca muestra trazas, la URL de la base ni su clave.
 */
async function main(): Promise<number> {
  try {
    const config = loadConfig(process.env);
    const driver = createPrinterDriver(config.printer);
    const printer = createPrinterService({ driver });

    const receipt = await printer.print(
      buildTestPage({ now: new Date(), driverName: driver.name }),
    );

    console.log(`Hoja de prueba enviada con el driver ${driver.name}.`);
    console.log(`Destino: ${receipt.destination}`);
    return 0;
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
    } else if (error instanceof PrinterError) {
      // El mensaje de PrinterError es fijo: no trae rutas ni detalles del sistema.
      console.error(error.message);
      console.error('Revisa PRINTER_DRIVER y PRINTER_FILE_DIR en apps/api/.env.');
    } else {
      console.error('No se pudo imprimir la hoja de prueba.');
    }
    return 1;
  }
}

process.exitCode = await main();
