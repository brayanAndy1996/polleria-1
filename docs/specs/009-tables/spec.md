# Spec 009 — Mesas del salón y ciclo de vida del pedido (dominio + API)

- Estado: Propuesta (pendiente de aprobación del usuario)
- Fase: 2 (Mesas y pedidos)
- Rama: feat/009-tables
- Fecha: 2026-10-10
- Cubre: RF-02 completo (el sistema muestra todas las mesas con su estado: libre, ocupada, pedido listo o cuenta solicitada) y RF-03 completo (el mozo puede abrir una mesa, cambiar un pedido de mesa y unir mesas; además separar una mesa unida por error). Crea la entidad `orders` (el pedido o cuenta abierta) de la que cuelgan los ítems de RF-04 a RF-07 (spec 010). Aporta a RNF-12 (las mesas se configuran desde el sistema, sin tocar código — por API del administrador), RNF-09 (cada operación exige el rol indicado) y RNF-04 (el modelo soporta 20 mesas y 5 dispositivos sin problema; la verificación de uso real queda para la spec de pantallas). Siembra la base de RF-25 y RF-27 (cada pedido registra quién lo abrió, quién lo cerró y por qué).
- Documentos relacionados: tasks.md (esta carpeta), docs/planificacion.md (RF-02, RF-03, módulo Mesas, HU-01 a HU-20 del proceso actual, preguntas para el dueño), docs/specs/003-users-pin-login/spec.md (sesión, requireAuth/requireRole), docs/specs/005-menu-products/spec.md (nombre único sin mayúsculas, desactivar sin borrar), docs/specs/006-portions-eighths/spec.md (RN-006-08: el ítem copiará porción, parte, precio y octavos; nota §19 pide evaluar GET /api/menu agregado — queda para la 010), docs/specs/007-combos/spec.md (RN-007-11: el ítem copiará los componentes del combo; serialización con FOR NO KEY UPDATE), docs/specs/008-menu-admin/spec.md (nota §19: evaluar GET /api/menu agregado — queda para la 010), docs/api/openapi.yaml (versión 0.7.0 → propuesta 0.8.0; esta spec solo propone el contrato: lo edita la implementación) y CLAUDE.md (reglas de dominio 2, 4, 5, 6 y 8; glosario: mesa = table, pedido = order, ítem = orderItem, comanda = kitchenTicket, pre-cuenta = bill, anulación = voidItem).

## 1. Contexto

La carta ya está completa (productos, presentaciones del pollo en octavos y combos, specs 005 a 008), pero el sistema todavía no sabe nada del salón: no hay mesas ni pedidos. Esta spec crea los dos conceptos que sostienen todo lo que viene: la **mesa** (mueble configurable del salón: nombre, activa o no) y el **pedido** (la cuenta abierta que cuelga de una o más mesas). Con ellas se resuelve RF-02 —cada mesa muestra su estado: libre, ocupada, pedido listo o cuenta solicitada— y RF-03 —abrir una mesa, cambiar un pedido de mesa y unir mesas—. Sin ítems todavía: los productos que se piden, las presentaciones, las cremas y las observaciones llegan en la spec 010, y las pantallas del mozo en la 011. Es dominio + API solamente, igual que las specs 005, 006 y 007.

### División propuesta de la Fase 2

| Spec | Contenido | RF |
| --- | --- | --- |
| 009-tables (esta) | Mesas + ciclo del pedido sin ítems: estados, abrir, mover, unir, separar, listo/servido, pedir cuenta, cancelar | RF-02, RF-03 |
| 010-order-items (propuesta) | Ítems del pedido (producto, presentación, parte, cantidad, cremas, observaciones), envío idempotente con Idempotency-Key (regla 5), comandas como registro por envío (RF-06; la impresión es Fase 3), anulación de ítem con admin y motivo (RF-07), copia de precio/componentes/octavos (regla 4), GET /api/menu agregado | RF-04 a RF-07 |
| 011-waiter-screens (propuesta) | Pantallas del mozo: plano de mesas con estados, toma de pedido, unir/mover/separar, listo/servido, pedir cuenta | las pantallas de RF-02 a RF-07 |
| 012-tables-admin (propuesta, pequeña; opcionalmente dentro de la 011) | Pantallas de administración de mesas en /admin | la parte visible de RNF-12 |

Por qué así: los pedidos se cuelgan de las mesas, así que las mesas van primero; se mantiene la separación dominio+API → pantallas que funcionó en la Fase 1 (005-007 dominio, 008 pantallas); y los ítems son la parte más compleja (copia de precio, idempotencia, comandas, anulación con auditoría) y merecen spec propia.

## 2. Historias de usuario

| ID | Historia |
| --- | --- |
| HU-009-01 | Como administrador (dueño), quiero dar de alta las mesas de mi local con su nombre ("Mesa 1", "Barra", "Terraza 2"), activarlas y desactivarlas, para que el sistema refleje mi salón sin tocar código. |
| HU-009-02 | Como mozo, quiero ver todas las mesas con su estado (libre, ocupada, pedido listo, cuenta solicitada), para saber dónde atender sin recorrer el salón. |
| HU-009-03 | Como mozo, quiero abrir una mesa cuando se sienta un cliente, para que quede ocupada y tenga su cuenta abierta. |
| HU-009-04 | Como mozo, quiero cambiar un pedido de mesa (la familia se movió de la 3 a la 7), para que la cuenta siga al cliente sin rehacerla. |
| HU-009-05 | Como mozo, quiero unir una mesa a la cuenta de otra (juntaron la 4 con la 3 para un grupo grande), para que todo se cobre en una sola cuenta. |
| HU-009-06 | Como mozo, quiero separar una mesa que uní por error o porque el grupo se reacomodó, sin perder la cuenta. |
| HU-009-07 | Como cocina (o el mozo cuando cocina avisa), quiero marcar el pedido como listo, y como mozo marcarlo servido al llevarlo, para que el tablero muestre qué mesa espera su plato. |
| HU-009-08 | Como mozo, quiero marcar que una mesa pidió la cuenta, para que caja y el salón lo vean al instante. |
| HU-009-09 | Como administrador, quiero cancelar un pedido abierto por error registrando el motivo, para que no queden mesas ocupadas de mentira y quede el registro. |
| HU-009-10 | Como sistema, quiero garantizar que una mesa tenga a lo sumo un pedido abierto, para que nunca haya dos cuentas peleando por la misma mesa. |

## 3. Decisiones técnicas

Pendientes de confirmación del usuario; las que parten como supuesto llevan la marca SUPUESTO con su ID S-009-xx.

**D-009-01. Alcance: solo dominio + API, sin pantallas (SUPUESTO S-009-01).**
- Igual que las specs 005, 006 y 007: esta spec deja listo el modelo (tables y orders), los esquemas compartidos, los servicios y las rutas. Las pantallas del mozo son la spec 011 y la administración de mesas por pantalla la 012 (o la 011 si el usuario lo prefiere). No hay tareas de frontend-dev ni pruebas E2E.
- Consecuencia: ningún archivo de apps/web cambia.

**D-009-02. Una mesa apunta a su pedido abierto: `tables.current_order_id` (SUPUESTO S-009-02).**
- `tables` guarda la configuración del salón (nombre, activa) y un puntero `current_order_id` al pedido abierto que la cubre, o NULL si está libre. Un pedido puede cubrir varias mesas (mesas unidas): las mesas de un pedido son las que apuntan a él (`WHERE current_order_id = :orderId`).
- La regla "una mesa tiene a lo sumo un pedido abierto" (HU-009-10) sale gratis de la columna: ocupar una mesa es un solo `UPDATE tables SET current_order_id = :order WHERE id = :table AND current_order_id IS NULL` — si afecta 0 filas, la mesa estaba ocupada y responde 409 TABLE_OCCUPIED. Dos mozos que abren la misma mesa a la vez se serializan en la fila de la mesa sin código extra: es la misma lección de concurrencia de la 006/007, aplicada con la forma más simple posible (una columna, no una tabla puente).
- Por qué el puntero vive en `tables` y no `orders.table_id` ni una tabla `order_tables`: con `orders.table_id` un pedido solo podría cubrir una mesa y unir sería otra estructura; con `order_tables` haría falta garantizar "una mesa, un pedido abierto" con lógica adicional (la unicidad parcial no puede ver el estado del pedido en otra tabla). La columna invertida da la unicidad por construcción y hace el cambio de mesa/unión un UPDATE condicional atómico.
- Cuando el pedido se cierra, cancela o fusiona, el puntero de todas sus mesas queda en NULL en la misma transacción. Un pedido abierto siempre cubre al menos una mesa (RN-009-07); el caso de pedido sin mesa ("para llevar", RF-12) es una vía distinta que nace sin mesas y se decide en su propia fase — el modelo ya lo admite.
- La base garantiza la forma (FK, NULL permitido); el servicio garantiza las invariantes cruzadas (un pedido no abierto no tiene mesas apuntando, una mesa inactiva no se ocupa) — mismo reparto que la 007 entre CHECK y servicio.

**D-009-03. El estado de la mesa se deriva del pedido que la cubre (SUPUESTO S-009-03).**
- Los cuatro estados de RF-02 se calculan, no se guardan:
  - `free` (libre): `current_order_id` es NULL.
  - `occupied` (ocupada): tiene pedido abierto sin marcas.
  - `ready` (pedido listo): el pedido tiene `ready_at` puesto — cocina avisó y falta recoger.
  - `bill_requested` (cuenta solicitada): el pedido tiene `bill_requested_at` puesto.
- Si un pedido tiene las dos marcas (pidió la cuenta y llegó comida lista), gana `ready`: el plato se enfría (HU-11 del proceso actual: "los platos se enfrían esperando a que el mozo los recoja"). Las dos marcas llegan igual en el `order` embebido —la pantalla puede mostrar ambas—, pero el `state` es uno solo.
- Derivado y no columna: el estado nunca puede contradecir al pedido (mismo criterio que los octavos derivados de la 006, D-006-04).

**D-009-04. El pedido es una entidad `orders` con ciclo de vida propio (SUPUESTO S-009-04).**
- `orders` es la cuenta abierta de una mesa (o de varias unidas): guarda quién la abrió (`opened_by_user_id`, base de ventas por mozo RF-25 y auditoría RF-27), cuándo, las dos señales operativas (`ready_at`/`ready_by_user_id`, `bill_requested_at`/`bill_requested_by_user_id`) y el cierre (`closed_at`/`closed_by_user_id`, `cancel_reason`, `merged_into_order_id`).
- `status`: `open` (abierto) → `closed` (cerrado por cobro — lo ejecuta la caja en la Fase 4, aquí solo existe el estado), `cancelled` (cancelado por el administrador con motivo) o `merged` (absorbido por otro pedido al unir mesas). Los pedidos nunca se borran: son el historial.
- Las señales no son estados del ciclo: un pedido puede estar "listo" varias veces (cada tanda de comida) y "cuenta solicitada" mientras sigue abierto. Por eso son columnas de fecha+autor que se ponen y se quitan, ortogonales a `status`.

**D-009-05. Quién hace cada operación (SUPUESTO S-009-05).**
- Lectura (GET /api/tables, GET /api/orders/{orderId}): cualquier rol con sesión — igual que la carta.
- Operaciones de salón (abrir, mover, unir, separar, pedir cuenta, marcar servido): `waiter` o `admin`. El administrador puede operar el salón igual que entra a todas las áreas (003, revisión 1).
- Marcar listo (`ready`): `kitchen`, `waiter` o `admin` — lo normal es que lo marque cocina si alguna vez usa una pantalla, o el mozo cuando cocina le avisa como hoy (pregunta 3).
- Cancelar un pedido (`cancel`): `waiter` o `admin` mientras el pedido no tenga ítems (en esta spec nunca hay ítems, así que ambos pueden); cuando la 010 agregue ítems, un pedido con ítems solo lo cancela el admin — detalle en RN-009-08.
- Configuración de mesas (POST/PATCH /api/tables): solo `admin` (RNF-12).

**D-009-06. Abrir una mesa crea el pedido y ocupa la mesa de una vez (SUPUESTO S-009-06).**
- `POST /api/tables/{tableId}/orders` sin cuerpo: crea el `orders` (status 'open', opened_by = el usuario de la sesión) y ocupa la mesa en una transacción — primero el UPDATE condicional de la mesa (D-009-02; si no afecta filas, 409 TABLE_OCCUPIED) y luego el INSERT del pedido, o al revés con rollback si la ocupación falla. La mesa debe existir (404 TABLE_NOT_FOUND) y estar activa (409 TABLE_INACTIVE).
- Es idempotente de forma natural, sin Idempotency-Key: un segundo intento (doble clic, reintento de red) choca con la mesa ya ocupada y responde 409 — nunca crea un segundo pedido ni una segunda cuenta. La regla de dominio 5 (Idempotency-Key) aplica al envío de ítems a cocina en la 010, donde el reenvío sí podría duplicar trabajo real.

**D-009-07. Mover un pedido de mesa (SUPUESTO S-009-07).**
- `POST /api/orders/{orderId}/move` con `{ tableId }`: el pedido completo pasa a la mesa destino — todas las mesas que cubría quedan libres y la destino queda cubierta. La mesa destino debe existir (issue en `tableId` si no existe), estar activa (409 TABLE_INACTIVE) y libre (409 TABLE_OCCUPIED). El pedido debe estar abierto (404 ORDER_NOT_FOUND / 409 ORDER_NOT_OPEN).
- Si el pedido ya cubre solo la mesa destino, es un no-op idempotente: 200 sin cambios. Si el pedido cubre varias mesas unidas y el grupo se movió a dos mesas, el flujo es mover a la primera y unir la segunda (D-009-08).
- Las señales `ready_at`/`bill_requested_at` viajan con el pedido (son del pedido, no de la mesa).

**D-009-08. Unir mesas: la mesa origen se suma a la cuenta de la mesa destino (SUPUESTO S-009-08).**
- `POST /api/tables/{tableId}/join` con `{ intoTableId }`. La mesa destino debe tener un pedido abierto — unir es "sumarse a una cuenta", no crear una (para eso está abrir) —, existir y estar activa. Los problemas del destino van como issues en `intoTableId` si son de formato o existencia, o como 409 TABLE_INACTIVE / TABLE_HAS_NO_ORDER si son de estado; el reparto ruta→código / cuerpo→issue es el mismo de la 007.
- Origen libre: la mesa se suma al pedido del destino (el grupo creció). Origen ocupada por su propio pedido: los dos pedidos se fusionan — todas las mesas del pedido origen se repointan al pedido destino, el pedido origen pasa a `status = 'merged'` con `closed_at`, `closed_by_user_id` y `merged_into_order_id` apuntando al destino, y el pedido destino queda como la única cuenta. En la 010 los ítems del pedido origen se mueven al destino en la misma operación (regla declarada en RN-009-05; aquí no hay ítems todavía).
- Unir a una mesa que ya comparte el mismo pedido es un no-op idempotente: 200 sin cambios (re-tap inofensivo). Unir una mesa consigo misma es un error del cliente: 400 con issue en `intoTableId` ('La mesa de destino debe ser otra.').
- Concurrencia: dentro de la transacción se bloquean en orden de id las filas de los pedidos involucrados y de las mesas (FOR NO KEY UPDATE, el patrón de la corrección de la 006: las filas de orders y tables son referenciadas por FK ajenas y FOR UPDATE chocaría con el FOR KEY SHARE de los inserts concurrentes), y se re-verifican los estados antes de confirmar.
- La respuesta es 200 con el pedido que sobrevive (el del destino), que ahora lista todas las mesas unidas.

**D-009-09. Separar una mesa unida (SUPUESTO S-009-09).**
- `POST /api/tables/{tableId}/leave` sin cuerpo: la mesa deja de apuntar a su pedido y queda libre. El pedido sigue abierto con sus otras mesas.
- Guardias: la mesa existe (404), está cubierta por un pedido abierto (409 TABLE_HAS_NO_ORDER si está libre) y no es la última del pedido — soltar la última mesa dejaría un pedido de salón sin mesas, es 409 ORDER_NEEDS_TABLE ('El pedido necesita al menos una mesa; cancélalo o ciérralo.').
- La separación no reparte ítems: los ítems son del pedido (010), no de la mesa; separar solo suelta el mueble. Dividir la cuenta entre mesas es un tema de caja (RF-15, Fase 4), no de salón.

**D-009-10. Señales listo/servido y cuenta solicitada (SUPUESTO S-009-10).**
- `POST /api/orders/{orderId}/ready` (waiter, kitchen, admin): pone `ready_at` y `ready_by_user_id` si no estaban. Repetir es no-op 200 — conserva la primera marca, que es la hora real en que cocina avisó.
- `POST /api/orders/{orderId}/served` (waiter, admin): limpia `ready_at`/`ready_by_user_id`. Si no estaba listo, no-op 200. Sirve también para corregir un "listo" marcado por error. Un nuevo `ready` después vuelve a marcar (otra tanda lista).
- `POST /api/orders/{orderId}/request-bill` (waiter, admin): pone `bill_requested_at`/`bill_requested_by_user_id` si no estaban; repetir es no-op 200. No hay acción de "des-pedir la cuenta" en esta spec: la marca se limpia sola al cerrar/cancelar/fusionar el pedido, y la 010 la limpiará cuando se agreguen ítems nuevos a un pedido que ya pidió cuenta (la pre-cuenta cambia; nota §19).
- Todas exigen pedido abierto: 409 ORDER_NOT_OPEN sobre un pedido cerrado, cancelado o fusionado.

**D-009-11. Cancelar un pedido abierto (SUPUESTO S-009-11).**
- `POST /api/orders/{orderId}/cancel` con `{ reason }` obligatorio (1 a 200 caracteres recortados): pasa a `status = 'cancelled'` con `cancel_reason`, `closed_at`/`closed_by_user_id`, y libera todas sus mesas en la misma transacción.
- En esta spec un pedido nunca tiene ítems (no existen), así que cancelar siempre es seguro y lo pueden hacer waiter y admin. Regla declarada para la 010 (RN-009-08): si el pedido tiene ítems activos no se puede cancelar (primero se anula cada ítem, RF-07), y si alguna vez tuvo ítems la cancelación pasa a ser solo admin — el rastro queda en las anulaciones de ítems.
- El motivo se pide siempre, aunque el pedido esté vacío: mantiene la costumbre de registrar el porqué (espíritu de RF-07 y RF-27) y cuesta lo mismo validarlo siempre que condicionarlo.

**D-009-12. Configuración de mesas por el administrador (SUPUESTO S-009-12).**
- `POST /api/tables` con `{ name }` → 201; `PATCH /api/tables/{tableId}` con `{ name?, isActive? }` (al menos una propiedad) → 200. Una mesa nunca se borra: se desactiva (`is_active = false`) y puede reactivarse — igual que los productos (RN-005-10), así el historial de pedidos no pierde su mesa.
- El nombre es texto libre de 1 a 40 caracteres (letras, números, espacios, punto, guion, guion bajo; se recorta, normaliza NFC y reduce espacios seguidos, igual que los nombres de producto/displayName), único sin distinguir mayúsculas (índice por expresión `lower(name)`, igual que `products_name_unique`): 'Mesa 1' y 'mesa 1' chocan → 409 TABLE_NAME_TAKEN.
- No hay número ni posición: el orden del tablero es por nombre con colación natural (`Intl.Collator('es', { sensitivity: 'base', numeric: true })`), así 'Mesa 2' va antes que 'Mesa 10' sin un campo de orden que mantener. Un plano con coordenadas queda fuera (pregunta 11).
- Desactivar una mesa ocupada (con pedido abierto cubriéndola) responde 409 TABLE_HAS_OPEN_ORDER: primero hay que cerrar, mover o cancelar el pedido. Desactivar una mesa libre es directo.

**D-009-13. Errores (formato común).**

| code | HTTP | message | details | Cuándo |
| --- | --- | --- | --- | --- |
| VALIDATION_ERROR | 400 | Los datos enviados no son válidos. | `{ issues }` | Cuerpo inválido (name fuera de forma, reason fuera de rango, propiedad de más), `tableId`/`orderId` de ruta inválidos (issue en `tableId`/`orderId` con 'El identificador de la mesa no es válido.' / 'El identificador del pedido no es válido.'), o problemas de dato de las referencias del cuerpo: `intoTableId`/`tableId` del cuerpo inválido, inexistente ('Esa mesa no existe.') o igual a la de la ruta ('La mesa de destino debe ser otra.'). |
| TABLE_NOT_FOUND | 404 | Esa mesa no existe. | null | El `tableId` de la ruta no existe. |
| ORDER_NOT_FOUND | 404 | Ese pedido no existe. | null | El `orderId` de la ruta no existe. |
| TABLE_NAME_TAKEN | 409 | Ya existe una mesa con ese nombre. | null | POST o PATCH /api/tables con un nombre ya usado por otra mesa, activa o inactiva. |
| TABLE_OCCUPIED | 409 | La mesa ya tiene un pedido abierto. | null | Abrir sobre una mesa cubierta; mover a una mesa cubierta. |
| TABLE_INACTIVE | 409 | La mesa está desactivada. | null | Abrir, unir o mover hacia/con una mesa desactivada. |
| TABLE_HAS_OPEN_ORDER | 409 | La mesa tiene un pedido abierto; ciérralo o muévelo antes de desactivarla. | null | PATCH isActive: false sobre una mesa cubierta. |
| TABLE_HAS_NO_ORDER | 409 | La mesa no tiene un pedido abierto. | null | Unir hacia una mesa libre (el destino debe tener cuenta abierta) o separar una mesa libre. |
| ORDER_NOT_OPEN | 409 | El pedido ya está cerrado. | null | Cualquier operación (move, join, leave, request-bill, ready, served, cancel) sobre un pedido closed, cancelled o merged. |
| ORDER_NEEDS_TABLE | 409 | El pedido necesita al menos una mesa; cancélalo o ciérralo. | null | Separar la última mesa de un pedido. |

- Los nueve códigos se suman a ERROR_CODES de @polleria/shared. Ningún 4xx se registra en el log (RN-001-07). Los parámetros de ruta usan la misma regla que `productId` (`^[0-9]+$`, 1..2147483647).
- Regla de reparto: los problemas de la entidad de la RUTA responden su código (404/409); los problemas de DATO de las referencias del CUERPO (formato, inexistencia, misma entidad) son issues de un VALIDATION_ERROR; los problemas de ESTADO de cualquier referencia responden su 409.

**D-009-14. Respuestas: la mesa lleva su pedido embebido (SUPUESTO S-009-13).**
- `Table` = `{ id, name, isActive, state, order }` con `order` null en mesa libre. `Order` = `{ id, status, tables, openedBy, openedAt, readyAt, billRequestedAt, closedAt, closedBy, cancelReason, mergedIntoOrderId }`: `tables` es la lista de `{ id, name }` de todas las mesas que cubre (el tablero muestra "Mesas 3 y 4"), `openedBy`/`closedBy` son `{ id, displayName }`, y las marcas llegan como fecha ISO o null para que la interfaz pueda mostrar ambas aunque `state` elija una (D-009-03).
- GET /api/tables devuelve todas las mesas —activas e inactivas, igual que la carta devuelve todos los productos— ordenadas por nombre con colación natural; quien dibuja el tablero filtra `isActive`.
- Un pedido cerrado/cancelado/fusionado conserva sus datos (GET /api/orders/{orderId} responde 200 con su `status`): `tables` sale vacía porque ninguna mesa lo apunta ya, `closedBy`/`cancelReason`/`mergedIntoOrderId` cuentan cómo terminó.

**D-009-15. Migración y limpieza de pruebas.**
- Una migración nueva `20261010120000-create-tables-orders.ts` (umzug): `up` crea `orders` primero y `tables` después (por la FK tables→orders), con sus CHECK, la unicidad por `lower(name)` y los índices; `down` borra `tables` y luego `orders` (revertir pierde sus datos; solo para desarrollo, como el resto).
- Limpieza de pruebas (sección 12): `resetMigrationTables` borra `tables` y `orders` antes que `users` (las FK lo exigen); helper nuevo `clearOrderTables` que trunca `orders` y `tables` en un solo TRUNCATE (tables referencia orders: un TRUNCATE por tabla falla igual que con products), cada una detrás de su `tableExists`. Las listas MIGRATIONS de los tests de migraciones reciben el nombre nuevo al final. Las tablas `orders` y `tables` quedan autorizadas para limpieza de pruebas igual que `products` y `combo_items` (solo polleria_test, con la doble verificación); además el CASCADE que ya tiene `clearAuthTables` (`TRUNCATE sessions, users ... CASCADE`) las alcanzaría por la FK orders→users — se documenta, no se depende de ello.

**D-009-16. Sin Socket.IO, sin seeds, sin variables de entorno, sin dependencias, sin ADR (SUPUESTO S-009-14).**
- La actualización en vivo del tablero la decide la spec de pantallas (011): recomiendo TanStack Query con refetch cada ~5 s para el prototipo (RNF-04 pide 5 dispositivos sin demoras; polling a esa escala sobra) y dejar socket.io —aprobado pero no instalado— para cuando un empuje lo justifique (por ejemplo, avisos de comanda lista de la Fase 3). Esta spec no emite eventos: la API es agnóstica.
- Sin seed de mesas en esta spec (los seeds de demo son Fase 6): el usuario crea sus mesas por la API (sección 18) hasta que llegue la pantalla de administración.
- No hay ADR: es modelado de dominio documentado en la spec, no cambio de arquitectura ni dependencia — mismo criterio que D-007-15.

## 4. Criterios de aceptación (AC)

Todos ejecutables con `pnpm test` en esta rama (packages/shared y apps/api contra su base aislada polleria_test). Casos felices y errores con el formato común `{ error: { code, message, details } }`, cuerpos exactos.

### 4.1 Esquemas y tipos compartidos (packages/shared/src/tables.ts y orders.ts + errors.ts)

**AC-01 (esquemas de petición).** Dados los esquemas estrictos nuevos, cuando se valida, entonces:

- `tableNameSchema`: acepta 'Mesa 1', 'Barra', 'T-2', 'MESA_3' devolviendo el valor normalizado (recorta, reduce espacios seguidos, NFC); acepta '  mesa 7  ' devolviendo 'mesa 7'; rechaza '', '   ', 41 caracteres ('El nombre de la mesa no puede pasar de 40 caracteres.') y 'Mesa $' / 'Mesa/1' ('El nombre de la mesa solo puede llevar letras, números, espacios, punto, guion o guion bajo.').
- `createTableRequestSchema`: `{ name: 'Mesa 1' }` válido; `{ name: '' }`, `{}`, `{ name: 'Mesa 1', extra: 1 }` fallan.
- `updateTableRequestSchema`: `{ name: 'Barra' }`, `{ isActive: false }` y `{ name: 'Barra', isActive: true }` válidos; `{}` falla con 'No indicaste ningún cambio.'; `{ name: 'x', extra: 1 }` falla.
- `moveOrderRequestSchema`: `{ tableId: 3 }` válido; `{}`, `{ tableId: 0 }`, `{ tableId: 1.5 }`, `{ tableId: '3' }` fallan con issue en `tableId` ('El identificador de la mesa no es válido.').
- `joinTableRequestSchema`: `{ intoTableId: 5 }` válido; los mismos rechazos con issue en `intoTableId`.
- `cancelOrderRequestSchema`: `{ reason: 'Mesa abierta por error' }` válido; `{ reason: '' }`, `{ reason: '  ' }`, `{ reason: <201 caracteres> }`, `{}` y `{ reason: 5 }` fallan ('Escribe el motivo de la anulación (hasta 200 caracteres).').

**AC-02 (enums, esquemas de respuesta y códigos).** Dado el dominio compartido, cuando se verifica, entonces:

- `TABLE_STATES` es exactamente `['free', 'occupied', 'ready', 'bill_requested']` y `ORDER_STATUSES` es exactamente `['open', 'closed', 'cancelled', 'merged']`.
- `tableSchema` (estricto): `{ id, name, isActive, state, order }` con `order` = `orderSchema` o null. `orderSchema` (estricto): `{ id, status, tables: [{ id, name }], openedBy: { id, displayName }, openedAt, readyAt, billRequestedAt, closedAt, closedBy, cancelReason, mergedIntoOrderId }` con `closedBy` = `{ id, displayName }` o null, fechas ISO o null, `cancelReason` string o null, `mergedIntoOrderId` entero o null. Una clave de más, `state: 'ocupada'` o `status: 'abierto'` fallan.
- `tablesResponseSchema` = `{ tables: tableSchema[] }` estricto.
- `ERROR_CODES` suma `'TABLE_NOT_FOUND'`, `'ORDER_NOT_FOUND'`, `'TABLE_NAME_TAKEN'`, `'TABLE_OCCUPIED'`, `'TABLE_INACTIVE'`, `'TABLE_HAS_OPEN_ORDER'`, `'TABLE_HAS_NO_ORDER'`, `'ORDER_NOT_OPEN'` y `'ORDER_NEEDS_TABLE'`; `errorResponseSchema` acepta sus cuerpos y sigue rechazando un código fuera de lista.

### 4.2 Tablas y migración (apps/api contra la base de pruebas)

**AC-03 (la tabla `tables` existe con sus restricciones).** Dada la base de pruebas con las migraciones al día, cuando se inspecciona e inserta, entonces:

- Columnas: `id` entero autoincremental PK; `name` varchar(40) NOT NULL; `is_active` boolean NOT NULL default true; `current_order_id` entero NULL FK a `orders.id`; `created_at`/`updated_at` timestamptz NOT NULL.
- CHECK `tables_name_valid`: `''`, `'  '` y `' x'` fallan; 'Mesa 1' pasa.
- Índice único `tables_name_unique` sobre `lower(name)`: insertar 'Mesa 1' y luego 'mesa 1' o 'MESA 1' falla; 'Mesa 2' pasa.
- FK: `current_order_id` apuntando a un pedido inexistente falla; NULL y un pedido existente pasan. Índice `tables_current_order_id` existe.

**AC-04 (la tabla `orders` existe con sus restricciones).** Dada la base de pruebas, cuando se inspecciona e inserta, entonces:

- Columnas: `id` entero autoincremental PK; `status` varchar(16) NOT NULL default 'open'; `opened_by_user_id` entero NOT NULL FK a `users.id`; `opened_at` timestamptz NOT NULL; `ready_at`/`ready_by_user_id`, `bill_requested_at`/`bill_requested_by_user_id`, `closed_at`/`closed_by_user_id` en NULL permitido con FK a `users.id` en los `_by_user_id`; `cancel_reason` varchar(200) NULL; `merged_into_order_id` entero NULL FK a `orders.id`; `created_at`/`updated_at` timestamptz NOT NULL.
- CHECK `orders_status_allowed`: 'abierto', 'OPEN', '' fallan; los cuatro valores pasan.
- CHECK `orders_closed_consistent`: `status 'open'` con `closed_at` puesto, o `'closed'` con `closed_at`/`closed_by_user_id` en NULL, fallan; el par consistente pasa.
- CHECK `orders_cancel_reason`: `'cancelled'` sin `cancel_reason` falla; `'open'` con `cancel_reason` puesto falla; `'cancelled'` con motivo pasa.
- CHECK `orders_merged_consistent` + `orders_no_self_merge`: `'merged'` sin `merged_into_order_id` falla; `'merged'` apuntando a otro pedido pasa; apuntarse a sí mismo falla; `'open'` con `merged_into_order_id` puesto falla.
- CHECKs `orders_ready_pair` y `orders_bill_pair`: `ready_at` sin `ready_by_user_id` (y viceversa) falla; ambos puestos o ambos NULL pasan; igual para el par de cuenta.

**AC-05 (migración aplicable y revertible).** Dado el archivo `20261010120000-create-tables-orders.ts` al final de MIGRATIONS (posición 6, tras combo_items), cuando:

- `migrateUp` lo ejecuta, entonces crea `orders` y `tables` con todas las restricciones de AC-03 y AC-04.
- `migrateDown` lo revierte, entonces ambas tablas dejan de existir y un `migrateUp` posterior las recrea sin errores — el down encadenado de `users-migrations` gana este paso nuevo antes de revertir combo_items.

### 4.3 Servicios (apps/api contra la base de pruebas)

**AC-06 (listTables: el tablero con estados derivados).** Dadas las mesas 'Mesa 10', 'Mesa 2', 'Barra' (activas) y 'Depósito' (inactiva), un pedido abierto cubriendo Mesa 2 y Barra (unidas) con `ready_at` puesto, otro cubriendo Mesa 10 con `bill_requested_at` puesto, cuando se llama `listTables()`, entonces:

- Devuelve las 4 mesas ordenadas por nombre con colación natural: 'Barra', 'Depósito', 'Mesa 2', 'Mesa 10' (numérica: Mesa 2 antes que Mesa 10; la inactiva incluida con `isActive: false`).
- Mesa 2 y Barra: `state: 'ready'` y el mismo `order` embebido (`id` igual, `status: 'open'`, `tables` con ambas `{id,name}`, `openedBy {id, displayName}` del usuario que abrió, `openedAt`, `readyAt` puesto, `billRequestedAt` null, `closedAt`/`closedBy`/`cancelReason`/`mergedIntoOrderId` null).
- Mesa 10: `state: 'bill_requested'` con su pedido embebido; Depósito: `state: 'free'`, `order: null`.
- Precedencia: un pedido con ambas marcas deriva `state: 'ready'` en sus mesas (D-009-03).

**AC-07 (createTable y updateTable: configuración del salón).** Cuando:

- `createTable({ name: 'Mesa 1' })` → devuelve `{ id, name: 'Mesa 1', isActive: true, state: 'free', order: null }`; `createTable({ name: 'mesa 1' })` después lanza TABLE_NAME_TAKEN; lo mismo un `updateTable` que renombra a un nombre ya usado.
- `updateTable(id, { isActive: false })` sobre una mesa libre la desactiva (sigue en `listTables` con `isActive: false`); `{ isActive: true }` la reactiva; sobre una ocupada lanza TABLE_HAS_OPEN_ORDER sin cambiar nada.
- `updateTable(999999, { name: 'X' })` lanza TABLE_NOT_FOUND; la forma inválida (`{}`, nombre malo) lanza ZodError antes de tocar la base.

**AC-08 (openOrder: abrir una mesa).** Dada 'Mesa 3' activa y libre y el mozo Juan (id 2), cuando:

- `openOrder(mesa3.id, { userId: 2 })` → devuelve el pedido `{ id, status: 'open', tables: [{id, name:'Mesa 3'}], openedBy: {id:2, displayName:'Juan'}, openedAt, ... }`; `tables.current_order_id` queda puesto y `listTables` la muestra `occupied`.
- Repetir sobre la misma mesa lanza TABLE_OCCUPIED sin crear otro pedido (la tabla orders no crece).
- Sobre mesa inactiva → TABLE_INACTIVE; inexistente → TABLE_NOT_FOUND.
- Dos llamadas concurrentes a la misma mesa: una gana y la otra lanza TABLE_OCCUPIED; queda un solo pedido y una sola ocupación.

**AC-09 (getOrder: detalle del pedido).** `getOrder(id)` devuelve el mismo `Order` de D-009-14 (todas las mesas cubiertas, autor de apertura, marcas y cierre); `getOrder(999999)` lanza ORDER_NOT_FOUND; sobre un pedido merged devuelve `status: 'merged'`, `tables: []`, `mergedIntoOrderId` con el id del pedido que lo absorbió y `closedBy` con quien lo unió.

**AC-10 (moveOrder: cambiar el pedido de mesa).** Dado el pedido P cubriendo Mesa 3 (y Mesa 4 unida en el caso multi), cuando:

- `moveOrder(P.id, { tableId: mesa7 })` con Mesa 7 libre y activa → 200 con `tables: ['Mesa 7']`; Mesa 3 (y Mesa 4) quedan libres y Mesa 7 ocupada por P; `readyAt`/`billRequestedAt` se conservan.
- Destino ocupado → TABLE_OCCUPIED sin cambios; destino inactivo → TABLE_INACTIVE; destino inexistente → VALIDATION_ERROR con issue en `tableId` ('Esa mesa no existe.'); pedido cerrado → ORDER_NOT_OPEN; `moveOrder(P, mesa3)` cuando P solo cubre Mesa 3 → no-op 200 sin cambios.

**AC-11 (joinTable: unir mesas).** Dados Mesa 3 con pedido P, Mesa 4 con pedido Q y Mesa 5 libre, cuando:

- `joinTable(mesa5.id, { intoTableId: mesa3.id })` → 200 con el pedido P cubriendo ahora Mesa 3 y Mesa 5; Mesa 5 queda `occupied` por P en el tablero.
- `joinTable(mesa4.id, { intoTableId: mesa3.id })` (ocupada→ocupada) → el pedido Q queda `status: 'merged'`, `merged_into_order_id = P.id`, `closed_by_user_id` = quien unió; todas las mesas de Q quedan cubiertas por P; la respuesta es el pedido P con todas sus mesas.
- `joinTable(mesa3.id, { intoTableId: mesa4.id })` cuando 3 y 4 ya comparten pedido → no-op 200.
- Destino libre → TABLE_HAS_NO_ORDER; destino inactivo → TABLE_INACTIVE; `intoTableId` inexistente → issue 'Esa mesa no existe.'; `intoTableId` = tableId → issue 'La mesa de destino debe ser otra.'; origen inactivo o inexistente → TABLE_INACTIVE / TABLE_NOT_FOUND.
- Un merge funciona igual si el origen tenía `ready_at` o `bill_requested_at`: las marcas del pedido absorbido mueren con él; el destino conserva las suyas.

**AC-12 (leaveTable: separar una mesa unida).** Dado el pedido P cubriendo Mesa 3 y Mesa 5, cuando:

- `leaveTable(mesa5.id)` → 200 con el pedido P cubriendo solo Mesa 3; Mesa 5 queda `free`.
- `leaveTable` sobre la única mesa del pedido → ORDER_NEEDS_TABLE y nada cambia; sobre una mesa libre → TABLE_HAS_NO_ORDER; inexistente → TABLE_NOT_FOUND.

**AC-13 (requestBill, markReady, markServed: las señales).** Dado el pedido P abierto, cuando:

- `requestBill(P.id, { userId })` → pone `bill_requested_at`/`bill_requested_by_user_id` y el tablero muestra `bill_requested`; repetir con otro usuario → no-op 200 que conserva la primera marca.
- `markReady(P.id, { userId })` → pone `ready_at`/`ready_by_user_id` y el estado deriva `ready`; repetir → no-op 200 conservando la primera marca; con `bill_requested_at` también puesto, el `state` derivado es `ready` (precedencia).
- `markServed(P.id)` → limpia `ready_at`/`ready_by_user_id` (el estado vuelve a `occupied` o `bill_requested`); sin marca → no-op 200; un `markReady` posterior vuelve a ponerla.
- Sobre pedido cerrado/cancelado/merged → ORDER_NOT_OPEN; inexistente → ORDER_NOT_FOUND.

**AC-14 (cancelOrder: cancelar la cuenta abierta).** Dado el pedido P abierto cubriendo Mesa 3 y Mesa 5, cuando:

- `cancelOrder(P.id, { reason: 'Se sentaron por error', userId: adminId })` → `status: 'cancelled'`, `cancel_reason`, `closed_at`/`closed_by_user_id` puestos, ambas mesas libres (punteros en NULL) en la misma transacción; el GET posterior muestra el pedido cancelado con su motivo y quién lo hizo.
- Sin `reason` o fuera de forma → ZodError sin tocar nada; sobre pedido no abierto → ORDER_NOT_OPEN.

### 4.4 API por HTTP (apps/api contra la base de pruebas, con sesiones reales)

**AC-15 (GET /api/tables).** Cuando:

- GET con sesión de mozo (y también cocina, caja, admin) → `200 { tables: [...] }` con la forma y el orden de AC-06 y `Cache-Control: no-store`.
- GET sin cookie → `401` UNAUTHENTICATED.

**AC-16 (POST y PATCH /api/tables).** Cuando:

- POST `{ name: 'Mesa 1' }` como admin → `201` con la mesa; como mozo/cocina/caja → `403` FORBIDDEN; sin cookie → `401`.
- POST con nombre repetido (otra capitalización, mesa inactiva) → `409 { error: { code: 'TABLE_NAME_TAKEN', message: 'Ya existe una mesa con ese nombre.', details: null } }`.
- PATCH `{ isActive: false }` como admin sobre libre → `200`; sobre ocupada → `409 TABLE_HAS_OPEN_ORDER` con su mensaje; PATCH a `999999` → `404 TABLE_NOT_FOUND`; PATCH `{}` → `400` con 'No indicaste ningún cambio.'; PATCH como mozo → `403`.

**AC-17 (POST /api/tables/{tableId}/orders y GET /api/orders/{orderId}).** Cuando:

- POST como mozo (y como admin, incluido multi-rol admin+mozo) sobre mesa libre → `201` con el `Order` de D-009-14 (`openedBy` = el usuario de la sesión) y `Cache-Control: no-store`.
- Como cocina o caja → `403`; sin cookie → `401`; sobre mesa ocupada → `409 TABLE_OCCUPIED`; inactiva → `409 TABLE_INACTIVE`; inexistente → `404 TABLE_NOT_FOUND`; `tableId` 'abc' → `400` con issue en `tableId`.
- GET /api/orders/{orderId} con cualquier sesión → `200` con el pedido; inexistente → `404 ORDER_NOT_FOUND`; `orderId` inválido → `400` con issue en `orderId`.

**AC-18 (join y leave por HTTP).** Cuando:

- `POST /api/tables/{id}/join { intoTableId }` como mozo/admin, caso libre→ocupada → `200` con el pedido destino y ambas mesas; ocupada→ocupada → `200` y el pedido origen queda `merged` (verificable por GET).
- Destino libre → `409 TABLE_HAS_NO_ORDER`; cocina/caja → `403`; body inválido → `400` con sus issues.
- `POST /api/tables/{id}/leave` → `200` con el pedido restante; última mesa → `409 ORDER_NEEDS_TABLE`; mesa libre → `409 TABLE_HAS_NO_ORDER`.

**AC-19 (move, request-bill, ready, served por HTTP).** Cuando:

- `POST /api/orders/{id}/move { tableId }` mozo/admin → `200` con el pedido en la mesa nueva; destino ocupado → `409 TABLE_OCCUPIED`; pedido cerrado → `409 ORDER_NOT_OPEN`; cocina → `403`.
- `POST /api/orders/{id}/request-bill` mozo/admin → `200` y `state` derivado `bill_requested`; cocina → `403`.
- `POST /api/orders/{id}/ready` cocina (y mozo, y admin) → `200` y `state` `ready`; caja → `403`.
- `POST /api/orders/{id}/served` mozo/admin → `200`, marca limpiada; cocina → `403`.
- Repetir ready/request-bill → `200` no-op conservando la primera marca.

**AC-20 (cancel por HTTP).** `POST /api/orders/{id}/cancel { reason }` como mozo o admin sobre pedido abierto → `200` con el pedido `cancelled` y sus mesas libres; sin `reason` → `400` con issue en `reason`; pedido cerrado → `409 ORDER_NOT_OPEN`; cocina/caja → `403`; sin cookie → `401`.

**AC-21 (métodos no declarados y lector del cuerpo).** Cuando se llama DELETE a `/api/tables/{id}`, GET a `/api/orders/{id}/move`, POST a `/api/tables/{id}/orders/1` o PATCH a `/api/orders/{id}`, entonces 404 con `Cache-Control: no-store`. Y en las rutas con cuerpo (POST /tables, PATCH /tables/{id}, move, join, cancel): JSON inválido → `400 INVALID_JSON`; JSON que no es objeto → `400 INVALID_BODY`; `Content-Type` incorrecto con cuerpo → `415 UNSUPPORTED_MEDIA_TYPE`; cuerpo > 100 kb → `413 PAYLOAD_TOO_LARGE`; todos con `no-store`.

### 4.5 Cobertura de RF y RNF

| Requisito | AC que lo cubren |
| --- | --- |
| RF-02 (mesas con estado: libre, ocupada, pedido listo, cuenta solicitada) | AC-06, AC-13, AC-15, AC-19 |
| RF-03 (abrir mesa, cambiar pedido de mesa, unir mesas) | AC-08, AC-10, AC-11 (+ AC-12 separar como complemento), AC-17, AC-18, AC-19 |
| RNF-12 (mesas configurables desde el sistema) | AC-07, AC-16 |
| RNF-09 (cada operación con su rol) | AC-15 a AC-20 |
| RF-25/RF-27 (base: quién abrió, quién cerró y por qué) | AC-04, AC-06, AC-09, AC-14 |
| RNF-04 (20 mesas y 5 dispositivos) | sin AC propio: lo cubre el modelo (listTables sin consultas por fila); la verificación de uso llega con las pantallas de la 011 |

## 5. Requisitos verificables

| ID | Requisito | Cómo se verifica |
| --- | --- | --- |
| R-009-01 | GET /api/tables y GET /api/orders/{orderId} responden a cualquier rol con sesión; las operaciones exigen los roles de D-009-05 | reviewer lee las líneas del router |
| R-009-02 | openapi.yaml (versión propuesta 0.8.0) sigue siendo OpenAPI 3.1 válido y coincide con lo implementado | `pnpm dlx @redocly/cli lint docs/api/openapi.yaml`; contraste de AC-15 a AC-21 |
| R-009-03 | Ninguna variable de entorno nueva | `git diff` vacío en apps/api/.env.example y CONFIG_VARIABLES |
| R-009-04 | Una sola migración nueva, en el orden de MIGRATIONS | ls de la carpeta de migraciones; AC-05 |
| R-009-05 | apps/web no cambia | `git diff` vacío en apps/web; sin fetch/axios nuevo |
| R-009-06 | Cobertura ≥ 90 % en shared y en los services nuevos | `pnpm test:coverage` |
| R-009-07 | Definición de terminado de CLAUDE.md | orquestador en el cierre |

## 6. Reglas de dominio y de negocio

- Reglas de dominio que aplican: 2 (no hay dinero todavía; los campos futuros serán céntimos), 6 (cancelar con autorización y motivo registrado — RF-07 lo lleva a los ítems en la 010) y 8 (horas en timestamptz; America/Lima para los cortes). La regla 5 (Idempotency-Key) queda para el envío de ítems de la 010 (D-009-06); la 3 y la 4, para ítems y stock (010 y Fase 5).
- **RN-009-01.** Una mesa tiene a lo sumo un pedido abierto; lo garantiza `tables.current_order_id` con el UPDATE condicional atómico.
- **RN-009-02.** El estado de la mesa se deriva: `free` sin pedido; si lo hay, `ready` si `ready_at` está puesto, si no `bill_requested` si `bill_requested_at` está puesto, si no `occupied`. La precedencia `ready` > `bill_requested` es fija; ambas marcas viajan en el `order` embebido.
- **RN-009-03.** Roles: lectura para cualquier rol con sesión; salón (abrir, mover, unir, separar, cuenta, servido) para waiter/admin; `ready` también para kitchen; configuración de mesas solo admin.
- **RN-009-04.** Todo pedido registra `opened_by_user_id` (el usuario de la sesión que abrió); todo cierre registra `closed_by_user_id`; toda cancelación registra `cancel_reason` obligatorio. Los pedidos nunca se borran.
- **RN-009-05.** Unir: origen libre se adjunta al pedido del destino; origen ocupado fusiona su pedido en el del destino (el origen queda `merged` con `merged_into_order_id`; en la 010 sus ítems se mueven también). Mismo pedido = no-op. El destino debe tener pedido abierto.
- **RN-009-06.** Mover lleva el pedido completo a una mesa destino libre y activa, liberando todas las que cubría; las señales viajan con el pedido.
- **RN-009-07.** Separar suelta una mesa del pedido; el pedido de salón siempre conserva al menos una mesa (soltar la última es ORDER_NEEDS_TABLE: se cancela o se cierra).
- **RN-009-08.** Cancelar exige pedido `open` y `reason` de 1-200 caracteres; lo ejecutan waiter o admin mientras el pedido no tenga ni haya tenido ítems — con ítems activos no se puede (primero se anula cada ítem con RF-07) y si alguna vez tuvo, solo admin (lo aplica la 010 cuando exista order_items; en esta spec siempre está vacío).
- **RN-009-09.** Una mesa nunca se borra: se desactiva, y solo estando libre. El nombre es único sin distinguir mayúsculas entre todas las mesas, activas o no.
- **RN-009-10.** Los cambios de carta o de configuración de mesas no alteran pedidos ya cerrados; el historial queda en `orders` (la regla 4 se ejecutará en la 010 copiando precios al ítem).

## 7. Casos borde

- **Doble clic en "Abrir mesa"** o reintento de red: el segundo intento choca con la mesa ocupada → 409 TABLE_OCCUPIED; jamás dos pedidos en la misma mesa (AC-08).
- **Dos mozos abren la misma mesa a la vez**: el UPDATE condicional serializa en la fila; uno gana y el otro recibe 409.
- **Unir una mesa consigo misma** → 400 con issue 'La mesa de destino debe ser otra.'; **unir mesas ya unidas** → 200 no-op.
- **Unir hacia una mesa libre** → 409 TABLE_HAS_NO_ORDER: unir es sumarse a una cuenta abierta; para una mesa libre se usa abrir (o mover + unir).
- **Separar la última mesa** → 409 ORDER_NEEDS_TABLE.
- **Mover a la mesa que ya tiene** → 200 no-op; mover un pedido de un grupo unido mueve la cuenta entera a la mesa destino.
- **Desactivar una mesa ocupada** → 409 TABLE_HAS_OPEN_ORDER (cerrar/mover/cancelar primero); la mesa desactivada conserva su historial (sus pedidos pasados la referencian en reportes futuros).
- **El mozo que abrió el pedido queda desactivado**: el pedido sigue; `openedBy` muestra su nombre igual (los usuarios no se borran).
- **Pedido con cuenta pedida que recibe más ítems** (010): la marca `bill_requested_at` se limpiará al enviar nuevos ítems — la pre-cuenta cambia (nota §19); en esta spec la marca solo se quita al cerrar/cancelar/fusionar.
- **Pedido "listo" que se mueve o se une**: la marca viaja con el pedido destino (es del pedido); en un merge, las marcas del pedido absorbido mueren con él.
- **Operaciones sobre pedido merged/cancelled/closed** (mover, cuenta, listo, servido, cancelar de nuevo) → 409 ORDER_NOT_OPEN. Unir "desde" un pedido cerrado no existe: un pedido cerrado no tiene mesas apuntando, así que su mesa estaría libre y entraría como adjunción.
- **`tableId`/`orderId` de ruta inválidos**: 'abc', '0', '1.5', '-3', '2147483648' → 400 con su issue; '0009' se acepta como 9; dígitos válidos inexistentes → 404.
- **Métodos y sub-rutas no declarados** → 404, nunca 405 (AC-21).
- **Datos inconsistentes solo alcanzables por SQL directo** (una mesa inactiva con puntero puesto, un pedido no-open con mesas): la API es la única vía prevista; el servicio deriva el estado igual y las guardias operan sobre lo que hay — riesgo residual documentado como en la 006/007.

## 8. Modelo de datos

### 8.1 Tabla `orders` (migración `20261010120000-create-tables-orders.ts`)

| Columna | Tipo | Reglas |
| --- | --- | --- |
| id | INTEGER | PK, autoincremental |
| status | VARCHAR(16) NOT NULL DEFAULT 'open' | CHECK `orders_status_allowed`: IN ('open','closed','cancelled','merged') |
| opened_by_user_id | INTEGER NOT NULL | FK → users.id (el usuario que abrió; base de ventas por mozo y auditoría) |
| opened_at | TIMESTAMPTZ NOT NULL | default now() |
| ready_at | TIMESTAMPTZ NULL | con `ready_by_user_id` INTEGER NULL FK → users.id; CHECK `orders_ready_pair`: ambos NULL o ambos puestos |
| bill_requested_at | TIMESTAMPTZ NULL | con `bill_requested_by_user_id` INTEGER NULL FK → users.id; CHECK `orders_bill_pair`: ambos NULL o ambos puestos |
| closed_at | TIMESTAMPTZ NULL | con `closed_by_user_id` INTEGER NULL FK → users.id |
| cancel_reason | VARCHAR(200) NULL | motivo obligatorio al cancelar |
| merged_into_order_id | INTEGER NULL | FK → orders.id (el pedido que lo absorbió) |
| created_at / updated_at | TIMESTAMPTZ NOT NULL | default now() |

- CHECK `orders_closed_consistent`: `(status = 'open' AND closed_at IS NULL AND closed_by_user_id IS NULL) OR (status <> 'open' AND closed_at IS NOT NULL AND closed_by_user_id IS NOT NULL)`.
- CHECK `orders_cancel_reason`: `(status = 'cancelled') = (cancel_reason IS NOT NULL)`.
- CHECK `orders_merged_consistent`: `(status = 'merged') = (merged_into_order_id IS NOT NULL)`; CHECK `orders_no_self_merge`: `merged_into_order_id IS NULL OR merged_into_order_id <> id`.
- Índice `orders_opened_by_user_id` (ventas por mozo de la Fase 6). Sin índice parcial de abiertos por ahora: la escala es de decenas de pedidos al día; evaluar índices en la fase de reportes.

### 8.2 Tabla `tables` (misma migración, creada después de `orders`)

| Columna | Tipo | Reglas |
| --- | --- | --- |
| id | INTEGER | PK, autoincremental |
| name | VARCHAR(40) NOT NULL | CHECK `tables_name_valid`: `name <> '' AND name = btrim(name)`; índice único `tables_name_unique` sobre `lower(name)` |
| is_active | BOOLEAN NOT NULL | DEFAULT true |
| current_order_id | INTEGER NULL | FK → orders.id (el pedido abierto que la cubre; NULL = libre) |
| created_at / updated_at | TIMESTAMPTZ NOT NULL | default now() |

- Índice parcial `tables_current_order_id` sobre `(current_order_id) WHERE current_order_id IS NOT NULL` (listar las mesas de un pedido).
- `current_order_id` es la única fuente de "qué mesas cubre un pedido": no hay tabla puente ni `orders.table_id` (D-009-02). La unicidad "una mesa, un pedido abierto" es la propia columna.

### 8.3 Modelos Sequelize y asociaciones

- `models.Order` sobre 'orders' y `models.Table` sobre 'tables' (`underscored`), sumados a `Models` y a la guardia `isDefined`.
- Asociaciones: `Order.belongsTo(User, { as: 'openedBy', foreignKey: 'opened_by_user_id' })`, igual para `readyBy`, `billRequestedBy`, `closedBy`; `Order.belongsTo(Order, { as: 'mergedInto', foreignKey: 'merged_into_order_id' })` (auto-referencia); `Table.belongsTo(Order, { as: 'currentOrder', foreignKey: 'current_order_id' })`; `Order.hasMany(Table, { as: 'tables', foreignKey: 'current_order_id' })`. `initOrderTableAssociations(models)` invocado desde `initAssociations`.
- Sin `ON DELETE`: usuarios y pedidos no se borran nunca.

## 9. API (borrador; contrato propuesto en docs/api/openapi.yaml → 0.8.0; lo edita la implementación)

Base `/api`; todas protegidas con la cookie `polleria_session` y `Cache-Control: no-store` (los prefijos '/api/tables' y '/api/orders' se agregan a NO_STORE_PATH_PREFIXES de app.ts y se reafirman en los routers, igual que hicieron las rutas anteriores).

| Método y ruta | Roles | Petición | Respuesta |
| --- | --- | --- | --- |
| GET /api/tables | cualquier rol con sesión | — | 200 `{ tables: [Table] }`; 401 |
| POST /api/tables | admin | `{ name }` | 201 `Table`; 400; 401; 403; 409 TABLE_NAME_TAKEN |
| PATCH /api/tables/{tableId} | admin | `{ name?, isActive? }` | 200 `Table`; 400; 401; 403; 404; 409 TABLE_NAME_TAKEN / TABLE_HAS_OPEN_ORDER |
| POST /api/tables/{tableId}/orders | waiter, admin | — | 201 `Order`; 400 (tableId); 401; 403; 404; 409 TABLE_OCCUPIED / TABLE_INACTIVE |
| POST /api/tables/{tableId}/join | waiter, admin | `{ intoTableId }` | 200 `Order` (el del destino); 400 (issues de intoTableId); 401; 403; 404; 409 TABLE_INACTIVE / TABLE_HAS_NO_ORDER |
| POST /api/tables/{tableId}/leave | waiter, admin | — | 200 `Order` (el que quedó); 401; 403; 404; 409 TABLE_HAS_NO_ORDER / ORDER_NEEDS_TABLE |
| GET /api/orders/{orderId} | cualquier rol con sesión | — | 200 `Order`; 400 (orderId); 401; 404 |
| POST /api/orders/{orderId}/move | waiter, admin | `{ tableId }` | 200 `Order`; 400; 401; 403; 404; 409 TABLE_OCCUPIED / TABLE_INACTIVE / ORDER_NOT_OPEN |
| POST /api/orders/{orderId}/request-bill | waiter, admin | — | 200 `Order`; 401; 403; 404; 409 ORDER_NOT_OPEN |
| POST /api/orders/{orderId}/ready | waiter, kitchen, admin | — | 200 `Order`; 401; 403; 404; 409 ORDER_NOT_OPEN |
| POST /api/orders/{orderId}/served | waiter, admin | — | 200 `Order`; 401; 403; 404; 409 ORDER_NOT_OPEN |
| POST /api/orders/{orderId}/cancel | waiter, admin | `{ reason }` | 200 `Order`; 400; 401; 403; 404; 409 ORDER_NOT_OPEN |

`Table`: `{ id, name, isActive, state, order }`. `Order`: `{ id, status, tables: [{id, name}], openedBy: {id, displayName}, openedAt, readyAt, billRequestedAt, closedAt, closedBy: {id, displayName} | null, cancelReason, mergedIntoOrderId }`.

- Ejemplo — abrir la Mesa 3 (`POST /api/tables/3/orders`, mozo): `201`

```json
{ "id": 12, "status": "open", "tables": [{ "id": 3, "name": "Mesa 3" }],
  "openedBy": { "id": 2, "displayName": "Juan" }, "openedAt": "2026-10-10T18:30:00.000Z",
  "readyAt": null, "billRequestedAt": null, "closedAt": null, "closedBy": null,
  "cancelReason": null, "mergedIntoOrderId": null }
```

- Ejemplo — el tablero tras unir la Mesa 4 a la 3 y pedir la cuenta (`GET /api/tables`):

```json
{ "tables": [
  { "id": 1, "name": "Mesa 1", "isActive": true, "state": "free", "order": null },
  { "id": 3, "name": "Mesa 3", "isActive": true, "state": "bill_requested",
    "order": { "id": 12, "status": "open", "tables": [{ "id": 3, "name": "Mesa 3" }, { "id": 4, "name": "Mesa 4" }],
      "openedBy": { "id": 2, "displayName": "Juan" }, "openedAt": "2026-10-10T18:30:00.000Z",
      "readyAt": null, "billRequestedAt": "2026-10-10T19:15:00.000Z", "closedAt": null, "closedBy": null,
      "cancelReason": null, "mergedIntoOrderId": null } },
  { "id": 4, "name": "Mesa 4", "isActive": true, "state": "bill_requested", "order": "… el mismo pedido 12, embebido completo" }
] }
```

- Por qué las operaciones del pedido cuelgan de `/api/orders/{orderId}` y abrir/adjuntar/separar de `/api/tables/{tableId}`: el mozo piensa en mesas ("une la 4 a la 3", "libera la 4") pero actúa sobre la cuenta cuando la operación es del pedido (mover, cuenta, listo, cancelar). El `orderId` lo entrega el tablero (el `order` embebido) — la pantalla nunca lo busca a mano.
- Las rutas sin cuerpo (orders, leave, request-bill, ready, served) no exigen Content-Type ni leen cuerpo; si llega uno, se ignora.
- Sin eventos Socket.IO (D-009-16).
- Cambio propuesto del contrato OpenAPI 0.7.0 → 0.8.0, solo aditivo: tags `tables` y `orders`; las 12 rutas de la tabla; esquemas TableName, TableState, OrderStatus, UserRef (`{id, displayName}`), TableRef (`{id, name}`), Table, Order, TablesResponse, CreateTableRequest, UpdateTableRequest, MoveOrderRequest, JoinTableRequest, CancelOrderRequest; parámetros TableId y OrderId (misma regla que ProductId); respuestas reutilizables TableNotFound, OrderNotFound, TableNameTaken, TableOccupied, TableInactive, TableHasOpenOrder, TableHasNoOrder, OrderNotOpen, OrderNeedsTable; ErrorCode suma los nueve códigos. No se renombra ni se quita nada de la 0.7.0.

## 10. Interfaz (apps/web)

Sin pantallas en esta spec (D-009-01). Notas para la 011 (mozo) y la 012 (administración de mesas):

- El tablero del mozo consume GET /api/tables: dibuja las mesas activas por `state`, usando `order.tables` para mostrar "Mesa 3 y 4" en las unidas, `order.openedBy.displayName` para el mozo de la cuenta y las marcas `readyAt`/`billRequestedAt` si quiere mostrar ambas señales aunque `state` elija una.
- Actualización del tablero: recomendado polling con TanStack Query (`refetchInterval` ~5 s) en la 011; Socket.IO queda disponible si se justifica (D-009-16).
- Las acciones de la 011: abrir (mesa libre → confirmación), toma de pedido (010), mover/unir/separar con selectores de mesa, 'Marcar servido', 'Pedir la cuenta' y 'Cancelar pedido' con cuadro de motivo.
- La administración de mesas (012 o dentro de 011): lista con alta (nombre) y activar/desactivar; manejar TABLE_NAME_TAKEN y TABLE_HAS_OPEN_ORDER como mensajes del servidor.
- Etiquetas en español que pondrá la web: free 'Libre', occupied 'Ocupada', ready 'Pedido listo', bill_requested 'Pidió la cuenta'.

## 11. Contrato interno entre módulos

| Módulo | Expone / cambia |
| --- | --- |
| packages/shared/src/tables.ts (nuevo) | `TABLE_NAME_MAX` (40), `tableNameSchema`, `createTableRequestSchema`, `updateTableRequestSchema`, `TABLE_STATES`, `tableStateSchema`, `tableSchema`, `tablesResponseSchema`, tipos; reutiliza patrones de products.ts/users.ts |
| packages/shared/src/orders.ts (nuevo) | `ORDER_STATUSES`, `orderStatusSchema`, `userRefSchema` (`{id, displayName}`), `tableRefSchema` (`{id, name}`), `orderSchema`, `moveOrderRequestSchema`, `joinTableRequestSchema`, `cancelOrderRequestSchema` (CANCEL_REASON_MAX = 200), tipos |
| packages/shared/src/errors.ts | ERROR_CODES suma los nueve códigos |
| packages/shared/src/index.ts | exporta tables.ts y orders.ts |
| apps/api/src/db/migrations/20261010120000-create-tables-orders.ts (nueva) | orders + tables + CHECKs + única + índices (D-009-15) |
| apps/api/src/db/models/index.ts | Order, Table + `initOrderTableAssociations` |
| apps/api/src/services/tables/table.service.ts (nuevo) | `createTableService({ models })` → `listTables()`, `createTable(input)`, `updateTable(tableId, changes)` |
| apps/api/src/services/orders/order.service.ts (nuevo) | `createOrderService({ models })` → `openOrder(tableId, actor)`, `getOrder(orderId)`, `moveOrder(orderId, tableId, actor)`, `joinTable(tableId, intoTableId, actor)`, `leaveTable(tableId, actor)`, `requestBill(orderId, actor)`, `markReady(orderId, actor)`, `markServed(orderId, actor)`, `cancelOrder(orderId, reason, actor)` |
| apps/api/src/controllers/tables.controller.ts + orders.controller.ts (nuevos) | handlers; `tableId`/`orderId` con el parser de parámetros de products.controller.ts generalizado (misma regla `^[0-9]+$`, 1..2147483647) |
| apps/api/src/routes/tables/tables.routes.ts + routes/orders/orders.routes.ts (nuevos) | routers con `Cache-Control: no-store` propio, requireJsonContentType/requireJsonObject solo en las rutas con cuerpo |
| apps/api/src/routes/index.ts y app.ts | monta ambos routers antes del 404; `NO_STORE_PATH_PREFIXES` suma '/api/tables' y '/api/orders' |
| apps/api/tests/helpers/test-database.ts | `clearOrderTables` (orders + tables tras `tableExists`, un solo TRUNCATE); `resetMigrationTables` suma 'tables' y 'orders' antes que 'combo_items' |
| docs/api/openapi.yaml | 0.7.0 → 0.8.0 (lo edita la implementación con las rutas y esquemas propuestos) |

## 12. Cambios a specs y documentos anteriores (señalados)

- **app.ts / NO_STORE_PATH_PREFIXES (spec 001):** suma los prefijos '/api/tables' y '/api/orders' para que todas las respuestas nuevas —incluidos los errores del lector del cuerpo— lleven `Cache-Control: no-store`.
- **helpers de tests (spec 001 + D-005-10, D-006-10, D-007-14):** `resetMigrationTables` borra `tables` y `orders` al inicio de la lista (las FK tables→orders→users lo exigen); `clearOrderTables` nuevo; `clearAuthTables` queda igual (su CASCADE ya alcanzaría orders y tables por la FK orders→users; se documenta que truncar usuarios ahora también vacía pedidos y mesas — efecto buscado en las pruebas de auth).
- **Listas MIGRATIONS de los tests de migraciones (004, 005, 006, 007):** cada una recibe `20261010120000-create-tables-orders.ts` al final; el down encadenado de `users-migrations` gana un paso (revertir tables/orders antes que combo_items).
- **Spec 006/007 (notas §19):** las reglas declaradas RN-006-08 y RN-007-11 (el ítem copia porción/parte/precio/octavos y los componentes del combo) quedan para la 010 sobre `orders`; nada cambia en su contrato.
- **Nada más:** productos, presentaciones, combos, usuarios, sesiones y la app web no cambian por fuera de lo listado. `orders` referencia `users.id` — desactivar un usuario no toca sus pedidos (solo pierde el acceso).

## 13. Dependencias

Ninguna nueva. Reutiliza lo ya instalado: Sequelize (transacción + locks FOR NO KEY UPDATE), Zod 4, requireAuth/requireRole de la 003, el lector JSON limitado a 100 kb y los middlewares requireJsonContentType/requireJsonObject de las rutas con cuerpo.

## 14. Fuera de alcance

- Ítems del pedido (order_items), cantidades, presentación/parte por ítem, cremas, observaciones, copia de precio y octavos al ítem, envío idempotente con Idempotency-Key, comandas como registro, anulación de ítems con admin: spec 010 (RF-04 a RF-07).
- Impresión de comandas y aviso de "pedido listo" con impresora en cocina: Fase 3 (RF-08 a RF-11). La marca `ready_at` de esta spec es la señal manual que el estado del tablero necesita ya.
- Pre-cuenta impresa, cobro, división de cuenta, apertura y cierre de caja: Fase 4 (RF-13 a RF-17). `bill_requested_at` solo deja constancia del pedido de cuenta; el estado `closed` lo ejecutará el cobro.
- Para llevar y delivery (pedidos sin mesa): fase posterior (RF-12). El modelo lo admite (un pedido puede existir sin mesas apuntando).
- Stock e inventario: Fase 5 (RF-20 a RF-24).
- Pantallas: la del mozo en la 011, la de administración de mesas en la 012 (o dentro de 011); plano visual del salón con posiciones/coordenadas: no se modela (pregunta 11).
- Socket.IO y cualquier evento en tiempo real: D-009-16.
- Seed de mesas y datos de demo: Fase 6; las mesas se crean por API mientras tanto.

## 15. Riesgos

- **Precedencia de estados al revés de lo que el mozo espera** (cuenta solicitada podría importar más que pedido listo): mitigación — el `order` embebido expone ambas marcas y la pantalla puede destacar las dos; pregunta 4.
- **Quién marca "pedido listo" si cocina no tiene pantalla:** la propuesta acepta a cocina y al mozo (que escucha el aviso como hoy); si el dueño quiere pantalla de cocina, es una spec de la Fase 3. Pregunta 3.
- **El merge pierde "qué mesa pidió qué":** las mesas origen quedan absorbidas. Mitigación: el pedido origen queda `merged` con auditoría (quién y cuándo), y la 010 puede registrar en cada ítem la mesa donde se pidió (`ordered_at_table_id`) si el dueño quiere esa traza — nota §19.
- **Cancelar pedidos vacíos por el mozo sin admin:** un mozo podría abrir y cancelar cuentas sin dejar cargo; el motivo queda registrado igual (RN-009-08) y una vez haya ítems solo cancela el admin. Pregunta 7.
- **Sin pantallas ni seed, el tablero no se ve:** la verificación es por API (sección 18) hasta la 011/012; las mesas se crean con POST por ahora — pendiente manual explícito.
- **Unir/mover/separar con ítems ya enviados a cocina (010):** las comandas impresas dirán la mesa nueva si la comanda se emite después del cambio; una comanda ya impresa no se reimprime sola — queda documentado para la 010/Fase 3.
- **Concurrencia entre operaciones del mismo pedido** (mover mientras otro une): las transacciones bloquean pedidos y mesas en orden de id con FOR NO KEY UPDATE (lección de la 006/007); la última operación confirmada gana y la otra re-verifica el estado (responde su 409 correspondiente).

## 16. Supuestos

Las preguntas quedaron abiertas hasta aprobar la spec; para poder escribirla se asumió:

- Las mesas del local son pocas y fijas (~10-20, RNF-04); se configuran con nombre corto y quedan en la base hasta desactivarlas.
- Unir mesas con pedido significa una sola cuenta (fusionar), no un pedido al lado del otro; mover/servir/cobrar es de la cuenta completa.
- El estado se deriva siempre; no existe un campo `tables.state` que pueda contradecir la realidad.
- Las señales del pedido (`ready_at`, `bill_requested_at`) son manuales y de una sola marca vigente; la primera marcación es la que cuenta.
- `opened_by_user_id` basta como autor de la apertura; registrar además quién movió/unió cada paso queda para la bitácora de la Fase 6.
- 'Pedido listo' lo puede marcar la cocina (si llegara a tener pantalla) o el mozo que escucha el aviso; 'servido' lo quita el mozo.

## 17. Preguntas abiertas

Para aprobar:

1. ¿Cuántas mesas tiene el local y cómo se llaman? El modelo y la API no dependen del número: la base inicial se crea con POST /api/tables (ej. 'Mesa 1' a 'Mesa 10', 'Barra', 'Balcón 1').
2. ¿Las mesas son fijas o el mozo las crea al vuelo? Se propone fijas: el admin las configura y el mozo solo opera con las que hay (RNF-12 las hace configurables).
3. ¿Quién marca "pedido listo" — cocina con pantalla o el mozo al escuchar el aviso? Se propone permitir ambos roles ya (la API acepta waiter/kitchen/admin).
4. ¿Si hay pedido listo y cuenta pedida a la vez, qué color gana en el tablero? Se propone 'Pedido listo' con precedencia fija y ambas marcas disponibles en la respuesta.
5. Al unir dos mesas con cuentas separadas, ¿se fusiona todo en una cuenta? Se propone sí (status `merged` con auditoría, pedido destino). La alternativa "unidas pero con cuentas separadas" complicaría cobros y estados.
6. ¿Separar una mesa unida la deja libre o le crea su propio pedido? Se propone libre (el mozo abre uno nuevo si hace falta).
7. ¿Quién cancela una cuenta abierta sin ítems? Se propone mozo y admin con motivo obligatorio; con ítems activos nadie sin anularlos antes (y solo admin si el pedido llegó a tener ítems) — D-009-13 para que RF-07 lo confirme.
8. ¿Pedidos para llevar/delivery sin mesa? El modelo lo admite; el flujo (cómo se crea, dónde se ve) queda para su fase — pendiente confirmar que no se necesita ya.
9. ¿Socket.IO desde esta spec? Se propone no: polling en la 011; la API no cambia si luego se agregan eventos.
10. ¿Hace falta el estado "limpiando/reservada" en la mesa? No está en RF-02 y se propone no agregarlo (se puede sumar como enum derivado o de acciones después).
11. ¿Plano visual del salón (posiciones)? No se modela; el orden es por nombre. Si el dueño quiere dibujar el salón, una spec agrega `position_x`/`position_y` después.
12. ¿Número de personas por mesa? Se propone posponerlo junto con el registro de personas del pedido (nota §19) — sin él, 'gente atendida' solo se puede contar en pedidos.
13. ¿Restringir separar/mover a quien abrió la cuenta? Se propone que cualquier mozo lo haga (como hoy con el pedido en papel); RF-15 y las bitácoras de la Fase 6 podrían agregar restricciones.

## 18. Acción del usuario al aprobar

1. Responder las preguntas 1-13 (o aprobar las propuestas tal cual).
2. `pnpm -w build` (compila @polleria/shared).
3. `pnpm --filter @polleria/api db:migrate:dev` — crea orders y tables en desarrollo.
4. Crear mesas por API: con sesión de admin, POST /api/tables { "name": "Mesa 1" } … (en CMD se puede `curl.exe` con `-b` para la cookie o desde la consola del navegador con `fetch('/api/tables',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"name":"Mesa 1"}'})`).
5. Verificación manual: con sesión de mozo, GET /api/tables (todas `free`); POST /api/tables/{id}/orders → `occupied`; POST /api/tables/{id}/join con otra mesa → un pedido cubriendo dos; POST /api/orders/{id}/request-bill → `bill_requested`; POST /api/orders/{id}/ready → `ready`; POST /api/orders/{id}/served → vuelve a `occupied`; POST /api/orders/{id}/cancel { "reason": "prueba" } → mesas libres.
6. El cierre documental registra el merge a main cuando el orquestador lo autorice.

## 19. Notas para specs siguientes

- **010 Pedidos e ítems (RF-04 a RF-07):** nace `order_items` apuntando a `orders` (copia de porción/parte/precio/octavos/componentes por RN-006-08 y RN-007-11, `ordered_at_table_id` para la traza de mesa origen en uniones); comanda como registro de envío; `Idempotency-Key` con `scope: 'order-items'` (regla 5); anulación de ítems solo admin con auditoría (regla 6); RN-009-08 se vuelve aplicable: cancelar con ítems activos no se puede y con ítems alguna vez solo admin; enviar ítems nuevos limpia `bill_requested_at` (la pre-cuenta cambia) — proponerlo y confirmar en esa spec; el merge de 009 debe mover los ítems del pedido absorbido al destino.
- **011 Mozo / 012 Admin de mesas:** tablero por `state` con polling TanStack; acciones de mesa con los mensajes de la tabla de errores; administración de mesas (alta/renombrar/activar).
- **Cuenta y cobro (Fase 4):** `closed`/`closed_by_user_id`/`closed_at` ya existen para `markClosed`; pre-cuenta usa el historial de `bill_requested` (la columna ya acumula afectación si se limpia — considerar bitácora de marcas si el dueño quiere la hora del primer pedido de cuenta).
- **Para llevar (RF-12):** crear pedidos sin mesas (`openOrder` con `tableId` nulo en su propia ruta/acción) — el CHECK `ORDER_NEEDS_TABLE` de RN-009-07 solo rige mesas, no pedidos.
- **Personas por pedido / número de personas de RF-27:** columnas `party_size`/`closed_party_size` pendientes de la pregunta 12 — decidir en 010 o en Fase 6 con los reportes.
- **Bitácora de operaciones (Fase 6):** mover/unir/separar/servido no dejan rastro en columnas (solo el estado final); si el dueño quiere 'quién movió la mesa', agregar `order_events` o `audit_log`.
