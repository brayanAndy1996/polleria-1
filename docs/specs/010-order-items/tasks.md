# Tareas — Spec 010: ítems del pedido, comandas como registro y anulación

- Spec: docs/specs/010-order-items/spec.md (Aprobada, 2026-10-10)
- Rama: feat/010-order-items
- Contrato: docs/api/openapi.yaml (versión 0.8.0 → propuesta 0.9.0; aditiva salvo `Order` que gana `items` y `totalCents` requeridos — cambio señalado §12: tag `menu` nuevo; las 6 rutas de la sección 9 (request-void y reject-void incluidas; reject-void sin cuerpo); esquemas OrderItemStatus (3 valores), KitchenTicketKind, OrderItemSauce, OrderItemComponent, OrderItem, KitchenTicket, KitchenTicketsResponse, OrderItemSauceInput, OrderItemComponentInput, OrderItemInput, SendOrderItemsRequest, SendOrderItemsResponse, OrderResponse (`{order}`), MenuPortion, MenuComboItem, MenuProduct, MenuResponse; parámetro ItemId y cabecera IdempotencyKey en los cuatro POST; respuestas reutilizables OrderItemNotFound, OrderItemAlreadyVoided, OrderItemVoidRequested, OrderItemNotRequested, OrderHasActiveItems, OrderItemsLimit, IdempotencyConflict; ErrorCode suma los siete códigos; descripciones de join/cancel actualizadas — lo edita la implementación en T-11, nunca el test-writer)
- ADR: ninguno nuevo (D-010-20; reutiliza umzug, Sequelize con FOR NO KEY UPDATE, Zod, requireAuth/requireRole, parseIdParam, el lector del cuerpo limitado, crypto para el request_hash y el formato de errores)
- Dependencias: ninguna nueva. Sin variables de entorno nuevas. Una migración nueva: `20261011120000-create-order-items.ts` (kitchen_tickets, order_items, order_item_components, order_item_sauces, idempotency_keys con sus CHECK, unicidad e índices).
- Alcance especial: la 010 es dominio + API solamente (D-010-01). No hay tareas de frontend-dev ni pruebas E2E: la pantalla de toma del mozo es la spec 011. Ningún archivo de apps/web cambia (R-010-05).
- Cambios señalados a specs anteriores (spec §12): `orderSchema` gana `items`+`totalCents` (tests de la 009 con forma exacta de Order se actualizan); `comboChickenConsumption` queda con firma `Iterable` puro (recomendación ADV-007-06; tests de la 007 con ítem suelto se actualizan a iterables); `NO_STORE_PATH_PREFIXES` suma '/api/menu'; helpers de limpieza y listas MIGRATIONS se amplían con las cinco tablas.

## Orden y por qué

1. **Sin instalación ni andamiaje**: no hay paquetes ni configuración nuevos; el primer paso es directamente el test-writer.
2. **Pruebas en rojo (T-01 a T-06)**: test-writer escribe las pruebas de los 19 AC — esquemas/enums/códigos y Order ampliado en shared; migración y restricciones de las cinco tablas con los helpers de limpieza; servicio de ítems (envío, copias, issues por ítem, idempotencia, anulación, comandas); order.service con las guardias de cancelación y el merge de ítems; menu.service; y la API por HTTP sobre polleria_test — y ajusta las listas MIGRATIONS, helpers y los tests heredados señalados.
3. **Implementación (backend-dev)**: primero T-07 (shared, lo necesita todo lo demás), luego T-08 (migración y modelos), T-09 (servicio de ítems), T-10 (order.service + order-view + menu.service) y T-11 (controllers, rutas, app.ts y la edición de openapi.yaml).
4. **Cierre (T-12)**: definición de terminado y requisitos R-010-01 a R-010-09.

Aprobación: el usuario aprobó la spec el 2026-10-10 con las respuestas recomendadas a las preguntas 1 a 8 y 10 a 18, y respondió la 9 explícitamente con una decisión distinta a la recomendada: el mozo PUEDE solicitar la anulación con motivo y el administrador la aprueba/ejecuta o la rechaza (el admin también anula directo sin solicitud). Decisiones confirmadas: solo dominio + API sin pantallas (la toma de pedido es la 011); el ítem copia producto/nombre/categoría/precio unitario y octavos totales por línea (precio de la fila de presentación para pollo con porciones, `products.price_cents` en los demás casos); el combo copia componentes resueltos y admite cambiar solo la parte/distribución del pollo vía `components`; cremas como hijas del ítem (máx. 6, solo con comida, precio copiado — gratis o cobradas según la carta); comanda como registro por envío ('initial'/'additional') y por anulación aprobada ('void') — la solicitud no emite comanda; Idempotency-Key obligatoria en las cuatro operaciones que escriben ítems con scopes 'order-items', 'order-item-void-requests', 'order-item-voids' y 'order-item-void-rejections' (replay solo con mismo pedido + mismo hash, si no 409); envío atómico de 1-20 ítems sin estado borrador en servidor; ciclo de anulación 'sent'→'void_requested'→'voided' o rechazo a 'sent', con auditoría de quién pidió y quién aprobó; cancelar con ítems 'sent' o solicitudes pendientes da 409 y si el pedido alguna vez tuvo ítems solo cancela el admin; el merge repointa ítems y comandas conservando `ordered_at_table_id`; enviar/anular limpia `bill_requested_at` y conserva `ready_at` (solicitar/rechazar no la tocan); `Order` embebe `items` + `totalCents` en todas las respuestas; `GET /api/menu` devuelve la carta armada; productos desactivados no se pueden enviar pero sus ítems ya registrados se conservan; combo con componente desactivado se vende con advertencia; lectura para cualquier rol con sesión; sin Socket.IO ni seeds ni dependencias nuevas; `comboChickenConsumption` pasa a `Iterable` puro.

## Pruebas en rojo (test-writer)

Reglas comunes:
- Cada archivo de prueba de esta spec envuelve sus pruebas en un `describe` cuyo nombre empieza con `010:` y el nombre de cada prueba empieza con el ID del AC: `it('AC-06: copia el precio de la fila de presentación', ...)`.
- Importar desde las rutas de la sección 11 de la spec; que fallen por módulo inexistente es un rojo válido.
- Base de pruebas: solo polleria_test (DATABASE_URL_TEST) con las guardias de RN-001-02. Vaciar users y sessions con `clearAuthTables` / `migrateAndClearAuthTables`, y las siete tablas del pedido con `clearOrderTables` ampliado de T-02. order_items, order_item_components, order_item_sauces, kitchen_tickets e idempotency_keys quedan autorizadas para limpieza de pruebas igual que orders y tables (D-010-19); pedir confirmación al orquestador si hace falta registrarla.
- Hasher rápido: `createBcryptPinHasher({ cost: 4 })`; reloj fijo con `createApp({ sequelize, now: () => current, pinHasher })`; cookies de sesiones reales con `loginWithCookie`.
- La carta semilla de los AC (pollo con porciones, chicken sin porciones, drink, sauces, combo con componentes) se crea con los servicios reales de las specs 005/006/007 (`createProductService`, `createProductPortionService`, `createComboItemService`) o por SQL directo cuando el servicio no cubra el caso (producto inactivo, precio 0 fantasma); pedidos y mesas con `createOrderService`/`createTableService`.
- Claves de idempotencia en pruebas: una constante por caso ('k-1', 'k-v1'…) para que el reintento sea reproducible; el conteo de filas antes/después del replay es la aserción de "no duplica".
- Concurrencia: dos `sendItems`/`Promise.allSettled` sobre el mismo pedido con claves distintas — ambas pueden pasar (son envíos distintos) o serializarse por la fila; el adversarial decidirá si hace falta una prueba de carrera real, aquí basta documentar el orden de locks.
- Textos con caracteres especiales siempre con escapes, nunca literales.
- Commits con prefijo test, por ejemplo `test(010): pruebas del servicio de ítems`.

### T-01. Esquemas, enums, códigos y Order ampliado en shared
- Responsable: test-writer
- Dependencias: ninguna
- AC: AC-01, AC-02
- Descripción: packages/shared/src/order-items.test.ts nuevo (importando desde '@polleria/shared'). Todas las tablas acepta/rechaza de AC-01 con mensajes exactos: `orderItemInputSchema` (productId, quantity, notes con los 3 casos de normalización, portion/cut con PORTION_CUT_MESSAGE y 'Sin presentación no se puede indicar la parte.', breastEighths/legEighths por forma, sauces >6 y forma interna, components >10 y cut sin portion), `sendOrderItemsRequestSchema` (vacío, 21 ítems, clave de más), `voidOrderItemRequestSchema` (reutilizada por request-void y void; reject-void sin esquema de cuerpo) e `idempotencyKeySchema`. AC-02: `ORDER_ITEM_STATUSES` exacto con los 3 valores (`['sent','void_requested','voided']`) y `KITCHEN_TICKET_KINDS` exacto, las constantes de topes; `orderItemSchema` estricto con los campos `voidRequestedBy`/`voidRequestedAt`/`voidRequestReason` nulables, `kitchenTicketSchema`, `kitchenTicketsResponseSchema`, `sendOrderItemsResponseSchema`, `orderResponseSchema` (`{order}`), `menuProductSchema` y `menuResponseSchema` con claves de más que fallan; `orderSchema` actualizado exigiendo `items` (lista) y `totalCents` (entero ≥ 0); los siete códigos nuevos en `ERROR_CODES` con `errorResponseSchema`. Además, en los tests heredados: actualizar las aserciones de `orderSchema`/Order de la spec 009 (la forma de 11 claves pasa a 13 — los objetos de ejemplo heredados ganan `items: []` y `totalCents: 0`) y los llamadores de `comboChickenConsumption` de la spec 007 que usaban ítem suelto (envolverlos en un iterable).

### T-02. Las cinco tablas, migración y helpers de limpieza
- Responsable: test-writer
- Dependencias: ninguna
- AC: AC-03, AC-04, AC-05
- Descripción:
  - apps/api/tests/order-items-migration.test.ts con AC-03, AC-04 y AC-05 sobre polleria_test: columnas, tipos, defaults y NULL por information_schema/pg_indexes/pg_constraint; todas las FK (kitchen_tickets→orders/users, order_items→orders/products/kitchen_tickets×2/users×3/tables, order_item_components y order_item_sauces→order_items/products, idempotency_keys→orders); INSERTs válidos y los que deben fallar por cada CHECK (`kitchen_tickets_kind_allowed`, `order_items_status_allowed` con los 3 valores, `order_items_quantity_range`, `order_items_price_cents_range`, `order_items_portion_cut` con sus cuatro combinaciones, `order_items_void_consistent` con sus TRES combinaciones — 'sent' con los 7 campos NULL, 'void_requested' con el triple puesto y los 4 en NULL, 'voided' con los 4 puestos y triple libre — y cada violación fallando), los CHECK ≥0 de octavos y los de components/sauces); la unicidad `idempotency_keys_scope_key_unique` y que la misma clave en otro scope pasa; índices nombrados; migrateUp/migrateDown/re-up con la lista completa (posición 7 de MIGRATIONS).
  - Helpers (apps/api/tests/helpers/test-database.ts): `resetMigrationTables` borra order_item_sauces, order_item_components, order_items, idempotency_keys, kitchen_tickets ANTES que orders y users (las FK lo exigen); `clearOrderTables` pasa a un solo TRUNCATE con las siete tablas en ese orden, cada una detrás de su `tableExists`.
  - Actualizar las listas MIGRATIONS de los cinco tests de migraciones heredados (users, products, product-portions, combo-items, tables-orders): agregar '20261011120000-create-order-items.ts' al final; en users-migrations el down encadenado gana un paso.

### T-03. Servicio de ítems — envío y copias
- Responsable: test-writer
- Dependencias: T-02
- AC: AC-06, AC-07, AC-09
- Descripción: apps/api/tests/order-item-service.test.ts sobre polleria_test con la carta semilla de la spec §4.3 y el pedido P del mozo Juan sobre Mesa 3. AC-06 caso a caso: el ítem simple de drink con cantidad 2 y comanda 'initial'; el cuarto-pierna cobrando la fila (1400) con leg_eighths 2; el medio con distribución 1+3 y sin ella (2+2); el entero fijo 4+4; el chicken sin porciones cobrando price_cents del producto; el ítem con notes recortadas, 2 sauces con precios copiados (0 y 300) y octavos duplicados por quantity; el combo con sus componentes copiados (incluido el override de cut en el componente de pollo) y los octavos del ítem como suma; `ordered_at_table_id` y `created_by_user_id` correctos; la respuesta `{ order, ticket }` con totalCents; y la prueba de la regla 4 (editar la carta después no toca el ítem). AC-07: todos los issues de la tabla D-010-18 con sus paths `items.N.*`/`items.N.sauces.M.*` acumulados en un solo VALIDATION_ERROR y la nada-escrita tras el fallo; ORDER_NOT_OPEN, ORDER_NOT_FOUND y ORDER_ITEMS_LIMIT (sembrar 98 ítems 'sent' por SQL y enviar 2). AC-09: bill_requested limpiado y ready conservado tras un envío.

### T-04. Servicio de ítems — idempotencia, ciclo de anulación y comandas
- Responsable: test-writer
- Dependencias: T-02, T-03
- AC: AC-08, AC-10, AC-11
- Descripción: mismo archivo order-item-service.test.ts. AC-08: el replay con misma clave y cuerpo devuelve la MISMA respuesta sin filas nuevas (contar order_items, kitchen_tickets, idempotency_keys antes/después); misma clave + cuerpo distinto → IDEMPOTENCY_CONFLICT; misma clave en otro pedido → IDEMPOTENCY_CONFLICT; replay tras mover/cerrar el pedido → respuesta guardada; claves distintas → comandas 'initial' y 'additional'. AC-10 (ciclo de anulación): `requestVoid` pone 'void_requested' con el triple (quién/cuándo/motivo) SIN crear comanda ni tocar totalCents ni bill_requested; replay con misma clave → misma respuesta; con otra → ORDER_ITEM_VOID_REQUESTED; sobre 'voided' → ORDER_ITEM_ALREADY_VOIDED. `voidItem` sobre 'void_requested' (aprobación) crea la comanda 'void', pone los 4 campos de anulación conservando el triple de solicitud, descuenta del total y limpia bill_requested; sobre 'sent' (directo) deja el triple en NULL; replay y ALREADY_VOIDED igual. `rejectVoid` sobre 'void_requested' devuelve a 'sent' limpiando el triple (sin comanda); sobre 'sent' → ORDER_ITEM_NOT_REQUESTED; sobre 'voided' → ORDER_ITEM_ALREADY_VOIDED; re-solicitar tras rechazo funciona; replay con misma clave → respuesta guardada. En las tres: itemId ajeno → ORDER_ITEM_NOT_FOUND; pedido cerrado → ORDER_NOT_OPEN. AC-11: listOrderTickets devuelve las comandas en orden con sus ítems (la 'void' con el único anulado; la solicitud no genera ticket); ORDER_NOT_FOUND; getOrder con items (sent + void_requested + voided) y totalCents; pedido vacío → `items: []`, `totalCents: 0`.

### T-05. order.service con ítems y menu.service
- Responsable: test-writer
- Dependencias: T-02, T-03, T-04
- AC: AC-12, AC-13, AC-14
- Descripción:
  - En order-service.test.ts (los tests de la 009 siguen igual): AC-12 — cancelOrder con un ítem 'sent' → ORDER_HAS_ACTIVE_ITEMS para mozo y admin; con todos 'voided' → mozo 403 FORBIDDEN y admin 200 cancelled con mesas libres; sin ítems nunca → la regla de la 009 sin regresión. AC-13 — joinTable ocupada→ocupada con ítems en ambos pedidos: los ítems del absorbido aparecen en el destino conservando `orderedAtTable` de su mesa origen, las comandas migran (listOrderTickets del destino las incluye), el absorbido queda con `items: []` y `totalCents: 0`; separar después no arrastra ítems.
  - apps/api/tests/menu-service.test.ts nuevo: AC-14 — listMenu solo activos, orden categoría/nombre/id; el pollo con `portions` ordenadas (eighth, quarter-breast, quarter-leg, half, whole) y `items: []`; el combo con `items` y el producto componente embebido con `isActive`; chicken sin porciones con ambas listas vacías; el inactivo ausente.

### T-06. API de ítems, comandas, menú y pedido con ítems
- Responsable: test-writer
- Dependencias: T-02 a T-05
- AC: AC-15, AC-16, AC-17, AC-18, AC-19
- Descripción: apps/api/tests/order-items-api.test.ts (y los ajustes a orders-api.test.ts de la 009 por el Order ampliado — los cuerpos de respuesta esperados ganan `items`/`totalCents`). Cookies reales por rol; console.error espiado; cabecera `Idempotency-Key` siempre presente salvo en el caso que la prueba. AC-15: POST items 201 con `{order, ticket}`, `no-store`, roles (mozo y admin 201; cocina/caja 403; sin cookie 401; sin cabecera o mal formada 400 con issue en `idempotencyKey`; orderId 'abc' 400; inexistente 404; cerrado 409); replay HTTP idéntico sin filas nuevas; IDEMPOTENCY_CONFLICT; los issues acumulados con paths en `details.issues`. AC-16 (las tres rutas de anulación): request-void con mozo/admin → 200 `{ order }` con el ítem 'void_requested'; cocina/caja 403; 401; issues en `reason` e `idempotencyKey`; ORDER_ITEM_VOID_REQUESTED sobre ítem ya pendiente; ORDER_ITEM_ALREADY_VOIDED sobre anulado. void con admin → 200 `{ order, ticket }` sobre 'sent' (directo) y sobre 'void_requested' (aprobación conservando el triple); mozo/cocina/caja 403; issues en `reason`/`idempotencyKey`; ALREADY_VOIDED. reject-void con admin → 200 `{ order }` con el ítem de vuelta a 'sent' (ruta sin cuerpo: si llega JSON se ignora); mozo 403; ORDER_ITEM_NOT_REQUESTED sobre 'sent'; sin cabecera 400. En las tres: ORDER_ITEM_NOT_FOUND, ORDER_NOT_OPEN, itemId 'abc' 400, `no-store`. AC-17: GET /api/menu por cada rol con 200 + `no-store`, 401 sin cookie; GET tickets por cualquier rol, 404/400 en pedido malo, `{tickets: []}` sin envíos. AC-18: cancel 409 con ítems 'sent' o solicitudes 'void_requested' pendientes, 403 mozo con solo anulados, 200 admin; join HTTP con los ítems movidos y `totalCents` combinado en el tablero. AC-19: métodos no declarados 404; lector del cuerpo (INVALID_JSON, INVALID_BODY, UNSUPPORTED_MEDIA_TYPE, PAYLOAD_TOO_LARGE) en las rutas con cuerpo.

### Verificación del rojo (al terminar T-01 a T-06)
- `pnpm test` falla solo por módulos inexistentes (shared/order-items.ts, order-item.service.ts, menu.service.ts, controllers/rutas nuevos, la migración) o comportamiento ausente (guardias de cancel, merge de ítems, `items`/`totalCents` en las respuestas); las pruebas heredadas siguen en verde salvo las actualizaciones deliberadas (Order de 13 claves, comboChickenConsumption por iterable, listas MIGRATIONS, helpers) — rojo válido y esperado.
- `pnpm typecheck` y `pnpm lint` pueden fallar solo en cascada por los módulos que aún no existen.

## Implementación del backend (backend-dev)

Reglas comunes:
- No crear, modificar ni borrar archivos de prueba (`*.test.ts`, `*.test.tsx`, apps/api/tests/, e2e/). Si una prueba parece contradecir la spec, detenerse y reportarlo.
- Sintaxis borrable (D-02 de la 001), imports relativos con .ts, mensajes exactos de la spec. Sin SQL con interpolación de valores: consultas con bind/replacements como en las migraciones anteriores.
- Sin dependencias nuevas ni variables de entorno nuevas. apps/web no se toca (R-010-05).
- Concurrencia: sendItems y voidItem bloquean la fila del pedido con FOR NO KEY UPDATE dentro de la transacción antes de escribir (igual que las operaciones de la 009); la clave de idempotencia se inserta y resuelve dentro de la misma transacción.
- Commits con prefijo feat, sin archivos de prueba. Antes de cada commit: `pnpm --filter @polleria/api run typecheck` y `pnpm lint`.

### T-07. Esquemas, enums, códigos y Order ampliado en shared
- Responsable: backend-dev
- Dependencias: T-01
- AC: AC-01, AC-02
- Descripción: packages/shared/src/order-items.ts nuevo exportado por index.ts: constantes y enums de AC-02 (ORDER_ITEM_STATUSES con los 3 valores, KITCHEN_TICKET_KINDS, topes); `orderItemNotesSchema` (trim + NFC, ≤200, sin caracteres de control ni saltos, ''/espacios → null); `orderItemInputSchema` strict con quantity default 1, las reglas portion/cut (reuse de la correspondencia de portions.ts), cut sin portion, octavos 0-8 por forma, sauces (≤6) y components (≤10) internos; `sendOrderItemsRequestSchema` (items 1-20); `voidOrderItemRequestSchema` (reusa la forma de cancelOrderRequestSchema: reason 1-200 recortado con su mensaje); `idempotencyKeySchema` (`^[\x21-\x7E]{1,128}$` con 'El envío necesita la cabecera Idempotency-Key.'); esquemas de respuesta de AC-02. orders.ts: `orderSchema` gana `items: array(orderItemSchema)` y `totalCents: entero ≥0` (13 claves). errors.ts suma los siete códigos. combos.ts: `comboChickenConsumption` con firma `Iterable` puro (cambio señalado §12). Mantener ≥90 % de cobertura de shared.

### T-08. Migración y modelos de las cinco tablas
- Responsable: backend-dev
- Dependencias: T-02, T-07
- AC: AC-03, AC-04, AC-05 (requisito R-010-04)
- Descripción: apps/api/src/db/migrations/20261011120000-create-order-items.ts con up/down según la sección 8 — `up` crea kitchen_tickets, luego order_items (FK a kitchen_tickets y orders), order_item_components, order_item_sauces e idempotency_keys con todos los CHECK de AC-03/AC-04, la única `(scope, key)` y los índices nombrados, todo en una transacción; `down` las borra en el orden inverso. models/index.ts suma los cinco modelos con `sequelize.define` (`underscored`, los VARCHAR con sus largos, JSONB para response_body) y `initOrderItemAssociations` con las asociaciones de §8.6 invocada desde initAssociations; la guardia `isDefined` contempla los cinco.

### T-09. Servicio de ítems (sendItems, requestVoid, voidItem, rejectVoid, listOrderTickets)
- Responsable: backend-dev
- Dependencias: T-03, T-04, T-08
- AC: AC-06, AC-07, AC-08, AC-09, AC-10, AC-11
- Descripción: apps/api/src/services/order-items/order-item.service.ts nuevo: `createOrderItemService({ models })`.
  - `sendItems(orderId, body, key, actor)`: ZodError por forma → issues por ítem acumulados (tabla D-010-18; una sola VALIDATION_ERROR; las referencias se cargan en lote: productos, porciones, componentes de combos, cremas) → transacción: INSERT de la clave de idempotencia (duplicado → replay si mismo order_id+hash, si no IDEMPOTENCY_CONFLICT), lock del pedido FOR NO KEY UPDATE, ORDER_NOT_FOUND/ORDER_NOT_OPEN, ORDER_ITEMS_LIMIT (cuenta 'sent' + 'void_requested' + nuevos >99), INSERT de la comanda ('initial' si no hay previas de ítems, si no 'additional'), INSERT de ítems + components + sauces con todas las copias resueltas (precio de fila de porción o producto; octavos totales; distribution del medio por unidad × quantity), limpieza del par bill_requested, respuesta `{order, ticket}` guardada en la clave.
  - `requestVoid(orderId, itemId, reason, key, actor)`: misma mecánica de idempotencia con scope 'order-item-void-requests'; guardias (pedido open → ítem pertenece → 'sent'); pone 'void_requested' con el triple; sin comanda ni limpieza de marcas; respuesta `{order}` guardada.
  - `voidItem(orderId, itemId, reason, key, actor)`: scope 'order-item-voids'; guardias (pedido open → ítem pertenece → 'sent' o 'void_requested'); pasa a 'voided' con los 4 campos (conservando el triple si venía de solicitud), crea su comanda 'void' y limpia bill_requested; respuesta `{order, ticket}`.
  - `rejectVoid(orderId, itemId, key, actor)`: scope 'order-item-void-rejections'; guardias (pedido open → ítem pertenece → 'void_requested'); vuelve a 'sent' limpiando el triple, sin comanda ni toque de marcas; respuesta `{order}`.
  - `listOrderTickets(orderId)`: ORDER_NOT_FOUND; tickets por id con sus ítems (sent por kitchen_ticket_id, void por void_ticket_id) en lote.
  - Mensajes y códigos exactos de D-010-17/D-010-18; `request_hash` = SHA-256 hex del cuerpo validado serializado de forma estable (en reject-void, del objeto vacío).

### T-10. order.service/order-view con ítems y menu.service
- Responsable: backend-dev
- Dependencias: T-05, T-09
- AC: AC-11 (getOrder), AC-12, AC-13, AC-14
- Descripción:
  - order-view.ts: `loadOrderViews` carga en lote los ítems de los pedidos del lote (una consulta por order_id IN, una por sauces, una por components, usuarios de items/tickets en el lote de userRefs ya existente — nunca por fila); el Order público gana `items` ordenados por id y `totalCents` (Σ quantity×price de 'sent' + Σ sus sauces). OrderRowShape se amplía con las filas hijas cargadas.
  - order.service.ts: `cancelOrder` gana las dos guardias de D-010-11 tras ORDER_NOT_OPEN (sent → ORDER_HAS_ACTIVE_ITEMS; ever-had-items y actor no admin → FORBIDDEN); `joinTable` repointa `order_items.order_id` y `kitchen_tickets.order_id` del origen al destino dentro de la misma transacción del merge; las demás operaciones ya devuelven el Order ampliado sin tocar lógica. Reforzar cobertura de ramas en las guardias nuevas (R-010-06).
  - apps/api/src/services/menu/menu.service.ts nuevo: `createMenuService({ models })` → `listMenu()` con productos activos (consulta única) + portions + combo_items con sus productos en lote, armado y orden de AC-14.

### T-11. Controllers, rutas, app.ts y openapi.yaml
- Responsable: backend-dev
- Dependencias: T-06, T-10
- AC: AC-15, AC-16, AC-17, AC-18, AC-19 (requisitos R-010-01, R-010-02)
- Descripción:
  - apps/api/src/controllers/order-items.controller.ts: `send`, `requestVoid`, `void` y `rejectVoid`; `orderId`/`itemId` con `parseIdParam` (mensaje 'El identificador del ítem no es válido.' para itemId); la cabecera `Idempotency-Key` validada PRIMERO en el handler (issue en `idempotencyKey`), luego params y cuerpo con los esquemas de shared (reject-void sin cuerpo); el actor sale de la sesión.
  - apps/api/src/controllers/menu.controller.ts: `list`.
  - routes/orders/orders.routes.ts: suma `GET /:orderId/tickets` (cualquier rol), `POST /:orderId/items` (waiter, admin), `POST /:orderId/items/:itemId/request-void` (waiter, admin), `POST /:orderId/items/:itemId/void` (admin) y `POST /:orderId/items/:itemId/reject-void` (admin), con el lector JSON en las que tienen cuerpo (request-void y void) y `no-store` propio del router.
  - routes/menu/menu.routes.ts nuevo: `GET /` con requireAuth; montado en routes/index.ts antes del 404.
  - app.ts: crea los servicios y controllers nuevos; `NO_STORE_PATH_PREFIXES` suma '/api/menu' y `BODILESS_PATH_PATTERN` suma la subruta `reject-void` (cambios señalados §12).
  - docs/api/openapi.yaml: edición 0.8.0 → 0.9.0 con el alcance del encabezado de este archivo; `Order` gana `items`/`totalCents`; descripciones de join/cancel actualizadas; mantener el lint de Redocly en verde.

## Cierre

### T-12. Verificación final
- Responsable: backend-dev
- Dependencias: T-07 a T-11
- AC: todos (requisitos R-010-01 a R-010-09)
- Descripción:
  - `pnpm -w build`, `pnpm test`, `pnpm lint`, `pnpm typecheck` en verde en toda la rama.
  - `pnpm test:coverage`: ≥90 % líneas en packages/shared y en los services nuevos (order-item.service, menu.service); order.service no baja de su nivel previo (~90 % líneas / ~81 % ramas).
  - Cada AC-01 a AC-19 tiene al menos una prueba cuyo nombre empieza con su ID dentro de un `describe` con prefijo `010:`.
  - openapi.yaml válido con Redocly y coincidente con las 4 rutas implementadas (incluida la forma ampliada de Order).
  - Verificación manual pendiente de la spec §18 (migrar en dev y el recorrido por API) — la ejecuta el usuario/orquestador.
  - Reporte: suites nuevas, coberturas por archivo, cambios hechos en tests heredados (Order ampliado, iterable de comboChickenConsumption, MIGRATIONS, helpers) y pendientes.
