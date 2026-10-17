# Tareas — Spec 001: base del monorepo, salud de la API y web mínima

- Spec: docs/specs/001-base-monorepo/spec.md (Aprobada; enmienda 1 aprobada el 2026-10-07, tareas T-26 a T-35 al final)
- Rama: feat/001-base-monorepo
- Contrato: docs/api/openapi.yaml
- ADR: docs/decisions/0001-stack-y-versiones.md (Propuesto). Las versiones exactas salen de ahí.

## Orden y por qué

Esta es la fase base, así que el orden resuelve el problema del huevo y la gallina de TDD:

1. **Andamiaje (T-01 a T-06)**: solo configuración, sin comportamiento. backend-dev arma la raíz del monorepo, packages/shared, backend y Vitest; frontend-dev arma frontend y Playwright. Al terminar, Vitest y Playwright funcionan y el test-writer puede escribir pruebas.
2. **Pruebas en rojo (T-07 a T-16)**: test-writer escribe las pruebas de los 32 AC y confirma que fallan por la razón correcta (módulo inexistente o comportamiento ausente).
3. **Implementación (T-17 a T-25)**: backend-dev y frontend-dev implementan hasta dejar todo en verde, sin tocar pruebas.

Reglas para el andamiaje:
- No se crea ningún módulo de la sección 11 de la spec ni ningún archivo de prueba (`*.test.ts`, `*.test.tsx`, tests/, e2e/). Si un archivo de configuración necesita un placeholder, que no tenga comportamiento (por ejemplo `export {}` o una página que devuelve `<main />`).
- Las versiones van exactas, tal como el ADR 0001. Si al instalar aparece un conflicto de peerDependencies o una versión no existe, detenerse y reportarlo al orquestador; no cambiar versiones por cuenta propia.
- Si pnpm 10 avisa "Ignored build scripts", aprobar solo los paquetes que realmente lo necesitan (onlyBuiltDependencies en pnpm-workspace.yaml) y anotarlo en el reporte.
- Commits del andamiaje con prefijo feat: (por ejemplo `feat(001): andamiaje del monorepo`) y sin archivos de prueba.

Verificación al cerrar el andamiaje (la ejecuta el orquestador antes de T-07): `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test --passWithNoTests` y `pnpm test:e2e --list --pass-with-no-tests` terminan con código 0.

## Andamiaje (solo configuración)

### T-01. Raíz del monorepo
- Responsable: backend-dev
- Dependencias: ninguna
- AC: ninguno (requisitos R-01, R-02, R-03, R-04, R-05, R-06, R-07, R-15)
- Descripción:
  - package.json raíz: `"private": true`, `"type": "module"`, `"packageManager": "pnpm@10.12.1"`, `"engines": { "node": ">=24.1.0 <25" }`.
  - pnpm-workspace.yaml (apps/*, packages/*) y .npmrc con `save-exact=true`.
  - devDependencies raíz: typescript 6.0.3, eslint 10.12.0, @eslint/js 10.0.1, typescript-eslint 8.71.1, prettier 3.9.9, @types/node 24.19.1 y, si se aprueba, eslint-plugin-react-hooks 7.1.1.
  - tsconfig.base.json (R-05) y tsconfig.json raíz que cubre e2e/ y los archivos de configuración de la raíz.
  - eslint.config.js con las reglas de R-06 (incluye no-restricted-imports de next/font/google y no-restricted-syntax para `.sync(` en backend/src).
  - .prettierrc.json y .prettierignore (R-07).
  - Scripts raíz con los ocho nombres de R-04. Referencia: `dev` = `pnpm -r --parallel run dev`; `test` = `vitest run`; `test:coverage` = `vitest run --coverage`; `test:e2e` = `playwright test`; `lint` = `eslint . --max-warnings=0 && prettier --check .`; `typecheck` = `tsc -p tsconfig.json && pnpm -r run typecheck`; `db:migrate` y `db:seed` delegan en `pnpm --filter @polleria/api run <script>`; opcional `format` = `prettier --write .`. Los scripts que dependen de herramientas de tareas posteriores pueden fallar hasta que esas tareas terminen.
  - Scripts compatibles con Windows (R-15).
- Terminado cuando: `pnpm install` y `pnpm lint` terminan con código 0. El `tsc -p tsconfig.json` de la raíz se verifica al cerrar T-05 (antes no hay archivos .ts que incluir y tsc falla con TS18003). En eslint.config.js, los archivos de configuración que no pertenecen a ningún tsconfig necesitan `allowDefaultProject` o quedar fuera de las reglas con tipos.

### T-02. Andamiaje de packages/shared
- Responsable: backend-dev
- Dependencias: T-01
- AC: ninguno
- Descripción:
  - packages/shared/package.json: nombre @polleria/shared, `"private": true`, `"type": "module"`, `"exports": { ".": "./src/index.ts" }`, dependencia zod 4.6.5, script typecheck (`tsc --noEmit`).
  - tsconfig.json que extiende la base con erasableSyntaxOnly, allowImportingTsExtensions, noEmit, module y moduleResolution nodenext, sin tipos de Node ni del DOM.
  - src/index.ts con `export {}` (sin constantes ni esquemas: los define T-17).
- Terminado cuando: `pnpm --filter @polleria/shared run typecheck` termina con código 0.

### T-03. Andamiaje de backend
- Responsable: backend-dev
- Dependencias: T-01, T-02
- AC: ninguno (requisitos R-12, R-13)
- Descripción:
  - backend/package.json: nombre @polleria/api, `"private": true`, `"type": "module"`. dependencies: express 5.2.1, sequelize 6.37.8, pg 8.23.1, umzug 3.8.3, zod 4.6.5, @polleria/shared `workspace:*`. devDependencies: supertest 7.3.1, @types/express 5.0.6, @types/supertest 7.2.1, @types/node 24.19.1.
  - Scripts (aún apuntan a archivos que crean T-21 y T-22): `dev` = `node --watch --env-file-if-exists=.env --disable-warning=ExperimentalWarning src/server.ts`; `start` = lo mismo sin `--watch`; `typecheck` = `tsc --noEmit`; `db:migrate`, `db:migrate:undo` y `db:seed` = `node --env-file-if-exists=.env --disable-warning=ExperimentalWarning src/db/cli.ts <migrate|migrate:undo|seed>`.
  - tsconfig.json que extiende la base (erasableSyntaxOnly, allowImportingTsExtensions, noEmit, nodenext, `types: ["node"]`) e incluye src y tests.
  - Carpetas con .gitkeep: src/routes, src/controllers, src/services, src/models, src/middlewares, src/errors, src/config, src/db/migrations, src/db/seeders.
  - backend/.env.example con exactamente NODE_ENV=development, HOST=127.0.0.1, PORT=4000, `DATABASE_URL=postgres://polleria:cambia_esta_clave@localhost:5432/polleria_dev` y `DATABASE_URL_TEST=postgres://polleria:cambia_esta_clave@localhost:5432/polleria_test`, con un comentario en español que diga que se copie como .env y se cambie la clave.
  - No crear backend/.env (lo crea el usuario) ni ningún módulo de la sección 11 de la spec.
- Terminado cuando: `pnpm install` y `pnpm --filter @polleria/api run typecheck` terminan con código 0.

### T-04. Andamiaje de frontend
- Responsable: frontend-dev
- Dependencias: T-01, T-02
- AC: ninguno (requisitos R-13, R-14)
- Descripción:
  - frontend/package.json: nombre @polleria/web, `"private": true`, `"type": "module"`. dependencies: next 16.4.0, react 19.3.0, react-dom 19.3.0, @heroui/react 3.2.6, @heroui/styles 3.2.6, react-aria-components 1.21.1, react-aria 3.52.1, @react-aria/ssr 3.10.1, @react-aria/utils 3.34.1, @internationalized/date 3.12.4, @tanstack/react-query 5.104.1, @polleria/shared `workspace:*`. devDependencies: tailwindcss 4.3.3, @tailwindcss/postcss 4.3.3, postcss 8.5.29, @types/react 19.3.0, @types/react-dom 19.3.0, @testing-library/react 16.3.3, @testing-library/dom 10.4.2, msw 3.0.2 y, si se aprueba, @testing-library/jest-dom 7.0.1.
  - Scripts: `dev` = `next dev --hostname 0.0.0.0 --port 3000`; `build` = `next build`; `start` = `next start --hostname 0.0.0.0 --port 3000`; `typecheck` = `next typegen && tsc --noEmit`.
  - App Router con carpeta src/: src/app/layout.tsx mínimo (html y body, sin metadata) y src/app/page.tsx que devuelve `<main />`. src/app/globals.css con Tailwind 4 y los estilos de HeroUI según su guía oficial de instalación. postcss.config.mjs con @tailwindcss/postcss.
  - next.config.ts mínimo: solo `transpilePackages: ['@polleria/shared']` (y turbopack.root en la raíz del monorepo si hiciera falta). Sin rewrites ni allowedDevOrigins: los agrega T-23.
  - tsconfig.json que extiende la base con lo que exige Next (moduleResolution bundler, jsx react-jsx, plugin next, allowImportingTsExtensions).
  - frontend/.env.example con `API_INTERNAL_URL=http://127.0.0.1:4000` y `WEB_ALLOWED_DEV_ORIGINS=` (vacío), con un comentario en español.
  - Fuentes del sistema; nada de next/font/google ni CDN (R-14).
- Terminado cuando: `pnpm --filter @polleria/web run typecheck` y `pnpm --filter @polleria/web run build` terminan con código 0.

### T-05. Vitest en la raíz: proyectos y cobertura
- Responsable: backend-dev
- Dependencias: T-02, T-03, T-04
- AC: ninguno (requisitos R-08, R-09)
- Descripción:
  - devDependencies raíz: vitest 5.0.3, @vitest/coverage-v8 5.0.3, jsdom 29.1.1.
  - vitest.config.ts en la raíz con los proyectos shared, api-unit, api-integration y web, los globs y entornos de R-08 (api-integration sin paralelismo entre archivos y testTimeout 15000; web con jsdom y JSX automático, sin @vitejs/plugin-react).
  - Cobertura v8 con include, exclude y umbrales de R-09: `thresholds: { lines: 80, 'packages/shared/src/**': { lines: 90 }, 'backend/src/services/**': { lines: 90 } }`.
  - Dejar comentado en el archivo que el test-writer puede agregar `setupFiles` por proyecto (ver T-10 y T-15).
- Terminado cuando: `pnpm test --passWithNoTests` y `pnpm typecheck` terminan con código 0.

### T-06. Playwright
- Responsable: frontend-dev
- Dependencias: T-03, T-04
- AC: ninguno (requisito R-10)
- Descripción:
  - devDependency raíz @playwright/test 1.64.0 e instalación de Chromium (`pnpm exec playwright install chromium`; requiere internet una sola vez).
  - playwright.config.ts en la raíz según R-10: testDir e2e, testMatch `**/*.spec.ts`, proyectos desktop-chrome (1366×768) y mobile-chrome (360×740, isMobile, hasTouch, Chromium), baseURL http://localhost:3100, dos webServer (API en 127.0.0.1:4100 y web en 3100) con `reuseExistingServer: false` y timeout de 120 s.
  - El archivo lee DATABASE_URL_TEST del entorno o de backend/.env (si existe, sin sobrescribir variables) y aborta con un mensaje en español si falta. La verificación con assertTestDatabase se conecta en T-25, cuando ese módulo exista; mientras tanto no se importa.
  - Variables de los procesos hijos (NODE_ENV=test, HOST, PORT, DATABASE_URL = DATABASE_URL_TEST, API_INTERNAL_URL) en la opción env de cada webServer, nunca en línea en el comando.
- Terminado cuando: `pnpm test:e2e --list --pass-with-no-tests` termina con código 0 y `pnpm typecheck` sigue en verde.

## Pruebas en rojo (test-writer)

Reglas comunes:
- Nombre de cada prueba con el ID del AC al inicio, por ejemplo `it('AC-13: responde 503 sin filtrar la clave', ...)`.
- Importar desde las rutas de la sección 11 de la spec. Que fallen por módulo inexistente es un rojo válido.
- Las pruebas que arrancan procesos (AC-08, AC-09, AC-24) arman el entorno del hijo copiando process.env y cambiando solo las variables del caso (en Windows, sin SystemRoot fallan los sockets). Vitest define NODE_ENV=test en su propio proceso.
- Para el puerto ocupado o libre, la prueba abre un servidor en el puerto 0, toma el número asignado y lo cierra o lo mantiene según el caso.
- El test-writer puede agregar `setupFiles` por proyecto en vitest.config.ts. Es la única modificación de configuración que le corresponde.

### T-07. Pruebas de packages/shared
- Responsable: test-writer
- Dependencias: T-05
- AC: AC-01 (parte de shared), AC-02, AC-03
- Descripción: pruebas unitarias de TIME_ZONE, healthResponseSchema (casos válidos e inválidos de AC-02), errorResponseSchema y ERROR_CODES.

### T-08. Pruebas de configuración de la API
- Responsable: test-writer
- Dependencias: T-05
- AC: AC-01 (parte de api), AC-04, AC-05, AC-06, AC-07
- Descripción: pruebas unitarias de loadConfig con objetos de entorno explícitos (nunca process.env), incluidos los mensajes exactos de los issues y la ausencia de secretos. AC-07 lee backend/.env.example con `util.parseEnv` y compara contra CONFIG_VARIABLES. Incluir una prueba en backend que importe TIME_ZONE desde '@polleria/shared' (AC-01).

### T-09. Pruebas de la guardia de base de pruebas
- Responsable: test-writer
- Dependencias: T-05
- AC: AC-10, AC-11
- Descripción: pruebas unitarias de assertTestDatabase con cada fila de la tabla de AC-11 (una prueba por caso o una tabla con `it.each`), verificando la clase de error, el inicio del mensaje y que no aparezcan la clave ni la URL.

### T-10. Helpers de la base de pruebas
- Responsable: test-writer
- Dependencias: T-05
- AC: ninguno directo (lo usan T-11, T-12, T-13 y T-14; cumple RN-001-02)
- Descripción:
  - backend/tests/helpers/: obtener DATABASE_URL_TEST (del entorno o de backend/.env sin sobrescribir), fallar con un mensaje en español si falta o si no se puede conectar ("No se pudo conectar a la base de pruebas polleria_test. Revisa DATABASE_URL_TEST y que PostgreSQL esté encendido."), verificarla con assertTestDatabase, crear la instancia con createSequelize, comprobar `SELECT current_database()` antes de cualquier limpieza, y cerrar la conexión al final.
  - Función de limpieza que borra solo lo que crean las pruebas (tablas de fixtures, FixtureMeta y FixtureData), siempre después de la doble verificación.
  - Nunca crea ni borra bases ni roles.

### T-11. Pruebas de salud de la API
- Responsable: test-writer
- Dependencias: T-10
- AC: AC-12, AC-13, AC-14, AC-15
- Descripción: integración con Supertest sobre `createApp({ sequelize })` con polleria_test (AC-12, AC-15) y con una conexión a `postgres://polleria:Clave_Secreta_99@127.0.0.1:1/polleria_test` (AC-13, AC-15). Unitarias de createHealthService con un sequelize falso y now fijo (AC-14), incluido el caso que nunca resuelve con `timeoutMs: 50`.

### T-12. Pruebas del formato común de errores
- Responsable: test-writer
- Dependencias: T-10
- AC: AC-16, AC-17, AC-18, AC-19, AC-20
- Descripción: AC-16 y AC-17 con Supertest sobre createApp. AC-18 a AC-20 con una app Express de prueba que monta errorHandler y rutas que lanzan AppError (síncrona y async), ZodError (campo simple y anidado) y errores inesperados (Error y una cadena). Validar los cuerpos con errorResponseSchema.

### T-13. Pruebas del proceso de la API
- Responsable: test-writer
- Dependencias: T-10
- AC: AC-08, AC-09
- Descripción: arrancar `node --disable-warning=ExperimentalWarning backend/src/server.ts` como proceso hijo sin `--env-file`, con el entorno de cada caso. AC-08: sin DATABASE_URL, y con el puerto ocupado. AC-09: puerto libre, esperar la línea 'API escuchando en ...' y GET /api/health con 200. Terminar siempre el proceso hijo al final de la prueba.

### T-14. Pruebas de migraciones, seeds y comandos de base de datos
- Responsable: test-writer
- Dependencias: T-10
- AC: AC-21, AC-22, AC-23, AC-24
- Descripción:
  - Fixtures en backend/tests/fixtures/migrations (20260101000000-create-fixture-a.ts y 20260101000001-create-fixture-b.ts, con up y down) y backend/tests/fixtures/seeders (un seeder que inserta una fila en una tabla de fixture). Solo sintaxis borrable, porque umzug las carga con Node.
  - AC-21 y AC-23 con las carpetas reales (en esta spec están vacías). AC-22 y la segunda parte de AC-23 con glob y tableName propios (FixtureMeta, FixtureData).
  - AC-24 con procesos hijos de `backend/src/db/cli.ts`, incluida la URL con 'Clave_Secreta_99' en el puerto 1 y la ausencia de DATABASE_URL.
  - Limpiar fixtures al terminar, con la doble verificación de T-10.

### T-15. Pruebas de la web
- Responsable: test-writer
- Dependencias: T-05
- AC: AC-01 (parte de web), AC-25, AC-26, AC-27, AC-28
- Descripción:
  - Configurar MSW (msw/node) y la limpieza de React Testing Library en un setupFiles del proyecto web (por ejemplo frontend/tests/setup.ts), registrado en vitest.config.ts.
  - Handlers con el patrón `*/api/health` para no depender del origen de jsdom.
  - AC-25: unitarias de getServerStatus con cada respuesta de la lista y el caso de tiempo límite (`timeoutMs: 50`, respuesta que nunca llega).
  - AC-26: ServerStatus dentro de un QueryClientProvider propio de la prueba; textos exactos dentro de role="status".
  - AC-27: la página (default export de src/app/page.tsx) dentro de Providers.
  - AC-28: loadWebServerConfig con objetos de entorno explícitos, y frontend/.env.example leído con `util.parseEnv` contra WEB_CONFIG_VARIABLES.
  - Una prueba en frontend que importe TIME_ZONE desde '@polleria/shared' (AC-01).

### T-16. Pruebas E2E
- Responsable: test-writer
- Dependencias: T-06
- AC: AC-29, AC-30, AC-31, AC-32
- Descripción: e2e/home.spec.ts (o nombre equivalente). AC-29 en ambos proyectos. AC-30 registrando `page.on('request')` y `page.on('websocket')` desde antes de navegar e ignorando data: y blob:. AC-31 solo en mobile-chrome. AC-32 con el fixture `request` de Playwright contra http://localhost:3100/api/health, validando con healthResponseSchema. En la fase roja es válido que fallen porque la API no puede arrancar (server.ts no existe).

## Implementación backend (backend-dev)

### T-17. packages/shared: constantes y esquemas
- Responsable: backend-dev
- Dependencias: T-07
- AC: AC-01 (shared), AC-02, AC-03
- Descripción: TIME_ZONE, healthResponseSchema (objeto estricto; timestamp con `z.iso.datetime()` en UTC con Z), errorResponseSchema (error estricto con code, message no vacío y details objeto o null), ERROR_CODES y tipos inferidos. Reexportar todo desde src/index.ts con imports relativos que terminan en .ts. Sin APIs de Node ni del DOM.

### T-18. Configuración y guardia de la base de pruebas
- Responsable: backend-dev
- Dependencias: T-08, T-09, T-17
- AC: AC-04, AC-05, AC-06, AC-07, AC-10, AC-11
- Descripción: backend/src/config/env.ts (loadConfig con Zod, ConfigError con todos los issues a la vez, CONFIG_VARIABLES, mensajes exactos de la spec, sin valores en los mensajes) y backend/src/db/assert-test-database.ts (regla exacta de AC-11 y UnsafeTestDatabaseError). La validación de URL de PostgreSQL se comparte entre ambos módulos para no duplicar reglas.

### T-19. Errores y app base
- Responsable: backend-dev
- Dependencias: T-12, T-17
- AC: AC-16, AC-17, AC-18, AC-19, AC-20
- Descripción: AppError, errorHandler y notFoundHandler; createApp con el orden de middlewares de la sección 9.2 de la spec (x-powered-by desactivado, express.json con límite de 100 KB, router en /api, 404 y errorHandler), mapeo de errores del parser (entity.parse.failed a INVALID_JSON y entity.too.large a PAYLOAD_TOO_LARGE), ZodError a VALIDATION_ERROR con paths unidos por punto, y Zod en español con `z.config(z.locales.es())`. Los errores inesperados se registran con su traza en el log, sin el cuerpo de la solicitud. Sin CORS.

### T-20. Salud
- Responsable: backend-dev
- Dependencias: T-11, T-18, T-19
- AC: AC-12, AC-13, AC-14, AC-15
- Descripción: createSequelize (sección 8 de la spec), createHealthService (authenticate contra el tiempo límite, nunca lanza, DEFAULT_HEALTH_TIMEOUT_MS = 2000), health.controller (200 o 503 según status, `Cache-Control: no-store`) y health.routes montado en /api/health. Capas: routes, controllers, services. No registrar la URL de la base en ningún log.

### T-21. Punto de entrada de la API
- Responsable: backend-dev
- Dependencias: T-13, T-18, T-20
- AC: AC-08, AC-09
- Descripción: backend/src/server.ts: loadConfig(process.env) (si lanza ConfigError, escribe su mensaje en stderr y sale con código 1), createSequelize, createApp, listen en HOST:PORT con el mensaje 'API escuchando en http://<HOST>:<PORT>', manejo de EADDRINUSE con el mensaje de AC-08 y código 1, y cierre ordenado con SIGINT y SIGTERM. No lee .env por su cuenta. Verificar `pnpm --filter @polleria/api run dev`.

### T-22. Migrador, seeds y comandos
- Responsable: backend-dev
- Dependencias: T-14, T-18, T-20
- AC: AC-21, AC-22, AC-23, AC-24
- Descripción: backend/src/db/migrator.ts con umzug y SequelizeStorage (migrateUp, migrateDown, seedUp, opciones glob y tableName, carga de archivos .ts con import dinámico que funcione con Node y dentro de Vitest) y backend/src/db/cli.ts (comandos migrate, migrate:undo y seed, mensajes exactos de AC-24, código 1 ante configuración inválida, error de conexión sin secretos o comando desconocido). Verificar `pnpm db:migrate` y `pnpm db:seed` contra polleria_dev (R-12).

## Implementación frontend (frontend-dev)

### T-23. Configuración de la web y rewrites
- Responsable: frontend-dev
- Dependencias: T-15, T-17
- AC: AC-28 (y prepara AC-32)
- Descripción: frontend/src/config/server-env.ts (loadWebServerConfig con Zod, WEB_CONFIG_VARIABLES, valores por defecto, quitar la barra final y mensajes de AC-28). next.config.ts lo usa para el rewrite `/api/:path*` hacia `${apiInternalUrl}/api/:path*` y para `allowedDevOrigins`. Mantener transpilePackages.

### T-24. Página inicial y estado del servidor
- Responsable: frontend-dev
- Dependencias: T-15, T-17
- AC: AC-01 (web), AC-25, AC-26, AC-27
- Descripción: src/lib/api/health.ts (getServerStatus con tiempo límite de 5 s, `cache: 'no-store'`, validación con healthResponseSchema y nunca lanza), src/app/providers.tsx (QueryClient creado una sola vez), src/components/server-status.tsx (TanStack Query con queryKey ['health'], refetchInterval 10 000 ms y retry false; role="status" y aria-live="polite"; textos exactos y un componente de HeroUI con color por estado), src/app/page.tsx (h1 'Sistema Pollería' y ServerStatus) y src/app/layout.tsx (metadata, lang es-PE y Providers). Mobile-first a 360 px y texto de al menos 18 px. Si AbortSignal.timeout choca con jsdom en las pruebas, implementar el tiempo límite con AbortController y un temporizador.

### T-25. Guardia en Playwright y E2E en verde
- Responsable: frontend-dev
- Dependencias: T-16, T-18, T-21, T-23, T-24
- AC: AC-29, AC-30, AC-31, AC-32
- Descripción: en playwright.config.ts, verificar DATABASE_URL_TEST con assertTestDatabase (importado desde backend/src/db/assert-test-database.ts) antes de declarar los webServer. Ejecutar `pnpm test:e2e` con `pnpm dev` detenido hasta dejar los cuatro AC en verde en ambos proyectos. Si falla por algo del backend, reportarlo; no tocar backend.

## Matriz AC a tareas

| AC | Prueba (test-writer) | Implementación |
| --- | --- | --- |
| AC-01 | T-07, T-08, T-15 | T-17, T-24 |
| AC-02, AC-03 | T-07 | T-17 |
| AC-04 a AC-07 | T-08 | T-18 |
| AC-08, AC-09 | T-13 | T-21 |
| AC-10, AC-11 | T-09 | T-18 |
| AC-12 a AC-15 | T-11 | T-20 |
| AC-16 a AC-20 | T-12 | T-19 |
| AC-21 a AC-24 | T-14 | T-22 |
| AC-25 a AC-27 | T-15 | T-24 |
| AC-28 | T-15 | T-23 |
| AC-29 a AC-32 | T-16 | T-25 (con T-21, T-23 y T-24) |

## Paralelismo sugerido

- Andamiaje: T-01, luego T-02, luego T-03 y T-04 en paralelo, luego T-05 y T-06 en paralelo.
- Pruebas: T-07, T-08, T-09, T-10 y T-15 en paralelo; luego T-11 a T-14; T-16 en cuanto termine T-06.
- Implementación: backend (T-17 a T-22) y frontend (T-23 y T-24) en paralelo una vez lista T-17; T-25 al final.

## Enmienda 1 (2026-10-07): correcciones de hallazgos adversariales

Spec: sección 17 (decisiones D-11 a D-14, AC-33 a AC-46). Corrige ADV-001-01, ADV-001-02, ADV-001-04, ADV-001-05, ADV-001-06 y ADV-001-09. No cambia lo que ve el usuario final.

Reglas de la enmienda:
- Estas pruebas adversariales ya existen y NADIE las modifica (tampoco el test-writer). Deben pasar a verde con la implementación:
  - backend/tests/adversarial/common-errors.adversarial.test.ts (ADV-001-01, ADV-001-02 y ADV-001-03, que ya está en verde)
  - backend/tests/adversarial/test-database-guard.adversarial.test.ts (ADV-001-04 y ADV-001-05)
  - backend/tests/adversarial/migrate-concurrency.adversarial.test.ts (ADV-001-06)
  - frontend/tests/adversarial/server-env.adversarial.test.ts (ADV-001-09)
- Las pruebas de AC-01 a AC-32 siguen en verde sin cambios.
- Los módulos ya existen, así que el rojo válido es "comportamiento ausente" (respuesta 500 en vez de 4xx, host tomado de la query, promesa que no espera, URL con ruta). En AC-43 y AC-44, importar MIGRATION_LOCK_KEY (todavía no exportado) también es un rojo válido.
- Las pruebas que espían console.error usan `vi.spyOn(console, 'error').mockImplementation(() => undefined)` y lo restauran al terminar.

### Pruebas en rojo (test-writer)

#### T-26. Pruebas de errores del lector del cuerpo
- Responsable: test-writer
- Dependencias: ninguna (T-19 ya está terminada)
- AC: AC-33, AC-34, AC-35, AC-36, AC-37
- Descripción:
  - AC-33, AC-34 y AC-36 con Supertest sobre `createApp({ sequelize: createUnreachableSequelize() })`, sin tocar la base (por ejemplo backend/tests/body-reader-errors.test.ts). Cuerpos comprimidos con node:zlib (gzipSync, deflateSync, brotliCompressSync). Validar los cuerpos con errorResponseSchema y comprobar que console.error no se llama.
  - AC-35 con un servidor real (`app.listen(0, '127.0.0.1')`) y un socket de node:net que envía las cabeceras con `Content-Length: 100`, solo `{"a":` y luego `destroy()`. Esperar 500 ms y revisar console.error; después, GET /api/health debe responder 503. Cerrar el servidor al final.
  - AC-37 con una app Express de prueba que monta solo errorHandler (puede ir junto a las pruebas de AC-18 a AC-20 en backend/src/middlewares/error-handler.test.ts o en un archivo nuevo).

#### T-27. Prueba de ERROR_CODES
- Responsable: test-writer
- Dependencias: ninguna
- AC: AC-38
- Descripción: en packages/shared, junto a las pruebas de AC-03, comprobar UNSUPPORTED_MEDIA_TYPE e INVALID_BODY en ERROR_CODES y que errorResponseSchema acepta los dos cuerpos de AC-38.

#### T-28. Pruebas de la conexión armada solo con el URL
- Responsable: test-writer
- Dependencias: ninguna
- AC: AC-39, AC-40, AC-41
- Descripción:
  - AC-39 y AC-41, unitarias en backend/src/db/sequelize.test.ts: crear la instancia, leer `sequelize.config` (con un cast, como en la prueba adversarial) y cerrarla. No abren conexiones. En AC-41, revisar message, stack y cause.
  - AC-40, de integración en backend/tests/ (por ejemplo sequelize-connection.test.ts): partir de getTestDatabaseUrl() del helper, agregar los parámetros con `new URL()` y `searchParams.set`, y comparar `SHOW search_path` con el de una instancia de connectTestDatabase(). Cerrar ambas instancias.

#### T-29. Pruebas del bloqueo de migraciones
- Responsable: test-writer
- Dependencias: ninguna
- AC: AC-42, AC-43, AC-44
- Descripción:
  - Fixture nuevo backend/tests/fixtures/migrations-failing/20260101000000-fails.ts (solo sintaxis borrable), con un up que lanza `new Error('Falla de prueba.')` y un down vacío.
  - Archivo de integración (por ejemplo backend/tests/migrator-lock.test.ts) que usa los helpers de limpieza de T-10 antes y después de cada prueba.
  - Tomar el bloqueo "a mano" en una segunda instancia con una transacción no administrada (`const t = await otra.transaction()` y `SELECT pg_advisory_xact_lock(2026100701)` con `{ transaction: t }`) y soltarlo con `t.commit()`; así se suelta siempre en la misma conexión. Soltarlo también en afterEach si la prueba falla.
  - Comprobar "sigue pendiente" con una bandera que se marca cuando la promesa se resuelve, después de esperar 500 ms.
  - En el caso de dos instancias de AC-42, abrir la segunda con connectTestDatabase() y cerrarla al final.

#### T-30. Pruebas de la configuración de la web
- Responsable: test-writer
- Dependencias: ninguna
- AC: AC-45, AC-46
- Descripción: en frontend/src/config/server-env.test.ts, la tabla de AC-45 con `it.each` y los dos casos de AC-46 (inicio del mensaje, línea exacta y sin 'Secreta_123' ni 'admin'). Para el rewrite de AC-45: `vi.stubEnv('API_INTERNAL_URL', 'http://127.0.0.1:4000/base')`, `vi.resetModules()`, import dinámico de frontend/next.config.ts y `await config.rewrites()`.

### Implementación backend (backend-dev)

#### T-31. Códigos de error nuevos en packages/shared
- Responsable: backend-dev
- Dependencias: T-27
- AC: AC-38
- Descripción: agregar UNSUPPORTED_MEDIA_TYPE e INVALID_BODY a ERROR_CODES en packages/shared/src/errors.ts y actualizar su comentario.

#### T-32. Clasificación de los errores del lector del cuerpo
- Responsable: backend-dev
- Dependencias: T-26, T-31
- AC: AC-33, AC-34, AC-35, AC-36, AC-37 (corrige ADV-001-01 y ADV-001-02)
- Descripción:
  - Aplicar la tabla de 9.2 y D-11: encoding.unsupported y charset.unsupported pasan a 415 UNSUPPORTED_MEDIA_TYPE; cualquier otro error 4xx del lector (descompresión fallida, solicitud cortada) pasa a 400 INVALID_BODY; INVALID_JSON y PAYLOAD_TOO_LARGE no cambian; los errores 5xx del lector siguen como 500.
  - Reconocer los errores del lector sin depender solo de la propiedad status (AC-37). Una opción: envolver express.json en createApp para marcar los errores que entrega. El orden de middlewares de 9.2 no cambia.
  - No registrar los 4xx; los 500 se siguen registrando con traza (RN-001-07).
  - Verificar que ADV-001-01, ADV-001-02 y ADV-001-03 quedan en verde.

#### T-33. Conexión armada solo con las partes del URL
- Responsable: backend-dev
- Dependencias: T-28
- AC: AC-39, AC-40, AC-41 (corrige ADV-001-04 y ADV-001-05)
- Descripción:
  - createSequelize valida con la regla compartida de backend/src/db/postgres-url.ts (ahí se puede exportar una función que devuelva host, puerto, base, usuario y clave) y crea la instancia con la forma de objeto de Sequelize, según la tabla de D-12. `dialectOptions` queda exactamente `{ connectionTimeoutMillis: 5000, ssl: false }`; el resto de la configuración no cambia.
  - El error de URL inválida no lleva la URL en ninguna propiedad: no reenviar el TypeError de `new URL`, que trae el valor en `input`.
  - No cambiar loadConfig ni assertTestDatabase.
  - Opcional: una línea en backend/.env.example que diga que los parámetros después de `?` se ignoran (AC-07 solo revisa las variables y sus valores).
  - Verificar que ADV-001-04 y ADV-001-05 quedan en verde y que `pnpm dev` sigue mostrando 'Conectado'.

#### T-34. Bloqueo consultivo en el migrador
- Responsable: backend-dev
- Dependencias: T-29
- AC: AC-42, AC-43, AC-44 (corrige ADV-001-06)
- Descripción:
  - Exportar `MIGRATION_LOCK_KEY = 2026100701` en backend/src/db/migrator.ts.
  - migrateUp, migrateDown y seedUp toman el bloqueo (pg_advisory_lock o pg_advisory_xact_lock, forma de un argumento) antes de que umzug lea o cree la tabla de registro, y lo sueltan en un finally.
  - El bloqueo vive en una conexión fija durante toda la operación (ver D-13: con el pool, un pg_advisory_lock puede quedar tomado en otra conexión y trabar todo). Las migraciones se siguen ejecutando como hoy, fuera de esa conexión.
  - Sin cambios en las firmas ni en los mensajes de cli.ts.
  - Verificar que ADV-001-06 queda en verde y que AC-21 a AC-24 siguen en verde.

### Implementación frontend (frontend-dev)

#### T-35. API_INTERNAL_URL reducida a su origen
- Responsable: frontend-dev
- Dependencias: T-30
- AC: AC-45, AC-46 (corrige ADV-001-09)
- Descripción:
  - En frontend/src/config/server-env.ts, devolver el origen de la URL (`new URL(valor).origin`) en lugar de quitar solo la barra final, y rechazar una URL con usuario o clave con la línea '- API_INTERNAL_URL: no debe incluir usuario ni clave.', sin el valor. Mantener los mensajes de AC-28.
  - next.config.ts no debería necesitar cambios.
  - Opcional: en el comentario de frontend/.env.example, aclarar que solo se usan el protocolo, el host y el puerto, sin usuario ni clave.
  - Verificar que ADV-001-09 y AC-28 quedan en verde.

### Matriz AC a tareas (enmienda 1)

| AC | Prueba (test-writer) | Implementación | Hallazgo |
| --- | --- | --- | --- |
| AC-33 | T-26 | T-32 | ADV-001-01 |
| AC-34, AC-35 | T-26 | T-32 | ADV-001-02 |
| AC-36, AC-37 | T-26 | T-32 | ADV-001-01 y ADV-001-02 (regresión y alcance) |
| AC-38 | T-27 | T-31 | — |
| AC-39, AC-40 | T-28 | T-33 | ADV-001-04 y ADV-001-05 |
| AC-41 | T-28 | T-33 | — |
| AC-42, AC-43, AC-44 | T-29 | T-34 | ADV-001-06 |
| AC-45, AC-46 | T-30 | T-35 | ADV-001-09 |

### Paralelismo sugerido (enmienda 1)

- Pruebas: T-26 a T-30 en paralelo.
- Implementación: backend y frontend pueden ir en paralelo. Backend: T-31 y luego T-32; T-33 y T-34 son independientes entre sí y de T-31 y T-32. Frontend: T-35 en cuanto termine T-30.

### Verificación al cerrar la enmienda (orquestador)

`pnpm test` (con las cuatro pruebas adversariales en verde y sin cambios), `pnpm lint`, `pnpm typecheck`, `pnpm test:coverage`, `pnpm test:e2e` (con `pnpm dev` detenido) y `npx -y @redocly/cli@latest lint docs/api/openapi.yaml`. Después, marcar los seis hallazgos como cerrados en docs/PROGRESS.md.
