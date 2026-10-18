# Evidencia y límites — 016

## Alcance y base

- Usuario autorizó fusionar015 y continuar; main publicada en `8aec23d`, merge `2a6cf41`, árbol idéntico al cierre015. No se repitieron pruebas por ese merge.
- Aprobó después la propuesta concreta016: reporte diario solo admin, fecha de cobro Lima, total/medios/horas/productos/autores. Sin caja avanzada ni merma automática. Spec/contrato y OpenAPI0.13 son la referencia; operación016 implemented tras el cierre completo. YAML y700 referencias locales verificadas.
- Test-writer Luna medium separado del implementer Sol6.1 medium para agregación monetaria/permisos/consistencia. Principal revisa y mantiene docs, no escribe producción ni tests. No hay reviewer ni ronda adversarial independientes.

## T-01 / I-01

- Tests `874555a`, corrección de fixtures `7cce042`:6 casos. Primer rojo por módulo reports.ts ausente,0 assertions ejecutadas; no se presenta como fallo causal del algoritmo. Tipos/lint iniciales tenían cascadas por ese import ausente, sin repetirlos antes de crear el módulo.
- Revisión corrigió fixtures antes de producción: pagos fuera del día deben rechazarse, no filtrarse; spread no debe sobrescribir IDs; cremas resueltas no se multiplican otra vez; efectivo incluido comprueba vuelto; suma grande usa3 pagos válidos de80 líneas (máximo99 por pedido), total2375976240 céntimos. Se eliminó una assertion duplicada y se rechaza año0000 por PostgreSQL.
- Producción `e721a2d`: reports.ts y export en index.ts, sin API/DB/UI. Schemas de calendario/query/reporte, grupos únicos/ordenados y conciliación BigInt; snapshots, autores y duplicados validados; TypeError para datos incoherentes y RangeError para acumulación insegura. No muta entradas ni usa reloj global.
- Implementer verificó4 archivos/69 pruebas aprobadas: reports, payments, money y lima-time. Después de ajustar el borde de era del año0001, reports6/6 nuevamente. Shared tsc, ESLint y Prettier de producción y reports.test aprobados. Primer intento sandbox tuvo ENOENT temporal en workers de money/lima sin assertions; repetición con permisos de proceso aprobada. El principal revisó el código y reutiliza ese verde, sin duplicar la ejecución.
- Límite explícito: con pagos014 acotados a int32 se necesitarían millones para superar MAX_SAFE en el agregado. No se crea esa carga artificial; hay guardias BigInt, suma válida mayor a int32 y rechazo de totales inseguros en schema. No se atribuye cobertura de la rama inalcanzable con fixtures pequeños.

## T-02 / I-02

- Luna dejó dos archivos parciales al agotar cuota. El usuario autorizó Sol6.1 low para completar pruebas e interfaz016; Sol medium conserva lógica monetaria y transaccional. El principal verificó los parciales sin editarlos:3 assertions API fallidas por ruta/lector ausentes y servicio sin módulo; no eran fixtures finales.
- Test-writer corrigió HTTP401 del usuario inactivo y validación de fecha con admin activo. `f362a7f`: nueve casos API/servicio, rojo causal API y servicio ausente. Incluye límites de medianoche Lima, datos históricos inválidos sin filtrar detalles, lectura sin alterar saldos y barrera determinista ante cobro/renombre concurrente.
- Implementación `4db6efb`: transacción readOnly REPEATABLE_READ, rango SQL por America/Lima, validación de snapshot contra columnas del pago, asociación del ítem al pedido y autores actuales por lote. No hay migraciones ni escrituras; GET exacto omite lector de cuerpo y aplica no-store antes de autenticación.
- Verde dirigido:4 archivos/21 pruebas,19,45s, con regresiones API014/015. Tipos API/shared, lint/formato aprobados. Writer corrigió únicamente el estrechamiento de un error unknown en `35d3b45`; lint aprobado sin repetir DB por ese cambio tipado. Revisión del principal sin bloqueos, reutilizando evidencia válida del implementer. Solo polleria_test mediante wrapper protegido.

## T-03 / I-03 completados

- `0db44c4`: dos casos cliente y cuatro RTL (fecha del servidor, precisión, vacío/error/reintento, respuestas tardías y acceso). Rojo por imports de producción ausentes:2 suites/0 assertions; no se atribuye rojo causal del algoritmo. `09256df`: un E2E desktop escrito con cobros reales/contextos separados, aprobado posteriormente en Chrome local:1/1,53,4s incluyendo arranque. Formato y lint E2E aprobados.
- Implementer Sol6.1 low completó cliente y pantalla funcional con componentes existentes en `0c83576`. Verde dirigido:2 suites/6 pruebas,24,42s; primer intento sandbox ENOENT no ejecutó UI y se repitió con permisos de proceso. Lint/formato del alcance aprobados. Writer corrigió dos opciones RTL incompatibles con tipos mediante regex de nombre exacto (`033cafb`), sin alterar comportamiento; tipos web aprobados sin repetir suite por ese cambio tipado. El usuario pospuso diseño/pulido visual hasta el final; no se exigen nuevas animaciones ni capturas comparativas en016. Se conservan controles accesibles, estados y validación funcional.
- Principal revisó cliente, guardia admin, consulta por fecha, aislamiento de respuestas tardías y ocultación de datos durante carga/error/cambio de selección. Sin bloqueos funcionales. E2E real crea dos cobros separados de efectivo2100 con vuelto900 y Yape400, comprueba delta2500 y autor, consulta la pantalla y luego día vacío. No repite formularios completos ya cubiertos en014.

## C-01: cierre

- Código final `0c83576`, tests tipados finales `033cafb`. Una sola ejecución global: `node ../run-local-test.cjs node_modules/vitest/vitest.mjs run --coverage --coverage.reportOnFailure --maxWorkers=2`;163 archivos,3013 pruebas aprobadas y5 fallos esperados previos separados,658,44s. Exit0. No se borraron pruebas ni redujeron umbrales.
- Cobertura de líneas95,34% (4649/4876); shared97,80% (489/500), servicios API agregados95,91% (1571/1638). Umbrales configurados80% general y90% shared/servicios cumplidos. Servicio nuevo reports86% y helper reports92,43%; no se presenta el umbral agregado como90% por archivo. Permanecen guardias defensivas y overflow sin dataset masivo, conforme al límite declarado.
- Tipos: raíz/configuración/E2E aprobados al cierre; se reutilizan tipos API/shared del mismo código final y web tras `033cafb`; Next también verifica TypeScript durante build. Build único Turbopack aprobado, ruta /admin/reportes incluida. ESLint global sin warnings y Prettier global aprobados; formato documental explícito y OpenAPI validados al cierre.
- E2E exclusivo sobre polleria_test, serializado antes de cobertura; ambos usan wrapper externo que exige esa base y elimina DATABASE_URL. Sin cambios en polleria_dev, checkout Desktop, dependencias o migraciones; sin creación de bases/roles ni prueba física.
- Sin reviewer independiente ni revisión visual multiformato: diseño/pulido diferido por decisión del usuario. Main contiene015;016 requiere autorización posterior para integración. No repetir suites por actualización documental o publicación.

## Integración autorizada

Usuario autorizó integrar016 el2026-10-18. Merge `5c052f4` desde `1a8dc38`, sin conflictos; árbol idéntico a la rama validada mediante git diff --exit-code. Se conserva la evidencia anterior sin repetir suites. Registro de integración documental separado; publicación en main como parte de la misma autorización.
