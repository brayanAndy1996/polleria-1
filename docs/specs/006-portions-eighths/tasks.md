# Tareas — Spec 006: presentaciones y partes del pollo con consumo en octavos

- Spec: docs/specs/006-portions-eighths/spec.md (Aprobada, 2026-10-09)
- Rama: feat/006-portions-eighths
- Contrato: docs/api/openapi.yaml (versión 0.6.0: /products/{productId}/portions GET y PUT; Portion, Cut, ProductPortion, ReplaceProductPortionsRequest, ProductPortionsResponse; códigos PORTIONS_NOT_ALLOWED y PRODUCT_HAS_PORTIONS)
- ADR: ninguno nuevo (reutiliza lo ya decidido: umzug, Sequelize, Zod, requireAuth/requireRole, formato de errores; D-006-12)
- Dependencias: ninguna nueva. Sin variables de entorno nuevas. Una migración nueva: 20261009120000-create-product-portions.ts.
- Alcance especial: la 006 es dominio + API solamente (D-006-01, S-006-07). No hay tareas de frontend-dev ni pruebas E2E: las pantallas son de la 008 y la carta del mozo de la Fase 2.

## Orden y por qué

1. **Sin instalación ni andamiaje**: no hay paquetes ni configuración nuevos; el primer paso es directamente el test-writer.
2. **Pruebas en rojo (T-01 a T-04)**: test-writer escribe las pruebas de los 14 AC (esquemas y función de consumo en shared, migración y tabla product_portions, servicio de presentaciones + guardia de categoría del servicio de productos, y API sobre polleria_test) y ajusta los helpers de limpieza para que cubran product_portions.
3. **Implementación (backend-dev)**: primero T-05 (esquemas, función y códigos de shared, los necesita todo lo demás), luego T-06 (migración y modelo ProductPortion), T-07 (servicio de presentaciones y guardia en product.service) y T-08 (controller, rutas y app).
4. **Cierre (T-09)**: definición de terminado y requisitos R-006-01 a R-006-07.

Aprobación: el usuario aprobó la spec el 2026-10-09 con las respuestas recomendadas a las preguntas 1 a 6 (supuestos S-006-01 a S-006-09 confirmados). Las tres consultas del dueño (¿vende 1/8?, ¿cómo arma el 1/2?, ¿pecho y pierna a distinto precio?) quedaron resueltas: el 1/8 se permite por producto sin obligar, el medio consume 2+2 por defecto con distribución real en el pedido de la Fase 2, y el precio es por presentación y parte.

## Pruebas en rojo (test-writer)

Reglas comunes:
- Cada archivo de prueba de esta spec envuelve sus pruebas en un `describe` cuyo nombre empieza con `006:` y el nombre de cada prueba empieza con el ID del AC: `it('AC-11: reemplaza las presentaciones por HTTP', ...)`.
- Importar desde las rutas de la sección 11 de la spec; que fallen por módulo inexistente es un rojo válido.
- Base de pruebas: solo polleria_test (DATABASE_URL_TEST) con las guardias de RN-001-02. Vaciar users y sessions con `clearAuthTables` / `migrateAndClearAuthTables`, y product_portions + products con `clearMenuTables` actualizado en T-02.
- Hasher rápido: `createBcryptPinHasher({ cost: 4 })` donde haga falta una app o un usuario.
- Reloj: `let current = T0; createApp({ sequelize, now: () => current, pinHasher })`, con `T0 = new Date('2026-10-09T15:00:00.000Z')`. Las cookies salen de inicios de sesión reales con `loginWithCookie`; el administrador es un usuario con `roles: ['admin']`.
- Los productos se crean con `createProductService({ models })` y las presentaciones con `createProductPortionService({ models })` (cuando existan) o con SQL directo para casos especiales (carga en desorden, repetidos a nivel de base).
- Textos con caracteres especiales siempre con escapes, nunca literales.
- Commits con prefijo test, por ejemplo `test(006): pruebas de la API de presentaciones`.

### T-01. Esquemas y función de consumo en shared
- Responsable: test-writer
- Dependencias: ninguna
- AC: AC-01, AC-02, AC-03, AC-04
- Descripción: packages/shared/src/portions.test.ts (importando desde '@polleria/shared'). Tablas de acepta/rechaza con `it.each` para PORTIONS, CUTS y sus esquemas (AC-01); tabla de consumos de AC-02 incluida la regla `breastEighths + legEighths = PORTION_EIGHTHS[portion]` y los lanzamientos en combinaciones inválidas (aceptar cualquier tipo de error: la spec pide que lance); acepta/rechaza de AC-03 con los mensajes exactos ('La parte no corresponde a la presentación: eighth y quarter llevan breast o leg; half y whole no llevan parte.', 'Hay presentaciones repetidas en la lista.', 'Un producto de pollo admite hasta 6 presentaciones.'); y claves exactas de productPortionSchema más los códigos nuevos en ERROR_CODES (AC-04).

### T-02. Tabla product_portions, migración y helpers de limpieza
- Responsable: test-writer
- Dependencias: ninguna
- AC: AC-05, AC-06
- Descripción:
  - apps/api/tests/product-portions-migration.test.ts con AC-05 y AC-06 sobre polleria_test: columnas, tipos y defaults por information_schema/pg_indexes/pg_constraint; FK a products; INSERTs válidos y los que deben fallar (listas de portion y cut, rango de price_cents, NULLs); el CHECK `product_portions_cut_matches_portion`; la unicidad `product_portions_unique` con NULLS NOT DISTINCT (repetir 'half' con cut NULL falla igual que repetir (quarter,breast)); migrateUp/migrateDown/re-up con la lista completa de migraciones.
  - Helpers (apps/api/tests/helpers/test-database.ts): `resetMigrationTables` borra también `product_portions` ANTES que `products` (hay FK); `clearMenuTables` trunca `product_portions` antes que `products`, cada una detrás de su `tableExists` para que la fase roja no falle en la limpieza. La tabla product_portions está autorizada para limpieza de pruebas igual que products (D-006-10); pedir confirmación al orquestador si hace falta registrarla.
  - Actualizar las listas MIGRATIONS de apps/api/tests/users-migrations.test.ts y apps/api/tests/products-migration.test.ts: agregar '20261009120000-create-product-portions.ts' al final (mismo ajuste que hizo la 005 sobre la 003; sección 12 de la spec).

### T-03. Servicio de presentaciones y guardia de categoría
- Responsable: test-writer
- Dependencias: T-02
- AC: AC-07, AC-08, AC-09
- Descripción: apps/api/tests/product-portions-service.test.ts sobre polleria_test: orden de la lista y claves exactas (AC-07); reemplazo completo, idempotencia, borrado de ausentes, conjunto vacío, atomicidad con fila inválida, PRODUCT_NOT_FOUND, PORTIONS_NOT_ALLOWED en producto 'dish' y rechazos Zod (AC-08); y la guardia de categoría de updateProduct con y sin presentaciones, incluido el caso 'chicken'→'chicken' y 'dish'→'chicken' (AC-09).

### T-04. API de presentaciones
- Responsable: test-writer
- Dependencias: T-02, T-03
- AC: AC-10, AC-11, AC-12, AC-13, AC-14
- Descripción: apps/api/tests/product-portions.test.ts. Cookies reales por rol (admin, mozo, cocinero, cajero; waiter+admin para el permitido y waiter+cashier para el 403). console.error espiado (los 4xx no se registran). Comprobar: orden y forma exacta en GET, `[]` en producto sin presentaciones o no 'chicken', 404 y 400 por productId; PUT con cuerpos válidos e inválidos, atomicidad verificada con GET, PORTIONS_NOT_ALLOWED con cuerpo exacto; el 409 PRODUCT_HAS_PORTIONS del PATCH de categoría con cuerpo exacto; los 404 de métodos no declarados; `Cache-Control: no-store` en todas las respuestas incluidos los errores del lector del cuerpo (INVALID_JSON, INVALID_BODY, PAYLOAD_TOO_LARGE, UNSUPPORTED_MEDIA_TYPE, con `sendRawBody` para los casos crudos); y que los rechazos no crean ni modifican filas.

### Verificación del rojo (al terminar T-01 a T-04)
- `pnpm test` falla solo por módulos inexistentes (shared/portions.ts, product-portion.service.ts, controller) o comportamiento ausente (la migración y la guardia de categoría que faltan). Las pruebas de las specs 001 a 005 siguen en verde salvo las dos listas MIGRATIONS actualizadas en T-02, que esperan la migración nueva (fallan hasta que T-06 exista — rojo válido y esperado).
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
- AC: AC-01, AC-02, AC-03, AC-04
- Descripción: packages/shared/src/portions.ts (exportado por index.ts) con PORTIONS + type Portion + portionSchema; CUTS + type Cut + cutSchema; PORTION_EIGHTHS; SINGLE_CUT_PORTIONS y MIXED_PORTIONS; ChickenConsumption y chickenConsumption (lanza error en combinaciones inválidas); PRODUCT_PORTIONS_MAX; PORTION_CUT_MESSAGE, PORTIONS_DUPLICATED_MESSAGE y el mensaje del tope; productPortionInputSchema (strict, cut nullish, refine de correspondencia); replaceProductPortionsRequestSchema (strict, arreglo con máximo 6 y refine de repetidos); productPortionSchema y productPortionsResponseSchema con sus types. errors.ts suma PORTIONS_NOT_ALLOWED y PRODUCT_HAS_PORTIONS. Mantener el 90 % de cobertura de shared.

### T-06. Migración y modelo ProductPortion
- Responsable: backend-dev
- Dependencias: T-02, T-05
- AC: AC-05, AC-06 (requisito R-006-04)
- Descripción: apps/api/src/db/migrations/20261009120000-create-product-portions.ts con up/down según la sección 8.1 (tabla con CHECKs `product_portions_portion_allowed`, `product_portions_cut_allowed`, `product_portions_price_cents_range` y `product_portions_cut_matches_portion`; `CONSTRAINT product_portions_unique UNIQUE NULLS NOT DISTINCT (product_id, portion, cut)`; `CREATE INDEX product_portions_product_id`; down borra la tabla; estilo de las migraciones anteriores: SQL por query dentro de transacción). models/index.ts suma ProductPortionAttributes, ProductPortionModel, `Models.ProductPortion` y el `sequelize.define` (`tableName: 'product_portions'`, `underscored`, STRING(8) para portion y cut con allowNull en cut); la guardia `isDefined` contempla 'ProductPortion' y se registran Product.hasMany(ProductPortion) y ProductPortion.belongsTo(Product) por 'productId'.

### T-07. Servicio de presentaciones y guardia de categoría
- Responsable: backend-dev
- Dependencias: T-03, T-05, T-06
- AC: AC-07, AC-08, AC-09
- Descripción:
  - apps/api/src/services/products/product-portion.service.ts nuevo: `createProductPortionService({ models })` con listProductPortions (verifica el producto o PRODUCT_NOT_FOUND; filas ordenadas según D-006-11 con los órdenes de PORTIONS y CUTS y empates por id; exactamente las cinco claves) y replaceProductPortions (parsea con el esquema de shared → ZodError; PRODUCT_NOT_FOUND si no existe; PORTIONS_NOT_ALLOWED 409 si la categoría no es 'chicken'; dentro de `models.ProductPortion.sequelize.transaction` borra las filas del producto e inserta las nuevas —los `id` pueden cambiar, D-006-06— y devuelve el conjunto ordenado). Exportar `createPortionsNotAllowedError` y `createProductHasPortionsError`.
  - apps/api/src/services/products/product.service.ts (modificado): updateProduct rechaza con `createProductHasPortionsError()` cuando `changes.category` viene definida, distinta de 'chicken' y el producto tiene al menos una fila en product_portions (consulta por productId con el modelo nuevo). El resto del servicio no cambia.

### T-08. Controller, rutas y app
- Responsable: backend-dev
- Dependencias: T-04, T-07
- AC: AC-10, AC-11, AC-12, AC-13, AC-14 (requisito R-006-01)
- Descripción:
  - apps/api/src/controllers/product-portions.controller.ts: handlers `list` y `replace`; `productId` con `parseProductIdParam` (exportarlo desde products.controller.ts sin duplicarlo); cuerpo con `replaceProductPortionsRequestSchema` (ZodError al errorHandler); responde 200.
  - apps/api/src/routes/products.routes.ts: firma con el controller de presentaciones además del de productos; `router.get('/:productId/portions', requireAuth, portionsController.list)` y `router.put('/:productId/portions', requireAuth, requireRole('admin'), portionsController.replace)` (el middleware de no-store ya cubre el router entero).
  - routes/index.ts: ApiRouterDependencies suma productPortionsController y lo pasa a createProductRoutes.
  - app.ts: crea `createProductPortionService({ models })` y `createProductPortionsController`; NO_STORE_PATH_PREFIXES no cambia (D-006-08).

## Cierre

### T-09. Verificación final
- Responsable: backend-dev
- Dependencias: T-05 a T-08
- AC: todos (requisitos R-006-01 a R-006-07)
- Descripción:
  - `pnpm test`, `pnpm lint`, `pnpm typecheck` y `pnpm test:coverage` con código 0 (services de la API, incluido el de presentaciones, con 90 % o más; shared con 90 % o más).
  - R-006-03 (`git diff main -- apps/api/.env.example apps/api/src/config/env.ts` vacío), R-006-04 (solo una migración nueva) y R-006-05 (`git status --porcelain apps/web` vacío y el grep de R-14 de la 001).
  - R-006-02: openapi lint con Redocly desde una carpeta temporal (como en la 003/004/005).
  - Anotar en el reporte los pendientes manuales para el usuario: sección 18 de la spec (`pnpm db:migrate` en polleria_dev y las verificaciones por API con la cookie de sesión).

## Matriz AC, pruebas e implementación

| AC | Prueba (test-writer) | Implementación |
| --- | --- | --- |
| AC-01 a AC-04 | T-01 | T-05 |
| AC-05, AC-06 | T-02 | T-06 |
| AC-07 a AC-09 | T-03 | T-07 |
| AC-10 a AC-14 | T-04 | T-08 |
| R-006-01 a R-006-07 | — | T-09 |
