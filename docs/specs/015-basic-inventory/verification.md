# Evidencia de preparación de 015 — 2026-10-17

## Estado y límites

014 integrada en main con autorización del usuario, merge `2e2202f`; actualización documental/modelos `90bbeed`, publicada en GitHub. El árbol del merge coincidía con `965c877`, ya validado; no se repitieron suites por un merge sin cambios de código.

015 tiene **alcance aprobado**, en `feat/015-basic-inventory`. El usuario aprobó P-02 (anular no repone; devolución física mediante ajuste admin con motivo) y resolvió P-03: pollo y bebidas conservan su saldo hasta los movimientos o ajustes manuales, sin reinicio diario. Contrato técnico y OpenAPI0.12 preparados; ocho rutas siguen pending. El dominio puro está implementado; migraciones, endpoints y UI siguen pendientes.

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

## T-00: regresión existente de la 010

Luna detectó que `componentIssue` se marcaba por la mera presencia de distribución de medio pollo, aunque fuera válida; el servicio omitía copiar los componentes. El contrato D-010-04/05 ya permite elegir esa distribución, por lo que esta corrección no depende de aprobar reglas nuevas de inventario.

- Test-writer: `b490fb3`, solo tests. Dos casos HTTP verifican split válido 1+3, componentes/ticket histórico/replay exacto sin filas adicionales, e inválido 1+2 sin ítems/comanda/clave persistidos.
- Rojo del principal con PostgreSQL real: `vitest run apps/api/tests/order-items-api.test.ts -t "D-010-04/05" --maxWorkers=1`: 1 fallo de assertion (0+0 en vez de 1+3), 1 aprobado y 16 omitidos por filtro. Los omitidos no se cuentan como aprobados.
- Implementer separado: `88c1b0c`, solo producción. Movió la marca de error a las ramas que realmente añaden un issue; no cambió schemas, dinero, cantidades históricas ni contratos.
- Verde del principal: 6 archivos y **88/88 pruebas**, 50,44 s: `order-items-api`, `order-item-service`, `adversarial/order-items-010.adversarial`, `payments-api-014`, `payments-service-014` y `payments-concurrency-014`. Ejecución serializada de archivos sobre polleria_test, con máximo 2 workers.
- Tipos de API y ESLint de servicio/tests aprobados; formato del test comprobado por test-writer y diff sin errores de whitespace. Se usaron binarios instalados, porque Corepack intentaba descargar pnpm sin red disponible.

La verificación usa el wrapper externo del principal: lee exclusivamente DATABASE_URL_TEST de la copia Desktop, exige polleria_test y no muestra/copia credenciales. No cambia el checkout del usuario, polleria_dev, bases ni roles.

No se ejecutaron cobertura global, build web ni E2E para este ajuste de flag del backend; la regresión dirigida cubre persistencia, replay, rechazos y cobros concurrentes. La evidencia completa de 014 conserva su fecha/commit anteriores, no se atribuye como ejecución nueva. Los checks completos de 015 siguen pendientes de aprobar e implementar la funcionalidad.
