# Interfaz 016 — Ventas cobradas

Plan previo a UI, 2026-10-18. Spec aprobada; no constituye implementación ni QA. Skills leídas: frontend-design, web-design-guidelines y ui-ux-pro-max del proyecto. Mantener la dirección FigCraft de las pantallas015/014; design-taste-frontend no aplica a este panel operativo.

## Dirección y jerarquía

El dueño quiere conciliar lo cobrado y entender qué se vendió. La fecha y el total mandan; el desglose permite explicar ese total. Sin hero comercial, claims, fondos decorativos, nuevas fuentes ni tipografía de código.

- Paleta existente: fondo `#EFF8FF`, superficie `#FFFFFF`, primario `#3B82F6`, apoyo `#60A5FA`, texto `#1E3A8A`. Usar tokens existentes; no inventar otra paleta. Foco y contraste se verifican sobre estilos realmente renderizados.
- Nunito local, encabezado y navegación existentes. Cifras con tabular-nums, importes alineados al final y texto al inicio. Fechas/unidades visibles; formato exacto formatCashierSoles o formatSoles compartido, nunca división float para dinero.
- Una cabecera compacta con título, fecha y actualizar. Resumen horizontal con total y número de cobros, sin repetir todo en tarjetas idénticas. Debajo cuatro medios y detalle de horas/productos/autores en secciones con encabezados propios.
- Móvil: cabecera apilada y controles táctiles de48px. Resumen puede apilarse; tablas dentro de contenedores accesibles si necesitan desplazamiento interno. No permitir desbordamiento del documento, nombres cortados o botones con texto comprimido. El mayor importe seguro y nombres largos entran en la QA.

```text
Ventas cobradas                      [Fecha] [Actualizar]
18 de octubre · America/Lima          Actualizado 11:30

Total cobrado S/ 421,00                 18 cobros
Efectivo         Yape          Plin           Tarjeta
S/ 221,00        S/ 100,00      S/ 0,00        S/ 100,00

Productos y presentaciones          Por usuario que registró
Producto / presentación | Cant | S/  Nombre             | S/
Cuarto pierna           | 10   |170  Ana                |221
Combo familiar          |  5   |125  Luis               |200

Por hora (Lima)
Hora | Cobros | Total                24 horas, ceros incluidos
```

Cada desglose conserva el total íntegro; no ocultar filas bajo un top10. En producto, presentación y parte son texto comprensible («Cuarto», «Pierna»), no códigos internos ni cantidades interpretadas como pollos enteros. La sección de autores explica que atribuye cada línea a quien la registró; no promete un nombre histórico que014 no guardó.

## Datos, errores e interacción

- RoleGuard admin y enlace Reportes desde Administración. Cliente y puertos exactos en contract.md.
- Primera consulta sin fecha: el servidor decide hoy en Lima y devuelve date. Las consultas posteriores usan la fecha elegida; no tomar el día del navegador como autoridad. El campo tiene label visible y error cercano para fecha inválida.
- Query key incorpora la fecha; respuestas tardías de otro día no pisan la selección actual. No presentar datos de la fecha anterior bajo el nuevo encabezado. Mientras carga, estado explícito sin convertirlo en cero ventas. Error recuperable con reintento;401/403 según patrón existente y sin conservar información sensible visible.
- Vacío real: «No se registraron cobros en esta fecha» con total cero. Error de red/datos inválidos no equivale a día vacío. «Actualizar» repite la consulta, no crea pagos ni movimientos.
- Motion existente solo para feedback breve que ayude a identificar el cambio; respetar MotionConfig reducedMotion user. No animar cada cifra/tabla, tamaño ni layout de manera continua.
- HTML semántico: h1 único para la página, h2 para secciones, caption/th/scope en tablas; nombres accesibles, foco visible y avisos de carga/error. Evitar otro main anidado. No trasladar al usuario instrucciones de implementación, claves, snapshots oSQL.

## Riesgos conocidos del CSS existente

La015 encontró un selector global `.workspace-main [class*='grid-cols-2']` que fuerza dos columnas en móvil. Usar clases específicas de reportes y comprobar estilos calculados; no corregir selectores globales por comodidad. Contenedores con min-width:0, texto largo ajustable y botones con altura adaptable. La navegación fija inferior no tapa los últimos datos al hacer scroll.

## Consulta de skills y ajuste al brief

La búsqueda design-system «sales reporting dashboard» devolvió hero/features/CTA y Fira: patrón inaplicable, no adoptado ni persistido. Reintento explícito `analytics dashboard --domain product` sí devolvió Analytics Dashboard y contenido denso/comparativo. Se adopta la jerarquía orientada a datos, conservando paleta/Nunito aprobadas y sin añadir mapas de calor o filtros que no pide la spec.

La búsqueda de stack `table responsive numeric data --stack nextjs` no ofreció una regla útil de tablas; sus recomendaciones de imágenes/NextResponse no aplican a esta pantalla con Express/TanStack. La consulta `accessible data table --domain ux` verificó Table Handling: contenedor con scroll interno o disposición adaptable, nunca romper viewport; también nombres accesibles. No se cambió la arquitectura ni se instalaron dependencias por esos resultados.

Antes de revisar código/UI, consultar de nuevo [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md). Usar [Motion accessibility](https://motion.dev/docs/react-accessibility) si hace falta contexto nuevo; el provider de movimiento reducido ya existe. QA final a360/768/1440, capturas con fixtures y un E2E real relevante; no duplicar todo el flujo por tamaño ni escribir pruebas de clases/colores.
