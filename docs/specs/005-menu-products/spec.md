# Spec 005 — Productos y precios de la carta

- Estado: Aprobada (2026-10-08, por el usuario, con las respuestas recomendadas a las preguntas 1 a 10)
- Fase: 1 (Usuarios y carta)
- Rama: feat/005-menu-products
- Fecha: 2026-10-08
- Cubre: la parte de productos de RF-18 (el administrador crea y edita productos y precios, y los activa o desactiva; las presentaciones y partes con octavos son la spec 006, los combos la 007 y las pantallas de administración de la carta la 008) y RNF-12 (los productos y precios se configuran desde el sistema, sin tocar código ni la base a mano). Aporta a RF-04 y RNF-01 a futuro: la carta que el mozo tocará en la Fase 2 nace aquí.
- Documentos relacionados: tasks.md (esta carpeta), docs/planificacion.md (RF-18, RF-19 y RNF), docs/specs/004-users-admin/spec.md (formato y protección admin) y docs/specs/003-users-pin-login/spec.md (sesión, requireAuth/requireRole), docs/api/openapi.yaml (versión 0.5.0), docs/decisions/0001-stack-y-versiones.md y 0002-sesion-pin-y-limite-de-intentos.md (ADR, ambos Aceptados).

## 1. Contexto

El sistema todavía no tiene carta: no existe una lista de lo que vende la pollería ni su precio. Sin ella no hay pedidos (Fase 2), ni pre-cuenta ni cobro (Fase 4), ni stock de lo vendido (Fase 5). Esta spec crea la tabla de productos y las operaciones de administración por API —crear un producto con nombre, categoría y precio; editarlo; quitarlo de la carta y volver a ponerlo— protegidas con sesión y rol admin, más una lectura de la carta para cualquier trabajador con sesión (la usará el /mozo de la Fase 2 y las pantallas de la 008). Cambiar un precio no altera pedidos abiertos porque el precio se copiará al registrarse el ítem del pedido (regla de dominio 4). Es dominio + API solamente: las pantallas web llegan en la 008.

## 2. Historias de usuario

| ID | Historia |
| --- | --- |
| HU-005-01 | Como administrador (dueño), quiero dar de alta un producto con su nombre, su categoría y su precio, para que aparezca en la carta. |
| HU-005-02 | Como administrador, quiero ver la carta completa —los productos que se venden y los que quité— ordenada por categoría y nombre, para revisarla y corregirla. |
| HU-005-03 | Como administrador, quiero corregir el nombre, la categoría o el precio de un producto (por ejemplo cuando sube el precio de la chicha), sin crear otro producto. |
| HU-005-04 | Como administrador, quiero quitar un producto de la carta cuando ya no lo vendo (y volver a ponerlo si regresa), sin perder su historial en pedidos futuros. |
| HU-005-05 | Como mozo (y también cajero o cocina), quiero consultar la carta vigente desde mi sesión, para conocer precios y productos sin preguntar al dueño. |
| HU-005-06 | Como administrador, quiero que el sistema no me deje guardar un precio con decimales sueltos ni un precio enorme escrito por error, para que la cuenta del cliente salga bien. |

## 3. Decisiones técnicas

Las que no confirmó el usuario están marcadas como SUPUESTO y repetidas en Preguntas abiertas (sección 16).

**D-005-01. Alcance: solo dominio + API, sin pantallas (SUPUESTO S-005-08).**
- La división aprobada del orquestador asigna las pantallas de administración de la carta a la spec 008. Esta spec deja listo todo lo que esas pantallas y la carta del mozo (Fase 2) necesitan: el modelo de datos, los esquemas compartidos, el servicio y las rutas. No hay tareas de frontend-dev ni pruebas E2E.
- Consecuencia: ningún archivo de frontend cambia y el cliente HTTP no se toca (GET, POST y PATCH ya existen desde la 004).

**D-005-02. El producto mínimo.**
- Campos: `id` (entero autoincremental), `name`, `category`, `priceCents`, `isActive`, `createdAt`, `updatedAt`. Nada más: sin descripción, foto, código/SKU ni orden manual (SUPUESTO S-005-09); sin stock (Fase 5); sin presentaciones, partes ni consumo en octavos (RF-19, spec 006); sin componentes de combo (spec 007).
- Un producto es lo que el mozo toca en la carta: "1/4 de Pollo", "Chicha Morada (jarra)", "Salchipapa", "Ají". Nace siempre activo (is_active true), igual que un usuario nuevo nace activo.

**D-005-03. Categorías fijas de la carta (SUPUESTO S-005-01).**
- `PRODUCT_CATEGORIES` = `['chicken', 'dish', 'drink', 'dessert', 'sauce', 'extra']`, en ese orden (es también el orden de la carta, D-005-04). Etiquetas que verá la gente (las pone la web en la 008): Pollo, Platos, Bebidas, Postres, Cremas, Extras.
- Fijas y no libres porque: el orden de la carta queda estable, las etiquetas salen ya traducidas sin que el dueño escriba categorías, la 006 puede tratar la categoría 'chicken' con reglas propias (presentaciones y partes) y se evita la tabla de categorías y su pantalla de administración.
- La base lo garantiza con un CHECK (`category IN (...)`), como los roles de la 003; agregar una categoría es una migración y un cambio de enum.
- 'combo' NO es categoría todavía (SUPUESTO S-005-10): la 007 decide si los combos son productos con esa categoría (entraría por una migración que amplíe el CHECK) o una entidad aparte con su tabla de componentes.
- 'sauce' existe aunque las cremas no se cobren: crema gratis = producto con precio S/ 0.00 que igual aparece en la carta y llega a la comanda de cocina (D-005-05; confirmado en la pregunta 2). 'extra' cubre adicionales vendibles: descartables y empaque para llevar, porción extra de papas, etc. (confirmado en la pregunta 7; el control de descartables como insumo es de la Fase 5).

**D-005-04. Orden de la carta (SUPUESTO S-005-02).**
- Orden fijo: primero por categoría en el orden de `PRODUCT_CATEGORIES`, dentro de cada categoría por nombre con `Intl.Collator('es', { sensitivity: 'base' })` (sin distinguir mayúsculas ni tildes, como la lista de usuarios) y los empates por `id`. La API devuelve la lista ya ordenada; la web la agrupa por categoría.
- Sin orden manual (`sort_order`): una pantalla de ordenamiento es trabajo y complejidad de la 008 por algo que una pollería chica casi no usa. Confirmado en la pregunta 4; si el dueño lo pide más adelante, una spec posterior agrega la columna con una migración.

**D-005-05. Dinero en céntimos, con piso S/ 0.00 y tope S/ 999.99 (regla 2; SUPUESTOS S-005-03 y S-005-07).**
- `price_cents` es INTEGER entre 0 y 99999. El precio nunca es float ni texto: "1850" con comillas es 400, 18.5 es 400.
- Precio 0 permitido: las cremas que no se cobran entran a la carta como productos de precio 0 (confirmado en la pregunta 2) — el mozo las agrega y la cocina las ve en la comanda. Si el dueño cobra alguna, se crea con su precio.
- Tope de 99999 céntimos (S/ 999.99): en una pollería nada cuesta cerca de mil soles; el tope corta el error clásico de escribir 185000 pensando en "S/ 18.50" (se rechaza con 400). Si algún día aparece un producto de mil soles, el tope se sube en una spec.

**D-005-06. Nombre del producto y unicidad sin mayúsculas (SUPUESTO S-005-05).**
- `productNameSchema`: recorte, NFC, de 1 a 60 puntos de código y el patrón `/^[\p{L}\p{N}][\p{L}\p{M}\p{N} .,'()/%+-]*$/u` (empieza con letra o número; permite "1/4 de Pollo", "Inca Kola 1.5 L", "Chicha Morada (jarra)", "Papas + queso"). Un solo mensaje, como displayNameSchema.
- Índice único `products_name_unique` sobre `lower(name)` en la base: 'Chicha' y 'chicha' son el mismo producto. Así un producto no se puede registrar dos veces por un error de tipeo; el choque responde 409 PRODUCT_NAME_TAKEN. La unicidad es global y alcanza a los inactivos (igual que username): si el producto volvió, se reactiva; si el nombre estaba mal, se corrige con PATCH.

**D-005-07. Se desactiva, nunca se borra (SUPUESTO S-005-04).**
- PATCH con `isActive: false` quita el producto de la carta; `isActive: true` lo devuelve. No hay DELETE ni borrado físico: los ítems de pedido de la Fase 2 referenciarán productos y el historial debe sobrevivir. Misma regla que los usuarios (RN-004-05). Un producto inactivo se puede seguir editando.

**D-005-08. Quién gestiona y quién lee (SUPUESTO S-005-06).**
- Escritura: POST /api/products y PATCH /api/products/{productId} exigen `requireAuth` + `requireRole('admin')` (401 sin sesión, 403 con cualquier rol que no incluya admin — incluida una persona con varios roles sin admin).
- Lectura: GET /api/products exige `requireAuth` y nada más — cualquier rol con sesión (waiter, kitchen, cashier, admin), como GET /auth/me. Devuelve TODOS los productos, activos e inactivos, en el orden de D-005-04; quien necesita solo la carta vigente filtra `isActive` (la carta del mozo en Fase 2 y la pantalla de administración de la 008, que además reactiva desde la misma lista).
- La carta no es pública (no hay razón para exponerla sin sesión) pero tampoco tiene secretos: los nombres y precios ya los ve cualquier cliente en el local, y ver un producto desactivado no revela nada sensible.

**D-005-09. Errores (formato común).**

| code | HTTP | message | details | Cuándo |
| --- | --- | --- | --- | --- |
| VALIDATION_ERROR | 400 | Los datos enviados no son válidos. | `{ issues }` | Cuerpo inválido (incluye `priceCents` fuera de rango o con decimales, categoría fuera de la lista, PATCH vacío 'No indicaste ningún cambio.') o `productId` de la ruta inválido (issue en `productId`: 'El identificador del producto no es válido.'). |
| PRODUCT_NOT_FOUND | 404 | Ese producto no existe. | null | PATCH sobre un `productId` que no existe. |
| PRODUCT_NAME_TAKEN | 409 | Ya existe un producto con ese nombre. | null | Crear o renombrar con un nombre que ya existe, sin distinguir mayúsculas, activo o inactivo. |

- Los dos códigos nuevos se suman a ERROR_CODES de @polleria/shared. Ningún 4xx se registra en el log (RN-001-07).
- `productId` de la ruta: `^[0-9]+$` y entre 1 y 2147483647 (INTEGER de la base); si no ('abc', '0', '1.5', '-3', '2147483648'), 400 VALIDATION_ERROR con `issues: [{ path: 'productId', message: 'El identificador del producto no es válido.' }]`. Misma regla que `userId` (D-004-06).
- Todas las respuestas de /api/products/* llevan `Cache-Control: no-store`, también las de error: '/api/products' se suma a NO_STORE_PATH_PREFIXES de app.ts (la cabecera se fija antes del lector del cuerpo, como quedó tras ADV-004-25) y el router la fija también, de forma idempotente.

**D-005-10. Migración y limpieza de pruebas.**
- Una migración nueva `20261008180000-create-products.ts` en backend/src/db/migrations (umzug, D-05 de la 001), con `up` que crea la tabla con sus CHECK y el índice único, y `down` que la borra. Las restricciones viven también en la base, no solo en Zod (D-003-14).
- Consecuencia para las pruebas (como en la 003, D-003-14): el helper resetMigrationTables (backend/tests/helpers/test-database.ts) debe borrar también `products` antes de las tablas de registro de umzug, y la limpieza entre pruebas de esta spec debe truncar `products` (helper nuevo sugerido, por ejemplo `clearMenuTables`). Lo ajusta el test-writer (sección 12).

**D-005-11. El precio de la carta vs. pedidos (regla de dominio 4).**
- Cambiar `price_cents` nunca debe alterar pedidos ya registrados: en la Fase 2 el ítem del pedido copiará el precio vigente al agregarse. En esta spec no hay pedidos todavía; la regla queda declarada (RN-005-08) para que 006 y la Fase 2 la respeten desde el diseño.

**D-005-12. Un precio por producto; las porciones llegan en la 006.**
- Todo producto tiene su `price_cents` obligatorio, incluidos los de categoría 'chicken' (por ejemplo "1/4 de Pollo" S/ 18.50 como ítem simple). En la 006 los productos con presentaciones definirán precio por presentación y parte; esa spec decidirá si `price_cents` queda como precio base, se reemplaza o se ignora para ellos. Para no bloquearla, esta spec no agrega ningún campo de porción ni de consumo en octavos.

**D-005-13. Servicio de productos.**
- Módulo nuevo `backend/src/services/products/product.service.ts`: `createProductService({ models })` con `listProducts()`, `createProduct(input)` y `updateProduct(productId, input)`. Los dos últimos parsean su entrada con los esquemas de shared (ZodError, igual que user.service), el choque del índice único se traduce a PRODUCT_NAME_TAKEN y el id inexistente a PRODUCT_NOT_FOUND.
- Sin transacciones ni bloqueos: a diferencia de la guardia del último administrador (004), aquí no hay ningún invariante entre filas que proteger. Crear es un solo INSERT (el índice resuelve la carrera de duplicados con 409) y editar un solo UPDATE.

**D-005-14. Sin variables de entorno ni dependencias nuevas.**
- Nada se configura por .env: CONFIG_VARIABLES sigue con las 7 variables y backend/.env.example no cambia.
- Sin paquetes nuevos ni ADR: se reutilizan Sequelize, Zod, requireAuth/requireRole y el formato de errores ya decididos.

## 4. Criterios de aceptación

Cada AC tiene al menos una prueba cuyo nombre empieza con su ID. Como en las specs anteriores, cada archivo de prueba de esta spec envuelve sus pruebas en un `describe` cuyo nombre empieza con `005:` y las pruebas van en archivos nuevos. Se indica el nivel y una ubicación sugerida; la ubicación exacta la decide el test-writer.

Datos comunes de las pruebas:
- `T0` = `2026-10-08T15:00:00.000Z` (10:00 en Lima), igual que en la 003 y la 004.
- "La app" es `createApp({ sequelize, now, pinHasher })` sobre polleria_test con las migraciones reales aplicadas y las tablas products, users y sessions vacías al empezar cada prueba. `pinHasher` puede ser `createBcryptPinHasher({ cost: 4 })`.
- Los usuarios y las cookies se crean como en la 004 (`createUserService`, `loginWithCookie`); los productos se crean con `createProductService({ models })` o con SQL según lo que pida el AC.
- Los textos con caracteres especiales se escriben con escapes (`'\u00A0'`, `'\u{1F357}'`), nunca literales.

### 4.1 Paquete compartido (packages/shared)

**AC-01. Categorías de la carta** (unitaria, packages/shared)
- Dado `PRODUCT_CATEGORIES`, `type ProductCategory` y `productCategorySchema` exportados por '@polleria/shared',
- entonces PRODUCT_CATEGORIES es exactamente `['chicken', 'dish', 'drink', 'dessert', 'sauce', 'extra']`, en ese orden;
- y productCategorySchema acepta cada una y devuelve el mismo valor;
- y rechaza 'pollo', 'Chicken', 'CHICKEN', 'combo', 'bebida', '', ' chicken', 'chicken ', null, 0 y ['chicken'] (el código va en inglés según el glosario; las etiquetas en español las pone la web en la 008).

**AC-02. Nombre del producto** (unitaria, packages/shared)
- Dado `productNameSchema`, `PRODUCT_NAME_MAX_LENGTH` (60) y `PRODUCT_NAME_PATTERN`,
- cuando valida '  1/4 de Pollo  ' devuelve '1/4 de Pollo' (recorte) y `'Chicha\u0301'` devuelve 'Chichá' (NFC);
- y acepta 'Inca Kola 1.5 L', 'Chicha Morada (jarra)', 'Papas + queso', 'Ají', "Lomo's", 'x'.repeat(60) y 'Pollo, entero';
- y rechaza con el mensaje único del nombre ('Usa de 1 a 60 caracteres: letras, números, espacios y los signos punto, coma, apóstrofo, paréntesis, barra, porcentaje, más o guion; empieza con letra o número.'): '', '   ', 'x'.repeat(61), '-Pollo', '/Pollo', '.Pollo', 'Pollo\tfrito', 'Pollo\nfrito', `'Chicha\u00A0Morada'` (espacio duro en medio), `'Pollo \u{1F357}'`, 'Pollo <brasa>', 'Pollo *grande*', 5 (número) y null;
- y PRODUCT_NAME_PATTERN es `/^[\p{L}\p{N}][\p{L}\p{M}\p{N} .,'()/%+-]*$/u`.

**AC-03. Precio en céntimos** (unitaria, packages/shared)
- Dado `priceCentsSchema` y `PRICE_CENTS_MAX` (99999),
- cuando valida, acepta 0 (crema que no se cobra), 1, 1850 y 99999, y devuelve el mismo entero;
- y rechaza con el mensaje único del precio ('El precio debe ser un número entero de céntimos entre 0 y 99999.'): -1, -1850, 100000, 18.5 (decimales: prohibido por la regla 2), 0.5, NaN, Infinity, '1850' (texto), null y undefined.

**AC-04. Solicitudes de crear y editar producto** (unitaria, packages/shared)
- Dado `createProductRequestSchema` y `type CreateProductRequest`,
- cuando valida `{ name: '  Chicha Morada  ', category: 'drink', priceCents: 500 }` devuelve `{ name: 'Chicha Morada', category: 'drink', priceCents: 500 }`;
- y rechaza: objeto sin name, sin category o sin priceCents; propiedad de más (`{ ...válido, isActive: false }`, `{ ...válido, id: 3 }`, `{ ...válido, stock: 10 }`); name '' o '  '; category 'combo' o 'pollo'; priceCents -1, 18.5 o '500'; un texto, null y undefined;
- y dado `updateProductRequestSchema` y `type UpdateProductRequest`, acepta `{ name: 'Nuevo' }`, `{ category: 'dish' }`, `{ priceCents: 0 }`, `{ isActive: false }`, `{ isActive: true }` y combinaciones como `{ name: 'A', priceCents: 100, isActive: false }`;
- y rechaza `{}` con un issue que contiene 'No indicaste ningún cambio.'; y rechaza `{ id: 2 }`, `{ name: ' ' }`, `{ category: 'pollo' }`, `{ priceCents: 100000 }`, `{ isActive: 'si' }` y cualquier propiedad de más (objeto estricto).

**AC-05. Respuesta de la API y códigos de error** (unitaria, packages/shared)
- Dado `productSchema`, `productsResponseSchema` y `type Product`,
- entonces productSchema acepta `{ id: 3, name: '1/4 de Pollo', category: 'chicken', priceCents: 1850, isActive: true }` con exactamente esas cinco claves;
- y rechaza: id 0, -1, 1.5 o '3'; name ''; category 'pollo'; priceCents 18.5 o '1850'; falta isActive; y cualquier propiedad de más (`createdAt`, `stock`, `description`, `price`);
- y productsResponseSchema acepta `{ products: [] }` y `{ products: [<product válido>] }`, y rechaza un elemento inválido y una propiedad de más en la raíz;
- y ERROR_CODES contiene PRODUCT_NOT_FOUND y PRODUCT_NAME_TAKEN con valores iguales a sus nombres, además de todos los anteriores;
- y errorResponseSchema acepta `{ error: { code: 'PRODUCT_NOT_FOUND', message: 'Ese producto no existe.', details: null } }` y `{ error: { code: 'PRODUCT_NAME_TAKEN', message: 'Ya existe un producto con ese nombre.', details: null } }`.

### 4.2 Base de datos (migraciones reales sobre polleria_test)

**AC-06. Tabla products** (integración, backend)
- Dado polleria_test con `migrateUp(sequelize)` aplicado,
- entonces information_schema muestra la tabla products con: id integer (clave primaria y autoincremental: SERIAL o IDENTITY), name character varying(60), category character varying(16), price_cents integer, is_active boolean, created_at y updated_at timestamp with time zone, todas NOT NULL, y is_active, created_at y updated_at con valor por defecto;
- y un INSERT con solo name '1/4 de Pollo', category 'chicken' y price_cents 1850 funciona y deja is_active true;
- y fallan con un error de la base y no dejan fila: name '', '   ' o ' Chicha' (espacio al inicio; el CHECK pide `name = btrim(name)`); name de 61 caracteres; category 'pollo', 'COMBO' o NULL; price_cents -1, 100000 o NULL; is_active NULL;
- y tras insertar 'Chicha' un INSERT con name 'chicha' (o 'CHICHA') falla por el índice único `products_name_unique` sobre `lower(name)`;
- y pg_indexes muestra el índice `products_name_unique`.

**AC-07. Las migraciones se aplican y se revierten** (integración, backend)
- Dado polleria_test sin tablas de dominio ni de registro (helper de limpieza de la sección 12),
- cuando se ejecuta `migrateUp(sequelize)`, entonces devuelve `['20261008120000-create-users.ts', '20261008120100-create-sessions.ts', '20261008180000-create-products.ts']` en ese orden y existen users, sessions y products;
- cuando luego se ejecuta `migrateDown(sequelize)`, devuelve `['20261008180000-create-products.ts']`, products ya no existe y users y sessions sí;
- y al ejecutar `migrateUp(sequelize)` otra vez, products vuelve a existir (la migración es reaplicable tras revertir).

### 4.3 Servicios (backend, con polleria_test)

**AC-08. Listar la carta** (integración, backend/tests)
- Dado `createProductService({ models })` sobre polleria_test con estos productos (en desorden de creación): 'Chicha Morada' (drink, 500), 'Pollo entero' (chicken, 6500), '1/4 de Pollo' (chicken, 1850), 'Chaufa' (dish, 1400), 'agua' (drink, 200), 'Ají' (sauce, 0) y 'Tres Leches' (dessert, inactivo por SQL o por updateProduct),
- cuando se llama `listProducts()`, entonces devuelve los siete productos (los inactivos también) en el orden de la carta de D-005-04: primero los de categoría chicken por nombre ('1/4 de Pollo', 'Pollo entero'), luego dish ('Chaufa'), luego drink por nombre sin distinguir mayúsculas ('agua', 'Chicha Morada'), luego dessert ('Tres Leches') y luego sauce ('Ají');
- y cada elemento tiene exactamente las claves `id`, `name`, `category`, `priceCents` e `isActive` (false para 'Tres Leches'); ninguna lleva `createdAt`, `updatedAt` ni `price_cents`;
- y sin productos devuelve `[]`.

**AC-09. Crear un producto** (integración)
- Dado el servicio, cuando `createProduct({ name: '  Chicha Morada  ', category: 'drink', priceCents: 500 })`, entonces se resuelve con el Product creado (name 'Chicha Morada', isActive true) y la fila guarda name 'Chicha Morada', category 'drink', price_cents 500 e is_active true;
- y `createProduct` con `{ name: 'Ají', category: 'sauce', priceCents: 0 }` resuelve con priceCents 0 (crema gratis);
- y con name que ya existe con otra capitalización ('chicha morada' tras 'Chicha Morada') se rechaza con un AppError de code 'PRODUCT_NAME_TAKEN', httpStatus 409 y message 'Ya existe un producto con ese nombre.', sin crear fila;
- y entrada inválida (sin priceCents, category 'combo', priceCents 18.5, name '', propiedad de más) se rechaza con ZodError sin crear fila.

**AC-10. Editar, desactivar y reactivar un producto** (integración)
- Dado el servicio y el producto 'Chicha Morada' (drink, 500),
- cuando `updateProduct(id, { priceCents: 700 })`, entonces se resuelve con el Product actualizado y la fila guarda price_cents 700 sin cambiar name ni category; igual para `{ name: 'Chicha Morada Grande' }`, `{ category: 'extra' }` y combinaciones;
- y `updateProduct(id, {})` se rechaza con ZodError ('No indicaste ningún cambio.'); entrada inválida (`category: 'pollo'`, `priceCents: -1`, `name: ''`, propiedad de más) se rechaza con ZodError sin cambiar la fila;
- y `updateProduct(999999, { priceCents: 700 })` se rechaza con un AppError de code 'PRODUCT_NOT_FOUND', httpStatus 404 y message 'Ese producto no existe.';
- y existiendo 'Pollo entero', `updateProduct(idChicha, { name: 'pollo entero' })` se rechaza con PRODUCT_NAME_TAKEN y la fila no cambia;
- y `updateProduct(id, { isActive: false })` deja is_active false (desactivar dos veces es idempotente), el producto sigue apareciendo en listProducts con isActive false, se puede seguir editando y `updateProduct(id, { isActive: true })` lo reactiva;
- y el servicio no expone operación de borrado: las claves de su interfaz son exactamente `listProducts`, `createProduct` y `updateProduct` (RN-005-04).

### 4.4 API (integración con Supertest y polleria_test)

En todos: `Cache-Control: no-store` en cada respuesta (también en las de error, incluidas las del lector del cuerpo), console.error espiado (los 4xx no se registran) y las cookies salen de inicios de sesión reales de usuarios con cada rol.

**AC-11. Leer la carta** (integración)
- Dado la app con los productos de AC-08 y cookies de mozo, de cocinero, de cajero, de admin y de una usuaria waiter+cashier,
- cuando se hace `GET /api/products` con cualquiera de esas cookies, entonces responde 200 con un cuerpo que cumple productsResponseSchema: los siete productos en el orden de AC-08, los inactivos incluidos con `isActive: false`;
- y sin cookie responde 401 UNAUTHENTICATED con el cuerpo exacto de la 003; con una cookie mal formada o vencida responde igual;
- y la respuesta 200 lleva `Cache-Control: no-store`.

**AC-12. Crear un producto por HTTP** (integración)
- Dado la app con el administrador dueno, el mozo mozo.juan y una usuaria con roles waiter+admin,
- cuando se hace `POST /api/products` con la cookie de admin y `{ name: '  1/4 de Pollo  ', category: 'chicken', priceCents: 1850 }`, entonces responde 201 con el Product creado (name '1/4 de Pollo', isActive true, exactamente las cinco claves de productSchema) y la fila existe; lo mismo con la cookie de la usuaria waiter+admin responde 201 (basta un rol de la lista);
- y con `{ name: 'Ají', category: 'sauce', priceCents: 0 }` responde 201 (precio cero permitido);
- y con name que ya existe ('chicha morada' existiendo 'Chicha Morada', activa o inactiva) responde 409 con exactamente `{ error: { code: 'PRODUCT_NAME_TAKEN', message: 'Ya existe un producto con ese nombre.', details: null } }`;
- y con `{}`, falta priceCents, category 'combo' o 'pollo', priceCents 18.5 o '1850', name '', o una propiedad de más, responde 400 VALIDATION_ERROR con `details.issues` no vacío;
- y sin cookie responde 401 y con cookie de mozo, de cocinero, de cajero o de la usuaria waiter+cashier (sin admin) responde 403 FORBIDDEN con el cuerpo exacto de la 003;
- y nada queda creado tras los 400, 401, 403 y 409.

**AC-13. Editar un producto por HTTP** (integración)
- Dado la app con el administrador dueno, el mozo mozo.juan y los productos 'Chicha Morada' y 'Pollo entero',
- cuando se hace `PATCH /api/products/<idChicha>` con la cookie de admin y `{ priceCents: 700 }`, entonces responde 200 con el Product actualizado y `GET /api/products` lo refleja;
- cuando se hace `PATCH` con `{ isActive: false }`, responde 200 con `isActive: false` y el producto sigue en la lista con `isActive: false`; con `{ isActive: true }` vuelve a true;
- y con `{ name: 'pollo entero' }` responde 409 PRODUCT_NAME_TAKEN y nada cambió;
- y `PATCH /api/products/999999` responde 404 con exactamente `{ error: { code: 'PRODUCT_NOT_FOUND', message: 'Ese producto no existe.', details: null } }`;
- y `PATCH /api/products/abc`, `/api/products/0`, `/api/products/1.5`, `/api/products/-3` y `/api/products/2147483648` responden 400 VALIDATION_ERROR con `issues[0].path` 'productId';
- y `PATCH` con `{}` responde 400 con un issue 'No indicaste ningún cambio.'; con `{ id: 7 }`, `{ stock: 3 }` u otra propiedad de más responde 400;
- y sin cookie responde 401 y con cookie de mozo responde 403.

**AC-14. Métodos y rutas no declarados** (integración)
- Dado la app con el administrador dueno,
- entonces `GET /api/products/3` (GET sobre la ruta de PATCH), `DELETE /api/products/3`, `PUT /api/products` y `PUT /api/products/3` responden 404 NOT_FOUND con el cuerpo común de la 001, como en la 003 y la 004 (Express no distingue 405);
- y llevan `Cache-Control: no-store` igual que las demás respuestas de /api/products/*.

**AC-15. Errores del lector del cuerpo** (integración)
- Dado la app con el administrador dueno y su cookie,
- entonces un POST /api/products con JSON mal formado responde 400 INVALID_JSON; un cuerpo que dice ser gzip y no lo es responde 400 INVALID_BODY; un cuerpo que supera 100 KB (después de descomprimir) responde 413 PAYLOAD_TOO_LARGE; y un Content-Encoding desconocido responde 415 UNSUPPORTED_MEDIA_TYPE — los mismos errores del lector de la 001, ahora con `Cache-Control: no-store` porque la cabecera se fija antes del lector (D-005-09).

### 4.5 Cobertura de RF y RNF

| RF o RNF | AC y requisitos que lo cubren |
| --- | --- |
| RF-18 (el administrador crea y edita productos y precios, y los activa o desactiva — la parte de productos; presentaciones en la 006, combos en la 007, pantallas en la 008) | AC-06 a AC-15 |
| RNF-12 (la carta se configura desde el sistema sin tocar código) | AC-08 a AC-15 (operaciones por API; las pantallas las pone la 008 sobre esta misma API) |
| RNF-09 (las acciones sensibles piden el rol correcto: gestionar la carta es solo del administrador) | AC-11, AC-12, AC-13 |
| Regla de dominio 2 (dinero en céntimos, nunca float) | AC-03, AC-06, AC-12 |
| Regla de dominio 4 (el precio se copia al pedido; cambiar la carta no altera pedidos abiertos) | RN-005-08; sin pedidos todavía, queda declarada para la Fase 2 |
| Regla de dominio 9 (todo en la red local) | Sin llamadas a internet; R-005-05 |

## 5. Requisitos de configuración (verificados por comando)

No son comportamiento, por eso no llevan AC. Los comandos se ejecutan en Git Bash desde la raíz.

| ID | Requisito | Comando | Resultado esperado |
| --- | --- | --- | --- |
| R-005-01 | Todas las rutas de backend/src/routes/products.routes.ts pasan por requireAuth, y POST y PATCH además por requireRole('admin'). | Revisión del reviewer | Se cumple. |
| R-005-02 | docs/api/openapi.yaml es OpenAPI 3.1 válido, versión 0.5.0, y coincide con lo implementado. | `npx -y @redocly/cli@latest lint docs/api/openapi.yaml` (desde una carpeta temporal) | "valid", sin errores. |
| R-005-03 | Sin variables de entorno nuevas ni cambios de configuración (D-005-14). | `git diff main -- backend/.env.example backend/src/config/env.ts` | Sin resultados. |
| R-005-04 | Una sola migración nueva, .ts con up/down (D-005-10). | `git status --porcelain backend/src/db/migrations` | Solo `?? .../20261008180000-create-products.ts`. |
| R-005-05 | La web sigue sin recursos de internet (R-14 de la 001) y frontend no cambia (D-005-01). | `git status --porcelain frontend` y el grep de R-14 de la 001 | Sin resultados. |
| R-005-06 | Cobertura: services de la API (incluido services/products) y shared con 90 % o más de líneas. | `pnpm test:coverage` | Código 0. |
| R-005-07 | Definición de terminado de CLAUDE.md. | `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm test:coverage` | Código 0 en los cuatro. |

## 6. Reglas de negocio aplicables

De CLAUDE.md:
- Glosario: producto = product, carta = menu, bebida = drink, cremas = sauces en código y base; producto, carta, bebida, cremas y demás textos en español de Perú en la interfaz (cuando llegue, en la 008).
- Regla de dominio 2: el precio se guarda y calcula en céntimos de sol como entero; prohibido float.
- Regla de dominio 4: el precio se copiará al pedido al registrarlo (Fase 2); cambiar el precio de la carta no altera pedidos abiertos — declarada en RN-005-08.
- Regla de dominio 9: todo funciona en la red local; nada usa internet.
- Reglas para todos los agentes 6 y 7: el esquema cambia solo con migraciones (esta spec agrega una); ningún secreto en el repositorio.

De las specs anteriores:
- RN-001-01 (sin secretos en respuestas ni logs), RN-001-05 (mensajes en español, códigos en inglés), RN-001-07 (los 4xx no se registran) y los errores del lector del cuerpo de la enmienda 1 (INVALID_JSON, INVALID_BODY, PAYLOAD_TOO_LARGE, UNSUPPORTED_MEDIA_TYPE).
- RN-003-06 y RN-003-07 completas: sesión válida o 401, rol faltante o 403; los roles se leen de la base en cada solicitud, así que quitarle admin a alguien le cierra estas rutas desde la siguiente solicitud.
- Mismo patrón que RN-004-05 para el "borrado": se desactiva, nunca se elimina.

Específicas de esta spec:
- RN-005-01. Solo el administrador gestiona la carta: POST /api/products y PATCH /api/products/{productId} exigen el rol admin.
- RN-005-02. La lectura de la carta (GET /api/products) es para cualquier rol con sesión y devuelve todos los productos, activos e inactivos; quien consume la carta vigente filtra por isActive.
- RN-005-03. El precio es un entero de céntimos entre 0 y 99999 (S/ 0.00 a S/ 999.99); 0 es válido (cremas gratis).
- RN-005-04. Un producto nunca se borra: se desactiva y puede reactivarse. Desactivado sigue apareciendo en la lista completa con isActive false.
- RN-005-05. El nombre del producto es único sin distinguir mayúsculas ni tildes de capitalización (`lower(name)`), entre activos e inactivos; un choque responde 409 PRODUCT_NAME_TAKEN.
- RN-005-06. La categoría solo puede ser una de PRODUCT_CATEGORIES ('chicken', 'dish', 'drink', 'dessert', 'sauce', 'extra'); la base lo garantiza con CHECK.
- RN-005-07. La carta se ordena por categoría (orden de PRODUCT_CATEGORIES), luego por nombre en español sin distinguir mayúsculas ni tildes, y empates por id.
- RN-005-08. (Regla 4 declarada) El precio de un ítem de pedido se copiará al registrarlo en la Fase 2; editar price_cents de la carta no puede cambiar pedidos ya tomados.
- RN-005-09. Todo producto nace activo; la activación/desactivación solo se cambia por PATCH.

## 7. Casos borde conocidos

- Crear un producto con el nombre de uno inactivo (con otra capitalización): 409 PRODUCT_NAME_TAKEN — el índice único es sobre todas las filas. Si el producto volvió, lo correcto es reactivarlo; si el nombre estaba mal, se corrige con PATCH.
- PATCH sin cambios reales (mismos valores que tiene): 200, idempotente. PATCH con `id`, `createdAt` u otra propiedad fuera del esquema: 400.
- `productId` de la ruta que no es un entero positivo dentro del INTEGER de la base ('abc', '0', '1.5', '-3', '03' sí pasa —vale 3—, '2147483648', '999999999999999999999999'): 400 VALIDATION_ERROR con el issue en `productId` (o 404 si el entero es válido pero no existe).
- Editar o reactivar un producto inactivo: permitido.
- Precio 0: válido (cremas gratis, D-005-05). Precio con decimales (18.5) o como texto ('1850'): 400.
- Precio 100000 o más: 400 (también el error de tipeo 185000 por S/ 18.50, D-005-05).
- Dos altas simultáneas con el mismo nombre: una responde 201 y la otra 409 (lo resuelve el índice único, sin transacción especial).
- Categoría 'combo' todavía no existe: 400 (la 007 decide cómo se modelan los combos, S-005-10).
- Nombre con espacio duro (`\u00A0`) en medio o con emoji: 400 (el patrón no los admite; el recorte sí quita los espacios duros de los bordes).
- Métodos no declarados sobre las rutas (GET /api/products/3, DELETE, PUT): 404 NOT_FOUND.
- Cuerpo JSON mal formado, gzip corrupto, más de 100 KB o Content-Encoding raro: los errores del lector del cuerpo de la 001, con no-store (D-005-09).
- La sesión vence con la pantalla abierta (cuando exista, en la 008): la siguiente consulta responde 401 y la web vuelve a /login (mecanismo de la 003).
- Un usuario al que le quitan el rol admin con una sesión abierta: 403 desde la siguiente solicitud (RN-003-06).
- Cambiar el precio de un producto que ya está en pedidos abiertos: no aplica todavía; en la Fase 2 el ítem conserva su precio copiado (RN-005-08).

## 8. Modelo de datos

### 8.1 Tabla products (migración 20261008180000-create-products.ts)

| Columna | Tipo | Restricciones |
| --- | --- | --- |
| id | INTEGER | PRIMARY KEY, autoincremental (SERIAL o IDENTITY) |
| name | VARCHAR(60) | NOT NULL; CHECK `products_name_valid`: `name <> '' AND name = btrim(name)`; índice único `products_name_unique` sobre `lower(name)` (sin distinguir mayúsculas) |
| category | VARCHAR(16) | NOT NULL; CHECK `products_category_allowed`: `category IN ('chicken', 'dish', 'drink', 'dessert', 'sauce', 'extra')` |
| price_cents | INTEGER | NOT NULL; CHECK `products_price_cents_range`: `price_cents >= 0 AND price_cents <= 99999` |
| is_active | BOOLEAN | NOT NULL DEFAULT true |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

- El patrón completo del nombre (letras, números y los signos permitidos; NFC) lo aplica productNameSchema; la base solo garantiza que no esté vacío ni tenga espacios alrededor, igual que display_name de users. VARCHAR(60) cuenta caracteres (puntos de código), igual que zod `max(60)`.
- La unicidad del nombre es un índice por expresión sobre `lower(name)` (no una restricción UNIQUE de la columna): 'Chicha' y 'chicha' chocan, pero 'Chicha Morada' y 'chicha morada' también. No se normaliza el nombre guardado: se conserva como lo escribió el administrador (con sus mayúsculas).
- Sin índice extra sobre category ni is_active: una carta de pollería tiene decenas de productos y la lista completa se lee entera y se ordena en el servicio (D-005-04).
- La categoría es VARCHAR con CHECK y no un ENUM de PostgreSQL ni una tabla de categorías: coherente con roles de users, y agregar 'combo' u otra categoría es una migración que reemplaza el CHECK, sin tabla extra (D-005-03).
- Sequelize (modelo Product, `underscored`, `defineModels` suma 'Product' a la guardia `isDefined`): id, name, category (STRING(16)), priceCents (INTEGER), isActive (BOOLEAN, default true), createdAt, updatedAt.
- Sin claves foráneas todavía: los ítems de pedido referenciarán products en la Fase 2 y las presentaciones en la 006. `down` de la migración borra la tabla (revertir pierde sus datos; solo para desarrollo).

## 9. API

Todas las rutas cuelgan de /api. Todas las respuestas de /api/products/* llevan `Cache-Control: no-store`, también las de error (incluidas las del lector del cuerpo). GET la puede llamar cualquier rol con sesión; POST y PATCH exigen el rol admin (401 UNAUTHENTICATED sin sesión; 403 FORBIDDEN con cualquier combinación de roles sin admin).

| Método y ruta | Rol | Request | Respuesta correcta | Errores |
| --- | --- | --- | --- | --- |
| GET /api/products | cualquier rol con sesión | — | 200 ProductsResponse | 401 UNAUTHENTICATED, 500 |
| POST /api/products | admin | CreateProductRequest | 201 Product | 400 VALIDATION_ERROR (y los de lectura del cuerpo de la 001), 401, 403, 409 PRODUCT_NAME_TAKEN, 500 |
| PATCH /api/products/{productId} | admin | UpdateProductRequest | 200 Product | 400 VALIDATION_ERROR (cuerpo o productId inválidos), 401, 403, 404 PRODUCT_NOT_FOUND, 409 PRODUCT_NAME_TAKEN, 500 |

### 9.1 GET /api/products

```json
{
  "products": [
    { "id": 5, "name": "1/4 de Pollo", "category": "chicken", "priceCents": 1850, "isActive": true },
    { "id": 2, "name": "Chicha Morada", "category": "drink", "priceCents": 500, "isActive": true },
    { "id": 7, "name": "Ají", "category": "sauce", "priceCents": 0, "isActive": false }
  ]
}
```

Todos los productos, activos e inactivos, en el orden de la carta (D-005-04): categoría en el orden de PRODUCT_CATEGORIES, nombre en español sin distinguir mayúsculas ni tildes, empates por id. Cada producto con exactamente id, name, category, priceCents e isActive; nunca createdAt ni updatedAt. La carta del mozo (Fase 2) y la administración (008) consumen esta lista; quien solo muestra la carta vigente filtra `isActive`.

### 9.2 POST /api/products

Request:

```json
{ "name": "1/4 de Pollo", "category": "chicken", "priceCents": 1850 }
```

- name se recorta y se normaliza (productNameSchema); category cumple productCategorySchema; priceCents cumple priceCentsSchema (entero 0..99999). Objeto estricto: una propiedad de más (isActive, stock, id) es 400.
- Responde 201 con el Product creado (isActive siempre true, RN-005-09). El producto ya aparece en la carta.
- Nombre repetido —exista activo o inactivo, sin distinguir mayúsculas—: 409 PRODUCT_NAME_TAKEN.

### 9.3 PATCH /api/products/{productId}

Request (al menos una propiedad):

```json
{ "priceCents": 2000, "isActive": false }
```

- Objeto estricto con las cuatro propiedades opcionales (name, category, priceCents, isActive); `{}` responde 400 'No indicaste ningún cambio.'.
- `isActive: false` quita el producto de la carta; `isActive: true` lo devuelve (RN-005-04). Sin efectos sobre sesiones ni pedidos.
- Renombrar a un nombre que ya existe: 409 PRODUCT_NAME_TAKEN. `productId` entero positivo (1..2147483647); si no existe, 404 PRODUCT_NOT_FOUND.
- Editar un precio no toca pedidos abiertos (RN-005-08; los pedidos llegan en la Fase 2).

### 9.4 Contrato

docs/api/openapi.yaml pasa a la versión 0.5.0: etiqueta products; rutas /products (GET y POST) y /products/{productId} (PATCH); parámetro de ruta ProductId; esquemas ProductCategory, ProductName, PriceCents, Product, ProductsResponse, CreateProductRequest y UpdateProductRequest; respuestas reutilizables ProductNotFound y ProductNameTaken; ErrorCode suma PRODUCT_NOT_FOUND y PRODUCT_NAME_TAKEN; la nota de FORBIDDEN cubre también las escrituras de /products.

### 9.5 Socket.IO

Sin eventos en esta spec. Cuando la Fase 2 agregue tiempo real, un cambio de carta podría emitirse a los mozos conectados; queda para la spec que lo necesite.

## 10. Interfaz

Sin pantallas en esta spec (D-005-01). Las pantallas de administración de la carta (lista, alta, edición, activar/desactivar) son la spec 008, y la carta del mozo llega con la Fase 2; ambas consumen la API de la sección 9 tal cual. Cuando la 008 las construya: etiquetas de categorías en español (Pollo, Platos, Bebidas, Postres, Cremas, Extras), precios formateados a soles solo en la interfaz (regla 2) y botones de al menos 48 px como en la 004.

## 11. Contrato interno de módulos (rutas que importan las pruebas)

El test-writer importa desde estas rutas; si un módulo no existe todavía, la prueba falla por módulo inexistente (rojo válido). Sintaxis borrable (D-02 de la 001), imports relativos con .ts.

- **packages/shared/src/products.ts** (nuevo, exportado también por packages/shared/src/index.ts)
  - `PRODUCT_CATEGORIES` = `['chicken', 'dish', 'drink', 'dessert', 'sauce', 'extra']` (`as const`), `type ProductCategory`, `productCategorySchema` (z.enum).
  - `PRODUCT_NAME_MAX_LENGTH` = 60, `PRODUCT_NAME_PATTERN` = `/^[\p{L}\p{N}][\p{L}\p{M}\p{N} .,'()/%+-]*$/u`, mensaje único `PRODUCT_NAME_MESSAGE` = 'Usa de 1 a 60 caracteres: letras, números, espacios y los signos punto, coma, apóstrofo, paréntesis, barra, porcentaje, más o guion; empieza con letra o número.', `productNameSchema` (recorte, NFC, largo y patrón; mismo estilo que displayNameSchema).
  - `PRICE_CENTS_MAX` = 99999, `priceCentsSchema` (`z.number().int()` entre 0 y 99999; mensaje único 'El precio debe ser un número entero de céntimos entre 0 y 99999.').
  - `createProductRequestSchema` (estricto: name, category, priceCents) y `type CreateProductRequest`.
  - `updateProductRequestSchema` (estricto: las cuatro opcionales; al menos una con 'No indicaste ningún cambio.') y `type UpdateProductRequest`.
  - `productSchema` (estricto: id entero positivo, name, category, priceCents, isActive boolean) y `type Product`.
  - `productsResponseSchema` (estricto: `products` con arreglo de productSchema) y `type ProductsResponse`.
- **packages/shared/src/errors.ts** (modificado): ERROR_CODES suma PRODUCT_NOT_FOUND y PRODUCT_NAME_TAKEN.
- **backend/src/db/migrations/20261008180000-create-products.ts** (nuevo): `up` y `down` con `{ context: QueryInterface }`; `up` crea la tabla de 8.1 con sus CHECK y el índice único `products_name_unique` sobre `lower(name)`; `down` borra la tabla.
- **backend/src/models/index.ts** (modificado):
  - `interface ProductAttributes { id: number; name: string; category: ProductCategory; priceCents: number; isActive: boolean; createdAt: Date; updatedAt: Date }`, `type ProductModel` y `Models` suma `Product: ModelStatic<ProductModel>`.
  - `defineModels` lo define (`tableName: 'products'`, `underscored`) y la guardia `isDefined` contempla también 'Product'.
- **backend/src/services/products/product.service.ts** (nuevo):
  - `interface ProductService { listProducts(): Promise<Product[]>; createProduct(input: unknown): Promise<Product>; updateProduct(productId: number, input: unknown): Promise<Product> }` — createProduct y updateProduct parsean su entrada con los esquemas (ZodError) para que el servicio sea seguro aunque se llame sin HTTP.
  - `createProductService(deps: { models: Models }): ProductService`.
  - `listProducts` devuelve todos los productos en el orden de D-005-04 (Intl.Collator 'es' sensibilidad base; empates por id), cada uno con exactamente las cinco claves de Product.
  - `createProduct` guarda la fila y traduce el choque del índice único (UniqueConstraintError) a AppError PRODUCT_NAME_TAKEN (409 'Ya existe un producto con ese nombre.'); `updateProduct` busca por id (PRODUCT_NOT_FOUND 404 'Ese producto no existe.'), aplica los campos recibidos y traduce igual el choque de nombre.
  - Funciones de error exportadas: `createProductNotFoundError()` y `createProductNameTakenError()`.
- **backend/src/controllers/products.controller.ts** (nuevo): `parseProductIdParam` (`^[0-9]+$`, entero entre 1 y 2147483647; si no, AppError VALIDATION_ERROR con issues `[{ path: 'productId', message: 'El identificador del producto no es válido.' }]`), parsea el cuerpo con los esquemas y responde 200/201.
- **backend/src/routes/products.routes.ts** (nuevo): middleware que fija `Cache-Control: no-store`; `GET /` con requireAuth; `POST /` y `PATCH /:productId` con requireAuth + requireRole('admin').
- **backend/src/routes/index.ts** y **backend/src/app.ts** (modificados): createApiRouter recibe el controller de productos y monta `/products`; app.ts crea el servicio y el controller y suma '/api/products' a NO_STORE_PATH_PREFIXES (la comparación en minúsculas ya cubre /api/PRODUCTS, ADV-004-25).
- **backend/tests/helpers/test-database.ts** (modificado por el test-writer): resetMigrationTables borra también `products` junto a sessions y users; helper nuevo sugerido `clearMenuTables` (o equivalente) que hace `TRUNCATE products RESTART IDENTITY` tras la doble verificación de la base _test.
- **frontend**: sin cambios (D-005-01).

Rutas sugeridas para pruebas: unitarias junto al código (`packages/shared/src/products.test.ts`); integración en backend/tests/ (`products-migration.test.ts`, `products-service.test.ts`, `products.test.ts`).

## 12. Cambios a specs y documentos anteriores (señalados)

Ningún cambio altera lo que ya ve el usuario ni toca código existente fuera de lo listado.

| Elemento | Cambio | Quién |
| --- | --- | --- |
| 003/004, helper resetMigrationTables (backend/tests/helpers/test-database.ts) | Además de sessions, users y las tablas de registro, borra products (siempre después de la doble verificación de la base _test); helper nuevo de limpieza de products entre pruebas. | test-writer (T-02) |
| 003, app.ts (NO_STORE_PATH_PREFIXES) | Suma '/api/products' para que también los errores del lector del cuerpo lleven no-store (lección ADV-004-25). | backend-dev (T-08) |
| 004, routes/index.ts y ApiRouterDependencies | Suma el controller de productos y monta /products. | backend-dev (T-08) |
| 001, R-12 | `pnpm db:migrate` sobre una base nueva aplica también la migración de products. | — (nota) |
| docs/api/openapi.yaml | Versión 0.4.0 → 0.5.0 con lo de 9.4. | spec-writer (esta spec) |
| PROGRESS.md, CLAUDE.md | Sin cambios de comandos; el orquestador actualiza PROGRESS al cerrar. | orquestador, al cerrar |

## 13. Dependencias

Ninguna dependencia nueva ni de soporte: se reutilizan Sequelize (modelos, índice por expresión), Zod y requireAuth/requireRole. Sin variables de entorno nuevas (D-005-14). No hay ADR: no se introduce ninguna decisión de arquitectura nueva (el modelo de datos y los códigos de error siguen las convenciones ya aprobadas).

## 14. Fuera de alcance

- Pantallas web de la carta: la administración (lista, alta, edición, activar/desactivar) es la spec 008 y la carta del mozo llega con la Fase 2. En esta spec no hay frontend-dev ni E2E.
- Presentaciones y partes con consumo en octavos (RF-19, spec 006): si el dueño vende 1/8, cómo arma el 1/2 y si cobra distinto pecho y pierna son preguntas que quedaron pendientes para esa spec (pregunta 10, aprobado diferirlas). Aquí "1/4 de Pollo" puede existir como producto simple.
- Combos y sus componentes (spec 007): 'combo' no es categoría todavía (S-005-10).
- Borrado de productos (RN-005-04: se desactivan, nunca se borran).
- Descripción, foto, código/SKU, orden manual de la carta (S-005-09, S-005-02).
- Stock por producto, agotados y bloqueo en la carta (RF-21, RF-22, Fase 5); refrescos por jarra/vaso como producción de insumos (RF-23, Fase 5 — en la carta "Chicha jarra" y "Chicha vaso" ya pueden ser dos productos con su precio).
- Pedidos, comandas, Socket.IO (fases 2 y 3).
- Descartables como insumo de inventario (Fase 5); como producto vendible ya se pueden crear en la categoría 'extra'.
- Auditoría de quién creó/editó/desactivó productos (RF-27, Fase 6).
- Seeds de la carta real del dueño (Fase 6; el dueño la carga con las pantallas de la 008).
- GET /api/products/{productId} de detalle (la lista ya trae todo lo necesario, como en la 004).

## 15. Supuestos

Confirmados por el usuario el 2026-10-08: S-005-01 a S-005-11, todos con la respuesta recomendada. Ya no son supuestos: son decisiones; se conservan abajo como registro.

| ID | Supuesto |
| --- | --- |
| S-005-01 | Las categorías son fijas y solo las seis de PRODUCT_CATEGORIES; el dueño no crea categorías libres. |
| S-005-02 | La carta se ordena sola por categoría y nombre; no hay orden manual (si el dueño lo quiere, una spec posterior agrega la columna). |
| S-005-03 | El precio puede ser S/ 0.00: las cremas que no se cobran entran a la carta como productos de precio 0 y salen en la comanda. |
| S-005-04 | Un producto nunca se borra: se desactiva y puede reactivarse; el error de tipeo se corrige desactivando o renombrando. |
| S-005-05 | El nombre del producto es único sin distinguir mayúsculas, entre activos e inactivos. |
| S-005-06 | GET /api/products lo puede llamar cualquier rol con sesión y devuelve también los inactivos; quien consume la carta filtra por isActive. |
| S-005-07 | El precio tope es 99999 céntimos (S/ 999.99); nada de la carta se acerca a ese monto. |
| S-005-08 | La 005 no incluye pantallas web: es dominio + API; las pantallas son de la 008 y la Fase 2 (coincide con la división del orquestador). |
| S-005-09 | El producto no tiene descripción, foto, código/SKU ni orden manual. |
| S-005-10 | 'combo' no es categoría en esta spec; la 007 decide si los combos son productos con esa categoría o una entidad aparte. |
| S-005-11 | Un producto 'chicken' puede existir ya como ítem simple con precio propio; la 006 le agrega presentaciones/partes y decide cómo conviven con price_cents. |

## 16. Preguntas abiertas para el usuario

Respondidas el 2026-10-08, todas con la respuesta recomendada: 1 (las categorías son fijas: Pollo, Platos, Bebidas, Postres, Cremas y Extras), 2 (las cremas que no se cobran entran a la carta como productos con precio S/ 0.00), 3 (un producto nunca se borra: se desactiva y puede reactivarse), 4 (la carta se ordena sola por categoría y nombre, sin orden manual), 5 (el nombre es único sin distinguir mayúsculas, incluidos los inactivos), 6 (el precio puede ser S/ 0.00 y no puede pasar de S/ 999.99), 7 (los descartables y el empaque para llevar se cargan como productos de la categoría Extras; controlarlos como insumo será de la fase de inventario), 8 (GET /api/products lo puede llamar cualquier trabajador con sesión y devuelve también los desactivados), 9 (esta spec no trae pantallas: la administración de la carta llega en la 008 sobre esta misma API) y 10 (las preguntas sobre 1/8, armado del 1/2 y precio distinto para pecho y pierna quedan pendientes para la spec 006, que no bloquean esta). Se conservan abajo como registro.

1. (dueño) Las categorías de la carta serían fijas: Pollo, Platos, Bebidas, Postres, Cremas y Extras (recomendado, S-005-01; 'combo' se decide en la 007). ¿Te falta alguna (por ejemplo "Parrillas" o "Antojos") o prefieres poder crear categorías tú mismo?
2. (dueño) Si las cremas no se cobran, igual entrarían a la carta con precio S/ 0.00 para que el mozo las agregue y la cocina las vea en la comanda (recomendado, S-005-03; responde la pendiente "¿las cremas se cobran?"). Si alguna se cobra, se crea con su precio. ¿Está bien así?
3. (dueño) Un producto nunca se borra: se quita de la carta desactivándolo y puede volver (recomendado, S-005-04); así queda en el historial de pedidos futuro. Si lo creaste mal, lo desactivas o le corriges el nombre. ¿Basta así?
4. (dueño) La carta se ordena sola: por categoría y dentro de cada una por nombre (recomendado, S-005-02). ¿Te sirve, o quieres poder mover los productos a mano (eso lo agregaría la 008)?
5. (dueño) Nombre único sin distinguir mayúsculas: no podría existir "Chicha" dos veces aunque una esté desactivada (recomendado, S-005-05). ¿Está bien?
6. (dueño) El precio puede ser S/ 0.00 y no puede pasar de S/ 999.99, para cortar errores de tipeo como escribir 185000 por S/ 18.50 (recomendado, S-005-07). ¿Algún producto podría costar cerca de mil soles?
7. (dueño) Los descartables y el empaque para llevar podrían cargarse como productos de la categoría Extras con su precio (recomendado; responde la pendiente "¿descartables?"). Controlarlos como insumo con stock será de la fase de inventario. ¿Está bien?
8. (técnica) La lectura de la carta (GET /api/products) la podrá hacer cualquier trabajador con sesión y devuelve también los productos desactivados; el mozo y las pantallas filtran por activos (recomendado, S-005-06: la carta no tiene secretos y simplifica el contrato). ¿Está bien?
9. (técnica) Confirmar que esta spec no trae pantallas: la administración de la carta llega en la 008 sobre esta misma API (recomendado, S-005-08, es la división del orquestador). ¿Está bien?
10. (dueño) Los pendientes de la carta que son de la 006 y no bloquean esta spec: ¿vendes 1/8?, ¿cómo armas el 1/2 (pecho + pierna o a elección)? y ¿cobras distinto pecho y pierna? Puedes responderlas ya para adelantar la 006, o responderlas cuando llegue su spec.

## 17. Acción del usuario y verificación manual

Acción en backend/.env: ninguna. Una migración nueva (products); aplicarla con `pnpm db:migrate` sobre polleria_dev cuando la funcionalidad esté implementada.

Después de que la funcionalidad esté implementada (no hay pantallas; la verificación es por API, desde PowerShell o una consola):
1. `pnpm db:migrate`: debe decir 'Migración aplicada: 20261008180000-create-products.ts'.
2. `pnpm dev` y entrar como administrador en http://localhost:3000 para obtener la sesión.
3. Crear un producto con `curl` (o similar) usando la cookie `polleria_session`: `POST http://localhost:3000/api/products` con `{ "name": "1/4 de Pollo", "category": "chicken", "priceCents": 1850 }` → debe responder 201 con el producto.
4. `GET http://localhost:3000/api/products` con la cookie → debe listarlo; sin la cookie → 401.
5. `PATCH /api/products/<id>` con `{ "priceCents": 1950 }` → 200 con el precio nuevo; con `{ "isActive": false }` → sigue en la lista con `isActive: false`; con `{ "isActive": true }` → vuelve.
6. Intentar crear otro '1/4 DE POLLO' → debe responder 'Ya existe un producto con ese nombre.'; con `priceCents: 185000` → 'El precio debe ser un número entero de céntimos entre 0 y 99999.'.
7. Con la sesión de un mozo (cuando exista uno), `POST /api/products` → debe responder 'No tienes permiso para realizar esta acción.' y `GET` → 200.

## 18. Notas para specs siguientes (no son alcance de esta)

- 006 (presentaciones y partes, RF-19): modelar las presentaciones (eighth, quarter, half, whole) y las partes (breast, leg) sobre products — probablemente solo de categoría 'chicken'— con consumo en octavos y precio por presentación; decidir cómo convive con `price_cents` del producto (precio base, reemplazo o ignorado). Preguntas del dueño pendientes: ¿vende 1/8?, ¿cómo arma el 1/2?, ¿cobra distinto pecho y pierna?
- 007 (combos): decidir si un combo es un producto con categoría 'combo' (migración que amplíe el CHECK `products_category_allowed`) o una tabla propia con componentes que referencian products.
- 008 (pantallas de administración de la carta): consumir GET/POST/PATCH /api/products tal cual; cliente `frontend/src/lib/api/products.ts` (mismo patrón que users.ts: esquemas de shared, expectedStatus 200/201); etiquetas de categorías en la web; formatear priceCents a soles solo en la interfaz; la lista ya viene ordenada (D-005-04) y se agrupa por categoría.
- Fase 2 (mozo y pedidos): la carta del mozo filtra `isActive` y agrupa por categoría en el orden del enum; el ítem del pedido copia `priceCents` y el nombre al registrarse (regla 4, RN-005-08); si se quiere una vista de carta con disponibilidad de stock, se evalúa un GET /api/menu dedicado cuando llegue RF-22 (Fase 5).
- Fase 5 (inventario): stock por producto/insumo, producción de refrescos (jarra → vasos, pendiente del dueño: cuántos vasos rinde una jarra) y descartables como insumo.
- Fase 6: auditoría de cambios de productos y precios (RF-27); seeds de la carta real del dueño.
