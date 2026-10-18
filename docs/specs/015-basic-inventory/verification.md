# Evidencia de preparación de 015 — 2026-10-17

## Estado y límites

014 integrada en main con autorización del usuario, merge `2e2202f`; actualización documental/modelos `90bbeed`, publicada en GitHub. El árbol del merge coincidía con `965c877`, ya validado; no se repitieron suites por un merge sin cambios de código.

015 **implementada y validada el 2026-10-18**, en `feat/015-basic-inventory`, sin integrar a main. El usuario aprobó P-02 (anular no repone; devolución física mediante ajuste admin con motivo) y resolvió P-03: pollo y bebidas conservan su saldo hasta los movimientos o ajustes manuales, sin reinicio diario. Ocho operaciones OpenAPI0.12 pasan a implemented. Los apartados siguientes distinguen cada corte y su evidencia.

## Cierre C-01 — 2026-10-18

- Código final `b4bfe27`: suite global con cobertura **158 archivos aprobados,2992 pruebas aprobadas y5 fallos esperados anteriores**, exit0,622,43s. Los fallos esperados son deuda previa y no se cuentan como aprobados. Comando: `node ../run-local-test.cjs node_modules/vitest/vitest.mjs run --coverage --coverage.reportOnFailure --maxWorkers=2`.
- Cobertura de líneas **95,49%** (4452/4662), shared99,21%, inventory.service97,74% e inventory-demand97,56%. Umbrales originales80% global/90% shared y servicios cumplidos, sin modificarlos. No implica cobertura completa de cada pantalla: inventory-admin.tsx tiene54,33% instrumentado por Vitest; tandas/entradas también se comprueban por E2E real, fuera de ese porcentaje. No se añadieron pruebas triviales para inflar la cifra.
- Tipos root/shared/API/web y formato global aprobados en el cierre; los archivos de tests corregidos y la deduplicación recibieron tipos/lint/formato pertinentes después. Los cinco errores del lint global se resolvieron y verificaron en sus tres archivos. Dos E2E aplicables aprobados por separado; ocho capturas finales y revisión manual aprobadas.
- Build final Next16/Turbopack aprobado sobre el código corregido, incluida la deduplicación. Esta segunda compilación se justifica por el cambio de producción posterior a la primera; no se usó otro bundler. La repetición de cobertura se justifica por los cinco fallos de la primera ejecución, no por un commit documental.
- Revisión del principal sin bloqueos críticos pendientes. No hubo reviewer ni ronda adversarial independientes; se conservaron las suites adversariales existentes. La carrera de recategorización no fuerza una intercalación determinista. Solo polleria_test; sin cambios en polleria_dev ni la copia Desktop, sin creación de bases/roles y sin acreditar impresora física o integración bancaria.

## T-04 / I-04 y revisión visual — 2026-10-18

- Test-writer e implementer separados, ambos Luna medium, retomaron con cuota disponible. Cliente/helper `93124c9`, UI `4480696`; tests en commits separados desde `b299e27` y `82e6895`. Primer rojo cliente/admin por módulos ausentes (sin assertions ejecutadas); mozo tuvo tres fallos causales nuevos. No se reconstruye rojo retrospectivo.
- Cliente valida respuestas y conserva status; helper adapta cantidades/recetas sin duplicar componentes. Administrador registra tandas, entradas, controles y ajustes con motivo, revisión accesible y clave/cuerpo conservados ante respuesta incierta. Mozo muestra disponibilidad, valida el carrito, conserva borradores y congela el intento hasta resolverlo; replay permitido con stock nuevo en cero.
- Verde dirigido reportado por implementer: cliente/helper8/8, administrador3/3 y mozo19/19. Correcciones posteriores de tests resolvieron imports/mocks, selectores ambiguos y espera de la respuesta de stock; no modificaron reglas de negocio para satisfacer fixtures.
- QA externo con Playwright/Chrome y API simulada: ocho capturas a360/768/1440, cero pageerrors, cero solicitudes sin fixture y sin scroll horizontal. Diálogo mantiene foco al tabular y cierra con Escape; movimiento reducido activado. Evidencia final en qa/visual-verification.json y sus ocho PNG. No acredita DB, impresora física ni los E2E reales.
- Inspección manual detectó botones comprimidos pese a no haber overflow global. Correcciones CSS `11542fa` y `66c84a4`: panel móvil en una columna y acciones con altura/texto adaptables. Se repitió solo QA visual; no RTL por CSS. Última captura admin-mobile inspeccionada y legible.
- Build inicial Next16/Turbopack aprobado, incluido chequeo de tipos y generación de páginas. Tipos root/shared/API/web y formato global aprobados. Lint global detectó cinco errores en tests; se corrigen sin debilitar assertions. En este corte la cobertura y los E2E seguían pendientes; sus resultados finales están en C-01.
- Ajustes de cierre: `1a692b6` sustituye structuredClone por copia tipada en un test shared; `5b12f3b` corrige cinco errores lint de tests API (lint dirigido aprobado). `7df986c` incorpora disponibilidad OFF al fixture adversarial anterior. No se modificó producción para satisfacer fixtures ausentes.
- Revisión de fallos web: tres suites dirigidas dieron50/52: mozo19/19, admin3/3 y adversarial28/30. Los dos fallos reales restantes eran mensaje raíz duplicado y expectativa antigua de editar tras respuesta incierta. Producción `35f6f3f` deduplica errores; `dde92f2`/`7973103` conservan el intento incierto y verifican nueva clave tras rechazo definitivo409. Test-writer reportó verdes dirigidos de ambos comportamientos y mensaje único; casos filtrados no ejecutados no se cuentan como aprobados. Tipos/lint web dirigidos aprobados tras el cambio.
- AC-16/17 fallaron en la primera ejecución global pero aprobaron en las tres suites dirigidas. AC-16 aislado volvió a superar5s bajo cobertura/build concurrentes; no se atribuye fallo funcional ni se debilita la prueba. Evitar cargar el build en paralelo durante la verificación final.
- Primera ejecución global:158 archivos,156 aprobados/2 fallidos;2986 pruebas aprobadas,5 fallidas y5 fallos esperados anteriores,1024,19s. Los cinco fallos pertenecen a las dos suites web del mozo: mensaje duplicado, expectativa obsoleta de editar intento incierto, dos timeouts5s al construir20 líneas y selector Cantidad ambiguo tras el timeout anterior. `ddd08c0` asigna15s solo a los dos recorridos de20 líneas, conservando sus assertions; no se cambió timeout global ni cobertura. Esa ejecución no generó informe por los fallos; se requiere una repetición global corregida, no se presenta como verde.
- E2E reales en `b4bfe27`, usando Chrome local/config externo y polleria_test: escritorio1/1 (31,2s) y móvil1/1 (19,8s), ejecutados por separado sin casos no aplicables. Desktop registra tanda/entrada mediante UI, envía mezcla, cobra sin nuevos movimientos y segundo mozo ve bebida agotada. Móvil obtiene201 real antes de abortar la respuesta, reintenta con la misma clave/cuerpo y audita un solo ítem y movimiento mediante la sesión admin separada. Prettier/diff-check aprobados; lint del archivo sin errores reportados.
- Los primeros intentos E2E detectaron expectativas de avisos inexistentes/selectores ambiguos y una carrera al volver a iniciar sesión para auditar. Se verifican saldos/movimientos reales, etiqueta Agotado exacta y contexto admin ya autenticado. No se cambió producción ni se sustituyó la venta real por un mock. Build aprobado antes de la corrección mínima de deduplicación; tipos/lint web se verificaron después de esa corrección.

El usuario restableció Luna para trabajo sencillo. Test-writer y corrección mínima usaron GPT-6-luna medium, en agentes distintos. La implementación compleja de stock/transacciones seguirá GPT-6.1-sol medium. No hubo reviewer ni ronda adversarial independientes.

## T-01 / I-01: dominio puro

- Test-writer Luna: `c130635` y `38e9944`. Primer rojo por módulo ausente; no se atribuye como fallo de assertion del algoritmo.
- Implementer Luna separado: `7f63a89`, únicamente producción shared. Schemas estrictos, movimientos coherentes, conversiones, suma por recurso y límites enteros, sin reloj ni reinicio diario.
- Revisión principal detectó fixtures incorrectas: saldo0 + entrada1 es válido; los octavos de pollo directo ya incluyen la cantidad de línea; el desbordamiento debe superar MAX por acumulación. El test-writer corrigió esos casos en `1d94ff7`, sin cambiar producción para satisfacer expectativas falsas.
- Verde del principal: 24 archivos shared, **1100 pruebas aprobadas y3 fallos esperados anteriores**, exit0. Los fallos esperados no se cuentan como aprobados. Comando: `node ../run-local-test.cjs node_modules/vitest/vitest.mjs run packages/shared --maxWorkers=2`.
- Implementer reportó tipos/lint/formato de su bloque aprobados. El primer intento compartido de Vitest dentro del sandbox falló por workers ENOENT; la ejecución del principal con permisos de proceso adecuados pasó. Sin atribuir ese fallo de entorno al dominio.
- Al cerrar I-01 todavía faltaba evidencia PostgreSQL de inventario; el bloque siguiente documenta su validación posterior. La propuesta de interfaz está en ui-plan.md y no constituye implementación ni QA visual.

## T-02: migración y administración

- Test-writer Luna: `d9e3cf7` y limpieza de import `a0f993d`, solo tests/helpers. Migración reversible, ausencia de backfill, restricciones SQL, administración/auditoría, permisos actuales, idempotencia, conservación entre fechas, paginación y rollback. Actualizó las listas de migración anteriores y limpieza test sin retirar assertions de dominio.
- Rojo reportado por test-writer usando wrapper y polleria_test: **11 fallos de assertion** por tablas/migración ausentes y rutas404. La suite de servicio no pudo cargar por módulo inventory.service.ts ausente: **0 tests ejecutados en esa suite**, sin atribuir rojo de assertions del servicio.
- I-02 asignado a implementer distinto GPT-6.1-sol medium por transacciones/stock/permisos. Tiene el slotDB serializado para verde dirigido. No integra consumo en sendItems hasta T-03 rojo. Backend aún sin resultado verde; no se marca ninguna ruta implemented.

### I-02 y verificación del principal

- Producción `c002e11`: migración/modelos, administración transaccional, ocho rutas y traducción de la FK de bebidas a PRODUCT_HAS_INVENTORY; sin consumo en sendItems. Tipos API, ESLint dirigido, Prettier y diff-check aprobados por implementer.
- Primer verde del implementer:18/19. El único fallo era la regex del índice parcial, que no admitía el cast generado por PostgreSQL para VARCHAR. Test-writer corrigió la comprobación semántica de unicidad, expresiones y predicado en `e41c6a1`; migración5/5. No se cambió producción para satisfacer el formato de SQL.
- Principal: **12 archivos y94/94 pruebas aprobadas**,48,20s, usando wrapper polleria_test con máximo2workers y ejecución serializada de archivos. Incluye3 suites de inventario (19casos),8 suites de migraciones anteriores y payments-api-014.
- El comando anterior también mencionaba products-api.test.ts, archivo inexistente que Vitest ignoró. No se atribuye cobertura de catálogo a ese nombre; se ejecutan por separado los archivos reales de catálogo y pedidos antes de I-03.
- Segunda ejecución del principal: **5 archivos y88/88 pruebas aprobadas**,49,83s: products.test, products-service, adversarial/products-005, order-items-api y order-item-service. Total de ambas ejecuciones disjuntas: **17 archivos y182/182 aprobadas**. Typecheck API y validación YAML/670 referencias también aprobados por principal.
- T-03 ya puede preparar pruebas de consumo/concurrencia. Las rutas OpenAPI siguen pending hasta el cierre completo; falta consumo, UI, cobertura/globales, E2E y QA visual. La revisión es del principal, sin reviewer independiente.

## T-03: envío y concurrencia

- Test-writer Luna entregó `a359052`, dos archivos y21 casos. Rojo real reportado: **17 fallos de assertion y4 aprobadas**, sin fallos de imports/setup. Los verdes corresponden a comportamiento administrativo ya implementado o intercalaciones permitidas; no se los presenta como fallos nuevos.
- Casos: consumo directo/combo con cantidades mayores a1, faltante mixto atómico, rollback de saldo/movimiento/ítem/impresión durable, última bebida y porción entre mozos, entrada/ajuste/control frente al envío, claves administrativas concurrentes, FK/recategorización, saldos entre fechas, ausencia de backfill, anulación/mover/unir/separar/cobrar sin nuevo consumo y roles actuales en servicio/replay.
- ACK: servidor HTTP local; el cliente destruye el stream después de recibir cabeceras201 y antes de leer el cuerpo. Se comprueba persistencia y reintento con misma clave, sin nueva venta. No se atribuye una impresión física ni una desconexión anterior al commit.
- Tipos API, formato y diff-check aprobados por test-writer. I-03 se asignó al mismo implementer complejo, con slotDB exclusivo; todavía sin resultado verde.
- Revisión principal pidió complemento T-03B: consumos de pecho, octavo, medio configurable y entero, y fallo al persistir replay. Pendiente; no contarlo como cubierto. T-04/UI todavía sin pruebas ni implementación nuevas.

### Complemento y revisión de I-03, en curso

- T-03B `4304dd8` añade casos de presentaciones/partes, fallo de replay y carrera envío/recategorización. Su primer intento de ejecución no conectó dentro del sandbox:28 omitidos, sin assertions ejecutadas. Principal confirmó PostgreSQL17 en ejecución y puerto5432 accesible fuera del sandbox; no se cambió el servicio ni ninguna base.
- Principal detectó un posible ciclo de locks: consumo retenía el saldo hijo y después adquiría el padre por FK del movimiento; PATCH de categoría podía retener el padre y esperar al hijo. Se fijó en contrato y producción el orden estado→productos KEY SHARE ascendentes→saldos UPDATE ascendentes. La carrera de prueba es simultánea; no fuerza esa intercalación ni se presenta como reproducción determinista del deadlock.
- I-03 `37bb96e`, solo producción: consume en transacción del envío, demanda resuelta en servidor, autorización antes del claim/replay y fábrica/inyección con reloj compartido. Tipos API, lint/formato dirigidos aprobados por implementer.
- Primera corrida del implementer:39/40, único fixture concurrente exigía un ganador concreto; T-03B acepta ambos saldos intermedios válidos conservando saldo final9 y movimientos esperados.
- Corrida principal de5 suites: **43 aprobadas/4 fallidas de47**,33,26s. Las4 fallidas son fixtures:3 enviaban cut:null en requests de medio/entero donde la010 exige omitirlo; otra usaba una bebida componente de combo y encontraba correctamente PRODUCT_IS_COMPONENT antes del nuevo FK. El test-writer corrige; no cambiar el contrato antiguo ni producción para satisfacer esas expectativas.
- Correcciones de fixtures `9ec9653`, solo tests. Test-writer verificó después **5 archivos/47 pruebas aprobadas**, con wrapper elevado; tipos API y formato también aprobados. El principal ejecuta una regresión adicional de10 archivos de envíos, pagos e impresión durable antes de UI. No se reconstruye rojo causal de T-03B: su primer intento falló en entorno y los posteriores fallos fueron fixtures.
- T-04 comienza con test-writer Luna; implementer UI Luna distinto lee el plan/puertos y espera rojo antes de producción. No hay UI nueva validada ni E2E de inventario todavía.
- Regresión del principal posterior a I-03: **10 archivos/147 pruebas aprobadas**,99,96s. Incluye28 casosT-03/B y regresiones de order-items-api/order-item-service/adversarial010, payments-api/service/concurrency014 y kitchen-printing-enqueue/api013. No se suman a las ejecuciones anteriores como casos únicos.

## T-00: regresión existente de la 010

Luna detectó que `componentIssue` se marcaba por la mera presencia de distribución de medio pollo, aunque fuera válida; el servicio omitía copiar los componentes. El contrato D-010-04/05 ya permite elegir esa distribución, por lo que esta corrección no depende de aprobar reglas nuevas de inventario.

- Test-writer: `b490fb3`, solo tests. Dos casos HTTP verifican split válido 1+3, componentes/ticket histórico/replay exacto sin filas adicionales, e inválido 1+2 sin ítems/comanda/clave persistidos.
- Rojo del principal con PostgreSQL real: `vitest run apps/api/tests/order-items-api.test.ts -t "D-010-04/05" --maxWorkers=1`: 1 fallo de assertion (0+0 en vez de 1+3), 1 aprobado y 16 omitidos por filtro. Los omitidos no se cuentan como aprobados.
- Implementer separado: `88c1b0c`, solo producción. Movió la marca de error a las ramas que realmente añaden un issue; no cambió schemas, dinero, cantidades históricas ni contratos.
- Verde del principal: 6 archivos y **88/88 pruebas**, 50,44 s: `order-items-api`, `order-item-service`, `adversarial/order-items-010.adversarial`, `payments-api-014`, `payments-service-014` y `payments-concurrency-014`. Ejecución serializada de archivos sobre polleria_test, con máximo 2 workers.
- Tipos de API y ESLint de servicio/tests aprobados; formato del test comprobado por test-writer y diff sin errores de whitespace. Se usaron binarios instalados, porque Corepack intentaba descargar pnpm sin red disponible.

La verificación usa el wrapper externo del principal: lee exclusivamente DATABASE_URL_TEST de la copia Desktop, exige polleria_test y no muestra/copia credenciales. No cambia el checkout del usuario, polleria_dev, bases ni roles.

No se ejecutaron cobertura global, build web ni E2E para este ajuste de flag del backend; la regresión dirigida cubre persistencia, replay, rechazos y cobros concurrentes. La evidencia completa de 014 conserva su fecha/commit anteriores, no se atribuye como ejecución nueva. Los checks completos de 015 siguen pendientes de aprobar e implementar la funcionalidad.
