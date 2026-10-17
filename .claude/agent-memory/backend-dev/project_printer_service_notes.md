---
name: printer-service-notes
description: Hechos no obvios de la spec 002 (PrinterService, driver file, hoja de prueba) verificados al implementarla el 2026-10-07
metadata:
  type: project
---

Verificado en T-11 a T-18 (spec 002, 2026-10-07) con Node 24.1.0, Zod 4.6.5, Windows 11. 490 pruebas en verde; services/printer con 100 % de líneas.

- Zod 4: `z.enum([...], { error }).refine((v): v is 'file' => v === 'file', { error })` da UN solo issue (el enum inválido aborta el refine) y estrecha el tipo. `z.string().trim().min(1).transform(abs).default(rutaAbsoluta)`: el default se devuelve tal cual (salida) y `' x '` llega como `'x'`.
- `Intl.Segmenter` grapheme: el caso más pesado de AC-17 (500 líneas x 2000 unidades sucias) tarda ~190 ms. Camino rápido: si tras NFC todos los caracteres son imprimibles (tabla Uint8Array de 256), se evita segmentar; es válido porque ningún imprimible es combinante.
- Fuzz de 30000 líneas aleatorias (BMP + astral + sustitutos sueltos) sobre normalizeDocumentLines: cero fallas de las 6 invariantes de AC-13.
- Regla ESLint de la 001 prohíbe `.sync(` por nombre exacto: `handle.datasync()` pasa. Temporal con `open(path, 'wx')` y `createdTemp` evita borrar el .tmp ajeno.
- Los nombres con `\uXXXX` en comentarios o código se evitan por completo en print-document.ts (códigos numéricos + `String.fromCharCode`); no hay regex literal con U+2028.
- Solo existe la herramienta Bash (Git Bash). Para probar PowerShell: escribir un `.ps1` en el scratchpad y llamar `powershell.exe -NoProfile -ExecutionPolicy Bypass -File`; el `-Command` inline con `$` y backticks rompe el parseo de bash.
- `pnpm typecheck` de backend falla en cascada mientras falten módulos que importan las pruebas; con `grep "error TS" | grep -v "Cannot find module"` se ven los errores propios de lo ya implementado.
- Observación sin arreglar (spec literal): un grafema como `'ñ' + ZWJ` pierde la tilde porque D-002-04 paso 4d quita las marcas M tras NFKD (sale `'n'`). No hay AC; muy raro.

**Why:** evita redescubrir el comportamiento de Zod 4/Segmenter y cómo verificar PowerShell sin herramienta propia.
**How to apply:** consultar al tocar services/printer (Fase 3: escpos, comanda) o loadConfig.
