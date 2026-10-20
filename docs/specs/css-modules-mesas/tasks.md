# Tareas: CSS Modules en Mesas

- [x] S-01: registrar alcance aprobado y AC sin rediseño.
- [x] V-01: capturar baseline visual con respuestas simuladas sin DB.
- [x] T-01: test-writer registra rojo causal de aislamiento/conexión del módulo.
- [x] I-01: implementer extrae tablero/tarjetas sin cambios de lógica.
- [x] T-02: test-writer verifica nuevas regresiones y las anteriores.
- [x] V-02: principal revisa diff y compara Chromium antes/después.
- [x] V-03: pruebas web, tipos, lint y build frontend.
- [x] D-01: guía de estilos, progreso y traspaso actualizados; sin integración.

Baseline: Chromium empaquetado, 360/390/768/1440 px y 390px con movimiento
reducido; cinco mesas activas, cuatro estados y nombre largo. Sin overflow,
errores de página ni solicitudes inesperadas; navegación verificada. Control
adicional de `/admin/usuarios` para comprobar que el ajuste global de listas
no cambia otras pantallas. Evidencia temporal:
`/tmp/polleria-css-modules-GGyBco/before.json` y capturas `before-*.png`.

## Evidencia de desarrollo

- Rojo inicial repetido por el principal: 3 fallos estructurales (módulo
  ausente, atributo de lista ausente y CSS global residual), 6 regresiones
  funcionales aprobadas. Archivo: `frontend/src/app/mozo/page.styles.test.ts`.
- Primera extracción: 9/9 dirigidas, pero Chromium detectó pérdida del fondo
  ocupado/listo/cuenta. `.bg-surface` global usa `!important`; la regla
  migrada había perdido la prioridad que tenía antes de la extracción.
- Se añadió AC-M03: rojo causal (1 fallo/3 verdes) y corrección mínima del
  implementer conservando el `!important` original, documentado en el módulo.
  Revalidación dirigida del implementer: 10/10.
- Comparación final en desarrollo: métricas geométricas, colores, tipografía,
  foco y hover idénticos en los cinco escenarios. Cuatro capturas de Mesas
  idénticas byte a byte; la quinta solo difiere en 53 píxeles del botón
  compartido de sesión, fuera del tablero. Las cinco capturas de control de
  Usuarios son idénticas. Sin overflow ni errores de página.
- `pnpm typecheck:frontend`: aprobado por el principal; `pnpm build:frontend`:
  compilación y generación de rutas aprobadas, sin nuevas dependencias.
- Revisión del principal con frontend-design, web-design-guidelines y
  ui-ux-pro-max: se conserva la apariencia existente, foco, movimiento reducido
  y semántica de enlaces. No se aplica un rediseño ni guías de landing pages.
- Suite final `pnpm test:frontend`: 43 archivos y 742 pruebas aprobadas.
  `pnpm lint` aprobado. Test-writer revalidó 10/10 dirigidas tras la corrección.
- Navegador sobre `next start` con build de producción: mismos cinco
  escenarios, navegación válida y sin overflow/errores. Se conserva la
  apariencia y todas las medidas; los únicos cambios de serialización de
  estilos calculados corresponden al color de bordes invisibles de 0px
  (`rgb` en dev frente a `lab` en producción). Las capturas coinciden con la
  comprobación final de desarrollo. Reporte temporal: `production.json`.
- No se ejecutaron suites de DB, cobertura global ni el E2E integrado que
  prepara `polleria_test`: esta entrega solo cambia presentación y se verificó
  sin backend, SQL, sesiones reales ni dependencias nuevas. Revisión principal,
  no auditoría independiente. Rama `refactor/css-modules-mesas`, sin commits,
  merge ni push. Servidores temporales de verificación detenidos al cerrar.
- Cambios ajenos: apareció un video sin seguimiento en `frontend/references/`
  durante la tarea; se dejó intacto y no forma parte de esta entrega.
