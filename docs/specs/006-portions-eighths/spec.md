# Spec 006 — Presentaciones y partes del pollo con consumo en octavos

- Estado: Aprobada (2026-10-09, por el usuario, con las respuestas recomendadas a las preguntas 1 a 6)
- Fase: 1 (Usuarios y carta)
- Rama: feat/006-portions-eighths
- Fecha: 2026-10-09
- Cubre: la parte de pollo de RF-19 ("cada producto define cuánto pollo consume y de qué parte") y la base que RF-04 necesita (el mozo elegirá presentación y parte en la Fase 2). La parte de RF-19 "qué bebida o insumo descuenta" queda para la fase de inventario (Fase 5, RF-20 a RF-23), igual que el descuento de stock. También cubre RNF-12 (las presentaciones y sus precios se configuran desde el sistema, sin tocar código).
- Documentos relacionados: tasks.md (esta carpeta), docs/planificacion.md (RF-19, tabla de presentaciones y preguntas para el dueño), docs/specs/005-menu-products/spec.md (productos, categorías fijas, price_cents, desactivar sin borrar), docs/specs/003-users-pin-login/spec.md (sesión, requireAuth/requireRole), docs/api/openapi.yaml (versión 0.5.0 → 0.6.0) y CLAUDE.md (regla de dominio 1, no negociable).

## 1. Contexto

La 005 creó la carta: productos con nombre, categoría y un solo precio. Pero el pollo a la brasa no se vende como un ítem único: el cliente pide 1/8, 1/4, 1/2 o entero, y para las porciones chicas elige pecho o pierna. Además, cada venta de pollo consume octavos de pecho y de pierna (regla de dominio 1: 1 pollo = 8 octavos = 4 de pecho + 4 de pierna), y la Fase 5 descontará ese stock al vender. Esta spec agrega a los productos de categoría 'chicken' sus presentaciones con precio por parte y deja el consumo en octavos modelado con una función pura en shared, sin tocar pedidos (Fase 2) ni inventario (Fase 5). Es dominio + API solamente: las pantallas llegan en la 008 (administración) y la Fase 2 (carta del mozo).

## 2. Historias de usuario

| ID | Historia |
| --- | --- |
| HU-006-01 | Como administrador (dueño), quiero indicar qué presentaciones vende cada producto de pollo (octavo, cuarto, medio, entero) y a qué precio, para que la carta refleje cómo vendo de verdad. |
| HU-006-02 | Como administrador, quiero poner precios distintos al pecho y a la pierna del cuarto (o el mismo precio), porque en mi carta pueden cobrarse diferente. |
| HU-006-03 | Como administrador, quiero quitar una presentación (por ejemplo el octavo si un día no lo vendo) y volver a ofrecerla después, sin crear otro producto. |
| HU-006-04 | Como mozo (y también cajero o cocina), quiero consultar las presentaciones y partes de un producto de pollo con mi sesión, para armar el pedido correcto en la Fase 2. |
| HU-006-05 | Como administrador, quiero que el sistema no me deje guardar un "medio pollo pecho" ni un "cuarto sin parte", para que la carta nunca pida algo que la cocina no puede trozar. |
| HU-006-06 | Como sistema (Fase 5), quiero que cada presentación vendida sepa cuántos octavos de pecho y de pierna consume, para descontar el stock exacto. |

## 3. Decisiones técnicas

Todas fueron confirmadas por el usuario el 2026-10-09 con la respuesta recomendada (sección 17); las que partieron como supuesto conservan la marca SUPUESTO con su ID S-006-xx como registro.

**D-006-01. Alcance: solo dominio + API, sin pantallas (SUPUESTO S-006-07).**
- Igual que la 005: esta spec deja listo el modelo, los esquemas compartidos, la función de consumo, el servicio y las rutas. Las pantallas de administración son la spec 008 y la carta del mozo la Fase 2. No hay tareas de frontend-dev ni pruebas E2E.
- Consecuencia: ningún archivo de frontend cambia.

**D-006-02. Presentaciones y partes son listas fijas en shared (SUPUESTOS S-006-01 y S-006-02).**
- `PORTIONS` = `['eighth', 'quarter', 'half', 'whole']`, en ese orden (es también el orden en que se muestran: octavo, cuarto, medio, entero). `CUTS` = `['breast', 'leg']` (pecho, pierna), en ese orden.
- Fijas y no libres por las mismas razones que las categorías de la 005 (D-005-03): el glosario de CLAUDE.md ya fija portion = eighth/quarter/half/whole y cut = breast/leg; nadie vende "tres octavos" ni "ala" como parte separada del trozado de octavos; y las etiquetas en español las pone la web sin que el dueño escriba nada.
- `PORTION_EIGHTHS` = `{ eighth: 1, quarter: 2, half: 4, whole: 8 }` (regla de dominio 1, literal).

**D-006-03. Las presentaciones son filas de una tabla `product_portions` (SUPUESTO S-006-03).**
- Cada fila dice: "este producto de pollo se vende en esta presentación (y parte, si aplica) a este precio". Columnas: `id`, `product_id` (FK a products), `portion`, `cut` (NULL solo para half/whole), `price_cents`, `created_at`, `updated_at`.
- Por qué tabla propia y no columnas en products: un mismo producto ("Pollo a la brasa") se vende en varias presentaciones con precios distintos; una fila por combinación lo expresa sin columnas repetidas ni productos duplicados ("1/4 de Pollo pecho", "1/4 de Pollo pierna"...) que además chocarían con el nombre único de la 005.
- Por qué no una tabla de presentaciones aparte con precios globales: cada pollería (y a veces cada producto de pollo, por ejemplo "Pollo" vs "Pollo premium") pone sus precios; la presentación es la misma lista fija de shared, no una entidad gestionable.
- `cut` NULL representa las presentaciones que llevan ambas partes (half, whole); para eighth/quarter la parte es obligatoria. La base lo garantiza con un CHECK (sección 8.1).

**D-006-04. El consumo en octavos se deriva con una función pura; no se guarda en la carta.**
- `chickenConsumption(portion, cut)` en packages/shared devuelve `{ breastEighths, legEighths }`:
  - eighth/quarter (llevan parte): todos los octavos son de esa parte. `('quarter', 'leg')` → `{ breastEighths: 0, legEighths: 2 }`.
  - half (sin parte): por defecto `{ breastEighths: 2, legEighths: 2 }` (regla 1: "por defecto 2 de pecho + 2 de pierna, configurable").
  - whole (sin parte): `{ breastEighths: 4, legEighths: 4 }`.
  - Combinaciones inválidas (eighth/quarter sin parte; half/whole con parte) lanzan error.
- Por qué derivar y no guardar `breast_eighths`/`leg_eighths` en la tabla: lo derivado nunca puede quedar inconsistente con (portion, cut) — no hay dos fuentes de verdad que contradecirse. La función es pura, va en shared y la usan igual la API, la web (Fase 2) y el descuento de stock (Fase 5). Es el mismo patrón que `toLimaDateTimeParts`.
- "Configurable" (regla 1) se resuelve en el ítem del pedido, no en la carta: cuando el cliente pida "medio solo pierna", la Fase 2 registrará en el ítem la distribución real (0 pecho + 4 pierna) con el precio del medio. La carta solo necesita saber que el medio existe y su precio. Queda declarado para la Fase 2 (RN-006-08), igual que la 005 declaró la regla 4 (RN-005-08).

**D-006-05. Convivencia con `products.price_cents` (resuelve lo que la 005 dejó abierto en D-005-12 y S-005-11; SUPUESTO S-006-04).**
- `products.price_cents` sigue siendo obligatorio y no cambia de tipo ni de rango: romper esa columna rompería la 005 aprobada.
- Regla: un producto 'chicken' SIN presentaciones se vende como ítem simple a `price_cents` (lo que ya pasaba en la 005, por ejemplo "1/4 de Pollo" a S/ 18.50 plano). Un producto 'chicken' CON presentaciones se vende por presentación y parte al precio de la fila correspondiente; su `price_cents` no se usa para cobrar.
- Es una aspereza conocida (el admin debe poner igual un price_cents al crear el producto de pollo; se recomienda el precio del cuarto o el más representativo). La alternativa —hacer price_cents opcional— cambiaría el contrato aprobado de la 005 y de CreateProductRequest. Se prefiere documentarlo.
- Ninguna otra categoría puede tener presentaciones (D-006-07): los platos, bebidas y demás se venden siempre como ítem simple a `price_cents`.

**D-006-06. Las presentaciones se configuran de una vez con PUT (reemplazo atómico; SUPUESTO S-006-05).**
- `PUT /api/products/{productId}/portions` recibe el conjunto completo `{ portions: [...] }` y lo deja exactamente así: dentro de una transacción se borran las filas anteriores del producto y se insertan las nuevas. Todo o nada: si el cuerpo es inválido o algo falla, el conjunto anterior queda intacto.
- Por qué reemplazo y no POST/PATCH por fila: el admin piensa en "la tabla de precios de este pollo" como una sola cosa (la pantalla de la 008 será una grilla de precios que se guarda de una vez); una operación PUT idempotente es más simple que tres rutas granulares y su estado intermedio. Borrar + insertar dentro de la transacción es correcto porque nada referencia estas filas: los ítems de pedido de la Fase 2 copiarán precio, presentación, parte y octavos (estilo regla 4), no guardarán la FK.
- Consecuencia: el `id` de cada fila puede cambiar entre un PUT y otro; el contrato no garantiza su estabilidad y los clientes no deben guardarlo entre recargas.
- `portions: []` es válido y deja el producto sin presentaciones (vuelve a comportarse como ítem simple, D-006-05); además es la vía para poder cambiarle la categoría después (D-006-07).
- Tope de 6 filas por producto (`PRODUCT_PORTIONS_MAX`): son todas las combinaciones posibles — octavo pecho, octavo pierna, cuarto pecho, cuarto pierna, medio y entero. Más de 6 implica duplicados, que ya se rechazan.

**D-006-07. Solo los productos de categoría 'chicken' llevan presentaciones, y la categoría no se puede retirar si hay presentaciones cargadas.**
- PUT sobre un producto de otra categoría responde 409 PORTIONS_NOT_ALLOWED (el cuerpo puede estar bien; lo que no permite es el estado del producto).
- En el otro sentido: `PATCH /api/products/{productId}` con `category` distinta de 'chicken' sobre un producto que tiene presentaciones responde 409 PRODUCT_HAS_PORTIONS y no cambia nada (cambio al comportamiento de la 005, señalado en la sección 12). El orden correcto es: PUT con `portions: []` y luego el PATCH de categoría. PATCH con `category: 'chicken'` (sin cambio real) y PATCH de name/priceCents/isActive siempre se permiten, haya o no presentaciones.
- Es coherencia con la regla de dominio 1: solo el pollo a la brasa se mide en octavos. Los platos que usan algo de pollo (mostrito, combos) los trata la 007/Fase 5, no esta spec.

**D-006-08. Quién gestiona y quién lee (SUPUESTO S-006-08).**
- Escritura: PUT /api/products/{productId}/portions exige `requireAuth` + `requireRole('admin')` (401 sin sesión, 403 con cualquier combinación de roles sin admin), igual que POST/PATCH /products de la 005.
- Lectura: GET /api/products/{productId}/portions exige `requireAuth` y nada más; responde 404 PRODUCT_NOT_FOUND si el producto no existe y 200 con `{ portions: [] }` si no tiene presentaciones cargadas (incluido un producto de otra categoría, que nunca tendrá).
- Cache-Control: las rutas cuelgan de `/api/products/`, así que el prefijo '/api/products' de NO_STORE_PATH_PREFIXES ya las cubre, incluidos los errores del lector del cuerpo (lección ADV-004-25); el router las fija además, idempotente. app.ts no cambia esa lista.

**D-006-09. Errores (formato común).**

| code | HTTP | message | details | Cuándo |
| --- | --- | --- | --- | --- |
| VALIDATION_ERROR | 400 | Los datos enviados no son válidos. | `{ issues }` | Cuerpo inválido (presentación o parte fuera de lista, parte que no corresponde a la presentación, repetidos, más de 6 filas, priceCents fuera de rango o con decimales, propiedad de más) o `productId` de la ruta inválido (issue en `productId`: 'El identificador del producto no es válido.'). |
| PRODUCT_NOT_FOUND | 404 | Ese producto no existe. | null | GET o PUT sobre un `productId` que no existe. |
| PORTIONS_NOT_ALLOWED | 409 | Solo los productos de la categoría Pollo pueden tener presentaciones. | null | PUT sobre un producto cuya categoría no es 'chicken'. |
| PRODUCT_HAS_PORTIONS | 409 | Este producto tiene presentaciones de pollo; quítalas antes de cambiar su categoría. | null | PATCH /products/{productId} que cambia `category` a algo distinto de 'chicken' mientras el producto tiene presentaciones. |

- Los dos códigos nuevos se suman a ERROR_CODES de @polleria/shared. Ningún 4xx se registra en el log (RN-001-07). `productId` se valida con la misma regla de la 005 (`^[0-9]+$`, 1..2147483647).

**D-006-10. Migración y limpieza de pruebas.**
- Una migración nueva `20261009120000-create-product-portions.ts` (umzug), con `up` que crea la tabla con sus CHECK, la unicidad y el índice, y `down` que la borra. Las restricciones viven en la base, no solo en Zod (D-003-14).
- Consecuencia para las pruebas (sección 12): `resetMigrationTables` borra `product_portions` ANTES que `products` (hay FK), `clearMenuTables` trunca `product_portions` antes que `products` (cada una detrás de su `tableExists`, para que la fase roja no falle en la limpieza), y las listas MIGRATIONS de `users-migrations.test.ts` y `products-migration.test.ts` ganan el nombre nuevo al final. La tabla `product_portions` queda autorizada para limpieza de pruebas igual que `products` (solo polleria_test, con la doble verificación).

**D-006-11. Orden de la lista de presentaciones.**
- GET devuelve las filas ordenadas por `portion` en el orden de PORTIONS (eighth, quarter, half, whole), luego por `cut` en el orden de CUTS (breast antes que leg), y empates por `id`. Como half/whole llevan `cut` NULL, el orden visible queda: octavo pecho, octavo pierna, cuarto pecho, cuarto pierna, medio, entero.
- El servicio ordena en memoria (la lista es de máximo 6 filas por producto), igual que listProducts de la 005.

**D-006-12. Sin variables de entorno, sin dependencias nuevas, sin ADR.**
- Nada se configura por .env: CONFIG_VARIABLES y backend/.env.example no cambian. Sin paquetes nuevos.
- No hay ADR: el modelado en octavos ya es regla de dominio 1 (no negociable) y las decisiones de esta spec (tabla por producto, consumo derivado, PUT de reemplazo) son decisiones de dominio documentadas aquí, no cambios de arquitectura ni dependencias. Si el usuario lo prefiere, se puede redactar un ADR corto del modelado; no lo considero necesario.

## 4. Criterios de aceptación

Cada AC tiene al menos una prueba cuyo nombre empieza con su ID. Cada archivo de prueba de esta spec envuelve sus pruebas en un `describe` cuyo nombre empieza con `006:` y las pruebas van en archivos nuevos. Se indica el nivel y una ubicación sugerida; la ubicación exacta la decide el test-writer.

Datos comunes de las pruebas:
- `T0` = `2026-10-09T15:00:00.000Z`, igual criterio que en la 005.
- "La app" es `createApp({ sequelize, now, pinHasher })` sobre polleria_test con las migraciones reales aplicadas y las tablas product_portions, products, users y sessions vacías al empezar cada prueba. `pinHasher` puede ser `createBcryptPinHasher({ cost: 4 })`.
- Los usuarios y las cookies se crean como en la 005 (`createUserService`, `loginWithCookie`); los productos con `createProductService({ models })` o SQL; las presentaciones con `createProductPortionService` o SQL según el AC.
- Los textos con caracteres especiales se escriben con escapes, nunca literales.

### 4.1 Paquete compartido (packages/shared)

**AC-01. Presentaciones y partes** (unitaria, packages/shared)
- Dado `PORTIONS`, `type Portion`, `portionSchema`, `CUTS`, `type Cut` y `cutSchema` exportados por '@polleria/shared',
- entonces PORTIONS es exactamente `['eighth', 'quarter', 'half', 'whole']`, en ese orden, y CUTS es exactamente `['breast', 'leg']`, en ese orden;
- y portionSchema acepta cada una de las cuatro y devuelve el mismo valor; y rechaza 'octavo', 'Eighth', 'HALF', '1/4', 'media', '', ' eighth', null, 0 y ['half'];
- y cutSchema acepta 'breast' y 'leg' y devuelve el mismo valor; y rechaza 'pecho', 'Breast', 'pierna', '', null y 0.

**AC-02. Consumo en octavos (regla de dominio 1)** (unitaria, packages/shared)
- Dado `PORTION_EIGHTHS`, `chickenConsumption`, `SINGLE_CUT_PORTIONS` y `MIXED_PORTIONS`,
- entonces PORTION_EIGHTHS es exactamente `{ eighth: 1, quarter: 2, half: 4, whole: 8 }`, SINGLE_CUT_PORTIONS es `['eighth', 'quarter']` y MIXED_PORTIONS es `['half', 'whole']`;
- y `chickenConsumption('eighth', 'breast')` devuelve `{ breastEighths: 1, legEighths: 0 }`; `chickenConsumption('eighth', 'leg')` → `{ breastEighths: 0, legEighths: 1 }`; `chickenConsumption('quarter', 'breast')` → `{ breastEighths: 2, legEighths: 0 }`; `chickenConsumption('quarter', 'leg')` → `{ breastEighths: 0, legEighths: 2 }`;
- y `chickenConsumption('half', null)` y `chickenConsumption('half', undefined)` devuelven `{ breastEighths: 2, legEighths: 2 }` (por defecto 2 de pecho + 2 de pierna);
- y `chickenConsumption('whole', null)` devuelve `{ breastEighths: 4, legEighths: 4 }` (1 pollo = 4 de pecho + 4 de pierna);
- y para toda combinación válida, `breastEighths + legEighths` es igual a `PORTION_EIGHTHS[portion]`;
- y lanzan error: `chickenConsumption('eighth', null)`, `('eighth', undefined)`, `('quarter', null)`, `('half', 'breast')`, `('half', 'leg')`, `('whole', 'breast')` y una `portion` fuera de PORTIONS (por ejemplo `'octavo'` forzado al tipo).

**AC-03. Solicitud de reemplazo de presentaciones** (unitaria, packages/shared)
- Dado `productPortionInputSchema`, `replaceProductPortionsRequestSchema` y `PRODUCT_PORTIONS_MAX` (6),
- cuando valida `{ portions: [{ portion: 'quarter', cut: 'breast', priceCents: 1850 }] }` devuelve lo mismo; y acepta `{ portion: 'half', priceCents: 3200 }` (sin cut), `{ portion: 'whole', cut: null, priceCents: 6000 }` (cut null explícito), `{ portions: [] }` (dejar sin presentaciones) y el conjunto completo de 6 filas (octavo y cuarto con cada parte, medio y entero);
- y rechaza con un issue que contiene 'La parte no corresponde a la presentación: eighth y quarter llevan breast o leg; half y whole no llevan parte.': `{ portion: 'eighth', priceCents: 700 }` (sin parte), `{ portion: 'quarter', cut: null, priceCents: 1800 }`, `{ portion: 'half', cut: 'leg', priceCents: 3200 }` y `{ portion: 'whole', cut: 'breast', priceCents: 6000 }`;
- y rechaza con un issue que contiene 'Hay presentaciones repetidas en la lista.': dos filas iguales en (portion, cut), por ejemplo dos `{ portion: 'quarter', cut: 'leg' }` o dos `{ portion: 'half' }`;
- y rechaza: un arreglo de 7 filas válidas con un issue por el tope de 6; `{ portion: 'octavo' }`; `cut: 'pecho'`; `priceCents` -1, 18.5, 100000 o '500'; propiedades de más en la fila (`id`, `productId`, `isActive`, `breastEighths`); propiedad de más en la raíz; `{ }` (sin portions); `{ portions: 'x' }`; un texto, null y undefined.

**AC-04. Respuesta de la API y códigos de error** (unitaria, packages/shared)
- Dado `productPortionSchema`, `productPortionsResponseSchema` y `type ProductPortion`,
- entonces productPortionSchema acepta `{ id: 2, productId: 5, portion: 'quarter', cut: 'breast', priceCents: 1850 }` y `{ id: 4, productId: 5, portion: 'half', cut: null, priceCents: 3200 }` con exactamente esas cinco claves;
- y rechaza: id 0, -1 o '2'; productId 0 o faltante; portion 'octavo'; cut 'pecho'; priceCents 18.5 o '1850'; y cualquier propiedad de más (`createdAt`, `breastEighths`, `name`);
- y productPortionsResponseSchema acepta `{ portions: [] }` y `{ portions: [<fila válida>] }`, y rechaza un elemento inválido y una propiedad de más en la raíz;
- y ERROR_CODES contiene PORTIONS_NOT_ALLOWED y PRODUCT_HAS_PORTIONS con valores iguales a sus nombres, además de todos los anteriores;
- y errorResponseSchema acepta `{ error: { code: 'PORTIONS_NOT_ALLOWED', message: 'Solo los productos de la categoría Pollo pueden tener presentaciones.', details: null } }` y `{ error: { code: 'PRODUCT_HAS_PORTIONS', message: 'Este producto tiene presentaciones de pollo; quítalas antes de cambiar su categoría.', details: null } }`.

### 4.2 Base de datos (migraciones reales sobre polleria_test)

**AC-05. Tabla product_portions** (integración, backend)
- Dado polleria_test con `migrateUp(sequelize)` aplicado y un producto id 5 (INSERT directo),
- entonces information_schema muestra la tabla product_portions con: id integer (clave primaria y autoincremental), product_id integer, portion character varying(8), cut character varying(8) —la única que permite NULL—, price_cents integer, created_at y updated_at timestamp with time zone; todas NOT NULL salvo cut, y created_at/updated_at con valor por defecto;
- y `product_id` es clave foránea a products(id): un INSERT con product_id 999999 falla con error de la base;
- y pg_indexes muestra un índice no único `product_portions_product_id` sobre (product_id);
- y un INSERT con product_id 5, portion 'quarter', cut 'breast' y price_cents 1850 funciona;
- y fallan con un error de la base y no dejan fila: portion 'octavo', 'big' o NULL; cut 'pecho' o 'wing'; price_cents -1, 100000 o NULL;
- y fallan por el CHECK `product_portions_cut_matches_portion`: (portion 'eighth', cut NULL), (portion 'quarter', cut NULL), (portion 'half', cut 'breast'), (portion 'whole', cut 'leg');
- y pasan juntos los seis: (5,'eighth','breast'), (5,'eighth','leg'), (5,'quarter','breast'), (5,'quarter','leg'), (5,'half',NULL), (5,'whole',NULL);
- y con ellos cargados falla tanto repetir (5,'quarter','breast') como repetir (5,'half',NULL) — la unicidad `product_portions_unique` trata los NULL como iguales (UNIQUE NULLS NOT DISTINCT sobre product_id, portion, cut);
- y el mismo (portion, cut) sí puede existir en otro producto (por ejemplo (6,'quarter','breast')).

**AC-06. Las migraciones se aplican y se revierten** (integración, backend)
- Dado polleria_test sin tablas de dominio ni de registro (helper de la sección 12),
- cuando se ejecuta `migrateUp(sequelize)`, entonces devuelve `['20261008120000-create-users.ts', '20261008120100-create-sessions.ts', '20261008180000-create-products.ts', '20261009120000-create-product-portions.ts']` en ese orden y existe product_portions;
- cuando luego se ejecuta `migrateDown(sequelize)`, devuelve `['20261009120000-create-product-portions.ts']` y product_portions ya no existe pero products sí;
- y al ejecutar `migrateUp(sequelize)` otra vez, product_portions vuelve a existir (reaplicable tras revertir).

### 4.3 Servicios (backend, con polleria_test)

**AC-07. Listar las presentaciones de un producto** (integración, backend/tests)
- Dado `createProductPortionService({ models })` sobre polleria_test, con el producto 5 (chicken) cargado por SQL con las filas en desorden: (half,NULL,3200), (quarter,leg,1700), (eighth,leg,650), (quarter,breast,1850), (whole,NULL,6000), (eighth,breast,700),
- cuando se llama `listProductPortions(5)`, entonces devuelve las seis en el orden de D-006-11: (eighth,breast), (eighth,leg), (quarter,breast), (quarter,leg), (half,null), (whole,null);
- y cada elemento tiene exactamente las claves `id`, `productId`, `portion`, `cut` y `priceCents` (null en las mixtas); ninguna lleva `createdAt` ni `product_id`;
- y para un producto sin presentaciones (chicken o de otra categoría) devuelve `[]`;
- y `listProductPortions(999999)` se rechaza con un AppError de code 'PRODUCT_NOT_FOUND', httpStatus 404 y message 'Ese producto no existe.'.

**AC-08. Reemplazar las presentaciones** (integración)
- Dado el servicio y un producto 5 de categoría 'chicken',
- cuando `replaceProductPortions(5, { portions: [{ portion: 'quarter', cut: 'breast', priceCents: 1850 }, { portion: 'quarter', cut: 'leg', priceCents: 1700 }, { portion: 'half', priceCents: 3200 }] })`, entonces resuelve con las tres filas ya ordenadas (D-006-11) y la base guarda exactamente esas tres filas con cut null en half;
- y una segunda llamada idéntica deja el mismo conjunto (idempotente; los `id` pueden cambiar, D-006-06);
- y una llamada con solo `[{ portion: 'whole', priceCents: 6000 }]` deja únicamente esa fila (las anteriores se borran);
- y una llamada con `{ portions: [] }` deja la tabla sin filas del producto;
- y si el cuerpo trae una fila inválida entre válidas (por ejemplo `{ portion: 'half', cut: 'leg', priceCents: 3200 }`), se rechaza con ZodError y el conjunto anterior queda intacto (todo o nada);
- y `replaceProductPortions(999999, ...)` se rechaza con AppError 'PRODUCT_NOT_FOUND' 404;
- y sobre un producto de otra categoría (`category 'dish'`) se rechaza con AppError de code 'PORTIONS_NOT_ALLOWED', httpStatus 409 y message 'Solo los productos de la categoría Pollo pueden tener presentaciones.', sin tocar nada;
- y entrada inválida (sin portions, priceCents 18.5, propiedad de más) se rechaza con ZodError sin cambiar filas.

**AC-09. La categoría no se puede retirar con presentaciones cargadas** (integración)
- Dado `createProductService({ models })` y el producto 5 'chicken' con presentaciones cargadas,
- cuando `updateProduct(5, { category: 'dish' })`, entonces se rechaza con AppError de code 'PRODUCT_HAS_PORTIONS', httpStatus 409 y message 'Este producto tiene presentaciones de pollo; quítalas antes de cambiar su categoría.', y la fila queda sin cambios;
- y `updateProduct(5, { category: 'chicken' })` resuelve normal (sin cambio real); lo mismo `updateProduct(5, { name: 'Pollo entero' })`, `{ priceCents: 3000 }` y `{ isActive: false }` — solo el cambio de categoría está protegido;
- y tras `replaceProductPortions(5, { portions: [] })`, `updateProduct(5, { category: 'dish' })` sí resuelve;
- y un producto 'dish' sin presentaciones puede pasar a 'chicken' con `updateProduct` (las presentaciones se cargan después).

### 4.4 API (integración con Supertest y polleria_test)

En todos: `Cache-Control: no-store` en cada respuesta (también en las de error, incluidas las del lector del cuerpo), console.error espiado (los 4xx no se registran) y las cookies salen de inicios de sesión reales de usuarios con cada rol.

**AC-10. Leer las presentaciones por HTTP** (integración)
- Dado la app con el producto 5 (chicken) cargado como en AC-07 y cookies de mozo, de cocinero, de cajero, de admin y de una usuaria waiter+cashier,
- cuando se hace `GET /api/products/5/portions` con cualquiera de esas cookies, entonces responde 200 con un cuerpo que cumple productPortionsResponseSchema: las seis filas en el orden de D-006-11;
- y `GET /api/products/<id sin presentaciones>/portions` responde 200 `{ portions: [] }`, igual para un producto 'dish';
- y `GET /api/products/999999/portions` responde 404 con `{ error: { code: 'PRODUCT_NOT_FOUND', message: 'Ese producto no existe.', details: null } }`;
- y `GET /api/products/abc/portions`, `/api/products/0/portions`, `/api/products/1.5/portions`, `/api/products/-3/portions` y `/api/products/2147483648/portions` responden 400 VALIDATION_ERROR con `issues[0].path` 'productId';
- y sin cookie responde 401 UNAUTHENTICATED con el cuerpo exacto de la 003; con cookie mal formada o vencida, igual.

**AC-11. Reemplazar las presentaciones por HTTP** (integración)
- Dado la app con el administrador dueno, el mozo mozo.juan, una usuaria con roles waiter+admin, otra con waiter+cashier y los productos 5 (chicken) y 8 (dish),
- cuando se hace `PUT /api/products/5/portions` con la cookie de admin y el cuerpo de AC-08, entonces responde 200 con un cuerpo que cumple productPortionsResponseSchema (las tres filas ordenadas) y `GET` lo refleja; lo mismo con la cookie de la usuaria waiter+admin responde 200;
- y un segundo PUT idéntico responde 200 con el mismo conjunto (idempotente);
- y un PUT con `{ portions: [] }` responde 200 `{ portions: [] }` y `GET` devuelve lista vacía;
- y `PUT /api/products/8/portions` (producto 'dish') responde 409 con exactamente `{ error: { code: 'PORTIONS_NOT_ALLOWED', message: 'Solo los productos de la categoría Pollo pueden tener presentaciones.', details: null } }` y no crea filas;
- y `PUT /api/products/999999/portions` responde 404 PRODUCT_NOT_FOUND;
- y con cuerpo inválido —fila con half y cut 'leg', dos filas (quarter, breast), 7 filas, priceCents 18.5, propiedad de más— responde 400 VALIDATION_ERROR con `details.issues` no vacío, y el conjunto anterior queda intacto (verificado con GET);
- y sin cookie responde 401 y con cookie de mozo, de cocinero, de cajero o de la usuaria waiter+cashier responde 403 FORBIDDEN con el cuerpo exacto de la 003.

**AC-12. Cambiar la categoría con presentaciones por HTTP** (integración)
- Dado la app con el administrador dueno y el producto 5 'chicken' con presentaciones cargadas,
- cuando se hace `PATCH /api/products/5` con `{ "category": "dish" }` y la cookie de admin, entonces responde 409 con exactamente `{ error: { code: 'PRODUCT_HAS_PORTIONS', message: 'Este producto tiene presentaciones de pollo; quítalas antes de cambiar su categoría.', details: null } }` y el producto sigue en 'chicken';
- y tras `PUT /api/products/5/portions` con `{ "portions": [] }`, el mismo PATCH responde 200 con `category: 'dish'`;
- y PATCH con `{ "priceCents": 3000 }` o `{ "category": "chicken" }` sobre el producto con presentaciones responde 200 normal.

**AC-13. Métodos y rutas no declarados** (integración)
- Dado la app con el administrador dueno y el producto 5,
- entonces `POST /api/products/5/portions`, `DELETE /api/products/5/portions`, `PATCH /api/products/5/portions` y `GET /api/products/5/portions/2` responden 404 NOT_FOUND con el cuerpo común de la 001 (PUT /api/products sin id ya está cubierto en la 005);
- y llevan `Cache-Control: no-store` igual que las demás respuestas bajo /api/products/*.

**AC-14. Errores del lector del cuerpo en PUT** (integración)
- Dado la app con el administrador dueno y su cookie,
- entonces un PUT /api/products/5/portions con JSON mal formado responde 400 INVALID_JSON; un cuerpo que dice ser gzip y no lo es responde 400 INVALID_BODY; un cuerpo que supera 100 KB (después de descomprimir) responde 413 PAYLOAD_TOO_LARGE; y un Content-Encoding desconocido responde 415 UNSUPPORTED_MEDIA_TYPE — los mismos errores del lector de la 001, con `Cache-Control: no-store` (D-006-08).

### 4.5 Cobertura de RF y RNF

| RF o RNF | AC y requisitos que lo cubren |
| --- | --- |
| RF-19 (parte "cuánto pollo consume y de qué parte": presentaciones con octavos por producto) | AC-01 a AC-14 |
| RF-04 (base para que el mozo elija presentación y parte en la Fase 2) | AC-01, AC-02, AC-10 (catálogo legible por cualquier rol) |
| RNF-12 (presentaciones y precios configurables desde el sistema) | AC-08, AC-11 |
| RNF-09 (acciones sensibles con el rol correcto) | AC-11 |
| Regla de dominio 1 (pollo en octavos: 1=8, mitad 2+2 por defecto) | AC-02, AC-03, AC-05, AC-08 |
| Regla de dominio 2 (dinero en céntimos) | AC-03, AC-05, AC-11 |
| Regla de dominio 4 (precio y octavos se copiarán al ítem del pedido) | Declarada en RN-006-08 para la Fase 2; sin pedidos todavía |
| Regla de dominio 9 (todo en la red local) | Sin llamadas a internet; R-006-05 |

## 5. Requisitos de configuración (verificados por comando)

No son comportamiento, por eso no llevan AC. Los comandos se ejecutan en Git Bash desde la raíz.

| ID | Requisito | Comando | Resultado esperado |
| --- | --- | --- | --- |
| R-006-01 | Las rutas nuevas pasan por requireAuth, y PUT además por requireRole('admin'). | Revisión del reviewer | Se cumple. |
| R-006-02 | docs/api/openapi.yaml es OpenAPI 3.1 válido, versión 0.6.0, y coincide con lo implementado. | `npx -y @redocly/cli@latest lint docs/api/openapi.yaml` (desde una carpeta temporal) | "valid", sin errores. |
| R-006-03 | Sin variables de entorno nuevas ni cambios de configuración (D-006-12). | `git diff main -- backend/.env.example backend/src/config/env.ts` | Sin resultados. |
| R-006-04 | Una sola migración nueva, .ts con up/down (D-006-10). | `git status --porcelain backend/src/db/migrations` | Solo `?? .../20261009120000-create-product-portions.ts`. |
| R-006-05 | frontend no cambia (D-006-01) y la web sigue sin recursos de internet (R-14 de la 001). | `git status --porcelain frontend` y el grep de R-14 de la 001 | Sin resultados. |
| R-006-06 | Cobertura: services de la API (incluido el servicio de presentaciones) y shared con 90 % o más de líneas. | `pnpm test:coverage` | Código 0. |
| R-006-07 | Definición de terminado de CLAUDE.md. | `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm test:coverage` | Código 0 en los cuatro. |

## 6. Reglas de negocio aplicables

De CLAUDE.md:
- Regla de dominio 1 (no negociable): el pollo se mide en octavos como entero; 1 pollo = 8 octavos = 4 de pecho + 4 de pierna; 1/2 = 4 octavos, por defecto 2 de pecho + 2 de pierna, configurable. Es la base de AC-02.
- Regla de dominio 2: precios en céntimos de sol como entero; prohibido float.
- Regla de dominio 4 (declarada): el ítem del pedido copiará precio, presentación, parte y octavos al registrarse (Fase 2); cambiar la carta no altera pedidos abiertos — RN-006-08.
- Regla de dominio 9: todo funciona en la red local; nada usa internet.
- Glosario: presentación = portion (eighth, quarter, half, whole), parte = cut (breast, leg), producto = product. Textos de interfaz y mensajes en español de Perú.
- Reglas para todos los agentes 6 y 7: el esquema cambia solo con migraciones; ningún secreto en el repositorio.

De las specs anteriores:
- RN-001-01 (sin secretos), RN-001-05 (mensajes en español, códigos en inglés), RN-001-07 (los 4xx no se registran) y los errores del lector del cuerpo (INVALID_JSON, INVALID_BODY, PAYLOAD_TOO_LARGE, UNSUPPORTED_MEDIA_TYPE).
- RN-003-06 y RN-003-07 completas: sesión válida o 401, rol faltante o 403; los roles se leen de la base en cada solicitud.
- De la 005: RN-005-01 (escritura solo admin), RN-005-02 (lectura para cualquier rol con sesión), RN-005-03 (precio 0..99999), RN-005-04 (los productos se desactivan, nunca se borran), RN-005-06 (categorías fijas con CHECK), RN-005-09 (todo producto nace activo). Las filas de presentaciones no son productos: se reemplazan con PUT, no se desactivan (D-006-06).

Específicas de esta spec:
- RN-006-01. Solo el administrador configura presentaciones: PUT /api/products/{productId}/portions exige el rol admin.
- RN-006-02. La lectura de presentaciones (GET) es para cualquier rol con sesión y devuelve todas las filas del producto en el orden de D-006-11.
- RN-006-03. Solo los productos de categoría 'chicken' tienen presentaciones: PUT sobre otra categoría responde 409 PORTIONS_NOT_ALLOWED y un cambio de categoría con presentaciones cargadas responde 409 PRODUCT_HAS_PORTIONS.
- RN-006-04. eighth y quarter llevan parte (breast o leg); half y whole no llevan parte. Lo garantizan Zod, el CHECK `product_portions_cut_matches_portion` y la unicidad `product_portions_unique` (NULLS NOT DISTINCT).
- RN-006-05. El consumo se deriva con `chickenConsumption`: eighth/quarter consumen sus octavos de una sola parte; half consume 2+2 y whole 4+4 por defecto. La carta no guarda octavos.
- RN-006-06. Un producto 'chicken' sin presentaciones se vende como ítem simple a `price_cents`; con presentaciones, el precio de venta es el de la fila correspondiente y `price_cents` no se usa para cobrar.
- RN-006-07. El conjunto de presentaciones se reemplaza atómico con PUT (todo o nada); `portions: []` deja el producto sin presentaciones; el `id` de cada fila no es estable entre PUTs.
- RN-006-08. (Regla 4 declarada) En la Fase 2, el ítem del pedido copiará `portion`, `cut`, `breastEighths`, `legEighths` y `priceCents` vigentes al registrarse — incluida una distribución distinta del medio cuando el cliente la pida ("medio solo pierna" = 0 pecho + 4 pierna, al precio del medio). Editar la carta después no toca pedidos registrados.

## 7. Casos borde conocidos

- PUT con el conjunto completo de 6 filas: válido; con 7 o más: 400 (PRODUCT_PORTIONS_MAX); con una fila inválida entre válidas: 400 y el conjunto anterior queda intacto (transacción, D-006-06).
- `portions: []`: válido; deja el producto como ítem simple (RN-006-06) y habilita el cambio de categoría (RN-006-03).
- `cut: null` explícito en half/whole: aceptado (equivale a ausente). `cut: null` en eighth/quarter: 400.
- Dos filas iguales en (portion, cut) dentro del mismo PUT: 400 'Hay presentaciones repetidas en la lista.' La unicidad de la base además lo garantiza si se insertara por SQL.
- `productId` de la ruta inválido ('abc', '0', '1.5', '-3', '2147483648') o válido pero inexistente: 400 VALIDATION_ERROR con issue en `productId`, o 404 PRODUCT_NOT_FOUND ('03' vale 3, igual que en la 005).
- PUT sobre un producto desactivado: permitido (se configura antes de reactivarlo). GET igual.
- GET/PUT sobre un producto que no es 'chicken': GET responde `{ portions: [] }`; PUT responde 409 PORTIONS_NOT_ALLOWED.
- PATCH `category` hacia 'chicken' o entre categorías sin presentaciones: permitido. PATCH `category` de 'chicken' a otra con presentaciones: 409 PRODUCT_HAS_PORTIONS.
- Cambiar el precio de una presentación es un PUT nuevo con la fila actualizada; no hay historial de precios (los pedidos copian el precio, RN-006-08; la auditoría de cambios de la carta es Fase 6, RF-27).
- Dos PUT simultáneos sobre el mismo producto: cada uno es una transacción atómica; gana el último en confirmar (no hay estado intermedio visible).
- El `id` de una fila puede cambiar tras otro PUT (se borra y se inserta, D-006-06): los clientes no deben guardar `id` entre recargas.
- Un producto 'chicken' sin presentaciones sigue vendiéndose como ítem simple: es la vía de compatibilidad con la 005 y con productos de pollo que no usan octavos.
- Precio 0 en una presentación: válido (mismo rango que `price_cents`; por ejemplo una promoción).
- Métodos no declarados sobre las rutas nuevas (POST/DELETE/PATCH en `.../portions`, sub-rutas): 404 NOT_FOUND.
- Cuerpo JSON mal formado, gzip corrupto, más de 100 KB o Content-Encoding raro: los errores del lector de la 001, con no-store (D-006-08).
- Un usuario al que le quitan el rol admin con una sesión abierta: 403 desde la siguiente solicitud (RN-003-06).
- "Medio solo pierna" u "octavo y medio": la carta no los modela. El primero se resuelve en el ítem del pedido (distribución real copiada, RN-006-08) o como otro producto si tiene precio propio; el segundo no existe en octavos (3 octavos sueltos no son presentación vendible — si el dueño vende "3/8", sería otra spec).

## 8. Modelo de datos

### 8.1 Tabla product_portions (migración 20261009120000-create-product-portions.ts)

| Columna | Tipo | Restricciones |
| --- | --- | --- |
| id | INTEGER | PRIMARY KEY, autoincremental (SERIAL o IDENTITY) |
| product_id | INTEGER | NOT NULL; REFERENCES products(id); índice `product_portions_product_id` (no único) |
| portion | VARCHAR(8) | NOT NULL; CHECK `product_portions_portion_allowed`: `portion IN ('eighth', 'quarter', 'half', 'whole')` |
| cut | VARCHAR(8) | NULL; CHECK `product_portions_cut_allowed`: `cut IN ('breast', 'leg')` |
| price_cents | INTEGER | NOT NULL; CHECK `product_portions_price_cents_range`: `price_cents >= 0 AND price_cents <= 99999` |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

Restricciones de tabla:
- CHECK `product_portions_cut_matches_portion`: `(portion IN ('eighth','quarter') AND cut IS NOT NULL) OR (portion IN ('half','whole') AND cut IS NULL)` — la parte es obligatoria en las porciones de una sola parte y prohibida en las mixtas (RN-006-04).
- `CONSTRAINT product_portions_unique UNIQUE NULLS NOT DISTINCT (product_id, portion, cut)` — una sola fila por (producto, presentación, parte); los NULL de cut cuentan como iguales, así solo hay un 'half' y un 'whole' por producto (PostgreSQL 15+; el proyecto usa 17.5).
- Sin columna `is_active`: una fila existe = se ofrece; no existe = no se ofrece. El reemplazo por PUT borra e inserta (D-006-06); nada referencia estas filas (los pedidos copiarán los valores, RN-006-08).
- No hay CHECK posible que limite las filas a productos 'chicken' (las CHECK no ven otras tablas): lo garantiza el servicio (RN-006-03) y lo refuerza la guardia de categoría del PATCH.
- Sequelize (modelo ProductPortion, `underscored`, `defineModels` suma 'ProductPortion' a la guardia `isDefined`): id, productId (INTEGER, FK), portion (STRING(8)), cut (STRING(8), allowNull), priceCents (INTEGER), createdAt, updatedAt. Asociación: Product.hasMany(ProductPortion, { foreignKey: 'productId' }) y ProductPortion.belongsTo(Product).
- `down` de la migración borra la tabla (revertir pierde sus datos; solo para desarrollo). Va antes que products al borrar en los helpers de prueba (D-006-10).

### 8.2 Función pura de consumo (packages/shared)

`chickenConsumption(portion: Portion, cut: Cut | null | undefined): { breastEighths: number; legEighths: number }` — la única fuente de verdad del consumo (RN-006-05). La tabla NO guarda octavos: se calculan. En la Fase 2 el ítem del pedido guardará su propia copia (puede diferir del valor por defecto si el cliente pide otra distribución del medio), y la Fase 5 descontará esos octavos copiados con la regla de dominio 3 (transacción con bloqueo de fila).

## 9. API

Todas las rutas cuelgan de /api. Todas las respuestas bajo /api/products/* llevan `Cache-Control: no-store`, también las de error (D-006-08). GET la puede llamar cualquier rol con sesión; PUT exige el rol admin (401 UNAUTHENTICATED sin sesión; 403 FORBIDDEN con cualquier combinación de roles sin admin).

| Método y ruta | Rol | Request | Respuesta correcta | Errores |
| --- | --- | --- | --- | --- |
| GET /api/products/{productId}/portions | cualquier rol con sesión | — | 200 ProductPortionsResponse | 400 VALIDATION_ERROR (productId), 401, 404 PRODUCT_NOT_FOUND, 500 |
| PUT /api/products/{productId}/portions | admin | ReplaceProductPortionsRequest | 200 ProductPortionsResponse | 400 VALIDATION_ERROR (cuerpo o productId, y los de lectura del cuerpo de la 001), 401, 403, 404 PRODUCT_NOT_FOUND, 409 PORTIONS_NOT_ALLOWED, 500 |
| PATCH /api/products/{productId} | admin (005) | UpdateProductRequest | 200 Product | Lo de la 005 más 409 PRODUCT_HAS_PORTIONS al cambiar category fuera de 'chicken' con presentaciones cargadas |

### 9.1 GET /api/products/{productId}/portions

```json
{
  "portions": [
    { "id": 1, "productId": 5, "portion": "eighth", "cut": "breast", "priceCents": 700 },
    { "id": 2, "productId": 5, "portion": "eighth", "cut": "leg", "priceCents": 650 },
    { "id": 3, "productId": 5, "portion": "quarter", "cut": "breast", "priceCents": 1850 },
    { "id": 4, "productId": 5, "portion": "quarter", "cut": "leg", "priceCents": 1700 },
    { "id": 5, "productId": 5, "portion": "half", "cut": null, "priceCents": 3200 },
    { "id": 6, "productId": 5, "portion": "whole", "cut": null, "priceCents": 6000 }
  ]
}
```

Todas las filas del producto en el orden de D-006-11 (portion en orden de PORTIONS, luego cut en orden de CUTS, empates por id). Cada fila con exactamente id, productId, portion, cut (null en las mixtas) y priceCents; nunca createdAt ni updatedAt. Producto sin presentaciones o de otra categoría: `{ "portions": [] }`. Producto inexistente: 404. La carta del mozo (Fase 2) y la administración (008) consumen esta lista; el consumo en octavos lo calcula `chickenConsumption`, no viene en la respuesta.

### 9.2 PUT /api/products/{productId}/portions

Request (conjunto completo; reemplaza lo que haya):

```json
{
  "portions": [
    { "portion": "quarter", "cut": "breast", "priceCents": 1850 },
    { "portion": "quarter", "cut": "leg", "priceCents": 1700 },
    { "portion": "half", "priceCents": 3200 },
    { "portion": "whole", "priceCents": 6000 }
  ]
}
```

- Cada fila: `portion` obligatoria de PORTIONS; `cut` obligatorio (breast/leg) para eighth y quarter, ausente o null para half y whole; `priceCents` entero 0..99999. Objeto estricto por fila y en la raíz.
- `portions` de 0 a 6 filas, sin repetir (portion, cut).
- Responde 200 con el conjunto resultante (mismo formato que GET). Atómico: si algo falla, no cambia nada (D-006-06).
- `productId` que no existe: 404 PRODUCT_NOT_FOUND. Producto que no es 'chicken': 409 PORTIONS_NOT_ALLOWED.

### 9.3 Contrato

docs/api/openapi.yaml pasa a la versión 0.6.0: la etiqueta products cubre también las presentaciones (specs 005 y 006); ruta nueva /products/{productId}/portions (GET y PUT); esquemas Portion, Cut, ProductPortionInput, ReplaceProductPortionsRequest, ProductPortion y ProductPortionsResponse; respuestas reutilizables PortionsNotAllowed y ProductHasPortions; ErrorCode suma PORTIONS_NOT_ALLOWED y PRODUCT_HAS_PORTIONS; la nota de FORBIDDEN cubre también el PUT de presentaciones; la descripción de PATCH /products/{productId} menciona el 409 nuevo.

### 9.4 Socket.IO

Sin eventos en esta spec (igual que la 005).

## 10. Interfaz

Sin pantallas en esta spec (D-006-01). La grilla de presentaciones y precios por producto de pollo es de la spec 008 (administración de la carta) y la elección de presentación y parte del mozo es de la Fase 2; ambas consumen la API de la sección 9 tal cual. Cuando lleguen: etiquetas en español (octavo, cuarto, medio, entero; pecho, pierna), precios a soles solo en la interfaz (regla 2) y botones de al menos 48 px como en la 004.

## 11. Contrato interno de módulos (rutas que importan las pruebas)

El test-writer importa desde estas rutas; si un módulo no existe todavía, la prueba falla por módulo inexistente (rojo válido). Sintaxis borrable, imports relativos con .ts.

- **packages/shared/src/portions.ts** (nuevo, exportado también por packages/shared/src/index.ts)
  - `PORTIONS` = `['eighth', 'quarter', 'half', 'whole']` (`as const`), `type Portion`, `portionSchema` (z.enum).
  - `CUTS` = `['breast', 'leg']` (`as const`), `type Cut`, `cutSchema` (z.enum).
  - `PORTION_EIGHTHS` = `{ eighth: 1, quarter: 2, half: 4, whole: 8 }` (`as const`).
  - `SINGLE_CUT_PORTIONS` = `['eighth', 'quarter']` y `MIXED_PORTIONS` = `['half', 'whole']` (`as const`).
  - `interface ChickenConsumption { breastEighths: number; legEighths: number }` y `chickenConsumption(portion, cut)` según D-006-04 (lanza error en combinaciones inválidas).
  - `PRODUCT_PORTIONS_MAX` = 6.
  - `PORTION_CUT_MESSAGE` = 'La parte no corresponde a la presentación: eighth y quarter llevan breast o leg; half y whole no llevan parte.', `PORTIONS_DUPLICATED_MESSAGE` = 'Hay presentaciones repetidas en la lista.' y el mensaje del tope 'Un producto de pollo admite hasta 6 presentaciones.'.
  - `productPortionInputSchema` (estricto: portion, cut nullish, priceCents con priceCentsSchema de products.ts; .refine con PORTION_CUT_MESSAGE) y `type ProductPortionInput`.
  - `replaceProductPortionsRequestSchema` (estricto: `portions` arreglo de productPortionInputSchema con máximo PRODUCT_PORTIONS_MAX; .refine de repetidos con PORTIONS_DUPLICATED_MESSAGE) y `type ReplaceProductPortionsRequest`.
  - `productPortionSchema` (estricto: id y productId enteros positivos, portion, cut nullable, priceCents) y `type ProductPortion`.
  - `productPortionsResponseSchema` (estricto: `portions` con arreglo de productPortionSchema) y `type ProductPortionsResponse`.
- **packages/shared/src/errors.ts** (modificado): ERROR_CODES suma PORTIONS_NOT_ALLOWED y PRODUCT_HAS_PORTIONS.
- **backend/src/db/migrations/20261009120000-create-product-portions.ts** (nuevo): `up`/`down` según la sección 8.1 (tabla con sus CHECK, `UNIQUE NULLS NOT DISTINCT` y el índice `product_portions_product_id`); `down` borra la tabla.
- **backend/src/models/index.ts** (modificado): `interface ProductPortionAttributes { id: number; productId: number; portion: Portion; cut: Cut | null; priceCents: number; createdAt: Date; updatedAt: Date }`, `type ProductPortionModel`, `Models` suma `ProductPortion: ModelStatic<ProductPortionModel>`; `defineModels` lo define (`tableName: 'product_portions'`, `underscored`), la guardia `isDefined` contempla también 'ProductPortion' y se registran las asociaciones Product ↔ ProductPortion por `productId`.
- **backend/src/services/products/product-portion.service.ts** (nuevo):
  - `interface ProductPortionService { listProductPortions(productId: number): Promise<ProductPortion[]>; replaceProductPortions(productId: number, input: unknown): Promise<ProductPortion[]> }` — ambas verifican que el producto exista (PRODUCT_NOT_FOUND); `replaceProductPortions` parsea su entrada (ZodError), exige categoría 'chicken' (PORTIONS_NOT_ALLOWED) y ejecuta borrado + inserción dentro de una transacción (`models.ProductPortion.sequelize.transaction`, como hace user-admin.service con `models.User.sequelize`).
  - `createProductPortionService(deps: { models: Models }): ProductPortionService`.
  - `listProductPortions` devuelve las filas en el orden de D-006-11 con exactamente las cinco claves de ProductPortion.
  - Funciones de error exportadas: `createPortionsNotAllowedError()` y `createProductHasPortionsError()` (esta última la usa también product.service).
- **backend/src/services/products/product.service.ts** (modificado): `updateProduct` suma la guardia RN-006-03 — si `changes.category !== undefined`, `changes.category !== 'chicken'` y el producto tiene al menos una fila en product_portions, lanza `createProductHasPortionsError()` (409) sin tocar la fila. Nada más cambia (los demás campos se editan igual, con o sin presentaciones).
- **backend/src/controllers/product-portions.controller.ts** (nuevo): `createProductPortionsController({ productPortionService })` con handlers `list` y `replace`; parsea `productId` reutilizando la misma regla que products.controller (`^[0-9]+$`, 1..2147483647 → VALIDATION_ERROR con issue 'El identificador del producto no es válido.'; exportar el helper existente `parseProductIdParam` de products.controller.ts para no duplicarlo), parsea el cuerpo con `replaceProductPortionsRequestSchema` (ZodError al errorHandler) y responde 200.
- **backend/src/routes/products.routes.ts** (modificado): recibe también el controller de presentaciones; `router.get('/:productId/portions', requireAuth, portionsController.list)` y `router.put('/:productId/portions', requireAuth, requireRole('admin'), portionsController.replace)`. El middleware de `Cache-Control: no-store` ya cubre las nuevas rutas.
- **backend/src/routes/index.ts** y **backend/src/app.ts** (modificados): ApiRouterDependencies suma productPortionsController; app.ts crea `createProductPortionService({ models })` y su controller. NO_STORE_PATH_PREFIXES no cambia ('/api/products' ya cubre '/api/products/N/portions').
- **backend/tests/helpers/test-database.ts** (modificado por el test-writer): `resetMigrationTables` borra 'product_portions' antes que 'products'; `clearMenuTables` trunca 'product_portions' antes que 'products', cada una detrás de su `tableExists` (la fase roja no debe fallar en la limpieza).
- **frontend**: sin cambios (D-006-01).

Rutas sugeridas para pruebas: unitarias junto al código (`packages/shared/src/portions.test.ts`); integración en backend/tests/ (`product-portions-migration.test.ts`, `product-portions-service.test.ts`, `product-portions.test.ts`).

## 12. Cambios a specs y documentos anteriores (señalados)

Ningún cambio altera lo que ya ve el usuario ni toca código existente fuera de lo listado. El único cambio de comportamiento aprobado previamente es la guardia de categoría del PATCH /products (nuevo 409 PRODUCT_HAS_PORTIONS): es aditiva — solo aplica cuando el producto tiene presentaciones, que antes no existían— y señalada en la tabla.

| Elemento | Cambio | Quién |
| --- | --- | --- |
| 005, product.service.ts updateProduct | Nueva guardia: cambiar category a algo distinto de 'chicken' con presentaciones cargadas responde 409 PRODUCT_HAS_PORTIONS (RN-006-03). | backend-dev (T-07) |
| 005, products.controller.ts | Exportar `parseProductIdParam` para reusarlo en el controller de presentaciones. | backend-dev (T-08) |
| 005, products.routes.ts | Recibe el controller de presentaciones y monta las dos rutas nuevas. | backend-dev (T-08) |
| 003/004/005, helper resetMigrationTables (backend/tests/helpers/test-database.ts) | Borra también `product_portions`, antes que `products` (FK); `clearMenuTables` trunca ambas en ese orden. | test-writer (T-02) |
| 003, users-migrations.test.ts y 005, products-migration.test.ts | Las listas MIGRATIONS ganan '20261009120000-create-product-portions.ts' al final (mismo ajuste que hizo la 005 sobre la 003). | test-writer (T-02) |
| 005, D-005-12 / S-005-11 | Resueltos aquí: price_cents queda obligatorio y sin efecto de venta cuando el producto tiene presentaciones (D-006-05). | — (nota) |
| docs/api/openapi.yaml | Versión 0.5.0 → 0.6.0 con lo de 9.3. | spec-writer (esta spec) |
| PROGRESS.md | El orquestador actualiza al cerrar. | orquestador |

## 13. Dependencias

Ninguna dependencia nueva ni de soporte: se reutilizan Sequelize (modelos, UNIQUE NULLS NOT DISTINCT de PostgreSQL 17), Zod y requireAuth/requireRole. Sin variables de entorno nuevas (D-006-12). No hay ADR: las decisiones son de dominio y quedan registradas en esta spec.

## 14. Fuera de alcance

- Pantallas web: la grilla de administración es la spec 008 y la elección del mozo la Fase 2. Sin frontend-dev ni E2E.
- Pedidos: el ítem del pedido que copiará porción, parte, precio y octavos (RN-006-08) es Fase 2 (RF-04 a RF-07); aquí solo queda el dominio listo.
- Descuento de stock y agotados: Fase 5 (RF-20 a RF-24). La regla de dominio 3 (transacción con bloqueo) aplicará allá; esta spec no descuenta nada.
- La otra mitad de RF-19 ("qué bebida o insumo descuenta"): vincular productos a insumos/bebidas con stock es de la fase de inventario (Fase 5), no de esta spec.
- Combos (mostrito, pollo + chaufa): spec 007; un combo que consuma pollo usará estas mismas presentaciones/partes — decisión de esa spec.
- Distribución del medio distinta de 2+2 como fila de carta (por ejemplo "medio solo pierna" con precio propio): hoy se cargaría como otro producto 'chicken'; la elección real del cliente va en el ítem del pedido (RN-006-08). Pregunta 3.
- Stock por presentación ni alertas de "se acabó la pierna": Fase 5 (la carta del mozo mostrará disponibilidad cuando exista el stock).
- Auditoría de cambios de presentaciones y precios (RF-27, Fase 6).
- GET /api/products/{productId} de detalle y lista global de presentaciones de todos los productos (la consulta por producto basta: son 1-3 productos de pollo; si la Fase 2 necesita la carta completa con presentaciones en una sola llamada, se evalúa un GET /api/menu agregado allá).

## 15. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El dueño arma el 1/2 de otra forma (por ejemplo "siempre 3 pierna + 1 pecho" o precio distinto para "medio solo pierna") y el modelo no lo cubre. | La distribución real se copia al ítem del pedido en la Fase 2 (RN-006-08) y una variante con precio propio cabe como otro producto 'chicken'. Pregunta 3 al dueño. |
| El dueño no vende 1/8 (o sí, y con precio por parte). | El conjunto es por producto: no cargar octavos = no venderlos. Pregunta 1. |
| `price_cents` del producto con presentaciones queda como un precio "fantasma" que confunda al admin o a un programador futuro. | Documentado en D-006-05 y RN-006-06; la respuesta de productos no cambia y la Fase 2 usará solo el precio de la fila de presentación. |
| El reemplazo por PUT borra filas que algún reporte futuro quisiera consultar. | Los pedidos copian los valores (RN-006-08), así que el historial vive en los pedidos, no en la carta; y los cambios de carta auditarán en Fase 6 si el dueño lo pide. |
| Datos cargados por SQL que violen lo que el servicio garantiza (por ejemplo filas en un producto 'dish'). | CHECKs y unicidad en la base cubren forma y repetidos; la categoría solo la toca la API (admin). En la Fase 2 el mozo nunca verá filas de productos no 'chicken' porque no pueden crearse por la API. |

## 16. Supuestos

Confirmados por el usuario el 2026-10-09: S-006-01 a S-006-09, todos con la respuesta recomendada. Ya no son supuestos: son decisiones; se conservan abajo como registro.

| ID | Supuesto |
| --- | --- |
| S-006-01 | Las presentaciones son solo las cuatro fijas: eighth, quarter, half y whole; el dueño no crea otras. |
| S-006-02 | Las partes son solo breast (pecho) y leg (pierna); no hay ala ni otras como parte vendible. |
| S-006-03 | Solo los productos de categoría 'chicken' tienen presentaciones; las demás categorías no consumen octavos en esta spec (combos en la 007, insumos en Fase 5). |
| S-006-04 | `products.price_cents` queda obligatorio; cuando el producto tiene presentaciones, el precio de venta es el de la fila correspondiente y price_cents no se usa para cobrar. |
| S-006-05 | La configuración es un PUT que reemplaza el conjunto completo de una vez, atómico; las filas ausentes se borran (nada las referencia: los pedidos copiarán los valores). |
| S-006-06 | El medio consume por defecto 2 de pecho + 2 de pierna; si el cliente pide otra distribución, se registra en el ítem del pedido (Fase 2) con el mismo precio del medio. |
| S-006-07 | La 006 no incluye pantallas web: es dominio + API (la administración llega en la 008, la carta del mozo en la Fase 2; coincide con la división del orquestador). |
| S-006-08 | GET de presentaciones lo puede llamar cualquier rol con sesión; PUT solo admin. |
| S-006-09 | El precio de cada presentación sigue el rango 0..99999 céntimos (igual que los productos). |

## 17. Preguntas abiertas para el usuario

Respondidas el 2026-10-09, todas con la respuesta recomendada: 1 (el 1/8 queda disponible por producto; si no se vende, simplemente no se carga esa presentación), 2 (el modelo guarda precio por presentación y parte: pecho y pierna pueden tener precios iguales o distintos), 3 (el medio consume por defecto 2 de pecho + 2 de pierna; si el cliente pide otra distribución, el ítem del pedido registrará la real en la Fase 2 con el precio del medio, y una variante con precio propio se cargaría como otro producto de pollo), 4 (solo los productos de categoría 'chicken' llevan presentaciones), 5 (las presentaciones se guardan de una vez con un PUT atómico que reemplaza el conjunto) y 6 (un producto de pollo con presentaciones conserva su price_cents, pero el cobro usa el precio de la presentación elegida). Se conservan abajo como registro, cada una marcada como resuelta.

1. (dueño) ¿Vendes 1/8 de pollo? — Recomendación: el sistema lo permite por producto; si no lo vendes, simplemente no cargas esa presentación y listo (S-006-01 lo permite sin obligar). No bloquea la spec. **Resuelta el 2026-10-09: recomendación aceptada.**
2. (dueño) ¿El cuarto y el octavo de pecho cuestan distinto que los de pierna? — Recomendación: el modelo guarda precio por presentación y parte, así que pueden ser iguales o distintos; con confirmarlo basta (el modelo ya lo cubre). **Resuelta el 2026-10-09: recomendación aceptada.**
3. (dueño) ¿Cómo armas el 1/2? ¿Siempre 2 pecho + 2 pierna, o el cliente puede pedir otra distribución (por ejemplo solo pierna)? ¿Una distribución especial cuesta distinto? — Recomendación: por defecto 2+2 (regla 1); si el cliente elige, el pedido registrará la distribución real con el precio normal del medio (Fase 2); si "medio solo pierna" tuviera otro precio en tu carta, se cargaría como otro producto de pollo. Confírmame cuál aplica. **Resuelta el 2026-10-09: recomendación aceptada.**
4. (técnica) Confirmar que solo los productos de la categoría Pollo llevan presentaciones (los platos y combos que usan pollo se resuelven en la 007 y la Fase 5) — recomendado, S-006-03. ¿Está bien? **Resuelta el 2026-10-09: recomendación aceptada.**
5. (técnica) Confirmar el reemplazo de una vez con PUT (el admin guarda la grilla completa del producto en una operación atómica; lo que no esté en la lista se borra) — recomendado, S-006-05, en vez de crear/editar fila por fila. ¿Está bien? **Resuelta el 2026-10-09: recomendación aceptada.**
6. (técnica) Confirmar que un producto de pollo con presentaciones conserva su `price_cents` de la 005 pero el sistema cobra siempre el precio de la presentación elegida — recomendado, S-006-04; la alternativa (precio opcional) rompería el contrato ya aprobado. ¿Está bien? **Resuelta el 2026-10-09: recomendación aceptada.**

## 18. Acción del usuario y verificación manual

Acción en backend/.env: ninguna. Una migración nueva (product_portions); aplicarla con `pnpm db:migrate` sobre polleria_dev cuando la funcionalidad esté implementada.

Después de implementada (sin pantallas; verificación por API, desde PowerShell o una consola, con `pnpm dev` y la cookie `polleria_session` de un administrador):
1. `pnpm db:migrate`: debe decir 'Migración aplicada: 20261009120000-create-product-portions.ts'.
2. Crear un producto de pollo: `POST /api/products` con `{ "name": "Pollo a la brasa", "category": "chicken", "priceCents": 1850 }` → 201.
3. Cargarle presentaciones: `PUT /api/products/<id>/portions` con el cuerpo de 9.2 → 200 con las filas.
4. `GET /api/products/<id>/portions` con la cookie → la lista ordenada (octavo pecho, octavo pierna, cuarto pecho, cuarto pierna, medio, entero); sin la cookie → 401.
5. `PUT` con `{ "portions": [] }` → la lista queda vacía; volver a cargar y verificar que un medio con `"cut": "leg"` responde 400 con 'La parte no corresponde a la presentación...'.
6. `PUT` sobre un producto de otra categoría → 409 'Solo los productos de la categoría Pollo pueden tener presentaciones.'
7. Con presentaciones cargadas, `PATCH /api/products/<id>` con `{ "category": "dish" }` → 409 'Este producto tiene presentaciones de pollo; quítalas antes de cambiar su categoría.'; tras vaciar con `portions: []`, el mismo PATCH responde 200.
8. Con la sesión de un mozo, `PUT` → 'No tienes permiso para realizar esta acción.' y `GET` → 200.

## 19. Notas para specs siguientes (no son alcance de esta)

- 007 (combos): un combo que incluya pollo (mostrito, pollo + chaufa) necesita consumo en octavos igual que un producto 'chicken'; evaluar si los componentes referencian products + portion/cut o reutilizan product_portions. Decidir también la categoría 'combo' (pendiente de la 005).
- 008 (pantallas de administración): la grilla de un producto 'chicken' consume GET/PUT `/api/products/{id}/portions`; etiquetas octavo/cuarto/medio/entero y pecho/pierna; formatear priceCents a soles; recordar que `id` de fila no es estable entre PUTs.
- Fase 2 (mozo y pedidos): al agregar un ítem de un producto 'chicken' con presentaciones, el mozo elige portion (y cut en eighth/quarter); el ítem copia portion, cut, priceCents y los octavos resueltos — con override de distribución para el medio (RN-006-08); orderItem necesitará columnas propias (portion, cut, breastEighths, legEighths, unitPriceCents).
- Fase 5 (inventario): los pollos asados del día entran como stock de octavos por parte (`chickenConsumption('whole', null)` = 4+4 por pollo); el descuento usa los octavos copiados en cada ítem con la regla 3 (transacción FOR UPDATE, stock nunca negativo); "la carta muestra pecho/pierna disponible" (RF-22) calculará contra ese stock.
- Fase 6: auditoría de cambios de carta y precios (RF-27).
