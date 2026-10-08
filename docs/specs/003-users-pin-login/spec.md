# Spec 003 — Usuarios, roles e inicio de sesión con PIN

- Estado: Borrador
- Revisión 1 (2026-10-08): varios roles por persona. Resumen en la sección 19.
- Fase: 1 (Usuarios y carta)
- Rama: feat/003-users-pin-login
- Fecha: 2026-10-08
- Cubre: RF-01 (iniciar sesión con usuario y PIN y ver solo las funciones del rol), RNF-09 en su primera parte (cada usuario accede con su propio PIN; la autorización de acciones sensibles con PIN de administrador es de la Fase 2) y RNF-10 (los PIN se guardan cifrados con bcrypt). Aporta a RNF-01 y RNF-02 (entrar es tocar el nombre y escribir el PIN en un teclado grande) y a RNF-05 (todo funciona en la red local).
- Documentos relacionados: tasks.md (esta carpeta), docs/api/openapi.yaml (versión 0.3.1), docs/decisions/0002-sesion-pin-y-limite-de-intentos.md (ADR, Aceptado), docs/specs/001-base-monorepo/spec.md y docs/specs/002-printer-service/spec.md (convenciones que se mantienen: D-01, D-02, D-05, D-07, D-10, D-12, D-13, formato de error y ERROR_CODES).

## 1. Contexto

Hoy cualquiera puede tomar un pedido o cobrar sin dejar rastro. Para que el sistema sepa quién hace cada cosa, cada trabajador entra con su propio PIN y ve solo las pantallas de sus roles: el mozo ve la pantalla de mozo en su celular, el cajero la de caja en la PC y el dueño la de administración. Una persona puede tener varios roles (por ejemplo, un mozo que también cobra) y pasar de un área a otra sin cerrar sesión. Esta funcionalidad crea los usuarios en la base, el inicio y cierre de sesión, el bloqueo de quien prueba PIN al azar, las protecciones de la API por rol y un comando para crear la primera cuenta de administrador. Las pantallas de cada rol quedan listas pero vacías: las llenan las fases siguientes.

## 2. Historias de usuario

| ID | Historia |
| --- | --- |
| HU-003-01 | Como mozo, quiero entrar al sistema desde mi celular tocando mi nombre y escribiendo mi PIN en un teclado grande, para empezar a atender en segundos. |
| HU-003-02 | Como cajero, quiero entrar con mi PIN en la PC de caja y ver solo la pantalla de caja, para no tocar funciones que no me corresponden. |
| HU-003-03 | Como administrador (dueño), quiero que cada trabajador entre con su propio PIN y que el sistema le muestre solo lo de sus roles, para saber quién hace qué y que un mozo no pueda cobrar ni cambiar precios. |
| HU-003-04 | Como administrador, quiero crear mi cuenta de administrador la primera vez con un comando en la PC del local, sin que mi PIN quede escrito en ningún archivo, para empezar a usar el sistema de forma segura. |
| HU-003-05 | Como administrador, quiero que los PIN se guarden cifrados y que quien prueba PIN al azar quede bloqueado un rato, para que nadie entre con la cuenta de otro. |
| HU-003-06 | Como trabajador, quiero cerrar sesión al terminar mi turno y que la sesión termine sola después de un día de trabajo, para que nadie use mi cuenta en un celular o una PC compartida. |
| HU-003-07 | Como mozo que también cobra en caja, quiero entrar con un solo usuario y PIN, elegir dónde voy a trabajar y pasar de la pantalla de mozo a la de caja sin cerrar sesión, para atender y cobrar sin perder tiempo. (Revisión 1) |

## 3. Decisiones técnicas

Las que no confirmó el usuario están marcadas como SUPUESTO y repetidas en Preguntas abiertas (sección 16).

**D-003-01. Sesión guardada en la base, no JWT (SUPUESTO S-003-01).**
- Al iniciar sesión, la API genera un token aleatorio de 32 bytes (`randomBytes(32)` de node:crypto, en base64url: 43 caracteres) y lo envía en una cookie httpOnly. En la base solo guarda el SHA-256 del token (64 caracteres hexadecimales), en la tabla sessions. Una copia de la base no permite entrar: el hash no sirve como cookie.
- En cada solicitud protegida, requireAuth calcula el SHA-256 de la cookie, busca la sesión vigente y carga al usuario en la misma consulta. Así los roles y el estado activo se leen siempre de la base: si el administrador desactiva a alguien o le cambia los roles, vale desde la siguiente solicitud.
- Por qué no JWT (lo que mencionan backend-dev.md y la nota de D-01 de la 001):
  - Como requireAuth igual debe leer al usuario en la base en cada solicitud (activo y roles al día), un JWT no ahorra la consulta.
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
| FORBIDDEN | 403 | No tienes permiso para realizar esta acción. | null | Sesión válida, pero ninguno de los roles del usuario está entre los permitidos (requireRole). |
| TOO_MANY_ATTEMPTS | 429 | Demasiados intentos fallidos. Espera unos minutos e intenta de nuevo. | `{ retryAfterSeconds }` | Usuario bloqueado (D-003-05). Además lleva la cabecera `Retry-After` con los mismos segundos. |
| USERNAME_TAKEN | 409 | Ese nombre de usuario ya existe. | null | Crear un usuario con un nombre de usuario que ya existe. En esta spec solo lo usa el comando del administrador; la 004 lo expondrá por HTTP. |

- Un solo código para todo problema de sesión (UNAUTHENTICATED): la web hace lo mismo en todos los casos (volver a /login) y la API no revela si el token existió.
- Los cinco se suman a ERROR_CODES de @polleria/shared. Ningún 4xx se registra en el log (RN-001-07).
- `retryAfterSeconds` es un entero de 1 a 900: los milisegundos que faltan, redondeados hacia arriba a segundos.

**D-003-07. Roles y áreas (S-003-04 y S-003-05; revisión 1: varios roles por persona).**
- Cuatro roles, según el glosario: `waiter` (mozo), `kitchen` (cocina), `cashier` (cajero) y `admin` (administrador). Cada usuario tiene uno o varios roles, sin repetir (D-003-15).
- Áreas de la web, en el orden en que se muestran, y roles que entran (basta con tener uno de ellos):

  | Área | Ruta | Roles |
  | --- | --- | --- |
  | Mozo | /mozo | waiter, admin |
  | Caja | /caja | cashier, admin |
  | Cocina | /cocina | kitchen, admin |
  | Administración | /admin | admin |

- El administrador (el dueño) entra a todas las áreas, porque en una pollería pequeña suele cubrir cualquier puesto (confirmado por el usuario el 2026-10-08). Al iniciar sesión, cada persona va al destino que define D-003-16 (directo a su área si tiene una sola).
- La cocina no tiene pantalla en el prototipo (imprime comandas, docs/planificacion.md). Si un usuario de cocina entra, ve /cocina con un aviso y el botón Cerrar sesión. Así el modelo de roles es uniforme y la Fase 3 o una fase posterior puede darle funciones sin cambiar el inicio de sesión.
- En la API, cada spec siguiente declara qué roles llaman a cada endpoint con requireRole. En esta spec no hay endpoints por rol: requireRole se prueba con una app de prueba (AC-23).

**D-003-08. Pantalla de inicio con lista de usuarios (SUPUESTOS S-003-06 y S-003-11).**
- /login muestra un botón por cada usuario activo (nombre para mostrar y, debajo, el nombre de usuario). Se toca el nombre y aparece el teclado de PIN.
- Por qué lista y no escribir el usuario:
  - RNF-01 y RNF-02: tocar un nombre es un toque; escribir "mozo.juan" en el teclado del celular toma varios segundos y falla con mayúsculas automáticas y autocorrector.
  - Una pollería tiene pocos trabajadores (menos de 20); la lista cabe en una pantalla.
- Riesgo aceptado: GET /api/auth/users es público y muestra el nombre para mostrar y el nombre de usuario de los activos a cualquiera conectado al wifi. No muestra roles, id, inactivos ni nada del PIN. Conocer el nombre de usuario no permite entrar: el límite de intentos (D-003-05) es lo que protege. Si el dueño no quiere mostrar los nombres, la alternativa es escribir el usuario (pregunta 4).
- El dispositivo recuerda el último usuario que entró (solo su nombre de usuario, en localStorage) y abre directo su teclado de PIN, con un botón "Cambiar usuario". En el celular de un mozo, entrar es escribir el PIN.

**D-003-09. requireAuth y requireRole.**
- `requireAuth` (creado con `createRequireAuth({ sessionService })`) lee la cookie, resuelve la sesión y deja en `res.locals.auth` el contexto `{ sessionId, user, expiresAt }` (se lee con `getAuthContext(res)`). Si no hay sesión válida, responde 401 UNAUTHENTICATED.
- `requireRole(...roles)` va siempre después de requireAuth. Deja pasar si el usuario tiene al menos uno de los roles de la lista (`hasAnyRole` de shared); si no tiene ninguno, 403 FORBIDDEN. Ser administrador no da paso por sí solo: cada ruta que lo permite incluye 'admin' en la lista, como las áreas de D-003-07. Los roles se leen de la base en cada solicitud, así que un cambio de roles vale desde la siguiente (AC-23). Si se usa sin requireAuth antes (no hay contexto), responde 401, nunca 500 ni 200. Llamarlo sin roles es un error de programación: lanza al crear la ruta (`'requireRole necesita al menos un rol.'`).
- Rutas públicas: /api/health (RN-001-06), /api/auth/users, /api/auth/login y /api/auth/logout. Toda otra ruta de /api, en esta y en las specs siguientes, pasa por requireAuth y, si su AC lo dice, por requireRole.

**D-003-10. Primer administrador con un comando interactivo (SUPUESTO S-003-10).**
- `pnpm users:create-admin` pregunta el nombre de usuario, el nombre para mostrar, el PIN y la repetición del PIN, y crea un usuario activo con un solo rol, `admin`. El PIN nunca va como argumento (quedaría en el historial de la terminal) ni en una variable de entorno o archivo (quedaría en el disco).
- Si la entrada es una terminal (PowerShell, Símbolo del sistema), el PIN no se ve mientras se escribe. Si no es una terminal (entrada por tubería, como en las pruebas, o Git Bash, que en Windows no entrega una terminal real a Node), lee las respuestas línea por línea y escribe en stderr un aviso de que el PIN se verá al escribirlo.
- Verificado en el código de pnpm 10.12.1: con `--filter` y un solo paquete, el script hereda la terminal (stdio "inherit"), así que el script de la raíz funciona igual que ejecutarlo en apps/api.
- Se puede ejecutar cuando sea, no solo la primera vez: sirve también para recuperar el acceso si el dueño olvida su PIN (crea otro administrador). Quien puede ejecutar comandos en la PC del local ya tiene acceso total a la base, así que no abre una puerta nueva.
- Valida cada respuesta apenas la recibe y se detiene en el primer error, con código de salida 1 y sin crear nada. Revisa si el nombre de usuario ya existe antes de pedir el PIN.
- Los datos de demostración (mozos de ejemplo) son de la Fase 6 y la gestión de usuarios desde la web es de la 004: este comando solo crea administradores.
- Revisión 1: el comando no pregunta por otros roles (SUPUESTO S-003-16). Para los permisos no hace falta, porque el administrador ya entra a todas las áreas; si el dueño quiere figurar también como mozo o cajero (por ejemplo, en reportes por mozo de fases siguientes), se lo agrega la gestión de usuarios de la 004. Así el comando sigue siendo una herramienta corta de arranque y de recuperación, con las mismas cuatro preguntas.

**D-003-11. Modelos de Sequelize por instancia.**
- `defineModels(sequelize)` define los modelos User y Session con `sequelize.define` sobre la instancia recibida (no con clases y `Model.init` estático). Así cada instancia de Sequelize (la de la API, la de cada prueba, la del comando) tiene sus propios modelos, sin compartir estado entre ellas. También evita el problema conocido de los campos de clase públicos que tapan los getters de Sequelize, y no requiere decoradores, que el type stripping no permite (D-02 de la 001).
- Las pruebas crean usuarios con el servicio de usuarios (`createUserService`) y revisan la base con SQL; no dependen de los modelos.

**D-003-12. Web: guardia en el cliente y cliente HTTP central.**
- La seguridad vive en la API. La web solo decide qué pantalla mostrar: cada página de área envuelve su contenido en `RoleGuard`, que consulta GET /api/auth/me con TanStack Query (clave `['auth', 'me']`, `retry: false`). No se usa el proxy (middleware) de Next.
- Todas las llamadas a la API pasan por un cliente central (`apps/web/src/lib/api/client.ts`): mismo origen, JSON, tiempo límite de 10 s, errores como `ApiError`. Ante un 401 UNAUTHENTICATED llama a un manejador que, por defecto, recarga la página en /login con `hardNavigate` (salvo que ya esté en /login o que la llamada pida `skipAuthRedirect`). El health de la 001 sigue con su propia función (getServerStatus).
- Cerrar sesión y la sesión vencida recargan la página completa (`window.location.assign` dentro de `hardNavigate`), no una navegación interna: así se borra de la memoria todo lo que veía el usuario anterior, importante en la PC de caja compartida.
- Al iniciar sesión, la navegación al destino de D-003-16 es interna (`useRouter().replace` de next/navigation). Cambiar de área también es una navegación interna: la sesión es la misma.
- El tipado viene de los esquemas Zod de @polleria/shared. openapi-typescript sigue diferido: la 7.13.0 todavía declara `typescript ^5.x` (ADR 0002).

**D-003-13. Sin variables de entorno nuevas.**
- Nada de esta spec se configura por .env: CONFIG_VARIABLES sigue con las 7 variables de la 002 y apps/api/.env.example no cambia. AC-04 y AC-07 de la 001 y AC-02 y AC-05 de la 002 no cambian, y el apps/api/.env del usuario sigue sirviendo tal cual.
- Duración de la sesión, límite de intentos y costo de bcrypt son constantes exportadas (sección 11). Cambiarlas es un cambio de spec.

**D-003-14. Primera migración de dominio.**
- Dos migraciones nuevas en apps/api/src/db/migrations: `20261008120000-create-users.ts` y `20261008120100-create-sessions.ts` (umzug, D-05 de la 001), con `down` que borra la tabla. Las restricciones viven también en la base (CHECK, UNIQUE, FOREIGN KEY), no solo en Zod.
- Claves primarias enteras autoincrementales (`id` INTEGER). Las specs siguientes siguen la misma convención.
- Consecuencia para las pruebas: el helper resetMigrationTables (apps/api/tests/helpers/test-database.ts) debe borrar también sessions y users antes de las tablas de registro de umzug; si no, volver a migrar falla con "la tabla ya existe" (AC-21 y AC-24 de la 001). Lo ajusta el test-writer (sección 12).

**D-003-15. Varios roles por persona: columna `roles` de tipo arreglo (revisión 1).**
- Decisión del usuario (2026-10-08): una persona puede tener varios roles, por ejemplo un mozo que también cobra en caja. Reemplaza "un rol por usuario" (S-003-04 original).
- La tabla users cambia la columna `role` por `roles VARCHAR(16)[] NOT NULL`, con tres restricciones CHECK (sección 8.1): no vacío y de una sola dimensión; solo waiter, kitchen, cashier y admin (sin NULL); sin roles repetidos.
- Verificado en PostgreSQL 17.5 con una tabla temporal: '{}' viola users_roles_not_empty; '{chef}', '{Waiter}', '{waiter,NULL}' y '{NULL}' violan users_roles_allowed; '{waiter,waiter}' viola users_roles_no_duplicates; un arreglo de dos dimensiones falla con un error de la base; '{cashier,waiter}' y los cuatro roles se aceptan. Sequelize 6.37.8 con `DataTypes.ARRAY(DataTypes.STRING(16))` guarda y lee el arreglo como `string[]`, los CHECK llegan como SequelizeDatabaseError y `Op.contains` genera `roles @> ARRAY['admin']::VARCHAR(16)[]`.
- Por qué un arreglo y no una tabla user_roles:
  - Las tres reglas (al menos un rol, sin repetir, solo de la lista) quedan en la base con CHECK simples, como pide D-003-14. Con una tabla de unión, "al menos un rol" no se puede garantizar con un CHECK: haría falta un disparador diferido o confiar solo en el código.
  - requireAuth sigue leyendo la sesión y el usuario en una consulta de una sola fila, sin agrupar filas de roles.
  - Cambiar los roles de alguien (004) es un UPDATE de una fila, atómico; con una tabla de unión serían un DELETE y varios INSERT dentro de una transacción.
  - No agrega tabla ni migración: siguen las dos migraciones de D-003-14 y el helper de limpieza de la sección 12 no cambia.
  - Costo aceptado: el arreglo es propio de PostgreSQL (el proyecto usa solo PostgreSQL) y las consultas por rol usan `@>` en lugar de un JOIN. Con menos de 20 usuarios no hace falta índice.
  - D-10 de la 001 se cumple: no hay tabla nueva y la columna va en snake_case dentro de users.
- Orden estable: la API siempre devuelve los roles en el orden de `USER_ROLES` (waiter, kitchen, cashier, admin), sin importar cómo estén guardados. `userRolesSchema` los deja en ese orden al validar (así guarda createUser) y la API los vuelve a ordenar al leer (`sortUserRoles`), porque la base no exige un orden (un UPDATE manual puede guardarlos en otro).
- admin junto con otros roles se permite y se guarda tal cual, sin normalizar (SUPUESTO S-003-13). Hoy no cambia ningún permiso (el administrador ya entra a todas las áreas), pero conserva la información: si el dueño también atiende mesas, las fases siguientes pueden contarlo como mozo, y si un día deja de ser administrador, conserva sus otros roles. Rechazar la combinación agregaría un error sin beneficio y normalizarla borraría datos.

**D-003-16. Áreas permitidas, destino al entrar y cambio de área (revisión 1).**
- Áreas permitidas de un usuario (`getAllowedAreas`): las áreas de D-003-07 cuyos roles incluyen al menos uno de los suyos, siempre en el orden Mozo, Caja, Cocina, Administración.

  | Roles del usuario | Áreas permitidas |
  | --- | --- |
  | waiter | Mozo |
  | cashier | Caja |
  | kitchen | Cocina |
  | waiter + cashier | Mozo, Caja |
  | waiter + kitchen | Mozo, Cocina |
  | kitchen + cashier | Caja, Cocina |
  | waiter + kitchen + cashier | Mozo, Caja, Cocina |
  | admin (solo o con otros roles) | Mozo, Caja, Cocina, Administración |

- Destino (`resolveLandingPath`). Se usa al iniciar sesión, al abrir /login con una sesión abierta y cuando alguien abre un área que no le corresponde:
  1. Si tiene una sola área permitida, va directo a ella (igual que antes de la revisión).
  2. Si tiene varias y el dispositivo recuerda una última área que está entre sus permitidas, va directo a ella.
  3. Si no, va a la pantalla "¿Dónde vas a trabajar?" (/areas), con un botón grande por área permitida.
- El dispositivo recuerda la última área que se abrió en él, de cualquier usuario (localStorage, clave 'polleria:lastArea'): se guarda cada vez que un área se muestra. Así el dispositivo funciona como un puesto de trabajo: en la PC de caja, quien también es cajero entra directo a Caja; en el celular del mozo, a Mozo (SUPUESTO S-003-14). Si localStorage falla o guarda algo que no es un área, se ignora y se usa la pantalla de áreas.
- Por qué así (RNF-01): quien tiene un solo rol, que es la mayoría, no ve ningún paso nuevo. Quien tiene varios elige una vez por dispositivo; después, entrar sigue siendo tocar el nombre y escribir el PIN.
- El administrador tiene las cuatro áreas: la primera vez en cada dispositivo elige en /areas y después el dispositivo recuerda la última (SUPUESTO S-003-15). Antes de la revisión entraba siempre a /admin.
- Cambiar de área sin cerrar sesión: si el usuario tiene más de un área permitida, la barra superior de cada área muestra el enlace 'Cambiar de área', que abre /areas. Es un solo enlace (y no un botón por área ni un menú desplegable) porque en la barra de un celular de 360 px no caben tres botones más, y la pantalla de áreas ya tiene botones grandes. Son dos toques; cambiar de área es poco frecuente comparado con tomar pedidos.
- /areas nunca salta a la última área recordada (si lo hiciera, 'Cambiar de área' volvería al mismo lugar); solo salta cuando el usuario tiene una sola área permitida.
- La barra superior muestra todos los roles en el orden de la API: 'Juan · Mozo, Cajero'.

## 4. Criterios de aceptación

Cada AC tiene al menos una prueba cuyo nombre empieza con su ID. Como las specs 001 y 002 también usan AC-01, AC-02..., cada archivo de prueba de esta spec envuelve sus pruebas en un `describe` cuyo nombre empieza con `003:` (por ejemplo `describe('003: login limiter', ...)`), y las pruebas de esta spec van en archivos nuevos (las de la 001 que se ajustan se listan en la sección 12). Se indica el nivel y una ubicación sugerida; la ubicación exacta la decide el test-writer.

Datos comunes de las pruebas:
- `T0` = `2026-10-08T15:00:00.000Z` (10:00 en Lima). `T0 + 16 h` = `2026-10-09T07:00:00.000Z`.
- "La app" es `createApp({ sequelize, now, pinHasher })` sobre polleria_test con las migraciones reales aplicadas y las tablas users y sessions vacías al empezar cada prueba. `now` es un reloj que la prueba controla (por ejemplo `() => current`); si el AC no lo menciona, `() => T0`.
- Los usuarios se crean con `createUserService({ models: defineModels(sequelize), pinHasher })`. Para que las pruebas sean rápidas pueden usar `createBcryptPinHasher({ cost: 4 })` en la app y en el servicio, salvo donde el AC exige el costo 10.
- "Espía de verify": un PinHasher que envuelve al real y cuenta las llamadas a `verify`.
- Roles (revisión 1): "el mozo mozo.juan" o "(…, waiter)" es un usuario con `roles: ['waiter']`. Las combinaciones se escriben con +: "waiter+cashier" es `roles: ['waiter', 'cashier']`. En SQL, los roles se escriben como arreglo: `UPDATE users SET roles = '{cashier,waiter}'`.
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
- sessionResponseSchema acepta `{ user: { id: 1, username: 'mozo.juan', displayName: 'Juan', roles: ['waiter'] }, expiresAt: '2026-10-09T07:00:00.000Z' }`; con `roles: ['cashier', 'waiter']` también lo acepta y devuelve `roles: ['waiter', 'cashier']`; y rechaza: user con `pinHash` o cualquier propiedad de más (también `role: 'waiter'` junto a roles), user con `role: 'waiter'` en lugar de roles, roles `[]`, `['chef']` o `['waiter', 'waiter']`, id 0, -1, 1.5 o '1', expiresAt '2026-10-09T02:00:00.000-05:00' (sin Z) y una propiedad de más en la raíz;
- loginUsersResponseSchema acepta `{ users: [] }` y `{ users: [{ username: 'mozo.juan', displayName: 'Juan' }] }`, y rechaza un elemento con roles, role o id de más;
- ERROR_CODES contiene INVALID_CREDENTIALS, UNAUTHENTICATED, FORBIDDEN, TOO_MANY_ATTEMPTS y USERNAME_TAKEN, cada uno con un valor igual a su nombre, además de los 7 de la 001;
- y errorResponseSchema acepta `{ error: { code: 'TOO_MANY_ATTEMPTS', message: 'Demasiados intentos fallidos. Espera unos minutos e intenta de nuevo.', details: { retryAfterSeconds: 900 } } }`.

**AC-40. Conjunto de roles** (unitaria, packages/shared; nuevo en la revisión 1)
- Dado `userRolesSchema`, `sortUserRoles` y `hasAnyRole` exportados por '@polleria/shared',
- userRolesSchema acepta `['waiter']`, `['admin']`, `['waiter', 'cashier']` y los cuatro roles, y devuelve los roles en el orden de USER_ROLES: `['admin', 'waiter']` da `['waiter', 'admin']` y `['admin', 'cashier', 'kitchen', 'waiter']` da `['waiter', 'kitchen', 'cashier', 'admin']`, sin modificar el arreglo recibido;
- rechaza `[]` con el mensaje 'Elige al menos un rol.'; `['waiter', 'waiter']` y `['cashier', 'waiter', 'cashier']` con el mensaje 'No repitas un rol.'; y rechaza también `['chef']`, `['Admin']`, `['waiter', null]`, 'waiter' (texto), null y undefined;
- `sortUserRoles(['admin', 'kitchen'])` devuelve `['kitchen', 'admin']` en un arreglo nuevo (el recibido no cambia);
- y `hasAnyRole(['waiter', 'cashier'], ['cashier', 'admin'])` es true; `hasAnyRole(['waiter'], ['cashier', 'admin'])` es false; `hasAnyRole(['admin'], ['waiter'])` es false (ser administrador no da permiso por sí solo: cada ruta lo incluye en su lista); y `hasAnyRole(['waiter'], [])` es false.

### 4.2 Base de datos (migraciones reales sobre polleria_test)

**AC-05. Tabla users** (integración, apps/api)
- Dado polleria_test con `migrateUp(sequelize)` aplicado,
- entonces information_schema muestra la tabla users con: id integer (clave primaria y autoincremental: SERIAL o IDENTITY), username character varying(32), display_name character varying(40), pin_hash character varying(60), roles (arreglo: en information_schema.columns, data_type 'ARRAY' y udt_name '_varchar'; `format_type(atttypid, atttypmod)` de pg_attribute da 'character varying(16)[]'), is_active boolean, created_at y updated_at timestamp with time zone, todas NOT NULL; y no existe una columna role;
- y un `INSERT` con solo username 'mozo.juan', display_name 'Juan', pin_hash de 60 caracteres y roles '{waiter}' funciona y deja is_active true y created_at y updated_at con fecha; y también funcionan (con otros username) roles '{cashier,waiter}' (la base no exige un orden) y '{waiter,kitchen,cashier,admin}';
- y cada uno de estos INSERT falla con un error de la base y no deja fila: username repetido; username 'Mozo.juan' (mayúsculas); username 'ab' o 'juan perez' (no cumple el patrón); roles '{}', '{chef}', '{Waiter}', '{waiter,waiter}', '{waiter,NULL}' o '{{waiter},{cashier}}' (dos dimensiones); display_name '' o ' Juan' (espacio al inicio); pin_hash de 59 o de 61 caracteres; y cualquiera de username, display_name, pin_hash o roles en NULL.

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
- Dado la app y estos usuarios: zoila ('Zoila', waiter), ana ('ana', cashier+waiter), angel ('Ángel', admin), beto ('Beto', kitchen), juan.q ('juan', waiter), juan.p ('Juan', waiter) e inactivo ('Inactivo', waiter, desactivado con SQL),
- cuando se hace `GET /api/auth/users` sin cookie,
- entonces responde 200 con `Cache-Control: no-store` y exactamente `{ users: [{ username: 'ana', displayName: 'ana' }, { username: 'angel', displayName: 'Ángel' }, { username: 'beto', displayName: 'Beto' }, { username: 'juan.p', displayName: 'Juan' }, { username: 'juan.q', displayName: 'juan' }, { username: 'zoila', displayName: 'Zoila' }] }`: solo activos, ordenados por nombre para mostrar en español sin distinguir mayúsculas ni tildes, y los empates por nombre de usuario; ana, con dos roles, aparece una sola vez; cada elemento tiene exactamente las claves username y displayName y el cuerpo cumple loginUsersResponseSchema;
- y sin usuarios responde `{ users: [] }`;
- y `GET /api/health` sigue respondiendo sin cookie (RN-001-06).

**AC-13. Inicio de sesión correcto** (integración)
- Dado la app con `now` en T0 y el mozo mozo.juan ('Juan', waiter, PIN '2468') creado con el hasher por defecto,
- cuando se hace `POST /api/auth/login` con `{ "username": "  MOZO.Juan ", "pin": "2468" }`,
- entonces responde 200 con `Cache-Control: no-store` y el cuerpo `{ user: { id: <id del usuario>, username: 'mozo.juan', displayName: 'Juan', roles: ['waiter'] }, expiresAt: '2026-10-09T07:00:00.000Z' }`, que cumple sessionResponseSchema;
- y trae una sola cabecera Set-Cookie para `polleria_session`, cuyo valor cumple SESSION_TOKEN_PATTERN, con los atributos HttpOnly, `SameSite=Strict`, `Path=/` y `Max-Age=57600`, y sin `Secure` ni `Domain`;
- y la tabla sessions tiene una sola fila, con user_id del usuario, token_hash igual a `hashSessionToken(<valor de la cookie>)` y expires_at igual a T0 + 16 h; ninguna columna guarda el valor de la cookie;
- y `SESSION_DURATION_MS` es 57600000;
- y (revisión 1, en una prueba aparte) la moza moza.caja ('Rosa', waiter+cashier, PIN '1357'), cuyos roles se cambian con SQL a '{cashier,waiter}' antes del login, inicia sesión con 200 y recibe `user.roles` igual a `['waiter', 'cashier']` (orden de USER_ROLES).

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
- cuando se ejecuta con SQL `UPDATE users SET roles = '{cashier,waiter}', display_name = 'Juan Pérez'`, entonces `GET /api/auth/me` responde 200 con `roles: ['waiter', 'cashier']` (en el orden de USER_ROLES, aunque la base los guarde en otro) y displayName 'Juan Pérez';
- cuando luego se ejecuta `UPDATE users SET roles = '{admin}'`, entonces responde 200 con `roles: ['admin']`;
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
  - un manejador final que responde 200 con `{ userId, roles, sessionId }` leídos de `getAuthContext(res)`;
  - y `errorHandler` de la 001;
- donde `requireAuth = createRequireAuth({ sessionService })`, `sessionService = createSessionService({ models: defineModels(sequelize), now })`, y las cookies salen de `sessionService.createSession(userId)` para seis usuarios: waiter, kitchen, cashier, admin, waiter+cashier y admin+waiter, con console.error espiado,
- entonces `/solo-admin` responde 401 UNAUTHENTICATED sin cookie; 403 con exactamente `{ error: { code: 'FORBIDDEN', message: 'No tienes permiso para realizar esta acción.', details: null } }` para waiter, kitchen, cashier y waiter+cashier; 200 para admin con el userId, `roles: ['admin']` y el sessionId de esa sesión; y 200 para admin+waiter con `roles: ['waiter', 'admin']`;
- `/caja` responde 200 para cashier, admin, waiter+cashier y admin+waiter (basta con uno de los roles pedidos) y 403 para waiter y kitchen;
- `/sin-auth` responde 401 UNAUTHENTICATED aun con la cookie del admin (nunca 200 ni 500);
- los cambios de roles valen desde la siguiente solicitud (en una prueba aparte): con la cookie del waiter, `/caja` responde 403; después de `UPDATE users SET roles = '{waiter,cashier}'` para ese usuario, la misma cookie recibe 200 con `roles: ['waiter', 'cashier']`; y después de `UPDATE users SET roles = '{waiter}'`, otra vez 403;
- `requireRole()` sin roles lanza de inmediato un Error con el mensaje 'requireRole necesita al menos un rol.';
- y console.error no se llamó.

**AC-24. Nada expone el PIN ni su hash** (integración)
- Dado la app, el administrador dueno ('Don Carlos', PIN '975310') y el mozo mozo.juan (PIN '2468'),
- cuando se hacen `GET /api/auth/users`; `POST /api/auth/login` de dueno con '975310' (200), con '975311' (401) y con '97' (400 VALIDATION_ERROR); `GET /api/auth/me` con la cookie (200) y sin cookie (401); `POST /api/auth/logout` (204); y un 6.º intento de mozo.juan después de 5 PIN incorrectos (429),
- entonces ni el cuerpo ni las cabeceras de ninguna de esas respuestas contienen '975310', '$2b$', el pin_hash guardado de dueno, 'pinHash' ni 'pin_hash';
- y todas llevan `Cache-Control: no-store`.

**AC-25. Servicio de usuarios** (integración, apps/api/src/services/users/user.service.ts)
- Dado `createUserService({ models: defineModels(sequelize), pinHasher: createBcryptPinHasher() })` sobre polleria_test migrada,
- cuando `createUser({ username: ' Dueno ', displayName: '  Don Carlos ', pin: '0007', roles: ['admin'] })`, entonces se resuelve con exactamente `{ id, username: 'dueno', displayName: 'Don Carlos', roles: ['admin'] }` (id entero positivo), y la fila tiene roles '{admin}', is_active true y un pin_hash que empieza con '$2b$10$' y que `verify('0007', pin_hash)` acepta;
- cuando se crea caja.mozo con `roles: ['cashier', 'waiter']`, entonces se resuelve con `roles: ['waiter', 'cashier']` y la fila guarda '{waiter,cashier}' (se guarda en el orden de USER_ROLES);
- cuando luego se crea otro con username 'DUENO' o 'dueno', entonces se rechaza con un AppError de code 'USERNAME_TAKEN', httpStatus 409 y message 'Ese nombre de usuario ya existe.', y sigue habiendo una sola fila con ese nombre;
- cuando la entrada no es válida (username 'ab', displayName '', pin '12', roles `[]`, `['chef']` o `['waiter', 'waiter']`, o sin roles), entonces se rechaza con un ZodError y no se crea nada;
- y dos `createUser` simultáneos con el mismo username terminan con uno resuelto y el otro rechazado con USERNAME_TAKEN (la garantía final es el índice único).

### 4.5 Comando del primer administrador (proceso real)

En estas pruebas el proceso es `node --disable-warning=ExperimentalWarning apps/api/src/create-admin.ts`, con el entorno copiado de process.env más NODE_ENV=test y DATABASE_URL igual a DATABASE_URL_TEST, la entrada estándar como tubería (la prueba escribe las líneas y la cierra) y un tiempo límite de 15 s.

**AC-26. Crea un administrador** (integración con proceso real)
- Dado polleria_test migrada y sin usuarios,
- cuando la entrada es `'Dueno\r\nDon Carlos\r\n975310\r\n975310\r\n'` (los finales CRLF se aceptan),
- entonces termina con código 0; stdout contiene la línea 'Administrador creado: dueno (Don Carlos).'; stderr contiene 'Aviso: esta terminal no puede ocultar el PIN. Para que no se vea al escribirlo, usa PowerShell o el Símbolo del sistema.' (la entrada no es una terminal); y ni stdout ni stderr contienen '975310';
- y users tiene una sola fila: username 'dueno', display_name 'Don Carlos', roles '{admin}' (solo ese rol), is_active true y un pin_hash que empieza con '$2b$10$' y acepta '975310';
- y con la app, `POST /api/auth/login` con dueno y '975310' responde 200 con `roles: ['admin']`;
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
- cuando responde 200, llama a `replace` con el destino de D-003-16: con localStorage sin área recordada, '/mozo' para waiter, '/caja' para cashier, '/cocina' para kitchen, y '/areas' para admin y para waiter+cashier; y con 'polleria:lastArea' igual a '/caja', '/caja' para waiter+cashier y para admin;
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
- Dado el default export de apps/web/src/app/mozo/page.tsx (áreas de D-003-07), con `window.location.pathname` en '/mozo' y localStorage vacío,
- mientras `GET /api/auth/me` no responde, un elemento con role="status" muestra 'Cargando...' y no se ve el encabezado 'Mozo';
- con 200 de un waiter, muestra el encabezado de nivel 1 'Mozo'; con 200 de un waiter+cashier, también;
- con 200 de un cashier, llama a `replace('/caja')` y el encabezado 'Mozo' nunca aparece;
- con 200 de un kitchen+cashier (dos áreas, ninguna es Mozo), llama a `replace('/areas')`; y si localStorage tiene 'polleria:lastArea' igual a '/cocina', llama a `replace('/cocina')`; en los dos casos el encabezado 'Mozo' nunca aparece;
- con 401 UNAUTHENTICATED, se llama a `hardNavigate('/login')` y el encabezado no aparece;
- y con un error de red, un elemento con role="alert" muestra 'No se pudo verificar tu sesión.' y un botón 'Reintentar' que, con la API ya respondiendo 200 de un waiter, muestra el encabezado 'Mozo'.

**AC-34. Pantallas por rol** (componente, páginas de área)
- Dado el default export de cada página, localStorage vacío y `GET /api/auth/me` respondiendo con la sesión indicada,
- entonces, con una sesión de un solo rol para cada rol permitido y con la sesión del ejemplo, muestra el encabezado de nivel 1 y el botón 'Cerrar sesión'; con la sesión del ejemplo muestra además la línea `<displayName> · <etiquetas de los roles>` (separadas por coma, en el orden de USER_ROLES); y con la sesión no permitida del ejemplo, llama a `replace(<destino>)` sin mostrar el encabezado:

  | Página | Roles permitidos | Encabezado | Sesión del ejemplo y línea | No permitido (ejemplo) |
  | --- | --- | --- | --- | --- |
  | app/mozo/page.tsx | waiter, admin | Mozo | Juan, waiter: 'Juan · Mozo' | kitchen: replace('/cocina') |
  | app/caja/page.tsx | cashier, admin | Caja | Ana, cashier+waiter: 'Ana · Mozo, Cajero' | waiter: replace('/mozo') |
  | app/cocina/page.tsx | kitchen, admin | Cocina | Beto, kitchen: 'Beto · Cocina' | waiter+cashier: replace('/areas') |
  | app/admin/page.tsx | admin | Administración | Carlos, admin: 'Carlos · Administrador' | cashier: replace('/caja') |

- y `ROLE_LABELS` es `{ waiter: 'Mozo', kitchen: 'Cocina', cashier: 'Cajero', admin: 'Administrador' }`.

**AC-35. Cerrar sesión desde la web** (componente, página /mozo)
- Dado la página /mozo con la sesión de un waiter,
- cuando se toca 'Cerrar sesión', entonces se hace exactamente un `POST /api/auth/logout` y luego `hardNavigate('/login')` una vez; mientras espera, el botón dice 'Cerrando sesión...' y está deshabilitado;
- y cuando el logout responde 500 o falla la red, un elemento con role="alert" muestra 'No se pudo cerrar la sesión. Intenta de nuevo.', hardNavigate no se llama y el botón vuelve a estar habilitado.

**AC-36. Enlace para iniciar sesión en Inicio** (componente, apps/web/src/app/page.tsx)
- Dado la página de inicio de la 001 dentro de Providers con la salud simulada en 200,
- entonces, además del encabezado 'Sistema Pollería' y del indicador 'Conectado' (AC-27 de la 001, sin cambios), muestra un enlace 'Iniciar sesión' con href '/login'.

**AC-41. Áreas permitidas y destino al entrar** (unitaria, apps/web/src/lib/auth/roles.ts y last-area.ts; nuevo en la revisión 1)
- Dado lo que exportan roles.ts y last-area.ts,
- entonces `AREA_PATHS` es `['/mozo', '/caja', '/cocina', '/admin']`; `AREA_LABELS` es `{ '/mozo': 'Mozo', '/caja': 'Caja', '/cocina': 'Cocina', '/admin': 'Administración' }`; `AREA_ALLOWED_ROLES` es `{ '/mozo': ['waiter', 'admin'], '/caja': ['cashier', 'admin'], '/cocina': ['kitchen', 'admin'], '/admin': ['admin'] }`; y `AREA_SELECTOR_PATH` es '/areas';
- `getAllowedAreas(roles)` devuelve lo de la tabla de D-003-16 como rutas y en ese orden: `['waiter']` da `['/mozo']`; `['kitchen']`, `['/cocina']`; `['cashier']`, `['/caja']`; `['waiter', 'cashier']` y también `['cashier', 'waiter']`, `['/mozo', '/caja']`; `['waiter', 'kitchen']`, `['/mozo', '/cocina']`; `['kitchen', 'cashier']`, `['/caja', '/cocina']`; `['waiter', 'kitchen', 'cashier']`, `['/mozo', '/caja', '/cocina']`; y `['admin']` y `['waiter', 'admin']`, las cuatro;
- `resolveLandingPath(roles, lastArea)` devuelve:

  | roles | lastArea | Resultado |
  | --- | --- | --- |
  | `['waiter']` | null | '/mozo' |
  | `['waiter']` | '/caja' | '/mozo' |
  | `['cashier']` | '/mozo' | '/caja' |
  | `['waiter', 'cashier']` | null | '/areas' |
  | `['waiter', 'cashier']` | '/caja' | '/caja' |
  | `['waiter', 'cashier']` | '/cocina' | '/areas' |
  | `['waiter', 'cashier']` | '/areas' | '/areas' |
  | `['admin']` | null | '/areas' |
  | `['admin']` | '/cocina' | '/cocina' |
  | `['admin']` | '/admin' | '/admin' |

- `formatRoleLabels(['cashier', 'waiter'])` es 'Mozo, Cajero' y `formatRoleLabels(['admin'])` es 'Administrador';
- `LAST_AREA_STORAGE_KEY` es 'polleria:lastArea'; después de `saveLastArea('/caja')`, localStorage guarda '/caja' en esa clave y `readLastArea()` devuelve '/caja';
- `readLastArea()` devuelve null si la clave no existe o guarda '/areas', '/login', 'caja' o '';
- y cuando localStorage lanza al leer, `readLastArea()` devuelve null, y cuando lanza al escribir, `saveLastArea('/mozo')` no lanza.

**AC-42. Pantalla "¿Dónde vas a trabajar?"** (componente, apps/web/src/app/areas/page.tsx; nuevo en la revisión 1)
- Dado el default export de app/areas/page.tsx, con `window.location.pathname` en '/areas' y localStorage vacío,
- mientras `GET /api/auth/me` no responde, un elemento con role="status" muestra 'Cargando...';
- con 200 de Ana (waiter+cashier), muestra el encabezado de nivel 1 '¿Dónde vas a trabajar?', la línea 'Ana · Mozo, Cajero', el botón 'Cerrar sesión' y, dentro de un elemento nav con nombre accesible 'Áreas', exactamente dos enlaces en este orden: 'Mozo' (href '/mozo') y 'Caja' (href '/caja'); y no llama a `replace`;
- con 200 de un admin, el nav 'Áreas' tiene exactamente cuatro enlaces en este orden: 'Mozo' ('/mozo'), 'Caja' ('/caja'), 'Cocina' ('/cocina') y 'Administración' ('/admin');
- con localStorage 'polleria:lastArea' igual a '/caja' y la sesión de Ana, muestra igual la pantalla y no llama a `replace` (esta pantalla no salta a la última área);
- con 200 de un waiter (una sola área), llama a `replace('/mozo')` y el encabezado '¿Dónde vas a trabajar?' nunca aparece;
- con 401 UNAUTHENTICATED, se llama a `hardNavigate('/login')`;
- y con un error de red, un elemento con role="alert" muestra 'No se pudo verificar tu sesión.' y un botón 'Reintentar' que, con la API ya respondiendo 200 de Ana, muestra el encabezado '¿Dónde vas a trabajar?'.

**AC-43. Cambiar de área y recordar la última** (componente, páginas de área; nuevo en la revisión 1)
- Dado el default export de las páginas de área y localStorage vacío,
- cuando /caja se muestra con una sesión waiter+cashier, tiene un enlace 'Cambiar de área' con href '/areas'; /admin con una sesión admin y /mozo con una sesión admin también lo tienen;
- cuando /mozo se muestra con una sesión waiter, o /cocina con una sesión kitchen (una sola área), no hay ningún enlace 'Cambiar de área';
- cuando un área se muestra (encabezado visible), localStorage guarda su ruta en 'polleria:lastArea': '/caja' después de mostrar /caja con waiter+cashier, y '/mozo' después de mostrar /mozo con waiter;
- cuando la sesión no tiene permiso para el área (por ejemplo /admin con un cashier), localStorage no guarda nada en 'polleria:lastArea';
- y cuando localStorage lanza al escribir, /caja se muestra igual con waiter+cashier (encabezado 'Caja' y enlace 'Cambiar de área').

### 4.7 Extremo a extremo (Playwright, contra polleria_test)

Antes de las pruebas, una preparación global (e2e/global-setup.ts) migra polleria_test, vacía users y sessions y crea con createUserService: e2e.mozo ('Mozo E2E', waiter, PIN '2468'), e2e.caja ('Caja E2E', cashier, '1357'), e2e.admin ('Admin E2E', admin, '135790') y (revisión 1) e2e.mozocaja ('Mozo Caja E2E', waiter+cashier, '8642'). Cada prueba usa un contexto de navegador nuevo (localStorage vacío).

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
- cuando luego se envía '135790', entonces la URL es /areas con el encabezado '¿Dónde vas a trabajar?' y los enlaces 'Mozo', 'Caja', 'Cocina' y 'Administración', en ese orden (el contexto es nuevo: no hay área recordada);
- cuando se toca 'Administración', la URL es /admin con el encabezado 'Administración';
- cuando se toca 'Cambiar de área' y luego 'Caja', se ve el encabezado 'Caja' en /caja;
- y la cookie `polleria_session` del contexto del navegador tiene httpOnly true, sameSite 'Strict' y secure false.

**AC-39. Teclado cómodo en el celular y todo en la red local** (E2E, mobile-chrome)
- Dado el proyecto mobile-chrome (360 px de ancho),
- en /login, cada botón de usuario y cada botón del teclado ('0' a '9', 'Borrar', 'Entrar') mide al menos 48 px de alto;
- en la lista, en el teclado y en /mozo después de entrar, `document.documentElement.scrollWidth` es menor o igual que `window.innerWidth`;
- y todas las solicitudes HTTP y WebSocket del navegador durante el inicio de sesión van a localhost:3100 (se ignoran data: y blob:).

**AC-44. Una persona con dos roles elige su área, cambia de área y el dispositivo recuerda la última** (E2E, desktop-chrome y mobile-chrome; nuevo en la revisión 1)
- Dado /login en un contexto nuevo,
- cuando se elige 'Mozo Caja E2E' y se envía el PIN '8642', entonces antes de 10 s la URL es /areas, con el encabezado '¿Dónde vas a trabajar?' y solo los enlaces de área 'Mozo' y 'Caja';
- cuando se toca 'Caja', la URL es /caja, con el encabezado 'Caja' y el texto 'Mozo Caja E2E · Mozo, Cajero';
- cuando se toca 'Cambiar de área' y luego 'Mozo', la URL es /mozo con el encabezado 'Mozo';
- cuando se toca 'Cerrar sesión' y, en /login (que abre directo el teclado de 'Mozo Caja E2E', AC-32), se envía otra vez '8642', entonces la URL es /mozo sin pasar por la pantalla de áreas (el dispositivo recordó la última área);
- y en mobile-chrome, cada enlace de área de /areas mide al menos 48 px de alto y en /areas `document.documentElement.scrollWidth` es menor o igual que `window.innerWidth`.

### 4.8 Cobertura de RF y RNF

| RF o RNF | AC y requisitos que lo cubren |
| --- | --- |
| RF-01 (usuario y PIN) | AC-13, AC-14, AC-29 a AC-31, AC-37, AC-38 |
| RF-01 (solo las funciones del rol; varios roles por persona en la revisión 1) | AC-05, AC-20, AC-23, AC-25, AC-40 (API y datos), AC-33, AC-34, AC-41 a AC-43 (web), AC-37, AC-38, AC-44 |
| RNF-09 (PIN propio por usuario) | AC-05, AC-13, AC-14, AC-16, AC-17, AC-25 a AC-27 |
| RNF-10 (PIN cifrados) | AC-05, AC-08, AC-13, AC-24, AC-25, AC-26 |
| RNF-01 y RNF-02 (rapidez, botones grandes) | AC-30, AC-32, AC-39, AC-41 (destino directo), AC-44 |
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
| R-003-08 | docs/api/openapi.yaml es OpenAPI 3.1 válido, versión 0.3.1 (revisión 1). | `npx -y @redocly/cli@latest lint docs/api/openapi.yaml` (desde una carpeta temporal) | "valid", sin errores (se aceptan advertencias como la respuesta Forbidden sin uso). |
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
- RN-003-01. Cada trabajador tiene su propio usuario y PIN. Un usuario tiene uno o varios roles, sin repetir, de esta lista: waiter, kitchen, cashier y admin (revisión 1). admin puede ir junto con otros roles.
- RN-003-02. El PIN tiene de 4 a 6 dígitos y se guarda solo como hash bcrypt de costo 10. Nunca se guarda, se registra, se muestra ni se devuelve.
- RN-003-03. Solo los usuarios activos inician sesión. La respuesta de un inicio de sesión fallido es la misma si el usuario no existe, si está inactivo o si el PIN es incorrecto.
- RN-003-04. 5 intentos fallidos seguidos bloquean al usuario 15 minutos; después, cada fallo lo vuelve a bloquear 15 minutos; un inicio de sesión exitoso borra el conteo.
- RN-003-05. Una sesión dura 16 horas desde que se inicia y se puede cerrar antes. Cerrar sesión cierra solo ese dispositivo. Un usuario puede tener varias sesiones a la vez.
- RN-003-06. Los roles y el estado activo se leen de la base en cada solicitud protegida: un cambio vale desde la siguiente solicitud.
- RN-003-07. Sin sesión válida, toda ruta protegida responde 401; con sesión válida pero sin ninguno de los roles requeridos, 403. Basta con tener uno de los roles requeridos.
- RN-003-08. Cada área de la web la ven solo quienes tienen alguno de sus roles; el administrador entra a todas. Quien tiene más de un área elige dónde trabajar y puede cambiar de área sin cerrar sesión.

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

Varios roles (revisión 1):
- Un usuario con los cuatro roles es válido: tiene las cuatro áreas, igual que un administrador.
- admin junto con otros roles: se guarda tal cual; los permisos son los mismos que con admin solo.
- Roles guardados en otro orden con SQL ('{cashier,waiter}'): la API los devuelve en el orden de USER_ROLES (['waiter', 'cashier']).
- Quitar todos los roles a alguien: la base lo rechaza (users_roles_not_empty). La 004 debe validar antes con userRolesSchema ('Elige al menos un rol.').
- Un arreglo guardado con SQL con un índice inicial distinto de 1 ('[0:0]={waiter}') pasa los CHECK (verificado); la API lo lee igual, como ['waiter']. Solo puede aparecer por SQL manual.
- Le quitan un rol mientras está en esa área: la API responde 403 desde la siguiente solicitud a una ruta de ese rol; la página lo nota en la siguiente consulta de /api/auth/me (por ejemplo, al volver a la pestaña) y lo lleva a su destino.
- La última área recordada no está entre las de quien entra (el dispositivo es compartido): si tiene una sola área va a ella; si tiene varias, elige en /areas.
- localStorage guarda en 'polleria:lastArea' algo que no es un área ('/areas', '/login', un texto cualquiera): se ignora.
- Alguien con varias áreas abre /areas a mano: ve la pantalla de áreas. Con una sola área, va a ella.
- En /areas no se muestra 'Cambiar de área' (ya es la pantalla para cambiar).

## 8. Modelo de datos

### 8.1 Tabla users (migración 20261008120000-create-users.ts)

| Columna | Tipo | Restricciones |
| --- | --- | --- |
| id | INTEGER | PRIMARY KEY, autoincremental (SERIAL o IDENTITY) |
| username | VARCHAR(32) | NOT NULL; UNIQUE (`users_username_unique`); CHECK `username ~ '^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$'` (ya en minúsculas: el patrón no admite mayúsculas) |
| display_name | VARCHAR(40) | NOT NULL; CHECK `display_name <> '' AND display_name = btrim(display_name)` |
| pin_hash | VARCHAR(60) | NOT NULL; CHECK `char_length(pin_hash) = 60` |
| roles | VARCHAR(16)[] | NOT NULL; sin valor por defecto; tres CHECK (revisión 1, D-003-15): `users_roles_not_empty` = `cardinality(roles) >= 1 AND array_ndims(roles) = 1`; `users_roles_allowed` = `roles <@ ARRAY['waiter', 'kitchen', 'cashier', 'admin']::varchar(16)[]` (también rechaza elementos NULL); `users_roles_no_duplicates` = `cardinality(array_positions(roles, 'waiter')) <= 1 AND cardinality(array_positions(roles, 'kitchen')) <= 1 AND cardinality(array_positions(roles, 'cashier')) <= 1 AND cardinality(array_positions(roles, 'admin')) <= 1` |
| is_active | BOOLEAN | NOT NULL DEFAULT true |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

- El patrón completo del nombre para mostrar (letras, números, espacio, punto, apóstrofo, guion; NFC) lo aplica displayNameSchema; la base solo garantiza que no esté vacío ni tenga espacios alrededor. VARCHAR(40) cuenta caracteres (puntos de código), igual que zod `max(40)`.
- No hay índice extra: el único de username sirve para la búsqueda del login y la lista es pequeña. Tampoco hace falta un índice sobre roles: con menos de 20 usuarios, buscar por rol (`roles @> ARRAY['admin']`) recorre la tabla sin costo.
- La base no exige un orden dentro de roles; createUser guarda en el orden de USER_ROLES y la API ordena al leer (D-003-15). Como los valores permitidos son cuatro y no se repiten, un arreglo válido tiene de 1 a 4 elementos.
- Sequelize (modelo User, `underscored`): id, username, displayName, pinHash, roles (`DataTypes.ARRAY(DataTypes.STRING(16))`), isActive, createdAt, updatedAt. pinHash nunca sale en una respuesta.

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

- users 1 — N sessions. Los roles viven dentro de users (D-003-15): no hay tabla user_roles.
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

Solo usuarios activos, ordenados por displayName con `Intl.Collator('es', { sensitivity: 'base' })` y los empates por username. Sin id, roles, estado ni nada del PIN. Cada usuario aparece una vez, tenga los roles que tenga.

### 9.2 POST /api/auth/login

Request:

```json
{ "username": "mozo.juan", "pin": "2468" }
```

- username se recorta y se pasa a minúsculas antes de validar con USERNAME_PATTERN. pin cumple `^[0-9]{4,6}$`. Objeto estricto: una propiedad de más es 400.

Response 200 (y la cookie de D-003-02):

```json
{ "user": { "id": 3, "username": "mozo.juan", "displayName": "Juan", "roles": ["waiter"] }, "expiresAt": "2026-10-09T07:00:00.000Z" }
```

- `roles` (revisión 1): arreglo de 1 a 4 roles, sin repetir, siempre en el orden de USER_ROLES: waiter, kitchen, cashier, admin. Por ejemplo, una moza que también cobra recibe `["waiter", "cashier"]`.

Orden dentro del servicio (D-003-04 y D-003-05): (1) buscar el usuario por username; (2) si no existe, comparar contra el hash de relleno y responder 401; (3) si está bloqueado, 429 sin comparar; (4) contar el intento (en el mismo paso síncrono que el punto 3); (5) comparar el PIN; (6) si no coincide o el usuario está inactivo, 401; (7) borrar el conteo, borrar las sesiones vencidas, crear la sesión y responder.

Response 429:

```json
{ "error": { "code": "TOO_MANY_ATTEMPTS", "message": "Demasiados intentos fallidos. Espera unos minutos e intenta de nuevo.", "details": { "retryAfterSeconds": 900 } } }
```

con la cabecera `Retry-After: 900`.

### 9.3 GET /api/auth/me

Responde el mismo SessionResponse que el login, con los datos actuales del usuario (roles y nombre leídos de la base; roles en el orden de USER_ROLES) y el expiresAt de esa sesión.

### 9.4 POST /api/auth/logout

Borra la sesión de la cookie si existe y responde 204 sin cuerpo con la Set-Cookie que la borra. Sin cookie o con una inválida responde igual (idempotente): la web siempre puede limpiar la cookie.

### 9.5 Middlewares para las rutas protegidas

- `requireAuth`: 401 UNAUTHENTICATED si no hay sesión válida; deja el contexto en `res.locals.auth`.
- `requireRole(...roles)`: después de requireAuth; deja pasar si el usuario tiene al menos uno de los roles de la lista; si no tiene ninguno, 403 FORBIDDEN. admin pasa solo si la lista lo incluye.

### 9.6 Socket.IO

Sin eventos en esta spec. Cuando llegue Socket.IO, la conexión por /socket.io llevará la misma cookie (Path=/) y deberá validarla con el mismo servicio de sesiones.

### 9.7 Contrato

docs/api/openapi.yaml pasa a la versión 0.3.1 (la 0.3.0 fue el borrador inicial de esta spec, nunca implementado; la revisión 1 cambia `role` por `roles` en AuthUser): etiqueta auth; rutas /auth/users, /auth/login, /auth/me y /auth/logout; esquema de seguridad sessionCookie (apiKey en la cookie polleria_session); esquemas UserRole, UserRoles (revisión 1: arreglo de 1 a 4 roles sin repetir, en el orden de USER_ROLES), Username, Pin, LoginRequest, AuthUser (con roles), SessionResponse, LoginUser y LoginUsersResponse; cabeceras SetSessionCookie, ClearSessionCookie y RetryAfter; respuestas reutilizables InvalidCredentials, Unauthenticated, Forbidden y TooManyAttempts; ErrorCode y ErrorDetails con los códigos y el campo retryAfterSeconds nuevos.

## 10. Interfaz

Textos en español de Perú. Componentes de HeroUI (Button y los que hagan falta); Tailwind solo para el diseño. Ningún recurso de internet. Consultas con TanStack Query y `retry: false`.

### 10.1 Pantalla "Iniciar sesión" (ruta /login)

- Quién la usa: todos los trabajadores. Dispositivos: celular del mozo (360 px, táctil) y PC de caja (teclado y mouse).
- Primero consulta GET /api/auth/me (sin recargar ante el 401). Si hay sesión, va al destino de D-003-16. Si no, muestra la lista o, si el dispositivo recuerda a un usuario que está en la lista, su teclado.
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

- Tras un error el PIN queda vacío. Tras el éxito, guarda el username en localStorage ('polleria:lastUsername') y va al destino de D-003-16 con `router.replace`: su única área, la última área recordada por el dispositivo si le corresponde, o /areas.

### 10.2 Áreas por rol (/mozo, /caja, /cocina, /admin)

- Cada página envuelve su contenido en RoleGuard con su área; los roles que entran son los de D-003-07.
- Contenido mínimo, mobile-first:
  - Barra superior con la línea `<displayName> · <etiquetas de los roles>` (por ejemplo 'Juan · Mozo, Cajero'), el enlace 'Cambiar de área' (a /areas, solo si el usuario tiene más de un área permitida) y el botón 'Cerrar sesión', ambos de al menos 48 px de alto. En el celular, si no caben en una línea, pasan a la siguiente (sin desplazamiento horizontal).
  - Encabezado h1: 'Mozo', 'Caja', 'Cocina' o 'Administración'.
  - Un texto corto de lo que vendrá (sugerido): 'Aquí verás las mesas y tomarás los pedidos.' (Mozo), 'Aquí cobrarás las cuentas.' (Caja), 'Aquí gestionarás los usuarios, la carta y los reportes.' (Administración), 'Las comandas salen en la impresora de cocina. Esta pantalla todavía no tiene funciones.' (Cocina).
  - Revisión 1: los enlaces 'Ir a Mozo' e 'Ir a Caja' de /admin se reemplazan por 'Cambiar de área', que vale para todas las áreas.
- Estados de RoleGuard:

  | Estado | Cuándo | Qué se ve |
  | --- | --- | --- |
  | Cargando | /me en curso | 'Cargando...' (role="status") |
  | Sin sesión | 401 | Se recarga en /login |
  | Sin permiso para esta área | 200, pero ninguno de sus roles entra a esta área | Va al destino de D-003-16 (`router.replace`), sin guardar el área |
  | Error | Red u otro error | 'No se pudo verificar tu sesión.' (role="alert") y 'Reintentar' |
  | Listo | 200 con un rol que entra a esta área | El contenido; guarda la ruta del área en localStorage ('polleria:lastArea') |

- 'Cerrar sesión': POST /api/auth/logout; mientras espera, 'Cerrando sesión...' deshabilitado; si sale bien, recarga en /login; si falla, 'No se pudo cerrar la sesión. Intenta de nuevo.' (role="alert").

### 10.3 Inicio (ruta /)

Igual que en la 001 (encabezado e indicador de conexión), más un enlace 'Iniciar sesión' a /login. Los celulares pueden guardar /login como acceso directo.

### 10.4 Pantalla "¿Dónde vas a trabajar?" (ruta /areas, revisión 1)

- Quién la usa: quien tiene más de un área permitida (por ejemplo, un mozo que también cobra, o el administrador). Dispositivos: celular (360 px, táctil) y PC de caja.
- Cuándo aparece: después de iniciar sesión si el dispositivo no recuerda un área que le corresponda, y al tocar 'Cambiar de área' en cualquier área (D-003-16).
- Contenido:
  - Barra superior con la línea `<displayName> · <etiquetas de los roles>` y el botón 'Cerrar sesión' (sin 'Cambiar de área').
  - Encabezado h1 '¿Dónde vas a trabajar?'.
  - Un elemento nav con nombre accesible 'Áreas' y un enlace grande por área permitida, en el orden Mozo, Caja, Cocina, Administración: nombre del área como texto ('Mozo', 'Caja', 'Cocina', 'Administración'), al menos 48 px de alto (se sugieren 64 px) y ancho completo en el celular.
- Al tocar un área, navega a ella (navegación interna); el área se guarda como la última del dispositivo cuando se muestra.
- Estados:

  | Estado | Cuándo | Qué se ve |
  | --- | --- | --- |
  | Cargando | /me en curso | 'Cargando...' (role="status") |
  | Sin sesión | 401 | Se recarga en /login |
  | Una sola área | 200 con una sola área permitida | Va a esa área (`router.replace`) |
  | Error | Red u otro error | 'No se pudo verificar tu sesión.' (role="alert") y 'Reintentar' |
  | Listo | 200 con dos o más áreas | El encabezado y los enlaces |

## 11. Contrato interno de módulos (rutas que importan las pruebas)

El test-writer importa desde estas rutas; si un módulo no existe todavía, la prueba falla por módulo inexistente (rojo válido). Sintaxis borrable (D-02 de la 001): sin enum, namespace ni propiedades de parámetro; imports relativos con .ts.

- **packages/shared/src/auth.ts** (exportado también por packages/shared/src/index.ts, se importa como `@polleria/shared`)
  - `USER_ROLES` (`as const`), `type UserRole`, `userRoleSchema`.
  - Revisión 1: `userRolesSchema` (arreglo de userRoleSchema; vacío: 'Elige al menos un rol.'; repetidos: 'No repitas un rol.'; devuelve un arreglo nuevo en el orden de USER_ROLES), `sortUserRoles(roles: readonly UserRole[]): UserRole[]` (arreglo nuevo en el orden de USER_ROLES; no modifica el recibido) y `hasAnyRole(userRoles: readonly UserRole[], allowedRoles: readonly UserRole[]): boolean`.
  - `PIN_PATTERN` = `/^[0-9]{4,6}$/`, `PIN_MIN_LENGTH` = 4, `PIN_MAX_LENGTH` = 6, `pinSchema`.
  - `USERNAME_PATTERN` = `/^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$/`, `usernameSchema` (trim, minúsculas y patrón).
  - `DISPLAY_NAME_MAX_LENGTH` = 40, `DISPLAY_NAME_PATTERN` = `/^[\p{L}\p{N}][\p{L}\p{M}\p{N} .'-]*$/u`, `displayNameSchema` (trim, NFC, de 1 a 40 puntos de código y patrón).
  - `loginRequestSchema` (estricto) y `type LoginRequest`.
  - `authUserSchema` (estricto: id entero positivo, username, displayName, roles con userRolesSchema) y `type AuthUser`.
  - `sessionResponseSchema` (estricto: user y expiresAt ISO UTC con Z, como healthResponseSchema) y `type SessionResponse`.
  - `loginUserSchema`, `loginUsersResponseSchema` y `type LoginUser`, `type LoginUsersResponse`.
- **packages/shared/src/errors.ts** (modificado): ERROR_CODES suma INVALID_CREDENTIALS, UNAUTHENTICATED, FORBIDDEN, TOO_MANY_ATTEMPTS y USERNAME_TAKEN. errorResponseSchema no cambia.
- **apps/api/src/db/migrations/20261008120000-create-users.ts** y **20261008120100-create-sessions.ts**: `up` y `down` con `{ context: QueryInterface }` (D-05 de la 001).
- **apps/api/src/models/index.ts**
  - `interface UserAttributes { id: number; username: string; displayName: string; pinHash: string; roles: UserRole[]; isActive: boolean; createdAt: Date; updatedAt: Date }`.
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
  - `interface AuthContext { sessionId: number; user: AuthUser; expiresAt: Date }`. `user.roles` va siempre en el orden de USER_ROLES (sortUserRoles al leer).
  - `interface SessionService { createSession(userId: number): Promise<{ token: string; expiresAt: Date }>; resolveSession(token: string | undefined): Promise<AuthContext | null>; deleteSession(token: string | undefined): Promise<void>; deleteExpiredSessions(): Promise<number> }`.
  - `createSessionService(deps: { models: Models; now?: () => Date }): SessionService`. resolveSession devuelve null sin consultar la base si el token falta o no cumple SESSION_TOKEN_PATTERN.
- **apps/api/src/services/auth/auth.service.ts**
  - `interface AuthService { listLoginUsers(): Promise<LoginUser[]>; login(input: LoginRequest): Promise<{ token: string; session: SessionResponse }>; logout(token: string | undefined): Promise<void> }`.
  - `createAuthService(deps: { models: Models; sessionService: SessionService; pinHasher: PinHasher; loginLimiter: LoginLimiter }): AuthService`. login lanza AppError INVALID_CREDENTIALS (401) o TOO_MANY_ATTEMPTS (429, `details.retryAfterSeconds`).
- **apps/api/src/services/users/user.service.ts**
  - `interface CreateUserInput { username: string; displayName: string; pin: string; roles: UserRole[] }`.
  - `interface UserService { createUser(input: CreateUserInput): Promise<AuthUser> }`.
  - `createUserService(deps: { models: Models; pinHasher: PinHasher }): UserService`. Valida con los esquemas de shared, roles con userRolesSchema (ZodError), guarda los roles en el orden de USER_ROLES y traduce el choque del índice único a AppError USERNAME_TAKEN (409).
- **apps/api/src/http/session-cookie.ts**
  - `SESSION_COOKIE_NAME` = 'polleria_session'.
  - `readSessionCookie(cookieHeader: string | undefined): string | undefined` (pura, AC-11).
  - `setSessionCookie(res: Response, token: string): void` y `clearSessionCookie(res: Response): void` (atributos de D-003-02).
- **apps/api/src/middlewares/auth.ts**
  - `createRequireAuth(deps: { sessionService: SessionService }): RequestHandler`.
  - `requireRole(...roles: UserRole[]): RequestHandler` (lanza con la lista vacía; deja pasar con al menos uno de los roles, usando hasAnyRole).
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
- **apps/web/src/lib/auth/roles.ts** (revisión 1: ya no exporta ROLE_HOME_PATHS)
  - `ROLE_LABELS` (valores de AC-34) y `formatRoleLabels(roles: readonly UserRole[]): string` (etiquetas en el orden de USER_ROLES, separadas por ', ').
  - `type AreaPath = '/mozo' | '/caja' | '/cocina' | '/admin'`, `AREA_PATHS: readonly AreaPath[]` (en ese orden), `AREA_LABELS: Readonly<Record<AreaPath, string>>`, `AREA_ALLOWED_ROLES: Readonly<Record<AreaPath, readonly UserRole[]>>` (D-003-07) y `AREA_SELECTOR_PATH` = '/areas'.
  - `getAllowedAreas(roles: readonly UserRole[]): AreaPath[]` y `resolveLandingPath(roles: readonly UserRole[], lastArea: string | null): AreaPath | '/areas'` (D-003-16, AC-41). Funciones puras.
- **apps/web/src/lib/auth/last-user.ts**
  - `LAST_USERNAME_STORAGE_KEY` = 'polleria:lastUsername', `readLastUsername(): string | null`, `saveLastUsername(username: string): void` (no lanzan aunque localStorage falle).
- **apps/web/src/lib/auth/last-area.ts** (revisión 1)
  - `LAST_AREA_STORAGE_KEY` = 'polleria:lastArea', `readLastArea(): AreaPath | null` (null si no hay valor, si no es una de AREA_PATHS o si localStorage falla) y `saveLastArea(area: AreaPath): void` (no lanza).
- **apps/web/src/components/auth/login-screen.tsx**: `LoginScreen`, componente cliente sin props. apps/web/src/app/login/page.tsx lo renderiza.
- **apps/web/src/components/auth/role-guard.tsx**: `RoleGuard({ area: AreaPath; children: ReactNode })`, componente cliente (revisión 1: recibe el área en lugar de la lista de roles; los roles salen de AREA_ALLOWED_ROLES).
- **apps/web/src/components/auth/logout-button.tsx**: `LogoutButton`, componente cliente sin props.
- **apps/web/src/components/auth/area-selector.tsx** (revisión 1): `AreaSelector`, componente cliente sin props (sección 10.4). apps/web/src/app/areas/page.tsx lo renderiza.
- **apps/web/src/app/mozo/page.tsx**, **caja/page.tsx**, **cocina/page.tsx**, **admin/page.tsx** y (revisión 1) **areas/page.tsx**: default export de cada página (síncronos, sin APIs exclusivas del servidor, como la página de inicio de la 001).
- **apps/web/src/app/page.tsx** (modificado): suma el enlace 'Iniciar sesión'.

Rutas sugeridas para pruebas: unitarias junto al código (`packages/shared/src/auth.test.ts`, `apps/api/src/services/auth/*.test.ts`, `apps/api/src/http/session-cookie.test.ts`, componentes `*.test.tsx`, `apps/web/src/lib/auth/roles.test.ts`, `apps/web/src/lib/auth/last-area.test.ts`); integración en apps/api/tests/ (`auth-*.test.ts`, `users-migrations.test.ts`, `create-admin-process.test.ts`), con helpers nuevos en apps/api/tests/helpers/ (por ejemplo `auth.ts` para crear usuarios y obtener cookies); E2E en e2e/auth.spec.ts con e2e/global-setup.ts.

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
| docs/api/openapi.yaml | Versión 0.2.0 a 0.3.1 con lo de 9.7 (la 0.3.0 fue el borrador inicial; la revisión 1 cambia role por roles). | spec-writer (esta spec) |
| .claude/agents/backend-dev.md ("sesión con JWT en cookie httpOnly") y .claude/agents/adversarial-tester.md ("JWT manipulado") | "sesión con token aleatorio guardado (como hash) en la base, en cookie httpOnly" y "token de sesión manipulado o inventado". | orquestador (hecho el 2026-10-08) |
| CLAUDE.md (Stack y Comandos) | Registrar bcrypt 6.0.0 y @types/bcrypt 6.0.0 y el comando `pnpm users:create-admin`. | orquestador, al cerrar |

## 13. Dependencias

Detalle, versiones consultadas en npm el 2026-10-08, verificaciones y alternativas en docs/decisions/0002-sesion-pin-y-limite-de-intentos.md.

| Paquete | Versión | Dónde | Estado | Justificación |
| --- | --- | --- | --- | --- |
| bcrypt | 6.0.0 | api (dependencies) | Aprobada en CLAUDE.md; se instala ahora | Hash del PIN (RNF-10). Trae binarios precompilados para win32-x64; verificado en Node 24.1.0 sin compilar. |
| @types/bcrypt | 6.0.0 | api (devDependencies) | Aprobada (ADR 0002 aceptado el 2026-10-08) | bcrypt no trae tipos propios. Depende de `@types/node: *`, que se resuelve con el 24.19.1 que ya está (verificado). |

Descartadas (detalle en el ADR): jose 6.2.12, jsonwebtoken 9.0.3 y un HMAC propio con SESSION_SECRET (D-003-01); cookie-parser 1.4.7 y cookie 2.0.1 (leer una sola cookie es una función de pocas líneas; Express 5 ya escribe y borra cookies); express-rate-limit 8.7.1 (D-003-05); @testing-library/user-event 14.6.7 (verificado en react-aria 3.52.1: `fireEvent.click` dispara onPress de los botones de HeroUI como clic virtual); openapi-typescript 7.13.0 (sigue diferido por su peer `typescript ^5.x`).

## 14. Fuera de alcance

- Crear, editar, desactivar usuarios, asignar o quitar roles y cambiar o restablecer PIN desde la web (propuesta 004), incluido desbloquear a un usuario a mano.
- Que `pnpm users:create-admin` asigne roles además de admin (S-003-16; lo hará la 004).
- Recordar el área por persona en lugar de por dispositivo, y elegir un área "preferida" por usuario (S-003-14).
- Autorización con PIN de administrador para acciones sensibles: anular, descuentos, cierre de caja (Fase 2; RNF-09 segunda parte).
- Auditoría de quién hizo qué (RF-27, Fase 6). Esta spec no registra inicios de sesión.
- Usuarios de demostración (Fase 6).
- HTTPS en la red local y la cookie con Secure.
- Límite por IP, CAPTCHA, avisos al dueño de intentos fallidos y bloqueos guardados en la base o compartidos entre varias instancias de la API.
- Renovar la sesión, "recordarme" más de 16 horas y cerrar sesión en todos los dispositivos.
- Funciones de las áreas Mozo, Caja, Administración y Cocina (fases siguientes).
- Autenticación de Socket.IO (llega con el primer evento).
- Redirigir automáticamente la página de inicio (/) a /login.
- Rechazar PIN fáciles (1234, 0000, 1111): se tratan en la 004 (decisión del usuario, pregunta 7).
- Generar tipos con openapi-typescript.

## 15. Supuestos

Confirmados por el usuario el 2026-10-08: S-003-01, S-003-02, S-003-03, S-003-05, S-003-06, S-003-07 y la parte de S-003-04 sobre el administrador. La otra parte de S-003-04 (un rol por usuario) la cambió el usuario: una persona puede tener varios roles (revisión 1). S-003-13 a S-003-16 son nuevos de la revisión 1.

| ID | Supuesto |
| --- | --- |
| S-003-01 | La sesión es un token aleatorio cuyo hash se guarda en la base (tabla sessions), no un JWT firmado; no hay SESSION_SECRET. |
| S-003-02 | La sesión dura 16 horas fijas desde que se inicia, sin renovación. |
| S-003-03 | El PIN tiene de 4 a 6 dígitos, con botón Entrar (no entra solo al completar). |
| S-003-04 | (Revisión 1) Cada usuario tiene uno o varios roles, y el administrador puede entrar a todas las áreas. Ya no es un supuesto: lo decidió el usuario. |
| S-003-05 | Un usuario de cocina puede iniciar sesión y ve /cocina con un aviso, sin funciones. |
| S-003-06 | La pantalla de inicio muestra la lista de usuarios activos (nombre para mostrar y nombre de usuario) sin sesión. |
| S-003-07 | 5 intentos fallidos seguidos bloquean al usuario 15 minutos; después, cada fallo lo vuelve a bloquear; un acierto borra el conteo. Los usuarios inexistentes no se cuentan. |
| S-003-08 | La cookie no lleva Secure porque el local usa HTTP en la red. |
| S-003-09 | El mensaje de error es el mismo para usuario inexistente, inactivo o PIN incorrecto. |
| S-003-10 | `pnpm users:create-admin` crea un administrador cada vez que se ejecuta (también sirve para recuperar el acceso). |
| S-003-11 | Cada dispositivo recuerda el último usuario que entró y abre su teclado de PIN. |
| S-003-12 | La API corre en un solo proceso; los conteos de intentos viven en su memoria y se borran al reiniciarla. |
| S-003-13 | (Revisión 1) admin puede ir junto con otros roles y se guarda tal cual, sin normalizar ni rechazar. |
| S-003-14 | (Revisión 1) Cada dispositivo recuerda la última área que se abrió en él, de cualquier usuario; quien tiene varias áreas entra directo a esa si le corresponde. |
| S-003-15 | (Revisión 1) El administrador, que tiene las cuatro áreas, elige en "¿Dónde vas a trabajar?" la primera vez en cada dispositivo; ya no entra siempre a /admin. |
| S-003-16 | (Revisión 1) `pnpm users:create-admin` crea solo el rol admin; los demás roles se asignan en la 004. |

## 16. Preguntas abiertas para el usuario

Respondidas el 2026-10-08: 1 (sesión en la base, sin JWT), 2 (PIN de 4 a 6 dígitos con Entrar), 3 (varios roles por persona y el administrador entra a todas las áreas: revisión 1), 4 (lista de nombres en /login), 5 (5 intentos y 15 minutos), 6 (sesión de 16 horas), 7 (los PIN fáciles se tratan en la 004), 8 (cocina puede iniciar sesión, con pantalla vacía) y 9 (ADR 0002 aceptado). Se conservan abajo como registro.

Nuevas de la revisión 1 (ninguna bloquea las pruebas si se acepta la recomendación):

10. (dueño) Cuando el dueño (administrador) entra por primera vez en un celular o una PC, ¿está bien que elija dónde va a trabajar (Mozo, Caja, Cocina o Administración) y que ese equipo lo recuerde la próxima vez (recomendado, S-003-15)? La alternativa es que el administrador entre siempre a Administración y desde ahí cambie de área.
11. (dueño) ¿Está bien que cada equipo recuerde la última área que se usó en él, sea quien sea (recomendado, S-003-14)? Así, en la PC de caja, quien también cobra entra directo a Caja. La alternativa es que cada persona tenga su propia última área en cada equipo (la primera vez en cada equipo elige).
12. (técnica) ¿Está bien que el administrador pueda tener además otros roles, por ejemplo mozo, guardados tal cual (recomendado, S-003-13)? No cambia sus permisos, pero permitirá contarlo como mozo en reportes futuros.
13. (técnica) ¿Está bien que `pnpm users:create-admin` cree solo administradores y que los demás roles se asignen desde la web en la 004 (recomendado, S-003-16)?

Preguntas originales (respondidas):

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
4. `pnpm dev` y abrir http://localhost:3000/login en la PC: tocar tu nombre, escribir el PIN y Entrar. La primera vez debe mostrar '¿Dónde vas a trabajar?' con Mozo, Caja, Cocina y Administración. Tocar Administración; luego 'Cambiar de área' y Caja. Cerrar sesión y volver a entrar: debe abrir directo Caja (la última área usada en esa PC).
5. Escribir 5 veces un PIN incorrecto: el 6.º intento debe decir 'Demasiados intentos fallidos. Intenta de nuevo en 15 minutos.' (para salir del bloqueo antes, reiniciar `pnpm dev`).
6. 'Cerrar sesión' y abrir http://localhost:3000/admin: debe volver a /login.
7. Desde un celular en el mismo wifi (con WEB_ALLOWED_DEV_ORIGINS como en la 001): abrir http://<IP-de-la-PC>:3000/login, entrar y comprobar que el teclado se ve grande y que la próxima vez abre directo en tu PIN.
8. Para probar las pantallas de mozo y caja con su propio usuario, o una persona con varios roles, hará falta la 004 (crear usuarios y asignar roles desde la web). Las pruebas automáticas (AC-44) ya cubren a un mozo que también cobra.

## 18. Notas para specs siguientes (no son alcance de esta)

- 004 (gestión de usuarios): endpoints solo para admin con requireRole('admin'); USERNAME_TAKEN por HTTP; desactivar y cambiar PIN deberían borrar las sesiones de ese usuario y su conteo de intentos; desbloqueo manual; decidir si se rechazan PIN fáciles (pregunta 7). Revisión 1: asignar y quitar roles con userRolesSchema y el esquema UserRoles del contrato (un UPDATE de users.roles); decidir si un administrador puede quitarse a sí mismo el rol admin o si debe quedar al menos un administrador activo.
- Fase 2 (autorización con PIN de administrador): reutilizar PinHasher y un LoginLimiter propio (otra instancia) para no mezclar los intentos de autorización con los de inicio de sesión; registrar quién autorizó (RF-27 en la Fase 6). Los administradores se buscan con `roles @> ARRAY['admin']` (`Op.contains` de Sequelize).
- Socket.IO: validar la cookie polleria_session en el handshake con SessionService.resolveSession.
- Cada endpoint nuevo declara en su spec los roles de requireRole y suma pruebas 401 y 403 (adversarial-tester.md, "cada endpoint con cada rol"), incluida al menos una persona con dos roles. Si el administrador debe poder usarlo, 'admin' va en la lista.

## 19. Cambios de la revisión 1 (2026-10-08): varios roles por persona

Motivo: el usuario decidió que una persona puede tener varios roles (por ejemplo, un mozo que también cobra en caja). Reemplaza S-003-04 ("un rol por usuario"). Lo demás aprobado por el usuario no cambia.

Qué cambia para el dueño:
- Una persona tiene un solo usuario y PIN aunque haga dos trabajos.
- Quien tiene un solo rol entra igual que antes: directo a su pantalla.
- Quien tiene más de un área elige "¿Dónde vas a trabajar?" la primera vez en cada equipo; después el equipo recuerda la última área. Puede cambiar con 'Cambiar de área' sin cerrar sesión.
- El administrador también elige la primera vez en cada equipo (antes entraba siempre a Administración). Ver las preguntas 10 a 13.

Decisiones nuevas: D-003-15 (columna roles de tipo arreglo, con CHECK en la base; orden estable de USER_ROLES; admin combinable) y D-003-16 (áreas permitidas, destino al entrar, pantalla /areas y 'Cambiar de área'). Ajustadas: D-003-01, D-003-06, D-003-07, D-003-08, D-003-09, D-003-10 y D-003-12.

AC modificados:

| AC | Título | Cambio |
| --- | --- | --- |
| AC-04 | Esquemas de sesión y códigos de error | AuthUser lleva roles (arreglo, devuelto en orden) en lugar de role. |
| AC-05 | Tabla users | Columna roles VARCHAR(16)[] con sus CHECK; ya no existe role. |
| AC-12 | Lista de usuarios para iniciar sesión | Una usuaria con dos roles aparece una sola vez. |
| AC-13 | Inicio de sesión correcto | El cuerpo lleva roles; una moza que cobra recibe ['waiter', 'cashier']. |
| AC-20 | Los cambios del usuario valen desde la siguiente solicitud | Cambio de roles por SQL; la API los devuelve en el orden de USER_ROLES. |
| AC-23 | requireAuth y requireRole | Basta con uno de los roles; usuarios con dos roles; cambio de roles en la siguiente solicitud. |
| AC-25 | Servicio de usuarios | createUser recibe roles, los guarda en orden y valida el conjunto. |
| AC-26 | Crea un administrador | El comando guarda roles '{admin}'. |
| AC-31 | Envío del PIN y errores | Tras el éxito va al destino de D-003-16 (área única, última área o /areas). |
| AC-33 | Guardia de rol | Casos con dos roles y el destino cuando el área no corresponde. |
| AC-34 | Pantallas por rol | Línea con varios roles; ya no hay 'Ir a Mozo' ni 'Ir a Caja'; ROLE_HOME_PATHS se quita. |
| AC-38 | El administrador entra a todas las áreas; un PIN incorrecto no | Pasa por /areas y usa 'Cambiar de área'. |

Sin cambios de texto: AC-18 (el cuerpo de /me sigue siendo el del login, que ahora lleva roles), AC-37 (el mozo con un solo rol entra directo a /mozo, como antes) y los demás.

AC nuevos:

| AC | Título |
| --- | --- |
| AC-40 | Conjunto de roles (userRolesSchema, sortUserRoles, hasAnyRole) |
| AC-41 | Áreas permitidas y destino al entrar (getAllowedAreas, resolveLandingPath, última área) |
| AC-42 | Pantalla "¿Dónde vas a trabajar?" |
| AC-43 | Cambiar de área y recordar la última |
| AC-44 | Una persona con dos roles elige su área, cambia de área y el dispositivo recuerda la última (E2E) |

Otros cambios: HU-003-07 nueva; RN-003-01, RN-003-06, RN-003-07 y RN-003-08; casos borde de varios roles (sección 7); modelo de datos (8.1); API (9.2, 9.3, 9.5 y 9.7); interfaz (10.1, 10.2 y la nueva 10.4); contrato de módulos (sección 11); fuera de alcance (14); supuestos S-003-13 a S-003-16 y preguntas 10 a 13; contrato OpenAPI 0.3.1; tasks.md (T-27 y T-28 nuevas y ajustes en otras).
