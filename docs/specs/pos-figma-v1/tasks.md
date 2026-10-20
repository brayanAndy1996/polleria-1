# POS Figma v1 — tareas y evidencia

- [x] Usuario aprueba propuesta Figma e implementación en Pollería.
- [x] Contexto de diseño y capturas de los cuatro frames consultados.
- [x] Rama `feat/pos-figma-v1`; trabajo previo conservado, sin commit/push.
- [x] T-01: pruebas acotadas nuevas y rojo causal, sin DB.
- [x] I-01: Mesas, tokens y chrome POS acotado.
- [x] T-02/I-02: catálogo, tanda, carta y helper de fotos, conservando flujos.
- [x] R-01: revisión principal de CSS, comportamiento y alcance.
- [x] V-01: frontend tests, tipos, lint y build.
- [x] V-02: Chromium responsive, interacción y contraste con Figma.
- [x] D-01: guía de estilos, PROGRESS y CONTINUAR actualizados.

No hay revisión ni auditoría independientes. No ejecutar DB, migraciones,
seeds ni integraciones futuras para validar el diseño.

## Evidencia de rojo — test-writer Luna medium

Antes de implementar Mesas/chrome: comando
`pnpm exec vitest run --project web frontend/src/app/mozo/page.test.tsx frontend/src/components/auth/auth.test.tsx --testNamePattern='AC-05|AC-P05' --maxWorkers=2`.
Dos fallos causales: contador de activas ausente y monograma POS ausente;
dos pruebas aprobadas. El test estructural actualizado de Mesas también
detecta el fondo azul histórico que el diseño aprobado sustituye.

Antes de helper/composer/Carta: comando
`pnpm exec vitest run --project web frontend/src/lib/product-image.test.ts frontend/src/app/pos-v1.modules.test.ts --maxWorkers=2`.
Tres fallos causales: helper aún ausente e imports CSS Modules aún ausentes
en las dos superficies. No fallos de DB ni de fixtures.

Las nuevas regresiones RTL de fotos en Carta y compositor también fallaron
antes de conectar producción: filtro `AC-P04/P08|AC-P02/P08`, dos fallos por
imagen aún ausente. Tras la primera conexión, los siete archivos dirigidos
pasaron 110/110; esto verifica comportamiento, no fidelidad visual completa.

La revisión principal solicitó completar detalles del diseño, no ampliar
funciones. Antes del pulido, el bloque RTL de fallback `Sin fotografía` y
categoría/estado/navegación de Carta falla causalmente (dos casos, filtro
`AC-06: cada fila|AC-P02/P08`). Badge Activo y navegación quedan en la misma
regresión para su revalidación.

La aserción histórica `Juan · S/ 45.00` se conserva como comprobación de los
dos datos en la misma tarjeta sin exigir un solo nodo textual. Es una
adaptación de markup del diseño aprobado; no se elimina cobertura de datos.

## Preparación de revisión principal

- Capturas de control anteriores al cambio: Login y Usuarios a 360/1440px,
  sin overflow ni pageerrors. Artefactos temporales en
  `/tmp/polleria-pos-implementation-BsUNJC/`.
- Mocks de revisión validados contra siete esquemas existentes de shared;
  no son datos ni endpoints de producción. Next frontend únicamente en
  puerto 3000 para revisión; todos los `/api/*` se interceptan en Chromium.
- Recursos PNG locales existentes: tres fotos 1448×1086, sin assets nuevos
  ni referencias temporales de Figma en código.
- Primer recorrido I-01: seis viewports, sin overflow horizontal ni errores
  de página. Se detectaron cortes de palabras y navegación heredada fija
  que ocultaba contenido; se devolvieron al implementer para corregir antes
  del cierre. No contar este recorrido como aprobación visual final.

## Implementación y revisión principal

- Producción escrita por implementer Luna medium; pruebas por test-writer
  Luna medium. El principal revisó diffs y comportamiento, sin escribir
  producción ni tests. Backend, shared, contratos y dependencias intactos.
- CSS Modules en las tres vistas y chrome opt-in `appearance="pos"`;
  tokens limitados al shell, sin sustituir `:root`. Retiradas reglas globales
  obsoletas de Mesas y compositor. Fotos locales compartidas por helper;
  `Sin fotografía` donde no existe asociación. No se añadió gestor de fotos.
- Se conservaron navegación por permisos, cierre/cambio de sesión, todas las
  categorías, personalización, cantidades, quitar y envío a cocina. Son
  adaptaciones funcionales necesarias frente a los frames estáticos, no
  integraciones nuevas. Otras rutas conservan la apariencia por defecto.
- Revisión visual detectó prioridad de estilos heredados, orden del importe,
  ancho de Carta y wrap de acciones. El implementer corrigió esos puntos.
  El último ajuste del editor causó overflow a 360px; se corrigió ampliando
  solo su fila y conservando la tarjeta a una columna, sin recorte global.
- Recorrido `polished` en Chromium: 360/390/768/1024/1440px y 390px con
  movimiento reducido. Mesas, catálogo vacío/lleno, editor, Carta y controles
  Login/Usuarios sin overflow ni errores de página. Búsqueda/filtro,
  cantidades, quitar, total y cancelar desactivación comprobados.
  Error de envío simulado y reintento conservaron cuerpo y clave idempotente.
- Revalidación tras los ajustes: `pnpm test:frontend` 749/749 en 45 archivos;
  `pnpm typecheck:frontend` y `pnpm lint` aprobados. Avisos jsdom de navegación
  a otro documento sin fallos de pruebas. Build y revisión de producción
  se registran al terminar, no se infieren del servidor de desarrollo.

## Cierre — 2026-10-19

- `pnpm build:frontend` aprobado: compilación optimizada, TypeScript y todas
  las rutas generadas. Últimos ajustes de geometría solo CSS, con Prettier
  y `git diff --check` aprobados también después de ellos.
- Versión compilada servida temporalmente en 3200: mismo recorrido Chromium
  en seis escenarios, sin overflow, errores de página ni rutas API inesperadas.
  Búsqueda/categorías, personalización, cantidades, quitar, totales y reintento
  idempotente aprobados; cancelar desactivación no produjo PATCH.
- Teclado comprobado a 390px: salto visible solo con foco, Enter enfoca main,
  tarjeta con outline visible. Todas las imágenes de contenido cargaron;
  ningún botón/input/enlace del main rediseñado quedó bajo 44px. La excepción
  histórica Editar de Usuarios (42px) pertenece al control fuera de alcance.
- Un full-page PNG de Chromium dibujó el skip link fuera de su posición.
  Diagnóstico: sin foco, transform -76.8px y top -66.8px; captura de viewport
  normal sin el enlace visible. Se identificó como artefacto de captura,
  sin esconder el control accesible ni parchear producción por el PNG.
- Comparadas las capturas de producción con los cuatro frames aprobados.
  Carta tablet conserva encabezados alineados; editor con fila completa y
  tarjeta de ancho regular. Login y Usuarios mantienen el chrome anterior.
- Artefactos locales de revisión en `/tmp/polleria-pos-implementation-BsUNJC/`
  (`production.json`, capturas y contextos Figma). Son temporales, no assets
  de aplicación ni evidencia permanente versionada.
- Cerrados únicamente los servidores de preview iniciados para esta tarea.
  Para trabajar con API real, iniciar `npm run dev` desde la raíz. No se
  arrancó ni modificó DB; no se ejecutaron suites API/DB, cobertura global
  ni E2E oficiales con DB. No atribuirles resultados del recorrido mock.
- Rama local `feat/pos-figma-v1`, sin commit, merge ni push. Video del usuario
  conservado. Revisión del principal, sin auditoría independiente.
