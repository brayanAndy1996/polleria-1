# Tareas — Spec 007: combos (productos compuestos con precio propio)

- Spec: docs/specs/007-combos/spec.md (Borrador/Propuesta, pendiente de aprobación del usuario)
- Rama: feat/007-combos
- Contrato: docs/api/openapi.yaml (versión 0.7.0: /products/{productId}/items GET y PUT; ComboItemInput, ReplaceComboItemsRequest, ComboItem, ComboItemsResponse; 'combo' en ProductCategory; códigos COMBO_ITEMS_NOT_ALLOWED, PRODUCT_HAS_ITEMS y PRODUCT_IS_COMPONENT)
- ADR: ninguno nuevo (reutiliza lo ya decidido: umzug, Sequelize, Zod, requireAuth/requireRole, formato de errores; D-007-15)
- Dependencias: ninguna nueva. Sin variables de entorno nuevas. Una migración nueva: 20261009180000-create-combo-items.ts (tabla combo_items + ALTER del CHECK products_category_allowed).
- Alcance especial: la 007 es dominio + API solamente (D-007-01, S-007-08). No hay tareas de frontend-dev ni pruebas E2E: las pantallas son de la 008 y la venta del combo de la Fase 2.

## Orden y por qué

1. **Sin instalación ni andamiaje**: no hay paquetes ni configuración nuevos; el primer paso es directamente el test-writer.
2. **Pruebas en rojo (T-01 a T-04)**: test-writer escribe las pruebas de los 15 AC (esquemas y función de consumo en shared; migración, tabla combo_items y ALTER del CHECK de categoría; servicio de componentes + las dos guardias de categoría del servicio de productos; y la API sobre polleria_test) y ajusta helpers y listas MIGRATIONS heredadas.
3. **Implementación (backend-dev)**: primero T-05 (esquemas, función y códigos de shared, los necesita todo lo demás), luego T-06 (migración y modelo ComboItem), T-07 (servicio de componentes y guardias en product.service) y T-08 (controller, rutas y app).
4. **Cierre (T-09)**: definición de terminado y requisitos R-007-01 a R-007-07.

Aprobación: pendiente — la spec queda en Borrador/Propuesta con 10 preguntas abiertas y su recomendación (sección 17); las tareas no se ejecutan hasta la aprobación explícita del usuario.

## Pruebas en rojo (test-writer)

Reglas comunes:
- Cada archivo de prueba de esta spec envuelve sus pruebas en un `describe` cuyo nombre empieza con `007:` y el nombre de cada prueba empieza con el ID del AC: `it('AC-12: reemplaza los componentes por HTTP', ...)`.
- Importar desde las rutas de la sección 11 de la spec; que fallen por módulo inexistente es un rojo válido.
- Base de pruebas: solo polleria_test (DATABASE_URL_TEST) con las guardias de RN-001-02. Vaciar users y sessions con `clearAuthTables` / `migrateAndClearAuthTables`, y combo_items + product_portions + products con `clearMenuTables` actualizado en T-02.
- Hasher rápido: `createBcryptPinHasher({ cost: 4 })` donde haga falta una app o un usuario.
- Reloj: `let current = T0; createApp({ sequelize, now: () => current, pinHasher })`, con `T0 = new Date('2026-10-09T15:00:00.000Z')`. Las cookies salen de inicios de sesión reales con `loginWithCookie`; el administrador es un usuario con `roles: ['admin']`.
- Los productos se crean con `createProductService({ models })` (la categoría 'combo' ya es válida para las pruebas de esta spec), las presentaciones con `createProductPortionService({ models })` y los componentes con `createComboItemService({ models })` (cuando exista) o con SQL directo para casos especiales (repetidos a nivel de base, filas que violan el servicio).
- Textos con caracteres especiales siempre con escapes, nunca literales.
- Commits con prefijo test, por ejemplo `test(007): pruebas de la API de componentes de combos`.

### T-01. Esquemas, categoría y función de consumo en shared
- Responsable: test-writer
- Dependencias: ninguna
- AC: AC-01, AC-02, AC-03, AC-04, AC-05
- Descripción: packages/shared/src/combos.test.ts nuevo (importando desde '@polleria/shared') + ajustes en packages/shared/src/products.test.ts. En combos.test.ts: `comboItemInputSchema` con tabla de acepta/rechaza y mensajes exactos de AC-02; `replaceComboItemsRequestSchema` con el vacío, el tope de 10, los repetidos por (productId, portion, cut) con el índice de la segunda aparición y las formas inválidas de AC-03; claves exactas de `comboItemSchema` (product embebido estricto) y `comboItemsResponseSchema`, más los tres códigos nuevos en ERROR_CODES (AC-04); y `comboChickenConsumption` con la tabla de consumos de AC-05, incluida la fila con `portion` nula que aporta 0 y los lanzamientos por combinación inválida o `cut` sin `portion`. En products.test.ts: PRODUCT_CATEGORIES pasa a la lista de 7 con 'combo' en segundo lugar (AC-01) y 'combo' sale del bloque de rechazados — actualizar también el adversarial de la 005 que afirmaba lo contrario (packages/shared/tests/adversarial/products-validation-005.adversarial.test.ts: la lista ahora tiene siete categorías).

### T-02. Tabla combo_items, ALTER del CHECK y helpers de limpieza
- Responsable: test-writer
- Dependencias: ninguna
- AC: AC-06, AC-07
- Descripción:
  - apps/api/tests/combo-items-migration.test.ts con AC-06 y AC-07 sobre polleria_test: columnas, tipos y defaults por information_schema/pg_indexes/pg_constraint; ambas FK a products; INSERTs válidos y los que deben fallar (quantity fuera de rango, portion/cut fuera de lista, correspondencia `combo_items_portion_cut`, FKs); la unicidad `combo_items_unique` con NULLS NOT DISTINCT (repetir `(product, NULL, NULL)` falla; mismo producto con distinta parte pasa); INSERT en products con `category 'combo'` aceptado y `'combos'`/`'COMBO'` rechazados; migrateUp/migrateDown/re-up con la lista completa (el down restaura el CHECK sin 'combo').
  - Helpers (apps/api/tests/helpers/test-database.ts): `resetMigrationTables` borra también `combo_items` ANTES que `products` (hay doble FK); `clearMenuTables` trunca `combo_items` junto a `product_portions` y `products`, cada una detrás de su `tableExists` para que la fase roja no falle en la limpieza. La tabla combo_items está autorizada para limpieza de pruebas igual que products y product_portions (D-007-14); pedir confirmación al orquestador si hace falta registrarla.
  - Actualizar las listas MIGRATIONS de apps/api/tests/users-migrations.test.ts, products-migration.test.ts y product-portions-migration.test.ts: agregar '20261009180000-create-combo-items.ts' al final; en users-migrations el down encadenado gana un paso (revertir combo_items antes que product_portions). También actualizar los rechazos de `category: 'combo'` en apps/api/tests/products.test.ts y products-service.test.ts (la categoría ahora es válida: pasan a afirmar el alta y el listado ordenado tras 'chicken').

### T-03. Servicio de componentes y guardias de categoría
- Responsable: test-writer
- Dependencias: T-02
- AC: AC-08, AC-09, AC-10
- Descripción: apps/api/tests/combo-items-service.test.ts sobre polleria_test: orden por categoría→nombre→id, claves exactas del ítem y del producto embebido, `[]` en producto sin componentes o no 'combo', PRODUCT_NOT_FOUND (AC-08); reemplazo completo, idempotencia (mismo PUT dos veces no duplica filas), conjunto vacío, atomicidad ante un ítem inválido, PRODUCT_NOT_FOUND, COMBO_ITEMS_NOT_ALLOWED en 'dish'/'drink'/'chicken', los cuatro issues de componente en un solo VALIDATION_ERROR en orden, la porción libre sin exigir presentación del producto, componente inactivo aceptado, quantity 1..99 y rechazos Zod (AC-09); y las guardias de updateProduct: PRODUCT_HAS_ITEMS saliendo de 'combo' con componentes (y el flujo items:[] → PATCH), PRODUCT_IS_COMPONENT cambiando de categoría un producto referenciado, PATCH libre de otros campos y PRODUCT_HAS_PORTIONS vigente hacia 'combo' (AC-10).

### T-04. API de componentes
- Responsable: test-writer
- Dependencias: T-02, T-03
- AC: AC-11, AC-12, AC-13, AC-14, AC-15
- Descripción: apps/api/tests/combo-items.test.ts. Cookies reales por rol (admin, mozo, cocinero, cajero; waiter+admin para el permitido y waiter+cashier para el 403). console.error espiado (los 4xx no se registran). Comprobar: orden y forma exacta en GET con el producto embebido, `[]` en producto sin componentes o no 'combo', 404 y 400 por productId, 401 sin cookie (AC-11); PUT 200 de admin (incluido multi-rol admin), 403 de los roles sin admin, 409 COMBO_ITEMS_NOT_ALLOWED con cuerpo exacto, 400 con los cuatro issues en orden y atomicidad verificada con GET, `{ items: [] }`, `Cache-Control: no-store` en todas las respuestas (AC-12); los 409 PRODUCT_HAS_ITEMS y PRODUCT_IS_COMPONENT del PATCH con cuerpos exactos y el desbloqueo tras vaciar (AC-13); los 404 de métodos no declarados (AC-14); y los errores del lector del cuerpo con `sendRawBody` (INVALID_JSON, INVALID_BODY, PAYLOAD_TOO_LARGE, UNSUPPORTED_MEDIA_TYPE, todos con no-store) (AC-15).

### Verificación del rojo (al terminar T-01 a T-04)
- `pnpm test` falla solo por módulos inexistentes (shared/combos.ts, combo-item.service.ts, controller/rutas) o comportamiento ausente (la migración nueva, las guardias de categoría y 'combo' en PRODUCT_CATEGORIES). Las pruebas de las specs 001 a 006 siguen en verde salvo las actualizaciones deliberadas de T-01/T-02 (la categoría 'combo' ya aceptada y las listas MIGRATIONS que esperan la migración nueva) — rojo válido y esperado.
- `pnpm typecheck` y `pnpm lint` pueden fallar solo en cascada por los módulos que aún no existen.

## Implementación del backend (backend-dev)

Reglas comunes:
- No crear, modificar ni borrar archivos de prueba (`*.test.ts`, `*.test.tsx`, apps/api/tests/, e2e/). Si una prueba parece contradecir la spec, detenerse y reportarlo.
- Sintaxis borrable (D-02 de la 001), imports relativos con .ts, mensajes exactos de la spec. Sin SQL con interpolación de valores.
- Sin dependencias nuevas ni variables de entorno nuevas.
- Commits con prefijo feat, sin archivos de prueba. Antes de cada commit: `pnpm --filter @polleria/api run typecheck` y `pnpm lint`.

### T-05. Esquemas, función de consumo y códigos en shared
- Responsable: backend-dev
- Dependencias: T-01
- AC: AC-01, AC-02, AC-03, AC-04, AC-05
- Descripción: packages/shared/src/combos.ts (exportado por index.ts) con COMBO_ITEMS_MAX (10) y COMBO_ITEM_QUANTITY_MAX (99); comboItemInputSchema (strict; productId 1..2147483647 con 'El identificador del producto no es válido.'; quantity 1..99 con 'Indica cuántas unidades lleva este componente.'; portion/cut nullish normalizados a null; refines de correspondencia con PORTION_CUT_MESSAGE y 'Sin presentación no se puede indicar la parte.'); comboItemsUniqueRefinement y replaceComboItemsRequestSchema (strict, arreglo con máximo 10 y refine de repetidos por (productId, portion, cut) con 'Hay componentes repetidos en la lista.' y 'Un combo admite hasta 10 componentes.'); comboItemSchema y comboItemsResponseSchema con sus types; comboChickenConsumption (suma quantity × chickenConsumption por ítem con portion; lanza ante cut sin portion). products.ts: PRODUCT_CATEGORIES con 'combo' en 2º lugar y comentario actualizado. errors.ts suma COMBO_ITEMS_NOT_ALLOWED, PRODUCT_HAS_ITEMS y PRODUCT_IS_COMPONENT. Mantener el 90 % de cobertura de shared.

### T-06. Migración y modelo ComboItem
- Responsable: backend-dev
- Dependencias: T-02, T-05
- AC: AC-06, AC-07 (requisito R-007-04)
- Descripción: apps/api/src/db/migrations/20261009180000-create-combo-items.ts con up/down según la sección 8.1 de la spec (tabla con CHECKs `combo_items_quantity_range`, `combo_items_portion_allowed`, `combo_items_cut_allowed` y `combo_items_portion_cut`; `CONSTRAINT combo_items_unique UNIQUE NULLS NOT DISTINCT (combo_id, product_id, portion, cut)`; `CREATE INDEX combo_items_combo_id` y `combo_items_product_id`; ALTER TABLE que reemplaza `products_category_allowed` por la lista con 'combo' en 2º lugar, todo en la misma transacción; down borra la tabla y restaura el CHECK sin 'combo'; estilo de las migraciones anteriores: SQL por query dentro de transacción). models/index.ts suma ComboItemAttributes, ComboItemModel, `Models.ComboItem` y el `sequelize.define` (`tableName: 'combo_items'`, `underscored`, STRING(8) para portion y cut con allowNull en ambos); la guardia `isDefined` contempla 'ComboItem' y `initComboItemAssociations` registra Product.hasMany(ComboItem, 'comboItems', 'combo_id'), ComboItem.belongsTo(Product, 'combo', 'combo_id') y ComboItem.belongsTo(Product, 'product', 'product_id'), invocada desde initAssociations.

### T-07. Servicio de componentes y guardias de categoría
- Responsable: backend-dev
- Dependencias: T-03, T-05, T-06
- AC: AC-08, AC-09, AC-10
- Descripción:
  - apps/api/src/services/combo-items/combo-item.service.ts nuevo: `createComboItemService({ models })` con listComboItems (verifica el producto o PRODUCT_NOT_FOUND; ítems ordenados por categoría del componente según PRODUCT_CATEGORIES, nombre con el collator 'es' base y empates por id; producto embebido con sus cinco claves) y replaceComboItems (parsea con el esquema de shared → ZodError; PRODUCT_NOT_FOUND; COMBO_ITEMS_NOT_ALLOWED si la categoría no es 'combo'; dentro de `models.ComboItem.sequelize.transaction`: lock FOR NO KEY UPDATE de los productos referenciados en orden de id, validación de los cuatro issues de D-007-10 en orden de lista → VALIDATION_ERROR con details.issues, destroy de filas anteriores, bulkCreate con updateOnDuplicate ['quantity'] sobre la unicidad, lock FOR NO KEY UPDATE de la fila del combo y re-verificación de categoría, destroy de filas ajenas confirmadas en el hueco; devuelve el conjunto ordenado). Exportar `createComboItemsNotAllowedError`, `createProductHasItemsError` y `createProductIsComponentError` con los mensajes exactos de D-007-11.
  - apps/api/src/services/products/product.service.ts (modificado): updateProduct suma dos guardias — `createProductHasItemsError()` cuando `changes.category` viene definida, distinta de 'combo' y el producto tiene filas en combo_items por combo_id; `createProductIsComponentError()` cuando `changes.category` viene definida, distinta de la categoría actual y el producto tiene filas en combo_items por product_id — ambas con re-verificación DESPUÉS del UPDATE y reversión a los valores originales (mismo patrón que la corrección de la 006). El resto del servicio no cambia.

### T-08. Controller, rutas y app
- Responsable: backend-dev
- Dependencias: T-04, T-07
- AC: AC-11, AC-12, AC-13, AC-14, AC-15 (requisito R-007-01)
- Descripción:
  - apps/api/src/controllers/combo-items.controller.ts: handlers `list` y `replace`; `productId` con `parseProductIdParam` (reutilizar el exportado por products.controller.ts); cuerpo con `replaceComboItemsRequestSchema` (ZodError al errorHandler); ambos responden 200 con el conjunto.
  - apps/api/src/routes/combo-items/combo-items.routes.ts nuevo: `router.get('/api/products/:productId/items', requireAuth, comboItemsController.list)` y `router.put('/api/products/:productId/items', requireAuth, requireRole('admin'), comboItemsController.replace)`, con `Cache-Control: no-store` idempotente en el router (el prefijo '/api/products' de app.ts ya las cubre, D-007-08). Mantener el montaje antes del 404 para que los métodos no declarados sigan dando 404.
  - routes/index.ts: ApiRouterDependencies suma comboItemsController y lo monta.
  - app.ts: crea `createComboItemService({ models })` y `createComboItemsController`; NO_STORE_PATH_PREFIXES no cambia.

## Cierre

### T-09. Verificación final
- Responsable: backend-dev
- Dependencias: T-05 a T-08
- AC: todos (requisitos R-007-01 a R-007-07)
- Descripción:
  - `pnpm test`, `pnpm lint`, `pnpm typecheck` y `pnpm test:coverage` con código 0 (services de la API, incluido el de componentes, con 90 % o más; shared con 90 % o más).
  - R-007-03 (`git diff main -- apps/api/.env.example apps/api/src/config/env.ts` vacío), R-007-04 (solo una migración nueva, en el orden de MIGRATIONS) y R-007-05 (`git status --porcelain apps/web` vacío y el grep de R-14 de la 001).
  - R-007-02: openapi lint con Redocly desde una carpeta temporal (como en la 003/004/005/006).
  - Anotar en el reporte los pendientes manuales para el usuario: sección 18 de la spec (`pnpm db:migrate` en polleria_dev y las verificaciones por API con la cookie de sesión).

## Matriz AC, pruebas e implementación

| AC | Prueba (test-writer) | Implementación |
| --- | --- | --- |
| AC-01 a AC-05 | T-01 | T-05 |
| AC-06, AC-07 | T-02 | T-06 |
| AC-08 a AC-10 | T-03 | T-07 |
| AC-11 a AC-15 | T-04 | T-08 |
| R-007-01 a R-007-07 | — | T-09 |
