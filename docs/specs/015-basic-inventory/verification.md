# Evidencia de preparación de 015 — 2026-10-17

## Estado y límites

014 integrada en main con autorización del usuario, merge `2e2202f`; actualización documental/modelos `90bbeed`, publicada en GitHub. El árbol del merge coincidía con `965c877`, ya validado; no se repitieron suites por un merge sin cambios de código.

015 permanece como **propuesta de inventario**, en `feat/015-basic-inventory`: sin migraciones, endpoints, schemas ni UI de stock. El usuario aprobó P-02 (anular no repone; devolución física mediante ajuste admin con motivo). P-03, el corte operativo o conservación del pollo, sigue pendiente de respuesta; no se asume medianoche por omisión o por paso del tiempo. Spec/tasks preparadas para revisión.

El usuario restableció Luna para trabajo sencillo. Test-writer y corrección mínima usaron GPT-6-luna medium, en agentes distintos. La implementación compleja de stock/transacciones seguirá GPT-6.1-sol medium. No hubo reviewer ni ronda adversarial independientes.

## T-00: regresión existente de la 010

Luna detectó que `componentIssue` se marcaba por la mera presencia de distribución de medio pollo, aunque fuera válida; el servicio omitía copiar los componentes. El contrato D-010-04/05 ya permite elegir esa distribución, por lo que esta corrección no depende de aprobar reglas nuevas de inventario.

- Test-writer: `b490fb3`, solo tests. Dos casos HTTP verifican split válido 1+3, componentes/ticket histórico/replay exacto sin filas adicionales, e inválido 1+2 sin ítems/comanda/clave persistidos.
- Rojo del principal con PostgreSQL real: `vitest run apps/api/tests/order-items-api.test.ts -t "D-010-04/05" --maxWorkers=1`: 1 fallo de assertion (0+0 en vez de 1+3), 1 aprobado y 16 omitidos por filtro. Los omitidos no se cuentan como aprobados.
- Implementer separado: `88c1b0c`, solo producción. Movió la marca de error a las ramas que realmente añaden un issue; no cambió schemas, dinero, cantidades históricas ni contratos.
- Verde del principal: 6 archivos y **88/88 pruebas**, 50,44 s: `order-items-api`, `order-item-service`, `adversarial/order-items-010.adversarial`, `payments-api-014`, `payments-service-014` y `payments-concurrency-014`. Ejecución serializada de archivos sobre polleria_test, con máximo 2 workers.
- Tipos de API y ESLint de servicio/tests aprobados; formato del test comprobado por test-writer y diff sin errores de whitespace. Se usaron binarios instalados, porque Corepack intentaba descargar pnpm sin red disponible.

La verificación usa el wrapper externo del principal: lee exclusivamente DATABASE_URL_TEST de la copia Desktop, exige polleria_test y no muestra/copia credenciales. No cambia el checkout del usuario, polleria_dev, bases ni roles.

No se ejecutaron cobertura global, build web ni E2E para este ajuste de flag del backend; la regresión dirigida cubre persistencia, replay, rechazos y cobros concurrentes. La evidencia completa de 014 conserva su fecha/commit anteriores, no se atribuye como ejecución nueva. Los checks completos de 015 siguen pendientes de aprobar e implementar la funcionalidad.
