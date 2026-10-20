# Flujo POS — tareas y evidencia

- [x] Usuario solicita popup de mesa, catálogo de referencia y carrito móvil.
- [x] Inspección de apertura, detalle, compositor y contrato existente.
- [x] T-01: rojo de popup/apertura y conservación de rutas/permisos.
- [x] I-01: popup y apertura directa con API existente.
- [x] T-02: rojo de catálogo/editor modal/carrito móvil.
- [x] I-02: catálogo, filtros, cards y panel de pedido adaptable.
- [x] R-01: revisión principal y recorrido responsive/API simulada.
- [x] V-01: frontend tests, tipos, lint y build sobre fuentes estables.
- [x] D-01: documentación y entrega.

Rama actual `feat/pos-figma-v1`, sin commit; cambios previos conservados.
No existe revisión ni auditoría independiente. No tocar backend ni datos.

## Evidencia inicial

- Baseline previo: 754 pruebas web aprobadas en el bloque sidebar anterior.
- Test-writer Luna medium, antes de producir: `pnpm exec vitest run --project web frontend/src/app/mozo/page.test.tsx --testNamePattern='AC-O01' --maxWorkers=1`.
  Rojo causal por diálogo «Acciones de Mesa 1» ausente; click aún navega.
  Se añadieron también apertura 201 única/doble toque, errores/invalidación,
  conflicto 409, polling ocupado/inactivo y enlaces de mesa ocupada.
- QA del principal con API simulada se prepara en
  `/tmp/polleria-order-flow-k2NRiX/`; no conecta a DB ni envía datos reales.
- T-02 antes de producir: `pnpm exec vitest run --project web 'frontend/src/app/mozo/mesas/[tableId]/agregar/page.test.tsx' --testNamePattern='AC-O04|AC-O05' --maxWorkers=1`.
  Tres fallos causales: no hay Filtros, editor todavía inline (sin diálogo
  Personalizar) y falta barra Ver pedido móvil. Regresiones de personalización
  conservadas; los cambios de producto ahora cierran el modal explícitamente.
- Contratos acordados: Filtros del catálogo como popover no modal; categoría
  aplica sin cerrar, Escape conserva, reabrir conserva y Limpiar filtros
  reinicia y cierra. Personalizar {producto},
  Cerrar personalización; Pedido por enviar y Volver al catálogo en móvil.

## Revisión y correcciones

- T-01 completo 13/13 y T-02 completo 19/19. Se conservaron pruebas de
  personalización, dinero, límites, permisos y envío idempotente. El polling
  también comprueba que reactivar una mesa no reabre su popup espontáneamente.
- La primera suite completa encontró dos interacciones adversariales antiguas
  que suponían un editor persistente después de agregar. Test-writer adaptó
  únicamente reapertura/cierre del modal; no eliminó assertions de tope ni
  nueva clave por nueva tanda. Reejecución principal: 764/764, 45 archivos.
- La revisión Chromium a 360px detectó inputs de 40px y grilla de una columna:
  corregidos a >=44px y mínimo 145px para dos columnas cuando hay espacio.
  Error de tope de 20 líneas con una sola fuente visible; mesa/pedido también
  visibles en panel móvil. Barra y reserva de espacio incluyen safe-area.
- Filtros: popover no modal con foco inicial, toggle, cierre visible/Escape/
  click exterior y salida por Tab; selección conservada. Se verifican sin
  permitir que aria-hidden o inert oculten el catálogo por abrirlo.
- Primera revisión de producción: nueve escenarios funcionales aprobados,
  sin overflow/pageerrors ni llamadas API inesperadas. Revisión visual detectó
  conflicto con fondo global de listas y popover fuera de viewport en poca
  altura; corregidos localmente y recompilados antes del cierre.

## Cierre verificado — 2026-10-19

- Principal: `pnpm run test:frontend` **764/764**, 45 archivos, después del
  último cambio de producción; `pnpm run typecheck:frontend`, `pnpm run lint`
  y `pnpm run build:frontend` aprobados. `git diff --check` limpio.
- Chromium de producción: **9/9** escenarios: 360×900, 390×844, 768×1024,
  844×390, 1024×900, 1200×900, 1440×1000, 1440×480 y 390×844 con movimiento
  reducido. Sin overflow horizontal, errores de página ni API inesperada;
  imágenes locales cargadas y controles visibles >=44px. Los únicos nodos
  de 1px detectados son sentinelas «Dismiss» de React Aria, no botones visuales.
- Verificados selección sin POST, cancelar/foco/Escape, doble apertura única,
  apertura fallida/reintento y navegación directa; filtros efectivos y panel
  dentro del viewport, selección conservada y salida de teclado sin trap;
  personalización de cuarto/pierna, cantidad, cremas y notas; carrito por
  unidades, edición/quitar, total exacto, resize y panel móvil conservan tanda.
  Pedido largo de 13 líneas: scroll hasta S/96 y CTA alcanzable. Envío fallido
  y reintento conservan cuerpo y clave; ocupada ofrece hrefs reales.
- Las esperas del diagnóstico sincronizan foco inicial y rectángulo tras
  terminar transiciones; no se usa un timeout fijo para dar por estable CSS.
  Script, capturas y JSON final de nueve escenarios:
  `/tmp/polleria-order-flow-k2NRiX/review.mjs` y `verified.json`.
  Log de suite: `web-final.log`; recorrido: `browser-verified.log` en esa ruta.
- Backend/shared/contratos/dependencias sin diff; sin DB/migraciones/seeds,
  suites API/DB, cobertura global ni E2E oficiales. Revisión principal, no
  independiente. Skills UI guiaron composición, CSS aislado, foco, controles
  táctiles y safe-area; no justifican copiar funcionalidades inexistentes.
- Rama `feat/pos-figma-v1`, sin commit/merge/push. Referencias y cambios previos
  conservados. Preview propio 3200 detenido al cerrar; dev del usuario 3000
  permanece activo. Revisar en `/mozo` antes de extender otras pantallas.
