# 014 — Pre-cuenta y cobro completo

Fecha: 2026-10-13. Fase 4, RF-13 y primer bloque de RF-14; auditoría mínima de RF-27.

**Estado:** alcance aprobado por el usuario el 2026-10-13: un medio por pago (efectivo, Yape, Plin o tarjeta), pre-cuenta imprimible desde el navegador y cierre que libera mesas. Las reglas P-01…P-07 fueron aprobadas por el usuario con la aclaración de que todos los importes visibles y entradas deben estar en soles con decimales. Implementación desarrollada el 2026-10-16 en feat/014-cashier-payments, con OpenAPI 0.11.0 preparado. La validación transaccional/E2E contra PostgreSQL y el cierre C-01 siguen pendientes; la funcionalidad no está cerrada.

Publicación documental: integrada a **main** el 2026-10-15 con autorización del usuario (merge `40c4631`). Origen: `feat/014-cashier-payments`, desde main `c3021d2`. **La implementación sigue pendiente**, empezando por S-01. La preparación demo y el rediseño azul fueron integrados posteriormente de dev a main el 2026-10-16 por autorización del usuario (merge `5e452c0`). La implementación de 014 permanece separada en su rama.

## 1. Resultado esperado

El cajero ve los pedidos abiertos, revisa una pre-cuenta con los precios registrados, recibe un pago completo y confirma el cobro. El pedido queda cerrado y sus mesas libres en una sola transacción. Otra persona o un reintento no pueden cobrarlo dos veces.

Ejemplo: cuarto pierna S/ 17,00 + bebida S/ 4,00 = S/ 21,00. Con efectivo, la pantalla muestra **Total S/ 21,00 · Recibido S/ 30,00 · Vuelto S/ 9,00**. Con Yape/Plin/tarjeta muestra **Pago S/ 21,00 · Vuelto S/ 0,00** después de confirmación manual del cajero.

### Moneda en la interacción con el usuario

- Todos los importes de pantallas, formularios, confirmaciones, mensajes y pre-cuentas impresas se expresan en **soles**, con símbolo S/. Nunca se muestra 2100 como equivalente visible de S/ 21,00 ni se pide al usuario ingresar céntimos.
- Se permite ingresar `21.5` o `21,5` para veintiún soles con cincuenta céntimos; la presentación normalizada es **S/ 21,50**, siempre con dos decimales. Los campos indican «Monto recibido (S/)», «Total (S/)» y «Vuelto (S/)».
- La representación interna en API, base de datos y cálculos sigue siendo de enteros en céntimos, conforme a la regla 2 de CLAUDE.md. La conversión desde/hacia soles ocurre en la frontera de la interfaz y no introduce cálculos monetarios con float.
- El ejemplo visible es 21 soles de total, 30 soles recibidos y 9 soles de vuelto. Recibir 3 soles sería insuficiente; la aclaración del usuario se interpreta con ese ejemplo aritméticamente consistente.

## 2. Alcance y decisiones aprobadas

| ID   | Decisión                                                                                                                                                                                                                                                   |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-01 | Cobrar cualquier pedido abierto con total positivo e ítems, aunque el mozo aún no haya solicitado cuenta. La lista permite distinguir los que pidieron cuenta.                                                                                             |
| P-02 | Una anulación pendiente bloquea el cobro hasta su aprobación o rechazo. Ítems anulados no se cobran. El precio proviene del pedido, nunca de la carta actual.                                                                                              |
| P-03 | Yape/Plin/tarjeta se verifican manualmente por el cajero; no hay integración bancaria. La interfaz exige confirmar que recibió el pago. Efectivo admite recibido mayor al total y calcula vuelto.                                                          |
| P-04 | Sin descuentos, propinas, recargos, pago parcial, devolución ni reapertura en esta entrega. Un cobro confirmado es definitivo; estas acciones necesitan su propia spec.                                                                                    |
| P-05 | Cajero/admin cobran y consultan pagos; mozo puede ver/imprimir la pre-cuenta. Cocina no accede a los nuevos endpoints de Caja. No se pide un segundo PIN para el cobro normal.                                                                             |
| P-06 | Pre-cuenta por diálogo de impresión del navegador, como aprobó el usuario; no genera comanda ni acredita papel. Es una excepción acotada a la regla 7 de CLAUDE.md para esta impresión manual: las comandas automáticas siguen pasando por PrinterService. |
| P-07 | Importes del cobro entre 0 y 2147483647 céntimos, enteros seguros. Total pagable estrictamente positivo. Un total que exceda el rango se muestra como no cobrable; no se trunca ni redondea.                                                               |

La apertura/cierre de caja y cuadre (RF-16), pagos mixtos/división (RF-15), ticket de venta (RF-17), SUNAT, impresora térmica, stock, delivery y reportes están fuera. La pantalla de Caja conserva la atención de comandas de la 013.

## 3. Pre-cuenta y revisión de cambios

GET de pre-cuenta lee pedido, mesas e ítems en una vista consistente REPEATABLE READ. Responde `orderId`, `tables`, `items`, `totalCents`, `hasPendingVoids`, `canPay`, `billToken` y `generatedAt`.

Cada ítem conserva id, nombre/precio registrados, cantidad, presentación, parte, componentes y cremas. Su subtotal incluye cantidad × precio del ítem más cantidades × precios de cremas, conforme a la 010. Los componentes del combo son detalle y no se suman otra vez. No incluye motivo ni autor de anulaciones. Los anulados se excluyen del detalle cobrable; void_requested sigue contando en el total, pero bloquea cobro.

`billToken` es SHA-256 hexadecimal de una representación canónica del contenido cobrable: id del pedido, ids/nombres de sus mesas actuales y cada ítem activo con estado, cantidades, precios y detalle copiado, ordenados por id. No incluye hora de consulta, cambios de carta, nombre actual del usuario, ready/served ni billRequestedAt. No es una firma ni una autorización; sirve para detectar una cuenta que cambió mientras se revisaba. La API recalcula el total y el token al cobrar, nunca confía en el total del cliente.

Agregar/anular/solicitar o rechazar anulación, mover/unir/separar o renombrar mesas puede invalidar la cuenta. Un cambio con el mismo total también debe invalidarla. Actualizar precio/nombre de la carta no altera los precios/detalles copiados ni exige pagar un precio nuevo.

Imprimir no registra pago ni congela el pedido. La hoja muestra PRE-CUENTA, número de pedido, mesas, fecha Lima, detalle, subtotales y total, y «No es comprobante de pago». Imprime la vista revisada; una cuenta vieja no puede cobrarse sin relectura. No se genera PDF en servidor, archivo file ni trabajo del dispatcher de cocina.

## 4. Cobro, transacciones e idempotencia

POST requiere sesión cashier/admin, JSON estricto e Idempotency-Key con las mismas reglas de formato que la 010. Cuerpo:

```json
{
  "method": "cash",
  "receivedCents": 3000,
  "billToken": "<64 caracteres hexadecimales>",
  "confirmedReceived": true
}
```

Los cuatro métodos son `cash`, `yape`, `plin`, `card`; confirmedReceived debe ser true. Para no efectivo receivedCents coincide exactamente con el total; para efectivo es mayor o igual. El monto imputado es siempre el total actual, no el recibido. Falta de efectivo produce error, nunca pago parcial. La confirmación es una declaración del usuario, no verificación bancaria.

Orden de la operación dentro de una transacción:

1. Validar cuerpo/clave y permisos actuales; reclamar la clave en scope nuevo `order_payment` mediante el patrón existente de idempotency_keys.
2. Misma clave + pedido + cuerpo normalizado devuelven el 201 original antes de revisar si está cerrado o su cuenta cambió. Distinto pedido/cuerpo devuelve IDEMPOTENCY_CONFLICT. No cambia el cajero original al hacer replay desde otra sesión autorizada.
3. Bloquear el pedido con NO KEY UPDATE y sus mesas por id ascendente, respetando el orden de locks de la 009/010. Releer estado, ítems y total dentro de la transacción. Los cambios del salón e ítems compiten por el mismo bloqueo del pedido; comprobar en pruebas que no hay deadlock en cobro versus merge/move/send/void.
4. Exigir open, al menos un ítem cobrable, total positivo/en rango y ninguna anulación pendiente. Comparar billToken recalculado, validar recibido y calcular vuelto en enteros.
5. Insertar el pago y snapshot inmutable; cerrar el pedido con closedAt/closedBy y liberar todas las mesas cuyo currentOrderId aún apunte a este pedido. Guardar el 201 completo en la clave, y hacer commit.

Fallo en cualquier paso revierte pago, cierre, mesas y clave. No hay I/O de impresora, red bancaria, stock ni transacción abierta durante impresión del navegador. Dos claves distintas para el mismo pedido producen un solo ganador; el otro recibe ORDER_NOT_OPEN. Repetir un pago después de reabrir físicamente una mesa no afecta su pedido nuevo.

El snapshot de pago conserva las mesas y cuenta revisadas, cajero (id/nombre al cobrar), importes/método y fecha, aunque el pedido cerrado devuelva tables vacío por haberse liberado sus punteros. Nunca se borran pagos ni pedidos por cerrar una mesa.

## 5. Modelo propuesto

Nueva tabla `payments` con migración reversible antes de usarse, sin backfill de pedidos cerrados históricos. No alterar el esquema de Order ni agregar stock.

| Campo                       | Regla                                                                               |
| --------------------------- | ----------------------------------------------------------------------------------- |
| id                          | INTEGER PK autogenerada                                                             |
| order_id                    | INTEGER NOT NULL, FK orders, UNIQUE: un pago completo por pedido                    |
| method                      | VARCHAR, CHECK cash/yape/plin/card                                                  |
| amount_cents                | INTEGER, CHECK 1…2147483647                                                         |
| received_cents              | INTEGER, CHECK amount_cents…2147483647                                              |
| change_cents                | INTEGER, CHECK = received_cents - amount_cents                                      |
| cashier_user_id             | FK users, NOT NULL; nombre histórico en snapshot                                    |
| paid_at                     | TIMESTAMPTZ NOT NULL; presentación en America/Lima                                  |
| bill_token                  | CHAR(64), hexadecimal minúscula                                                     |
| snapshot_version / snapshot | versión 1 y JSONB estricto del contenido de cuenta/pago, validado antes de escribir |

CHECK adicional: métodos no efectivo exigen recibido = amount y change = 0. Sin ON DELETE CASCADE ni endpoints para alterar pagos. Índice por paid_at/id para la futura consulta, sin reportes en esta entrega. Transición closed ejecutada únicamente por este servicio; cancelled y merged siguen sus reglas previas.

## 6. API propuesta — contrato después de aprobar

Base `/api`; no-store también en errores, incluidos rechazos del lector global. OpenAPI 0.11.0 preparado en S-01, con operaciones pending hasta completar las verificaciones de C-01. No se amplían esquemas antiguos de respuesta.

| Método y ruta                      | Roles                | Respuesta                                                                                                                                                                                                       |
| ---------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET /cashier/orders?afterOrderId=N | cashier/admin        | 200 `{orders,nextAfterOrderId}`; solo open, por id ascendente, páginas de 50; resumen con mesas, total, openedAt, billRequestedAt, hasPendingVoids y canPay. Query entero positivo opcional; sin filtros extra. |
| GET /orders/{orderId}/bill         | waiter/cashier/admin | 200 `{bill}` consistente; 404 ORDER_NOT_FOUND, 409 ORDER_NOT_OPEN para no abiertos. Un total 0, excesivo o anulación pendiente se puede revisar con canPay=false.                                               |
| POST /orders/{orderId}/payments    | cashier/admin        | 201 `{order,payment}`; order conserva esquema de 0.10.0 y status closed; payment incluye id, orderId, method, amountCents, receivedCents, changeCents, cashier, paidAt y snapshot.                              |
| GET /payments/{paymentId}          | cashier/admin        | 200 `{payment}` inmutable para recuperar confirmación tras navegar/recargar; 404 PAYMENT_NOT_FOUND.                                                                                                             |

Errores nuevos propuestos: BILL_CHANGED (409), PENDING_VOIDS (409), ORDER_NOT_PAYABLE (409), INSUFFICIENT_CASH (422), PAYMENT_NOT_FOUND (404). Se conservan VALIDATION_ERROR (400), IDEMPOTENCY_CONFLICT (409), ORDER_NOT_OPEN (409), ORDER_NOT_FOUND (404), 401/403, lector JSON y 500 sin detalles internos. Después de un replay aceptado no se sustituyen sus campos históricos por una vista nueva.

## 7. Interfaz

`/caja` conserva Comandas por revisar y añade Pedidos abiertos: mesas, total, cuenta solicitada y bloqueos. Polling visible cada 5 s, paginación sin perder páginas al refrescar y carga/vacío/error conservando datos con aviso. No Socket.IO.

`/caja/pedidos/[orderId]`: pre-cuenta, imprimir y formulario de medio/recibido. Efectivo muestra vuelto; los otros medios muestran confirmación manual. Confirmación final indica mesa/pedido, total, recibido, vuelto y medio. Un guard síncrono evita doble envío; clave estable por intento, cuerpo congelado tras pérdida de respuesta y botón Reintentar solicitud. Cancelar un diálogo sin enviar no crea pago.

Ante BILL_CHANGED, recargar la cuenta, conservar el medio como preferencia y exigir nueva revisión/confirmación y clave nueva. Ante respuesta perdida, mantener la misma clave y cuerpo; no mostrar «No se cobró» ni permitir crear otra solicitud a ciegas. 201 lleva a confirmación con referencia de pago y acceso a `/caja/pagos/[paymentId]`; las mesas desaparecen de pendientes tras refresco. Sesión expirada utiliza el comportamiento de auth existente.

Mozo/admin tienen acceso a la pre-cuenta desde el pedido; el mozo no ve formulario ni acción de cobro. Pantallas imprimibles sin controles de edición y sin scroll horizontal a 360 px; Caja usable en desktop. Dinero escrito como soles se convierte con parsing decimal de cadenas a céntimos: admite punto o coma y hasta dos decimales, sin aritmética monetaria float, negativos, exponentes ni separadores de miles.

## 8. Criterios de aceptación

| AC    | Evidencia requerida                                                                                                                                                                                                                                                                       |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-01 | Migración up/down/re-up en _test, constraints de importes/métodos, unique order y FK; ningún backfill.                                                                                                                                                                                    |
| AC-02 | Pre-cuenta consistente: cantidades, cremas y combos sin doble suma, precios copiados y exclusión de voided; cero/exceso/pending visibles no cobrables.                                                                                                                                    |
| AC-03 | Token estable al releer y cambiar carta/marcas operativas; distinto ante cambios relevantes, incluso con total idéntico.                                                                                                                                                                  |
| AC-04 | Efectivo suficiente: un pago, vuelto exacto, closed y todas las mesas libres; referencia histórica conservada.                                                                                                                                                                            |
| AC-05 | Yape/Plin/card: confirmación true, recibido exacto y cero vuelto; sin servicios externos.                                                                                                                                                                                                 |
| AC-06 | Rechazar importes inválidos/insuficientes, cuenta vacía/cero/excesiva, void pendiente, cerrado/cancelled/merged y token viejo sin mutaciones.                                                                                                                                             |
| AC-07 | Replay secuencial/concurrente y ACK perdido devuelven mismo 201, sin segundo pago; clave reutilizada con cuerpo/pedido distinto rechazada.                                                                                                                                                |
| AC-08 | Dos cajeros, dos claves: un ganador. Cobro concurrente con send/void/request-void/move/join respeta locks y total revisado; sin liberar mesa de otro pedido ni deadlocks no resueltos.                                                                                                    |
| AC-09 | Fallo forzado de inserción/cierre/liberación/registro del replay revierte toda la operación y permite reintento.                                                                                                                                                                          |
| AC-10 | Auth/roles, sesión revocada, ids/query/body/clave estrictos y no-store en éxito/error; mozo/kitchen no cobran.                                                                                                                                                                            |
| AC-11 | Pago/snapshot inmutables y legibles tras renombrar usuarios/mesas/productos y reusar la mesa; no cambian respuestas antiguas.                                                                                                                                                             |
| AC-12 | Lista paginada y polling visible de todas las páginas; carga/vacío/error y 401; atención 013 conservada.                                                                                                                                                                                  |
| AC-13 | Importes visibles/impresos y entradas en soles, nunca céntimos; 21.5/21,5 se muestran S/ 21,50; total S/ 21,00, recibido S/ 30,00 y vuelto S/ 9,00. Parsing decimal exacto, revisión/confirmación, doble clic, BILL_CHANGED y reintento con misma clave/cuerpo tras pérdida de respuesta. |
| AC-14 | Pre-cuenta e impresión manual no crean pago ni comanda; hoja con etiquetas/detalle/total sin controles. Cocina sigue PrinterService.                                                                                                                                                      |
| AC-15 | E2E desktop cash: pedido mixto, pre-cuenta, cobro/vuelto, mesas libres y lectura del pago; E2E mobile método electrónico, vista 360 px y reintento sin duplicación. No internet.                                                                                                          |

## 9. Aprobación y cierre

El principal redacta contrato y revisa; test-writer gpt-6.1-sol low (reemplazo de Luna autorizado el 2026-10-16); implementer gpt-6.1-sol medium para cobro/transacciones/idempotencia y gpt-6.1-sol low para UI sencilla, sin dos implementadores simultáneos. Bloques pequeños rojo → verde → revisión. No auditoría adversarial ni reviewer independientes; mantener casos críticos como regresiones.

DoD: todos los AC trazados; tests completos, tipos, lint, cobertura con umbrales existentes, E2E desktop/mobile y contrato verificados. No migrar la base de desarrollo para validar esta feature; únicamente _test. Registro de PROGRESS/CONTINUAR y commits separados. Integración a main/dev solo con autorización correspondiente; no desplegar ni afirmar cobro bancario, comprobante fiscal o salida física.
