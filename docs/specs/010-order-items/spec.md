# Spec 010 — Ítems del pedido, comandas como registro y anulación (dominio + API)

- Estado: Aprobada (2026-10-10): 17 respuestas recomendadas aceptadas y la pregunta 9 respondida explícitamente por el usuario (el mozo SOLICITA la anulación con motivo y el administrador la ejecuta o la rechaza; el administrador también puede anular directo sin solicitud previa)
- Fase: 2 (Mesas y pedidos)
- Rama: feat/010-order-items
- Fecha: 2026-10-11
- Cubre: RF-04 completo (el mozo registra un pedido eligiendo producto, presentación 1/8, 1/4, 1/2, entero y parte pecho/pierna), RF-05 completo (cremas, bebidas y observaciones por ítem), RF-06 completo (agregar ítems a un pedido abierto; cada adición genera una comanda nueva como registro — la impresión es Fase 3) y RF-07 completo (anular un ítem enviado a cocina: el mozo lo solicita con motivo y el administrador lo ejecuta o lo rechaza — auditoría de quién pidió, quién aprobó y cuándo). Ejecuta las reglas de dominio 4 (precio copiado al ítem) y 5 (Idempotency-Key en el envío) y activa la regla declarada RN-009-08 (cancelar un pedido con ítems). Siembra RF-08 y RF-09 (la comanda queda registrada con su detalle para imprimirla en la Fase 3), RF-13 (el pedido ya trae totalCents para la pre-cuenta) y RF-27 (cada ítem registra quién lo envió y quién lo anuló).
- Documentos relacionados: tasks.md (esta carpeta), docs/planificacion.md (RF-04 a RF-07, módulo Pedidos, HU-02, HU-03, HU-06, HU-07, HU-10 del proceso actual, preguntas para el dueño), docs/specs/005-menu-products/spec.md (productos, categorías, price_cents, desactivar sin borrar), docs/specs/006-portions-eighths/spec.md (presentaciones, partes, chickenConsumption, D-006-05, RN-006-08), docs/specs/007-combos/spec.md (combo_items, comboChickenConsumption, D-007-12, RN-007-11), docs/specs/009-tables/spec.md (orders, tables, merge, cancel, marcas; §19 deja esta spec), docs/specs/002-printer-service/spec.md (la comanda impresa de la Fase 3 corta a 48 columnas; ADV-002-01 condiciona el tope de observaciones), docs/api/openapi.yaml (versión 0.8.0 → propuesta 0.9.0; esta spec solo propone el contrato: lo edita la implementación) y CLAUDE.md (reglas de dominio 1, 2, 4, 5, 6 y 8; glosario: ítem = orderItem, comanda = kitchenTicket, cremas = sauces, anulación = voidItem, parte = cut, presentación = portion).

## 1. Contexto

La 009 dejó el salón funcionando: mesas con estado y la cuenta (`orders`) con su ciclo completo. Pero una cuenta sin ítems no vende nada: falta lo que el mozo realmente anota — "un cuarto pierna con ají y sin ensalada, una chicha y un mostrito". Esta spec crea el ítem del pedido con todo lo que la cocina necesita ver en la comanda (producto, presentación, parte, cremas, observación y los componentes del combo), copiando precio, nombre y octavos al registrarse para que cambios en la carta no alteren cuentas abiertas ni el historial (regla 4). Cada envío crea una comanda como registro de datos (la impresión llega en la Fase 3) y es idempotente con Idempotency-Key (regla 5): un doble toque o un reintento de red no duplica ni ítems ni comandas. Anular un ítem ya enviado lo solicita el mozo con motivo y lo resuelve el administrador — lo aprueba con su comanda 'void' o lo rechaza — dejando rastro de ambos actores (regla 6, RF-07); el administrador también puede anular directo sin solicitud previa. Es dominio + API solamente, como las specs 005, 006, 007 y 009: las pantallas del mozo son la 011.

### Qué hace el mozo hoy y qué queda

Hoy el mozo memoriza o anota en papel y camina a la cocina a dictar (HU-06, HU-07). Con esta spec el pedido viaja de la mesa a la base con una sola llamada por tanda de ítems; cada envío deja su comanda registrada y las adiciones generan comandas nuevas (RF-06). La impresión en cocina (RF-08 a RF-11), la pre-cuenta y el cobro (RF-13 a RF-17), el stock (RF-20 a RF-24) y las pantallas (spec 011) quedan para sus fases.

## 2. Historias de usuario

| ID | Historia |
| --- | --- |
| HU-010-01 | Como mozo, quiero registrar el pedido de la mesa eligiendo producto, presentación (1/8, 1/4, 1/2, entero) y parte (pecho o pierna), para que llegue exacto a cocina sin tener que ir a dictarlo. |
| HU-010-02 | Como mozo, quiero indicar las cremas y una observación por ítem ("sin ensalada", "bien dorado", "ají aparte"), para que el cliente reciba el plato como lo pidió. |
| HU-010-03 | Como mozo, quiero agregar bebidas, platos y combos al mismo pedido, para cubrir todo lo que la mesa consumió con una sola cuenta. |
| HU-010-04 | Como mozo, quiero agregar ítems a un pedido abierto a mitad de la comida, generando una comanda nueva por cada adición, para que cocina prepare solo lo nuevo. |
| HU-010-05 | Como administrador, quiero aprobar o rechazar la anulación que el mozo pidió — registrando el motivo final — para corregir un error dejando el rastro de quién lo pidió, quién lo resolvió, cuándo y por qué. |
| HU-010-06 | Como sistema, quiero que reenviar el mismo pedido (doble toque, reintento de red sin respuesta) no duplique ítems ni comandas, para que la cocina no prepare dos veces lo mismo. |
| HU-010-07 | Como cocina, quiero que cada comanda registrada traiga el detalle resuelto (producto, cantidad, presentación, parte, cremas, observación, componentes del combo), para saber exactamente qué servir. |
| HU-010-08 | Como mozo (y caja), quiero ver el pedido con sus ítems y el total acumulado, para avisarle al cliente cuánto lleva la cuenta. |
| HU-010-09 | Como administrador, quiero que un pedido que ya tuvo ítems solo lo pueda cancelar yo después de anularlos, para que nadie borre una venta real sin dejar rastro. |
| HU-010-10 | Como sistema, quiero copiar el precio vigente, el nombre y la composición de cada ítem al registrarme, para que un cambio en la carta no altere las cuentas abiertas ni el historial (regla de dominio 4). |
| HU-010-11 | Como mozo, quiero solicitar la anulación de un ítem enviado escribiendo su motivo, para que quede pendiente a que el administrador la resuelva sin tener que buscarlo y explicarlo de memoria. |

## 3. Decisiones técnicas

Confirmadas por el usuario el 2026-10-10: S-010-01 a S-010-18 con las respuestas recomendadas, salvo la decisión de anulación (pregunta 9) respondida explícitamente por el usuario — D-010-10 es RESPUESTA DEL USUARIO, no supuesto. Se conservan abajo como registro.

**D-010-01. Alcance: solo dominio + API, sin pantallas (SUPUESTO S-010-01).**
- Igual que las specs 005, 006, 007 y 009: esta spec deja listo el modelo (order_items, order_item_components, order_item_sauces, kitchen_tickets, idempotency_keys), los esquemas compartidos, los servicios y las rutas. Las pantallas del mozo son la spec 011. No hay tareas de frontend-dev ni pruebas E2E.
- Consecuencia: ningún archivo de apps/web cambia.

**D-010-02. El ítem es una fila de `order_items` que copia todo lo que cobra y describe (regla 4; SUPUESTO S-010-02).**
- Columnas: `id`, `order_id` (FK a orders), `product_id` (FK a products — el vínculo histórico para reportes), `product_name`, `product_category` (copias del nombre y la categoría: la comanda y los reportes no dependen de que el producto siga igual), `quantity` (1-99), `price_cents` (precio unitario copiado), `portion`, `cut`, `breast_eighths`, `leg_eighths` (octavos resueltos de la línea, regla 1), `notes` (observación), `status` ('sent' | 'void_requested' | 'voided'), `kitchen_ticket_id` (la comanda que lo creó), `void_requested_at` + `void_requested_by_user_id` + `void_request_reason` (la solicitud de anulación del mozo), `void_ticket_id` + `voided_at` + `voided_by_user_id` + `void_reason` (la anulación aprobada/ejecutada por el admin), `ordered_at_table_id` (la mesa de origen para la traza de uniones, §19 de la 009), `created_by_user_id` (quién lo envió), `created_at`, `updated_at`.
- Todo lo que el cobro, la comanda y el stock futuro necesitan vive en la fila: un cambio de nombre, precio, presentación o componentes en la carta no toca ítems ya registrados (RN-006-08 y RN-007-11 ejecutadas). El `product_id` queda solo como vínculo (ventas por producto de la Fase 6), nunca como fuente del precio ni del nombre en la respuesta.
- `ordered_at_table_id`: la primera mesa (menor id) que cubre el pedido al momento del envío. Cuando el pedido se une a otro, los ítems conservan su mesa de origen: la traza "la mesa 4 pidió esto antes de unirse" sobrevive al merge (riesgo de la 009, §15). NULL solo para el futuro pedido sin mesa (para llevar, RF-12); en esta spec siempre hay mesa.

**D-010-03. El precio del ítem sale de la carta vigente al enviar (ejecuta D-006-05 y D-007-05; SUPUESTO S-010-03).**
- Producto 'chicken' CON presentaciones configuradas: `portion` es obligatoria y debe ser una fila ofertada en product_portions; el ítem copia el `price_cents` DE ESA FILA (verificado: D-006-05 "cobra el precio de la fila" — el `price_cents` del producto no se usa para cobrar).
- Producto 'chicken' SIN presentaciones y cualquier otra categoría (incluido 'combo'): ítem simple que copia `products.price_cents`. El combo cobra su precio propio; los componentes no llevan precio dentro (D-007-05).
- `portion`/`cut` solo existen en ítems de producto 'chicken' con presentaciones; en los demás deben venir vacíos (issue por ítem, tabla de D-010-18). La regla "presentación ofertada" se verifica contra la carta al momento del envío.

**D-010-04. Los octavos se copian resueltos y el medio admite distribución real (regla 1; ejecuta S-006-06; SUPUESTO S-010-04).**
- `breast_eighths`/`leg_eighths` guardan el TOTAL de la línea (quantity × consumo de una unidad): un "2 cuartos pierna" guarda leg_eighths 4; un entero ×2 guarda 16+16. La Fase 5 descuenta estos octavos copiados con la regla de dominio 3.
- Octavo y cuarto: los octavos son los de la parte elegida (chickenConsumption). Entero: siempre 4+4, sin opción. Medio: por defecto 2+2, pero el cliente puede pedir otra distribución ("medio solo pierna" = 0+4): la entrada admite `breastEighths`/`legEighths` por unidad, ambos obligatorios si vienen, cada uno 0-4 y sumando exactamente 4; el precio no cambia (se cobra el del medio, S-006-06).
- Para un componente de pollo dentro de un combo rige la misma regla (D-010-05).

**D-010-05. Los componentes del combo se copian resueltos en `order_item_components` (ejecuta RN-007-11; SUPUESTO S-010-05).**
- Al registrar un ítem de producto 'combo', se copia su lista de componentes vigente: cada fila guarda `product_id`, `product_name`, `quantity`, `portion`, `cut` y los octavos resueltos de esa línea (total por componente). Un combo sin componentes configurados se registra como ítem simple sin hijas (D-007-12).
- Si el cliente elige la parte del pollo del combo en el mostrador (pregunta pendiente del dueño), la entrada `components` permite resolver la lista final: debe corresponderse con la configurada — mismo conjunto de (productId, portion, quantity); en componentes de pollo se admite otra `cut` (eighth/quarter) u otra distribución (half, sumando 4 por unidad); en los demás componentes nada puede cambiar. Sin `components` en la entrada se copian los valores por defecto de la carta.
- Consecuencia: la parte "real elegida" vive en order_item_components.cut y en sus octavos; el consumo del ítem completo (suma de componentes) se copia a los octavos del propio ítem para que la Fase 5 lea un solo lugar.

**D-010-06. Las cremas son hijas del ítem en `order_item_sauces` (RF-05; SUPUESTO S-010-06).**
- "1/4 pierna con ají y mayonesa": las cremas se indican POR ÍTEM, no como ítems sueltos, porque van pegadas al plato en la comanda. Cada fila copia `product_id`, `product_name`, `quantity` y `price_cents` del producto 'sauce' — que puede ser S/ 0.00 (crema gratis de la 005) o tener precio si el dueño las cobra (pregunta pendiente); su monto suma al total del pedido (D-010-14).
- Reglas: el producto de cada crema debe existir, ser categoría 'sauce' y estar activo; hasta 6 cremas por ítem sin repetir producto; quantity 1-99 por crema. Solo los ítems de comida (categorías 'chicken', 'combo', 'dish') llevan cremas — "Inca Kola con ají" no tiene sentido.
- Una crema también puede ser un ítem suelto del pedido (una porción de ocopa aparte): es un ítem simple más.

**D-010-07. La comanda es un registro de envío: `kitchen_tickets` (RF-06; base de RF-08/RF-09; SUPUESTO S-010-07).**
- Cada envío de ítems crea UNA comanda que los agrupa: `kitchen_tickets` = `id`, `order_id` (FK), `kind` ('initial' | 'additional' | 'void'), `created_by_user_id` (quién envió o anuló), `created_at`, `updated_at`. 'initial' es la primera comanda de ítems del pedido; las siguientes son 'additional' (RF-06: cada adición genera una comanda nueva).
- Cada anulación APROBADA crea una comanda `kind: 'void'` que referencia el ítem anulado vía `order_items.void_ticket_id` (base del "ANULADO" de RF-09; la impresión es Fase 3). Las comandas de ítems enlazan sus ítems con `order_items.kitchen_ticket_id`; así una comanda lista sus ítems y un ítem sabe en qué envío llegó — sin tabla puente. La SOLICITUD de anulación no emite comanda (D-010-10).
- El número de comanda es el `id` global (RF-08 pide "número"; la numeración diaria se decide con la impresión en la Fase 3 — pregunta 17). Mesa, mozo y hora se derivan del pedido y del autor; el detalle es la lista de ítems resueltos.
- En un merge (D-010-12), las comandas del pedido absorbido se repointan al destino junto con sus ítems: toda la historia de la cuenta queda bajo el pedido que sobrevive.

**D-010-08. El envío es idempotente con `Idempotency-Key` y la respuesta queda guardada (regla 5; SUPUESTO S-010-08).**
- Las cuatro operaciones que escriben ítems — POST /orders/{orderId}/items (envío), POST /orders/{orderId}/items/{itemId}/request-void (solicitud de anulación), POST /orders/{orderId}/items/{itemId}/void (aprobación/anulación directa) y POST /orders/{orderId}/items/{itemId}/reject-void (rechazo) — exigen la cabecera `Idempotency-Key` (texto visible ASCII de 1 a 128 caracteres, `^[\x21-\x7E]{1,128}$`; sin espacios). Falta o mala forma → 400 VALIDATION_ERROR con issue en `idempotencyKey` ('El envío necesita la cabecera Idempotency-Key.').
- Tabla `idempotency_keys`: `scope` ('order-items' para el envío, 'order-item-void-requests' para la solicitud, 'order-item-voids' para la aprobación/anulación y 'order-item-void-rejections' para el rechazo), `key`, `order_id` (FK), `request_hash` (SHA-256 del cuerpo ya validado, serializado de forma estable; en reject-void, sin cuerpo, es el hash del objeto vacío), `response_status`, `response_body` (JSONB con la respuesta completa), `created_at`. Unicidad `(scope, key)`.
- Semántica: en la misma transacción se intenta insertar la clave. Si ya existe: mismo `order_id` y mismo `request_hash` → se devuelve la respuesta guardada tal cual (replay; nada se duplica — regla 5 literal: "un reenvío no duplica ítems, comandas ni stock"). Distinto `order_id` o distinto `request_hash` → 409 IDEMPOTENCY_CONFLICT ('Esa clave de envío ya se usó con otros datos.'): la misma clave en otro pedido o con otro contenido es un error del cliente, no un reenvío.
- El chequeo de idempotencia va ANTES que las guardias de estado: reintentar un envío que ya entró responde la respuesta original aunque el pedido se haya movido, unido o cerrado después.
- Sin expiración ni limpieza: las claves viven con el historial del pedido (escala de decenas por día).

**D-010-09. El envío es atómico y no existe "borrador" en el servidor (SUPUESTO S-010-09).**
- POST /orders/{orderId}/items recibe la tanda completa `{ items: [...] }` (1 a 20 ítems por envío): se valida la forma (Zod), luego todas las reglas por ítem acumulando TODOS los issues en un solo 400 (el patrón de D-007-10, para que el mozo vea de una vez qué está mal en toda la tanda), y recién entonces se ejecuta en una transacción. Todo o nada: jamás quedan ítems a medias ni comanda sin ítems.
- No hay estado "pendiente de envío" en el servidor: corregir o quitar un ítem ANTES de enviarlo es asunto del carrito local de la pantalla (011); todo ítem registrado ya fue a cocina por construcción (`status: 'sent'` desde que nace — no hay ítem sin enviar).
- El envío exige pedido abierto (409 ORDER_NOT_OPEN), tope de 99 ítems no anulados ('sent' + 'void_requested') por pedido (409 ORDER_ITEMS_LIMIT) y responde 201 `{ order, ticket }`: el pedido ya embebido con ítems y totalCents (D-010-14) y la comanda creada con sus ítems.

**D-010-10. Anular un ítem es un ciclo de dos actores: el mozo lo solicita con motivo y el administrador lo resuelve — lo aprueba o lo rechaza (regla 6, RF-07; RESPUESTA DEL USUARIO a la pregunta 9 — decisión confirmada).**
- `status` del ítem: `'sent' → 'void_requested' → 'voided'`, o `'void_requested' → 'sent'` si el administrador rechaza la solicitud. El administrador también anula directo: `'sent' → 'voided'` sin solicitud previa (para cuando él mismo detecta el error).
- **Solicitud** (POST /orders/{orderId}/items/{itemId}/request-void, waiter o admin, `{ reason }` de 1-200 caracteres + Idempotency-Key): sobre un ítem 'sent' lo pasa a 'void_requested' con el triple de auditoría `void_requested_at`/`void_requested_by_user_id`/`void_request_reason`. Sobre 'void_requested' → 409 ORDER_ITEM_VOID_REQUESTED ('Ese ítem ya tiene una anulación pendiente.'); sobre 'voided' → 409 ORDER_ITEM_ALREADY_VOIDED. Responde 200 `{ order }`.
- **Aprobación** (la ruta POST .../void, solo admin): sobre 'void_requested' ejecuta la anulación pedida; sobre 'sent' anula directo. En ambos casos el ítem queda 'voided' con `voided_at`/`voided_by_user_id`/`void_reason` (el motivo FINAL lo escribe el admin en la aprobación — puede confirmar el del mozo o corregirlo) y su comanda 'void'. Auditoría de dos actores completa: quién pidió (`void_requested_*`, se conserva si la anulación vino por solicitud) y quién aprobó (`voided_*`). Re-anular con la MISMA clave es replay; con clave distinta sobre 'voided' → 409 ORDER_ITEM_ALREADY_VOIDED.
- **La solicitud NO emite comanda**: la 'void' es el aviso a cocina de que el plato ya no se sirva; emitirla al pedir haría descartar un plato que el administrador podría no anular. La solicitud vive solo en el pedido: el admin la ve pendiente en `order.items` (`status: 'void_requested'` + quién y por qué) al consultar el pedido o el tablero.
- **Rechazo** (POST .../reject-void, solo admin, sin cuerpo, con Idempotency-Key): devuelve el ítem a 'sent' y LIMPIA el triple de la solicitud — el ítem sigue contando y cocina lo termina normal. Sobre un ítem 'sent' → 409 ORDER_ITEM_NOT_REQUESTED ('Ese ítem no tiene una anulación pendiente.'); sobre 'voided' → 409 ORDER_ITEM_ALREADY_VOIDED. Responde 200 `{ order }`. La auditoría de solicitudes rechazadas no se conserva (la "por qué no" es verbal en un local chico; la bitácora completa va a la Fase 6 — §19). Decisión propia de esta spec: se incluye el rechazo porque sin él una solicitud quedaría pendiente para siempre, bloqueando la cancelación del pedido (D-010-11) y dejando al ítem en un estado sin salida.
- El ítem 'void_requested' SIGUE contando en `totalCents` y en el tope de 99 (todavía no está anulado: es lo que el cliente debe si el admin rechaza); la solicitud NO limpia `bill_requested_at` porque la cuenta aún no cambia — la aprobación sí la limpia (D-010-13). Re-solicitar tras un rechazo está permitido (triple nuevo).
- Guardias en orden para las tres rutas: pedido abierto (409 ORDER_NOT_OPEN), el ítem pertenece a ese pedido (404 ORDER_ITEM_NOT_FOUND), el estado permite la operación. Un ítem anulado nunca se borra y sigue en `order.items` marcado (la comanda de cocina ya lo vio; borrarlo mentiría sobre qué se pidió).

**D-010-11. Cancelar un pedido con ítems: RN-009-08 se vuelve aplicable (SUPUESTO S-010-11).**
- El `cancelOrder` de la 009 gana dos guardias antes de cancelar, en este orden: (1) si el pedido tiene ítems 'sent' O 'void_requested' → 409 ORDER_HAS_ACTIVE_ITEMS ('El pedido tiene ítems sin anular; un administrador debe anularlos primero.') para cualquier rol — primero se anula cada ítem y se resuelve cada solicitud pendiente (D-010-10); (2) si el pedido alguna vez tuvo ítems (existe al menos una fila, sea 'sent', 'void_requested' o 'voided') y el actor NO es admin → 403 FORBIDDEN (un pedido que tuvo venta real solo lo cierra sin cobrar el administrador).
- Pedido que nunca tuvo ítems: igual que la 009 (mozo o admin con motivo). Pedido con todos sus ítems anulados: solo admin. El resultado sigue siendo `status: 'cancelled'` con motivo y mesas liberadas; los ítems y comandas quedan como historial.

**D-010-12. Unir mueve ítems y comandas al pedido destino (ejecuta la nota §19 de la 009; SUPUESTO S-010-12).**
- En el merge de joinTable, además de repointar las mesas: `UPDATE order_items SET order_id = destino WHERE order_id = origen` y `UPDATE kitchen_tickets SET order_id = destino WHERE order_id = origen`, dentro de la misma transacción. Verificado: los ítems apuntan al pedido por `order_id`, así que el movimiento es un repoint directo; las comandas se mueven para que el pedido que sobrevive conserve toda su historia de envíos (un 'initial' del absorbido conserva su kind — es historia, no estado).
- `ordered_at_table_id` de cada ítem NO se toca: es exactamente la traza que pedía §19 para saber qué mesa pidió qué antes de unirse.
- El pedido absorbido queda 'merged' con sus ítems en cero (todos movidos); GET /orders/{id} del origen muestra `items: []` y `totalCents: 0` — coherente con `tables: []` que ya devolvía la 009. Las comandas del destino no cambian.

**D-010-13. Enviar ítems o anular limpia `bill_requested_at`; la marca `ready_at` se conserva (confirma la propuesta §19 de la 009; SUPUESTO S-010-13).**
- Enviar ítems nuevos o anular uno cambia la cuenta: si el cliente ya había pedido la pre-cuenta, esa ya no es la cuenta real. En ambas operaciones se limpia el par `bill_requested_at`/`bill_requested_by_user_id` en la misma transacción (a NULL: el par CHECK orders_bill_pair exige ambos o ninguno).
- `ready_at` NO se limpia: "pedido listo" significa que hay comida esperando recojo, y una adición nueva no la retira — el mozo debe recoger lo que ya estaba listo mientras cocina prepara lo nuevo. Cuando cocina termine la tanda nueva marcará `ready` otra vez (la 009 ya permite remarcar después de 'served').

**D-010-14. `Order` embebe `items` y `totalCents` (cambio señalado a la 009; SUPUESTO S-010-14).**
- El `Order` de D-009-14 pasa de 11 a 13 claves: suma `items` (TODOS los ítems del pedido — enviados y anulados — ordenados por id) y `totalCents` (suma de quantity × price_cents de los ítems 'sent' MÁS la suma de sus cremas quantity × price_cents; los 'voided' no cuentan).
- Vale para TODA respuesta con pedido: GET /api/orders/{orderId}, las operaciones de la 009 y el `order` embebido de cada mesa en GET /api/tables — así el tablero puede mostrar el total acumulado por mesa ("Mesa 3 · S/ 45.00"). La carga se resuelve en lote en loadOrderViews (consultas constantes por lote: ítems, cremas, componentes y usuarios; nunca una consulta por ítem ni por pedido — la misma disciplina N+1 de la 009).
- Es el único cambio no aditivo del contrato: las respuestas existentes ganan dos claves requeridas. Los tests de la 009 que asertaban la forma exacta de Order se actualizan en esta funcionalidad (sección 12 — precedente: la 007 actualizó tests de la 005).

**D-010-15. GET /api/menu: la carta armada para tomar pedidos (resuelve las notas §19 de la 006 y la 008; SUPUESTO S-010-15).**
- El mozo necesita productos + presentaciones + componentes de combo en UNA llamada para la pantalla de toma de pedido (N llamadas por producto no es aceptable en celular). `GET /api/menu` devuelve `{ products: [MenuProduct] }` con solo los productos ACTIVOS, en el orden de la carta (categoría, luego nombre con collator 'es', luego id).
- `MenuProduct` = `{ id, name, category, priceCents, portions, items }`: `portions` = `[{ portion, cut, priceCents }]` solo para 'chicken' con presentaciones (vacía en los demás), en el orden de D-006-11; `items` = `[{ product, quantity, portion, cut }]` solo para 'combo' con componentes (vacía en los demás), en el orden de D-007-09 con el producto componente embebido completo (incluido `isActive`, para que la pantalla advierta un componente desactivado).
- Lectura para cualquier rol con sesión; '/api/menu' se suma a NO_STORE_PATH_PREFIXES (sección 12).

**D-010-16. Quién hace cada operación (SUPUESTO S-010-16).**
- Lectura (GET /api/menu, GET /api/orders/{orderId}/tickets): cualquier rol con sesión — igual que el resto del salón.
- Enviar ítems y solicitar anulación: `waiter` o `admin` (operaciones de salón, igual que abrir/mover/unir de la 009). Cocina y caja reciben 403.
- Anular (aprobar la solicitud o ejecutarla directo) y rechazar: solo `admin` (regla 6). Cancelar pedido: waiter/admin mientras nunca tuvo ítems; solo admin si alguna vez los tuvo (D-010-11).

**D-010-17. Errores (formato común).**

| code | HTTP | message | details | Cuándo |
| --- | --- | --- | --- | --- |
| VALIDATION_ERROR | 400 | Los datos enviados no son válidos. | `{ issues }` | Cuerpo inválido (forma: cantidad fuera de rango, observación con saltos o >200, enumerados fuera de lista, correspondencia presentación-parte, tanda >20, propiedad de más); `orderId`/`itemId` de ruta inválidos; cabecera `Idempotency-Key` ausente o mal formada (issue en `idempotencyKey`); y los issues por ítem de D-010-18 acumulados. |
| ORDER_NOT_FOUND | 404 | Ese pedido no existe. | null | `orderId` de la ruta inexistente (009). |
| ORDER_ITEM_NOT_FOUND | 404 | Ese ítem no existe en este pedido. | null | `itemId` de la ruta válido pero no pertenece a ese pedido (o no existe). |
| ORDER_NOT_OPEN | 409 | El pedido ya está cerrado. | null | Enviar ítems o cualquier operación de anulación sobre un pedido closed/cancelled/merged. |
| ORDER_ITEM_ALREADY_VOIDED | 409 | Ese ítem ya fue anulado. | null | Solicitar, anular o rechazar un ítem 'voided' con una clave distinta de la original. |
| ORDER_ITEM_VOID_REQUESTED | 409 | Ese ítem ya tiene una anulación pendiente. | null | Solicitar la anulación sobre un ítem 'void_requested' con una clave distinta de la original. |
| ORDER_ITEM_NOT_REQUESTED | 409 | Ese ítem no tiene una anulación pendiente. | null | Rechazar sobre un ítem 'sent' (sin solicitud previa). |
| ORDER_HAS_ACTIVE_ITEMS | 409 | El pedido tiene ítems sin anular; un administrador debe anularlos primero. | null | Cancelar un pedido con al menos un ítem 'sent' (cualquier rol). |
| ORDER_ITEMS_LIMIT | 409 | El pedido llegó al límite de ítems. | null | El envío dejaría al pedido con más de 99 ítems 'sent'. |
| IDEMPOTENCY_CONFLICT | 409 | Esa clave de envío ya se usó con otros datos. | null | Misma `(scope, key)` con otro `order_id` u otro `request_hash`. |

- Los siete códigos nuevos se suman a ERROR_CODES de @polleria/shared. Ningún 4xx se registra en el log (RN-001-07). `itemId` de la ruta usa la misma regla que `orderId`/`productId` (`^[0-9]+$`, 1..2147483647) con el mensaje 'El identificador del ítem no es válido.'.
- Reparto igual que D-009-13 + D-007-10: problemas de la entidad de la RUTA → su código; problemas de DATO o de ESTADO de las referencias del CUERPO (producto, presentación, cremas, componentes) → issues acumulados de un solo VALIDATION_ERROR — es la forma en que el mozo ve todos los problemas de la tanda de una vez. La única excepción son los límites de estado del pedido (ORDER_NOT_OPEN, ORDER_ITEMS_LIMIT), que van como 409.

**D-010-18. Issues por ítem del envío (acumulados en `details.issues`, en el orden de la lista; SUPUESTO S-010-17).**

| path | message | Cuándo |
| --- | --- | --- |
| items.N.productId | Ese producto no existe. | El `productId` no está en products. |
| items.N.productId | Ese producto está desactivado en la carta. | El producto existe con is_active false. |
| items.N.portion | El pollo lleva presentación (eighth, quarter, half o whole). | Producto 'chicken' CON presentaciones y sin `portion`. |
| items.N.portion | Este producto no lleva presentación ni parte. | `portion`/`cut`/octavos presentes y el producto no es 'chicken' con presentaciones (incluye 'chicken' sin presentaciones). |
| items.N.portion | Esa presentación no está en la carta de este producto. | 'chicken' con presentaciones y `portion` no ofertada. |
| items.N.breastEighths | La distribución de partes solo se indica en el medio pollo. | `breastEighths`/`legEighths` con `portion` distinta de 'half' (o sin portion). |
| items.N.breastEighths | La distribución del medio debe sumar 4 octavos entre pecho y pierna. | En 'half': vino solo uno de los dos, o no suman 4. |
| items.N.components | Solo los combos llevan componentes. | `components` presente en un producto que no es 'combo'. |
| items.N.components | Los componentes no coinciden con el combo de la carta. | La lista no refleja la configurada (faltan, sobran, otra porción/cantidad, o cambio en un componente que no es pollo). |
| items.N.sauces | Las cremas solo van con platos, pollo o combos. | `sauces` presente en un ítem de categoría distinta de chicken/dish/combo. |
| items.N.sauces | Un ítem admite hasta 6 cremas. / Hay cremas repetidas en el ítem. | Lista de cremas >6 o con productId repetido. |
| items.N.sauces.M.productId | Esa crema no existe. / Ese producto no es una crema. / Esa crema está desactivada en la carta. | La crema no existe, no es 'sauce' o está inactiva. |

- De forma (Zod, antes de cualquier consulta): `items` 1-20 ('Indica al menos un ítem.' / 'Un envío admite hasta 20 ítems.'), `productId` entero 1..2147483647 ('El identificador del producto no es válido.'), `quantity` 1-99 ('Indica cuántas unidades lleva el ítem.'), `notes` ≤200 sin controles ('La observación admite hasta 200 caracteres en una sola línea.'), enumerados fuera de lista, correspondencia `portion`/`cut` (PORTION_CUT_MESSAGE), `cut` sin `portion` ('Sin presentación no se puede indicar la parte.'), `components.M.*`/`sauces.M.*` con la misma forma que sus padres.

**D-010-19. Migración y limpieza de pruebas.**
- Una migración nueva `20261011120000-create-order-items.ts` (umzug): `up` crea `kitchen_tickets` primero (referencia orders), luego `order_items` (referencia kitchen_tickets y orders), `order_item_components`, `order_item_sauces` e `idempotency_keys`, con sus CHECK, la unicidad de `(scope, key)` y los índices; `down` las borra en el orden inverso (revertir pierde sus datos; solo para desarrollo, como el resto).
- Limpieza de pruebas (sección 12): `resetMigrationTables` borra las cinco tablas antes que `orders` y `users` (las FK lo exigen); `clearOrderTables` se amplía a un solo TRUNCATE con order_item_sauces, order_item_components, order_items, idempotency_keys, kitchen_tickets, orders y tables, cada una detrás de su `tableExists`. Las cinco quedan autorizadas para limpieza de pruebas igual que orders y tables (solo polleria_test, con la doble verificación). Las listas MIGRATIONS de los tests de migraciones reciben el nombre nuevo al final.
- `products` y `combo_items`/`product_portions` no se tocan: los ítems COPIAN sus datos, no los referencian con unicidad ni cascada.

**D-010-20. Sin Socket.IO, sin seeds, sin variables de entorno, sin dependencias, sin ADR (SUPUESTO S-010-18).**
- Igual que la 009: la web consulta por polling en la 011; ninguna dependencia nueva ni variable de entorno; el modelado es decisión de dominio documentada aquí, no un ADR.
- Cambio señalado a la 007 (recomendación del reviewer de esa spec): `comboChickenConsumption` se estrecha a firma de `Iterable` puro (quita la unión con ítem suelto de ADV-007-06) ahora que tiene llamadores reales — los ítems y componentes que le pasa el servicio ya vienen validados de la base; los tests de la 007 que la ejercitaban con el ítem suelto se actualizan en esta funcionalidad (sección 12).

## 4. Criterios de aceptación (AC)

Todos ejecutables con `pnpm test` en esta rama (packages/shared y apps/api contra su base aislada polleria_test). Casos felices y errores con el formato común `{ error: { code, message, details } }`, cuerpos exactos. Los datos de carta se siembran por servicio/SQL en la misma base de pruebas.

### 4.1 Esquemas y tipos compartidos (packages/shared/src/order-items.ts + orders.ts y errors.ts)

**AC-01 (esquemas de petición).** Dados los esquemas estrictos nuevos, cuando se valida, entonces:

- `orderItemInputSchema`: `{ productId: 5 }` válido (quantity por defecto 1; el resto opcional); `{ productId: 5, quantity: 2, notes: 'sin ensalada' }` válido; `{ productId: 0 }`, `{ productId: 'x' }`, `{ productId: 5, quantity: 0 }`, `{ productId: 5, quantity: 100 }` fallan con issue en la clave ('El identificador del producto no es válido.', 'Indica cuántas unidades lleva el ítem.'); una clave de más falla.
- `portion`/`cut`: `{ productId: 5, portion: 'quarter', cut: 'leg' }` válido; `portion: 'cuarto'` u otro fuera de PORTIONS falla; `portion: 'quarter'` sin `cut` falla con PORTION_CUT_MESSAGE; `portion: 'half'` con `cut` falla igual; `cut: 'leg'` sin `portion` falla ('Sin presentación no se puede indicar la parte.').
- `notes`: 200 caracteres válidos; 201 fallan ('La observación admite hasta 200 caracteres en una sola línea.'); `'línea1\nlínea2'` o `'\t'` fallan igual; `'  sin ensalada  '` válido devolviendo 'sin ensalada' (NFC + trim); `''`/`'   '` se aceptan como "sin observación" (normalizan a null).
- `breastEighths`/`legEighths`: `{ portion: 'half', breastEighths: 1, legEighths: 3 }` válido por forma (el par completo, la porción y la suma se verifican por ítem en el servicio — tabla de D-010-18); negativos, > 8 o no enteros fallan por forma.
- `sauces`: `[{ productId: 9, quantity: 2 }]` válido; más de 6 falla ('Un ítem admite hasta 6 cremas.'); `{ productId: 0 }` o `quantity: 0` dentro falla por forma.
- `components`: `[{ productId: 7, quantity: 1, portion: 'quarter', cut: 'leg' }]` válido; más de 10 falla; `cut` sin `portion` dentro de un componente falla igual que arriba.
- `sendOrderItemsRequestSchema`: `{ items: [<uno>] }` válido; `{ items: [] }` falla ('Indica al menos un ítem.'); 21 ítems fallan ('Un envío admite hasta 20 ítems.'); `{ items: [...], extra: 1 }` falla.
- `voidOrderItemRequestSchema` (que también usa la solicitud request-void): `{ reason: 'Se equivocó el cliente' }` válido; `{}`, `{ reason: '' }`, `{ reason: '  ' }`, `{ reason: <201 caracteres> }` fallan ('Escribe el motivo de la anulación (hasta 200 caracteres).'). Reject-void no lleva cuerpo.
- `idempotencyKeySchema` (la cabecera): 'abc-123' válido; `''`, 129 caracteres o una clave con espacios/no-ASCII falla ('El envío necesita la cabecera Idempotency-Key.').

**AC-02 (enums, esquemas de respuesta y códigos).** Dado el dominio compartido, cuando se verifica, entonces:

- `ORDER_ITEM_STATUSES` es exactamente `['sent', 'void_requested', 'voided']` y `KITCHEN_TICKET_KINDS` es exactamente `['initial', 'additional', 'void']`; constantes `ORDER_ITEM_QUANTITY_MAX` 99, `ORDER_ITEMS_PER_SEND_MAX` 20, `ORDER_ACTIVE_ITEMS_MAX` 99, `ORDER_ITEM_SAUCES_MAX` 6, `ORDER_ITEM_NOTES_MAX` 200, `IDEMPOTENCY_KEY_MAX` 128.
- `orderItemSchema` (estricto): `{ id, productId, productName, productCategory, quantity, priceCents, portion, cut, breastEighths, legEighths, notes, sauces: [{productId, productName, quantity, priceCents}], components: [{productId, productName, quantity, portion, cut, breastEighths, legEighths}], status, kitchenTicketId, voidTicketId, voidedBy: userRef|null, voidedAt, voidReason, voidRequestedBy: userRef|null, voidRequestedAt, voidRequestReason, orderedAtTable: tableRef|null, createdBy: userRef, createdAt }` con `portion`/`cut`/`notes`/`voidTicketId`/`voidedAt`/`voidReason`/`voidRequestedAt`/`voidRequestReason`/`orderedAtTable` en null permitido. Una clave de más o `status: 'anulado'` fallan. Las respuestas de request-void y reject-void son `{ order }` (orderSchema, sin esquema propio).
- `kitchenTicketSchema` (estricto): `{ id, orderId, kind, items: orderItemSchema[], createdBy: userRef, createdAt }`; `kitchenTicketsResponseSchema` = `{ tickets: [...] }`; `sendOrderItemsResponseSchema` = `{ order, ticket }`.
- `orderSchema` actualizado: las 13 claves de D-010-14 — los tests de la 009 que verificaban la forma anterior fallan hasta actualizarlos (sección 12).
- `menuProductSchema` (estricto): `{ id, name, category, priceCents, portions: [{portion, cut, priceCents}], items: [{product, quantity, portion, cut}] }` con `product` = productSchema; `menuResponseSchema` = `{ products: [...] }`.
- `ERROR_CODES` suma `'ORDER_ITEM_NOT_FOUND'`, `'ORDER_ITEM_ALREADY_VOIDED'`, `'ORDER_ITEM_VOID_REQUESTED'`, `'ORDER_ITEM_NOT_REQUESTED'`, `'ORDER_HAS_ACTIVE_ITEMS'`, `'ORDER_ITEMS_LIMIT'` e `'IDEMPOTENCY_CONFLICT'`; `errorResponseSchema` acepta sus cuerpos.

### 4.2 Tablas y migración (apps/api contra la base de pruebas)

**AC-03 (`kitchen_tickets` y `order_items` existen con sus restricciones).** Dada la base con las migraciones al día, cuando se inspecciona e inserta, entonces:

- `kitchen_tickets`: `id` PK entero; `order_id` NOT NULL FK a `orders.id`; `kind` varchar(12) NOT NULL con CHECK `kitchen_tickets_kind_allowed` IN ('initial','additional','void'); `created_by_user_id` NOT NULL FK a `users.id`; `created_at`/`updated_at` timestamptz NOT NULL. Índice `kitchen_tickets_order_id`. Un `kind` fuera de lista o `order_id` inexistente falla.
- `order_items`: `id` PK; `order_id` NOT NULL FK → orders; `product_id` NOT NULL FK → products; `product_name` varchar(60) NOT NULL; `product_category` varchar(16) NOT NULL; `quantity` NOT NULL con CHECK 1-99; `price_cents` NOT NULL con CHECK 0-999999; `portion`/`cut` varchar(8) NULL con CHECK `order_items_portion_cut` (misma correspondencia que combo_items: portion NULL ⇔ cut NULL; eighth/quarter exigen cut; half/whole lo rechazan); `breast_eighths`/`leg_eighths` NOT NULL DEFAULT 0 con CHECK ≥ 0; `notes` varchar(200) NULL; `status` varchar(16) NOT NULL DEFAULT 'sent' con CHECK IN ('sent','void_requested','voided'); `kitchen_ticket_id` NOT NULL FK → kitchen_tickets; `void_ticket_id` NULL FK → kitchen_tickets; `void_requested_at` timestamptz NULL; `void_requested_by_user_id` NULL FK → users; `void_request_reason` varchar(200) NULL; `voided_at` timestamptz NULL; `voided_by_user_id` NULL FK → users; `void_reason` varchar(200) NULL; `ordered_at_table_id` NULL FK → tables; `created_by_user_id` NOT NULL FK → users; `created_at`/`updated_at`.
- CHECK `order_items_void_consistent`: `status 'sent'` con cualquiera de los 7 campos de anulación (`void_requested_at`/`void_requested_by_user_id`/`void_request_reason`/`voided_at`/`voided_by_user_id`/`void_reason`/`void_ticket_id`) puesto falla; `'void_requested'` exige los 3 de solicitud puestos y los 4 de anulación en NULL; `'voided'` exige los 4 de anulación puestos (el triple de solicitud libre: puesto si vino por solicitud, NULL si fue directo).
- Índices: `order_items_order_id`, `order_items_product_id`, `order_items_kitchen_ticket_id`, `order_items_ordered_at_table_id`. FK a producto/pedido/comanda/mesa inexistente falla; `ordered_at_table_id` NULL pasa (preparado para para llevar).

**AC-04 (`order_item_components`, `order_item_sauces` e `idempotency_keys`).** Cuando se inspecciona e inserta, entonces:

- `order_item_components`: `id` PK; `order_item_id` NOT NULL FK → order_items; `product_id` NOT NULL FK → products; `product_name` varchar(60) NOT NULL; `quantity` NOT NULL CHECK 1-99; `portion`/`cut` NULL con el mismo CHECK de correspondencia; `breast_eighths`/`leg_eighths` NOT NULL DEFAULT 0 ≥ 0; `created_at`/`updated_at`. Índice `order_item_components_order_item_id`.
- `order_item_sauces`: `id` PK; `order_item_id` NOT NULL FK → order_items; `product_id` NOT NULL FK → products; `product_name` varchar(60) NOT NULL; `quantity` NOT NULL CHECK 1-99; `price_cents` NOT NULL CHECK 0-999999; `created_at`/`updated_at`. Índice `order_item_sauces_order_item_id`.
- `idempotency_keys`: `id` PK; `scope` varchar(32) NOT NULL; `key` varchar(128) NOT NULL; `order_id` NOT NULL FK → orders; `request_hash` varchar(64) NOT NULL; `response_status` smallint NOT NULL; `response_body` JSONB NOT NULL; `created_at` timestamptz NOT NULL. Única `(scope, key)` (`idempotency_keys_scope_key_unique`): repetir el par falla; la misma clave en otro scope pasa.

**AC-05 (migración aplicable y revertible).** Dado el archivo `20261011120000-create-order-items.ts` al final de MIGRATIONS (posición 7, tras tables/orders), cuando:

- `migrateUp` lo ejecuta, entonces crea las cinco tablas con todas las restricciones de AC-03 y AC-04 (kitchen_tickets antes que order_items, por la FK).
- `migrateDown` lo revierte, entonces las cinco dejan de existir y un `migrateUp` posterior las recrea sin errores — el down encadenado de `users-migrations` gana este paso nuevo antes de revertir tables/orders.

### 4.3 Servicios (apps/api contra la base de pruebas)

Carta semilla de referencia para los AC siguientes: 'Pollo a la brasa' (chicken, con porciones quarter-breast S/ 15.00, quarter-leg S/ 14.00, half S/ 26.00 y whole S/ 48.00 — sin eighth), 'Anticucho de pollo' (chicken SIN porciones, S/ 12.00), 'Inca Kola 1L' (drink, S/ 8.00), 'Ají' (sauce, S/ 0.00), 'Ocopa' (sauce, S/ 3.00), 'Mostrito' (combo, S/ 22.00, con 1 componente 'Pollo a la brasa' quarter-leg ×1 y 1 componente 'Inca Kola 1L' ×1). Pedido P abierto por el mozo Juan sobre Mesa 3.

**AC-06 (sendItems: caminos felices y la copia al ítem).** Cuando `sendItems(P.id, body, 'k-1', juan)` con claves nuevas, entonces:

- `{ items: [{ productId: incaKola, quantity: 2 }] }` → 201: un ítem con `quantity: 2`, `price_cents` copiado 800, `product_name`/`product_category` copiados, `portion`/`cut`/`notes` NULL, octavos 0, `status 'sent'`, `kitchen_ticket_id` de la comanda 'initial' creada, `ordered_at_table_id` = Mesa 3, `created_by_user_id` = Juan; la respuesta es `{ order, ticket }` con `order.totalCents` 1600.
- `{ items: [{ productId: pollo, portion: 'quarter', cut: 'leg' }] }` → ítem con `price_cents` = el de LA FILA (1400, no el del producto), `leg_eighths` 2, `breast_eighths` 0.
- `{ items: [{ productId: pollo, portion: 'half', breastEighths: 1, legEighths: 3 }] }` → ítem 2600 con octavos 1+3; sin la distribución → 2+2 por defecto; `portion: 'whole'` → 4+4 siempre.
- `{ items: [{ productId: anticucho }] }` (chicken sin porciones) → ítem simple con `price_cents` del producto (1200) y octavos 0.
- `{ items: [{ productId: pollo, portion: 'quarter', cut: 'breast', quantity: 2, notes: 'sin ensalada', sauces: [{ productId: aji }, { productId: ocopa, quantity: 2 }] }] }` → ítem con notes, breast_eighths 4 (2×2), dos filas en order_item_sauces con precios copiados 0 y 300; `order.totalCents` = 2×1500 + 0 + 2×300.
- `{ items: [{ productId: mostrito }] }` → ítem con `price_cents` del combo y una copia en order_item_components por componente configurado (producto, nombre, cantidad, porción, parte, octavos); los octavos del ítem son la suma de los componentes. `{ items: [{ productId: mostrito, components: [...] }] }` que refleja la carta con `cut: 'breast'` en el componente de pollo → la copia guarda 'breast' y los octavos correspondientes.
- Cambiar la carta DESPUÉS del envío (precio del cuarto a S/ 20.00, desactivar la Inca Kola, rearmar el combo) no altera los ítems ya registrados: su precio, nombre y componentes copiados se conservan (regla 4).

**AC-07 (sendItems: issues por ítem acumulados y guardias).** Cuando:

- `{ items: [{ productId: 999999 }, { productId: inactivo }] }` → un solo 400 VALIDATION_ERROR con dos issues: `items.0.productId` 'Ese producto no existe.' e `items.1.productId` 'Ese producto está desactivado en la carta.' — y nada se escribe (ni ítems ni comanda ni clave de idempotencia).
- Chicken con porciones sin `portion` → issue `items.N.portion` 'El pollo lleva presentación…'; con `portion: 'eighth'` no ofertada → 'Esa presentación no está en la carta de este producto.'; drink con `portion` → 'Este producto no lleva presentación ni parte.'; `breastEighths` en un cuarto → 'La distribución de partes solo se indica en el medio pollo.'; medio con distribución sumando 3 → 'La distribución del medio debe sumar 4 octavos entre pecho y pierna.'
- `components` en un producto que no es combo → 'Solo los combos llevan componentes.'; en el combo con una lista que no refleja la configurada (falta un componente, otra porción, otra cantidad, otra parte en componente no pollo, producto distinto) → 'Los componentes no coinciden con el combo de la carta.'
- `sauces` en un drink → 'Las cremas solo van con platos, pollo o combos.'; crema inexistente → `items.N.sauces.M.productId` 'Esa crema no existe.'; un producto que no es 'sauce' como crema → 'Ese producto no es una crema.'; crema inactiva → 'Esa crema está desactivada en la carta.'; crema repetida → 'Hay cremas repetidas en el ítem.'
- Envío sobre pedido closed/cancelled/merged → 409 ORDER_NOT_OPEN; sobre `orderId` inexistente → 404 ORDER_NOT_FOUND.
- Pedido con 98 ítems no anulados ('sent' o 'void_requested') + envío de 2 → 409 ORDER_ITEMS_LIMIT; los 'voided' no cuentan para el tope.
- Tanda con 3 ítems malos y uno bueno → los 3 issues acumulados y el bueno tampoco se escribe (todo o nada).

**AC-08 (idempotencia del envío).** Cuando:

- El mismo `sendItems` con la misma clave 'k-9' y el mismo cuerpo se llama dos veces → la segunda devuelve la MISMA respuesta (mismo `ticket.id`, mismos `id` de ítems) sin crear filas nuevas: order_items, kitchen_tickets e idempotency_keys no crecen en el reintento.
- La misma clave con un cuerpo distinto sobre el mismo pedido → 409 IDEMPOTENCY_CONFLICT; la misma clave sobre OTRO pedido → 409 IDEMPOTENCY_CONFLICT aunque el cuerpo sea idéntico.
- Reintentar con la misma clave DESPUÉS de mover el pedido o cuando ya no está open → sigue devolviendo la respuesta guardada (la idempotencia va antes que las guardias).
- Dos envíos con claves distintas crean dos comandas: la primera 'initial', la segunda 'additional' (RF-06).

**AC-09 (sendItems limpia la pre-cuenta, no el listo).** Dado P con `bill_requested_at` puesto (o también `ready_at`), cuando entra un envío válido, entonces `bill_requested_at`/`bill_requested_by_user_id` quedan NULL en el `order` devuelto y `ready_at`/`ready_by_user_id` se conservan.

**AC-10 (ciclo de anulación: solicitud, aprobación, anulación directa y rechazo).** Dado P con el ítem I 'sent' enviado por el mozo Juan, cuando:

- `requestVoid(P.id, I.id, { reason: 'Se equivocó el cliente' }, 'k-r1', juan)` → 200 `{ order }` con I en `status 'void_requested'`, `voidRequestedBy` = Juan, `voidRequestedAt` y `voidRequestReason` puestos; NO se crea comanda ni fila 'void'; I sigue contando en `totalCents` y `bill_requested_at` queda intacta.
- Repetir la solicitud con la misma clave 'k-r1' → la misma respuesta guardada; con otra clave → 409 ORDER_ITEM_VOID_REQUESTED; sobre un ítem 'voided' → 409 ORDER_ITEM_ALREADY_VOIDED.
- `voidItem(P.id, I.id, { reason: 'Confirmado, error del cliente' }, 'k-v1', admin)` sobre 'void_requested' (aprobación) → 200 `{ order, ticket }`: I queda 'voided' con `voidedBy` = admin, `voidedAt`, `voidReason` (el motivo final del admin), `voidTicketId` de la comanda 'void' creada — que lista a I como su único ítem — y el triple `void_requested_*` conservado (auditoría de ambos actores); `totalCents` ya no lo cuenta y `bill_requested_at` se limpia si estaba puesta.
- `voidItem` sobre 'sent' (directo, sin solicitud) → mismo resultado con `void_requested_*` en NULL; sobre 'voided' con otra clave → 409 ORDER_ITEM_ALREADY_VOIDED; replay con la misma clave → respuesta guardada.
- `rejectVoid(P.id, I.id, 'k-x1', admin)` sobre 'void_requested' → 200 `{ order }`: I vuelve a 'sent' y el triple de solicitud queda en NULL (sin comanda); replay con la misma clave → respuesta guardada; sobre 'sent' → 409 ORDER_ITEM_NOT_REQUESTED; sobre 'voided' → 409 ORDER_ITEM_ALREADY_VOIDED; tras el rechazo el mozo puede volver a solicitar (triple nuevo).
- `itemId` que no pertenece a P (de otro pedido o inexistente) → 404 ORDER_ITEM_NOT_FOUND en las tres rutas; pedido no abierto → 409 ORDER_NOT_OPEN.
- El ítem anulado sigue en `order.items` con su estado (nunca se borra); anular el último ítem 'sent' deja `totalCents` 0.

**AC-11 (listOrderTickets y el pedido con ítems).** Cuando `listOrderTickets(P.id)` tras un envío inicial, una adición y una anulación, entonces devuelve `{ tickets: [...] }` ordenadas por id: la 'initial' y la 'additional' con sus ítems (cada uno con sauces y components), la 'void' con el ítem anulado; `orderId` inexistente → 404 ORDER_NOT_FOUND. Y `getOrder(P.id)` devuelve `items` completo (sent + voided, por id) y `totalCents` correcto; un pedido sin ítems devuelve `items: []`, `totalCents: 0`.

**AC-12 (cancelOrder con ítems — RN-009-08 activa).** Cuando:

- `cancelOrder(P.id, ...)` con al menos un ítem 'sent' O 'void_requested' → 409 ORDER_HAS_ACTIVE_ITEMS para mozo Y para admin; nada cambia (una solicitud pendiente también bloquea: primero se aprueba o se rechaza).
- Con TODOS los ítems 'voided' (o con 'sent' recién anulados y solicitudes rechazadas): mozo → 403 FORBIDDEN; admin con motivo → 200 `cancelled` con mesas libres; los ítems y comandas quedan como historial del pedido cancelado.
- Pedido que nunca tuvo ítems → mozo o admin cancelan igual que en la 009 (sin regresión).

**AC-13 (joinTable mueve ítems y comandas).** Dados Mesa 3 con pedido P (ítems enviados, una comanda) y Mesa 4 con pedido Q (con sus ítems), cuando `joinTable(mesa4.id, { intoTableId: mesa3.id })`, entonces el pedido P devuelto contiene los ítems de AMBOS pedidos (los de Q conservan `orderedAtTable` = Mesa 4), `totalCents` = la suma de ambos, las comandas de Q aparecen en `listOrderTickets(P.id)`; GET del pedido Q muestra `status 'merged'`, `items: []`, `totalCents: 0`. Separar después una de las mesas no arrastra ítems (siguen en P con su mesa de origen).

**AC-14 (listMenu: la carta armada).** Cuando `listMenu()` con la carta semilla (más un producto inactivo), entonces devuelve `{ products }` solo con los ACTIVOS, ordenados por categoría/nombre/id; el pollo trae `portions` solo con las filas ofertadas, en el orden de la carta (quarter-breast, quarter-leg, half, whole) y `items: []`; el combo trae `items` con el producto componente embebido (incluido `isActive`) y `portions: []`; un chicken sin porciones trae ambas listas vacías.

### 4.4 API por HTTP (apps/api contra la base de pruebas, con sesiones reales)

**AC-15 (POST /api/orders/{orderId}/items).** Cuando:

- POST como mozo (y como admin) con `Idempotency-Key: k-1` y el cuerpo válido → `201 { order, ticket }` con `Cache-Control: no-store`; `order.items` y `totalCents` ya vienen; `createdBy`/`orderedAtTable` son los de la sesión y la mesa.
- Cocina o caja → `403 FORBIDDEN`; sin cookie → `401 UNAUTHENTICATED`; sin la cabecera o con una mal formada → `400` con issue en `idempotencyKey`; `orderId` 'abc' → `400` con issue en `orderId`; pedido inexistente → `404 ORDER_NOT_FOUND`; pedido cerrado → `409 ORDER_NOT_OPEN`.
- Repetir la llamada idéntica (misma clave y cuerpo) → `201` con la misma respuesta y sin filas nuevas; misma clave con cuerpo distinto → `409 IDEMPOTENCY_CONFLICT`.
- Cuerpo con 2 ítems malos → `400` con los dos issues acumulados en `details.issues`; el ítem bueno no se escribe.

**AC-16 (request-void, void y reject-void por HTTP).** Cuando:

- `POST /api/orders/{orderId}/items/{itemId}/request-void` como mozo (y admin) con clave y `{ reason }` → `200 { order }` con el ítem `void_requested`; cocina/caja → `403`; sin cookie → `401`; sin `reason` → `400` con issue en `reason`; sin cabecera → `400` con issue en `idempotencyKey`; ítem ya `void_requested` (otra clave) → `409 ORDER_ITEM_VOID_REQUESTED`; ya `voided` → `409 ORDER_ITEM_ALREADY_VOIDED`.
- `POST .../void` como admin con clave y `{ reason }` → `200 { order, ticket }` con el ítem `voided` (aprueba sobre `void_requested`, anula directo sobre `sent`); mozo/cocina/caja → `403`; sin `reason` o sin cabecera → `400` con el issue correspondiente; ya `voided` (otra clave) → `409 ORDER_ITEM_ALREADY_VOIDED`.
- `POST .../reject-void` como admin con clave y sin cuerpo → `200 { order }` con el ítem de vuelta a `sent`; mozo/cocina/caja → `403`; sobre 'sent' → `409 ORDER_ITEM_NOT_REQUESTED`; sin cabecera → `400` con issue en `idempotencyKey`.
- En las tres: `itemId` de otro pedido o inexistente → `404 ORDER_ITEM_NOT_FOUND`; pedido cerrado → `409 ORDER_NOT_OPEN`; `itemId` 'abc' → `400` con issue en `itemId` ('El identificador del ítem no es válido.'); `Cache-Control: no-store`.

**AC-17 (GET /api/menu y GET /api/orders/{orderId}/tickets).** Cuando:

- GET /api/menu con sesión de mozo (y cocina, caja, admin) → `200 { products }` con la forma y el orden de AC-14 y `Cache-Control: no-store`; sin cookie → `401`.
- GET /api/orders/{orderId}/tickets con cualquier sesión → `200 { tickets }` ordenadas por id (incluye las 'void'); pedido inexistente → `404`; `orderId` inválido → `400` con issue en `orderId`; un pedido sin envíos → `{ tickets: [] }`.

**AC-18 (cancel y join con ítems por HTTP).** Cuando:

- POST /api/orders/{id}/cancel con ítems 'sent' o solicitudes 'void_requested' pendientes → `409 ORDER_HAS_ACTIVE_ITEMS` (mozo y admin); con todos anulados: mozo → `403`, admin → `200 cancelled`; nunca tuvo ítems → como la 009.
- POST /api/tables/{id}/join uniendo dos mesas ocupadas con ítems → `200` y GET del pedido destino muestra los ítems de ambos con su `orderedAtTable` de origen; GET /api/tables muestra el `totalCents` combinado en el `order` embebido de cada mesa.

**AC-19 (métodos no declarados y lector del cuerpo).** Cuando se llama PUT a `/api/orders/{id}/items`, GET a `/api/orders/{id}/items/5/void` o DELETE a `/api/orders/{id}/tickets` → 404 con `no-store`. En las rutas con cuerpo nuevas (items, request-void y void): JSON inválido → `400 INVALID_JSON`; JSON que no es objeto → `400 INVALID_BODY`; `Content-Type` incorrecto con cuerpo → `415`; cuerpo > 100 kb → `413`; todos con `no-store`.

### 4.5 Cobertura de RF y RNF

| Requisito | AC que lo cubren |
| --- | --- |
| RF-04 (registrar pedido con producto, presentación y parte) | AC-01, AC-06, AC-07, AC-15 |
| RF-05 (cremas, bebidas y observaciones por ítem) | AC-01, AC-06, AC-07, AC-15 |
| RF-06 (agregar ítems a pedido abierto; comanda nueva por adición) | AC-08, AC-09, AC-11, AC-15, AC-17 |
| RF-07 (anular ítem enviado: el mozo solicita, el admin resuelve — motivo y horas de ambos) | AC-10, AC-12, AC-16, AC-18 |
| Regla 4 (precio copiado al ítem) | AC-06 |
| Regla 5 (envío idempotente con Idempotency-Key) | AC-08, AC-10, AC-15, AC-16 |
| Regla 6 (anulación con autorización y auditoría de ambos actores) | AC-10, AC-16 |
| RN-009-08 / RF-03 con ítems (cancelar, unir) | AC-12, AC-13, AC-18 |
| RN-006-08 + RN-007-11 (copia de porción/parte/octavos/componentes) | AC-03, AC-06, AC-14 |
| RF-08/RF-09 siembra (comanda como registro con detalle) | AC-11, AC-17 |
| RF-13 siembra (total para la pre-cuenta) | AC-11, AC-18 |
| RNF-09 (cada operación con su rol) | AC-15 a AC-19 |

## 5. Requisitos verificables

| ID | Requisito | Cómo se verifica |
| --- | --- | --- |
| R-010-01 | Las rutas nuevas exigen sesión y los roles de D-010-16; `Idempotency-Key` en los cuatro POST | reviewer lee el router y los controllers |
| R-010-02 | openapi.yaml (versión propuesta 0.9.0) sigue siendo OpenAPI 3.1 válido y coincide con lo implementado | `pnpm dlx @redocly/cli lint docs/api/openapi.yaml`; contraste de AC-15 a AC-19 |
| R-010-03 | Ninguna variable de entorno nueva | `git diff` vacío en apps/api/.env.example y CONFIG_VARIABLES |
| R-010-04 | Una sola migración nueva, al final de MIGRATIONS | ls de la carpeta de migraciones; AC-05 |
| R-010-05 | apps/web no cambia | `git diff` vacío en apps/web; sin fetch/axios nuevo |
| R-010-06 | Cobertura ≥ 90 % en shared y en los services nuevos; order.service no baja de lo que tenía (90 % líneas / 81 % ramas — refuerzo en las guardias nuevas) | `pnpm test:coverage` |
| R-010-07 | Idempotencia real: un reenvío no duplica ítems, comandas ni claves (regla 5) | AC-08 y AC-15 contando filas antes/después |
| R-010-08 | Dinero en céntimos enteros en toda la cadena (entrada, columna, respuesta, totalCents) | AC-01, AC-03, AC-06 |
| R-010-09 | Definición de terminado de CLAUDE.md | orquestador en el cierre |

## 6. Reglas de dominio y de negocio

- Reglas de dominio que aplican: 1 (octavos enteros: el ítem guarda el total resuelto por línea), 2 (dinero en céntimos: price_cents de ítems y cremas, totalCents derivado), 4 (precio y composición copiados al registrar — verificado), 5 (Idempotency-Key en el envío y en el ciclo de anulación; el reenvío no duplica ítems ni comandas — verificado), 6 (anular exige administrador y queda auditado con motivo, usuario y hora — ahora con dos actores: quién solicitó y quién aprobó — verificado) y 8 (timestamptz en todas las horas; America/Lima solo en la presentación). La regla 3 (descuento de stock con bloqueo) no aplica todavía: la Fase 5 descontará los octavos ya copiados. La regla 7 (PrinterService) espera a la Fase 3: la comanda es solo un registro.
- **RN-010-01.** El precio del ítem se copia al enviar: la fila de product_portions para el pollo con presentaciones; `products.price_cents` para todo lo demás, incluido el combo. Cambios posteriores de la carta no tocan ítems registrados.
- **RN-010-02.** Los octavos del ítem son el total de la línea (quantity × consumo unitario resuelto): la parte elegida para eighth/quarter, 4+4 para whole, 2+2 por defecto o la distribución declarada (sumando 4) para half; en combos, la suma de los octavos de sus componentes copiados.
- **RN-010-03.** El ítem de un combo copia sus componentes vigentes (producto, nombre, cantidad, porción, parte, octavos por línea) en order_item_components; la lista `components` de la entrada solo puede resolver la parte/distribución del pollo — el resto debe coincidir con la carta.
- **RN-010-04.** Cada envío crea exactamente una comanda con sus ítems ('initial' la primera de ítems, 'additional' las siguientes); cada anulación APROBADA crea una comanda 'void'. Nunca hay comanda sin ítems ni ítems sin comanda. La solicitud de anulación no emite comanda (D-010-10).
- **RN-010-05.** `Idempotency-Key` (1-128 caracteres ASCII visibles) es obligatoria en las cuatro operaciones que escriben ítems: scopes 'order-items' (envío), 'order-item-void-requests' (solicitud), 'order-item-voids' (aprobación/anulación) y 'order-item-void-rejections' (rechazo). Misma `(scope, key)` + mismo pedido + mismo cuerpo validado = replay con la respuesta guardada; cualquier otra reutilización = 409. El chequeo va antes que las guardias de estado.
- **RN-010-06.** Anular es un ciclo de dos actores: el mozo solicita con `reason` (1-200) y el ítem pasa a 'void_requested' con `void_requested_at`/`void_requested_by_user_id`/`void_request_reason`; el admin lo resuelve — aprueba con su motivo final ('voided' con `voided_at`/`voided_by_user_id`/`void_reason` + comanda 'void', conservando el triple de la solicitud) o rechaza (vuelve a 'sent' limpiando el triple). El admin también anula directo sobre 'sent'. El ítem nunca se borra y sigue en `order.items`.
- **RN-010-07.** Cancelar (RN-009-08 efectiva): con algún ítem 'sent' o 'void_requested' → 409 para cualquier rol (una solicitud pendiente también bloquea); si el pedido alguna vez tuvo ítems → solo admin; nunca tuvo ítems → waiter/admin como la 009.
- **RN-010-08.** Unir mueve `order_id` de ítems (en cualquier estado) y `kitchen_tickets` del pedido absorbido al destino en la misma transacción; `ordered_at_table_id` de cada ítem se conserva intacto.
- **RN-010-09.** Enviar ítems o anular (aprobar/directo) limpia `bill_requested_at`/`bill_requested_by_user_id` (la pre-cuenta cambia); `ready_at` se conserva. Solicitar o rechazar NO la toca: la cuenta aún no cambió.
- **RN-010-10.** `totalCents` = Σ (quantity × price_cents) de ítems 'sent' y 'void_requested' + Σ (quantity × price_cents) de sus cremas (el ítem con solicitud pendiente sigue siendo cobrable hasta que el admin apruebe); los 'voided' no cuentan. `order.items` incluye TODOS los ítems ordenados por id.
- **RN-010-11.** Solo se envían productos activos; el pollo exige `portion` ofertada (y `cut` según corresponda); las cremas deben ser productos 'sauce' activos; `components` solo en combos.
- **RN-010-12.** Topes: 20 ítems por envío, 99 ítems no anulados ('sent' + 'void_requested') por pedido, cantidad 1-99 por ítem y por crema, 6 cremas por ítem sin repetir, observación ≤ 200 en una sola línea.
- **RN-010-13.** Las cremas solo van con comida (categorías chicken, dish, combo); una crema puede ser además un ítem suelto del pedido.
- **RN-010-14.** Roles: lectura (menú y comandas) para cualquier rol con sesión; enviar ítems y solicitar anulación para waiter/admin; aprobar/anular y rechazar solo admin.
- **RN-010-15.** Ítems, componentes, cremas, comandas y claves de idempotencia nunca se borran por la API (regla del historial); solo `ordered_at_table_id` puede quedar NULL y la baja de una mesa/producto/usuario no toca filas históricas (FK sin ON DELETE).

## 7. Casos borde

- **Doble toque o reintento de red del envío** → la misma clave devuelve la respuesta guardada; nunca dos comandas ni dos veces el mismo ítem (AC-08, AC-15). Si el cliente reintenta SIN clave o con otra → envío nuevo real: el cliente es responsable de generar y conservar la clave por intento (la pantalla de la 011 la genera una vez por envío).
- **Misma clave, otro contenido u otro pedido** → 409 IDEMPOTENCY_CONFLICT (protege al mozo que pega la clave equivocada).
- **La carta cambia entre que se armó el pedido y el envío** (producto desactivado, porción quitada, combo rearmado) → el envío falla con el issue por ítem correspondiente y no se escribe nada: la carta se valida al momento del envío, nunca contra el GET /api/menu viejo.
- **Producto desactivado DESPUÉS de registrarse** → el ítem sigue con su nombre y precio copiados; desactivar un producto o un componente de combo no toca ítems ya enviados (los nuevos envíos del producto fallan con el issue).
- **Combo con un componente desactivado en la carta** → se puede vender igual (el ítem copia la composición vigente tal cual; `isActive` del componente viaja en el menú para que la pantalla lo advierta). Pendiente del dueño, pregunta 14.
- **Anular un ítem cuando el pedido ya se movió/unió** → `orderId` de la ruta es el pedido VIVO donde quedó el ítem (tras un merge, los ítems están en el destino); anular sobre el pedido absorbido da 409 ORDER_NOT_OPEN y el ítem ya no está ahí (404 si se insiste en él con el id viejo del pedido).
- **Cancelar pedido con ítems** → 409 hasta anularlos todos; con solo anulados, solo admin (AC-12). Un pedido que nunca tuvo ítems no cambia.
- **Unir dos cuentas con ítems** → los ítems del absorbido aparecen en el destino con `orderedAtTable` apuntando a su mesa original; las comandas migran con ellos (AC-13).
- **Separar una mesa con ítems** → la mesa se suelta libre pero sus ítems quedan en el pedido con `orderedAtTable` intacto: la traza "pidió la mesa 4" sobrevive aunque la mesa quede libre — los ítems pertenecen a la cuenta, no a la mesa.
- **Enviar a un pedido con cuenta pedida** → la marca se limpia sola (la cuenta cambió); el `ready` se conserva (AC-09).
- **El mozo que envió un ítem queda desactivado** → el ítem y su comanda siguen; `createdBy` muestra su nombre igual.
- **Tandas límite** → 20 ítems exactos pasan, 21 → 400; 99 ítems 'sent' pasan, el envío que cruza → 409; un ítem con quantity 99 pasa.
- **`orderId`/`itemId` de ruta inválidos**: 'abc', '0', '1.5', '-3', '2147483648' → 400 con su issue; dígitos válidos inexistentes → 404.
- **Métodos y sub-rutas no declarados** → 404, nunca 405 (AC-19).
- **Datos inconsistentes solo alcanzables por SQL directo** (un ítem 'sent' en pedido closed, una comanda sin ítems): la API es la única vía prevista; las guardias operan sobre lo que hay — riesgo residual documentado como en la 006/007/009.
- **Ítem anulado dos veces por dos admins distintos**: el segundo recibe ORDER_ITEM_ALREADY_VOIDED; `voided_by` guarda al primero (el que realmente lo hizo).
- **Una solicitud de anulación que nadie resuelve**: queda 'void_requested' — sigue cobrándose, cocina sigue preparándolo (no hay comanda de aviso hasta la aprobación) y bloquea la cancelación del pedido (RN-010-07) hasta que el admin apruebe o rechace; el pendiente se ve en `order.items` en cualquier consulta del pedido o del tablero.
- **El mozo solicita anular el ítem equivocado**: el admin lo rechaza (vuelve a 'sent' con el triple limpio) y el mozo solicita el correcto — re-solicitar tras rechazo está permitido.
- **Solicitud pendiente en un pedido que se une**: el ítem 'void_requested' se mueve al destino con su solicitud intacta; el admin la resuelve sobre el pedido vivo (el absorbido ya no acepta operaciones: ORDER_NOT_OPEN).
- **El admin anula directo lo que el mozo iba a solicitar**: si el ítem ya está 'void_requested' el void del admin es la aprobación; si está 'sent' es anulación directa — ambas dejan el mismo resultado auditado.

## 8. Modelo de datos

### 8.1 Tabla `kitchen_tickets` (migración `20261011120000-create-order-items.ts`, creada primero)

| Columna | Tipo | Reglas |
| --- | --- | --- |
| id | INTEGER | PK, autoincremental (es el "número de comanda" de RF-08) |
| order_id | INTEGER NOT NULL | FK → orders.id |
| kind | VARCHAR(12) NOT NULL | CHECK `kitchen_tickets_kind_allowed`: IN ('initial','additional','void') |
| created_by_user_id | INTEGER NOT NULL | FK → users.id (quién envió la tanda o ejecutó la anulación) |
| created_at / updated_at | TIMESTAMPTZ NOT NULL | default now() |

- Índice `kitchen_tickets_order_id` (comandas del pedido para GET /tickets).
- La comanda no duplica datos del pedido (mesa, mozo se derivan); sus ítems se listan por `order_items.kitchen_ticket_id` o `void_ticket_id`. Sin `ON DELETE`.

### 8.2 Tabla `order_items` (misma migración, después de kitchen_tickets)

| Columna | Tipo | Reglas |
| --- | --- | --- |
| id | INTEGER | PK, autoincremental |
| order_id | INTEGER NOT NULL | FK → orders.id (repoint en merge) |
| product_id | INTEGER NOT NULL | FK → products.id (vínculo histórico, no fuente del precio) |
| product_name | VARCHAR(60) NOT NULL | copia del nombre al enviar |
| product_category | VARCHAR(16) NOT NULL | copia de la categoría al enviar |
| quantity | INTEGER NOT NULL | CHECK `order_items_quantity_range` 1-99 |
| price_cents | INTEGER NOT NULL | CHECK `order_items_price_cents_range` 0-999999; precio unitario copiado |
| portion / cut | VARCHAR(8) NULL | CHECK `order_items_portion_cut`: portion NULL ⇔ cut NULL; 'eighth'/'quarter' exigen cut; 'half'/'whole' lo rechazan; fuera de lista falla |
| breast_eighths / leg_eighths | INTEGER NOT NULL DEFAULT 0 | CHECK ≥ 0; TOTAL de la línea (regla 1) |
| notes | VARCHAR(200) NULL | observación de una línea |
| status | VARCHAR(16) NOT NULL DEFAULT 'sent' | CHECK `order_items_status_allowed`: IN ('sent','void_requested','voided') |
| kitchen_ticket_id | INTEGER NOT NULL | FK → kitchen_tickets.id (la comanda que lo creó) |
| void_ticket_id | INTEGER NULL | FK → kitchen_tickets.id (la comanda 'void' de su anulación) |
| void_requested_at | TIMESTAMPTZ NULL | hora de la solicitud de anulación |
| void_requested_by_user_id | INTEGER NULL | FK → users.id (quien pidió la anulación — normalmente el mozo) |
| void_request_reason | VARCHAR(200) NULL | motivo declarado en la solicitud |
| voided_at | TIMESTAMPTZ NULL | hora de la anulación ejecutada |
| voided_by_user_id | INTEGER NULL | FK → users.id (el admin que aprobó/anuló) |
| void_reason | VARCHAR(200) NULL | motivo final de la anulación (lo escribe el admin) |
| ordered_at_table_id | INTEGER NULL | FK → tables.id (mesa de origen; NULL solo para llevar) |
| created_by_user_id | INTEGER NOT NULL | FK → users.id (quién lo envió) |
| created_at / updated_at | TIMESTAMPTZ NOT NULL | default now() |

- CHECK `order_items_void_consistent`: `(status = 'sent' AND los 7 campos de anulación IS NULL) OR (status = 'void_requested' AND void_requested_at IS NOT NULL AND void_requested_by_user_id IS NOT NULL AND void_request_reason IS NOT NULL AND los 4 campos de anulación IS NULL) OR (status = 'voided' AND los 4 campos de anulación IS NOT NULL)` — en 'voided' el triple de solicitud queda libre (puesto si vino por solicitud, NULL si fue anulación directa).
- Índices `order_items_order_id` (ítems del pedido), `order_items_product_id` (ventas por producto, Fase 6), `order_items_kitchen_ticket_id` (ítems de la comanda), `order_items_ordered_at_table_id` (traza por mesa, Fase 6).
- `price_cents` admite hasta 999999 (S/ 9,999.99): más generoso que el tope de la carta (99999) para no bloquear precios futuros altos — el límite real lo pone la carta.

### 8.3 Tabla `order_item_components` (misma migración)

| Columna | Tipo | Reglas |
| --- | --- | --- |
| id | INTEGER | PK, autoincremental |
| order_item_id | INTEGER NOT NULL | FK → order_items.id |
| product_id | INTEGER NOT NULL | FK → products.id (componente; puede ser un 'combo' anidado no permitido por la carta, igual que combo_items) |
| product_name | VARCHAR(60) NOT NULL | copia del nombre del componente |
| quantity | INTEGER NOT NULL | CHECK 1-99 |
| portion / cut | VARCHAR(8) NULL | mismo CHECK de correspondencia que order_items |
| breast_eighths / leg_eighths | INTEGER NOT NULL DEFAULT 0 | CHECK ≥ 0; total de la línea del componente |
| created_at / updated_at | TIMESTAMPTZ NOT NULL | default now() |

- Índice `order_item_components_order_item_id`. Sin precio: los componentes no cobran dentro del combo (D-007-05).

### 8.4 Tabla `order_item_sauces` (misma migración)

| Columna | Tipo | Reglas |
| --- | --- | --- |
| id | INTEGER | PK, autoincremental |
| order_item_id | INTEGER NOT NULL | FK → order_items.id |
| product_id | INTEGER NOT NULL | FK → products.id (categoría 'sauce' — la categoría se verifica en el servicio, no en la base) |
| product_name | VARCHAR(60) NOT NULL | copia del nombre |
| quantity | INTEGER NOT NULL | CHECK 1-99 |
| price_cents | INTEGER NOT NULL | CHECK 0-999999; copia del precio de la crema (0 si es gratis) |
| created_at / updated_at | TIMESTAMPTZ NOT NULL | default now() |

- Índice `order_item_sauces_order_item_id`. "Sin repetir producto por ítem" y "solo con comida" se garantizan en el servicio (son reglas de negocio, no restricciones únicas — la cantidad por crema ya cubre el "2 ají").

### 8.5 Tabla `idempotency_keys` (misma migración)

| Columna | Tipo | Reglas |
| --- | --- | --- |
| id | INTEGER | PK, autoincremental |
| scope | VARCHAR(32) NOT NULL | 'order-items' (envío), 'order-item-void-requests' (solicitud), 'order-item-voids' (aprobación/anulación), 'order-item-void-rejections' (rechazo) |
| key | VARCHAR(128) NOT NULL | la clave del cliente; única con scope |
| order_id | INTEGER NOT NULL | FK → orders.id (el pedido al que aplicó) |
| request_hash | VARCHAR(64) NOT NULL | SHA-256 hex del cuerpo ya validado, serializado de forma estable |
| response_status | SMALLINT NOT NULL | el código HTTP que respondió (201 o 200) |
| response_body | JSONB NOT NULL | la respuesta completa `{ order, ticket }` |
| created_at | TIMESTAMPTZ NOT NULL | default now() |

- Única `idempotency_keys_scope_key_unique` sobre `(scope, key)`: el INSERT falla por duplicado y la transacción lee la fila existente para decidir replay o 409 — la misma protección de la regla 5 en la base, no solo en el servicio.
- Sin updated_at ni expiración (las claves son historial del pedido). Índice propio de la única.

### 8.6 Modelos Sequelize y asociaciones

- `models.KitchenTicket`, `models.OrderItem`, `models.OrderItemComponent`, `models.OrderItemSauce`, `models.IdempotencyKey` (`underscored`), sumados a `Models` y a la guardia `isDefined`.
- Asociaciones: `Order.hasMany(OrderItem)` / `OrderItem.belongsTo(Order)`; `Order.hasMany(KitchenTicket)`; `OrderItem.belongsTo(KitchenTicket, as: 'kitchenTicket')` y `belongsTo(KitchenTicket, as: 'voidTicket', foreignKey: 'void_ticket_id')`; `OrderItem.hasMany(OrderItemComponent)` / `hasMany(OrderItemSauce)`; `OrderItem.belongsTo(Product)` / `OrderItemComponent.belongsTo(Product)` / `OrderItemSauce.belongsTo(Product)`; `OrderItem.belongsTo(Table, as: 'orderedAtTable')`; `OrderItem.belongsTo(User, as: 'createdBy'/'voidedBy'/'voidRequestedBy')`; `KitchenTicket.belongsTo(User, as: 'createdBy')`; `IdempotencyKey.belongsTo(Order)`. `initOrderItemAssociations(models)` desde `initAssociations`.
- Sin `ON DELETE` en ninguna FK: productos, pedidos, mesas, usuarios y comandas no se borran nunca.

## 9. API (borrador; contrato propuesto en docs/api/openapi.yaml → 0.9.0; lo edita la implementación)

Base `/api`; todas protegidas con la cookie `polleria_session` y `Cache-Control: no-store` ('/api/orders' ya está en NO_STORE_PATH_PREFIXES; se suma '/api/menu'). Los cuatro POST nuevos exigen la cabecera `Idempotency-Key`; los tres con cuerpo exigen JSON (reject-void no lleva cuerpo).

| Método y ruta | Roles | Petición | Respuesta |
| --- | --- | --- | --- |
| GET /api/menu | cualquier rol con sesión | — | 200 `{ products: [MenuProduct] }`; 401 |
| POST /api/orders/{orderId}/items | waiter, admin | header `Idempotency-Key` + `{ items: [OrderItemInput] }` | 201 `{ order, ticket }`; 400 (issues, cabecera, orderId); 401; 403; 404 ORDER_NOT_FOUND; 409 ORDER_NOT_OPEN / ORDER_ITEMS_LIMIT / IDEMPOTENCY_CONFLICT |
| POST /api/orders/{orderId}/items/{itemId}/request-void | waiter, admin | header `Idempotency-Key` + `{ reason }` | 200 `{ order }`; 400 (reason, cabecera, ids); 401; 403; 404 ORDER_NOT_FOUND / ORDER_ITEM_NOT_FOUND; 409 ORDER_NOT_OPEN / ORDER_ITEM_ALREADY_VOIDED / ORDER_ITEM_VOID_REQUESTED / IDEMPOTENCY_CONFLICT |
| POST /api/orders/{orderId}/items/{itemId}/void | admin | header `Idempotency-Key` + `{ reason }` | 200 `{ order, ticket }`; 400 (reason, cabecera, ids); 401; 403; 404 ORDER_NOT_FOUND / ORDER_ITEM_NOT_FOUND; 409 ORDER_NOT_OPEN / ORDER_ITEM_ALREADY_VOIDED / IDEMPOTENCY_CONFLICT |
| POST /api/orders/{orderId}/items/{itemId}/reject-void | admin | header `Idempotency-Key` (sin cuerpo) | 200 `{ order }`; 400 (cabecera, ids); 401; 403; 404 ORDER_NOT_FOUND / ORDER_ITEM_NOT_FOUND; 409 ORDER_NOT_OPEN / ORDER_ITEM_NOT_REQUESTED / ORDER_ITEM_ALREADY_VOIDED / IDEMPOTENCY_CONFLICT |
| GET /api/orders/{orderId}/tickets | cualquier rol con sesión | — | 200 `{ tickets: [KitchenTicket] }`; 400 (orderId); 401; 404 |

`OrderItemInput`: `{ productId, quantity?, portion?, cut?, breastEighths?, legEighths?, notes?, sauces?: [{ productId, quantity? }], components?: [{ productId, quantity, portion?, cut?, breastEighths?, legEighths? }] }` (quantity por defecto 1).
`OrderItem` (respuesta): `{ id, productId, productName, productCategory, quantity, priceCents, portion, cut, breastEighths, legEighths, notes, sauces: [{ productId, productName, quantity, priceCents }], components: [{ productId, productName, quantity, portion, cut, breastEighths, legEighths }], status, kitchenTicketId, voidTicketId, voidedBy, voidedAt, voidReason, voidRequestedBy, voidRequestedAt, voidRequestReason, orderedAtTable, createdBy, createdAt }` — un ítem `void_requested` muestra su `voidRequestedBy`/`voidRequestedAt`/`voidRequestReason` mientras los campos `voided*` siguen null.
`KitchenTicket`: `{ id, orderId, kind, items: [OrderItem], createdBy, createdAt }` — para kind 'void', `items` es el único ítem anulado.
`Order` actualizado: las 11 claves de D-009-14 más `items: [OrderItem]` y `totalCents` (D-010-14).
`MenuProduct`: `{ id, name, category, priceCents, portions: [{ portion, cut, priceCents }], items: [{ product, quantity, portion, cut }] }`.

- Ejemplo — enviar a la Mesa 3 su primera tanda (`POST /api/orders/12/items`, mozo, `Idempotency-Key: pedido-m3-001`):

```json
{ "items": [
  { "productId": 5, "quantity": 2, "portion": "quarter", "cut": "leg",
    "notes": "sin ensalada", "sauces": [{ "productId": 9 }, { "productId": 10, "quantity": 2 }] },
  { "productId": 7, "quantity": 1 },
  { "productId": 20 }
] }
```

→ `201` (recortado):

```json
{ "order": { "id": 12, "status": "open", "tables": [{ "id": 3, "name": "Mesa 3" }],
    "openedBy": { "id": 2, "displayName": "Juan" }, "openedAt": "2026-10-11T18:30:00.000Z",
    "readyAt": null, "billRequestedAt": null, "closedAt": null, "closedBy": null,
    "cancelReason": null, "mergedIntoOrderId": null, "totalCents": 6400,
    "items": [
      { "id": 31, "productId": 5, "productName": "Pollo a la brasa", "productCategory": "chicken",
        "quantity": 2, "priceCents": 1400, "portion": "quarter", "cut": "leg",
        "breastEighths": 0, "legEighths": 4, "notes": "sin ensalada",
        "sauces": [{ "productId": 9, "productName": "Ají", "quantity": 1, "priceCents": 0 },
                   { "productId": 10, "productName": "Ocopa", "quantity": 2, "priceCents": 300 }],
        "components": [], "status": "sent", "kitchenTicketId": 8, "voidTicketId": null,
        "voidedBy": null, "voidedAt": null, "voidReason": null,
        "orderedAtTable": { "id": 3, "name": "Mesa 3" }, "createdBy": { "id": 2, "displayName": "Juan" },
        "createdAt": "2026-10-11T18:35:00.000Z" },
      { "id": 32, "productId": 7, "productName": "Inca Kola 1L", "productCategory": "drink",
        "quantity": 1, "priceCents": 800, "portion": null, "cut": null,
        "breastEighths": 0, "legEighths": 0, "notes": null, "sauces": [], "components": [],
        "status": "sent", "kitchenTicketId": 8, "voidTicketId": null, "voidedBy": null,
        "voidedAt": null, "voidReason": null, "orderedAtTable": { "id": 3, "name": "Mesa 3" },
        "createdBy": { "id": 2, "displayName": "Juan" }, "createdAt": "2026-10-11T18:35:00.000Z" },
      { "id": 33, "productId": 20, "productName": "Mostrito", "productCategory": "combo",
        "quantity": 1, "priceCents": 2200, "portion": null, "cut": null,
        "breastEighths": 0, "legEighths": 2, "notes": null, "sauces": [],
        "components": [{ "productId": 5, "productName": "Pollo a la brasa", "quantity": 1,
                         "portion": "quarter", "cut": "leg", "breastEighths": 0, "legEighths": 2 },
                       { "productId": 7, "productName": "Inca Kola 1L", "quantity": 1,
                         "portion": null, "cut": null, "breastEighths": 0, "legEighths": 0 }],
        "status": "sent", "kitchenTicketId": 8, "voidTicketId": null, "voidedBy": null,
        "voidedAt": null, "voidReason": null, "orderedAtTable": { "id": 3, "name": "Mesa 3" },
        "createdBy": { "id": 2, "displayName": "Juan" }, "createdAt": "2026-10-11T18:35:00.000Z" }
    ] },
  "ticket": { "id": 8, "orderId": 12, "kind": "initial",
    "items": ["… los tres ítems de arriba …"],
    "createdBy": { "id": 2, "displayName": "Juan" }, "createdAt": "2026-10-11T18:35:00.000Z" } }
```

- Cómo se arma `totalCents` 6400 del ejemplo: ítem 31 → 2 × 1400 (el precio DE LA FILA quarter-leg) + 0 (ají) + 2 × 300 (ocopas) = 3400; ítem 32 → 1 × 800 = 800; ítem 33 → 1 × 2200 = 2200. Los ítems de `ticket.items` son los mismos objetos del `order.items` de esa comanda (recortados arriba por legibilidad).
- Ejemplo — el mozo solicita anular el ítem 32 (`POST /api/orders/12/items/32/request-void`, mozo, `Idempotency-Key: sol-anul-001`): `200 { order }` con el ítem `"status": "void_requested"`, `"voidRequestedBy": { "id": 2, "displayName": "Juan" }`, `"voidRequestReason": "Se equivocó el cliente"`, los campos `voided*` en null y `totalCents` intacto en 6400. Luego el admin aprueba (`POST .../void` con `Idempotency-Key: anul-m3-001` y `{ "reason": "Confirmado, error del cliente" }`): `200` con el ítem `"status": "voided"`, `"voidedBy": { "id": 1, "displayName": "Dueño" }`, `"voidTicketId": 9` conservando el `voidRequested*` — y la comanda `{ "id": 9, "kind": "void", "items": [<ítem 32>] }`; `order.totalCents` queda en 5600. Si el admin en cambio rechazara (`POST .../reject-void` sin cuerpo): `200` con el ítem de vuelta a `"sent"` y los campos `voidRequested*` en null.
- Rutas de lectura de la 009 (GET /api/orders/{orderId}, GET /api/tables) devuelven ahora el `Order` con `items` y `totalCents` — mismo path, forma ampliada (sección 12).
- Sin eventos Socket.IO (D-010-20).
- Cambio propuesto del contrato OpenAPI 0.8.0 → 0.9.0: aditivo salvo el `Order` que gana las dos claves requeridas (cambio señalado, sección 12). Se propone: tag `menu` nuevo y tag `orders` con descripción ampliada; las 6 rutas de la tabla; esquemas `OrderItemStatus` (3 valores), `KitchenTicketKind`, `OrderItemSauce` (respuesta), `OrderItemComponent` (respuesta), `OrderItem`, `KitchenTicket`, `KitchenTicketsResponse`, `OrderItemSauceInput`, `OrderItemComponentInput`, `OrderItemInput`, `SendOrderItemsRequest`, `SendOrderItemsResponse` (`{order, ticket}`), `OrderResponse` (`{order}` — para request-void y reject-void), `MenuPortion` (`{portion, cut, priceCents}`), `MenuComboItem` (`{product, quantity, portion, cut}`), `MenuProduct`, `MenuResponse`; parámetro `ItemId` (misma regla que OrderId) y parámetro de cabecera `IdempotencyKey` (string, patrón `^[\x21-\x7E]{1,128}$`, required en los cuatro POST — en reject-void documentar que no lleva cuerpo); respuestas reutilizables `OrderItemNotFound`, `OrderItemAlreadyVoided`, `OrderItemVoidRequested`, `OrderItemNotRequested`, `OrderHasActiveItems`, `OrderItemsLimit`, `IdempotencyConflict`; `ErrorCode` suma los siete códigos; `Order` documenta `items` y `totalCents`; las descripciones de join y cancel de la 009 se actualizan (mueven ítems / guardias con ítems y solicitudes pendientes). `RequestVoidItemRequest` reutiliza la forma `{reason}` de `CancelOrderRequest` (igual que `VoidOrderItemRequest`). La deuda de componentes huérfanos de la 009 queda como estaba — los nuevos sí se referencian.

## 10. Interfaz (apps/web)

Sin pantallas en esta spec (D-010-01). Notas para la 011 (toma de pedido del mozo):

- La pantalla de toma consume GET /api/menu una vez por sesión de toma y POST /api/orders/{orderId}/items con una `Idempotency-Key` generada por intento (UUID por tap de "Enviar a cocina"; conservarla mientras el usuario reintente desde la misma pantalla de error).
- El carrito (ítems aún no enviados) es estado LOCAL de la pantalla: ahí se puede corregir cantidad, cremas y observación sin tocar la API (D-010-09). El envío muestra el resultado completo: `order.items` refresca la lista y `ticket` confirma qué se mandó.
- La lista del pedido muestra todos los ítems; los 'voided' se muestran tachados/gris con `voidReason` y `voidedBy.displayName`; los 'void_requested' se muestran con una marca "anulación pedida" (icono/badge) mostrando `voidRequestedBy.displayName` y `voidRequestReason` — el mozo ve su solicitud pendiente y el admin ve qué resolver; `totalCents` se formatea a soles.
- Solicitar anulación es acción del mozo (y admin): diálogo de motivo → POST request-void; el ítem queda marcado pendiente. Aprobar/rechazar son acciones solo visibles para admin sobre los ítems 'void_requested' (aprobar abre el diálogo de motivo final; rechazar confirma y devuelve el ítem); anular directo también es acción de admin sobre ítems 'sent'.
- GET /api/orders/{orderId}/tickets alimenta una vista "comandas enviadas" del pedido (útil en la 011 para revisar qué ya se mandó a cocina).
- La observación es un campo de una sola línea con contador de 200 (la regla ya viene del esquema).
- Etiquetas en español que pondrá la web: sent 'Enviado', void_requested 'Anulación pedida', voided 'Anulado'; initial 'Comanda inicial', additional 'Adición', void 'Anulación'; presentaciones y partes con las etiquetas de las specs 006/007.

## 11. Contrato interno entre módulos

| Módulo | Expone / cambia |
| --- | --- |
| packages/shared/src/order-items.ts (nuevo) | `ORDER_ITEM_STATUSES` (3 valores), `KITCHEN_TICKET_KINDS`, constantes de topes (AC-02), `orderItemNotesSchema`, `orderItemInputSchema`, `sendOrderItemsRequestSchema`, `voidOrderItemRequestSchema` (forma `{reason}` = cancelOrderRequestSchema, reutilizada por request-void y void; reject-void no lleva cuerpo), `idempotencyKeySchema`, `orderItemSauceSchema`, `orderItemComponentSchema`, `orderItemSchema`, `kitchenTicketSchema`, `kitchenTicketsResponseSchema`, `sendOrderItemsResponseSchema`, `orderResponseSchema` (`{order}` para request/reject), `menuPortionSchema`, `menuComboItemSchema`, `menuProductSchema`, `menuResponseSchema`, tipos |
| packages/shared/src/orders.ts | `orderSchema` suma `items` y `totalCents` (13 claves) |
| packages/shared/src/errors.ts | ERROR_CODES suma los siete códigos |
| packages/shared/src/index.ts | exporta order-items.ts |
| packages/shared/src/combos.ts | `comboChickenConsumption` con firma `Iterable` (cambio señalado 007) |
| apps/api/src/db/migrations/20261011120000-create-order-items.ts (nueva) | las cinco tablas + CHECKs + única + índices (D-010-19) |
| apps/api/src/db/models/index.ts | KitchenTicket, OrderItem, OrderItemComponent, OrderItemSauce, IdempotencyKey + `initOrderItemAssociations` |
| apps/api/src/services/order-items/order-item.service.ts (nuevo) | `createOrderItemService({ models })` → `sendItems(orderId, body, key, actor)`, `requestVoid(orderId, itemId, reason, key, actor)`, `voidItem(orderId, itemId, reason, key, actor)`, `rejectVoid(orderId, itemId, key, actor)`, `listOrderTickets(orderId)` |
| apps/api/src/services/menu/menu.service.ts (nuevo) | `createMenuService({ models })` → `listMenu()` |
| apps/api/src/services/orders/order.service.ts | `cancelOrder` gana las dos guardias de D-010-11; `joinTable` mueve ítems y comandas; `loadOrderViews`/`getOrder` embeben ítems y `totalCents` (order-view.ts se extiende con la carga en lote de ítems/sauces/components/usuarios) |
| apps/api/src/controllers/orders.controller.ts + order-items.controller.ts + menu.controller.ts | handlers; `itemId` con `parseIdParam` (mismo helper); la cabecera se valida antes que params y cuerpo |
| apps/api/src/routes/orders/orders.routes.ts | suma `GET /:orderId/tickets`, `POST /:orderId/items`, `POST /:orderId/items/:itemId/request-void`, `POST /:orderId/items/:itemId/void`, `POST /:orderId/items/:itemId/reject-void` con `Cache-Control: no-store` y el lector JSON en las que tienen cuerpo (reject-void es bodiless) |
| apps/api/src/routes/menu/menu.routes.ts (nuevo) + routes/index.ts + app.ts | `GET /api/menu` montado antes del 404; `NO_STORE_PATH_PREFIXES` suma '/api/menu' |
| apps/api/tests/helpers/test-database.ts | `resetMigrationTables` borra las cinco tablas antes que 'orders'; `clearOrderTables` pasa a un TRUNCATE de siete tablas (sauces, components, order_items, idempotency_keys, kitchen_tickets, orders, tables), cada una tras su `tableExists` |
| docs/api/openapi.yaml | 0.8.0 → 0.9.0 (lo edita la implementación) |

## 12. Cambios a specs y documentos anteriores (señalados)

- **orderSchema / respuestas con pedido (spec 009):** `Order` gana `items` y `totalCents` requeridos (D-010-14). GET /api/orders/{orderId}, GET /api/tables y todas las operaciones que devuelven pedido cambian de forma; los tests de la 009 que asertaban el objeto exacto (esquema estricto de 11 claves, cuerpos completos) se actualizan en esta funcionalidad. Es el único cambio no aditivo del contrato.
- **cancelOrder y joinTable (spec 009):** cancel gana las dos guardias con ítems (D-010-11 — RN-009-08 ya lo preveía); join mueve `order_items` y `kitchen_tickets` al destino (D-010-12 — nota §19 de la 009). Los comportamientos sobre pedidos SIN ítems no cambian.
- **comboChickenConsumption (spec 007):** firma a `Iterable` puro, aplicando la recomendación ADV-007-06 del reviewer de esa spec; los tests que la llamaban con el ítem suelto se actualizan a iterables (mismo cálculo).
- **app.ts / NO_STORE_PATH_PREFIXES (spec 001):** suma '/api/menu'. '/api/orders' ya cubre las rutas nuevas; `BODILESS_PATH_PATTERN` suma la subruta `reject-void` (POST sin cuerpo: ignora el cuerpo si llega); las otras dos rutas de ítems llevan cuerpo propio.
- **helpers de tests (001, 005, 006, 007, 009):** `resetMigrationTables` y `clearOrderTables` se amplían con las cinco tablas nuevas respetando el orden de las FK (D-010-19); `clearAuthTables` queda igual (su CASCADE por orders→users ahora también vacía ítems, comandas y claves colgando de pedidos — efecto buscado; order_item_* e idempotency_keys referencian orders en cascada de TRUNCATE vía la lista explícita).
- **Listas MIGRATIONS de los tests de migraciones (004, 005, 006, 007, 009):** cada una recibe `20261011120000-create-order-items.ts` al final; el down encadenado gana un paso antes de revertir tables/orders.
- **Pendiente heredado de la 009:** la traza `ordered_at_table_id` se implementa aquí tal como la nota §19 lo dejó; "enviar ítems limpia bill_requested_at" se confirma en D-010-13 con la salvedad `ready_at` conservado.
- **Nada más:** products, product_portions, combo_items, users, sessions, orders y tables no cambian de estructura; la app web no cambia.

## 13. Dependencias

Ninguna nueva. Reutiliza lo ya instalado: Sequelize (transacción con bloqueo `FOR NO KEY UPDATE` del pedido antes de escribir ítems — mismo patrón de serialización de la 009), Zod 4, requireAuth/requireRole de la 003, `parseIdParam`, el lector JSON limitado a 100 kb, requireJsonContentType/requireJsonObject, `chickenConsumption`/`comboChickenConsumption` y las constantes de las specs 006/007, y el crypto de Node para el SHA-256 del `request_hash`.

## 14. Fuera de alcance

- Pantalla de toma de pedido del mozo y cualquier cambio en apps/web: spec 011. La 010 solo deja la API y el dominio.
- Impresión de la comanda en la impresora térmica (formato, 48 columnas, destinos, reintentos, número diario) y aviso de "pedido listo" por impresora: Fase 3 (RF-08 a RF-11) sobre PrinterService — aquí la comanda es solo un registro consultable por API.
- Pre-cuenta impresa, cobro, división de cuenta, `closed` del pedido, apertura/cierre de caja: Fase 4 (RF-13 a RF-17). `totalCents` queda listo como base del cálculo.
- Descuento de stock por ítems y merma: Fase 5 (RF-20 a RF-24). Los octavos ya quedan copiados para descontarlos con bloqueo (regla 3) cuando llegue.
- Pedidos para llevar/delivery sin mesa (RF-12): `ordered_at_table_id` lo admite NULL pero el flujo no se necesita.
- Edición de ítems ya enviados (cambiar cantidad, parte o nota de un 'sent'): no existe por diseño — la corrección es anular y enviar de nuevo (pregunta 7).
- Auditoría de solicitudes de anulación RECHAZADAS (quién pidió, cuándo, por qué se rechazó): el rechazo limpia el triple de la solicitud sin dejar rastro — la bitácora completa (order_events/audit_log) es deuda de la Fase 6, igual que la de mover/unir/separar de la 009 (§19).
- Dividir/trasladar ítems entre pedidos o entre mesas (llevar "la mitad de la cuenta" a otra mesa): no hay RF; queda para una spec futura si el dueño lo pide.
- `party_size` (personas por pedido): sigue pospuesto a Fase 6, igual que la 009.
- Bitácora de operaciones del salón (quién movió/unió/separó): sigue pospuesta a Fase 6.
- Socket.IO y eventos en tiempo real: D-010-20.
- Limpieza de los componentes huérfanos del openapi.yaml dejados por la 009 (deuda documentada): queda para cuando se edite el contrato en una spec de ajuste — los nuevos se crean referenciados.
- Seeds de carta/mesas para demo: Fase 6.

## 15. Riesgos

- **El mozo envía dos veces sin la misma clave** (cierra la app y vuelve a armar): son dos envíos reales y la cocina ve dos comandas — es el comportamiento correcto de idempotencia (la clave distingue "reintento" de "nueva adición"); la 011 debe reutilizar la clave del intento fallido. Mitigación documentada en §10.
- **Reutilizar una clave en otro pedido o con otro cuerpo por descuido del cliente** → 409 IDEMPOTENCY_CONFLICT explícito en vez de una respuesta prestada del pedido equivocado (verificación de `order_id` + `request_hash` además de la unicidad).
- **El tablero mezcla ítems de mesas distintas tras un merge** ("¿esto lo pidió la 3 o la 4?"): mitigado con `orderedAtTable` por ítem — la 011 puede agrupar la cuenta por mesa de origen.
- **Crecimiento de order.items en pedidos largos**: tope de 99 activos mantiene las respuestas acotadas; `GET /tickets` y `items` viajan juntos pero son decenas de filas por pedido (escala de una pollería de barrio).
- **request_hash con serialización distinta por implementación** (orden de claves): mitigación — el hash se calcula sobre el cuerpo YA VALIDADO serializado de forma estable (una sola función compartida), documentado en D-010-08; el adversarial-tester debe probar cuerpos con claves reordenadas.
- **Cobertura de order.service baja**: el servicio tiene ~81 % de ramas y esta spec le suma guardias (cancel con ítems, merge con ítems, limpieza de marcas); mitigación — los AC-12/AC-13 cubren los caminos nuevos y R-010-06 pide que no baje.
- **Un void mientras otro proceso envía ítems al mismo pedido**: ambos serializan sobre la fila del pedido con `FOR NO KEY UPDATE` (el envío y la anulación bloquean la misma fila); el segundo en entrar re-verifica el estado.
- **El medio con distribución rara confunde el reporte de octavos**: los octavos copiados son la fuente única para stock y reportes; la distribución elegida queda por línea (0+4, 1+3, 3+1, 4+0) — la Fase 5 descuenta exactamente eso.
- **Combo editado en la carta a mitad del servicio**: los ítems ya registrados conservan su copia; un NUEVO envío del combo usa la composición nueva — dos mesas pueden recibir "el mismo mostrito" distinto si la carta cambió al medio día. Mitigación: la carta se edita fuera de hora de servicio (documentado para el manual del dueño); el ítem siempre muestra su copia real.
- **Notas largas en la comanda impresa futura**: 200 caracteres no caben en 48 columnas sin truncar; la Fase 3 truncará para imprimir (ADV-002-01) pero la base guarda todo.
- **Solicitud de anulación que nadie resuelve**: si el admin está ocupado el ítem queda 'void_requested' — sigue cobrándose y cocina sigue preparándolo hasta que se resuelva (decisión deliberada: no hay aviso a cocina antes de la aprobación para no descartar platos que el admin podría rechazar). Mitigación: el pendiente se ve en `order.items` en el pedido y en el tablero, y el rechazo existe para destrabar solicitudes.
- **Cocina prepara un ítem con solicitud pendiente que luego se anula**: es el costo del flujo aprobado — la comanda 'void' llega recién al aprobarse; la pantalla de la 011 puede avisar al mozo para que avise a cocina de viva voz (como hoy) mientras el admin resuelve.

## 16. Supuestos

Confirmados por el usuario el 2026-10-10: S-010-01 a S-010-18 con las respuestas recomendadas; la decisión de anulación (pregunta 9) fue respondida explícitamente por el usuario — el mozo SOLICITA y el admin resuelve (aprueba o rechaza) — y quedó redactada como decisión en D-010-10. Se conservan abajo como registro.

| ID | Supuesto |
| --- | --- |
| S-010-01 | Solo dominio + API; la pantalla de toma es la 011 y apps/web no cambia (D-010-01). |
| S-010-02 | El ítem copia producto, nombre, categoría y precio unitario; `product_id` es solo vínculo histórico (D-010-02). |
| S-010-03 | Precio del pollo = la fila de presentación cuando hay porciones; `products.price_cents` en los demás casos, incluido el combo (D-010-03). |
| S-010-04 | Octavos copiados como total de línea; el medio admite distribución real que suma 4 por unidad sin cambio de precio (D-010-04). |
| S-010-05 | El combo copia sus componentes resueltos; la entrada `components` solo puede cambiar parte/distribución del pollo, el resto debe coincidir con la carta (D-010-05). |
| S-010-06 | Cremas como hijas del ítem (order_item_sauces) con precio copiado, máximo 6 por ítem, solo en comida; también pueden ser ítem suelto (D-010-06). |
| S-010-07 | Comanda = kitchen_tickets por envío (initial/additional) y por anulación (void); número = id global; sin campos redundantes del pedido (D-010-07). |
| S-010-08 | Idempotency-Key obligatoria en las cuatro operaciones que escriben ítems (envío, solicitud, anulación, rechazo); tabla idempotency_keys con (scope,key) único, order_id, request_hash y respuesta guardada; replay solo con mismo pedido y mismo hash (D-010-08). |
| S-010-09 | Envío atómico por tanda de 1-20 ítems; sin estado borrador en el servidor — el carrito es local de la pantalla (D-010-09). |
| S-010-10 | Anular es un ciclo de dos actores: el mozo solicita con motivo ('sent'→'void_requested') y el admin resuelve — aprueba con motivo final y comanda 'void', o rechaza (vuelve a 'sent'); el admin también anula directo; el ítem nunca se borra (D-010-10 — respuesta explícita del usuario a la pregunta 9). |
| S-010-11 | Cancelar: con ítems 'sent' 409 para todos; si el pedido alguna vez tuvo ítems solo admin; sin ítems nunca, como la 009 (D-010-11). |
| S-010-12 | El merge repointa order_items y kitchen_tickets al destino; `ordered_at_table_id` no se toca (D-010-12). |
| S-010-13 | Enviar/anular limpia bill_requested_at (par completo) y conserva ready_at (D-010-13). |
| S-010-14 | Order embebe items + totalCents en todas las respuestas con pedido, incluido el tablero (D-010-14). |
| S-010-15 | GET /api/menu devuelve la carta armada (activos, porciones del pollo, componentes del combo con producto embebido) en una sola llamada (D-010-15). |
| S-010-16 | Roles: lectura cualquier sesión; enviar y solicitar waiter/admin; aprobar/anular y rechazar solo admin (D-010-16). |
| S-010-17 | Issues por ítem acumulados en un solo 400 con los paths y mensajes de la tabla D-010-18. |
| S-010-18 | Sin Socket.IO, seeds, variables de entorno, dependencias ni ADR; `comboChickenConsumption` pasa a `Iterable` (D-010-20). |

## 17. Preguntas abiertas (con recomendación)

Respondidas el 2026-10-10: las preguntas 1 a 8 y 10 a 18 con la respuesta recomendada; la 9 respondida explícitamente por el usuario con una respuesta distinta a la recomendada (el mozo SOLICITA la anulación y el administrador la resuelve). Se conservan abajo como registro.

1. **¿Un ítem puede ir sin producto de carta, como texto libre** ("un plato especial de la casa")? Se propone NO: todo ítem referencia un producto activo, porque el cobro, la comanda, el stock y los reportes necesitan precio y categoría; lo extraordinario se resuelve creando el producto o con la observación del ítem. Recomendación: rechazar el texto libre como ítem. **Resuelta el 2026-10-10: recomendación aceptada.**
2. **¿Tope y caracteres de la observación?** Se propone 200 caracteres en una sola línea (sin saltos ni controles): suficiente para "sin ensalada, bien dorado, ají aparte" y consistente con la impresión de 48 columnas futura (la base guarda todo aunque el ticket trunque). Recomendación: aceptar. **Resuelta el 2026-10-10: recomendación aceptada.**
3. **¿Cremas como ítems separados o dentro del ítem?** Se propone dentro del ítem (order_item_sauces) porque van pegadas al plato en la comanda; una crema suelta (porción extra) sigue pudiendo ser un ítem propio. Recomendación: aceptar. **Resuelta el 2026-10-10: recomendación aceptada.**
4. **¿Las cremas se cobran?** Se propone que cada crema copie el `price_cents` de su producto 'sauce' y sume al total: si son gratis, su precio en carta es S/ 0.00 (ya posible desde la 005); si el dueño cobra alguna, solo le pone precio. Recomendación: aceptar el modelo — gratis o con precio según la carta. **Resuelta el 2026-10-10: recomendación aceptada.**
5. **¿Bebidas, descartables y postres se manejan igual que los platos?** Se propone sí: ítem simple con cantidad y precio copiados; solo no llevan cremas ni presentación (RN-010-13). Recomendación: aceptar. **Resuelta el 2026-10-10: recomendación aceptada.**
6. **En un combo, ¿el cliente elige la parte del pollo o se usa la del componente configurado?** Se propone que se pueda elegir la parte (y la distribución del medio) por componente de pollo vía `components`, con la carta como defecto — el mostrador pregunta "¿pecho o pierna?". El resto de la lista debe coincidir con la configurada. Recomendación: aceptar la elección con el defecto de la carta. **Resuelta el 2026-10-10: recomendación aceptada.**
7. **¿Se puede editar o quitar un ítem antes de enviarlo a cocina?** Se propone que sí, pero en el CARRITO LOCAL de la pantalla (011), no en el servidor: no existe estado borrador — todo ítem registrado ya fue a cocina. Una vez enviado, la corrección pasa por la anulación (D-010-10) y un envío nuevo. Recomendación: aceptar. **Resuelta el 2026-10-10: recomendación aceptada.**
8. **¿Todo ítem registrado ya fue enviado a cocina?** Se propone sí (consecuencia de la 7): `status` nace en 'sent' y de ahí pasa a 'void_requested' (solicitud) o a 'voided' (anulación directa). Recomendación: aceptar. **Resuelta el 2026-10-10: recomendación aceptada.**
9. **¿La anulación la solicita el mozo y la aprueba el admin, o el admin la ejecuta directamente?** La respuesta del usuario: **el mozo PUEDE solicitar la anulación** con motivo, y el administrador la aprueba/ejecuta (el admin también puede anular directo sin solicitud previa). Esta spec agrega el **rechazo explícito** como parte del ciclo: sin él una solicitud quedaría pendiente para siempre, bloqueando la cancelación del pedido y dejando el ítem sin salida — el admin decide "no se anula" y el ítem vuelve a 'sent'. La solicitud no emite comanda (la cocina solo se entera si se aprueba). Así quedó en D-010-10. **Resuelta el 2026-10-10: respuesta explícita del usuario (mozo solicita, admin aprueba o rechaza, admin también anula directo).**
10. **¿La comanda agrupa por envío?** Se propone sí: una comanda por envío ('initial' la primera de ítems, 'additional' cada adición — RF-06 literal) y una 'void' por anulación aprobada (base del "ANULADO" de RF-09; la solicitud no emite comanda). Recomendación: aceptar. **Resuelta el 2026-10-10: recomendación aceptada.**
11. **¿El pedido se ve con totales?** Se propone sí: `items` completos (incluidos los anulados y los con anulación pendiente, marcados) y `totalCents` en todas las respuestas con pedido, también en el tablero. Recomendación: aceptar. **Resuelta el 2026-10-10: recomendación aceptada.**
12. **¿Qué pasa si un producto se desactiva a mitad del pedido?** Se propone: los ítems ya registrados se conservan con su copia (nombre, precio, componentes); los envíos NUEVOS del producto fallan con 'Ese producto está desactivado en la carta.' — la carta se valida al enviar. Recomendación: aceptar. **Resuelta el 2026-10-10: recomendación aceptada.**
13. **¿El precio del pollo sale de la grilla de presentaciones o de `products.price_cents`?** Se propone la grilla cuando el producto tiene presentaciones (ejecuta D-006-05: "cobra el precio de la fila"); `products.price_cents` solo para chicken sin porciones y las demás categorías. Recomendación: aceptar. **Resuelta el 2026-10-10: recomendación aceptada.**
14. **¿Se puede vender un combo cuyo componente quedó desactivado?** Se propone sí (pregunta heredada de la 007): el ítem copia la composición vigente del combo y el componente desactivado viaja marcado en el menú para que la pantalla lo advierta; si el dueño no lo quiere así, la carta debería impedir venderlo — se registraría como cambio de regla. Recomendación: aceptar venderlo con advertencia en menú. **Resuelta el 2026-10-10: recomendación aceptada.**
15. **¿Enviar ítems o anular limpia `bill_requested_at`?** Se propone sí en ambos (la pre-cuenta ya no es la cuenta real) y se conserva `ready_at` (hay comida esperando recojo aunque llegue una adición); la solicitud y el rechazo NO la tocan porque la cuenta aún no cambió. Confirmación de la nota §19 de la 009. Recomendación: aceptar. **Resuelta el 2026-10-10: recomendación aceptada.**
16. **¿`Idempotency-Key` también en la anulación?** Se propone sí, y en las cuatro operaciones que escriben ítems (envío, solicitud, aprobación/anulación, rechazo): un reintento no debe crear ni duplicar efectos. Recomendación: aceptar. **Resuelta el 2026-10-10: recomendación aceptada.**
17. **¿El número de comanda es global o reinicia por día?** Se propone el `id` global ya (RF-08 solo pide "número"); la numeración diaria amigable ("comanda 12 del día") se decide en la Fase 3 con la impresión — la base ya tiene `created_at` para derivarla. Recomendación: aceptar. **Resuelta el 2026-10-10: recomendación aceptada.**
18. **¿Qué mesa queda como `ordered_at_table_id` si el pedido cubre varias?** Se propone la primera por id que lo cubre al enviar (la traza fina real llega con el carrito por mesa de la 011 si el dueño la pide; para RF-27/Fase 6 basta la mesa de origen por ítem). Recomendación: aceptar. **Resuelta el 2026-10-10: recomendación aceptada.**

## 18. Acción del usuario y verificación manual

1. `pnpm -w build` (compila @polleria/shared con los esquemas nuevos).
2. `pnpm --filter @polleria/api db:migrate:dev` — crea las cinco tablas en desarrollo.
3. Sembrar la carta mínima por API (o reutilizar la del desarrollo): un pollo con presentaciones (quarter leg S/ 14.00, half, whole), una bebida, una crema a S/ 0.00 y un combo con componentes.
4. Verificación manual con sesiones: abrir la Mesa 3 como mozo; `POST /api/orders/{id}/items` con `Idempotency-Key` y una tanda mixta (pollo con parte + bebida + combo + crema en el pollo + observación) → `201` con ítems copiados, comanda 'initial' y `totalCents`; repetir la misma llamada → misma respuesta sin duplicar; `GET /api/orders/{id}/tickets` → una comanda; `POST .../items` segunda tanda → comanda 'additional'; como mozo `POST .../items/{itemId}/request-void` con motivo → ítem 'void_requested' sin comanda; como admin `POST .../items/{itemId}/void` con motivo → ítem 'voided' con su comanda 'void' y ambas auditorías (o `POST .../items/{itemId}/reject-void` → vuelve a 'sent'); `GET /api/orders/{id}` → total actualizado y el ítem marcado; `POST .../cancel` con ítems enviados o solicitudes pendientes → 409; `GET /api/menu` → la carta armada.
5. El cierre documental registra el merge a main cuando el orquestador lo autorice.

## 19. Notas para specs siguientes

- **011 Toma de pedido / tablero del mozo:** consume GET /api/menu una vez; carrito local con edición libre antes de enviar; `Idempotency-Key` generada por intento de operación (conservarla en el reintento del mismo intento); después del 201 refrescar desde `order.items`; "solicitar anulación" para el mozo con diálogo de motivo (ítem queda 'void_requested' marcado) y "aprobar/rechazar/anular" solo visibles para admin; lista "comandas" desde GET /tickets; el tablero ya puede pintar `totalCents` por mesa y un badge de solicitudes pendientes.
- **Fase 3 (impresión, RF-08 a RF-11):** la comanda impresa se construye desde `kitchen_tickets` + `order_items` (los ítems por `kitchen_ticket_id`; la 'void' por `void_ticket_id` del ítem anulado): mesas del pedido, autor, hora, detalle con presentación/parte/cremas/nota/componentes y "ANULADO" para kind 'void'; numeración diaria si se pide (pregunta 17); truncar `notes` a 48 columnas; imprimir SIEMPRE por PrinterService (regla 7) con los dos drivers; la impresión debería dispararse dentro o justo después del commit del envío (no reenviar impresión en replay: un retry devuelve la respuesta sin reimprimir — evaluar marca `printed_at` en la Fase 3).
- **Fase 4 (cuenta y cobro, RF-13 a RF-17):** `totalCents` ya calcula la cuenta; la pre-cuenta imprime ítems 'sent' con sus líneas y el total; el cobro cerrará con `closed_at`/`closed_by` existentes; la división de cuenta por mesas puede usar `ordered_at_table_id` para agrupar "lo de la mesa 4" dentro de una cuenta unida.
- **Fase 5 (stock, RF-20 a RF-24):** descontar `breast_eighths`+`leg_eighths` de los ítems 'sent' (ya vienen resueltos por línea, incluidos los de componentes) dentro de transacción con bloqueo (regla 3); al anular un ítem se reintegran sus octavos; el pollo entero consumido por día sale de la suma de octavos 'sent'.
- **Fase 6 (reportes):** ventas por producto desde `product_id`+`product_name` copiados (el nombre copiado cubre productos renombrados); ventas por mozo desde `created_by_user_id`; anulaciones con su motivo y autor para el reporte de auditoría (RF-27); consumo de pollo por parte desde los octavos por línea.
- **Solicitudes de anulación (respuesta del usuario a la pregunta 9, ya implementada):** el ciclo vive en columnas de `order_items` (triple `void_requested_*` + los 4 de anulación), no en una tabla aparte — basta porque solo hay una solicitud pendiente por ítem. Lo que NO queda registrado: el historial de solicitudes rechazadas (el rechazo limpia el triple) — si el dueño quiere esa traza, va en la bitácora order_events/audit_log de la Fase 6 junto con mover/unir/separar (deuda ya conocida de la 009).
- **Bitácora de operaciones del pedido (Fase 6):** envíos, solicitudes y anulaciones ya quedan registrados por las comandas y las columnas de ítem con su autor y hora — `kitchen_tickets` ES la bitácora de ítems; mover/unir/separar sigue sin rastro (deuda de la 009).
