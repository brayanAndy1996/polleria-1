# Cómo continuar el desarrollo — Sistema Pollería

## Reanudación exacta de 015 — 2026-10-17

- Corte vigente: T-01/I-01 completados (`7f63a89`, fixtures `1d94ff7`), shared24 archivos/1100 aprobadas +3 fallos esperados anteriores por el principal. Test-writer Luna prepara T-02 SQL/service/API y sus helpers; tiene el slotDB solo para rojo. Implementer I-02 GPT-6.1-sol medium lee contrato/tests y espera rojo antes de producción. Todavía sin consumo en sendItems (T-03/I-03 posterior) ni UI (T-04/I-04). No superponer DB. Ver verification.md y ui-plan.md de015.
- Vigente: P-03 respondida «conserva su saldo hasta un ajuste manual», ambos saldos permanentes. No pedir otra confirmación de esa regla ni aplicar reinicio diario. Spec aprobada; contract.md/OpenAPI0.12 preparado con8 rutas pending/670 refs. T-01 en test-writer Luna medium; I-01 seguirá con implementer Luna distinto. Transacciones/stock nuevos siguen GPT-6.1-sol medium. Los puntos inferiores que dicen pendiente describen el corte anterior.
- Rama `feat/015-basic-inventory`, desde main `90bbeed` (014 ya integrada). Leer docs/specs/015-basic-inventory/spec.md y tasks.md: propuesta, todavía sin contrato ni código de inventario.
- P-02 ya aprobada por usuario: no reponer al anular, devolución física por ajuste manual de administrador con motivo. No volver a preguntar. P-03 sigue pendiente: se preguntó hora/corte del nuevo día de pollo, bebidas con saldo permanente. Esperar respuesta antes de programar la política de fechas.
- T-00 terminado: test-writer `/root/test_writer_015_luna` y implementer `/root/implementer_015_luna`, ambos Luna medium y roles separados. Rojo `b490fb3` del split válido de medio en combo (0+0 en vez de 1+3); fix mínimo `88c1b0c`. Principal aprobó 88/88 en 6 archivos de pedidos/adversariales/pagos, tipos API y lint. Ambos agentes terminaron; siguiente bloque nuevo requiere resolver P-03 y cerrar spec, luego S-01. Ver verification.md de015. El inventario/transacciones complejas mantiene implementer GPT-6.1-sol medium.
- Principal verifica con `work/run-local-test.cjs` (fuera del repo), que lee solo DATABASE_URL_TEST de la copia Desktop y exige polleria_test. No tocar polleria_dev. Conservar roles separados y commits separados. Integración de 015 aún no autorizada.
- Este clon descarga solo dev por defecto: para actualizar main u otra rama usar fetch explícito de sus referencias antes de comparar/integrar. No confundir un origin/main antiguo con el estado real de GitHub.

## Estado vigente — 014 integrada y preparación de 015, 2026-10-17

- Integración de 014 a main autorizada por el usuario y realizada con merge `2e2202f`, desde `965c877`. Árbol idéntico a la rama verificada antes de docs: 2880 pruebas aprobadas, 5 fallos esperados previos y 96,71 % de líneas; 30 E2E aplicables aprobados en ejecuciones separadas. Los registros inferiores son históricos.
- Continuar con la spec 015 de inventario básico: pollo común por parte/octavos, bebidas compradas por unidad y descuento atómico al enviar pedido, sin duplicar en replay ni al cobrar. Preparar alcance y aclarar anulaciones/saldo diario/activación antes de implementar. No dar la 015 por aprobada o desarrollada por la integración de 014.
- Política vigente por instrucción del usuario: test-writer y trabajo sencillo con GPT-6-luna medium; implementación compleja con GPT-6.1-sol medium. Roles separados, sin reviewer/adversarial independientes. No usar automáticamente el reemplazo temporal de Luna de la 014.
- Trabajar en la copia `work/polleria-1`, sin worktrees; conservar intacta la copia Desktop. DB solo polleria_test a través de su .env, sin copiar credenciales ni migrar polleria_dev. La integración de 015 requerirá autorización posterior.

## 014 implementada y validada — 2026-10-16 (histórico)

- Dev integrado y publicado en main por autorización del usuario: merge `5e452c0`. El desarrollo nuevo está en `feat/014-cashier-payments`, sin integrar cobros a main.
- S-01…C-01 completados: schemas/dinero en soles, pre-cuenta/token, migración/modelo Payment, cierre transaccional/replay, cuatro endpoints, lista paginada/polling, confirmación/reintento, histórico e impresión manual. Validado con PostgreSQL17.5/polleria_test del usuario; ningún cambio en polleria_dev.
- Principal verificó regresión sin DB: 92 archivos, 2076 pruebas aprobadas y 3 fallos esperados existentes. Controller 8/8 adicional; dirigido cliente/componentes/controller 28/28. Builds Turbopack y Webpack aprobados; caché antigua preservada fuera de ruta activa para resolver fallo inicial de PostCSS.
- QA visual con fixtures interceptadas: 11 capturas a360/768/1440, sin overflow/pageerrors; foco/cancelación y retry con misma clave/cuerpo aprobados. Hoja print sin controles. Evidencia en docs/specs/014-cashier-payments/verification.md y qa/.
- El checkout real del usuario es `C:\Users\braya\Desktop\proyectos1\polleria - copia`, limpio en main; su .env conecta a polleria_test en localhost:5432, PostgreSQL17.5. El principal verifica desde `work/polleria-1` leyendo únicamente DATABASE_URL_TEST de ese archivo, sin copiar credenciales ni cambiar la copia del usuario. No crear bases/roles ni tocar polleria_dev.
- Cierre:149 archivos/2880 pruebas aprobadas,5 fallos esperados previos separados; cobertura de líneas96,71 %, shared99,32 %, servicios de pagos90,62 %. Umbrales existentes sin cambios. DB dirigida014:42/42. E2E reales:30 aprobados/14 no aplicables, en ejecuciones serializadas separadas. Tipos/lint globales aprobados; builds Turbopack/Webpack previos conservados, producción sin cambios posteriores. Historia y pruebas locales preservadas con merge `a06b4df` y conciliación sin perder casos.
- OpenAPI0.11:cuatro operaciones implemented,598 referencias verificadas. Siguiente paso: revisión del usuario de la rama014; integración a main/dev requiere autorización posterior. Sin prueba física, integración bancaria ni caja avanzada. Ver docs/specs/014-cashier-payments/verification.md para trazabilidad de todos los AC y límites.
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

Documento de traspaso para retomar el trabajo en una conversación nueva. Lo mantiene el orquestador.
Corte: 2026-10-15. Complementa (no reemplaza) a CLAUDE.md y docs/PROGRESS.md.

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

## Actualización anterior en Codex — 2026-10-12 (histórico)

- El usuario autorizó iniciar el desarrollo con los subagentes y modelos documentados en docs/agents/modelos-codex.md. La documentación fue publicada en main en 659061d. Trabajo actual en feat/013-kitchen-printing.
- spec-writer preparó docs/specs/013-kitchen-printing/spec.md y tasks.md como Borrador (14 AC y recomendaciones P-01…P-06); revisión documental independiente sin bloqueos materiales pendientes. El usuario aprobó la spec y P-01…P-06 el 2026-10-12 («está perfecto… puedes seguir con el desarrollo»). S-01 de contrato terminada (OpenAPI 0.10.0 con operaciones pendientes); T-01/T-02 en rojo causal y después T-09/T-10 verdes. A-01 independiente revalidó y convirtió ADV-002-01/02 a tests ordinarios; quedan otras deudas esperadas intactas. Implementación T-11/T-13 en curso tras rojo de T-03/T-05; tests API T-06/T-07 y web/E2E T-08 en desarrollo por subagentes test-writer separados. El usuario confirmó empezar con driver file y posponer hardware/ESC-POS hasta disponer de datos de la impresora.
- Baseline: los 29 fallos web reproducidos durante onboarding fueron clasificados por test-writer como defectos de sincronización de pruebas. Sus dueños corrigieron esperas y un fixture MSW conservando aserciones: 22/22 normales y 59/59 adversariales pasan; reviewer independiente aprobó el mantenimiento. Suite completa del orquestador: 122 archivos aprobados, 2418 pruebas aprobadas, 6 fallos esperados y 2 omitidas; tipos/lint pasan. La 013 está aprobada y en TDD; no se ha cerrado ni validado su comportamiento todavía. E2E y cobertura no se reejecutaron para este mantenimiento de sincronización.
- El entorno actual usa PostgreSQL 17.11 instalado en /workspace/.cloud-setup, no Docker; arranque con bash /workspace/.cloud-setup/start-postgres.sh. Las bases locales fueron creadas con autorización explícita del usuario. No imprimir conexiones del .env ni reemplazarlas. Scripts reutilizables guardados en el borrador del entorno, sin publicación confirmada. Chromium empaquetado no se pudo descargar, pero el Chromium del sistema 154.0.8037.57 abre y permitió 8/8 E2E baseline mobile home/auth mediante configuración local externa. E2E 013 y suite E2E completa aún pendientes.

## Actualización histórica de esta copia en Devin

- La 012 (administración de mesas en /admin) está **INTEGRADA a main** (merge c26c6c4, 2026-10-12, --no-ff autorizado por el usuario) — con ella la Fase 2 queda cerrada en código. Reviewer APROBADO en 1.ª vuelta sobre 3e293ec: spec aprobada el 2026-10-12 con las 7 respuestas del §17; 11 AC con 38 pruebas + 1 e2e mobile-chrome; TDD con rojo por ausencia; 34 adversariales con 3 hallazgos corregidos en producción (medios: refetch fallido borraba lista+borrador y overlay `applied` sin reconciliar; bajo: error persistía al editar — abiertos 0); el test-writer corrigió los 7 e2e obsoletos que la 011 dejó en main (encabezados 'Mozo'→'Mesas', b52e99b). Verificación del orquestador: pnpm test 2418 verdes (única falla la ambiental ADV-002-01), lint/typecheck 0, e2e AC-11 verde, cobertura del archivo nuevo 98,96 %, api/shared/openapi sin diff (0.9.0).
- La 011 (pantallas del mozo) está **INTEGRADA a main** (merge 66681f8, 2026-10-12, --no-ff autorizado por el usuario): spec aprobada el 2026-10-11 con las 12 respuestas del §17; 24 AC con 62 pruebas + 3 e2e mobile-chrome; TDD con rojo por ausencia; 30 adversariales con 12 hallazgos corregidos en producción (3 altos: idempotencia del ciclo de anulación por intento, destino inhabilitado en Mover/Unir, tablero en blanco ante fallo de red; 4 medios; 5 bajos — abiertos 0); defectos de tests arbitrados a sus dueños (AC-15 fijaba el bug de la 'Parte', localizadores e2e tras quitar el ZWSP, encabezados baseline 'Mozo'→'Mesas'); bloqueantes del reviewer corregidos (colores de estado, grilla 2 columnas a 360 px, 'Solicitar anulación' visible al admin); APROBADO en 2.ª vuelta sobre `6f8cef3`. Verificación del orquestador: pnpm test 2347 verdes (única falla la ambiental ADV-002-01), lint/typecheck 0, e2e 3/3, cobertura nuevas pantallas 100/98,63/83,82 %, api/shared/openapi sin diff (0.9.0).
- La 010 (ítems del pedido, comandas como registro, ciclo de anulación mozo→admin) está **INTEGRADA a main** (merge 5110579, 2026-10-11, --no-ff autorizado por el usuario): spec aprobada 2026-10-10 con la decisión del usuario de que el mozo SOLICITA la anulación y el admin aprueba/rechaza; TDD (rojo válido, T-01 a T-06); implementación T-07 a T-11 en verde; 19 adversariales ADV-010-01..19 con 7 hallazgos corregidos en producción (2 críticos: octavos corruptos en componente 'half' y replay fantasma de anulación; 2 altos; 2 medios; 1 bajo — abiertos 0); defectos de tests arbitrados al test-writer (TRUNCATE por FKs, closes inconsistentes, sobres); bloqueante del reviewer (paths ausentes en OpenAPI) corregido. Verificación del orquestador: pnpm test 2218 verdes (única falla la ambiental autorizada ADV-002-01), lint y typecheck en 0, cobertura global 98,4 % de líneas, OpenAPI 0.9.0 válido con Redocly.
- Entorno en la nube: la sesión levantó su propio PostgreSQL 17.5 en Docker con polleria_dev y polleria_test (apps/api/.env local) y el blueprint del repo lo reproduce; ADV-007-27 quedó endurecido al locale; ADV-002-01 flakea en VMs rápidas (deuda autorizada). Correr `pnpm test` SIEMPRE desde la raíz (vitest.config serializa las suites de polleria_test; `pnpm --filter` o vitest suelto rompe el aislamiento). Pendiente conocido: `pnpm --filter @polleria/web build` falla en main por `useSyncExternalStore` sin `getServerSnapshot` en src/lib/primary-instance.ts (deuda registrada en PROGRESS).

- La 003 está INTEGRADA a main (merge 80340c3) y la 004 (gestión de usuarios por el administrador) también (merge 35334d6, 2026-10-08): spec aprobada, 27 AC, TDD, 53 adversariales con 9 hallazgos corregidos (abiertos 0), reviewer APROBADO, verificación del orquestador completa (pnpm test 1036+7 esperadas, lint, typecheck, cobertura y E2E 16/16 en verde).
- La 005 (productos y precios de la carta) está INTEGRADA a main (merge 2af8023, 2026-10-08): spec aprobada con 10 recomendaciones, 15 AC, TDD (113 casos nuevos en rojo), implementación de dominio + API (sin pantallas), 33 adversariales con 2 hallazgos corregidos y revalidados (abiertos 0; 3 huecos documentados como deuda), reviewer APROBADO, verificación del orquestador completa (pnpm test 1207+7 esperadas, lint, typecheck, cobertura con código 0 y E2E 16/16 en verde; OpenAPI 0.5.0 validado con Redocly).
- La 004 documenta la Aclaración 1: '/admin' se guarda en localStorage pero NO es puesto de trabajo (el aterrizaje directo y el usuario recordado solo aplican a /mozo, /caja, /cocina).
- Verificación FINAL del orquestador: pnpm test y pnpm test:coverage pasan con 786 pruebas aprobadas + 7 fallas esperadas autorizadas (793); líneas globales 98,12 %, shared 97,36 %, services/auth 98,46 % y services/users 91,66 %. Lint, tipos e instalación congelada pasan. E2E: 14 aprobados y 2 no aplicables, incluidos los recorridos nuevos de la 003.
- El principal escribió ese trabajo inicialmente sin subagentes, aunque comprobó el rojo antes del verde. El usuario corrigió el proceso: desde ahora se exige el equipo de docs/agents/ con SDD, TDD y pruebas adversariales. No atribuir retrospectivamente la implementación inicial al equipo.
- Configuración nativa añadida en .devin/agents/ y .devin/rules/orquestacion-sdd-tdd.md. El principal actúa como orquestador y no escribe producción ni tests. Usar perfiles disponibles con las instrucciones del rol si los perfiles personalizados aún no aparecen en la sesión.
- El spec-writer confirmó coherencia documental. El test-writer auditó y reforzó los 44 AC: 193 casos de la 003 en verde y E2E 14 pasan/2 no aplicables, sin editar producción. También aisló la preparación E2E en Node nativo para resolver el conflicto del cargador Playwright/Sequelize, conservando guardias de datos.
- El adversarial-tester añadió 35 casos: 32 verdes y 3 rojos en dos hallazgos medios (ADV-003-06 y ADV-003-14). Críticos/altos: 0 en esa auditoría. El usuario aprobó corregir ambos; el spec-writer aclaró spec/tasks sin ampliar los 44 AC.
- Backend-dev y frontend-dev corrigieron los dos hallazgos en archivos disjuntos, con rojo antes y verde después y sin editar pruebas. El adversarial-tester revalidó y amplió casos: 44/44 propios en verde, hallazgos abiertos 0. Reviewer independiente: APROBADO, sin bloqueantes; el orquestador repitió personalmente las verificaciones en serie.
- Integraciones 003 y 004: autorizadas y hechas (merges 80340c3 y 35334d6). main queda con ambas.
- La 006 (presentaciones y partes del pollo en octavos) está INTEGRADA a main (merge 4afbc66, 2026-10-09): spec aprobada con 6 recomendaciones, 14 AC, TDD (141 pruebas nuevas en rojo), tabla product_portions + chickenConsumption + GET/PUT /api/products/{id}/portions, 28 adversariales con 3 altos + 1 bajo corregidos y revalidados (abiertos 0; observaciones bajas documentadas como deuda en PROGRESS.md), reviewer APROBADO, verificación del orquestador completa (pnpm test 1376+7 esperadas, lint, typecheck, cobertura código 0 —global 98,35 %, shared 99,04 %, services/products 95,89 %— y E2E 16/16; OpenAPI 0.6.0 validado con Redocly).
- Integraciones 003, 004, 005 y 006: autorizadas y hechas (merges 80340c3, 35334d6, 2af8023 y 4afbc66). main queda con las cuatro.
- La 007 (combos) está INTEGRADA a main (merge 892914a, 2026-10-09): spec aprobada con 10 recomendaciones, 15 AC, TDD (~150 pruebas nuevas en rojo), categoría 'combo' + tabla combo_items + comboChickenConsumption + GET/PUT /api/products/{id}/items con reemplazo atómico serializado (FOR NO KEY UPDATE desde el diseño), 30 adversariales con 0 hallazgos (10 observaciones como deuda), reviewer APROBADO, verificación del orquestador completa (pnpm test 1549+7 esperadas, lint, typecheck y E2E 16/16 en verde; cobertura global 98,47 % —verificada por el reviewer sobre el mismo árbol—; OpenAPI 0.7.0 validado con Redocly).
- Integraciones 003 a 007: autorizadas y hechas (merges 80340c3, 35334d6, 2af8023, 4afbc66 y 892914a). main queda con las cinco.
- La 008 (pantallas de administración de la carta) está INTEGRADA a main (merge 01d23bb, 2026-10-09): spec aprobada con 10 recomendaciones, 21 AC, TDD (rojo por módulos ausentes; 4 defectos de pruebas corregidos por el test-writer), money.ts en shared + pantallas /admin/carta (lista, alta, edición con grilla de presentaciones y editor de componentes con comparación de precios), 157 tests adversariales verdes con 9 hallazgos corregidos y revalidados (1 alto: crash por cantidad Infinity; abiertos 0), reviewer APROBADO, verificación completa (pnpm test 1866+7 esperadas — una corrida del orquestador dio 3 timeouts de findByRole bajo ~97 workers que pasan aislados, flake documentado—, lint, typecheck, cobertura código 0 —global 98,5 %, shared 99,35 %— y E2E 20/20 con los 4 recorridos nuevos; OpenAPI 0.7.0 intacto porque la 008 solo consume el contrato; apps/api sin diff).
- Integraciones 003 a 008: autorizadas y hechas (merges 80340c3, 35334d6, 2af8023, 4afbc66, 892914a y 01d23bb). main queda con las seis; la Fase 1 está completa en código.
- La 009 (mesas del salón + ciclo del pedido sin ítems) está INTEGRADA a main (merge 389e86f, 2026-10-10): spec aprobada con 13 recomendaciones, 21 AC, TDD (156 pruebas en rojo; 3 defectos de pruebas corregidos por el test-writer), tablas orders+tables con puntero invertido current_order_id, estados derivados, abrir/mover/unir/separar/listo/servido/cuenta/cancelar con FOR NO KEY UPDATE, 24 adversariales con 2 hallazgos corregidos (alto: lectura rasgada del tablero → REPEATABLE READ; medio: rutas sin cuerpo rechazaban cuerpos → bypass del lector; abiertos 0), reviewer APROBADO, verificación completa (pnpm test 2091+7 esperadas, lint, typecheck, cobertura código 0 —global 98,33 %, shared 98,57 %— y E2E 20/20; OpenAPI 0.7.0→0.8.0 aditivo validado con Redocly; apps/web sin diff).
- Integraciones 003 a 009: autorizadas y hechas (merges 80340c3, 35334d6, 2af8023, 4afbc66, 892914a, 01d23bb y 389e86f). main queda con las siete.
- División de la Fase 2 (propuesta del spec-writer de la 009): 009 mesas + ciclo sin ítems (integrada), 010 ítems/idempotencia/comandas/anulación (RF-04 a RF-07), 011 pantallas del mozo, 012 administración de mesas (o dentro de 011).
- Próxima acción: la 012 ya está integrada (merge c26c6c4) y la Fase 2 quedó cerrada. La 013 abre la Fase 3 (cocina: impresión de comandas — requiere antes resolver la deuda ADV-002-02 del driver file y la puerta de ADV-002-01); el spec-writer prepara la propuesta en feat/013-* cuando el usuario lo autorice.
- Pendientes MANUALES de la 010 (spec §18): `pnpm db:migrate` en polleria_dev (aplica 20261011120000-create-order-items.ts — order_items, order_item_components, order_item_sauces, kitchen_tickets, idempotency_keys) y el recorrido por API: abrir la Mesa 3 como mozo; `POST /api/orders/{id}/items` con `Idempotency-Key` y una tanda mixta (pollo con parte + bebida + combo + crema + observación) → 201 con ítems copiados, comanda 'initial' y `totalCents`; repetir la misma llamada → misma respuesta sin duplicar; `GET /api/orders/{id}/tickets` → una comanda; segunda tanda → comanda 'additional'; como mozo `POST .../items/{itemId}/request-void` con motivo → 'void_requested' sin comanda; como admin `POST .../items/{itemId}/void` con motivo → 'voided' con comanda 'void' y ambas auditorías (o `reject-void` → vuelve a 'sent'); `GET /api/orders/{id}` → total actualizado; `POST .../cancel` con ítems enviados → 409; `GET /api/menu` → la carta armada.
- Pendientes MANUALES de la 012 (spec §18): con pnpm dev y la cookie de un admin, recorrer /admin/mesas — alta en línea, renombrar por diálogo, error de nombre repetido, desactivar una mesa libre y una ocupada (con la confirmación), reactivar; todo a 360 px y en la PC sin desplazamiento horizontal.
- Seguridad: nunca tocar polleria_dev. El usuario autorizó limpiezas solo de users, sessions, SequelizeMeta, SequelizeData, fixture_a, fixture_b, fixture_seed_rows, FixtureMeta y FixtureData en polleria_test, con guardias. No crear/borrar bases ni roles. Serializar Vitest, cobertura y Playwright y asignar turnos exclusivos de la base a los subagentes.
- Pendientes MANUALES: R-003-06 (PIN oculto y Ctrl+C en PowerShell real), celular del local sin internet y versión real de Chrome; se documentan conforme a T-21/T-26 y no se sustituyen con E2E. No se han migrado polleria_dev ni creado administradores reales. CLAUDE.md ya registra bcrypt y users:create-admin.
- Pendientes MANUALES de la 005: el usuario debe ejecutar `pnpm db:migrate` en polleria_dev (aplica 20261008180000-create-products) y, con pnpm dev y una cookie polleria_session, probar: POST de un producto como admin → 201; GET sin cookie → 401; PATCH de precio e isActive; duplicado con otra capitalización → 409 'Ya existe un producto con ese nombre.'; priceCents 185000 → error de rango; POST como mozo → 403 'No tienes permiso para realizar esta acción.'.
- Pendientes MANUALES de la 006 (spec §18): el usuario debe ejecutar `pnpm db:migrate` en polleria_dev (aplica 20261009120000-create-product-portions.ts) y, con pnpm dev y la cookie polleria_session de un admin, probar: POST producto 'chicken' → 201; PUT /api/products/{id}/portions con la grilla → 200; GET ordenada (sin cookie → 401); PUT con portions:[] → lista vacía; half con cut 'leg' → 400 'La parte no corresponde...'; PUT en producto de otra categoría → 409 'Solo los productos de la categoría Pollo pueden tener presentaciones.'; PATCH de category con filas cargadas → 409 'Este producto tiene presentaciones de pollo; quítalas antes de cambiar su categoría.'; PUT como mozo → 403.
- Pendientes MANUALES de la 007 (spec §18): `pnpm db:migrate` en polleria_dev (aplica 20261009180000-create-combo-items.ts, que también amplía el CHECK de categorías) y, con pnpm dev y la cookie polleria_session de un admin, probar: POST /api/products `{ name: 'Mostrito', category: 'combo', priceCents: 2200 }` → 201; PUT /api/products/{id}/items con pollo (quarter, leg) + chaufa → 200 con el producto embebido; GET con sesión de mozo → 200 (sin cookie → 401); PUT sobre un 'dish' → 409 COMBO_ITEMS_NOT_ALLOWED; componente 'combo' → 400 con su issue; PATCH `{ category: 'dish' }` sobre el combo → 409 PRODUCT_HAS_ITEMS; PUT `{ items: [] }` y reintentar → 200.
- Pendientes MANUALES de la 008 (spec §18): sin migraciones nuevas (la 008 no toca la API). Con pnpm dev y la cookie de un admin, recorrer /admin/carta: crear un producto no-pollo → vuelve a la lista; crear un 'chicken' → va a su edición y cargar la grilla de presentaciones; crear un 'combo' y armar sus componentes viendo la comparación de precios; desactivar un producto con la confirmación y reactivarlo; errores 409 reales (cambiar la categoría de un pollo con presentaciones y de un combo con componentes); todo también a 360 px sin desplazamiento horizontal.
- Pendientes MANUALES de la 009 (spec §18): `pnpm db:migrate` en polleria_dev (aplica 20261010120000-create-tables-orders.ts — crea orders y tables); crear las mesas por API con cookie de admin (POST /api/tables { "name": "Mesa 1" } …); y con sesión de mozo verificar: GET /api/tables (todas free), POST /api/tables/{id}/orders → occupied, POST /api/tables/{id}/join con otra mesa → un pedido cubriendo dos, POST /api/orders/{id}/request-bill → bill_requested, POST /api/orders/{id}/ready → ready, POST /api/orders/{id}/served → vuelve a occupied, POST /api/orders/{id}/cancel { "reason": "prueba" } → mesas libres.
- Pendientes MANUALES de la 004 (spec §17): con pnpm dev, como administrador en /admin → Usuarios: crear un mozo y verlo en la lista; rechazo de PIN '1234' y username repetido; el mozo entra con su PIN a /mozo; cambio de roles (mozo → cajero solo entra a Caja); restablecer PIN (su sesión muere y entra con el nuevo); desactivar (sale de /login) y reactivar (vuelve con el último PIN); el único admin no puede quitarse el último rol admin; probar a 360 px sin desplazamiento horizontal.
- Redocly CLI 1.34.5 exacta validó OpenAPI 0.3.1 con código 0 y 11 advertencias admitidas por R-003-08; no se añadió al proyecto. devin doctor validó los siete perfiles mediante el ejecutable instalado (no está en PATH), y no quedaron servidores de prueba activos.

El resto de este documento conserva el traspaso original como referencia histórica y técnica.

## 1. Resumen en 30 segundos

- Fase 0 (base del proyecto): TERMINADA, integrada a main y aprobada por el usuario.
  - 001-base-monorepo: monorepo pnpm, API Express + Sequelize + PostgreSQL, web Next.js + HeroUI + Tailwind, GET /api/health, pantalla "Conectado", migraciones con umzug, guardia de base de pruebas.
  - 002-printer-service: PrinterService con driver file (tmp/comandas), normalización de texto a 48 columnas, comando pnpm printer:test.
- Fase 1 (usuarios y carta): EN CURSO.
  - 003-users-pin-login: spec APROBADA (con revisión 1: varios roles por persona). Rama feat/003-users-pin-login. Todavía no hay código ni tests de la 003.
  - Siguiente acción: delegar a backend-dev la tarea T-01 (instalar bcrypt) y luego a test-writer los tests en rojo.
- Estado de main: Vitest 549 pasan + 7 fallas esperadas (deuda autorizada con it.fails) de 556; E2E 7 pasan + 1 omitido por diseño; lint y typecheck en 0; cobertura de líneas ~98 %.

## 2. Primeros pasos en la conversación nueva (orquestador)

1. Leer CLAUDE.md (se carga solo), este archivo, docs/PROGRESS.md y `git log --oneline -20`.
2. Confirmar la rama: `git branch --show-current` debe dar feat/003-users-pin-login y `git status --short` debe estar limpio.
3. Verificación rápida (opcional pero recomendada): `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (deben dar 549 pasan + 7 fallas esperadas mientras no haya tests de la 003).
4. Dar al usuario el REPORTE DE AVANCE (formato en .claude/agents/orquestador.md) con el estado y el próximo paso.
5. Continuar con la sección 3.

## 3. Estado exacto y siguiente acción

Funcionalidad 003-users-pin-login, paso 4 de 9 del ciclo. Documentos:
- Spec: docs/specs/003-users-pin-login/spec.md (Aprobada; 44 AC; sección 19 resume la revisión 1).
- Tareas: docs/specs/003-users-pin-login/tasks.md (T-01 a T-28).
- Contrato: docs/api/openapi.yaml versión 0.3.1 (rutas /auth/users, /auth/login, /auth/me, /auth/logout).
- ADR: docs/decisions/0002-sesion-pin-y-limite-de-intentos.md (Aceptado).

Orden de trabajo que falta (ver "Orden y por qué" en tasks.md):
1. T-01 (backend-dev, solo configuración): `pnpm --filter @polleria/api add bcrypt@6.0.0` y `add -D @types/bcrypt@6.0.0`; en pnpm-workspace.yaml agregar `ignoredBuiltDependencies: [bcrypt]` (no onlyBuiltDependencies; bcrypt trae binario para win32-x64). Verificar que carga con un script en el scratchpad. Commit `feat(003): instala bcrypt para el PIN`. El orquestador verifica después: install --frozen-lockfile, lint, typecheck, test.
2. T-02 a T-14 y T-27 (test-writer): tests en rojo de los 44 AC. Incluye ajustar el helper de limpieza de la base (users y sessions; sección 12 de la spec). Cada archivo con `describe('003: ...')`.
3. T-15 (backend-dev) primero: esquemas Zod de usuarios, roles y sesión en packages/shared (frontend-dev los necesita y no puede tocar shared).
4. En paralelo: backend-dev T-16 a T-21 (migraciones users con roles VARCHAR(16)[] y sessions, bcrypt, token de sesión, límite de intentos, requireAuth/requireRole, rutas /api/auth, servicio de usuarios, comando pnpm users:create-admin) y frontend-dev T-22 a T-24 y T-28 (cliente HTTP lib/api, /login con lista de nombres y teclado de PIN, guardia por rol, /mozo, /caja, /cocina, /admin, /areas "¿Dónde vas a trabajar?", "Cambiar de área", "Cerrar sesión").
5. T-25 (frontend-dev): E2E en verde (necesita el backend terminado).
6. T-26: verificación final. Luego pasos 6 a 9 del ciclo: adversarial-tester, reviewer, definición de terminado, PROGRESS.md y permiso del usuario para integrar a main con `git merge --no-ff`.
7. Al cerrar la 003: registrar en CLAUDE.md bcrypt 6.0.0, @types/bcrypt 6.0.0 y el comando pnpm users:create-admin; marcar la 003 como cerrada en PROGRESS.md.
8. Después de integrar la 003, el usuario crea su administrador con `pnpm db:migrate` y `pnpm users:create-admin` (en PowerShell, para que el PIN no se vea).

Decisiones aprobadas de la 003 (detalle en la spec y en PROGRESS.md):
- Sesión: token aleatorio de 32 bytes en la cookie `polleria_session` (HttpOnly, SameSite=Strict, Path=/, sin Secure porque el local usa http://IP), y la base guarda solo su SHA-256 en la tabla sessions. Sin JWT y sin variables de entorno nuevas. Duración fija de 16 h. Logout borra la fila.
- PIN de 4 a 6 dígitos, bcrypt costo 10. Límite: 5 intentos fallidos bloquean al usuario 15 min (por usuario y en memoria, no por IP: el rewrite de Next no pasa la IP del celular).
- /login muestra una lista de usuarios activos (nombre, sin rol) y un teclado numérico; el equipo recuerda el último usuario.
- Varios roles por persona (users.roles, arreglo con CHECK de no vacío, sin repetidos y solo waiter, kitchen, cashier, admin). requireRole deja pasar con al menos uno. El administrador entra a todas las áreas.
- Con una sola área se entra directo; con varias, a la última usada en ese equipo (localStorage polleria:lastArea) o a /areas. Enlace "Cambiar de área" en la barra superior.
- pnpm users:create-admin es interactivo y solo crea administradores; asignar otros roles es de la 004.

## 4. Mapa del repositorio

- CLAUDE.md: constitución (reglas, glosario, versiones exactas, comandos). Leer siempre.
- .claude/agents/: definiciones del orquestador y de los 6 subagentes. .claude/agent-memory/<agente>/: memoria de proyecto de cada subagente (se versiona; el orquestador la commitea con prefijo docs).
- docs/planificacion.md: requerimientos originales (RF, RNF, historias).
- docs/PROGRESS.md: estado, tabla de funcionalidades, decisiones del usuario, deuda, bloqueos.
- docs/specs/001-base-monorepo, 002-printer-service, 003-users-pin-login: spec.md y tasks.md de cada funcionalidad.
- docs/decisions/0001-stack-y-versiones.md y 0002-sesion-pin-y-limite-de-intentos.md: ADR (ambos Aceptados).
- docs/api/openapi.yaml: contrato (versión 0.3.1).
- apps/api/src: config/env.ts (loadConfig, CONFIG_VARIABLES), db/ (sequelize.ts, migrator.ts con umzug y bloqueo consultivo, cli.ts, assert-test-database.ts, postgres-url.ts, migrations/, seeders/), errors/, middlewares/ (error-handler, body-reader), services/ (health.service.ts, printer/), controllers/, routes/, app.ts, server.ts, print-test-page.ts.
- apps/api/tests: integración (helpers/, fixtures/, adversarial/).
- apps/web/src: app/ (layout, page, providers), components/server-status.tsx, lib/api/health.ts, config/server-env.ts; apps/web/tests (setup MSW, adversarial).
- packages/shared/src: TIME_ZONE, esquemas de salud y error, ERROR_CODES, toLimaDateTimeParts.
- e2e/home.spec.ts; playwright.config.ts y vitest.config.ts en la raíz.

## 5. Entorno y base de datos (cuidado)

- Windows 11, Git Bash para comandos; Node 24.1.0, pnpm 10.12.1, PostgreSQL 17.5 en localhost:5432 (servicio postgresql-x64-17). Hay un PostgreSQL 18 en el 5433 que NO se usa.
- apps/api/.env existe (lo creó el usuario) con NODE_ENV, HOST, PORT, DATABASE_URL (polleria_dev) y DATABASE_URL_TEST (polleria_test). NUNCA imprimir su contenido ni la clave. Para mirar URLs, enmascarar: `sed -E 's#(postgres(ql)?://[^:/@]+:)[^@]*@#\1****@#g'`.
- Ya pasó una vez que el usuario puso su clave real también en apps/api/.env.example (que se versiona). Si `git status` muestra ese archivo modificado, revisar con la clave enmascarada y restaurarlo (`git checkout -- apps/api/.env.example`) antes de cualquier commit.
- Ningún agente crea, borra ni recrea bases ni roles. Las pruebas usan solo polleria_test; db:migrate y db:seed van sobre polleria_dev.
- Puertos: dev 3000 (web, 0.0.0.0) y 4000 (API, 127.0.0.1); E2E 3100 y 4100. Antes de `pnpm test:e2e` comprobar que estén libres (detener pnpm dev).
- En la shell, `python` abre el acceso directo de Microsoft Store y se cuelga: usar `node -e` para scripts.
- El repositorio vive en GitHub (`github.com/brayanAndy1996/polleria-1`, remoto `origin`): el trabajo es virtual, cada sesión clona desde GitHub y los cambios vuelven con push. Integrar a `main` solo con permiso del usuario y `git merge --no-ff`. Las notas de Windows de esta sección describen el equipo del usuario; una sesión en la nube no ve su PostgreSQL y necesita una base propia (el usuario autoriza cómo se crea en cada caso).

## 6. Cómo trabaja el equipo (prácticas que funcionaron)

- Ciclo por funcionalidad: rama feat/NNN → spec-writer → aprobación del usuario → test-writer (rojo) → backend-dev/frontend-dev (verde) → adversarial-tester → reviewer → definición de terminado → PROGRESS.md → permiso para integrar.
- Los subagentes no ven la conversación: cada encargo lleva ruta de la spec, IDs de tareas, AC, rama, decisiones del usuario, avisos técnicos conocidos y el reporte esperado.
- Si una funcionalidad trae dependencias nuevas o es la base, primero una tarea de instalación o andamiaje (solo configuración) y después los tests en rojo, para que fallen por la razón correcta.
- Los AC se numeran desde AC-01 en cada spec; cada archivo de prueba usa `describe('NNN: ...')` para distinguirlos. Los adversariales usan IDs ADV-NNN-xx en */tests/adversarial/*.adversarial.test.ts.
- Agentes en paralelo: solo si tocan carpetas distintas; commits con rutas explícitas (nunca `git add -A`); nunca dos instalaciones de paquetes a la vez (lockfile).
- Arbitraje: si un implementador dice que un test está mal, el orquestador lo verifica y lo corrige el dueño del test (test-writer o adversarial-tester). Ya pasó una vez (glob sin barra en la 001).
- Hallazgos adversariales medios y bajos: se pregunta al usuario. "Corregir ahora" → enmienda corta de la spec (AC nuevos), tests en rojo, corrección (así se hizo en la 001). "Dejar como deuda" → el adversarial-tester marca sus tests con it.fails y comentario (así se hizo en la 002).
- Verificaciones que el orquestador corre siempre él mismo: pnpm install --frozen-lockfile, pnpm lint, pnpm typecheck, pnpm test, pnpm test:coverage, pnpm test:e2e (puertos libres), y que ningún commit feat/fix/refactor toque tests:
  `git log main..HEAD --format="%h %s" --name-only | awk '/^[0-9a-f]{7} (feat|fix|refactor)/{t=1;h=$0;next} /^[0-9a-f]{7} /{t=0;next} t&&NF{print h" -> "$0}' | grep -E "\.test\.tsx?$|/tests/|^e2e/"` (debe salir vacío).
- La memoria de cada subagente (.claude/agent-memory/) suele quedar sin commit: el orquestador la incluye en su commit docs.
- Commits del orquestador: prefijo docs y línea de atribución Co-Authored-By.

## 7. Trampas técnicas conocidas

- TypeScript 6.0.3 (no 7). La API y shared corren con type stripping de Node 24: solo sintaxis borrable e imports relativos con .ts.
- Vitest 5: proyectos en test.projects; cobertura solo en la raíz; umbrales por glob; it.fails, it.fails.each e it.runIf(...).fails existen.
- Zod 4: `z.string().max(n)` cuenta puntos de código, no unidades UTF-16; usar `.refine(v => v.length <= n)` cuando la spec mida con .length. Zod ejecuta los refine aunque z.url ya falló: proteger con URL.canParse.
- Las herramientas Write/Edit convierten escapes \uXXXX en el carácter real; para U+2028/U+2029 en regex usar String.fromCharCode o new RegExp.
- ESLint prohíbe cualquier llamada `.sync(` en apps/api/src (usar FileHandle.datasync, no sync).
- Next 16.4.0: no permite dos next dev en la misma carpeta; bloquea /_next desde IP en desarrollo salvo WEB_ALLOWED_DEV_ORIGINS; agentRules: false evita que genere AGENTS.md.
- superagent serializa un Buffer como JSON si el Content-Type es JSON (usar el helper sendRawBody de los tests).
- Playwright solo da por listo un webServer con HTTP 200 a 403; si la base no responde, la API da 503 y el E2E espera 120 s.
- pnpm 10: revisar "Ignored build scripts" al instalar; bcrypt va en ignoredBuiltDependencies.
- openapi-typescript sigue diferido (peer typescript ^5); la web tipa con los esquemas Zod de @polleria/shared.

## 8. Preferencias observadas del usuario

- Aprueba casi siempre "con las recomendaciones" y prefiere que el orquestador proponga una opción recomendada en cada pregunta.
- Quiere reportes en el formato REPORTE DE AVANCE, en español sencillo.
- No quiere aprobar de nuevo cambios que no afectan lo que ve el usuario final (el orquestador decide y lo registra).
- Integra a main con commit de merge (--no-ff).
- En la 001 eligió corregir los hallazgos menores; en la 002 eligió dejarlos como deuda. Preguntar cada vez.
- Cambió un supuesto de negocio (varios roles por persona): revisar con cuidado los supuestos de negocio de cada spec antes de mostrarla.

## 9. Preguntas pendientes para el dueño de la pollería

- Marca y modelo de la impresora térmica (para el driver escpos de la Fase 3).
- Versión de Chrome en los celulares de los mozos (se asume 111 o superior).
- ¿Vende 1/8? ¿Cómo arma el 1/2 (pecho + pierna o a elección)? ¿Cobra distinto pecho y pierna? Platos y precios sueltos (el modelo de la 006 ya cubre todas las respuestas).
- Combos: ¿qué combos vende hoy y a qué precio (mostrito, pollo + gaseosa, familiar)? Sirve para el seed de la Fase 6 — el modelo de la 007 ya está decidido. ¿El cliente elige pecho/pierna del pollo del combo al pedir? (decisión de la Fase 2).
- ¿Las cremas se cobran? ¿Descartables para llevar? (quedaron como producto 'extra' aparte) ¿Cuántos vasos rinde una jarra?
- ¿Quién puede anular pedidos? (Fase 2). ¿Qué comprobante emite y en qué régimen? (fuera del prototipo).

## 10. Plan que sigue

- Fase 1 (propuesta, cada una con su spec): 004 gestión de usuarios, 005 productos y precios, 006 presentaciones y octavos, 007 combos — todas cerradas o integradas; 008 pantallas de administración de la carta (siguiente). Al terminar: punto de control de fin de fase con el usuario.
- Fase 2 mesas y pedidos (RF-02 a RF-07), Fase 3 comandas impresas (RF-08 a RF-11; antes corregir ADV-002-02 y revisar ADV-002-01), Fase 4 caja y cobro (RF-13 a RF-17), Fase 5 inventario (RF-20 a RF-24), Fase 6 reportes, auditoría y datos de demostración (RF-25 a RF-27).

## 11. Comandos útiles

- pnpm dev (web 3000 + API 4000) y abrir http://localhost:3000 → "Conectado".
- pnpm test · pnpm test:coverage · pnpm test:e2e (con pnpm dev detenido) · pnpm lint · pnpm typecheck.
- pnpm db:migrate · pnpm db:seed (polleria_dev) · pnpm printer:test (hoja de prueba en tmp/comandas).
- Desde la 003 (cuando esté implementada): pnpm users:create-admin.
