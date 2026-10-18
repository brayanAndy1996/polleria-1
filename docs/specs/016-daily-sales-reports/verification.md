# Evidencia y límites — 016

## Alcance y base

- Usuario autorizó fusionar015 y continuar; main publicada en `8aec23d`, merge `2a6cf41`, árbol idéntico al cierre015. No se repitieron pruebas por ese merge.
- Aprobó después la propuesta concreta016: reporte diario solo admin, fecha de cobro Lima, total/medios/horas/productos/autores. Sin caja avanzada ni merma automática. Spec/contrato y OpenAPI0.13 son la referencia; una operación permanece pending hasta el cierre completo. YAML y700 referencias locales verificadas.
- Test-writer Luna medium separado del implementer Sol6.1 medium para agregación monetaria/permisos/consistencia. Principal revisa y mantiene docs, no escribe producción ni tests. No hay reviewer ni ronda adversarial independientes.

## T-01 / I-01

- Tests `874555a`, corrección de fixtures `7cce042`:6 casos. Primer rojo por módulo reports.ts ausente,0 assertions ejecutadas; no se presenta como fallo causal del algoritmo. Tipos/lint iniciales tenían cascadas por ese import ausente, sin repetirlos antes de crear el módulo.
- Revisión corrigió fixtures antes de producción: pagos fuera del día deben rechazarse, no filtrarse; spread no debe sobrescribir IDs; cremas resueltas no se multiplican otra vez; efectivo incluido comprueba vuelto; suma grande usa3 pagos válidos de80 líneas (máximo99 por pedido), total2375976240 céntimos. Se eliminó una assertion duplicada y se rechaza año0000 por PostgreSQL.
- Producción `e721a2d`: reports.ts y export en index.ts, sin API/DB/UI. Schemas de calendario/query/reporte, grupos únicos/ordenados y conciliación BigInt; snapshots, autores y duplicados validados; TypeError para datos incoherentes y RangeError para acumulación insegura. No muta entradas ni usa reloj global.
- Implementer verificó4 archivos/69 pruebas aprobadas: reports, payments, money y lima-time. Después de ajustar el borde de era del año0001, reports6/6 nuevamente. Shared tsc, ESLint y Prettier de producción y reports.test aprobados. Primer intento sandbox tuvo ENOENT temporal en workers de money/lima sin assertions; repetición con permisos de proceso aprobada. El principal revisó el código y reutiliza ese verde, sin duplicar la ejecución.
- Límite explícito: con pagos014 acotados a int32 se necesitarían millones para superar MAX_SAFE en el agregado. No se crea esa carga artificial; hay guardias BigInt, suma válida mayor a int32 y rechazo de totales inseguros en schema. No se atribuye cobertura de la rama inalcanzable con fixtures pequeños.

## Pendiente

Decisión posterior del usuario: diseño/pulido visual diferido hasta el final del desarrollo funcional. Se conserva la interfaz necesaria y sus pruebas de permisos/fecha/errores; no se exigen capturas comparativas por esta entrega. Luna agotó cuota durante T-02 y dejó dos archivos parciales. Usuario autorizó reemplazo por Sol6.1 low para pruebas/interfaz funcional016; backend financiero conserva Sol medium separado. No hubo sustitución automática.

Principal verificó esos parciales sin editar tests:3 fallos de assertions API (dos404 por ruta ausente y400 por lectorJSON aún no exceptuado), servicio0tests por módulo ausente,27,84s. No constituye validación final de fixtures: inactivoHTTP401 y query inválida con admin son expectativas pendientes de corrección por test-writer. Este retoma y completa pruebas críticas antes de I-02. Sin DBdev ni bases/roles nuevos.

T-02 escribe servicio/API real con guardias de polleria_test. Todavía sin rojo/verde de backend016, UI, QA visual, cobertura global/build ni E2E016. No atribuir evidencia015 a016. Main contiene015; integrar016 requerirá autorización posterior.
