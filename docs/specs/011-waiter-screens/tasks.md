# Tareas — Spec 011: Pantallas del mozo

- Spec: docs/specs/011-waiter-screens/spec.md (estado Borrador; esta lista no se ejecuta hasta que el usuario la apruebe)
- Rama: feat/011-waiter-screens
- Contrato: docs/api/openapi.yaml 0.9.0, SIN CAMBIOS (la spec es solo web; consumo de las rutas de la 009/010)
- ADR: ninguno — composición de lo ya decidido
- Dependencias: ninguna nueva
- Alcance especial: solo apps/web + e2e/global-setup.ts (semilla). apps/api y packages/shared no se tocan: ni código, ni pruebas (RN-011-01, D-011-01, D-011-15). Si apareciera un hueco real en la API se reporta al orquestador como tarea de backend separada — no se improvisa (pregunta 11 de la spec).
- Cambios señalados: el cliente de la web suma la opción `idempotencyKey` (cabecera `Idempotency-Key`, D-011-09); las etiquetas del salón se suman a las etiquetas del producto; `app/mozo/page.tsx` reemplaza el placeholder de la 003; `e2e/global-setup.ts` suma la limpieza del salón y la semilla ampliada conservando usuarios y carta (D-011-16).

## Orden y por qué

TDD de la 008/010: el test-writer va primero y deja el rojo comprobado (funciones de la lib que no existen, componentes con clases esperadas, páginas que aún son placeholder, E2E de rutas que no existen). El frontend-dev verde luego. Backend solo si un hueco real lo exige (ninguno previsto). Cierre con la verificación completa.

## Pruebas en rojo (test-writer) — reglas comunes

- Las pruebas unitarias y de componentes corren con `pnpm test` (Vitest + MSW a nivel fetch); las E2E con `pnpm test:e2e` en el proyecto mobile-chrome (360×740) sobre polleria_test. NUNCA `pnpm --filter` para correr tests: las suites se serializan sobre la misma base.
- Cada prueba lleva su AC en el nombre: `describe('011: ...')` / `it('AC-xx: ...')`. Toda validación de rojo es: la función/componente/página no existe aún o es el placeholder — el fallo es por ausencia, nunca por una aserción inventada.
- MSW intercepta `/api/...` del mismo origen y verifica método, ruta, cuerpo y cabeceras (la `Idempotency-Key` se captura exacta). Los esquemas de shared ya existen (tables, orders, orderItems, kitchenTickets, menu, idempotency).
- polleria_test: la limpieza del salón usa `clearOrderTables` (autorizada por D-010-19 de la 010: order_items, components, sauces, idempotency_keys, kitchen_tickets, orders, tables). Las semillas van por servicios reales (`createTableService`, `createOrderService`, `createOrderItemService`, `createProductService`, `createComboItemService`) con las guardias `_test` de siempre. Sesiones por `loginWithCookie` con los usuarios E2E sembrados (e2e.mozo PIN 2468, e2e.admin PIN 135790).
- Commits `test:` solo con archivos de prueba. Nada de código de producción.

## Tareas

### T-01 — Tests de `lib/api/tables.ts` (AC-01)
- Responsable: test-writer
- Dependencias: ninguna
- AC: AC-01
- Descripción: `apps/web/src/lib/api/tables.test.ts` — MSW sirve `GET /api/tables` (lista con mesas libres/ocupadas y `order` embebido con `items`/`totalCents`), `POST /api/tables/{id}/orders` (201 con `orderSchema`), `POST /api/tables/{id}/join` (`{ intoTableId }`, 200) y `POST /api/tables/{id}/leave` (200). Verifica método+ruta+cuerpo, validación por esquema, propagación de ApiError con sus códigos (TABLE_OCCUPIED, TABLE_INACTIVE, TABLE_HAS_NO_ORDER, ORDER_NEEDS_TABLE) y UNEXPECTED_RESPONSE conservando el status.

### T-02 — Tests de `lib/api/orders.ts`, `lib/api/order-items.ts`, `lib/api/menu.ts` y `lib/idempotency.ts` (AC-02, AC-03, AC-04)
- Responsable: test-writer
- Dependencias: ninguna
- AC: AC-02, AC-03, AC-04
- Descripción: `orders.test.ts` (getOrder, moveOrder, requestBill, markReady, markServed, cancelOrder con `{ reason }`, getOrderTickets con `kitchenTicketsResponseSchema`); `order-items.test.ts` (sendOrderItems 201 `{order, ticket}`, requestVoidItem/voidOrderItem/rejectVoidItem 200 `{order}`/`{order, ticket}`, las cuatro con la cabecera `Idempotency-Key` capturada exacta por MSW y sus ApiError: ORDER_NOT_OPEN, ORDER_ITEM_NOT_FOUND, ORDER_ITEM_VOID_REQUESTED, ORDER_ITEM_ALREADY_VOIDED, ORDER_ITEM_NOT_REQUESTED, IDEMPOTENCY_CONFLICT); `menu.test.ts` (getMenu con `menuResponseSchema`); `idempotency.test.ts` (la clave pasa `idempotencyKeySchema` y dos llamadas difieren); las tres etiquetas exactas (TABLE_STATE_LABELS, ORDER_ITEM_STATUS_LABELS, KITCHEN_TICKET_KIND_LABELS) en el archivo de etiquetas que la spec indica (menu-labels.ts o uno nuevo — el test fija el módulo esperado).

### T-03 — Tests del tablero /mozo (AC-05 a AC-08)
- Responsable: test-writer
- Dependencias: T-01
- AC: AC-05, AC-06, AC-07, AC-08
- Descripción: componente del tablero con MSW — tarjeta por mesa activa con nombre + etiqueta (Libre/Ocupada/Pedido listo/Pidió la cuenta), inactivas ausentes, 'Juan · S/ 45.00', 'y Mesa 4', ambas marcas a la vez, 'Anulación pedida' con ítems void_requested; 'Cargando mesas...' (role status), 'No se pudo cargar el salón.' (role alert) + 'Reintentar', 'No hay mesas activas.'; el polling vuelve a consultar y refleja el cambio; el enlace de la tarjeta va a /mozo/mesas/<id>; RoleGuard lleva a un cajero a /caja y deja pasar a waiter/admin.

### T-04 — Tests de la pantalla de mesa/pedido: abrir, ítems, señales, comandas (AC-09, AC-10, AC-11, AC-14)
- Responsable: test-writer
- Dependencias: T-01, T-02
- AC: AC-09, AC-10, AC-11, AC-14
- Descripción: mesa libre → 'Abrir mesa' con un solo POST aunque se toque dos veces → vista de pedido con 'Todavía no hay ítems enviados.'; 'Esa mesa no existe.' con enlace; lista de ítems con etiquetas por estado (sent sin marca, void_requested con quién y motivo, voided tachado con motivo final y aprobador), '· Mesa 4' por `orderedAtTable`, 'Total S/ X.XX', polling del detalle; 'Marcar pedido listo'/'Marcar servido' según `readyAt`, 'Pedir la cuenta' mientras `billRequestedAt` esté vacío, 409 ORDER_NOT_OPEN con su mensaje; 'Comandas enviadas' con etiquetas/hora/ítems, 'Todavía no se envió ninguna comanda.', comandas 'Anulación' solo para admin.

### T-05 — Tests de mover/unir/separar/cancelar (AC-12, AC-13)
- Responsable: test-writer
- Dependencias: T-04
- AC: AC-12, AC-13
- Descripción: 'Mover a otra mesa' ofrece solo libres activas no cubiertas → POST move → navega a /mozo/mesas/<destino>; 'Unir mesa' solo ocupadas → POST join de la origen a la actual; 'Separar Mesa N' solo cuando cubre más de una, confirma '¿Separar Mesa N? Quedará libre.' → POST leave; 'Cancelar pedido' con 'Motivo de la cancelación' → POST cancel `{ reason }` → vuelve al tablero; 409 TABLE_OCCUPIED/TABLE_INACTIVE/ORDER_NEEDS_TABLE/ORDER_HAS_ACTIVE_ITEMS con su message; motivo vacío o >200 cortado en local.

### T-06 — Tests de la toma de pedido: carta, editor, carrito, envío (AC-15 a AC-19)
- Responsable: test-writer
- Dependencias: T-02
- AC: AC-15, AC-16, AC-17, AC-18, AC-19
- Descripción: secciones por categoría en el orden del menú; editor por tipo de producto (pollo con presentaciones ofertadas + parte en octavo/cuarto + preselección quarter/leg, 'half' con las cinco distribuciones y 2+2, 'whole' sin campos; otros con cantidad/cremas/observación; combo con componentes y parte por componente de pollo + ' (desactivado)'); carrito local con precio calculado, corregir/quitar sin API, 'Enviar a cocina (N)' inhabilitado vacío, tope 20, contador 'N/200'; envío con `Idempotency-Key`, un solo POST por toque, 'Reintentar envío' con LA MISMA clave (MSW captura ambas), 201 → vacío + vuelta a la mesa con 'Pedido enviado a cocina.' y la comanda nueva; issues `items.N.*` junto a la línea, 409 con su message, fallo de red con 'Sin conexión con el servidor. Revisa el wifi e intenta de nuevo.', carrito conservado tras el error; la segunda tanda crea la comanda 'Adición'.

### T-07 — Tests del ciclo de anulación en pantalla (AC-20, AC-21)
- Responsable: test-writer
- Dependencias: T-04
- AC: AC-20, AC-21
- Descripción: mozo — 'Solicitar anulación' en ítem sent → 'Motivo de la anulación' → POST request-void con su clave → 'Anulación pedida' con nombre y motivo; motivo vacío cortado en local; 409 ORDER_ITEM_VOID_REQUESTED/ALREADY_VOIDED con su message; el mozo NO ve 'Anular', 'Aprobar anulación' ni 'Rechazar solicitud'. Admin — 'Anular' en sent → POST void → 'Anulado' + comanda 'Anulación'; en void_requested: 'Aprobar anulación' con el motivo del mozo precargado editable → POST void con el motivo final; 'Rechazar solicitud' con confirmación → POST reject-void sin cuerpo → vuelve a 'Enviado'; ORDER_ITEM_NOT_REQUESTED con su message.

### T-08 — Semilla E2E ampliada y los tres recorridos Playwright (AC-22, AC-23, AC-24)
- Responsable: test-writer
- Dependencias: T-03 a T-07
- AC: AC-22, AC-23, AC-24
- Descripción: `e2e/global-setup.ts` suma `clearOrderTables` y mesas 'E2E Mesa 1' a 'E2E Mesa 4' con `createTableService`, más 'E2E Ají' (sauce, 0) y 'E2E Mostrito' (combo: pollo cuarto pierna + chaufa) con `createComboItemService`, conservando usuarios y carta actuales; `e2e/waiter.spec.ts` con los tres recorridos de la spec en mobile-chrome (E2E-1 abrir → tanda mixta → listo → servido → cuenta; E2E-2 adición → solicitud de anulación del mozo → aprobación/rechazo del admin en segunda sesión del mismo spec; E2E-3 mover → unir → separar → cancelar sin ítems), cada uno verificando sin desplazamiento horizontal a 360 px (la técnica de AC-21 de la 008).

### Verificación del rojo (test-writer)

Tras T-01 a T-08, correr `pnpm test` y `pnpm test:e2e` serializados y adjuntar al reporte la salida que muestra los fallos por ausencia (módulos inexistentes, placeholder, rutas 404). Nada de verde todavía.

### Implementación en verde (frontend-dev) — reglas comunes

- No crea, modifica ni elimina pruebas. Si una parece incorrecta, la reporta al orquestador.
- Solo apps/web + lo estrictamente señalado (client.ts suma `idempotencyKey`; etiquetas del salón; app/mozo/*). apps/api y packages/shared quedan sin diff.
- Reutiliza los patrones de la 008: TanStack Query con retry:false, apiErrorMessage/issuesFromApiError/issuesFromZod/uniqueMessages, RoleGuard con su marco, selectores nativos, min-h-12, formatSoles, formatPortionCutLabel, toLimaDateTimeParts, useRef+isPending para envío único.
- Commits `feat:` sin archivos de test.

### T-09 — Lib de API: cliente con `idempotencyKey`, tables, orders, order-items, menu, clave y etiquetas (verde T-01, T-02)
- Responsable: frontend-dev
- Dependencias: T-01, T-02 en rojo
- AC: AC-01, AC-02, AC-03, AC-04
- Descripción: `ApiRequestOptions` suma `idempotencyKey?: string` que emite la cabecera `Idempotency-Key` en `requestWithStatus`; `lib/api/tables.ts`, `lib/api/orders.ts`, `lib/api/order-items.ts`, `lib/api/menu.ts` y `lib/idempotency.ts` (`createIdempotencyKey` con `crypto.randomUUID`) con las firmas y esquemas de las AC; las tres etiquetas del salón en el módulo que los tests esperan.

### T-10 — Tablero /mozo (verde T-03)
- Responsable: frontend-dev
- Dependencias: T-09
- AC: AC-05, AC-06, AC-07, AC-08
- Descripción: `app/mozo/page.tsx` (reemplaza el placeholder) con la consulta de mesas y `refetchInterval` 5 s, la grilla de tarjetas con etiqueta+color por estado, mozo/total/mesas unidas/ambas marcas/'Anulación pedida', estados cargando/error/vacío, y los componentes en `components/waiter/` que el test espera.

### T-11 — Pantalla de la mesa y su pedido (verde T-04, T-05)
- Responsable: frontend-dev
- Dependencias: T-10
- AC: AC-09, AC-10, AC-11, AC-12, AC-13, AC-14
- Descripción: `app/mozo/mesas/[tableId]/page.tsx` con la mesa resuelta del listado, 'Abrir mesa', la sección 'Pedido' con ítems y estados/total/'· Mesa N', 'Acciones' (agregar, listo/servido, cuenta, mover, unir, separar con confirmación, cancelar con motivo) y 'Comandas enviadas'; polling 5 s del detalle; invalidación tras cada mutación; 'Esa mesa no existe.'.

### T-12 — Toma de pedido con carrito y envío idempotente (verde T-06)
- Responsable: frontend-dev
- Dependencias: T-11
- AC: AC-15, AC-16, AC-17, AC-18, AC-19
- Descripción: `app/mozo/mesas/[tableId]/agregar/page.tsx` con la carta por secciones, el editor por ítem (preselecciones, distribución del medio, cremas con cantidad, observación con contador, componentes del combo), el carrito local con tope 20 y precio por línea, el envío con `Idempotency-Key` conservada en el reintento del mismo intento, issues `items.N.*` junto a la línea, y la vuelta a la mesa con 'Pedido enviado a cocina.' tras el 201.

### T-13 — Ciclo de anulación en la pantalla del pedido (verde T-07)
- Responsable: frontend-dev
- Dependencias: T-11
- AC: AC-20, AC-21
- Descripción: 'Solicitar anulación' del mozo con su diálogo de motivo; para el admin 'Anular' directo, 'Aprobar anulación' con el motivo precargado editable y 'Rechazar solicitud' con confirmación — cada POST con su Idempotency-Key; las marcas de estado resultantes y las comandas 'Anulación' solo para admin.

### T-14 — Cierre: definición de terminado y verificación manual
- Responsable: orquestador (verifica; no implementa)
- Dependencias: T-09 a T-13
- AC: R-011-01 a R-011-08
- Descripción: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm test:e2e` y `pnpm test:coverage` en verde (80 % líneas en apps/web); `git status --porcelain apps/api packages/shared` vacío; openapi.yaml en 0.9.0 sin diff; grep sin recursos de internet; las tres rutas bajo RoleGuard '/mozo'. Verificación manual de la spec §18 (recorridos del mozo y del admin, corte de wifi con reintento, pedido típico < 30 s). ADV-007-27 y ADV-002-01 quedan como baseline ruidosa conocida — no pertenecen a esta spec.

## Matriz AC, pruebas e implementación

| AC | Prueba (T) | Implementación (T) |
| --- | --- | --- |
| AC-01 | T-01 | T-09 |
| AC-02, AC-03, AC-04 | T-02 | T-09 |
| AC-05 a AC-08 | T-03 | T-10 |
| AC-09, AC-10, AC-11, AC-14 | T-04 | T-11 |
| AC-12, AC-13 | T-05 | T-11 |
| AC-15 a AC-19 | T-06 | T-12 |
| AC-20, AC-21 | T-07 | T-13 |
| AC-22 a AC-24 | T-08 | T-10 a T-13 (e2e) |
| R-011-01 a R-011-08 | — | T-14 |
