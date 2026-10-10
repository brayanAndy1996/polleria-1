# Tareas — Spec 009: mesas del salón y ciclo de vida del pedido

- Spec: docs/specs/009-tables/spec.md (Aprobada, 2026-10-10)
- Rama: feat/009-tables
- Contrato: docs/api/openapi.yaml (versión 0.7.0 → propuesta 0.8.0, solo aditiva: tags `tables` y `orders`; las 12 rutas de la sección 9; esquemas TableName, TableState, OrderStatus, UserRef, TableRef, Table, Order, TablesResponse y los cuerpos de petición; parámetros TableId y OrderId; respuestas reutilizables y los nueve códigos nuevos en ErrorCode — lo edita la implementación en T-10, nunca el test-writer)
- ADR: ninguno nuevo (D-009-16; reutiliza umzug, Sequelize con FOR NO KEY UPDATE, Zod, requireAuth/requireRole, el lector del cuerpo limitado y el formato de errores)
- Dependencias: ninguna nueva. Sin variables de entorno nuevas. Una migración nueva: `20261010120000-create-tables-orders.ts` (orders + tables con sus CHECK, unicidad e índices).
- Alcance especial: la 009 es dominio + API solamente (D-009-01). No hay tareas de frontend-dev ni pruebas E2E: las pantallas del mozo son la spec 011 y la administración de mesas la 012. Ningún archivo de apps/web cambia (R-009-05).

## Orden y por qué

1. **Sin instalación ni andamiaje**: no hay paquetes ni configuración nuevos; el primer paso es directamente el test-writer.
2. **Pruebas en rojo (T-01 a T-05)**: test-writer escribe las pruebas de los 21 AC — esquemas/enums/códigos en shared; migración y restricciones de orders y tables con los helpers de limpieza; servicio de mesas; servicio de pedidos (abrir, detalle, mover, unir, separar, señales, cancelar); y la API por HTTP sobre polleria_test — y ajusta las listas MIGRATIONS y helpers heredados.
3. **Implementación (backend-dev)**: primero T-06 (shared, lo necesita todo lo demás), luego T-07 (migración y modelos), T-08 (servicio de mesas), T-09 (servicio de pedidos) y T-10 (controllers, rutas, app.ts y la edición de openapi.yaml).
4. **Cierre (T-11)**: definición de terminado y requisitos R-009-01 a R-009-07.

Aprobación: el usuario aprobó la spec el 2026-10-10 con las respuestas recomendadas a las preguntas 1 a 13 (supuestos S-009-01 a S-009-14 confirmados). Decisiones confirmadas: solo dominio + API sin pantallas (el mozo en la 011, la administración de mesas en la 012); `tables.current_order_id` como puntero al pedido abierto con UPDATE condicional atómico; estados free/occupied/ready/bill_requested derivados con precedencia 'ready' y ambas marcas en la respuesta; `orders` con ciclo open/closed/cancelled/merged y auditoría opened_by/closed_by/cancel_reason/merged_into_order_id; lectura para cualquier rol con sesión, salón para waiter/admin, 'listo' también para kitchen y configuración de mesas solo admin; unir fusiona a una sola cuenta (merged) y separar deja la mesa libre; mover lleva el pedido completo con sus señales; cancelar exige motivo y lo hacen waiter/admin mientras no haya ítems (con ítems, las reglas de RN-009-08 que confirma RF-07); mesas configurables sin borrado, nombre único sin mayúsculas y sin posición; sin Socket.IO ni seeds (polling con TanStack Query en la 011).

## Pruebas en rojo (test-writer)

Reglas comunes:
- Cada archivo de prueba de esta spec envuelve sus pruebas en un `describe` cuyo nombre empieza con `009:` y el nombre de cada prueba empieza con el ID del AC: `it('AC-08: abre una mesa', ...)`.
- Importar desde las rutas de la sección 11 de la spec; que fallen por módulo inexistente es un rojo válido.
- Base de pruebas: solo polleria_test (DATABASE_URL_TEST) con las guardias de RN-001-02. Vaciar users y sessions con `clearAuthTables` / `migrateAndClearAuthTables`, y orders + tables con `clearOrderTables` nuevo de T-02. Las tablas orders y tables quedan autorizadas para limpieza de pruebas igual que products y combo_items (D-009-15); pedir confirmación al orquestador si hace falta registrarla.
- Hasher rápido: `createBcryptPinHasher({ cost: 4 })` donde haga falta una app o un usuario. Reloj: `createApp({ sequelize, now: () => current, pinHasher })` con un T0 fijo; las cookies salen de inicios de sesión reales con `loginWithCookie`.
- Mesas, pedidos y estados base se crean con los servicios reales (`createTableService`, `createOrderService` cuando exista); para semillas que violen el servicio (pedido con ambas marcas, merged, punteros a mano) se puede usar SQL directo sobre polleria_test, igual que se hizo con combo_items.
- Concurrencia (AC-08): dos llamadas `Promise.allSettled` sobre la misma mesa; se acepta que una lance TABLE_OCCUPIED y la otra gane, verificando que quedó un solo pedido y una sola ocupación.
- Textos con caracteres especiales siempre con escapes, nunca literales.
- Commits con prefijo test, por ejemplo `test(009): pruebas del servicio de pedidos`.

### T-01. Esquemas, enums y códigos en shared
- Responsable: test-writer
- Dependencias: ninguna
- AC: AC-01, AC-02
- Descripción: packages/shared/src/tables.test.ts y orders.test.ts nuevos (importando desde '@polleria/shared'). En tables.test.ts: `tableNameSchema` con la tabla de acepta/rechaza y mensajes exactos de AC-01; `createTableRequestSchema` y `updateTableRequestSchema` con sus casos; `TABLE_STATES` exacto, `tableSchema` estricto (clave de más, 'ocupada' fallan) y `tablesResponseSchema`. En orders.test.ts: `ORDER_STATUSES` exacto; `orderSchema` estricto con `closedBy`/`cancelReason`/`mergedIntoOrderId` nulables y fechas ISO o null; `moveOrderRequestSchema`, `joinTableRequestSchema` y `cancelOrderRequestSchema` con sus tablas y el issue en el campo correspondiente. En ambos: los nueve códigos nuevos dentro de `ERROR_CODES` (AC-02) y `errorResponseSchema` aceptándolos y rechazando uno fuera de lista.

### T-02. Tablas orders/tables, migración y helpers de limpieza
- Responsable: test-writer
- Dependencias: ninguna
- AC: AC-03, AC-04, AC-05
- Descripción:
  - apps/api/tests/tables-orders-migration.test.ts con AC-03, AC-04 y AC-05 sobre polleria_test: columnas, tipos y defaults por information_schema/pg_indexes/pg_constraint; todas las FK (tables→orders, orders→users en los cuatro `_by_user_id`, orders→orders en merged_into); INSERTs válidos y los que deben fallar por cada CHECK (`tables_name_valid`, `orders_status_allowed`, `orders_closed_consistent`, `orders_cancel_reason`, `orders_merged_consistent`, `orders_no_self_merge`, `orders_ready_pair`, `orders_bill_pair`); la unicidad `tables_name_unique` por `lower(name)`; migrateUp/migrateDown/re-up con la lista completa (posición 6 de MIGRATIONS).
  - Helpers (apps/api/tests/helpers/test-database.ts): `resetMigrationTables` borra `tables` y `orders` ANTES que `users` (las FK lo exigen); `clearOrderTables` nuevo que trunca `orders` y `tables` en un solo TRUNCATE, cada una detrás de su `tableExists` para que la fase roja no falle en la limpieza.
  - Actualizar las listas MIGRATIONS de apps/api/tests/users-migrations.test.ts, products-migration.test.ts, product-portions-migration.test.ts y combo-items-migration.test.ts: agregar '20261010120000-create-tables-orders.ts' al final; en users-migrations el down encadenado gana un paso (revertir tables/orders antes que combo_items).

### T-03. Servicio de mesas
- Responsable: test-writer
- Dependencias: T-02
- AC: AC-06, AC-07
- Descripción: apps/api/tests/table-service.test.ts sobre polleria_test. AC-06: la escena de cuatro mesas con un pedido unido `ready_at` y otro `bill_requested_at` — orden por colación natural ('Barra', 'Depósito', 'Mesa 2', 'Mesa 10'), `state` derivado en cada una, el mismo `order` embebido en las dos mesas unidas con todas las claves de D-009-14, la inactiva con `isActive: false`, y la precedencia `ready` con ambas marcas. AC-07: createTable devuelve la mesa `free`; TABLE_NAME_TAKEN en create y update con otra capitalización; desactivar/reactivar una libre y el TABLE_HAS_OPEN_ORDER sobre una ocupada; TABLE_NOT_FOUND en update de id inexistente; los ZodError de forma antes de tocar la base.

### T-04. Servicio de pedidos
- Responsable: test-writer
- Dependencias: T-02, T-03
- AC: AC-08, AC-09, AC-10, AC-11, AC-12, AC-13, AC-14
- Descripción: apps/api/tests/order-service.test.ts sobre polleria_test con usuarios reales (mozo Juan y un admin). AC-08: openOrder crea el pedido y ocupa la mesa; el segundo intento lanza TABLE_OCCUPIED sin crear otro pedido; TABLE_INACTIVE y TABLE_NOT_FOUND; dos aperturas concurrentes dejan un solo pedido. AC-09: getOrder devuelve el Order completo de D-009-14 (un pedido merged muestra status 'merged', tables [] y mergedIntoOrderId); ORDER_NOT_FOUND. AC-10: moveOrder mueve todas las mesas del pedido a la destino conservando las marcas; TABLE_OCCUPIED / TABLE_INACTIVE / issue 'Esa mesa no existe.' / ORDER_NOT_OPEN; el no-op cuando ya cubre solo la destino. AC-11: joinTable libre→ocupada adjunta; ocupada→ocupada fusiona (origen 'merged' con merged_into_order_id y closed_by, destino con todas las mesas); no-op cuando ya comparten pedido; TABLE_HAS_NO_ORDER en destino libre; TABLE_INACTIVE; issues 'Esa mesa no existe.' y 'La mesa de destino debe ser otra.'; las marcas del pedido absorbido mueren y las del destino se conservan. AC-12: leaveTable suelta la mesa y el pedido sigue con la otra; ORDER_NEEDS_TABLE en la última; TABLE_HAS_NO_ORDER en una libre; TABLE_NOT_FOUND. AC-13: requestBill pone la marca y repite como no-op conservando la primera; markReady igual y deriva `ready` con precedencia sobre bill_requested; markServed limpia y un ready posterior vuelve a marcar; ORDER_NOT_OPEN en cerrado/merged; ORDER_NOT_FOUND. AC-14: cancelOrder con motivo y autor pone status/cancel_reason/closed_* y libera todas las mesas en la misma transacción (verificado con listTables); ZodError por reason inválido; ORDER_NOT_OPEN en no abierto.

### T-05. API de mesas y pedidos
- Responsable: test-writer
- Dependencias: T-02, T-03, T-04
- AC: AC-15, AC-16, AC-17, AC-18, AC-19, AC-20, AC-21
- Descripción: apps/api/tests/tables-api.test.ts (u orders-api.test.ts; pueden ser dos archivos si conviene). Cookies reales por rol (mozo, cocina, caja, admin; admin+mozo para el multi-rol) con `loginWithCookie`; console.error espiado. Comprobar: GET /api/tables con cada rol y sin cookie, forma y orden de AC-06 y `no-store` (AC-15); POST y PATCH /api/tables con los 201/200 de admin, los 403 del resto, TABLE_NAME_TAKEN con cuerpo exacto, TABLE_HAS_OPEN_ORDER, TABLE_NOT_FOUND, el 400 'No indicaste ningún cambio.' (AC-16); POST /api/tables/{id}/orders 201 de mozo/admin con `openedBy` de la sesión, 403 de cocina/caja, TABLE_OCCUPIED, TABLE_INACTIVE, TABLE_NOT_FOUND y el 400 por tableId inválido, más GET /api/orders/{id} con sus 200/404/400 (AC-17); join y leave por HTTP con el merge verificable por GET y todos sus errores (AC-18); move/request-bill/ready/served con sus roles (ready acepta cocina; caja recibe 403), el pedido cerrado con ORDER_NOT_OPEN y los no-op conservando la primera marca (AC-19); cancel con su 200, el issue en `reason`, ORDER_NOT_OPEN y los 403 (AC-20); y los 404 de métodos/sub-rutas no declarados más los errores del lector del cuerpo con `sendRawBody` (INVALID_JSON, INVALID_BODY, UNSUPPORTED_MEDIA_TYPE, PAYLOAD_TOO_LARGE; todos con no-store) (AC-21).

### Verificación del rojo (al terminar T-01 a T-05)
- `pnpm test` falla solo por módulos inexistentes (shared/tables.ts, shared/orders.ts, table.service.ts, order.service.ts, controllers/rutas nuevos) o comportamiento ausente (la migración nueva, los modelos, los códigos de error). Las pruebas de las specs 001 a 008 siguen en verde salvo las actualizaciones deliberadas de T-02 (listas MIGRATIONS que esperan la migración nueva) — rojo válido y esperado.
- `pnpm typecheck` y `pnpm lint` pueden fallar solo en cascada por los módulos que aún no existen.

## Implementación del backend (backend-dev)

Reglas comunes:
- No crear, modificar ni borrar archivos de prueba (`*.test.ts`, `*.test.tsx`, apps/api/tests/, e2e/). Si una prueba parece contradecir la spec, detenerse y reportarlo.
- Sintaxis borrable (D-02 de la 001), imports relativos con .ts, mensajes exactos de la spec. Sin SQL con interpolación de valores: consultas con bind/replacements como en las migraciones anteriores.
- Sin dependencias nuevas ni variables de entorno nuevas. apps/web no se toca (R-009-05).
- Concurrencia: dentro de las transacciones, bloquear las filas de orders y tables en orden de id con FOR NO KEY UPDATE (lección de la corrección de la 006/007) y re-verificar el estado antes de confirmar.
- Commits con prefijo feat, sin archivos de prueba. Antes de cada commit: `pnpm --filter @polleria/api run typecheck` y `pnpm lint`.

### T-06. Esquemas, enums y códigos en shared
- Responsable: backend-dev
- Dependencias: T-01
- AC: AC-01, AC-02
- Descripción: packages/shared/src/tables.ts y orders.ts nuevos, exportados por index.ts. tables.ts: TABLE_NAME_MAX (40); `tableNameSchema` con la normalización de los nombres anteriores (recorta, reduce espacios seguidos, NFC) y la clase de caracteres 'letras, números, espacios, punto, guion o guion bajo' con los dos mensajes de AC-01; `createTableRequestSchema` strict; `updateTableRequestSchema` strict con refine 'No indicaste ningún cambio.'; TABLE_STATES, tableStateSchema, tableSchema y tablesResponseSchema con sus types. orders.ts: ORDER_STATUSES, orderStatusSchema; `userRefSchema` y `tableRefSchema`; `orderSchema` strict de D-009-14 con fechas ISO o null y los nulables; `moveOrderRequestSchema`, `joinTableRequestSchema` (entero 1..2147483647 con 'El identificador de la mesa no es válido.'), `cancelOrderRequestSchema` (CANCEL_REASON_MAX 200, recorte, 'Escribe el motivo de la anulación (hasta 200 caracteres).') con sus types. errors.ts suma los nueve códigos de AC-02. Mantener el 90 % de cobertura de shared.

### T-07. Migración y modelos Order/Table
- Responsable: backend-dev
- Dependencias: T-02, T-06
- AC: AC-03, AC-04, AC-05 (requisito R-009-04)
- Descripción: apps/api/src/db/migrations/20261010120000-create-tables-orders.ts con up/down según la sección 8 de la spec — `up` crea `orders` primero y `tables` después (FK tables→orders), con todos los CHECK de AC-03/AC-04, el índice único por `lower(name)`, `tables_current_order_id` parcial y `orders_opened_by_user_id`, todo en una transacción; `down` borra `tables` y luego `orders` (estilo de las migraciones anteriores: SQL por query dentro de transacción). models/index.ts suma OrderAttributes/TableAttributes, OrderModel/TableModel, `Models.Order` y `Models.Table` con `sequelize.define` (`tableName: 'orders'/'tables'`, `underscored`, STRING(16) para status, STRING(200) para cancel_reason); la guardia `isDefined` contempla ambos; `initOrderTableAssociations` registra las asociaciones de §8.3 (openedBy/readyBy/billRequestedBy/closedBy a User, auto-referencia mergedInto, Table.belongsTo Order como currentOrder y Order.hasMany Table como tables), invocada desde initAssociations.

### T-08. Servicio de mesas
- Responsable: backend-dev
- Dependencias: T-03, T-07
- AC: AC-06, AC-07
- Descripción: apps/api/src/services/tables/table.service.ts nuevo: `createTableService({ models })` con `listTables()` (todas las mesas —activas e inactivas— ordenadas por nombre con `Intl.Collator('es', { sensitivity: 'base', numeric: true })`; cada una con `state` derivado según D-009-03 y el `order` embebido completo de D-009-14 — una sola consulta de pedidos por lote, sin N+1), `createTable(input)` (ZodError por forma → fila con isActive true; unicidad case-insensitive → TABLE_NAME_TAKEN) y `updateTable(tableId, changes)` (TABLE_NOT_FOUND; rename con TABLE_NAME_TAKEN; isActive:false sobre ocupada → TABLE_HAS_OPEN_ORDER con re-verificación en transacción). Exportar los creadores de error con los mensajes exactos de D-009-13 (createTableNameTakenError, createTableHasOpenOrderError, etc.) reutilizables también por el servicio de pedidos.

### T-09. Servicio de pedidos
- Responsable: backend-dev
- Dependencias: T-04, T-08
- AC: AC-08, AC-09, AC-10, AC-11, AC-12, AC-13, AC-14
- Descripción: apps/api/src/services/orders/order.service.ts nuevo: `createOrderService({ models })` con la forma de D-009-14 en todas las respuestas.
  - `openOrder(tableId, { userId })`: TABLE_NOT_FOUND / TABLE_INACTIVE; UPDATE condicional `current_order_id IS NULL` (afecta 0 filas → TABLE_OCCUPIED) e INSERT del pedido con `opened_by_user_id` en una transacción (o INSERT + UPDATE con rollback si la ocupación falla — que la serialización en la fila sea la guardia).
  - `getOrder(orderId)`: ORDER_NOT_FOUND; el Order con `tables` (las que lo apuntan), `openedBy`/`closedBy` como `{id, displayName}` y el resto de columnas.
  - `moveOrder(orderId, tableId, actor)`: ORDER_NOT_FOUND / ORDER_NOT_OPEN; destino inexistente → VALIDATION_ERROR con issue en `tableId` ('Esa mesa no existe.'); inactiva → TABLE_INACTIVE; ocupada → TABLE_OCCUPIED; ya cubre solo la destino → no-op; mueve todos los punteros en transacción con locks en orden de id.
  - `joinTable(tableId, intoTableId, actor)`: guardias de la mesa origen (NOT_FOUND / INACTIVE) y del destino (issue de formato/inexistencia/'La mesa de destino debe ser otra.', 409 TABLE_INACTIVE / TABLE_HAS_NO_ORDER); mismo pedido → no-op; origen libre → repoint; origen ocupada → merge: mesas del pedido origen al destino, origen a `merged` con closed_*/merged_into_order_id y las marcas del destino intactas (RN-009-05, D-009-08).
  - `leaveTable(tableId, actor)`: TABLE_NOT_FOUND; libre → TABLE_HAS_NO_ORDER; última mesa del pedido → ORDER_NEEDS_TABLE; repoint a NULL.
  - `requestBill` / `markReady` / `markServed`: ORDER_NOT_FOUND / ORDER_NOT_OPEN; ponen el par `*_at` + `*_by_user_id` solo si faltaba (no-op conservando la primera marca) / limpian el par ready (no-op si ya estaba limpio).
  - `cancelOrder(orderId, reason, actor)`: ZodError por reason; ORDER_NOT_FOUND / ORDER_NOT_OPEN; `cancelled` con cancel_reason + closed_* y todas sus mesas liberadas en la misma transacción (RN-009-08).

### T-10. Controllers, rutas, app.ts y openapi.yaml
- Responsable: backend-dev
- Dependencias: T-05, T-09
- AC: AC-15, AC-16, AC-17, AC-18, AC-19, AC-20, AC-21 (requisitos R-009-01, R-009-02)
- Descripción:
  - apps/api/src/controllers/tables.controller.ts: `list`, `create`, `update`, `openOrder`, `join`, `leave`. `tableId` con un parser generalizado de parámetros (misma regla `^[0-9]+$`, 1..2147483647 que `parseProductIdParam` — extraer la lógica compartida sin romper products.controller.ts) con 'El identificador de la mesa no es válido.'; cuerpos con los esquemas de shared (ZodError al errorHandler). Respuestas: 200/201 según la tabla de la sección 9.
  - apps/api/src/controllers/orders.controller.ts: `get`, `move`, `requestBill`, `markReady`, `markServed`, `cancel`; `orderId` con el mismo parser y 'El identificador del pedido no es válido.'; el usuario actor sale de la sesión (`req.session.user`), no del cuerpo.
  - apps/api/src/routes/tables/tables.routes.ts y routes/orders/orders.routes.ts: routers montando las 12 rutas de la sección 9 con `requireAuth` en todas y `requireRole` según la tabla (GET libre a cualquier rol con sesión; POST/PATCH /tables admin; orders y operaciones de salón waiter+admin, con `ready` sumando kitchen); `Cache-Control: no-store` propio en cada router; requireJsonContentType/requireJsonObject solo en las cinco rutas con cuerpo (POST /tables, PATCH /tables/{id}, move, join, cancel); montadas en routes/index.ts antes del 404 para que los métodos no declarados den 404.
  - app.ts: crea ambos servicios y controllers; `NO_STORE_PATH_PREFIXES` suma '/api/tables' y '/api/orders' (cambio señalado en §12).
  - docs/api/openapi.yaml: edición aditiva 0.7.0 → 0.8.0 con el alcance del encabezado de este archivo; mantener el lint de Redocly en verde.

## Cierre

### T-11. Verificación final
- Responsable: backend-dev
- Dependencias: T-06 a T-10
- AC: todos (requisitos R-009-01 a R-009-07)
- Descripción:
  - `pnpm test`, `pnpm lint`, `pnpm typecheck` y `pnpm test:coverage` con código 0 (services de la API —tables y orders— con 90 % o más; shared con 90 % o más; serializados por usar la misma base).
  - R-009-01 (roles en el router, leídos por el reviewer), R-009-03 (`git diff` vacío en apps/api/.env.example y CONFIG_VARIABLES), R-009-04 (una sola migración nueva en el orden de MIGRATIONS) y R-009-05 (`git status --porcelain apps/web` vacío y el grep de R-14 de la 001).
  - R-009-02: openapi lint con Redocly desde una carpeta temporal (como en la 003/004/005/006/007) y contraste de las 12 rutas contra lo implementado.
  - Anotar en el reporte los pendientes manuales para el usuario: sección 18 de la spec (db:migrate en polleria_dev, crear las mesas por API con la cookie de admin y el recorrido manual de estados).

## Matriz AC, pruebas e implementación

| AC | Prueba (test-writer) | Implementación |
| --- | --- | --- |
| AC-01, AC-02 | T-01 | T-06 |
| AC-03 a AC-05 | T-02 | T-07 |
| AC-06, AC-07 | T-03 | T-08 |
| AC-08 a AC-14 | T-04 | T-09 |
| AC-15 a AC-21 | T-05 | T-10 |
| R-009-01 a R-009-07 | — | T-11 |
