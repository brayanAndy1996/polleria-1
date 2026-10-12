# Tareas — Spec 013, generación automática de comandas file

- Estado: **Aprobadas spec/P-01…P-06 por el usuario el 2026-10-12**, con las seis recomendaciones aceptadas. `file` había sido confirmado antes. **S-01 completada por spec-writer el 2026-10-12**; T-01/T-02 y T-03…T-08 pueden continuar según dependencias. El contrato marca las tres nuevas rutas pendientes de implementación.
- Rama: `feat/013-kitchen-printing`; alcance aprobado de driver: file. Sin ESC/POS/barra/pantalla cocina.
- Fuente de verdad: [spec.md](spec.md), con 14 AC. OpenAPI aprobado 0.10.0 en S-01, operaciones 013 marcadas pending y formas/operaciones previas 0.9.0 conservadas; contrato de §9 antes de los tests T-03…T-08.
- Tamaño objetivo: cada tarea 1–2 h; dividir por AC/archivo si supera ese tamaño. No reducir AC ni agregar infraestructura para cumplir una estimación.

## Puertas previas y reglas de ejecución

1. Baseline existente corregido por test-writer en `d42ea8b`, revisión independiente APROBADO, 81/81 casos dirigidos. Verificación final del orquestador: 122 archivos pasan, 2418 pruebas pasan + 6 esperadas + 2 skip; tipos/lint pasan. Los 29 fallos iniciales se resolvieron con sincronización de tests, sin cambios de producción; no son nuevos AC de esta funcionalidad ni fueron omitidos. Mantener separados expected-fail y skip.
2. Puerta de aprobación cumplida el 2026-10-12: spec y P-01…P-06 aceptadas con las seis recomendaciones; file confirmado previamente. Seguir contrato→tests→implementación→ataque→revisión. No solicitar esta aprobación de nuevo; integrar a main requiere autorización separada.
3. Test-writer escribe pruebas, comprueba rojo por el comportamiento ausente/defecto y reporta evidencia; implementadores no editan tests. Un import ausente es rojo válido para un módulo nuevo, pero la regresión de deuda debe fallar por la causa concreta.
4. La deuda ADV-002-02/01 se corrige y revalida **antes de automatizar comandas**. Mantener expected-fail restantes. Solo sus autores convierten a tests ordinarios las regresiones demostradas resueltas; una VM rápida que pasa un it.fails no es corrección.
5. Tests sobre polleria_test exclusivamente, con guardias y permiso de limpieza del orquestador; ninguna acción sobre polleria_dev/bases/roles. File siempre en carpetas temporales; no instalar paquetes. Suites con DB en serie desde raíz.
6. Shared/API/contrato primero; web puede paralelizarse únicamente con contrato acordado, tests listos y archivos disjuntos. No editar PROGRESS/CONTINUAR salvo orquestador; commits/push/merge requieren encargo separado.

## Contrato aprobado antes de tests — spec-writer

| Tarea | Descripción y evidencia requerida | Responsable | Dependencias | AC |
| --- | --- | --- | --- | --- |
| S-01 — Completada 2026-10-12 | Aprobación P-01…P-06 registrada; OpenAPI 0.10.0 con tres paths pending, nueve esquemas, tres parámetros y dos respuestas. YAML sin claves duplicadas, 501 referencias resueltas, operationIds únicos, JSON Schema 2020-12 de nuevas formas/ejemplos y siete patrones ECMAScript verificados con herramientas existentes; 29 paths y todas las formas previas 0.9.0 conservadas. El spec-writer es dueño del contrato; solicitudes de cambio de implementadores vuelven a este rol. | spec-writer | aprobación cumplida | AC-09, AC-10, AC-11 |

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

## Implementación — backend-dev

| Tarea | Descripción y evidencia requerida | Responsable | Dependencias | AC |
| --- | --- | --- | --- | --- |
| T-09 | Validación canónica defensiva del driver file antes de I/O; conservar contratos y errores de la 002. Verde AC-01 y regresión ADV-002-02 por su autor. | backend-dev | T-01 | AC-01 |
| T-10 | Pre-límite lineal de marcas antes de normalización; conservar salidas normales y benchmark. Sin editar expected-fail/tests. Verde y medición, validación independiente de ADV-002-01 antes de seguir. | backend-dev | T-02 | AC-02 |
| T-11 | Esquemas/tipos de impresión y errores HTTP en shared; migración/modelos de dos tablas con constraints/índices, sin backfill ni cambios a scopes/bodies existentes. | backend-dev | T-03, T-09, T-10 | AC-03, AC-09, AC-10, AC-11 |
| T-12 | Captura snapshot e intento en las transacciones send/void, misma respuesta de idempotencia; asociación actual por ticket y snapshots inmutables en merge. Ningún I/O antes del commit. | backend-dev | T-04, T-11 | AC-03, AC-04 |
| T-13 | Formateador puro, 48 columnas, documentos ≤500 líneas con continuidad, Lima, encabezados de tipo/copia y datos originales íntegros. | backend-dev | T-05, T-09, T-10, T-11 | AC-05, AC-06, AC-11 |
| T-14 | Extensión compatible PrinterService: jobId persistido, salida canónica e inspección file segura/exacta; registrar documentos+huella antes de I/O. Conservar print(document)/printer:test. | backend-dev | T-06, T-09, T-10, T-13 | AC-07, AC-08 |
| T-15 | Despachador exclusivo local, barrido/despertar postcommit, reclamo y registro con identidad del propietario; deadline/pérdida de lock no liberan I/O en vuelo; comprobación conservadora de proceso, reconciliación solo con fin confirmado, arranque/cierre. Mantener API arrancable con DB caída, sin prometer réplicas/reinicio superpuesto. | backend-dev | T-06, T-12, T-14, A-01 | AC-07, AC-08, AC-14 |
| T-16 | Servicio de copia: motivo/claves/guardias por ticket, replay antes de estado activo, auditoría, numeración y read models coherentes con historial. | backend-dev | T-07, T-11, T-13 | AC-09, AC-10, AC-11 |
| T-17 | Tres rutas/controllers con auth/no-store; inyección en app/server. Implementar y verificar concordancia con OpenAPI aprobado en S-01; reportar cambios necesarios al spec-writer, sin editar contrato por cuenta propia. Conservar respuestas previas 0.9.0 sin cambios de forma. | backend-dev | S-01, T-07, T-15, T-16 | AC-10, AC-11, AC-14 |

## Implementación — frontend-dev

| Tarea | Descripción y evidencia requerida | Responsable | Dependencias | AC |
| --- | --- | --- | --- | --- |
| T-18 | Cliente API/esquemas estrictos y etiquetas; consulta de impresión separada de ticket/order, polling visible de 5 s, páginas de atención y error seguro conservando datos. | frontend-dev | S-01, T-08, T-11 | AC-10, AC-12 |
| T-19 | Sección de estado por pedido y Comandas por revisar en mozo/caja, resumen void sin detalle para mozo, carga/vacío/error, canReprint; corregir texto de envío para file. Sin funcionalidades de cobro/cocina. | frontend-dev | T-08, T-18 | AC-12, AC-14 |
| T-20 | Diálogo de copia/confirmación/motivo, guard síncrono y clave por intento estable en pérdida de respuesta; 202→En espera→relectura. Verde componentes/E2E mobile+desktop sin editar tests. | frontend-dev | T-08, T-17, T-19 | AC-13, AC-14 |

## Ataque, revisión y cierre — roles separados

| Paso | Responsable | Dependencias | Evidencia / AC |
| --- | --- | --- | --- |
| A-01 | adversarial-tester | T-09, T-10 | Revalidar ADV-002-01/02 sin expected-fail y sin debilitar benchmark; otros 002 abiertos/skip visibles. AC-01/02. Es puerta antes de despacho. |
| A-02 | adversarial-tester | T-17, T-20, A-01 | Ataque independiente sobre inyección, marcas, doble envío/copia, claves entre tickets, merge/void pendiente, pérdida DB, crash rename→ack, páginas parciales, late completion, lectura symlink/directorio cambiado y roles. Regresiones ADV-013-xx con severidad y evidencia; no editar producción. AC-03…14. |
| R-01 | reviewer | A-02 y fixes revalidados | Revisión independiente sin editar: todos AC con pruebas pertinentes, límite de alcance, seguridad de transacciones/driver/reinicio, estado de baseline, OpenAPI completo y veredicto APROBADO/CAMBIOS REQUERIDOS. |
| C-01 | orquestador | R-01 APROBADO | Verificar definición de terminado en serie y métricas separadas: pnpm test/lint/typecheck/coverage/e2e, pruebas de deuda, contrato, diff y AC→tests. Actualizar PROGRESS/CONTINUAR, exponer límites file/RNF/hardware. Integrar solo con autorización posterior. |

No repetir suites completas durante cada tarea sin razón nueva; ejecutar objetivos pertinentes con la serialización de raíz, luego los checks de cierre. Implementación/ataque/revisión tiene como máximo tres vueltas según el rol orquestador. Hallazgos de negocio que cambien la spec vuelven a spec-writer y al usuario; defectos frente a AC aprobados vuelven al implementador y se revalidan por autor de la prueba.
