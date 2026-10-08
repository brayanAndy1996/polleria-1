---
name: decisiones-impresion
description: Decisiones de la spec 002 (PrinterService, driver file, PRINTER_DRIVER/PRINTER_FILE_DIR, caracteres imprimibles, jobId, PrinterError) que la Fase 3 (comandas, escpos) debe respetar o enmendar explícitamente
metadata:
  type: project
---

Spec 002 (docs/specs/002-printer-service/spec.md, Borrador 2026-10-07, commit 3c98408). Revisar la spec si cambió de estado.

- Código en apps/api/src/services/printer/; el resto del sistema importa solo index.ts (R-002-03). CLI de hoja de prueba: apps/api/src/print-test-page.ts (fuera de services por el umbral de 90 %), script `pnpm printer:test`. Sin endpoint HTTP de impresión (no hay auth hasta Fase 1).
- Documento genérico `{ label, lines }`; label `^[a-z0-9]+(?:-[a-z0-9]+)*$` máx. 32. jobId `AAAAMMDD-HHmmss-SSS-<label>-<8 hex>` en hora de Lima (máx. 61). Receipt `{ jobId, destination }` (destination nunca a clientes).
- Normalización (D-002-04): saltos (CRLF, LF, CR, NEL, LS, PS) separan líneas; NFC; grafemas con Intl.Segmenter; imprimibles = ASCII 0x20-0x7E + áéíóúüñÁÉÍÓÚÜÑ¿¡°ºª (PC850/WPC1252, no PC437); tab/Zs -> espacio; tabla de comillas y rayas; NFKD sin M/Cc/Cf o '?'; quitar espacios finales; corte duro a 48. Límites 500 líneas y 2000 por línea de entrada; vacío = error.
- PrinterError extends Error (no AppError): PRINTER_INVALID_DOCUMENT, PRINTER_EMPTY_DOCUMENT, PRINTER_OUTPUT_FAILED; mensaje fijo, original en cause.
- Driver file: temp `<jobId>.tmp` con 'wx' + datasync + rename con reintentos EPERM/EACCES/EBUSY [20,40,80,160]. Se usa datasync porque la regla ESLint de la 001 prohíbe cualquier llamada `.sync(` en apps/api/src.
- Config: PRINTER_DRIVER (solo 'file'; 'escpos' se rechaza al arrancar con mensaje propio, S-002-01) y PRINTER_FILE_DIR (relativa a PROJECT_ROOT_DIR, default tmp/comandas). AppConfig.printer. Cambió AC-04 y AC-07 de la 001 (tests ajustados por test-writer).
- toLimaDateTimeParts en packages/shared (Intl, hourCycle h23).

**Why:** la Fase 3 construye comandas, escpos, printer:error y reimpresión sobre esta interfaz; la sección 18 de la spec lista lo pendiente.
**How to apply:** al especificar comandas o escpos, extender PrinterDriverName/PrinterConfig, quitar el rechazo de escpos (AC-04) y dar a E2E un PRINTER_FILE_DIR temporal. Ver [[decisiones-modelado]].
