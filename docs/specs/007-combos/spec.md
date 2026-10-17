# Spec 007 — Combos (productos compuestos con precio propio)

- Estado: Aprobada (2026-10-09, por el usuario, con las respuestas recomendadas a las preguntas 1 a 10)
- Fase: 1 (Usuarios y carta)
- Rama: feat/007-combos
- Fecha: 2026-10-09
- Cubre: la parte de combos de RF-18 (el administrador crea y edita combos, y los activa o desactiva) y completa la parte de RF-19 que faltaba: un combo que lleva pollo define cuánto pollo consume y de qué parte, igual que las presentaciones de la 006. La parte "qué bebida o insumo descuenta" sigue para la fase de inventario (Fase 5, RF-20 a RF-23). También cubre RNF-12 (combos y precios configurables desde el sistema, sin tocar código).
- Documentos relacionados: tasks.md (esta carpeta), docs/planificacion.md (RF-18, RF-19, tabla de presentaciones que lista combos y el mostrito, preguntas para el dueño), docs/specs/005-menu-products/spec.md (productos y categorías fijas; dejó pendiente en S-005-10 que 'combo' no era categoría todavía), docs/specs/006-portions-eighths/spec.md (presentaciones, partes y consumo en octavos; su nota §19 pedía que la 007 decidiera el modelado), docs/specs/003-users-pin-login/spec.md (sesión, requireAuth/requireRole), docs/api/openapi.yaml (versión 0.6.0 → 0.7.0) y CLAUDE.md (reglas de dominio 1, 2 y 4; glosario: combo = combo).

## 1. Contexto

La carta ya tiene productos sueltos (005) y el pollo sabe sus presentaciones y partes con su consumo en octavos (006). Pero la pollería vende combinaciones cerradas: el "mostrito" (porción de pollo + chaufa + papas), "pollo + gaseosa", el combo familiar. Hoy un combo no cabe en el modelo: no es una presentación del pollo ni un plato suelto, y su precio no es la suma mecánica de sus partes — el dueño lo fija como promoción. Esta spec crea la categoría 'combo' y la tabla de componentes: el combo se vende como un producto más de la carta a su propio precio, y cada componente que es pollo declara su presentación y parte para que el consumo en octavos se derive igual que en la 006. Sin pedidos (Fase 2) ni descuento de stock (Fase 5): queda el dominio y la API listos; las pantallas de administración llegan en la 008 y la venta en la Fase 2.

## 2. Historias de usuario

| ID | Historia |
| --- | --- |
| HU-007-01 | Como administrador (dueño), quiero crear un combo como un producto más de la carta con su nombre y su precio propio (por ejemplo "Mostrito" a S/ 22.00), para que el mozo lo venda como cualquier otro producto. |
| HU-007-02 | Como administrador, quiero armar el combo indicando sus componentes y cuántas unidades lleva de cada uno (1 cuarto de pollo pierna + 1 chaufa + 1 gaseosa), para que la carta refleje lo que realmente sirvo. |
| HU-007-03 | Como administrador, quiero indicar qué presentación y parte del pollo lleva el combo (cuarto pecho, medio, etc.), para que el descuento de stock de la Fase 5 sepa los octavos exactos que consume. |
| HU-007-04 | Como administrador, quiero cambiar los componentes de un combo guardando la lista completa de una vez (quitar la gaseosa, cambiar el cuarto por un octavo), sin crear otro producto. |
| HU-007-05 | Como mozo (y también cajero o cocina), quiero consultar qué lleva cada combo con mi sesión, para responderle al cliente "el mostrito trae cuarto de pollo, chaufa y gaseosa". |
| HU-007-06 | Como sistema (Fase 5), quiero que los componentes de pollo de un combo consuman sus octavos por parte, para descontar el stock exacto igual que una venta suelta. |
| HU-007-07 | Como administrador, quiero que el sistema no me deje meter un combo dentro de otro ni un pollo sin presentación dentro de un combo, para que la carta nunca quede en un estado imposible. |

## 3. Decisiones técnicas

Todas fueron confirmadas por el usuario el 2026-10-09 con la respuesta recomendada (sección 17); las que partieron como supuesto conservan la marca SUPUESTO con su ID S-007-xx como registro.

**D-007-01. Alcance: solo dominio + API, sin pantallas (SUPUESTO S-007-08).**
- Igual que la 005 y la 006: esta spec deja listo el modelo, los esquemas compartidos, la función de consumo, el servicio y las rutas. Las pantallas de administración son la spec 008 y la venta del combo por el mozo la Fase 2. No hay tareas de frontend-dev ni pruebas E2E.
- Consecuencia: ningún archivo de frontend cambia.

**D-007-02. Un combo es un producto de la categoría nueva 'combo' (resuelve S-005-10; SUPUESTO S-007-01 y S-007-11).**
- `PRODUCT_CATEGORIES` pasa a `['chicken', 'combo', 'dish', 'drink', 'dessert', 'sauce', 'extra']`: 'combo' entra en segundo lugar, después del Pollo — en las cartas de pollería los combos y promociones van junto al pollo, y coincide con el orden de la tabla de presentaciones de docs/planificacion.md (pollo, combos, otros platos). Etiqueta que pondrá la web: Combos. Cambio aditivo del enum: las demás categorías conservan su orden relativo.
- La base lo garantiza ampliando el CHECK `products_category_allowed` con una migración, como anticipó la propia migración de la 005 y S-005-10 ("la 007 decide si los combos son productos con esa categoría o una entidad aparte").
- Por qué un producto y no una tabla `combos` aparte: el combo se vende igual que cualquier producto — tiene nombre único sin mayúsculas, `price_cents`, `is_active`, se desactiva sin borrarse, aparece en GET /api/products en el orden de la carta y la Fase 2 lo referencia desde el ítem del pedido sin un tipo especial (los componentes se copian al ítem igual que el precio, RN-007-11). Una tabla aparte duplicaría nombre, precio, estado y orden, y obligaría al pedido a manejar dos orígenes de ítems. Una columna JSON en products se descarta igual: sin integridad referencial ni restricciones reales (D-003-14).
- El combo siempre cobra `products.price_cents` (D-007-05), tenga o no componentes cargados (D-007-12); los componentes no llevan precio propio dentro del combo.

**D-007-03. Los componentes son filas de una tabla `combo_items` (SUPUESTO S-007-02).**
- Cada fila dice: "este combo lleva `quantity` unidades de este producto (con esta presentación y parte, si el producto es pollo)". Columnas: `id`, `combo_id` (FK a products), `product_id` (FK a products — el componente), `quantity`, `portion` (NULL en componentes que no son pollo), `cut` (NULL salvo eighth/quarter), `created_at`, `updated_at` (sección 8.1).
- Por qué `product_id` referencia el producto componente y no texto libre: el componente ya existe en la carta con su nombre, categoría, precio y estado — el combo reutiliza esa verdad (el mostrito lleva el "Chaufa" que ya se vende suelto) y el GET puede devolver sus datos actuales (D-007-09). Componentes nuevos se crean primero como productos (005) y luego se agregan al combo.
- Sin `price_cents` ni `is_active` en la fila: el precio es solo del combo (D-007-05) y una fila existe = es componente (el PUT la reemplaza borrando e insertando, D-007-06); nada la referencia todavía (los pedidos copiarán los valores, RN-007-11), así que el `id` tampoco es estable entre PUTs.
- Unicidad `UNIQUE NULLS NOT DISTINCT (combo_id, product_id, portion, cut)`: el mismo producto puede entrar dos veces con distinta presentación ("dúo": un cuarto pecho + un cuarto pierna del mismo pollo) pero no dos veces con la misma (portion, cut); para componentes sin presentación, una sola fila por producto (las unidades van en `quantity`, no en filas repetidas).
- Un combo dentro de otro queda prohibido (RN-007-04): sin anidar = sin ciclos y sin ambigüedad de consumo. Lo garantiza el servicio (la base no puede ver la categoría del producto referenciado desde un CHECK); la auto-referencia (combo_id = product_id) queda cubierta por la misma regla porque el producto combo es 'combo'.

**D-007-04. El componente de pollo declara su presentación y parte en la propia fila (SUPUESTO S-007-05).**
- Cuando el producto componente es de categoría 'chicken', `portion` es obligatoria y `cut` sigue la regla de la 006 (breast/leg en eighth y quarter; null en half y whole). Cuando el componente NO es 'chicken', `portion` y `cut` deben ser null — igual que half/whole no llevan parte, un chaufa o una gaseosa no se mide en octavos.
- Por qué declarar (portion, cut) en la fila y no referenciar `product_portions.id`: los ids de product_portions no son estables entre PUTs (D-006-06) y la presentación dentro del combo es información de consumo, no una oferta de venta suelta. Además la porción del combo es independiente de lo que el producto venda por separado: "Pollo a la brasa" puede vender solo cuartos y enteros sueltos y aun así entrar al mostrito como un octavo — al combo no le importa el precio de la fila de presentación porque cobra su propio `price_cents`.
- Consecuencia: el consumo del componente se deriva con la misma función de la 006 — `quantity × chickenConsumption(portion, cut)` — sin guardar octavos (D-007-13).

**D-007-05. El precio del combo es fijo en `products.price_cents` (SUPUESTO S-007-03).**
- El dueño pone el precio del mostrito a mano, igual que el de cualquier producto, y lo edita con el PATCH /api/products/{productId} ya existente (RNF-12). La promoción es implícita: la diferencia entre el precio del combo y la suma de sus componentes.
- Se descarta "suma de componentes con descuento": el precio cambiaría solo al tocar un componente (un aumento de la gaseosa subiría todos los combos sin que el dueño lo decidiera), exigiría guardar el descuento y resolver conflictos con el precio copiado al pedido (regla 4), y no es como el dueño arma promociones en una pollería chica — el mostrito sale a un precio redondo pensado para vender.
- Para que el administrador vea la comparación, el GET de componentes incluye el `priceCents` vigente de cada producto (D-007-09): la pantalla de la 008 podrá mostrar "los componentes suman S/ X y el combo cuesta S/ Y". Es solo referencia; el cobro usa siempre `price_cents` del combo.
- Un componente que cambia de precio no altera el combo ni los pedidos: regla 4 declarada en RN-007-11.

**D-007-06. Los componentes se configuran de una vez con PUT (reemplazo atómico con la serialización aprendida en la 006; SUPUESTO S-007-06).**
- `PUT /api/products/{productId}/items` recibe el conjunto completo `{ items: [...] }` y lo deja exactamente así, todo o nada: dentro de una transacción se bloquean los productos referenciados (FOR NO KEY UPDATE, en orden de id), se validan las reglas de componente, se borran las filas anteriores del combo, se insertan las nuevas y se bloquea la fila del producto combo para re-verificar su categoría. Si algo falla, el conjunto anterior queda intacto.
- Es el mismo patrón que dejó la corrección adversarial de la 006 (los 3 hallazgos altos: unión de PUTs concurrentes, 500 por doble confirmación y el TOCTOU PUT↔PATCH de categoría), aplicado desde el diseño en vez de descubrirlo en la auditoría:
  - Borrado + inserción dentro de la transacción; `ON CONFLICT DO UPDATE` sobre la unicidad para que dos PUTs que confirman la misma clave no se rompan (el último gana).
  - Lock FOR NO KEY UPDATE de la fila del combo DESPUÉS de insertar (no FOR UPDATE: la FK hacia products deja FOR KEY SHARE y FOR UPDATE chocaría en deadlock) y re-verificación `category = 'combo'` con el estado ya confirmado.
  - Borrado final de filas que un PUT concurrente haya confirmado en el hueco ("gana el último en confirmar").
  - Locks FOR NO KEY UPDATE de los productos componentes en orden ascendente de id, ANTES de insertar: serializa contra un PATCH que cambie la categoría de un componente — si el PATCH confirmó primero, el lock espera y el re-leído ve la categoría nueva (el PUT rechaza); si el PUT bloqueó primero, el UPDATE del PATCH espera al commit y su re-verificación posterior ve las filas nuevas (el PATCH se revierte, D-007-07). El orden ascendente evita deadlocks entre PUTs con componentes compartidos.
- `items: []` es válido y deja el combo sin componentes (vuelve a comportarse como ítem simple, D-007-12); además es la vía para poder cambiarle la categoría después (D-007-07).
- Tope de 10 componentes por combo (`COMBO_ITEMS_MAX`): un combo real lleva 2 a 6 (pollo + chaufa + papas + gaseosa + cremas); el tope corta errores sin quitar flexibilidad (SUPUESTO S-007-10).
- Cantidad por componente `quantity`: entero entre 1 y 99. Para el pollo multiplica los octavos de la presentación (2 cuartos pierna = 4 octavos de pierna; un entero ×2 = 16 octavos — un combo familiar con dos pollos es válido).

**D-007-07. Guardias de categoría en PATCH /api/products/{productId} (simétricas a la 006; cambio señalado en la sección 12).**
- Salir de 'combo' con componentes: `changes.category` distinta de 'combo' mientras el producto tiene filas en combo_items responde 409 PRODUCT_HAS_ITEMS y no cambia nada — paralelo a PRODUCT_HAS_PORTIONS de la 006. El orden correcto es: PUT con `items: []` y luego el PATCH de categoría.
- Cambiar de categoría un producto referenciado como componente: `changes.category` distinta de la categoría actual mientras el producto aparece como `product_id` de algún combo_items responde 409 PRODUCT_IS_COMPONENT y no cambia nada. Cubre los dos huecos reales de invariante: volver 'combo' un componente (anidado, RN-007-04) y sacar de 'chicken' un componente que tiene `portion` declarada (RN-007-05). Es más simple y segura que bloquear solo esos dos destinos: el flujo correcto es quitar el producto del combo y recién cambiarle la categoría.
- La guardia de la 006 sigue igual: pasar de 'chicken' a 'combo' (u otra) con presentaciones cargadas responde PRODUCT_HAS_PORTIONS, así ningún producto junta presentaciones y componentes — son incompatibles por categoría, no por regla extra.
- Las tres guardias se re-verifican DESPUÉS del UPDATE con reversión a los valores originales si una fila apareció en el hueco (mismo patrón que la corrección de la 006 en updateProduct). PATCH de name/priceCents/isActive y PATCH sin cambio real de categoría siempre se permiten.

**D-007-08. Quién gestiona y quién lee (SUPUESTO S-007-07).**
- Escritura: PUT /api/products/{productId}/items exige `requireAuth` + `requireRole('admin')` (401 sin sesión, 403 con cualquier combinación de roles sin admin), igual que POST/PATCH /products y PUT .../portions.
- Lectura: GET /api/products/{productId}/items exige `requireAuth` y nada más; responde 404 PRODUCT_NOT_FOUND si el producto no existe y 200 con `{ items: [] }` si no tiene componentes (incluido un producto de otra categoría, que nunca tendrá).
- Cache-Control: las rutas cuelgan de `/api/products/`, así que el prefijo '/api/products' de NO_STORE_PATH_PREFIXES ya las cubre, incluidos los errores del lector del cuerpo; el router las fija además, idempotente. app.ts no cambia esa lista.

**D-007-09. Qué devuelve el GET (SUPUESTO S-007-02).**
- Cada ítem: `{ id, comboId, product, quantity, portion, cut }`, donde `product` es el componente con sus cinco claves de la 005 (id, name, category, priceCents, isActive) leídas al momento — así el GET muestra el nombre y el precio actuales, y si el componente está desactivado se ve con `isActive: false`.
- Orden: por categoría del componente en el orden de PRODUCT_CATEGORIES (el pollo primero, igual que en la carta), luego por nombre en español sin distinguir mayúsculas ni tildes (mismo `Intl.Collator('es', { sensitivity: 'base' })` de listProducts) y empates por `id` del ítem.
- El consumo en octavos no viene en la respuesta: se deriva con `comboChickenConsumption` de @polleria/shared (D-007-13), igual que la 006 no devuelve octavos.

**D-007-10. Componentes válidos y errores por ítem (SUPUESTO S-007-04).**
- Un componente puede ser cualquier producto existente que no sea categoría 'combo': platos, bebidas, postres, cremas, extras y productos de pollo (con su presentación y parte). No exige que el componente esté activo: el dueño puede armar el combo alrededor de un producto aún desactivado o que dejó de venderse por un tiempo; el GET lo muestra con `isActive: false` y la decisión de si el combo se puede vender en ese estado queda para la Fase 2 (pregunta 7).
- Las reglas de componente se validan por ítem y se acumulan en `details.issues` de un solo 400 VALIDATION_ERROR, en el orden de la lista, para que la pantalla de la 008 muestre todos los problemas de una vez:

| path | message | Cuándo |
| --- | --- | --- |
| items.N.productId | Ese producto no existe. | El `productId` referenciado no está en products (las demás reglas del ítem se omiten). |
| items.N.productId | Un combo no puede ser componente de otro combo. | El producto referenciado es categoría 'combo' (incluye la auto-referencia). |
| items.N.portion | El pollo de un combo lleva presentación (eighth, quarter, half o whole). | El componente es 'chicken' y no trae `portion`. |
| items.N.portion | Solo un componente de pollo lleva presentación y parte. | El componente no es 'chicken' y trae `portion` o `cut`. |

- Nótese la diferencia de código según dónde está el problema: el producto de la RUTA que no es 'combo' es un conflicto de estado → 409 COMBO_ITEMS_NOT_ALLOWED; los componentes del CUERPO que no cumplen son datos inválidos → 400 VALIDATION_ERROR con issues.

**D-007-11. Errores (formato común).**

| code | HTTP | message | details | Cuándo |
| --- | --- | --- | --- | --- |
| VALIDATION_ERROR | 400 | Los datos enviados no son válidos. | `{ issues }` | Cuerpo inválido (productId o quantity fuera de rango o con decimales, presentación o parte fuera de lista, parte que no corresponde a la presentación, parte sin presentación, repetidos, más de 10 filas, propiedad de más), los issues de componentes de D-007-10, o `productId` de la ruta inválido (issue en `productId`: 'El identificador del producto no es válido.'). |
| PRODUCT_NOT_FOUND | 404 | Ese producto no existe. | null | GET o PUT sobre un `productId` que no existe. |
| COMBO_ITEMS_NOT_ALLOWED | 409 | Solo los productos de la categoría Combos pueden tener componentes. | null | PUT sobre un producto cuya categoría no es 'combo'. |
| PRODUCT_HAS_ITEMS | 409 | Este producto es un combo con componentes; quita sus componentes antes de cambiar su categoría. | null | PATCH /products/{productId} que cambia `category` a algo distinto de 'combo' mientras el producto tiene componentes. |
| PRODUCT_IS_COMPONENT | 409 | Este producto es componente de un combo; quítalo del combo antes de cambiar su categoría. | null | PATCH /products/{productId} que cambia `category` a algo distinto de la actual mientras el producto es componente de algún combo. |

- Los tres códigos nuevos se suman a ERROR_CODES de @polleria/shared. Ningún 4xx se registra en el log (RN-001-07). `productId` se valida con la misma regla de la 005 (`^[0-9]+$`, 1..2147483647).

**D-007-12. Un combo sin componentes se vende como ítem simple (SUPUESTO S-007-09).**
- Paralelo a RN-006-06: un producto 'combo' sin filas en combo_items se vende a su `price_cents` como cualquier producto — es el estado natural mientras el admin lo arma, y evita que un combo a medio configurar rompa la venta. Con componentes cargados el precio sigue siendo `price_cents` (D-007-05): la diferencia es que la Fase 2 copiará además la lista de componentes al ítem del pedido (RN-007-11).

**D-007-13. El consumo en octavos se deriva con una función pura; no se guarda.**
- `comboChickenConsumption(items)` en packages/shared suma, por cada ítem con `portion` no nula, `quantity × chickenConsumption(portion, cut)` y devuelve `{ breastEighths, legEighths }`. Los ítems con `portion` null aportan 0 (no son pollo: su consumo es por unidades o insumos, Fase 5). Lanza error si un ítem con `portion` trae una parte que no corresponde o si trae `cut` sin `portion` (defensa ante datos que el servicio ya impide).
- El invariante "portion no nula ⟺ componente de pollo" lo garantiza el servicio en la escritura (D-007-10); la función confía en él igual que `chickenConsumption` confía en la correspondencia presentación-parte.
- Por qué derivar y no guardar `breast_eighths`/`leg_eighths`: misma razón que D-006-04 — lo derivado nunca queda inconsistente con (portion, cut). En la Fase 2 el ítem del pedido copiará los octavos resueltos (RN-007-11).

**D-007-14. Migración y limpieza de pruebas.**
- Una migración nueva `20261009180000-create-combo-items.ts` (umzug): `up` crea combo_items con sus CHECK, la unicidad y los índices, y reemplaza el CHECK `products_category_allowed` para incluir 'combo' (drop + add en la misma transacción); `down` borra combo_items y restaura el CHECK a la lista sin 'combo' (si quedaran productos 'combo' el down falla: revertir es solo para desarrollo, como el resto).
- Consecuencia para las pruebas (sección 12): `resetMigrationTables` borra `combo_items` ANTES que `products` (hay FK), `clearMenuTables` trunca `combo_items` junto a `product_portions` y `products` en un solo TRUNCATE (cada una detrás de su `tableExists`), y las listas MIGRATIONS de `users-migrations.test.ts` (que además gana un paso en el down encadenado), `products-migration.test.ts` y `product-portions-migration.test.ts` reciben el nombre nuevo al final. La tabla `combo_items` queda autorizada para limpieza de pruebas igual que `products` y `product_portions` (solo polleria_test, con la doble verificación).

**D-007-15. Sin variables de entorno, sin dependencias nuevas, sin ADR.**
- Nada se configura por .env: CONFIG_VARIABLES y backend/.env.example no cambian. Sin paquetes nuevos.
- No hay ADR: el modelado del combo es una decisión de dominio documentada en esta spec (producto + tabla de componentes + consumo derivado), no un cambio de arquitectura ni una dependencia — mismo criterio que D-006-12. Si el usuario lo prefiere, se redacta un ADR corto del modelado; no lo considero necesario.

## 4. Criterios de aceptación (AC)

Todos ejecutables con `pnpm test` en esta rama (cubre los tests de packages/shared y de backend, cada uno contra su base aislada). Casos felices y errores con el formato común `{ error: { code, message, details } }`, cuerpos exactos.

### 4.1 Esquemas y tipos compartidos (Zod, packages/shared/src/combos.ts + ajuste en products.ts y errors.ts)

**AC-01 (la categoría 'combo' se suma a PRODUCT_CATEGORIES).** Dado el enum de la 005, cuando se ejecuta el dominio compartido, entonces:

- `PRODUCT_CATEGORIES` es exactamente `['chicken', 'combo', 'dish', 'drink', 'dessert', 'sauce', 'extra']` en ese orden — 'combo' en segundo lugar, después del pollo (D-007-02).
- `productCategorySchema` (y por tanto `createProductRequestSchema` y `updateProductRequestSchema`) acepta `combo` devolviendo el mismo valor, y sigue rechazando `combos`, `COMBO`, `Combo`, `comida` y `null`.

**AC-02 (comboItemInputSchema: la forma de una fila de componente).** Dado `comboItemInputSchema` — `.strict()` porque una propiedad de más es error de quien llama — con estas reglas:

- `productId`: entero entre 1 y 2147483647 (`'El identificador del producto no es válido.'`).
- `quantity`: entero entre 1 y 99 (`'Indica cuántas unidades lleva este componente.'`).
- `portion`: una de PORTIONS u omitida/null; `cut`: una de CUTS u omitida/null; se normalizan a `null` (undefined queda como null).
- Refinamientos por ítem: `portion` que exige parte sin `cut`, o `half`/`whole` con `cut` → error en `cut` con PORTION_CUT_MESSAGE; `cut` presente sin `portion` → error en `cut` con `'Sin presentación no se puede indicar la parte.'`.

Cuando se valida `{ productId: 8, quantity: 1 }` entonces es válido con `portion` y `cut` en `null`; `{ productId: 5, quantity: 1, portion: 'quarter', cut: 'leg' }` es válido; `{ productId: 5, quantity: 1, portion: 'quarter' }` falla en `cut` con PORTION_CUT_MESSAGE; `{ productId: 8, quantity: 0 }`, `{ productId: 8, quantity: 1.5 }`, `{ productId: 0, quantity: 1 }`, `{ productId: 8, quantity: 1, cut: 'leg' }` y `{ productId: 8, quantity: 1, extra: 'x' }` fallan con sus issues.

**AC-03 (replaceComboItemsRequestSchema: el cuerpo del PUT).** Dado el esquema raíz estricto `z.strictObject({ items: z.array(comboItemInputSchema).max(COMBO_ITEMS_MAX) })` con `COMBO_ITEMS_MAX = 10` y el refino `comboItemsUniqueRefinement`, cuando se valida, entonces:

- `{ items: [] }` es válido (un combo puede quedar sin componentes); 10 filas distintas es válido; 11 filas falla con issue en `items` y `'Un combo admite hasta 10 componentes.'`.
- Dos filas con el mismo `productId`, `portion` y `cut` (aunque vengan separadas y aunque `portion`/`cut` vengan omitidos) fallan con `'Hay componentes repetidos en la lista.'` en `items.1` (el índice de la segunda aparición); el mismo `productId` con `(quarter, breast)` y luego `(quarter, leg)` es válido.
- `{ items: 'x' }`, `{ items: [{}] }` y `{ items: [], extra: 1 }` fallan con sus issues; la lista inválida nunca se guarda parcialmente.

**AC-04 (comboItemSchema y comboItemsResponseSchema: la respuesta; códigos nuevos).** Dado `comboItemSchema` — estricto, `id` y `comboId` enteros positivos, `product` como `productSchema` estricto, `quantity` entero 1..99, `portion` y `cut` nullables — y `comboItemsResponseSchema` como `{ items: comboItemSchema[] }`, cuando se verifica, entonces:

- `{ id: 1, comboId: 9, product: { id: 5, name: 'Pollo a la brasa', category: 'chicken', priceCents: 1850, isActive: true }, quantity: 1, portion: 'quarter', cut: 'leg' }` es válido; un `product` con una clave de más, un ítem sin `comboId` o con `portion` fuera de lista fallan.
- `ERROR_CODES` suma `'COMBO_ITEMS_NOT_ALLOWED'`, `'PRODUCT_HAS_ITEMS'` y `'PRODUCT_IS_COMPONENT'`; `errorResponseSchema` acepta `{ code: 'PRODUCT_HAS_ITEMS', message: 'Este producto es un combo con componentes; quita sus componentes antes de cambiar su categoría.', details: null }` y rechaza `code: 'COMBO_HAS_COMPONENTS'`.

**AC-05 (comboChickenConsumption: consumo derivado en octavos).** Dado `comboChickenConsumption(items)` sobre la forma `{ quantity, portion, cut }` de los ítems (acepta cualquier iterable), cuando se calcula, entonces:

- `[]` devuelve `{ breastEighths: 0, legEighths: 0 }`; un ítem sin `portion` (un chaufa) aporta 0 aunque `quantity` sea 99.
- `[{ quantity: 1, portion: 'quarter', cut: 'leg' }]` devuelve `{ breastEighths: 0, legEighths: 2 }`; `[{ quantity: 2, portion: 'quarter', cut: 'leg' }, { quantity: 1, portion: 'eighth', cut: 'breast' }, { quantity: 1, portion: null, cut: null }]` devuelve `{ breastEighths: 1, legEighths: 4 }` (el mostrito ×2 de pierna + un octavo de pecho + el chaufa).
- `[{ quantity: 1, portion: 'half', cut: null }]` devuelve `{ breastEighths: 2, legEighths: 2 }`; un ítem con `portion: 'quarter'` y `cut: null`, o `portion` nula con `cut` presente, lanza error (la combinación inválida la delega a `chickenConsumption`, que falla).

### 4.2 Tabla y migración (backend contra la base de pruebas)

**AC-06 (combo_items existe con sus restricciones).** Dada la base de pruebas con todas las migraciones al día, cuando se inspecciona e inserta, entonces:

- Columnas: `id` entero autoincremental PK; `combo_id` entero NOT NULL FK a `products.id`; `product_id` entero NOT NULL FK a `products.id`; `quantity` entero NOT NULL; `portion` varchar(8) NULL; `cut` varchar(8) NULL; `created_at`/`updated_at` timestamptz NOT NULL.
- `quantity` de 0, de −1 y de 100 fallan por `combo_items_quantity_range`; `portion: 'octavo'` falla por `combo_items_portion_allowed`; `cut: 'pecho'` falla por `combo_items_portion_cut` o `combo_items_cut_allowed` (la parte va en inglés).
- Correspondencia por `combo_items_portion_cut`: `(portion NULL, cut 'leg')`, `(portion 'quarter', cut NULL)` y `(portion 'half', cut 'breast')` fallan; `(portion 'quarter', cut 'leg')` y `(portion NULL, cut NULL)` pasan.
- FKs: `combo_id` o `product_id` apuntando a un producto inexistente fallan; apuntar a productos existentes pasa.
- `combo_items_unique` (NULLS NOT DISTINCT sobre `combo_id, product_id, portion, cut`): dos filas del mismo `(product_id, portion NULL, cut NULL)` fallan; el mismo producto con `(quarter, breast)` y luego `(quarter, leg)` pasa; `(quarter, breast)` repetido falla.
- Índices `combo_items_combo_id` y `combo_items_product_id` existen.
- `INSERT ... category 'combo'` en products pasa (el CHECK quedó ampliado); `'combos'` y `'COMBO'` siguen fallando por `products_category_allowed`.

**AC-07 (migración aplicable y revertible).** Dado el archivo `20261009180000-create-combo-items.ts` al final de MIGRATIONS (posición 5, tras product_portions), cuando:

- `migrateUp` lo ejecuta, entonces crea la tabla con todas las restricciones del AC-06 y deja `products_category_allowed` aceptando `'combo'`.
- `migrateDown` lo revierte, entonces la tabla deja de existir, `products_category_allowed` vuelve a rechazar `'combo'` (y sigue aceptando `'dish'`), y un `migrateUp` posterior la recrea sin errores — el down encadenado de `users-migrations` gana este paso nuevo antes de revertir product_portions.

### 4.3 Servicios (backend contra la base de pruebas)

**AC-08 (listComboItems: consulta con datos actuales del componente).** Dado un combo 'Mostrito' (category 'combo', priceCents 2200) con `replaceComboItems` de `[{ productId: <chaufa>, quantity: 1 }, { productId: <pollo>, quantity: 1, portion: 'quarter', cut: 'leg' }, { productId: <gaseosa>, quantity: 2 }]`, cuando:

- `listComboItems(mostrito.id)`, entonces devuelve 3 ítems con exactamente las claves `id, comboId, product, quantity, portion, cut`; el de pollo primero en la lista ('chicken' va antes que 'dish' y 'drink' en la carta), cada `product` con exactamente `id, name, category, priceCents, isActive` y sus valores actuales, el `portion/cut` del pollo (`'quarter'`, `'leg'`) y `null/null` en los demás.
- `listComboItems` de un producto 'dish' sin componentes, o de un 'combo' recién creado, devuelve `[]`.
- `listComboItems(999999)` lanza AppError PRODUCT_NOT_FOUND.
- `listProducts()` con productos 'Pollo' (chicken), 'Mostrito' (combo) y 'Chaufa' (dish) los devuelve en ese orden de carta ('combo' detrás de 'chicken', delante de 'dish').

**AC-09 (replaceComboItems: reemplazo atómico con reglas de componente).** Dados productos 'Pollo a la brasa' (chicken, con cuartos e enteros cargados en presentaciones), 'Chaufa' (dish), 'Inca Kola' (drink) y 'Mostrito' (combo), cuando:

- `replaceComboItems(mostrito.id, { items: [{ productId: pollo, quantity: 1, portion: 'quarter', cut: 'leg' }, { productId: chaufa, quantity: 1 }, { productId: inca, quantity: 1 }] })` → devuelve los 3 ítems ordenados y el GET posterior los muestra iguales.
- El mismo PUT una segunda vez deja 3 filas en la tabla (no 6): idempotencia por reemplazo.
- `{ items: [] }` deja el combo sin componentes y el GET devuelve `{ items: [] }`.
- `replaceComboItems(chaufa.id, ...)`, `replaceComboItems(inca.id, ...)` y `replaceComboItems(pollo.id, ...)` lanzan COMBO_ITEMS_NOT_ALLOWED sin tocar nada — solo los 'combo' tienen componentes.
- `replaceComboItems(999999, ...)` lanza PRODUCT_NOT_FOUND.
- Componentes inválidos (un solo AppError VALIDATION_ERROR con los issues de D-007-10 en el orden de la lista, sin guardar nada): `productId` inexistente → 'Ese producto no existe.'; `productId` de un 'combo' (incluido el propio) → 'Un combo no puede ser componente de otro combo.'; chicken sin `portion` → 'El pollo de un combo lleva presentación (eighth, quarter, half o whole).'; 'dish' con `portion` o `cut` → 'Solo un componente de pollo lleva presentación y parte.'.
- La porción del componente NO exige que el producto la venda suelto: un 'Pollo a la brasa' con solo `{ quarter, leg }` en product_portions acepta `portion: 'eighth', cut: 'breast'` como componente (D-007-04).
- Un componente inactivo o una cantidad > 1 (entero 1..99) se aceptan; la forma inválida (lista > 10, repetidos, `quantity: 0`) lanza ZodError antes de cualquier consulta de negocio.

**AC-10 (guardias de categoría en updateProduct).** Dado el combo 'Mostrito' con componentes y el 'Chaufa' referenciado como componente, cuando:

- `updateProduct(mostrito.id, { category: 'dish' })` → PRODUCT_HAS_ITEMS y nada cambia; lo mismo `{ name: 'X', category: 'dish' }` (la guardia va sobre el intento, no sobre si también trae otros campos). `updateProduct(mostrito.id, { priceCents: 2400 })` sí actualiza (el precio del combo se edita como el de cualquier producto). Tras `items: []`, el mismo PATCH de categoría ya pasa.
- `updateProduct(chaufa.id, { category: 'extra' })` → PRODUCT_IS_COMPONENT y nada cambia; `updateProduct(chaufa.id, { category: 'dish' })` (misma categoría) y `{ name: 'Chaufa amazónico' }` sí pasan. Tras quitar al 'Chaufa' del combo con un PUT, el cambio de categoría ya pasa.
- `updateProduct(pollo.id, { category: 'combo' })` con presentaciones cargadas → PRODUCT_HAS_PORTIONS (la guardia de la 006 sigue, ahora también hacia 'combo').

### 4.4 API por HTTP (backend contra la base de pruebas, con sesiones reales)

**AC-11 (GET /api/products/{productId}/items).** Dado 'Mostrito' con sus 3 componentes, cuando:

- GET con sesión de mozo (y también cocina y caja) → `200 { items: [...] }` con el cuerpo y el orden de AC-08 (producto embebido, claves exactas) y `Cache-Control: no-store`.
- GET de un producto 'dish' → `200 { items: [] }`; GET de `999999` → `404 { error: { code: 'PRODUCT_NOT_FOUND', message: 'Ese producto no existe.', details: null } }`; GET de `abc` o `0` → `400 VALIDATION_ERROR` con issue en `productId` ('El identificador del producto no es válido.'); GET sin cookie → `401` UNAUTHENTICATED.

**AC-12 (PUT /api/products/{productId}/items).** Dado el combo y los productos de AC-09, cuando:

- PUT de admin con la lista válida → `200 { items: [...] }` igual al GET posterior; un admin que además es mozo (multi-rol) obtiene lo mismo.
- PUT de mozo (solo mozo, solo cocina, solo caja, o mozo+cocina sin admin) → `403 { error: { code: 'FORBIDDEN', message: 'No tienes permiso para realizar esta acción.', details: null } }`; sin cookie → `401` UNAUTHENTICATED ('Debes iniciar sesión para continuar.').
- PUT sobre 'Chaufa' → `409 COMBO_ITEMS_NOT_ALLOWED` con el cuerpo exacto `{ error: { code: 'COMBO_ITEMS_NOT_ALLOWED', message: 'Solo los productos de la categoría Combos pueden tener componentes.', details: null } }`; PUT sobre `999999` → 404 PRODUCT_NOT_FOUND; PUT sobre `abc` → 400 con el issue de `productId`.
- PUT con un componente 'combo', un chicken sin `portion`, un 'dish' con `portion` y un `productId` inexistente en la misma lista → `400 VALIDATION_ERROR` con los cuatro issues de D-007-10 en el orden de la lista y nada guardado (el GET posterior devuelve los ítems anteriores intactos).
- PUT `{ items: [] }` → `200 { items: [] }` y la tabla queda vacía.
- Todas las respuestas llevan `Cache-Control: no-store`, incluidas las de error.

**AC-13 (PATCH /api/products/{productId} con los nuevos conflictos).** Cuando:

- PATCH `{ category: 'dish' }` sobre 'Mostrito' con componentes → `409 { error: { code: 'PRODUCT_HAS_ITEMS', message: 'Este producto es un combo con componentes; quita sus componentes antes de cambiar su categoría.', details: null } }` y el producto sigue 'combo' con su nombre anterior.
- PATCH `{ category: 'extra' }` sobre el 'Chaufa' que es componente → `409 { error: { code: 'PRODUCT_IS_COMPONENT', message: 'Este producto es componente de un combo; quítalo del combo antes de cambiar su categoría.', details: null } }`; tras vaciar el combo, el mismo PATCH → 200 con `category: 'extra'`.
- PATCH de mozo sigue → 403; PATCH `{ category: 'combo' }` sobre un 'chicken' con presentaciones → 409 PRODUCT_HAS_PORTIONS (AC-006-15 vigente).

**AC-14 (métodos no declarados).** Cuando se llama POST, DELETE o PATCH a `/api/products/{productId}/items`, o GET a `/api/products/{productId}/items/1`, entonces 404 con `Cache-Control: no-store`.

**AC-15 (errores del lector del cuerpo en PUT .../items).** Cuerpo JSON inválido → `400 INVALID_JSON`; un JSON válido que no es objeto (un número) → `400 INVALID_BODY`; `Content-Type` que no es `application/json` con cuerpo no vacío → `415 UNSUPPORTED_MEDIA_TYPE`; cuerpo mayor de 100 kb → `413 PAYLOAD_TOO_LARGE`. Todos con `Cache-Control: no-store` y su cuerpo de error común.

### 4.5 Cobertura de RF y RNF

| Requisito | AC que lo cubren |
| --- | --- |
| RF-18 (combos de la carta, crear/editar/activar) | AC-01, AC-06, AC-08, AC-09, AC-11, AC-12 (crear y editar son los de la 005; activar/desactivar es PATCH isActive, que no cambia) |
| RF-19 (consumo del pollo por parte, incluidos combos) | AC-02, AC-05, AC-09 |
| RNF-12 (configurable por el administrador) | AC-09, AC-10, AC-12, AC-13 |

## 5. Requisitos verificables

| ID | Requisito | Cómo se verifica |
| --- | --- | --- |
| R-007-01 | GET /api/products/{productId}/items responde a cualquier rol con sesión; PUT .../items exige admin | reviewer lee las dos líneas del router |
| R-007-02 | openapi.yaml 0.7.0 sigue siendo OpenAPI 3.1 válido y coincide con lo implementado | `pnpm dlx @redocly/cli lint docs/api/openapi.yaml`; contraste de AC-11 a AC-15 |
| R-007-03 | Ninguna variable de entorno nueva | `git diff` vacío en backend/.env.example y CONFIG_VARIABLES |
| R-007-04 | Una sola migración nueva, en el orden de MIGRATIONS | ls de la carpeta de migraciones; AC-07 |
| R-007-05 | frontend no cambia | `git diff` vacío en frontend; `pnpm --filter @polleria/web exec grep -rE "fetch|axios" src` sin coincidencias |
| R-007-06 | Cobertura ≥ 90 % en shared y en el servicio | `pnpm test:coverage` |
| R-007-07 | Definición de terminado de CLAUDE.md | orquestador en el cierre |

## 6. Reglas de dominio y de negocio

- Reglas de dominio que aplican: 1 (octavos enteros por parte), 2 (céntimos enteros — el precio del combo vive en `price_cents`) y 4 (precio copiado al pedido — RN-007-11 lo extiende a los componentes). La regla 3 (stock en transacción con bloqueo) se cumple de antemano: la serialización del PUT usa FOR NO KEY UPDATE (D-007-06) y el descuento real del inventario es Fase 5.
- **RN-007-01.** Solo un usuario con rol admin configura los componentes de un combo (PUT .../items); cualquier rol con sesión los consulta (GET .../items).
- **RN-007-02.** Un producto 'combo' se crea, renombra, reprecia, activa y desactiva con las rutas de la 005 (POST/PATCH /api/products); esta spec no añade rutas CRUD de productos.
- **RN-007-03.** Solo un producto de categoría 'combo' puede tener componentes; el PUT sobre otra categoría responde COMBO_ITEMS_NOT_ALLOWED. El GET sobre cualquier producto devuelve su lista (vacía si no es combo o no tiene).
- **RN-007-04.** Un combo nunca es componente: ni otro combo ni él mismo. Sin anidación no hay ciclos y el consumo de pollo es directo.
- **RN-007-05.** Un componente de pollo (producto 'chicken') declara `portion` siempre y `cut` según la presentación (breast/leg en eighth y quarter; null en half y whole). Un componente que no es pollo no lleva `portion` ni `cut` — son null.
- **RN-007-06.** El consumo de pollo de un combo no se guarda: se deriva sumando `quantity × chickenConsumption(portion, cut)` de cada componente de pollo (`comboChickenConsumption`).
- **RN-007-07.** El precio del combo es `products.price_cents` del producto combo: fijo, lo pone el administrador y se cobra igual tenga 0 o 10 componentes. Los componentes no tienen precio dentro del combo.
- **RN-007-08.** El PUT reemplaza el conjunto completo de forma atómica: la lista enviada es la que queda, todo o nada; `items: []` lo vacía. Los `id` de los ítems no son estables entre PUTs.
- **RN-007-09.** Un combo sin componentes se vende como ítem simple a su `price_cents` (estado natural mientras se configura; paralelo a un pollo sin presentaciones, RN-006-06).
- **RN-007-10.** Ningún producto puede ser a la vez 'combo' y 'chicken' (la categoría es una sola): un 'chicken' con presentaciones no pasa a 'combo' sin vaciarlas (PRODUCT_HAS_PORTIONS, de la 006); un 'combo' con componentes no pasa a otra categoría sin vaciarlos (PRODUCT_HAS_ITEMS); un producto que es componente de un combo no cambia de categoría (PRODUCT_IS_COMPONENT).
- **RN-007-11.** Regla de dominio 4 ampliada a combos (declarada, se ejecuta en la Fase 2): el ítem del pedido copia el `price_cents` del combo y su lista de componentes resuelta (producto, cantidad, presentación, parte y octavos resultantes) al momento de registrarse; cambios posteriores en la carta o en el combo no alteran pedidos registrados. Si en el mostrador el cliente elige la parte del pollo del combo (pregunta 3), el ítem copia la parte real elegida.

## 7. Casos borde

- **Combo sin componentes** (`items: []` o recién creado): se vende como ítem simple a `price_cents` (RN-007-09); el GET devuelve `{ items: [] }`. No es un error.
- **El mismo producto dos veces en el combo**: con distinta (portion, cut) es válido — un "dúo" puede llevar cuarto pecho + cuarto pierna del mismo 'Pollo a la brasa'; con la misma (portion, cut) es 400 'Hay componentes repetidos en la lista.'. Para componentes sin presentación, una sola fila por producto: las unidades van en `quantity` (2 gaseosas = `{ quantity: 2 }`, no dos filas).
- **Auto-referencia**: pasar el propio `productId` del combo como componente responde con el issue 'Un combo no puede ser componente de otro combo.' (su categoría ya es 'combo'; RN-007-04).
- **Componente desactivado**: el PUT lo acepta y el GET lo muestra con `isActive: false` (S-007-04, pregunta 7). Un combo desactivado también puede reconfigurarse — el 409 va sobre la categoría, no sobre el estado.
- **El pollo del combo usa una presentación que el producto no vende suelto**: válido (D-007-04) — 'Pollo a la brasa' puede vender solo cuartos y enteros y entrar al mostrito como octavo de pecho; el consumo se deriva igual.
- **Cantidades grandes**: `{ quantity: 99 }` es válido; 0, decimales y > 99 son ZodError. Un entero ×2 son 16 octavos (combo de dos pollos, válido).
- **Presentación y parte sueltas**: `cut` sin `portion` es 400 ('Sin presentación no se puede indicar la parte.'); `portion` en un componente que no es pollo es 400 ('Solo un componente de pollo lleva presentación y parte.'); `portion` de pollo sin `cut` cuando corresponde es 400 en `cut` con PORTION_CUT_MESSAGE.
- **`productId` de la ruta inválido**: 'abc', '0', '1.5', '-3' y '2147483648' → 400 con issue en `productId` ('El identificador del producto no es válido.'); '0009' se acepta como 9; '99'... con dígitos inexistente → 404.
- **`productId` del cuerpo fuera de rango** (0, negativo, decimal, > 2147483647): issue en `items.N.productId` con el mismo mensaje.
- **Lista de más de 10 componentes**: 400 con 'Un combo admite hasta 10 componentes.' en `items`.
- **PATCH de categoría atascado**: cambiar la categoría del combo con componentes → PRODUCT_HAS_ITEMS (vaciar primero con `items: []`); cambiar la categoría de un componente referenciado → PRODUCT_IS_COMPONENT (quitarlo del combo primero).
- **Métodos y sub-rutas no declarados**: 404 (AC-14), nunca 405.
- **Precio del combo en 0**: válido (promoción/regalo — mismo rango que la 005); la Fase 2 lo cobrará en 0.
- **Datos inconsistentes solo alcanzables por SQL directo** (un `portion` en un componente que deja de ser 'chicken' por un UPDATE manual, o un 'combo' insertado como componente a mano): la API es la única vía prevista; los CHECKs cubren la forma, no la categoría del referenciado. Documentado como riesgo, igual que en la 006.

## 8. Modelo de datos

### 8.1 Tabla `combo_items` (migración `20261009180000-create-combo-items.ts`)

| Columna | Tipo | Reglas |
| --- | --- | --- |
| id | INTEGER | PK, autoincremental |
| combo_id | INTEGER NOT NULL | FK → products.id (el producto 'combo' dueño de la fila) |
| product_id | INTEGER NOT NULL | FK → products.id (el componente) |
| quantity | INTEGER NOT NULL | CHECK `combo_items_quantity_range`: BETWEEN 1 AND 99 |
| portion | VARCHAR(8) NULL | CHECK `combo_items_portion_allowed`: NULL o una de PORTIONS |
| cut | VARCHAR(8) NULL | CHECK `combo_items_cut_allowed`: NULL o una de CUTS |
| created_at / updated_at | TIMESTAMPTZ NOT NULL | default now() |

- CHECK `combo_items_portion_cut` (la correspondencia, igual que en product_portions): `(portion IS NULL AND cut IS NULL) OR (portion IN ('eighth','quarter') AND cut IN ('breast','leg')) OR (portion IN ('half','whole') AND cut IS NULL)`.
- UNIQUE `combo_items_unique` NULLS NOT DISTINCT sobre `(combo_id, product_id, portion, cut)` — índice directo para el `ON CONFLICT DO UPDATE` del PUT.
- Índices simples `combo_items_combo_id` y `combo_items_product_id` (consulta por combo y la guardia "¿este producto es componente de alguien?").
- La base NO sabe la categoría del producto referenciado: "componente 'chicken' ⇒ portion obligatoria", "no 'chicken' ⇒ portion null" y "no 'combo'" son reglas del servicio (D-007-10); la tabla solo garantiza la forma de la fila.
- La misma migración reemplaza el CHECK `products_category_allowed` para incluir `'combo'` en segundo lugar (`'chicken','combo','dish','drink','dessert','sauce','extra'`), en la misma transacción que crea la tabla; `down` borra la tabla y restaura el CHECK sin 'combo'.

### 8.2 Modelo Sequelize `ComboItem` y asociación

- `models.ComboItem` sobre 'combo_items' con asociaciones: `Product.hasMany(ComboItem, { as: 'comboItems', foreignKey: 'combo_id' })`, `ComboItem.belongsTo(Product, { as: 'combo', foreignKey: 'combo_id' })`, `ComboItem.belongsTo(Product, { as: 'product', foreignKey: 'product_id' })`. `initComboItemAssociations(models)` invocado desde `initAssociations` en `src/db/models/index.ts`.
- Sin `ON DELETE`: los productos no se borran nunca (RN-005-10), así que la FK no necesita acción — igual que en product_portions.

### 8.3 Función pura `comboChickenConsumption`

- `comboChickenConsumption(items: Iterable<{ quantity: number; portion: Portion | null; cut: Cut | null }>): { breastEighths: number; legEighths: number }` en `packages/shared/src/combos.ts`.
- Por cada ítem: `portion` null → aporta 0 (no es pollo); `portion` presente → suma `quantity` × `chickenConsumption(portion, cut)` (lanza ante la combinación inválida, defensa de la 006); `cut` sin `portion` → lanza error.
- Ejemplo mostrito (`quarter+leg` ×1 + chaufa ×1 + gaseosa ×1): `{ breastEighths: 0, legEighths: 2 }`. Combo familiar (entero ×1 + chaufa ×2 + gaseosa ×4): `{ breastEighths: 4, legEighths: 4 }`.

## 9. API (borrador; contrato en docs/api/openapi.yaml → 0.7.0)

Base `/api`; todas protegidas con la cookie `polleria_session` y `Cache-Control: no-store` (cubiertas por el prefijo '/api/products' de app.ts y reafirmadas por el router).

| Método y ruta | Roles | Petición | Respuesta |
| --- | --- | --- | --- |
| GET /api/products/{productId}/items | cualquier rol con sesión | — | 200 `{ items: [ComboItem] }`; 400 productId inválido; 401; 404 PRODUCT_NOT_FOUND |
| PUT /api/products/{productId}/items | admin | `{ items: [ComboItemInput] }` (0..10) | 200 `{ items: [ComboItem] }`; 400; 401; 403; 404; 409 COMBO_ITEMS_NOT_ALLOWED |
| PATCH /api/products/{productId} | admin | igual que la 005 | 200 Product; suma dos 409 nuevos: PRODUCT_HAS_ITEMS, PRODUCT_IS_COMPONENT |

`ComboItemInput`: `{ productId: int 1..2147483647, quantity: int 1..99, portion?: Portion | null, cut?: Cut | null }`. `ComboItem`: `{ id, comboId, product: Product, quantity, portion, cut }` con `product` de la 005 (id, name, category, priceCents, isActive).

- Ejemplo — armar el mostrito (`PUT /api/products/9/items`, admin):

```json
{ "items": [
  { "productId": 5, "quantity": 1, "portion": "quarter", "cut": "leg" },
  { "productId": 8, "quantity": 1 },
  { "productId": 2, "quantity": 1 }
] }
```

- Respuesta 200:

```json
{ "items": [
  { "id": 1, "comboId": 9, "product": { "id": 5, "name": "Pollo a la brasa", "category": "chicken", "priceCents": 1850, "isActive": true }, "quantity": 1, "portion": "quarter", "cut": "leg" },
  { "id": 2, "comboId": 9, "product": { "id": 8, "name": "Chaufa", "category": "dish", "priceCents": 1400, "isActive": true }, "quantity": 1, "portion": null, "cut": null },
  { "id": 3, "comboId": 9, "product": { "id": 2, "name": "Inca Kola 500 ml", "category": "drink", "priceCents": 400, "isActive": true }, "quantity": 1, "portion": null, "cut": null }
] }
```

- Por qué bajo `/api/products/{productId}/items` y no `/api/combos`: el combo ES un producto (D-007-02); sus componentes son un sub-recurso exactamente como las presentaciones (`/portions` de la 006), el combo ya aparece en GET /api/products con el resto de la carta y el `productId` de la ruta es el mismo en todas las vistas. Una colección `/api/combos` duplicaría el CRUD de productos y rompería "un combo es un producto más".
- Sin eventos Socket.IO: la carta la consulta el mozo bajo demanda; el emisor llega con pedidos (Fase 2), igual que quedó en la 006.
- El contrato OpenAPI cambia solo de forma aditiva: `info.version` a 0.7.0, el path nuevo, los esquemas nuevos, 'combo' en el enum de ProductCategory, los 3 códigos en ErrorCode y las 2 respuestas 409 referenciadas desde PATCH (más ComboItemsNotAllowed en el PUT). No se renombra ni se quita nada de la 0.6.0.

## 10. Interfaz (frontend)

Sin pantallas en esta spec (D-007-01): la 008 administra la carta completa (crear el producto 'combo', armar y vaciar sus componentes, verlos); la venta del combo es de la Fase 2. Notas para la 008: el combo se crea con POST /api/products eligiendo categoría Combos; el armado usa GET /api/products/{id}/items + PUT con la lista completa; los issues de `items.N.*` se marcan por fila; los 409 de PATCH se presentan como "este producto es combo/es componente: vacía sus componentes primero". La comparación "suma de componentes vs precio del combo" se arma con los `priceCents` del GET (D-007-09).

## 11. Contrato interno entre módulos

| Módulo | Expone / cambia |
| --- | --- |
| packages/shared/src/combos.ts (nuevo) | `COMBO_ITEMS_MAX`, `COMBO_ITEM_QUANTITY_MAX` (99), `comboItemInputSchema`, `replaceComboItemsRequestSchema`, `comboItemsUniqueRefinement`, `comboItemSchema`, `comboItemsResponseSchema`, tipos, `comboChickenConsumption`; reutiliza PORTIONS/CUTS/PORTION_CUT_MESSAGE/`chickenConsumption` de portions.ts |
| packages/shared/src/products.ts | `PRODUCT_CATEGORIES` suma 'combo' en 2º lugar (el comentario "no es categoría todavía" queda actualizado) |
| packages/shared/src/errors.ts | ERROR_CODES suma los 3 códigos |
| packages/shared/src/index.ts | exporta lo de combos.ts |
| backend/src/db/migrations/20261009180000-create-combo-items.ts (nueva) | tabla + CHECKs + única + índices + ALTER del CHECK de categoría (D-007-14) |
| backend/src/db/models/index.ts | ComboItem + `initComboItemAssociations` |
| backend/src/services/combo-items/combo-item.service.ts (nuevo) | `listComboItems(productId)`, `replaceComboItems(productId, input)` con la transacción y locks de D-007-06 |
| backend/src/services/products/product.service.ts | las dos guardias nuevas dentro de updateProduct (D-007-07), con re-verificación post-UPDATE |
| backend/src/routes/combo-items/ (nuevo) | combo-items.routes.ts + combo-items.controller.ts montado en app.ts antes del 404 (mismo orden que portions) |
| backend/tests/helpers.ts | `clearMenuTables` trunca combo_items; `resetMigrationTables` la borra antes que products |

## 12. Cambios a specs anteriores (esta spec los modifica)

- **005-menu-products.** `PRODUCT_CATEGORIES` y `productCategorySchema` pasan a aceptar `'combo'` (S-005-10 se resuelve: es categoría, no entidad aparte; el CHECK de base se amplía en la migración nueva); `updateProduct` suma las guardias PRODUCT_HAS_ITEMS y PRODUCT_IS_COMPONENT con re-verificación post-UPDATE; los tests de la 005 que afirmaban "`combo` debe ser rechazado" (products.test.ts de shared y de backend, products-service.test.ts) se actualizan en esta funcionalidad — pasan a afirmar la aceptación; el comentario del archivo products.ts sobre 'combo' se actualiza. El PATCH de producto gana dos 409 documentados en el contrato.
- **006-portions-eighths.** Nada cambia en su contrato: PUT portions sobre un producto 'combo' sigue rechazado con PORTIONS_NOT_ALLOWED (la categoría no es 'chicken'); PATCH chicken→combo con presentaciones sigue siendo PRODUCT_HAS_PORTIONS. La nota §19 ("la 007 decide el modelado") queda resuelta aquí con D-007-02 a D-007-05.
- **users-migrations.test.ts (004).** La lista MIGRATIONS recibe la migración nueva al final y el down encadenado gana un paso (revertir combo_items antes que product_portions); lo actualiza el test-writer de esta funcionalidad.
- **helpers de tests de backend.** `clearMenuTables` y `resetMigrationTables` incluyen `combo_items` (D-007-14); `products-migration.test.ts` y `product-portions-migration.test.ts` reciben el nombre nuevo en su lista esperada.
- **Nada más**: usuarios, sesiones, presentaciones, productos y la app web no cambian por fuera de lo listado.

## 13. Dependencias externas

Ninguna. Reutiliza lo ya instalado: Sequelize (transacción + locks FOR NO KEY UPDATE), Zod 4, el requireAuth/requireRole de la 003, el reader JSON limitado a 100 kb y PORTIONS/CUTS/chickenConsumption/PORTION_CUT_MESSAGE de la 006.

## 14. Fuera de alcance

- Pedidos, ítems de pedido, comandas e impresión (Fase 2): la venta del combo, la elección de la parte en el mostrador y la copia de precio/componentes al ítem se ejecutan allí (RN-007-11 solo lo declara).
- Inventario y descuento de stock (Fase 5): el consumo en octavos queda derivado con `comboChickenConsumption`; el movimiento real de stock por componente (pollo, bebidas, insumos del chaufa) es RF-20 a RF-23.
- Pantallas (Fase 8 / spec 008): toda la UI de combos — crear, armar, comparar precios — vive en el admin web.
- Descartables/empaques como componente: quedan como producto 'extra' vendido aparte (criterio de la 005, sección 7.3) salvo que el dueño confirme que van dentro de algún combo (pregunta 4).
- Eliminar productos ni componentes sueltos: el reemplazo por PUT cubre "quitar un componente"; los productos se desactivan, no se borran.
- Combos anidados, precios por componente, descuentos explícitos y disponibilidad por horario: prohibidos o fuera (RN-007-04, D-007-05).

## 15. Riesgos

- **Precio por suma con descuento (pregunta 2):** si el dueño espera que el precio del combo se calcule solo, el modelo fijo se siente rígido. Mitigación: el GET muestra los `priceCents` de componentes para comparar a la vista (D-007-09); la 008 puede mostrar la suma y sugerir el precio sin obligarlo.
- **El cliente elige la parte en el mostrador (pregunta 3):** si el mostrito puede salir con pecho o pierna según pedido, la (portion, cut) del componente es la opción por defecto y la Fase 2 debe permitir cambiarla en el ítem — RN-007-11 ya lo contempla copiando la real. Sin cambios en esta spec.
- **Componente que se desactiva (pregunta 7):** un combo puede quedar con un componente inactivo; la venta podría exigir todos activos en la Fase 2. El GET lo expone con `isActive: false` para que la 008 lo advierta.
- **Invariantes por categoría:** la base no puede expresar "portion solo si el componente es chicken": si alguien escribe SQL a mano quedan filas inconsistentes. Mitigación: la API es la única vía documentada; las guardias PATCH cubren la vía normal (riesgo residual documentado, igual que la 006).
- **Orden del ALTER del CHECK:** si el `down` corre con productos 'combo' dados de alta, falla al restaurar el CHECK viejo — igual que cualquier down con datos; solo afecta a desarrollo y se documenta (D-007-14).
- **El mostrito y sus acompañamientos deben existir como productos:** chaufa, papas, gaseosas se cargan primero con la 005; un combo no puede llevar algo que no esté en la carta. Mitigación: es el comportamiento deseado (RN-007-02) — y las cremas también pueden ser componentes ('sauce').
- **Un PUT concurrente con un PATCH de categoría:** cubierto por la serialización de D-007-06 (locks FOR NO KEY UPDATE ordenados + re-verificaciones) — el patrón ya probado en la 006.

## 16. Supuestos

Confirmados por el usuario el 2026-10-09: S-007-01 a S-007-11, todos con la respuesta recomendada. Ya no son supuestos: son decisiones; se conservan abajo como registro.

| ID | Supuesto |
| --- | --- |
| S-007-01 | Un combo es un producto de la categoría nueva 'combo', no una entidad aparte. |
| S-007-02 | Los componentes viven en `combo_items` y se reemplazan por PUT completo. |
| S-007-03 | El precio del combo es `price_cents` fijo (no suma con descuento automático). |
| S-007-04 | Se acepta un componente desactivado en la configuración; se ve con `isActive: false`. |
| S-007-05 | La (portion, cut) del componente de pollo se declara libre, sin exigir que el producto la venda suelto. |
| S-007-06 | El PUT serializa con los locks FOR NO KEY UPDATE de la lección de la 006. |
| S-007-07 | El GET de componentes responde a cualquier rol con sesión; el PUT solo a admin. |
| S-007-08 | El alcance es dominio + API, sin pantallas (008) ni venta (Fase 2). |
| S-007-09 | Un combo sin componentes se vende como ítem simple a su precio. |
| S-007-10 | Topes: máximo 10 componentes por combo y `quantity` de 1 a 99 por componente. |
| S-007-11 | 'combo' ordena en la carta en segundo lugar, después del Pollo. |

## 17. Preguntas abiertas (con recomendación)

Respondidas el 2026-10-09, todas con la respuesta recomendada: 1 (la lista de combos la dará el dueño; el modelo ya cubre cualquier combinación y servirá para el seed de la Fase 6), 2 (precio propio fijo en price_cents; la suma con descuento queda descartada salvo pedido futuro), 3 (la parte del pollo del combo es la por defecto del componente; si el cliente elige, el ítem de la Fase 2 copiará la real), 4 (los descartables se cobran aparte como producto 'extra'; si un combo los incluye pueden ser componente), 5 (combo = producto de categoría 'combo' con tabla combo_items), 6 ('combo' en la carta en segundo lugar, después del Pollo), 7 (componentes desactivados permitidos en la configuración; el GET los muestra con isActive false y la regla de venta se decide en la Fase 2), 8 (solo dominio + API; las pantallas son la 008 y la venta la Fase 2), 9 (la porción del componente de pollo se declara libre, sin exigir que el producto la venda suelto) y 10 (máximo 10 componentes por combo y 99 unidades por componente). Se conservan abajo como registro, cada una marcada como resuelta.

1. **(dueño) ¿Qué combos vendes hoy y a qué precio?** (mostrito, pollo + gaseosa, familiar, dúo…). *Recomendación:* el modelo ya cubre cualquier combinación; la lista servirá para el seed de demostración de la Fase 6. No bloquea la spec. **Resuelta el 2026-10-09: recomendación aceptada.**
2. **(dueño) ¿El precio del combo lo pones tú o debería calcularse sumando los componentes con un descuento?** *Recomendación:* precio propio fijo en `price_cents` (D-007-05) — es como se piensan las promociones y cumple RNF-12; la suma con descuento puede evaluarse después sin romper nada. **Resuelta el 2026-10-09: recomendación aceptada.**
3. **(dueño) El pollo del combo: ¿va siempre con la misma parte (por ejemplo, pierna) o el cliente elige pecho/pierna al pedir?** *Recomendación:* guardar la parte por defecto en el componente; si el cliente puede elegir, la Fase 2 copia la parte real al ítem (RN-007-11) — no requiere cambio aquí, solo confirmarlo. **Resuelta el 2026-10-09: recomendación aceptada.**
4. **(dueño) Los descartables y bolsas para llevar: ¿se cobran aparte o ya van incluidos en el precio del combo?** *Recomendación:* aparte como producto 'extra' (como quedó en la 005); si algún combo los incluye de verdad, pueden agregarse como componente sin costo visible. **Resuelta el 2026-10-09: recomendación aceptada.**
5. **(técnica) ¿Combo como producto de categoría 'combo' con tabla `combo_items`?** *Recomendación:* sí (D-007-02/D-007-03); la alternativa de tabla `combos` aparte duplicaba precio/estado/orden y complicaba el pedido. **Resuelta el 2026-10-09: recomendación aceptada.**
6. **(técnica) ¿'combo' en la carta inmediatamente después del Pollo?** *Recomendación:* sí (D-007-02) — coincide con el orden de la tabla de planificación; moverlo es cambiar una posición del enum. **Resuelta el 2026-10-09: recomendación aceptada.**
7. **(técnica) ¿Permitir componentes desactivados dentro del combo?** *Recomendación:* sí, solo en configuración — el GET los expone con `isActive: false`; la regla "combo vendible solo con componentes activos" se decide en la Fase 2. **Resuelta el 2026-10-09: recomendación aceptada.**
8. **(técnica) ¿Solo dominio + API, sin pantallas?** *Recomendación:* sí — la 008 administra la carta completa y la Fase 2 vende; adelantar UI ahora repetiría trabajo de la 008. **Resuelta el 2026-10-09: recomendación aceptada.**
9. **(técnica) ¿La porción del componente de pollo se declara libre aunque el producto no la venda suelto?** *Recomendación:* sí (D-007-04) — la presentación dentro del combo es consumo, no oferta. **Resuelta el 2026-10-09: recomendación aceptada.**
10. **(técnica) ¿Topes de 10 componentes por combo y 99 unidades por componente?** *Recomendación:* sí (S-007-10) — cubre de sobra los combos reales y corta errores de captura. **Resuelta el 2026-10-09: recomendación aceptada.**

## 18. Acción del usuario y verificación manual

Cuando el usuario confirme los supuestos, el flujo sigue: test-writer (AC-01 a AC-15 en rojo) → backend-dev (verde) → adversarial-tester → reviewer → cierre. Verificación manual sugerida tras `pnpm db:migrate` sobre polleria_dev:

1. POST /api/products `{ name: 'Mostrito', category: 'combo', priceCents: 2200 }` con sesión admin → 201.
2. PUT /api/products/{id}/items con `[{ productId: <pollo>, quantity: 1, portion: 'quarter', cut: 'leg' }, { productId: <chaufa>, quantity: 1 }]` → 200 con el producto embebido.
3. GET /api/products/{id}/items con sesión de mozo → 200; sin cookie → 401.
4. PUT sobre un producto 'dish' → 409 COMBO_ITEMS_NOT_ALLOWED; PUT con un componente 'combo' → 400 con su issue.
5. PATCH `{ category: 'dish' }` sobre el combo → 409 PRODUCT_HAS_ITEMS; PUT `{ items: [] }` y reintentar → 200.

## 19. Notas para las specs siguientes

- **008 (administración de la carta):** consume GET/PUT .../items; los issues `items.N.*` se marcan por fila; maneja los tres 409 nuevos; puede mostrar la suma de `priceCents` de componentes vs el precio del combo.
- **Fase 2 (pedidos):** el ítem del pedido copia `price_cents` del combo + su lista de componentes con (portion, cut) y octavos resueltos por `comboChickenConsumption` — regla 4 (RN-007-11); decidir allí si el mozo puede cambiar la parte en el mostrador (pregunta 3) y si un combo con componente inactivo se puede vender (pregunta 7).
- **Fase 5 (inventario):** cada ítem de pedido combo consume los octavos copiados (igual que un pollo suelto, regla 3) y las unidades/insumos de los demás componentes; `comboChickenConsumption` ya entrega el desglose pecho/pierna.
- **Si el dueño pide suma con descuento (pregunta 2):** es cambio aditivo futuro — un campo de política de precio en el producto combo, sin tocar `combo_items`.
