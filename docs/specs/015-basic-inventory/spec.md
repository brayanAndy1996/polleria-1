# 015 — Inventario básico de pollo y bebidas

Fecha: 2026-10-17. Fase 5; primer bloque de RF-19/20/21/22/23 y auditoría mínima RF-27.

**Estado: propuesta preparada; P-02 aprobada por el usuario; pendiente P-03 y cierre del alcance antes de TDD/implementación.** El usuario autorizó continuar con la 015 después de integrar la 014. Se toma como siguiente módulo el inventario básico recomendado en la conversación. No se presenta esta propuesta como funcionalidad existente.

## 1. Resultado esperado

El administrador registra las tandas de pollo asado y las entradas de bebidas compradas. El mozo ve las existencias y no puede enviar una tanda que las exceda. Una venta consume una sola vez, dentro de la misma transacción del envío a cocina, aunque dos mozos envíen a la vez o se pierda una respuesta. Cobrar no vuelve a descontar.

Ejemplo: registrar 10 pollos agrega 40 octavos de pecho y 40 de pierna. Enviar dos cuartos pierna consume 4 octavos de pierna y deja 36. Un combo consume el pollo y las bebidas de sus componentes, multiplicados por la cantidad de combos. Un reintento devuelve el envío original sin otro descuento.

## 2. Alcance y decisiones propuestas

| ID | Regla propuesta |
| --- | --- |
| P-01 | Descontar al enviar los ítems a cocina, no al agregarlos al carrito ni al cobrar. No reservar stock por abrir una pantalla. |
| P-02 | **Aprobada por el usuario el 2026-10-17: anular no devuelve automáticamente existencias.** El pollo puede estar preparado o la bebida entregada. El administrador registra una devolución física mediante ajuste positivo con motivo. Solicitar/rechazar una anulación tampoco modifica stock. |
| P-03 | **Pollo por fecha de operación de America/Lima**: el día siguiente empieza con cero; no trasladar sobrantes automáticamente. Las bebidas conservan su saldo entre días. Pendiente de decisión del usuario; si el local atiende después de medianoche, se debe acordar el corte operativo antes de implementar. |
| P-04 | Activación explícita por administrador: un control común para el pollo y uno por producto de bebida. La migración deja controles desactivados para conservar la operación existente. Al activar, el saldo inicial es cero y exige registrar existencias reales. Nunca inferir stock desde ventas antiguas ni descontar pedidos ya enviados. |
| P-05 | Todos los productos chicken comparten el mismo saldo de pecho/pierna. Solo se venden con consumo en octavos definido. Un pollo sin presentación/consumo configurado queda bloqueado cuando el control está activo; no tratarlo como consumo cero. |
| P-06 | El administrador elige qué bebidas compradas controla por unidad de venta. Refrescos preparados, recetas, litros, insumos, compras con costos/proveedores, mínimos y alertas quedan para otra entrega. Bebidas sin control muestran «Sin control de stock», nunca disponibilidad ilimitada afirmada. |
| P-07 | Entradas y ajustes son movimientos enteros auditados con motivo, usuario y hora. Ajustar significa sumar/restar una cantidad; no sobrescribir el saldo leído en una pantalla. Ningún movimiento deja saldo negativo. Las tandas enteras de pollo se convierten en 4 octavos de cada parte por pollo; ajustes admiten octavos por parte. |
| P-08 | Desactivar el control exige confirmación y motivo; conserva saldo e historial y deja visible que ya no se comprueba disponibilidad. Reactivar conserva las bebidas y el saldo del pollo de la fecha operativa vigente. No se permite borrar movimientos ni editar su pasado. |

Fuera de alcance: inventario de pollo crudo, producción/recetas de refrescos, insumos, costos y rentabilidad, proveedores, reservas de carrito, reposición automática por anulación, división/pagos mixtos, caja avanzada, reportes comerciales, SUNAT, delivery y hardware de impresión. No agregar dependencias.

## 3. Dominio y consumo

- Enteros entre 0 y 2147483647 para saldos; deltas enteros con resultado dentro de rango. Comprobar multiplicaciones y acumulaciones antes de persistir, sin truncar ni usar floats. Entrada de pollos: 1…10000; bebida por movimiento: 1…100000 unidades; ajuste por recurso: -100000…100000, distinto de cero y con motivo de 1…200 caracteres recortado. Los topes operativos son parte de esta propuesta.
- El pollo se calcula usando `chickenConsumption` y los octavos resueltos por la 010, incluyendo distribución configurable de medio pollo. En el pollo directo, `resolveItem` ya multiplica los octavos por `item.quantity`: consumir esos valores sin volver a multiplicar. En un combo, cada componente ya multiplica sus octavos por la cantidad del componente, pero no por la cantidad de combos: consumir `cantidad de combos × suma de octavos de sus componentes`. No sumar además los octavos agregados del padre, que duplicarían el consumo. Esta diferencia vigente exige regresiones con cantidades mayores a uno en ambos caminos.
- Bebida directa: cantidad de línea. Bebida componente: cantidad del combo por cantidad del componente. Acumular un mismo recurso si aparece varias veces, en un combo y como línea suelta o en varios combos.
- Las cremas, extras y platos sin receta no descuentan inventario de esta entrega. No suponer consumo de pollo por el nombre del producto. Los componentes chicken sí descuentan según sus datos resueltos.
- Un envío es indivisible: si falta cualquier recurso controlado, no se crea ítem, comanda, movimiento, impresión durable ni registro de respuesta de idempotencia. Los productos sin control no evitan comprobar los que sí lo tienen.
- Reintentar un envío comprometido devuelve su 201 original antes de evaluar el stock actual, aunque haya cambiado el día, la carta o la activación. Clave distinta intenta una venta nueva y comprueba saldo.
- Mover, unir o separar mesas, pedir cuenta, marcar listo/servido y cobrar no cambian movimientos de inventario. La política de anulación se fija con P-02.

## 4. Datos y transacciones

Modelo a concretar en S-01 tras aprobar las reglas:

- Configuración persistente de activación de pollo y bebidas por producto, separada de los schemas estrictos existentes de Product y Menu.
- Recursos de inventario: pecho, pierna y bebida por productId. Saldo único por recurso/periodo; para pollo el periodo será la fecha operativa aprobada y para bebidas será permanente. Conservar FKs y CHECKs de enteros/rango/no negativos.
- Movimientos inmutables: recurso/periodo, delta, saldo resultante, tipo (tanda, entrada, ajuste o consumo), motivo, usuario/hora y referencia a la comanda para consumo. Guardar valores necesarios para no reinterpretar el pasado si cambia la carta.
- Registro idempotente para comandos administrativos, con ruta/cuerpo normalizados, hash y respuesta original. No forzar estos comandos en la tabla antigua `idempotency_keys`, que exige pedido; decidir un registro propio en S-01.
- Migración reversible, sin pagos/stock retroactivos ni alteración de pedidos históricos. No insertar existencias demo en producción automáticamente. Los fixtures activan explícitamente solo sus recursos.

Consumo y movimientos viven en la transacción existente de `sendItems`, después de validar/resolver el pedido y antes del commit. Tomar locks de configuración/saldos de forma determinista por recurso; documentar el orden completo frente a pedido, claves, catálogo y mesas. Las operaciones administrativas de inventario no deben adquirir después locks de pedido que inviertan el orden. Saldo/movimiento/tanda/impresión/replay se comprometen juntos o revierten juntos. La impresión física sigue fuera de la transacción.

Leer configuración y saldos relevantes en una vista consistente para disponibilidad. Una lectura GET no crea saldos ni cambia la fecha operativa. Una fila inexistente equivale a cero solo si el control está activo. El envío decide la fecha una sola vez mediante reloj del servidor en America/Lima, no la fecha del dispositivo. No dejar procesos nocturnos necesarios para la corrección.

## 5. API y compatibilidad propuestas

No cambiar todavía `docs/api/openapi.yaml`: contrato formal después de aprobar la spec. Propuesta de operaciones:

| Ruta | Roles | Función |
| --- | --- | --- |
| GET /inventory | admin | Estado actual del control y saldos, con fecha operativa. |
| GET /inventory/availability | waiter/admin | Recursos controlados y saldos para la carta; no expone ajustes, motivos ni usuarios. |
| GET /inventory/movements?afterId=N | admin | Historial paginado estable, sin borrar/editar movimientos. |
| PUT /inventory/chicken/control | admin | Activar/desactivar con motivo y clave idempotente. |
| PUT /inventory/drinks/{productId}/control | admin | Activar/desactivar una bebida con motivo y clave. |
| POST /inventory/chicken/batches | admin | Registrar una tanda de pollos y ambos movimientos en una transacción. |
| POST /inventory/drinks/{productId}/receipts | admin | Registrar entrada por unidad. |
| POST /inventory/adjustments | admin | Ajuste de un recurso con delta/motivo y clave, nunca saldo negativo. |

Todas protegidas por sesión actual; roles releídos, ids/query/body/clave estrictos y `Cache-Control: no-store` en éxito/error. No permitir al cajero o cocina ajustar por tener acceso al área. Todas las escrituras administrativas requieren Idempotency-Key: misma ruta/cuerpo devuelve la respuesta original; reutilización incompatible responde 409 sin mutar.

`POST /orders/{orderId}/items` conserva su cuerpo/201 actual y agrega un error 409 de stock insuficiente con recursos faltantes, disponible y requerido; no aceptar cantidades/consumos calculados por el cliente como autoridad. Definir también error de consumo de pollo sin configurar, desbordamiento e idempotencia administrativa en S-01. No agregar campos a Product/Order/Payment/Menu que rompan schemas previos.

La disponibilidad es informativa y puede cambiar entre lectura/envío: la API vuelve a comprobarla con locks. Un error al leerla se muestra como desconocida y no como stock cero ni suficiente; puede reintentarse. La decisión final sigue siendo del servidor.

## 6. Interfaz prevista

Conservar FigCraft azul, Nunito, navegación existente, controles táctiles y Motion ya instalado con reduced motion. Cargar las skills de frontend del proyecto antes de trabajar en UI.

- Administración: acceso «Inventario», fecha visible, pollo disponible por parte (octavos y equivalencia legible), bebidas por unidades, registrar tanda/entrada, ajustes con motivo e historial paginado. Evitar que «saldo actual» parezca una entrada que se pueda sobrescribir.
- Confirmación para desactivar control y advertencia de sus efectos. Reintento de escritura tras error de red conserva clave/cuerpo; doble clic no duplica movimientos.
- Mozo: existencias en carta, aviso agotado y bloqueo de opciones/cantidades que exceden disponibilidad conocida. El carrito conserva borrador al refrescar. Un faltante al enviar conserva el carrito y actualiza existencias; no reintenta el envío con una clave nueva automáticamente.
- Consultar todas las existencias necesarias para combos y distribución de medios; no bloquear todo el pollo cuando solo se agotó una parte. Las opciones sin consumo definido explican qué debe configurar el administrador.
- Polling solo visible y al recuperar foco, sin remontar formularios. Carga/error/vacío/401/403, foco visible, labels/unidades claros, sin overflow a 360/768/1440. No depender únicamente del color para indicar agotado.

## 7. Criterios de aceptación propuestos

| AC | Evidencia requerida |
| --- | --- |
| AC-01 | Migración up/down/re-up, constraints/FKs/unicidad y activación deshabilitada por defecto; sin backfill ni cambios en schemas previos. |
| AC-02 | Tandas y ajustes convierten enteros correctamente: 10 pollos → 40/40; validación de rango, motivo y no negativos; rollback de ambos recursos. |
| AC-03 | Bebidas por unidad; entradas repetidas con misma clave no duplican; saldos independientes por producto y permanentes entre fechas. |
| AC-04 | Consumo de todas las presentaciones/partes, medio configurable, combos repetidos y recurso compartido entre líneas; sin doble suma ni floats. |
| AC-05 | Un faltante en cualquier recurso revierte ítems, comanda, impresión durable, movimientos, saldos y replay; pedido previo intacto. |
| AC-06 | Dos mozos compiten por la última porción/bebida: solo un envío gana; stock nunca negativo. Correr además entrada/ajuste/activación simultáneos sin deadlocks no resueltos. |
| AC-07 | Replay de envío y de comando administrativo conserva la respuesta original y no descuenta/acredita otra vez; clave incompatible rechazada; pérdida de ACK real. |
| AC-08 | Fallos inyectados de saldo/movimiento/ítem/impresión durable/replay revierten toda la transacción y permiten reintento. |
| AC-09 | Fecha America/Lima y frontera operativa aprobada: pollo del nuevo periodo inicia cero sin borrar historial; bebidas conservan saldo; reloj cliente no decide. |
| AC-10 | Política P-02 en anulación directa/solicitud/aprobación/rechazo; mover/unir/separar/cobrar no descuentan otra vez. Pedidos anteriores a activación no se reconstruyen. |
| AC-11 | Sesión/roles/revocación, no-store, schemas estrictos, lectura del mozo sin datos de auditoría y rechazo de ajustes de cajero/cocina. |
| AC-12 | Activación/desactivación explícita y auditada; sin control visible, sin omitir silenciosamente pollo de consumo indefinido; idempotencia y carrera con envío. |
| AC-13 | UI admin: tanda, entrada, ajuste, historial y confirmación de desactivación; revisión, foco, unidades, doble clic/reintento y borradores estables. |
| AC-14 | UI mozo: disponibilidad por parte y bebida/combos, agotados, cambios concurrentes, conservación del carrito y estados desconocido/error; responsive y reduced motion. |
| AC-15 | E2E real: admin ingresa existencias, mozo envía mezcla, caja cobra sin nuevo descuento; otro mozo encuentra agotado. Segundo recorrido móvil con pérdida de respuesta y reintento sin duplicación. |

## 8. Decisiones que faltan antes de programar

1. P-02 confirmada: anulación sin devolución automática y devolución física manual con motivo. Conservar la evidencia del usuario; no volver a preguntar.
2. Confirmar P-03 y el corte del pollo: medianoche de Lima o una hora posterior si el local atiende de madrugada. Las bebidas conservan su saldo.
3. Aprobar este primer alcance, incluida la activación explícita sin stock histórico. Si se prefiere completar caja avanzada antes de inventario, se debe cambiar la 015 antes del contrato/tests.

## 9. Metodología y cierre

Principal: spec/contrato/docs/revisión/verificación. Test-writer: GPT-6-luna medium. Implementación sencilla/UI: GPT-6-luna medium; transacciones, stock y concurrencia: GPT-6.1-sol medium, nunca dos implementadores simultáneos. Sin reviewer ni ronda adversarial independientes; conservar las regresiones existentes. No sustituir Luna por cuota sin autorización.

Tras aprobación: contrato pendiente → rojo pequeño → implementación mínima → revisión → checks completos. Cobertura con los umbrales existentes, tipos/lint/build, QA visual y E2E serializados con DB. Solo polleria_test autorizada; no crear bases/roles ni migrar polleria_dev. Commits separados por rol; integración de 015 en main requiere autorización posterior.
