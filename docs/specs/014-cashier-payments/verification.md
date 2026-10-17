# Verificación 014 — 2026-10-16

Estado: **014 implementada y validada** en `feat/014-cashier-payments`. Lista para revisión del usuario; sin integrar a main/dev. Validación exclusivamente con PostgreSQL aislado y driver file; no acredita operación bancaria ni impresión física.

## Evidencia ejecutada

- Principal: regresión sin DB de shared, unidades API y web: **92 archivos, 2076 pruebas aprobadas y 3 fallos esperados existentes**. Los fallos esperados no se cuentan como aprobados. Controller de pagos: **8/8** adicionales sin DB. Dirigido de cliente/componentes/controller: **28/28**, incluido BILL_CHANGED seguido de fallo al releer la cuenta.
- TDD: rojo causal inicial por módulos ausentes (sin assertions ejecutadas en esas colecciones); refinamiento de snapshot y bloqueo después de relectura fallida tuvieron assertion roja antes de corregirse. Las suites transaccionales se ejecutaron posteriormente con la conexión proporcionada por el usuario; no se reconstruye rojo retrospectivo.
- Builds de producción Turbopack y Webpack aprobados por implementer. El primer Turbopack falló al comunicar con un proceso Node/PostCSS; pasó tras preservar la caché antigua de `.next/cache/turbopack` fuera de su ruta activa, sin cambiar código, scripts ni dependencias.
- Contrato OpenAPI 0.11.0: sintaxis YAML y 598 referencias locales comprobadas. Las cuatro operaciones 014 están `implemented` tras completar C-01.

- Cierre inicial sin DB del principal: `pnpm lint` y `pnpm typecheck` globales aprobados después de corregir dos errores de tipos del E2E y la referencia a un método sin enlazar en un test. En ese corte no se repitió la regresión global; posteriormente se ejecutó completa con DB, como se detalla abajo.

- Cierre con DB y pruebas locales conciliadas: `vitest run --coverage --maxWorkers=4` aprobó **149 archivos, 2880 pruebas y 5 fallos esperados anteriores**, estos últimos separados de los aprobados; duración de 391 s. Líneas globales **96,71 %**, shared **99,32 %**, servicios de pagos **90,62 %** (payment.service: 92,10 %). Los umbrales existentes aprobaron sin modificarlos. Tipos/lint globales aprobados; el último cambio de E2E 013 también aprobó tipos/lint/formato dirigidos.
- E2E reales: **30 recorridos aprobados y 14 no aplicables**, verificados en ejecuciones serializadas separadas (26 de regresión general, 2 de impresión mixta y 2 de recuperación file después de actualizar su expectativa del antiguo placeholder). Los dos casos nuevos de 014 están entre los 26. Chrome instalado, API en 4100, web en 3100 y polleria_test; carpeta de impresión temporal explícita compartida por API/tests, sin reutilizar servidor de desarrollo. No se afirma un único run completo verde ni ejecución con Chromium empaquetado.

## QA visual y teclado

Principal ejecutó Playwright con Chrome instalado, usando respuestas API interceptadas y ficticias. El servidor de verificación se inició en 3300 con un destino API inactivo; ninguna solicitud de este recorrido usó una base de datos. El servidor se detuvo al terminar. La dirección sigue el POS azul/Nunito aprobado y [ui-plan.md](ui-plan.md).

Resultado visual: **passed en el alcance simulado**. Once capturas en [qa/](qa/), con anchos 360/768/1440, sin desbordamiento horizontal ni errores de página. Se revisaron lista, cuenta, confirmación, respuesta perdida, histórico y hoja de impresión. [browser-verification.json](qa/browser-verification.json) conserva dimensiones y comprobaciones.

Se comprobó foco dentro del diálogo, Escape sin POST y retorno de foco al botón de revisión. Después de perder una respuesta, el reintento conservó exactamente clave/cuerpo y abrió el mismo pago simulado. Mozo mostró lectura/impresión sin cobro. La hoja imprimible ocultó navegación y controles; no se verificó salida física.

## Trazabilidad de cierre

| AC       | Evidencia aprobada |
| -------- | ------------------ |
| 01       | payments-migration-014: constraints, unicidad/FK, sin backfill y up/down/re-up real. |
| 02/03    | bill.test/shared y payments-service: total, cremas, combos, precios copiados, token canónico y lectura PostgreSQL. |
| 04/05/06 | payments-service/shared/RTL: cash/electrónicos, importes exactos, cierre y mesas, rechazos sin mutación. |
| 07/08/09 | payments-api/concurrency/service: replay/ACK perdido, dos cajeros, send/void/move/join y rollback de todas las fases. |
| 10/11    | payments-api/controller/service: roles, revocación, no-store, validación estricta e histórico tras cambios/reutilización. |
| 12/13/14 | cashier-orders/detail, bill-view y cliente API: páginas/polling, parsing, confirmación, doble clic, recuperación, impresión sin POST; QA visual y E2E reales. |
| 15       | cashier-payments.spec: cash desktop21/30/9, mesas libres e histórico; Yape móvil360px y reintento del mismo pago tras respuesta perdida. |

El usuario aclaró que su checkout real es `C:\Users\braya\Desktop\proyectos1\polleria - copia`. Su `apps/api/.env` configura `polleria_test` en localhost:5432 (PostgreSQL 17.5). La verificación lee exclusivamente `DATABASE_URL_TEST` y la inyecta al proceso, sin copiar ni mostrar credenciales y sin cambiar ese checkout. No se crea ni borra ninguna base ni rol. No se migró `polleria_dev`.

La integración dirigida de 014 aprobó **5 archivos y 42 pruebas**, incluyendo migración reversible, dinero, rollback por fase, permisos/sesiones, snapshot histórico y carreras con cobro/envío/anulación/traslado/unión. El primer intento detectó una incompatibilidad del simulador SQL de rollback con una sobrecarga de Sequelize; se corrigió únicamente el test y se repitió el bloque completo en verde. La cobertura global final incorporó también estas suites.

## Conciliación de la copia local

La copia del usuario estaba limpia en `main`, con cuatro commits locales aún no publicados. Se incorporó su historia únicamente a la rama 014 mediante el merge `a06b4df`, sin cambiar su checkout. Sus pruebas adicionales contenían marcadores de conflicto versionados, imports/constantes duplicados y fixtures de actor anteriores al contrato actual. El test-writer conservó ambas variantes de pruebas shared en archivos separados y todos los casos de servicio. El bloque shared conciliado aprobó **245/245 pruebas**.

Dos expectativas locales se alinearon con el contrato público existente: `portion: null` se rechaza en `portion` (ausencia con `cut` sigue comprobando `cut`); `productName: ''` se conserva como caso explícito de compatibilidad aceptada, dado que OpenAPI y shared admiten cualquier string en ese snapshot. No se endureció producción para ajustarla a un test fuera del contrato.

La primera cobertura global aprobó 2734 pruebas y detectó 9 fallos, con 5 fallos esperados anteriores contabilizados aparte. Siete pruebas de migración esperaban la lista previa a payments; ahora comprueban también su rollback y reaplicación antes de las migraciones anteriores. El fixture del seeder normaliza barras de Windows como ya hacía el migrador real. El caso de enlace simbólico intenta un enlace de archivo real; solo ante Windows/EPERM usa una junction real, comprueba `lstat().isSymbolicLink()` y conserva intacto el contenido de destino. No se omitió el caso ni se simularon operaciones de filesystem.

E2E: efectivo desktop y Yape móvil aprobaron contra API real y `_test`. La regresión general aprobó26 recorridos, con14 no aplicables al proyecto de navegador; los cuatro de impresión requirieron completar la configuración temporal del wrapper externo. Dos aprobaron al repetir; los otros dos detectaron una expectativa del placeholder anterior de Caja. Su actualización conserva las comprobaciones de impresión, exige que la atención desaparezca de «Comandas por revisar» y que el pedido permanezca en «Pedidos abiertos»; ambos aprobaron al repetir, completando los30 recorridos. Tipos y lint globales aprobados tras la conciliación; tipos/lint dirigidos del último ajuste E2E también aprobados.

Revisión del principal; no hubo reviewer ni ronda adversarial independientes. Luna escribió las pruebas iniciales; tras agotarse su cuota, el usuario autorizó GPT-6.1-sol **low** como reemplazo exclusivo de test-writer. Implementer GPT-6.1-sol medium conservó producción separada de tests.
