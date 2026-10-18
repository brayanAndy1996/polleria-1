# Tareas — 015 Inventario básico

Estado vigente 2026-10-18: S-01 y T/I-01…04 completados; cliente/helper `93124c9`, UI `4480696` y corrección visual `66c84a4`. Cliente/helper8/8, admin3/3 y mozo19/19 aprobados. QA visual final8 capturas, build único Turbopack, tipos y formato globales aprobados. R-01/C-01 en curso: corregir fixtures/lint encontrados por cierre, completar cobertura y dos E2E reales. OpenAPI0.12 conserva8 operaciones pending hasta cierre.015 permanece separada de main. El estado siguiente es histórico.

Estado 2026-10-17: alcance aprobado, saldos permanentes sin reset diario y sin reposición automática al anular. S-01 y bloques T/I-01…03 completados. Shared:1100 aprobadas +3 fallos esperados anteriores. Backend administrativo `c002e11` y consumo `37bb96e`: principal verificó17 archivos/182 aprobadas tras I-02 y10 archivos/147 aprobadas tras I-03, con solapamiento entre ejecuciones. Test-writer verificó5 suites de inventario/47 aprobadas tras `9ec9653`. T-04 en escritura por Luna; implementer UI Luna espera rojo. Falta UI, QA visual, cobertura/globales/build y E2E. OpenAPI0.12 conserva8 operaciones pending hasta cierre. La014 ya está en main;015 permanece separada.

T-00 completado: rojo `b490fb3`, fix `88c1b0c`, 6 archivos/88 pruebas aprobadas por el principal, tipos API y lint aprobados. Ver verification.md. La corrección de esa regresión no implica aprobar ni implementar el inventario.

| ID | Responsable | Trabajo y evidencia | Depende de |
| --- | --- | --- | --- |
| T-00 | Luna medium test-writer → Luna medium implementer → principal | Regresión previa: split válido de medio pollo en combo no debe omitir sus componentes. Rojo de persistencia/replay e inválidos; corrección mínima del flag de validación y verde dirigido. No implica aprobar el inventario ni cambiar las reglas de cantidades de snapshots. | Contrato 010 D-010-04/05 ya aprobado |
| S-01 | Principal | Resolver decisiones, fijar modelos/orden global de locks, contrato y errores; trazabilidad de todos los AC. | Aprobación de spec |
| T-01 | Luna medium, test-writer | Rojo puro: schemas, conversiones, límites y acumulación de consumo/combos sin fecha ni reset. AC-02/04/09. | S-01 |
| I-01 | Luna medium, implementer | Dominio puro mínimo y schemas de inventario sin tocar contratos antiguos. | T-01 |
| T-02 | Luna medium, test-writer | Rojo real: migraciones, movimientos/activación, permisos/idempotencia y rollback. AC-01/02/03/07/08/11/12. | I-01 |
| I-02 | GPT-6.1-sol medium, implementer | Migración/modelos y operaciones administrativas atómicas con roles actuales, auditadas e idempotentes; rutas/controllers. | T-02 |
| T-03 | Luna medium, test-writer | Rojo de integración con sendItems: escasez, carreras, ACK perdido, días, política void y regresión014. AC-04…10/12. | I-02 |
| I-03 | GPT-6.1-sol medium, implementer | Descuento/transacción de envío, replay temprano, locks deterministas y disponibilidad consistente. No cambiar cobros ni impresión física. | T-03 |
| T-04 | Luna medium, test-writer | Rojo UI/API client/RTL y E2E reales, borradores/errores/reintentos/accesibilidad. AC-13/14/15. | I-03 |
| I-04 | Luna medium, implementer | UI inventario y disponibilidad del mozo, con skills del proyecto y Motion existente. | T-04 |
| R-01 | Principal | Revisión de trazabilidad, consumo exacto, carreras, límites, compatibilidad e interfaz. Hallazgos vuelven al rol correspondiente. | I-04 |
| C-01 | Principal | Checks globales y DB/E2E serializados, cobertura, build, QA visual, contrato implemented, evidencias y docs; revisión del usuario. | R-01 sin bloqueos |

No reconstruir rojo retrospectivo ni atribuir revisión independiente. Solo un test-writer y un implementer activos; los bloques sencillos/complejos cambian modelo por delegación secuencial. Si Luna no tiene cuota, reportar y seguir únicamente tareas independientes; no sustituirla automáticamente.
