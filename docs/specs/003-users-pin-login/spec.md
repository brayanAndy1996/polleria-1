# Spec 003 — Usuarios, roles e inicio de sesión con PIN

- Estado: Borrador
- Fase: 1 (Usuarios y carta)
- Rama: feat/003-users-pin-login
- Fecha: 2026-10-08
- Cubre: RF-01 (iniciar sesión con usuario y PIN y ver solo las funciones del rol), RNF-09 en su primera parte (cada usuario accede con su propio PIN; la autorización de acciones sensibles con PIN de administrador es de la Fase 2) y RNF-10 (los PIN se guardan cifrados con bcrypt). Aporta a RNF-01 y RNF-02 (entrar es tocar el nombre y escribir el PIN en un teclado grande) y a RNF-05 (todo funciona en la red local).
- Documentos relacionados: tasks.md (esta carpeta), docs/api/openapi.yaml (versión 0.3.0), docs/decisions/0002-sesion-pin-y-limite-de-intentos.md (ADR, Propuesto), docs/specs/001-base-monorepo/spec.md y docs/specs/002-printer-service/spec.md (convenciones que se mantienen: D-01, D-02, D-05, D-07, D-10, D-12, D-13, formato de error y ERROR_CODES).

## 1. Contexto

Hoy cualquiera puede tomar un pedido o cobrar sin dejar rastro. Para que el sistema sepa quién hace cada cosa, cada trabajador entra con su propio PIN y ve solo las pantallas de su rol: el mozo ve la pantalla de mozo en su celular, el cajero la de caja en la PC y el dueño la de administración. Esta funcionalidad crea los usuarios en la base, el inicio y cierre de sesión, el bloqueo de quien prueba PIN al azar, las protecciones de la API por rol y un comando para crear la primera cuenta de administrador. Las pantallas de cada rol quedan listas pero vacías: las llenan las fases siguientes.

## 2. Historias de usuario

| ID | Historia |
| --- | --- |
| HU-003-01 | Como mozo, quiero entrar al sistema desde mi celular tocando mi nombre y escribiendo mi PIN en un teclado grande, para empezar a atender en segundos. |
| HU-003-02 | Como cajero, quiero entrar con mi PIN en la PC de caja y ver solo la pantalla de caja, para no tocar funciones que no me corresponden. |
| HU-003-03 | Como administrador (dueño), quiero que cada trabajador entre con su propio PIN y que el sistema le muestre solo lo de su rol, para saber quién hace qué y que un mozo no pueda cobrar ni cambiar precios. |
| HU-003-04 | Como administrador, quiero crear mi cuenta de administrador la primera vez con un comando en la PC del local, sin que mi PIN quede escrito en ningún archivo, para empezar a usar el sistema de forma segura. |
| HU-003-05 | Como administrador, quiero que los PIN se guarden cifrados y que quien prueba PIN al azar quede bloqueado un rato, para que nadie entre con la cuenta de otro. |
| HU-003-06 | Como trabajador, quiero cerrar sesión al terminar mi turno y que la sesión termine sola después de un día de trabajo, para que nadie use mi cuenta en un celular o una PC compartida. |

## 3. Decisiones técnicas

Las que no confirmó el usuario están marcadas como SUPUESTO y repetidas en Preguntas abiertas (sección 16).

**D-003-01. Sesión guardada en la base, no JWT (SUPUESTO S-003-01).**
- Al iniciar sesión, la API genera un token aleatorio de 32 bytes (`randomBytes(32)` de node:crypto, en base64url: 43 caracteres) y lo envía en una cookie httpOnly. En la base solo guarda el SHA-256 del token (64 caracteres hexadecimales), en la tabla sessions. Una copia de la base no permite entrar: el hash no sirve como cookie.
- En cada solicitud protegida, requireAuth calcula el SHA-256 de la cookie, busca la sesión vigente y carga al usuario en la misma consulta. Así el rol y el estado activo se leen siempre de la base: si el administrador desactiva a alguien o le cambia el rol, vale desde la siguiente solicitud.
- Por qué no JWT (lo que mencionan backend-dev.md y la nota de D-01 de la 001):
  - Como requireAuth igual debe leer al usuario en la base en cada solicitud (activo y rol al día), un JWT no ahorra la consulta.
  - Cerrar sesión borra la sesión de verdad. Con un JWT la cookie seguiría sirviendo hasta vencer, salvo que se agregue otra columna de versión.
  - No hay clave de firma: no hay variable SESSION_SECRET que el usuario deba crear, cuidar y rotar, y si alguien la viera no podría fabricar sesiones de administrador. apps/api/.env no cambia (D-003-13).
  - No hace falta ninguna librería de JWT ni código criptográfico propio (firmar, comparar en tiempo constante, validar el encabezado).
- Costo: una tabla más (sessions) y una consulta por solicitud protegida, insignificante para 5 dispositivos y 20 mesas (RNF-04).
- Las alternativas evaluadas (jose, jsonwebtoken, HMAC propio con SESSION_SECRET) están en el ADR 0002.

**D-003-02. Cookie de sesión (SUPUESTO S-003-08).**
- Nombre `polleria_session`. Atributos: `HttpOnly`, `SameSite=Strict`, `Path=/`, `Max-Age=57600` (16 horas) y `Expires` correspondiente. Sin `Domain` (solo el origen de la web) y sin `Secure`.
- Sin `Secure` porque en el local la web se abre por HTTP en la red (por ejemplo http://192.168.1.10:3000) y Chrome no guarda ni envía cookies `Secure` por HTTP fuera de localhost: con `Secure`, los celulares nunca podrían iniciar sesión. Atarlo a NODE_ENV=production rompería justo la instalación del local. Cuando haya HTTPS en la red, se agregará una variable en otra spec (fuera de alcance).
- `SameSite=Strict` funciona porque la web y la API están en el mismo origen (D-01 de la 001): todas las llamadas a /api salen de la propia página. Con Strict, otra página no puede hacer que el navegador envíe la cookie.
- `Path=/` (y no /api) para que la conexión de Socket.IO de fases siguientes, que irá por /socket.io, también lleve la cookie.
- Express 5 escribe la cookie con `res.cookie` (verificado con 5.2.1: `polleria_session=<token>; Max-Age=57600; Path=/; Expires=...; HttpOnly; SameSite=Strict`) y la borra con `res.clearCookie` (`polleria_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Strict`). Leerla no necesita librería: la API busca su cookie en la cabecera Cookie con una función propia (`readSessionCookie`, AC-11).

**D-003-03. Duración de la sesión: 16 horas fijas, sin renovación (SUPUESTO S-003-02).**
- `SESSION_DURATION_MS = 57_600_000`. La sesión vence 16 horas después de iniciarla, use o no use el sistema. Cubre un día de trabajo completo (por ejemplo de 10:00 a 02:00) y obliga a entrar de nuevo al día siguiente.
- Sin renovación: es más simple de probar y de entender ("se entra una vez por día"). Un mozo que entra a las 18:00 sigue dentro hasta las 10:00 del día siguiente.
- La hora de vencimiento la calcula la API con su reloj (inyectable en las pruebas) y se compara en la consulta (`expires_at > ahora`).

**D-003-04. PIN (SUPUESTO S-003-03).**
- El PIN tiene de 4 a 6 dígitos ASCII (`^[0-9]{4,6}$`) y viaja como texto (conserva los ceros a la izquierda: '0007'). Dígitos de otros alfabetos (árabes, de ancho completo) se rechazan.
- Se guarda solo su hash bcrypt con costo 10 (`PIN_HASH_COST`). bcrypt 6.0.0 (aprobada en CLAUDE.md) trae binarios precompilados N-API para win32-x64: verificado en Node 24.1.0 sin compilar nada, unos 50 ms por hash o comparación en la PC de desarrollo. El PIN nunca se guarda, no se registra en el log ni se devuelve.
- Cuando el usuario no existe, la API igual compara el PIN contra un hash de relleno con el mismo costo, para que el tiempo de respuesta no revele si el usuario existe (AC-14).
- Aviso honesto para el dueño: un PIN de 4 dígitos tiene solo 10 000 combinaciones. Lo que protege la cuenta es el límite de intentos (D-003-05), no el cifrado. Por eso se recomienda que el administrador use 6 dígitos (pregunta 2).

**D-003-05. Límite de intentos por usuario, en memoria (SUPUESTO S-003-07).**
- Política: después de 5 intentos fallidos seguidos de un mismo usuario, ese usuario queda bloqueado 15 minutos (`MAX_FAILED_LOGIN_ATTEMPTS = 5`, `LOGIN_LOCK_DURATION_MS = 900_000`). Mientras dura el bloqueo, todo intento de ese usuario (incluso con el PIN correcto) responde 429 TOO_MANY_ATTEMPTS sin comparar el PIN.
- Bloqueo repetido: el conteo no se borra cuando termina el bloqueo, solo con un inicio de sesión exitoso. Así, después del primer bloqueo, cada intento fallido vuelve a bloquear 15 minutos: un atacante prueba como máximo unos 100 PIN por día y por usuario, y el dueño lo nota porque su cuenta queda bloqueada.
- Qué cuenta como intento fallido: todo intento con un usuario que existe (activo o inactivo) que llega a comparar el PIN y no termina en sesión. Los errores de formato (400) no cuentan, y los intentos rechazados por el bloqueo (429) tampoco: no suman ni alargan el bloqueo. Los usuarios inexistentes no se cuentan (no hay a quién proteger y así la memoria queda limitada al número de usuarios); siempre responden 401.
- Sin carreras: el intento se cuenta antes de comparar el PIN, en el mismo paso síncrono en que se revisa el bloqueo, y se descuenta solo si el PIN es correcto y el usuario está activo. Así 20 solicitudes simultáneas con PIN incorrecto comparan como máximo 5 PIN (AC-17).
- Por usuario y no por IP: verificado en Next 16.4.0 que el reenvío de /api (httpxy, sin la opción xfwd) no agrega la IP del celular. La API ve todas las solicitudes desde 127.0.0.1 y una cabecera X-Forwarded-For la podría inventar cualquiera. Un límite por IP bloquearía a todo el local a la vez.
- En memoria del proceso de la API (SUPUESTO S-003-12: una sola instancia). Reiniciar la API borra los bloqueos; un atacante en el wifi no puede reiniciarla. Guardar los bloqueos en la base queda fuera de alcance.
- Implementación propia: express-rate-limit 8.7.1 cuenta solicitudes por IP antes de la lógica, no sabe si el PIN fue correcto ni a qué usuario pertenece, y por la razón anterior no serviría tal cual (ADR 0002).

**D-003-06. Errores (formato común de la 001).**

| code | HTTP | message | details | Cuándo |
| --- | --- | --- | --- | --- |
| INVALID_CREDENTIALS | 401 | Usuario o PIN incorrecto. | null | Usuario inexistente, usuario inactivo (aunque el PIN sea correcto) o PIN incorrecto. Siempre el mismo cuerpo. |
| UNAUTHENTICATED | 401 | Debes iniciar sesión para continuar. | null | Ruta protegida sin cookie, con un token que no existe o mal formado, con la sesión vencida o con el usuario desactivado. |
| FORBIDDEN | 403 | No tienes permiso para realizar esta acción. | null | Sesión válida, pero el rol no está entre los permitidos (requireRole). |
| TOO_MANY_ATTEMPTS | 429 | Demasiados intentos fallidos. Espera unos minutos e intenta de nuevo. | `{ retryAfterSeconds }` | Usuario bloqueado (D-003-05). Además lleva la cabecera `Retry-After` con los mismos segundos. |
| USERNAME_TAKEN | 409 | Ese nombre de usuario ya existe. | null | Crear un usuario con un nombre de usuario que ya existe. En esta spec solo lo usa el comando del administrador; la 004 lo expondrá por HTTP. |

- Un solo código para todo problema de sesión (UNAUTHENTICATED): la web hace lo mismo en todos los casos (volver a /login) y la API no revela si el token existió.
- Los cinco se suman a ERROR_CODES de @polleria/shared. Ningún 4xx se registra en el log (RN-001-07).
- `retryAfterSeconds` es un entero de 1 a 900: los milisegundos que faltan, redondeados hacia arriba a segundos.

**D-003-07. Roles y áreas (SUPUESTOS S-003-04 y S-003-05).**
- Cuatro roles, según el glosario: `waiter` (mozo), `kitchen` (cocina), `cashier` (cajero) y `admin` (administrador). Cada usuario tiene exactamente un rol.
- Áreas de la web y roles que entran:

  | Área | Ruta | Roles | Para quién es la "casa" |
  | --- | --- | --- | --- |
  | Mozo | /mozo | waiter, admin | waiter |
  | Caja | /caja | cashier, admin | cashier |
  | Administración | /admin | admin | admin |
  | Cocina | /cocina | kitchen, admin | kitchen |

- El administrador (el dueño) entra a todas las áreas, porque en una pollería pequeña suele cubrir cualquier puesto. Al iniciar sesión cada rol va a su casa.
- La cocina no tiene pantalla en el prototipo (imprime comandas, docs/planificacion.md). Si un usuario de cocina entra, ve /cocina con un aviso y el botón Cerrar sesión. Así el modelo de roles es uniforme y la Fase 3 o una fase posterior puede darle funciones sin cambiar el inicio de sesión.
- En la API, cada spec siguiente declara qué roles llaman a cada endpoint con requireRole. En esta spec no hay endpoints por rol: requireRole se prueba con una app de prueba (AC-23).

**D-003-08. Pantalla de inicio con lista de usuarios (SUPUESTOS S-003-06 y S-003-11).**
- /login muestra un botón por cada usuario activo (nombre para mostrar y, debajo, el nombre de usuario). Se toca el nombre y aparece el teclado de PIN.
- Por qué lista y no escribir el usuario:
  - RNF-01 y RNF-02: tocar un nombre es un toque; escribir "mozo.juan" en el teclado del celular toma varios segundos y falla con mayúsculas automáticas y autocorrector.
  - Una pollería tiene pocos trabajadores (menos de 20); la lista cabe en una pantalla.
- Riesgo aceptado: GET /api/auth/users es público y muestra el nombre para mostrar y el nombre de usuario de los activos a cualquiera conectado al wifi. No muestra rol, id, inactivos ni nada del PIN. Conocer el nombre de usuario no permite entrar: el límite de intentos (D-003-05) es lo que protege. Si el dueño no quiere mostrar los nombres, la alternativa es escribir el usuario (pregunta 4).
- El dispositivo recuerda el último usuario que entró (solo su nombre de usuario, en localStorage) y abre directo su teclado de PIN, con un botón "Cambiar usuario". En el celular de un mozo, entrar es escribir el PIN.

**D-003-09. requireAuth y requireRole.**
- `requireAuth` (creado con `createRequireAuth({ sessionService })`) lee la cookie, resuelve la sesión y deja en `res.locals.auth` el contexto `{ sessionId, user, expiresAt }` (se lee con `getAuthContext(res)`). Si no hay sesión válida, responde 401 UNAUTHENTICATED.
- `requireRole(...roles)` va siempre después de requireAuth. Si el rol del usuario no está en la lista, 403 FORBIDDEN. Si se usa sin requireAuth antes (no hay contexto), responde 401, nunca 500 ni 200. Llamarlo sin roles es un error de programación: lanza al crear la ruta (`'requireRole necesita al menos un rol.'`).
- Rutas públicas: /api/health (RN-001-06), /api/auth/users, /api/auth/login y /api/auth/logout. Toda otra ruta de /api, en esta y en las specs siguientes, pasa por requireAuth y, si su AC lo dice, por requireRole.

**D-003-10. Primer administrador con un comando interactivo (SUPUESTO S-003-10).**
- `pnpm users:create-admin` pregunta el nombre de usuario, el nombre para mostrar, el PIN y la repetición del PIN, y crea un usuario `admin` activo. El PIN nunca va como argumento (quedaría en el historial de la terminal) ni en una variable de entorno o archivo (quedaría en el disco).
- Si la entrada es una terminal (PowerShell, Símbolo del sistema), el PIN no se ve mientras se escribe. Si no es una terminal (entrada por tubería, como en las pruebas, o Git Bash, que en Windows no entrega una terminal real a Node), lee las respuestas línea por línea y escribe en stderr un aviso de que el PIN se verá al escribirlo.
- Verificado en el código de pnpm 10.12.1: con `--filter` y un solo paquete, el script hereda la terminal (stdio "inherit"), así que el script de la raíz funciona igual que ejecutarlo en apps/api.
- Se puede ejecutar cuando sea, no solo la primera vez: sirve también para recuperar el acceso si el dueño olvida su PIN (crea otro administrador). Quien puede ejecutar comandos en la PC del local ya tiene acceso total a la base, así que no abre una puerta nueva.
- Valida cada respuesta apenas la recibe y se detiene en el primer error, con código de salida 1 y sin crear nada. Revisa si el nombre de usuario ya existe antes de pedir el PIN.
- Los datos de demostración (mozos de ejemplo) son de la Fase 6 y la gestión de usuarios desde la web es de la 004: este comando solo crea administradores.

**D-003-11. Modelos de Sequelize por instancia.**
- `defineModels(sequelize)` define los modelos User y Session con `sequelize.define` sobre la instancia recibida (no con clases y `Model.init` estático). Así cada instancia de Sequelize (la de la API, la de cada prueba, la del comando) tiene sus propios modelos, sin compartir estado entre ellas. También evita el problema conocido de los campos de clase públicos que tapan los getters de Sequelize, y no requiere decoradores, que el type stripping no permite (D-02 de la 001).
- Las pruebas crean usuarios con el servicio de usuarios (`createUserService`) y revisan la base con SQL; no dependen de los modelos.

**D-003-12. Web: guardia en el cliente y cliente HTTP central.**
- La seguridad vive en la API. La web solo decide qué pantalla mostrar: cada página de área envuelve su contenido en `RoleGuard`, que consulta GET /api/auth/me con TanStack Query (clave `['auth', 'me']`, `retry: false`). No se usa el proxy (middleware) de Next.
- Todas las llamadas a la API pasan por un cliente central (`apps/web/src/lib/api/client.ts`): mismo origen, JSON, tiempo límite de 10 s, errores como `ApiError`. Ante un 401 UNAUTHENTICATED llama a un manejador que, por defecto, recarga la página en /login con `hardNavigate` (salvo que ya esté en /login o que la llamada pida `skipAuthRedirect`). El health de la 001 sigue con su propia función (getServerStatus).
- Cerrar sesión y la sesión vencida recargan la página completa (`window.location.assign` dentro de `hardNavigate`), no una navegación interna: así se borra de la memoria todo lo que veía el usuario anterior, importante en la PC de caja compartida.
- Al iniciar sesión, la navegación a la casa del rol es interna (`useRouter().replace` de next/navigation).
- El tipado viene de los esquemas Zod de @polleria/shared. openapi-typescript sigue diferido: la 7.13.0 todavía declara `typescript ^5.x` (ADR 0002).

**D-003-13. Sin variables de entorno nuevas.**
- Nada de esta spec se configura por .env: CONFIG_VARIABLES sigue con las 7 variables de la 002 y apps/api/.env.example no cambia. AC-04 y AC-07 de la 001 y AC-02 y AC-05 de la 002 no cambian, y el apps/api/.env del usuario sigue sirviendo tal cual.
- Duración de la sesión, límite de intentos y costo de bcrypt son constantes exportadas (sección 11). Cambiarlas es un cambio de spec.

**D-003-14. Primera migración de dominio.**
- Dos migraciones nuevas en apps/api/src/db/migrations: `20261008120000-create-users.ts` y `20261008120100-create-sessions.ts` (umzug, D-05 de la 001), con `down` que borra la tabla. Las restricciones viven también en la base (CHECK, UNIQUE, FOREIGN KEY), no solo en Zod.
- Claves primarias enteras autoincrementales (`id` INTEGER). Las specs siguientes siguen la misma convención.
- Consecuencia para las pruebas: el helper resetMigrationTables (apps/api/tests/helpers/test-database.ts) debe borrar también sessions y users antes de las tablas de registro de umzug; si no, volver a migrar falla con "la tabla ya existe" (AC-21 y AC-24 de la 001). Lo ajusta el test-writer (sección 12).

## 4. Criterios de aceptación

Cada AC tiene al menos una prueba cuyo nombre empieza con su ID. Como las specs 001 y 002 también usan AC-01, AC-02..., cada archivo de prueba de esta spec envuelve sus pruebas en un `describe` cuyo nombre empieza con `003:` (por ejemplo `describe('003: login limiter', ...)`), y las pruebas de esta spec van en archivos nuevos (las de la 001 que se ajustan se listan en la sección 12). Se indica el nivel y una ubicación sugerida; la ubicación exacta la decide el test-writer.

Datos comunes de las pruebas:
- `T0` = `2026-10-08T15:00:00.000Z` (10:00 en Lima). `T0 + 16 h` = `2026-10-09T07:00:00.000Z`.
- "La app" es `createApp({ sequelize, now, pinHasher })` sobre polleria_test con las migraciones reales aplicadas y las tablas users y sessions vacías al empezar cada prueba. `now` es un reloj que la prueba controla (por ejemplo `() => current`); si el AC no lo menciona, `() => T0`.
- Los usuarios se crean con `createUserService({ models: defineModels(sequelize), pinHasher })`. Para que las pruebas sean rápidas pueden usar `createBcryptPinHasher({ cost: 4 })` en la app y en el servicio, salvo donde el AC exige el costo 10.
- "Espía de verify": un PinHasher que envuelve al real y cuenta las llamadas a `verify`.
- Los textos con caracteres invisibles o especiales se escriben con escapes, como en la spec 002 (`'\u00A0'`, `'\u{1F357}'`).

### 4.1 Paquete compartido (packages/shared)

**AC-01. Roles y PIN** (unitaria, packages/shared)
- Dado `USER_ROLES`, `userRoleSchema`, `PIN_PATTERN` y `pinSchema` exportados por '@polleria/shared',
- entonces `USER_ROLES` es exactamente `['waiter', 'kitchen', 'cashier', 'admin']`; userRoleSchema acepta cada uno y rechaza 'Admin', 'chef', '' y null;
- y pinSchema acepta '0000', '0007', '1234', '12345' y '123456' (y devuelve el mismo texto);
- y rechaza '123', '1234567', '12a4', ' 1234', '1234 ', '12 34', `'\u0661\u0662\u0663\u0664'` (dígitos arábigos), `'\uFF11\uFF12\uFF13\uFF14'` (dígitos de ancho completo) y '' con el mensaje 'El PIN debe tener de 4 a 6 dígitos.', y rechaza también 1234 (número) y null;
- y `PIN_PATTERN` es `/^[0-9]{4,6}$/`.

**AC-02. Nombre de usuario** (unitaria, packages/shared)
- Dado `usernameSchema` y `USERNAME_PATTERN`,
- cuando valida ' Dueno ' devuelve 'dueno', y con 'MOZO.Juan' devuelve 'mozo.juan' (se recorta y se pasa a minúsculas antes de validar);
- acepta 'abc', 'a'.repeat(32), 'caja_1', 'ana-maria', 'mozo.juan' y '007';
- rechaza 'ab', 'a'.repeat(33), 'juan perez', 'josé', 'JOSÉ', 'ñandu', '.juan', 'juan.', '_ana', 'ana-', 'mozo@1', '' y '   ' con el mensaje 'Usa de 3 a 32 caracteres: letras minúsculas sin tilde, números, punto, guion o guion bajo; empieza y termina con letra o número.';
- y `USERNAME_PATTERN` es `/^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$/`.

**AC-03. Nombre para mostrar** (unitaria, packages/shared)
- Dado `displayNameSchema` y `DISPLAY_NAME_MAX_LENGTH` (40),
- cuando valida, devuelve el valor recortado y en NFC: '  Don Carlos  ' da 'Don Carlos', `'Jose\u0301'` da 'José' y `'  Juan\u00A0'` da 'Juan';
- acepta 'María José', "O'Brien", 'Juan P.', 'Ana-Lucía', 'Mozo 2', 'Ñandú', 'x'.repeat(40) y `'a\u0301'.repeat(40)` (80 unidades antes de NFC, 40 caracteres después);
- rechaza '', '   ', 'x'.repeat(41), '.Juan', `'Juan\tPérez'`, `'Juan\nPérez'`, `'Juan\u00A0Pérez'`, `'Pollo \u{1F357}'`, 'Ana<b>' y `'Ana\u200B'`, y en cada caso los issues incluyen el mensaje 'Usa de 1 a 40 caracteres: letras, números, espacios, punto, apóstrofo o guion; empieza con letra o número.'

**AC-04. Esquemas de sesión y códigos de error** (unitaria, packages/shared)
- Dado `loginRequestSchema`, `sessionResponseSchema`, `loginUsersResponseSchema`, `ERROR_CODES` y `errorResponseSchema`,
- loginRequestSchema acepta `{ username: ' Mozo.Juan ', pin: '0007' }` y devuelve `{ username: 'mozo.juan', pin: '0007' }`; rechaza un objeto sin username, sin pin, con `pin: 7`, con `username: 'ab'`, con una propiedad de más (`role: 'admin'`) y `undefined`;
- sessionResponseSchema acepta `{ user: { id: 1, username: 'mozo.juan', displayName: 'Juan', role: 'waiter' }, expiresAt: '2026-10-09T07:00:00.000Z' }` y rechaza: user con `pinHash` o cualquier propiedad de más, id 0, -1, 1.5 o '1', role 'chef', expiresAt '2026-10-09T02:00:00.000-05:00' (sin Z) y una propiedad de más en la raíz;
- loginUsersResponseSchema acepta `{ users: [] }` y `{ users: [{ username: 'mozo.juan', displayName: 'Juan' }] }`, y rechaza un elemento con role o id de más;
- ERROR_CODES contiene INVALID_CREDENTIALS, UNAUTHENTICATED, FORBIDDEN, TOO_MANY_ATTEMPTS y USERNAME_TAKEN, cada uno con un valor igual a su nombre, además de los 7 de la 001;
- y errorResponseSchema acepta `{ error: { code: 'TOO_MANY_ATTEMPTS', message: 'Demasiados intentos fallidos. Espera unos minutos e intenta de nuevo.', details: { retryAfterSeconds: 900 } } }`.

### 4.2 Base de datos (migraciones reales sobre polleria_test)

**AC-05. Tabla users** (integración, apps/api)
- Dado polleria_test con `migrateUp(sequelize)` aplicado,
- entonces information_schema muestra la tabla users con: id integer (clave primaria y autoincremental: SERIAL o IDENTITY), username character varying(32), display_name character varying(40), pin_hash character varying(60), role character varying(16), is_active boolean, created_at y updated_at timestamp with time zone, todas NOT NULL;
- y un `INSERT` con solo username 'mozo.juan', display_name 'Juan', pin_hash de 60 caracteres y role 'waiter' funciona y deja is_active true y created_at y updated_at con fecha;
- y cada uno de estos INSERT falla con un error de la base y no deja fila: username repetido; username 'Mozo.juan' (mayúsculas); username 'ab' o 'juan perez' (no cumple el patrón); role 'chef'; display_name '' o ' Juan' (espacio al inicio); pin_hash de 59 o de 61 caracteres; y cualquiera de username, display_name, pin_hash o role en NULL.

**AC-06. Tabla sessions** (integración, apps/api)
- Dado polleria_test migrada y un usuario existente,
- entonces la tabla sessions tiene: id integer (clave primaria y autoincremental), user_id integer, token_hash character varying(64), expires_at y created_at timestamp with time zone, todas NOT NULL, y created_at con valor por defecto;
- un INSERT con user_id del usuario, token_hash de 64 caracteres hexadecimales en minúscula y expires_at funciona;
- y fallan: token_hash repetido; token_hash con mayúsculas, de 63 caracteres o con un carácter que no es hexadecimal; user_id que no existe;
- y al borrar el usuario se borran sus sesiones (ON DELETE CASCADE);
- y pg_indexes muestra el índice `sessions_user_id_idx` sobre user_id y un índice único sobre token_hash.

**AC-07. Las migraciones se aplican y se revierten** (integración, apps/api)
- Dado polleria_test sin tablas de dominio ni de registro (helper de limpieza de la sección 12),
- cuando se ejecuta `migrateUp(sequelize)`, entonces devuelve `['20261008120000-create-users.ts', '20261008120100-create-sessions.ts']` en ese orden y existen users y sessions;
- cuando luego se ejecuta `migrateDown(sequelize)`, devuelve `['20261008120100-create-sessions.ts']`, sessions ya no existe y users sí;
- cuando se ejecuta otra vez `migrateDown(sequelize)`, devuelve `['20261008120000-create-users.ts']` y users ya no existe;
- y un nuevo `migrateUp(sequelize)` devuelve otra vez los dos nombres y crea las dos tablas.

### 4.3 Servicios (unitarias)

**AC-08. Cifrado del PIN** (unitaria, apps/api/src/services/auth/pin-hasher.ts)
- Dado `PIN_HASH_COST` y `createBcryptPinHasher()`,
- entonces PIN_HASH_COST es 10;
- `hash('0007')` se resuelve con un texto de 60 caracteres que empieza con '$2b$10$' y es distinto de '0007', y dos hash del mismo PIN son distintos (sal aleatoria);
- `verify('0007', hash)` es true y `verify('0008', hash)` es false;
- `verify('0007', 'no-es-un-hash')` y `verify('0007', '')` se resuelven con false, sin lanzar;
- y `createBcryptPinHasher({ cost: 4 }).hash('1234')` empieza con '$2b$04$' y `createBcryptPinHasher().verify('1234', eseHash)` es true (verificar no depende del costo).

**AC-09. Límite de intentos** (unitaria, apps/api/src/services/auth/login-limiter.ts)
- Dado `MAX_FAILED_LOGIN_ATTEMPTS` (5), `LOGIN_LOCK_DURATION_MS` (900000) y `createLoginLimiter({ now })` con un reloj que empieza en T0 y la prueba adelanta,
- entonces para el usuario 7:
  - sin intentos, `getRetryAfterSeconds(7)` es null;
  - después de 4 `registerAttempt(7)`, sigue null;
  - después del 5.º, es 900;
  - con el reloj en T0 + 1 ms, es 900 (899,999 s redondeados hacia arriba); en T0 + 899 999 ms, es 1; en T0 + 900 000 ms, es null (el bloqueo termina justo a los 15 minutos);
  - un 6.º `registerAttempt(7)` en ese momento lo vuelve a bloquear: 900 (bloqueo repetido);
  - `registerSuccess(7)` lo deja en null; luego 4 `registerAttempt(7)` lo dejan en null y el 5.º en 900 (el conteo empezó de nuevo);
- y mientras el usuario 7 está bloqueado, `getRetryAfterSeconds(8)` es null (cada usuario cuenta aparte);
- y `registerSuccess(99)` sobre un usuario sin intentos no lanza;
- y con `createLoginLimiter({ now, maxFailedAttempts: 2, lockDurationMs: 1000 })`, después de 2 intentos devuelve 1.

**AC-10. Token de sesión** (unitaria, apps/api/src/services/auth/session-token.ts)
- Dado `generateSessionToken`, `hashSessionToken` y `SESSION_TOKEN_PATTERN`,
- entonces SESSION_TOKEN_PATTERN es `/^[A-Za-z0-9_-]{43}$/` y 1000 llamadas a generateSessionToken devuelven 1000 textos distintos que lo cumplen;
- y `hashSessionToken(t)` es igual a `createHash('sha256').update(t, 'utf8').digest('hex')` de node:crypto (64 caracteres hexadecimales en minúscula) y devuelve lo mismo para la misma entrada.

**AC-11. Lectura de la cookie** (unitaria, apps/api/src/http/session-cookie.ts)
- Dado `SESSION_COOKIE_NAME` ('polleria_session') y `readSessionCookie(cookieHeader)`,
- entonces cada caso devuelve lo indicado y ninguno lanza:

  | Cabecera Cookie | Resultado |
  | --- | --- |
  | `undefined` | `undefined` |
  | `''` | `undefined` |
  | `'polleria_session=abc'` | `'abc'` |
  | `'a=1; polleria_session=abc; b=2'` | `'abc'` |
  | `'a=1;polleria_session=abc'` | `'abc'` |
  | `'  polleria_session=abc  '` | `'abc'` |
  | `'polleria_session='` | `undefined` |
  | `'xpolleria_session=abc'` | `undefined` |
  | `'polleria_session_old=abc'` | `undefined` |
  | `'POLLERIA_SESSION=abc'` | `undefined` (el nombre distingue mayúsculas) |
  | `'polleria_session=abc; polleria_session=def'` | `'abc'` (la primera) |
  | `'polleria_session=a=b'` | `'a=b'` (todo lo que sigue al primer =) |
  | `'polleria_session="abc"'` | `'"abc"'` (sin quitar comillas; la sesión lo rechaza por el patrón) |

### 4.4 API (integración con Supertest y polleria_test)

**AC-12. Lista de usuarios para iniciar sesión** (integración)
- Dado la app y estos usuarios: zoila ('Zoila', waiter), ana ('ana', cashier), angel ('Ángel', admin), beto ('Beto', kitchen), juan.q ('juan', waiter), juan.p ('Juan', waiter) e inactivo ('Inactivo', waiter, desactivado con SQL),
- cuando se hace `GET /api/auth/users` sin cookie,
- entonces responde 200 con `Cache-Control: no-store` y exactamente `{ users: [{ username: 'ana', displayName: 'ana' }, { username: 'angel', displayName: 'Ángel' }, { username: 'beto', displayName: 'Beto' }, { username: 'juan.p', displayName: 'Juan' }, { username: 'juan.q', displayName: 'juan' }, { username: 'zoila', displayName: 'Zoila' }] }`: solo activos, ordenados por nombre para mostrar en español sin distinguir mayúsculas ni tildes, y los empates por nombre de usuario; cada elemento tiene exactamente las claves username y displayName y el cuerpo cumple loginUsersResponseSchema;
- y sin usuarios responde `{ users: [] }`;
- y `GET /api/health` sigue respondiendo sin cookie (RN-001-06).

**AC-13. Inicio de sesión correcto** (integración)
- Dado la app con `now` en T0 y el mozo mozo.juan ('Juan', waiter, PIN '2468') creado con el hasher por defecto,
- cuando se hace `POST /api/auth/login` con `{ "username": "  MOZO.Juan ", "pin": "2468" }`,
- entonces responde 200 con `Cache-Control: no-store` y el cuerpo `{ user: { id: <id del usuario>, username: 'mozo.juan', displayName: 'Juan', role: 'waiter' }, expiresAt: '2026-10-09T07:00:00.000Z' }`, que cumple sessionResponseSchema;
- y trae una sola cabecera Set-Cookie para `polleria_session`, cuyo valor cumple SESSION_TOKEN_PATTERN, con los atributos HttpOnly, `SameSite=Strict`, `Path=/` y `Max-Age=57600`, y sin `Secure` ni `Domain`;
- y la tabla sessions tiene una sola fila, con user_id del usuario, token_hash igual a `hashSessionToken(<valor de la cookie>)` y expires_at igual a T0 + 16 h; ninguna columna guarda el valor de la cookie;
- y `SESSION_DURATION_MS` es 57600000.

**AC-14. Inicio de sesión fallido sin revelar la causa** (integración)
- Dado la app con el espía de verify, el mozo mozo.juan (PIN '2468') y el mozo mozo.ex (PIN '1357', desactivado con SQL), con console.error espiado,
- cuando se hace POST /api/auth/login con cada caso: mozo.juan con PIN '2469'; 'nadie' (no existe) con PIN '2468'; mozo.ex con su PIN correcto '1357',
- entonces cada respuesta es 401 con exactamente `{ error: { code: 'INVALID_CREDENTIALS', message: 'Usuario o PIN incorrecto.', details: null } }` (el mismo cuerpo en los tres casos), sin Set-Cookie;
- y la tabla sessions sigue vacía y console.error no se llamó;
- y en cada caso `verify` se llamó exactamente una vez, también para 'nadie' (compara contra un hash de relleno).

**AC-15. Validación del cuerpo del inicio de sesión** (integración)
- Dado la app con el espía de verify y el mozo mozo.juan (PIN '2468'),
- cuando se hace POST /api/auth/login con: sin cuerpo; `{}`; solo username; solo pin; `pin: 2468` (número); pin '24a8', '246' o '2468000'; username 'ab'; `{ username: 'mozo.juan', pin: '2468', role: 'admin' }`; o el texto `username=mozo.juan&pin=2468` con `Content-Type: text/plain`,
- entonces cada respuesta es 400 VALIDATION_ERROR con `details.issues` no vacío y sin Set-Cookie, y `verify` no se llamó;
- y después de 10 de esas solicitudes, el login de mozo.juan con '2468' responde 200 (los errores de formato no cuentan como intentos).

**AC-16. Bloqueo por intentos fallidos** (integración)
- Dado la app con el reloj en T0, el espía de verify, el mozo mozo.juan (PIN '2468') y la cajera caja.ana (PIN '1357'),
- cuando se hacen 5 POST /api/auth/login de mozo.juan con PIN '0000', entonces los 5 responden 401 INVALID_CREDENTIALS;
- cuando el 6.º lleva el PIN correcto '2468', entonces responde 429 con exactamente `{ error: { code: 'TOO_MANY_ATTEMPTS', message: 'Demasiados intentos fallidos. Espera unos minutos e intenta de nuevo.', details: { retryAfterSeconds: 900 } } }`, la cabecera `Retry-After: 900` y sin Set-Cookie, y `verify` no se llamó en esa solicitud;
- y caja.ana entra sin problema en ese momento (200);
- con el reloj en T0 + 10 min, mozo.juan recibe 429 con `retryAfterSeconds: 300` y `Retry-After: 300`;
- con el reloj en T0 + 15 min, mozo.juan entra con '2468' (200), y después 4 intentos con '0000' responden 401 (no 429: el éxito reinició el conteo);
- y 10 intentos con el usuario 'nadie' responden todos 401, nunca 429.

**AC-17. Intentos simultáneos y bloqueo repetido** (integración)
- Dado la app con el reloj en T0, el espía de verify y el mozo mozo.juan (PIN '2468'),
- cuando se envían a la vez 20 POST /api/auth/login de mozo.juan con PIN '0000' (Promise.all),
- entonces exactamente 5 responden 401 y 15 responden 429, y `verify` se llamó exactamente 5 veces;
- y con el reloj en T0 + 15 min, un intento con '0000' responde 401 y el siguiente, aunque lleve '2468', responde 429 con `retryAfterSeconds: 900` (después del primer bloqueo, cada fallo vuelve a bloquear);
- y con el reloj en T0 + 30 min, '2468' responde 200.

**AC-18. Sesión actual** (integración)
- Dado la app y la cookie que devolvió el login de mozo.juan (AC-13), con console.error espiado,
- cuando se hace `GET /api/auth/me` con esa cookie, entonces responde 200 con `Cache-Control: no-store` y el mismo cuerpo que devolvió el login;
- cuando se hace sin cabecera Cookie; con solo otra cookie (`otra=1`); con `polleria_session` igual a un token nuevo de generateSessionToken que no está en la base; con el token del login con un carácter cambiado; con un valor de 42 o de 44 caracteres; con el token entre comillas; o con el token_hash de la base en lugar del token,
- entonces responde 401 con exactamente `{ error: { code: 'UNAUTHENTICATED', message: 'Debes iniciar sesión para continuar.', details: null } }` y `Cache-Control: no-store`;
- y console.error no se llamó.

**AC-19. La sesión vence a las 16 horas** (integración)
- Dado la app con el reloj controlado y un login de mozo.juan en T0,
- cuando el reloj está en T0 + 16 h - 1 ms, `GET /api/auth/me` responde 200;
- cuando está en T0 + 16 h, responde 401 UNAUTHENTICATED;
- y en T0 + 20 h también 401.

**AC-20. Los cambios del usuario valen desde la siguiente solicitud** (integración)
- Dado la app y una sesión de mozo.juan (waiter, 'Juan'),
- cuando se ejecuta con SQL `UPDATE users SET role = 'cashier', display_name = 'Juan Pérez'`, entonces `GET /api/auth/me` responde 200 con role 'cashier' y displayName 'Juan Pérez';
- y cuando se ejecuta `UPDATE users SET is_active = false`, entonces responde 401 UNAUTHENTICATED.

**AC-21. Cerrar sesión** (integración)
- Dado la app y dos inicios de sesión de mozo.juan (cookies A y B, como dos dispositivos),
- cuando se hace `POST /api/auth/logout` con la cookie A,
- entonces responde 204 sin cuerpo, con `Cache-Control: no-store` y una cabecera Set-Cookie que borra `polleria_session` (valor vacío, `Path=/`, HttpOnly, `SameSite=Strict` y `Expires` en el pasado o `Max-Age=0`), y la fila de la sesión A ya no existe;
- y `GET /api/auth/me` con A responde 401, y con B sigue respondiendo 200 (cerrar sesión solo cierra ese dispositivo);
- y `POST /api/auth/logout` sin cookie, con un valor inválido o de nuevo con A responde 204 con la misma Set-Cookie que borra, y la sesión B sigue existiendo.

**AC-22. Varias sesiones y limpieza de sesiones vencidas** (integración)
- Dado la app con el reloj controlado y los usuarios mozo.juan y caja.ana,
- cuando mozo.juan inicia sesión dos veces en T0, entonces las dos cookies son distintas, hay dos filas en sessions y las dos sirven en `GET /api/auth/me`;
- cuando además caja.ana inicia sesión en T0 + 1 h (su sesión vence en T0 + 17 h) y vuelve a iniciar sesión en T0 + 16 h,
- entonces, después de ese último login, la tabla sessions tiene exactamente las dos sesiones de caja.ana: las dos de mozo.juan, que vencieron justo en T0 + 16 h, se borraron (todo inicio de sesión exitoso borra las sesiones de cualquier usuario con expires_at menor o igual que la hora actual) y la sesión vigente de caja.ana no se tocó.

**AC-23. requireAuth y requireRole** (integración con una app de prueba)
- Dado una app Express de prueba que monta, sobre polleria_test:
  - `GET /solo-admin` con `requireAuth` y `requireRole('admin')`;
  - `GET /caja` con `requireAuth` y `requireRole('cashier', 'admin')`;
  - `GET /sin-auth` con solo `requireRole('admin')`;
  - un manejador final que responde 200 con `{ userId, role, sessionId }` leídos de `getAuthContext(res)`;
  - y `errorHandler` de la 001;
- donde `requireAuth = createRequireAuth({ sessionService })`, `sessionService = createSessionService({ models: defineModels(sequelize), now })`, y las cookies salen de `sessionService.createSession(userId)` para un usuario de cada rol, con console.error espiado,
- entonces `/solo-admin` responde 401 UNAUTHENTICATED sin cookie; 403 con exactamente `{ error: { code: 'FORBIDDEN', message: 'No tienes permiso para realizar esta acción.', details: null } }` para waiter, kitchen y cashier; y 200 para admin con el userId, el role 'admin' y el sessionId de esa sesión;
- `/caja` responde 200 para cashier y admin y 403 para waiter y kitchen;
- `/sin-auth` responde 401 UNAUTHENTICATED aun con la cookie del admin (nunca 200 ni 500);
- `requireRole()` sin roles lanza de inmediato un Error con el mensaje 'requireRole necesita al menos un rol.';
- y console.error no se llamó.

**AC-24. Nada expone el PIN ni su hash** (integración)
- Dado la app, el administrador dueno ('Don Carlos', PIN '975310') y el mozo mozo.juan (PIN '2468'),
- cuando se hacen `GET /api/auth/users`; `POST /api/auth/login` de dueno con '975310' (200), con '975311' (401) y con '97' (400 VALIDATION_ERROR); `GET /api/auth/me` con la cookie (200) y sin cookie (401); `POST /api/auth/logout` (204); y un 6.º intento de mozo.juan después de 5 PIN incorrectos (429),
- entonces ni el cuerpo ni las cabeceras de ninguna de esas respuestas contienen '975310', '$2b$', el pin_hash guardado de dueno, 'pinHash' ni 'pin_hash';
- y todas llevan `Cache-Control: no-store`.

**AC-25. Servicio de usuarios** (integración, apps/api/src/services/users/user.service.ts)
- Dado `createUserService({ models: defineModels(sequelize), pinHasher: createBcryptPinHasher() })` sobre polleria_test migrada,
- cuando `createUser({ username: ' Dueno ', displayName: '  Don Carlos ', pin: '0007', role: 'admin' })`, entonces se resuelve con exactamente `{ id, username: 'dueno', displayName: 'Don Carlos', role: 'admin' }` (id entero positivo), y la fila tiene is_active true y un pin_hash que empieza con '$2b$10$' y que `verify('0007', pin_hash)` acepta;
- cuando luego se crea otro con username 'DUENO' o 'dueno', entonces se rechaza con un AppError de code 'USERNAME_TAKEN', httpStatus 409 y message 'Ese nombre de usuario ya existe.', y sigue habiendo una sola fila;
- cuando la entrada no es válida (username 'ab', displayName '', pin '12' o role 'chef'), entonces se rechaza con un ZodError y no se crea nada;
- y dos `createUser` simultáneos con el mismo username terminan con uno resuelto y el otro rechazado con USERNAME_TAKEN (la garantía final es el índice único).

### 4.5 Comando del primer administrador (proceso real)

En estas pruebas el proceso es `node --disable-warning=ExperimentalWarning apps/api/src/create-admin.ts`, con el entorno copiado de process.env más NODE_ENV=test y DATABASE_URL igual a DATABASE_URL_TEST, la entrada estándar como tubería (la prueba escribe las líneas y la cierra) y un tiempo límite de 15 s.

**AC-26. Crea un administrador** (integración con proceso real)
- Dado polleria_test migrada y sin usuarios,
- cuando la entrada es `'Dueno\r\nDon Carlos\r\n975310\r\n975310\r\n'` (los finales CRLF se aceptan),
- entonces termina con código 0; stdout contiene la línea 'Administrador creado: dueno (Don Carlos).'; stderr contiene 'Aviso: esta terminal no puede ocultar el PIN. Para que no se vea al escribirlo, usa PowerShell o el Símbolo del sistema.' (la entrada no es una terminal); y ni stdout ni stderr contienen '975310';
- y users tiene una sola fila: username 'dueno', display_name 'Don Carlos', role 'admin', is_active true y un pin_hash que empieza con '$2b$10$' y acepta '975310';
- y con la app, `POST /api/auth/login` con dueno y '975310' responde 200 con role 'admin';
- y una segunda ejecución con `'dueno2\nOtra Persona\n1234\n1234\n'` también termina con código 0 y deja dos administradores.

**AC-27. Errores del comando** (integración con proceso real)
- Dado polleria_test migrada con el administrador dueno ya creado (salvo donde se indica), cuando la entrada o el entorno es cada caso de la tabla,
- entonces termina con código 1, stderr contiene el mensaje indicado, el número de filas de users no cambia, ni stdout ni stderr contienen el PIN usado, y stderr no tiene trazas (ninguna línea que empiece con espacios seguidos de 'at '):

  | Caso | Entrada (líneas) o entorno | Mensaje en stderr |
  | --- | --- | --- |
  | PIN repetido distinto | 'nuevo', 'Nuevo', '975310', '975311' | 'Los PIN no coinciden.' |
  | PIN inválido | 'nuevo', 'Nuevo', '97a5' | 'El PIN debe tener de 4 a 6 dígitos.' |
  | Usuario inválido | 'ab' | 'Usa de 3 a 32 caracteres: letras minúsculas sin tilde, números, punto, guion o guion bajo; empieza y termina con letra o número.' |
  | Nombre inválido | 'nuevo', '' | 'Usa de 1 a 40 caracteres: letras, números, espacios, punto, apóstrofo o guion; empieza con letra o número.' |
  | Usuario existente | 'Dueno', 'Otro', '1234', '1234' | 'Ese nombre de usuario ya existe.' |
  | Entrada incompleta | 'nuevo', 'Nuevo' (y se cierra) | 'Se canceló la creación del administrador.' |
  | Sin tablas | polleria_test sin users (helper de limpieza) y las cuatro líneas válidas | 'Faltan las tablas de usuarios. Ejecuta primero pnpm db:migrate.' |
  | Base inalcanzable | DATABASE_URL = `postgres://polleria:Clave_Secreta_99@127.0.0.1:1/polleria_test` | 'No se pudo conectar con la base de datos.' (y no contiene 'Clave_Secreta_99') |
  | Sin DATABASE_URL | DATABASE_URL sin definir | 'Configuración inválida.' |

### 4.6 Web (unitarias y de componentes, con MSW)

En estas pruebas `next/navigation` se simula (`useRouter` devuelve un `replace` espiado) y `apps/web/src/lib/navigation.ts` se simula para espiar `hardNavigate`. Los componentes se renderizan dentro de Providers (001). Las respuestas de la API se simulan con MSW según el contrato.

**AC-28. Cliente HTTP central** (unitaria, apps/web/src/lib/api/client.ts)
- Dado `createApiClient({ onUnauthenticated, timeoutMs })` con onUnauthenticated espiado,
- `request('/auth/me')` hace un GET a `<window.location.origin>/api/auth/me` con `credentials: 'same-origin'` y `Accept: application/json`, y con un 200 JSON se resuelve con el objeto recibido;
- `request('/auth/login', { method: 'POST', body: { a: 1 } })` envía `{"a":1}` con `Content-Type: application/json`;
- un 204 se resuelve con undefined;
- un 401 con `{ error: { code: 'UNAUTHENTICATED', ... } }` se rechaza con un ApiError (instancia de Error) con status 401, el code, el message y los details recibidos, y llama a onUnauthenticated exactamente una vez; con `skipAuthRedirect: true` se rechaza igual pero no lo llama; un 401 INVALID_CREDENTIALS no lo llama;
- un 429 con `details: { retryAfterSeconds: 900 }` se rechaza con un ApiError con esos details;
- un 500 con HTML, o un 200 que no es JSON, se rechaza con un ApiError con el status recibido, code 'UNEXPECTED_RESPONSE' y message 'Respuesta inesperada del servidor. Intenta nuevamente.';
- un error de red, o ninguna respuesta antes de `timeoutMs` (prueba con 50), se rechaza con un ApiError con status 0, code 'NETWORK_ERROR' y message 'Sin conexión con el servidor. Revisa el wifi e intenta de nuevo.';
- `DEFAULT_API_TIMEOUT_MS` es 10000;
- y el cliente por defecto `apiClient`, ante un 401 UNAUTHENTICATED, llama a `hardNavigate('/login')` si `window.location.pathname` es '/mozo', y no lo llama si es '/login'.

**AC-29. Pantalla de inicio: lista de usuarios** (componente, LoginScreen)
- Dado LoginScreen con `GET /api/auth/me` respondiendo 401 UNAUTHENTICATED, `GET /api/auth/users` con Juan (mozo.juan) y Ana (caja.ana), y localStorage vacío,
- mientras carga, un elemento con role="status" muestra 'Cargando usuarios...';
- luego muestra un encabezado de nivel 1 '¿Quién eres?' y un botón por usuario, en el orden de la API, cuyo nombre accesible contiene el nombre para mostrar;
- y hardNavigate no se llamó (el 401 de /me en /login no recarga la página);
- cuando la lista está vacía, muestra 'No hay usuarios activos. El administrador debe crear el primero con el comando pnpm users:create-admin.';
- cuando /api/auth/users responde 500 o falla la red, un elemento con role="alert" muestra 'No se pudo cargar la lista de usuarios.' y un botón 'Reintentar' que, al tocarlo con la API ya respondiendo bien, muestra la lista;
- y cuando /api/auth/me responde 200 (sesión de cajero ya abierta), llama a `replace('/caja')` y no muestra la lista.

**AC-30. Teclado de PIN** (componente, LoginScreen)
- Dado LoginScreen con la lista de AC-29, después de tocar el botón de Juan,
- entonces muestra el encabezado de nivel 1 'Hola, Juan', el texto 'PIN de 4 a 6 dígitos', los botones '0' a '9', 'Borrar', 'Entrar' (deshabilitado) y 'Cambiar usuario';
- al tocar 1, 2 y 3 muestra '•••' y Entrar sigue deshabilitado; al tocar 4 muestra '••••' y Entrar se habilita; acepta hasta 6 dígitos y un 7.º toque no cambia nada ('••••••');
- 'Borrar' quita el último dígito ('•••••');
- en ningún momento el documento contiene como texto los dígitos escritos (por ejemplo '123456') ni un campo con ese valor;
- con el teclado físico (keyDown en el documento) '2', '4', '6' y '8' muestran '••••', 'Backspace' deja '•••', y después de otro dígito 'Enter' envía el inicio de sesión;
- y 'Cambiar usuario' vuelve a la lista; al elegir de nuevo a Juan, el PIN está vacío ('PIN de 4 a 6 dígitos').

**AC-31. Envío del PIN y errores** (componente, LoginScreen)
- Dado LoginScreen con Juan elegido y el PIN 2468 escrito,
- cuando se toca 'Entrar', entonces se hace exactamente un `POST /api/auth/login` con `{ "username": "mozo.juan", "pin": "2468" }`; mientras espera, el botón dice 'Entrando...' y está deshabilitado, y otro toque no envía otra solicitud;
- cuando responde 200, llama a `replace` con la casa del rol: '/mozo' para waiter, '/caja' para cashier, '/admin' para admin y '/cocina' para kitchen;
- cuando responde 401 INVALID_CREDENTIALS, un elemento con role="alert" muestra 'Usuario o PIN incorrecto.', el PIN queda vacío ('PIN de 4 a 6 dígitos'), no llama a replace y hardNavigate no se llamó;
- cuando responde 429 con `retryAfterSeconds` 900, muestra 'Demasiados intentos fallidos. Intenta de nuevo en 15 minutos.'; con 60, '... en 1 minuto.'; con 61, '... en 2 minutos.' (minutos redondeados hacia arriba);
- cuando falla la red, muestra 'Sin conexión con el servidor. Revisa el wifi e intenta de nuevo.';
- cuando responde 500 INTERNAL_ERROR, muestra el message de la API ('Ocurrió un error inesperado. Intenta nuevamente.');
- y en todos los casos de error el PIN queda vacío.

**AC-32. Recordar el último usuario** (componente, LoginScreen)
- Dado LoginScreen,
- cuando un inicio de sesión de mozo.juan responde 200, entonces localStorage guarda 'mozo.juan' en la clave 'polleria:lastUsername';
- cuando localStorage ya tiene 'mozo.juan' y la lista lo incluye, entonces al cargar muestra directamente el teclado ('Hola, Juan') sin tocar la lista, y 'Cambiar usuario' muestra la lista;
- cuando tiene un nombre de usuario que no está en la lista, entonces muestra la lista;
- y cuando localStorage lanza al leer o al escribir, la pantalla funciona igual (muestra la lista y el inicio de sesión llega a replace).

**AC-33. Guardia de rol** (componente, con la página /mozo)
- Dado el default export de apps/web/src/app/mozo/page.tsx (áreas de D-003-07), con `window.location.pathname` en '/mozo',
- mientras `GET /api/auth/me` no responde, un elemento con role="status" muestra 'Cargando...' y no se ve el encabezado 'Mozo';
- con 200 de un waiter, muestra el encabezado de nivel 1 'Mozo';
- con 200 de un cashier, llama a `replace('/caja')` y el encabezado 'Mozo' nunca aparece;
- con 401 UNAUTHENTICATED, se llama a `hardNavigate('/login')` y el encabezado no aparece;
- y con un error de red, un elemento con role="alert" muestra 'No se pudo verificar tu sesión.' y un botón 'Reintentar' que, con la API ya respondiendo 200 de un waiter, muestra el encabezado 'Mozo'.

**AC-34. Pantallas por rol** (componente, páginas de área)
- Dado el default export de cada página y `GET /api/auth/me` respondiendo con el rol indicado,
- entonces, para cada rol permitido, muestra el encabezado de nivel 1, la línea `<displayName> · <etiqueta del rol>` y el botón 'Cerrar sesión'; y para el rol no permitido del ejemplo, llama a `replace(<casa de ese rol>)` sin mostrar el encabezado:

  | Página | Roles permitidos | Encabezado | Línea con el rol (ejemplo) | No permitido (ejemplo) |
  | --- | --- | --- | --- | --- |
  | app/mozo/page.tsx | waiter, admin | Mozo | 'Juan · Mozo' | kitchen: replace('/cocina') |
  | app/caja/page.tsx | cashier, admin | Caja | 'Ana · Cajero' | waiter: replace('/mozo') |
  | app/admin/page.tsx | admin | Administración | 'Carlos · Administrador' | cashier: replace('/caja') |
  | app/cocina/page.tsx | kitchen, admin | Cocina | 'Beto · Cocina' | waiter: replace('/mozo') |

- y /admin muestra los enlaces 'Ir a Mozo' (href '/mozo') e 'Ir a Caja' (href '/caja'); las otras páginas no los muestran;
- y `ROLE_HOME_PATHS` es `{ waiter: '/mozo', kitchen: '/cocina', cashier: '/caja', admin: '/admin' }` y `ROLE_LABELS` es `{ waiter: 'Mozo', kitchen: 'Cocina', cashier: 'Cajero', admin: 'Administrador' }`.

**AC-35. Cerrar sesión desde la web** (componente, página /mozo)
- Dado la página /mozo con la sesión de un waiter,
- cuando se toca 'Cerrar sesión', entonces se hace exactamente un `POST /api/auth/logout` y luego `hardNavigate('/login')` una vez; mientras espera, el botón dice 'Cerrando sesión...' y está deshabilitado;
- y cuando el logout responde 500 o falla la red, un elemento con role="alert" muestra 'No se pudo cerrar la sesión. Intenta de nuevo.', hardNavigate no se llama y el botón vuelve a estar habilitado.

**AC-36. Enlace para iniciar sesión en Inicio** (componente, apps/web/src/app/page.tsx)
- Dado la página de inicio de la 001 dentro de Providers con la salud simulada en 200,
- entonces, además del encabezado 'Sistema Pollería' y del indicador 'Conectado' (AC-27 de la 001, sin cambios), muestra un enlace 'Iniciar sesión' con href '/login'.

### 4.7 Extremo a extremo (Playwright, contra polleria_test)

Antes de las pruebas, una preparación global (e2e/global-setup.ts) migra polleria_test, vacía users y sessions y crea con createUserService: e2e.mozo ('Mozo E2E', waiter, PIN '2468'), e2e.caja ('Caja E2E', cashier, '1357') y e2e.admin ('Admin E2E', admin, '135790'). Cada prueba usa un contexto de navegador nuevo.

**AC-37. Un mozo entra, sale y no puede volver sin PIN** (E2E, desktop-chrome y mobile-chrome)
- Dado /login,
- cuando se toca 'Mozo E2E', se tocan 2, 4, 6 y 8 y se toca 'Entrar',
- entonces antes de 10 s la URL es /mozo, se ve el encabezado 'Mozo' y el texto 'Mozo E2E · Mozo';
- y al recargar la página sigue en /mozo (la cookie mantiene la sesión);
- cuando se toca 'Cerrar sesión', la URL pasa a /login;
- y al abrir /mozo de nuevo, termina en /login antes de 10 s.

**AC-38. El administrador entra a todas las áreas; un PIN incorrecto no** (E2E, desktop-chrome y mobile-chrome)
- Dado /login,
- cuando se elige 'Admin E2E' y se envía el PIN '111111', entonces se ve 'Usuario o PIN incorrecto.' y la URL sigue en /login;
- cuando luego se envía '135790', entonces la URL es /admin con el encabezado 'Administración';
- cuando se toca 'Ir a Caja', se ve el encabezado 'Caja' en /caja;
- y la cookie `polleria_session` del contexto del navegador tiene httpOnly true, sameSite 'Strict' y secure false.

**AC-39. Teclado cómodo en el celular y todo en la red local** (E2E, mobile-chrome)
- Dado el proyecto mobile-chrome (360 px de ancho),
- en /login, cada botón de usuario y cada botón del teclado ('0' a '9', 'Borrar', 'Entrar') mide al menos 48 px de alto;
- en la lista, en el teclado y en /mozo después de entrar, `document.documentElement.scrollWidth` es menor o igual que `window.innerWidth`;
- y todas las solicitudes HTTP y WebSocket del navegador durante el inicio de sesión van a localhost:3100 (se ignoran data: y blob:).

### 4.8 Cobertura de RF y RNF

| RF o RNF | AC y requisitos que lo cubren |
| --- | --- |
| RF-01 (usuario y PIN) | AC-13, AC-14, AC-29 a AC-31, AC-37, AC-38 |
| RF-01 (solo las funciones del rol) | AC-23 (API), AC-33, AC-34 (web), AC-37, AC-38 |
| RNF-09 (PIN propio por usuario) | AC-05, AC-13, AC-14, AC-16, AC-17, AC-25 a AC-27 |
| RNF-10 (PIN cifrados) | AC-05, AC-08, AC-13, AC-24, AC-25, AC-26 |
| RNF-01 y RNF-02 (rapidez, botones grandes) | AC-30, AC-32, AC-39 |
| RNF-05 (red local) | AC-39; R-003-07 |
| Regla de dominio 8 (America/Lima) | No aplica: las fechas de sesión se guardan y comparan en UTC (D-10 de la 001). |

## 5. Requisitos de configuración (verificados por comando)

No son comportamiento, por eso no llevan AC. Los comandos con grep se ejecutan en Git Bash desde la raíz.

| ID | Requisito | Comando | Resultado esperado |
| --- | --- | --- | --- |
| R-003-01 | apps/api con `bcrypt` 6.0.0 en dependencies y `@types/bcrypt` 6.0.0 en devDependencies, exactas. pnpm-workspace.yaml con `ignoredBuiltDependencies: [bcrypt]` (no onlyBuiltDependencies: bcrypt trae binarios precompilados y su script de instalación solo compilaría desde el código fuente si faltaran, lo que exige Python y Visual Studio Build Tools). | `pnpm install --frozen-lockfile` y `pnpm --filter @polleria/api why @types/node` | Código 0, sin el aviso "Ignored build scripts"; @types/node solo en 24.19.1. |
| R-003-02 | Scripts: en la raíz `users:create-admin` = `pnpm --filter @polleria/api run users:create-admin`; en @polleria/api `users:create-admin` = `node --env-file-if-exists=.env --disable-warning=ExperimentalWarning src/create-admin.ts`. Compatibles con Windows (R-15 de la 001). | `pnpm run` | Lista users:create-admin. |
| R-003-03 | vitest.config.ts agrega `apps/api/src/create-admin.ts` a coverage.exclude (como server.ts, db/cli.ts y print-test-page.ts). apps/api/src/services/auth/** y apps/api/src/services/users/** cumplen el 90 % de services. | `pnpm test:coverage` | Código 0. |
| R-003-04 | Sin variables de entorno nuevas (D-003-13). | `git diff main -- apps/api/.env.example apps/api/src/config/env.ts` | Sin resultados. |
| R-003-05 | Toda ruta de apps/api/src/routes, salvo /health, /auth/users, /auth/login y /auth/logout, usa requireAuth (en esta spec, solo /auth/me). | Revisión del reviewer de apps/api/src/routes/*.ts | Se cumple. |
| R-003-06 | `pnpm users:create-admin` en PowerShell no muestra el PIN mientras se escribe (no se ve nada o se ve un * por dígito) y Ctrl+C cancela con 'Se canceló la creación del administrador.' y código 1. | Prueba manual en PowerShell, con apps/api/.env y polleria_dev migrada | Se cumple; borrar después el usuario de prueba si no se quiere conservar. |
| R-003-07 | La web sigue sin recursos de internet (R-14 de la 001). | El grep de R-14 de la 001 | Sin resultados. |
| R-003-08 | docs/api/openapi.yaml es OpenAPI 3.1 válido, versión 0.3.0. | `npx -y @redocly/cli@latest lint docs/api/openapi.yaml` (desde una carpeta temporal) | "valid", sin errores (se aceptan advertencias como la respuesta Forbidden sin uso). |
| R-003-09 | Definición de terminado de CLAUDE.md. | `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm test:coverage` | Código 0 en los cuatro. |

## 6. Reglas de negocio aplicables

De CLAUDE.md:
- Glosario: waiter, kitchen, cashier y admin en código, base y API; mozo, cocina, cajero y administrador en la interfaz.
- Regla de dominio 8: las fechas de sesión se guardan en UTC (timestamptz) y viajan en ISO con Z; no hay cálculos por día de Lima en esta spec.
- Regla de dominio 9: todo funciona en la red local; nada usa internet.
- Reglas para todos los agentes 6 y 7: el esquema cambia solo con migraciones; ningún PIN ni secreto en el repositorio.
- Regla de dominio 6 (anulación con autorización del administrador): no se implementa aquí; la Fase 2 usará los roles y el PinHasher de esta spec.

De la spec 001: RN-001-01 (sin secretos en respuestas ni logs), RN-001-05 (mensajes en español, códigos en inglés), RN-001-06 (/api/health es público) y RN-001-07 (los 4xx no se registran).

Específicas de esta spec:
- RN-003-01. Cada trabajador tiene su propio usuario y PIN. Un usuario tiene exactamente un rol: waiter, kitchen, cashier o admin.
- RN-003-02. El PIN tiene de 4 a 6 dígitos y se guarda solo como hash bcrypt de costo 10. Nunca se guarda, se registra, se muestra ni se devuelve.
- RN-003-03. Solo los usuarios activos inician sesión. La respuesta de un inicio de sesión fallido es la misma si el usuario no existe, si está inactivo o si el PIN es incorrecto.
- RN-003-04. 5 intentos fallidos seguidos bloquean al usuario 15 minutos; después, cada fallo lo vuelve a bloquear 15 minutos; un inicio de sesión exitoso borra el conteo.
- RN-003-05. Una sesión dura 16 horas desde que se inicia y se puede cerrar antes. Cerrar sesión cierra solo ese dispositivo. Un usuario puede tener varias sesiones a la vez.
- RN-003-06. El rol y el estado activo se leen de la base en cada solicitud protegida: un cambio vale desde la siguiente solicitud.
- RN-003-07. Sin sesión válida, toda ruta protegida responde 401; con sesión válida pero sin el rol requerido, 403.
- RN-003-08. Cada área de la web muestra solo lo de su rol; el administrador entra a todas.

## 7. Casos borde conocidos

Inicio de sesión:
- Nombre de usuario con mayúsculas o espacios alrededor ('  MOZO.Juan '): se recorta y se pasa a minúsculas antes de buscar.
- PIN con ceros a la izquierda ('0007'): es texto, se conserva.
- PIN con dígitos que no son ASCII ('\u0661\u0662\u0663\u0664'): 400 VALIDATION_ERROR, no cuenta como intento.
- Usuario inactivo con el PIN correcto: 401 INVALID_CREDENTIALS, cuenta como intento fallido.
- Usuario inexistente: siempre 401, nunca 429, no ocupa memoria del límite. Como la lista de usuarios es pública (D-003-08), que un usuario inactivo pueda llegar a 429 y uno inexistente no, no revela nada importante.
- Usuario bloqueado: 429 aunque el PIN sea correcto; los demás usuarios entran normal. Si el dueño está bloqueado y necesita entrar ya, reiniciar la API borra los bloqueos (D-003-05).
- Reiniciar la API (o la PC) borra los conteos y bloqueos, no las sesiones (que están en la base).
- Muchas solicitudes de inicio de sesión con usuarios inexistentes cuestan una comparación bcrypt cada una (unos 50 ms de CPU). Es un riesgo de lentitud aceptado en la red local; no hay límite por IP (D-003-05).
- GET /api/auth/login o PUT /api/auth/login: 404 NOT_FOUND (Express no distingue 405, como en la 001).
- JSON mal formado en el login: 400 INVALID_JSON de la 001 (lo responde el lector del cuerpo, antes de la ruta, sin `Cache-Control: no-store`).

Sesión:
- Exactamente a las 16 horas la sesión ya no vale (`expires_at > ahora`).
- Si alguien cambia la hora de la PC del local, las sesiones vencen antes o después según el cambio.
- Una cookie copiada a otro dispositivo sirve hasta que se cierra esa sesión o vence. HttpOnly impide que un script de la página la lea; la red local reduce el riesgo.
- Varias cookies con el mismo nombre: se usa la primera.
- Un navegador con las cookies desactivadas inicia sesión, pero la siguiente consulta responde 401 y vuelve a /login.
- Desactivar a un usuario no borra sus sesiones en esta spec: dejan de servir porque requireAuth revisa is_active. La 004 decidirá si al desactivar o cambiar el PIN se borran.
- Borrar un usuario (no hay pantalla para eso) borra sus sesiones por la clave foránea.
- Las sesiones vencidas se quedan en la tabla hasta el siguiente inicio de sesión exitoso de cualquier usuario.

Comando del administrador:
- Ejecutarlo antes de `pnpm db:migrate`: avisa que faltan las tablas.
- En Git Bash el PIN se ve al escribirlo (Node no recibe una terminal real); el comando lo avisa. En PowerShell o el Símbolo del sistema no se ve.
- Ctrl+C mientras pregunta: cancela sin crear nada.
- Se puede ejecutar varias veces; cada vez crea un administrador con otro nombre de usuario.

Web:
- El último usuario recordado ya no está activo: se muestra la lista.
- localStorage no disponible (por ejemplo, navegación privada que lo bloquea): no se recuerda a nadie y todo lo demás funciona.
- Doble toque en 'Entrar' o en 'Cerrar sesión': una sola solicitud.
- La sesión vence con la página /mozo abierta: la siguiente consulta a la API (o volver a la pestaña, porque TanStack Query revisa /api/auth/me al recuperar el foco) responde 401 y la página se recarga en /login.
- Botón Atrás del navegador después de cerrar sesión: la página vuelve a consultar la sesión y termina en /login.
- Un mozo que abre /admin a mano: vuelve a /mozo.
- La API apagada en /login: mensaje de error de la lista y 'Reintentar'.

## 8. Modelo de datos

### 8.1 Tabla users (migración 20261008120000-create-users.ts)

| Columna | Tipo | Restricciones |
| --- | --- | --- |
| id | INTEGER | PRIMARY KEY, autoincremental (SERIAL o IDENTITY) |
| username | VARCHAR(32) | NOT NULL; UNIQUE (`users_username_unique`); CHECK `username ~ '^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$'` (ya en minúsculas: el patrón no admite mayúsculas) |
| display_name | VARCHAR(40) | NOT NULL; CHECK `display_name <> '' AND display_name = btrim(display_name)` |
| pin_hash | VARCHAR(60) | NOT NULL; CHECK `char_length(pin_hash) = 60` |
| role | VARCHAR(16) | NOT NULL; CHECK `role IN ('waiter', 'kitchen', 'cashier', 'admin')` |
| is_active | BOOLEAN | NOT NULL DEFAULT true |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

- El patrón completo del nombre para mostrar (letras, números, espacio, punto, apóstrofo, guion; NFC) lo aplica displayNameSchema; la base solo garantiza que no esté vacío ni tenga espacios alrededor. VARCHAR(40) cuenta caracteres (puntos de código), igual que zod `max(40)`.
- No hay índice extra: el único de username sirve para la búsqueda del login y la lista es pequeña.
- Sequelize (modelo User, `underscored`): id, username, displayName, pinHash, role, isActive, createdAt, updatedAt. pinHash nunca sale en una respuesta.

### 8.2 Tabla sessions (migración 20261008120100-create-sessions.ts)

| Columna | Tipo | Restricciones |
| --- | --- | --- |
| id | INTEGER | PRIMARY KEY, autoincremental |
| user_id | INTEGER | NOT NULL; FOREIGN KEY → users(id) ON DELETE CASCADE; índice `sessions_user_id_idx` |
| token_hash | VARCHAR(64) | NOT NULL; UNIQUE (`sessions_token_hash_unique`); CHECK `token_hash ~ '^[0-9a-f]{64}$'` |
| expires_at | TIMESTAMPTZ | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

- Sin updated_at: una sesión no se modifica; se crea y se borra.
- Sequelize (modelo Session): id, userId, tokenHash, expiresAt, createdAt (`updatedAt: false`).
- La búsqueda de requireAuth es por token_hash (índice único) con expires_at mayor que la hora actual y el usuario activo.

### 8.3 Relaciones y reversibilidad

- users 1 — N sessions.
- `down` de create-sessions borra sessions; `down` de create-users borra users. Revertir borra los datos de esas tablas (solo para desarrollo).
- Sin seeds: el primer administrador se crea con el comando (D-003-10).

## 9. API

Todas las rutas cuelgan de /api (D-01 de la 001). Todas las respuestas de /api/auth/* llevan `Cache-Control: no-store`, también las de error.

| Método y ruta | Rol | Request | Respuesta correcta | Errores |
| --- | --- | --- | --- | --- |
| GET /api/auth/users | Público | — | 200 LoginUsersResponse | 500 |
| POST /api/auth/login | Público | LoginRequest | 200 SessionResponse + Set-Cookie | 400 VALIDATION_ERROR (y los de lectura del cuerpo de la 001), 401 INVALID_CREDENTIALS, 429 TOO_MANY_ATTEMPTS + Retry-After, 500 |
| GET /api/auth/me | Cualquier rol con sesión | Cookie | 200 SessionResponse | 401 UNAUTHENTICATED, 500 |
| POST /api/auth/logout | Público (funciona con o sin sesión) | Cookie opcional, sin cuerpo | 204 + Set-Cookie que borra | 500 |

### 9.1 GET /api/auth/users

```json
{ "users": [ { "username": "caja.ana", "displayName": "Ana" }, { "username": "mozo.juan", "displayName": "Juan" } ] }
```

Solo usuarios activos, ordenados por displayName con `Intl.Collator('es', { sensitivity: 'base' })` y los empates por username. Sin id, rol, estado ni nada del PIN.

### 9.2 POST /api/auth/login

Request:

```json
{ "username": "mozo.juan", "pin": "2468" }
```

- username se recorta y se pasa a minúsculas antes de validar con USERNAME_PATTERN. pin cumple `^[0-9]{4,6}$`. Objeto estricto: una propiedad de más es 400.

Response 200 (y la cookie de D-003-02):

```json
{ "user": { "id": 3, "username": "mozo.juan", "displayName": "Juan", "role": "waiter" }, "expiresAt": "2026-10-09T07:00:00.000Z" }
```

Orden dentro del servicio (D-003-04 y D-003-05): (1) buscar el usuario por username; (2) si no existe, comparar contra el hash de relleno y responder 401; (3) si está bloqueado, 429 sin comparar; (4) contar el intento (en el mismo paso síncrono que el punto 3); (5) comparar el PIN; (6) si no coincide o el usuario está inactivo, 401; (7) borrar el conteo, borrar las sesiones vencidas, crear la sesión y responder.

Response 429:

```json
{ "error": { "code": "TOO_MANY_ATTEMPTS", "message": "Demasiados intentos fallidos. Espera unos minutos e intenta de nuevo.", "details": { "retryAfterSeconds": 900 } } }
```

con la cabecera `Retry-After: 900`.

### 9.3 GET /api/auth/me

Responde el mismo SessionResponse que el login, con los datos actuales del usuario (rol y nombre leídos de la base) y el expiresAt de esa sesión.

### 9.4 POST /api/auth/logout

Borra la sesión de la cookie si existe y responde 204 sin cuerpo con la Set-Cookie que la borra. Sin cookie o con una inválida responde igual (idempotente): la web siempre puede limpiar la cookie.

### 9.5 Middlewares para las rutas protegidas

- `requireAuth`: 401 UNAUTHENTICATED si no hay sesión válida; deja el contexto en `res.locals.auth`.
- `requireRole(...roles)`: después de requireAuth; 403 FORBIDDEN si el rol no está en la lista.

### 9.6 Socket.IO

Sin eventos en esta spec. Cuando llegue Socket.IO, la conexión por /socket.io llevará la misma cookie (Path=/) y deberá validarla con el mismo servicio de sesiones.

### 9.7 Contrato

docs/api/openapi.yaml pasa a la versión 0.3.0: etiqueta auth; rutas /auth/users, /auth/login, /auth/me y /auth/logout; esquema de seguridad sessionCookie (apiKey en la cookie polleria_session); esquemas UserRole, Username, Pin, LoginRequest, AuthUser, SessionResponse, LoginUser y LoginUsersResponse; cabeceras SetSessionCookie, ClearSessionCookie y RetryAfter; respuestas reutilizables InvalidCredentials, Unauthenticated, Forbidden y TooManyAttempts; ErrorCode y ErrorDetails con los códigos y el campo retryAfterSeconds nuevos.

## 10. Interfaz

Textos en español de Perú. Componentes de HeroUI (Button y los que hagan falta); Tailwind solo para el diseño. Ningún recurso de internet. Consultas con TanStack Query y `retry: false`.

### 10.1 Pantalla "Iniciar sesión" (ruta /login)

- Quién la usa: todos los trabajadores. Dispositivos: celular del mozo (360 px, táctil) y PC de caja (teclado y mouse).
- Primero consulta GET /api/auth/me (sin recargar ante el 401). Si hay sesión, va a la casa del rol. Si no, muestra la lista o, si el dispositivo recuerda a un usuario que está en la lista, su teclado.
- Vista "lista":
  - Encabezado h1 '¿Quién eres?'.
  - Un botón grande por usuario (al menos 48 px de alto, ancho completo en el celular): el nombre para mostrar en grande y el nombre de usuario debajo, más pequeño.
- Vista "teclado":
  - Encabezado h1 'Hola, <displayName>'.
  - Indicador del PIN: 'PIN de 4 a 6 dígitos' cuando está vacío; un punto '•' por dígito cuando hay dígitos. Los dígitos nunca se muestran ni quedan en un campo de texto.
  - Teclado de 3 columnas: 1 2 3 / 4 5 6 / 7 8 9 / Borrar 0 Entrar. Botones de al menos 48 px de alto (se sugieren 56 px) y texto grande.
  - 'Entrar' deshabilitado con menos de 4 dígitos y mientras envía ('Entrando...'). Más de 6 dígitos se ignoran.
  - En la PC funcionan las teclas 0 a 9, Retroceso (Backspace) y Enter.
  - Botón 'Cambiar usuario' que vuelve a la lista y borra el PIN.
- Estados:

  | Estado | Cuándo | Texto |
  | --- | --- | --- |
  | Cargando | Consultando /me o la lista | 'Cargando usuarios...' (role="status") |
  | Vacío | La lista no tiene usuarios | 'No hay usuarios activos. El administrador debe crear el primero con el comando pnpm users:create-admin.' |
  | Error de la lista | 5xx o red | 'No se pudo cargar la lista de usuarios.' (role="alert") y 'Reintentar' |
  | PIN incorrecto | 401 | 'Usuario o PIN incorrecto.' (role="alert") |
  | Bloqueado | 429 | 'Demasiados intentos fallidos. Intenta de nuevo en N minutos.' o '... en 1 minuto.' |
  | Sin conexión | Red o tiempo límite | 'Sin conexión con el servidor. Revisa el wifi e intenta de nuevo.' |
  | Otro error | 500 u otro | El message de la API |

- Tras un error el PIN queda vacío. Tras el éxito, guarda el username en localStorage ('polleria:lastUsername') y va a la casa del rol con `router.replace`.

### 10.2 Áreas por rol (/mozo, /caja, /admin, /cocina)

- Cada página envuelve su contenido en RoleGuard con los roles de D-003-07.
- Contenido mínimo, mobile-first:
  - Barra superior con la línea `<displayName> · <etiqueta del rol>` y el botón 'Cerrar sesión' (al menos 48 px de alto).
  - Encabezado h1: 'Mozo', 'Caja', 'Administración' o 'Cocina'.
  - Un texto corto de lo que vendrá (sugerido): 'Aquí verás las mesas y tomarás los pedidos.' (Mozo), 'Aquí cobrarás las cuentas.' (Caja), 'Aquí gestionarás los usuarios, la carta y los reportes.' (Administración), 'Las comandas salen en la impresora de cocina. Esta pantalla todavía no tiene funciones.' (Cocina).
  - Solo en /admin: enlaces 'Ir a Mozo' y 'Ir a Caja'.
- Estados de RoleGuard:

  | Estado | Cuándo | Qué se ve |
  | --- | --- | --- |
  | Cargando | /me en curso | 'Cargando...' (role="status") |
  | Sin sesión | 401 | Se recarga en /login |
  | Otro rol | 200 con un rol no permitido | Va a la casa de ese rol |
  | Error | Red u otro error | 'No se pudo verificar tu sesión.' (role="alert") y 'Reintentar' |
  | Listo | 200 con un rol permitido | El contenido |

- 'Cerrar sesión': POST /api/auth/logout; mientras espera, 'Cerrando sesión...' deshabilitado; si sale bien, recarga en /login; si falla, 'No se pudo cerrar la sesión. Intenta de nuevo.' (role="alert").

### 10.3 Inicio (ruta /)

Igual que en la 001 (encabezado e indicador de conexión), más un enlace 'Iniciar sesión' a /login. Los celulares pueden guardar /login como acceso directo.

## 11. Contrato interno de módulos (rutas que importan las pruebas)

El test-writer importa desde estas rutas; si un módulo no existe todavía, la prueba falla por módulo inexistente (rojo válido). Sintaxis borrable (D-02 de la 001): sin enum, namespace ni propiedades de parámetro; imports relativos con .ts.

- **packages/shared/src/auth.ts** (exportado también por packages/shared/src/index.ts, se importa como `@polleria/shared`)
  - `USER_ROLES` (`as const`), `type UserRole`, `userRoleSchema`.
  - `PIN_PATTERN` = `/^[0-9]{4,6}$/`, `PIN_MIN_LENGTH` = 4, `PIN_MAX_LENGTH` = 6, `pinSchema`.
  - `USERNAME_PATTERN` = `/^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$/`, `usernameSchema` (trim, minúsculas y patrón).
  - `DISPLAY_NAME_MAX_LENGTH` = 40, `DISPLAY_NAME_PATTERN` = `/^[\p{L}\p{N}][\p{L}\p{M}\p{N} .'-]*$/u`, `displayNameSchema` (trim, NFC, de 1 a 40 puntos de código y patrón).
  - `loginRequestSchema` (estricto) y `type LoginRequest`.
  - `authUserSchema` (estricto: id entero positivo, username, displayName, role) y `type AuthUser`.
  - `sessionResponseSchema` (estricto: user y expiresAt ISO UTC con Z, como healthResponseSchema) y `type SessionResponse`.
  - `loginUserSchema`, `loginUsersResponseSchema` y `type LoginUser`, `type LoginUsersResponse`.
- **packages/shared/src/errors.ts** (modificado): ERROR_CODES suma INVALID_CREDENTIALS, UNAUTHENTICATED, FORBIDDEN, TOO_MANY_ATTEMPTS y USERNAME_TAKEN. errorResponseSchema no cambia.
- **apps/api/src/db/migrations/20261008120000-create-users.ts** y **20261008120100-create-sessions.ts**: `up` y `down` con `{ context: QueryInterface }` (D-05 de la 001).
- **apps/api/src/models/index.ts**
  - `interface UserAttributes { id: number; username: string; displayName: string; pinHash: string; role: UserRole; isActive: boolean; createdAt: Date; updatedAt: Date }`.
  - `interface SessionAttributes { id: number; userId: number; tokenHash: string; expiresAt: Date; createdAt: Date }`.
  - `interface Models { User: ...; Session: ... }` (modelos de Sequelize tipados con esos atributos).
  - `defineModels(sequelize: Sequelize): Models` (D-003-11).
- **apps/api/src/services/auth/pin-hasher.ts**
  - `PIN_HASH_COST` = 10.
  - `interface PinHasher { hash(pin: string): Promise<string>; verify(pin: string, pinHash: string): Promise<boolean> }`.
  - `createBcryptPinHasher(options?: { cost?: number }): PinHasher`. verify nunca lanza.
- **apps/api/src/services/auth/login-limiter.ts**
  - `MAX_FAILED_LOGIN_ATTEMPTS` = 5, `LOGIN_LOCK_DURATION_MS` = 900000.
  - `interface LoginLimiter { getRetryAfterSeconds(userId: number): number | null; registerAttempt(userId: number): void; registerSuccess(userId: number): void }`.
  - `createLoginLimiter(options: { now: () => Date; maxFailedAttempts?: number; lockDurationMs?: number }): LoginLimiter`.
- **apps/api/src/services/auth/session-token.ts**
  - `SESSION_TOKEN_PATTERN` = `/^[A-Za-z0-9_-]{43}$/`, `generateSessionToken(): string`, `hashSessionToken(token: string): string`.
- **apps/api/src/services/auth/session.service.ts**
  - `SESSION_DURATION_MS` = 57600000.
  - `interface AuthContext { sessionId: number; user: AuthUser; expiresAt: Date }`.
  - `interface SessionService { createSession(userId: number): Promise<{ token: string; expiresAt: Date }>; resolveSession(token: string | undefined): Promise<AuthContext | null>; deleteSession(token: string | undefined): Promise<void>; deleteExpiredSessions(): Promise<number> }`.
  - `createSessionService(deps: { models: Models; now?: () => Date }): SessionService`. resolveSession devuelve null sin consultar la base si el token falta o no cumple SESSION_TOKEN_PATTERN.
- **apps/api/src/services/auth/auth.service.ts**
  - `interface AuthService { listLoginUsers(): Promise<LoginUser[]>; login(input: LoginRequest): Promise<{ token: string; session: SessionResponse }>; logout(token: string | undefined): Promise<void> }`.
  - `createAuthService(deps: { models: Models; sessionService: SessionService; pinHasher: PinHasher; loginLimiter: LoginLimiter }): AuthService`. login lanza AppError INVALID_CREDENTIALS (401) o TOO_MANY_ATTEMPTS (429, `details.retryAfterSeconds`).
- **apps/api/src/services/users/user.service.ts**
  - `interface CreateUserInput { username: string; displayName: string; pin: string; role: UserRole }`.
  - `interface UserService { createUser(input: CreateUserInput): Promise<AuthUser> }`.
  - `createUserService(deps: { models: Models; pinHasher: PinHasher }): UserService`. Valida con los esquemas de shared (ZodError) y traduce el choque del índice único a AppError USERNAME_TAKEN (409).
- **apps/api/src/http/session-cookie.ts**
  - `SESSION_COOKIE_NAME` = 'polleria_session'.
  - `readSessionCookie(cookieHeader: string | undefined): string | undefined` (pura, AC-11).
  - `setSessionCookie(res: Response, token: string): void` y `clearSessionCookie(res: Response): void` (atributos de D-003-02).
- **apps/api/src/middlewares/auth.ts**
  - `createRequireAuth(deps: { sessionService: SessionService }): RequestHandler`.
  - `requireRole(...roles: UserRole[]): RequestHandler` (lanza con la lista vacía).
  - `getAuthContext(res: Response): AuthContext | undefined`.
- **apps/api/src/controllers/auth.controller.ts** y **apps/api/src/routes/auth.routes.ts**: internos (las pruebas usan createApp). El router de auth fija `Cache-Control: no-store` antes de sus rutas y el controller pone `Retry-After` antes de pasar el error 429.
- **apps/api/src/app.ts** (modificado)
  - `interface AppDependencies { sequelize: Sequelize; healthTimeoutMs?: number; now?: () => Date; pinHasher?: PinHasher }`. now (por defecto `() => new Date()`) es el reloj de sesiones y límite de intentos; pinHasher por defecto es `createBcryptPinHasher()`.
  - `createApp(deps: AppDependencies): Express`. Crea los modelos, un LoginLimiter propio por app, los servicios y monta las rutas de auth. Las pruebas de la 001 que llaman `createApp({ sequelize })` siguen funcionando.
- **apps/api/src/create-admin.ts**
  - Punto de entrada de `pnpm users:create-admin` (D-003-10). Solo lee process.env. Usa `process.exitCode`.
- **apps/web/src/lib/navigation.ts**
  - `hardNavigate(path: string): void` (hace `window.location.assign(path)`; existe para poder simularlo en las pruebas).
- **apps/web/src/lib/api/client.ts**
  - `DEFAULT_API_TIMEOUT_MS` = 10000.
  - `class ApiError extends Error` con `status: number`, `code: string`, `details: unknown`.
  - `interface ApiRequestOptions { method?: 'GET' | 'POST'; body?: unknown; skipAuthRedirect?: boolean }`.
  - `createApiClient(options?: { onUnauthenticated?: () => void; timeoutMs?: number }): { request(path: string, options?: ApiRequestOptions): Promise<unknown> }`. path sin el prefijo /api (por ejemplo '/auth/me').
  - `apiClient`: instancia por defecto; su onUnauthenticated llama a `hardNavigate('/login')` salvo que `window.location.pathname` sea '/login'.
- **apps/web/src/lib/api/auth.ts**
  - `getLoginUsers(): Promise<LoginUser[]>`, `getSession(options?: { skipAuthRedirect?: boolean }): Promise<SessionResponse>`, `login(input: LoginRequest): Promise<SessionResponse>`, `logout(): Promise<void>`. Validan la respuesta con los esquemas de shared; si no cumple, ApiError UNEXPECTED_RESPONSE.
- **apps/web/src/lib/auth/roles.ts**
  - `ROLE_HOME_PATHS` y `ROLE_LABELS` (valores de AC-34), `type AreaPath = '/mozo' | '/caja' | '/admin' | '/cocina'` y `AREA_ALLOWED_ROLES: Readonly<Record<AreaPath, readonly UserRole[]>>` (D-003-07).
- **apps/web/src/lib/auth/last-user.ts**
  - `LAST_USERNAME_STORAGE_KEY` = 'polleria:lastUsername', `readLastUsername(): string | null`, `saveLastUsername(username: string): void` (no lanzan aunque localStorage falle).
- **apps/web/src/components/auth/login-screen.tsx**: `LoginScreen`, componente cliente sin props. apps/web/src/app/login/page.tsx lo renderiza.
- **apps/web/src/components/auth/role-guard.tsx**: `RoleGuard({ allow: readonly UserRole[]; children: ReactNode })`, componente cliente.
- **apps/web/src/components/auth/logout-button.tsx**: `LogoutButton`, componente cliente sin props.
- **apps/web/src/app/mozo/page.tsx**, **caja/page.tsx**, **admin/page.tsx** y **cocina/page.tsx**: default export de cada área (síncronos, sin APIs exclusivas del servidor, como la página de inicio de la 001).
- **apps/web/src/app/page.tsx** (modificado): suma el enlace 'Iniciar sesión'.

Rutas sugeridas para pruebas: unitarias junto al código (`packages/shared/src/auth.test.ts`, `apps/api/src/services/auth/*.test.ts`, `apps/api/src/http/session-cookie.test.ts`, componentes `*.test.tsx`); integración en apps/api/tests/ (`auth-*.test.ts`, `users-migrations.test.ts`, `create-admin-process.test.ts`), con helpers nuevos en apps/api/tests/helpers/ (por ejemplo `auth.ts` para crear usuarios y obtener cookies); E2E en e2e/auth.spec.ts con e2e/global-setup.ts.

## 12. Cambios a specs y documentos anteriores (señalados)

Ningún cambio altera lo que ya ve el usuario en la pantalla Inicio ni en `pnpm printer:test`.

| Elemento | Cambio | Quién |
| --- | --- | --- |
| 001, D-01 ("La futura sesión JWT en cookie httpOnly") | La sesión es un token opaco guardado en la base, en cookie httpOnly del mismo origen (D-003-01). Se agrega una nota en la 001. | spec-writer (esta spec) |
| 001, helper resetMigrationTables (apps/api/tests/helpers/test-database.ts) | Además de SequelizeMeta y SequelizeData, borra sessions y users (en ese orden o con CASCADE), siempre después de la doble verificación de la base _test. Sin esto, AC-21 y AC-24 de la 001 y el ataque ADV-001-06 fallan con "la tabla ya existe" al volver a migrar. Las aserciones de esas pruebas no cambian. | test-writer (T-03) |
| 001, R-12 | `pnpm db:migrate` sobre una base nueva ya no dice 'No hay migraciones pendientes.' la primera vez: aplica las dos migraciones de esta spec. | — (nota) |
| 001, R-04 | Además de format y printer:test, se permite el script raíz users:create-admin. | backend-dev (T-21) |
| 001, R-09 | coverage.exclude suma apps/api/src/create-admin.ts. | backend-dev (T-21) |
| 001, sección 10 (Inicio) | Suma el enlace 'Iniciar sesión' (AC-36). AC-27 y AC-29 a AC-32 de la 001 no cambian. | frontend-dev (T-24) |
| 001, sección 13 ("Autenticación, sesión, PIN, roles y requireRole") | Ahora en alcance de esta spec. | — |
| 001, AC-03 y AC-38 (ERROR_CODES) | ERROR_CODES suma 5 códigos. Esas pruebas piden "al menos" los códigos anteriores: no cambian. | backend-dev (T-15) |
| 001, AC-04 y AC-07; 002, AC-02 y AC-05 | Sin cambios: no hay variables de entorno nuevas (D-003-13). | — |
| docs/api/openapi.yaml | Versión 0.2.0 a 0.3.0 con lo de 9.7. | spec-writer (esta spec) |
| .claude/agents/backend-dev.md ("sesión con JWT en cookie httpOnly") y .claude/agents/adversarial-tester.md ("JWT manipulado") | Si el usuario aprueba D-003-01: "sesión con token aleatorio guardado (como hash) en la base, en cookie httpOnly" y "token de sesión manipulado o inventado". | orquestador |
| CLAUDE.md (Stack y Comandos) | Registrar bcrypt 6.0.0 y @types/bcrypt 6.0.0 y el comando `pnpm users:create-admin`. | orquestador, al cerrar |

## 13. Dependencias

Detalle, versiones consultadas en npm el 2026-10-08, verificaciones y alternativas en docs/decisions/0002-sesion-pin-y-limite-de-intentos.md.

| Paquete | Versión | Dónde | Estado | Justificación |
| --- | --- | --- | --- | --- |
| bcrypt | 6.0.0 | api (dependencies) | Aprobada en CLAUDE.md; se instala ahora | Hash del PIN (RNF-10). Trae binarios precompilados para win32-x64; verificado en Node 24.1.0 sin compilar. |
| @types/bcrypt | 6.0.0 | api (devDependencies) | Requiere aprobación | bcrypt no trae tipos propios. Depende de `@types/node: *`, que se resuelve con el 24.19.1 que ya está (verificado). |

Descartadas (detalle en el ADR): jose 6.2.12, jsonwebtoken 9.0.3 y un HMAC propio con SESSION_SECRET (D-003-01); cookie-parser 1.4.7 y cookie 2.0.1 (leer una sola cookie es una función de pocas líneas; Express 5 ya escribe y borra cookies); express-rate-limit 8.7.1 (D-003-05); @testing-library/user-event 14.6.7 (verificado en react-aria 3.52.1: `fireEvent.click` dispara onPress de los botones de HeroUI como clic virtual); openapi-typescript 7.13.0 (sigue diferido por su peer `typescript ^5.x`).

## 14. Fuera de alcance

- Crear, editar, desactivar usuarios y cambiar o restablecer PIN desde la web (propuesta 004), incluido desbloquear a un usuario a mano.
- Autorización con PIN de administrador para acciones sensibles: anular, descuentos, cierre de caja (Fase 2; RNF-09 segunda parte).
- Auditoría de quién hizo qué (RF-27, Fase 6). Esta spec no registra inicios de sesión.
- Usuarios de demostración (Fase 6).
- HTTPS en la red local y la cookie con Secure.
- Límite por IP, CAPTCHA, avisos al dueño de intentos fallidos y bloqueos guardados en la base o compartidos entre varias instancias de la API.
- Renovar la sesión, "recordarme" más de 16 horas y cerrar sesión en todos los dispositivos.
- Funciones de las áreas Mozo, Caja, Administración y Cocina (fases siguientes).
- Autenticación de Socket.IO (llega con el primer evento).
- Redirigir automáticamente la página de inicio (/) a /login.
- Rechazar PIN fáciles (1234, 0000, 1111): ver la pregunta 7.
- Varios roles por usuario.
- Generar tipos con openapi-typescript.

## 15. Supuestos

| ID | Supuesto |
| --- | --- |
| S-003-01 | La sesión es un token aleatorio cuyo hash se guarda en la base (tabla sessions), no un JWT firmado; no hay SESSION_SECRET. |
| S-003-02 | La sesión dura 16 horas fijas desde que se inicia, sin renovación. |
| S-003-03 | El PIN tiene de 4 a 6 dígitos, con botón Entrar (no entra solo al completar). |
| S-003-04 | Cada usuario tiene un solo rol, y el administrador puede entrar a las áreas de mozo, caja y cocina. |
| S-003-05 | Un usuario de cocina puede iniciar sesión y ve /cocina con un aviso, sin funciones. |
| S-003-06 | La pantalla de inicio muestra la lista de usuarios activos (nombre para mostrar y nombre de usuario) sin sesión. |
| S-003-07 | 5 intentos fallidos seguidos bloquean al usuario 15 minutos; después, cada fallo lo vuelve a bloquear; un acierto borra el conteo. Los usuarios inexistentes no se cuentan. |
| S-003-08 | La cookie no lleva Secure porque el local usa HTTP en la red. |
| S-003-09 | El mensaje de error es el mismo para usuario inexistente, inactivo o PIN incorrecto. |
| S-003-10 | `pnpm users:create-admin` crea un administrador cada vez que se ejecuta (también sirve para recuperar el acceso). |
| S-003-11 | Cada dispositivo recuerda el último usuario que entró y abre su teclado de PIN. |
| S-003-12 | La API corre en un solo proceso; los conteos de intentos viven en su memoria y se borran al reiniciarla. |

## 16. Preguntas abiertas para el usuario

Ninguna bloquea el inicio de las pruebas si se acepta la recomendación. Las marcadas (dueño) conviene confirmarlas con el dueño de la pollería más adelante; las demás son técnicas.

1. (técnica) ¿Apruebas guardar la sesión en la base con un token aleatorio en lugar de un JWT firmado (S-003-01)? Recomendado: sí. Evita la variable SESSION_SECRET (tu apps/api/.env no cambia), cerrar sesión la invalida de verdad y no suma librerías. Si prefieres JWT, se agrega SESSION_SECRET y cambian AC-04 y AC-07 de la 001.
2. (dueño) Largo del PIN: ¿de 4 a 6 dígitos con botón Entrar (recomendado, S-003-03; el administrador puede usar 6 para más seguridad) o 4 dígitos fijos que entran solos al completar (un toque menos)?
3. (dueño) ¿Cada persona tiene un solo rol, y el dueño (administrador) puede usar también las pantallas de mozo y caja (recomendado, S-003-04)? Si alguien es mozo y cajero a la vez, por ahora tendría dos usuarios.
4. (dueño) ¿Está bien que la pantalla de inicio muestre los nombres de los trabajadores activos para tocar el suyo (recomendado, S-003-06, más rápido), o prefieres que cada uno escriba su nombre de usuario?
5. (dueño) ¿5 intentos fallidos y 15 minutos de bloqueo te parecen bien (S-003-07)? La alternativa más blanda es 10 intentos y 5 minutos.
6. (dueño) ¿La sesión debe durar 16 horas, un día de trabajo (S-003-02)? Alternativa: cerrar todas las sesiones a una hora fija (por ejemplo 4:00 a. m.).
7. (dueño) ¿Rechazamos PIN fáciles de adivinar como 1234, 0000 o 1111? Recomendado para la 004 (cuando los usuarios se creen desde la web), no ahora.
8. (técnica) ¿Un usuario de cocina puede entrar y ver una pantalla sin funciones (recomendado, S-003-05), o no debe poder iniciar sesión hasta que la cocina tenga pantalla?
9. (técnica) ¿Apruebas la dependencia de soporte @types/bcrypt 6.0.0 y la instalación de bcrypt 6.0.0 con `ignoredBuiltDependencies` (ADR 0002)?

## 17. Acción del usuario y verificación manual

Acción en apps/api/.env: ninguna. No hay variables nuevas (D-003-13).

Después de que la funcionalidad esté implementada:
1. `pnpm install` (instala bcrypt).
2. `pnpm db:migrate`: debe decir 'Migración aplicada: 20261008120000-create-users.ts' y 'Migración aplicada: 20261008120100-create-sessions.ts' en polleria_dev.
3. En PowerShell: `pnpm users:create-admin`. Responder nombre de usuario (por ejemplo dueno), nombre para mostrar y el PIN dos veces. El PIN no se ve al escribirlo. Debe decir 'Administrador creado: dueno (...)'.
4. `pnpm dev` y abrir http://localhost:3000/login en la PC: tocar tu nombre, escribir el PIN y Entrar. Debe abrir /admin; desde ahí 'Ir a Mozo' e 'Ir a Caja'.
5. Escribir 5 veces un PIN incorrecto: el 6.º intento debe decir 'Demasiados intentos fallidos. Intenta de nuevo en 15 minutos.' (para salir del bloqueo antes, reiniciar `pnpm dev`).
6. 'Cerrar sesión' y abrir http://localhost:3000/admin: debe volver a /login.
7. Desde un celular en el mismo wifi (con WEB_ALLOWED_DEV_ORIGINS como en la 001): abrir http://<IP-de-la-PC>:3000/login, entrar y comprobar que el teclado se ve grande y que la próxima vez abre directo en tu PIN.
8. Para probar las pantallas de mozo y caja con su propio usuario hará falta la 004 (crear usuarios desde la web).

## 18. Notas para specs siguientes (no son alcance de esta)

- 004 (gestión de usuarios): endpoints solo para admin con requireRole('admin'); USERNAME_TAKEN por HTTP; desactivar y cambiar PIN deberían borrar las sesiones de ese usuario y su conteo de intentos; desbloqueo manual; decidir si se rechazan PIN fáciles (pregunta 7).
- Fase 2 (autorización con PIN de administrador): reutilizar PinHasher y un LoginLimiter propio (otra instancia) para no mezclar los intentos de autorización con los de inicio de sesión; registrar quién autorizó (RF-27 en la Fase 6).
- Socket.IO: validar la cookie polleria_session en el handshake con SessionService.resolveSession.
- Cada endpoint nuevo declara en su spec los roles de requireRole y suma pruebas 401 y 403 (adversarial-tester.md, "cada endpoint con cada rol").
