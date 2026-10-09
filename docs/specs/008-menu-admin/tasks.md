# Tareas — Spec 008: pantallas de administración de la carta

- Spec: docs/specs/008-menu-admin/spec.md (Aprobada, 2026-10-09)
- Rama: feat/008-menu-admin
- Contrato: docs/api/openapi.yaml (versión 0.7.0, sin cambios: /products GET/POST, /products/{productId} PATCH, /products/{productId}/portions GET/PUT, /products/{productId}/items GET/PUT)
- ADR: ninguno nuevo (reutiliza lo ya decidido: sesión en la base, RoleGuard, TanStack Query, MSW, Playwright, formato de errores)
- Dependencias: ninguna nueva. Sin variables de entorno nuevas ni migraciones nuevas.
- Alcance especial: la 008 es web (apps/web) más dos funciones puras nuevas en shared (money.ts). apps/api no se toca: no hay comportamiento de API nuevo que probar ni implementar (D-008-01, D-008-15).

## Orden y por qué

1. **Sin instalación ni andamiaje**: no hay paquetes ni configuración nuevos; el primer paso es directamente el test-writer.
2. **Pruebas en rojo (T-01 a T-06)**: test-writer escribe las pruebas de los 21 AC: funciones de dinero en shared, funciones de API y etiquetas en la web, componentes de las tres páginas y los cuatro recorridos E2E (con el ajuste de e2e/global-setup.ts).
3. **Implementación**: backend-dev solo T-07 (money.ts de shared, que la web importa); frontend-dev T-08 a T-13 (cliente PUT, funciones de API, etiquetas y las pantallas) y T-14 (E2E en verde).
4. **Cierre (T-15)**: definición de terminado y requisitos R-008-01 a R-008-07.

Aprobación: el usuario aprobó la spec el 2026-10-09 con las respuestas recomendadas a las preguntas 1 a 10 (supuestos S-008-01 a S-008-14 confirmados). Decisiones confirmadas: solo el rol admin gestiona la carta; lista completa agrupada por categoría; edición en una página con secciones apiladas; el precio se escribe en soles con vista previa 'S/ X.XX'; tras crear un chicken o combo se aterriza en su edición; la comparación del combo usa el precio de venta suelto de cada presentación de pollo con respaldo al priceCents; desactivar pide confirmación; en un componente de pollo se preseleccionan cuarto y pierna; formatSoles, parseSolesToCents y PRICE_INPUT_MESSAGE viven en shared; y se incluyen cuatro recorridos E2E con la semilla de D-008-14.

## Pruebas en rojo (test-writer)

Reglas comunes:
- Cada archivo de prueba de esta spec envuelve sus pruebas en un `describe` cuyo nombre empieza con `008:` y el nombre de cada prueba empieza con el ID del AC: `it('AC-08: crea un producto', ...)`.
- Importar desde las rutas de la sección 11 de la spec; que fallen por módulo inexistente es un rojo válido.
- Base de pruebas: solo polleria_test (DATABASE_URL_TEST) con las guardias de RN-001-02. La 008 no tiene pruebas de API; la limpieza de la carta solo la usa e2e/global-setup.ts (clearMenuTables ya existe y cubre combo_items, product_portions y products).
- Web: simular `next/navigation` (useRouter con `replace`/`push` espiados; `useParams` devuelve el id de la ruta para /admin/carta/[id]) y `apps/web/src/lib/navigation.ts` con `vi.mock`; MSW intercepta /api en el nivel fetch; `fireEvent.click` basta para los controles; limpiar localStorage entre pruebas; el render usa el Providers con TanStack Query de siempre. La sesión simulada por defecto es la de un administrador.
- Para las pruebas de componentes con varios árboles montados a la vez, usar el patrón de usePrimaryInstance como en las páginas existentes.
- Textos con caracteres especiales siempre con escapes, nunca literales.
- Commits con prefijo test, por ejemplo `test(008): pruebas de la lista de la carta`.

### T-01. Funciones de dinero en shared
- Responsable: test-writer
- Dependencias: ninguna
- AC: AC-01, AC-02
- Descripción: packages/shared/src/money.test.ts nuevo (importando desde '@polleria/shared'): tabla de formatSoles con los cinco valores de AC-01 y los lanzamientos con -1, 18.5, NaN, '1850' y null; tabla de parseSolesToCents con los diez aceptados y los diez rechazados a null de AC-02; y PRICE_INPUT_MESSAGE con el texto exacto.

### T-02. Etiquetas de la carta y funciones de API en la web
- Responsable: test-writer
- Dependencias: ninguna
- AC: AC-03, AC-04
- Descripción:
  - apps/web/src/lib/menu-labels.test.ts nuevo: las siete etiquetas de PRODUCT_CATEGORY_LABELS sobre todas las claves de PRODUCT_CATEGORIES, PORTION_LABELS, CUT_LABELS y la tabla de formatPortionCutLabel de AC-03.
  - Archivos nuevos junto al código: apps/web/src/lib/api/client-put.test.ts con `describe('008: ...')` solo para el caso 'PUT' (client.test.ts de la 003 no se toca) y apps/web/src/lib/api/products.test.ts con MSW: las siete funciones de la sección 11 con su método, ruta y expectedStatus (201 en createProduct, 200 en las demás), validación de la respuesta con UNEXPECTED_RESPONSE cuando no cuadra y propagación de ApiError con code, message y details (PRODUCT_NAME_TAKEN, VALIDATION_ERROR con issues 'items.N.*', COMBO_ITEMS_NOT_ALLOWED, PRODUCT_NOT_FOUND).

### T-03. Enlace, guardias y lista de la carta
- Responsable: test-writer
- Dependencias: ninguna
- AC: AC-05, AC-06, AC-07
- Descripción: pruebas de componentes dentro de Providers. En app/admin/page.tsx el enlace 'Carta' con href '/admin/carta' (AC-05). En app/admin/carta/page.tsx: guardias por rol (administrador pasa; cajero llama replace('/caja'); 401 llama hardNavigate('/login')) (AC-05); la lista con el h1 'Carta', las secciones h2 por categoría en el orden de la carta, las filas con nombre, 'S/ X.XX', 'Desactivado', 'Editar' y 'Desactivar'/'Activar', más los estados de carga, vacío y error (AC-06); y la desactivación con confirmación y la activación directa con sus PATCH y sus errores (AC-07).

### T-04. Alta y edición de datos y estado
- Responsable: test-writer
- Dependencias: ninguna
- AC: AC-08, AC-09, AC-10, AC-11
- Descripción: pruebas de componentes dentro de Providers.
  - app/admin/carta/nuevo/page.tsx: campos y radios de AC-08 con sus nombres accesibles, la vista previa 'S/ 18.50' al escribir el precio, el POST único con el cuerpo en céntimos, el destino bifurcado tras el 201 (chicken/combo a /admin/carta/<id>, el resto a /admin/carta), la invalidación de la lista y las validaciones locales (AC-08); los errores 409/400/red que conservan lo escrito (AC-09).
  - app/admin/carta/[id]/page.tsx: 'Cargando...' y 'Ese producto no existe.' según el id; la sección Datos precargada, el PATCH con los tres campos y 'Cambios guardados.'; la aparición de la sección especial tras cambiar la categoría a chicken/combo; la nota de precio de referencia cuando el chicken tiene presentaciones (AC-10); los cinco 409/404 con su message y la sección Estado con su confirmación (AC-11).

### T-05. Grilla de presentaciones y editor de componentes
- Responsable: test-writer
- Dependencias: ninguna
- AC: AC-12, AC-13, AC-14, AC-15, AC-16, AC-17
- Descripción: pruebas de componentes dentro de Providers sobre app/admin/carta/[id]/page.tsx.
  - AC-12/AC-13: la sección 'Presentaciones del pollo' solo con categoría chicken; las seis filas en orden, precargadas desde GET /portions, con el PUT de reemplazo (incluido el { portions: [] }), 'Presentaciones guardadas.', la validación por fila, los issues 'portions.N.*' junto a su fila y el 409 PORTIONS_NOT_ALLOWED.
  - AC-14/AC-15: la sección 'Componentes del combo' solo con categoría combo; filas pobladas desde GET /items, agregar/quitar, candidatos sin combos con los inactivos marcados, campos Presentación/Parte solo en chicken (Parte solo con octavo/cuarto), preselección cuarto/pierna, tope de 10, PUT con nulls correctos, { items: [] }, 'Componentes guardados.' y el estado vacío con su nota.
  - AC-16/AC-17: la comparación con sus tres formas del paréntesis, el precio de referencia por presentación suelta (GET /portions del componente chicken) y el respaldo al priceCents; los errores locales por fila, los issues 'items.N.*' junto a su fila y los de raíz como mensaje de la sección, más COMBO_ITEMS_NOT_ALLOWED y PRODUCT_NOT_FOUND.

### T-06. Extremo a extremo
- Responsable: test-writer
- Dependencias: ninguna
- AC: AC-18, AC-19, AC-20, AC-21
- Descripción:
  - e2e/global-setup.ts: conservar los usuarios de la 003/004 y agregar, antes de crear nada, la limpieza de la carta con clearMenuTables (products, product_portions y combo_items autorizadas por D-006-10/D-007-14) y la semilla de D-008-14: 'E2E Pollo' (chicken, 6500), 'E2E Chaufa' (dish, 1400) y 'E2E Gaseosa' (drink, 400) con createProductService, y las presentaciones del pollo (cuarto pecho 1800, cuarto pierna 1700, entero 6500) con createProductPortionService. Los productos creados por las pruebas quedan truncados en la corrida siguiente por la misma limpieza.
  - e2e/menu-admin.spec.ts con AC-18, AC-19 y AC-20 solo en desktop-chrome y AC-21 solo en mobile-chrome (360x740), siguiendo el patrón de e2e/users-admin.spec.ts (login con la interfaz, helpers como productIdByName por page.request si hace falta).
  - En AC-21 comprobar en cada pantalla que el ancho del documento no supera el viewport (por ejemplo scrollWidth menor o igual a 360) y que los controles del recorrido siguen accesibles.

### Verificación del rojo (al terminar T-01 a T-06)
- `pnpm test` falla solo por módulos inexistentes (shared/money.ts, lib/api/products.ts, lib/menu-labels.ts, las páginas y componentes nuevos) o comportamiento ausente. Las pruebas de las specs anteriores siguen en verde (no se toca ninguna).
- `pnpm test:e2e` (con `pnpm dev` detenido) falla en las cuatro pruebas nuevas por lo que falta; las anteriores siguen en verde.
- `pnpm typecheck` y `pnpm lint` pueden fallar solo en cascada por los módulos que aún no existen.

## Implementación compartida (backend-dev)

Reglas comunes:
- No crear, modificar ni borrar archivos de prueba (`*.test.ts`, `*.test.tsx`, apps/api/tests/, e2e/). Si una prueba parece contradecir la spec, detenerse y reportarlo.
- Sintaxis borrable (D-02 de la 001), imports relativos con .ts, mensajes exactos de la spec.
- Sin dependencias nuevas ni variables de entorno nuevas. apps/api no se toca en esta spec.
- Commits con prefijo feat, sin archivos de prueba. Antes de cada commit: `pnpm --filter @polleria/shared run typecheck` (o el equivalente del paquete) y `pnpm lint`.

### T-07. Funciones de dinero en shared
- Responsable: backend-dev
- Dependencias: T-01
- AC: AC-01, AC-02
- Descripción: packages/shared/src/money.ts nuevo, exportado por index.ts: formatSoles (entero de céntimos mayor o igual a 0 -> 'S/ X.XX' con aritmética de enteros, sin Intl ni float; lanza ante otra entrada), parseSolesToCents (acepta dígitos con separador '.' o ',' de uno o dos decimales, con espacios alrededor; null si no cuadra) y PRICE_INPUT_MESSAGE con el texto exacto de AC-02. Mantener el 90 % de cobertura de shared. Hacerla primero: frontend-dev la necesita.

## Implementación de la web (frontend-dev)

Reglas comunes:
- No crear, modificar ni borrar archivos de prueba. No modificar packages/shared: si falta algo, pedirlo en el reporte.
- HeroUI para los controles, Tailwind para el diseño, botones y enlaces de al menos 48 px de alto (min-h-12), selectores nativos para Producto/Presentación/Parte, textos exactos de la sección 10 de la spec.
- TanStack Query con `retry: false`; claves `['admin', 'products']`, `['admin', 'products', id, 'portions']` y `['admin', 'products', id, 'items']`; tras cada mutación exitosa invalidar la consulta correspondiente y la lista.
- Un solo envío en vuelo por acción (marca síncrona con useRef más isPending).
- Commits con prefijo feat, sin archivos de prueba. Antes de cada commit: `pnpm --filter @polleria/web run typecheck` y `pnpm lint`.

### T-08. Cliente PUT, funciones de API y etiquetas
- Responsable: frontend-dev
- Dependencias: T-02, T-07
- AC: AC-03, AC-04
- Descripción: apps/web/src/lib/api/client.ts suma 'PUT' a `ApiRequestOptions.method` (nada más cambia). apps/web/src/lib/api/products.ts nuevo con getProducts, createProduct, updateProduct, getProductPortions, replaceProductPortions, getComboItems y replaceComboItems según la sección 11: respuestas validadas con los esquemas de shared (UNEXPECTED_RESPONSE si no cuadra) y expectedStatus 201 en createProduct y 200 en las demás. apps/web/src/lib/menu-labels.ts nuevo con PRODUCT_CATEGORY_LABELS, PORTION_LABELS, CUT_LABELS y formatPortionCutLabel.

### T-09. Enlace en Administración y lista de la carta
- Responsable: frontend-dev
- Dependencias: T-03, T-08
- AC: AC-05, AC-06, AC-07
- Descripción: enlace 'Carta' en app/admin/page.tsx; apps/web/src/app/admin/carta/page.tsx con RoleGuard area '/admin': h1 'Carta', enlace 'Agregar producto', secciones h2 por categoría presente en el orden de la carta, filas con nombre, precio formateado con formatSoles, marca 'Desactivado', enlace 'Editar' y 'Desactivar'/'Activar' con la confirmación de 10.2; estados 'Cargando carta...', 'No se pudo cargar la carta.' + 'Reintentar' y 'La carta está vacía.'.

### T-10. Formulario de alta
- Responsable: frontend-dev
- Dependencias: T-04, T-08, T-09
- AC: AC-08, AC-09
- Descripción: apps/web/src/app/admin/carta/nuevo/page.tsx con RoleGuard area '/admin' según 10.3: campos con sus nombres accesibles, radios de categoría en el orden de la carta, vista previa 'S/ X.XX' con formatSoles/parseSolesToCents, validación local con los esquemas de shared, un solo POST ('Creando...'), destino bifurcado tras el 201 e invalidación; errores de AC-09 conservando lo escrito.

### T-11. Página de edición: datos y estado
- Responsable: frontend-dev
- Dependencias: T-04, T-08, T-09
- AC: AC-10, AC-11
- Descripción: apps/web/src/app/admin/carta/[id]/page.tsx con RoleGuard area '/admin' según 10.4: el producto sale de la consulta de la lista por el id ('Ese producto no existe.' si no está); sección 'Datos' con PATCH y 'Cambios guardados.'; aparición de la sección especial tras cambiar la categoría a chicken/combo; nota de precio de referencia cuando el chicken tiene presentaciones cargadas; sección 'Estado' con la confirmación de desactivado y 'Activar' directo; los 409 y 404 con su message.

### T-12. Grilla de presentaciones
- Responsable: frontend-dev
- Dependencias: T-05, T-08, T-11
- AC: AC-12, AC-13
- Descripción: sección 'Presentaciones del pollo' dentro de la página de edición (componente interno en apps/web/src/components/menu/), visible solo con categoría guardada 'chicken': las seis filas fijas con checkbox y 'Precio de <etiqueta>', precarga desde GET /portions, PUT de reemplazo con las marcadas ({ portions: [] } cuando no hay ninguna), 'Presentaciones guardadas.', validación por fila, reparto de los issues 'portions.N.*' junto a su fila y el 409 con su mensaje; nota fija sobre la categoría.

### T-13. Editor de componentes y comparación
- Responsable: frontend-dev
- Dependencias: T-05, T-08, T-11
- AC: AC-14, AC-15, AC-16, AC-17
- Descripción: sección 'Componentes del combo' dentro de la página de edición (componente interno en apps/web/src/components/menu/), visible solo con categoría guardada 'combo': filas 'Componente N' con 'Producto' (sin combos, optgroup por categoría, inactivos marcados), 'Cantidad', 'Presentación' y 'Parte' solo para chicken (parte solo con octavo/cuarto, preselección cuarto/pierna), agregar/quitar con tope 10, PUT de reemplazo con nulls correctos, 'Componentes guardados.', estado vacío con su nota; la comparación de AC-16 con las consultas GET /portions de los pollos referenciados y el respaldo al priceCents; errores locales por fila, issues 'items.N.*' junto a su fila y los de raíz de sección.

### T-14. Extremo a extremo en verde
- Responsable: frontend-dev
- Dependencias: T-06, T-10, T-11, T-12, T-13
- AC: AC-18, AC-19, AC-20, AC-21
- Descripción: `pnpm test:e2e` con `pnpm dev` detenido. Ajustar la interfaz hasta que pasen los cuatro recorridos nuevos y sigan pasando los E2E anteriores (home.spec.ts, auth.spec.ts, users-admin.spec.ts). Si una prueba E2E parece incorrecta, reportarlo.

## Cierre

### T-15. Verificación final
- Responsable: backend-dev (con el reporte de frontend-dev de T-14)
- Dependencias: T-07 a T-14
- AC: todos (requisitos R-008-01 a R-008-07)
- Descripción:
  - `pnpm test`, `pnpm lint`, `pnpm typecheck` y `pnpm test:coverage` con código 0 (shared con 90 % o más; web con 80 % o más).
  - R-008-01 (openapi.yaml sin diff respecto a main y lint de Redocly), R-008-02 (`git status --porcelain apps/api` vacío), R-008-03 (sin migraciones ni .env.example tocados) y R-008-04 (grep de R-14 de la 001).
  - `pnpm test:e2e` con `pnpm dev` detenido.
  - Anotar en el reporte los pendientes manuales para el usuario: sección 18 de la spec (recorrido manual, incluido el celular a 360 px).

## Matriz AC, pruebas e implementación

| AC | Prueba (test-writer) | Implementación |
| --- | --- | --- |
| AC-01, AC-02 | T-01 | T-07 |
| AC-03, AC-04 | T-02 | T-08 |
| AC-05 a AC-07 | T-03 | T-09 |
| AC-08, AC-09 | T-04 | T-10 |
| AC-10, AC-11 | T-04 | T-11 |
| AC-12, AC-13 | T-05 | T-12 |
| AC-14 a AC-17 | T-05 | T-13 |
| AC-18 a AC-21 | T-06 | T-14 |
| R-008-01 a R-008-07 | — | T-15 |
