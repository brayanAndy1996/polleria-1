# Flujo POS: mesa, catálogo y carrito adaptable

Estado: solicitado y autorizado el 2026-10-19 por el usuario tras completar
la barra lateral. Referencia estructural:
`frontend/references/original-c26bfacac66444e44e4a120777feca92.webp`.
No es un encargo de Figma ni una autorización para modificar backend.

## Flujo aprobado

1. Click normal en tarjeta de mesa del tablero abre popup de acciones, sin
   llevar primero a la página larga del detalle. Conservar href de detalle
   para enlaces profundos/Ctrl+click; no sustituirlo por una ruta ficticia.
2. Mesa libre: popup «Acciones de {mesa}», acción «Abrir mesa» y cancelar.
   No abrir pedidos por el solo hecho de seleccionar o cerrar el popup.
3. Abrir confirma mediante el `openTableOrder` existente
   (`POST /tables/{id}/orders`, sin cuerpo, 201 validado por shared). Tras
   éxito pasa directamente a `/mozo/mesas/{id}/agregar`, sin intermedio.
   Bloqueo síncrono contra doble toque, indicador de envío y error/reintento
   visibles; ante 409 releer salón y ofrecer acciones según estado real.
4. Mesa ocupada/lista/cuenta: mismo popup con «Agregar productos» y
   «Ver pedido». Este último conserva el detalle para las acciones actuales
   (comandas, anulaciones, mover/unir/separar, cuenta), sin reimplementarlas.
5. Catálogo tras seleccionar mesa: búsqueda arriba, control Filtros real,
   categorías horizontales con conteos reales y grilla de tarjetas blancas.
   Eliminar columna lateral de categorías; sidebar global permanece intacta.
6. Escritorio >=1024px: catálogo flexible a izquierda y pedido por enviar
   a derecha (aprox. 320–360px). Menos columnas cuando el ancho útil lo exige.
7. Móvil/tablet <1024px: catálogo ocupa el ancho; barra inferior fija
   «Ver pedido», cantidad total de unidades y total en soles. Al pulsarla
   abre un panel desde abajo con lista desplazable y acciones finales.
   Cerrar vuelve al catálogo sin perder filtro, personalización o tanda.
   No exigir gesto de arrastre: botones y teclado bastan; sin nueva librería.

## Composición y decisiones acotadas

- Nunito, blanco #FFFFFF, canvas #F5F6F8, texto #20242B, secundario #626A77,
  bordes #E2E5EA, azul #0967D2 y selección #EAF2FF. No migrar paleta global
  a verde ni usar CSS :root para este bloque. CSS Modules, sin dependencias.
- Tarjetas: imagen local/fallback, nombre, precio real y acción visual
  «Agregar». No bloques de fondo de categoría. Cada tarjeta abre el editor
  existente en popup «Personalizar {producto}»; añadir confirma la línea y
  cierra editor. No saltar personalización ni inventar precios por porción.
- Conservar presentación, parte, distribución, combos, cremas, cantidad y
  observaciones. No nuevos cálculos de dominio: reutilizar las funciones del
  compositor. Toda la moneda continúa en céntimos enteros internamente.
- Filtros abre un popover no modal «Filtros del catálogo» (role dialog sin
  aria-modal), sincronizado con chips. Seleccionar categoría aplica el filtro
  y mantiene el panel abierto; Escape lo cierra conservando la selección.
  Reabrir conserva el estado y «Limpiar filtros» reinicia búsqueda/categoría
  y cierra el panel. Cierre visible, click exterior y restauración de foco;
  no bloquear ni ocultar el catálogo mediante aria-hidden.
  No controles falsos de descuento, vegetariano,
  stock, delivery u otros datos que el contrato no ofrece.
- Todas las categorías/productos de la API siguen accesibles y agrupados
  en orden existente. Conteos no fijados; selección se indica con texto/estado
  y no solo color. Búsqueda mantiene normalización de tildes/case.
- Pedido derecho muestra únicamente la tanda por enviar; indicarlo claramente
  para no confundirlo con productos ya enviados o total de toda la cuenta.
  Mantener contexto mesa/pedido, editar cantidades, quitar y total real.
- Barra móvil cuenta unidades (`sum(quantity)`); CTA de envío conserva su
  semántica actual/límite de 20 líneas. El panel comparte los mismos datos y
  callbacks del escritorio: no duplicar estado, formularios ni ids accesibles.
- Mantener envío idempotente, cuerpo/reintento, errores globales y por línea,
  validación, límites y navegación posterior existente al éxito. Enviar a
  cocina no se convierte en Cobrar. Un popup no puede esconder errores.
- Usar primitivas accesibles de `react-aria-components` ya instalado para
  dialogs/modals si encaja, con estilos locales; evitar repetir un trap
  manual sin gestión de lifecycle. No modificar la sidebar ya verificada.

## Criterios de aceptación

- AC-O01: click mesa activa abre popup accesible y no navega ni hace POST.
  Cancelar/Escape restauran foco sin abrir mesa. Hrefs de detalle preservados.
- AC-O02: apertura solo tras confirmar, un POST en doble toque/Enter,
  pending/error visibles, 201 validado navega directo al catálogo. Un error
  o cuerpo inválido no navega; 409/polling actualiza acciones, sin abrir una
  mesa ocupada/inactiva/eliminada. No repetir aperturas automáticamente.
- AC-O03: ocupada ofrece agregar productos y detalle con hrefs reales y
  datos actuales; no pierde permisos ni acciones avanzadas existentes.
- AC-O04: búsqueda, filtros efectivos y categorías horizontales con conteos
  reales; cards blancas/imágenes/fallback/precios, sin ocultar categorías.
  Personalización en modal conserva todos los editores y su validación.
- AC-O05: pedido derecho visible en desktop; móvil barra inferior y panel
  «Pedido por enviar» con lista desplazable, cantidad/total exactos y CTA.
  Un solo carrito/estado: cerrar, reabrir, buscar y redimensionar no pierde
  líneas, cantidades, errores ni modifica el pedido en servidor.
- AC-O06: cantidades, quitar, totales, límites, doble envío, errores/reintento
  con misma clave/cuerpo y permisos conservados. Revalidar regresiones
  adversariales existentes, no reemplazarlas con snapshots visuales.
- AC-O07: teclado, foco contenido/restaurado, Escape/cierre, fondo bloqueado
  solo mientras modal está abierto, cleanup al desaparecer sesión/componente
  o cambiar breakpoint; no ids/formularios duplicados. Controles >=44px,
  safe-area, reduced motion y sin overflow/solapamientos a 360/390/768/844/
  1024/1200/1440px y poca altura. Catálogo no queda bajo la barra inferior.
- AC-O08: solo frontend y documentación; API/shared/backend/dependencias,
  datos y referencias intactos. Sin cobro/KDS/recibos/reservas/descuentos.

## Verificación y metodología

Principal mantiene spec/docs y revisa; test-writer e implementer existentes
gpt-6-luna medium. Cambio de UI consume apertura/envío existentes sin alterar
transacciones, permisos o dinero. Rojo causal por bloques antes de producir.
Revisión principal sin auditoría independiente. Full frontend, tipos, lint,
build y Chromium con API simulada; no ejecutar DB ni escribir datos reales,
migraciones/seeds/suites API/DB/cobertura global. Preservar dirty worktree y
servidor dev del usuario en 3000. Sin commit/merge/push automáticos.
