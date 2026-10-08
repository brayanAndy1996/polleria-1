# Spec 002 — Servicio de impresión (PrinterService) con driver de archivo

- Estado: Borrador
- Fase: 0 (Base del proyecto)
- Rama: feat/002-printer-service
- Fecha: 2026-10-07
- Cubre: regla de dominio 7 de CLAUDE.md ("La impresión siempre pasa por PrinterService. Drivers: file y escpos"), con el driver file. Aporta a RNF-05 (todo local, sin red) y a RNF-12 (el driver y la carpeta se configuran en apps/api/.env). Es la base de RF-08 a RF-11 y de RNF-03 (comandas, Fase 3), pero no los cumple todavía.
- Documentos relacionados: tasks.md (esta carpeta), docs/specs/001-base-monorepo/spec.md (convenciones D-01 a D-14, loadConfig, formato de error). docs/api/openapi.yaml no cambia (no hay endpoints). Sin ADR nuevo (no hay dependencias nuevas; ver 13).

## 1. Contexto

En la Fase 3 cada pedido se imprimirá como comanda en la impresora térmica de cocina (80 mm, 48 columnas). Antes hace falta una pieza única por donde pase toda impresión: recibe un documento de texto, lo limpia para que la impresora lo pueda imprimir (tildes, ñ, emojis, líneas largas, caracteres de control) y lo entrega al driver configurado. En esta fase el único driver es file, que guarda cada documento como un archivo .txt: así se prueban las comandas sin impresora y sin papel. El dueño puede comprobar la configuración con una hoja de prueba (`pnpm printer:test`).

## 2. Historias de usuario

| ID | Historia |
| --- | --- |
| HU-002-01 | Como cocinero, quiero que cada papel salga completo y legible en la impresora de 80 mm aunque el mozo escriba tildes, ñ, emojis o textos largos, para no recibir papeles cortados ni con símbolos raros. |
| HU-002-02 | Como administrador (dueño), quiero imprimir una hoja de prueba con un comando, para comprobar que la impresión está bien configurada antes de abrir el local. |
| HU-002-03 | Como administrador, quiero elegir el tipo de impresión y la carpeta de los archivos en apps/api/.env, sin tocar el código, para pasar a la impresora térmica cuando llegue. |
| HU-002-04 | Como equipo de desarrollo, quiero que toda impresión pase por un PrinterService con un driver de archivo y errores tipados, para construir y probar las comandas de la Fase 3 sin impresora. |

## 3. Decisiones técnicas

Las que no confirmó el usuario están marcadas como SUPUESTO y repetidas en Preguntas abiertas (sección 16).

**D-002-01. Ubicación y capas.**
- Todo el código de impresión vive en apps/api/src/services/printer/. Es un service: no tiene rutas, controllers ni modelos.
- El resto del sistema solo importa desde apps/api/src/services/printer/index.ts (la "puerta" pública). Los drivers no se usan directamente: se obtienen con `createPrinterDriver(config.printer)` y se pasan a `createPrinterService`. Así se cumple "la impresión siempre pasa por PrinterService" (regla 7; R-002-03).
- El comando de la hoja de prueba es un punto de entrada aparte, apps/api/src/print-test-page.ts, como server.ts y db/cli.ts (fuera de services para no afectar el umbral de cobertura de services; R-002-02).
- En esta fase server.ts no crea el PrinterService: nadie imprime todavía desde la API. Solo valida la configuración de impresión al arrancar (por loadConfig). La Fase 3 lo inyectará donde haga falta.

**D-002-02. Documento, trabajo y comprobante.**
- Lo que recibe el servicio es un documento genérico: `PrintDocument = { label, lines }`. No es una comanda: el formato de la comanda (número, mesa, mozo, hora, ítems) es de la Fase 3.
  - `label`: etiqueta corta del tipo de documento (por ejemplo 'prueba'; en la Fase 3, 'comanda'). Solo minúsculas sin tilde, dígitos y guiones simples: `^[a-z0-9]+(?:-[a-z0-9]+)*$`, de 1 a 32 caracteres. Se usa en el nombre del archivo, por eso es estricta.
  - `lines`: lista de líneas de texto, tal como las arma quien imprime.
- El servicio valida y normaliza el documento (D-002-04), le asigna un `jobId` y entrega al driver un trabajo `PrintJob = { jobId, label, lines }` con las líneas ya normalizadas.
- `jobId` = `AAAAMMDD-HHmmss-SSS-<label>-<8 hex>`: fecha y hora con milisegundos en America/Lima (regla 8), la etiqueta y 8 caracteres hexadecimales en minúscula de crypto (4 bytes aleatorios). Ejemplo: `20261007-153012-123-prueba-a1b2c3d4`. Lima no tiene horario de verano, así que el orden alfabético de los jobId es el orden en el tiempo. Cumple `JOB_ID_PATTERN` y mide como máximo 61 caracteres.
- El driver devuelve un comprobante `PrintReceipt = { jobId, destination }`. En el driver file, destination es la ruta absoluta del archivo. destination es solo para el log del servidor y para el comando de la hoja de prueba; nunca se envía a los clientes (celulares, caja).
- Reimprimir (Fase 3) es volver a llamar a print con el mismo documento: sale otro trabajo con otro jobId.

**D-002-03. Caracteres imprimibles (SUPUESTO S-002-03).**
- Una impresora térmica en modo texto imprime con una tabla de caracteres de un byte (code page). `PRINTABLE_CHARACTERS` son los 114 caracteres que el servicio deja pasar:
  - los 95 caracteres ASCII imprimibles, de U+0020 (espacio) a U+007E (`~`), en ese orden;
  - seguidos de estos 19, en este orden: á é í ó ú ü ñ Á É Í Ó Ú Ü Ñ ¿ ¡ ° º ª (U+00E1, U+00E9, U+00ED, U+00F3, U+00FA, U+00FC, U+00F1, U+00C1, U+00C9, U+00CD, U+00D3, U+00DA, U+00DC, U+00D1, U+00BF, U+00A1, U+00B0, U+00BA, U+00AA).
- Todos existen en las tablas PC850 y WPC1252, que traen casi todas las impresoras ESC/POS de 80 mm. La Fase 3 elige una de las dos (PC437 no sirve: no tiene Á, Í, Ó ni Ú).
- No incluye €, ½, ¼ ni ·: no hacen falta para una pollería en Perú (montos en S/). Ampliar el conjunto es un cambio de spec.
- Cada carácter del conjunto ocupa exactamente una columna. Por eso, después de normalizar, el largo de una línea en JavaScript (`line.length`) es su ancho en columnas.

**D-002-04. Normalización de las líneas.**
`normalizeDocumentLines(lines)` es una función pura que nunca lanza error. Cada línea de entrada produce una o más líneas de salida, en orden. Para cada línea de entrada:
1. Se parte en los saltos de línea: CRLF (cuenta como uno solo), LF (U+000A), CR (U+000D), NEL (U+0085), U+2028 y U+2029. Cada trozo se procesa como una línea aparte. Un salto al final deja una línea vacía al final (`'a\n'` da `['a', '']`).
2. Se normaliza a NFC (una tilde escrita como letra más acento combinante se une: `'n\u0303'` pasa a `'ñ'`).
3. Se separa en grafemas (lo que una persona ve como un carácter) con `Intl.Segmenter` de granularidad 'grapheme'. Un emoji compuesto (familia, tono de piel, bandera) es un solo grafema.
4. Cada grafema se convierte así, en este orden:
   - a. Si es uno de PRINTABLE_CHARACTERS, queda igual.
   - b. Si es una tabulación (U+0009) o un espacio de Unicode (categoría Zs, por ejemplo U+00A0 o U+3000), pasa a un espacio normal.
   - c. Si está en la tabla de sustitución tipográfica, pasa a su reemplazo:

     | Reemplazo | Caracteres |
     | --- | --- |
     | `'` (U+0027) | U+2018, U+2019, U+201A, U+201B, U+2032 |
     | `"` (U+0022) | U+201C, U+201D, U+201E, U+201F, U+2033, U+00AB, U+00BB |
     | `-` (U+002D) | U+2010, U+2011, U+2012, U+2013, U+2014, U+2015, U+2212 |

   - d. Si no, se descompone en NFKD y se le quitan las marcas combinantes (categoría M), los caracteres de control (Cc) y los de formato (Cf). Si no queda nada, el grafema se elimina. Si todo lo que queda está en PRINTABLE_CHARACTERS, se usa eso (`'à'` pasa a `'a'`, `'…'` a `'...'`, `'ﬁ'` a `'fi'`). Si no, el grafema pasa a un solo `'?'`.
5. Se quitan los espacios (U+0020) del final. Los del inicio se conservan (sangría).
6. Si queda con más de 48 columnas, se corta en trozos de exactamente 48, sin buscar espacios (corte duro); el último trozo lleva el resto. Ningún carácter se pierde ni se agrega en el corte.

Consecuencias que se piden en los AC: ningún carácter de control llega al driver, así que lo que escriba un usuario no puede volverse un comando ESC/POS (por ejemplo ESC @ o la apertura del cajón). Los caracteres que la impresora no tiene se ven como `'?'` en vez de desaparecer, para que la cocina note que había algo. La función es idempotente.

**D-002-05. Corte duro en 48 columnas (SUPUESTO S-002-02).**
- El servicio corta las líneas largas sin buscar espacios: es una red de seguridad simple, predecible y que nunca pierde texto.
- La presentación cuidada (cortar por palabras, sangrías de las observaciones, alinear precios) la hará el formateador de la comanda en la Fase 3, antes de llamar a print. Si ese formateador ya entrega líneas de 48 columnas o menos, el corte duro nunca actúa.

**D-002-06. Límites del documento (SUPUESTO S-002-05).**
- Entrada: como máximo 500 líneas (`PRINTER_MAX_LINES`) y cada línea con como máximo 2000 unidades de texto de JavaScript (`PRINTER_MAX_INPUT_LINE_LENGTH`, medido con `.length`). Así el trabajo de normalizar tiene un tope (alrededor de 100 ms en la PC de desarrollo para el caso más grande).
- Salida: como máximo 500 líneas ya normalizadas (unos 2 m de papel). Una comanda típica tiene menos de 60.
- Vacío: un documento es vacío si, ya normalizado, ninguna línea tiene contenido (todas quedaron como `''`). Imprimir una hoja en blanco desperdicia papel y delata un error del que llama. Las líneas en blanco dentro de un documento con contenido se conservan, también al inicio y al final.

**D-002-07. Errores tipados.**
- `PrinterError extends Error`, con `name = 'PrinterError'` y `code`. El mensaje es fijo por código, en español, y nunca incluye rutas, valores recibidos ni detalles del sistema (RN-002-04). El error original, si existe, va en `cause` (no enumerable, se pasa con las opciones estándar de Error) y es solo para el log del servidor.

  | code | message | Cuándo |
  | --- | --- | --- |
  | PRINTER_INVALID_DOCUMENT | El documento a imprimir no es válido. | El documento no cumple el esquema o los límites (D-002-06), o el driver recibe un jobId que no cumple JOB_ID_PATTERN. |
  | PRINTER_EMPTY_DOCUMENT | El documento a imprimir está vacío. | Ya normalizado, no tiene ninguna línea con contenido. |
  | PRINTER_OUTPUT_FAILED | No se pudo imprimir. Revisa la impresora e intenta de nuevo. | El driver no pudo entregar el trabajo (disco, permisos, carpeta inválida; en la Fase 3, impresora apagada o sin papel). |

- PrinterError no extiende AppError: en esta fase ningún endpoint imprime. Si uno llegara al errorHandler de la 001, responde 500 INTERNAL_ERROR genérico, sin filtrar nada. La Fase 3 decide cómo se informa al mozo y a caja (printer:error) y si algún endpoint lo traduce a un código HTTP.
- El servicio deja pasar sin cambios un PrinterError que lance el driver. Cualquier otra falla del driver (un Error, un valor que no es Error o una excepción síncrona) la convierte en PRINTER_OUTPUT_FAILED con el original en cause. `print` nunca lanza de forma síncrona: siempre devuelve una promesa.
- El servicio no escribe en el log. Quien llama decide qué registrar (Fase 3: "se registra, se emite printer:error y se permite reimprimir").

**D-002-08. Driver file.**
- `createFilePrinterDriver({ dir })` exige una ruta absoluta; si no lo es, lanza de inmediato `Error('La carpeta de impresión debe ser una ruta absoluta.')` (es un error de programación: loadConfig siempre entrega una ruta absoluta).
- Por cada trabajo:
  1. Valida que el jobId cumpla JOB_ID_PATTERN y mida como máximo 61 caracteres. Si no, rechaza con PRINTER_INVALID_DOCUMENT sin tocar el disco (ni siquiera crea la carpeta). Esto impide rutas como `../x` aunque alguien use el driver sin el servicio.
  2. Crea la carpeta si no existe (`mkdir` con `recursive: true`) en cada trabajo, así se recupera si alguien la borra con la API en marcha.
  3. Escribe el contenido completo en un archivo temporal `<jobId>.tmp` dentro de la misma carpeta: lo abre con la bandera 'wx' (falla si ya existe), escribe, fuerza los datos al disco con `FileHandle.datasync()` y lo cierra. Se usa datasync y no `sync()` porque la regla de ESLint de la 001 (R-06) prohíbe llamar a cualquier método `sync` en apps/api/src.
  4. Renombra `<jobId>.tmp` a `<jobId>.txt`. El renombrado dentro de la misma carpeta es atómico: el .txt aparece completo o no aparece (RN-002-05).
  5. En Windows el renombrado puede fallar un instante si el antivirus o el indexador tienen abierto el temporal. Si falla con EPERM, EACCES o EBUSY, reintenta hasta 4 veces más, esperando 20, 40, 80 y 160 ms (`FILE_DRIVER_RENAME_RETRY_DELAYS_MS`). Con cualquier otro código no reintenta.
  6. Si algo falla en los pasos 2 a 5: cierra el archivo si quedó abierto, borra el temporal solo si lo creó este trabajo y rechaza con PRINTER_OUTPUT_FAILED (con el error original en cause).
- Contenido del archivo: cada línea seguida de LF (`\n`), también la última; UTF-8 sin BOM; sin encabezado ni metadatos. El archivo es exactamente lo que saldría en el papel. El Bloc de notas de Windows 10 y 11 lo abre bien.
- `createFilePrinterDriver` acepta un parámetro opcional `rename` (por defecto `fs/promises` rename) solo para que las pruebas simulen fallas del renombrado (AC-24 y AC-25).
- Solo usa módulos nativos de Node 24: node:fs/promises y node:path. No usa la red.

**D-002-09. Configuración (RNF-12; SUPUESTOS S-002-01, S-002-06 y S-002-07).**
- Dos variables nuevas, validadas en loadConfig y agregadas a CONFIG_VARIABLES y a apps/api/.env.example:

  | Variable | Por defecto | Regla |
  | --- | --- | --- |
  | PRINTER_DRIVER | file | 'file' se acepta. 'escpos' se rechaza con un mensaje propio: todavía no existe (S-002-01). Cualquier otro valor, incluido 'FILE' o vacío, se rechaza. |
  | PRINTER_FILE_DIR | tmp/comandas (en la raíz del monorepo) | Ruta de la carpeta del driver file. Una ruta relativa se toma desde la raíz del monorepo, nunca desde la carpeta en que se ejecuta el comando. Vacía o solo con espacios se rechaza. No se revisa que exista: el driver la crea. |

- `AppConfig` suma `printer: { driver: 'file'; fileDir: string }`. fileDir es siempre absoluta y normalizada (sin separador final).
- `PROJECT_ROOT_DIR` es la ruta absoluta de la raíz del monorepo, calculada desde la ubicación de env.ts (`import.meta.dirname`), nunca con `process.cwd()`: los scripts de pnpm corren con la carpeta apps/api como directorio actual. `DEFAULT_PRINTER_FILE_DIR` = `path.join(PROJECT_ROOT_DIR, 'tmp', 'comandas')`. tmp/ ya está en .gitignore y en .prettierignore.
- Por qué escpos falla al arrancar y no al imprimir (S-002-01): un driver que acepta la configuración y falla en cada impresión se descubriría recién con el primer pedido del día. Falla al arrancar con el mismo formato de ConfigError de la 001 (AC-08 de la 001), igual que cualquier otra variable inválida.
- El driver file se acepta con cualquier NODE_ENV, también production (S-002-06): sirve para la demostración al dueño sin impresora.
- Como la API, la CLI de base de datos y la hoja de prueba usan el mismo loadConfig, una variable de impresión inválida también detiene `pnpm db:migrate` con el mensaje de configuración inválida (S-002-07).
- Los mensajes de los issues son fijos y no incluyen el valor recibido (RN-001-01).
- El apps/api/.env que ya tiene el usuario no necesita cambios: sin estas variables se usan los valores por defecto.

**D-002-10. Hora de Lima compartida.**
- `toLimaDateTimeParts(date)` en packages/shared devuelve año, mes, día, hora, minuto, segundo y milisegundo en America/Lima (TIME_ZONE), como textos con ceros a la izquierda. Usa `Intl.DateTimeFormat` con `timeZone: TIME_ZONE` y `hourCycle: 'h23'` (sin `h23`, la medianoche puede salir como '24'), no un desfase fijo de -5 horas: así la regla 8 queda en un solo lugar. No depende de la zona horaria del equipo. Con una fecha inválida lanza RangeError.
- La usan el jobId y la hoja de prueba; la reutilizarán la comanda (hora), la caja y los reportes. Es una función pura sin APIs de Node ni del DOM (D-03 de la 001).

**D-002-11. Comando de hoja de prueba, sin endpoint HTTP.**
- `pnpm printer:test` imprime una hoja de prueba con el driver configurado. No hay endpoint HTTP que imprima: la autenticación llega en la Fase 1 y un endpoint público permitiría a cualquiera en el wifi gastar papel.
- Usa loadConfig(process.env) (por eso necesita una configuración válida, incluida DATABASE_URL), pero no abre ninguna conexión a la base.
- Salida exacta en la sección 10. Código de salida 0 si imprimió y 1 si no. Usa `process.exitCode` (no `process.exit`) para no cortar la salida.
- Compatible con Windows (R-15 de la 001): sin variables en línea ni comandos de Unix.

## 4. Criterios de aceptación

Cada AC tiene al menos una prueba cuyo nombre empieza con su ID. Como la spec 001 también usa AC-01 a AC-46, cada archivo de prueba de esta spec envuelve sus pruebas en un `describe` cuyo nombre empieza con `002:` (por ejemplo `describe('002: normalizeDocumentLines', ...)`), y las pruebas de esta spec van en archivos nuevos (las pruebas de la 001 que cambian se listan en la sección 12). Se indica el nivel y una ubicación sugerida; la ubicación exacta la decide el test-writer.

En los ejemplos, los textos están en notación de JavaScript: `'\u00A0'` es un solo carácter, `'\u{1F44D}'` es un emoji y `'x'.repeat(48)` son 48 letras x.

Todas las pruebas que escriben archivos usan su propia carpeta temporal (`fs.mkdtemp(path.join(os.tmpdir(), 'polleria-printer-'))`) y la borran al terminar. Ninguna prueba escribe en tmp/comandas del proyecto (R-002-05).

### 4.1 Hora de Lima (packages/shared)

**AC-01. Partes de fecha y hora en America/Lima** (unitaria, packages/shared)
- Dado `toLimaDateTimeParts` exportado por '@polleria/shared',
- cuando recibe cada fecha de la tabla, entonces devuelve exactamente ese objeto (todas las partes son textos):

  | Fecha (UTC) | year | month | day | hour | minute | second | millisecond |
  | --- | --- | --- | --- | --- | --- | --- | --- |
  | 2026-10-07T20:30:12.123Z | '2026' | '10' | '07' | '15' | '30' | '12' | '123' |
  | 2026-10-08T04:59:59.999Z | '2026' | '10' | '07' | '23' | '59' | '59' | '999' |
  | 2026-10-08T05:00:00.000Z | '2026' | '10' | '08' | '00' | '00' | '00' | '000' |
  | 2026-01-01T04:59:59.999Z | '2025' | '12' | '31' | '23' | '59' | '59' | '999' |
  | 2026-03-05T07:08:09.005Z | '2026' | '03' | '05' | '02' | '08' | '09' | '005' |

- y el resultado es el mismo con `process.env.TZ` cambiado a 'Asia/Tokyo' durante la prueba (la prueba lo restaura al final);
- y con `new Date(Number.NaN)` lanza RangeError.

### 4.2 Configuración (apps/api/src/config/env.ts)

**AC-02. Valores por defecto de impresión** (unitaria, apps/api)
- Dado `loadConfig({ DATABASE_URL: 'postgres://polleria:clave@localhost:5432/polleria_dev' })`,
- entonces devuelve exactamente (toStrictEqual) `{ nodeEnv: 'development', host: '127.0.0.1', port: 4000, databaseUrl: <la misma URL>, databaseUrlTest: undefined, printer: { driver: 'file', fileDir: DEFAULT_PRINTER_FILE_DIR } }`;
- y `PROJECT_ROOT_DIR` es una ruta absoluta, igual a `path.resolve(<carpeta del archivo de prueba>, '../../../..')` si la prueba está en apps/api/src/config/, y en ella existe pnpm-workspace.yaml;
- y `DEFAULT_PRINTER_FILE_DIR` es `path.join(PROJECT_ROOT_DIR, 'tmp', 'comandas')`;
- y con `process.cwd()` simulado para que devuelva otra carpeta absoluta (por ejemplo `os.tmpdir()`, con `vi.spyOn`), loadConfig sigue devolviendo `fileDir` igual a DEFAULT_PRINTER_FILE_DIR sin PRINTER_FILE_DIR, e igual a `path.join(PROJECT_ROOT_DIR, 'tmp', 'otra')` con `PRINTER_FILE_DIR='tmp/otra'`.

**AC-03. PRINTER_FILE_DIR relativa, absoluta o vacía** (unitaria, apps/api)
- Dado loadConfig con una DATABASE_URL válida y:
  - `PRINTER_FILE_DIR='tmp/otra'` o `'tmp/otra/'`: fileDir es `path.resolve(PROJECT_ROOT_DIR, 'tmp/otra')`;
  - `PRINTER_FILE_DIR='../comandas-fuera'`: fileDir es `path.resolve(PROJECT_ROOT_DIR, '../comandas-fuera')` (se permite salir del proyecto);
  - `PRINTER_FILE_DIR` igual a una ruta absoluta que no existe (por ejemplo `path.join(os.tmpdir(), 'polleria-no-existe-' + algo único)`): fileDir es `path.resolve(valor)` y loadConfig no la crea;
- entonces no lanza y devuelve esos valores;
- y con `PRINTER_FILE_DIR=''` o `'   '` lanza ConfigError con el issue `{ variable: 'PRINTER_FILE_DIR', message: 'no puede estar vacía.' }`.

**AC-04. PRINTER_DRIVER: file, escpos y valores inválidos** (unitaria, apps/api)
- Dado loadConfig con una DATABASE_URL válida,
- cuando `PRINTER_DRIVER='file'`, entonces `printer.driver` es 'file';
- cuando `PRINTER_DRIVER='escpos'`, entonces lanza ConfigError con el issue `{ variable: 'PRINTER_DRIVER', message: 'escpos todavía no está disponible en esta versión; usa file.' }`;
- cuando `PRINTER_DRIVER` es 'laser', 'FILE', 'File', ' file' o '', entonces lanza ConfigError con el issue `{ variable: 'PRINTER_DRIVER', message: 'debe ser file o escpos.' }`, y ni message ni issues contienen 'laser';
- y dado un entorno sin DATABASE_URL, con `PORT='abc'`, `PRINTER_DRIVER='laser'` y `PRINTER_FILE_DIR=''`, issues contiene a la vez los de DATABASE_URL, PORT, PRINTER_DRIVER y PRINTER_FILE_DIR, y message tiene una línea `- VARIABLE: mensaje` por cada uno (formato de AC-05 de la 001).

**AC-05. .env.example documenta la impresión** (unitaria, apps/api)
- Dado apps/api/.env.example leído con `util.parseEnv`,
- entonces `[...CONFIG_VARIABLES].sort()` es `['DATABASE_URL', 'DATABASE_URL_TEST', 'HOST', 'NODE_ENV', 'PORT', 'PRINTER_DRIVER', 'PRINTER_FILE_DIR']` y las variables del archivo son exactamente esas;
- y el archivo trae `PRINTER_DRIVER=file` y `PRINTER_FILE_DIR=tmp/comandas`;
- y `loadConfig(variablesDelArchivo).printer` es `{ driver: 'file', fileDir: DEFAULT_PRINTER_FILE_DIR }`.

**AC-06. La API no arranca con PRINTER_DRIVER=escpos** (integración con proceso real, apps/api)
- Dado el proceso `node --disable-warning=ExperimentalWarning apps/api/src/server.ts` con un entorno válido (DATABASE_URL inalcanzable de polleria_test, NODE_ENV=test, HOST=127.0.0.1, PORT libre) más `PRINTER_DRIVER=escpos`,
- cuando arranca,
- entonces termina solo en menos de 10 s con código 1, stderr contiene 'Configuración inválida.' y '- PRINTER_DRIVER: escpos todavía no está disponible en esta versión; usa file.', y stdout no contiene 'API escuchando'.

### 4.3 Normalización de líneas (apps/api/src/services/printer/print-document.ts)

**AC-07. Las líneas imprimibles no cambian** (unitaria)
- Dado `normalizeDocumentLines` y la lista `['Hola', '1/4 pollo pierna + chicha', '  - sin ensalada', '', 'Pollería: Ñandú, ¿Qué? ¡Sí! 25° Nº 1ª', 'x'.repeat(48), PRINTABLE_CHARACTERS.slice(0, 48), PRINTABLE_CHARACTERS.slice(48, 96), PRINTABLE_CHARACTERS.slice(96)]`,
- cuando se normaliza (también si la lista está congelada con Object.freeze),
- entonces devuelve una lista nueva igual a la de entrada y no modifica la entrada;
- y `PRINTER_LINE_WIDTH` es 48, y `PRINTABLE_CHARACTERS` tiene 114 caracteres: de U+0020 a U+007E en orden, seguidos de 'áéíóúüñÁÉÍÓÚÜÑ¿¡°ºª' (D-002-03).

**AC-08. Las líneas de más de 48 columnas se cortan en trozos de 48** (unitaria)
- Dado normalizeDocumentLines,
- entonces cada caso devuelve lo indicado:

  | Entrada (una línea) | Salida |
  | --- | --- |
  | `'x'.repeat(49)` | `['x'.repeat(48), 'x']` |
  | `'x'.repeat(96)` | `['x'.repeat(48), 'x'.repeat(48)]` |
  | `'x'.repeat(100)` | `['x'.repeat(48), 'x'.repeat(48), 'xxxx']` |
  | `'a'.repeat(40) + ' ' + 'b'.repeat(20)` | `['a'.repeat(40) + ' ' + 'b'.repeat(7), 'b'.repeat(13)]` (corte duro, sin buscar espacios) |
  | `'x'.repeat(48) + '   '` | `['x'.repeat(48)]` (los espacios finales se quitan antes de cortar) |
  | `'   x'` | `['   x']` (la sangría se conserva) |
  | `'    '` | `['']` |

- y en todos los casos, unir los trozos da la línea de entrada sin sus espacios finales.

**AC-09. Saltos de línea dentro de una línea** (unitaria)
- Dado normalizeDocumentLines,
- cuando una línea es `'a\nb'`, `'a\r\nb'`, `'a\rb'`, `'a\u2028b'`, `'a\u2029b'` o `'a\u0085b'`, entonces devuelve `['a', 'b']`;
- `'a\n\nb'`, `'a\r\n\r\nb'` y `'a\n\rb'` devuelven `['a', '', 'b']`;
- `'a\n'` devuelve `['a', '']` y `'\n\n'` devuelve `['', '', '']`;
- `['x'.repeat(50) + '\n' + 'y']` devuelve `['x'.repeat(48), 'xx', 'y']` (cada trozo se corta por separado);
- y `['uno\ndos', 'tres']` devuelve `['uno', 'dos', 'tres']`.

**AC-10. Tildes, letras de otros idiomas y signos tipográficos** (unitaria)
- Dado normalizeDocumentLines, cada línea de la tabla devuelve una sola línea con el resultado indicado:

  | Entrada | Resultado | Por qué |
  | --- | --- | --- |
  | `'n\u0303'` | `'ñ'` | NFC une letra y acento |
  | `'cafe\u0301'` | `'café'` | NFC |
  | `'N\u0303ANDU\u0301'` | `'ÑANDÚ'` | NFC |
  | `'à ç ö Å ÿ'` | `'a c o A y'` | se quita el acento que la impresora no tiene |
  | `'\u2026'` (…) | `'...'` | NFKD |
  | `'\u201Chola\u201D \u2018x\u2019 \u2013 \u2014 \u00ABy\u00BB'` | `'"hola" \'x\' - - "y"'` | tabla de sustitución |
  | `'\uFB01'` (ﬁ) | `'fi'` | NFKD |
  | `'\u2103'` (℃) | `'°C'` | NFKD |
  | `'\u2116 5'` (№ 5) | `'No 5'` | NFKD |
  | `'m\u00B2'` (m²) | `'m2'` | NFKD |
  | `'\uFF21'` (A de ancho completo) | `'A'` | NFKD |
  | `'\u00BD'` (½) | `'?'` | NFKD da '1⁄2' y '⁄' no es imprimible |
  | `'\u00D8'` (Ø), `'\u00DF'` (ß), `'\u20AC'` (€), `'\u00B7'` (·) | `'?'` cada uno | no tienen equivalente imprimible |

**AC-11. Emojis y caracteres que la impresora no tiene** (unitaria)
- Dado normalizeDocumentLines, cada línea de la tabla devuelve una sola línea con el resultado indicado:

  | Entrada | Descripción | Resultado |
  | --- | --- | --- |
  | `'\u{1F44D}'` | pulgar arriba | `'?'` |
  | `'\u{1F44D}\u{1F3FD}'` | pulgar con tono de piel | `'?'` (un solo signo) |
  | `'\u{1F468}\u200D\u{1F469}\u200D\u{1F467}'` | familia unida con ZWJ | `'?'` |
  | `'\u{1F1F5}\u{1F1EA}'` | bandera de Perú | `'?'` |
  | `'\u2764\uFE0F'` | corazón con selector de variante | `'?'` |
  | `'1\uFE0F\u20E3'` | tecla 1 | `'1'` |
  | `'pollo \u{1F357} x2'` | pierna de pollo en medio de un texto | `'pollo ? x2'` |
  | `'\u6F22\u5B57'` | dos caracteres chinos | `'??'` |
  | `'\uD800'` | sustituto suelto | `'?'` |
  | `'a\uDC00b'` | sustituto suelto en medio | `'a?b'` |

- y `'\u{1F600}'.repeat(60)` devuelve `['?'.repeat(48), '?'.repeat(12)]` (cada `'?'` ocupa una columna).

**AC-12. Caracteres de control y espacios especiales** (unitaria)
- Dado normalizeDocumentLines, cada línea de la tabla devuelve una sola línea con el resultado indicado:

  | Entrada | Resultado | Por qué |
  | --- | --- | --- |
  | `'a\tb'` | `'a b'` | la tabulación pasa a un espacio |
  | `'\t- sin ají'` | `' - sin ají'` | la sangría se conserva |
  | `'a\u00A0b'`, `'a\u2003b'`, `'a\u3000b'` | `'a b'` | espacios de Unicode |
  | `'A\u001B@B\u001Dv0C\u0007\u0000D\u007F\u009BE'` | `'A@Bv0CDE'` | se eliminan ESC, GS, BEL, NUL, DEL y controles C1: no llega ningún comando ESC/POS |
  | `'a\u200Bb\uFEFFc\u202Ed\u00ADe'` | `'abcde'` | se eliminan los caracteres de formato invisibles |
  | `'a\u200Db'` | `'ab'` | ZWJ suelto |
  | `'a\u000Bb\u000Cc'` | `'abc'` | VT y FF se eliminan (no son saltos de línea) |
  | `'\u0301x'` | `'x'` | acento combinante sin letra |
  | `'\u0000\u001B'` | `''` | solo controles |

**AC-13. Invariantes de la normalización** (unitaria)
- Dado normalizeDocumentLines y como entrada cada línea de AC-07 a AC-12 más al menos 1000 líneas generadas con un generador pseudoaleatorio de semilla fija (sin dependencias nuevas; por ejemplo mulberry32), de 0 a 300 unidades de largo, que mezclen: ASCII, tildes en NFC y NFD, controles U+0000–U+001F y U+007F–U+009F, saltos de AC-09, espacios U+00A0, U+2000–U+200A y U+3000, formatos U+200B–U+200F, U+202A–U+202E, U+2060–U+2064 y U+FEFF, emojis con tono de piel y ZWJ, indicadores regionales, caracteres chinos y sustitutos sueltos,
- entonces para cada entrada: la función no lanza; devuelve al menos una línea; cada línea de salida mide 48 o menos; cada carácter de salida está en PRINTABLE_CHARACTERS; ninguna línea termina en espacio; y normalizar la salida otra vez devuelve exactamente la misma lista (idempotencia).
- (El adversarial-tester puede ampliar esto con fast-check, librería ya aprobada en CLAUDE.md.)

### 4.4 Servicio (apps/api/src/services/printer/printer.service.ts)

En estas pruebas el driver es falso: guarda los trabajos que recibe y devuelve `{ jobId: job.jobId, destination: 'falso' }`, salvo que el caso diga otra cosa.

**AC-14. El servicio entrega al driver un trabajo normalizado** (unitaria)
- Dado `createPrinterService({ driver, now: () => new Date('2026-10-07T20:30:12.123Z'), randomId: () => 'a1b2c3d4' })`,
- cuando se llama `print({ label: 'prueba', lines: ['Hola', 'x'.repeat(50), 'pollo \u{1F357}'] })`,
- entonces el driver recibe una sola vez exactamente `{ jobId: '20261007-153012-123-prueba-a1b2c3d4', label: 'prueba', lines: ['Hola', 'x'.repeat(48), 'xx', 'pollo ?'] }`;
- y print se resuelve con el mismo objeto que devolvió el driver;
- y con `now` en 2026-10-08T04:59:59.999Z el jobId es '20261007-235959-999-prueba-a1b2c3d4', y con 2026-10-08T05:00:00.000Z es '20261008-000000-000-prueba-a1b2c3d4' (hora de Lima);
- y el jobId cumple `JOB_ID_PATTERN`.

**AC-15. Identificadores únicos y ordenables** (unitaria)
- Dado createPrinterService solo con el driver falso (reloj y aleatorio reales),
- cuando se lanzan 200 `print` válidos a la vez,
- entonces los 200 jobId son distintos, todos cumplen JOB_ID_PATTERN y terminan en 8 caracteres hexadecimales en minúscula;
- y dado un `now` que devuelve, en llamadas sucesivas, 2026-10-07T23:59:59.999Z, 2026-10-08T00:00:00.000Z y 2026-10-08T05:00:00.000Z, y un `randomId` que devuelve 'ffffffff', '00000000' y '12345678', los tres jobId ordenados alfabéticamente quedan en ese mismo orden de tiempo.

**AC-16. Documento inválido** (unitaria)
- Dado el servicio con el driver falso,
- cuando se llama print con cualquiera de estos documentos,

  | Caso | Documento |
  | --- | --- |
  | No es un objeto | `null`, `undefined`, `'hola'`, `42`, `[]` |
  | Sin label | `{ lines: ['x'] }` |
  | label inválido | `''`, `'Prueba'`, `'prueba 1'`, `'prueba_1'`, `'../x'`, `'..\\x'`, `'a/b'`, `'-a'`, `'a-'`, `'a--b'`, `'ñandu'`, `'a'.repeat(33)`, `1` |
  | Sin lines o lines que no es lista | `{ label: 'prueba' }`, `{ label: 'prueba', lines: 'hola' }` |
  | Elementos que no son texto | `[1]`, `[null]`, `[undefined]`, una lista con hueco (`new Array(2)` con solo la posición 1 en 'x') |
  | Demasiadas líneas o línea muy larga | 501 líneas `'x'`; una línea de `'x'.repeat(2001)` |
  | Propiedad de más | `{ label: 'prueba', lines: ['x'], copies: 2 }` |
  | Lectura que falla | un objeto cuyo getter de `lines` lanza un Error |

- entonces la promesa se rechaza con un PrinterError de code 'PRINTER_INVALID_DOCUMENT' y message 'El documento a imprimir no es válido.', y el driver no recibe nada;
- y `print(null)` no lanza de forma síncrona: devuelve una promesa;
- y sí se aceptan los límites: label `'a'.repeat(32)`, `'pre-cuenta-2'` y `'prueba'`; 500 líneas `'x'`; una línea de `'x'.repeat(2000)` (el driver recibe 42 líneas).

**AC-17. Documento demasiado largo** (unitaria)
- Dado el servicio con el driver falso,
- cuando lines es `['a\n'.repeat(501)]` (una línea de entrada que da 502 líneas) o 500 líneas `'x'.repeat(96)` (1000 líneas),
- entonces se rechaza con PRINTER_INVALID_DOCUMENT y el driver no recibe nada;
- y con `['a\n'.repeat(499) + 'a']` (exactamente 500 líneas) se resuelve y el driver recibe 500 líneas;
- y con 500 líneas de 2000 unidades cada una que mezclen texto, tildes en NFD, controles y emojis con ZWJ, print termina (se resuelva o se rechace) en menos de 2 s.

**AC-18. Documento vacío** (unitaria)
- Dado el servicio con el driver falso,
- cuando lines es `[]`, `['']`, `['', '   ', '\t']`, `['\u0000\u001B']`, `['\n\n']` o `['\u200B']`,
- entonces se rechaza con un PrinterError de code 'PRINTER_EMPTY_DOCUMENT' y message 'El documento a imprimir está vacío.', y el driver no recibe nada;
- y con `['', 'x', '']` el driver recibe `['', 'x', '']` (las líneas en blanco se conservan);
- y con `['\u{1F44D}']` el driver recibe `['?']` (no es vacío).

**AC-19. Fallas del driver** (unitaria)
- Dado el servicio con un driver falso que falla,
- cuando el driver rechaza con `new PrinterError('PRINTER_OUTPUT_FAILED')` o con `new PrinterError('PRINTER_INVALID_DOCUMENT')`, entonces print se rechaza con esa misma instancia;
- cuando el driver rechaza con `new Error('EACCES: permission denied, open C:\\secreto\\comandas\\x.tmp')`, con el valor `'falla'`, con `undefined`, o lanza de forma síncrona dentro de `print` sin devolver promesa,
- entonces print se rechaza con un PrinterError de code 'PRINTER_OUTPUT_FAILED', message 'No se pudo imprimir. Revisa la impresora e intenta de nuevo.' y cause igual al valor original;
- y en el caso del Error, ni `error.message`, ni `String(error)`, ni `JSON.stringify(error)` contienen 'secreto'.

**AC-20. PrinterError** (unitaria, printer-error.ts)
- Dado PrinterError y PRINTER_ERROR_CODES,
- entonces PRINTER_ERROR_CODES tiene exactamente las claves PRINTER_INVALID_DOCUMENT, PRINTER_EMPTY_DOCUMENT y PRINTER_OUTPUT_FAILED, cada una con un valor igual a su nombre;
- y `new PrinterError(code)` es instancia de Error y de PrinterError, con name 'PrinterError', ese code y el message de la tabla de D-002-07;
- y `new PrinterError('PRINTER_OUTPUT_FAILED', { cause })` tiene `error.cause === cause`, `Object.keys(error)` no incluye 'cause' y `JSON.stringify(error)` no contiene el mensaje de cause.

### 4.5 Driver file (apps/api/src/services/printer/file-driver.ts)

En estas pruebas `JOB` es `{ jobId: '20261007-153012-123-prueba-a1b2c3d4', label: 'prueba', lines: [...] }` y `dir` es la carpeta temporal de la prueba.

**AC-21. Un archivo UTF-8 por trabajo** (unitaria con disco real)
- Dado `createFilePrinterDriver({ dir })`, cuyo `name` es 'file',
- cuando imprime JOB con lines `['Hola', 'Pollería Ñandú ¿Qué? ¡Sí!', '', 'Fin']`,
- entonces se resuelve con `{ jobId: '20261007-153012-123-prueba-a1b2c3d4', destination: path.join(dir, '20261007-153012-123-prueba-a1b2c3d4.txt') }`;
- y la carpeta contiene solo ese archivo;
- y sus bytes son exactamente `Buffer.from('Hola\nPollería Ñandú ¿Qué? ¡Sí!\n\nFin\n', 'utf8')` (UTF-8 sin BOM, LF, cada línea termina en salto, sin CR).

**AC-22. Crea la carpeta si no existe** (unitaria con disco real)
- Dado `createFilePrinterDriver({ dir: path.join(dir, 'no', 'existe', 'comandas') })`,
- cuando imprime un trabajo, entonces crea las tres carpetas y escribe el archivo;
- y si después se borra esa carpeta y se imprime otro trabajo (otro jobId), la vuelve a crear y escribe el segundo archivo.

**AC-23. Trabajos simultáneos** (unitaria con disco real)
- Dado el driver,
- cuando se imprimen a la vez 50 trabajos con jobId distintos (mismo prefijo de hora y sufijos '00000000' a '00000031' en hexadecimal) y lines `['Trabajo N']`,
- entonces los 50 se resuelven, la carpeta tiene exactamente 50 archivos .txt y ningún .tmp, y cada archivo contiene exactamente `'Trabajo N\n'` con su número.

**AC-24. Escritura atómica** (unitaria con disco real y `rename` espiado)
- Dado el driver con un `rename` que, al ser llamado con (origen, destino), comprueba que el origen está en `dir`, termina en '.tmp' y ya tiene el contenido completo, y que el destino todavía no existe, y luego llama al rename real,
- cuando imprime JOB, entonces rename se llama una sola vez, esas comprobaciones se cumplen y el .txt final tiene el contenido completo;
- y dado un `rename` que rechaza con un error de code 'ENOSPC', print se rechaza con PRINTER_OUTPUT_FAILED y la carpeta queda sin .txt y sin .tmp.

**AC-25. Reintento del renombrado en Windows** (unitaria con disco real y `rename` espiado)
- Dado `FILE_DRIVER_RENAME_RETRY_DELAYS_MS`, que es `[20, 40, 80, 160]`,
- cuando rename falla con code 'EPERM' dos veces y luego llama al rename real, entonces print se resuelve, rename se llamó 3 veces y el .txt existe;
- cuando falla una vez con 'EACCES' y luego llama al real, entonces se resuelve con 2 llamadas;
- cuando falla siempre con 'EBUSY', entonces print se rechaza con PRINTER_OUTPUT_FAILED en menos de 2 s, rename se llamó 5 veces (1 + los 4 reintentos) y la carpeta queda sin .txt y sin .tmp;
- cuando falla con 'ENOSPC', entonces rename se llamó una sola vez.

**AC-26. Fallas reales del sistema de archivos** (unitaria con disco real)
- Dado un driver cuya `dir` es la ruta de un archivo que ya existe (`path.join(dir, 'soy-un-archivo')`),
- cuando imprime JOB, entonces se rechaza con PRINTER_OUTPUT_FAILED; ni message, ni `String(error)`, ni `JSON.stringify(error)` contienen la ruta de la carpeta temporal ni 'soy-un-archivo'; y el archivo sigue igual;
- y dado que en `dir` ya existe una carpeta llamada '20261007-153012-123-prueba-a1b2c3d4.txt', imprimir JOB se rechaza con PRINTER_OUTPUT_FAILED en menos de 2 s, esa carpeta sigue existiendo y no queda ningún .tmp.

**AC-27. Nombres peligrosos y carpeta relativa** (unitaria con disco real)
- Dado `createFilePrinterDriver({ dir: path.join(dir, 'interna') })`,
- cuando imprime un trabajo con cualquiera de estos jobId: `'../20261007-153012-123-prueba-a1b2c3d4'`, `'..\\x'`, `'a/b'`, `'C:\\x'`, `''`, `'con'`, `'20261007-153012-123-prueba-a1b2c3d4.txt'`, `'20261007-153012-123-Prueba-a1b2c3d4'`, `'20261007-153012-123-prueba-A1B2C3D4'`, `'20261007-153012-123-prueba-a1b2c3d'`, o uno que cumple el patrón pero mide 62 caracteres o más,
- entonces se rechaza con PRINTER_INVALID_DOCUMENT y la carpeta temporal de la prueba sigue vacía (ni siquiera se creó 'interna');
- y `createFilePrinterDriver({ dir: 'tmp/comandas' })` y `createFilePrinterDriver({ dir: '' })` lanzan de inmediato un Error con el mensaje 'La carpeta de impresión debe ser una ruta absoluta.'.

### 4.6 Fábrica, hoja de prueba y comando

**AC-28. createPrinterDriver usa la configuración** (unitaria con disco real; importa desde apps/api/src/services/printer/index.ts)
- Dado `createPrinterDriver(loadConfig({ DATABASE_URL: <válida>, PRINTER_FILE_DIR: dir }).printer)`,
- entonces el driver tiene name 'file';
- y `createPrinterService({ driver }).print({ label: 'prueba', lines: ['Hola', 'x'.repeat(50)] })` se resuelve con un destination dentro de `dir`, y `dir` contiene un solo .txt con el contenido `'Hola\n' + 'x'.repeat(48) + '\nxx\n'`.

**AC-29. Hoja de prueba** (unitaria, test-page.ts)
- Dado `buildTestPage({ now: new Date('2026-10-07T20:30:12.000Z'), driverName: 'file' })`,
- entonces devuelve exactamente `{ label: 'prueba', lines }` con estas 9 líneas:

  | N.° | Línea |
  | --- | --- |
  | 1 | `'='.repeat(48)` |
  | 2 | `'HOJA DE PRUEBA - SISTEMA POLLERÍA'` |
  | 3 | `'Driver: file'` |
  | 4 | `'Fecha: 07/10/2026 15:30:12'` (hora de Lima) |
  | 5 | `'Ancho: 48 columnas'` |
  | 6 | `'123456789012345678901234567890123456789012345678'` (regla de 48 columnas) |
  | 7 | `'Tildes: áéíóúüñ ÁÉÍÓÚÜÑ ¿¡ °ºª'` |
  | 8 | `'Si lees esto, la impresión funciona.'` |
  | 9 | `'='.repeat(48)` |

- y `normalizeDocumentLines(lines)` devuelve las mismas líneas (la hoja ya es imprimible);
- y `TEST_PAGE_LABEL` es 'prueba'.

**AC-30. pnpm printer:test imprime la hoja de prueba** (integración con proceso real, apps/api)
- Dado el proceso `node --disable-warning=ExperimentalWarning apps/api/src/print-test-page.ts` con un entorno copiado de process.env más NODE_ENV=test, DATABASE_URL = `postgres://polleria:Clave_Secreta_99@127.0.0.1:1/polleria_test` (inalcanzable; el comando no se conecta), PRINTER_DRIVER=file y PRINTER_FILE_DIR = una carpeta temporal,
- cuando se ejecuta,
- entonces termina en menos de 10 s con código 0;
- y stdout contiene la línea 'Hoja de prueba enviada con el driver file.' y una línea 'Destino: <ruta>', donde la ruta es un .txt dentro de la carpeta temporal cuyo nombre sin extensión cumple JOB_ID_PATTERN con la etiqueta 'prueba';
- y la carpeta contiene solo ese archivo, cuyas líneas son las de AC-29 salvo la 4, que cumple `^Fecha: \d{2}/\d{2}/\d{4} \d{2}:\d{2}:\d{2}$`;
- y ni stdout ni stderr contienen 'Clave_Secreta_99'.

**AC-31. pnpm printer:test falla con un mensaje claro** (integración con proceso real, apps/api)
- Dado el mismo comando y entorno de AC-30,
- cuando PRINTER_DRIVER=escpos, entonces termina con código 1 en menos de 10 s, stderr contiene 'Configuración inválida.' y '- PRINTER_DRIVER: escpos todavía no está disponible en esta versión; usa file.', y stdout no contiene 'Hoja de prueba enviada';
- cuando PRINTER_FILE_DIR es la ruta de un archivo que ya existe, entonces termina con código 1, stderr contiene 'No se pudo imprimir. Revisa la impresora e intenta de nuevo.' y 'Revisa PRINTER_DRIVER y PRINTER_FILE_DIR en apps/api/.env.', y stderr no contiene esa ruta ni una traza (ninguna línea que empiece con espacios seguidos de 'at ');
- cuando falta DATABASE_URL, entonces termina con código 1 y stderr contiene 'Configuración inválida.';
- y en ningún caso stdout ni stderr contienen 'Clave_Secreta_99'.

### 4.7 Cobertura de la regla 7 y de los RNF

| Regla o RNF | AC y requisitos |
| --- | --- |
| Regla 7 (todo pasa por PrinterService, driver file en tmp/comandas) | AC-14 a AC-28; R-002-03 |
| Regla 7 (driver escpos) | AC-04, AC-06, AC-31 (rechazo explícito hasta la Fase 3, S-002-01) |
| Regla 8 (America/Lima) | AC-01, AC-14, AC-15, AC-29 |
| RNF-05 (sin internet) | D-002-08 (solo módulos nativos, sin red); R-002-04 |
| RNF-12 (configuración sin tocar código) | AC-02 a AC-06 |

## 5. Requisitos de configuración (verificados por comando)

No son comportamiento, por eso no llevan AC. Los comandos con grep se ejecutan en Git Bash desde la raíz.

| ID | Requisito | Comando | Resultado esperado |
| --- | --- | --- | --- |
| R-002-01 | Script raíz `printer:test` = `pnpm --filter @polleria/api run printer:test`. Script de @polleria/api `printer:test` = `node --env-file-if-exists=.env --disable-warning=ExperimentalWarning src/print-test-page.ts`. Compatibles con Windows (R-15 de la 001). | `pnpm run` y, con apps/api/.env creado, `pnpm printer:test` en PowerShell y en Git Bash | `pnpm run` lista printer:test; el comando termina con código 0 y deja un .txt nuevo en tmp/comandas. |
| R-002-02 | vitest.config.ts agrega `apps/api/src/print-test-page.ts` a coverage.exclude (como server.ts y db/cli.ts). apps/api/src/services/printer/** cumple el umbral de 90 % de services. | `pnpm test:coverage` | Código 0. |
| R-002-03 | Fuera de apps/api/src/services/printer/ nadie importa sus módulos internos: solo index.ts (regla 7). | `grep -rn "services/printer/" apps/api/src --include=*.ts \| grep -v "^apps/api/src/services/printer/" \| grep -v "services/printer/index.ts"` | Sin resultados. |
| R-002-04 | Sin dependencias nuevas: package.json solo cambia en los scripts y pnpm-lock.yaml no cambia. | `git diff main --stat -- pnpm-lock.yaml` | Sin resultados. |
| R-002-05 | Las pruebas no escriben en tmp/comandas del proyecto. | Contar los archivos de tmp/comandas antes y después de `pnpm test` (`ls tmp/comandas 2>/dev/null \| wc -l`) | El mismo número. |
| R-002-06 | Definición de terminado de CLAUDE.md. | `pnpm test`, `pnpm lint`, `pnpm typecheck` | Código 0 en los tres. |

## 6. Reglas de negocio aplicables

De CLAUDE.md:
- Regla de dominio 7: la impresión siempre pasa por PrinterService; driver file en desarrollo y pruebas (por defecto tmp/comandas); el driver escpos para la impresora térmica de red de 80 mm llega en la Fase 3.
- Regla de dominio 8: America/Lima en el nombre de los archivos (jobId) y en la hoja de prueba.
- Regla de dominio 9: funciona sin internet; el driver file solo usa el disco local.
- Reglas para todos los agentes 6 y 7: no hay migraciones; sin secretos en el repositorio (.env.example con valores de ejemplo).

De la spec 001: RN-001-01 (ningún mensaje filtra la URL ni la clave de la base) y el formato de ConfigError (AC-05 de la 001).

Específicas de esta spec:
- RN-002-01. Todo lo que se imprime pasa por `PrinterService.print`. Ningún módulo usa un driver directamente; solo la fábrica createPrinterDriver los crea.
- RN-002-02. Lo que recibe un driver ya está normalizado: entre 1 y 500 líneas, cada una de 48 columnas o menos, solo con PRINTABLE_CHARACTERS, sin espacios al final y con al menos una línea con contenido.
- RN-002-03. Nada de lo que escribe un usuario llega a la impresora como comando: los caracteres de control y de formato se eliminan antes del driver.
- RN-002-04. Los mensajes de PrinterError son fijos por código, en español, y no incluyen rutas, valores recibidos ni detalles del sistema. El detalle técnico va solo en cause, para el log del servidor; destination y cause nunca se envían a los clientes.
- RN-002-05. El driver file nunca deja un .txt incompleto: el archivo aparece completo o no aparece.
- RN-002-06. Cada impresión tiene un jobId único (hora de Lima con milisegundos más 8 caracteres hexadecimales aleatorios) y su propio archivo.

## 7. Casos borde conocidos

Documento:
- Línea de exactamente 48 columnas: no se corta. De 49: dos líneas (48 y 1).
- Línea con 48 caracteres y espacios al final: los espacios se quitan y no se corta.
- Una línea que solo tiene espacios o tabulaciones queda vacía (`''`); si todas quedan así, el documento es vacío.
- Saltos dentro de una línea: CRLF cuenta como uno; `'\n\r'` son dos (LF y luego CR).
- VT (U+000B) y FF (U+000C) se eliminan; no se tratan como saltos.
- Letras con acentos que no están en el conjunto pierden el acento (`'à'` pasa a `'a'`); una letra con dos acentos combinantes que NFC no puede unir también (`'x\u0301\u0301'` pasa a `'x'`).
- Un emoji compuesto (familia, tono de piel, bandera) da un solo `'?'`; una tecla numérica (`'1\uFE0F\u20E3'`) da el número.
- Sustitutos sueltos (texto UTF-16 roto) dan `'?'`; nunca rompen la escritura en UTF-8.
- La entrada se mide con `.length` de JavaScript (unidades UTF-16): un emoji fuera del plano básico cuenta 2 para el límite de 2000.
- 500 líneas de entrada que al cortarse pasan de 500: PRINTER_INVALID_DOCUMENT.

Driver file:
- La carpeta se borra con la API en marcha: el siguiente trabajo la vuelve a crear.
- PRINTER_FILE_DIR apunta a un archivo, a una unidad que no existe o a una carpeta sin permiso de escritura: PRINTER_OUTPUT_FAILED en cada impresión (la API arranca igual; la configuración solo valida que no esté vacía). `pnpm printer:test` lo detecta.
- Corte de luz durante la escritura: puede quedar un `<jobId>.tmp`, nunca un .txt incompleto. Los .tmp sobrantes no se limpian solos (fuera de alcance); se pueden borrar a mano.
- Dos trabajos con el mismo jobId solo son posibles inyectando reloj y aleatorio fijos (pruebas). En ese caso el segundo reemplaza al primero, porque el renombrado sobrescribe en Windows y en Linux. Con los valores reales la probabilidad es despreciable (mismo milisegundo y mismos 32 bits aleatorios).
- Windows: renombrar un archivo sobre una carpeta existente da EPERM, así que se reintenta (unos 300 ms) antes de fallar. `mkdir` con `recursive` sobre un archivo da EEXIST. Los mensajes de error de Node incluyen la ruta absoluta: por eso nunca se copian al message de PrinterError.
- Windows 11 permite el archivo 'con.txt', pero los jobId siempre empiezan con 8 dígitos, así que nunca coinciden con nombres reservados (CON, NUL, PRN, AUX, COM1, LPT1).
- Rutas largas de Windows: Node las maneja; si la carpeta fuera inválida, es PRINTER_OUTPUT_FAILED.

Configuración:
- `PRINTER_DRIVER=escpos` en apps/api/.env detiene la API, `pnpm db:migrate` y `pnpm printer:test` con el mensaje de configuración inválida, hasta la Fase 3 (S-002-01, S-002-07).
- `PRINTER_FILE_DIR=tmp/otra` en apps/api/.env se resuelve contra la raíz del monorepo aunque pnpm ejecute el script con apps/api como carpeta actual.
- En Windows, `PRINTER_FILE_DIR=/comandas` (sin unidad) es absoluta y se resuelve en la unidad de la raíz del proyecto (por ejemplo C:\comandas).
- El apps/api/.env actual del usuario no tiene las variables nuevas: se usan los valores por defecto.
- La API de los E2E (Playwright) usa la carpeta por defecto; en esta fase no imprime nada. La Fase 3 debe darle una carpeta temporal (sección 18).

## 8. Modelo de datos

Ninguno. Esta spec no crea tablas, columnas, migraciones ni seeds. Los trabajos de impresión no se guardan en la base en esta fase (la Fase 3 decidirá cómo se registran las comandas y sus reimpresiones).

## 9. API

- Sin endpoints nuevos: imprimir sin autenticación por HTTP permitiría a cualquiera en el wifi del local gastar papel (D-002-11). docs/api/openapi.yaml no cambia (sigue en 0.2.0).
- Sin eventos de Socket.IO: printer:error es de la Fase 3.
- PrinterError no es un código del formato común de error ni de ERROR_CODES de @polleria/shared (D-002-07).

## 10. Interfaz

No hay pantallas. Lo que ve una persona en esta fase:

**Comando `pnpm printer:test`** (administrador o instalador, en la PC del local, en PowerShell o en Git Bash):

| Situación | Salida | Código |
| --- | --- | --- |
| Impresión correcta | stdout: `Hoja de prueba enviada con el driver file.` y en la línea siguiente `Destino: <ruta absoluta del .txt>` | 0 |
| Configuración inválida | stderr: el mensaje de ConfigError (empieza con 'Configuración inválida.' y tiene una línea por variable) | 1 |
| PrinterError | stderr: el message del error y, en la línea siguiente, `Revisa PRINTER_DRIVER y PRINTER_FILE_DIR en apps/api/.env.` | 1 |
| Otro error inesperado | stderr: `No se pudo imprimir la hoja de prueba.` | 1 |

Nunca muestra trazas, la URL de la base ni su clave. En la línea de éxito, `file` es el valor de PRINTER_DRIVER.

**Archivo en tmp/comandas**: `AAAAMMDD-HHmmss-SSS-<label>-<8 hex>.txt`, por ejemplo `20261007-153012-123-prueba-a1b2c3d4.txt`. Ordenados por nombre quedan en orden de impresión. El contenido es lo que saldría en el papel (hoja de prueba de AC-29).

## 11. Contrato interno de módulos (rutas que importan las pruebas)

El test-writer importa desde estas rutas; si un módulo no existe todavía, la prueba falla por módulo inexistente (rojo válido). Sintaxis borrable (D-02 de la 001): sin enum, namespace ni propiedades de parámetro; imports relativos con .ts.

- **packages/shared/src/lima-time.ts** (exportado también por packages/shared/src/index.ts, se importa como `@polleria/shared`)
  - `interface LimaDateTimeParts { year: string; month: string; day: string; hour: string; minute: string; second: string; millisecond: string }`.
  - `toLimaDateTimeParts(date: Date): LimaDateTimeParts`. Lanza RangeError con una fecha inválida.
- **apps/api/src/config/env.ts** (modificado)
  - `CONFIG_VARIABLES`: lista `as const` con NODE_ENV, HOST, PORT, DATABASE_URL, DATABASE_URL_TEST, PRINTER_DRIVER y PRINTER_FILE_DIR.
  - `PROJECT_ROOT_DIR: string` y `DEFAULT_PRINTER_FILE_DIR: string` (absolutas).
  - `interface PrinterConfig { driver: 'file'; fileDir: string }`.
  - `AppConfig` suma `printer: PrinterConfig`. loadConfig, ConfigError y el resto no cambian de firma.
- **apps/api/src/services/printer/printer-error.ts**
  - `PRINTER_ERROR_CODES` (objeto `as const`, clave = valor) y `type PrinterErrorCode`.
  - `PRINTER_ERROR_MESSAGES: Readonly<Record<PrinterErrorCode, string>>` con los textos de D-002-07.
  - `class PrinterError extends Error` con `readonly code: PrinterErrorCode`; constructor `new PrinterError(code: PrinterErrorCode, options?: { cause?: unknown })`.
- **apps/api/src/services/printer/print-document.ts**
  - `PRINTER_LINE_WIDTH` = 48, `PRINTER_MAX_LINES` = 500, `PRINTER_MAX_INPUT_LINE_LENGTH` = 2000, `PRINT_LABEL_MAX_LENGTH` = 32, `PRINT_LABEL_PATTERN` = `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`.
  - `PRINTABLE_CHARACTERS: string` (114 caracteres, D-002-03).
  - `interface PrintDocument { label: string; lines: readonly string[] }`.
  - `printDocumentSchema`: esquema Zod estricto (sin propiedades de más) con las reglas de label y los límites de entrada de lines.
  - `normalizeDocumentLines(lines: readonly string[]): string[]` (D-002-04; pura, nunca lanza, no aplica límites).
- **apps/api/src/services/printer/print-job.ts**
  - `type PrinterDriverName = 'file'` (la Fase 3 agrega 'escpos').
  - `interface PrintJob { jobId: string; label: string; lines: readonly string[] }`.
  - `interface PrintReceipt { jobId: string; destination: string }`.
  - `interface PrinterDriver { readonly name: PrinterDriverName; print(job: PrintJob): Promise<PrintReceipt> }`.
  - `JOB_ID_PATTERN` = `/^\d{8}-\d{6}-\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{8}$/` y `JOB_ID_MAX_LENGTH` = 61.
- **apps/api/src/services/printer/printer.service.ts**
  - `interface PrinterService { print(document: PrintDocument): Promise<PrintReceipt> }`.
  - `interface PrinterServiceDeps { driver: PrinterDriver; now?: () => Date; randomId?: () => string }` (por defecto: `new Date()` y 4 bytes de `node:crypto` en hexadecimal).
  - `createPrinterService(deps: PrinterServiceDeps): PrinterService`. Orden dentro de print: validar (cualquier excepción al validar es PRINTER_INVALID_DOCUMENT), normalizar, revisar el máximo de 500 líneas, revisar vacío, armar el jobId, llamar al driver (D-002-07).
- **apps/api/src/services/printer/file-driver.ts**
  - `interface FilePrinterDriverOptions { dir: string; rename?: (from: string, to: string) => Promise<void> }`.
  - `FILE_DRIVER_RENAME_RETRY_DELAYS_MS` = `[20, 40, 80, 160]` (`as const`).
  - `createFilePrinterDriver(options: FilePrinterDriverOptions): PrinterDriver` (name 'file'; D-002-08).
- **apps/api/src/services/printer/create-printer-driver.ts**
  - `createPrinterDriver(config: PrinterConfig): PrinterDriver`.
- **apps/api/src/services/printer/test-page.ts**
  - `TEST_PAGE_LABEL` = 'prueba'.
  - `buildTestPage(options: { now: Date; driverName: PrinterDriverName }): PrintDocument`.
- **apps/api/src/services/printer/index.ts** (puerta pública, R-002-03)
  - Reexporta: createPrinterService, createPrinterDriver, buildTestPage, TEST_PAGE_LABEL, PrinterError, PRINTER_ERROR_CODES, PRINTER_LINE_WIDTH y los tipos PrinterService, PrinterServiceDeps, PrintDocument, PrintReceipt, PrinterDriver, PrinterDriverName y PrinterErrorCode (con `export type`). No reexporta createFilePrinterDriver.
- **apps/api/src/print-test-page.ts**
  - Punto de entrada de `pnpm printer:test`. Solo lee process.env; no importa nada de apps/api/src/db.

Rutas sugeridas para pruebas: unitarias junto al código (`packages/shared/src/lima-time.test.ts`, `apps/api/src/config/printer-env.test.ts`, `apps/api/src/services/printer/*.test.ts`); procesos en `apps/api/tests/printer-process.test.ts`, agregando a `apps/api/tests/helpers/child-process.ts` la ruta de print-test-page.ts y una función para ejecutarlo.

## 12. Cambios a la spec 001 (señalados)

Agregar dos variables a la configuración toca AC aprobados de la 001. No cambia nada que vea el usuario final.

| Elemento de la 001 | Cambio | Quién |
| --- | --- | --- |
| AC-04 | El objeto completo que devuelve loadConfig suma `printer: { driver: 'file', fileDir: DEFAULT_PRINTER_FILE_DIR }`. Las dos pruebas con toStrictEqual de apps/api/src/config/env.test.ts se actualizan; el resto de AC-04 no cambia. | test-writer (T-02) |
| AC-07 | CONFIG_VARIABLES pasa de 5 a 7 variables (más PRINTER_DRIVER y PRINTER_FILE_DIR). La lista fija de apps/api/src/config/env-example.test.ts se actualiza; las demás pruebas de AC-07 no cambian. | test-writer (T-02) |
| apps/api/.env.example | Suma `PRINTER_DRIVER=file` y `PRINTER_FILE_DIR=tmp/comandas` con un comentario en español. | backend-dev (T-12) |
| R-04 | Además de format, se permite el script raíz printer:test. | backend-dev (T-17) |
| R-09 | coverage.exclude suma apps/api/src/print-test-page.ts. | backend-dev (T-17) |
| Sección 11 (env.ts) | Exports nuevos: PROJECT_ROOT_DIR, DEFAULT_PRINTER_FILE_DIR, PrinterConfig y AppConfig.printer. | backend-dev (T-12) |
| Sección 13 ("PrinterService y sus drivers: spec 002") | Ahora en alcance de esta spec. | — |

La spec 001 tiene una nota en su cabecera y en AC-04 y AC-07 que remite a esta sección.

## 13. Dependencias

Ninguna nueva. Se usan capacidades nativas de Node 24.1.0 (node:fs/promises, node:path, node:crypto, Intl.Segmenter y Intl.DateTimeFormat con ICU completo, verificado: ICU 77.1, Unicode 16) y librerías ya instaladas (zod 4.6.5).

- node-thermal-printer 4.6.1 (aprobada en CLAUDE.md) no se instala: es del driver escpos de la Fase 3.
- fast-check (aprobada en CLAUDE.md) no es necesaria para los AC; la puede instalar el adversarial-tester si la usa.
- Sin ADR: no hay dependencias nuevas y la arquitectura (PrinterService con drivers file y escpos) ya está en CLAUDE.md, regla 7. Las decisiones de esta spec quedan en la sección 3.

## 14. Fuera de alcance

- El driver escpos real, la conexión de red con la impresora, la tabla de caracteres (code page), el corte de papel y la apertura del cajón (Fase 3).
- El formato y el contenido de las comandas (número, mesa, mozo, hora, ítems, parte, cremas, observaciones), ADICIONAL y ANULADO (RF-08, RF-09).
- Reimpresión, aviso de impresora caída, evento printer:error y Socket.IO (RF-10).
- Impresora de barra y enrutamiento de bebidas (RF-11).
- Cola de impresión, reintentos de impresión, orden garantizado entre trabajos simultáneos y tiempo límite del driver (RNF-03).
- Impresión de pre-cuenta y ticket (Fase 4).
- Guardar los trabajos en la base de datos.
- Limpiar archivos .tmp sobrantes o archivos viejos de tmp/comandas.
- Cualquier endpoint HTTP de impresión.
- Corte por palabras dentro del servicio (lo hará el formateador de comandas).

## 15. Supuestos

| ID | Supuesto |
| --- | --- |
| S-002-01 | Con PRINTER_DRIVER=escpos la API (y los comandos que usan loadConfig) no arrancan y explican que escpos todavía no está disponible, en vez de arrancar y fallar en cada impresión. |
| S-002-02 | El servicio corta las líneas de más de 48 columnas sin buscar espacios (corte duro); la presentación por palabras es del formateador de la comanda (Fase 3). |
| S-002-03 | Los caracteres imprimibles son ASCII más á é í ó ú ü ñ Á É Í Ó Ú Ü Ñ ¿ ¡ ° º ª (caben en PC850 y WPC1252). |
| S-002-04 | Lo que la impresora no tiene (emojis, otros alfabetos, símbolos) se imprime como '?' (un signo por carácter visible), en vez de borrarse. Las letras con otros acentos se imprimen sin acento y las comillas y rayas tipográficas se cambian por las simples. |
| S-002-05 | Límites: 500 líneas por documento y 2000 caracteres por línea de entrada; un documento sin contenido es un error, no una hoja en blanco. |
| S-002-06 | El driver file se permite con cualquier NODE_ENV, también production, para la demostración sin impresora. |
| S-002-07 | Una variable de impresión inválida también detiene `pnpm db:migrate` y `pnpm db:seed`, porque comparten loadConfig. |
| S-002-08 | Los nombres de archivo usan la hora de Lima (regla 8), no UTC; Lima no tiene horario de verano, así que el orden se mantiene. |
| S-002-09 | Una ruta relativa en PRINTER_FILE_DIR se toma desde la raíz del monorepo, no desde la carpeta actual. |

## 16. Preguntas abiertas para el usuario

Ninguna bloquea la implementación; si no hay respuesta, se aplica la recomendación.

1. Si alguien configura PRINTER_DRIVER=escpos antes de la Fase 3, ¿prefieres que el sistema no arranque y lo explique (recomendado, S-002-01) o que arranque y falle al imprimir?
2. Cuando un texto no entra en una línea de 48 columnas, ¿está bien que este servicio lo corte justo en la columna 48, aunque parta una palabra, sabiendo que la comanda de la Fase 3 ya vendrá ordenada por palabras (recomendado, S-002-02)?
3. Los emojis y símbolos que la impresora no puede imprimir, ¿se muestran como '?' (recomendado, para que la cocina note que faltaba algo) o se borran (S-002-04)?
4. Para la Fase 3: ¿qué marca y modelo de impresora térmica tiene o comprará el dueño? Sirve para elegir la tabla de caracteres (PC850 o WPC1252) y confirmar que imprime bien la ñ y las tildes en mayúscula.

## 17. Verificación manual sugerida (para el usuario)

1. Con apps/api/.env creado: `pnpm printer:test`. Debe decir 'Hoja de prueba enviada con el driver file.' y la ruta del archivo en tmp/comandas.
2. Abrir ese archivo con el Bloc de notas: se ven bien las tildes, la ñ y los signos ¿ ¡; la regla de números tiene 48 columnas.
3. Escribir `PRINTER_DRIVER=escpos` en apps/api/.env y ejecutar `pnpm printer:test` y `pnpm dev`: ambos deben explicar que escpos todavía no está disponible. Volver a `PRINTER_DRIVER=file`.
4. Opcional: `PRINTER_FILE_DIR=C:\comandas-prueba` en apps/api/.env y repetir el paso 1; el archivo aparece en esa carpeta (se crea sola).

## 18. Notas para la Fase 3 (no son alcance de esta spec)

- Driver escpos con node-thermal-printer 4.6.1: agregar 'escpos' a PrinterDriverName y a PrinterConfig, nuevas variables (por ejemplo PRINTER_HOST y PRINTER_PORT), quitar el rechazo de AC-04, elegir PC850 o WPC1252 y convertir PRINTABLE_CHARACTERS a esa tabla.
- RNF-03 (menos de 3 s): tiempo límite del driver, cola o serialización de trabajos para que no se mezclen en la impresora, y orden de llegada.
- "Una falla de impresión no revierte el pedido": capturar PrinterError después del commit, registrarlo, emitir printer:error y permitir reimprimir (volver a llamar a print con el mismo documento).
- El formateador de la comanda arma líneas de 48 columnas o menos cortando por palabras, antes de llamar a print.
- La API de los E2E y las pruebas de integración que impriman deben recibir PRINTER_FILE_DIR con una carpeta temporal, para no escribir en tmp/comandas.
- Decidir si algún endpoint traduce PrinterError a un código HTTP (por ejemplo 503) y si sus códigos pasan a ERROR_CODES de @polleria/shared.
