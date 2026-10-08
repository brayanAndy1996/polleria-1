# Tareas — Spec 003: usuarios, roles e inicio de sesión con PIN

- Spec: docs/specs/003-users-pin-login/spec.md (Aprobada el 2026-10-08, con la revisión 1: varios roles por persona)
- Rama: feat/003-users-pin-login
- Contrato: docs/api/openapi.yaml (versión 0.3.1: /auth/users, /auth/login, /auth/me, /auth/logout; AuthUser con roles)
- ADR: docs/decisions/0002-sesion-pin-y-limite-de-intentos.md (Aceptado)
- Dependencias: bcrypt 6.0.0 y @types/bcrypt 6.0.0 (aprobadas). Sin variables de entorno nuevas.

## Orden y por qué

1. **Instalación (T-01)**: backend-dev instala bcrypt y @types/bcrypt después de la aprobación del usuario, antes de las pruebas, para que el rojo falle por módulos o comportamiento ausentes y no por una dependencia que falta. Solo configuración, como el andamiaje de la 001.
2. **Pruebas en rojo (T-02 a T-14 y T-27)**: test-writer escribe las pruebas de los 44 AC, ajusta el helper de limpieza de la base (sección 12 de la spec) y prepara los E2E.
3. **Implementación**: backend-dev (T-15 a T-21) y frontend-dev (T-22 a T-25 y T-28). T-15 (esquemas de shared) va primero porque frontend-dev usa esos esquemas y no puede modificar packages/shared; después ambos trabajan en paralelo. T-25 (E2E en verde) necesita el backend terminado.
4. **Cierre (T-26)**: definición de terminado y requisitos R-003-01 a R-003-09.

Revisión 1 (varios roles por persona): cambian T-02, T-03, T-06, T-09, T-10, T-11, T-12, T-13, T-14, T-15, T-16, T-18, T-19, T-20, T-21, T-22, T-23, T-24, T-25 y T-26; son nuevas T-27 (test-writer) y T-28 (frontend-dev). La matriz del final las incluye.

Aclaración aprobada («Corregir ambos ahora», ADV-003-06 y ADV-003-14): reset solo tras persistir la sesión (T-19) y logout exitoso exclusivamente HTTP 204 (T-22 y T-24). Las regresiones adversariales independientes ya están en rojo; los implementadores corrigen producción sin modificar esas pruebas. No se añaden AC ni tareas, ni se cambia la revisión 1, el alcance o el contrato HTTP.

## Instalación (después de la aprobación)

### T-01. Instalar bcrypt y sus tipos
- Responsable: backend-dev
- Dependencias: aprobación del usuario (spec 003 y ADR 0002)
- AC: ninguno (requisito R-003-01)
- Descripción:
  - `pnpm --filter @polleria/api add bcrypt@6.0.0` y `pnpm --filter @polleria/api add -D @types/bcrypt@6.0.0` (versiones exactas por save-exact).
  - pnpm-workspace.yaml: agregar `ignoredBuiltDependencies:` con `- bcrypt`. No usar onlyBuiltDependencies ni `pnpm approve-builds` (bcrypt trae binario precompilado para win32-x64; su script solo compilaría desde el código fuente).
  - Verificar: `pnpm install --frozen-lockfile` sin el aviso "Ignored build scripts"; `pnpm --filter @polleria/api why @types/node` muestra solo 24.19.1; un script de una línea en el scratchpad (no en el repositorio) con `node` desde apps/api que haga hash y compare con bcrypt.
  - No crear ningún módulo de la sección 11 ni archivos de prueba. Si aparece un conflicto de versiones o bcrypt no carga, detenerse y reportarlo.
  - Commit `feat(003): instala bcrypt para el PIN` (sin archivos de prueba).

## Pruebas en rojo (test-writer)

Reglas comunes:
- Cada archivo de prueba de esta spec envuelve sus pruebas en un `describe` cuyo nombre empieza con `003:` y el nombre de cada prueba empieza con el ID del AC: `it('AC-16: bloquea al usuario después de 5 intentos fallidos', ...)`.
- Importar desde las rutas de la sección 11 de la spec; que fallen por módulo inexistente es un rojo válido.
- Base de pruebas: solo polleria_test (DATABASE_URL_TEST) con las guardias de RN-001-02. Vaciar users y sessions entre pruebas con `TRUNCATE sessions, users RESTART IDENTITY CASCADE` después de `assertConnectedToTestDatabase`.
- Hasher rápido: usar `createBcryptPinHasher({ cost: 4 })` en la app y en el servicio de usuarios, salvo donde el AC exige el costo 10 (AC-08, AC-13, AC-25, AC-26).
- Reloj: `let current = T0; createApp({ sequelize, now: () => current, pinHasher })`, con `T0 = new Date('2026-10-08T15:00:00.000Z')`.
- Roles (revisión 1): crear usuarios con `roles: [...]` (por ejemplo `roles: ['waiter', 'cashier']` para waiter+cashier) y cambiarlos con SQL como arreglo (`UPDATE users SET roles = '{cashier,waiter}' WHERE id = $1`). En la web, limpiar localStorage entre pruebas ('polleria:lastUsername' y 'polleria:lastArea').
- Para las solicitudes simultáneas (AC-17), usar un solo servidor (`http.createServer(app)` escuchando en 127.0.0.1) y `Promise.all`, en vez de un servidor efímero por solicitud.
- Textos con caracteres invisibles o especiales siempre con escapes (`'\u00A0'`, `'\u0661'`), nunca literales.
- Web: simular `next/navigation` (`useRouter` con `replace` espiado) y `apps/web/src/lib/navigation.ts` (`hardNavigate` espiado) con `vi.mock`; fijar la ruta actual con `window.history.pushState({}, '', '/mozo')`. `fireEvent.click` dispara onPress de los botones de HeroUI (verificado en react-aria 3.52.1); no hace falta user-event.
- Commits con prefijo test, por ejemplo `test(003): pruebas del límite de intentos`.

### T-02. Esquemas de usuarios y sesión en shared
- Responsable: test-writer
- Dependencias: T-01
- AC: AC-01, AC-02, AC-03, AC-04, AC-40
- Descripción: packages/shared/src/auth.test.ts (importando desde '@polleria/shared'). Tablas de valores aceptados y rechazados con `it.each`; comprobar los mensajes exactos en `error.issues`. ERROR_CODES nuevos y el ejemplo TOO_MANY_ATTEMPTS con errorResponseSchema. Revisión 1: AC-04 con roles (salida en orden) y AC-40 (userRolesSchema, sortUserRoles y hasAnyRole; comprobar que el arreglo de entrada no cambia).

### T-03. Limpieza de la base y pruebas de migraciones
- Responsable: test-writer
- Dependencias: T-01
- AC: AC-05, AC-06, AC-07 (y el ajuste de la sección 12 para AC-21 y AC-24 de la 001 y ADV-001-06)
- Descripción:
  - apps/api/tests/helpers/test-database.ts: resetMigrationTables borra también sessions y users (antes que SequelizeMeta y SequelizeData, o con CASCADE), siempre después de la doble verificación. Agregar helpers para migrar y vaciar las tablas de usuarios (`migrateAndClearAuthTables`, `clearAuthTables` o nombres equivalentes). No cambiar ninguna aserción existente.
  - Archivo nuevo apps/api/tests/users-migrations.test.ts con AC-05 a AC-07: columnas desde information_schema.columns, índices desde pg_indexes, restricciones probadas con INSERT/DELETE en SQL. Revisión 1: la columna roles se revisa con `format_type(a.atttypid, a.atttypmod)` de pg_attribute ('character varying(16)[]') y con data_type 'ARRAY' y udt_name '_varchar' de information_schema.columns; los INSERT con roles inválidos de AC-05 deben fallar (basta con que la base rechace; el arreglo de dos dimensiones falla con un error que no es de CHECK).
  - Confirmar que migrator.test.ts, db-cli.test.ts y migrate-concurrency.adversarial.test.ts siguen en verde (no dependen de T-16 mientras no haya migraciones reales; con ellas, dependen del nuevo helper).

### T-04. Cifrado del PIN, token y cookie
- Responsable: test-writer
- Dependencias: T-01
- AC: AC-08, AC-10, AC-11
- Descripción: apps/api/src/services/auth/pin-hasher.test.ts, session-token.test.ts y apps/api/src/http/session-cookie.test.ts. AC-10 compara con `createHash` de node:crypto. AC-11 con la tabla exacta (`it.each`).

### T-05. Límite de intentos
- Responsable: test-writer
- Dependencias: ninguna
- AC: AC-09
- Descripción: apps/api/src/services/auth/login-limiter.test.ts con un reloj manual (sin temporizadores falsos de Vitest: el limitador solo lee `now()`). Recorrer la secuencia de AC-09 paso a paso.

### T-06. Helpers de autenticación, lista de usuarios, login correcto y fugas
- Responsable: test-writer
- Dependencias: T-03
- AC: AC-12, AC-13, AC-24
- Descripción:
  - apps/api/tests/helpers/auth.ts: crear usuarios con createUserService (y desactivarlos con SQL), espía de verify, reloj controlado, y una función que haga login con Supertest y devuelva el valor de la cookie leído de Set-Cookie.
  - apps/api/tests/auth-login.test.ts: AC-12 (orden exacto de la lista, la usuaria con dos roles una sola vez y /api/health sin cookie), AC-13 (cuerpo con roles, atributos de la cookie, fila de sessions y roles ordenados de moza.caja) y AC-24 (cuerpos y cabeceras sin PIN ni hash; Cache-Control en 200, 400, 401 y 429).

### T-07. Login fallido y validación
- Responsable: test-writer
- Dependencias: T-06
- AC: AC-14, AC-15
- Descripción: en auth-login.test.ts o un archivo nuevo. console.error espiado. Contar las llamadas a verify por caso. AC-15 incluye la solicitud sin cuerpo y la de `Content-Type: text/plain`.

### T-08. Bloqueo por intentos
- Responsable: test-writer
- Dependencias: T-06
- AC: AC-16, AC-17
- Descripción: apps/api/tests/auth-lockout.test.ts. Cabecera Retry-After, details.retryAfterSeconds con el reloj adelantado, independencia entre usuarios, usuario inexistente nunca 429, 20 solicitudes simultáneas (exactamente 5 respuestas 401 y 15 respuestas 429; verify 5 veces) y bloqueo repetido. AC-16 se interpreta con D-003-05: un PIN correcto sin sesión guardada no reinicia el conteo (4 PIN incorrectos, 5.º correcto con `createSession` fallando: 500 sin cookie ni fila, siguiente intento 429). La regresión adversarial ADV-003-06 ya fue autorada independientemente y está en rojo; conservarla sin cambios para la corrección de T-19.

### T-09. Sesión actual, vencimiento, cambios del usuario, cierre y limpieza
- Responsable: test-writer
- Dependencias: T-06
- AC: AC-18, AC-19, AC-20, AC-21, AC-22
- Descripción: apps/api/tests/auth-session.test.ts. Cookies manipuladas de AC-18 (token nuevo, un carácter cambiado, 42 y 44 caracteres, comillas, token_hash de la base). AC-20 con los UPDATE de roles como arreglo (revisión 1). Set-Cookie de borrado en AC-21 (aceptar Expires en el pasado o Max-Age=0). Conteo de filas de sessions en AC-22.

### T-10. requireAuth, requireRole y servicio de usuarios
- Responsable: test-writer
- Dependencias: T-06
- AC: AC-23, AC-25
- Descripción:
  - apps/api/tests/auth-middleware.test.ts: app Express de prueba con las tres rutas de AC-23 y `errorHandler`; sesiones creadas con `sessionService.createSession` para los seis usuarios (cuatro de un rol, waiter+cashier y admin+waiter); cambio de roles por SQL con la misma cookie; `requireRole()` sin roles.
  - apps/api/tests/user-service.test.ts: AC-25 con el hasher por defecto (costo 10), roles guardados en orden, conjuntos de roles inválidos, duplicado con mayúsculas y dos createUser simultáneos.

### T-11. Comando del primer administrador
- Responsable: test-writer
- Dependencias: T-03
- AC: AC-26, AC-27
- Descripción:
  - apps/api/tests/helpers/child-process.ts: agregar la ruta de apps/api/src/create-admin.ts y una función que lo ejecute con la entrada estándar como tubería (escribir las líneas y cerrar), con tiempo límite de 15 s. ManagedProcess hoy usa stdin 'ignore': agregar una opción sin cambiar el comportamiento de los usos actuales.
  - Archivo nuevo apps/api/tests/create-admin-process.test.ts con AC-26 (CRLF, aviso en stderr, fila creada con roles '{admin}', login con createApp y `roles: ['admin']`) y la tabla de AC-27 (`it.each`), incluida la comprobación de que ninguna línea de stderr cumple `/^\s+at /m`.

### T-12. Cliente HTTP y pantalla de inicio de sesión
- Responsable: test-writer
- Dependencias: ninguna
- AC: AC-28, AC-29, AC-30, AC-31, AC-32
- Descripción:
  - apps/web/src/lib/api/client.test.ts: AC-28 con MSW (incluido el tiempo límite con una respuesta que nunca llega y `timeoutMs: 50`) y el manejador por defecto de `apiClient` con hardNavigate simulado.
  - apps/web/src/components/auth/login-screen.test.tsx: AC-29 a AC-32 dentro de Providers. Comprobar que los dígitos nunca aparecen como texto (`document.body.textContent`) ni en un input. Para AC-32, `vi.spyOn(Storage.prototype, 'getItem' | 'setItem')` para simular que localStorage lanza; limpiar localStorage entre pruebas. Revisión 1: AC-31 con los destinos por roles (`it.each`), con y sin 'polleria:lastArea' en localStorage.

### T-13. Guardia, áreas por rol, cerrar sesión e Inicio
- Responsable: test-writer
- Dependencias: ninguna
- AC: AC-33, AC-34, AC-35, AC-36
- Descripción: pruebas de componentes que renderizan el default export de apps/web/src/app/{mozo,caja,cocina,admin}/page.tsx dentro de Providers, con /api/auth/me y /api/auth/logout simulados y localStorage vacío. AC-33 con los casos de dos roles de la revisión 1. AC-34 con la tabla de la spec (`it.each`) y la constante ROLE_LABELS (ROLE_HOME_PATHS ya no existe). AC-35 solo recarga tras 204: cualquier otro estado, incluidos 200/202 con JSON válido o de error, JSON mal formado o sin JSON, muestra el error y permite reintentar sin hardNavigate. Las regresiones adversariales ADV-003-14 ya fueron autoradas independientemente y están en rojo; conservarlas sin cambios para T-22 y T-24. AC-36 en un archivo nuevo junto a apps/web/src/app/page.tsx (no modificar page.test.tsx de la 001).

### T-14. Extremo a extremo
- Responsable: test-writer
- Dependencias: T-03
- AC: AC-37, AC-38, AC-39, AC-44
- Descripción:
  - e2e/global-setup.ts: lee DATABASE_URL_TEST como playwright.config.ts (y la verifica con assertTestDatabase), migra polleria_test con migrateUp, vacía users y sessions (con la doble verificación) y crea e2e.mozo, e2e.caja, e2e.admin y (revisión 1) e2e.mozocaja (waiter+cashier, PIN '8642') con createUserService y el hasher por defecto (importando apps/api/src por ruta relativa, como e2e/home.spec.ts importa shared).
  - playwright.config.ts: agregar solo `globalSetup: './e2e/global-setup.ts'` (es la única configuración de ese archivo que le corresponde modificar).
  - e2e/auth.spec.ts con AC-37 a AC-39 y AC-44. AC-38 pasa por /areas (revisión 1). Cada usuario recibe como máximo 2 intentos fallidos por corrida completa (los dos proyectos), lejos del límite de 5. Medir alturas con `boundingBox()`; cookies con `context.cookies()`. En AC-44, el segundo inicio de sesión se hace en la misma página (mismo contexto), para que el dispositivo recuerde el usuario y el área.

### T-27. Áreas permitidas, pantalla de áreas y cambio de área (revisión 1)
- Responsable: test-writer
- Dependencias: ninguna
- AC: AC-41, AC-42, AC-43
- Descripción:
  - apps/web/src/lib/auth/roles.test.ts y last-area.test.ts: AC-41 con las tablas de la spec (`it.each`); localStorage que lanza con `vi.spyOn(Storage.prototype, ...)`.
  - Prueba de componente de apps/web/src/app/areas/page.tsx (AC-42): enlaces dentro de `getByRole('navigation', { name: 'Áreas' })`, en orden y con su href; `replace` espiado; hardNavigate simulado para el 401.
  - Prueba de componente de las páginas de área (AC-43): presencia o ausencia del enlace 'Cambiar de área' (href '/areas') y el valor de 'polleria:lastArea' en localStorage después de mostrar el área.

### Verificación del rojo (al terminar T-02 a T-14 y T-27)
- `pnpm test` falla solo por módulos inexistentes o comportamiento ausente. Las pruebas de la 001 y la 002 siguen en verde (con el helper ajustado, AC-21 y AC-24 de la 001 pasan aunque todavía no haya migraciones reales).
- `pnpm test:e2e` (con `pnpm dev` detenido) falla en la preparación global o en las pruebas nuevas por lo que falta; home.spec.ts sigue en verde si la preparación no la bloquea (si la preparación falla por módulos inexistentes, anotarlo en el reporte).
- `pnpm typecheck` y `pnpm lint` pueden fallar solo en cascada por los módulos que aún no existen.

## Implementación del backend (backend-dev)

Reglas comunes:
- No crear, modificar ni borrar archivos de prueba (`*.test.ts`, `*.test.tsx`, apps/api/tests/, e2e/). Si una prueba parece contradecir la spec, detenerse y reportarlo.
- Sintaxis borrable (D-02 de la 001), imports relativos con .ts, mensajes exactos de la spec. Sin SQL con interpolación de valores (las migraciones pueden ejecutar DDL fijo).
- Sin dependencias nuevas fuera de T-01.
- Commits con prefijo feat, por ejemplo `feat(003): sesiones en la base y requireAuth`, sin archivos de prueba. Antes de cada commit: `pnpm --filter @polleria/api run typecheck` y `pnpm lint`.

### T-15. Esquemas y códigos de error en shared
- Responsable: backend-dev
- Dependencias: T-02
- AC: AC-01, AC-02, AC-03, AC-04, AC-40
- Descripción: packages/shared/src/auth.ts con lo de la sección 11 (exportado en index.ts) y los 5 códigos nuevos en errors.ts. Revisión 1: `userRolesSchema` = `z.array(userRoleSchema).min(1, 'Elige al menos un rol.').refine(sin repetidos, 'No repitas un rol.').transform(sortUserRoles)` (prototipo verificado con zod 4.6.5: da exactamente esos mensajes y no modifica la entrada), `sortUserRoles`, `hasAnyRole` y authUserSchema con roles. usernameSchema: `z.string().trim().toLowerCase().regex(...)` (verificado en zod 4.6.5: valida el valor ya transformado). displayNameSchema: trim, NFC y luego `min(1)`, `max(40)` y el patrón con la bandera u (max cuenta puntos de código, igual que VARCHAR(40)). sessionResponseSchema con `z.iso.datetime()` como healthResponseSchema. Mantener el 90 % de cobertura de shared. Hacerla primero: frontend-dev la necesita.

### T-16. Migraciones y modelos
- Responsable: backend-dev
- Dependencias: T-03
- AC: AC-05, AC-06, AC-07
- Descripción: las dos migraciones de D-003-14 con las columnas, CHECK, UNIQUE, FOREIGN KEY ON DELETE CASCADE e índice `sessions_user_id_idx` de la sección 8 (nombres de restricciones e índices como en la spec); `down` borra la tabla. Revisión 1: users lleva `roles` VARCHAR(16)[] NOT NULL (en la migración, `DataTypes.ARRAY(DataTypes.STRING(16))` o DDL fijo) con los tres CHECK de 8.1 (users_roles_not_empty, users_roles_allowed, users_roles_no_duplicates), en lugar de role. apps/api/src/models/index.ts con `defineModels` usando `sequelize.define` (D-003-11), tableName users y sessions, `underscored`, roles con `DataTypes.ARRAY(DataTypes.STRING(16))` y `updatedAt: false` en Session. Probar `pnpm db:migrate` y `pnpm db:migrate:undo` dos veces sobre polleria_dev solo si el usuario lo autoriza; si no, basta con las pruebas sobre polleria_test.

### T-17. Cifrado del PIN, token de sesión y límite de intentos
- Responsable: backend-dev
- Dependencias: T-01, T-04, T-05
- AC: AC-08, AC-09, AC-10
- Descripción: pin-hasher.ts (`import bcrypt from 'bcrypt'`, costo por defecto PIN_HASH_COST; verify captura cualquier error y devuelve false), session-token.ts (randomBytes(32) en base64url y sha256 en hex) y login-limiter.ts (Map por userId con conteo y fin del bloqueo; `getRetryAfterSeconds` con Math.ceil; sin temporizadores).

### T-18. Cookie, servicio de sesiones y middlewares
- Responsable: backend-dev
- Dependencias: T-04, T-09, T-10, T-16, T-17
- AC: AC-11, AC-18, AC-19, AC-20, AC-21, AC-22, AC-23
- Descripción:
  - apps/api/src/http/session-cookie.ts: readSessionCookie (primera cookie con el nombre exacto, valor recortado, undefined si vacío), setSessionCookie y clearSessionCookie con los atributos de D-003-02 (`res.cookie` con httpOnly, sameSite 'strict', path '/', maxAge SESSION_DURATION_MS; sin secure).
  - session.service.ts: createSession, resolveSession (sin consulta si el token no cumple el patrón; una consulta que une sessions y users con token_hash, `expires_at > now` del reloj inyectado e is_active; roles ordenados con sortUserRoles), deleteSession y deleteExpiredSessions (`expires_at <= now`).
  - apps/api/src/middlewares/auth.ts: createRequireAuth (guarda el contexto en `res.locals.auth`; tipar Locals con una declaración ambiental si hace falta), requireRole (lanza con la lista vacía; 401 sin contexto; 200 si `hasAnyRole(user.roles, roles)`; si no, 403) y getAuthContext.

### T-19. Servicio de autenticación, controller, rutas y createApp
- Responsable: backend-dev
- Dependencias: T-06, T-07, T-08, T-15, T-17, T-18
- AC: AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-24
- Descripción:
  - auth.service.ts con el orden de 9.2 de la spec. El chequeo del bloqueo y `registerAttempt` siguen juntos y síncronos, sin ningún await entre ellos, antes de `await pinHasher.verify` (bcrypt), para conservar AC-17. Hash de relleno con el mismo costo (calculado una vez o constante). Con PIN correcto y usuario activo: esperar `deleteExpiredSessions`, esperar `createSession` y solo después del guardado correcto llamar a `registerSuccess`; cualquier fallo anterior al guardado conserva el intento y el conteo y se propaga como 500 sin cookie. Comprobar el PIN no basta para reiniciar el contador (AC-16, ADV-003-06). La respuesta lleva los roles ordenados con sortUserRoles. listLoginUsers con `Intl.Collator('es', { sensitivity: 'base' })` y desempate por username (sin roles).
  - auth.controller.ts: valida el cuerpo con loginRequestSchema (ZodError a VALIDATION_ERROR por el errorHandler), pone la cookie, y antes de pasar un TOO_MANY_ATTEMPTS fija `Retry-After` con `details.retryAfterSeconds`.
  - auth.routes.ts: un middleware que fija `Cache-Control: no-store` para todas las rutas de /auth (también los errores); GET /auth/users, POST /auth/login, GET /auth/me con requireAuth, POST /auth/logout.
  - app.ts: AppDependencies con now y pinHasher (sección 11); un LoginLimiter por app; las pruebas de la 001 con `createApp({ sequelize })` deben seguir pasando.

### T-20. Servicio de usuarios
- Responsable: backend-dev
- Dependencias: T-10, T-15, T-16, T-17
- AC: AC-25
- Descripción: user.service.ts: valida con usernameSchema, displayNameSchema, pinSchema y userRolesSchema (ZodError), guarda los roles en el orden que devuelve userRolesSchema, guarda el hash y traduce el UniqueConstraintError del índice de username a AppError USERNAME_TAKEN (409) con el mensaje de la spec. Devuelve AuthUser (sin pinHash ni isActive).

### T-21. Comando pnpm users:create-admin
- Responsable: backend-dev
- Dependencias: T-11, T-16, T-20
- AC: AC-26, AC-27 (requisitos R-003-02, R-003-03 y R-003-06)
- Descripción:
  - apps/api/src/create-admin.ts según D-003-10 y los mensajes de AC-26 y AC-27: título 'Crear un administrador del Sistema Pollería.', loadConfig(process.env), conexión ('No se pudo conectar con la base de datos.'), revisión de la tabla users (por ejemplo `SELECT to_regclass('users')`), preguntas en orden ('Nombre de usuario (por ejemplo, dueno): ', 'Nombre para mostrar (por ejemplo, Don Carlos): ', 'PIN (4 a 6 dígitos): ', 'Repite el PIN: '), validación de cada respuesta apenas llega, usuario existente antes de pedir el PIN, createUser con `roles: ['admin']` (solo ese rol, S-003-16) y 'Administrador creado: <username> (<displayName>).'.
  - Entrada: con readline; acepta LF y CRLF. Si `process.stdin.isTTY`, el PIN se lee en modo crudo sin mostrar los dígitos (se puede mostrar * por dígito) y Ctrl+C cancela con 'Se canceló la creación del administrador.'. Si no es TTY, escribe en stderr el aviso de AC-26 y lee líneas. Fin de la entrada antes de terminar: 'Se canceló la creación del administrador.'. Errores inesperados: 'No se pudo crear el administrador.' sin traza. Nunca escribir el PIN. Cerrar siempre la conexión. Usar `process.exitCode`.
  - Scripts: en apps/api/package.json `"users:create-admin": "node --env-file-if-exists=.env --disable-warning=ExperimentalWarning src/create-admin.ts"`; en el package.json raíz `"users:create-admin": "pnpm --filter @polleria/api run users:create-admin"`.
  - vitest.config.ts: agregar 'apps/api/src/create-admin.ts' a coverage.exclude.
  - Verificación manual (R-003-06) en PowerShell si hay una terminal disponible; si no, anotarlo como pendiente manual para el usuario.

## Implementación de la web (frontend-dev)

Reglas comunes:
- No crear, modificar ni borrar archivos de prueba (`*.test.tsx`, apps/web/tests/, e2e/). No modificar packages/shared: si falta algo, pedirlo en el reporte.
- HeroUI para los controles (Button con `isDisabled`, etc.), Tailwind para el diseño, botones de al menos 48 px de alto (se sugiere 56 px en el teclado), sin recursos de internet.
- TanStack Query con `retry: false` en las consultas de auth. Textos exactos de la spec.
- Commits con prefijo feat, sin archivos de prueba. Antes de cada commit: `pnpm --filter @polleria/web run typecheck` y `pnpm lint`.

### T-22. Navegación, cliente HTTP, funciones de auth y áreas permitidas
- Responsable: frontend-dev
- Dependencias: T-12, T-15, T-27
- AC: AC-28, AC-35 (validación del contrato de logout), AC-41
- Descripción: apps/web/src/lib/navigation.ts (hardNavigate), apps/web/src/lib/api/client.ts (createApiClient, apiClient, ApiError, DEFAULT_API_TIMEOUT_MS; AbortController para el tiempo límite; `credentials: 'same-origin'`; 401 UNAUTHENTICATED llama al manejador salvo skipAuthRedirect), apps/web/src/lib/api/auth.ts (las respuestas JSON validan con los esquemas de shared), apps/web/src/lib/auth/roles.ts, last-user.ts y (revisión 1) last-area.ts (try/catch alrededor de localStorage). Según la sección 11, añadir `expectedStatus?: number` interno y opcional: antes de resolver un 2xx, exigir el status esperado y rechazar los distintos con ApiError UNEXPECTED_RESPONSE y status HTTP real, sin alterar los errores no 2xx ni la aceptación genérica de 200 JSON válidos de AC-28. `logout` usa `{ method: 'POST', expectedStatus: 204, skipAuthRedirect: true }` y solo se resuelve tras 204; cualquier otra respuesta o error se propaga sin recarga automática y conservando su status (AC-35, ADV-003-14). No es un cambio HTTP ni una dependencia nueva. roles.ts según la sección 11 de la spec (sin ROLE_HOME_PATHS; getAllowedAreas con hasAnyRole de shared y resolveLandingPath de D-003-16).

### T-23. Pantalla de inicio de sesión
- Responsable: frontend-dev
- Dependencias: T-12, T-22
- AC: AC-29, AC-30, AC-31, AC-32
- Descripción: apps/web/src/components/auth/login-screen.tsx y apps/web/src/app/login/page.tsx según 10.1 de la spec. El PIN vive solo en el estado del componente (nunca en un input ni en el texto). Teclado físico con un listener de keydown activo solo en la vista del teclado. Tras el éxito: guardar el último usuario, poner la sesión en la caché de `['auth', 'me']` y `router.replace(resolveLandingPath(user.roles, readLastArea()))` (revisión 1). Lo mismo cuando /login encuentra una sesión abierta. Un solo envío a la vez (mutación deshabilitada mientras está pendiente).

### T-24. Guardia, áreas por rol, cerrar sesión e Inicio
- Responsable: frontend-dev
- Dependencias: T-13, T-22
- AC: AC-33, AC-34, AC-35, AC-36
- Descripción: role-guard.tsx (revisión 1: prop `area`; sin permiso, `router.replace(resolveLandingPath(...))`), logout-button.tsx y las páginas app/mozo, app/caja, app/cocina y app/admin según 10.2 (roles de AREA_ALLOWED_ROLES; línea con formatRoleLabels; sin los enlaces 'Ir a Mozo' ni 'Ir a Caja'). Enlace 'Iniciar sesión' en app/page.tsx sin cambiar lo que ya muestra (AC-27 de la 001). Cerrar sesión con `hardNavigate('/login')` exclusivamente tras el HTTP 204 validado por `logout` en T-22. Cualquier otro estado (también 200/202 con JSON válido o de error, JSON mal formado o sin JSON), error de red o tiempo límite muestra 'No se pudo cerrar la sesión. Intenta de nuevo.', no recarga y habilita el botón para reintentar (AC-35, ADV-003-14).

### T-28. Pantalla de áreas y cambio de área (revisión 1)
- Responsable: frontend-dev
- Dependencias: T-22, T-24, T-27
- AC: AC-42, AC-43
- Descripción:
  - apps/web/src/components/auth/area-selector.tsx y apps/web/src/app/areas/page.tsx según 10.4 de la spec: barra superior con la línea y 'Cerrar sesión', encabezado '¿Dónde vas a trabajar?', `<nav aria-label="Áreas">` con un enlace grande por área permitida (getAllowedAreas, AREA_LABELS), `router.replace` a la única área si tiene una sola, y los estados de la tabla. Nunca salta a la última área recordada.
  - En la barra superior de las áreas (RoleGuard o un componente de barra), el enlace 'Cambiar de área' (href '/areas') solo si getAllowedAreas da más de un área, y `saveLastArea(area)` cuando el área se muestra (estado Listo), nunca cuando redirige.
  - Enlaces y botones de al menos 48 px de alto; a 360 px la barra pasa a dos líneas antes que desplazarse a lo ancho.

### T-25. Extremo a extremo en verde
- Responsable: frontend-dev
- Dependencias: T-14, T-19, T-21, T-23, T-24, T-28
- AC: AC-37, AC-38, AC-39, AC-44
- Descripción: `pnpm test:e2e` con `pnpm dev` detenido. Ajustar la interfaz (tamaños, desplazamiento horizontal a 360 px) hasta que pasen AC-37 a AC-39 y AC-44 y sigan pasando AC-29 a AC-32 de la 001. Si una prueba E2E parece incorrecta, reportarlo.

## Cierre

### T-26. Verificación final
- Responsable: backend-dev (con el reporte de frontend-dev de T-25)
- Dependencias: T-15 a T-25 y T-28
- AC: todos (requisitos R-003-01 a R-003-09)
- Descripción:
  - `pnpm test`, `pnpm lint`, `pnpm typecheck` y `pnpm test:coverage` con código 0 (services de la API, incluidos services/auth y services/users, con 90 % o más; shared con 90 % o más).
  - R-003-01 (`pnpm install --frozen-lockfile` sin aviso y `why @types/node`), R-003-02 (`pnpm run`), R-003-04 (`git diff main -- apps/api/.env.example apps/api/src/config/env.ts` vacío) y R-003-07 (grep de R-14 de la 001).
  - `pnpm test:e2e` con `pnpm dev` detenido.
  - Anotar en el reporte los pendientes manuales para el usuario: R-003-06 y la sección 17 de la spec.

## Matriz AC, pruebas e implementación

| AC | Prueba (test-writer) | Implementación |
| --- | --- | --- |
| AC-01 a AC-04, AC-40 | T-02 | T-15 |
| AC-05 a AC-07 | T-03 | T-16 |
| AC-08, AC-10 | T-04 | T-17 |
| AC-09 | T-05 | T-17 |
| AC-11 | T-04 | T-18 |
| AC-12, AC-13, AC-24 | T-06 | T-19 |
| AC-14, AC-15 | T-07 | T-19 |
| AC-16, AC-17 | T-08 | T-19 |
| AC-18 a AC-22 | T-09 | T-18, T-19 |
| AC-23 | T-10 | T-18 |
| AC-25 | T-10 | T-20 |
| AC-26, AC-27 | T-11 | T-21 |
| AC-28 | T-12 | T-22 |
| AC-41 | T-27 | T-22 |
| AC-29 a AC-32 | T-12 | T-23 |
| AC-33 a AC-36 | T-13 | T-24 (AC-35 también T-22) |
| AC-42, AC-43 | T-27 | T-28 |
| AC-37 a AC-39, AC-44 | T-14 | T-25 (con T-19, T-21 y T-28) |
| Ajuste del helper de limpieza (AC-21 y AC-24 de la 001, ADV-001-06) | T-03 | — |
