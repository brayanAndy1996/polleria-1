# Pruebas por riesgo y consumo — 2026-10-18

El usuario solicitó identificar pruebas de poco valor y reducir el consumo del desarrollo. Se reduce la repetición y la ejecución no pertinente; no se sustituye un resultado fallido por uno aprobado ni se elimina cobertura crítica. Los tests existentes se conservan. No se cambian umbrales de cobertura ni reglas de negocio.

## Selección habitual

| Cambio | Verificación durante el bloque |
| --- | --- |
| Documentación o metodología | Diff y formato de archivos modificados. Sin Vitest, PostgreSQL, build ni E2E. Validar referencias si cambia OpenAPI. |
| Texto, espaciado o apariencia sin lógica | Tipos/lint pertinentes y comprobación visual del área afectada. No crear tests de colores, clases CSS o copia literal. Conservar accesibilidad. |
| Formulario, navegación o cliente HTTP | Pruebas de la interacción cambiada y sus errores reales. No repetir todo auth, catálogo y migraciones por un enlace o layout. |
| Cálculo compartido o adaptación del carrito | Casos representativos, límites y acumulación relevantes. Evitar copiar la misma matriz de inputs inválidos a shared, controlador, servicio y UI. Cada capa prueba su responsabilidad. |
| Stock, cobros, autorización o transacciones | Pruebas críticas del servicio/integración y de las fronteras modificadas; incluir regresiones relacionadas, no todos los módulos antiguos en cada iteración. |
| Migración o relaciones SQL | Migración nueva, rollback y compatibilidad de migraciones afectadas una vez. No repetir ese bloque durante cambios posteriores de UI que no toquen esquema. |

## Casos identificados de menor prioridad

Inspección estática; no se ejecutó la suite para esta auditoría ni se presupone que todos los casos similares sean duplicados.

| Archivo/caso observado | Decisión |
| --- | --- |
| `apps/web/src/app/admin/page.test.tsx`: tres casos separados de Usuarios/Carta/Mesas repiten encabezado, sesión y enlaces anteriores | Fuera del ciclo dirigido cuando no cambia navegación/admin. Si se modifica ese archivo, consolidar las comprobaciones de navegación en un caso conservando destinos y acceso; no escribir otro caso completo por cada enlace. |
| `apps/web/src/app/page.test.tsx` y `e2e/home.spec.ts`, AC-29: encabezado e indicador de conexión se comprueban en ambas capas | No ejecutarlos en cada cambio de inventario. Elegir la capa afectada para el bloque; E2E de inicio al cambiar arranque, proxy o integración. No eliminar las pruebas de red local/recursos externos de AC-30: comprueban otro riesgo. |
| `packages/shared/src/inventory.test.ts`, «without mutating the input value»: comprobar que una variable numérica local sigue valiendo40 después de pasarla a una función | Aserción de poco valor: un número se pasa por valor y la función no puede reasignar esa variable. No exigirla ni replicarla en nuevos tests. Conservar los resultados de suma/resta, no negativos y overflow del mismo caso. |
| Pruebas que solo repiten valores de constantes/códigos literales | Baja prioridad para casos nuevos si los límites y códigos ya se verifican mediante comportamiento real. Los contratos públicos estables pueden justificar casos concretos; no borrar suites de permisos o límites bajo esta etiqueta. |
| Suites antiguas de migración ya verdes con el mismo esquema | Ejecutar cuando cambie la migración o sus relaciones y en el cierre global; omitirlas durante el trabajo visual de015. |

Estos candidatos no justifican cambiar tests a `skip`, `todo` o fallo esperado para aparentar verde. Una consolidación futura debe conservar las comprobaciones útiles y quedar en un commit de tests. Mientras tanto se ahorra seleccionando la ejecución; no hace falta una limpieza masiva.

## Protección obligatoria

- Dinero entero, totales, vuelto, cierre y no duplicar cobros.
- Roles/sesiones actuales y rechazo de operaciones no autorizadas.
- Stock no negativo, pollo por partes, combos/cantidades y competencia por la última unidad.
- Idempotencia, respuesta perdida y conservación de clave/cuerpo en reintentos.
- Rollback completo de saldo, movimiento, ítem, comanda e impresión durable/replay.
- En UI con escrituras: conservar borradores, impedir doble envío y manejar respuestas inciertas. Accesibilidad de formularios y confirmaciones.

Los ocho tests parciales de cliente/helper015 conservados en el árbol no se descartan: comprueban adaptación de cantidades, faltantes y reintentos, riesgos relevantes que shared por sí solo no verifica. Su correspondencia de etiquetas AC debe revisarse al retomar, sin crear más casos por mera numeración.

## Evitar gasto repetido

1. Un bloque pequeño de pruebas útiles, implementación y una ejecución verde dirigida. Los módulos ausentes no cuentan como assertions rojas. Para cambios visuales reversibles sin nueva lógica no forzar una ronda TDD artificial.
2. Registrar comando, revisión del código, resultado y entorno de forma breve. Un resultado fiable del implementer o test-writer sirve al principal; este revisa el diff y repite solo si cambió código relevante, hay fallo o falta evidencia. Si cambian solo fixtures, repetir lo afectado.
3. Al cierre de una entrega con código: una suite global con cobertura, tipos, lint y un build del proyecto. No correr antes otra suite global idéntica ni builds de dos motores salvo un problema que lo justifique. Mantener umbrales actuales sin inventar tests para cubrir líneas triviales.
4. E2E de los recorridos críticos afectados, en los dispositivos necesarios. Para015: flujo admin→mozo→caja y reintento móvil con respuesta perdida. Mantener revisión visual360/768/1440 ya comprometida, en una sola ronda final salvo defectos.
5. No repetir checks por un commit solo documental, un push o un merge cuyo árbol de producción coincida con el validado. Señalar las pruebas omitidas por alcance, sin sumarlas a aprobadas.
6. Contexto y reportes breves: contrato relevante y diff, sin releer todo el repositorio, lanzar agentes ociosos ni duplicar bitácoras en varios archivos. Actualizar evidencia y traspaso por hito, decisión o interrupción.

La auditoría no mide porcentajes de ahorro: ejecutar tests consume principalmente tiempo de cómputo; leer/escribir pruebas, repetir revisiones, duplicar contexto e intercambiar muchos mensajes sí consume tokens del agente. Se optimizan ambos sin prometer una reducción exacta.
