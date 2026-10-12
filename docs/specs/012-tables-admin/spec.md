# Spec 012 — Pantalla de administración de mesas en /admin

- Estado: Aprobada por el usuario el 2026-10-12 con las recomendaciones de las 7 preguntas abiertas de la sección 17
- Fase: 2 (Mesas y pedidos) — último ítem de la división aprobada en la spec 009 (009 mesas + ciclo, 010 ítems, 011 pantallas del mozo, 012 administración de mesas)
- Rama: feat/012-tables-admin
- Fecha: 2026-10-12
- Cubre: RNF-12 en su parte visible y operable para las mesas (los precios, productos y mesas se configuran desde el sistema sin tocar código — la carta ya lo tiene desde la 008 y la API de mesas desde la 009; esta spec le da al administrador la pantalla para darlas de alta, renombrarlas y activarlas/desactivarlas). Aporta a RNF-02 (español sencillo, botones grandes), RNF-05, RNF-07 y RNF-08 (la misma web en el wifi local, usable a 360 px en el celular o tablet del administrador) y RNF-09 (la configuración de mesas solo la hace el rol admin). Spec pequeña de solo interfaz, igual que la 008 y la 011: la API ya existe y no cambia.
- Documentos relacionados: tasks.md (esta carpeta), docs/planificacion.md (RF-02, RF-03, RNF-12, módulo Mesas), docs/specs/003-users-pin-login/spec.md (sesión, áreas, RoleGuard; /admin existe como área desde la 003), docs/specs/004-users-admin/spec.md (patrón de pantallas de administración: lista, confirmaciones, MSW y E2E), docs/specs/008-menu-admin/spec.md (patrón de pantallas /admin construido: TanStack Query, MSW, validación local con esquemas de shared, 360 px, E2E), docs/specs/009-tables/spec.md (D-009-12: configuración de mesas por el admin; §10 nota para esta spec: lista con alta por nombre y activar/desactivar, con TABLE_NAME_TAKEN y TABLE_HAS_OPEN_ORDER como mensajes del servidor; §14: plano visual descartado), docs/specs/011-waiter-screens/spec.md (la API ya existe y solo falta la pantalla — decisión §17; TABLE_STATE_LABELS ya vive en la web), docs/api/openapi.yaml (versión 0.9.0 — sin cambios en esta spec) y CLAUDE.md (reglas de dominio 9; glosario: mesa = table, mozo = waiter, administrador = admin, pedido = order).

## 1. Contexto

La spec 009 dejó lista la configuración de mesas por API: alta por nombre (POST /api/tables), renombrar y activar/desactivar (PATCH /api/tables/{tableId}), con el nombre único sin distinguir mayúsculas, la mesa que nunca se borra y el bloqueo de desactivar una mesa con pedido abierto. Hoy el dueño solo puede usarla con una consola y una cookie a mano — igual que la carta antes de la 008. Esta spec entrega la pantalla de administración de mesas dentro del área /admin: la lista completa con el estado de cada mesa, el alta por nombre, el renombrado y el activar/desactivar con sus mensajes claros cuando el sistema no deja (nombre repetido, mesa con pedido abierto). No se agrega ni cambia ningún endpoint: la 012 consume el contrato OpenAPI 0.9.0 tal cual. El tablero del mozo (011), el plano visual del salón (descartado en la 009) y las operaciones del pedido siguen fuera.

## 2. Historias de usuario

| ID | Historia |
| --- | --- |
| HU-012-01 | Como administrador (dueño), quiero ver todas las mesas de mi local con su estado —activa o desactivada, y en las activas si están libres o con pedido— para revisar mi salón sin recorrerlo. |
| HU-012-02 | Como administrador, quiero dar de alta una mesa escribiendo solo su nombre ("Mesa 11", "Barra", "Balcón"), para que el sistema refleje mi salón sin tocar código ni pedirle a nadie. |
| HU-012-03 | Como administrador, quiero corregir el nombre de una mesa ("Meza 3" a "Mesa 3", o "Mesa 10" a "Barra") y ver el mensaje claro cuando el nombre ya existe, aunque sea de una mesa desactivada. |
| HU-012-04 | Como administrador, quiero desactivar una mesa que ya no uso (y volver a activarla cuando la necesite), sin borrarla ni perder el historial de sus pedidos. |
| HU-012-05 | Como administrador, quiero entender por qué el sistema no me deja desactivar una mesa ocupada ("tiene un pedido abierto; ciérralo o muévelo"), para saber qué hacer en lugar de quedarme trabado. |
| HU-012-06 | Como administrador, quiero usar esta pantalla en mi celular o tablet —botones grandes, textos claros, sin internet—, igual que el resto de /admin. |

## 3. Decisiones técnicas

Propuestas del spec-writer; cada supuesto queda marcado SUPUESTO con su ID S-012-xx y resume las preguntas abiertas de la sección 17.

**D-012-01. Alcance: solo apps/web (SUPUESTO S-012-01).**
- La API, la base de datos, packages/shared y el contrato no cambian: docs/api/openapi.yaml queda en la versión 0.9.0 sin una línea nueva. La 012 consume tal cual GET/POST/PATCH /api/tables de la spec 009.
- Todos los esquemas que la web necesita ya existen en shared (createTableRequestSchema, updateTableRequestSchema, tableSchema, tablesResponseSchema de la 009); las funciones de API nuevas van en apps/web/src/lib/api/tables.ts — el archivo que la 011 ya creó con getTables, openTableOrder, joinTable y leaveTable — sumando createTable y updateTable. TABLE_STATE_LABELS ya existe en menu-labels.ts de la 011.
- Si en la implementación se descubre un hueco real en la API, se reporta al orquestador — no se tapa desde la web (misma regla de la 011; ver pregunta 7).
- Sin migraciones, sin variables de entorno, sin dependencias y sin ADR (D-012-11).

**D-012-02. Una sola pantalla /admin/mesas, con acciones por fila (SUPUESTO S-012-02).**
- La pantalla vive en /admin/mesas, envuelta en RoleGuard con area="/admin": solo pasa el rol admin; un usuario con solo mozo, cocina o caja va a su área y sin sesión a /login — comportamiento ya probado en la 003/004.
- A diferencia del patrón de tres rutas de la 004/008 (lista + /nuevo + /[id]), aquí todo cabe en una pantalla: una mesa solo tiene dos propiedades editables —nombre y activa/inactiva— así que el alta es un campo en línea al inicio y el renombrado un diálogo con el nombre precargado. Una página de edición entera para un solo campo sería navegación sin contenido en el celular. El patrón que sí se conserva: lista completa, confirmación para desactivar, mensajes del servidor tal cual y la misma mecánica TanStack Query + MSW.
- La página /admin gana el enlace 'Mesas' junto a 'Usuarios' y 'Carta'.

**D-012-03. Alta por nombre en línea (SUPUESTO S-012-03).**
- Al inicio de la pantalla: el campo 'Nombre de la mesa' y el botón 'Agregar mesa' ('Agregando...' mientras envía). POST /api/tables con `{ name }` → 201 → la mesa aparece en la lista releída y el campo queda limpio, listo para la siguiente.
- La mesa nace activa y libre (lo decide el servidor, RN-009-09); la pantalla no envía ni muestra más propiedades — no hay número, posición ni capacidad (decisiones de la 009: orden por nombre natural, sin plano visual, sin número de personas).
- En línea y no en una página /nuevo ni en diálogo: es un solo campo; el recorrido natural del dueño es "escribir, agregar, escribir, agregar" cuando acomoda su salón por primera vez.

**D-012-04. Renombrar con diálogo por fila (SUPUESTO S-012-04).**
- El botón 'Renombrar' de cada fila abre un diálogo 'Renombrar mesa' con el campo 'Nombre de la mesa' precargado con el nombre actual, 'Guardar' y 'Cancelar'. 'Guardar' envía PATCH /api/tables/{tableId} con `{ name }` → 200 → la fila muestra el nombre nuevo.
- 'Guardar' queda inhabilitado mientras el nombre no cambie (recortado): evita un PATCH sin sentido que el esquema rechazaría igual que 'No indicaste ningún cambio.'.
- Renombrar una mesa con pedido abierto funciona: la API solo bloquea `isActive: false` sobre una mesa cubierta, no el nombre — el tablero del mozo simplemente muestra el nombre nuevo en la siguiente lectura.

**D-012-05. Desactivar con confirmación, activar directo (SUPUESTO S-012-05).**
- 'Desactivar' en la fila pide confirmación '¿Desactivar <nombre>? No aparecerá en el tablero del mozo.' con 'Sí, desactivar' y 'Cancelar' → PATCH `{ isActive: false }` → la fila queda marcada 'Desactivada'. 'Activar' actúa sin confirmación → PATCH `{ isActive: true }`. Mismo patrón que productos y usuarios (AC-25 de la 004, D-008-10 de la 008).
- El 409 TABLE_HAS_OPEN_ORDER muestra su `message` tal cual — 'La mesa tiene un pedido abierto; ciérralo o muévelo antes de desactivarla.' — y la mesa sigue activa; ya le dice al admin qué hacer (HU-012-05).

**D-012-06. La lista muestra el estado derivado de las mesas activas (SUPUESTO S-012-06).**
- Además de 'Desactivada', cada fila activa muestra la etiqueta de su estado operativo con TABLE_STATE_LABELS de la 011: 'Libre', 'Ocupada', 'Pedido listo' o 'Pidió la cuenta'. Es solo información, sin acciones del ciclo — pero explica por qué 'Desactivar' puede responder 409 y le da al admin contexto del salón sin duplicar el tablero del mozo.
- Sin polling: el admin configura, no vigila — la lista se consulta al entrar y se relee tras cada mutación propia (invalidación); no se agrega `refetchInterval`.

**D-012-07. Lista completa, sin paginar ni buscador (SUPUESTO S-012-07).**
- GET /api/tables devuelve TODAS las mesas —activas e inactivas— ya ordenadas por nombre con colación natural ('Mesa 2' antes que 'Mesa 10'); la pantalla las muestra tal cual, sin filtrar — al contrario del tablero del mozo, que solo pinta las activas. Una pollería tiene del orden de 10-20 mesas: no hace falta paginar ni buscar (mismo criterio de la lista de usuarios de la 004 y de la carta de la 008).
- Cada fila: nombre, la etiqueta del estado derivado o la marca 'Desactivada' (si está inactiva no se muestra estado operativo — siempre es 'free' sin pedido, información vacía), y las acciones 'Renombrar' + 'Desactivar'/'Activar'.

**D-012-08. Errores, validación local y un solo envío en vuelo (SUPUESTO S-012-08).**
- Antes de enviar, la pantalla valida el cuerpo con los esquemas de shared (patrón de la 004/008): tableNameSchema en el alta y en el renombrado — el primer issue se muestra junto al campo ('El nombre de la mesa solo puede llevar letras, números, espacios, punto, guion o guion bajo.', 'El nombre de la mesa no puede pasar de 40 caracteres.').
- Del servidor: el 400 VALIDATION_ERROR muestra sus issues; los 409 TABLE_NAME_TAKEN ('Ya existe una mesa con ese nombre.') y TABLE_HAS_OPEN_ORDER muestran su `message` tal cual; el 404 muestra 'Esa mesa no existe.'; el 403 muestra 'No tienes permiso para realizar esta acción.'; el error de red muestra 'Sin conexión con el servidor. Revisa el wifi e intenta de nuevo.' (apiErrorMessage de la 004).
- Un solo envío en vuelo por acción (marca síncrona con useRef + isPending, lección ADV-004-31); los botones muestran 'Agregando...'/'Guardando...'/'Desactivando...' deshabilitados mientras envían.
- Sesión vencida con la página abierta: la siguiente consulta o mutación responde 401 y el cliente central lleva a /login; el nombre en borrador se pierde igual que en cualquier formulario.

**D-012-09. Mobile-first a 360 px (SUPUESTO S-012-09).**
- El dispositivo objetivo es el celular o la tablet del administrador: botones, enlaces y controles de al menos 48 px (min-h-12), diseño apilado dentro del marco de RoleGuard, campos a todo el ancho, sin desplazamiento horizontal a 360 px y sin recursos de internet (regla de dominio 9). La misma web fluida lo cubre en la PC del local sin trabajo extra.

**D-012-10. Sin cambios de contrato, de base, de configuración ni de dependencias (SUPUESTO S-012-10).**
- openapi.yaml queda en 0.9.0; apps/api, la base y packages/shared sin diff; .env.example y CONFIG_VARIABLES iguales; sin paquetes nuevos (TanStack Query, MSW, HeroUI, Tailwind, Playwright, Zod y los esquemas de shared ya están); sin ADR — es composición de lo ya decidido, como la 011.

**D-012-11. E2E: un recorrido en mobile-chrome (SUPUESTO S-012-11).**
- Un solo recorrido Playwright en el proyecto mobile-chrome (360×740) sobre polleria_test: el admin entra a /admin/mesas, agrega una mesa, la renombra, la desactiva con la confirmación y la reactiva; además verifica el mensaje del nombre repetido y que no haya desplazamiento horizontal (la técnica de AC-21 de la 008 y los E2E de la 011).
- Semilla E2E (la ajusta el test-writer en e2e/global-setup.ts): conserva usuarios, carta y las mesas 'E2E Mesa 1' a 'E2E Mesa 4' que la 011 ya siembra con clearOrderTables + createTableService — el recorrido solo usa la interfaz para el alta; las mesas creadas por la prueba quedan truncadas por la misma limpieza en la corrida siguiente.
- Solo mobile-chrome porque el dispositivo objetivo de esta spec es el celular/tablet del admin; la PC del local usa la misma web fluida ya verificada por los E2E desktop de la 004/008.

## 4. Criterios de aceptación

Todos ejecutables: unitarios y de componentes con MSW + `pnpm test`, y el E2E con `pnpm test:e2e` en mobile-chrome sobre polleria_test. Casos felices y errores con el formato común `{ error: { code, message, details } }`.

### 4.1 Funciones de API (apps/web/src/lib)

**AC-01 (funciones de configuración de mesas).** Dado `lib/api/tables.ts` ampliado, cuando se llama con MSW interceptando, entonces:

- `createTable(name)` → POST /api/tables con el cuerpo `{ name }`, expectedStatus 201, validando `tableSchema`; `updateTable(tableId, { name })` y `updateTable(tableId, { isActive })` → PATCH /api/tables/{tableId} con el cuerpo dado, expectedStatus 200, validando `tableSchema`.
- Un ApiError llega con su `code`, `message` y `details` (TABLE_NAME_TAKEN, TABLE_HAS_OPEN_ORDER, TABLE_NOT_FOUND, VALIDATION_ERROR); una respuesta que no cuadra con su esquema lanza UNEXPECTED_RESPONSE conservando el status real.
- Las funciones de la 011 (getTables, openTableOrder, joinTable, leaveTable) siguen intactas.

### 4.2 Lista y navegación (/admin/mesas)

**AC-02 (lista de mesas).** Dada la lista servida por MSW, cuando el admin entra a /admin/mesas, entonces: hay una fila por cada mesa —activas e inactivas, en el orden recibido— con su nombre; una mesa activa muestra la etiqueta de su estado ('Libre', 'Ocupada', 'Pedido listo' o 'Pidió la cuenta'); una inactiva muestra la marca 'Desactivada' y no etiqueta de estado; y cada fila ofrece 'Renombrar' y 'Desactivar' en las activas o 'Renombrar' y 'Activar' en las inactivas.

**AC-03 (estados de la pantalla).** Cuando la consulta está pendiente, muestra 'Cargando mesas...' (role status); cuando falla, 'No se pudo cargar la lista de mesas.' (role alert) con 'Reintentar' que vuelve a consultar; cuando no hay mesas, 'Todavía no hay mesas.' con el alta en línea visible; con un ApiError UNAUTHENTICATED el cliente lleva a /login.

**AC-04 (navegación y guardia).** /admin muestra el enlace 'Mesas' junto a 'Usuarios' y 'Carta'; /admin/mesas está bajo RoleGuard con area="/admin": un mozo que entra es llevado a /mozo y un admin entra con normalidad.

### 4.3 Alta por nombre

**AC-05 (alta en línea).** Con el campo 'Nombre de la mesa' y 'Agregar mesa', cuando el admin escribe 'Balcón 1' y agrega, entonces sale un solo POST /api/tables `{ name: 'Balcón 1' }` aunque toque el botón dos veces, y tras el 201 la mesa aparece en la lista releída con el campo limpio.

**AC-06 (validación y errores del alta).** Un nombre vacío o con caracteres fuera de la clase se corta en local con el mensaje del esquema junto al campo (sin salir la petición); el 409 TABLE_NAME_TAKEN muestra 'Ya existe una mesa con ese nombre.' —incluso cuando la otra mesa está desactivada— y el campo conserva lo escrito; el fallo de red muestra 'Sin conexión con el servidor. Revisa el wifi e intenta de nuevo.'.

### 4.4 Renombrar

**AC-07 (diálogo de renombrado).** Al tocar 'Renombrar' en una fila se abre 'Renombrar mesa' con 'Nombre de la mesa' precargado con el nombre actual; 'Guardar' está inhabilitado mientras el nombre no cambie y con un nombre nuevo envía PATCH `{ name }` → 200 → la fila muestra el nombre nuevo; 'Cancelar' cierra sin enviar.

**AC-08 (errores del renombrado).** El 409 TABLE_NAME_TAKEN muestra 'Ya existe una mesa con ese nombre.' y la fila conserva el nombre anterior; renombrar una mesa con pedido abierto responde 200 y la fila cambia con normalidad; un 404 muestra 'Esa mesa no existe.'; la validación local corta el nombre inválido igual que en el alta.

### 4.5 Activar y desactivar

**AC-09 (desactivar con confirmación).** 'Desactivar' en una fila activa abre '¿Desactivar <nombre>? No aparecerá en el tablero del mozo.' con 'Sí, desactivar' y 'Cancelar'; al confirmar sale PATCH `{ isActive: false }` → 200 → la fila pasa a 'Desactivada' y ofrece 'Activar'; 'Cancelar' no envía nada.

**AC-10 (desactivar ocupada y reactivar).** Si el servidor responde 409 TABLE_HAS_OPEN_ORDER se muestra 'La mesa tiene un pedido abierto; ciérralo o muévelo antes de desactivarla.' y la fila sigue activa; 'Activar' en una fila desactivada envía PATCH `{ isActive: true }` sin confirmación → 200 → la fila vuelve a activa con su estado 'Libre'.

### 4.6 Extremo a extremo (Playwright, mobile-chrome 360×740, sobre polleria_test)

**AC-11 (E2E: ciclo de vida de una mesa por pantalla).** Dado el admin E2E logueado, cuando entra a /admin/mesas, entonces agrega una mesa por la interfaz, la renombra, la desactiva con la confirmación (desaparece su etiqueta de estado y aparece 'Desactivada'), la reactiva, y al intentar agregar otra con el mismo nombre en otras mayúsculas ve 'Ya existe una mesa con ese nombre.'; sin desplazamiento horizontal en la pantalla.

### 4.7 Cobertura de requisitos

| Requisito | AC que lo cubren |
| --- | --- |
| RNF-12 (mesas configurables desde el sistema) | AC-01 a AC-10, AC-11 |
| RNF-02 (español sencillo, botones grandes) | AC-02 a AC-10, R-012-07 |
| RNF-05 / RNF-07 / RNF-08 (red local, 360 px, celular/tablet del admin) | AC-11 (mobile-chrome) |
| RNF-09 (configuración solo rol admin) | AC-04 |

## 5. Requisitos verificables

| ID | Requisito | Cómo se verifica |
| --- | --- | --- |
| R-012-01 | docs/api/openapi.yaml queda en la versión 0.9.0 sin cambios y sigue válido | diff vacío respecto a main; lint de Redocly como en las specs anteriores |
| R-012-02 | apps/api y packages/shared no cambian: ni rutas, ni servicios, ni modelos, ni esquemas, ni tests | `git status --porcelain apps/api packages/shared` vacío al cerrar la funcionalidad |
| R-012-03 | Sin migraciones ni variables de entorno nuevas | diff vacío en las migraciones y en los .env.example |
| R-012-04 | La web sigue sin recursos de internet y llama solo a /api del mismo origen | grep de R-14 de la 001 sobre apps/web/src y revisión del cliente |
| R-012-05 | Cobertura de líneas: 80 % o más en apps/web (shared no cambia) | pnpm test:coverage |
| R-012-06 | Definición de terminado de CLAUDE.md | pnpm test, pnpm lint, pnpm typecheck y pnpm test:e2e en verde; cada AC con al menos una prueba que empieza con su ID |
| R-012-07 | /admin/mesas pasa por RoleGuard area '/admin' y la pantalla no muestra acciones del ciclo del pedido | el reviewer lee las páginas |

## 6. Reglas de negocio

Las reglas fijadas en specs anteriores siguen vigentes y la pantalla las respeta sin reabrirlas:

- De la 009 (D-009-12 / RN-009-09): las mesas las configura el admin y nunca se borran — se desactivan estando libres y pueden reactivarse; nombre de 1 a 40 caracteres con su clase de caracteres, único sin distinguir mayúsculas, también contra mesas desactivadas; desactivar una mesa con pedido abierto responde 409; renombrar o reactivar con pedido abierto está permitido; toda mesa nace activa y libre.
- De la 009 (D-009-03): el estado de la mesa se deriva del pedido, nunca se guarda — la pantalla solo lo lee y lo traduce con TABLE_STATE_LABELS.
- De la 003/004: la configuración es solo del rol admin; la sesión viaja en la cookie; los textos son español de Perú sencillo; POST y PATCH llevan las guardias de contenido JSON del servidor.
- De CLAUDE.md: la web funciona en la red local sin internet (regla 9); nada de dinero ni octavos en esta pantalla.

Reglas nuevas de esta spec (todas de interfaz; ninguna cambia el dominio):

| ID | Regla |
| --- | --- |
| RN-012-01 | La pantalla no agrega ni modifica endpoints: consume el contrato 0.9.0 tal cual. |
| RN-012-02 | La lista del admin muestra TODAS las mesas, activas e inactivas; el tablero del mozo sigue filtrando solo las activas (nada cambia ahí). |
| RN-012-03 | El estado derivado se muestra solo como información; la pantalla no ofrece acciones del ciclo del pedido (abrir, mover, unir, etc. son del mozo). |
| RN-012-04 | Desactivar pide confirmación; activar, renombrar y dar de alta no. Los mensajes del servidor se muestran tal cual. |
| RN-012-05 | Controles de al menos 48 px, español de Perú y sin desplazamiento horizontal a 360 px. |
| RN-012-06 | Sin polling: la lista se consulta al entrar y se relee tras cada mutación propia. |

## 7. Casos borde conocidos

- Nombre que solo difiere en mayúsculas o tildes de otra mesa —incluso una desactivada—: el índice único responde TABLE_NAME_TAKEN y el mensaje lo dice claro ('Ya existe una mesa con ese nombre.'); el campo conserva lo escrito.
- Desactivar una mesa que un mozo acaba de ocupar: la API lo detecta con la fila bloqueada y responde TABLE_HAS_OPEN_ORDER; la fila sigue activa y el mensaje explica qué hacer.
- Renombrar una mesa ocupada o con 'Pedido listo': permitido por la API — el tablero del mozo muestra el nombre nuevo en su siguiente polling sin tocar el pedido.
- Mesa renombrada o desactivada desde otro dispositivo a la vez: el último PATCH confirmado gana; la pantalla relee la lista tras cada mutación propia, y un 404 muestra 'Esa mesa no existe.'.
- Salón sin mesas (instalación nueva): 'Todavía no hay mesas.' con el alta en línea a la vista.
- Nombre con espacios dobles o alrededor: el esquema los recorta y colapsa; la fila muestra el nombre ya normalizado que devuelve el servidor, no el borrador.
- Nombre de 41+ caracteres o con emojis/signos: lo corta la validación local con el mensaje del esquema; si llegara al servidor, el 400 muestra sus issues igual.
- Sesión vencida con la pantalla abierta: la siguiente consulta o mutación responde 401 y el cliente lleva a /login; el nombre en borrador se pierde.
- El admin desactiva la mesa equivocada: 'Activar' en la misma fila la revierte de inmediato (la mesa nunca se borra — el historial está a salvo).
- El mozo tiene el tablero abierto mientras el admin desactiva una mesa libre: la mesa desaparece del tablero en su siguiente polling (comportamiento de la 011, nada nuevo).

## 8. Modelo de datos

Sin cambios: ni tablas, ni columnas, ni migraciones (D-012-10). Todo lo que la pantalla necesita ya existe en `tables` (id, name, is_active, current_order_id) y en la derivación de estado de la spec 009.

## 9. API

Sin cambios de contrato: docs/api/openapi.yaml queda en la versión 0.9.0. La pantalla consume:

| Método y ruta | Roles | Uso en la pantalla |
| --- | --- | --- |
| GET /api/tables | cualquier rol con sesión | La lista completa al entrar y tras cada mutación |
| POST /api/tables | admin | 'Agregar mesa' con `{ name }` (201 `Table`) |
| PATCH /api/tables/{tableId} | admin | 'Renombrar' con `{ name }`; 'Desactivar'/'Activar' con `{ isActive }` (200 `Table`) |

Errores que la pantalla maneja: 400 VALIDATION_ERROR (issues por path, incluido `name`), 401 UNAUTHENTICATED (lleva a /login), 403 FORBIDDEN, 404 TABLE_NOT_FOUND, y los 409 TABLE_NAME_TAKEN y TABLE_HAS_OPEN_ORDER con su `message` tal cual. Sin eventos Socket.IO ni operaciones del pedido (son del mozo).

## 10. Interfaz

Textos en español de Perú, botones y controles de al menos 48 px, marco de RoleGuard area '/admin'. Las rutas exactas de los componentes internos las decide el implementador dentro de apps/web/src/components/ (por ejemplo components/tables/); lo que fija esta spec son los nombres accesibles y los textos (los tests los buscan por rol y nombre).

### 10.1 /admin/mesas — lista y alta

- h1 'Mesas' con el enlace 'Volver a administración' hacia /admin (o el patrón de navegación que ya use /admin/carta y /admin/usuarios — el implementador sigue el existente).
- Bloque de alta al inicio: campo 'Nombre de la mesa' + botón 'Agregar mesa' ('Agregando...' mientras envía); el mensaje de validación o del servidor aparece junto al campo.
- Lista de filas (una por mesa, en el orden recibido): nombre en texto grande; a un costado la etiqueta del estado ('Libre'/'Ocupada'/'Pedido listo'/'Pidió la cuenta') en las activas o 'Desactivada' en las inactivas; acciones 'Renombrar' y 'Desactivar'/'Activar' (enlaces o botones de ≥48 px).
- Estados: 'Cargando mesas...' (role status); 'No se pudo cargar la lista de mesas.' (role alert) + 'Reintentar'; 'Todavía no hay mesas.'.

### 10.2 Diálogos

- 'Renombrar mesa': campo 'Nombre de la mesa' precargado con el nombre actual, 'Guardar' (inhabilitado si el nombre no cambió; 'Guardando...' mientras envía) y 'Cancelar'; el mensaje del servidor (TABLE_NAME_TAKEN, issues) aparece junto al campo.
- '¿Desactivar <nombre>? No aparecerá en el tablero del mozo.' con 'Sí, desactivar' ('Desactivando...') y 'Cancelar'.
- El 409 TABLE_HAS_OPEN_ORDER se muestra junto a la fila (o en el diálogo si la confirmación sigue abierta), tal cual lo envía el servidor.

## 11. Contrato interno de módulos

| Módulo | Expone / cambia |
| --- | --- |
| apps/web/src/lib/api/tables.ts | suma `createTable(name)` y `updateTable(tableId, changes)` junto a las funciones de la 011, que quedan intactas |
| apps/web/src/app/admin/mesas/page.tsx (nuevo, 'use client', RoleGuard area '/admin') | la pantalla completa; componentes internos donde el implementador decida (p. ej. apps/web/src/components/tables/) |
| apps/web/src/app/admin/page.tsx | suma el enlace 'Mesas' junto a 'Usuarios' y 'Carta' |
| e2e/global-setup.ts (terreno del test-writer) | conserva la semilla vigente (usuarios, carta, 'E2E Mesa 1' a 'E2E Mesa 4') — no se esperan cambios |
| e2e/tables-admin.spec.ts (nuevo) | el recorrido de AC-11 en mobile-chrome |
| apps/api, packages/shared, la base, docs/api/openapi.yaml | sin cambios |

## 12. Cambios a specs anteriores

Ninguno en contrato ni dominio. La 012 solo consume lo ya aprobado (openapi.yaml queda en 0.9.0) con toques aditivos dentro de apps/web: lib/api/tables.ts suma dos funciones al archivo de la 011, app/admin/page.tsx suma el enlace 'Mesas' (mismo cambio que la 008 hizo con 'Carta') y nace app/admin/mesas/page.tsx.

## 13. Dependencias

Ninguna nueva ni de soporte: TanStack Query, MSW, Playwright, HeroUI, Tailwind, Zod y los esquemas de shared (createTableRequestSchema, updateTableRequestSchema, tableSchema, tablesResponseSchema, TABLE_STATE_LABELS en la web) ya están instalados y aprobados. Sin variables de entorno nuevas. Sin ADR.

## 14. Fuera de alcance

- El tablero del mozo y cualquier operación del salón (abrir, mover, unir, separar, listo, servido, cuenta, cancelar, ítems, anulaciones): ya entregado en la 011 — la pantalla admin solo lee el estado derivado, no lo opera.
- Plano visual del salón con posiciones/coordenadas: descartado en la 009 (pregunta 11 resuelta).
- Número/capacidad de la mesa, número de personas, estados 'limpiando/reservada': decisiones de la 009.
- Borrado de mesas: una mesa nunca se borra (RN-009-09); el historial de pedidos la referencia.
- Bandeja de solicitudes de anulación, cocina y comandas impresas (Fase 3), caja y cobro (Fase 4), stock (Fase 5), reportes y bitácoras (Fase 6).
- Socket.IO y cualquier evento en tiempo real; polling siquiera (RN-012-06).
- Seed de mesas y datos de demo: Fase 6; las mesas se crean por esta pantalla o por API mientras tanto.
- Cambios en la API, la base, shared o el contrato (hueco real → pregunta 7, nunca solución desde la web).

## 15. Riesgos

- **El admin desactiva la mesa equivocada en pleno servicio:** mitigación — la confirmación dice el nombre y 'Activar' en la misma fila la revierte sin pérdida; una mesa desactivada por error solo se oculta del tablero hasta reactivarse (los pedidos históricos no se tocan).
- **Nombre repetido contra una mesa desactivada que el admin no veía:** mitigación — la lista muestra también las inactivas y el mensaje 'Ya existe una mesa con ese nombre.' lo explica; reactivar la existente suele ser lo que se quiere.
- **Sin polling, el estado derivado puede quedarse viejo mientras la pantalla está abierta:** riesgo bajo aceptado — esta pantalla configura, no vigila; la lista se relee tras cada acción propia y el tablero del mozo sigue con su polling de 5 s.
- **Dos administradores editando el salón a la vez:** el último PATCH confirmado gana y la unicidad de nombres la resuelve el índice; riesgo bajo real en una pollería con un solo admin (pregunta abierta en la 004/005, mismo criterio).
- **Pantalla tan pequeña que el patrón de tres rutas habría sido más coherente:** se justifica en D-012-02 y queda como pregunta 1 — si el usuario prefiere el patrón completo, el cambio es solo de rutas, no de AC sustantivos.

## 16. Supuestos

| ID | Supuesto |
| --- | --- |
| S-012-01 | Solo apps/web + dos funciones en lib/api/tables.ts; API, base, shared y openapi.yaml 0.9.0 sin cambios (D-012-01). |
| S-012-02 | Una sola pantalla /admin/mesas con acciones por fila y el enlace 'Mesas' en /admin, no el patrón de tres rutas (D-012-02). |
| S-012-03 | Alta por nombre en línea al inicio de la pantalla (D-012-03). |
| S-012-04 | Renombrar por diálogo con el nombre precargado; 'Guardar' inhabilitado sin cambios; renombrar con pedido abierto permitido (D-012-04). |
| S-012-05 | 'Desactivar' pide confirmación y 'Activar' no; TABLE_HAS_OPEN_ORDER tal cual (D-012-05). |
| S-012-06 | La fila activa muestra su estado derivado con TABLE_STATE_LABELS, solo informativo; sin polling (D-012-06). |
| S-012-07 | Lista completa sin paginar ni buscador, todas las mesas en el orden de la API (D-012-07). |
| S-012-08 | Validación local con tableNameSchema, mensajes del servidor tal cual, un solo envío en vuelo (D-012-08). |
| S-012-09 | Mobile-first a 360 px con controles ≥48 px; la PC del local usa la misma web fluida (D-012-09). |
| S-012-10 | Sin migraciones, variables, dependencias ni ADR (D-012-10). |
| S-012-11 | Un recorrido E2E en mobile-chrome con la semilla vigente (D-012-11). |

## 17. Preguntas abiertas (con recomendación) — respondidas por el usuario el 2026-10-12: se aceptan las 7 recomendaciones

1. **¿Una sola pantalla /admin/mesas con acciones por fila, o el patrón de tres rutas (lista + /nuevo + /[id]) de la 004/008?** Se propone una sola: la mesa solo tiene nombre y activa/inactiva; una página de edición entera para un campo sería navegación vacía en el celular. Se conserva el resto del patrón (lista completa, confirmación, mensajes del servidor, MSW). Recomendación: aceptar la pantalla única.
2. **¿Mostrar el estado operativo derivado (Libre/Ocupada/Pedido listo/Pidió la cuenta) en la lista del admin, o solo activa/inactiva?** Se propone mostrarlo solo informativo: explica por qué 'Desactivar' puede fallar con TABLE_HAS_OPEN_ORDER y da contexto del salón sin duplicar el tablero. Recomendación: mostrarlo.
3. **¿Confirmación para desactivar?** Se propone sí —mismo patrón que productos y usuarios— porque esconde la mesa del tablero del mozo; activar, renombrar y dar de alta actúan sin confirmación. Recomendación: aceptar.
4. **¿Renombrar una mesa con pedido abierto?** La API lo permite (solo bloquea `isActive: false` sobre una mesa cubierta) y no afecta al pedido: el tablero muestra el nombre nuevo en su próxima lectura. Recomendación: permitirlo.
5. **¿El alta en línea al inicio de la pantalla o en una página/diálogo aparte?** Se propone en línea: es un solo campo y el recorrido natural es agregar varias de corrido. Recomendación: aceptar.
6. **¿E2E solo en mobile-chrome o también en desktop-chrome?** El dispositivo objetivo es el celular/tablet del admin; la PC del local corre la misma web fluida ya verificada en desktop por la 004/008. Recomendación: un solo recorrido en mobile-chrome.
7. **¿Se detectó algún hueco real en la API?** Ninguno: GET/POST/PATCH /api/tables cubren lista, alta, renombrar y activar/desactivar con sus errores; si en la implementación apareciera un hueco se reporta al orquestador como tarea de backend separada — nunca se tapa desde la web (misma regla de la 011).

## 18. Acción del usuario y verificación manual

1. Aprobar o ajustar las respuestas de la sección 17 (especialmente la 1: pantalla única vs. patrón de tres rutas).
2. Sin migraciones ni acciones de base: la 012 no toca el esquema (la migración de mesas ya se aplicó con la 009).
3. Verificación manual tras la implementación: con `pnpm dev` y la cookie de un admin, recorrer /admin/mesas — agregar 'Mesa 11' y 'Barra'; renombrar una; intentar un nombre repetido con otras mayúsculas (mensaje claro); desactivar una libre con la confirmación y verla desaparecer del tablero del mozo; intentar desactivar una ocupada (mensaje del pedido abierto); reactivarla; todo a 360 px sin desplazamiento horizontal y también en la PC del local.
4. El cierre documental registra el merge a main cuando el orquestador lo autorice.
