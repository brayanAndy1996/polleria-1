# Tareas — 015 Inventario básico

Estado 2026-10-17: propuesta de spec preparada; sin contrato formal, pruebas de inventario ni producción de 015. P-02 aprobada (sin reposición automática al anular); pendiente P-03 y cierre del alcance. La 014 ya está integrada en main (`2e2202f`); esta entrega vive separada en `feat/015-basic-inventory`. Luna preparó la matriz de pruebas y detectó una regresión previa de la 010: se trabaja T-00 de forma independiente, bajo las reglas D-010-04/05 ya aprobadas.

T-00 completado: rojo `b490fb3`, fix `88c1b0c`, 6 archivos/88 pruebas aprobadas por el principal, tipos API y lint aprobados. Ver verification.md. La corrección de esa regresión no implica aprobar ni implementar el inventario.

| ID | Responsable | Trabajo y evidencia | Depende de |
| --- | --- | --- | --- |
| T-00 | Luna medium test-writer → Luna medium implementer → principal | Regresión previa: split válido de medio pollo en combo no debe omitir sus componentes. Rojo de persistencia/replay e inválidos; corrección mínima del flag de validación y verde dirigido. No implica aprobar el inventario ni cambiar las reglas de cantidades de snapshots. | Contrato 010 D-010-04/05 ya aprobado |
| S-01 | Principal | Resolver decisiones, fijar modelos/orden global de locks, contrato y errores; trazabilidad de todos los AC. | Aprobación de spec |
| T-01 | Luna medium, test-writer | Rojo puro: conversiones, límites, acumulación de consumo/combos y fecha operativa. AC-02/04/09. | S-01 |
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
