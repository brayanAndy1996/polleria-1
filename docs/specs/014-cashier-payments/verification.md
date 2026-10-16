# Verificación 014 — 2026-10-16

Estado: implementación desarrollada en `feat/014-cashier-payments`; cierre pendiente de PostgreSQL aislado. No presentar este registro como aprobación de cobros reales.

## Evidencia ejecutada

- Principal: regresión sin DB de shared, unidades API y web: **92 archivos, 2076 pruebas aprobadas y 3 fallos esperados existentes**. Los fallos esperados no se cuentan como aprobados. Controller de pagos: **8/8** adicionales sin DB. Dirigido de cliente/componentes/controller: **28/28**, incluido BILL_CHANGED seguido de fallo al releer la cuenta.
- TDD: rojo causal inicial por módulos ausentes (sin assertions ejecutadas en esas colecciones); refinamiento de snapshot y bloqueo después de relectura fallida tuvieron assertion roja antes de corregirse. No se reconstruye evidencia retrospectiva de transacciones: sus suites todavía no se ejecutaron.
- Builds de producción Turbopack y Webpack aprobados por implementer. El primer Turbopack falló al comunicar con un proceso Node/PostCSS; pasó tras preservar la caché antigua de `.next/cache/turbopack` fuera de su ruta activa, sin cambiar código, scripts ni dependencias.
- Contrato OpenAPI 0.11.0: sintaxis YAML y 598 referencias locales comprobadas. Las cuatro operaciones permanecen `pending` hasta completar C-01.

- Cierre sin DB del principal: `pnpm lint` y `pnpm typecheck` globales aprobados después de corregir dos errores de tipos del E2E y la referencia a un método sin enlazar en un test. La regresión global no se repitió: los cambios posteriores fueron únicamente pruebas DB/E2E y su tipado, con controller 8/8 revalidado por test-writer.

## QA visual y teclado

Principal ejecutó Playwright con Chrome instalado, usando respuestas API interceptadas y ficticias. El servidor de verificación se inició en 3300 con un destino API inactivo; ninguna solicitud de este recorrido usó una base de datos. El servidor se detuvo al terminar. La dirección sigue el POS azul/Nunito aprobado y [ui-plan.md](ui-plan.md).

Resultado visual: **passed en el alcance simulado**. Once capturas en [qa/](qa/), con anchos 360/768/1440, sin desbordamiento horizontal ni errores de página. Se revisaron lista, cuenta, confirmación, respuesta perdida, histórico y hoja de impresión. [browser-verification.json](qa/browser-verification.json) conserva dimensiones y comprobaciones.

Se comprobó foco dentro del diálogo, Escape sin POST y retorno de foco al botón de revisión. Después de perder una respuesta, el reintento conservó exactamente clave/cuerpo y abrió el mismo pago simulado. Mozo mostró lectura/impresión sin cobro. La hoja imprimible ocultó navegación y controles; no se verificó salida física.

## Trazabilidad y pendientes

| AC       | Implementación y evidencia                                                                   | Pendiente para cierre                                            |
| -------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 01       | Migración reversible y pruebas de constraints/no backfill redactadas                         | Ejecutar migración up/down/re-up en `_test`                      |
| 02/03    | Total, cremas, combos, exclusión de anulados y token canónico con pruebas puras aprobadas    | Confirmar lectura consistente con PostgreSQL                     |
| 04/05/06 | Servicio de pago y validación monetaria; schemas/unit/UI aprobados                           | Ejecutar efectivo/electrónicos/rechazos y verificar persistencia |
| 07/08/09 | Scope/replay, locks y transacción; pruebas reales redactadas                                 | Ejecutar carreras, respuesta perdida y rollback por fase         |
| 10/11    | Roles/rutas, no-store temprano, snapshot validado e histórico                                | Ejecutar HTTP con sesiones y pruebas de inmutabilidad en DB      |
| 12/13/14 | Lista/polling, parsing, confirmación, reintento y pre-cuenta probados en RTL/MSW y QA visual | Comprobar integración real con API; sin prueba de papel          |
| 15       | Dos recorridos E2E redactados, con pérdida de ACK tras commit real en el móvil               | Ejecutarlos contra `_test`, sin sustituir API por fixtures       |

El checkout no tenía `apps/api/.env` ni `DATABASE_URL_TEST`. El usuario indicó que configurará la conexión; no falta otra aprobación de uso de `_test`. No se crea ni borra ninguna base ni rol. No se migró `polleria_dev`. Cobertura global, suites DB y E2E reales quedan pendientes de esa configuración.

Revisión del principal; no hubo reviewer ni ronda adversarial independientes. Luna escribió las pruebas iniciales; tras agotarse su cuota, el usuario autorizó GPT-6.1-sol **low** como reemplazo exclusivo de test-writer. Implementer GPT-6.1-sol medium conservó producción separada de tests.
