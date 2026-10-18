# 016 — Reporte diario de ventas cobradas

Fecha: 2026-10-18. Fase 6 del prototipo; RF-25 y desglose por medio de pago de RF-26.

**Estado: alcance aprobado por el usuario el 2026-10-18.** Confirmó implementar este reporte mediante la pregunta de alcance. Comienza S-01/T-01; todavía sin producción ni resultados verdes. No implica implementar caja avanzada ni volver a descontar inventario.

**Prioridad posterior del usuario:** posponer diseño hasta el final. Para016 se entrega interfaz funcional con componentes existentes; no rediseño, animaciones nuevas ni comparación visual360/768/1440. Se conservan acceso, labels/foco, estados y E2E funcional. Esta decisión sustituye el pulido visual previsto debajo y en ui-plan.md; no deshace la interfaz015 ya integrada.

## Resultado

El administrador consulta cuánto se cobró en una fecha del local, por qué medios, a qué horas, qué presentaciones se vendieron y quién registró esos ítems. La pantalla se titula «Ventas cobradas» y expresa importes en soles. Consultar un reporte no modifica pagos, pedidos, inventario ni comandas.

Ejemplo: una mesa abierta el lunes y cobrada el martes a las00:10 de Lima se incluye el martes. Un efectivo de S/30 con vuelto de S/9 suma S/21 en ventas, no S/30. Si dos mozos registraron líneas de S/17 y S/4 del mismo pago, se atribuye ese importe a cada autor; no se adjudica todo al creador de la mesa o al cajero.

## Decisiones propuestas

| ID   | Comportamiento                                                                                                                                                                                                                                                                                                                                                       |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-01 | Solo administrador, incluidas las consultas directas de API. Cajero, mozo y cocina sin rol admin no acceden. Roles y estado activo se releen en servicio.                                                                                                                                                                                                            |
| P-02 | Una fecha de calendario por consulta, en America/Lima. Sin fecha se usa hoy según reloj del servidor; una fecha válida sin ventas devuelve cero. Fechas inexistentes y query extra/repetida se rechazan.                                                                                                                                                             |
| P-03 | La fecha y hora corresponden a paidAt. Solo pagos confirmados persistidos; pedidos abiertos, cancelados, fusionados sin pago y anulaciones no cobradas no generan ventas. Un replay no suma otro pago.                                                                                                                                                               |
| P-04 | Total y medios suman amountCents. receivedCents y changeCents no son ingresos adicionales. Cuatro medios actuales: efectivo, Yape, Plin y tarjeta. Sin redondear ni calcular dinero con float.                                                                                                                                                                       |
| P-05 | Precios, cantidades, nombres y presentaciones provienen del snapshot del pago, no de la carta actual. Recategorizar, renombrar o cambiar precios después no altera esas ventas.                                                                                                                                                                                      |
| P-06 | Productos agrupados por id, nombre/categoría históricos, presentación y parte. Cantidad significa unidades de esa presentación: dos cuartos no se muestran como dos pollos enteros. Combos cuentan como venta del combo; sus componentes no vuelven a sumarse. Cremas cobradas se incluyen en el importe de su línea, sin multiplicar otra vez su cantidad resuelta. |
| P-07 | «Ventas por usuario que registró los ítems»: cada línea y sus cremas se atribuyen a OrderItem.createdByUserId, incluso tras mover/unir/separar pedidos. Incluye administradores que atendieron pedidos y usuarios ahora inactivos. Se muestra su nombre actual como etiqueta; el snapshot014 no guardó el nombre histórico del mozo.                                 |
| P-08 | El total por horas, medios, productos y autores coincide con el total cobrado. No contar un pedido completo varias veces cuando participaron distintos mozos. No ocultar filas ni truncar importes para hacer cuadrar el reporte.                                                                                                                                    |
| P-09 | Lectura consistente frente a un cobro simultáneo: el reporte puede quedar antes o después del commit, nunca mezclar cabecera y detalles parciales. Datos históricos incompatibles o sumas fuera del entero seguro producen error explícito, no resultados parciales.                                                                                                 |

## Alcance de interfaz y API

- Enlace «Reportes» en Administración y página `/admin/reportes`. Fecha, total cobrado y número de pagos; cuatro medios,24 horas, tabla de presentaciones e importes por autor. Tablas y estados vacíos legibles a360/768/1440, estilo FigCraft azul/Nunito y Motion existente con movimiento reducido.
- Selector de fecha y actualizar manualmente. No mostrar totales antiguos como si pertenecieran a una fecha recién seleccionada; cancelar/ignorar respuestas tardías de otra fecha. Error recuperable, carga y401/403 conforme a pantallas existentes.
- `GET /reports/daily-sales?date=YYYY-MM-DD`, admin, `Cache-Control: no-store` también en errores. Una respuesta coherente incluye todas las secciones; sin endpoints que escriban datos ni dependencias nuevas. Contrato de campos en contract.md; OpenAPI se amplía en S-01 tras aprobación.
- Una consulta devuelve todos los grupos del día, ordenados de forma estable. No limitar silenciosamente a un top10 que impida conciliar el total.

Fuera: rangos de fechas, exportación Excel/PDF, ticket fiscal, caja/apertura/cierre, pagos mixtos, devoluciones, descuentos, rentabilidad/costos, propinas, stock mínimo, merma inferida desde saldo, recetas/insumos, delivery y hardware. El saldo permanente de015 no permite llamar «merma» a la diferencia entre lo asado hoy y el saldo actual.

## Criterios de aceptación

| AC    | Evidencia útil                                                                                                                                                                                                                                          |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-01 | Autenticación, roles actuales/revocación y no-store en éxito y error; sin exposición a otros roles.                                                                                                                                                     |
| AC-02 | Día y24 horas de Lima: límites05:00Z/04:59:59.999Z actuales, pedido abierto antes y pagado después, fecha válida/vacía y calendario inválido; independiente de zona del equipo.                                                                         |
| AC-03 | Totales enteros y conteos por cuatro medios; efectivo recibido/vuelto no inflan ventas, replay no duplica; sin ventas da ceros coherentes.                                                                                                              |
| AC-04 | Snapshot conserva precios/nombres/categorías; cantidades mayores a1, presentaciones distintas, combo con componentes y cremas resueltas sin doble suma.                                                                                                 |
| AC-05 | Atribución por creador de línea con dos mozos y pedidos movidos/unidos/separados; usuarios inactivos incluidos, sin adjudicar todo al cajero o autor del pedido.                                                                                        |
| AC-06 | Las cuatro descomposiciones concilian con el total y el conteo de horas/medios con el número de pagos; no truncar ni perder precisión; rechazo explícito de datos inconsistentes.                                                                       |
| AC-07 | Cobro concurrente y lectura consistente; consultar repetidamente no muta pagos/pedidos/stock/impresión. Regresión dirigida014/015 solo pertinente.                                                                                                      |
| AC-08 | UI carga/vacío/error, fecha y respuestas tardías, cantidades/unidades y acceso admin; foco, labels y responsive.                                                                                                                                        |
| AC-09 | E2E crítico: venta real con efectivo/vuelto y otra digital, consulta admin y conciliación de totales; segunda fecha vacía. Una ejecución funcional pertinente. Comparación/pulido visual móvil/tablet/desktop pospuestos por el usuario hasta el final. |

## Metodología

Principal redacta/revisa/documenta. Test-writer Luna medium; implementer Sol6.1 medium para agregación monetaria/permisos/consistencia y Luna medium para UI, secuencialmente. Sin agentes para esperar, sin reviewer independiente, sin repetir verdes del mismo código. Pruebas dirigidas por bloque; una global con cobertura, tipos/lint/build y E2E pertinente al cerrar. Solo polleria_test mediante wrapper protegido; no tocar polleria_dev ni crear bases/roles. Commits separados por rol y autorización posterior para integrar016 a main.
