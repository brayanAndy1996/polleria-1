# Spec 004 — Gestión de usuarios por el administrador

- Estado: Aprobada (2026-10-08, por el usuario, con las respuestas recomendadas a las preguntas 1 a 6)
- Aclaración 1 (2026-10-08): '/admin' se guarda en 'polleria:lastArea' pero no es un puesto de trabajo para el aterrizaje tras login ni para el usuario recordado en /login. Detalle en la sección 19.
- Fase: 1 (Usuarios y carta)
- Rama: feat/004-users-admin
- Fecha: 2026-10-08
- Cubre: la parte de administración del módulo Usuarios (propuesta §3 de docs/planificacion.md: el administrador "gestiona carta, precios, stock, usuarios") que completa RF-01 en la práctica: para que cada trabajador entre con su PIN (ya implementado en la spec 003) alguien debe poder darlo de alta, asignarle roles y desactivarlo desde la web. Avanza RNF-09 (cada usuario accede con su PIN propio: el administrador crea y restablece PIN sin verlos) y RNF-10 (los PIN creados y restablecidos se guardan cifrados con bcrypt). Aporta a RNF-02 (botones grandes, español sencillo) y al espíritu de RNF-12 (los usuarios se configuran desde el sistema, sin comandos en la PC del servidor; el texto del RNF se refiere a precios, productos y mesas).
- Documentos relacionados: tasks.md (esta carpeta), docs/specs/003-users-pin-login/spec.md (sesión, PIN, roles, requireAuth/requireRole y la nota de su sección 18 que esta spec cumple), docs/api/openapi.yaml (versión 0.4.0), docs/decisions/0002-sesion-pin-y-limite-de-intentos.md (ADR, Aceptado).

## 1. Contexto

Con la 003, cada trabajador entra al sistema tocando su nombre y escribiendo su PIN, pero solo existe un usuario: el administrador que creó el comando `pnpm users:create-admin`. Para que mozos, cocineros y cajeros trabajen hace falta que el dueño los dé de alta, les asigne sus roles (uno o varios), corrija su nombre visible, les restablezca el PIN cuando lo olviden y los desactive cuando ya no trabajen en la pollería. Todo eso desde la pantalla de Administración, sin comandos en la PC del servidor. Además, como los PIN los elige una persona, esta spec agrega el rechazo de PIN fáciles de adivinar (1234, 0000, fechas): el límite de intentos de la 003 protege las cuentas, pero conviene no regalar los PIN más probados.

## 2. Historias de usuario

| ID | Historia |
| --- | --- |
| HU-004-01 | Como administrador (dueño), quiero dar de alta a un trabajador con su nombre de usuario, su nombre visible, un PIN inicial y uno o varios roles, para que entre al sistema el mismo día que empieza. |
| HU-004-02 | Como administrador, quiero ver la lista de todos los usuarios (activos e inactivos) con sus roles, para saber quién puede entrar y a qué área. |
| HU-004-03 | Como administrador, quiero corregir el nombre visible y cambiar los roles de un trabajador (por ejemplo, un mozo que ahora también cobra), sin crear un usuario nuevo. |
| HU-004-04 | Como administrador, quiero restablecer el PIN de un trabajador que lo olvidó o cuyo PIN se conoció, para que vuelva a entrar con uno nuevo y sus sesiones viejas dejen de servir. |
| HU-004-05 | Como administrador, quiero desactivar a un trabajador que ya no trabaja aquí (y reactivarlo si vuelve), sin borrar su historial de pedidos y cobros futuros. |
| HU-004-06 | Como administrador, quiero que el sistema no me deje poner PIN muy fáciles (como 1234 o un cumpleaños), para que nadie adivine el PIN de otro a la primera. |
| HU-004-07 | Como administrador, quiero que el sistema me avise si una acción va a dejar el local sin administradores activos, para no quedarme fuera del sistema. |

## 3. Decisiones técnicas

Las que no confirmó el usuario están marcadas como SUPUESTO y repetidas en Preguntas abiertas (sección 16).

Aclaración 1 (2026-10-08): '/admin' no es un puesto de trabajo. El dispositivo sigue guardando la última área en 'polleria:lastArea' (incluida '/admin'), pero el aterrizaje directo tras iniciar sesión solo aplica a /mozo, /caja y /cocina, y cuando la última área fue '/admin' la pantalla /login muestra la lista de usuarios en lugar del teclado del usuario recordado. Resuelve la tensión entre AC-32, AC-43 y AC-44 de la 003 y AC-26/AC-27 de esta spec sin cambiar la letra de ningún AC ni el contrato. Detalle en la sección 19.

**D-004-01. Alcance y permisos.**
- Cuatro operaciones nuevas bajo /api/users, todas protegidas con `requireAuth` y `requireRole('admin')`: el administrador es el único que gestiona usuarios (RN-004-01). Un mozo, un cocinero, un cajero o alguien con varios de esos roles recibe 403 FORBIDDEN; sin sesión, 401 UNAUTHENTICATED.
- Todas las respuestas de /api/users/* llevan `Cache-Control: no-store`, también las de error (mismo patrón que /auth/*).
- Las operaciones son: listar todos los usuarios, crear uno, editar nombre visible/roles/estado activo y restablecer el PIN. No hay borrado de usuarios ni endpoint de detalle: la lista ya trae todo lo que la pantalla necesita (RN-004-05).
- El nombre de usuario no se puede cambiar una vez creado (SUPUESTO S-004-05). Es la identidad estable del trabajador: la usa el login, la recuerda el dispositivo y la verán los reportes futuros. Si el administrador se equivoca al escribirlo, desactiva ese usuario y crea otro.

**D-004-02. Rechazo de PIN fáciles (SUPUESTO S-004-02).**
- Regla nueva, en @polleria/shared: `isWeakPin(pin)` y `strongPinSchema` (= `pinSchema` + la regla). Se aplica al crear un usuario y al restablecer un PIN, nunca al iniciar sesión: un PIN débil creado antes de esta regla (por ejemplo en la base de desarrollo) debe seguir sirviendo para entrar; `pinSchema` no cambia.
- Un PIN es débil (`isWeakPin` devuelve true) si cumple cualquiera de estas reglas:
  1. **Repetido**: todos los dígitos iguales (0000, 1111, 55555, 999999).
  2. **Secuencia circular**: cada dígito es el anterior +1 (módulo 10) en todo el PIN, o el anterior −1 (módulo 10) en todo el PIN. Así se rechazan 1234, 2345, 0123, 12345, 123456, 4321, 9876, 654321 y también las que cruzan el 9→0: 7890, 8901, 9012, 0987, 32109.
  3. **Año**: un PIN de 4 dígitos entre 1900 y 2099 (años de nacimiento, del negocio, del matrimonio).
  4. **Fecha**: un PIN de 4 dígitos que sea día-mes válido (DDMM: día 01 a 31 y mes 01 a 12; por ejemplo 2512 = 25 de diciembre) o uno de 6 dígitos que sea día-mes-año válido (DDMMAA: día 01 a 31, mes 01 a 12, año cualquiera; por ejemplo 150385 = 15 de marzo del 85). Los PIN de 5 dígitos no representan una fecha y no se evalúan con esta regla.
  5. **Lista corta**: '2580' (la columna del medio del teclado numérico, PIN típico).
- No se valida contra el día real del mes (3102 vale como fecha aunque febrero no tenga 31): la regla busca PIN evidentes, no un calendario exacto.
- `isWeakPin` recibe cualquier texto y nunca lanza: devuelve false para entradas que no son `^[0-9]{4,6}$` (el formato lo revisa `pinSchema` antes). En el esquema, el mensaje es el mismo para todas las reglas: `WEAK_PIN_MESSAGE` = 'Ese PIN es muy fácil de adivinar. Elige otro.', como issue de `VALIDATION_ERROR` en el campo `pin`.
- Criterio de la lista: reglas mecánicas y pocas, fáciles de explicar ("nada de dígitos repetidos, corridas, años ni fechas") y de probar. La cobertura de estadísticas reales (los PIN más usados del mundo) es excesiva para una red local protegida por el límite de intentos. La lista exacta era la pregunta 2 y quedó aprobada tal cual.

**D-004-03. Quién escribe el PIN (SUPUESTO S-004-01).**
- Al crear un usuario y al restablecer un PIN, el administrador escribe el PIN nuevo dos veces en el formulario web (campos numéricos ocultos, inputMode numeric): la segunda escritura evita errores de tipeo ('Los PIN no coinciden.'). La API recibe el PIN una sola vez; la repetición es una validación de la web.
- La alternativa —que el sistema genere un PIN al azar y lo muestre una sola vez al administrador— es la pregunta 1. Elegir el PIN el administrador es coherente con `pnpm users:create-admin`, no necesita una pantalla de "muéstralo ahora porque no volverá a verse" y el rechazo de PIN fáciles (D-004-02) cubre el riesgo de que elija 1234.
- El administrador nunca ve el PIN anterior de un trabajador (no se puede: solo existe su hash). Tampoco puede ver el PIN de nadie en la lista ni en ninguna respuesta (RN-004-02).

**D-004-04. Al menos un administrador activo, siempre (SUPUESTO S-004-03).**
- Regla RN-004-04: ninguna operación puede dejar el sistema sin al menos un usuario activo con el rol `admin`. Si quitar el rol admin o desactivar a un usuario dejaría cero administradores activos, la operación se rechaza con 409 LAST_ADMIN_REQUIRED ('Debe quedar al menos un administrador activo.') y nada cambia.
- La regla vale igual para otros administradores y para el propio usuario que hace la acción (SUPUESTO S-004-03, pregunta 3): un administrador SÍ puede desactivarse o quitarse el rol admin a sí mismo, pero solo cuando queda otro administrador activo. Su sesión muere en ese momento (D-004-05) y queda en /login. Esto permite al dueño jubilar una cuenta de administrador vieja o mover la administración a otra persona sin comandos. La alternativa —prohibir toda autogestión destructiva— es la pregunta 3.
- Implementación: la comprobación y la actualización van dentro de una transacción que bloquea las filas de los administradores activos (`SELECT ... FOR UPDATE` sobre las filas con `roles @> '{admin}' AND is_active`), de modo que dos administradores que se quitan el rol a la vez no puedan dejar el sistema sin administrador (AC-11).

**D-004-05. Desactivar y restablecer PIN cierran sesiones y limpian el conteo (SUPUESTO S-004-04).**
- Cumple la nota de la sección 18 de la spec 003: al desactivar a un usuario (`isActive: false`) o al restablecer su PIN se borran todas sus sesiones de la tabla sessions y se limpia su conteo del límite de intentos (su bloqueo, si lo tenía, desaparece).
- Borrar las sesiones de un desactivado es higiene (de todas formas valían 401 por `is_active`, pero no quedan filas muertas); al restablecer el PIN es seguridad: si el PIN se conoció, las sesiones iniciadas con él mueren al instante.
- Reactivar (`isActive: true`) no hace nada más: el trabajador entra con su PIN de siempre y, como el conteo se limpió al desactivarlo, no hereda ningún bloqueo. Así "desbloquear" a un usuario ya tiene camino (restablecer su PIN o desactivar/reactivar); no hay botón "Desbloquear" aparte (SUPUESTO S-004-07, pregunta 6).
- Editar nombre visible o roles no toca sesiones ni el conteo: los roles y el nombre se leen de la base en cada solicitud (RN-003-06) y valen desde la siguiente.

**D-004-06. Errores (formato común).**

| code | HTTP | message | details | Cuándo |
| --- | --- | --- | --- | --- |
| VALIDATION_ERROR | 400 | Los datos enviados no son válidos. | `{ issues }` | Cuerpo o `userId` de la ruta inválidos; incluye el PIN débil (issue `pin` con 'Ese PIN es muy fácil de adivinar. Elige otro.') y el PATCH vacío ('No indicaste ningún cambio.'). |
| USERNAME_TAKEN | 409 | Ese nombre de usuario ya existe. | null | Crear un usuario con un nombre de usuario que ya existe, activo o inactivo (el código ya existe desde la 003). |
| USER_NOT_FOUND | 404 | Ese usuario no existe. | null | PATCH o restablecer PIN sobre un `userId` que no existe. |
| LAST_ADMIN_REQUIRED | 409 | Debe quedar al menos un administrador activo. | null | La acción dejaría el sistema sin administradores activos (D-004-04). |

- USER_NOT_FOUND y LAST_ADMIN_REQUIRED se suman a ERROR_CODES de @polleria/shared. Ningún 4xx se registra en el log (RN-001-07).
- El `userId` de la ruta debe ser un entero positivo: `^[0-9]+$` y mayor que 0; si no (por ejemplo 'abc', '0', '1.5'), 400 VALIDATION_ERROR con `issues: [{ path: 'userId', message: 'El identificador del usuario no es válido.' }]`.

**D-004-07. Sin migraciones ni variables de entorno nuevas.**
- La tabla users de la 003 ya tiene todo: username, display_name, pin_hash, roles (arreglo), is_active y sus CHECK. La tabla sessions sirve para el borrado de sesiones. No hay migración nueva; el helper resetMigrationTables (que ya borra sessions y users) no cambia.
- Nada se configura por .env: CONFIG_VARIABLES sigue con las 7 variables y apps/api/.env.example no cambia.
- Sin dependencias nuevas: se reutilizan bcrypt (PinHasher), Sequelize (Op.contains para buscar administradores, transacciones) y Zod de shared.

**D-004-08. Servicio de administración de usuarios.**
- En el mismo módulo `apps/api/src/services/users/user.service.ts` (o un módulo nuevo junto a él): `createUserAdminService({ models, pinHasher, sessionService, loginLimiter })` con `listUsers()`, `updateUser(userId, input)` y `resetUserPin(userId, pin)`.
- `listUsers` devuelve todos los usuarios, activos e inactivos, ordenados por displayName con `Intl.Collator('es', { sensitivity: 'base' })` y los empates por username (la misma regla que la lista pública de /auth/users).
- `updateUser` y `resetUserPin` validan su entrada con los esquemas de shared (ZodError, igual que createUser), verifican que el usuario exista (USER_NOT_FOUND), aplican la guardia del último administrador en una transacción con bloqueo (D-004-04) y ejecutan los efectos de D-004-05 (las sesiones se borran dentro de la transacción; el conteo se limpia después de confirmar, con `loginLimiter.clearAttempts`).
- `createUserService` (003) no cambia de firma: lo siguen usando el comando y las pruebas. La validación del PIN fuerte en el alta web la hace `createUserRequestSchema` en la capa HTTP (createUser acepta el PIN ya validado; volver a validarlo con pinSchema es inocuo).
- `createApp` crea el LoginLimiter una sola vez y lo comparte entre authService y el nuevo servicio de administración, para que limpiar el conteo desde la administración afecte al inicio de sesión real.
- El comando `pnpm users:create-admin` también rechaza PIN fáciles usando `strongPinSchema` (SUPUESTO S-004-06, pregunta 4): es la otra puerta por donde se crean PIN. No cambia nada más (sigue creando solo administradores).

**D-004-09. Cliente web.**
- `ApiRequestOptions.method` suma 'PATCH' (para PATCH /users/{userId}); nada más cambia en el cliente central.
- Funciones nuevas en `apps/web/src/lib/api/users.ts`: `getUsers()`, `createUser(input)`, `updateUser(userId, input)` y `resetUserPin(userId, pin)`; las respuestas JSON se validan con los esquemas de shared y las mutaciones declaran `expectedStatus` (201, 200 y 204), igual que `logout` en la 003.
- Rutas nuevas de la web dentro del área /admin: `/admin/usuarios` (lista), `/admin/usuarios/nuevo` (alta) y `/admin/usuarios/[id]` (edición, PIN y estado). Todas envuelven su contenido en el `RoleGuard` con `area="/admin"` de la 003.
- La página /admin de la 003 gana un enlace 'Usuarios' a /admin/usuarios.

## 4. Criterios de aceptación

Cada AC tiene al menos una prueba cuyo nombre empieza con su ID. Como en las specs anteriores, cada archivo de prueba de esta spec envuelve sus pruebas en un `describe` cuyo nombre empieza con `004:` y las pruebas van en archivos nuevos. Se indica el nivel y una ubicación sugerida; la ubicación exacta la decide el test-writer.

Datos comunes de las pruebas:
- `T0` = `2026-10-08T15:00:00.000Z` (10:00 en Lima), igual que en la 003.
- "La app" es `createApp({ sequelize, now, pinHasher })` sobre polleria_test con las migraciones reales aplicadas y las tablas users y sessions vacías al empezar cada prueba. `pinHasher` puede ser `createBcryptPinHasher({ cost: 4 })` salvo que el AC pida el costo real.
- Los usuarios se crean con `createUserService` (003) y "el administrador dueno" es un usuario con `roles: ['admin']`; "cookie de admin" es la que devuelve su inicio de sesión. "Cookie de mozo", etc., igual.
- Los textos con caracteres especiales se escriben con escapes (`'\u00A0'`, `'\u0661'`), nunca literales.

### 4.1 Paquete compartido (packages/shared)

**AC-01. PIN fáciles** (unitaria, packages/shared)
- Dado `isWeakPin`, `WEAK_PIN_MESSAGE` y `strongPinSchema` exportados por '@polleria/shared',
- entonces WEAK_PIN_MESSAGE es 'Ese PIN es muy fácil de adivinar. Elige otro.';
- y `isWeakPin` devuelve true para cada uno de: '0000', '1111', '9999', '55555', '222222' (repetidos); '0123', '1234', '2345', '3456', '4567', '5678', '6789', '7890', '8901', '9012', '01234', '12345', '23456', '012345', '123456' (ascendentes circulares); '4321', '3210', '9876', '0987', '2109', '10987', '54321', '654321', '98765' (descendentes circulares); '1900', '1968', '2000', '2026', '2099' (años); '0101', '1212', '2512', '3105', '3112' (DDMM válidas); '150385', '251299' (DDMMAA válidas); y '2580' (lista);
- y devuelve false para '2468', '1357', '8642', '975310', '135790', '3968', '5926', '1029', '7770', '2946', '1899', '2100', '3212' (día 32 no es fecha), '320199' (día 32), '1299' (mes 99) y '1122' (mes 22);
- y devuelve false sin lanzar para '123', '12a4', '' y '0000000' (el formato lo revisa pinSchema);
- y `strongPinSchema` acepta '2468' y '3968' y rechaza '1234' y '150385' con issues que incluyen el mensaje de WEAK_PIN_MESSAGE, y rechaza '123' con el mensaje de pinSchema ('El PIN debe tener de 4 a 6 dígitos.');
- y `pinSchema` sigue igual: acepta '1234' y '0000' (un PIN débil creado antes de esta spec debe seguir pudiendo iniciar sesión).

**AC-02. Alta de usuario** (unitaria, packages/shared)
- Dado `createUserRequestSchema` y `type CreateUserRequest`,
- cuando valida `{ username: '  MOZO.Nuevo ', displayName: '  Ana María ', pin: '3968', roles: ['cashier', 'waiter'] }` devuelve `{ username: 'mozo.nuevo', displayName: 'Ana María', pin: '3968', roles: ['waiter', 'cashier'] }` (las transformaciones de la 003: recorte, minúsculas, NFC y orden de roles);
- y rechaza: objeto sin alguno de los cuatro campos; una propiedad de más (`{ ...válido, note: 'x' }`); username 'ab'; displayName ''; pin '12', pin '1234' o '2512' (débil, con el mensaje WEAK_PIN_MESSAGE en issues); roles `[]`, `['chef']` o `['waiter', 'waiter']`; y `undefined`.

**AC-03. Edición de usuario** (unitaria, packages/shared)
- Dado `updateUserRequestSchema` y `type UpdateUserRequest`,
- cuando valida, acepta `{ displayName: 'Nuevo' }`, `{ roles: ['admin', 'waiter'] }` (devuelve roles en el orden de USER_ROLES: `['waiter', 'admin']`), `{ isActive: false }`, `{ isActive: true }` y combinaciones como `{ displayName: 'Ana', roles: ['kitchen'], isActive: true }`;
- y rechaza `{}` con un issue que contiene el mensaje 'No indicaste ningún cambio.'; y rechaza `{ pin: '2468' }`, `{ username: 'otro' }`, `{ id: 3 }` y cualquier propiedad de más (objeto estricto); y `{ roles: [] }`, `{ roles: ['chef'] }`, `{ displayName: '' }` y `{ isActive: 'si' }`.

**AC-04. Restablecer PIN** (unitaria, packages/shared)
- Dado `resetPinRequestSchema` y `type ResetPinRequest`,
- cuando valida, acepta `{ pin: '3968' }`;
- y rechaza `{}`, `{ pin: '123' }`, `{ pin: '1234' }` y `{ pin: '2512' }` (débiles, mensaje WEAK_PIN_MESSAGE), `{ pin: 2468 }` (número) y `{ pin: '3968', pin2: '3968' }` (propiedad de más).

**AC-05. Usuario de administración y lista** (unitaria, packages/shared)
- Dado `adminUserSchema`, `usersResponseSchema` y `type AdminUser`,
- entonces adminUserSchema acepta `{ id: 3, username: 'mozo.juan', displayName: 'Juan', roles: ['cashier', 'waiter'], isActive: true }` y devuelve roles `['waiter', 'cashier']`;
- y rechaza: id 0, -1, 1.5 o '3'; falta isActive; `isActive: 'si'`; roles `[]` o `['chef']`; propiedades de más (`pinHash`, `pin_hash`, `pin`, `createdAt`, `sessions`);
- y usersResponseSchema acepta `{ users: [] }` y `{ users: [<adminUser válido>] }`, y rechaza un elemento con propiedad de más y una propiedad de más en la raíz.

**AC-06. Códigos de error nuevos** (unitaria, packages/shared)
- Dado `ERROR_CODES` y `errorResponseSchema`,
- entonces ERROR_CODES contiene USER_NOT_FOUND y LAST_ADMIN_REQUIRED con valores iguales a sus nombres, además de todos los anteriores;
- y errorResponseSchema acepta `{ error: { code: 'USER_NOT_FOUND', message: 'Ese usuario no existe.', details: null } }` y `{ error: { code: 'LAST_ADMIN_REQUIRED', message: 'Debe quedar al menos un administrador activo.', details: null } }`.

### 4.2 Servicios (apps/api, con polleria_test)

**AC-07. Limpiar el conteo de intentos** (unitaria, apps/api/src/services/auth/login-limiter.ts)
- Dado `createLoginLimiter({ now })` con el reloj en T0,
- cuando el usuario 7 llega a 5 `registerAttempt` (bloqueado: `getRetryAfterSeconds(7)` es 900) y se llama `clearAttempts(7)`, entonces `getRetryAfterSeconds(7)` es null de inmediato; y 4 `registerAttempt(7)` después lo dejan en null y el 5.º en 900 (el conteo empezó de cero);
- y `clearAttempts(9)` sobre un usuario sin intentos no lanza;
- y `clearAttempts(7)` no toca al usuario 8 que sigue bloqueado;
- y `LoginLimiter` expone `clearAttempts(userId: number): void`.

**AC-08. Listar todos los usuarios** (integración, servicio de administración)
- Dado `createUserAdminService({ models, pinHasher, sessionService, loginLimiter })` sobre polleria_test con: zoila ('Zoila', waiter), ana ('ana', cashier+waiter guardado como '{cashier,waiter}'), dueno ('Don Carlos', admin) e inactivo ('Inactivo', waiter, desactivado con SQL),
- cuando se llama `listUsers()`, entonces devuelve los cuatro usuarios (los inactivos también), en el orden ana, dueno, inactivo, zoila (displayName en español sin distinguir mayúsculas ni tildes; empates por username);
- y cada elemento tiene exactamente las claves `id`, `username`, `displayName`, `roles` (en el orden de USER_ROLES) e `isActive` (false para inactivo); ninguna lleva `pinHash` ni `pin_hash`;
- y sin usuarios devuelve `[]`.

**AC-09. Editar nombre visible y roles** (integración)
- Dado el servicio y el mozo mozo.juan ('Juan', waiter, PIN '2468'),
- cuando `updateUser(id, { displayName: '  Juan Pérez ', roles: ['cashier', 'waiter'] })`, entonces se resuelve con el AdminUser actualizado (`displayName` 'Juan Pérez' recortado y en NFC, `roles` `['waiter', 'cashier']`), la fila guarda display_name 'Juan Pérez' y roles '{waiter,cashier}', y `username` y `pin_hash` no cambiaron;
- y `updateUser(id, {})` se rechaza con ZodError ('No indicaste ningún cambio.'); entrada inválida (`roles: []`, `roles: ['chef']`, `displayName: ''`, `isActive: 'si'`) se rechaza con ZodError sin cambiar la fila;
- y `updateUser(999999, { displayName: 'Nadie' })` se rechaza con un AppError de code 'USER_NOT_FOUND', httpStatus 404 y message 'Ese usuario no existe.';
- y las sesiones del usuario y su conteo de intentos no se tocan (una sesión creada antes sigue existiendo).

**AC-10. Desactivar y reactivar** (integración)
- Dado el servicio, el mozo mozo.juan (con dos sesiones creadas con sessionService.createSession y bloqueado con 5 registerAttempt a través del mismo loginLimiter) y la cajera caja.ana (con una sesión),
- cuando `updateUser(idMozo, { isActive: false })`, entonces la fila queda con is_active false, las sesiones de mozo.juan ya no existen en la base, `getRetryAfterSeconds(idMozo)` es null y la sesión de caja.ana sigue intacta;
- cuando luego `updateUser(idMozo, { isActive: true })`, entonces is_active vuelve a true y el usuario puede iniciar sesión con su PIN de siempre (verificado en las pruebas de API);
- y desactivar a un usuario ya inactivo se resuelve igual (idempotente: is_active queda false);
- y se puede editar roles o restablecer el PIN de un usuario inactivo.

**AC-11. Siempre queda un administrador activo** (integración)
- Dado el servicio con un solo administrador dueno y el mozo mozo.juan,
- cuando `updateUser(idDueno, { isActive: false })` o `updateUser(idDueno, { roles: ['waiter'] })` o `updateUser(idDueno, { isActive: false, roles: ['waiter'] })`, entonces cada caso se rechaza con un AppError de code 'LAST_ADMIN_REQUIRED', httpStatus 409 y message 'Debe quedar al menos un administrador activo.', y la fila de dueno no cambia;
- cuando además existe otro administrador admin2 activo, esas mismas operaciones sobre dueno se resuelven (incluida la autodesactivación, D-004-04);
- y con dueno activo y admin2 inactivo, `updateUser(idDueno, { isActive: false })` se rechaza (admin2 inactivo no cuenta);
- y quitar el rol admin de un usuario inactivo que lo tenía, o desactivar al mozo, nunca disparan la regla;
- y dos `updateUser` simultáneos que intentan quitar el rol admin a los dos últimos administradores a la vez terminan con exactamente uno resuelto y el otro rechazado con LAST_ADMIN_REQUIRED.

**AC-12. Restablecer el PIN** (integración)
- Dado el servicio y el mozo mozo.juan (PIN '2468', con una sesión creada y bloqueado con 5 registerAttempt),
- cuando `resetUserPin(idMozo, '5846')`, entonces se resuelve; la fila guarda un pin_hash distinto al anterior que `verify('5846', hash)` acepta y `verify('2468', hash)` rechaza; las sesiones de mozo.juan ya no existen; y `getRetryAfterSeconds(idMozo)` es null;
- y `resetUserPin(idMozo, '1234')` o `resetUserPin(idMozo, '123')` se rechazan con ZodError sin cambiar pin_hash ni las sesiones;
- y `resetUserPin(999999, '5846')` se rechaza con USER_NOT_FOUND (404);
- y se puede restablecer el PIN de un usuario inactivo, sin tocar pin_hash ni sesiones de otros usuarios.

### 4.3 API (integración con Supertest y polleria_test)

En todos: `Cache-Control: no-store` en cada respuesta (también en las de error), console.error espiado (los 4xx no se registran) y la cookie de admin sale del inicio de sesión real de un usuario admin.

**AC-13. Lista de usuarios** (integración)
- Dado la app con los usuarios de AC-08 y cookies de admin, de mozo y de una usuaria waiter+cashier,
- cuando se hace `GET /api/users` con la cookie de admin, entonces responde 200 con un cuerpo que cumple usersResponseSchema: los cuatro usuarios en el orden de AC-08, cada uno con exactamente id, username, displayName, roles ordenados e isActive;
- y sin cookie responde 401 UNAUTHENTICATED con el cuerpo exacto de la 003; con cookie de mozo, de cocinero, de cajero o de la usuaria waiter+cashier responde 403 FORBIDDEN con el cuerpo exacto de la 003;
- y ninguna respuesta contiene 'pinHash', 'pin_hash' ni '$2b$'.

**AC-14. Crear un usuario** (integración)
- Dado la app con el administrador dueno y el mozo inactivo mozo.ex (desactivado con SQL),
- cuando se hace `POST /api/users` con la cookie de admin y `{ username: '  MOZO.Nuevo ', displayName: 'Ana María', pin: '3968', roles: ['cashier', 'waiter'] }`, entonces responde 201 con el AdminUser creado (`username` 'mozo.nuevo', `displayName` 'Ana María', `roles` `['waiter', 'cashier']`, `isActive` true) y la fila existe con un pin_hash que empieza con '$2b$' y que acepta '3968';
- y el usuario creado puede iniciar sesión con '3968' (200 en POST /api/auth/login);
- y con username 'dueno' o 'mozo.ex' (de un inactivo) responde 409 con exactamente `{ error: { code: 'USERNAME_TAKEN', message: 'Ese nombre de usuario ya existe.', details: null } }`;
- y con pin '1234' o '150385' responde 400 VALIDATION_ERROR con un issue `{ path: 'pin', message: 'Ese PIN es muy fácil de adivinar. Elige otro.' }`; con cuerpo vacío, campos faltantes, roles `[]` o una propiedad de más, 400 VALIDATION_ERROR;
- y sin cookie 401, con cookie de mozo 403;
- y un GET /api/users (ruta existente) con método distinto responde 404 NOT_FOUND como en la 003.

**AC-15. Editar un usuario** (integración)
- Dado la app con dueno (admin), otro administrador admin2, el mozo mozo.juan con una sesión abierta (cookie B) y la cajera caja.ana,
- cuando se hace `PATCH /api/users/<idMozo>` con la cookie de admin y `{ displayName: 'Juan Pérez', roles: ['waiter', 'kitchen'] }`, entonces responde 200 con el AdminUser actualizado y `GET /api/auth/me` con la cookie B muestra 'Juan Pérez' y `['waiter', 'kitchen']` (la sesión sigue viva);
- cuando se hace `PATCH /api/users/<idMozo>` con `{ isActive: false }`, entonces responde 200 con `isActive: false`; mozo.juan ya no aparece en GET /api/auth/users (lista pública), su login con el PIN correcto responde 401 INVALID_CREDENTIALS y su cookie B responde 401 en /api/auth/me (sus sesiones se borraron);
- y `PATCH /api/users/<idMozo>` con `{ isActive: true }` lo reactiva y su login vuelve a responder 200 con el mismo PIN;
- y `PATCH /api/users/999999` con `{ isActive: false }` responde 404 con exactamente `{ error: { code: 'USER_NOT_FOUND', message: 'Ese usuario no existe.', details: null } }`;
- y `PATCH /api/users/abc`, `/api/users/0`, `/api/users/1.5` y `/api/users/-3` responden 400 VALIDATION_ERROR con `issues[0].path` 'userId';
- y `PATCH /api/users/<idMozo>` con `{}` responde 400 con un issue 'No indicaste ningún cambio.'; con `{ pin: '2468' }`, `{ username: 'otro' }` o `{ id: 7 }` responde 400;
- y sin cookie 401, con cookie de mozo 403.

**AC-16. Último administrador por HTTP** (integración)
- Dado la app con dueno como único administrador y el mozo mozo.juan,
- cuando se hace `PATCH /api/users/<idDueno>` con `{ isActive: false }` o con `{ roles: ['waiter'] }`, entonces responde 409 con exactamente `{ error: { code: 'LAST_ADMIN_REQUIRED', message: 'Debe quedar al menos un administrador activo.', details: null } }` y dueno sigue activo y administrador (su login responde 200);
- y (SUPUESTO S-004-03) cuando existe otro administrador admin2 activo, `PATCH /api/users/<idDueno>` con `{ isActive: false }` hecho por el propio dueno responde 200 con `isActive: false`, y la siguiente consulta de dueno a /api/auth/me responde 401 (su sesión se borró).

**AC-17. Restablecer el PIN por HTTP** (integración)
- Dado la app con dueno (admin) y el mozo mozo.juan (PIN '2468', con una sesión abierta —cookie B— y bloqueado tras 5 intentos fallidos de login),
- cuando se hace `POST /api/users/<idMozo>/pin` con la cookie de admin y `{ pin: '5846' }`, entonces responde 204 sin cuerpo;
- y el login de mozo.juan con '5846' responde 200 (no 429: el conteo se limpió), con '2468' responde 401 INVALID_CREDENTIALS y la cookie B responde 401 en /api/auth/me;
- y con `{ pin: '1234' }` o `{ pin: '2512' }` responde 400 con el issue del PIN débil y nada cambió (el login con '5846' sigue respondiendo 200); con `{}` o con `{ pin: '5846', extra: 1 }` responde 400;
- y `POST /api/users/999999/pin` responde 404 USER_NOT_FOUND y `/api/users/abc/pin` responde 400;
- y sin cookie 401, con cookie de mozo 403.

**AC-18. Nada expone el PIN ni su hash** (integración)
- Dado la app y el administrador dueno,
- cuando se hacen GET /api/users; POST /api/users (crear con pin '3968'); PATCH /api/users/<id>; PATCH /api/users/<id> con `{ pin: '2468' }` (400); POST /api/users/<id>/pin con '5846' y con '1234' (400); y PATCH /api/users/999999 (404),
- entonces ni el cuerpo ni las cabeceras de ninguna respuesta contienen los PIN enviados ('3968', '2468', '5846'), '$2b$', el pin_hash guardado, 'pinHash' ni 'pin_hash';
- y todas llevan `Cache-Control: no-store`.

### 4.4 Web (unitarias y de componentes, con MSW)

En estas pruebas `next/navigation` se simula (`useRouter` devuelve `replace` espiado y `useParams` devuelve el id), `apps/web/src/lib/navigation.ts` se simula para espiar `hardNavigate`, la API se simula con MSW según el contrato y los componentes se renderizan dentro de Providers. La sesión de /api/auth/me por defecto es la de un administrador ('Carlos', id 1); "la lista de la API" es un GET /api/users simulado.

**AC-19. Cliente PATCH y funciones de usuarios** (unitaria, apps/web/src/lib/api)
- Dado `apiClient` con 'PATCH' permitido en `ApiRequestOptions.method`,
- entonces `request('/users/3', { method: 'PATCH', body: { isActive: false } })` envía un PATCH con el JSON a `<origin>/api/users/3` y se comporta como los demás métodos (401 UNAUTHENTICATED llama al manejador, 404/409 se rechazan con ApiError con su code y details);
- y en apps/web/src/lib/api/users.ts: `getUsers()` hace GET /users y valida la respuesta con usersResponseSchema (una respuesta mal formada se rechaza con ApiError UNEXPECTED_RESPONSE); `createUser(input)` hace POST /users con el cuerpo y valida el AdminUser con `expectedStatus: 201`; `updateUser(id, input)` hace PATCH /users/<id> con `expectedStatus: 200` y valida el AdminUser; `resetUserPin(id, pin)` hace POST /users/<id>/pin con `{ pin }` y `expectedStatus: 204` (otro 2xx, por ejemplo 200 con JSON, se rechaza con UNEXPECTED_RESPONSE, igual que logout en la 003);
- y los cuerpos de error (409 USERNAME_TAKEN, 409 LAST_ADMIN_REQUIRED, 404 USER_NOT_FOUND, 400 VALIDATION_ERROR con issues) se rechazan con ApiError que conserva code, message y details.

**AC-20. Enlace a Usuarios en Administración y guardia** (componente)
- Dado el default export de apps/web/src/app/admin/page.tsx con la sesión de un administrador,
- entonces muestra, además del encabezado 'Administración', un enlace 'Usuarios' con href '/admin/usuarios';
- y las páginas /admin/usuarios, /admin/usuarios/nuevo y /admin/usuarios/<id> usan el RoleGuard con area '/admin': con una sesión de cajero llaman a `replace('/caja')` sin mostrar el contenido, y con 401 UNAUTHENTICATED llaman a `hardNavigate('/login')`.

**AC-21. Lista de usuarios** (componente, /admin/usuarios)
- Dado la página de la lista con GET /api/users respondiendo: Carlos (id 1, admin, activo — el propio usuario de la sesión), Ana (waiter+cashier, activa) y Beto (kitchen, inactivo),
- mientras carga, un elemento con role="status" muestra 'Cargando usuarios...';
- luego se ve el encabezado h1 'Usuarios', un enlace 'Agregar usuario' con href '/admin/usuarios/nuevo' y una fila por usuario en el orden de la API: el nombre para mostrar, el nombre de usuario y las etiquetas de sus roles ('Mozo, Cajero' para Ana, 'Cocina' para Beto, 'Administrador' para Carlos); Beto lleva la marca 'Desactivado'; la fila de Carlos lleva la marca '(tú)';
- y cada fila tiene un enlace 'Editar' a '/admin/usuarios/<id>';
- y si GET /api/users responde 500 o falla la red, un role="alert" muestra 'No se pudo cargar la lista de usuarios.' con un botón 'Reintentar' que vuelve a consultar.

**AC-22. Formulario de alta** (componente, /admin/usuarios/nuevo)
- Dado la página de alta, se ve el encabezado h1 'Agregar usuario', el campo 'Nombre de usuario', el campo 'Nombre para mostrar', los campos 'PIN' y 'Repetir PIN' (ocultan lo escrito), un checkbox por rol ('Mozo', 'Cocina', 'Cajero', 'Administrador') y el botón 'Crear usuario';
- al enviar con campos válidos, se hace exactamente un POST /api/users con `{ username, displayName, pin, roles }` (la repetición del PIN no viaja); mientras espera, el botón dice 'Creando...' y está deshabilitado;
- sin tocar la API, muestra y no envía: PIN y repetición distintos → 'Los PIN no coinciden.'; sin ningún rol → 'Elige al menos un rol.';
- con 201, llama a `replace('/admin/usuarios')` e invalida la consulta de usuarios;
- con 409 USERNAME_TAKEN muestra 'Ese nombre de usuario ya existe.'; con 400 por PIN débil muestra 'Ese PIN es muy fácil de adivinar. Elige otro.'; con error de red muestra 'Sin conexión con el servidor. Revisa el wifi e intenta de nuevo.'; y en todos los errores del servidor los campos de PIN quedan vacíos y el formulario se puede corregir y reenviar.

**AC-23. Editar nombre visible y roles** (componente, /admin/usuarios/[id])
- Dado la página de edición del usuario 2 (la página lo obtiene de GET /api/users; no hay endpoint de detalle),
- entonces se ve el encabezado h1 'Editar usuario', el nombre de usuario como texto fijo (no editable), el campo 'Nombre para mostrar' con el valor actual, los checkboxes de roles marcados con los roles actuales y el botón 'Guardar cambios';
- al guardar con cambios válidos se hace un PATCH /api/users/2 con `{ displayName, roles }` (solo esas claves); mientras espera dice 'Guardando...' deshabilitado; con 200 muestra 'Cambios guardados.' y la página refleja los datos nuevos;
- sin ningún rol marcado muestra 'Elige al menos un rol.' y no envía;
- con 409 LAST_ADMIN_REQUIRED muestra 'Debe quedar al menos un administrador activo.'; con 404 USER_NOT_FOUND muestra 'Ese usuario no existe.';
- y si el id no está en la lista (usuario borrado por fuera), muestra 'Ese usuario no existe.' sin formulario.

**AC-24. Restablecer el PIN desde la página de edición** (componente)
- Dado la página de edición del usuario 2, la sección de PIN muestra los campos 'PIN nuevo' y 'Repetir PIN nuevo' (ocultan lo escrito) y el botón 'Restablecer PIN';
- al tocar el botón con los dos campos iguales y válidos aparece la confirmación 'Se cerrarán las sesiones de <displayName>. ¿Restablecer su PIN?' con 'Sí, restablecer' y 'Cancelar'; al confirmar se hace un POST /api/users/2/pin con `{ pin }`;
- con 204 muestra 'PIN actualizado.' y ambos campos quedan vacíos;
- 'Cancelar' no envía nada; PIN distintos muestran 'Los PIN no coinciden.' sin enviar; con 400 por PIN débil muestra el mensaje correspondiente; con error de red, el mensaje de red.

**AC-25. Activar y desactivar** (componente)
- Dado la página de edición del usuario 2 (activo), el botón 'Desactivar' abre la confirmación '¿Desactivar a <displayName>? No podrá iniciar sesión.' con 'Sí, desactivar' y 'Cancelar'; al confirmar se hace un PATCH /api/users/2 con `{ isActive: false }` y, tras el 200, la página muestra al usuario como 'Desactivado' y el botón pasa a 'Activar';
- con un usuario inactivo, el botón 'Activar' envía un PATCH con `{ isActive: true }` sin pedir confirmación y, tras el 200, el usuario queda activo;
- 'Cancelar' no envía nada; con 409 LAST_ADMIN_REQUIRED muestra 'Debe quedar al menos un administrador activo.' y el estado no cambia.

### 4.5 Extremo a extremo (Playwright, contra polleria_test)

La preparación global (e2e/global-setup.ts) conserva a los cuatro usuarios de la 003 y además crea e2e.gestion2 ('Gestión E2E Dos', waiter, PIN '5926') y borra el usuario 'e2e.gestion' si quedó de una corrida anterior (DELETE sobre polleria_test, con las mismas guardias).

**AC-26. El administrador crea un mozo y el mozo entra** (E2E, desktop-chrome)
- Dado /login, cuando se elige 'Admin E2E' y se envía '135790', y desde /admin se toca 'Usuarios' y luego 'Agregar usuario',
- entonces se ve el formulario; al llenar usuario 'e2e.gestion', nombre 'Gestión E2E', PIN '3968' dos veces y marcar 'Mozo', y tocar 'Crear usuario', la URL vuelve a /admin/usuarios y la lista muestra 'Gestión E2E';
- y tras 'Cerrar sesión', /login muestra un botón 'Gestión E2E'; al tocarlo y enviar '3968', la URL es /mozo con el encabezado 'Mozo'.

**AC-27. Desactivar y reactivar desde la web** (E2E, desktop-chrome)
- Dado el usuario e2e.gestion2 activo (aparece en la lista pública de /login) y una sesión de 'Admin E2E',
- cuando en /admin/usuarios/<id de e2e.gestion2> se toca 'Desactivar' y se confirma,
- entonces la página lo muestra 'Desactivado'; y tras 'Cerrar sesión', la lista de /login ya no muestra 'Gestión E2E Dos';
- y cuando el administrador vuelve a entrar y toca 'Activar' en la página de ese usuario, la lista de /login lo vuelve a mostrar y e2e.gestion2 entra con '5926' hasta /mozo.

### 4.6 Cobertura de RF y RNF

| RF o RNF | AC y requisitos que lo cubren |
| --- | --- |
| RF-01 (parte de gestión: usuarios con PIN y roles mantenidos por el administrador) | AC-08 a AC-18 (API y servicios), AC-20 a AC-25 (web), AC-26 y AC-27 (E2E) |
| RNF-09 (cada usuario accede con su PIN propio; el administrador los crea y restablece sin verlos) | AC-12, AC-14, AC-17, AC-22, AC-24 |
| RNF-10 (PIN cifrados) | AC-12, AC-14, AC-17, AC-18 |
| RNF-02 (español sencillo, botones grandes) | AC-21 a AC-25; la regla de ≥48 px de la 003 sigue en estas pantallas |
| RNF-12 (configurar desde el sistema sin tocar código — el texto habla de precios/productos/mesas; esta spec aplica el mismo principio a usuarios) | AC-14 a AC-17, AC-20 a AC-27 |
| Regla de dominio 9 (todo en la red local) | Sin llamadas nuevas a internet; R-004-06 |

## 5. Requisitos de configuración (verificados por comando)

No son comportamiento, por eso no llevan AC. Los comandos se ejecutan en Git Bash desde la raíz.

| ID | Requisito | Comando | Resultado esperado |
| --- | --- | --- | --- |
| R-004-01 | Toda ruta de apps/api/src/routes/users.routes.ts pasa por requireAuth y requireRole('admin'). | Revisión del reviewer | Se cumple. |
| R-004-02 | docs/api/openapi.yaml es OpenAPI 3.1 válido, versión 0.4.0, y coincide con lo implementado. | `npx -y @redocly/cli@latest lint docs/api/openapi.yaml` (desde una carpeta temporal) | "valid", sin errores. |
| R-004-03 | Sin variables de entorno nuevas ni cambios de configuración (D-004-07). | `git diff main -- apps/api/.env.example apps/api/src/config/env.ts` | Sin resultados. |
| R-004-04 | Sin migraciones nuevas (la tabla users ya basta). | `git status --porcelain apps/api/src/db/migrations` | Sin resultados. |
| R-004-05 | Cobertura: services de la API (incluido services/users) y shared con 90 % o más de líneas. | `pnpm test:coverage` | Código 0. |
| R-004-06 | La web sigue sin recursos de internet (R-14 de la 001). | El grep de R-14 de la 001 | Sin resultados. |
| R-004-07 | Definición de terminado de CLAUDE.md. | `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm test:coverage` | Código 0 en los cuatro. |

## 6. Reglas de negocio aplicables

De CLAUDE.md:
- Glosario: waiter, kitchen, cashier y admin en código, base y API; mozo, cocina, cajero y administrador en la interfaz.
- Regla de dominio 9: todo funciona en la red local; nada usa internet.
- Reglas para todos los agentes 6 y 7: el esquema cambia solo con migraciones (esta spec no tiene ninguna); ningún PIN ni secreto en el repositorio.

De las specs anteriores:
- RN-003-01 a RN-003-08 completas: los roles, el PIN con bcrypt costo 10, el límite de intentos, requireAuth/requireRole y las áreas se reutilizan tal cual. En particular RN-003-03 (un usuario inactivo no puede iniciar sesión) y RN-003-06 (roles y estado se leen en cada solicitud) hacen efectivos la desactivación y el cambio de roles desde la siguiente solicitud.
- RN-001-01 (sin secretos en respuestas ni logs), RN-001-05 (mensajes en español, códigos en inglés), RN-001-07 (los 4xx no se registran).

Específicas de esta spec:
- RN-004-01. Solo el administrador gestiona usuarios: las cuatro operaciones de /api/users exigen requireRole('admin').
- RN-004-02. Ningún PIN se ve, se devuelve ni se registra: el administrador escribe el PIN nuevo, nunca puede consultar el anterior (solo existe su hash bcrypt). Ninguna respuesta incluye pinHash ni el PIN enviado.
- RN-004-03. Los PIN nuevos (alta y restablecimiento) no pueden ser fáciles según D-004-02. El inicio de sesión no rechaza PIN débiles: uno creado antes sigue sirviendo.
- RN-004-04. Siempre queda al menos un usuario activo con el rol admin; la operación que lo rompería responde 409 LAST_ADMIN_REQUIRED.
- RN-004-05. Desactivar no borra al usuario: conserva su fila (y su historial futuro) y solo impide entrar hasta ser reactivado. Desactivar o restablecer el PIN borra sus sesiones y limpia su conteo de intentos; reactivar no hace nada más.
- RN-004-06. El nombre de usuario no se cambia una vez creado; el nombre visible, los roles y el estado sí.

## 7. Casos borde conocidos

- Crear un usuario con el nombre de usuario de uno inactivo: 409 USERNAME_TAKEN (el índice único es sobre todos). Si el trabajador volvió, lo correcto es reactivarlo.
- PATCH sin cambios reales (mismos valores que tiene): 200, idempotente.
- PATCH con `pin`, `username`, `id` u otra propiedad fuera del esquema: 400 (el PIN va por su propia ruta).
- `userId` de la ruta que no es un entero positivo ('abc', '0', '1.5', '-3', '999999999999999999999999'): 400 VALIDATION_ERROR, issue en `userId` ('2147483648' también supera el INTEGER de la base; el esquema lo acota al rango de integer de PostgreSQL: máximo 2147483647).
- Editar, restablecer el PIN o reactivar a un usuario inactivo: todo permitido.
- El administrador se desactiva a sí mismo siendo el único administrador: 409 LAST_ADMIN_REQUIRED (S-004-03).
- El administrador se desactiva a sí mismo existiendo otro administrador activo: permitido; su sesión muere y termina en /login (S-004-03; la alternativa es la pregunta 3).
- Un administrador restablece su propio PIN: permitido; su sesión muere (las sesiones del usuario se borran) y entra de nuevo con el PIN nuevo. La respuesta 204 ya se envió: no es un error, es el mismo comportamiento de siempre.
- Dos administradores desactivándose entre sí o quitándose el rol a la vez: la transacción con bloqueo serializa la comprobación y el segundo recibe 409 (AC-11).
- Usuario bloqueado (5 intentos): el administrador le restablece el PIN y entra al instante, sin 429; o lo desactiva y reactiva (el conteo se limpió al desactivar). No hay botón "Desbloquear" (pregunta 6).
- Un usuario con el rol admin y otros roles que pierde solo admin: queda con sus otros roles (por ejemplo ['waiter']) y entra como mozo. La guardia solo mira el rol admin.
- La lista del administrador incluye al propio administrador (marcada '(tú)'), así que nunca está vacía.
- GET /api/users/3 (GET sobre la ruta de PATCH) u otros métodos no declarados: 404 NOT_FOUND, como en la 003.
- Cuerpo JSON mal formado, gzip corrupto, más de 100 KB o Content-Encoding raro: los errores del lector del cuerpo de la 001 (INVALID_JSON, INVALID_BODY, PAYLOAD_TOO_LARGE, UNSUPPORTED_MEDIA_TYPE).
- La sesión del administrador vence con la página abierta: la siguiente consulta responde 401 y la página recarga en /login (mismo mecanismo de la 003).

## 8. Modelo de datos

Sin cambios (D-004-07). Esta spec no crea tablas ni columnas:

- La tabla **users** de la migración 20261008120000-create-users.ts ya tiene todo lo que hace falta: `username` (único, patrón verificado en la base), `display_name`, `pin_hash` (60 caracteres), `roles` (VARCHAR(16)[] con sus CHECK) e `is_active`. Editar nombre visible y roles, activar/desactivar y restablecer el PIN son UPDATEs sobre esa fila.
- La tabla **sessions** (20261008120100-create-sessions.ts) sirve para borrar las sesiones de un usuario por `user_id` (índice `sessions_user_id_idx`).
- Las consultas nuevas son `WHERE is_active AND roles @> ARRAY['admin']::VARCHAR(16)[]` (contar administradores activos, con `Op.contains` de Sequelize) dentro de una transacción con bloqueo de filas, y `WHERE user_id` para borrar sesiones. Con menos de 20 usuarios no hace falta índice sobre roles.
- `updated_at` de users se actualiza solo con cada cambio (default de Sequelize), como antes.

## 9. API

Todas las rutas cuelgan de /api. Todas las respuestas de /api/users/* llevan `Cache-Control: no-store`, también las de error. Las cuatro operaciones exigen sesión y el rol admin (401 UNAUTHENTICATED sin sesión; 403 FORBIDDEN con cualquier otro rol o combinación que no incluya admin).

| Método y ruta | Rol | Request | Respuesta correcta | Errores |
| --- | --- | --- | --- | --- |
| GET /api/users | admin | — | 200 UsersResponse | 401, 403, 500 |
| POST /api/users | admin | CreateUserRequest | 201 AdminUser | 400 VALIDATION_ERROR (incluye PIN débil), 401, 403, 409 USERNAME_TAKEN, 500 |
| PATCH /api/users/{userId} | admin | UpdateUserRequest | 200 AdminUser | 400 VALIDATION_ERROR (incluye cuerpo vacío y userId inválido), 401, 403, 404 USER_NOT_FOUND, 409 LAST_ADMIN_REQUIRED, 500 |
| POST /api/users/{userId}/pin | admin | ResetPinRequest | 204 sin cuerpo | 400 VALIDATION_ERROR (incluye PIN débil y userId inválido), 401, 403, 404 USER_NOT_FOUND, 500 |

### 9.1 GET /api/users

```json
{
  "users": [
    { "id": 1, "username": "dueno", "displayName": "Don Carlos", "roles": ["admin"], "isActive": true },
    { "id": 2, "username": "mozo.juan", "displayName": "Juan", "roles": ["waiter", "cashier"], "isActive": false }
  ]
}
```

Todos los usuarios, activos e inactivos, ordenados por displayName en español (los empates por username). Cada usuario con exactamente id, username, displayName, roles (en el orden de USER_ROLES) e isActive. Nunca pinHash ni nada del PIN.

### 9.2 POST /api/users

Request:

```json
{ "username": "mozo.ana", "displayName": "Ana María", "pin": "3968", "roles": ["waiter", "cashier"] }
```

- username se recorta y se pasa a minúsculas (usernameSchema); displayName se recorta y se normaliza (displayNameSchema); pin cumple el formato y además no es débil (strongPinSchema, D-004-02); roles cumple userRolesSchema.
- Responde 201 con el AdminUser creado (isActive siempre true). El usuario ya puede iniciar sesión.
- Username repetido —exista activo o inactivo—: 409 USERNAME_TAKEN.

### 9.3 PATCH /api/users/{userId}

Request (al menos una propiedad):

```json
{ "displayName": "Juan Pérez", "roles": ["waiter", "kitchen"], "isActive": false }
```

- Objeto estricto con las tres propiedades opcionales; `{}` responde 400 'No indicaste ningún cambio.'. El PIN no se cambia aquí (una propiedad `pin` es 400): va por 9.4.
- `isActive: false` desactiva: borra las sesiones del usuario y limpia su conteo de intentos (D-004-05). `isActive: true` reactiva sin más efectos.
- La guardia del último administrador (D-004-04) puede responder 409 LAST_ADMIN_REQUIRED.
- `userId` entero positivo; si no existe, 404 USER_NOT_FOUND.

### 9.4 POST /api/users/{userId}/pin

Request:

```json
{ "pin": "5846" }
```

- Objeto estricto con el PIN nuevo, validado con strongPinSchema.
- Guarda el nuevo hash, borra las sesiones del usuario y limpia su conteo de intentos. Responde 204 sin cuerpo: nada que mostrar.
- `userId` que no existe: 404 USER_NOT_FOUND. PIN débil o mal formado: 400.

### 9.5 Contrato

docs/api/openapi.yaml pasa a la versión 0.4.0: etiqueta users; rutas /users (GET y POST), /users/{userId} (PATCH) y /users/{userId}/pin (POST); parámetro de ruta UserId; esquemas AdminUser, UsersResponse, CreateUserRequest, UpdateUserRequest y ResetPinRequest; respuestas reutilizables UsernameTaken, UserNotFound y LastAdminRequired; ErrorCode suma USER_NOT_FOUND y LAST_ADMIN_REQUIRED, y la nota de USERNAME_TAKEN ahora la usa POST /users.

## 10. Interfaz

Textos en español de Perú. HeroUI para los controles (Button, Input, Checkbox y los que hagan falta), Tailwind para el diseño, botones y enlaces de al menos 48 px de alto y nada de recursos de internet. Consultas y mutaciones con TanStack Query (`retry: false`); tras cada mutación exitosa se invalida la consulta de usuarios (y `['auth', 'me']` si el usuario editado puede ser el propio, para que la barra superior muestre el nombre nuevo). Los campos PIN ocultan lo escrito (input tipo password con inputMode="numeric").

### 10.1 Administración (ruta /admin)

La página de la 003 gana un enlace grande 'Usuarios' (href '/admin/usuarios'). El resto no cambia.

### 10.2 Lista de usuarios (ruta /admin/usuarios)

- Quién la usa: el administrador, en la PC del local o en su celular.
- Encabezado h1 'Usuarios' y enlace 'Agregar usuario' (href '/admin/usuarios/nuevo').
- Una fila por usuario, en el orden que devuelve la API: nombre para mostrar en grande; debajo el nombre de usuario y las etiquetas de los roles ('Mozo, Cajero' con ROLE_LABELS de la 003); la marca 'Desactivado' si está inactivo y '(tú)' si es el propio administrador; y un enlace 'Editar' a '/admin/usuarios/<id>'.
- No hay estado vacío: la lista siempre incluye al propio administrador.
- Estados:

  | Estado | Cuándo | Qué se ve |
  | --- | --- | --- |
  | Cargando | GET /api/users en curso | 'Cargando usuarios...' (role="status") |
  | Error | 5xx o red | 'No se pudo cargar la lista de usuarios.' (role="alert") y 'Reintentar' |
  | Listo | 200 | El encabezado y las filas |

### 10.3 Agregar usuario (ruta /admin/usuarios/nuevo)

- Encabezado h1 'Agregar usuario'. Formulario:
  - Campo 'Nombre de usuario' (texto; el sistema lo pasa a minúsculas) con el texto de ayuda 'Letras minúsculas sin tilde, números, punto, guion o guion bajo.'
  - Campo 'Nombre para mostrar'.
  - Campos 'PIN' y 'Repetir PIN' (ocultan lo escrito; 4 a 6 dígitos).
  - 'Roles': un checkbox por rol en el orden Mozo, Cocina, Cajero, Administrador.
  - Botón 'Crear usuario' ('Creando...' deshabilitado mientras envía).
- Validación en la web antes de enviar (mismos esquemas de shared): si los PIN no coinciden muestra 'Los PIN no coinciden.'; sin roles, 'Elige al menos un rol.'. La API valida igual (los mensajes del servidor se muestran tal cual: username inválido, PIN débil, etc.).
- Éxito: `router.replace('/admin/usuarios')` con la consulta invalidada (la lista muestra al nuevo).
- Errores: USERNAME_TAKEN muestra 'Ese nombre de usuario ya existe.'; VALIDATION_ERROR muestra el primer issue (por ejemplo el de PIN débil); red/tiempo límite muestra el mensaje de red; cualquier otro muestra el message de la API. En todos los casos el formulario conserva lo escrito, salvo los dos campos de PIN que quedan vacíos (como el teclado de la 003 tras un error), y permite reintentar.

### 10.4 Editar usuario (ruta /admin/usuarios/[id])

- La página obtiene el usuario desde GET /api/users por el id de la ruta (no hay endpoint de detalle); si no está, muestra 'Ese usuario no existe.' sin formulario.
- Encabezado h1 'Editar usuario'. El nombre de usuario aparece como texto fijo (no se puede cambiar, RN-004-06).
- Sección perfil: campo 'Nombre para mostrar' con el valor actual, checkboxes de roles con los actuales y botón 'Guardar cambios' ('Guardando...'). Éxito: 'Cambios guardados.'. Sin roles marcados no envía ('Elige al menos un rol.').
- Sección PIN: campos 'PIN nuevo' y 'Repetir PIN nuevo' y botón 'Restablecer PIN'. Al tocarlo pide confirmación: 'Se cerrarán las sesiones de <displayName>. ¿Restablecer su PIN?' con 'Sí, restablecer' y 'Cancelar'. Éxito (204): 'PIN actualizado.' y los campos quedan vacíos.
- Sección estado: con un usuario activo, botón 'Desactivar' que pide confirmación: '¿Desactivar a <displayName>? No podrá iniciar sesión.' con 'Sí, desactivar' y 'Cancelar'; con un inactivo, botón 'Activar' que envía sin confirmación.
- Errores: 409 LAST_ADMIN_REQUIRED muestra 'Debe quedar al menos un administrador activo.' sin cambiar nada; 404 muestra 'Ese usuario no existe.'; VALIDATION_ERROR muestra el primer issue; red muestra el mensaje de red.
- Estados de carga/error de la página: 'Cargando...' (role="status") mientras llega la lista; el mismo error y 'Reintentar' de la lista si falla.

## 11. Contrato interno de módulos (rutas que importan las pruebas)

El test-writer importa desde estas rutas; si un módulo no existe todavía, la prueba falla por módulo inexistente (rojo válido). Sintaxis borrable (D-02 de la 001), imports relativos con .ts.

- **packages/shared/src/users.ts** (nuevo, exportado también por packages/shared/src/index.ts)
  - `WEAK_PIN_MESSAGE` = 'Ese PIN es muy fácil de adivinar. Elige otro.'.
  - `isWeakPin(pin: string): boolean` (pura; nunca lanza; false para entradas que no cumplen `^[0-9]{4,6}$`). Reglas de D-004-02.
  - `strongPinSchema` = `pinSchema` con la regla anterior (rechaza con WEAK_PIN_MESSAGE; los errores de formato conservan el mensaje de pinSchema). `pinSchema` no cambia.
  - `createUserRequestSchema` (estricto: username, displayName, pin fuerte y roles) y `type CreateUserRequest`.
  - `updateUserRequestSchema` (estricto: displayName?, roles? e isActive?; al menos una propiedad con el mensaje 'No indicaste ningún cambio.') y `type UpdateUserRequest`.
  - `resetPinRequestSchema` (estricto: pin fuerte) y `type ResetPinRequest`.
  - `adminUserSchema` (estricto: id entero positivo, username, displayName, roles con userRolesSchema, isActive boolean) y `type AdminUser`.
  - `usersResponseSchema` (estricto: `users` con arreglo de adminUserSchema) y `type UsersResponse`.
- **packages/shared/src/errors.ts** (modificado): ERROR_CODES suma USER_NOT_FOUND y LAST_ADMIN_REQUIRED.
- **apps/api/src/services/auth/login-limiter.ts** (modificado): `LoginLimiter` suma `clearAttempts(userId: number): void` (borra el conteo y el bloqueo de ese usuario; no lanza si no existe).
- **apps/api/src/services/users/user.service.ts** (o un módulo hermano user-admin.service.ts): además de lo de la 003,
  - `interface UserAdminService { listUsers(): Promise<AdminUser[]>; updateUser(userId: number, input: unknown): Promise<AdminUser>; resetUserPin(userId: number, pin: unknown): Promise<void> }` — updateUser y resetUserPin parsean su entrada con los esquemas (ZodError) para que el servicio sea seguro aunque se llame sin HTTP.
  - `createUserAdminService(deps: { models: Models; pinHasher: PinHasher; sessionService: SessionService; loginLimiter: LoginLimiter }): UserAdminService`.
  - `updateUser`: busca al usuario (USER_NOT_FOUND 404 'Ese usuario no existe.'), aplica la guardia del último administrador dentro de una transacción que bloquea las filas de administradores activos (FOR UPDATE), actualiza la fila y —si `isActive` quedó false— borra sus sesiones en la misma transacción y, tras confirmar, `loginLimiter.clearAttempts(userId)`. Devuelve el AdminUser con roles ordenados.
  - `resetUserPin`: busca al usuario (404), valida el PIN con strongPinSchema, guarda el nuevo hash y borra sus sesiones en una transacción; tras confirmar, `clearAttempts`.
  - `createUserService` no cambia de firma ni de comportamiento (el alta web le pasa un PIN ya validado por strongPinSchema desde el esquema de la solicitud).
- **apps/api/src/controllers/users.controller.ts** y **apps/api/src/routes/users.routes.ts** (nuevos): el router fija `Cache-Control: no-store` y exige `requireAuth` + `requireRole('admin')` en todas sus rutas; el controller valida `userId` (entero positivo, máximo 2147483647), parsea el cuerpo con los esquemas y devuelve 201/200/204.
- **apps/api/src/app.ts** (modificado): un solo LoginLimiter compartido entre authService y userAdminService; monta `/users` en el router de la API.
- **apps/api/src/create-admin.ts** (modificado): valida el PIN con strongPinSchema (aprobado, S-004-06); el resto no cambia.
- **apps/web/src/lib/api/client.ts** (modificado): `ApiRequestOptions.method` admite 'PATCH'.
- **apps/web/src/lib/api/users.ts** (nuevo): `getUsers()`, `createUser(input: CreateUserRequest)`, `updateUser(userId: number, input: UpdateUserRequest)`, `resetUserPin(userId: number, pin: string)`. Respuestas JSON validadas con los esquemas de shared; `expectedStatus` 201/200/204 según la operación.
- **apps/web/src/app/admin/page.tsx** (modificado): enlace 'Usuarios'.
- **apps/web/src/app/admin/usuarios/page.tsx**, **nuevo/page.tsx** y **[id]/page.tsx** (nuevos): las tres pantallas de la sección 10, con RoleGuard area '/admin'.

Rutas sugeridas para pruebas: unitarias junto al código (`packages/shared/src/users.test.ts`, `apps/api/src/services/auth/login-limiter-clear-attempts.test.ts` —archivo nuevo; login-limiter.test.ts de la 003 no se toca—, `apps/web/src/lib/api/users.test.ts` y `client-patch.test.ts`, componentes `*.test.tsx`); integración en apps/api/tests/ (`users-admin.test.ts`, `users-admin-service.test.ts` para el servicio); E2E en e2e/users-admin.spec.ts.

## 12. Cambios a specs y documentos anteriores (señalados)

| Elemento | Cambio | Quién |
| --- | --- | --- |
| 003, sección 14 ("Crear, editar, desactivar usuarios, asignar roles y cambiar PIN desde la web (propuesta 004), incluido desbloquear a un usuario a mano") y sección 18 (notas para la 004) | Ahora en alcance de esta spec. La sección 18 pedía: requireRole('admin'), USERNAME_TAKEN por HTTP, borrar sesiones y conteo al desactivar o cambiar el PIN, y decidir la autogestión del administrador — cubierto por D-004-01, D-004-04 y D-004-05. | — |
| 003, helpers de pruebas (resetMigrationTables, clearAuthTables, migrateAndClearAuthTables) | Sin cambios: ya cubren users y sessions y esta spec no agrega tablas. | — |
| 003, `pnpm users:create-admin` | Aprobado (S-004-06): el comando valida el PIN con strongPinSchema (rechaza PIN fáciles). Las pruebas AC-26 y AC-27 de la 003 no cambian: '975310' es un PIN fuerte y '97a5' sigue fallando por formato; un PIN débil bien formado (por ejemplo '1234') respondería 'Ese PIN es muy fácil de adivinar. Elige otro.' y código 1. | backend-dev (T-09) |
| 003, apps/web/src/lib/api/client.ts | `ApiRequestOptions.method` suma 'PATCH' (AC-19); el resto del contrato del cliente no cambia. | frontend-dev |
| e2e/global-setup.ts | Crea e2e.gestion2 y borra 'e2e.gestion' si existe (limpieza sobre polleria_test con las mismas guardias; la tabla users está autorizada). | test-writer (T-05) |
| docs/api/openapi.yaml | Versión 0.3.1 → 0.4.0 con lo de 9.5. | spec-writer (esta spec) |
| CLAUDE.md (Comandos), PROGRESS.md | Sin cambios de comandos ni de decisiones; el orquestador actualiza PROGRESS al cerrar. | orquestador, al cerrar |

## 13. Dependencias

Ninguna dependencia nueva ni de soporte: se reutilizan bcrypt (PinHasher), Sequelize (transacciones, Op.contains) y Zod. Sin variables de entorno nuevas (D-004-07). No hay ADR: todas las piezas ya están decididas en el ADR 0002.

## 14. Fuera de alcance

- Borrar usuarios (RN-004-05: se desactivan, nunca se borran; la FK CASCADE queda para un borrado manual por SQL, fuera del sistema).
- Cambiar el nombre de usuario de un usuario existente (SUPUESTO S-004-05, pregunta 5).
- Que el sistema genere el PIN al azar y lo muestre una sola vez (pregunta 1).
- Que cada trabajador cambie su propio PIN desde su área (autogestión; la 003 no la tenía y esta spec no la agrega).
- Botón "Desbloquear" que limpie el bloqueo sin cambiar el PIN ni desactivar (pregunta 6; ya hay camino por D-004-05).
- Registro de auditoría de quién creó/editó/desactivó a quién (RF-27, Fase 6).
- Usuarios de demostración y seeds (Fase 6).
- Paginación, búsqueda o filtros en la lista (con menos de 20 usuarios no hace falta).
- Foto, PIN con más de 6 dígitos, contraseñas largas, doble factor y todo lo demás fuera del PIN de la 003.
- Que `pnpm users:create-admin` acepte otros roles (sigue creando solo administradores, S-003-16).

## 15. Supuestos

Confirmados por el usuario el 2026-10-08: S-004-01 a S-004-08, todos con la respuesta recomendada. Ya no son supuestos: son decisiones; se conservan abajo como registro.

| ID | Supuesto |
| --- | --- |
| S-004-01 | El administrador escribe el PIN nuevo (alta y restablecimiento) dos veces en el formulario; no hay PIN generado por el sistema. |
| S-004-02 | La regla de PIN fáciles es la lista exacta de D-004-02 (repetidos, secuencias circulares, años 1900-2099, fechas DDMM y DDMMAA válidas, '2580'). |
| S-004-03 | La regla del último administrador vale también para el propio administrador: puede desactivarse o quitarse el rol admin solo si queda otro administrador activo. |
| S-004-04 | Desactivar o restablecer el PIN borra las sesiones del usuario y limpia su conteo de intentos (recomendación de la sección 18 de la 003). |
| S-004-05 | El nombre de usuario no se puede cambiar; un error de tipeo se corrige desactivando y creando otro usuario. |
| S-004-06 | `pnpm users:create-admin` también rechaza PIN fáciles con la misma regla. |
| S-004-07 | No hay acción "Desbloquear" aparte: restablecer el PIN o desactivar/reactivar ya limpian el bloqueo. |
| S-004-08 | La lista del administrador muestra a todos los usuarios sin paginar, en el mismo orden que la lista pública. |

## 16. Preguntas abiertas para el usuario

Respondidas el 2026-10-08, todas con la respuesta recomendada: 1 (el administrador escribe el PIN nuevo dos veces; no hay PIN generado), 2 (la lista de PIN fáciles queda como la propuesta: repetidos, secuencias circulares, años 1900-2099, fechas DDMM y DDMMAA y '2580'), 3 (un administrador puede desactivarse o quitarse el rol admin solo si queda otro administrador activo; si no, 409 LAST_ADMIN_REQUIRED), 4 (`pnpm users:create-admin` también rechaza PIN fáciles), 5 (el nombre de usuario no se puede cambiar) y 6 (no hay botón ni endpoint "Desbloquear"). Se conservan abajo como registro.

1. (dueño) Cuando das de alta a un trabajador o le restableces el PIN, ¿está bien que tú escribas el PIN dos veces en el formulario (recomendado, S-004-01)? La alternativa es que el sistema genere un PIN al azar y te lo muestre una sola vez para que se lo digas al trabajador.
2. (dueño) La regla de PIN fáciles propuesta rechaza: dígitos repetidos (0000, 111111), corridas (1234, 4321, 7890), años entre 1900 y 2099, fechas válidas (2512 = 25/12, 150385 = 15/03/85) y el 2580 del teclado (S-004-02). ¿Está bien así (recomendado), quieres quitar alguna (por ejemplo las fechas, que podrían molestar) o agregar otra?
3. (dueño) Un administrador puede desactivarse o quitarse el rol de administrador a sí mismo solo si queda otro administrador activo (recomendado, S-004-03); si es el último, el sistema lo impide siempre. La alternativa es prohibir que un administrador se toque a sí mismo en esos casos y que solo otro administrador pueda hacerlo.
4. (técnica) ¿Está bien que `pnpm users:create-admin` también rechace PIN fáciles con la misma regla (recomendado, S-004-06)? Es el otro camino por donde se crean PIN.
5. (dueño) El nombre de usuario (el de entrar, por ejemplo mozo.juan) no se podrá cambiar una vez creado: si te equivocas, desactivas ese usuario y creas otro (recomendado, S-004-05). ¿Está bien o quieres poder corregirlo?
6. (dueño) No hay un botón "Desbloquear": si un trabajador quedó bloqueado por intentos fallidos, le restableces el PIN o lo desactivas y reactivas, y puede entrar al instante (recomendado, S-004-07). ¿Basta así o quieres un desbloqueo directo?

## 17. Acción del usuario y verificación manual

Acción en apps/api/.env: ninguna. No hay variables nuevas ni migraciones nuevas.

Después de que la funcionalidad esté implementada:
1. `pnpm dev` y entrar como administrador a http://localhost:3000/admin: tocar 'Usuarios'.
2. 'Agregar usuario': crear un mozo (por ejemplo usuario mozo.ana, PIN 3968, rol Mozo). Debe aparecer en la lista.
3. Intentar crear otro con PIN 1234: debe decir 'Ese PIN es muy fácil de adivinar. Elige otro.'; con un usuario repetido: 'Ese nombre de usuario ya existe.'.
4. Cerrar sesión y comprobar en /login que aparece 'Ana' (o el nombre elegido) y que entra con su PIN a la pantalla de Mozo.
5. Volver a entrar como administrador, abrir 'Editar' del mozo y quitarle el rol Mozo y ponerle Cajero: tras guardar, ese usuario solo entra a Caja.
6. Restablecer su PIN: tras confirmar, su sesión anterior ya no sirve y entra con el PIN nuevo.
7. Desactivarlo: desaparece de /login y no puede entrar; reactivarlo: vuelve a entrar con el último PIN.
8. Intentar desactivar o quitar el rol Administrador al único administrador: debe responder 'Debe quedar al menos un administrador activo.'.
9. Probar desde un celular del local (mismo wifi, sin internet) que la lista y el formulario se ven cómodos y no hay desplazamiento horizontal a 360 px.

## 18. Notas para specs siguientes (no son alcance de esta)

- Fase 2 (autorización con PIN de administrador para anulaciones y otros): reutilizar PinHasher y un LoginLimiter propio, como dice la sección 18 de la 003; la tabla de administradores activos ya se consulta con `roles @> '{admin}'`.
- Auditoría (RF-27, Fase 6): los cambios de usuarios (alta, edición, desactivación, restablecimiento de PIN) son candidatos a registrarse con actor y hora.
- Seeds de demostración (Fase 6): pueden crear los usuarios de ejemplo con createUserService; conviene que sus PIN cumplan la regla de PIN fáciles para que no choquen si createUser algún día la aplica también.

## 19. Aclaración 1 (2026-10-08): '/admin' no es un puesto de trabajo

Motivo: al implementar la funcionalidad se encontró una tensión entre dos partes aprobadas.

- En la 003 (revisión 1), el dispositivo recuerda la última área usada en 'polleria:lastArea' y un área mostrada guarda su ruta, incluida '/admin' (AC-43); quien inicia sesión aterriza directo en la última área cuando le corresponde (AC-44) y /login abre de entrada el teclado del último usuario recordado, 'polleria:lastUsername' (AC-32).
- En esta spec, AC-26 y AC-27 exigen que, tras gestionar usuarios en /admin y tocar 'Cerrar sesión', /login muestre la lista de usuarios —no el teclado del administrador recordado— y que el siguiente ingreso pase por /areas.

Lectura que resuelve la tensión, con todas las pruebas de la 003 y la 004 en verde: '/admin' no es un puesto de trabajo.

- La página /admin sigue guardando '/admin' en 'polleria:lastArea' al mostrarse (AC-43 de la 003 se cumple igual: el área mostrada guarda su ruta).
- Un 'polleria:lastArea' con '/admin' se trata como "sin área recordada" para decidir a dónde ir (el aterrizaje tras iniciar sesión y las redirecciones de RoleGuard): el aterrizaje directo solo aplica a /mozo, /caja y /cocina, así que el siguiente ingreso pasa por /areas —o por su única área, si solo tiene una.
- Cuando 'polleria:lastArea' es '/admin', /login muestra la lista de usuarios aunque exista 'polleria:lastUsername': la pantalla de administración la usa el dueño y deja el equipo listo para el siguiente trabajador.
- En cualquier otro caso ('/mozo', '/caja', '/cocina' o nada guardado), /login y el aterrizaje se comportan como dicen AC-32, AC-44 y D-003-16 de la 003.

Qué NO cambia: la letra de ningún AC de la 003 ni de la 004, el contrato OpenAPI 0.4.0 (esto es comportamiento de la web, no de la API) ni las claves 'polleria:lastUsername' y 'polleria:lastArea'. Si una spec futura decide que '/admin' sí es un puesto de trabajo, o que /login recuerde siempre al último usuario, esta aclaración se reemplaza.
