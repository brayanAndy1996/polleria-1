# Spec 001 — Base del monorepo, salud de la API y web mínima

- Estado: Aprobada (2026-10-07, por el usuario; preguntas abiertas resueltas en la sección 15)
- Fase: 0 (Base del proyecto)
- Rama: feat/001-base-monorepo
- Cubre: RNF-05 (funciona en la red local sin internet), RNF-07 (Chrome en Android 9+ y Windows 10+), RNF-12 (configuración sin tocar código; en esta fase, por variables de entorno). No cubre ningún RF.
- Fecha: 2026-10-07
- Documentos relacionados: docs/api/openapi.yaml (contrato), docs/decisions/0001-stack-y-versiones.md (ADR, Propuesto), tasks.md (esta carpeta).

## 1. Contexto

Antes de construir mesas, pedidos y comandas hace falta una base que corra en la PC del local sin internet: un monorepo con la web, la API y un paquete compartido, conexión a PostgreSQL local, migraciones, pruebas automáticas y una pantalla que diga si el sistema está conectado. Al dueño todavía no le resuelve un problema de atención, pero le permite comprobar desde la PC de caja o desde el celular de un mozo que el sistema responde en el wifi del local. Además deja listas las protecciones que necesitan las fases siguientes: base de pruebas separada, errores sin secretos y configuración por archivo .env.

## 2. Historias de usuario

| ID | Historia |
| --- | --- |
| HU-001-01 | Como administrador (dueño), quiero abrir el sistema en la PC de caja o en un celular conectado al wifi del local y ver si está conectado, para saber que todo funciona antes de abrir. |
| HU-001-02 | Como mozo, quiero que la página cargue en mi celular Android aunque se caiga el internet, para no depender de la conexión externa durante la atención. |
| HU-001-03 | Como administrador, quiero configurar la conexión a la base de datos y los puertos editando un archivo .env, sin tocar el código, para instalar el sistema en la PC del local. |
| HU-001-04 | Como equipo de desarrollo, quiero un monorepo con pruebas, lint, typecheck, migraciones y una guardia que impida usar la base de desarrollo en las pruebas, para construir las siguientes funcionalidades con TDD sin perder datos. |

## 3. Decisiones técnicas

Estas decisiones aplican desde esta spec. Las que no confirmó el usuario están marcadas como SUPUESTO y repetidas en Preguntas abiertas.

**D-01. Puertos y comunicación web-API (SUPUESTO S-02 y S-08).**
- La web (Next.js) escucha en el puerto 3000 en todas las interfaces (0.0.0.0), para que los celulares entren por la IP de la PC del local, por ejemplo http://192.168.1.10:3000.
- La API (Express) escucha en 127.0.0.1:4000 por defecto (variables HOST y PORT). Los celulares no hablan directo con la API.
- Todas las rutas de la API cuelgan del prefijo /api. La web reenvía /api/:path* a API_INTERNAL_URL/api/:path* con rewrites de Next.js. El navegador solo ve un origen (el de la web), por lo que:
  - No hay CORS ni paquete cors. La API no envía Access-Control-Allow-Origin.
  - La futura sesión JWT en cookie httpOnly funcionará en el mismo origen (SameSite=Lax o Strict) sin depender de la IP de la PC.
  - Socket.IO (fase posterior) usará la misma vía: se agregará un rewrite de /socket.io/:path*. Se verificó en el código de Next 16.4.0 que los rewrites hacia un destino externo reenvían también las conexiones WebSocket (upgradeHandler y proxyRequest en router-server). Si la conexión WebSocket fallara, Socket.IO cae a long-polling por HTTP, que también pasa por el rewrite.
- En el contrato OpenAPI la ruta se escribe /health con servidor base /api. La URL real es /api/health tanto en la API (puerto 4000) como desde la web (puerto 3000). En esta spec, "GET /api/health" es la URL completa.
- API_INTERNAL_URL por defecto es http://127.0.0.1:4000 (no localhost: en Windows localhost puede resolver primero a ::1 y la API escucha solo en IPv4).
- Next.js 16 bloquea en modo desarrollo los recursos /_next pedidos desde orígenes distintos de localhost (verificado en block-cross-site-dev.js de 16.4.0). Para probar con un celular en `pnpm dev`, la variable WEB_ALLOWED_DEV_ORIGINS lista las IP o nombres permitidos (por ejemplo 192.168.1.10) y se pasa a allowedDevOrigins. En producción (next start) esta restricción no existe.

**D-02. TypeScript en tiempo de ejecución sin compilar.**
- La API y los comandos de base de datos corren con el type stripping nativo de Node 24 (`node archivo.ts`), sin tsx ni ts-node. Verificado en Node 24.1.0: funciona y muestra un ExperimentalWarning, que se oculta con `--disable-warning=ExperimentalWarning`.
- Consecuencia obligatoria para apps/api y packages/shared: solo sintaxis borrable (tsconfig `erasableSyntaxOnly: true`): prohibidos enum, namespace, propiedades de parámetro en constructores y decoradores. Usar objetos `as const` y uniones de strings. Los imports relativos llevan extensión .ts.
- En desarrollo la API se reinicia con `node --watch` (sin nodemon).

**D-03. packages/shared sin paso de compilación.**
- @polleria/shared exporta su código fuente TypeScript (`"exports": { ".": "./src/index.ts" }`). Lo consumen Node (api), Vitest y Next.js (con `transpilePackages: ['@polleria/shared']`). Verificado en Node 24.1.0 con un workspace pnpm: importar un paquete del workspace que exporta .ts funciona (pnpm lo enlaza fuera de node_modules por su ruta real).
- "Compilable" significa: pasa `tsc --noEmit` y no usa APIs de Node ni del DOM, para poder usarse en ambos lados.
- Solo contiene lo de esta fase: TIME_ZONE, esquemas Zod de la salud y del formato de error, y ERROR_CODES. Nada de lógica de dominio de fases posteriores.

**D-04. Variables de entorno sin dotenv.**
- Los scripts de apps/api cargan el archivo con la opción nativa `node --env-file-if-exists=.env`. Las variables que ya existen en el entorno tienen prioridad sobre el archivo (verificado en Node 24.1.0). Por eso Playwright puede forzar DATABASE_URL de pruebas aunque apps/api/.env apunte a polleria_dev.
- server.ts y cli.ts no leen el archivo .env por su cuenta: solo leen process.env. Así las pruebas que arrancan esos procesos controlan todo el entorno.
- Vitest y Playwright leen apps/api/.env (si existe) con `process.loadEnvFile` o `util.parseEnv`, sin sobrescribir variables ya definidas (verificado: loadEnvFile no sobrescribe en Node 24.1.0).
- La web usa la carga nativa de Next.js (apps/web/.env*).
- Toda variable se valida con Zod al arrancar (loadConfig en la API, loadWebServerConfig en la web).

**D-05. Migraciones y seeds con umzug.**
- Se usa umzug 3 con su SequelizeStorage, en lugar de sequelize-cli, porque permite migraciones en TypeScript con type stripping y una API programática que las pruebas usan para migrar polleria_test.
- Migraciones en apps/api/src/db/migrations y seeds en apps/api/src/db/seeders. Archivos `.ts` con sintaxis borrable, nombre `AAAAMMDDHHmmss-descripcion.ts`, que exportan `up({ context })` y `down({ context })`, donde context es el QueryInterface de Sequelize. Se aplican en orden alfabético del nombre.
- Registro de migraciones aplicadas en la tabla SequelizeMeta; registro de seeds aplicados en SequelizeData (SUPUESTO S-06: cada seed se aplica una sola vez).
- En esta funcionalidad no hay migraciones ni seeds; las carpetas existen vacías (con .gitkeep).

**D-06. Salud del sistema.**
- GET /api/health es público. Responde 200 con HealthResponse si la base responde, o 503 con el mismo esquema si no responde o tarda más de 2 segundos (DEFAULT_HEALTH_TIMEOUT_MS = 2000).
- Excepción documentada al formato común de error (SUPUESTO S-03): el 503 usa HealthResponse y no ErrorResponse, porque informa un estado y no un error de la solicitud. Así la web distingue "API sin base de datos" de "API inalcanzable".
- La API arranca aunque PostgreSQL esté apagado (SUPUESTO S-04): Sequelize conecta bajo demanda y /api/health reporta 503 hasta que la base vuelva.

**D-07. Errores.**
- Clase AppError con code, message, httpStatus y details. Un solo middleware errorHandler arma `{ error: { code, message, details } }`.
- code en inglés, MAYÚSCULAS_CON_GUION_BAJO (SUPUESTO S-09). message en español de Perú.
- Los mensajes de Zod se configuran en español con la configuración regional incluida en Zod 4 (`z.config(z.locales.es())`), sin dependencias nuevas.

**D-08. Pruebas.**
- Vitest con proyectos: shared (node), api-unit (node), api-integration (node, archivos en serie porque comparten polleria_test) y web (jsdom).
- Integración contra polleria_test real, leyendo DATABASE_URL_TEST y verificándola con assertTestDatabase antes de conectar.
- E2E con Playwright contra polleria_test: Playwright levanta su propia API en 127.0.0.1:4100 (NODE_ENV=test, DATABASE_URL = DATABASE_URL_TEST) y su propia web en el puerto 3100 (API_INTERNAL_URL=http://127.0.0.1:4100). Nunca reutiliza servidores ya levantados (`reuseExistingServer: false`), para no terminar usando la API de desarrollo conectada a polleria_dev.
- Next.js 16 no permite dos `next dev` en la misma carpeta (lockfile verificado en 16.4.0). Por eso hay que detener `pnpm dev` antes de `pnpm test:e2e` (SUPUESTO S-07).

**D-09. Compatibilidad de navegadores (RNF-07, SUPUESTO S-01).**
- Next.js 16.4.0 compila para Chrome 111+, Edge 111+, Firefox 111+ y Safari 16.4+ (MODERN_BROWSERSLIST_TARGET verificado en el paquete). Tailwind CSS 4 exige el mismo piso (Chrome 111+).
- Android 9 puede tener Chrome 111 o superior si se actualiza desde Play Store. Según el anuncio de Google, Chrome 138 es la última versión para Android 8 y 9 (verificar). Conclusión: el stack es compatible con Android 9 siempre que el celular tenga Chrome actualizado (111 a 138). Un Chrome sin actualizar (110 o menor) puede mostrar la página sin estilos.
- Windows 10+: Chrome o Edge actuales cumplen.
- Riesgo a futuro: si una versión futura del stack sube el piso por encima de Chrome 138, Android 9 dejaría de ser compatible. Cualquier actualización mayor de Next, Tailwind o HeroUI debe revisar este punto.

**D-10. Convenciones para specs futuras (sin efecto visible en esta spec).**
- Tablas en inglés, snake_case y en plural (orders, order_items); columnas en snake_case (price_cents). Sequelize con `define.underscored = true`. Fechas en columnas timestamptz en UTC (`timezone: '+00:00'`).
- JSON de la API en camelCase. Dinero con sufijo Cents y pollo con sufijo Eighths, siempre enteros.

## 4. Criterios de aceptación

Cada AC tiene al menos un test cuyo nombre empieza con su ID (por ejemplo `it('AC-12: responde 200 ...')`). Se indica el nivel de prueba y una ubicación sugerida; la ubicación exacta la decide el test-writer.

### 4.1 Paquete compartido (packages/shared)

**AC-01. La zona horaria se comparte entre api y web** (unitaria, una prueba en cada paquete)
- Dado el paquete @polleria/shared declarado como dependencia `workspace:*` de apps/api y apps/web,
- cuando una prueba de packages/shared, una de apps/api y una de apps/web importan TIME_ZONE desde '@polleria/shared',
- entonces en los tres casos TIME_ZONE vale exactamente 'America/Lima'.

**AC-02. Esquema de la respuesta de salud** (unitaria, packages/shared)
- Dado healthResponseSchema exportado por @polleria/shared,
- cuando valida `{ status: 'ok', database: 'ok', timestamp: '2026-10-07T20:00:00.000Z' }` o `{ status: 'error', database: 'error', timestamp: '2026-10-07T20:00:00.000Z' }`,
- entonces la validación es exitosa;
- y cuando valida un objeto con un campo adicional (por ejemplo databaseUrl), con status o database distintos de 'ok' y 'error', sin timestamp, o con un timestamp que no es ISO 8601 en UTC con sufijo Z (por ejemplo '07/10/2026' o '2026-10-07T15:00:00-05:00'),
- entonces la validación falla.

**AC-03. Esquema del formato común de error** (unitaria, packages/shared)
- Dado errorResponseSchema y ERROR_CODES exportados por @polleria/shared,
- cuando valida `{ error: { code: 'NOT_FOUND', message: 'La ruta solicitada no existe.', details: null } }` o `{ error: { code: 'VALIDATION_ERROR', message: 'Los datos enviados no son válidos.', details: { issues: [{ path: 'name', message: 'Requerido' }] } } }`,
- entonces la validación es exitosa;
- y falla si falta error.code, error.message o error.details, si message es una cadena vacía, o si hay un campo adicional dentro de error;
- y ERROR_CODES contiene al menos NOT_FOUND, INTERNAL_ERROR, VALIDATION_ERROR, INVALID_JSON y PAYLOAD_TOO_LARGE, cada clave con un valor igual a su nombre.

### 4.2 Configuración de la API (RNF-12)

**AC-04. Configuración válida con valores por defecto** (unitaria, apps/api)
- Dado un objeto de entorno que solo tiene `DATABASE_URL=postgres://polleria:clave@localhost:5432/polleria_dev`,
- cuando se llama `loadConfig(env)`,
- entonces devuelve `{ nodeEnv: 'development', host: '127.0.0.1', port: 4000, databaseUrl: <la misma URL>, databaseUrlTest: undefined }`;
- y con además `PORT='4500'`, `HOST='0.0.0.0'` y `NODE_ENV='production'` devuelve `port: 4500` (número), `host: '0.0.0.0'` y `nodeEnv: 'production'`.

**AC-05. Configuración inválida: mensaje claro y sin secretos** (unitaria, apps/api)
- Dado un entorno sin DATABASE_URL y con `PORT='abc'`,
- cuando se llama `loadConfig(env)`,
- entonces lanza ConfigError con `issues` que contiene, a la vez, `{ variable: 'DATABASE_URL', message: 'es obligatoria.' }` y `{ variable: 'PORT', message: 'debe ser un número entero entre 1 y 65535.' }`; el `message` del error empieza con 'Configuración inválida.' e incluye una línea `- VARIABLE: mensaje` por cada problema;
- y dado `DATABASE_URL='mysql://polleria:SuperSecreta123@localhost/polleria_dev'`, o un texto que no es URL, o una URL de PostgreSQL sin nombre de base, el issue de DATABASE_URL es 'debe ser una URL de PostgreSQL (postgres://usuario:clave@host:puerto/base).', y ni `message` ni `issues` contienen 'SuperSecreta123' ni la URL recibida;
- y PORT con '0', '65536', '4000.5' o '-1' produce el issue de PORT; `NODE_ENV='staging'` produce `{ variable: 'NODE_ENV', message: 'debe ser development, test o production.' }`; `HOST=''` produce `{ variable: 'HOST', message: 'no puede estar vacía.' }`.

**AC-06. Protección de la base en modo test** (unitaria, apps/api)
- Dado `NODE_ENV='test'` y DATABASE_URL apuntando a polleria_dev,
- cuando se llama `loadConfig(env)`,
- entonces lanza ConfigError con el issue `{ variable: 'DATABASE_URL', message: 'con NODE_ENV=test la base debe terminar en _test.' }`;
- y con DATABASE_URL apuntando a polleria_test no lanza;
- y con cualquier NODE_ENV, si DATABASE_URL_TEST está definida y su base no termina en _test (según las reglas de AC-11), lanza el issue `{ variable: 'DATABASE_URL_TEST', message: 'debe apuntar a una base cuyo nombre termine en _test.' }`.

**AC-07. El archivo .env.example documenta toda la configuración de la API** (unitaria, apps/api)
- Dado el archivo versionado apps/api/.env.example,
- cuando se leen sus variables con `util.parseEnv` y se pasan a `loadConfig`,
- entonces loadConfig no lanza error;
- y el conjunto de variables del archivo es exactamente CONFIG_VARIABLES: NODE_ENV, HOST, PORT, DATABASE_URL y DATABASE_URL_TEST;
- y DATABASE_URL y DATABASE_URL_TEST usan la clave de ejemplo 'cambia_esta_clave' (no una clave real).

**AC-08. La API no arranca con configuración inválida o puerto ocupado** (integración con proceso real, apps/api)
- Dado el proceso `node --disable-warning=ExperimentalWarning apps/api/src/server.ts` iniciado sin archivo .env y con un entorno sin DATABASE_URL,
- cuando arranca,
- entonces termina solo en menos de 10 s con código de salida 1 y escribe en stderr el mensaje de ConfigError (contiene 'Configuración inválida.' y 'DATABASE_URL');
- y dado un entorno válido (DATABASE_URL de polleria_test, NODE_ENV=test, HOST=127.0.0.1) con un PORT que la prueba ya ocupó,
- entonces termina en menos de 10 s con código 1 y stderr contiene 'El puerto <PORT> ya está en uso. Cambia PORT en apps/api/.env.'

**AC-09. La API escucha en el puerto configurado** (integración con proceso real, apps/api)
- Dado un entorno con DATABASE_URL de polleria_test, NODE_ENV=test, HOST=127.0.0.1 y PORT igual a un puerto libre elegido por la prueba,
- cuando se inicia `node --disable-warning=ExperimentalWarning apps/api/src/server.ts`,
- entonces escribe en stdout 'API escuchando en http://127.0.0.1:<PORT>' y `GET http://127.0.0.1:<PORT>/api/health` responde 200 en menos de 10 s.

### 4.3 Guardia de la base de pruebas

**AC-10. La guardia acepta solo bases de prueba** (unitaria, apps/api)
- Dado `assertTestDatabase`,
- cuando recibe `postgres://polleria:clave@localhost:5432/polleria_test`, `postgresql://polleria:clave@127.0.0.1:5432/polleria_test` o `postgres://polleria:clave@localhost:5432/polleria_test?sslmode=disable`,
- entonces no lanza y devuelve 'polleria_test'.

**AC-11. La guardia rechaza cualquier otra base sin filtrar secretos** (unitaria, apps/api)
- Dado `assertTestDatabase`,
- cuando recibe cualquiera de estos valores:

  | Caso | Valor |
  | --- | --- |
  | Base de desarrollo | `postgres://polleria:Secreta_123@localhost:5432/polleria_dev` |
  | Sin nombre de base | `postgres://polleria:Secreta_123@localhost:5432` y la misma con `/` final |
  | No termina en _test | `postgres://polleria:Secreta_123@localhost:5432/polleria_test_copia` |
  | Mayúsculas | `postgres://polleria:Secreta_123@localhost:5432/polleria_TEST` |
  | Solo test | `postgres://polleria:Secreta_123@localhost:5432/test` |
  | Nombre codificado | `postgres://polleria:Secreta_123@localhost:5432/polleria%5Ftest` |
  | Parámetro que cambia la base | `.../polleria_test?database=polleria_dev` y `.../polleria_test?dbname=polleria_dev` |
  | Otro protocolo | `mysql://polleria:Secreta_123@localhost/polleria_test` |
  | No es URL | `Secreta_123` |
  | Vacío | `''` y `undefined` |

- entonces lanza UnsafeTestDatabaseError, cuyo mensaje empieza con 'Por seguridad, las pruebas solo pueden usar una base cuyo nombre termine en _test.' y nunca contiene 'Secreta_123' ni la URL completa recibida.

Regla exacta: el nombre de la base es el path de la URL sin la barra inicial, sin decodificar; es válido solo si el protocolo es postgres: o postgresql:, la URL no trae los parámetros database ni dbname, y el nombre cumple `^[a-z0-9_]+_test$`.

### 4.4 Salud del sistema (GET /api/health)

**AC-12. Salud con base disponible** (integración, apps/api, polleria_test)
- Dado la app creada con `createApp({ sequelize })` conectada a polleria_test,
- cuando se hace `GET /api/health`,
- entonces responde 200 con Content-Type application/json y un cuerpo que cumple healthResponseSchema con status 'ok', database 'ok' y un timestamp a no más de 5 s de la hora actual.

**AC-13. Salud con base caída, sin filtrar secretos** (integración, apps/api)
- Dado la app creada con `createApp({ sequelize })` donde sequelize apunta a `postgres://polleria:Clave_Secreta_99@127.0.0.1:1/polleria_test` (puerto sin servidor),
- cuando se hace `GET /api/health`,
- entonces responde 503 en menos de 5 s con un cuerpo que cumple healthResponseSchema con status 'error' y database 'error', con exactamente las claves status, database y timestamp;
- y el cuerpo y las cabeceras de la respuesta no contienen 'Clave_Secreta_99', 'postgres://', '127.0.0.1:1' ni 'polleria_test'.

**AC-14. El servicio de salud nunca se queda esperando** (unitaria, apps/api/src/services)
- Dado `createHealthService({ sequelize, timeoutMs, now })` con un sequelize falso y `now` fijo en 2026-10-07T20:00:00.000Z,
- cuando `authenticate()` se resuelve, `check()` devuelve `{ status: 'ok', database: 'ok', timestamp: '2026-10-07T20:00:00.000Z' }`;
- cuando `authenticate()` se rechaza, `check()` devuelve `{ status: 'error', database: 'error', timestamp: '2026-10-07T20:00:00.000Z' }`;
- cuando `authenticate()` nunca se resuelve y `timeoutMs` es 50, `check()` devuelve el resultado de error en menos de 1 s;
- en ningún caso `check()` lanza una excepción;
- y DEFAULT_HEALTH_TIMEOUT_MS vale 2000.

**AC-15. Cabeceras de caché y seguridad** (integración, apps/api)
- Dado la app (con base disponible y con base caída),
- cuando se hace `GET /api/health` con la cabecera `Origin: http://sitio-ajeno.example`,
- entonces la respuesta (200 o 503) incluye `Cache-Control: no-store`, no incluye X-Powered-By y no incluye Access-Control-Allow-Origin.

### 4.5 Formato común de errores

**AC-16. Ruta inexistente** (integración, apps/api)
- Dado la app,
- cuando se hace `GET /api/no-existe`, `GET /` o `POST /api/health` sin cuerpo,
- entonces responde 404 con `{ error: { code: 'NOT_FOUND', message: 'La ruta solicitada no existe.', details: null } }`, que cumple errorResponseSchema.

**AC-17. Cuerpo JSON inválido o demasiado grande** (integración, apps/api)
- Dado la app,
- cuando se hace `POST /api/health` con `Content-Type: application/json` y el cuerpo `{"a":`,
- entonces responde 400 con `{ error: { code: 'INVALID_JSON', message: 'El cuerpo de la solicitud no es un JSON válido.', details: null } }`;
- y cuando el cuerpo es un JSON válido de 150 KB (el límite es 100 KB),
- entonces responde 413 con `{ error: { code: 'PAYLOAD_TOO_LARGE', message: 'La solicitud es demasiado grande.', details: null } }`.

**AC-18. AppError produce su código y estado HTTP** (unitaria con app de prueba, apps/api)
- Dado una app Express de prueba que monta `errorHandler` y una ruta que lanza `new AppError({ code: 'TEST_CONFLICT', message: 'Conflicto de prueba.', httpStatus: 409, details: { field: 'x' } })`,
- cuando se llama a esa ruta, tanto si la ruta es síncrona como si es async y la promesa se rechaza,
- entonces responde 409 con `{ error: { code: 'TEST_CONFLICT', message: 'Conflicto de prueba.', details: { field: 'x' } } }`;
- y si el AppError se crea sin details, la respuesta trae `details: null`.

**AC-19. Error de validación de Zod** (unitaria con app de prueba, apps/api)
- Dado una app de prueba con `errorHandler` y una ruta que ejecuta `z.object({ name: z.string().min(1) }).parse({ name: '' })`,
- cuando se llama a esa ruta,
- entonces responde 400 con code 'VALIDATION_ERROR', message 'Los datos enviados no son válidos.' y `details.issues` igual a una lista con un elemento cuyo path es 'name' y cuyo message es un texto no vacío;
- y para un error en un campo anidado (por ejemplo items[0].quantity) el path es 'items.0.quantity'.

**AC-20. Error inesperado** (unitaria con app de prueba, apps/api)
- Dado una app de prueba con `errorHandler` y una ruta que lanza `new Error('detalle interno secreto')` (y otra que lanza un valor que no es Error, por ejemplo la cadena 'falla'),
- cuando se llama a esas rutas,
- entonces responden 500 con `{ error: { code: 'INTERNAL_ERROR', message: 'Ocurrió un error inesperado. Intenta nuevamente.', details: null } }` y el cuerpo no contiene 'detalle interno secreto' ni la traza (stack).

### 4.6 Migraciones y seeds

**AC-21. Migrar es seguro de repetir** (integración, apps/api, polleria_test)
- Dado polleria_test y las migraciones reales de apps/api/src/db/migrations,
- cuando se ejecuta `migrateUp(sequelize)` dos veces seguidas,
- entonces ninguna llamada lanza error, existe la tabla SequelizeMeta y la segunda llamada devuelve `[]`.

**AC-22. Aplicar y revertir migraciones en orden** (integración, apps/api, polleria_test)
- Dado dos migraciones de prueba (fixtures del test-writer) `20260101000000-create-fixture-a.ts` y `20260101000001-create-fixture-b.ts`, que crean las tablas fixture_a y fixture_b, y la tabla de registro FixtureMeta,
- cuando se ejecuta `migrateUp(sequelize, { glob, tableName: 'FixtureMeta' })`,
- entonces devuelve `['20260101000000-create-fixture-a.ts', '20260101000001-create-fixture-b.ts']` en ese orden, ambas tablas existen y FixtureMeta tiene ambos nombres;
- cuando luego se ejecuta `migrateDown(sequelize, { glob, tableName: 'FixtureMeta' })`,
- entonces devuelve `['20260101000001-create-fixture-b.ts']`, fixture_b ya no existe, fixture_a sigue existiendo y FixtureMeta solo tiene el nombre de a;
- y `migrateDown` sin migraciones aplicadas devuelve `[]`.

**AC-23. Los seeds se aplican una sola vez** (integración, apps/api, polleria_test)
- Dado polleria_test,
- cuando se ejecuta `seedUp(sequelize)` dos veces con los seeders reales,
- entonces no lanza error, existe la tabla SequelizeData y la segunda llamada devuelve `[]`;
- y con un seeder de prueba (glob propio y `tableName: 'FixtureData'`) que inserta una fila en una tabla de fixture, la primera llamada devuelve el nombre del seeder, la segunda devuelve `[]` y la tabla tiene una sola fila.

**AC-24. Comandos de base de datos** (integración con proceso real, apps/api, polleria_test)
- Dado el proceso `node --disable-warning=ExperimentalWarning apps/api/src/db/cli.ts <comando>` con DATABASE_URL de polleria_test y NODE_ENV=test,
- cuando se ejecuta `migrate` dos veces, entonces ambas terminan con código 0 y la segunda escribe en stdout 'No hay migraciones pendientes.';
- cuando se ejecuta `seed` dos veces, entonces ambas terminan con código 0 y la segunda escribe 'No hay seeds pendientes.';
- cuando se ejecuta `migrate:undo` y luego `migrate`, entonces ambos terminan con código 0 (sin migraciones aplicadas, `migrate:undo` escribe 'No hay migraciones para revertir.');
- cuando se ejecuta un comando desconocido (por ejemplo `borrar`) o ningún comando, entonces termina con código 1 y stderr contiene 'Comando desconocido. Usa: migrate, migrate:undo o seed.';
- cuando DATABASE_URL es `postgres://polleria:Clave_Secreta_99@127.0.0.1:1/polleria_test`, entonces termina con código 1, stderr contiene 'No se pudo conectar con la base de datos.' y no contiene 'Clave_Secreta_99';
- y cuando falta DATABASE_URL, termina con código 1 y stderr contiene 'Configuración inválida.'.

Formato de salida cuando sí hay trabajo: una línea por elemento, 'Migración aplicada: <nombre>', 'Migración revertida: <nombre>' o 'Seed aplicado: <nombre>'.

### 4.7 Web

**AC-25. Interpretación de la respuesta de salud** (unitaria, apps/web, con MSW)
- Dado `getServerStatus` y la API simulada con MSW en `*/api/health`,
- cuando responde 200 con `{ status: 'ok', database: 'ok', timestamp }` válido, devuelve 'connected';
- cuando responde 503 con `{ status: 'error', database: 'error', timestamp }` válido, devuelve 'databaseDown';
- cuando responde 500, 502 o 404, 200 con HTML, 200 o 503 con un cuerpo que no cumple healthResponseSchema, 200 con status 'error', o hay un error de red, devuelve 'unreachable';
- cuando no hay respuesta antes de `timeoutMs` (prueba con `timeoutMs: 50` y una respuesta que nunca llega), devuelve 'unreachable';
- en ningún caso lanza una excepción;
- y la solicitud es un GET a /api/health del mismo origen de la página.

**AC-26. Indicador de estado del servidor** (componente, apps/web, React Testing Library y MSW)
- Dado el componente ServerStatus dentro de un QueryClientProvider y la API simulada con MSW,
- mientras la primera consulta está en curso, el elemento con role="status" muestra 'Verificando conexión...';
- cuando la API responde 200 válido, muestra 'Conectado';
- cuando responde 503 válido, muestra 'Sin conexión con la base de datos';
- cuando hay error de red o responde 500, muestra 'Sin conexión con el servidor'.

**AC-27. Página inicial** (componente, apps/web)
- Dado la página de inicio (default export de apps/web/src/app/page.tsx) renderizada dentro de Providers, con la API simulada respondiendo 200 válido,
- cuando se muestra,
- entonces hay un encabezado de nivel 1 con el texto 'Sistema Pollería' y el indicador de estado (role="status") llega a mostrar 'Conectado'.

**AC-28. Configuración de la web** (unitaria, apps/web)
- Dado `loadWebServerConfig(env)`,
- cuando env no trae variables, devuelve `{ apiInternalUrl: 'http://127.0.0.1:4000', allowedDevOrigins: [] }`;
- cuando `API_INTERNAL_URL='http://192.168.1.50:4000/'`, devuelve apiInternalUrl 'http://192.168.1.50:4000' (sin barra final);
- cuando `WEB_ALLOWED_DEV_ORIGINS=' 192.168.1.20, ,192.168.1.21 '`, devuelve allowedDevOrigins `['192.168.1.20', '192.168.1.21']`;
- cuando `API_INTERNAL_URL` es 'ftp://192.168.1.50' o 'no-es-url', lanza un Error cuyo mensaje empieza con 'Configuración inválida de la web.' y nombra API_INTERNAL_URL;
- y el archivo versionado apps/web/.env.example contiene exactamente las variables de WEB_CONFIG_VARIABLES (API_INTERNAL_URL y WEB_ALLOWED_DEV_ORIGINS) y sus valores pasan la validación.

### 4.8 Extremo a extremo (Playwright, contra polleria_test)

**AC-29. Prueba de humo en PC y celular** (E2E)
- Dado la API (127.0.0.1:4100, polleria_test) y la web (puerto 3100) levantadas por Playwright,
- cuando se abre http://localhost:3100/ en el proyecto desktop-chrome (1366×768) y en el proyecto mobile-chrome (360×740, táctil),
- entonces el título del documento es 'Sistema Pollería', el elemento html tiene lang="es-PE", se ve el encabezado 'Sistema Pollería' y el indicador (role="status") muestra 'Conectado' antes de 10 s.

**AC-30. Sin recursos de internet** (E2E, RNF-05)
- Dado el mismo entorno,
- cuando se carga la página inicial y se espera 'Conectado',
- entonces todas las solicitudes HTTP y conexiones WebSocket del navegador van al host localhost:3100 (se ignoran las URL data: y blob:); ninguna va a otro host (fuentes de Google, CDN, analítica).

**AC-31. Sin desplazamiento horizontal en el celular** (E2E, RNF-07)
- Dado el proyecto mobile-chrome (360 px de ancho),
- cuando la página muestra 'Conectado',
- entonces `document.documentElement.scrollWidth` es menor o igual que `window.innerWidth`.

**AC-32. La API se alcanza por el mismo origen de la web** (E2E)
- Dado el mismo entorno,
- cuando se hace `GET http://localhost:3100/api/health` (a través de la web, no del puerto 4100),
- entonces responde 200 con un cuerpo que cumple healthResponseSchema con status 'ok' y con la cabecera `Cache-Control: no-store`.

### 4.9 Cobertura de RNF

| RNF | AC y requisitos que lo cubren |
| --- | --- |
| RNF-05 | AC-29, AC-30, AC-32; R-14 |
| RNF-07 | AC-29, AC-31; D-09 (SUPUESTO S-01) |
| RNF-12 | AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-28; R-13 |

## 5. Requisitos de configuración (verificados por comando)

No son comportamiento, por eso no llevan AC. El orquestador y el reviewer los verifican con el comando indicado. Los comandos con grep se ejecutan en Git Bash.

| ID | Requisito | Comando | Resultado esperado |
| --- | --- | --- | --- |
| R-01 | package.json raíz con `"packageManager": "pnpm@10.12.1"`, `"engines": { "node": ">=24.1.0 <25" }`, `"private": true` y `"type": "module"`. | `pnpm install --frozen-lockfile` | Termina con código 0 en Node 24.1.0 y pnpm 10.12.1. |
| R-02 | Versiones exactas en todos los package.json (sin ^ ni ~; solo `workspace:*` para @polleria/shared). Archivo .npmrc con `save-exact=true`. Versiones según el ADR 0001. | `grep -nE '"[~^][0-9]' package.json apps/*/package.json packages/*/package.json` | Sin resultados. |
| R-03 | pnpm-workspace.yaml con apps/* y packages/*. Paquetes @polleria/web, @polleria/api y @polleria/shared, todos `"private": true` y `"type": "module"`. | `pnpm -r ls --depth -1` | Lista los tres paquetes. |
| R-04 | Scripts raíz con estos nombres exactos: dev, test, test:e2e, test:coverage, lint, typecheck, db:migrate, db:seed. Se permite además format (prettier --write). | `pnpm run` | Muestra los ocho scripts. |
| R-05 | tsconfig.base.json con strict, noUncheckedIndexedAccess, noImplicitOverride, verbatimModuleSyntax, isolatedModules y skipLibCheck. api y shared agregan erasableSyntaxOnly, allowImportingTsExtensions, noEmit, module y moduleResolution nodenext. web extiende la base con lo que exige Next (moduleResolution bundler, jsx react-jsx, plugin next). Cada tsconfig declara types de forma explícita (por ejemplo node). | `pnpm typecheck` | Código 0. Revisa apps/api, apps/web (con `next typegen` antes de tsc), packages/shared, e2e/ y los archivos de configuración de la raíz. |
| R-06 | ESLint 10 con configuración plana en eslint.config.js de la raíz: @eslint/js recommended, typescript-eslint recommendedTypeChecked (projectService), react-hooks en apps/web, no-restricted-imports que prohíbe next/font/google, y no-restricted-syntax que prohíbe llamar a `.sync(` en apps/api/src (regla 6 de CLAUDE.md). | `pnpm lint` y `pnpm exec eslint --print-config apps/web/src/app/page.tsx` | lint termina con código 0 y cero advertencias (`--max-warnings=0`); print-config muestra las reglas. |
| R-07 | Prettier 3 con .prettierrc.json (singleQuote true, printWidth 100, endOfLine lf; el resto por defecto) y .prettierignore con docs/, .claude/, CLAUDE.md, pnpm-lock.yaml, .next/, coverage/, playwright-report/, test-results/, tmp/ y dist/. | `pnpm lint` (incluye `prettier --check .`) | Código 0. |
| R-08 | vitest.config.ts en la raíz con cuatro proyectos: shared (node, `packages/shared/{src,tests}/**/*.test.ts`), api-unit (node, `apps/api/src/**/*.test.ts`), api-integration (node, `apps/api/tests/**/*.test.ts`, archivos en serie, testTimeout 15000) y web (jsdom 29.1.1, `apps/web/{src,tests}/**/*.test.{ts,tsx}`). e2e/ queda fuera. JSX automático sin @vitejs/plugin-react. | `pnpm test` | Ejecuta los cuatro proyectos. |
| R-09 | Cobertura v8 con include `packages/shared/src/**`, `apps/api/src/**` y `apps/web/src/**`; exclude pruebas, `*.d.ts`, archivos de configuración, apps/api/src/server.ts, apps/api/src/db/cli.ts, apps/api/src/db/migrations/**, apps/api/src/db/seeders/** y apps/web/src/app/layout.tsx. Umbrales de líneas: 90 en `packages/shared/src/**`, 90 en `apps/api/src/services/**` y 80 global para el resto. | `pnpm test:coverage` | Código 0; falla si no se alcanza algún umbral. |
| R-10 | playwright.config.ts en la raíz: testDir e2e, testMatch `**/*.spec.ts`, proyectos desktop-chrome (1366×768) y mobile-chrome (360×740, isMobile, hasTouch, Chromium), baseURL http://localhost:3100. webServer de la API: `node --disable-warning=ExperimentalWarning apps/api/src/server.ts` con NODE_ENV=test, HOST=127.0.0.1, PORT=4100 y DATABASE_URL = DATABASE_URL_TEST; espera http://127.0.0.1:4100/api/health. webServer de la web: `next dev --port 3100` en apps/web con API_INTERNAL_URL=http://127.0.0.1:4100; espera http://localhost:3100. `reuseExistingServer: false` y timeout de 120 s. Antes de levantar nada, lee DATABASE_URL_TEST (del entorno o de apps/api/.env sin sobrescribir) y la verifica con assertTestDatabase; si falta o no es de pruebas, aborta con un mensaje en español. | `pnpm test:e2e` (con `pnpm dev` detenido) | Código 0 cuando la implementación está completa. |
| R-11 | `pnpm dev` levanta en paralelo la API (`node --watch --env-file-if-exists=.env --disable-warning=ExperimentalWarning src/server.ts`, en 127.0.0.1:4000) y la web (`next dev --hostname 0.0.0.0 --port 3000`) con `pnpm -r --parallel`, sin concurrently, nodemon ni tsx. | `pnpm dev` y abrir http://localhost:3000 | La página muestra 'Conectado' (verificación manual). |
| R-12 | `pnpm db:migrate` y `pnpm db:seed` delegan en @polleria/api (`node --env-file-if-exists=.env --disable-warning=ExperimentalWarning src/db/cli.ts migrate` o `seed`) y usan DATABASE_URL (polleria_dev). @polleria/api tiene además el script db:migrate:undo. | `pnpm db:migrate` y `pnpm db:seed` | Código 0 con 'No hay migraciones pendientes.' y 'No hay seeds pendientes.' (en esta spec no hay ninguno). |
| R-13 | apps/api/.env.example y apps/web/.env.example versionados; los .env reales ignorados por git. | `git check-ignore apps/api/.env apps/web/.env` y `git ls-files "*.env.example"` | El primero lista los dos .env; el segundo lista los dos .env.example. |
| R-14 | La web no usa recursos de internet: fuentes del sistema (pila system-ui de Tailwind), sin next/font/google ni CDN. | `grep -rn -e "next/font/google" -e "fonts.googleapis" -e "fonts.gstatic" -e "unpkg" -e "jsdelivr" -e "cdnjs" apps/web/src apps/web/next.config.ts` | Sin resultados. |
| R-15 | Scripts compatibles con Windows: sin `VAR=valor` en línea, sin `rm -rf` y sin `&` para segundo plano (las variables para procesos hijos se pasan desde playwright.config.ts o desde las pruebas). | Ejecutar R-01, R-04 a R-12 en PowerShell sobre Windows 11 | Todos funcionan igual que en Git Bash. |
| R-16 | docs/api/openapi.yaml es OpenAPI 3.1 válido. | `npx -y @redocly/cli@latest lint docs/api/openapi.yaml` (ejecución puntual, no es dependencia del proyecto) | "valid", sin errores (se aceptan advertencias). |

## 6. Reglas de negocio aplicables

De CLAUDE.md:
- Regla de dominio 8: zona horaria America/Lima. Se publica como TIME_ZONE en packages/shared; las fechas viajan en UTC (ISO con Z) y se guardan en UTC.
- Regla de dominio 9: funciona en la red local sin internet. Ver D-01, AC-30 y R-14.
- Reglas de dominio 1 y 2 (octavos y céntimos): no aplican todavía; quedan fijadas las convenciones de nombres (D-10).
- Base de datos local: ningún agente crea, borra ni recrea bases o roles; los tests usan siempre DATABASE_URL_TEST y verifican que la base termine en _test antes de truncar o sincronizar.
- Reglas para todos los agentes 6 y 7: nada de `sequelize.sync({ force: true })` fuera de los tests (reforzado con una regla de ESLint, R-06) y nada de secretos en el repositorio (.env.example con clave de ejemplo).

Específicas de esta spec:
- RN-001-01. Ninguna respuesta HTTP, mensaje de error ni línea de log de la API incluye el valor de DATABASE_URL, DATABASE_URL_TEST ni la clave de la base.
- RN-001-02. Toda prueba que toque una base usa una cuyo nombre termine en _test: se verifica con assertTestDatabase antes de conectar y, ya conectada, con `SELECT current_database()` antes de truncar o hacer sync({ force: true }).
- RN-001-03. Los E2E usan polleria_test y nunca reutilizan un servidor ya levantado.
- RN-001-04. La web no carga recursos de internet.
- RN-001-05. Mensajes al usuario en español de Perú; códigos de error en inglés.
- RN-001-06. /api/health es público y seguirá siéndolo cuando exista autenticación.

## 7. Casos borde conocidos

- polleria_test no existe o la clave es incorrecta: los tests de integración fallan con un mensaje en español del helper de pruebas. Ningún agente intenta crearla; se reporta al orquestador.
- PostgreSQL apagado al arrancar la API: la API arranca igual, /api/health responde 503 y la web muestra 'Sin conexión con la base de datos'.
- PostgreSQL se cae con la API en marcha: la siguiente consulta de salud responde 503; cuando vuelve, responde 200 sin reiniciar la API.
- Base lenta o colgada: /api/health responde 503 a los 2 s como máximo, en lugar de esperar indefinidamente.
- API caída con la web en marcha: el rewrite de Next.js no obtiene respuesta (Next responde con un error 5xx propio) y la web muestra 'Sin conexión con el servidor'.
- Puerto 4000 ocupado: la API termina con código 1 y el mensaje de AC-08.
- Windows: localhost puede resolver a ::1; por eso API_INTERNAL_URL usa 127.0.0.1. En Windows una conexión a un puerto cerrado puede tardar unos 2 s en fallar; los tiempos de AC-13 y AC-24 lo contemplan.
- `pnpm dev` corriendo durante `pnpm test:e2e`: Next 16 se niega a abrir un segundo `next dev` en la misma carpeta y la prueba falla con "Another next dev server is already running". Se detiene `pnpm dev` y se repite.
- Celular en modo desarrollo: si la IP de la PC no está en WEB_ALLOWED_DEV_ORIGINS, Next bloquea con 403 los recursos /_next y la página no funciona. Además, el Firewall de Windows debe permitir Node.js en la red privada para el puerto 3000.
- La IP de la PC cambia (DHCP del router): los celulares deben usar la nueva IP. Reservar una IP fija en el router queda como recomendación de instalación, fuera de alcance.
- Consultas periódicas de salud: cada 10 s. Durante una nueva consulta se mantiene el último estado mostrado; 'Verificando conexión...' solo aparece en la primera carga.
- POST /api/health responde 404 (Express no distingue 405). HEAD /api/health responde como GET pero sin cuerpo. Express no distingue mayúsculas ni barra final por defecto: /api/health/ responde 200.
- JSON inválido en una ruta inexistente responde 400 INVALID_JSON y no 404, porque el cuerpo se interpreta antes de buscar la ruta.
- Un cuerpo JSON de exactamente 100 KB se acepta; el límite rechaza lo que lo supera.
- Se lanza un valor que no es Error (por ejemplo una cadena): 500 INTERNAL_ERROR.
- Vitest define NODE_ENV=test en su proceso. Las pruebas que arrancan procesos (AC-08, AC-09, AC-24) arman el entorno del hijo a partir de una copia de process.env, cambiando solo las variables del caso: en Windows, sin SystemRoot fallan los sockets.
- Node 24.1.0 muestra un ExperimentalWarning por el type stripping; los scripts lo ocultan con `--disable-warning=ExperimentalWarning`.
- Chrome sin actualizar (110 o menor) en un Android 9: la página puede verse sin estilos (ver D-09).

## 8. Modelo de datos

Esta spec no crea tablas de dominio.

Tablas técnicas que crea umzug (SequelizeStorage) al ejecutar migraciones y seeds:

| Tabla | Columnas | Restricciones | Uso |
| --- | --- | --- | --- |
| SequelizeMeta | name VARCHAR(255) | PRIMARY KEY, NOT NULL | Nombre de cada migración aplicada (con extensión .ts). |
| SequelizeData | name VARCHAR(255) | PRIMARY KEY, NOT NULL | Nombre de cada seed aplicado. |

Configuración de la conexión (createSequelize): dialecto postgres, logging desactivado, `timezone: '+00:00'`, `define.underscored: true`, pool con tiempo de adquisición acotado (alrededor de 10 s) y tiempo límite de conexión acotado (alrededor de 5 s), para no colgar la API si la base no responde.

## 9. API

### 9.1 GET /api/health

- Rol requerido: ninguno (público).
- Request: sin parámetros ni cuerpo.
- Response 200 (base disponible):

```json
{ "status": "ok", "database": "ok", "timestamp": "2026-10-07T20:00:00.000Z" }
```

- Response 503 (base caída o más de 2 s sin responder):

```json
{ "status": "error", "database": "error", "timestamp": "2026-10-07T20:00:00.000Z" }
```

- Cabeceras: `Content-Type: application/json`, `Cache-Control: no-store`. Sin X-Powered-By ni Access-Control-Allow-Origin.
- El cuerpo tiene exactamente esas tres claves. Nunca incluye URL, usuario, clave, host ni mensajes del driver.
- Errores posibles: 500 INTERNAL_ERROR (no esperado).

### 9.2 Formato común de error

```json
{ "error": { "code": "NOT_FOUND", "message": "La ruta solicitada no existe.", "details": null } }
```

| code | HTTP | message | details |
| --- | --- | --- | --- |
| NOT_FOUND | 404 | La ruta solicitada no existe. | null |
| INVALID_JSON | 400 | El cuerpo de la solicitud no es un JSON válido. | null |
| VALIDATION_ERROR | 400 | Los datos enviados no son válidos. | `{ issues: [{ path, message }] }` |
| PAYLOAD_TOO_LARGE | 413 | La solicitud es demasiado grande. | null |
| INTERNAL_ERROR | 500 | Ocurrió un error inesperado. Intenta nuevamente. | null |

Orden de middlewares en createApp: (1) `app.disable('x-powered-by')`; (2) `express.json({ limit: '100kb' })`; (3) router de la API montado en /api; (4) notFoundHandler para cualquier otra ruta; (5) errorHandler. Sin middleware de CORS. Los errores inesperados se registran en el log del servidor con su traza, sin el cuerpo de la solicitud y sin URL de base de datos.

### 9.3 Socket.IO

Sin eventos en esta spec. Socket.IO no se instala todavía.

### 9.4 Contrato

docs/api/openapi.yaml (OpenAPI 3.1): path /health con servidor base /api; esquemas HealthStatus, HealthResponse, ErrorCode, ValidationIssue, ErrorDetails y ErrorResponse; cabecera CacheControlNoStore; respuestas reutilizables InvalidJson, ValidationError, NotFound, PayloadTooLarge e InternalError.

## 10. Interfaz

### Pantalla "Inicio" (ruta /)

- Quién la usa: cualquiera en el local (dueño, cajero, mozo). Todavía no hay inicio de sesión.
- Dispositivos: celular Android del mozo (360 px de ancho, Chrome) y PC de caja con Windows 10+ (Chrome o Edge).
- Contenido:
  - Encabezado h1 'Sistema Pollería'.
  - Indicador de estado con role="status" y aria-live="polite": un componente de HeroUI (por ejemplo Chip) con color según el estado y el texto del estado. El color nunca es la única señal: siempre hay texto.
  - Diseño mobile-first, centrado, texto de al menos 18 px, sin desplazamiento horizontal a 360 px.
  - Fuentes del sistema; ningún recurso externo.
- Documento: `<html lang="es-PE">`, título 'Sistema Pollería'.

| Estado | Cuándo | Texto exacto | Color sugerido |
| --- | --- | --- | --- |
| Cargando | Primera consulta en curso | Verificando conexión... | Gris |
| Conectado | /api/health 200 válido con status ok | Conectado | Verde |
| Sin base de datos | /api/health 503 con HealthResponse válido | Sin conexión con la base de datos | Ámbar |
| Sin servidor | Error de red, tiempo límite (5 s), 5xx distinto del anterior, 404 o cuerpo inválido | Sin conexión con el servidor | Rojo |

- No hay estado vacío.
- Datos con TanStack Query: queryKey ['health'], `refetchInterval` 10 000 ms y `retry: false` (la consulta periódica hace de reintento). getServerStatus nunca lanza, así que la consulta siempre termina con un estado.

## 11. Contrato interno de módulos (rutas que importan las pruebas)

El test-writer importa desde estas rutas; si un módulo no existe todavía, la prueba falla por módulo inexistente (rojo válido).

- **packages/shared/src/index.ts** (se importa como `@polleria/shared`)
  - `TIME_ZONE`: 'America/Lima' (tipo literal).
  - `healthResponseSchema` (objeto Zod estricto) y `type HealthResponse`.
  - `errorResponseSchema` y `type ErrorResponse`.
  - `ERROR_CODES` (objeto `as const`) y `type ErrorCode`.
- **apps/api/src/config/env.ts**
  - `loadConfig(env: Record<string, string | undefined>): AppConfig`.
  - `type AppConfig = { nodeEnv: 'development' | 'test' | 'production'; host: string; port: number; databaseUrl: string; databaseUrlTest: string | undefined }`.
  - `class ConfigError extends Error` con `issues: { variable: string; message: string }[]`.
  - `CONFIG_VARIABLES`: lista `as const` con NODE_ENV, HOST, PORT, DATABASE_URL y DATABASE_URL_TEST.
- **apps/api/src/db/assert-test-database.ts**
  - `assertTestDatabase(databaseUrl: string | undefined): string` (devuelve el nombre de la base).
  - `class UnsafeTestDatabaseError extends Error`.
- **apps/api/src/db/sequelize.ts**
  - `createSequelize(databaseUrl: string): Sequelize`.
- **apps/api/src/db/migrator.ts**
  - `migrateUp(sequelize, options?)`, `migrateDown(sequelize, options?)` (revierte solo la última) y `seedUp(sequelize, options?)`, con `options = { glob?: string; tableName?: string }`.
  - Todas devuelven `Promise<string[]>` con los nombres de archivo procesados, en orden.
  - Por defecto: migraciones en src/db/migrations con la tabla SequelizeMeta; seeds en src/db/seeders con la tabla SequelizeData.
- **apps/api/src/db/cli.ts**
  - Punto de entrada con los comandos `migrate`, `migrate:undo` y `seed`. Solo lee process.env.
- **apps/api/src/errors/app-error.ts**
  - `class AppError extends Error` con `code: string`, `httpStatus: number` y `details: Record<string, unknown> | null`.
  - Constructor: `new AppError({ code, message, httpStatus, details? })`.
- **apps/api/src/middlewares/error-handler.ts**
  - `errorHandler` (ErrorRequestHandler) y `notFoundHandler` (RequestHandler).
- **apps/api/src/services/health.service.ts**
  - `createHealthService({ sequelize, timeoutMs?, now? })`, con `sequelize: Pick<Sequelize, 'authenticate'>` y `now: () => Date`; devuelve `{ check(): Promise<HealthResponse> }`.
  - `DEFAULT_HEALTH_TIMEOUT_MS` = 2000.
- **apps/api/src/app.ts**
  - `createApp(deps: { sequelize: Sequelize; healthTimeoutMs?: number }): Express`. No llama a listen.
- **apps/api/src/server.ts**
  - Punto de entrada: loadConfig(process.env), createSequelize, createApp y listen. Cierra el servidor y la conexión al recibir SIGINT o SIGTERM.
- **apps/web/src/lib/api/health.ts**
  - `type ServerConnectionStatus = 'connected' | 'databaseDown' | 'unreachable'`.
  - `getServerStatus(options?: { timeoutMs?: number }): Promise<ServerConnectionStatus>`. Arma la URL con `window.location.origin` + '/api/health'.
  - `DEFAULT_HEALTH_TIMEOUT_MS` = 5000.
- **apps/web/src/components/server-status.tsx**
  - `ServerStatus`: componente cliente, sin props.
- **apps/web/src/app/providers.tsx**
  - `Providers`: componente cliente con QueryClientProvider.
- **apps/web/src/app/page.tsx**
  - default export: página de inicio. Componente síncrono, sin APIs exclusivas del servidor, para poder probarlo con React Testing Library.
- **apps/web/src/app/layout.tsx**
  - `metadata` con title 'Sistema Pollería'; `<html lang="es-PE">`; envuelve el contenido con Providers.
- **apps/web/src/config/server-env.ts**
  - `loadWebServerConfig(env: Record<string, string | undefined>): { apiInternalUrl: string; allowedDevOrigins: string[] }`. Lo usa next.config.ts.
  - `WEB_CONFIG_VARIABLES`: lista `as const` con API_INTERNAL_URL y WEB_ALLOWED_DEV_ORIGINS.

Rutas sugeridas para pruebas: unitarias junto al código (`*.test.ts`, `*.test.tsx`); integración de la API en apps/api/tests/ (helpers en apps/api/tests/helpers/, fixtures en apps/api/tests/fixtures/); E2E en e2e/*.spec.ts.

## 12. Dependencias de soporte que requieren aprobación

Detalle, versiones y alternativas en docs/decisions/0001-stack-y-versiones.md. Versiones consultadas en npm el 2026-10-07.

### 12.1 Complementos obligatorios de librerías ya aprobadas (no hay alternativa real)

| Paquete | Versión | Dónde | Justificación |
| --- | --- | --- | --- |
| pg | 8.23.1 | api | Driver de PostgreSQL que Sequelize exige para el dialecto postgres. |
| @heroui/styles | 3.2.6 | web | Hoja de estilos de HeroUI v3; se importa desde globals.css, así que debe ser dependencia directa con pnpm. |
| react-aria-components, react-aria, @react-aria/ssr, @react-aria/utils, @internationalized/date | 1.21.1, 3.52.1, 3.10.1, 3.34.1, 3.12.4 | web | peerDependencies de @heroui/react 3.2.6; se declaran para fijar versión exacta. |
| @tailwindcss/postcss, postcss | 4.3.3, 8.5.29 | web | Integración oficial de Tailwind 4 con Next.js. |
| @testing-library/dom | 10.4.2 | web | peerDependency obligatoria de @testing-library/react 16. |
| typescript-eslint, @eslint/js | 8.71.1, 10.0.1 | raíz | Necesarios para que ESLint (pedido para la Fase 0) entienda TypeScript y aplique las reglas recomendadas. |

### 12.2 Herramientas de soporte (elección nuestra)

| Paquete | Versión | Dónde | Justificación |
| --- | --- | --- | --- |
| umzug | 3.8.3 | api | Ejecuta migraciones y seeds en TypeScript con API programática para pruebas (D-05). Reemplaza a sequelize-cli. |
| @vitest/coverage-v8 | 5.0.3 | raíz | Proveedor de cobertura de Vitest; necesario para `pnpm test:coverage` y los umbrales. Debe coincidir con vitest. |
| jsdom | 29.1.1 | raíz | Entorno de navegador para las pruebas de componentes. Se fija la 29.1.1 porque jsdom 30 exige Node 24.15 o superior y el entorno tiene 24.1.0. |
| @types/node | 24.19.1 | raíz, api | Tipos de Node, de la línea 24 para coincidir con el runtime. |
| @types/express | 5.0.6 | api | Tipos de Express 5. |
| @types/supertest | 7.2.1 | api | Tipos de Supertest. |
| @types/react, @types/react-dom | 19.3.0, 19.3.0 | web | React 19 no trae tipos propios. |

### 12.3 Opcionales (se pueden omitir sin afectar los AC)

| Paquete | Versión | Dónde | Justificación |
| --- | --- | --- | --- |
| eslint-plugin-react-hooks | 7.1.1 | raíz | Detecta errores reales en hooks (reglas de hooks, dependencias). Recomendada. Si no se aprueba, se quita de R-06. |
| @testing-library/jest-dom | 7.0.1 | web | Comparadores legibles (toBeInTheDocument, toBeDisabled) útiles desde la Fase 2. En esta spec no son necesarios. |

### 12.4 Diferidas (aprobadas en CLAUDE.md, se instalan cuando se usen)

socket.io 4.8.4 y socket.io-client (spec con el primer evento), bcrypt (Fase 1), node-thermal-printer 4.6.1 (spec 002 o Fase 3), fast-check 4.10.2 (cuando el adversarial-tester lo use) y openapi-typescript 7.13.0. Atención: openapi-typescript 7.13.0 declara `typescript ^5.x` como peerDependency y el proyecto fija TypeScript 6.0.3; se resolverá en la spec que lo instale (ver ADR). En esta spec la web tipa la salud con el esquema Zod de packages/shared.

### 12.5 Descartadas por existir una capacidad nativa

dotenv (se usa `--env-file-if-exists` y `process.loadEnvFile`), tsx y ts-node (type stripping de Node 24), nodemon (`node --watch`), concurrently (`pnpm -r --parallel`), cross-env (variables desde playwright.config.ts), cors (mismo origen por rewrites), sequelize-cli (umzug), pg-hstore (Sequelize solo lo carga al usar el tipo HSTORE; verificado en su código), eslint-config-prettier (las configuraciones elegidas no traen reglas de formato), @vitejs/plugin-react (JSX automático por tsconfig `jsx: react-jsx`; si no bastara, se pide aprobación), happy-dom (se usa jsdom), @testing-library/user-event (no hay interacción en esta spec), eslint-config-next (solo react-hooks).

## 13. Fuera de alcance

- PrinterService y sus drivers (spec 002).
- Autenticación, sesión, PIN, roles y requireRole.
- Cualquier tabla, modelo, migración o seed de dominio (productos, mesas, pedidos, etc.).
- Socket.IO (no se instala ni hay eventos; solo queda decidida la vía en D-01).
- Docker, despliegue, compilación de producción para el local, servicio de Windows, copia de seguridad (RNF-06) y configuración del router o del firewall.
- Generación de tipos con openapi-typescript y cliente HTTP central con manejo de sesión (llegan con la primera spec que los necesite).
- PWA (manifest, service worker) y modo sin conexión de la web.
- Formateo de montos en soles y cualquier función de dominio en packages/shared.
- Configuración desde la interfaz (RNF-12 completo llega con la carta y las mesas en fases posteriores).

## 14. Supuestos

| ID | Supuesto |
| --- | --- |
| S-01 | Los celulares Android 9 de los mozos tienen Chrome actualizado a la versión 111 o superior (máximo 138 en Android 9). |
| S-02 | La web y la API se comunican en el mismo origen con rewrites de Next.js, y la API usa el prefijo /api (la salud queda en /api/health, no en /health). |
| S-03 | /api/health responde 503 con HealthResponse, no con el formato común de error. |
| S-04 | La API arranca aunque la base no responda. |
| S-05 | La guardia distingue mayúsculas y solo acepta nombres `^[a-z0-9_]+_test$`. |
| S-06 | Cada seed se registra en SequelizeData y se aplica una sola vez. |
| S-07 | Para correr los E2E hay que detener `pnpm dev` antes. |
| S-08 | La API escucha solo en 127.0.0.1 por defecto; los celulares entran únicamente por la web. |
| S-09 | Los códigos de error van en inglés (por ejemplo INSUFFICIENT_STOCK en el futuro), aunque backend-dev.md menciona STOCK_INSUFICIENTE. |
| S-10 | Tiempos: 2 s de límite para la base en /api/health, 5 s de límite en la web y consulta cada 10 s. |
| S-11 | Se mantiene Node 24.1.0 (ya instalado); por eso jsdom queda en 29.1.1. |

## 15. Preguntas abiertas para el usuario

1. ¿Qué versión de Chrome tienen los celulares de los mozos? (se ve en chrome://version). Si alguno tiene menos de 111, la página puede verse sin estilos (S-01).
2. ¿Apruebas que la API use el prefijo /api y que la salud quede en /api/health, con la web reenviando /api al servidor (mismo origen, sin CORS)? (S-02, S-08)
3. ¿Apruebas las dependencias de soporte de la sección 12 (12.1 y 12.2) y cuáles de las opcionales (12.3) quieres incluir?
4. ¿Prefieres actualizar Node a la última versión 24.x LTS antes de empezar? Quitaría el aviso experimental del type stripping en versiones recientes y permitiría jsdom 30. Si no, seguimos con 24.1.0 y jsdom 29.1.1 (S-11).
5. ¿Códigos de error en inglés (INSUFFICIENT_STOCK) o mantener STOCK_INSUFICIENTE como dice backend-dev.md? Conviene corregir uno de los dos para que no haya contradicción (S-09).
6. ¿Te parece bien que para correr `pnpm test:e2e` haya que detener `pnpm dev`? La alternativa es que los E2E usen una compilación de producción, que es más lenta (alrededor de un minuto más por corrida) (S-07).
7. ¿Los datos de demostración (seeds) deben aplicarse una sola vez, o prefieres poder recargarlos desde cero cuando quieras? (S-06)

### Respuestas del usuario (2026-10-07)

1. Chrome de los celulares: se acepta el supuesto S-01 (Chrome 111 o superior). Se confirmará con el dueño.
2. Prefijo /api y mismo origen sin CORS: aprobado (S-02, S-08).
3. Dependencias de soporte: aprobadas 12.1 y 12.2, y también las dos opcionales de 12.3 (eslint-plugin-react-hooks y @testing-library/jest-dom).
4. Node: se mantiene 24.1.0 y jsdom 29.1.1 (S-11).
5. Códigos de error en inglés (S-09). Se corrigió .claude/agents/backend-dev.md: STOCK_INSUFICIENTE pasa a INSUFFICIENT_STOCK.
6. Se acepta detener  ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND  No package.json (or package.yaml, or package.json5) was found in "C:UsersrayaDesktopproyectos1polleria". antes de  ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND  No package.json (or package.yaml, or package.json5) was found in "C:UsersrayaDesktopproyectos1polleria". (S-07).
7. Los seeds se aplican una sola vez (S-06). En la Fase 6 se decidirá si hace falta recargar la demo.

## 16. Verificación manual sugerida (para el usuario)

1. Con PostgreSQL encendido y apps/api/.env creado a partir de .env.example: `pnpm install`, `pnpm db:migrate`, `pnpm dev`; abrir http://localhost:3000 en la PC: debe decir 'Conectado'.
2. Detener el servicio de PostgreSQL: en menos de 15 s la página debe decir 'Sin conexión con la base de datos'. Encenderlo: vuelve a 'Conectado'.
3. Detener solo la API: la página debe decir 'Sin conexión con el servidor'.
4. Desde un celular Android en el mismo wifi, con la IP de la PC en WEB_ALLOWED_DEV_ORIGINS (apps/web/.env) y el firewall permitiendo Node.js: abrir http://<IP-de-la-PC>:3000 y ver 'Conectado'. Repetir con el router sin internet.
