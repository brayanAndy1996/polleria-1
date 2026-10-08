---
name: project-adversarial-findings-002
description: Hallazgos adversariales de la spec 002 (PrinterService, driver file) al 2026-10-08; 2 medios, 3 bajos, ninguno crítico/alto
metadata:
  type: project
---

Ataque a la 002 (servicio de impresión) el 2026-10-08, commit 0c62834 en feat/002-printer-service. Tests en apps/api/tests/adversarial/printer-*.adversarial.test.ts y packages/shared/tests/adversarial/lima-time.adversarial.test.ts. Abiertos al cerrar el ataque:

- ADV-002-01 (Medio): NFC reordena marcas combinantes en tiempo cuadrático. 500 líneas de `'x' + '̈́'×1000 + '̣'×999` (documento válido) tardan ~2,07 s la primera vez y ~6 s al repetir (AC-17 pide < 2 s; D-002-06 decía ~100 ms). Ver [[project-attack-techniques]].
- ADV-002-02 (Medio): createPrinterDriver (exportado por index.ts) devuelve un driver cuyo print escribe ESC/GS/NUL y líneas > 48 si se llama sin el servicio. El driver valida el jobId pero no las líneas.
- ADV-002-03 (Bajo): printDocumentSchema (zod 4) recorre todos los elementos antes de aplicar .max(500); con arreglos dispersos enormes crea un issue por hueco.
- ADV-002-04 (Bajo, Windows): PRINTER_FILE_DIR='Q:comandas' (relativa a otra unidad) se resuelve con process.cwd(); 'C:' da la raíz del monorepo.
- ADV-002-05 (Bajo): toLimaDateTimeParts usa el año de la era de Intl en-US: año 0 → '0001', -1 → '0002'.

Sin fallas (regresión en verde): barrido de los 1,1 M de puntos de código (ninguno sale fuera de los 114 imprimibles), fuzz con semilla, ESC/POS hasta el disco, TOCTOU, drivers tramposos, jobId con trucos de Windows/unicode, 1000-2000 impresiones simultáneas, fallas en writeFile/datasync/close, rutas > 260, printer:test con secretos, Lima = UTC-5 desde 1994-04 con TZ exóticas.

**Why:** registro para el orquestador/reviewer y para reatacar en la Fase 3 (comandas y driver escpos).
**How to apply:** verifica contra el código antes de asumir que siguen abiertos. En la Fase 3 reataca ADV-002-02 (driver escpos) y ADV-002-01 (límite de largo de observaciones).
