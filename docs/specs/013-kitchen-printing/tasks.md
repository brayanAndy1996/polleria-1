# Tareas — Spec 013, generación automática de comandas file

> Adaptación aprobada 2026-10-12: mantener IDs/AC/dependencias, asignar tareas spec-writer al principal, backend-dev/frontend-dev al implementer y reviewer al principal. A-01 ya fue ejecutada por el equipo anterior; A-02 deja de ser una ronda independiente: test-writer conserva regresiones críticas y el principal revisa. No eliminar pruebas existentes ni reducir AC. Esta asignación prevalece sobre los responsables históricos de las tablas.

- Estado: **Implementada y verificada en rama el 2026-10-13**, con spec/P-01…P-06 aprobadas el 2026-10-12. S-01 y T-01…T-20 completadas; regresiones críticas, revisión del principal y checks de cierre cumplidos bajo el flujo reducido. Integrada a main con autorización del usuario el 2026-10-13 (merge df19019).
- Rama: `feat/013-kitchen-printing`; alcance aprobado de driver: file. Sin ESC/POS/barra/pantalla cocina.
- Fuente de verdad: [spec.md](spec.md), con 14 AC. OpenAPI aprobado 0.10.0 en S-01, operaciones 013 marcadas implemented y formas/operaciones previas 0.9.0 conservadas; contrato de §9 antes de los tests T-03…T-08.
- Tamaño objetivo: cada tarea 1–2 h; dividir por AC/archivo si supera ese tamaño. No reducir AC ni agregar infraestructura para cumplir una estimación.

## Puertas previas y reglas de ejecución

1. Baseline existente corregido por test-writer en `d42ea8b`, revisión independiente APROBADO, 81/81 casos dirigidos. Verificación final del orquestador: 122 archivos pasan, 2418 pruebas pasan + 6 esperadas + 2 skip; tipos/lint pasan. Los 29 fallos iniciales se resolvieron con sincronización de tests, sin cambios de producción; no son nuevos AC de esta funcionalidad ni fueron omitidos. Mantener separados expected-fail y skip.
2. Puerta de aprobación cumplida el 2026-10-12: spec y P-01…P-06 aceptadas con las seis recomendaciones; file confirmado previamente. Seguir contrato→tests→implementación→revisión del principal y checks de cierre. No solicitar esta aprobación de nuevo; integrar a main requiere autorización separada.
3. Test-writer escribe pruebas, comprueba rojo por el comportamiento ausente/defecto y reporta evidencia; implementadores no editan tests. Un import ausente es rojo válido para un módulo nuevo, pero la regresión de deuda debe fallar por la causa concreta.
4. La deuda ADV-002-02/01 se corrige y revalida **antes de automatizar comandas**. Mantener expected-fail restantes. Solo sus autores convierten a tests ordinarios las regresiones demostradas resueltas; una VM rápida que pasa un it.fails no es corrección.
5. Tests sobre polleria_test exclusivamente, con guardias y permiso de limpieza del orquestador; ninguna acción sobre polleria_dev/bases/roles. File siempre en carpetas temporales; no instalar paquetes. Suites con DB en serie desde raíz.
6. Shared/API/contrato primero; web puede paralelizarse únicamente con contrato acordado, tests listos y archivos disjuntos. No editar PROGRESS/CONTINUAR salvo orquestador; commits/push/merge requieren encargo separado.

## Contrato aprobado antes de tests — spec-writer

| Tarea | Descripción y evidencia requerida | Responsable | Dependencias | AC |
| --- | --- | --- | --- | --- |
| S-01 — Completada 2026-10-12 | Aprobación P-01…P-06 registrada; OpenAPI 0.10.0 con tres paths pending, nueve esquemas, tres parámetros y dos respuestas. YAML sin claves duplicadas, 501 referencias resueltas, operationIds únicos, JSON Schema 2020-12 de nuevas formas/ejemplos y siete patrones ECMAScript verificados con herramientas existentes; 29 paths y todas las formas previas 0.9.0 conservadas. El spec-writer es dueño del contrato; solicitudes de cambio de implementadores vuelven a este rol. | orquestador | aprobación cumplida | AC-09, AC-10, AC-11 |

## Pruebas primero — test-writer

| Tarea | Descripción y evidencia requerida | Responsable | Dependencias | AC |
| --- | --- | --- | --- | --- |
| T-01 | Regresión driver directo/fábrica: caracteres crudos, límites y rechazo antes de disco; conservar archivos canónicos. Coordinar con adversarial-tester ADV-002-02. Rojo por bytes no validados, no por fixture. | test-writer | aprobación | AC-01 |
| T-02 | Regresión de pre-límite Unicode (8/9/miles de marcas, antes de NFC), salidas ordinarias y benchmark original dos corridas; registrar tiempos y estado expected-fail. Rojo causal y acuerdo con autor ADV-002-01. | test-writer | aprobación | AC-02 |
| T-03 | Esquemas, migración de ambas tablas/constraints/FK/índices y ausencia de backfill; ampliar helpers y listas MIGRATIONS conservando guardias. Pruebas nuevas sobre DB de tests, no migrar dev. | test-writer | S-01 | AC-03, AC-09, AC-10, AC-11 |
| T-04 | Pruebas del enqueue atómico en send/void, rollback inyectado, replay secuencial/concurrente, request/reject sin salida; snapshot actor/mesas/textos y merge/move. | test-writer | T-03 | AC-03, AC-04 |
| T-05 | Pruebas formateador puro: mezcla, tipos, Lima y datos copiados; caso máximo legal 20×10 componentes/6 cremas/notas, palabras largas, paginación sin pérdida y encabezado de copia. | test-writer | aprobación | AC-05, AC-06, AC-11 |
| T-06 | Worker con reloj/file falso y file real temporal: exclusión local, commit, fallo, deadline sin cancelación ficticia, pérdida de lock/DB con I/O aún vivo, propietario persistido y PID vivo/reutilizado/dudoso que bloquea, reinicio tras fin confirmado, comparación exacta, parcial/symlink/configuración distinta, shutdown; tiempo típico aislado. | test-writer | T-03, T-05 | AC-07, AC-08, AC-14 |
| T-07 | Supertest con sesiones: tres rutas, roles por tipo, consultas coherentes/paginadas/no-store, errores seguros, 202/replay/conflicto/dos claves concurrentes, historia previa y copia de pedido cerrado/fusionado. Si A uncertain activo suspende el destino, copia nueva de B succeeded devuelve 409; replay aceptado sigue devolviendo 202 antes de la guardia global. Esquemas compartidos estrictos. | test-writer | T-03, T-04 | AC-09, AC-10, AC-11 |
| T-08 | MSW de cliente/UI: estado separado del replay 201, polling visible, carga/vacío/error con datos conservados, páginas de atención, void resumido al mozo, canReprint, copia succeeded desde pedido mozo/admin y failed/uncertain en caja, diálogo/guard/clave estable, 401 y respuestas malformadas. Dos recorridos E2E: mozo mobile y caja desktop, file temporal y fallo reproducible, sin endpoint de fallos en producción. | test-writer | T-05, T-07 | AC-12, AC-13, AC-14 |

La preparación E2E de fallos usa proceso/driver inyectado o filesystem temporal controlado por fixture, no rutas abiertas para romper la impresora ni manipulación de .env real. Baseline tests deben seguir preservando sus aserciones de dominio; cambios de readiness se reportan aparte.

## Implementación — implementer (backend)

| Tarea | Descripción y evidencia requerida | Responsable | Dependencias | AC |
| --- | --- | --- | --- | --- |
| T-09 | Validación canónica defensiva del driver file antes de I/O; conservar contratos y errores de la 002. Verde AC-01 y regresión ADV-002-02 por su autor. | implementer | T-01 | AC-01 |
| T-10 | Pre-límite lineal de marcas antes de normalización; conservar salidas normales y benchmark. Sin editar expected-fail/tests. Verde y medición, validación independiente de ADV-002-01 antes de seguir. | implementer | T-02 | AC-02 |
| T-11 | Esquemas/tipos de impresión y errores HTTP en shared; migración/modelos de dos tablas con constraints/índices, sin backfill ni cambios a scopes/bodies existentes. | implementer | T-03, T-09, T-10 | AC-03, AC-09, AC-10, AC-11 |
| T-12 | Captura snapshot e intento en las transacciones send/void, misma respuesta de idempotencia; asociación actual por ticket y snapshots inmutables en merge. Ningún I/O antes del commit. | implementer | T-04, T-11 | AC-03, AC-04 |
| T-13 | Formateador puro, 48 columnas, documentos ≤500 líneas con continuidad, Lima, encabezados de tipo/copia y datos originales íntegros. | implementer | T-05, T-09, T-10, T-11 | AC-05, AC-06, AC-11 |
| T-14 | Extensión compatible PrinterService: jobId persistido, salida canónica e inspección file segura/exacta; registrar documentos+huella antes de I/O. Conservar print(document)/printer:test. | implementer | T-06, T-09, T-10, T-13 | AC-07, AC-08 |
| T-15 | Despachador exclusivo local, barrido/despertar postcommit, reclamo y registro con identidad del propietario; deadline/pérdida de lock no liberan I/O en vuelo; comprobación conservadora de proceso, reconciliación solo con fin confirmado, arranque/cierre. Mantener API arrancable con DB caída, sin prometer réplicas/reinicio superpuesto. | implementer | T-06, T-12, T-14, A-01 | AC-07, AC-08, AC-14 |
| T-16 | Servicio de copia: motivo/claves/guardias por ticket, replay antes de estado activo, auditoría, numeración y read models coherentes con historial. | implementer | T-07, T-11, T-13 | AC-09, AC-10, AC-11 |
| T-17 | Tres rutas/controllers con auth/no-store; inyección en app/server. Implementar y verificar concordancia con OpenAPI aprobado en S-01; reportar cambios necesarios al spec-writer, sin editar contrato por cuenta propia. Conservar respuestas previas 0.9.0 sin cambios de forma. | implementer | S-01, T-07, T-15, T-16 | AC-10, AC-11, AC-14 |

## Implementación — implementer (frontend)

| Tarea | Descripción y evidencia requerida | Responsable | Dependencias | AC |
| --- | --- | --- | --- | --- |
| T-18 | Cliente API/esquemas estrictos y etiquetas; consulta de impresión separada de ticket/order, polling visible de 5 s, páginas de atención y error seguro conservando datos. | implementer | S-01, T-08, T-11 | AC-10, AC-12 |
| T-19 | Sección de estado por pedido y Comandas por revisar en mozo/caja, resumen void sin detalle para mozo, carga/vacío/error, canReprint; corregir texto de envío para file. Sin funcionalidades de cobro/cocina. | implementer | T-08, T-18 | AC-12, AC-14 |
| T-20 | Diálogo de copia/confirmación/motivo, guard síncrono y clave por intento estable en pérdida de respuesta; 202→En espera→relectura. Verde componentes/E2E mobile+desktop sin editar tests. | implementer | T-08, T-17, T-19 | AC-13, AC-14 |

## Regresiones, revisión y cierre — flujo reducido

| Paso | Responsable | Dependencias | Evidencia / AC |
| --- | --- | --- | --- |
| A-01 | Histórico: adversarial-tester | T-09, T-10 | Ya ejecutado por el equipo anterior: ADV-002-01/02 convertidos a regresiones ordinarias sin debilitar aserciones; demás deudas esperadas/omitidas visibles. AC-01/02. |
| A-02 | test-writer | T-17, T-20, A-01 | Conservar regresiones críticas de permisos, idempotencia, pérdida de conexión, cierre, respuesta perdida y salida parcial. Añadir casos ante hallazgos del principal. Sin ronda adversarial independiente ni edición de producción. AC-03…14. |
| R-01 | orquestador | A-02 y fixes revalidados | Revisar AC, transacciones, recuperación, permisos, UI, baseline y contrato. Registrar hallazgos y límites. Esta revisión no es independiente del orquestador. |
| C-01 | orquestador | R-01 sin bloqueos | Verificar tests/cobertura, lint, tipos, E2E, contrato y diff; actualizar PROGRESS/CONTINUAR con métricas y límites file/hardware. Integrar solo con autorización posterior. |

Ejecutar objetivos pertinentes por bloque y checks completos al cierre, serializando la base de pruebas. Los defectos frente a AC aprobados vuelven al implementer y se revalidan por el test-writer. Cambios de negocio que alteren la spec requieren aprobación del usuario. Mantener un único test-writer y un único implementer activos.

## Evidencia de cierre — 2026-10-13

- Vitest/cobertura: 132 archivos, 2631 pruebas aprobadas, 4 fallos esperados y 2 omitidas; 97,23 % de líneas globales y umbrales cumplidos. Lint, tipos y formato pasan.
- E2E en ejecuciones separadas: 24 anteriores aprobados/12 no aplicables y 4 nuevos aprobados. Driver file real temporal: mezcla, adicional, void, fallo, copia y replay; Chromium del sistema.
- AC-01/02: tests unitarios de canonical validation y límite de marcas; AC-03/04/09: migración/enqueue y API; AC-05/06: ticket-formatter; AC-07/08: dispatcher; AC-10/11: shared/API; AC-12/13: cliente/UI con regresiones de estado y paginación; AC-14: integración de tiempo y e2e/kitchen-ticket-prints.spec.ts.
- A-01 fue histórica e independiente; A-02/R-01 se cumplieron como regresiones y revisión del principal, sin atribuir rondas independientes. Hardware, papel y deuda previa de build quedan fuera de esta entrega file.
