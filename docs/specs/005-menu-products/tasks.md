# Tareas — Spec 005: productos y precios de la carta

- Spec: docs/specs/005-menu-products/spec.md (Aprobada, 2026-10-08)
- Rama: feat/005-menu-products
- Contrato: docs/api/openapi.yaml (versión 0.5.0: /products GET y POST, /products/{productId} PATCH; Product, ProductCategory, PriceCents, ProductNotFound y ProductNameTaken)
- ADR: ninguno nuevo (reutiliza lo ya decidido: umzug, Sequelize, Zod, requireAuth/requireRole, formato de errores)
- Dependencias: ninguna nueva. Sin variables de entorno nuevas. Una migración nueva: 20261008180000-create-products.ts.
- Alcance especial: la 005 es dominio + API solamente (D-005-01, S-005-08). No hay tareas de frontend-dev ni pruebas E2E: las pantallas son de la 008 y la carta del mozo de la Fase 2.

## Orden y por qué

1. **Sin instalación ni andamiaje**: no hay paquetes ni configuración nuevos; el primer paso es directamente el test-writer.
2. **Pruebas en rojo (T-01 a T-04)**: test-writer escribe las pruebas de los 15 AC (esquemas de shared, migración y tabla products, servicio y API sobre polleria_test) y ajusta los helpers de limpieza para que cubran products.
3. **Implementación (backend-dev)**: primero T-05 (esquemas y códigos de shared, los necesita todo lo demás), luego T-06 (migración y modelo Product, la necesita el servicio), T-07 (servicio) y T-08 (controller, rutas, app y prefijo no-store).
4. **Cierre (T-09)**: definición de terminado y requisitos R-005-01 a R-005-07.

Aprobación: el usuario respondió las preguntas 1 a 10 el 2026-10-08 con las recomendaciones (supuestos S-005-01 a S-005-11 confirmados). En particular, la pregunta 10 dejó pendientes del dueño para la spec 006 las consultas sobre 1/8, armado del 1/2 y precio distinto de pecho y pierna; no bloquean esta funcionalidad.

## Pruebas en rojo (test-writer)

Reglas comunes:
- Cada archivo de prueba de esta spec envuelve sus pruebas en un `describe` cuyo nombre empieza con `005:` y el nombre de cada prueba empieza con el ID del AC: `it('AC-12: crea un producto por HTTP', ...)`.
- Importar desde las rutas de la sección 11 de la spec; que fallen por módulo inexistente es un rojo válido.
- Base de pruebas: solo polleria_test (DATABASE_URL_TEST) con las guardias de RN-001-02. Vaciar users y sessions con `clearAuthTables` / `migrateAndClearAuthTables` y products con el helper nuevo de T-02.
- Hasher rápido: `createBcryptPinHasher({ cost: 4 })` donde haga falta una app o un usuario.
- Reloj: `let current = T0; createApp({ sequelize, now: () => current, pinHasher })`, con `T0 = new Date('2026-10-08T15:00:00.000Z')`. Las cookies salen de inicios de sesión reales con `loginWithCookie`; el administrador es un usuario con `roles: ['admin']`.
- Los productos de ejemplo se crean con `createProductService({ models })` (cuando exista) o con SQL directo para casos especiales (inactivo, otra capitalización).
- Textos con caracteres especiales siempre con escapes (`'\u00A0'`, `'\u{1F357}'`), nunca literales.
- Commits con prefijo test, por ejemplo `test(005): pruebas de la API de productos`.

### T-01. Esquemas de productos en shared
- Responsable: test-writer
- Dependencias: ninguna
- AC: AC-01, AC-02, AC-03, AC-04, AC-05
- Descripción: packages/shared/src/products.test.ts (importando desde '@polleria/shared'). Tablas de acepta/rechaza de AC-01 a AC-04 con `it.each`, mensajes exactos (PRODUCT_NAME_MESSAGE, el del precio, 'No indicaste ningún cambio.'), claves exactas de productSchema en AC-05 y los códigos nuevos en ERROR_CODES.

### T-02. Tabla products, migración y helpers de limpieza
- Responsable: test-writer
- Dependencias: ninguna
- AC: AC-06, AC-07
- Descripción:
  - apps/api/tests/products-migration.test.ts con AC-06 y AC-07 sobre polleria_test: columnas, tipos y defaults por information_schema/pg_indexes; INSERTs válidos y los que deben fallar (CHECK de name, lista de category, rango de price_cents, NULLs); choque de nombre sin distinguir mayúsculas por el índice `products_name_unique`; migrateUp/migrateDown/re-up con la lista completa de migraciones.
  - Helpers (apps/api/tests/helpers/test-database.ts): `resetMigrationTables` borra también `products` junto a sessions, users y las tablas de registro (DROP TABLE IF EXISTS, después de la doble verificación de la base _test); helper nuevo `clearMenuTables(sequelize)` (o nombre equivalente) que hace `TRUNCATE products RESTART IDENTITY` tras verificar la base _test. La tabla products está autorizada para limpieza de pruebas como lo estuvieron users y sessions; pedir confirmación al orquestador si hace falta registrarla.

### T-03. Servicio de productos
- Responsable: test-writer
- Dependencias: T-02
- AC: AC-08, AC-09, AC-10
- Descripción: apps/api/tests/products-service.test.ts sobre polleria_test: crear los productos de AC-08 (el inactivo por SQL o por updateProduct), verificar el orden de la carta y las claves exactas; crear con recorte/NFC, precio 0, choque de nombre con otra capitalización (PRODUCT_NAME_TAKEN), entradas inválidas con ZodError; editar cada campo, PATCH vacío, id inexistente (PRODUCT_NOT_FOUND), renombrar a nombre existente, desactivar/reactivar idempotente y edición de un inactivo; y que la interfaz ProductService no expone borrado (claves exactas).

### T-04. API de productos
- Responsable: test-writer
- Dependencias: T-02, T-03
- AC: AC-11, AC-12, AC-13, AC-14, AC-15
- Descripción: apps/api/tests/products.test.ts. Cookies reales por rol (admin, mozo, cocinero, cajero y una usuaria con dos roles: waiter+admin para el permitido y waiter+cashier para el 403). console.error espiado (los 4xx no se registran). Comprobar: el orden y los inactivos en GET; cuerpos exactos de PRODUCT_NAME_TAKEN, PRODUCT_NOT_FOUND, UNAUTHENTICATED y FORBIDDEN; `Cache-Control: no-store` en todas las respuestas incluidos los errores del lector del cuerpo (INVALID_JSON, INVALID_BODY, PAYLOAD_TOO_LARGE, UNSUPPORTED_MEDIA_TYPE, con `sendRawBody` para los casos crudos); `productId` inválidos; los 404 de métodos no declarados; y que los rechazos no crean ni modifican filas.

### Verificación del rojo (al terminar T-01 a T-04)
- `pnpm test` falla solo por módulos inexistentes (shared/products.ts, service, routes) o comportamiento ausente (la migración que falta). Las pruebas de las specs 001 a 004 siguen en verde (no se toca ninguna).
- `pnpm typecheck` y `pnpm lint` pueden fallar solo en cascada por los módulos que aún no existen.

## Implementación del backend (backend-dev)

Reglas comunes:
- No crear, modificar ni borrar archivos de prueba (`*.test.ts`, `*.test.tsx`, apps/api/tests/, e2e/). Si una prueba parece contradecir la spec, detenerse y reportarlo.
- Sintaxis borrable (D-02 de la 001), imports relativos con .ts, mensajes exactos de la spec. Sin SQL con interpolación de valores.
- Sin dependencias nuevas ni variables de entorno nuevas.
- Commits con prefijo feat, sin archivos de prueba. Antes de cada commit: `pnpm --filter @polleria/api run typecheck` y `pnpm lint`.

### T-05. Esquemas y códigos de error en shared
- Responsable: backend-dev
- Dependencias: T-01
- AC: AC-01, AC-02, AC-03, AC-04, AC-05
- Descripción: packages/shared/src/products.ts (exportado por index.ts) con PRODUCT_CATEGORIES + type ProductCategory + productCategorySchema; PRODUCT_NAME_MAX_LENGTH, PRODUCT_NAME_PATTERN, PRODUCT_NAME_MESSAGE y productNameSchema (recorte, NFC, largo y patrón, mismo estilo que displayNameSchema); PRICE_CENTS_MAX y priceCentsSchema; createProductRequestSchema, updateProductRequestSchema (con 'No indicaste ningún cambio.'), productSchema y productsResponseSchema con sus types. errors.ts suma PRODUCT_NOT_FOUND y PRODUCT_NAME_TAKEN. Mantener el 90 % de cobertura de shared.

### T-06. Migración y modelo Product
- Responsable: backend-dev
- Dependencias: T-02, T-05
- AC: AC-06, AC-07 (requisito R-005-04)
- Descripción: apps/api/src/db/migrations/20261008180000-create-products.ts con up/down según la sección 8.1 (tabla con sus CHECK y `CREATE UNIQUE INDEX products_name_unique ON products (lower(name))`; el estilo de las migraciones de la 003: SQL por query con transacción si hace falta, down que borra la tabla). models/index.ts suma ProductAttributes, ProductModel, `Models.Product` y el `sequelize.define` (`tableName: 'products'`, `underscored`, INTEGER para priceCents, STRING(16) para category); la guardia `isDefined` contempla 'Product'. ProductAttributes.category usa el type ProductCategory de shared.

### T-07. Servicio de productos
- Responsable: backend-dev
- Dependencias: T-03, T-05, T-06
- AC: AC-08, AC-09, AC-10
- Descripción: apps/api/src/services/products/product.service.ts nuevo: `createProductService({ models })` con listProducts (todos, orden de D-005-04 con `Intl.Collator('es', { sensitivity: 'base' })` y empates por id; exactamente las cinco claves), createProduct (INSERT; UniqueConstraintError → PRODUCT_NAME_TAKEN 409 'Ya existe un producto con ese nombre.') y updateProduct (findByPk o PRODUCT_NOT_FOUND 404 'Ese producto no existe.'; aplica solo los campos recibidos; el choque de nombre también → PRODUCT_NAME_TAKEN). Sin transacciones ni bloqueos (D-005-13). Exportar `createProductNotFoundError` y `createProductNameTakenError`.

### T-08. Controller, rutas, app y prefijo no-store
- Responsable: backend-dev
- Dependencias: T-04, T-07
- AC: AC-11, AC-12, AC-13, AC-14, AC-15 (requisitos R-005-01, R-005-04)
- Descripción:
  - apps/api/src/controllers/products.controller.ts: parsea `productId` (`^[0-9]+$`, entero entre 1 y 2147483647; si no, AppError VALIDATION_ERROR con issues `[{ path: 'productId', message: 'El identificador del producto no es válido.' }]`), parsea el cuerpo con los esquemas de shared (ZodError al errorHandler), responde 200/201.
  - apps/api/src/routes/products.routes.ts: middleware con `Cache-Control: no-store`; `router.get('/', requireAuth, controller.list)`; `router.post('/', requireAuth, requireRole('admin'), controller.create)`; `router.patch('/:productId', requireAuth, requireRole('admin'), controller.update)`.
  - routes/index.ts: ApiRouterDependencies suma productsController y monta `/products`.
  - app.ts: crea `createProductService({ models })` y `createProductsController`, y suma '/api/products' a NO_STORE_PATH_PREFIXES (la comparación en minúsculas ya cubre mayúsculas en la ruta, ADV-004-25).

## Cierre

### T-09. Verificación final
- Responsable: backend-dev
- Dependencias: T-05 a T-08
- AC: todos (requisitos R-005-01 a R-005-07)
- Descripción:
  - `pnpm test`, `pnpm lint`, `pnpm typecheck` y `pnpm test:coverage` con código 0 (services de la API, incluido services/products, con 90 % o más; shared con 90 % o más).
  - R-005-03 (`git diff main -- apps/api/.env.example apps/api/src/config/env.ts` vacío), R-005-04 (solo una migración nueva) y R-005-05 (`git status --porcelain apps/web` vacío y el grep de R-14 de la 001).
  - R-005-02: openapi lint con Redocly desde una carpeta temporal (como en la 003/004).
  - Anotar en el reporte los pendientes manuales para el usuario: sección 17 de la spec (`pnpm db:migrate` en polleria_dev y las verificaciones por API con la cookie de sesión).

## Matriz AC, pruebas e implementación

| AC | Prueba (test-writer) | Implementación |
| --- | --- | --- |
| AC-01 a AC-05 | T-01 | T-05 |
| AC-06, AC-07 | T-02 | T-06 |
| AC-08 a AC-10 | T-03 | T-07 |
| AC-11 a AC-15 | T-04 | T-08 |
| R-005-01 a R-005-07 | — | T-09 |
