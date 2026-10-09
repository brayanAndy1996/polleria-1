# Spec 008 — Pantallas de administración de la carta

- Estado: Borrador (propuesta pendiente de aprobación del usuario)
- Fase: 1 (Usuarios y carta)
- Rama: feat/008-menu-admin
- Fecha: 2026-10-09
- Cubre: RF-18 completo en su parte usable (el administrador crea y edita productos, combos, presentaciones y precios, y los activa o desactiva — ahora desde la web, sobre las API de las specs 005, 006 y 007) y RNF-12 (precios, productos y carta se configuran desde el sistema, sin tocar código ni la base). Aporta a RNF-02 (español sencillo, botones grandes), RNF-05, RNF-07 y RNF-08 (la misma web en el wifi local, usable a 360 px en el celular del administrador y en la PC del local) y RNF-09 (la carta solo la gestiona el rol admin). La parte de RF-19 ya quedó cubierta en dominio por las specs 006 y 007; aquí se vuelve operable por pantalla.
- Documentos relacionados: tasks.md (esta carpeta), docs/planificacion.md (RF-18, RF-19, RNF-12, tabla de presentaciones y preguntas para el dueño), docs/specs/003-users-pin-login/spec.md (sesión, roles, RoleGuard y áreas /admin), docs/specs/004-users-admin/spec.md (patrón de pantallas de administración: /admin/usuarios, lista-alta-edición, confirmaciones, MSW y E2E), docs/specs/005-menu-products/spec.md (productos, categorías fijas con 'combo', precio en céntimos, nombre único, desactivar sin borrar), docs/specs/006-portions-eighths/spec.md (product_portions, octavos, PUT de reemplazo), docs/specs/007-combos/spec.md (combo_items, GET/PUT /items con el producto embebido), docs/api/openapi.yaml (versión 0.7.0 — sin cambios en esta spec) y CLAUDE.md (reglas de dominio 1, 2, 4 y 9; glosario: carta = menu, producto = product, presentación = portion, parte = cut, combo = combo).

## 1. Contexto

Las specs 005, 006 y 007 dejaron lista la carta por API: productos con nombre, categoría, precio y estado (005); presentaciones del pollo por parte con su consumo en octavos (006); y combos con componentes (007). Pero el dueño todavía no puede tocar nada de eso sin una consola y una cookie a mano. Esta spec entrega las pantallas de administración de la carta dentro del área /admin: la lista completa agrupada por categoría con precios y estado, el alta y la edición de cada producto, la grilla de presentaciones del pollo, el editor de componentes del combo con la comparación "por separado suman S/ X, el combo cuesta S/ Y", y la desactivación/activación desde la lista. Todo con el mismo patrón que la gestión de usuarios de la 004. No se agrega ni cambia ningún endpoint: la 008 consume el contrato OpenAPI 0.7.0 tal cual. La venta de la carta por el mozo sigue siendo Fase 2.

## 2. Historias de usuario

| ID | Historia |
| --- | --- |
| HU-008-01 | Como administrador (dueño), quiero ver la carta completa agrupada por categoría con el precio y el estado de cada producto, para revisarla y encontrar lo que quiero corregir. |
| HU-008-02 | Como administrador, quiero crear un producto con su nombre, categoría y precio (incluida la categoría combo) desde una pantalla, sin comandos en la PC del servidor. |
| HU-008-03 | Como administrador, quiero corregir el nombre, la categoría o el precio de un producto, y ver el mensaje claro cuando el sistema no me deja (nombre repetido, categoría con presentaciones o componentes cargados). |
| HU-008-04 | Como administrador, quiero cargar la grilla de presentaciones de un producto de pollo (octavo, cuarto, medio, entero; pecho o pierna en las porciones chicas) con su precio por fila, en una sola pantalla y guardando de una vez. |
| HU-008-05 | Como administrador, quiero armar un combo eligiendo sus componentes, la cantidad de cada uno y —si es pollo— su presentación y parte, viendo de un vistazo cuánto suman por separado frente al precio del combo, para fijar promociones sin calcular a mano. |
| HU-008-06 | Como administrador, quiero quitar un producto de la carta y volver a ponerlo desde la misma lista, sin borrar nada ni perder su configuración. |
| HU-008-07 | Como administrador, quiero usar estas pantallas igual en mi celular que en la PC del local —botones grandes, textos claros, sin internet—, para no depender de un solo equipo. |
| HU-008-08 | Como administrador, quiero que el formulario me avise qué fila está mal (precio sin escribir, componente sin producto, presentación del pollo sin parte) antes de guardar, para corregir sin perder lo que hice. |
| HU-008-09 | Como administrador, quiero ver mientras escribo el precio cómo quedará en soles ("S/ 18.50"), para no equivocarme entre soles y céntimos. |

## 3. Decisiones técnicas

Las que no confirmó el usuario están marcadas como SUPUESTO y repetidas en Preguntas abiertas (sección 17).

**D-008-01. Alcance: solo apps/web + dos funciones puras nuevas en shared (SUPUESTO S-008-01).**
- La API, la base de datos y el contrato no cambian: docs/api/openapi.yaml queda en la versión 0.7.0 sin una línea nueva. La 008 consume tal cual GET/POST/PATCH /api/products, GET/PUT /api/products/{productId}/portions y GET/PUT /api/products/{productId}/items.
- En packages/shared se agregan solo dos funciones puras de dinero para la interfaz (formatSoles y parseSolesToCents, D-008-04); nada existente cambia. Van en shared y no en apps/web porque el formato del sol lo reutilizan la carta del mozo (Fase 2) y la caja (Fase 4) — mismo criterio que toLimaDateTimeParts de la 001.
- Sin endpoints nuevos, sin migraciones, sin variables de entorno, sin dependencias y sin ADR (D-008-15).

**D-008-02. Rutas y navegación (SUPUESTO S-008-02).**
- /admin/carta (lista), /admin/carta/nuevo (alta) y /admin/carta/[id] (edición): el mismo patrón de rutas que /admin/usuarios de la 004. Las tres envuelven su contenido en RoleGuard con area="/admin": solo pasa el rol admin; un usuario sin ese rol va a su área y sin sesión a /login (comportamiento ya probado en la 003/004).
- La página /admin de la 003/004 gana el enlace 'Carta' junto al de 'Usuarios'.

**D-008-03. La lista es completa, sin paginar ni buscador, agrupada por categoría (SUPUESTO S-008-03).**
- GET /api/products ya devuelve la carta entera ordenada (categoría según PRODUCT_CATEGORIES, luego nombre en español y empates por id). Una carta de pollería tiene del orden de 40 productos: una lista completa con secciones basta — mismo criterio que la lista de usuarios de la 004 (S-004-08), que tampoco pagina.
- Una sección por categoría con productos, con su etiqueta en español (Pollo, Combos, Platos, Bebidas, Postres, Cremas, Extras). Cada fila: nombre, 'S/ X.XX', la marca 'Desactivado' si corresponde, el enlace 'Editar' y el botón 'Desactivar'/'Activar' (D-008-10).

**D-008-04. El dinero se escribe en soles y se muestra 'S/ X.XX' (regla de dominio 2; SUPUESTO S-008-04).**
- Nuevas en packages/shared/src/money.ts:
  - formatSoles(cents): entero de céntimos mayor o igual a 0, devuelve 'S/ 18.50' (también 'S/ 0.00', 'S/ 0.05', 'S/ 7.00', 'S/ 999.99'). Formateo manual determinista sobre enteros — parte entera con Math.trunc y dos dígitos de céntimos con padStart — sin Intl ni float. Lanza error con una entrada que no sea un entero mayor o igual a 0 (defensa, igual que chickenConsumption lanza).
  - parseSolesToCents(text): acepta '18', '18.5', '18.50' y la coma decimal '18,50', con espacios alrededor; devuelve los céntimos como entero o null si el formato no cuadra (vacío, letras, símbolo 'S/', más de dos decimales, negativos, más de un separador, decimales sin dígito inicial). No acota el rango: el tope se muestra con PRICE_INPUT_MESSAGE.
  - PRICE_INPUT_MESSAGE = 'Escribe el precio en soles (por ejemplo 18.50). El máximo es S/ 999.99.' — mensaje único del campo Precio en la web, en lugar del mensaje en céntimos del esquema de la API, que confunde en pantalla.
- Debajo de cada campo Precio, mientras el texto escrito parsea bien, se muestra la vista previa 'S/ X.XX' (HU-008-09): es la mitigación del error clásico de escribir 1850 pensando en céntimos. Si no parsea, la vista previa no se muestra y el campo queda como está hasta el envío.

**D-008-05. El alta crea solo el producto; el segundo paso es la edición (SUPUESTO S-008-05).**
- POST /api/products acepta name, category y priceCents, y el producto nace activo (RN-005-09). Las presentaciones y los componentes cuelgan de un producto existente (PUT .../portions y .../items exigen el id), así que se cargan después, desde /admin/carta/[id].
- Destino tras el 201: si la categoría creada es 'chicken' o 'combo', replace a /admin/carta/<id> para cargar en seguida la grilla o los componentes (esas categorías casi siempre necesitan el segundo paso); con cualquier otra, replace a /admin/carta para seguir agregando platos, bebidas y extras de corrido. En ambos casos se invalida la consulta de la lista.
- El campo Precio sigue siendo obligatorio en el alta aunque sea 'chicken' (lo exige la API): la ayuda del campo lo aclara (para un pollo con presentaciones queda de referencia, D-006-05).

**D-008-06. La edición es una página con secciones apiladas, no pestañas (SUPUESTO S-008-06).**
- /admin/carta/[id] obtiene el producto de la misma consulta de la lista (no hay GET de detalle — patrón de la 004 con usuarios). Si el id no está en la lista: 'Ese producto no existe.' sin formulario.
- Orden de secciones: 'Datos' (nombre, categoría y precio, PATCH), después 'Presentaciones del pollo' (solo si la categoría guardada es 'chicken') o 'Componentes del combo' (solo si es 'combo'), y 'Estado' al final. Apiladas y no pestañas: a 360 px se recorren con scroll sin ocultar nada, igual que la página de edición de usuario.
- Las secciones condicionales dependen de la categoría guardada en el servidor, no del selector en borrador: cambiar la categoría a 'chicken' o 'combo' y guardar hace aparecer la sección correspondiente tras el 200.
- El selector de categoría queda habilitado siempre; los 409 del servidor se muestran tal cual — sus mensajes ya dicen qué hacer — y las secciones de presentaciones y componentes llevan una nota fija que lo anticipa: mientras tenga filas cargadas, la categoría no se puede cambiar.

**D-008-07. Grilla de presentaciones del pollo: seis filas fijas, un solo PUT (SUPUESTO S-008-07).**
- Seis filas en el orden de la 006 (D-006-11): Octavo — pecho, Octavo — pierna, Cuarto — pecho, Cuarto — pierna, Medio pollo, Pollo entero. Cada fila: un checkbox accesible con esa etiqueta y un campo 'Precio de <etiqueta>' que solo se habilita con la fila marcada.
- Las filas que ya existen en GET /portions llegan marcadas con su precio en soles; las demás, desmarcadas y vacías. 'Guardar presentaciones' arma el PUT con las filas marcadas (cut null en medio y entero; los precios convertidos a céntimos). Guardar sin ninguna marcada envía { portions: [] } y deja el producto sin presentaciones (RN-006-06: vuelve a venderse como ítem simple).
- Grilla fija y no filas dinámicas: son todas las combinaciones posibles (PRODUCT_PORTIONS_MAX = 6), el admin reconoce de inmediato la tabla de precios como la piensa y los repetidos quedan imposibles por construcción.

**D-008-08. Editor de componentes del combo con filas dinámicas (SUPUESTO S-008-08).**
- Cada fila es un grupo con nombre accesible 'Componente N' que contiene: el selector 'Producto' (opción vacía 'Elige un producto' y, debajo, todos los productos de la carta que NO son de categoría 'combo' — ni el propio ni otros — agrupados por categoría en el orden de la carta; los inactivos marcados con ' (desactivado)'), el campo 'Cantidad' (entero de 1 a 99) y, solo cuando el producto elegido es 'chicken', 'Presentación' (Octavo, Cuarto, Medio pollo, Pollo entero) y 'Parte' (Pecho, Pierna).
- Preselección al elegir un producto 'chicken': presentación 'quarter' y parte 'leg' (cuarto de pierna, lo más común en un combo); al elegir 'half' o 'whole' el control 'Parte' desaparece y la fila viaja con cut null; al elegir un producto de otra categoría ambos desaparecen y viajan null (RN-007-05).
- 'Agregar componente' añade una fila vacía; 'Quitar' borra su fila; 'Guardar componentes' envía el PUT completo y, sin filas, envía { items: [] } (RN-007-09: el combo queda vendible como ítem simple). Con diez filas el botón de agregar queda deshabilitado con la nota 'Un combo admite hasta 10 componentes.' (COMBO_ITEMS_MAX).
- El selector de producto no ofrece combos: la auto-referencia y la anidación quedan imposibles por construcción (RN-007-04); el 400 del servidor sigue cubriendo cualquier otra forma inválida.

**D-008-09. Comparación del combo: "por separado suman S/ X, el combo cuesta S/ Y" (SUPUESTO S-008-09).**
- Se calcula sobre las filas del formulario (lo que se va a guardar), no sobre lo ya guardado: una fila suma solo cuando está completa (producto elegido y, si es pollo, su presentación elegida); una fila sin producto no suma; sin filas completas la comparación no se muestra.
- Precio de referencia por componente: si no es 'chicken', quantity por product.priceCents (el precio viene embebido en el GET de items y en la lista). Si es 'chicken', quantity por el precio de la presentación elegida en su venta suelta: se consulta GET /api/products/{id}/portions de cada producto 'chicken' distinto referenciado (en la práctica 1 a 3 consultas, cacheadas por TanStack Query con la clave compartida de la sección de presentaciones); si esa presentación no se vende suelta (válido por D-007-04), respaldo al priceCents del producto.
- El precio del combo en la comparación es el guardado (el priceCents actual del producto), no el del campo Precio en borrador: las secciones son independientes y no se mezclan estados. El dueño que quiere ajustar edita 'Datos', guarda y relee la comparación.
- Textos: 'Los componentes por separado suman S/ 35.00.' y 'El combo cuesta S/ 30.00 (S/ 5.00 menos que por separado).', con '(S/ Z más que por separado).' si la suma es menor o '(igual que por separado).' si coincide. Nota fija bajo la comparación: 'La suma usa el precio de venta suelto de cada componente; si el pollo no vende suelta esa presentación, se usa el precio base del producto.'

**D-008-10. Desactivar y activar, desde la lista y desde la edición (SUPUESTO S-008-10).**
- En la fila de la lista y en la sección 'Estado' de la edición: 'Desactivar' pide confirmación '¿Desactivar <nombre>? Dejará de aparecer en la carta.' con 'Sí, desactivar' y 'Cancelar'; 'Activar' actúa sin confirmación. Ambos envían PATCH /api/products/{id} con { isActive }. Mismo patrón que el de usuarios (AC-25 de la 004).
- Un producto desactivado sigue editable y configurable (RN-005-04; los PUT de presentaciones y componentes lo aceptan): la página no cambia salvo la marca 'Desactivado'.

**D-008-11. Cliente HTTP, funciones de API y etiquetas en la web.**
- ApiRequestOptions.method suma 'PUT' en apps/web/src/lib/api/client.ts (igual que la 004 sumó 'PATCH'). Nada más cambia en el cliente central.
- apps/web/src/lib/api/products.ts (nuevo), con el patrón de users.ts: getProducts (GET /products, productsResponseSchema), createProduct (POST, expectedStatus 201, productSchema), updateProduct (PATCH, 200, productSchema), getProductPortions (GET .../portions, productPortionsResponseSchema), replaceProductPortions (PUT, 200, productPortionsResponseSchema), getComboItems (GET .../items, comboItemsResponseSchema) y replaceComboItems (PUT, 200, comboItemsResponseSchema). Cada respuesta se valida con su esquema de shared (UNEXPECTED_RESPONSE si no cuadra) y los errores llegan como ApiError con code, message y details.
- Etiquetas de la carta en apps/web/src/lib/menu-labels.ts (nuevo): PRODUCT_CATEGORY_LABELS (chicken 'Pollo', combo 'Combos', dish 'Platos', drink 'Bebidas', dessert 'Postres', sauce 'Cremas', extra 'Extras', en el orden del enum), PORTION_LABELS (eighth 'Octavo', quarter 'Cuarto', half 'Medio pollo', whole 'Pollo entero'), CUT_LABELS (breast 'Pecho', leg 'Pierna') y formatPortionCutLabel(portion, cut): 'Octavo — pecho' en las de una parte y 'Medio pollo' / 'Pollo entero' en las mixtas. Las etiquetas viven en la web (son interfaz en español), igual que ROLE_LABELS.
- TanStack Query con retry: false. Claves: ['admin', 'products'] para la lista; ['admin', 'products', id, 'portions'] y ['admin', 'products', id, 'items'] para las secciones. Tras cada mutación exitosa se invalida la consulta correspondiente y la lista.

**D-008-12. Errores en pantalla y validación local (SUPUESTO S-008-12).**
- Antes de enviar, la página valida el cuerpo ya armado con los mismos esquemas de shared (patrón de la 004): createProductRequestSchema o updateProductRequestSchema con el precio ya convertido a céntimos, replaceProductPortionsRequestSchema para la grilla y replaceComboItemsRequestSchema para los componentes. El primer issue se muestra; los issues con path 'portions.N.*' o 'items.N.*' se llevan a la fila N del envío.
- Validaciones propias de la web: precio que no parsea, PRICE_INPUT_MESSAGE junto al campo o la fila; categoría sin elegir, 'Elige una categoría.'; fila de componente sin producto, 'Elige el producto.'; fila de componente 'chicken' sin presentación, 'Elige la presentación del pollo.'.
- Del servidor: los 400 con issues se reparten por fila según el índice del path; los 409 (PRODUCT_NAME_TAKEN, PORTIONS_NOT_ALLOWED, COMBO_ITEMS_NOT_ALLOWED, PRODUCT_HAS_PORTIONS, PRODUCT_HAS_ITEMS, PRODUCT_IS_COMPONENT) muestran su message tal cual; un 404 muestra 'Ese producto no existe.'; el error de red muestra 'Sin conexión con el servidor. Revisa el wifi e intenta de nuevo.' (apiErrorMessage de la 004).
- Un solo envío en vuelo por acción: marca síncrona con useRef más isPending (lección ADV-004-31); los botones muestran 'Creando...'/'Guardando...' deshabilitados mientras envían.
- Sesión vencida con la página abierta: la siguiente consulta o mutación responde 401 y el cliente central redirige a /login (mecanismo de la 003).

**D-008-13. Usable a 360 px y en la PC del local (SUPUESTO S-008-13).**
- Botones, enlaces y controles de al menos 48 px de alto (min-h-12, como en la 004), diseño apilado fluido dentro del marco de RoleGuard (max-w-3xl), selectores nativos (select con optgroup, accesibles y robustos en celulares) y campos a todo el ancho. Sin recursos de internet (RN-001-04, verificación R-14 de la 001) y todo por el mismo origen /api: el navegador nunca habla directo con la API.
- Se verifica con el recorrido E2E del proyecto mobile-chrome (360x740) y en la verificación manual con el celular.

**D-008-14. Pruebas E2E: sí, cuatro recorridos (SUPUESTO S-008-14).**
- Tres en desktop-chrome — alta de un plato con desactivar/reactivar, grilla de presentaciones de un pollo y armado de un combo con su comparación — y uno en mobile-chrome a 360x740 que verifica que no haya desplazamiento horizontal en las pantallas. Playwright ya levanta API y web contra polleria_test (misma infraestructura de la 004).
- e2e/global-setup.ts (lo ajusta el test-writer): conserva los usuarios actuales y además limpia la carta de pruebas con clearMenuTables (products, product_portions y combo_items ya están autorizadas en polleria_test por D-006-10 y D-007-14) y crea la semilla: 'E2E Pollo' (chicken, precio base 6500, con presentaciones cuarto pecho 1800, cuarto pierna 1700 y entero 6500), 'E2E Chaufa' (dish, 1400) y 'E2E Gaseosa' (drink, 400). Los productos que las pruebas crean por la interfaz quedan truncados por la misma limpieza en la corrida siguiente (los productos no se borran por API; la limpieza es el SQL autorizado de siempre sobre la base de pruebas).

**D-008-15. Sin cambios de contrato, de base, de configuración ni de dependencias.**
- openapi.yaml queda en 0.7.0; apps/api y la base no se tocan (apps/api queda sin diff, incluidos sus tests: no hay comportamiento de API nuevo que probar); .env.example y CONFIG_VARIABLES iguales; sin paquetes nuevos; sin ADR — todo es composición de lo ya decidido.

## 4. Criterios de aceptación

Datos comunes para las pruebas de componentes y de funciones de la web (AC-03 a AC-17): MSW intercepta las llamadas /api en el nivel fetch; useRouter está espiado (replace, push) y useParams devuelve el id de cada caso; el espía de /auth/me responde sesión de administrador salvo que se diga lo contrario; el render usa el contenedor de la 004 (Providers con TanStack Query). Los nombres de prueba empiezan con el ID del AC.

### 4.1 Utilidades de dinero y cliente de la API

**AC-01. formatSoles** (unitaria, packages/shared)
- Dado formatSoles exportado por @polleria/shared,
- entonces formatSoles(1850) devuelve 'S/ 18.50', formatSoles(0) 'S/ 0.00', formatSoles(5) 'S/ 0.05', formatSoles(700) 'S/ 7.00' y formatSoles(99999) 'S/ 999.99';
- y lanza error con -1, 18.5, NaN, '1850' y null: solo acepta enteros mayores o iguales a 0 (el dinero es un entero de céntimos, regla 2).

**AC-02. parseSolesToCents y PRICE_INPUT_MESSAGE** (unitaria, packages/shared)
- Dado parseSolesToCents y PRICE_INPUT_MESSAGE,
- entonces PRICE_INPUT_MESSAGE es 'Escribe el precio en soles (por ejemplo 18.50). El máximo es S/ 999.99.';
- y parseSolesToCents devuelve: '18' -> 1800, '18.5' -> 1850, '18.50' -> 1850, '18,50' -> 1850, ' 18.50 ' -> 1850, '0' -> 0, '0.00' -> 0, '0.05' -> 5 y '999.99' -> 99999;
- y devuelve null con '', '  ', 'abc', '18,5,0', '18.50.0', '-1', '18.505' (tres decimales), '.5', '18.', 'S/ 18.50' y '1 850'.

**AC-03. Etiquetas de la carta en la web** (unitaria, apps/web/src/lib)
- Dado PRODUCT_CATEGORY_LABELS, PORTION_LABELS, CUT_LABELS y formatPortionCutLabel de apps/web/src/lib/menu-labels.ts,
- entonces las siete categorías tienen su etiqueta en español (chicken 'Pollo', combo 'Combos', dish 'Platos', drink 'Bebidas', dessert 'Postres', sauce 'Cremas', extra 'Extras') y están todas las claves del enum;
- PORTION_LABELS es eighth 'Octavo', quarter 'Cuarto', half 'Medio pollo', whole 'Pollo entero'; CUT_LABELS es breast 'Pecho', leg 'Pierna';
- y formatPortionCutLabel devuelve: ('eighth','breast') -> 'Octavo — pecho', ('quarter','leg') -> 'Cuarto — pierna', ('half',null) -> 'Medio pollo' y ('whole',null) -> 'Pollo entero'.

**AC-04. Cliente PUT y funciones de la carta** (unitaria, apps/web/src/lib/api, con MSW)
- Dado apiClient con 'PUT' permitido en ApiRequestOptions.method y apps/web/src/lib/api/products.ts,
- entonces getProducts hace GET /products y valida con productsResponseSchema (una respuesta mal formada rechaza con ApiError UNEXPECTED_RESPONSE y el status real);
- createProduct hace POST /products con expectedStatus 201 y devuelve el Product validado; updateProduct hace PATCH /products/<id> con 200; getProductPortions hace GET /products/<id>/portions y valida con productPortionsResponseSchema; replaceProductPortions hace PUT /products/<id>/portions con 200; getComboItems hace GET /products/<id>/items y valida con comboItemsResponseSchema; replaceComboItems hace PUT /products/<id>/items con 200;
- y un error del servidor rechaza con ApiError conservando code, message y details: 409 PRODUCT_NAME_TAKEN, 400 VALIDATION_ERROR con issues del tipo 'items.1.productId', 409 COMBO_ITEMS_NOT_ALLOWED y 404 PRODUCT_NOT_FOUND.

### 4.2 Lista de la carta (/admin/carta)

**AC-05. Enlace y guardias** (componente)
- Dado /admin con sesión de administrador,
- entonces la página muestra el enlace 'Carta' con href '/admin/carta' junto al de 'Usuarios';
- y las tres páginas nuevas envuelven su contenido en RoleGuard con area '/admin': con sesión de cajero llaman replace('/caja') sin mostrar contenido de la carta, y con 401 UNAUTHENTICATED llaman hardNavigate('/login').

**AC-06. Lista agrupada con estados** (componente)
- Dado GET /api/products que devuelve 'Pollo a la brasa' (chicken, 6500, activo), 'Mostrito' (combo, 2200, activo), 'Chaufa' (dish, 1400, activo), 'Inca Kola' (drink, 400, activo), 'Ají' (sauce, 0, activo) y 'Tres Leches' (dessert, 500, inactivo),
- mientras carga muestra 'Cargando carta...' con role status; luego el h1 'Carta', el enlace 'Agregar producto' hacia /admin/carta/nuevo y una sección con h2 por categoría presente, en el orden de la carta: Pollo, Combos, Platos, Bebidas, Postres, Cremas (Extras no aparece porque no tiene productos);
- cada fila muestra el nombre, el precio formateado ('S/ 65.00', 'S/ 0.00' para Ají), la marca 'Desactivado' solo en Tres Leches, el enlace 'Editar' hacia /admin/carta/<id> y el botón 'Desactivar' o 'Activar' según el estado;
- y con la lista vacía muestra 'La carta está vacía.' manteniendo el enlace 'Agregar producto'; con un 500 o error de red muestra 'No se pudo cargar la carta.' con role alert y un 'Reintentar' que vuelve a consultar.

**AC-07. Activar y desactivar desde la lista** (componente)
- Dado la lista cargada,
- al tocar 'Desactivar' en una fila aparece el mensaje '¿Desactivar <nombre>? Dejará de aparecer en la carta.' con 'Sí, desactivar' y 'Cancelar'; al confirmar se hace un solo PATCH /api/products/<id> con { isActive: false } y la fila pasa a mostrar 'Desactivado' con el botón 'Activar';
- 'Cancelar' no envía nada; con un producto inactivo, 'Activar' envía { isActive: true } sin confirmación;
- y con error de red o un 404 la fila no cambia y se muestra el mensaje correspondiente.

### 4.3 Alta (/admin/carta/nuevo)

**AC-08. Formulario de alta** (componente)
- Dado /admin/carta/nuevo,
- entonces muestra el h1 'Agregar producto', el enlace 'Volver a la carta', el campo 'Nombre del producto', el grupo 'Categoría' con un radio por categoría en el orden de la carta (Pollo, Combos, Platos, Bebidas, Postres, Cremas, Extras; ninguna preseleccionada), el campo 'Precio' con inputMode decimal y la ayuda 'En soles, por ejemplo 18.50.', y el botón 'Crear producto';
- al escribir '18.50' en Precio se ve la vista previa 'S/ 18.50'; al enviar válido se hace un solo POST /api/products con { name, category, priceCents } en céntimos y el botón queda deshabilitado con 'Creando...' (un doble toque no duplica el POST);
- tras el 201, si la categoría era 'chicken' o 'combo' llama replace('/admin/carta/<id del creado>'), y con cualquier otra replace('/admin/carta'); en ambos casos invalida la consulta de la lista;
- y sin enviar muestra: nombre vacío o inválido, el mensaje del esquema; categoría sin elegir, 'Elige una categoría.'; precio vacío o no parseable, PRICE_INPUT_MESSAGE junto al campo.

**AC-09. Errores del alta** (componente)
- Dado el formulario de alta enviado y la API respondiendo 409 PRODUCT_NAME_TAKEN,
- entonces muestra 'Ya existe un producto con ese nombre.' con role alert y no navega;
- con un 400 de validación muestra el primer issue; con error de red muestra 'Sin conexión con el servidor. Revisa el wifi e intenta de nuevo.';
- y en todos los casos conserva lo escrito (nombre, categoría y precio) y permite reenviar.

### 4.4 Edición (/admin/carta/[id]): datos y estado

**AC-10. Carga y sección Datos** (componente)
- Dado /admin/carta/<id> con el id dentro de la lista devuelta por GET /api/products,
- mientras la lista carga muestra 'Cargando...' con role status; si el id no está en la lista muestra 'Ese producto no existe.' sin formulario y con el enlace 'Volver a la carta';
- con el producto encontrado muestra el h1 'Editar producto' y la sección 'Datos' con el nombre actual, la categoría actual y el precio actual en soles ('65.00' para 6500), más el botón 'Guardar cambios';
- al enviar hace PATCH /api/products/<id> con { name, category, priceCents } ya convertidos; con el 200 muestra 'Cambios guardados.' y la página refleja lo nuevo;
- y al guardar un cambio de categoría hacia 'chicken' o 'combo' aparece tras el 200 la sección correspondiente (grilla de presentaciones o editor de componentes) con su estado vacío.

**AC-11. Errores de edición, nota de referencia y sección Estado** (componente)
- Dado la página de edición cargada,
- entonces un PATCH con nombre repetido muestra 'Ya existe un producto con ese nombre.'; cambiar la categoría de un 'chicken' con presentaciones muestra 'Este producto tiene presentaciones de pollo; quítalas antes de cambiar su categoría.'; la de un 'combo' con componentes muestra el mensaje de PRODUCT_HAS_ITEMS; la de un producto que es componente de un combo muestra el de PRODUCT_IS_COMPONENT; y un 404 muestra 'Ese producto no existe.' — cada 409/404 con el message del servidor y sin que nada cambie;
- con un 'chicken' que sí tiene presentaciones cargadas (GET .../portions devuelve filas), el campo Precio muestra la nota 'El cobro usa el precio de cada presentación; este precio queda solo de referencia.';
- y la sección 'Estado' muestra 'Desactivar' o 'Activar' según el estado: 'Desactivar' abre la misma confirmación de la lista ('¿Desactivar <nombre>? Dejará de aparecer en la carta.'), 'Activar' envía el PATCH directo; tras el 200 la marca y el botón cambian.

### 4.5 Presentaciones del pollo (/admin/carta/[id], categoría chicken)

**AC-12. Grilla precargada y guardado** (componente)
- Dado un producto cuya categoría guardada es 'chicken',
- entonces la página muestra la sección 'Presentaciones del pollo' (un producto de otra categoría no la muestra) con la nota fija 'Mientras tenga presentaciones cargadas, la categoría del producto no se puede cambiar.';
- con GET /products/<id>/portions que devuelve (quarter, breast, 1850) y (whole, null, 6000): las seis filas en orden Octavo — pecho, Octavo — pierna, Cuarto — pecho, Cuarto — pierna, Medio pollo, Pollo entero; marcadas 'Cuarto — pecho' con '18.50' y 'Pollo entero' con '60.00'; las demás desmarcadas con su precio vacío y deshabilitado;
- al marcar 'Cuarto — pierna' con '18.90' y guardar, se envía PUT /api/products/<id>/portions con las tres filas marcadas en céntimos (cut null en las mixtas) y se muestra 'Presentaciones guardadas.' invalidando la consulta;
- y guardar sin ninguna fila marcada envía { portions: [] } (quita todas las presentaciones).

**AC-13. Validación local y errores por fila** (componente)
- Dado la grilla de presentaciones,
- entonces una fila marcada con el precio vacío o no parseable muestra PRICE_INPUT_MESSAGE junto a esa fila y no se envía; un precio fuera del rango ('1050' -> S/ 1050.00 supera el máximo) muestra el mismo mensaje;
- un 400 con issues en paths 'portions.N.priceCents' muestra cada mensaje junto a la fila enviada en la posición N, y un issue de raíz ('portions' o el de repetidas) como mensaje de la sección;
- un 409 PORTIONS_NOT_ALLOWED (la categoría cambió por otra sesión) muestra su mensaje; el error de red muestra el mensaje de red; en todos los casos el formulario conserva lo marcado y se puede reintentar.

### 4.6 Componentes del combo (/admin/carta/[id], categoría combo)

**AC-14. Editor de componentes** (componente)
- Dado un producto cuya categoría guardada es 'combo',
- entonces la página muestra la sección 'Componentes del combo' (otra categoría no la muestra);
- con GET /products/<id>/items que devuelve tres componentes (E2E Pollo quarter leg x1, Chaufa x1, Gaseosa x1): las filas 'Componente 1' a 'Componente 3' llegan pobladas con producto, cantidad y — en la de pollo — presentación y parte; 'Quitar' borra su fila; 'Agregar componente' añade una fila vacía;
- al guardar se envía PUT /api/products/<id>/items con la lista armada (portion y cut null en los que no son chicken); el 200 muestra 'Componentes guardados.' e invalida la consulta;
- sin filas, el guardar envía { items: [] } y la sección muestra 'Este combo todavía no tiene componentes.' con la nota 'Un combo sin componentes se vende como un producto simple.';
- y la nota fija 'Mientras tenga componentes cargados, la categoría del producto no se puede cambiar.'.

**AC-15. Candidatos y campos por tipo de componente** (componente)
- Dado el editor de componentes con la lista de productos cargada,
- entonces el selector 'Producto' de cada fila ofrece todos los productos que no son 'combo' (ni el propio combo ni otros), agrupados por categoría en el orden de la carta, con los inactivos marcados ' (desactivado)';
- al elegir un producto 'chicken' aparecen 'Presentación' (Octavo, Cuarto, Medio pollo, Pollo entero; preseleccionado Cuarto) y 'Parte' (Pecho, Pierna; preseleccionada Pierna); al elegir 'Medio pollo' o 'Pollo entero' la 'Parte' desaparece y la fila viaja con cut null; al elegir un producto que no es chicken ambos campos desaparecen y viajan null;
- y con diez filas el botón 'Agregar componente' queda deshabilitado con la nota 'Un combo admite hasta 10 componentes.'.

**AC-16. Comparación de precio del combo** (componente)
- Dado el editor de componentes de un combo cuyo precio guardado es 3000,
- con las filas completas 'E2E Pollo' x1 con cuarto de pierna, 'E2E Chaufa' x1 y 'E2E Gaseosa' x1, y con GET /products/<id del pollo>/portions que devuelve cuarto pierna a 1700,
- entonces se muestra 'Los componentes por separado suman S/ 35.00.' y 'El combo cuesta S/ 30.00 (S/ 5.00 menos que por separado).';
- si la suma quedara por debajo del precio del combo muestra '(S/ Z más que por separado).', y si coinciden '(igual que por separado.)';
- un componente 'chicken' cuya presentación no se vende suelta usa el priceCents del producto (respaldo) y la nota fija lo explica; una fila sin producto elegido no suma; sin filas completas la comparación no aparece;
- y un componente marcado ' (desactivado)' suma igual en la comparación con su precio actual.

**AC-17. Errores por fila y de conjunto en componentes** (componente)
- Dado el editor de componentes,
- entonces una fila sin producto elegido muestra 'Elige el producto.' junto a la fila; una fila 'chicken' sin presentación muestra 'Elige la presentación del pollo.'; una cantidad inválida muestra el mensaje del esquema; en ninguno de esos casos se envía el PUT;
- un 400 con issues 'items.1.productId' ('Ese producto no existe.') o 'items.0.portion' muestra cada mensaje junto a su fila según el índice N; un issue de raíz ('Hay componentes repetidos en la lista.' o el del tope) aparece como mensaje de la sección;
- un 409 COMBO_ITEMS_NOT_ALLOWED y un 404 PRODUCT_NOT_FOUND muestran su mensaje; tras cualquier error nada cambia en el servidor (el PUT es atómico) y una recarga muestra el conjunto anterior.

### 4.7 Extremo a extremo (Playwright, sobre polleria_test)

e2e/global-setup.ts conserva los usuarios de siempre y además limpia la carta de pruebas y crea la semilla de D-008-14 ('E2E Pollo' chicken 6500 con cuarto pecho 1800, cuarto pierna 1700 y entero 6500; 'E2E Chaufa' dish 1400; 'E2E Gaseosa' drink 400).

**AC-18. Alta de un plato y activar/desactivar** (E2E, desktop-chrome)
- Dado el administrador en la sesión de pruebas,
- cuando entra a /admin, toca 'Carta', luego 'Agregar producto', completa 'Salchipapa E2E' con categoría Platos y precio '12.50' y confirma,
- entonces vuelve a /admin/carta y la fila aparece en la sección Platos con 'S/ 12.50'; al tocar 'Desactivar' y confirmar 'Sí, desactivar' la fila muestra 'Desactivado'; y al tocar 'Activar' la marca desaparece.

**AC-19. Grilla de presentaciones** (E2E, desktop-chrome)
- Dado el administrador en la sesión de pruebas,
- cuando crea 'Pollo Broaster E2E' (categoría Pollo, precio '45.00'), aterriza en su página de edición, marca 'Cuarto — pecho' con '19.90', 'Cuarto — pierna' con '18.90' y 'Pollo entero' con '72.00', y guarda,
- entonces ve 'Presentaciones guardadas.'; y al recargar la página las tres filas siguen marcadas con sus precios y las demás desmarcadas.

**AC-20. Armar un combo y comparar** (E2E, desktop-chrome)
- Dado el administrador en la sesión de pruebas,
- cuando crea 'Mostrito E2E' (categoría Combos, precio '30.00'), aterriza en su edición, agrega tres componentes (E2E Pollo cantidad 1 con Cuarto y Pierna; E2E Chaufa cantidad 1; E2E Gaseosa cantidad 1) y guarda,
- entonces ve 'Los componentes por separado suman S/ 35.00.' y 'El combo cuesta S/ 30.00 (S/ 5.00 menos que por separado).', el mensaje 'Componentes guardados.', y al recargar las tres filas siguen con sus valores.

**AC-21. A 360 px sin desborde** (E2E, mobile-chrome)
- Dado el administrador en la sesión de pruebas con el viewport 360x740,
- cuando recorre /admin/carta, el formulario de alta, la edición de un producto con grilla de presentaciones y la de un combo con el editor de componentes,
- entonces en cada pantalla el ancho del documento no supera el viewport (no hay desplazamiento horizontal) y todos los controles siguen siendo accesibles.

### 4.8 Cobertura de requisitos

| Requisito | AC que lo cubren |
| --- | --- |
| RF-18 (crear/editar productos, combos, presentaciones y precios; activar/desactivar) | AC-05 a AC-21 |
| RF-19 (presentaciones del pollo configurables; la parte de dominio la cubrieron 006 y 007) | AC-12, AC-13, AC-14, AC-15, AC-19, AC-20 |
| RNF-12 (la carta se configura sin tocar código ni la base) | AC-05 a AC-21 |
| RNF-02 (español sencillo, botones grandes) | AC-05 a AC-17, AC-21 |
| RNF-05 / RNF-07 / RNF-08 (mismo origen, sin internet, 360 px) | AC-21 y R-008-04 |
| RNF-09 (solo admin gestiona la carta) | AC-05 |
| Regla de dominio 2 (dinero en céntimos; soles solo en la interfaz) | AC-01, AC-02, AC-04, AC-08, AC-12 |

## 5. Requisitos verificables

| ID | Requisito | Cómo se verifica |
| --- | --- | --- |
| R-008-01 | docs/api/openapi.yaml queda en la versión 0.7.0 sin cambios y sigue válido | diff vacío en docs/api/openapi.yaml respecto a main; lint de Redocly como en las specs anteriores |
| R-008-02 | apps/api no cambia: ni rutas, ni servicios, ni modelos, ni tests (la 008 no toca el backend) | git status --porcelain apps/api vacío al cerrar la funcionalidad |
| R-008-03 | Sin migraciones ni variables de entorno nuevas | diff vacío en las migraciones y en apps/api/.env.example y apps/web/.env.example |
| R-008-04 | La web sigue sin recursos de internet y llama solo a /api del mismo origen | grep de R-14 de la 001 sobre apps/web/src y revisión del cliente |
| R-008-05 | Cobertura de líneas: 90 % o más en packages/shared (las funciones nuevas son puras) y 80 % o más en apps/web | pnpm test:coverage |
| R-008-06 | Definición de terminado de CLAUDE.md | pnpm test, pnpm lint, pnpm typecheck y pnpm test:e2e en verde; cada AC con al menos una prueba que empieza con su ID |
| R-008-07 | Las tres páginas nuevas pasan por RoleGuard area '/admin' (la web solo decide qué mostrar; la seguridad real es la API, ya probada en las specs anteriores) | el reviewer lee las páginas |

## 6. Reglas de negocio

Las reglas de dominio ya fijadas en specs anteriores siguen vigentes y las pantallas las respetan sin reabrirlas:

- De la 005: solo admin escribe (cualquier rol con sesión lee, RN-005-01/02); precio entero de céntimos entre 0 y 99999 (RN-005-03); desactivar no borra y un inactivo sigue editable (RN-005-04); el producto nace activo (RN-005-09); nombre único sin distinguir mayúsculas.
- De la 006: solo 'chicken' lleva presentaciones (RN-006-03); el PUT de presentaciones reemplaza el conjunto entero de forma atómica (RN-006-05); sin presentaciones el pollo se vende como ítem simple (RN-006-06); tope de seis combinaciones (RN-006-08).
- De la 007: solo 'combo' lleva componentes (RN-007-03); un combo no contiene combos ni se contiene a sí mismo (RN-007-04); componente de pollo lleva presentación, y parte solo en octavo y cuarto (RN-007-05); el precio del combo es el priceCents del producto, fijo (RN-007-07); PUT atómico (RN-007-08); combo vacío válido (RN-007-09); componentes inactivos permitidos y visibles (RN-007-10, RN-007-12); tope de diez componentes y cantidad de 1 a 99 (RN-007-14).
- De la 001 y CLAUDE.md: la web funciona en la red local sin internet y sin recursos externos (RN-001-04, regla 9); el dinero es entero de céntimos y solo se formatea a soles en la interfaz (regla 2); los textos son español de Perú sencillo.

Reglas nuevas de esta spec (todas de interfaz; ninguna cambia el dominio):

| ID | Regla |
| --- | --- |
| RN-008-01 | Las pantallas no agregan ni modifican endpoints: consumen el contrato 0.7.0 tal cual. |
| RN-008-02 | En la interfaz el precio se escribe en soles y se muestra 'S/ X.XX'; viaja y se guarda como entero de céntimos. El campo Precio muestra la vista previa en soles mientras el texto es válido. |
| RN-008-03 | La lista de administración muestra todos los productos (activos e inactivos) agrupados por categoría en el orden de la carta, sin paginar ni buscar. |
| RN-008-04 | En un componente de combo, 'combo' nunca es opción del selector; presentación y parte solo existen para componentes 'chicken', y parte solo con octavo o cuarto. |
| RN-008-05 | Guardar la grilla o los componentes reemplaza el conjunto completo (PUT): lo desmarcado o quitado se borra del servidor en el mismo envío. |
| RN-008-06 | Desactivar un producto pide confirmación ('¿Desactivar <nombre>? Dejará de aparecer en la carta.'); activar no. |

## 7. Casos borde conocidos

- Escribir '1850' pensando en céntimos: la vista previa muestra 'S/ 1850.00' y el tope (S/ 999.99) lo rechaza — el error se ve antes de guardar (RN-008-02).
- Pollo con presentaciones: su priceCents queda de referencia (D-006-05) y la página lo aclara con la nota junto al campo; un chicken sin presentaciones se vende como ítem simple a ese precio (RN-006-06).
- Combo: un componente desactivado se marca ' (desactivado)' y suma igual en la comparación; una presentación que el pollo no vende suelta usa el precio base del producto como referencia, con la nota fija (D-008-09).
- Dos administradores editando a la vez: gana el último PATCH/PUT (el servidor serializa y las transacciones de las 006/007 lo mantienen consistente); cada pantalla relee después de guardar.
- PUT de presentaciones o componentes sobre un producto cuya categoría cambió por otra sesión: 409 PORTIONS_NOT_ALLOWED o COMBO_ITEMS_NOT_ALLOWED con su mensaje.
- Cambiar la categoría de un producto que es componente de un combo: 409 PRODUCT_IS_COMPONENT con su mensaje.
- Sesión vencida con el formulario abierto: el 401 del siguiente envío lleva a /login por el cliente central.
- Doble toque en un botón de guardar: un solo envío (marca síncrona con useRef más isPending).
- Issues de raíz del PUT (componentes repetidos, tope) como mensaje de la sección; issues por índice junto a su fila.
- Los id de las filas de portions/items no son estables entre PUTs: la pantalla no los guarda, vuelve a consultar después de guardar.
- Formulario con cambios sin guardar al salir: no hay aviso de 'cambios sin guardar' (fuera de alcance; la 004 tampoco lo tiene).
- El precio del combo que cobra es el priceCents del producto (RN-007-07): la comparación es solo referencia para el admin y no pisa nada.
- Al cambiar la 'Presentación' de un componente de pollo a Medio o Entero, la 'Parte' se descarta y viaja null (RN-007-05).
- Los productos 'sauce' y 'extra' también pueden ser componentes de un combo (cremas y descartables dentro de un mostrito).
- Id de producto que no está en la lista al abrir /admin/carta/<id>: 'Ese producto no existe.' con el enlace de vuelta.

## 8. Modelo de datos

Sin cambios: ni tablas, ni columnas, ni migraciones (D-008-01, D-008-15). Los datos de esta spec ya existen en products, product_portions y combo_items de las specs 005, 006 y 007.

## 9. API

Sin cambios de contrato: docs/api/openapi.yaml queda en la versión 0.7.0. Las pantallas consumen:

| Método y ruta | Uso en la pantalla |
| --- | --- |
| GET /api/products | Lista completa de la carta (un admin la ve entera, con activos e inactivos) |
| POST /api/products | Alta de producto |
| PATCH /api/products/{productId} | Edición de datos (nombre, categoría, precio) y activar/desactivar |
| GET /api/products/{productId}/portions | Precarga de la grilla y precio de referencia de los componentes de pollo del combo |
| PUT /api/products/{productId}/portions | Guardar la grilla de presentaciones |
| GET /api/products/{productId}/items | Precarga del editor de componentes |
| PUT /api/products/{productId}/items | Guardar componentes del combo |

Errores que las pantallas manejan: 400 VALIDATION_ERROR (issues por path, incluidos portions.N.* e items.N.*), 401 UNAUTHENTICATED (lleva a /login), 403 FORBIDDEN, 404 PRODUCT_NOT_FOUND y los 409 PRODUCT_NAME_TAKEN, PORTIONS_NOT_ALLOWED, COMBO_ITEMS_NOT_ALLOWED, PRODUCT_HAS_PORTIONS, PRODUCT_HAS_ITEMS y PRODUCT_IS_COMPONENT. Sin eventos de Socket.IO.

## 10. Interfaz

Textos en español de Perú, botones de al menos 48 px, marco de RoleGuard. Las rutas exactas de los componentes internos las decide el implementador dentro de apps/web/src/components/menu/; lo que fija esta spec son los nombres accesibles y los textos (los tests los buscan por rol y nombre).

### 10.1 /admin

- La página de administración de la 004 muestra el enlace 'Carta' junto a 'Usuarios'.

### 10.2 /admin/carta — lista

- h1 'Carta'; enlace 'Agregar producto' hacia /admin/carta/nuevo.
- Una sección por categoría con productos, con h2 con la etiqueta (Pollo, Combos, Platos, Bebidas, Postres, Cremas, Extras), en el orden de la carta; dentro de cada sección las filas en el orden que devuelve la API.
- Cada fila: nombre del producto, precio 'S/ X.XX', marca 'Desactivado' solo si isActive es false, enlace 'Editar' hacia /admin/carta/<id> y botón 'Desactivar' o 'Activar'.
- Confirmación de desactivado: '¿Desactivar <nombre>? Dejará de aparecer en la carta.' con 'Sí, desactivar' y 'Cancelar'.
- Estados: 'Cargando carta...' (role status); 'No se pudo cargar la carta.' (role alert) con 'Reintentar'; 'La carta está vacía.' con el enlace de alta visible.

### 10.3 /admin/carta/nuevo — alta

- h1 'Agregar producto'; enlace 'Volver a la carta' hacia /admin/carta.
- Campos: 'Nombre del producto' (texto), 'Categoría' (fieldset con un radio por categoría en el orden de la carta, ninguna preseleccionada) y 'Precio' (inputMode decimal, ayuda 'En soles, por ejemplo 18.50.', vista previa 'S/ X.XX' cuando el texto parsea).
- Botón 'Crear producto' ('Creando...' mientras envía). Validación local: nombre con productNameSchema, categoría obligatoria ('Elige una categoría.'), precio con parseSolesToCents (PRICE_INPUT_MESSAGE). Tras el 201: replace a /admin/carta/<id> si la categoría es chicken o combo; si no, a /admin/carta.

### 10.4 /admin/carta/[id] — edición

- Enlace 'Volver a la carta'; h1 'Editar producto'. El producto sale de la consulta de la lista por el id de la ruta; sin coincidencia, 'Ese producto no existe.'.
- Sección 'Datos': 'Nombre del producto', 'Categoría' (las siete etiquetas) y 'Precio' con el valor actual en soles; 'Guardar cambios' ('Guardando...') hace el PATCH y el 200 muestra 'Cambios guardados.'. Si el producto es 'chicken' con presentaciones cargadas, el campo Precio lleva la nota 'El cobro usa el precio de cada presentación; este precio queda solo de referencia.'.
- Sección 'Presentaciones del pollo' (solo con categoría guardada 'chicken') o 'Componentes del combo' (solo con 'combo'); después la sección 'Estado' con 'Desactivar' (misma confirmación de la lista) o 'Activar'.

### 10.5 Grilla de presentaciones (chicken)

- Seis filas en orden fijo con checkbox accesible 'Octavo — pecho', 'Octavo — pierna', 'Cuarto — pecho', 'Cuarto — pierna', 'Medio pollo', 'Pollo entero' y el campo 'Precio de <etiqueta>' habilitado solo con la fila marcada.
- 'Guardar presentaciones' ('Guardando...') envía el PUT de reemplazo; el 200 muestra 'Presentaciones guardadas.'.
- Nota fija: 'Mientras tenga presentaciones cargadas, la categoría del producto no se puede cambiar.'; estado vacío con guía 'Marca las presentaciones que vendes y escribe su precio.'.

### 10.6 Componentes del combo

- Filas agrupadas con nombre accesible 'Componente N': selector 'Producto' (opción vacía 'Elige un producto' y los productos que no son combo, agrupados por categoría con optgroup; inactivos con ' (desactivado)'), campo 'Cantidad' (1 a 99) y, solo con producto 'chicken', 'Presentación' y 'Parte' (esta última solo con Octavo o Cuarto).
- 'Agregar componente' (a las diez filas queda deshabilitado con 'Un combo admite hasta 10 componentes.'), 'Quitar' por fila y 'Guardar componentes' ('Guardando...'); el 200 muestra 'Componentes guardados.'.
- Comparación visible cuando hay filas completas: 'Los componentes por separado suman S/ X.' y 'El combo cuesta S/ Y (S/ Z menos/más que por separado).' o '(igual que por separado).', con la nota fija del precio base.
- Estado vacío: 'Este combo todavía no tiene componentes.' con la nota 'Un combo sin componentes se vende como un producto simple.'.
- Nota fija: 'Mientras tenga componentes cargados, la categoría del producto no se puede cambiar.'.

### 10.7 Estados y errores

- Cada sección que consulta la API tiene su 'Cargando...' con role status ('Cargando presentaciones...', 'Cargando componentes...') y su error con role alert y 'Reintentar' cuando corresponda.
- Los errores del servidor se muestran con su message tal cual; los 400 con issues por path se reparten por fila; los de la web (PRICE_INPUT_MESSAGE, 'Elige una categoría.', 'Elige el producto.', 'Elige la presentación del pollo.') junto al campo o la fila correspondiente.

## 11. Contrato interno de módulos

Rutas que importan a las pruebas:

- packages/shared/src/money.ts (nuevo, exportado por src/index.ts): formatSoles, parseSolesToCents, PRICE_INPUT_MESSAGE.
- apps/web/src/lib/api/client.ts: ApiRequestOptions.method suma 'PUT'.
- apps/web/src/lib/api/products.ts (nuevo): getProducts, createProduct, updateProduct, getProductPortions, replaceProductPortions, getComboItems, replaceComboItems.
- apps/web/src/lib/menu-labels.ts (nuevo): PRODUCT_CATEGORY_LABELS, PORTION_LABELS, CUT_LABELS, formatPortionCutLabel.
- apps/web/src/app/admin/page.tsx: enlace 'Carta'.
- apps/web/src/app/admin/carta/page.tsx, nuevo/page.tsx y [id]/page.tsx (nuevos, 'use client', contenido dentro de RoleGuard area '/admin'); componentes internos en apps/web/src/components/menu/.
- e2e/global-setup.ts (terreno del test-writer): limpieza de la carta de pruebas y semilla E2E.
- apps/api, la base, docs/api/openapi.yaml: sin cambios.

## 12. Cambios a specs anteriores

Ninguno. La 008 solo consume lo ya aprobado: la API, la base y el contrato no cambian (openapi.yaml queda en 0.7.0) y ningún comportamiento anterior se modifica. Se agregan piezas nuevas (funciones de formato en shared, funciones de API y páginas en la web) con dos toques aditivos a lo existente: client.ts suma 'PUT' a los métodos permitidos y admin/page.tsx suma el enlace 'Carta'.

## 13. Dependencias

Ninguna nueva ni de soporte: TanStack Query, MSW, Playwright, HeroUI, Tailwind, react-aria-components y los esquemas de shared ya están instalados y aprobados. Sin variables de entorno nuevas. Sin ADR.

## 14. Fuera de alcance

- La carta del mozo y toda la venta (Fase 2): ninguna pantalla fuera de /admin; el mozo no ve ni consume estas pantallas.
- Vista previa de la carta como la vería el mozo, agotados y stock (Fase 5), auditoría de cambios (RF-27, Fase 6) y seed de la carta real (Fase 6: el dueño la carga con estas pantallas).
- Rol 'supervisor' u otros permisos: el modelo solo tiene admin (pregunta 1).
- Paginación, búsqueda, reordenar la carta, fotos, descripciones, borrar productos (los productos nunca se borran, RN-005-04).
- Cambios de API o del contrato, endpoints de consulta agregada (por ejemplo un GET /api/menu).
- Autoguardado, historial de precios y aviso de 'cambios sin guardar' al salir de un formulario.

## 15. Riesgos

- El admin escribe el precio pensando en céntimos ('1850' queriendo decir S/ 18.50): la vista previa 'S/ X.XX' lo delata antes de enviar y el tope de S/ 999.99 rechaza los valores disparados (D-008-04). Riesgo acotado, no eliminado: '850' sería un precio válido de S/ 850.00 que nadie quiso.
- Crear un chicken o combo y olvidar la grilla o los componentes: el alta de esas categorías aterriza en la página de edición, donde la sección vacía guía el segundo paso (D-008-05); mientras tanto el producto ya funciona como ítem simple a su precio base.
- La comparación del combo cuando una presentación no se vende suelta usa el precio base del producto (referencia imprecisa): nota fija en la sección y respaldo documentado (D-008-09).
- Dos administradores editando la carta a la vez: gana el último envío; cada pantalla relee tras guardar. Riesgo bajo en un local con un solo dueño administrador.
- La comparación hace una consulta GET /portions por cada producto 'chicken' referenciado: acotado por el tope de diez componentes y los pocos pollos de una carta real; las consultas se cachean por producto y corren en la red local.
- La página de edición puede quedar larga con sus tres secciones: quedan apiladas en el orden Datos, sección especial y Estado; a 360 px se recorre con scroll (verificado por AC-21).
- Errores 400 con paths 'portions.N.*' e 'items.N.*': el apiErrorMessage actual de la 004 solo toma el primer issue; esta spec exige repartirlos por fila (D-008-12), lo que implica una función de mapeo de issues en la web — se detalla en el contrato interno y lo implementa el frontend-dev.

## 16. Supuestos

| ID | Supuesto (a confirmar por el usuario vía el orquestador) |
| --- | --- |
| S-008-01 | Solo se toca apps/web y se agregan dos funciones puras a shared; la API, la base y openapi.yaml no cambian. |
| S-008-02 | Rutas /admin/carta, /admin/carta/nuevo y /admin/carta/[id], protegidas con RoleGuard area '/admin'; enlace 'Carta' en /admin. |
| S-008-03 | Lista completa sin paginar ni buscar, agrupada por categoría en el orden de la carta. |
| S-008-04 | El precio se escribe en soles con punto o coma, se muestra 'S/ X.XX' y tiene vista previa junto al campo; formatSoles, parseSolesToCents y PRICE_INPUT_MESSAGE viven en shared. |
| S-008-05 | El alta crea solo el producto; tras crear un 'chicken' o 'combo' se aterriza en su edición, y con otra categoría se vuelve a la lista. |
| S-008-06 | La edición es una página con secciones apiladas (Datos, Presentaciones o Componentes según la categoría guardada, Estado), no pestañas. |
| S-008-07 | La grilla de presentaciones son seis filas fijas (checkbox y precio por fila) que se guardan con un solo PUT de reemplazo. |
| S-008-08 | El editor de componentes usa filas dinámicas; el selector no ofrece combos; con un componente de pollo se preseleccionan cuarto y pierna. |
| S-008-09 | La comparación del combo usa el precio de venta suelto de cada componente (GET portions de los pollos) con respaldo al priceCents, y se calcula sobre las filas del formulario. |
| S-008-10 | Desactivar pide confirmación desde la lista y desde la edición; activar no pide. |
| S-008-11 | Solo el rol admin gestiona la carta (no existe rol supervisor en el modelo). |
| S-008-12 | Los issues del servidor con path 'portions.N.*' e 'items.N.*' se muestran junto a la fila N; los de raíz, como mensaje de la sección. |
| S-008-13 | El diseño apilado con controles de 48 px cubre el uso a 360 px y en la PC; se verifica con E2E mobile y manualmente. |
| S-008-14 | Se incluyen cuatro recorridos E2E (tres desktop, uno móvil) y la semilla E2E descrita en D-008-14. |

## 17. Preguntas abiertas (con recomendación)

1. **¿Solo el admin gestiona la carta, o también un rol 'supervisor'?** Recomendación: solo admin. El modelo de usuarios no tiene supervisor (003) y la API ya exige requireRole('admin') en las escrituras; agregar un rol es cambio de modelo que correspondería a otra spec.
2. **¿Cómo se organizan las pantallas?** Recomendación: lista en /admin/carta agrupada por categoría y edición en una sola página con secciones apiladas (Datos, luego Presentaciones o Componentes según la categoría, luego Estado), no pestañas — es lo que ya hace la edición de usuario y a 360 px se recorre con scroll.
3. **¿Entran pruebas E2E?** Recomendación: sí, cuatro recorridos (AC-18 a AC-21): tres en desktop y uno móvil a 360 px que verifica el requisito del celular. Es el mismo patrón de la 004 y la infraestructura ya existe.
4. **¿Lista completa o paginada?** Recomendación: completa, sin buscador — una carta de pollería ronda los 40 productos y la API ya la devuelve ordenada.
5. **¿El precio se escribe en soles o en céntimos?** Recomendación: en soles ('18.50', con punto o coma) mostrando la vista previa 'S/ 18.50' junto al campo; la alternativa de escribir céntimos se descarta porque el dueño piensa en soles.
6. **¿Adónde se va después de crear un producto?** Recomendación: si es chicken o combo, a su página de edición para cargar presentaciones o componentes; si no, a la lista para seguir agregando. La alternativa es volver siempre a la lista, como hace el alta de usuarios.
7. **¿Cómo se calcula 'los componentes suman S/ X'?** Recomendación: cada componente de pollo toma el precio de la presentación elegida en su venta suelta (GET /portions de ese producto) y, si no la vende suelta, su priceCents; los demás usan su priceCents embebido. Alternativa más simple pero menos precisa: sumar siempre el priceCents del producto.
8. **¿Desactivar desde la lista pide confirmación?** Recomendación: sí ('¿Desactivar <nombre>? Dejará de aparecer en la carta.'), igual que en usuarios; activar no pide.
9. **¿Se preselecciona algo en un componente de pollo?** Recomendación: cuarto y pierna (lo más común en combos); el admin lo puede cambiar.
10. **¿Dónde viven las funciones de formato de dinero?** Recomendación: en shared (las reutilizan la carta del mozo y la caja); alternativa: en apps/web si se prefiere no tocar shared.

## 18. Acción del usuario y verificación manual

No hay acción técnica nueva del usuario: sin migraciones ni variables de entorno nuevas en esta spec (las migraciones pendientes de las specs 005, 006 y 007 deben estar aplicadas en polleria_dev, como ya se indica en sus documentos).

Recorrido manual con pnpm dev, entrando como administrador:

1. /admin -> 'Carta' -> lista vacía 'La carta está vacía.' -> 'Agregar producto': crear 'Chaufa' (Platos, 14.50) -> vuelve a la lista y aparece en la sección Platos con 'S/ 14.50'.
2. Crear 'Pollo a la brasa' (Pollo, 65.00) -> aterriza en su edición -> marcar 'Cuarto — pecho' con '18.50', 'Cuarto — pierna' con '17.50' y 'Pollo entero' con '65.00' -> 'Guardar presentaciones' -> recargar y comprobar que quedaron.
3. Crear 'Mostrito' (Combos, 30.00) -> edición -> agregar componentes (pollo cuarto de pierna, chaufa, gaseosa) -> ver 'Los componentes por separado suman S/ X.' junto a 'El combo cuesta S/ 30.00 (...)' -> guardar y recargar.
4. En la lista, 'Desactivar' el chaufa -> confirmar -> aparece 'Desactivado'; 'Activar' -> desaparece la marca.
5. Intentar crear 'CHAUFA' -> 'Ya existe un producto con ese nombre.'; escribir '1850' en el precio -> la vista previa muestra 'S/ 1850.00' y el envío lo rechaza por el tope.
6. Intentar cambiar la categoría del pollo con presentaciones cargadas -> el 409 muestra 'Este producto tiene presentaciones de pollo; quítalas antes de cambiar su categoría.'.
7. Desde el celular del local a 360 px (mismo wifi, sin internet): recorrer la lista, el alta y la edición sin desplazamiento horizontal, con botones cómodos.

## 19. Notas para specs siguientes

- Fase 2 (venta del mozo): la carta que ve el mozo filtra por isActive y reutiliza las etiquetas y formatSoles de esta spec; evaluar entonces un GET /api/menu agregado si conviene una sola llamada con productos, presentaciones e items.
- Fase 5 (stock): la marca 'Agotado' futura es distinta de 'Desactivado'; esta lista ya distingue el estado del producto.
- Fase 6 (auditoría y seeds): la carga inicial de la carta real la hace el dueño con estas pantallas; el seed de demostración solo replica esos datos.
- Las filas de product_portions y combo_items no llevan id estable expuesto: cualquier pantalla futura que los edite debe volver a consultar tras guardar, como hace esta.
