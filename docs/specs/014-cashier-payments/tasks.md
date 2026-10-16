# Tareas — 014 Pre-cuenta y cobro completo

Estado: spec y P-01…P-07 aprobadas el 2026-10-13 con la aclaración de importes visibles e ingresados en soles. Dependencias: 009…013 integradas; rama desde main, demo separada en dev. Publicada en main el 2026-10-15 (integración documental 40c4631). Ningún bloque de implementación está completado. Siguiente paso: S-01, contrato previo al TDD; la excepción manual ya consta en CLAUDE.md, el contrato 0.11.0 aún está pendiente.

| ID | Responsable | Bloque y evidencia | Depende de |
| --- | --- | --- | --- |
| S-01 | Principal | P-01…07 aprobadas; actualizar excepción manual de impresión en CLAUDE.md; contrato OpenAPI 0.11.0 pending, schemas estrictos y errores/rutas. | Spec aprobada |
| T-01 | test-writer Luna medium | Rojo de dinero/parsing en soles (21.5/21,5 → S/ 21,50, vuelto S/ 9,00; céntimos solo internos), bill/token/total y schemas; fixtures de _test con guardias. AC-02/03/05/06/10/13. | S-01 |
| I-01 | implementer 6.1-sol medium | Dominio/lectura de cuenta/token y shared; verde dirigido sin alterar tests. | T-01 |
| T-02 | test-writer Luna medium | Rojo migración, cash/electrónico, mesas/snapshot y rollback. AC-01/04/05/06/09/11. | I-01 |
| I-02 | implementer 6.1-sol medium | Tabla payments, servicio transaccional, snapshot, cierre y guardias. | T-02 |
| T-03 | test-writer Luna medium | Rojo HTTP/permisos/replay y concurrencia real con operaciones existentes/ACK perdido. AC-07/08/10/11. | I-02 |
| I-03 | implementer 6.1-sol medium | Idempotencia, rutas/controllers e inyección; revisar lock ordering y compatibilidad. | T-03 |
| T-04 | test-writer Luna medium | Rojo cliente/UI y dos E2E, polling/paginación, respuesta perdida, impresión sin pago. AC-12…15. | I-03 |
| I-04 | implementer Luna medium | Lista Caja, pre-cuenta, formulario/confirmación, acceso desde mozo y detalle histórico; verde UI/E2E. | T-04 |
| R-01 | Principal | Revisar dinero, permisos, tokens, rollback, locks, compatibilidad y trazabilidad; hallazgos vuelven a tests/implementer. Sin revisión independiente. | I-04 |
| C-01 | Principal | Checks completos serializados para _test, contrato implemented, evidencias y límites; docs, commits y revisión del usuario. Integración solo autorizada. | R-01 sin bloqueos |

Principal no escribe producción ni tests. Implementer no cambia tests/contrato/spec. Un test-writer y un implementer activos como máximo; sin roles nuevos, secundarios ni rondas independientes. No repetir suites completas por bloque: dirigidos primero, checks globales al cierre.
