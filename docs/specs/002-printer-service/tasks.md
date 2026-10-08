# Tareas — Spec 002: servicio de impresión (PrinterService) con driver de archivo

- Spec: docs/specs/002-printer-service/spec.md (Borrador)
- Rama: feat/002-printer-service
- Contrato OpenAPI: sin cambios (no hay endpoints).
- Dependencias nuevas: ninguna.

## Orden y por qué

1. **Pruebas en rojo (T-01 a T-10)**: test-writer escribe las pruebas de los 31 AC y actualiza dos pruebas de la 001 (AC-04 y AC-07, sección 12 de la spec). No hace falta andamiaje: el monorepo, Vitest y los helpers de procesos ya existen desde la 001.
2. **Implementación (T-11 a T-17)**: backend-dev implementa hasta dejar todo en verde, sin tocar pruebas.
3. **Cierre (T-18)**: verificación de la definición de terminado y de los requisitos R-002-01 a R-002-06.

No hay tareas de frontend-dev: esta funcionalidad no tiene pantallas ni endpoints.

## Pruebas en rojo (test-writer)

Reglas comunes:
- Cada archivo de prueba de esta spec envuelve sus pruebas en un `describe` cuyo nombre empieza con `002:` (por ejemplo `describe('002: file driver', ...)`), porque la spec 001 también usa AC-01 a AC-46. El nombre de cada prueba empieza con el ID del AC: `it('AC-21: escribe un archivo UTF-8 por trabajo', ...)`.
- Importar desde las rutas de la sección 11 de la spec. Que fallen por módulo inexistente es un rojo válido.
- Las pruebas que escriben archivos crean su propia carpeta con `fs.mkdtemp(path.join(os.tmpdir(), 'polleria-printer-'))` y la borran en afterEach (`fs.rm` con `recursive` y `force`). Ninguna prueba escribe en tmp/comandas del proyecto (R-002-05).
- Las pruebas que arrancan procesos arman el entorno con `buildChildEnv` (copia de process.env) y fijan siempre PRINTER_DRIVER y PRINTER_FILE_DIR (con una carpeta temporal o undefined), para no depender del entorno de quien las corre.
- Ningún texto de prueba con caracteres invisibles se escribe literal en el código: usar escapes (`'\u200B'`, `'\u{1F44D}'`), como en la spec.
- Commits con prefijo test, por ejemplo `test(002): pruebas del driver file`.

### T-01. Pruebas de la hora de Lima
- Responsable: test-writer
- Dependencias: ninguna
- AC: AC-01
- Descripción: packages/shared/src/lima-time.test.ts. Importa `toLimaDateTimeParts` desde '@polleria/shared' (o desde ./lima-time.ts). Casos de la tabla de AC-01, el cambio temporal de `process.env.TZ` a 'Asia/Tokyo' (restaurarlo en finally) y la fecha inválida (RangeError).

### T-02. Pruebas de configuración de impresión y ajuste de las pruebas de la 001
- Responsable: test-writer
- Dependencias: ninguna
- AC: AC-02, AC-03, AC-04, AC-05 (y AC-04 y AC-07 de la 001)
- Descripción:
  - Archivo nuevo apps/api/src/config/printer-env.test.ts con AC-02 a AC-05. Para AC-02, simular `process.cwd()` con `vi.spyOn(process, 'cwd')` y restaurarlo. Para AC-05, leer apps/api/.env.example con `util.parseEnv` y `path.resolve(import.meta.dirname, ...)`.
  - apps/api/src/config/env.test.ts (001, AC-04): en las dos pruebas con toStrictEqual, agregar `printer: { driver: 'file', fileDir: DEFAULT_PRINTER_FILE_DIR }` al objeto esperado (importar DEFAULT_PRINTER_FILE_DIR de ./env.ts). No cambiar nombres ni el resto de aserciones.
  - apps/api/src/config/env-example.test.ts (001, AC-07): la lista fija pasa a las 7 variables de AC-05 de la spec 002. No cambiar nada más.

### T-03. Pruebas de normalización: líneas imprimibles, cortes y saltos
- Responsable: test-writer
- Dependencias: ninguna
- AC: AC-07, AC-08, AC-09
- Descripción: apps/api/src/services/printer/print-document.test.ts. Casos exactos de las tablas de AC-07 a AC-09, incluida la entrada congelada con Object.freeze y la comprobación de que la entrada no cambia.

### T-04. Pruebas de normalización: caracteres especiales e invariantes
- Responsable: test-writer
- Dependencias: T-03 (mismo archivo)
- AC: AC-10, AC-11, AC-12, AC-13
- Descripción: mismo archivo que T-03. Tablas de AC-10 a AC-12 (con `it.each`). Para AC-13, un generador pseudoaleatorio de semilla fija escrito en el propio archivo o en un helper de pruebas (por ejemplo mulberry32), sin dependencias nuevas, con al menos 1000 líneas que mezclen las familias de caracteres listadas en el AC; comprobar las seis invariantes para cada entrada.

### T-05. Pruebas del servicio con un driver falso
- Responsable: test-writer
- Dependencias: ninguna
- AC: AC-14, AC-15, AC-16, AC-17, AC-18
- Descripción: apps/api/src/services/printer/printer.service.test.ts. Driver falso que guarda los trabajos y devuelve `{ jobId: job.jobId, destination: 'falso' }`. Reloj y aleatorio inyectados donde el AC los fija; en AC-15, sin inyectar. Tabla de documentos inválidos de AC-16 con `it.each` (el getter que lanza se arma con `Object.defineProperty`). En AC-17, medir con `performance.now()` que el documento más grande termina en menos de 2 s.

### T-06. Pruebas de errores del driver y de PrinterError
- Responsable: test-writer
- Dependencias: T-05 (driver falso)
- AC: AC-19, AC-20
- Descripción: AC-19 en printer.service.test.ts (drivers falsos que rechazan o lanzan de forma síncrona); AC-20 en apps/api/src/services/printer/printer-error.test.ts.

### T-07. Pruebas del driver file: archivo, carpeta, simultaneidad y nombres peligrosos
- Responsable: test-writer
- Dependencias: ninguna
- AC: AC-21, AC-22, AC-23, AC-27
- Descripción: apps/api/src/services/printer/file-driver.test.ts con disco real en carpetas temporales. AC-21 compara los bytes del archivo con `Buffer.from(..., 'utf8')`. AC-27 comprueba que la carpeta temporal queda vacía (no se crea 'interna') y que la creación con ruta relativa o vacía lanza de inmediato.

### T-08. Pruebas del driver file: atomicidad, reintentos y fallas reales
- Responsable: test-writer
- Dependencias: T-07 (mismo archivo)
- AC: AC-24, AC-25, AC-26
- Descripción: mismo archivo. `rename` espiado que llama al `rename` real de node:fs/promises cuando corresponde; errores simulados con `Object.assign(new Error('...'), { code: 'EPERM' })`. AC-25 compara contra `FILE_DRIVER_RENAME_RETRY_DELAYS_MS` y mide menos de 2 s. AC-26 usa un archivo existente como carpeta y una carpeta llamada como el .txt de destino.

### T-09. Pruebas de la fábrica y de la hoja de prueba
- Responsable: test-writer
- Dependencias: ninguna
- AC: AC-28, AC-29
- Descripción: AC-28 en apps/api/src/services/printer/index.test.ts, importando desde ./index.ts (así la puerta pública también cuenta en la cobertura) y loadConfig desde ../../config/env.ts. AC-29 en apps/api/src/services/printer/test-page.test.ts.

### T-10. Pruebas de procesos: API con escpos y comando de hoja de prueba
- Responsable: test-writer
- Dependencias: ninguna
- AC: AC-06, AC-30, AC-31
- Descripción:
  - En apps/api/tests/helpers/child-process.ts, agregar la ruta de apps/api/src/print-test-page.ts y una función para ejecutarlo y esperar su salida (como `runCli`).
  - Archivo nuevo apps/api/tests/printer-process.test.ts: AC-06 con `startServer` y `UNREACHABLE_DATABASE_URL`; AC-30 y AC-31 con el comando nuevo. Tiempo límite de 10 s por proceso.
  - Para AC-31 con traza: comprobar que ninguna línea de stderr cumple `/^\s+at /m`.

### Verificación del rojo (al terminar T-01 a T-10)
- `pnpm test` falla solo por módulos inexistentes o por comportamiento ausente: printer-env.test.ts y las dos pruebas ajustadas de la 001 fallan porque loadConfig todavía no devuelve printer y CONFIG_VARIABLES tiene 5 variables; las demás pruebas de la 001 siguen en verde.
- `pnpm typecheck` y `pnpm lint` pueden fallar solo en cascada por los módulos que aún no existen (ver la memoria del test-writer sobre validar el rojo con una copia desechable).

## Implementación (backend-dev)

Reglas comunes:
- No crear, modificar ni borrar archivos de prueba (`*.test.ts`, apps/api/tests/, e2e/). Si una prueba parece contradecir la spec, detenerse y reportarlo.
- Sintaxis borrable (D-02 de la 001), imports relativos con .ts, mensajes exactos de la spec.
- Sin dependencias nuevas (R-002-04). Solo node:fs/promises, node:path, node:crypto, Intl y zod.
- Usar `FileHandle.datasync()`, nunca un método llamado `sync` (la regla de ESLint R-06 de la 001 lo prohíbe en apps/api/src).
- Commits con prefijo feat, por ejemplo `feat(002): driver file con escritura atómica`, sin archivos de prueba. Antes de cada commit: `pnpm --filter @polleria/api run typecheck` y `pnpm lint`.

### T-11. Hora de Lima en packages/shared
- Responsable: backend-dev
- Dependencias: T-01
- AC: AC-01
- Descripción: packages/shared/src/lima-time.ts con `toLimaDateTimeParts` y `LimaDateTimeParts`, exportados en packages/shared/src/index.ts. `Intl.DateTimeFormat` con `timeZone: TIME_ZONE`, `hourCycle: 'h23'` y `fractionalSecondDigits: 3` (D-002-10); nada de desfase fijo ni de métodos locales de Date.

### T-12. Configuración de impresión
- Responsable: backend-dev
- Dependencias: T-02 (y T-10 para verificar AC-06)
- AC: AC-02, AC-03, AC-04, AC-05, AC-06 (y AC-04 y AC-07 de la 001)
- Descripción:
  - apps/api/src/config/env.ts: PROJECT_ROOT_DIR (desde `import.meta.dirname`), DEFAULT_PRINTER_FILE_DIR, PrinterConfig, AppConfig.printer, CONFIG_VARIABLES con 7 variables y las reglas y mensajes de D-002-09. Los issues de impresión se juntan con los demás en un solo ConfigError.
  - apps/api/.env.example: agregar `PRINTER_DRIVER=file` y `PRINTER_FILE_DIR=tmp/comandas`, con un comentario en español (qué hace el driver file, que escpos llegará con la impresora térmica y que una ruta relativa se toma desde la raíz del proyecto).
  - server.ts y db/cli.ts no cambian: ya muestran el mensaje de ConfigError y terminan con código 1 (AC-06).

### T-13. PrinterError y normalización de documentos
- Responsable: backend-dev
- Dependencias: T-03, T-04, T-06
- AC: AC-07, AC-08, AC-09, AC-10, AC-11, AC-12, AC-13, AC-20
- Descripción: apps/api/src/services/printer/printer-error.ts y print-document.ts según D-002-03, D-002-04, D-002-07 y la sección 11 (constantes, PRINTABLE_CHARACTERS, printDocumentSchema estricto con z.strictObject, normalizeDocumentLines). Seguir el orden de pasos de D-002-04 al pie de la letra.

### T-14. Trabajo de impresión y PrinterService
- Responsable: backend-dev
- Dependencias: T-05, T-06, T-11, T-13
- AC: AC-14, AC-15, AC-16, AC-17, AC-18, AC-19
- Descripción: apps/api/src/services/printer/print-job.ts (tipos, JOB_ID_PATTERN, JOB_ID_MAX_LENGTH) y printer.service.ts (createPrinterService). jobId con toLimaDateTimeParts de '@polleria/shared' y `randomBytes(4).toString('hex')`. `print` es async (nunca lanza de forma síncrona); cualquier excepción al validar es PRINTER_INVALID_DOCUMENT; las fallas del driver se tratan según D-002-07.

### T-15. Driver file
- Responsable: backend-dev
- Dependencias: T-07, T-08, T-13, T-14
- AC: AC-21, AC-22, AC-23, AC-24, AC-25, AC-26, AC-27
- Descripción: apps/api/src/services/printer/file-driver.ts según D-002-08: validación del jobId antes de tocar el disco, mkdir recursivo, temporal `<jobId>.tmp` abierto con 'wx', datasync, cierre, renombrado con reintentos (EPERM, EACCES, EBUSY; esperas de FILE_DRIVER_RENAME_RETRY_DELAYS_MS), limpieza del temporal propio y PRINTER_OUTPUT_FAILED con cause. Nunca copiar el mensaje de un error de Node (trae rutas) al PrinterError.

### T-16. Fábrica, hoja de prueba y puerta pública
- Responsable: backend-dev
- Dependencias: T-09, T-12, T-14, T-15
- AC: AC-28, AC-29
- Descripción: create-printer-driver.ts, test-page.ts (líneas exactas de AC-29, fecha con toLimaDateTimeParts en formato dd/MM/AAAA HH:mm:ss) e index.ts con los reexports de la sección 11 (sin createFilePrinterDriver).

### T-17. Comando pnpm printer:test
- Responsable: backend-dev
- Dependencias: T-10, T-12, T-16
- AC: AC-30, AC-31 (requisitos R-002-01 y R-002-02)
- Descripción:
  - apps/api/src/print-test-page.ts: loadConfig(process.env), createPrinterDriver, createPrinterService, print(buildTestPage({ now: new Date(), driverName })) y la salida exacta de la sección 10 de la spec. Usar `process.exitCode`, no `process.exit`. Importar solo desde ./config/env.ts y ./services/printer/index.ts (nada de db).
  - Scripts: en apps/api/package.json `"printer:test": "node --env-file-if-exists=.env --disable-warning=ExperimentalWarning src/print-test-page.ts"`; en el package.json raíz `"printer:test": "pnpm --filter @polleria/api run printer:test"`.
  - vitest.config.ts: agregar 'apps/api/src/print-test-page.ts' a coverage.exclude.

## Cierre

### T-18. Verificación final
- Responsable: backend-dev
- Dependencias: T-11 a T-17
- AC: todos (requisitos R-002-01 a R-002-06)
- Descripción:
  - `pnpm test`, `pnpm lint`, `pnpm typecheck` y `pnpm test:coverage` con código 0 (services de la API con 90 % o más).
  - R-002-03 (grep de imports), R-002-04 (`git diff main --stat -- pnpm-lock.yaml` vacío) y R-002-05 (tmp/comandas no cambia con `pnpm test`).
  - R-002-01 a mano: `pnpm printer:test` en PowerShell y en Git Bash con apps/api/.env; anotar en el reporte la ruta del archivo creado y borrarlo.

## Matriz AC, pruebas e implementación

| AC | Prueba (test-writer) | Implementación (backend-dev) |
| --- | --- | --- |
| AC-01 | T-01 | T-11 |
| AC-02 a AC-05 | T-02 | T-12 |
| AC-06 | T-10 | T-12 |
| AC-07 a AC-09 | T-03 | T-13 |
| AC-10 a AC-13 | T-04 | T-13 |
| AC-14 a AC-18 | T-05 | T-14 |
| AC-19 | T-06 | T-14 |
| AC-20 | T-06 | T-13 |
| AC-21 a AC-23, AC-27 | T-07 | T-15 |
| AC-24 a AC-26 | T-08 | T-15 |
| AC-28, AC-29 | T-09 | T-16 |
| AC-30, AC-31 | T-10 | T-17 |
| AC-04 y AC-07 de la 001 (ajustes) | T-02 | T-12 |
