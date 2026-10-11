# Spec 011 — Pantallas del mozo: tablero de mesas, pedido y toma de comanda

- Estado: Aprobada (2026-10-11): las 12 preguntas abiertas de la sección 17 respondidas con las recomendaciones propuestas
- Fase: 2 (Mesas y pedidos)
- Rama: feat/011-waiter-screens
- Fecha: 2026-10-11
- Cubre: RF-02 completo en su parte de interfaz (el tablero muestra todas las mesas con su estado: libre, ocupada, pedido listo o cuenta solicitada), RF-03 completo en su parte de interfaz (abrir mesa, mover el pedido de mesa y unir mesas — la API también permite separar y se incluye), RF-04 completo en su parte de interfaz (registrar el pedido eligiendo producto, presentación y parte), RF-05 completo en su parte de interfaz (cremas, bebidas y observaciones por ítem), RF-06 completo en su parte de interfaz (adiciones a un pedido abierto; cada envío muestra su comanda nueva) y RF-07 completo en su parte de interfaz (el mozo solicita la anulación con motivo; el administrador aprueba o rechaza). Aporta a RNF-01 (pedido típico en menos de 30 s: preselección y pocos toques), RNF-02 (botones grandes, español sencillo), RNF-04 y RNF-05 (polling liviano en la red local, sin internet), RNF-07 y RNF-08 (Chrome Android a 360 px, celulares de gama baja) y RNF-09 (la resolución de anulaciones solo la ve el rol admin). La parte de dominio y API de estos RF ya quedó cerrada por las specs 009 y 010: esta spec es solo web, igual que la 008.
- Documentos relacionados: tasks.md (esta carpeta), docs/planificacion.md (RF-02 a RF-07, módulos Mesas y Pedidos, HU-02 a HU-09 del proceso actual, RNF-01 a RNF-09), docs/specs/003-users-pin-login/spec.md (sesión, áreas, RoleGuard; /mozo existe como área desde la 003), docs/specs/004-users-admin/spec.md (patrón de pantallas y confirmaciones), docs/specs/008-menu-admin/spec.md (única spec de interfaz previa: TanStack Query, MSW, validación local con esquemas de shared, issues por fila, 360 px, E2E), docs/specs/009-tables/spec.md (GET /api/tables y las rutas del ciclo del pedido; §10 deja las etiquetas y el polling para esta spec), docs/specs/010-order-items/spec.md (ítems, envío idempotente, comandas como registro, ciclo de anulación; §10 deja las notas de interfaz que esta spec ejecuta), docs/api/openapi.yaml (versión 0.9.0 — sin cambios en esta spec) y CLAUDE.md (reglas de dominio 1, 2, 5, 6 y 9; glosario: mozo = waiter, mesa = table, pedido = order, ítem = orderItem, comanda = kitchenTicket, carta = menu, presentación = portion, parte = cut, cremas = sauces, anulación = voidItem).

## 1. Contexto

Las specs 009 y 010 dejaron listo el salón por API: el tablero de mesas con su estado derivado, el ciclo completo del pedido (abrir, mover, unir, separar, listo, servido, cuenta, cancelar), los ítems con presentación/parte/cremas/observación y copia de precio, el envío idempotente con Idempotency-Key, las comandas como registro y la anulación solicitada por el mozo y resuelta por el administrador. Pero el mozo todavía no puede tocar nada de eso sin una consola. Esta spec entrega sus tres pantallas dentro del área /mozo, pensadas para su celular: el tablero de mesas con estados y totales, la pantalla del pedido de una mesa (abrir, ver ítems y su estado, acciones de salón y comandas enviadas) y la toma de pedido con carrito local y envío a cocina idempotente. También ejecuta la resolución de anulaciones como vista mínima dentro de la misma pantalla del pedido para el rol admin. No se agrega ni cambia ningún endpoint: la 011 consume el contrato OpenAPI 0.9.0 tal cual. La impresión de la comanda (Fase 3), la cuenta y el cobro (Fase 4), el stock (Fase 5) y los reportes (Fase 6) siguen en sus fases.

### Qué hace el mozo hoy y qué queda

Hoy el mozo memoriza o anota en papel, camina a la cocina a dictar y suma la cuenta a mano (HU-06 a HU-09). Con esta spec ve el salón entero en su celular, registra el pedido en la mesa con pocos toques y el envío queda garantizado sin duplicados aunque falle el wifi; anular un ítem enviado lo deja pedido al administrador con su motivo escrito en vez de buscarlo por el local.

## 2. Historias de usuario

| ID | Historia |
| --- | --- |
| HU-011-01 | Como mozo, quiero ver todas las mesas del salón en mi celular con su estado (libre, ocupada, pedido listo, pidió la cuenta) y el total acumulado, para saber de un vistazo qué mesa atender. |
| HU-011-02 | Como mozo, quiero abrir una mesa libre con un toque, para empezar la cuenta del cliente que acaba de sentarse. |
| HU-011-03 | Como mozo, quiero registrar el pedido eligiendo producto, presentación (1/8, 1/4, 1/2, entero) y parte (pecho o pierna), con preselecciones rápidas, para mandarlo a cocina en menos de 30 segundos sin ir a dictarlo. |
| HU-011-04 | Como mozo, quiero indicar las cremas y una observación por ítem ("sin ensalada", "ají aparte"), para que el cliente reciba el plato como lo pidió. |
| HU-011-05 | Como mozo, quiero revisar y corregir la tanda antes de enviarla —quitar un ítem, cambiar una cantidad— para que a cocina solo llegue lo confirmado. |
| HU-011-06 | Como mozo, quiero que el envío a cocina sea seguro aunque se caiga el wifi un momento —reintentar sin duplicar—, para no mandar dos comandas del mismo pedido. |
| HU-011-07 | Como mozo, quiero agregar ítems a un pedido abierto a mitad de la comida y que cocina reciba una comanda nueva solo con lo agregado. |
| HU-011-08 | Como mozo, quiero solicitar la anulación de un ítem ya enviado escribiendo el motivo, para que el administrador la resuelva sin que yo lo busque por el local. |
| HU-011-09 | Como administrador, quiero resolver las anulaciones que el mozo pidió —aprobar con el motivo final o rechazar— desde la misma pantalla del pedido, y también anular directo un ítem cuando yo detecto el error. |
| HU-011-10 | Como mozo, quiero marcar el pedido como servido cuando llevo los platos a la mesa y pedir la cuenta cuando el cliente la pide, para que el tablero refleje en qué va cada mesa. |
| HU-011-11 | Como mozo, quiero mover la cuenta a otra mesa, unir una mesa a la cuenta y separar una mesa unida, para manejar los cambios de mesa del salón sin llamar al administrador. |
| HU-011-12 | Como mozo, quiero ver las comandas ya enviadas del pedido con su detalle, para confirmar qué se mandó a cocina y en qué orden. |

## 3. Decisiones técnicas

Confirmadas por el usuario el 2026-10-11: S-011-01 a S-011-16 con las respuestas recomendadas de la sección 17. Se conservan abajo como registro.

**D-011-01. Alcance: solo apps/web (SUPUESTO S-011-01).**
- La API, la base de datos, packages/shared y el contrato no cambian: docs/api/openapi.yaml queda en la versión 0.9.0 sin una línea nueva. La 011 consume tal cual las 17 rutas de salón de las specs 009 y 010 más GET /api/menu.
- Todos los esquemas de respuesta y petición que la web necesita ya existen en shared (los de la 008, 009 y 010); las etiquetas en español y las funciones de API son de la web, siguiendo el patrón de la 008.
- Excepción interna de la web: el cliente central suma una opción para emitir la cabecera `Idempotency-Key` (D-011-09), como la 004 sumó 'PATCH' y la 008 sumó 'PUT'. Fuera de eso, apps/api y shared quedan sin diff. Si en la implementación se descubre un hueco real en la API, se reporta al orquestador — no se cubre desde la web (ver pregunta 11).
- Sin migraciones, sin variables de entorno, sin dependencias y sin ADR (D-011-15).

**D-011-02. Rutas y navegación dentro del área /mozo (SUPUESTO S-011-02).**
- /mozo: tablero de mesas. Reemplaza el placeholder actual de la 003.
- /mozo/mesas/[tableId]: la mesa y su pedido — abrir cuando está libre; ítems, acciones y comandas cuando hay pedido. La web identifica la vista por mesa, que es como piensa el mozo ("la 3", "la 4"); el `orderId` lo entrega el `order` embebido del tablero o de la mesa — la pantalla nunca lo pide a mano (criterio de la 009, §9).
- /mozo/mesas/[tableId]/agregar: la toma de pedido (elegir de la carta + carrito + envío a cocina). Ruta aparte para no disputar espacio con la lista del pedido en un celular y porque el recorrido natural es ida y vuelta: mesa → agregar → enviar → de vuelta a la mesa.
- Las tres envuelven su contenido en RoleGuard con area="/mozo": entran waiter y admin (AREA_ALLOWED_ROLES ya lo permite desde la 003); un usuario con solo cocina o caja va a su área y sin sesión a /login — comportamiento ya probado.

**D-011-03. Actualización del estado por polling, sin Socket.IO (SUPUESTO S-011-03).**
- La API no implementa eventos: Socket.IO está aprobada pero no instalada (CLAUDE.md) y las specs 009 (D-009-16) y 010 (D-010-20) la dejaron fuera dejando "polling en la 011" como recomendación aceptada. Esta spec la ejecuta: TanStack Query con `refetchInterval` de 5 segundos en el tablero y en la pantalla del pedido — un pedido listo o una anulación resuelta se ven solos sin recargar.
- 5 segundos es un compromiso entre frescura y carga: con ~5 dispositivos y un JSON chico (decenas de mesas), la red local lo absorbe sin demora (RNF-04). Tras cada mutación propia se invalida la consulta para releer de inmediato, no esperando al próximo tick.
- La carta (GET /api/menu) casi no cambia: se consulta al entrar a la toma de pedido (refetchOnMount) sin intervalo; un producto desactivado a mitad del servicio lo atrapa el servidor al enviar (issue por ítem, D-011-13).
- Si en la demostración el dueño pide refresco instantáneo, Socket.IO es backend nuevo y entra como spec posterior — queda anotado como pregunta abierta, no se promete (pregunta 4).

**D-011-04. El tablero: una tarjeta por mesa activa con estado derivado (SUPUESTO S-011-04).**
- GET /api/tables devuelve todas las mesas ordenadas por nombre con colación natural ("Mesa 2" antes que "Mesa 10"); el tablero pinta solo las `isActive` (quien dibuja filtra — contrato 0.9.0).
- Cada tarjeta: nombre de la mesa, etiqueta del estado con color — 'Libre' (verde), 'Ocupada' (ámbar), 'Pedido listo' (azul), 'Pidió la cuenta' (morado) — y, cuando hay pedido embebido: 'Juan · S/ 45.00' (mozo que abrió y `totalCents` con formatSoles), las mesas unidas ('y Mesa 4' por cada mesa extra de `order.tables`) y una marca por cada señal vigente: el `state` elige una etiqueta pero `readyAt` y `billRequestedAt` se muestran ambos si están (la precedencia 'listo' sobre 'cuenta' es del modelo; el mozo puede querer ver las dos — riesgo señalado en la 009 §15).
- Marca 'Anulación pedida' cuando el pedido embebido tiene ítems con `status: 'void_requested'`: el mozo ve que su solicitud sigue pendiente y el admin que recorre el salón ve dónde hay algo por resolver (ejecuta la nota §10 de la 010). No muestra detalle; el pedido lo muestra.
- Tarjeta completa como enlace a /mozo/mesas/<id> con altura de al menos 48 px y texto grande; grilla de dos columnas a 360 px.

**D-011-05. La pantalla de la mesa: abrir cuando está libre, pedido cuando está cubierta (SUPUESTO S-011-05).**
- La mesa se resuelve del mismo GET /api/tables (no hay GET de mesa individual): si el id de la ruta no está o la mesa está inactiva → 'Esa mesa no existe.' con enlace al tablero (patrón del 'Ese producto no existe.' de la 008).
- Mesa libre: nombre, estado 'Libre' y el botón grande 'Abrir mesa'. Un toque crea el pedido (POST /api/tables/{tableId}/orders, 201) y la vista pasa a la del pedido abierto. El reintento por doble toque lo cubre el envío único de D-011-13 y, si llegara, el 409 TABLE_OCCUPIED del servidor: la mesa aparece ocupada tras recargar (la idempotencia natural de la 009: abrir dos veces no crea dos cuentas).
- Mesa con pedido: encabezado con nombre, estado derivado y las mesas que lo cubren; después las tres secciones apiladas de D-011-06. Consulta del detalle con GET /api/orders/{orderId} por polling (D-011-03) para recibir ítems y anulaciones hechas en otros dispositivos.
- Pedido cerrado/cancelado/fusionado en la URL: si `order` viene null tras una operación externa, la vista vuelve a la de mesa libre tras el siguiente tick; GET /api/orders/{orderId} de un pedido inexistente responde 404 'Ese pedido no existe.'.

**D-011-06. El pedido en tres secciones: Pedido, Acciones, Comandas enviadas (SUPUESTO S-011-06).**
- 'Pedido': una línea por ítem en el orden recibido — '2 × Pollo a la brasa — Cuarto — pierna · S/ 28.00' (etiqueta de presentación-parte con formatPortionCutLabel de la 008), debajo las cremas con su precio ('+ Ají', '+ Ocopa × 2 · S/ 6.00'), la observación si hay ('"sin ensalada"'), los componentes del combo sangrados y, cuando el pedido cubre varias mesas, '· Mesa 4' en los ítems cuyo `orderedAtTable` difiera de la mesa de la URL (la traza que la 010 dejó para esto).
- Estado por ítem (etiquetas de §10 de la 010): 'sent' sin marca; 'void_requested' con la marca 'Anulación pedida' + 'pidió Juan' + el motivo; 'voided' tachado y gris con 'Anulado' + motivo final + quién lo aprobó. Los anulados nunca se quitan de la lista (la comanda de cocina ya los vio; RN-011-08).
- 'Total S/ X.XX' siempre visible al pie de la sección con `totalCents`; pedido sin envíos: 'Todavía no hay ítems enviados.' con el botón 'Agregar ítems' destacado.
- 'Acciones': los botones del ciclo de la 009/010 según el estado vigente (D-011-12 y D-011-13) más 'Agregar ítems'.
- 'Comandas enviadas': GET /api/orders/{orderId}/tickets; cada comanda con su etiqueta — 'Comanda inicial', 'Adición', 'Anulación' — , la hora (toLimaDateTimeParts) y sus ítems resumidos; vacío 'Todavía no se envió ninguna comanda.'. Las comandas 'Anulación' solo se listan cuando el usuario tiene rol admin (la solicitud no emite comanda y la anulación la ejecuta él — al mozo le basta la marca del ítem).

**D-011-07. La toma de pedido: carta por secciones, editor por ítem, carrito local (SUPUESTO S-011-07).**
- GET /api/menu una vez por entrada a la pantalla (D-011-03); secciones por categoría en el orden de la carta (Pollo, Combos, Platos, Bebidas, Postres, Cremas, Extras) con los productos activos; cada producto una tarjeta con nombre y 'S/ X.XX'.
- Al tocar un producto se abre el editor del ítem: 'Cantidad' (stepper 1-99, inputMode numérico); 'Presentación' y 'Parte' solo para productos 'chicken' con `portions` — presentación limitada a las ofertadas en la carta y parte solo en octavo/cuarto (la correspondencia del esquema); preselección 'quarter' + 'leg' cuando la carta la ofrece (la más vendida — mismo criterio que el componente de pollo de la 008); con 'half' aparece la 'Distribución' (selector '2 pecho y 2 pierna', '3 pecho y 1 pierna', '1 pecho y 3 pierna', '4 pecho y 0 pierna', '0 pecho y 4 pierna' — las cinco sumas válidas de 4 octavos, con 2+2 preseleccionada); con 'whole' nada más.
- 'Cremas' solo para categorías chicken/dish/combo (la regla RN-010-13 ejecutada en la 010): un checkbox por producto 'sauce' de la carta y, al marcarla, un campo 'Cantidad' 1-99 que nace en 1 (una crema suelta como ítem propio también se puede agregar desde la sección Cremas — es un ítem simple). 'Observación': campo de una línea con contador '0/200' (la regla del esquema).
- Combo: la carta trae `items` con el componente embebido; el editor muestra la lista y, por cada componente 'chicken', el selector de parte/distribución con el valor configurado como defecto (la decisión confirmada de la 010: el cliente elige pecho/pierna del combo en el mostrador); componentes desactivados se muestran con ' (desactivado)' y el combo se puede vender igual (S-010-14 confirmada).
- 'Agregar al pedido' pone la línea en el carrito — estado local de la pantalla: ahí se corrige cantidad/cremas/observación o se quita sin tocar la API (ejecuta D-010-09: no existe borrador en el servidor; todo ítem registrado ya fue a cocina). Tope de 20 por envío ('Un envío admite hasta 20 ítems.' — ORDER_ITEMS_PER_SEND_MAX) y 'Enviar a cocina (N)' inhabilitado con el carrito vacío.

**D-011-08. El cuerpo del envío y el precio mostrado (SUPUESTO S-011-08).**
- El POST manda `{ items: [...] }` con la forma de `sendOrderItemsRequestSchema`: `productId`, `quantity`, `portion`/`cut` solo cuando corresponden, `breastEighths`/`legEighths` solo en 'half' con distribución no por defecto (el defecto 2+2 puede omitirse, igual que la API), `notes` solo con texto, `sauces` con `productId` + `quantity`, `components` solo cuando el mozo cambió la parte de algún componente de pollo (la lista resuelta debe coincidir con la carta salvo esa elección — la regla D-010-05).
- El precio que se muestra al armar la línea es el que cobrará el ítem: la fila de `portions` para pollo con presentaciones, `priceCents` del producto en los demás casos, más las cremas con su precio — el mismo cálculo de `totalCents` del servidor, para que el mozo vea 'S/ 21.00' antes de enviar. El total final lo manda el servidor en el 201; la pantalla nunca calcula el cobro real.

**D-011-09. Envío idempotente: clave por intento, conservada en el reintento del mismo intento (regla de dominio 5; SUPUESTO S-011-09).**
- El cliente central suma `idempotencyKey` a `ApiRequestOptions`: cuando viene, la solicitud emite la cabecera `Idempotency-Key` con ese valor (el resto del cliente no cambia — como la 004 sumó 'PATCH').
- La pantalla genera la clave con `crypto.randomUUID()` al primer toque de 'Enviar a cocina' de una tanda y la guarda en el estado del carrito: un fallo de red o una respuesta no recibida muestra 'No se pudo enviar el pedido.' con 'Reintentar envío', que repite LA MISMA clave — el servidor devuelve la respuesta guardada si la primera sí entró (replay) sin duplicar ítems ni comandas (regla 5 literal; la misma mecánica cubre las operaciones de anulación de D-011-11, cada una con su propia clave por intento).
- Una clave nueva solo con una tanda nueva o tras el 201: si el usuario cierra y vuelve a armar "el mismo" pedido, son dos envíos reales y dos comandas — comportamiento correcto que la 010 documentó (su §15) y que la pantalla no puede distinguir.

**D-011-10. Tras el 201: aviso, invalidación y vuelta a la mesa (SUPUESTO S-011-10).**
- El carrito se vacía, se invalidan las consultas del pedido y del tablero (la mesa muestra el total nuevo sin esperar al tick) y la pantalla vuelve a /mozo/mesas/[tableId] con el aviso 'Pedido enviado a cocina.' — visible junto a la comanda 'Comanda inicial' o 'Adición' recién creada en 'Comandas enviadas'.

**D-011-11. Anulación en pantalla: el mozo solicita y el admin resuelve en la misma vista del pedido (SUPUESTO S-011-11).**
- Mozo: botón 'Solicitar anulación' en cada ítem 'sent' → diálogo con el campo 'Motivo de la anulación' (1-200, mismo esquema que el motivo de cancelación) → POST request-void con su Idempotency-Key → el ítem queda marcado 'Anulación pedida' con su nombre y motivo. En ítems 'void_requested'/'voided' el mozo solo ve la marca.
- Admin en la misma pantalla (entra por /mozo como cualquier rol del salón): en un ítem 'sent' ve 'Anular' (anulación directa, mismo diálogo de motivo → POST .../void con su comanda 'void'); en un ítem 'void_requested' ve 'Aprobar anulación' (diálogo con el motivo del mozo precargado editable → el motivo final lo escribe él, como en la 010) y 'Rechazar solicitud' (confirma '¿Rechazar la anulación que pidió Juan? El ítem sigue contando en la cuenta.' → POST reject-void sin cuerpo → el ítem vuelve a 'Enviado').
- Vista mínima decidida: la resolución vive dentro del pedido donde está el ítem, no en una bandeja aparte — el admin llega por el tablero (que ya marca 'Anulación pedida' en la mesa) o porque el mozo le avisa. Una bandeja "solicitudes pendientes" de todo el salón sería cómoda pero la API no tiene un listado agregado y pedirla es backend nuevo — queda como pregunta abierta (pregunta 3).
- Roles en pantalla: 'Solicitar anulación' lo ven waiter y admin; 'Anular', 'Aprobar anulación' y 'Rechazar solicitud' solo admin (RN-011-06). La API igual lo impone con 403 — la pantalla solo no ofrece lo prohibido.

**D-011-12. Mover, unir y separar incluidos; pedir cuenta, listo, servido y cancelar (SUPUESTO S-011-12).**
- La API de la 009 ya permite todo a waiter/admin y RF-03 pide abrir/mover/unir; separar viene con la API y se incluye porque la operación real del salón la necesita (una mesa unida por error se deshace sin llamar a nadie). Alcance completo, justificado por RF-03 + decisión de la 009.
- 'Acciones' de la sección Pedido: 'Mover a otra mesa' (selector de mesas libres activas distintas de las cubiertas → POST move → la vista navega a /mozo/mesas/<destino>), 'Unir mesa' (selector de mesas ocupadas activas → POST /api/tables/{origen}/join con `intoTableId` de la mesa actual → la vista muestra 'Mesa 3 y 4' y los ítems traídos con su mesa de origen) y, cuando el pedido cubre más de una mesa, 'Separar Mesa N' por cada mesa cubierta distinta de la de la URL (POST /api/tables/{N}/leave → esa mesa queda libre; la última mesa nunca se suelta — ORDER_NEEDS_TABLE).
- Señales: 'Marcar pedido listo' cuando `readyAt` está vacío (POST ready — la API lo permite a waiter/kitchen/admin y la 009 lo confirmó: el mozo lo marca al escuchar el aviso de cocina como hoy) y 'Marcar servido' cuando hay listo vigente (POST served → la mesa vuelve a 'Ocupada'). 'Pedir la cuenta' (POST request-bill → la tarjeta pasa a 'Pidió la cuenta'; con `billRequestedAt` vigente el botón no se muestra). Siempre que el estado del pedido cambie por otra pantalla, el siguiente intento recibe su 409 con su mensaje.
- 'Cancelar pedido' pide el 'Motivo de la cancelación' (1-200) → POST cancel → vuelve al tablero con la mesa libre; el 409 ORDER_HAS_ACTIVE_ITEMS se muestra tal cual ('El pedido tiene ítems sin anular; un administrador debe anularlos primero.') — ya enseña al mozo qué hacer.
- Confirmaciones: abrir mesa, mover, unir, cuenta, listo y servido actúan al toque sin confirmación extra (son el flujo diario); separar confirma '¿Separar Mesa 4? Quedará libre.'; cancelar lleva el diálogo de motivo. El mozo no debe confirmar dos veces lo que hace veinte veces por turno (RNF-02).

**D-011-13. Errores, validación local y un solo envío en vuelo (SUPUESTO S-011-13).**
- Antes de enviar la tanda, la pantalla valida el cuerpo con `sendOrderItemsRequestSchema` (mismo patrón de la 008): el primer issue se muestra arriba y los issues con path 'items.N.*' se llevan a la línea N del carrito — la tanda entera se corrige de una vez como pide la 010.
- Del servidor: los 409 (TABLE_OCCUPIED, TABLE_INACTIVE, TABLE_HAS_NO_ORDER, ORDER_NEEDS_TABLE, ORDER_NOT_OPEN, ORDER_ITEMS_LIMIT, ORDER_HAS_ACTIVE_ITEMS, ORDER_ITEM_* e IDEMPOTENCY_CONFLICT) muestran su `message` tal cual; el 404 muestra 'Esa mesa no existe.' / 'Ese pedido no existe.'; el error de red muestra 'Sin conexión con el servidor. Revisa el wifi e intenta de nuevo.' (apiErrorMessage); el 401 redirige a /login por el cliente central.
- Un solo envío en vuelo por acción (marca síncrona con useRef + isPending, lección ADV-004-31); los botones se deshabilitan mientras envían ('Enviando...', 'Abriendo...'). Tras un error de envío de la tanda, el carrito se conserva íntegro.

**D-011-14. Mobile-first a 360 px y RNF-01 (SUPUESTO S-011-14).**
- El dispositivo objetivo es el celular del mozo: botones, tarjetas y controles de al menos 48 px (min-h-12), secciones apiladas dentro del marco de RoleGuard, selectores nativos (robustos y accesibles en Android — mismo criterio de la 008), sin desplazamiento horizontal a 360 px y sin recursos de internet (RN-001-04).
- El pedido típico en menos de 30 s (RNF-01) se apoya en: preselección cuarto/pierna, carta por secciones sin búsqueda, stepper de cantidad, envío de toda la tanda en un toque y confirmación inmediata. No hay métrica en pantalla: el requisito se verifica en la demo manual, no con telemetría.

**D-011-15. Sin cambios de contrato, de base, de configuración ni de dependencias (SUPUESTO S-011-15).**
- docs/api/openapi.yaml queda en 0.9.0; apps/api, la base y packages/shared sin diff; .env.example y CONFIG_VARIABLES iguales; sin paquetes nuevos (TanStack Query, MSW, HeroUI, Tailwind, Playwright, Zod y los esquemas de shared ya están); sin ADR — es composición de lo ya decidido.

**D-011-16. E2E: tres recorridos, todos en mobile-chrome (SUPUESTO S-011-16).**
- La pantalla del mozo es el celular: los tres recorridos corren en el proyecto mobile-chrome (360×740) y cada uno verifica que el ancho del documento no supere el viewport (misma técnica de AC-21 de la 008).
- Semilla E2E (la ajusta el test-writer en e2e/global-setup.ts): conserva usuarios y carta actuales; suma la limpieza del salón con `clearOrderTables` (las siete tablas ya autorizadas por D-010-19) y mesas 'E2E Mesa 1' a 'E2E Mesa 4' con `createTableService`; y amplía la carta con una crema gratis 'E2E Ají' (sauce, 0) y un combo 'E2E Mostrito' (pollo cuarto pierna + chaufa) con `createComboItemService` — todo en la misma base de pruebas con las guardias de siempre.
- Los tres recorridos: (E2E-1) abrir mesa → enviar tanda mixta → ítems y total → marcar listo → servido → pedir cuenta; (E2E-2) adición → solicitud de anulación del mozo → aprobación del admin en una segunda sesión del mismo spec; (E2E-3) mover → unir → separar → cancelar un pedido sin ítems → sin desplazamiento horizontal en cada pantalla.

## 4. Criterios de aceptación

Todos ejecutables: unitarios y de componentes con MSW + `pnpm test`, y E2E con `pnpm test:e2e` en mobile-chrome sobre polleria_test. Los datos de carta, mesas y pedidos se siembran por servicios reales o por MSW según corresponda. Casos felices y errores con el formato común `{ error: { code, message, details } }`.

### 4.1 Funciones de API, clave de idempotencia y etiquetas (apps/web/src/lib)

**AC-01 (funciones de API de mesas).** Dado `lib/api/tables.ts`, cuando se llama con MSW interceptando, entonces:

- `getTables()` → GET /api/tables validando `tablesResponseSchema`; `openTableOrder(tableId)` → POST /api/tables/{tableId}/orders sin cuerpo, expectedStatus 201, validando `orderSchema` (las 13 claves con `items` y `totalCents`); `joinTable(tableId, intoTableId)` → POST /api/tables/{tableId}/join con `{ intoTableId }` y 200; `leaveTable(tableId)` → POST /api/tables/{tableId}/leave sin cuerpo y 200.
- Un ApiError llega con su `code`, `message` y `details` (TABLE_OCCUPIED, TABLE_INACTIVE, TABLE_HAS_NO_ORDER, ORDER_NEEDS_TABLE); una respuesta que no cuadra con su esquema lanza UNEXPECTED_RESPONSE conservando el status real.

**AC-02 (funciones de API de pedidos y comandas).** Dado `lib/api/orders.ts`, cuando se llama, entonces:

- `getOrder(orderId)` → GET /api/orders/{orderId} con `orderSchema`; `moveOrder(orderId, tableId)` → POST move `{ tableId }`; `requestBill(orderId)`, `markReady(orderId)`, `markServed(orderId)` → sus POST sin cuerpo y 200 con `orderSchema`; `cancelOrder(orderId, reason)` → POST cancel `{ reason }`; `getOrderTickets(orderId)` → GET /api/orders/{orderId}/tickets con `kitchenTicketsResponseSchema`.
- `getMenu()` (en `lib/api/menu.ts`) → GET /api/menu validando `menuResponseSchema`.

**AC-03 (ítems y ciclo de anulación con Idempotency-Key).** Dado el envío y las tres rutas de anulación, cuando se llama, entonces:

- `sendOrderItems(orderId, key, body)` → POST /api/orders/{orderId}/items con la cabecera `Idempotency-Key: <key>` exacta, el cuerpo JSON y expectedStatus 201 validando `sendOrderItemsResponseSchema` (`{order, ticket}`); `requestVoidItem(orderId, itemId, key, reason)` → POST request-void `{ reason }` + cabecera, 200 con `orderResponseSchema` (`{order}`); `voidOrderItem(orderId, itemId, key, reason)` → POST void `{ reason }` + cabecera, 200 con `sendOrderItemsResponseSchema`; `rejectVoidItem(orderId, itemId, key)` → POST reject-void SIN cuerpo + cabecera, 200 con `orderResponseSchema`.
- La cabecera sale exacta en las cuatro (verificada por MSW); los ApiError propagan sus códigos (ORDER_NOT_OPEN, ORDER_ITEM_NOT_FOUND, ORDER_ITEM_VOID_REQUESTED, ORDER_ITEM_ALREADY_VOIDED, ORDER_ITEM_NOT_REQUESTED, IDEMPOTENCY_CONFLICT, VALIDATION_ERROR con sus issues).

**AC-04 (clave de idempotencia y etiquetas).** Dado `lib/idempotency.ts` y las etiquetas, cuando se verifica, entonces:

- `createIdempotencyKey()` devuelve una cadena que pasa `idempotencyKeySchema` (`^[\x21-\x7E]{1,128}$`) y dos llamadas seguidas devuelven valores distintos (basada en `crypto.randomUUID`).
- `TABLE_STATE_LABELS` es exactamente `{ free: 'Libre', occupied: 'Ocupada', ready: 'Pedido listo', bill_requested: 'Pidió la cuenta' }`; `ORDER_ITEM_STATUS_LABELS` es `{ sent: 'Enviado', void_requested: 'Anulación pedida', voided: 'Anulado' }`; `KITCHEN_TICKET_KIND_LABELS` es `{ initial: 'Comanda inicial', additional: 'Adición', void: 'Anulación' }`.

### 4.2 Tablero de mesas (/mozo)

**AC-05 (tarjetas por estado).** Dado un tablero servido por MSW, cuando el mozo entra a /mozo, entonces: hay una tarjeta por mesa activa con su nombre y la etiqueta del estado (Libre/Ocupada/Pedido listo/Pidió la cuenta); las inactivas no aparecen; una mesa con pedido muestra 'Juan · S/ 45.00' y 'y Mesa 4' por cada mesa unida; con `readyAt` y `billRequestedAt` a la vez se ven ambas marcas aunque la etiqueta sea 'Pedido listo'; y un pedido con ítems `void_requested` muestra la marca 'Anulación pedida'.

**AC-06 (estados del tablero).** Cuando la consulta está pendiente, muestra 'Cargando mesas...' (role status); cuando falla, 'No se pudo cargar el salón.' (role alert) con 'Reintentar' que vuelve a consultar; cuando no hay mesas activas, 'No hay mesas activas.'; con un ApiError UNAUTHENTICATED el cliente lleva a /login.

**AC-07 (polling del tablero).** Dado el tablero montado con su consulta de D-011-03, cuando pasa el intervalo, entonces se vuelve a consultar GET /api/tables (MSW cuenta dos solicitudes) y una mesa que el segundo response marca ocupada aparece ocupada sin interacción del usuario.

**AC-08 (navegación y guardia).** La tarjeta es un enlace a /mozo/mesas/<tableId>; un cajero que entra a /mozo es llevado a /caja por RoleGuard; un admin entra al área.

### 4.3 La mesa y su pedido (/mozo/mesas/[tableId])

**AC-09 (mesa libre y abrir).** Dada una mesa libre, cuando el mozo entra, entonces ve el nombre, 'Libre' y 'Abrir mesa'; al tocarlo sale POST /api/tables/{id}/orders (una sola vez aunque toque dos veces) y la vista muestra el pedido abierto con 'Todavía no hay ítems enviados.'; con 409 TABLE_OCCUPIED se muestra su mensaje y la mesa reaparece ocupada tras la relectura; con un id que no está en la lista, 'Esa mesa no existe.' con el enlace al tablero.

**AC-10 (lista de ítems y total).** Dado un pedido con ítems, cuando se muestra la sección 'Pedido', entonces cada línea muestra cantidad, nombre, etiqueta de presentación-parte cuando corresponde, cremas con precio, observación y componentes sangrados; 'Enviado' sin marca; 'Anulación pedida' con quién la pidió y el motivo; 'Anulado' tachado con el motivo final y quién aprobó; '· Mesa 4' en los ítems cuyo `orderedAtTable` no sea la mesa de la URL; 'Total S/ X.XX' al pie; y el polling del detalle trae un ítem nuevo enviado desde fuera.

**AC-11 (señales del ciclo).** Con `readyAt` vacío se muestra 'Marcar pedido listo' → POST ready y la vista pasa a 'Pedido listo'; con `readyAt` vigente, 'Marcar servido' → POST served y vuelve a 'Ocupada'; sin `billRequestedAt`, 'Pedir la cuenta' → POST request-bill y la tarjeta pasa a 'Pidió la cuenta' (el botón ya no se muestra); un 409 ORDER_NOT_OPEN muestra su mensaje tal cual.

**AC-12 (mover, unir y separar).** 'Mover a otra mesa' ofrece solo mesas libres activas que el pedido no cubre → POST move y la vista navega a /mozo/mesas/<destino>; 'Unir mesa' ofrece solo mesas ocupadas activas → POST join de la origen a la actual y la vista muestra las mesas unidas; con un pedido que cubre más de una mesa, 'Separar Mesa N' confirma '¿Separar Mesa N? Quedará libre.' → POST leave y esa mesa sale del pedido; los 409 (TABLE_OCCUPIED, TABLE_INACTIVE, TABLE_HAS_NO_ORDER, ORDER_NEEDS_TABLE) muestran su mensaje.

**AC-13 (cancelar).** 'Cancelar pedido' pide 'Motivo de la cancelación' → POST cancel `{ reason }` → vuelve al tablero; con un pedido con ítems enviados, el 409 ORDER_HAS_ACTIVE_ITEMS muestra 'El pedido tiene ítems sin anular; un administrador debe anularlos primero.'; el motivo vacío o de más de 200 lo corta la validación local.

**AC-14 (comandas enviadas).** La sección lista GET /tickets: cada comanda con su etiqueta (Comanda inicial/Adición/Anulación), su hora y sus ítems; sin envíos, 'Todavía no se envió ninguna comanda.'; las de 'Anulación' se muestran solo al admin; un pedido nuevo no muestra comandas.

### 4.4 Toma de pedido y carrito (/mozo/mesas/[tableId]/agregar)

**AC-15 (carta y editor de ítem).** Dado GET /api/menu servido por MSW, cuando el mozo entra a agregar, entonces ve las secciones por categoría en el orden de la carta; al tocar un producto 'chicken' con porciones el editor muestra 'Presentación' solo con las ofertadas y 'Parte' solo en octavo/cuarto, con 'quarter'/'leg' preseleccionadas; con 'half' muestra la 'Distribución' (las cinco sumas válidas, 2+2 preseleccionada); con 'whole' ninguno; un producto de otra categoría muestra solo 'Cantidad', 'Cremas' (si es comida) y 'Observación'; el combo lista sus componentes con el selector de parte solo en los de pollo y ' (desactivado)' en el componente inactivo.

**AC-16 (carrito local).** 'Agregar al pedido' pone la línea en el carrito con el precio que cobrará (fila de presentación o priceCents + cremas); el carrito permite corregir cantidad y quitar sin llamar a la API; 'Enviar a cocina (N)' muestra la cuenta y queda inhabilitado vacío; al ítem 21 el agregar se bloquea con 'Un envío admite hasta 20 ítems.'; la observación cuenta 'N/200'.

**AC-17 (envío con Idempotency-Key).** Al tocar 'Enviar a cocina' sale un solo POST /api/orders/{orderId}/items con la cabecera `Idempotency-Key` y el cuerpo armado de D-011-08; tras un fallo de red, 'Reintentar envío' repite LA MISMA clave (MSW captura ambas solicitudes con cabecera idéntica); tras el 201 el carrito se vacía, la pantalla vuelve a la mesa con 'Pedido enviado a cocina.' y la comanda 'Adición' o 'Comanda inicial' aparece en 'Comandas enviadas'.

**AC-18 (errores del envío).** Un 400 con issues 'items.0.portion' e 'items.1.sauces.0.productId' se muestra junto a cada línea del carrito y los de raíz arriba; los 409 ORDER_NOT_OPEN, ORDER_ITEMS_LIMIT e IDEMPOTENCY_CONFLICT muestran su message; el fallo de red muestra 'Sin conexión con el servidor. Revisa el wifi e intenta de nuevo.'; en todos los casos el carrito se conserva.

**AC-19 (adiciones).** Con un pedido que ya tiene ítems enviados, una segunda tanda enviada crea la comanda 'Adición' y el total y la lista se actualizan.

### 4.5 Ciclo de anulación en pantalla

**AC-20 (solicitud del mozo).** En un ítem 'Enviado' el mozo ve 'Solicitar anulación' → diálogo 'Motivo de la anulación' → POST request-void con su Idempotency-Key → el ítem pasa a 'Anulación pedida' con el nombre del mozo y el motivo; el motivo vacío lo corta la validación local; 409 ORDER_ITEM_VOID_REQUESTED y ORDER_ITEM_ALREADY_VOIDED muestran su message; el mozo no ve 'Anular', 'Aprobar anulación' ni 'Rechazar solicitud'.

**AC-21 (resolución del admin).** Con sesión de admin: en un ítem 'Enviado' se ve 'Anular' → diálogo de motivo → POST void → 'Anulado' con el motivo final y la comanda 'Anulación' en la sección; en un ítem 'Anulación pedida' se ven 'Aprobar anulación' (diálogo con el motivo del mozo precargado → POST void con el motivo final) y 'Rechazar solicitud' (confirma → POST reject-void sin cuerpo → vuelve a 'Enviado' sin rastro de la solicitud); 409 ORDER_ITEM_NOT_REQUESTED/ALREADY_VOIDED muestran su message.

### 4.6 Extremo a extremo (Playwright, mobile-chrome 360×740, sobre polleria_test)

**AC-22 (E2E-1: abrir, enviar, señales).** Dado el mozo E2E logueado, cuando abre 'E2E Mesa 1', entonces envía una tanda mixta (cuarto pierna + bebida + crema + observación), ve los ítems y el total en la mesa, marca 'pedido listo' (el tablero muestra 'Pedido listo'), marca 'servido' (vuelve a 'Ocupada') y pide la cuenta ('Pidió la cuenta'); sin desplazamiento horizontal en cada pantalla del recorrido.

**AC-23 (E2E-2: adición y anulación de dos actores).** Dado un pedido con ítems, cuando el mozo agrega una segunda tanda y solicita la anulación de un ítem con motivo, entonces aparece la comanda 'Adición', el ítem queda 'Anulación pedida' y, en una segunda sesión con el admin E2E, 'Aprobar anulación' lo deja 'Anulado' con su motivo y el total ajustado (y en el ítem de una tercera, 'Rechazar solicitud' lo devuelve a 'Enviado').

**AC-24 (E2E-3: mover, unir, separar, cancelar).** Dados pedidos abiertos, cuando el mozo mueve el pedido de 'E2E Mesa 2' a 'E2E Mesa 3', une 'E2E Mesa 4' a esa cuenta y luego la separa, entonces la mesa 2 queda libre, la cuenta cubre 'y Mesa 4' y la separada vuelve a libre; y cancelar un pedido sin ítems con motivo libera su mesa.

### 4.7 Cobertura de requisitos

| Requisito | AC que lo cubren |
| --- | --- |
| RF-02 (mesas con su estado) | AC-05, AC-06, AC-07, AC-08, AC-22 |
| RF-03 (abrir, mover, unir — y separar por la API) | AC-09, AC-12, AC-24 |
| RF-04 (registrar con producto, presentación y parte) | AC-15, AC-16, AC-17, AC-22 |
| RF-05 (cremas, bebidas, observaciones) | AC-15, AC-16, AC-22 |
| RF-06 (adiciones con comanda nueva) | AC-19, AC-23 |
| RF-07 (anulación con autorización y motivo) | AC-20, AC-21, AC-23 |
| RNF-01 (pedido típico < 30 s) | AC-15, AC-16 (preselección, pocos toques; se verifica manual en §18) |
| RNF-02 (botones grandes, español sencillo) | AC-05 a AC-21, R-011-06 |
| RNF-04 / RNF-05 (red local sin internet, polling liviano) | AC-07, R-011-04 |
| RNF-07 / RNF-08 (Chrome Android, 360 px, gama baja) | AC-22, AC-23, AC-24 (los tres E2E corren en mobile-chrome) |
| RNF-09 (acciones sensibles solo al rol que corresponde) | AC-20, AC-21, AC-08 |
| Regla de dominio 5 (envío idempotente) | AC-03, AC-04, AC-17 |

## 5. Requisitos verificables

| ID | Requisito | Cómo se verifica |
| --- | --- | --- |
| R-011-01 | docs/api/openapi.yaml queda en la versión 0.9.0 sin cambios y sigue válido | diff vacío respecto a main; lint de Redocly como en las specs anteriores |
| R-011-02 | apps/api y packages/shared no cambian: ni rutas, ni servicios, ni modelos, ni esquemas, ni tests | `git status --porcelain apps/api packages/shared` vacío al cerrar la funcionalidad |
| R-011-03 | Sin migraciones ni variables de entorno nuevas | diff vacío en las migraciones y en los .env.example |
| R-011-04 | La web sigue sin recursos de internet y llama solo a /api del mismo origen | grep de R-14 de la 001 sobre apps/web/src y revisión del cliente |
| R-011-05 | Cobertura de líneas: 80 % o más en apps/web (shared no cambia) | pnpm test:coverage |
| R-011-06 | Definición de terminado de CLAUDE.md | pnpm test, pnpm lint, pnpm typecheck y pnpm test:e2e en verde; cada AC con al menos una prueba que empieza con su ID |
| R-011-07 | Las tres rutas nuevas pasan por RoleGuard area '/mozo' | el reviewer lee las páginas |
| R-011-08 | Las cuatro operaciones que escriben ítems emiten la cabecera Idempotency-Key y el reintento reusa la clave del intento | AC-03 y AC-17 con MSW + revisión del cliente |

## 6. Reglas de negocio

Las reglas fijadas en specs anteriores siguen vigentes y las pantallas las respetan sin reabrirlas:

- De la 009: estados derivados con precedencia 'Pedido listo' sobre 'Pidió la cuenta' pero ambas marcas visibles; cualquier mozo opera cualquier cuenta; mover/unir/separar para waiter/admin; el pedido de salón siempre conserva una mesa; las mesas las configura el admin y nunca se borran.
- De la 010: el ítem copia precio/nombre/octavos al enviarse; el envío es atómico por tanda de 1-20 con Idempotency-Key obligatoria en las cuatro operaciones que escriben ítems; no existe borrador en el servidor — el carrito es local; el ciclo de anulación es 'sent' → 'void_requested' → 'voided' o rechazo a 'sent'; el ítem anulado nunca se borra; solicitar y enviar lo hacen waiter/admin y resolver solo admin; cancelar con ítems activos da 409 y solo admin si el pedido llegó a tener ítems.
- De la 005/006/007/008: la carta se lee completa con productos activos; solo 'chicken' lleva presentaciones y parte solo en octavo/cuarto; el medio admite distribución que suma 4; el combo copia sus componentes con su elección de parte en el pollo; el dinero viaja en céntimos y se muestra 'S/ X.XX' con formatSoles.
- De la 001/003 y CLAUDE.md: la web funciona en la red local sin internet ni recursos externos; el área /mozo entra con waiter o admin; los textos son español de Perú sencillo.

Reglas nuevas de esta spec (todas de interfaz; ninguna cambia el dominio):

| ID | Regla |
| --- | --- |
| RN-011-01 | Las pantallas no agregan ni modifican endpoints: consumen el contrato 0.9.0 tal cual. |
| RN-011-02 | El carrito es estado local de la pantalla de toma; todo ítem que la lista del pedido muestra ya pasó por la API (no hay ítem "borrador" en el servidor). |
| RN-011-03 | Cada operación que escribe ítems emite `Idempotency-Key` generada al primer intento y reutilizada solo en el reintento del mismo intento; una tanda nueva lleva clave nueva. |
| RN-011-04 | El tablero y el pedido se actualizan por polling cada 5 segundos; tras cada mutación propia se invalida y se relee de inmediato. |
| RN-011-05 | Precios, subtotales de línea y total se muestran siempre con formatSoles ('S/ X.XX'); jamás en céntimos ni con floats. |
| RN-011-06 | Solo el rol admin ve 'Anular', 'Aprobar anulación' y 'Rechazar solicitud', y las comandas 'Anulación'; el mozo solo 'Solicitar anulación'. |
| RN-011-07 | Los selectores de mesa solo ofrecen lo aplicable: mover, mesas libres activas no cubiertas; unir, mesas ocupadas activas; separar, las mesas cubiertas que no son la de la URL. |
| RN-011-08 | Los ítems 'voided' se muestran tachados con su motivo final y quién aprobó; nunca se quitan de la lista. |
| RN-011-09 | Controles de al menos 48 px, español de Perú y sin desplazamiento horizontal a 360 px. |

## 7. Casos borde conocidos

- Mesa abierta por otro mozo: cualquiera la opera (decisión de la 009); el pedido muestra quién la abrió ('Juan') sin bloquear a nadie.
- La mesa queda inactiva o el pedido se cierra en otra pantalla: el siguiente polling refleja la mesa libre o el 409 ORDER_NOT_OPEN llega al intentar operar.
- Un ítem con solicitud de anulación que nadie resuelve sigue contando en el total y cocina sigue preparándolo (decisión de la 010): la pantalla solo lo marca; el mozo avisa de viva voz como hoy.
- El mozo rehace "el mismo" pedido tras cerrar la app o con el carrito vacío en otra pestaña: son dos envíos reales y dos comandas — la clave por intento distingue reintento de nueva tanda (riesgo documentado en la 010 §15).
- Producto desactivado entre la lectura del menú y el envío: el servidor responde el issue 'Ese producto está desactivada en la carta.' junto a la línea del carrito (los activos se leen al entrar; no hay polling del menú).
- Combo con componente desactivado: se vende igual con ' (desactivado)' en la lista del editor (S-010-14).
- Un pedido unido muestra ítems de dos mesas: '· Mesa 4' por `orderedAtTable` permite saber quién pidió qué; la cuenta es una sola.
- Tanda de más de 20 ítems (pedido de una empresa): el tope local lo corta antes de enviar; la solución es mandar dos tandas — cada una su comanda (RF-06 ya lo admite).
- Sesión vencida con la pantalla abierta: el siguiente polling o mutación responde 401 y el cliente central lleva a /login; el carrito se pierde igual que cualquier formulario sin guardar.
- Salir de la toma con el carrito armado: se pierde el carrito (estado local, RN-011-02) — igual que "cambios sin guardar" en la 004/008, no hay aviso.
- 'Marcar pedido listo' por accidente del mozo: la API lo acepta (waiter/kitchen/admin — decisión de la 009); 'Marcar servido' lo deshace desde la misma pantalla.
- Mesa inexistente o inactiva en la URL: 'Esa mesa no existe.' con enlace al tablero.
- El mozo pide la cuenta y luego se envía una adición: el servidor ya limpia `billRequestedAt` (D-010-13) — el tablero vuelve a 'Ocupada' solo por el polling y la cuenta hay que pedirla de nuevo; la pantalla no lo anuncia, solo refleja el estado.
- La observación admite emojis y tildes pero no saltos de línea: un campo de una línea con contador 'N/200'.

## 8. Modelo de datos

Sin cambios: ni tablas, ni columnas, ni migraciones (D-011-15). Todo lo que estas pantallas necesitan ya existe en tables, orders, order_items, order_item_components, order_item_sauces, kitchen_tickets e idempotency_keys de las specs 009 y 010.

## 9. API

Sin cambios de contrato: docs/api/openapi.yaml queda en la versión 0.9.0. Las pantallas consumen:

| Método y ruta | Uso en la pantalla |
| --- | --- |
| GET /api/tables | Tablero y resolución de la mesa de la ruta (polling 5 s; filtrar `isActive`) |
| POST /api/tables/{tableId}/orders | 'Abrir mesa' (201 `Order`) |
| POST /api/tables/{tableId}/join | 'Unir mesa' (origen → `{ intoTableId }` destino) |
| POST /api/tables/{tableId}/leave | 'Separar Mesa N' |
| GET /api/orders/{orderId} | Detalle del pedido con ítems y total (polling 5 s) |
| POST /api/orders/{orderId}/move | 'Mover a otra mesa' `{ tableId }` |
| POST /api/orders/{orderId}/request-bill | 'Pedir la cuenta' |
| POST /api/orders/{orderId}/ready | 'Marcar pedido listo' |
| POST /api/orders/{orderId}/served | 'Marcar servido' |
| POST /api/orders/{orderId}/cancel | 'Cancelar pedido' `{ reason }` |
| GET /api/menu | La carta armada de la toma de pedido (al entrar) |
| POST /api/orders/{orderId}/items | 'Enviar a cocina' con `Idempotency-Key` y `{ items: [...] }` (201 `{order, ticket}`) |
| POST /api/orders/{orderId}/items/{itemId}/request-void | 'Solicitar anulación' `{ reason }` + `Idempotency-Key` |
| POST /api/orders/{orderId}/items/{itemId}/void | 'Anular'/'Aprobar anulación' del admin `{ reason }` + `Idempotency-Key` (200 `{order, ticket}`) |
| POST /api/orders/{orderId}/items/{itemId}/reject-void | 'Rechazar solicitud' del admin, sin cuerpo + `Idempotency-Key` |
| GET /api/orders/{orderId}/tickets | 'Comandas enviadas' |

Errores que las pantallas manejan: 400 VALIDATION_ERROR (issues por path, incluidos `items.N.*`, `reason` e `idempotencyKey`), 401 UNAUTHENTICATED (lleva a /login), 403 FORBIDDEN, 404 TABLE_NOT_FOUND / ORDER_NOT_FOUND / ORDER_ITEM_NOT_FOUND, y los 409 TABLE_OCCUPIED, TABLE_INACTIVE, TABLE_HAS_NO_ORDER, ORDER_NEEDS_TABLE, ORDER_NOT_OPEN, ORDER_ITEMS_LIMIT, ORDER_HAS_ACTIVE_ITEMS, ORDER_ITEM_VOID_REQUESTED, ORDER_ITEM_ALREADY_VOIDED, ORDER_ITEM_NOT_REQUESTED e IDEMPOTENCY_CONFLICT. Sin eventos Socket.IO (D-011-03).

## 10. Interfaz

Textos en español de Perú, botones y tarjetas de al menos 48 px, marco de RoleGuard area '/mozo'. Las rutas exactas de los componentes internos las decide el implementador dentro de apps/web/src/components/waiter/; lo que fija esta spec son los nombres accesibles y los textos (los tests los buscan por rol y nombre).

### 10.1 /mozo — tablero de mesas

- h1 'Mesas'. Grilla de tarjetas (dos columnas a 360 px), una por mesa activa: nombre, etiqueta del estado con su color, y con pedido 'Juan · S/ 45.00', 'y Mesa 4' por cada mesa unida, las marcas de listo/cuenta cuando correspondan y 'Anulación pedida' cuando haya ítems `void_requested`.
- Estados: 'Cargando mesas...' (role status); 'No se pudo cargar el salón.' (role alert) con 'Reintentar'; 'No hay mesas activas.'.

### 10.2 /mozo/mesas/[tableId] — mesa libre

- h1 con el nombre ('Mesa 3'), estado 'Libre' y botón 'Abrir mesa' ('Abriendo...' mientras envía). Enlace 'Volver a las mesas' hacia /mozo.

### 10.3 /mozo/mesas/[tableId] — pedido

- Encabezado: nombre de la mesa, etiqueta del estado, 'y Mesa 4' cuando cubra más y el enlace 'Volver a las mesas'.
- Sección 'Pedido': las líneas de ítems de D-011-06 con su estado y 'Total S/ X.XX' al pie; vacío 'Todavía no hay ítems enviados.'.
- Sección 'Acciones': 'Agregar ítems' (→ /mozo/mesas/[tableId]/agregar), 'Marcar pedido listo' o 'Marcar servido' según `readyAt`, 'Pedir la cuenta' mientras `billRequestedAt` esté vacío, 'Mover a otra mesa', 'Unir mesa', 'Separar Mesa N' cuando cubra más de una, 'Cancelar pedido'.
- Sección 'Comandas enviadas': las comandas con su etiqueta, hora e ítems; 'Anulación' solo para admin.
- Estados: 'Cargando pedido...' ; 'No se pudo cargar el pedido.' + 'Reintentar'; 'Esa mesa no existe.' / 'Ese pedido no existe.' con el enlace al tablero.

### 10.4 /mozo/mesas/[tableId]/agregar — toma de pedido

- h1 'Agregar ítems' con el nombre de la mesa debajo y el enlace 'Volver al pedido'.
- Secciones por categoría con las tarjetas de producto (nombre + 'S/ X.XX'); el editor del ítem de D-011-07; el carrito como lista con quitar/corregir; 'Enviar a cocina (N)' ('Enviando...' mientras envía); tras el error 'Reintentar envío'.
- Estados: 'Cargando carta...'; 'No se pudo cargar la carta.' + 'Reintentar'; 'La carta está vacía.'.

### 10.5 Diálogos

- 'Motivo de la anulación' / 'Motivo de la cancelación': campo de una línea 1-200 con 'Aceptar' y 'Cancelar'; la aprobación del admin trae el motivo del mozo precargado editable.
- '¿Separar Mesa 4? Quedará libre.' con 'Sí, separar' y 'Cancelar'; '¿Rechazar la anulación que pidió Juan? El ítem sigue contando en la cuenta.' con 'Sí, rechazar' y 'Cancelar'.
- Selectores de mesa: 'Mover a otra mesa' muestra las libres; 'Unir mesa' las ocupadas con su nombre — ambos con su botón de confirmación.

## 11. Contrato interno de módulos

| Módulo | Expone / cambia |
| --- | --- |
| apps/web/src/lib/api/client.ts | `ApiRequestOptions` suma `idempotencyKey?: string` → cabecera `Idempotency-Key` (nada más cambia) |
| apps/web/src/lib/api/tables.ts (nuevo) | getTables, openTableOrder, joinTable, leaveTable |
| apps/web/src/lib/api/orders.ts (nuevo) | getOrder, moveOrder, requestBill, markReady, markServed, cancelOrder, getOrderTickets |
| apps/web/src/lib/api/order-items.ts (nuevo) | sendOrderItems, requestVoidItem, voidOrderItem, rejectVoidItem |
| apps/web/src/lib/api/menu.ts (nuevo) | getMenu |
| apps/web/src/lib/idempotency.ts (nuevo) | createIdempotencyKey (crypto.randomUUID) |
| apps/web/src/lib/menu-labels.ts | suma TABLE_STATE_LABELS, ORDER_ITEM_STATUS_LABELS, KITCHEN_TICKET_KIND_LABELS (o un labels.ts nuevo del salón; lo decide el implementador) |
| apps/web/src/app/mozo/page.tsx | tablero (reemplaza el placeholder) |
| apps/web/src/app/mozo/mesas/[tableId]/page.tsx y agregar/page.tsx (nuevos, 'use client', RoleGuard area '/mozo') | la mesa/pedido y la toma; componentes en apps/web/src/components/waiter/ |
| e2e/global-setup.ts (terreno del test-writer) | clearOrderTables + mesas E2E + crema y combo de la semilla |
| e2e/waiter.spec.ts (nuevo) | los tres recorridos de AC-22 a AC-24 |
| apps/api, packages/shared, la base, docs/api/openapi.yaml | sin cambios |

## 12. Cambios a specs anteriores

Ninguno en contrato ni dominio. La 011 solo consume lo ya aprobado (openapi.yaml queda en 0.9.0) con toques aditivos dentro de apps/web: client.ts suma la opción `idempotencyKey`, menu-labels.ts (o un labels nuevo) suma las etiquetas del salón, y app/mozo/page.tsx reemplaza el placeholder de la 003 — el enlace/área ya existen. e2e/global-setup.ts suma la limpieza del salón y la semilla ampliada conservando usuarios y carta.

## 13. Dependencias

Ninguna nueva ni de soporte: TanStack Query, MSW, Playwright, HeroUI, Tailwind, react-aria-components, Zod y los esquemas y funciones de shared (formatSoles, toLimaDateTimeParts, formatPortionCutLabel vía menu-labels) ya están instalados y aprobados. Sin variables de entorno nuevas. Sin ADR.

## 14. Fuera de alcance

- La impresión de la comanda en la impresora térmica y cualquier aviso a cocina (Fase 3, RF-08 a RF-11): la 'Comandas enviadas' de esta spec solo lee el registro por API.
- Pre-cuenta impresa, cobro, división de cuenta, cierre `closed` y caja (Fase 4, RF-13 a RF-17): 'Pedir la cuenta' solo deja la marca; cobrar no existe aún.
- Stock, agotados y alertas en la carta del mozo (Fase 5, RF-20 a RF-24): la pantalla no muestra stock porque la API aún no lo calcula; los desactivados ni llegan en /api/menu.
- Pedidos para llevar/delivery (RF-12): no hay flujo sin mesa en la UI.
- Administración de mesas (alta/desactivar, spec 012 o posterior) y la administración de la carta ya entregada en /admin.
- Bandeja de solicitudes de anulación de todo el salón (la API no tiene listado agregado; es backend nuevo — pregunta 3).
- Socket.IO y eventos en tiempo real (D-011-03; pregunta 4).
- Pantalla de cocina (marca 'listo' la hace el mozo o quien escuche el aviso — decisión de la 009).
- Edición de ítems enviados (no existe por diseño: se anula y se envía de nuevo — 010).
- Plano visual del salón, número de personas por mesa, estados 'limpiando/reservada' (decisiones de la 009).
- Auditoría visible de operaciones (quién movió/unió — deuda de Fase 6); lo visible hoy es lo que devuelve la API.
- Cambios en la API, la base, shared o el contrato (hueco real → pregunta 11, nunca solución desde la web).

## 15. Riesgos

- **Polling de 5 s que se siente lento en la demo** (una mesa recién ocupada por otro mozo tarda en verse): mitigación — tras cada mutación propia se invalida y se relee al instante, y el riesgo queda como pregunta abierta 4 para evaluar Socket.IO después de mostrarla.
- **El mozo toca 'Enviar' y el wifi se cae justo después del POST**: la respuesta se pierde pero la comanda sí entró; el reintento con la misma clave devuelve el 201 guardado (regla 5 en acción, no solo en la API). Mitigación central de la spec: la clave vive en el estado del carrito hasta el 201 o el descarte.
- **El admin aprueba anulaciones sin enterarse porque nadie le avisó**: mitigación parcial — el tablero marca 'Anulación pedida' por mesa; la bandeja agregada queda como pregunta 3 (backend nuevo).
- **El mozo marca 'listo' por error**: la API lo permite (decisión 009); 'servido' lo corrige sin rastro nocivo. Riesgo bajo aceptado.
- **Carrito perdido al navegar o recargar**: estado local por diseño (RN-011-02); el mozo vuelve a armar la tanda — mismo costo que cualquier formulario del sistema (la 004/008 ya lo aceptaron).
- **'Anulación' de comandas solo visible para admin**: si el mozo necesitara ver el registro de anulaciones ejecutadas, la sección tendría que abrirse — hoy solo ve la marca del ítem; queda como pregunta 8.
- **Tandas de 21+ ítems** (pedido de empresa): el tope lo corta en la pantalla; el mozo manda dos tandas — comportamiento correcto pero que conviene saber en la demo.
- **Menú cacheado y producto desactivado al vuelo**: el issue del servidor llega junto a la línea; el mozo quita esa línea y reintenta — el carrito sobrevive.
- **Unir/mover con ítems ya enviados a cocina**: las comandas nuevas saldrán con la mesa actual del pedido; la impresa (Fase 3) lo resuelve — documentado desde la 009 §15.
- **El pedido típico en <30 s puede no cumplirse con carta larga**: mitigación — preselección cuarto/pierna, secciones cortas, un solo toque de envío; se mide en la verificación manual, no en tests.

## 16. Supuestos

| ID | Supuesto |
| --- | --- |
| S-011-01 | Solo apps/web + la opción `idempotencyKey` del cliente; API, base, shared y openapi.yaml 0.9.0 sin cambios (D-011-01). |
| S-011-02 | Rutas /mozo, /mozo/mesas/[tableId] y /mozo/mesas/[tableId]/agregar bajo RoleGuard '/mozo' (D-011-02). |
| S-011-03 | Polling de 5 s en tablero y pedido; menú al entrar; sin Socket.IO (D-011-03). |
| S-011-04 | Tablero: tarjetas por mesa activa con etiqueta+color, mozo y total, mesas unidas, ambas marcas y 'Anulación pedida' (D-011-04). |
| S-011-05 | La mesa se resuelve del listado (no hay GET individual); libre → 'Abrir mesa', cubierta → pedido por GET /api/orders/{orderId} (D-011-05). |
| S-011-06 | Tres secciones: Pedido, Acciones, Comandas enviadas; ítems con etiquetas por estado y '· Mesa N' por mesa de origen; comandas 'Anulación' solo para admin (D-011-06). |
| S-011-07 | Toma con secciones de la carta, editor por ítem (preselección cuarto/pierna, distribución del medio, cremas con cantidad, observación 200), combo con elección de parte por componente de pollo, carrito local con tope 20 (D-011-07). |
| S-011-08 | El cuerpo sigue `sendOrderItemsRequestSchema` y el precio mostrado replica el cálculo del ítem (D-011-08). |
| S-011-09 | Idempotency-Key por intento con crypto.randomUUID, conservada en el reintento del mismo intento (D-011-09). |
| S-011-10 | Tras el 201: carrito vacío, invalidación y 'Pedido enviado a cocina.' de vuelta en la mesa (D-011-10). |
| S-011-11 | Anulación: el mozo solicita con motivo; el admin resuelve (aprobar con motivo final / rechazar) y anula directo, todo en la misma pantalla del pedido; sin bandeja aparte (D-011-11). |
| S-011-12 | Mover/unir/separar incluidos; listo y servido los marca el mozo; cuenta; cancelar con motivo; confirmaciones solo en separar y rechazar (D-011-12). |
| S-011-13 | Validación local con los esquemas de shared, issues items.N.* junto a la línea, un solo envío en vuelo, mensajes del servidor tal cual (D-011-13). |
| S-011-14 | Mobile-first a 360 px con controles ≥48 px; RNF-01 se apoya en preselección y se verifica manualmente (D-011-14). |
| S-011-15 | Sin migraciones, variables, dependencias ni ADR (D-011-15). |
| S-011-16 | Tres recorridos E2E todos en mobile-chrome con la semilla de D-011-16 (D-011-16). |

## 17. Preguntas abiertas (con recomendación)

1. **¿Las rutas propuestas /mozo, /mozo/mesas/[tableId] y /mozo/mesas/[tableId]/agregar están bien o se prefiere otra estructura?** Se propone esa: el mozo piensa en mesas y el recorrido natural es tablero → mesa → agregar → mesa. Recomendación: aceptar.
2. **¿Mover, unir y separar entran en la 011?** RF-03 pide abrir/mover/unir; la API ya permite las tres al mozo y separar una unión mal hecha es operación diaria. Recomendación: incluir las tres.
3. **¿Basta la vista mínima de anulaciones (el admin resuelve dentro del pedido) o se necesita una bandeja de pendientes del salón?** Una bandeja sería más cómoda pero la API no tiene listado agregado: pedirla es backend nuevo. Recomendación: vista mínima ya; la bandeja queda para una spec de admin si el dueño la pide.
4. **¿Polling de 5 s basta para la demo o se quiere refresco instantáneo?** Socket.IO está aprobada pero sin implementar; agregarla es backend nuevo. Recomendación: polling de 5 s (decisión ya aceptada en la 009) y evaluar sockets si la demo lo pide.
5. **¿El mozo marca 'pedido listo' además de 'servido'?** La API lo permite (waiter/kitchen/admin, decisión de la 009) y no hay pantalla de cocina: el mozo lo marca al escuchar el aviso como hoy. Recomendación: incluir ambas acciones.
6. **¿Las cremas se eligen con cantidad o solo marcadas?** La API admite cantidad por crema; "dos ají" existe. Recomendación: checkbox + campo 'Cantidad' al marcarla (1 por defecto).
7. **¿Confirmaciones en las acciones del salón?** Se propone: solo 'Separar' y 'Rechazar solicitud' confirman; abrir/mover/unir/cuenta/listo/servido actúan al toque y cancelar lleva su diálogo de motivo. Recomendación: aceptar.
8. **¿El mozo ve las comandas 'Anulación' en 'Comandas enviadas'?** Se propone que solo el admin las vea (la solicitud no emite comanda y la resolución es suya); el mozo ve la marca del ítem. Recomendación: aceptar.
9. **¿Mostrar el tiempo que lleva abierta la cuenta o lista el pedido?** Se propone no: `openedAt`/`readyAt` existen pero un "hace 20 min" no está en los RF y agrega relojes a la pantalla. Recomendación: no incluir.
10. **¿Búsqueda o filtro en la carta del mozo?** Se propone no: secciones por categoría con scroll, igual que /admin/carta; una carta de pollería es corta. Recomendación: no incluir.
11. **¿Y si en la implementación aparece un hueco real en la API?** El encargo lo pide explícito: se documenta aquí. Por ahora se verificó el contrato 0.9.0 completo contra cada pantalla y no hay huecos: las 16 rutas consumidas existen con sus roles y formas. Si apareciera uno, se reporta al orquestador como tarea de backend separada — nunca se tapa desde la web. Recomendación: confirmar el criterio.
12. **¿Cantidad de E2E y dispositivo?** Se proponen tres recorridos todos en mobile-chrome (la pantalla del mozo es el celular), cada uno verificando sin desplazamiento horizontal. Recomendación: aceptar.

## 18. Acción del usuario y verificación manual

1. `pnpm -w build` no es necesario (shared no cambia); basta `pnpm dev` con la carta y las mesas del desarrollo cargadas (pendientes manuales de la 008/009/010 ya documentados: migraciones en polleria_dev, productos y mesas por API).
2. Con sesión de mozo en el celular (o a 360 px): abrir una mesa → enviar una tanda mixta (cuarto pierna + bebida + crema + observación) → ver ítems y 'Total S/ X.XX' → agregar una segunda tanda (comanda 'Adición') → marcar 'pedido listo' → 'servido' → 'Pedir la cuenta' → solicitar anulación de un ítem con motivo.
3. Con sesión de admin en otra pantalla (o el mismo celular cambiando de área): ver la marca 'Anulación pedida' en el tablero → entrar a la mesa → 'Aprobar anulación' con el motivo final (o 'Rechazar solicitud') → el ítem queda 'Anulado' y el total ajustado; y 'Anular' directo sobre otro ítem.
4. Mover el pedido a otra mesa, unir una tercera mesa y separarla; cancelar un pedido sin ítems con motivo.
5. Corte de wifi simulado: enviar una tanda, cortar la red del navegador tras el toque, restaurar y 'Reintentar envío' → una sola comanda en cocina, sin duplicar.
6. Pedido típico (1/4 pierna + bebida) cronometrado: menos de 30 segundos (RNF-01).

## 19. Notas para specs siguientes

- **012 Administración de mesas (si no se absorbe):** alta/renombre/desactivar por API ya existe (POST/PATCH /api/tables, solo admin) — queda pendiente su pantalla dentro de /admin; el tablero de la 011 ya filtra `isActive`.
- **Fase 3 (impresión, RF-08 a RF-11):** 'Comandas enviadas' ya muestra el registro que la impresión consumirá; el número de comanda visible hoy es el `id` global (decisión de la 010); si la impresión agrega numeración diaria, la sección se ajusta.
- **Fase 4 (cuenta y cobro):** el 'Pidió la cuenta' del tablero es la señal que caja esperará; `totalCents` ya llega formateable a todas las pantallas.
- **Socket.IO (si se pide tras la demo):** el polling está aislado en las consultas del tablero y del pedido; pasar a eventos tocaría el cliente de las mismas consultas más el backend nuevo.
- **Bandeja de anulaciones del admin (pregunta 3):** necesita un listado agregado por API (backend nuevo); la pantalla del pedido ya sabe resolver cada solicitud donde vive.
- **Fase 5 (stock):** la toma de pedido deberá mostrar agotados cuando la API los calcule; hoy solo filtra activos.
