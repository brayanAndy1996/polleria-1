# Tareas — Spec 004: gestión de usuarios por el administrador

- Spec: docs/specs/004-users-admin/spec.md (Aprobada, 2026-10-08)
- Rama: feat/004-users-admin
- Contrato: docs/api/openapi.yaml (versión 0.4.0: /users, /users/{userId} y /users/{userId}/pin; AdminUser, UserNotFound y LastAdminRequired)
- ADR: ninguno nuevo (reutiliza las piezas del ADR 0002: sesión en la base, bcrypt, límite de intentos propio)
- Dependencias: ninguna nueva. Sin variables de entorno nuevas ni migraciones nuevas (la tabla users de la 003 ya basta).
- Aclaración 1 (2026-10-08): '/admin' no es un puesto de trabajo. Se sigue guardando en 'polleria:lastArea' pero vale "sin área recordada" para el aterrizaje tras login (solo aplican /mozo, /caja, /cocina) y, guardado '/admin', /login muestra la lista en vez del teclado de 'polleria:lastUsername'. Detalle en la sección 19 de la spec; lo tienen en cuenta las pruebas de componentes y E2E que toquen 'polleria:lastArea' con '/admin' (T-04, T-05, T-11 a T-14).

## Orden y por qué

1. **Sin instalación**: no hay paquetes nuevos; el primer paso es directamente el test-writer.
2. **Pruebas en rojo (T-01 a T-05)**: test-writer escribe las pruebas de los 27 AC: esquemas de shared, servicios y API sobre polleria_test, componentes web y E2E (con el ajuste de e2e/global-setup.ts).
3. **Implementación**: backend-dev primero T-06 (esquemas de shared, que la web importa) y T-07 (clearAttempts); después puede continuar con el servicio (T-08) y las rutas (T-09) en paralelo con frontend-dev (T-10 a T-13). T-14 (E2E en verde) necesita el backend y las pantallas terminados.
4. **Cierre (T-15)**: definición de terminado y requisitos R-004-01 a R-004-07.

Aprobación: el usuario respondió las preguntas 1 a 6 el 2026-10-08 con las recomendaciones (supuestos S-004-01 a S-004-08 confirmados). En particular, la pregunta 4 fue aprobada: T-09 incluye que create-admin.ts valide el PIN con strongPinSchema.

## Pruebas en rojo (test-writer)

Reglas comunes:
- Cada archivo de prueba de esta spec envuelve sus pruebas en un `describe` cuyo nombre empieza con `004:` y el nombre de cada prueba empieza con el ID del AC: `it('AC-14: crea un usuario', ...)`.
- Importar desde las rutas de la sección 11 de la spec; que fallen por módulo inexistente es un rojo válido.
- Base de pruebas: solo polleria_test (DATABASE_URL_TEST) con las guardias de RN-001-02. Vaciar users y sessions entre pruebas con `clearAuthTables` / `migrateAndClearAuthTables` (ya existen; no hace falta tocar resetMigrationTables porque no hay tablas nuevas).
- Hasher rápido: `createBcryptPinHasher({ cost: 4 })` en la app y en los servicios, salvo que el AC pida el costo real (ninguno lo exige: basta con verificar el prefijo '$2b$' y `verify`).
- Reloj: `let current = T0; createApp({ sequelize, now: () => current, pinHasher })`, con `T0 = new Date('2026-10-08T15:00:00.000Z')`. Reutilizar los helpers de apps/api/tests/helpers/auth.ts (setupAuth, loginWithCookie); si hace falta una "cookie de admin", crear el usuario con `roles: ['admin']` y entrar con loginWithCookie.
- Textos con caracteres especiales siempre con escapes (`'\u00A0'`, `'\u0661'`), nunca literales.
- Web: simular `next/navigation` (useRouter con `replace` espiado; `useParams` devuelve el id de la ruta para /admin/usuarios/[id]) y `apps/web/src/lib/navigation.ts` con `vi.mock`; `fireEvent.click` basta para los botones de HeroUI; limpiar localStorage entre pruebas. La sesión simulada por defecto es la de un administrador.
- Commits con prefijo test, por ejemplo `test(004): pruebas del servicio de administración de usuarios`.

### T-01. Esquemas de usuarios en shared
- Responsable: test-writer
- Dependencias: ninguna
- AC: AC-01, AC-02, AC-03, AC-04, AC-05, AC-06
- Descripción: packages/shared/src/users.test.ts (importando desde '@polleria/shared'). Tablas de PIN débiles y fuertes de AC-01 con `it.each`, incluido que pinSchema siga aceptando '1234'; comprobar los mensajes exactos en `error.issues` (WEAK_PIN_MESSAGE, 'No indicaste ningún cambio.'); ERROR_CODES nuevos en AC-06.

### T-02. Servicios de administración y clearAttempts
- Responsable: test-writer
- Dependencias: ninguna
- AC: AC-07, AC-08, AC-09, AC-10, AC-11, AC-12
- Descripción:
  - Archivo nuevo apps/api/src/services/auth/login-limiter-clear-attempts.test.ts con `describe('004: ...')` para AC-07 (las pruebas de cada spec van en archivos nuevos; login-limiter.test.ts de la 003 no se toca).
  - apps/api/tests/users-admin-service.test.ts con AC-08 a AC-12 sobre polleria_test: crear usuarios con createUserService, desactivar con SQL, sesiones con sessionService.createSession y bloqueo con el mismo loginLimiter inyectado en el servicio (createUserAdminService con el `loginLimiter` del test). AC-11 incluye el caso simultáneo con Promise.all. AC-12 verifica el cambio de pin_hash con verify, el borrado de sesiones y el conteo limpio.

### T-03. API de usuarios
- Responsable: test-writer
- Dependencias: T-02
- AC: AC-13, AC-14, AC-15, AC-16, AC-17, AC-18
- Descripción: apps/api/tests/users-admin.test.ts. Cookies reales de loginWithCookie (admin, mozo, waiter+cashier, etc.). console.error espiado (los 4xx no se registran). Comprobar cuerpos exactos de USERNAME_TAKEN, USER_NOT_FOUND y LAST_ADMIN_REQUIRED, la cabecera Cache-Control: no-store en todas las respuestas, el efecto completo de desactivar (desaparece de /api/auth/users, su cookie muere, su login da 401) y de restablecer el PIN (login nuevo 200, viejo 401, sin 429).

### T-04. Componentes web de la administración de usuarios
- Responsable: test-writer
- Dependencias: ninguna
- AC: AC-19, AC-20, AC-21, AC-22, AC-23, AC-24, AC-25
- Descripción:
  - apps/web/src/lib/api/users.test.ts y un archivo nuevo apps/web/src/lib/api/client-patch.test.ts con `describe('004: ...')` para el caso 'PATCH' (client.test.ts de la 003 no se toca): AC-19 con MSW (método PATCH real, expectedStatus 201/200/204, ApiError con code y details).
  - Pruebas de componentes dentro de Providers: enlace 'Usuarios' en app/admin/page.tsx y guardia por área de las tres páginas nuevas (AC-20); lista /admin/usuarios con '(tú)', 'Desactivado', enlaces Editar y estados (AC-21); formulario /admin/usuarios/nuevo con sus validaciones locales y errores de la API (AC-22); página /admin/usuarios/[id] con perfil (AC-23), restablecer PIN con confirmación (AC-24) y activar/desactivar con confirmación (AC-25).

### T-05. Extremo a extremo
- Responsable: test-writer
- Dependencias: T-03
- AC: AC-26, AC-27
- Descripción:
  - e2e/global-setup.ts: conservar los cuatro usuarios de la 003; agregar la creación de e2e.gestion2 ('Gestión E2E Dos', waiter, PIN '5926') y, antes de crear nada, un `DELETE FROM users WHERE username = 'e2e.gestion'` sobre polleria_test con las mismas guardias (la tabla users está autorizada). Todo dentro del proceso Node nativo ya aislado.
  - e2e/users-admin.spec.ts con AC-26 y AC-27, solo en desktop-chrome. Flujo completo por la interfaz: login de e2e.admin, /admin → 'Usuarios' → 'Agregar usuario' → crear 'e2e.gestion' con PIN '3968' y rol Mozo → 'Cerrar sesión' → entrar como 'Gestión E2E'. Para AC-27: desactivar a e2e.gestion2, comprobar que sale de /login, reactivarlo y entrar con '5926'. Cuidar el límite de intentos: ningún usuario supera 2 intentos fallidos por corrida.

### Verificación del rojo (al terminar T-01 a T-05)
- `pnpm test` falla solo por módulos inexistentes o comportamiento ausente. Las pruebas de las specs 001 a 003 siguen en verde (no se toca ninguna).
- `pnpm test:e2e` (con `pnpm dev` detenido) falla en las pruebas nuevas por lo que falta; las anteriores siguen en verde.
- `pnpm typecheck` y `pnpm lint` pueden fallar solo en cascada por los módulos que aún no existen.

## Implementación del backend (backend-dev)

Reglas comunes:
- No crear, modificar ni borrar archivos de prueba (`*.test.ts`, `*.test.tsx`, apps/api/tests/, e2e/). Si una prueba parece contradecir la spec, detenerse y reportarlo.
- Sintaxis borrable (D-02 de la 001), imports relativos con .ts, mensajes exactos de la spec. Sin SQL con interpolación de valores.
- Sin dependencias nuevas ni variables de entorno nuevas.
- Commits con prefijo feat, sin archivos de prueba. Antes de cada commit: `pnpm --filter @polleria/api run typecheck` y `pnpm lint`.

### T-06. Esquemas y códigos de error en shared
- Responsable: backend-dev
- Dependencias: T-01
- AC: AC-01, AC-02, AC-03, AC-04, AC-05, AC-06
- Descripción: packages/shared/src/users.ts (exportado por index.ts) con WEAK_PIN_MESSAGE, isWeakPin (función pura, nunca lanza; secuencia circular = cada dígito es (anterior+1) mod 10 en todo el PIN, o (anterior−1) mod 10; año entre 1900 y 2099 solo si tiene 4 dígitos; DDMM con 4 y DDMMAA con 6; '2580'), strongPinSchema, createUserRequestSchema, updateUserRequestSchema, resetPinRequestSchema, adminUserSchema y usersResponseSchema. pinSchema no se toca. errors.ts suma USER_NOT_FOUND y LAST_ADMIN_REQUIRED. Mantener el 90 % de cobertura de shared. Hacerla primero: frontend-dev la necesita.

### T-07. Limpiar el conteo de intentos
- Responsable: backend-dev
- Dependencias: T-02
- AC: AC-07
- Descripción: login-limiter.ts suma `clearAttempts(userId)` (borra la entrada del Map; no lanza si no existe). La interfaz LoginLimiter la incluye.

### T-08. Servicio de administración de usuarios
- Responsable: backend-dev
- Dependencias: T-02, T-06, T-07
- AC: AC-08, AC-09, AC-10, AC-11, AC-12
- Descripción: en apps/api/src/services/users/ (mismo módulo o archivo hermano): `createUserAdminService({ models, pinHasher, sessionService, loginLimiter })` con listUsers (todos, orden de AC-08, roles con sortUserRoles, sin pinHash), updateUser y resetUserPin según D-004-04, D-004-05 y D-004-08: validación con los esquemas (ZodError), USER_NOT_FOUND, transacción con `SELECT ... FOR UPDATE` sobre las filas de administradores activos antes de contar (Op.contains con '{admin}' y isActive), borrado de sesiones dentro de la transacción (models.Session.destroy por userId) y clearAttempts después de confirmar. createUserService queda igual.

### T-09. Controller, rutas y app; PIN fuerte en el comando
- Responsable: backend-dev
- Dependencias: T-03, T-06, T-08
- AC: AC-13, AC-14, AC-15, AC-16, AC-17, AC-18 (requisitos R-004-01, R-004-04)
- Descripción:
  - apps/api/src/controllers/users.controller.ts: parsea `userId` de la ruta (`^[0-9]+$`, entero, entre 1 y 2147483647; si no, AppError VALIDATION_ERROR con issues `[{ path: 'userId', message: 'El identificador del usuario no es válido.' }]`), parsea el cuerpo con los esquemas de shared (ZodError al errorHandler), responde 201/200/204.
  - apps/api/src/routes/users.routes.ts: middleware con `Cache-Control: no-store` y `requireAuth` + `requireRole('admin')` aplicados a todas sus rutas; GET /, POST /, PATCH /:userId, POST /:userId/pin.
  - app.ts: un solo LoginLimiter compartido entre authService y userAdminService (sacarlo de la llamada a createAuthService a una constante); montar `/users` en createApiRouter.
  - Aprobado en la pregunta 4 (S-004-06): create-admin.ts valida el PIN con strongPinSchema (sin más cambios).
  - createUserService no se toca: el alta web valida el PIN con createUserRequestSchema antes de llamarlo.

## Implementación de la web (frontend-dev)

Reglas comunes:
- No crear, modificar ni borrar archivos de prueba. No modificar packages/shared: si falta algo, pedirlo en el reporte.
- HeroUI para los controles, Tailwind para el diseño, botones y enlaces de al menos 48 px de alto, textos exactos de la sección 10 de la spec. Campos de PIN con input que oculta lo escrito (type="password", inputMode="numeric"), sin mostrar los dígitos.
- TanStack Query con `retry: false`; tras cada mutación exitosa, invalidar la consulta de usuarios (clave `['admin', 'users']`) y `['auth', 'me']` si el usuario editado puede ser el propio.
- Commits con prefijo feat, sin archivos de prueba. Antes de cada commit: `pnpm --filter @polleria/web run typecheck` y `pnpm lint`.

### T-10. Cliente PATCH y funciones de usuarios
- Responsable: frontend-dev
- Dependencias: T-04, T-06
- AC: AC-19
- Descripción: apps/web/src/lib/api/client.ts suma 'PATCH' a `ApiRequestOptions.method` (nada más cambia). apps/web/src/lib/api/users.ts nuevo con getUsers, createUser, updateUser y resetUserPin según la sección 11: respuestas JSON validadas con los esquemas de shared (usersResponseSchema, adminUserSchema; si no cumple, ApiError UNEXPECTED_RESPONSE) y `expectedStatus` 201 en createUser, 200 en updateUser y 204 en resetUserPin.

### T-11. Enlace en Administración y lista de usuarios
- Responsable: frontend-dev
- Dependencias: T-04, T-10
- AC: AC-20, AC-21
- Descripción: enlace 'Usuarios' en app/admin/page.tsx; apps/web/src/app/admin/usuarios/page.tsx con RoleGuard area '/admin': encabezado 'Usuarios', 'Agregar usuario' a /admin/usuarios/nuevo, filas con displayName, username, etiquetas de roles (formatRoleLabels de la 003), 'Desactivado', '(tú)' comparando con el id de la sesión en caché y el enlace 'Editar' a /admin/usuarios/<id>. Estados 'Cargando usuarios...', 'No se pudo cargar la lista de usuarios.' + 'Reintentar'.

### T-12. Formulario de alta
- Responsable: frontend-dev
- Dependencias: T-04, T-10, T-11
- AC: AC-22
- Descripción: apps/web/src/app/admin/usuarios/nuevo/page.tsx con RoleGuard area '/admin' y el formulario de 10.3: validación local con los esquemas de shared y 'Los PIN no coinciden.', un solo envío ('Creando...'), éxito con replace('/admin/usuarios') e invalidación, y los mensajes de error de AC-22 con los campos de PIN vacíos tras un error del servidor.

### T-13. Página de edición (perfil, PIN y estado)
- Responsable: frontend-dev
- Dependencias: T-04, T-10, T-11
- AC: AC-23, AC-24, AC-25
- Descripción: apps/web/src/app/admin/usuarios/[id]/page.tsx con RoleGuard area '/admin' según 10.4: usuario tomado de la lista (consulta GET /api/users y buscar por id; si no está, 'Ese usuario no existe.' sin formulario), username fijo, sección de perfil con 'Guardar cambios' y 'Cambios guardados.', sección de PIN con confirmación 'Se cerrarán las sesiones de <displayName>. ¿Restablecer su PIN?' y 'PIN actualizado.', y sección de estado con 'Desactivar'/'¿Desactivar a <displayName>? No podrá iniciar sesión.'/'Sí, desactivar'/'Cancelar' y 'Activar' sin confirmación. Errores de AC-23 a AC-25.

### T-14. Extremo a extremo en verde
- Responsable: frontend-dev
- Dependencias: T-05, T-09, T-12, T-13
- AC: AC-26, AC-27
- Descripción: `pnpm test:e2e` con `pnpm dev` detenido. Ajustar la interfaz hasta que pasen AC-26 y AC-27 y sigan pasando los E2E anteriores (home.spec.ts y auth.spec.ts). Si una prueba E2E parece incorrecta, reportarlo.

## Cierre

### T-15. Verificación final
- Responsable: backend-dev (con el reporte de frontend-dev de T-14)
- Dependencias: T-06 a T-14
- AC: todos (requisitos R-004-01 a R-004-07)
- Descripción:
  - `pnpm test`, `pnpm lint`, `pnpm typecheck` y `pnpm test:coverage` con código 0 (services de la API, incluido services/users, con 90 % o más; shared con 90 % o más).
  - R-004-03 (`git diff main -- apps/api/.env.example apps/api/src/config/env.ts` vacío), R-004-04 (`git status --porcelain apps/api/src/db/migrations` vacío) y R-004-06 (grep de R-14 de la 001).
  - `pnpm test:e2e` con `pnpm dev` detenido.
  - Anotar en el reporte los pendientes manuales para el usuario: sección 17 de la spec.

## Matriz AC, pruebas e implementación

| AC | Prueba (test-writer) | Implementación |
| --- | --- | --- |
| AC-01 a AC-06 | T-01 | T-06 |
| AC-07 | T-02 | T-07 |
| AC-08 a AC-12 | T-02 | T-08 |
| AC-13 a AC-18 | T-03 | T-09 |
| AC-19 | T-04 | T-10 |
| AC-20, AC-21 | T-04 | T-11 |
| AC-22 | T-04 | T-12 |
| AC-23 a AC-25 | T-04 | T-13 |
| AC-26, AC-27 | T-05 | T-14 |
