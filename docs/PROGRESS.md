# Progreso del proyecto — Sistema Pollería

## 014 implementada y validada — 2026-10-16

- Dev integrado y publicado en main por autorización del usuario: merge `5e452c0`. El desarrollo nuevo está en `feat/014-cashier-payments`, sin integrar cobros a main.
- S-01…C-01 completados: schemas/dinero en soles, pre-cuenta/token, migración/modelo Payment, cierre transaccional/replay, cuatro endpoints, lista paginada/polling, confirmación/reintento, histórico e impresión manual. Validado con PostgreSQL17.5/polleria_test del usuario; ningún cambio en polleria_dev.
- Principal verificó regresión sin DB: 92 archivos, 2076 pruebas aprobadas y 3 fallos esperados existentes. Controller 8/8 adicional; dirigido cliente/componentes/controller 28/28. Builds Turbopack y Webpack aprobados; caché antigua preservada fuera de ruta activa para resolver fallo inicial de PostCSS.
- QA visual con fixtures interceptadas: 11 capturas a360/768/1440, sin overflow/pageerrors; foco/cancelación y retry con misma clave/cuerpo aprobados. Hoja print sin controles. Evidencia en docs/specs/014-cashier-payments/verification.md y qa/.
- Cierre:149 archivos/2880 pruebas aprobadas,5 fallos esperados previos separados; cobertura de líneas96,71 %, shared99,32 %, servicios de pagos90,62 %. Umbrales existentes sin cambios. Integración dirigida014:42/42. E2E reales:30 aprobados/14 no aplicables en ejecuciones serializadas separadas. Tipos/lint globales y builds Turbopack/Webpack aprobados. OpenAPI0.11:cuatro operaciones implemented,598 referencias verificadas.
- Copia real del usuario: `C:\Users\braya\Desktop\proyectos1\polleria - copia`, permanece limpia en main. Se leyó exclusivamente DATABASE_URL_TEST de su .env sin copiar credenciales. Sus cuatro commits locales y pruebas se preservaron en la rama014 con merge `a06b4df`; conflictos de tests y fixtures antiguos conciliados. No se crearon bases/roles.
- Siguiente paso: revisión del usuario de `feat/014-cashier-payments`; no integrar014 a main/dev sin autorización posterior. Sin prueba física, integración bancaria, pagos parciales/mixtos, caja avanzada ni comprobante fiscal. Evidencia detallada en verification.md de014.
- Usuario reemplazó Luna por GPT-6.1-sol low para test-writer/trabajo sencillo. Implementación compleja mantiene6.1-sol medium. Principal mantiene docs/contrato y revisión; sin reviewer ni adversarial independientes. Ver AGENTS.md y docs/agents/modelos-codex.md.

## Actualización — 2026-10-16

El usuario autorizó integrar todo dev en main y continuar la 014. El rediseño azul, demo y corrección SSR quedan integrados; las notas inferiores sobre separación de ramas y prohibición de integrar son históricas. La 014 tiene spec aprobada y continúa con contrato y TDD en su rama de funcionalidad; su implementación aún no está autorizada para integrar a main.

## Rediseño FigCraft azul — dev, 2026-10-15

- Solicitud del usuario: continuar en dev usando diseños/colorimetría del documento polleria en FigCraft y Motion. Implementado en frontend; fuente visual y capturas en docs/ui-figcraft, alcance en docs/specs/dev-figcraft-blue.
- Paleta #EFF8FF/#3B82F6/#60A5FA/#1E3A8A y Nunito local. Cabecera superior desktop, navegación inferior móvil/tablet, mesas en dos columnas, carta con categorías/buscador/productos/resumen, fotos originales locales y acceso/PIN adaptado.
- Motion14.3.0 y @fontsource-variable/nunito5.3.0 exactos. Movimiento reducido configurado; interacción breve sin retener el editor anterior ni remontar formularios por polling. ADR0003.
- Separación de roles conservada: Luna escribió pruebas e inició implementación; tras agotarse su cuota, el usuario autorizó explícitamente completar con implementer GPT-6.1-sol medium. Principal revisó/verificó; sin reviewer/adversarial independiente.
- Evidencia:738/738 pruebas web en42 archivos;116 pruebas dirigidas tras ajustes de markup, tipos globales, lint/formato y build aprobados. QA final passed en design-qa.md; recorrido Playwright con Chrome instalado autorizado por el usuario, 14 capturas a360/390/768/1024/1440, cero pageerrors y sin overflow. Mock de16 rutas validado contra schemas, sin DB real.
- No se ejecutó cobertura global ni suites API/DB para este cambio visual. Los cambios de setup MotionConfig precedieron su nueva regresión; no se reconstruye rojo retrospectivo. Búsqueda/filtro sí partió de rojo causal documentado.
- Los módulos funcionales existentes y reglas de permisos/dinero/idempotencia permanecen; no se implementan pagos014, inventario, reportes ni impresión física. No integrar main. Próximo paso: revisión del diseño con el usuario y recorrido con su API/BD real según PROBAR-DEMO.md.

Lo mantiene el orquestador. Se actualiza al final de cada paso del ciclo.
Para retomar el trabajo en una conversación nueva, leer primero docs/CONTINUAR.md (contexto completo y siguiente acción exacta).

## Estado vigente y punto de reanudación — 2026-10-15

**La documentación aprobada de la spec 014 está integrada en main. El cobro todavía NO está implementado.** El usuario autorizó esta integración documental el 2026-10-15. Merge de la rama feat/014-cashier-payments: `40c4631` (origen documental `62e0243`). No confundir publicar la spec con completar la funcionalidad.

| Entrega                                                | Estado real al corte                                                        | Ubicación                                                                                         |
| ------------------------------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Funcionalidades 001…013                                | Implementadas; 013 validada con driver file, sin prueba de impresora física | main                                                                                              |
| 014: spec, P-01…P-07 y 15 AC                           | Aprobados e integrados como documentación                                   | [spec](specs/014-cashier-payments/spec.md), [tareas](specs/014-cashier-payments/tasks.md) en main |
| 014: contrato, pruebas, migración, backend y UI        | Pendientes; ningún pago funcional ni endpoints nuevos de Caja               | Siguiente desarrollo                                                                              |
| Datos demo, rediseño visual y corrección SSR del build | Publicados en dev, sin integrar a main                                      | dev, rediseño `18f4b4f`                                                                           |
| Brief completo para app flow/task flows/UI UX          | Publicado en dev, 27 RF, 14 RNF, 21 task flows y 28 superficies             | dev, `9f6ad9e`                                                                                    |
| Inventario, reportes, caja avanzada, delivery y SUNAT  | Futuros; no presentarlos como implementados                                 | Planificación y specs futuras                                                                     |

### Decisiones que no hay que volver a preguntar

- Primer bloque 014: pre-cuenta imprimible mediante navegador, pago completo con **un medio** (efectivo/Yape/Plin/tarjeta) y cierre transaccional que libera todas las mesas del pedido.
- Pantallas, formularios y pre-cuentas en **soles con decimales**. Ejemplo: total S/ 21,00, recibido S/ 30,00, vuelto S/ 9,00; se acepta 21.5 o 21,5. Céntimos enteros solo en representación/cálculo internos.
- Cobrar no exige solicitud previa de cuenta; una anulación pendiente bloquea el cobro. Medios electrónicos se confirman manualmente, sin conexión bancaria. Imprimir pre-cuenta no paga ni genera comanda.
- Pagos mixtos/parciales, división, apertura/cierre de caja, ticket de venta, descuentos, devoluciones y reapertura no pertenecen a esta entrega. No ampliar su alcance por un mockup de diseño.

### Siguiente acción exacta para otro chat

1. Leer AGENTS.md, CLAUDE.md, este estado, la spec 014 y tasks.md. No considerar cerrada ninguna tarea de implementación de 014.
2. Retomar **S-01**: completar/verificar contrato OpenAPI 0.11.0 con estado pending, esquemas y errores antes de TDD. La excepción de impresión manual ya consta en CLAUDE.md; el contrato actual sigue en 0.10.0.
3. Continuar T-01 → I-01 y siguientes bloques rojo → verde → revisión, conservando todos los AC. Principal mantiene docs/contrato; test-writer gpt-6-luna medium; implementer gpt-6.1-sol medium para pagos/transacciones/concurrencia y gpt-6-luna medium para UI sencilla. Sin reviewer/adversarial independientes.
4. Desarrollar en rama de funcionalidad desde main actualizado; si se reutiliza la rama 014, incorporar primero el main vigente. La integración documental autorizada aquí no autoriza futuras integraciones de implementación a main. No incorporar automáticamente todo dev.
5. Validar con DB aislada _test y serializar suites que la usan. No ejecutar migraciones de cobro sobre la base de desarrollo del usuario para probar la funcionalidad.

### Trabajo de diseño y diferencia entre ramas

El usuario dejó el nuevo diseño colaborativo para otra conversación. Referencia solicitada: POS verde/menta con carta y pedido lateral; archivo Figma polleria `AFptvrcQPGhNiFTPUy55Pj`, mediante FigCraft si está disponible. Acceso/edición no verificados; no afirmar que hay diseños editados en Figma.

Material para esa sesión, **en dev**: [brief de diseño y flujos](https://github.com/brayanAndy1996/polleria-1/blob/dev/docs/BRIEF-DISENO-FLOWS-UI-UX.md), [guía de demo](https://github.com/brayanAndy1996/polleria-1/blob/dev/docs/PROBAR-DEMO.md) y [capturas](https://github.com/brayanAndy1996/polleria-1/blob/dev/docs/ui-redesign/README.md). Main conserva la interfaz anterior y su deuda SSR; la corrección getServerSnapshot pertenece al rediseño de dev. Esta integración solo trae documentación de 014, sin demo ni rediseño.

Verificación de esta actualización: revisión del diff, enlaces locales y formato de Markdown; sin cambios de producción ni nuevas pruebas de aplicación. Los resultados de suites indicados más abajo son evidencia histórica de sus entregas, no de una implementación de 014.

## Validación de 013 y flujo reducido — 2026-10-13 (histórico)
## Rediseño de interfaz — dev, 2026-10-13

- Prioridad solicitada por el usuario tras probar dev. Instalados y versionados frontend-design, web-design-guidelines y ui-ux-pro-max en .agents/skills/ con skills-lock.json. Alcance: docs/specs/dev-ui-redesign/spec.md; comparación visual: docs/ui-redesign/README.md.
- Interfaz renovada: acceso/PIN, navegación por áreas, salón, pedido/carrito, administración y estados de caja/cocina. Navegación lateral en PC, cabecera compacta en móvil, mesas legibles, controles táctiles, foco visible y salto al contenido. Sin dependencias nuevas ni cambios de API/BD/dinero; caja/cocina conservan el alcance funcional existente.
- TDD con los dos roles Luna medium; revisión del principal con las tres skills, capturas reales a 360/768/1440 px, sin desbordamiento horizontal ni errores de página en el recorrido. Se verificaron acceso por teclado y contraste de acciones. Sin auditoría independiente ni nueva cobertura global/API.
- Build de producción corregido: primary-instance proporciona getServerSnapshot determinista. La deuda SSR documentada en los cortes históricos de abajo queda resuelta por esta entrega.
- La spec 014 sigue aprobada en feat/014-cashier-payments (62e0243), pendiente de contrato/tests/implementación. UI siempre en soles con decimales; cálculos internos en enteros de céntimos. Retomar ese bloque después de revisar el diseño; no está incluido en dev.
- Entrega integrada en dev; main permanece sin integrar este rediseño. Verificación final: 734/734 pruebas web (41 archivos), 28 E2E aprobados/12 omitidos, build de producción, tipos, lint y formato aprobados. Evidencia y capturas: docs/ui-redesign/README.md.

## Preparación de demo — rama dev, 2026-10-13

- Solicitada por el usuario para probar una BD local vacía; rama dev creada desde main c3021d2. Guía: docs/PROBAR-DEMO.md; requisitos: docs/specs/dev-demo/spec.md. No integra Caja ni altera main.
- Nuevo pnpm db:demo: exige development antes de conectar, aplica migraciones y seed explícito con cuatro usuarios/roles, seis mesas y seis productos con presentaciones/mostrito. Solo inserta faltantes; carga transaccional y reintento, conserva existentes. PIN públicos exclusivos de demo; no guardar conexiones en Git.
- Checks dirigidos: 32/32 (demo, CLI, migrador y lock); tipos API, lint y formato pasan. No se reejecutó suite completa/cobertura/E2E para esta preparación de datos. Rojo inicial causal por ausencia del módulo; sin atribuir assertions ejecutadas en esa colección fallida.
- Principal ejecutó el comando real dos veces en polleria_dev del entorno: migración 013 y seed aplicados, segunda corrida sin pendientes; login admin y lectura de seis productos/seis mesas aprobados, logout posterior. La BD de la PC del usuario no es accesible desde aquí: debe crear polleria_dev en PostgreSQL si falta, configurar su .env y ejecutar la guía.
- Siguiente desarrollo funcional sigue siendo spec 014 de Caja. Preparación demo no crea cobros, stock ni pedidos ficticios.

## Estado actual del flujo reducido — 2026-10-13

- Metodología aprobada y aplicada en AGENTS.md, CLAUDE.md y docs/agents/: principal mantiene specs/contrato y revisa; test-writer Luna medium; único implementer Luna medium para UI y gpt-6.1-sol medium para transacciones/recuperación. Sin rondas independientes de adversarial-tester/reviewer; conservar regresiones existentes y los 14 AC.
- 013 INTEGRADA a main el 2026-10-13 con autorización del usuario, merge df19019 (sin conflictos). Commits de cierre: a5055f5 (tests) y 2c99b61 (producción). No se migró polleria_dev ni se modificó el .env del usuario durante la validación.
- Verificación completa del principal: Vitest con cobertura, 132 archivos aprobados, 2631 pruebas aprobadas, 4 fallos esperados y 2 omitidas; líneas globales 97,23 %, umbrales del proyecto cumplidos. Lint global, formato, tipos de raíz/API/shared/web y 501 referencias locales de OpenAPI 0.10.0 pasan.
- E2E: 24 recorridos anteriores aprobados y 12 no aplicables al proyecto seleccionado; los cuatro recorridos nuevos (dos casos × desktop/mobile) aprobados en repetición tras corregir selectores/literales de sus pruebas. Total validado en ejecuciones separadas: 28 aprobados y 12 omitidos. Chromium del sistema 154.0.8037.57 mediante wrapper externo, carpeta temporal /tmp/polleria-013-e2e; no se afirma validación con Chromium empaquetado.
- Revisión principal detectó y corrigió arranque del dispatcher sin guardia inicial, estado pendiente permanente tras copia y páginas de atención obsoletas; regresiones conservadas. Pruebas críticas incluyen pérdida real del lock, cierre con salida pendiente, ACK perdido, páginas parciales, permisos y replay. El rojo inicial de las dos regresiones UI fue reportado antes del fix; su log fue sobrescrito por la revalidación y no se presenta como artefacto rojo disponible.
- Evidencia local de cierre en /workspace/.cloud-setup/: 013-final-coverage-2.log, 013-final-lint-2.log, 013-new-e2e-3.log y ejemplos review-013/. Los archivos del entorno pueden no persistir en otra máquina; reproducir según scripts del repo con DB de pruebas y configuración file temporal.
- Alcance: archivo generado no confirma papel. Hardware/ESC-POS pendientes de datos del usuario. La deuda previa de build por getServerSnapshot en primary-instance.ts continúa documentada; los E2E anteriores pasaron mediante renderizado cliente. Revisión del principal, sin auditoría adversarial/reviewer independiente bajo el flujo reducido.

## Próxima entrega y pendientes

- Próximo paso: preparar contrato 014 (S-01), luego TDD. Spec/reglas aprobadas con importes de interfaz en soles.
- Próximo paso funcional: retomar la spec 014 ya aprobada en feat/014-cashier-payments; contrato y pruebas del primer bloque de pre-cuenta/pago completo aún pendientes.
- Caja restante: pagos por efectivo/Yape/Plin/tarjeta, vuelto, pagos mixtos, división de cuenta, apertura/cierre y cuadre, ticket de venta (RF-13…17). Dividir en specs pequeñas para el flujo reducido.
- Después: inventario de pollo por parte/octavos y bebidas, entradas/consumo, agotados y alertas (Fase 5); reportes, auditoría y datos de demostración (Fase 6).
- Cocina: 013 completa para archivos; impresión física ESC/POS y detección de fallos/papel requieren marca, modelo y conexión. Barra separada (RF-11) es posterior. RF-12 para llevar/delivery sigue pendiente de asignación a una spec.
- Preparación de uso real: preparar polleria_dev según PROBAR-DEMO.md y realizar el recorrido manual. La deuda de build por getServerSnapshot se resolvió en el rediseño de dev. Las regresiones conocidas esperadas/omitidas continúan visibles; ADV-002-01/02 ya están resueltas por 013.

## Cambio de metodología — 2026-10-12 (histórico)

- Usuario aprobó flujo reducido: principal redacta specs/OpenAPI y revisa; solo test-writer e implementer como subagentes, medium. Luna para pruebas/tareas sencillas, gpt-6.1-sol para implementación compleja. Sin rondas independientes de spec-writer, reviewer o adversarial-tester; conservar pruebas existentes.
- El límite de uso interrumpió el equipo anterior. Preservar cambios parciales de 013 y validar su estado antes de continuar; no afirmar verde/cierre de bloques sin nueva evidencia.
- Retomar por bloques pequeños: primero fixtures/contrato de tests y migración/snapshot/formateo ya parcialmente escritos; después despacho/API y UI. Todos los 14 AC aprobados permanecen requeridos. Las referencias del traspaso de abajo al equipo anterior son históricas.

## Estado actual

### Trabajo anterior en Codex — 2026-10-12 (histórico)

- Fase: preparación de la Fase 3 (cocina/impresión).
- Funcionalidad: 013-kitchen-printing, spec aprobada por el usuario con P-01…P-06 el 2026-10-12; 14 AC en desarrollo.
- Rama: feat/013-kitchen-printing, desde 659061d (documentación de modelos publicada en main).
- Decisión del usuario: iniciar el desarrollo con los roles/modelos de docs/agents/modelos-codex.md; empezar la impresión con archivos porque aún no tiene datos de la impresora física.
- Paso: propuesta y tareas completadas por spec-writer; revisión documental independiente sin bloqueos materiales pendientes. S-01 completada: OpenAPI 0.10.0 validado, tres operaciones marcadas pendientes. T-01/T-02: 48 rojos causales y 13 casos existentes verdes (ca31064), después 61/61 verdes con T-09/T-10 y 183 unitarios anteriores. A-01 revalidada por adversarial-tester: 45 aprobadas y 1 fallo esperado intacto; ADV-002-01/02 ahora son tests ordinarios, sin aserciones debilitadas. Backend trabaja T-11/T-13 después del rojo de T-03/T-05; test-writer API prepara T-06/T-07 y otro subagente del mismo perfil prepara T-08 web/E2E en archivos disjuntos. Mantenimiento de la base de pruebas completado por sus dueños. Los 29 fallos web de onboarding se localizaron en sincronización de los tests (26 readiness prematura, 2 esperas negativas de logout y 1 referencia DOM obsoleta), sin defecto de producción confirmado. test-writer y adversarial-tester corrigieron solo sus pruebas en archivos disjuntos: 22/22 pruebas normales y 59/59 adversariales pasan; reviewer independiente aprobó el mantenimiento. Verificación del orquestador: suite completa (maxWorkers 2) con 122 archivos aprobados, 2418 pruebas aprobadas, 6 fallos esperados y 2 omitidas; tipos y lint pasan. Corrección de pruebas conservada en un commit test separado, sin producción ni cambios en main. E2E/cobertura no reejecutados en este mantenimiento de sincronización; no se ha cerrado una funcionalidad nueva.
- Entorno validado: Node 24, pnpm 10.12.1, PostgreSQL 17.11 local en /workspace/.cloud-setup, polleria_dev/polleria_test y conexiones locales protegidas en apps/api/.env; siete migraciones aplicadas, API/proxy saludables, tipos/lint y 546 pruebas de integración aprobadas (+3 fallos esperados, 2 omitidas). E2E: descarga del Chromium empaquetado aún bloqueada; Chromium 154.0.8037.57 del sistema abre con Playwright. Config local fuera del checkout /workspace/.cloud-setup/playwright-system.config.ts; 8/8 E2E baseline mobile de home/auth pasan. Los E2E de 013 y la suite E2E completa aún están pendientes. No se presume Docker ni publicación de la configuración en esta sesión.
- Próximo paso: completar rojo y verde de AC-03…14; A-01 ya habilita el trabajo de despacho, siempre después de sus pruebas. Auditoría A-02 y reviewer aún pendientes. Integración a main requiere autorización posterior.

### Último cierre previo

- Fase: 2 de 6 CERRADA en código (mesas y pedidos, RF-02 a RF-07) con la integración de la 012 el 2026-10-12. La siguiente es la Fase 3 (cocina/impresión). La Fase 1 quedó completa en código con la integración de la 008 el 2026-10-09 (pendientes manuales documentados: pnpm db:migrate en polleria_dev, pruebas por API y recorrido de /admin/carta).
- Funcionalidad: 012-tables-admin INTEGRADA a main el 2026-10-12 (merge c26c6c4, --no-ff autorizado por el usuario). Con ella la Fase 2 (mesas y pedidos, RF-02 a RF-07) queda cerrada en código. La 011-waiter-screens se integró el mismo día (merge 66681f8) y la 010-order-items el 2026-10-11 (merge 5110579).
- Paso: ciclo completo de la 012 — 34 adversariales con 3 hallazgos corregidos en producción (2 medios, 1 bajo — abiertos 0); reviewer APROBADO en 1.ª vuelta sobre 3e293ec. Verificación del orquestador: pnpm test 2418 verdes (única falla la ambiental ADV-002-01), lint/typecheck 0, e2e AC-11 verde en mobile-chrome, cobertura del archivo nuevo 98,96 % de líneas, api/shared/openapi sin diff (0.9.0).
- Siguiente acción: la 013 abre la Fase 3 (cocina: impresión de comandas) — requiere antes resolver la deuda ADV-002-02 del driver file (escritura de comandos crudos) y la puerta de ADV-002-01; spec-writer prepara la propuesta en feat/013-* cuando el usuario lo autorice.
- Rama: feat/012-tables-admin (creada desde main tras integrar la 011).
- Vueltas por los pasos 5 a 7 en la 003: 1 de 3. La primera auditoría adversarial independiente dejó dos hallazgos medios; el usuario aprobó corregir ambos.

## Tabla de funcionalidades

| ID | Nombre | Fase | Estado | Rama | Fecha de cierre |
| --- | --- | --- | --- | --- | --- |
| 001 | base-monorepo (monorepo, herramientas, conexión a BD, GET /api/health, web mínima) | 0 | Cerrada (APROBADO; 2 vueltas) | feat/001-base-monorepo | 2026-10-07 |
| 002 | printer-service (PrinterService con driver file, pnpm printer:test) | 0 | Cerrada (APROBADO; 1 vuelta; 5 hallazgos como deuda) | feat/002-printer-service | 2026-10-08 |
| 003 | users-pin-login (usuarios con varios roles, login con PIN, sesión en la base, requireAuth/requireRole, áreas por rol) | 1 | Cerrada (APROBADO; 44 AC cubiertos; 44 adversariales verdes; integrada a main en el merge 80340c3; pendientes manuales registrados) | feat/003-users-pin-login | 2026-10-08 |
| 004 | users-admin (alta/edición de usuarios con varios roles, PIN fuerte, activar/desactivar, restablecer PIN, guardia del último admin; /admin/usuarios*) | 1 | Cerrada (APROBADO; 27 AC; 53 adversariales; 9 hallazgos corregidos; integrada a main en el merge 35334d6; pendientes manuales registrados) | feat/004-users-admin | 2026-10-08 |
| 005 | menu-products (productos y precios: categorías fijas, precio en céntimos 0-99999, nombre único sin mayúsculas, desactivar en vez de borrar; GET/POST/PATCH /api/products) | 1 | Cerrada (APROBADO; 15 AC; 33 adversariales verdes; integrada a main en el merge 2af8023; pendientes manuales registrados) | feat/005-menu-products | 2026-10-08 |
| 006 | portions-eighths (presentaciones eighth/quarter/half/whole y partes breast/leg por producto 'chicken'; consumo en octavos derivado; GET + PUT /api/products/{id}/portions) | 1 | Cerrada (APROBADO; 14 AC; 28 adversariales verdes; integrada a main en el merge 4afbc66; pendientes manuales registrados) | feat/006-portions-eighths | 2026-10-09 |
| 007 | combos (producto de categoría 'combo' + tabla combo_items; precio fijo; consumo en octavos derivado; GET + PUT /api/products/{id}/items; sin pantallas) | 1 | Cerrada (APROBADO; 15 AC; 30 adversariales con 0 hallazgos; integrada a main en el merge 892914a; pendientes manuales registrados) | feat/007-combos | 2026-10-09 |
| 008 | menu-admin (pantallas /admin/carta: lista por categorías, alta/edición de productos, grilla de presentaciones del pollo, editor de componentes del combo con comparación de precios) | 1 | Cerrada (APROBADO; 21 AC; 157 tests adversariales verdes; 9 hallazgos corregidos; integrada a main en el merge 01d23bb; pendientes manuales registrados) | feat/008-menu-admin | 2026-10-09 |
| 009 | tables (mesas del salón + ciclo del pedido sin ítems: estados derivados, abrir, mover, unir, separar, listo/servido, pedir cuenta, cancelar) | 2 | Cerrada (APROBADO; 21 AC; 24 adversariales verdes; 2 hallazgos corregidos; integrada a main en el merge 389e86f; pendientes manuales registrados) | feat/009-tables | 2026-10-10 |
| 010 | order-items (ítems del pedido con presentación/parte/cremas/observaciones, envío idempotente, comandas como registro, anulación solicitada por el mozo y ejecutada por admin) | 2 | Cerrada (APROBADO en 2.ª vuelta; 19 AC; 19 adversariales con 7 hallazgos corregidos —2 críticos, 2 altos, 2 medios, 1 bajo—; integrada a main en el merge 5110579; pendientes manuales registrados) | feat/010-order-items | 2026-10-11 |
| 011 | waiter-screens (pantallas del mozo: tablero de mesas con estados, pedido por mesa con acciones del ciclo y comandas, toma de comanda con carrito y envío idempotente, anulación mozo→admin en pantalla; solo apps/web) | 2 | Cerrada (APROBADO en 2.ª vuelta; 24 AC; 30 adversariales con 12 hallazgos corregidos —3 altos, 4 medios, 5 bajos—; integrada a main en el merge 66681f8) | feat/011-waiter-screens | 2026-10-12 |
| 012 | tables-admin (pantalla /admin/mesas: lista con estado derivado, alta en línea, renombrar por diálogo, activar/desactivar con confirmación; solo apps/web + E2E, contrato 0.9.0 sin cambios) | 2 | Cerrada (APROBADO en 1.ª vuelta; 11 AC; 34 adversariales con 3 hallazgos corregidos —2 medios, 1 bajo—; integrada a main en el merge c26c6c4; pendientes manuales registrados) | feat/012-tables-admin | 2026-10-12 |
| 013 | kitchen-printing (generación automática file, errores y copias auditadas; hardware posterior) | 3 | Cerrada para file (14 AC); integrada a main, merge df19019; hardware posterior | feat/013-kitchen-printing | 2026-10-13 |
| 014 | cashier-payments (pre-cuenta y cobro completo con un medio) | 4 | Spec aprobada con importes visibles en soles (15 AC) | feat/014-cashier-payments | — |

La división 004 a 008 es una propuesta del orquestador; cada una se confirma al escribir su spec. La de la Fase 2 (009 a 012) la propuso el spec-writer de la 009.

## Decisiones del usuario

| Fecha | Decisión |
| --- | --- |
| 2026-10-07 | Iniciar la Fase 0. |
| 2026-10-07 | El usuario confirma que existen el rol polleria y las bases polleria_dev y polleria_test en PostgreSQL 17 (puerto 5432). |
| 2026-10-07 | Spec 001 aprobada con las recomendaciones del orquestador. |
| 2026-10-07 | API con prefijo /api, mismo origen que la web vía rewrites de Next.js, sin CORS. La API escucha solo en 127.0.0.1. |
| 2026-10-07 | Dependencias de soporte de la spec 001 aprobadas, incluidas las opcionales eslint-plugin-react-hooks y @testing-library/jest-dom (ADR 0001 aceptado). |
| 2026-10-07 | Códigos de error en inglés (por ejemplo INSUFFICIENT_STOCK); mensajes en español. Se corrigió backend-dev.md. |
| 2026-10-07 | Se mantiene Node 24.1.0 (jsdom 29.1.1). |
| 2026-10-07 | Para correr los E2E hay que detener pnpm dev antes. |
| 2026-10-07 | Los seeds se aplican una sola vez; recargar la demo se evaluará en la Fase 6. |
| 2026-10-07 | Se asume Chrome 111 o superior en los celulares de los mozos; se confirmará con el dueño. |
| 2026-10-07 | Corregir ahora los 6 hallazgos adversariales medios y bajos de la 001 (enmienda 1 de la spec), sin nueva aprobación salvo que cambie lo que ve el usuario final. |
| 2026-10-07 | Integrar la 001 a main con commit de merge (--no-ff), conservando el historial. |
| 2026-10-07 | Spec 002 aprobada con las recomendaciones: escpos detiene el arranque hasta la Fase 3, corte duro en 48 columnas, caracteres sin equivalente se imprimen como ?. Pendiente para la Fase 3: marca y modelo de la impresora del dueño. |
| 2026-10-08 | Dejar como deuda, para la Fase 3, los 5 hallazgos medios y bajos de la 002 (ADV-002-01 a 05). Sus tests se marcan como falla conocida (it.fails). |
| 2026-10-08 | Integrar la 002 a main con commit de merge (--no-ff). |
| 2026-10-08 | Fase 0 aprobada en el punto de control de fin de fase; iniciar la Fase 1. |
| 2026-10-08 | Spec 003: sesión guardada en la base (token aleatorio con SHA-256, sin JWT); ADR 0002 aceptado (bcrypt 6.0.0 y @types/bcrypt 6.0.0). Se corrigieron backend-dev.md y adversarial-tester.md. |
| 2026-10-08 | Spec 003: 5 intentos fallidos bloquean 15 min; sesión de 16 h; cocina puede iniciar sesión (pantalla vacía); PIN fáciles se tratan en la 004. |
| 2026-10-08 | PIN de 4 a 6 dígitos con botón Entrar. |
| 2026-10-08 | En /login el trabajador toca su nombre en una lista de usuarios activos. |
| 2026-10-08 | Una persona puede tener VARIOS roles (cambia el supuesto S-003-04 de la spec 003). |
| 2026-10-08 | Revisión 1 de la spec 003 aprobada: roles como arreglo en users.roles; requireRole deja pasar con al menos un rol; con varias áreas se entra a la última usada en ese equipo o a /areas ("¿Dónde vas a trabajar?"); enlace "Cambiar de área"; el administrador elige área la primera vez en cada equipo; pnpm users:create-admin solo crea administradores (otros roles en la 004). |
| 2026-10-08 | En esta copia: autoriza reconstruir node_modules y las limpiezas de las tablas de pruebas indicadas exclusivamente en polleria_test, con guardias; nunca en polleria_dev. |
| 2026-10-08 | Exige continuar con subagentes separados por rol y metodología SDD, TDD y pruebas adversariales. Se configura el equipo nativo en .devin/, usando docs/agents/ como fuente de roles. |
| 2026-10-08 | Autoriza corregir los dos medios ADV-003-06 y ADV-003-14: contador se reinicia solo tras guardar sesión; logout solo confirma HTTP 204. Spec aclarada, correcciones en rojo/verde y revalidación independientes. |
| 2026-10-08 | Autoriza preparar los commits e integrar la 003 a main: cuatro commits por responsabilidad (test, feat shared/API, feat web, docs) y merge --no-ff 80340c3. Confirma que los subagentes de implementación y revisión usaron el modelo de la ventana principal (los de exploración, el modelo del enrutador). |
| 2026-10-08 | Spec 004 aprobada con las 6 respuestas recomendadas: PIN escrito dos veces por el admin, lista de PIN fáciles (repetidos, secuencias circulares, años 1900-2099, fechas DDMM/DDMMAA, '2580'), autodesactivación solo si queda otro admin activo (409 LAST_ADMIN_REQUIRED), users:create-admin también rechaza PIN fáciles, username inmutable, sin botón Desbloquear. |
| 2026-10-08 | Autoriza corregir los 8 hallazgos adversariales de la 004 (1 alto, 2 medios, 5 bajos) y después el residual bajo ADV-004-25 (no-store en rutas con mayúsculas). Todos revalidados en verde. |
| 2026-10-08 | Autoriza integrar la 004 a main (merge --no-ff 35334d6). |
| 2026-10-08 | Spec 005 aprobada con las 10 respuestas recomendadas: categorías fijas chicken/dish/drink/dessert/sauce/extra; precio en céntimos 0-99999 (S/ 0.00 válido para cremas gratis); nombre único con lower(name); desactivar reversible, nunca borrar; GET abierto a cualquier rol con sesión; POST/PATCH solo admin; sin descripción/foto/SKU; sin pantallas (van en la 008); combos en la 007 y octavos en la 006. |
| 2026-10-08 | Corregidos los 2 hallazgos adversariales de la 005 (medio ADV-005-30: URIError → 400 VALIDATION_ERROR; bajo ADV-005-25: releer la fila tras el UPDATE) con regresiones en rojo/verde y revalidación. Deuda documentada: colapso de espacios internos, homoglifos Unicode, CHECKs más laxos que el dominio y validación defensiva de productId en el servicio. |
| 2026-10-08 | Autoriza integrar la 005 a main (merge --no-ff 2af8023). |
| 2026-10-09 | Spec 006 aprobada con las 6 respuestas recomendadas: el sistema permite 1/8 por producto sin obligar; precio por presentación y parte (igual o distinto); medio 2+2 por defecto (otra distribución se copia al ítem del pedido en Fase 2); solo 'chicken' lleva presentaciones; PUT de reemplazo atómico del conjunto; products.price_cents obligatorio aunque haya presentaciones (cobra el precio de la fila). |
| 2026-10-09 | Autoriza corregir los hallazgos adversariales de la 006 (3 altos: unión de PUTs concurrentes, 500 por doble clic, TOCTOU PUT↔PATCH de categoría; 1 bajo: producto borrado → 500). Corregidos con FOR NO KEY UPDATE + ON CONFLICT DO UPDATE + reversión post-UPDATE; revalidados en verde. |
| 2026-10-09 | Autoriza integrar la 006 a main (merge --no-ff 4afbc66). |
| 2026-10-09 | Spec 007 aprobada con las 10 respuestas recomendadas: combo = producto de categoría 'combo' con tabla combo_items; precio fijo a mano en price_cents; parte por defecto del pollo en el componente (la elección real se copia al pedido en Fase 2); descartables aparte como 'extra'; 'combo' en 2.º lugar de la carta tras el Pollo; componentes inactivos permitidos en configuración; solo dominio + API; porción libre sin exigir venta suelta; topes 10 componentes y 99 unidades. |
| 2026-10-09 | Adversarial-tester de la 007: 30 casos propios, 0 hallazgos (la serialización FOR NO KEY UPDATE aplicada desde el diseño resistió los vectores que reventaron la 006); 10 observaciones documentadas como deuda. Reviewer: APROBADO. |
| 2026-10-09 | Autoriza integrar la 007 a main (merge --no-ff 892914a). |
| 2026-10-09 | Spec 008 aprobada con las 10 respuestas recomendadas: solo admin gestiona la carta; pantallas con secciones apiladas (no pestañas); 4 E2E (3 desktop + 1 móvil a 360 px); lista completa sin paginar; precio en soles con vista previa; tras el alta de pollo/combo va a su edición; comparación de combo por precio de presentación vendida suelta con respaldo priceCents; desactivar pide confirmación; componente de pollo preselecciona cuarto+pierna; funciones de dinero en shared. |
| 2026-10-09 | Autoriza corregir los 8 hallazgos adversariales de la 008 (1 alto ADV-008-04: cantidad que desborda a Infinity tumbaba la página; medios 05/06: dinero exponencial en pantalla y filas incompletas que sumaban; bajos 02/03/07/08) y después el residual bajo ADV-008-42 (claves React duplicadas por mensajes repetidos). Todos revalidados en verde con aserciones intactas. |
| 2026-10-09 | Autoriza integrar la 008 a main (merge --no-ff 01d23bb). |
| 2026-10-10 | Spec 009 aprobada con las 13 respuestas recomendadas: mesas fijas configuradas por admin; estados derivados (nunca guardados) con precedencia 'pedido listo' sobre 'pidió la cuenta'; unir = fusionar cuentas con auditoría (pedido origen merged); separar deja la mesa libre; cancelar sin ítems lo hace mozo/admin con motivo (con ítems solo admin, RF-07); 'pedido listo' lo marca mozo/kitchen/admin; cualquier mozo mueve/separa; sin Socket.IO (polling en la 011), sin plano visual, sin estado 'limpiando', sin número de personas; para llevar queda para su fase; modelo con puntero invertido tables.current_order_id; división de la Fase 2 en 009/010/011/012. |
| 2026-10-10 | Autoriza corregir los 2 hallazgos adversariales de la 009 (alto ADV-009-22: GET /api/tables con lectura rasgada durante merges → REPEATABLE READ en listTables y getOrder; medio ADV-009-14: rutas sin cuerpo rechazaban cuerpos ilegibles → bypass BODILESS_PATH_PATTERN). Revalidados en verde, 24/24. |
| 2026-10-10 | Autoriza integrar la 009 a main (merge --no-ff 389e86f). |
| 2026-10-10 | Spec 010 aprobada: respuestas recomendadas salvo la anulación — el usuario decidió que el MOZO puede SOLICITAR la anulación del ítem y el admin la aprueba (o rechaza); ciclo sent → void_requested → voided con auditoría de dos actores. Confirmadas como recomendado: el cliente elige pecho/pierna del combo en el mostrador (defecto de carta) y se vende combo con componente desactivado. |
| 2026-10-11 | Arbitraje de la 010: el backend-dev reportó 6 defectos en los tests del test-writer (TRUNCATE sin las tablas nuevas por FK, UPDATEs de cierre inconsistentes con el CHECK de la 009, helpers y sobres mal leídos, errores de tipos) — verificados por el orquestador y corregidos por el test-writer sin que el implementador tocara pruebas. |
| 2026-10-11 | Adversariales de la 010: 19 casos; 7 hallazgos reales corregidos en producción en el mismo pase (críticos: octavos corruptos en componente 'half' y replay fantasma de anulación por hash sin itemId; altos: octavos descartados en silencio en componentes no-half y bytes de control persistidos en el motivo; medios: separadores Unicode Zl/Zp en notas y motivo, FK ausente en void_requested_by_user_id — la spec la declaraba; bajo: issue de parámetro con etiqueta equivocada). Se corrigieron también los medios/bajos por ser violaciones directas de la spec, no decisiones nuevas. Los 12 casos restantes (ADV-010-08..19) documentan vectores que resistieron. |
| 2026-10-11 | Reviewer de la 010: primera vuelta RECHAZADO por bloqueante B-1 (openapi.yaml 0.9.0 declaraba los componentes pero no las 6 entradas de paths; además la clave raíz `components:` se había borrado por accidente en T-11). Corregido por backend-dev; segunda vuelta APROBADO. El orquestador corrigió el typo de tasks.md ("4 rutas" → "6 rutas") que contribuyó a la omisión. |
| 2026-10-11 | Spec 011 aprobada con las 12 respuestas recomendadas del §17: rutas /mozo, /mozo/mesas/[tableId] y /mozo/mesas/[tableId]/agregar; mover/unir/separar incluidos para el mozo; vista mínima de anulaciones dentro de la pantalla del pedido (la bandeja agregada del salón requiere un listado nuevo de API y queda fuera); polling de 5 s en tablero y pedido, sin Socket.IO (se evalúa tras la demo); el mozo marca 'pedido listo' y 'servido'; cremas con checkbox + cantidad; confirmaciones solo en separar y en rechazar solicitud; comandas 'Anulación' solo para admin; sin 'hace X min' ni búsqueda en la carta; un hueco real de API se reporta al orquestador, no se tapa desde la web; 3 recorridos E2E en mobile-chrome. |
| 2026-10-12 | Spec 012 aprobada con las 7 respuestas recomendadas del §17: una sola pantalla /admin/mesas con acciones por fila (no el patrón de tres rutas); estado derivado visible como información; confirmación solo para desactivar; renombrar una mesa con pedido abierto permitido; alta por nombre en línea; un solo recorrido E2E en mobile-chrome; sin hueco en la API (contrato 0.9.0 sin cambios). |
| 2026-10-12 | Arbitraje de la 012: el test-writer detectó 7 e2e obsoletos en main (aserciones de encabezado 'Mozo' que la 011 cambió a 'Mesas' en auth.spec.ts y users-admin.spec.ts) y los corrigió en b52e99b como dueño de los tests; verificado que solo tocó encabezados h1. |
| 2026-10-12 | Adversariales de la 012: 34 casos; 3 hallazgos corregidos en producción en el mismo pase por ser violaciones directas de la spec (medios ADV-012-01: refetch fallido borraba lista y borrador —misma clase que ADV-011-03— y ADV-012-02: overlay `applied` sin reconciliar que enmascaraba datos frescos del servidor; bajo ADV-012-03: mensaje de error persistía al editar —misma clase que ADV-011-07—). Los 10 vectores restantes resistieron y quedan documentados. Reviewer: APROBADO en 1.ª vuelta, sin bloqueantes. |
| 2026-10-12 | Autoriza integrar la 012 a main (merge --no-ff c26c6c4). Con la 012 la Fase 2 queda cerrada en código. |

## Notas técnicas del orquestador

### Continuación en Devin de esta copia (2026-10-08)

- El usuario autorizó reconstruir únicamente las carpetas node_modules de esta copia. Instalación congelada y bcrypt 6.0.0/@types/bcrypt 6.0.0 verificados.
- El usuario autorizó las limpiezas de pruebas exclusivamente en polleria_test para users, sessions, SequelizeMeta, SequelizeData, fixture_a, fixture_b, fixture_seed_rows, FixtureMeta y FixtureData. La conexión se verificó sin modificar datos antes de ejecutar las pruebas. Nunca se ejecutaron migraciones/seeds en polleria_dev.
- Desviación registrada: el agente principal escribió las primeras pruebas e implementación de la 003 directamente, sin subagentes. Hubo rojo por módulos/tablas ausentes antes del verde, pero no separación de autores. No se presenta ese trabajo como delegado ni como revisado independientemente.
- El usuario exigió continuar con subagentes, SDD, TDD y pruebas adversariales. Desde ese punto el principal solo orquesta. Se añadieron adaptadores nativos en .devin/agents/ y una regla obligatoria en .devin/rules/orquestacion-sdd-tdd.md; las definiciones de roles de referencia son docs/agents/.
- Verificación anterior a las auditorías: pnpm test:coverage dio 722 pasan y 7 fallas esperadas (729); cobertura global de líneas 97,98 %, shared 97,36 %, services/auth 98,46 % y services/users 91,66 %. pnpm lint y pnpm typecheck pasaron. Estas cifras no equivalen a aceptación de todos los AC ni a una auditoría adversarial.
- spec-writer independiente confirmó coherencia entre la spec aprobada, tasks, ADR y OpenAPI 0.3.1. Se corrigió la instrucción genérica obsoleta de docs/agents/frontend-dev.md: el tipado reutiliza Zod de shared, sin instalar openapi-typescript.
- test-writer independiente completó la auditoría y reforzó los escenarios exigidos, sin editar producción: 193 pruebas específicas de la 003 en verde. Resolvió un conflicto del cargador de Playwright/Node/Sequelize aislando la preparación E2E en un proceso Node nativo con guardias exactas de polleria_test, sin cambiar versiones. E2E: 14 pasan y 2 no aplicables; lint y tipos pasan. Son resultados del subagente, pendientes de comprobación final del orquestador.
- devin doctor validó los siete perfiles nativos polleria-* en .devin/agents/ (código 0). En esta sesión las delegaciones usan los perfiles nativos disponibles con las instrucciones explícitas de cada rol.
- Auditoría adversarial independiente: 35 casos, 32 verdes y 3 rojos; críticos 0, altos 0, medios 2. ADV-003-06: reset prematuro del contador si falla guardar la sesión. ADV-003-14: logout malformado 200/202 interpretado como éxito.
- El usuario aprobó corregir ambos medios. spec-writer aclaró spec/tasks sin ampliar los 44 AC ni el contrato externo. Backend-dev y frontend-dev corrigieron producción en archivos disjuntos, comprobaron rojo antes y verde después y no editaron tests. El contador solo se reinicia tras crear la sesión; logout exige 204 real mediante expectedStatus y skipAuthRedirect.
- Revalidación adversarial independiente posterior: los 35 casos originales quedaron verdes sin debilitar aserciones, incluidos los tres rojos históricos. Se añadieron nueve casos posaclaración de logout malformado/401: 44/44 propios en verde. ADV-003-06 y ADV-003-14 RESUELTOS, abiertos críticos/altos/medios/bajos: 0 en esa auditoría.
- Reviewer independiente: APROBADO, sin bloqueantes. Comprobó personalmente los cuatro comandos de la definición de terminado, E2E, 44 AC y las regresiones; no editó archivos. La desviación inicial de autoría queda reconocida, no se presenta como delegación retrospectiva.
- Verificación final del orquestador: pnpm test y pnpm test:coverage dieron 786 pasan + 7 fallas esperadas autorizadas = 793 (55 archivos); líneas globales 98,12 %, shared 97,36 %, services/auth 98,46 %, services/users 91,66 %. pnpm lint, pnpm typecheck y pnpm install --frozen-lockfile: código 0. Vitest, cobertura y E2E se ejecutaron en serie.
- E2E final del orquestador: 14 pasan y 2 no aplicables (solo casos móviles excluidos en desktop); incluye siete recorridos aplicables de la 003. Los puertos 3000, 3100, 4000 y 4100 quedaron libres.
- OpenAPI 3.1, contrato 0.3.1: validado con Redocly CLI 1.34.5 exacta, publicada el 2025-07-21, ejecutada desde una carpeta temporal sin incorporarla al proyecto. Código 0, 11 advertencias no bloqueantes aceptadas por R-003-08 (licencia, localhost, respuestas 4xx y componentes reutilizables). No se cambiaron políticas de seguridad ni dependencias del proyecto para validar.
- Configuración final: devin doctor confirmó los siete perfiles polleria-* sin errores. Los perfiles permiten leer salidas de sus comandos largos; la regla exige separación de archivos y turnos exclusivos de la base. Git diff --check pasó.
- La 003 se integró a main el 2026-10-08 (merge 80340c3): test/spec-003 e883802, feat shared/API de8f723, feat web 3dae0e7, docs f0d9c14. La prueba manual del PIN oculto en PowerShell y la validación desde un celular del local siguen pendientes.
- Ciclo 004 ejecutado íntegramente con subagentes separados: spec-writer (borrador + aprobación + aclaración), test-writer (rojo: 149 casos nuevos; arbitrajes AC-26 PIN fuerte y AC-39 conteo dinámico), backend-dev (T-06..T-09 + 3 fixes), frontend-dev (T-10..T-14 + 1 fix; descubrió y documentó la tensión '/admin'), adversarial-tester (53 casos; revalidación completa), reviewer (APROBADO verificado personalmente).
- Verificación final del orquestador de la 004: pnpm test 1036 verdes + 7 fallas esperadas de la 002 (1043); pnpm lint, pnpm typecheck y pnpm test:coverage con código 0 (global 98,38 % líneas; shared 98,38 %; services/users 96,61 %; services/auth 98,48 %); pnpm test:e2e 16/16 con 4 no aplicables por proyecto. Nada de la 004 tocó polleria_dev.
- La 004 se integró a main el 2026-10-08 (merge 35334d6). El árbol quedó limpio; no hay commits ni merges pendientes.
- Ciclo 005 ejecutado íntegramente con subagentes separados: spec-writer (propuesta + registro de aprobación), test-writer (rojo: 113 casos nuevos en 4 archivos; arbitrajes: deparse de PostgreSQL lower((name)::text) y lista de migraciones de la 003 ampliada con create-products), backend-dev (T-05 a T-09 + 2 fixes adversariales), adversarial-tester (33 casos; revalidación completa), reviewer (APROBADO verificado personalmente). Sin frontend ni E2E nuevos: la 005 es solo dominio + API.
- Verificación final del orquestador de la 005: pnpm test 1207 verdes + 7 fallas esperadas de la 002 (1214; 74 archivos); pnpm lint, pnpm typecheck y pnpm test:coverage con código 0 (global ~98,32 % líneas; shared 98,7 %; services/products 93,54 %); pnpm test:e2e 16 verdes y 4 no aplicables por proyecto. OpenAPI 0.5.0 validado con Redocly. Nada de la 005 tocó polleria_dev ni apps/web.
- La 005 se integró a main el 2026-10-08 (merge 2af8023). El árbol quedó limpio; no hay commits ni merges pendientes.
- Ciclo 006 ejecutado íntegramente con subagentes separados: spec-writer (propuesta + registro de aprobación), test-writer (rojo: 141 pruebas nuevas; arbitraje corregido: TRUNCATE multi-tabla en clearMenuTables por la FK), backend-dev (T-05..T-09 + fix de concurrencia: FOR NO KEY UPDATE tras descartar FOR UPDATE por deadlock real con FOR KEY SHARE de la FK, ON CONFLICT DO UPDATE, reversión post-UPDATE en updateProduct), adversarial-tester (28 casos; 3 altos + 1 bajo corregidos; lint de sus archivos), reviewer (APROBADO verificado personalmente).
- Verificación final del orquestador de la 006: pnpm test 1376 verdes + 7 fallas esperadas de la 002 (1383; 80 archivos); pnpm lint y pnpm typecheck con código 0 (ejecutados por el orquestador); pnpm test:coverage código 0 verificado por el reviewer sobre el mismo árbol (global 98,35 %; shared 99,04 %; services/products 95,89 %); pnpm test:e2e 16 verdes y 4 no aplicables (reviewer, mismo árbol). OpenAPI 0.6.0 validado con Redocly. Nada de la 006 tocó polleria_dev ni apps/web.
- La 006 se integró a main el 2026-10-09 (merge 4afbc66). El árbol quedó limpio; no hay commits ni merges pendientes.
- Ciclo 007 ejecutado íntegramente con subagentes separados: spec-writer (propuesta + registro de aprobación), test-writer (rojo: ~150 pruebas nuevas en 4 archivos; arbitraje corregido: aserción de filas del AC-06 6→5 porque el dúo ya estaba cubierto), backend-dev (T-05 a T-09: CHECK portion_cut con CASE por agujero NULL de la forma literal; lector laxo solo en /items para distinguir INVALID_BODY de INVALID_JSON), adversarial-tester (30 casos, 0 hallazgos), reviewer (APROBADO verificado con números reales).
- Verificación final del orquestador de la 007: pnpm test 1549 verdes + 7 fallas esperadas de la 002 (1556; 86 archivos); pnpm lint y pnpm typecheck con código 0 (ejecutados por el orquestador); pnpm test:e2e 16 verdes y 4 no aplicables (ejecutado por el orquestador); pnpm test:coverage código 0 verificado por el reviewer sobre el mismo árbol (global 98,47 %; shared 99,29 % con combos.ts al 100 %; services/combo-items 98,41 %). OpenAPI 0.7.0 validado con Redocly. Nada de la 007 tocó polleria_dev ni apps/web.
- La 007 se integró a main el 2026-10-09 (merge 892914a). El árbol quedó limpio; no hay commits ni merges pendientes.
- Ciclo 008 ejecutado íntegramente con subagentes separados: spec-writer (propuesta + registro de aprobación), test-writer (rojo: tests de money, etiquetas, cliente PUT, API de la carta, componentes con MSW y 4 E2E; arbitraje: 4 defectos de pruebas corregidos en 021ded8 — orden de handlers MSW donde gana el primero, spy sobre otro QueryClient, mock faltante de GET /portions y aritmética 8300), backend-dev (T-07 money.ts; fix adversarial de parseSolesToCents/formatSoles con BigInt), frontend-dev (T-08 a T-14 pantallas + fixes ADV-008-04..08 y ADV-008-42; corrigió el regex \d colapsado en issues.ts), adversarial-tester (134 casos originales + 22 de revalidación; 9 hallazgos corregidos en total), reviewer (APROBADO verificado con números reales).
- Verificación final del orquestador de la 008: el reviewer obtuvo pnpm test 1866 verdes + 7 fallas esperadas (1873; 97 archivos) sobre el mismo árbol; la corrida del orquestador dio 1863 verdes + 3 timeouts de findByRole (AC-12, AC-14, ADV-008-04) bajo la carga de ~97 workers que pasaron aislados 126/126 — flake de carga documentado, no defecto; pnpm lint y pnpm typecheck código 0 (orquestador); pnpm test:coverage código 0 verificado por el reviewer sobre el mismo árbol (global 98,5 %; shared 99,35 % con money.ts 100 %; services: auth 98,48, combo-items 98,41, printer 100, products 96,7, users 96,61; módulos web de la 008 ≥95,7 %); pnpm test:e2e 20 verdes y 8 no aplicables por proyecto (reviewer, mismo árbol; los 4 E2E nuevos en verde). OpenAPI 0.7.0 intacto (diff vacío contra main; Redocly válido). Nada de la 008 tocó polleria_dev ni apps/api.
- La 008 se integró a main el 2026-10-09 (merge 01d23bb). El árbol quedó limpio; no hay commits ni merges pendientes.
- Ciclo 009 ejecutado íntegramente con subagentes separados: spec-writer (propuesta + registro de aprobación; corrigió una referencia cruzada D-009-13→D-009-11), test-writer (rojo: 156 pruebas en 6 archivos + helpers; arbitraje: 3 defectos corregidos en 6cdff09 — fixture sin tipo, promesas ansiosas con rechazo no manejado, 34 aserciones redundantes), backend-dev (T-06 a T-10 en 4 commits + prettier + fix adversarial: REPEATABLE READ en listTables/getOrder y BODILESS_PATH_PATTERN para las rutas sin cuerpo), adversarial-tester (24 casos; 1 alto + 1 medio corregidos; revalidación 24/24), reviewer (APROBADO verificado con números reales).
- Verificación final del orquestador de la 009: pnpm test 2091 verdes + 7 fallas esperadas (2098; 105 archivos; sin flakes en esta corrida); pnpm lint y pnpm typecheck código 0 (orquestador); pnpm test:coverage código 0 verificado por el reviewer sobre el mismo árbol (global 98,33 %; shared 98,57 % con tables.ts/orders.ts 100 %; services ≥90 %: table.service 95,08 %, order.service 90,16 %); pnpm test:e2e 20 verdes y 8 no aplicables por proyecto (reviewer, mismo árbol). OpenAPI 0.8.0 validado con Redocly. Nada de la 009 tocó polleria_dev ni apps/web.


- 2026-10-07: el entorno tiene Windows 11, Node 24.1.0 (LTS), pnpm 10.12.1, Git 2.49 y PostgreSQL 17.5 en localhost:5432. También hay un PostgreSQL 18 en el puerto 5433, que el proyecto no usa.
- 2026-10-07: HeroUI 3.2.6 exige Tailwind CSS >= 4, React >= 19 y react-aria-components.
- 2026-10-07: TypeScript 7 no es compatible con typescript-eslint 8.71.1 (< 6.1.0). Se fijó TypeScript 6.0.3.
- 2026-10-07: versiones exactas registradas en CLAUDE.md (sección Stack), según la Fase 0 y el ADR 0001.
- 2026-10-07: las preguntas abiertas de la enmienda 1 de la 001 se resolvieron con las recomendaciones: conexión a PostgreSQL sin SSL e ignorando la query del URL (S-12), la web no arranca si API_INTERNAL_URL trae usuario o clave (S-13), los errores 4xx no se registran en el log (S-14) y una migración espera sin límite a otra en curso (S-15).
- 2026-10-07: arbitraje. backend-dev reportó un glob sin barra en apps/api/tests/migrator.test.ts; el orquestador lo verificó y test-writer lo corrigió (commit 7c19265) sin cambiar aserciones.
- 2026-10-08: pnpm printer:test agregado a los comandos de CLAUDE.md.
- 2026-10-08: aclaración 1 de la spec 002 (commit 0484202): corte de líneas y espacios finales, conteo UTF-16 del límite de 2000, recorte de PRINTER_FILE_DIR. No cambió AC ni tests.
- 2026-10-08: registrado en CLAUDE.md bcrypt 6.0.0, @types/bcrypt 6.0.0 y el comando pnpm users:create-admin, conforme al cierre técnico de la 003. La integración a main sigue sin autorización.

## Deuda técnica y hallazgos medios/bajos

### Hallazgos adversariales de la 001 (commit 7be8d15; todos cerrados)

| ID | Severidad | Hallazgo | Estado |
| --- | --- | --- | --- |
| ADV-001-01 | Medio | Content-Encoding desconocido: body-parser lanza 415 y la API responde 500 INTERNAL_ERROR con traza en el log. | Cerrado (enmienda 1) |
| ADV-001-02 | Medio | Cuerpo que dice ser gzip y no lo es: 500 INTERNAL_ERROR con traza. | Cerrado (enmienda 1) |
| ADV-001-04 | Medio | La guardia acepta ?host=otro-servidor en una URL polleria_test y Sequelize conecta a ese host. | Cerrado (enmienda 1) |
| ADV-001-05 | Bajo | La guardia acepta ?options=-c search_path=... y Sequelize lo aplica. | Cerrado (enmienda 1) |
| ADV-001-06 | Bajo | Dos migrateUp simultáneos: uno falla con un error crudo del driver (el estado final queda bien). | Cerrado (enmienda 1) |
| ADV-001-09 | Bajo | API_INTERNAL_URL con ruta, query o fragmento rompe el destino del rewrite sin aviso. | Cerrado (enmienda 1) |

Ataques de la 001 sin fallas (quedan como regresión en verde): prototype pollution en JSON, 120 consultas de salud simultáneas con base disponible y caída, sin fugas de clave en errores, CLI ni salud.

### Hallazgos adversariales de la 002 (commit 0c62834; deuda autorizada por el usuario)

| ID | Severidad | Hallazgo | Estado |
| --- | --- | --- | --- |
| ADV-002-01 | Medio | Una línea válida con miles de acentos combinantes desordenados hace que normalizar tarde más de 2 s y bloquee Node (AC-17). | Resuelta en 013; test ordinario |
| ADV-002-02 | Medio | createPrinterDriver se exporta desde index.ts y su print escribe tal cual ESC, GS y NUL si alguien lo usa sin el servicio. | Resuelta en 013; test ordinario |
| ADV-002-03 | Bajo | El límite de 500 líneas se aplica después de recorrer todo el arreglo (100 000 líneas se leen enteras). | Deuda (Fase 3), test con it.fails |
| ADV-002-04 | Bajo | En Windows, PRINTER_FILE_DIR como Q:comandas o C: depende de la carpeta actual o cae en la raíz del monorepo. | Deuda (Fase 3), test con it.fails |
| ADV-002-05 | Bajo | toLimaDateTimeParts confunde años antes y después de Cristo (año 0 y año 1 dan 0001). | Deuda (Fase 3), test con it.fails |

Condiciones de esta deuda:
- ADV-002-02 debe corregirse ANTES de crear el driver escpos en la Fase 3; si no, sería inyección de comandos en la impresora (Crítico).
- ADV-002-01 sube a Alto si las observaciones de los ítems (Fase 2) aceptan más de unos 200 caracteres sin limitar acentos combinantes seguidos.
- ADV-002-01 depende de la velocidad de la máquina: en una PC unas 3 veces más rápida podría dejar de fallar y it.fails avisaría.
- it.fails da por buena cualquier falla, no solo la del hallazgo.

Ataques de la 002 sin fallas (regresión en verde): ningún punto de código Unicode sale fuera de los 114 imprimibles; comandos ESC/POS reales y trucos bidi, ZWJ y BOM no llegan al archivo por el servicio; jobId con trucos de rutas y nombres reservados de Windows se rechazan; 1000 impresiones simultáneas sin colisiones; fallas de escritura no dejan .txt ni .tmp; printer:test sin fugas de clave; Lima siempre UTC-5.

### Huecos documentados de la 005 (adversarial-tester; deuda para decidir después)

- ADV-005-22 nota: updateProduct no valida productId por su cuenta (NaN/Infinity dan error crudo fuera del controller). Hay un test que aserta este comportamiento; no cambiar sin decisión.
- Duplicados visuales: 'Papa  frita' (doble espacio) u homoglifos Unicode pasan el índice lower(name). Decidir si se colapsan espacios internos o se detectan confusables.
- CHECKs de la tabla products más laxos que la validación de dominio: solo alcanzable por SQL directo (seeds o consola). Endurecer si se agregan esas vías.

### Observaciones documentadas de la 006 (adversarial-tester y reviewer; deuda para decidir después)

- ADV-006-07: un getter hostil en el cuerpo propaga excepción genérica, no ZodError (no alcanzable por HTTP: JSON.parse nunca crea getters). Test verde documentado.
- ADV-006-08: PORTIONS/CUTS/PORTION_EIGHTHS son `as const` solo en tipos — mutables en runtime; una mutación accidental corrompería chickenConsumption. Evaluar Object.freeze si se desea endurecer.
- ADV-006-26: el servicio de presentaciones no valida productId por su cuenta (NaN/Infinity → error crudo fuera del controller). Misma clase que ADV-005-22 de la 005; hay test que lo aserta.
- Reviewer: la reversión post-UPDATE de updateProduct no está en transacción — ventana de microsegundos con estado inconsistente entre el UPDATE a no-'chicken' y la reversión (recuperable con PUT portions: []). Evaluar transacción si se quiere endurecer.
- Reviewer: components.responses.ProductHasPortions de openapi.yaml quedó definido pero el 409 del PATCH usa respuesta inline (Redocly lo marca "never used"); el contrato documenta ambos códigos correctamente.
- Convención sugerida por el tester: username único por archivo de tests que cree usuarios (la colisión USERNAME_TAKEN entre archivos se resolvió así en la 006); revisar si los subprocesos de tests que escriben en polleria_test quedan cubiertos por la serialización.

### Observaciones documentadas de la 007 (adversarial-tester y reviewer; deuda para decidir después)

- ADV-007-06: comboChickenConsumption acepta la unión Iterable | ítem suelto (un ítem no iterable lanza TypeError, documentado a propósito para it.each) y no defiende quantity fraccionario/negativo/NaN con datos forzados (imposibles vía servicio). Recomendación del reviewer: en la Fase 2, con llamadores reales, estrechar la firma a Iterable puro o defender quantity.
- comboItemSchema (esquema de salida) no refina la correspondencia presentación-parte: solo la forma; el invariante lo garantiza el servicio en la escritura.
- PRODUCT_CATEGORIES mutable en runtime (misma clase que ADV-006-08); getter hostil en el cuerpo → excepción genérica (misma clase que ADV-006-07); claves JSON duplicadas ganan la última (paridad ADV-005-27).
- Asimetría del lector: [] raíz → VALIDATION_ERROR en /portions y PATCH vs INVALID_BODY en /items (ambos 400 con no-store; frontera distinta pero consistente).
- La guardia PRODUCT_HAS_ITEMS se define como "categoría distinta de 'combo'": un dish con combo_items inyectadas por SQL recibe 409 aunque no cambie de categoría (solo alcanzable por SQL directo, igual que el residual de la 006).
- productId NaN/±∞ en el servicio llega crudo al SQL (paridad ADV-005-22/ADV-006-26; la ruta lo impide).
- OpenAPI: components.responses.ProductHasItems/ProductIsComponent definidos pero el PATCH usa respuesta inline (2 warnings nuevos de no-unused-components; cosmético) y el GET dice "es-PE" mientras el collator es 'es' (mismo patrón que 005/006; corregir si se toca el contrato).

### Observaciones documentadas de la 008 (adversarial-tester y reviewer; deuda para decidir después)

- ADV-008-40: el mensaje de éxito ("Componentes guardados." y equivalentes) persiste junto a un error local nuevo en las tres superficies de mutación. Comportamiento observado en test; deuda baja.
- ADV-008-27: Number() laxo residual al armar ítems del editor de componentes; mitigado porque el cuerpo completo se valida con replaceComboItemsRequestSchema antes del PUT y sumableQuantity acota la comparación.
- sectionMessages es utilidad exportada con consumidor de test (ADV-008-15); los componentes de sección usan variables locales homónimas — candidata a unificación.
- usePrimaryInstance SSR warning: patrón heredado de la 004, visible en el log E2E.
- Resuelto: la duda inicial sobre onUnhandledFrame en tests/setup.ts quedó cerrada — es la opción real de MSW 3.0.2 (ADV-008-26 la verifica).
- Refactor no previsto en spec §11: parseResponse extraída a client.ts y reutilizada por users.ts (aditivo DRY; los tests de la 004 pasan).
- Desviación de ejemplo en E2E: AC-19 usa precios 18/17/65 (la spec ejemplifica 19.90/18.90/72.00) y AC-20 elige Pecho con suma 36.00 (la spec ejemplifica Pierna con 35.00); el comportamiento verificado es el mismo.
- Flake: timeouts de findByRole en tests web bajo ~97 workers simultáneos (AC-12, AC-14, ADV-008-04 fallaron una vez en la corrida completa del orquestador; pasan aislados y pasaron en la corrida del reviewer sobre el mismo árbol). Vigilar si se vuelve frecuente.

### Observaciones documentadas de la 009 (adversarial-tester y reviewer; deuda para decidir después)

- ADV-009-09: /api/tables% y hermanas desconocidas responden 404 sin Cache-Control: no-store (el prefijo global exige coincidencia exacta). Paridad con /api/products%; documentado con test.
- ADV-009-23(j): la base permite current_order_id apuntando a un pedido no-open — el invariante lo mantiene el servicio por diseño (D-009-15); solo quebrantable por SQL directo. Considerar CHECK/trigger si en el futuro se escribe SQL manual.
- Reviewer: order.service.ts quedó en 90,16 % de líneas (sobre el umbral pero con margen fino; ramas 81,13 %). Reforzar cobertura de ramas en la 010, que toca el mismo servicio.
- Reviewer: 13 componentes de respuesta huérfanos en openapi.yaml (InvalidJson, TableOccupied, OrderNeedsTable, etc. — las rutas inlinean los errores). Cosmético; eliminarlos o referenciarlos en una próxima edición del contrato.
- ADV-004-20 (timeout en proceso real bajo carga) suma un segundo flake documentado de la misma clase que los timeouts web: pasa aislado (17/17) y falla solo bajo ~97 workers.

### Observaciones documentadas de la 010 (adversarial-tester y reviewer; deuda para decidir después)

- Reviewer: el 409 de `cancel` lista los códigos en texto plano sin anclas markdown a los componentes nombrados (las rutas nuevas de la 010 sí los usan); `OrderHasActiveItems` queda sin referencia directa. Estilo inconsistente, contenido correcto; uniformar en una próxima edición del contrato.
- ADV-010-08..19 documentan los vectores que resistieron: doble clic con la misma clave (1 comanda/1 ítem/1 key), clave no quemada en envío fallido, send‖join sin huérfanos y void post-merge en el destino, requestVoid‖voidItem con una sola comanda 'void', send‖cancel nunca cancela con ítems vivos, carrera al tope 99, hash del cuerpo validado estable, precio/nombre congelados tras update/deactivate de carta (regla 4), requestVoid‖requestVoid con un solo ganador, ids hostiles 400/404, Idempotency-Key duplicada → 400, roles en el ciclo de anulación, CHECKs de la migración activos.
- ADV-002-01: flake ambiental confirmado en la nube — el `it.fails` del documento más costoso <2 s pasa en VMs rápidas (vitest lo reporta "Expect test to fail") y falla como se espera en corridas lentas; el adversarial-tester analizó el gate y sigue siendo razonable, pero las notas de ítem y el motivo de anulación quedaron blindados con filtro `\p{Cc}\p{Cf}\p{Zl}\p{Zp}` antes de la Fase 3.
- ADV-007-27 endurecido por el adversarial-tester: la aserción del constraint `combo_items_unique` ya no depende del locale de Postgres (usa `error.parent.constraint`); verde en Postgres en inglés y en español.
- Orquestador: `pnpm --filter @polleria/web build` (next build) falla en main por `useSyncExternalStore` sin `getServerSnapshot` en `src/lib/primary-instance.ts` al prerenderizar /admin/carta — preexistente a la 010 (apps/web sin diff), heredado del patrón de la 004 ya documentado en la 008 como warning; ahora bloquea el build de producción. Decidir si se corrige como deuda propia.

### Observaciones documentadas de la 011 (adversarial-tester y reviewer; deuda para decidir después)

- ADV-011-13..20 documentan los vectores que resistieron: clave de envío estable por intento (misma en reintento, nueva por intento nuevo), corte local de observaciones hostiles (chars de control no llegan al POST), saneo local de cantidades (0/negativas/abc → 1), textos hostiles pintados literales sin XSS, controles de admin realmente ausentes del DOM del mozo (no ocultamiento CSS), sesión expirada → /login, el select de unión excluye las mesas del propio pedido, y la página de mesa sí ofrece reintento ante fallo de red (el hueco era solo el tablero, corregido como ADV-011-03).
- Reviewer (nota sin bloqueo): el campo 'Cantidad' del editor no acota a 99 en cliente; el esquema de shared lo corta al enviar. Candidato a pulido en una próxima espec.
- Decisiones de arbitraje: el fix de ADV-011-11 (selector 'Parte' limitado a lo ofertado) obligó a corregir AC-15 del lado de los tests — la aserción ['Pecho','Pierna'] sobre un producto solo-pierna fijaba el propio bug; quedó ['Pierna'] y el camino de dos cortes se cubre con 'Pollo a la brasa'. Quitar el ZWSP (ADV-011-08) obligó a anclar los localizadores e2e al listitem con precio de la sección Pedido (la comanda renderiza el nombre limpio del componente). El h1 sr-only 'Mozo' se quitó (ADV-011-09) actualizando las aserciones baseline 'Mozo'→'Mesas' en auth.test.tsx y auth-boundaries-003.adversarial.test.tsx.
- Estilo nuevo en el repo: azul ('Pedido listo', `text-blue-600`) y morado ('Pidió la cuenta', `text-purple-600`) usan paleta Tailwind porque el tema HeroUI no tiene token semántico para esos colores; verde/ámbar sí usan text-success/text-warning.

### Observaciones documentadas de la 012 (adversarial-tester y reviewer; deuda para decidir después)

- ADV-012-04..13 documentan los vectores que resistieron: guard de envío único por mutación (useRef+isPending, lección ADV-004-31) en alta/renombrar/desactivar/activar; liberación del guard tras fallo conservando el borrador; nombres hostiles (NFC, espacios, tope 40, bidi, tab, script, emoji) rechazados en local o guardados/pintados literales sin XSS; 401 → /login; respuestas fuera de esquema → mensaje genérico; Desactivar en paralelo con un solo envío; diálogo que sobrevive a la releída; mesa ocupada conserva Renombrar+Desactivar; sin fila duplicada tras el alta; Guardar inhabilitado con nombre NFD; mozo → RoleGuard '/admin'.
- Reviewer (deuda aceptable, no bloqueante): el helper `tableRow` de page.test.tsx usa `getByText` sincrónico tras `waitFor` de las llamadas MSW en AC-05/07/09/10 — se acopla al overlay `applied` que pinta en el mismo flush de la mutación; una implementación válida que pintara solo tras el refetch flaquearía. Recomendación al test-writer: búsqueda asíncrona (findByText) o dejar constancia del supuesto.
- Caso borde del overlay (recomendación del reviewer, coherente con el riesgo aceptado en spec §15): si otro dispositivo escribe la misma fila entre el baseline y nuestra escritura, `overlayWins` puede ocultar nuestro cambio confirmado hasta la siguiente releída (sin polling). Riesgo ínfimo en una pollería de un solo admin.
- Nit documental del reviewer: el encabezado de e2e/tables-admin.spec.ts dice semilla 'E2E Mesa 1' a '5' (la real siembra 5) mientras spec/tasks dicen '1 a 4'; armonizar en una próxima edición.
- Nota de entorno: la VM de una sesión arrancó sin las bases polleria_test/polleria_dev en el contenedor; el initialize del blueprint las recrea (misma receta que usó el reviewer). Registrar si vuelve a ocurrir.

### Otras deudas bajas abiertas

- 001 (backend-dev y reviewer): si la clave de DATABASE_URL trae un escape % mal formado, loadConfig la acepta y createSequelize la rechaza con un mensaje seguro, pero cli.ts termina con un rechazo no controlado y traza (server.ts termina limpio). Se puede cerrar haciendo que loadConfig use getPostgresConnectionParts y moviendo createSequelize dentro del try de cli.ts.
- 001 (reviewer): la fila "error del lector con estado 5xx → 500 y se registra" de la tabla 9.2 no tiene test de regresión (error-handler.ts:56). Pendiente para test-writer.
- 001: si la base no responde, el E2E falla por el timeout de 120 s del webServer sin una pista clara; se sugiere que la API registre una línea en su log al no poder conectar.
- 002 (reviewer): print-document.ts:109 compara con un carácter TAB literal; cambiar a '\t' o String.fromCharCode(0x09) en un refactor.
- 002 (reviewer): printer.service.ts:85 lanza RangeError (no PrinterError) si se inyecta un reloj que da fecha inválida; tenerlo en cuenta en la Fase 3.
- 002 (reviewer): file-driver.ts usa node:timers/promises, que la lista de D-002-08 no menciona; actualizar la spec en la Fase 3.
- 002 (backend-dev): un grafema como ñ seguido de ZWJ pierde la tilde y sale n (D-002-04 paso 4d). Sigue la spec; muy raro.

### Notas y vigilancia

- packages/shared tiene pocas líneas medidas (93,75 %); poco margen sobre el umbral de 90 %. Vigilar en la 003, que agrega esquemas a shared.
- db-cli AC-24 de la 001 superó una vez su límite de 12 s con la máquina cargada (pasa solo en 9 s). Vigilar si se vuelve intermitente.
- La suite completa tarda unos 100 s; ADV-002-01 suma unos 9 s.
- Pendiente manual del usuario: probar pnpm dev desde un celular en el wifi del local y sin internet (sección 16 de la spec 001).
- Aviso de peer opcional: @vitest/mocker 5.0.3 declara msw ^2.4.9 y el proyecto usa msw 3.0.2. Funciona.
- Web: un 503 con status ok, o un 200 con status error, se interpreta como unreachable (deben coincidir el código HTTP y el status).
- Producción: los rewrites de Next se calculan en next build, así que API_INTERNAL_URL debe estar definida al compilar (para la guía de instalación).
- R-09 de la 001: en Vitest 5 el umbral global de 80 % incluye también shared y services; es más estricto que el texto de la spec.
- Resuelto: Next 16.4.0 generaba apps/web/AGENTS.md cuando un agente corría next dev (agentRules: false en next.config.ts).
- Resuelto: apps/web usa zod 4.6.5 (librería ya aprobada) para loadWebServerConfig.

## Bloqueos

Ninguno.

Historial: el 2026-10-07 faltaba apps/api/.env; el usuario lo creó. Su clave real había quedado también en apps/api/.env.example, que se versiona; el orquestador restauró ese archivo antes de cualquier commit y verificó que el historial de git nunca tuvo la clave.
